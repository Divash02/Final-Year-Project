/**
 * Human-readable messages for session lifecycle events. Kept in one place so
 * the login page, the expiry warning and the session guard all word the same
 * outcome identically, no matter which tab or backend code triggered it.
 */

export type SessionEndReason =
  | "inactivity"
  | "absolute"
  | "revoked"
  | "token-expired"
  | "network"
  | "manual"
  | "unknown";

export function sessionEndMessage(reason: SessionEndReason): string {
  switch (reason) {
    case "inactivity":
      return "Your session expired due to inactivity. Please sign in again.";
    case "absolute":
      return "Your session reached its maximum duration. Please sign in again.";
    case "revoked":
      return "Your session was ended by another device or an administrator. Please sign in again.";
    case "token-expired":
      return "Your session expired. Please sign in again.";
    case "network":
        return "Unable to reach the CollegeOS server. Please sign in again.";
    case "manual":
      return "You have been signed out.";
    default:
      return "Please sign in again.";
  }
}

export function sessionWarningTitle(): string {
  return "Your session is about to expire";
}

export function sessionWarningBody(): string {
  return (
    "For security purposes, you will be automatically signed out due to inactivity."
  );
}
