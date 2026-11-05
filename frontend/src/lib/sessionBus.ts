/**
 * Cross-tab session bus for CollegeOS.
 *
 * Keeps every open tab synchronized without placing authentication credentials
 * in browser storage: only session lifecycle events are broadcast
 * (warning started/cleared, session renewed, session expired, user signed out).
 * BroadcastChannel is used when available; otherwise the bus is a silent no-op
 * so single-tab and older-browser behaviour is unchanged. The backend remains
 * authoritative: every tab independently validates its session on each request.
 */

import { SessionEndReason } from "./sessionMessages";

export type SessionBusEvent =
  | { type: "WARNING_STARTED"; reason: "inactivity"; timestamp: number; tabId: string }
  | { type: "WARNING_CLEARED"; timestamp: number; tabId: string }
  | { type: "SESSION_RENEWED"; timestamp: number; tabId: string }
  | { type: "SESSION_EXPIRED"; reason: SessionEndReason; timestamp: number; tabId: string }
  | { type: "SESSION_ENDED"; reason: SessionEndReason; timestamp: number; tabId: string };

export type SessionBusListener = (event: SessionBusEvent) => void;

const CHANNEL_NAME = "collegeos:session";

class SessionBus {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<SessionBusListener>();

  constructor() {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          const message = event?.data as SessionBusEvent | null;
          if (!message || !message.type) return;
          this.listeners.forEach((listener) => listener(message));
        };
      } catch {
        // BroadcastChannel unavailable in this context — cross-tab sync is
        // degraded gracefully; each tab still enforces the session itself.
        this.channel = null;
      }
    }
  }

  subscribe(listener: SessionBusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: SessionBusEvent): void {
    if (!this.channel) return;
    try {
      this.channel.postMessage(event);
    } catch {
      // Silently drop: cross-tab sync is best-effort.
    }
  }

  destroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners.clear();
  }
}

export const sessionBus = new SessionBus();
