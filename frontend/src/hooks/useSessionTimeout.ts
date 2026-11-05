import { useCallback, useEffect, useRef, useState } from "react";
import { useCollegeOS } from "../context/CollegeOSContext";
import { SessionTimeoutManager } from "../lib/sessionTimeoutManager";
import { sessionBus } from "../lib/sessionBus";
import { renewSession } from "../services/sessionSecurity";
import { useToast } from "../components/ui/ToastContainer";
import { sessionEndMessage } from "../lib/sessionMessages";

const INACTIVITY_TIMEOUT_MS =
  Number(import.meta.env.VITE_SESSION_INACTIVITY_TIMEOUT_MS) || 2 * 60 * 60 * 1000;
const WARNING_BEFORE_MS =
  Number(import.meta.env.VITE_SESSION_WARNING_BEFORE_MS) || 2 * 60 * 1000;
const TICK_INTERVAL_MS = 1000;

export type SessionTimeoutReason =
  | "inactivity"
  | "absolute"
  | "revoked"
  | "token-expired"
  | "network"
  | "manual";

export type SessionTimeoutState =
  | { status: "active" }
  | { status: "warning"; secondsRemaining: number }
  | { status: "expired"; reason: string };

export interface UseSessionTimeoutResult {
  state: SessionTimeoutState;
  renewing: boolean;
  staySignedIn: () => Promise<void>;
  signOutNow: () => Promise<void>;
  resetActivity: () => void;
}

type TabId = string;

const tabId = ((): TabId => {
  try {
    return `${crypto.randomUUID()}:${Date.now()}`;
  } catch {
    return `${Math.random().toString(36).slice(2)}:${Date.now()}`;
  }
})();

/**
 * Wires the session timeout manager into an authenticated CollegeOS tab:
 * user-activity tracking, heartbeat renewal, the expiry warning, and
 * cross-tab synchronisation over the session bus. The backend remains
 * authoritative -- this hook only reflects and reacts to server decisions.
 */
export function useSessionTimeout(): UseSessionTimeoutResult {
  const {
    isAuthenticated,
    logout: contextSignOut,
    setSessionExpiredMessage,
  } = useCollegeOS();
  const { toast } = useToast();

  const [state, setState] = useState<SessionTimeoutState>({ status: "active" });
  const [renewing, setRenewing] = useState(false);

  const managerRef = useRef<SessionTimeoutManager | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const unsubscribeBusRef = useRef(() => {});
  const startedRef = useRef(false);
  const localWarningStartedAtRef = useRef<number | null>(null);
  const remoteWarningRef = useRef<{ timestamp: number; tabId: TabId } | null>(
    null,
  );

  // Callbacks reference mutable refs so the manager is created once and not
  // restarted every time a context function is recreated.
  const signOutRef = useRef(contextSignOut);
  signOutRef.current = contextSignOut;
  const setSessionExpiredMessageRef = useRef(setSessionExpiredMessage);
  setSessionExpiredMessageRef.current = setSessionExpiredMessage;

  const setActiveState = useCallback(() => {
    setState({ status: "active" });
  }, []);

  const staySignedIn = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager || manager.isRenewing() || state.status !== "warning") return;
    setRenewing(true);
    try {
      await manager.staySignedIn();
    } finally {
      setRenewing(false);
    }
  }, [state.status]);

  const signOutNow = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) return;
    await manager.signOutNow();
  }, []);

  const resetActivity = useCallback(() => {
    managerRef.current?.recordActivity();
  }, []);

  const handleExpire = useCallback((reason: SessionTimeoutReason) => {
    setState({ status: "expired", reason });
    setSessionExpiredMessageRef.current(sessionEndMessage(reason));
    void signOutRef.current(reason);
  }, []);

  const handleRenewFailure = useCallback((error: unknown) => {
    setRenewing(false);
    toast({
      variant: "warning",
      message: "Session renewal failed",
      detail:
        error instanceof Error
          ? error.message
          : "Check your network connection and try again.",
      duration: 6000,
    });
  }, [toast]);

  const startManager = useCallback(() => {
    if (!isAuthenticated || startedRef.current) return;

    const manager = new SessionTimeoutManager({
      inactivityTimeoutMs: INACTIVITY_TIMEOUT_MS,
      warningBeforeMs: WARNING_BEFORE_MS,
      clock: () => Date.now(),
      renewSession,
      signOut: () => void signOutRef.current("manual"),
      callbacks: {
        onWarningStart: (secondsRemaining) => {
          localWarningStartedAtRef.current = Date.now();
          sessionBus.publish({
            type: "WARNING_STARTED",
            reason: "inactivity",
            timestamp: localWarningStartedAtRef.current,
            tabId,
          });
          setState({ status: "warning", secondsRemaining });
        },
        onWarningTick: (secondsRemaining) => {
          setState({ status: "warning", secondsRemaining });
        },
        onWarningClear: () => {
          localWarningStartedAtRef.current = null;
          sessionBus.publish({
            type: "WARNING_CLEARED",
            timestamp: Date.now(),
            tabId,
          });
          setActiveState();
        },
        onExpire: handleExpire,
        onRenewed: () => {
          setActiveState();
          sessionBus.publish({
            type: "SESSION_RENEWED",
            timestamp: Date.now(),
            tabId,
          });
        },
        onRenewFailure: handleRenewFailure,
      },
    });
    managerRef.current = manager;
    manager.start();

    const tick = () => {
      manager.tick(Date.now());
    };
    tick();
    tickTimerRef.current = window.setInterval(tick, TICK_INTERVAL_MS);
    startedRef.current = true;
  }, [isAuthenticated]);

  const suppressLocalWarning = useCallback(() => {
    const remote = remoteWarningRef.current;
    const local = localWarningStartedAtRef.current;
    if (!remote || !local) return false;
    if (remote.timestamp < local) return true;
    if (remote.timestamp === local && remote.tabId < tabId) return true;
    return false;
  }, [tabId]);

  useEffect(() => {
    unsubscribeBusRef.current = sessionBus.subscribe((event) => {
      if (event.tabId === tabId) return;
      switch (event.type) {
        case "WARNING_STARTED":
          remoteWarningRef.current = {
            timestamp: event.timestamp,
            tabId: event.tabId,
          };
          break;
        case "WARNING_CLEARED": {
          const remote = remoteWarningRef.current;
          if (
            remote &&
            event.tabId === remote.tabId &&
            event.timestamp >= remote.timestamp
          ) {
            remoteWarningRef.current = null;
          }
          break;
        }
        case "SESSION_RENEWED":
          managerRef.current?.recordActivity();
          break;
        case "SESSION_EXPIRED":
          handleExpire(
            event.reason === "unknown" ? "manual" : event.reason,
          );
          break;
        case "SESSION_ENDED":
          signOutRef.current(event.reason);
          break;
        default:
          break;
      }
    });
    return () => {
      unsubscribeBusRef.current();
    };
  }, [handleExpire, tabId]);

  useEffect(() => {
    if (!isAuthenticated) {
      managerRef.current?.stop();
      managerRef.current = null;
      startedRef.current = false;
      localWarningStartedAtRef.current = null;
      remoteWarningRef.current = null;
      if (tickTimerRef.current !== null) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      setState({ status: "active" });
      return;
    }
    startManager();
    return () => {
      if (tickTimerRef.current !== null) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };
  }, [isAuthenticated, startManager]);

  return {
    state,
    renewing,
    staySignedIn,
    signOutNow,
    resetActivity,
  };
}
