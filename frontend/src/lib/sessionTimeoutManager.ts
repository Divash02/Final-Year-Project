/**
 * Framework-agnostic session timeout manager.
 *
 * Drives the CollegeOS inactivity timeout, expiry warning countdown and
 * session renewal. It knows nothing about React, the DOM or localStorage:
 * the caller pumps it with a monotonic clock (`tick`) and implements the
 * callbacks (renewal, expiry, navigation). This keeps the timing logic fully
 * testable with a controllable clock instead of real timers.
 *
 * Security model:
 *   - Activity is only recorded from caller-reported user gestures.
 *   - Renewal happens only while the user has been recently active, so an
 *     unattended tab can never keep itself alive by polling.
 *   - A successful server renewal resets the inactivity timer; a failed
 *     renewal is never treated as success.
 *   - The absolute session lifetime is enforced by the backend; the manager
 *     only reflects expiry reasons reported by the caller/backend.
 */

export type SessionTimeoutReason =
  | "inactivity"
  | "absolute"
  | "revoked"
  | "token-expired"
  | "manual"
  | "network";

export type WarningReason = "inactivity";

export interface SessionTimeoutManagerCallbacks {
  onWarningStart: (secondsRemaining: number) => void;
  onWarningTick: (secondsRemaining: number) => void;
  onWarningClear: () => void;
  onExpire: (reason: SessionTimeoutReason) => void;
  onRenewed: () => void;
  onRenewFailure: (error: unknown) => void;
}

export interface SessionTimeoutManagerOptions {
  /** Inactivity timeout in milliseconds. */
  inactivityTimeoutMs: number;
  /** How many milliseconds before expiry the warning starts. */
  warningBeforeMs: number;
  /** Server renewal endpoint. */
  renewSession: () => Promise<{ expiresAt: string }>;
  /** Sign-out navigation performed on expiry / Sign Out Now. */
  signOut: () => void | Promise<void>;
  /** Injectables clock; defaults to Date.now. */
  clock?: () => number;
  callbacks: SessionTimeoutManagerCallbacks;
}

/** How often the heartbeat attempts to renew while the user is active. */
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/** Idle periods beyond this are not "currently active": no heartbeat renewal. */
const ACTIVE_IDLE_WINDOW_MS = 30 * 1000;

export class SessionTimeoutManager {
  private readonly inactivityTimeoutMs: number;
  private readonly warningBeforeMs: number;
  private readonly renewSession: () => Promise<{ expiresAt: string }>;
  private readonly signOut: () => void | Promise<void>;
  private readonly clock: () => number;
  private readonly callbacks: SessionTimeoutManagerCallbacks;

  private lastActivity: number;
  private lastRenewalAttempt: number;

  private warningActive = false;
  private expired = false;
  private expireReason: SessionTimeoutReason | null = null;
  private renewing = false;

  constructor(options: SessionTimeoutManagerOptions) {
    this.inactivityTimeoutMs = options.inactivityTimeoutMs;
    this.warningBeforeMs = options.warningBeforeMs;
    this.renewSession = options.renewSession;
    this.signOut = options.signOut;
    this.clock = options.clock ?? (() => Date.now());
    this.callbacks = options.callbacks;
    const now = this.clock();
    this.lastActivity = now;
    this.lastRenewalAttempt = now;
  }

  /** Starts tracking. Call once when the session becomes authenticated. */
  start(): void {
    const now = this.clock();
    this.lastActivity = now;
    this.lastRenewalAttempt = now;
    this.tick(now);
  }

  /** Stops tracking and clears pending local state without notifying callbacks. */
  stop(): void {
    this.warningActive = false;
    this.expired = false;
    this.expireReason = null;
    this.renewing = false;
  }

  /** Reports meaningful user activity (click, keypress, scroll, touch, …). */
  recordActivity(): void {
    const now = this.clock();
    this.lastActivity = now;
    if (this.warningActive) {
      this.warningActive = false;
      this.callbacks.onWarningClear();
    }
  }

  /** Returns seconds until inactivity expiry, zero if already expired. */
  secondsRemaining(now?: number): number {
    const current = now ?? this.clock();
    const idleFor = current - this.lastActivity;
    return Math.max(0, Math.ceil((this.inactivityTimeoutMs - idleFor) / 1000));
  }

  /** Whether the warning modal should be showing locally. */
  isWarningActive(): boolean {
    return this.warningActive && !this.expired;
  }

  /** Whether the session has expired. */
  isExpired(): boolean {
    return this.expired;
  }

  /** The reason the session expired, if any. */
  getExpireReason(): SessionTimeoutReason | null {
    return this.expireReason;
  }

  /** Whether a renewal is currently in flight. */
  isRenewing(): boolean {
    return this.renewing;
  }

  /**
   * Advances the manager by one tick. Call roughly once per second while the
   * session is authenticated. Returns the action taken, if any.
   */
  tick(now: number): "none" | "warning" | "expired" | "renewed" {
    if (this.expired) return "none";

    const idleFor = now - this.lastActivity;

    // Absolute lifetime and revocation are enforced by the backend; the
    // caller reports them through expireAbsolute / expireRevoked.
    if (idleFor >= this.inactivityTimeoutMs) {
      this.expire("inactivity");
      return "expired";
    }

    if (!this.warningActive && idleFor >= this.inactivityTimeoutMs - this.warningBeforeMs) {
      this.warningActive = true;
      this.callbacks.onWarningStart(this.secondsRemaining(now));
      return "warning";
    }

    if (this.warningActive) {
      this.callbacks.onWarningTick(this.secondsRemaining(now));
    }

    // Heartbeat renewal: only while the user is actively working (idle within
    // the heartbeat interval) and no expiry warning is showing. Once the
    // warning is visible the user must explicitly stay signed in; an
    // unattended tab must not renew itself.
    if (
      !this.warningActive &&
      now - this.lastRenewalAttempt >= HEARTBEAT_INTERVAL_MS &&
      idleFor <= ACTIVE_IDLE_WINDOW_MS
    ) {
      this.lastRenewalAttempt = now;
      void this.attemptRenewal();
    }

    return "none";
  }

  /** Called by the UI when the user chooses "Stay Signed In". */
  async staySignedIn(): Promise<boolean> {
    return this.attemptRenewal();
  }

  /** Called by the UI when the user chooses "Sign Out Now". */
  async signOutNow(): Promise<void> {
    this.stop();
    try {
      await this.signOut();
    } catch {
      // Sign-out navigation still proceeds below.
    }
    this.expire("manual");
  }

  /** Reports that the backend rejected the session as absolutely expired. */
  expireAbsolute(): void {
    this.expire("absolute");
  }

  /** Reports that the backend rejected the session as revoked. */
  expireRevoked(): void {
    this.expire("revoked");
  }

  /** Reports that the backend rejected the token as expired. */
  expireTokenExpired(): void {
    this.expire("token-expired");
  }

  /** Reports that renewal failed because the network is unreachable. */
  expireNetwork(): void {
    this.expire("network");
  }

  private expire(reason: SessionTimeoutReason): void {
    if (this.expired) return;
    this.expired = true;
    this.expireReason = reason;
    this.warningActive = false;
    this.callbacks.onExpire(reason);
  }

  private async attemptRenewal(): Promise<boolean> {
    if (this.renewing) return false;
    this.renewing = true;
    try {
      await this.renewSession();
      const now = this.clock();
      this.lastActivity = now;
      this.lastRenewalAttempt = now;
      if (this.warningActive) {
        this.warningActive = false;
        this.callbacks.onWarningClear();
      }
      this.callbacks.onRenewed();
      return true;
    } catch (error) {
      this.callbacks.onRenewFailure(error);
      return false;
    } finally {
      this.renewing = false;
    }
  }
}
