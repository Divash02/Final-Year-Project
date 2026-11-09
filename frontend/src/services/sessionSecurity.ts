/**
 * Session lifecycle API calls for CollegeOS automatic session timeout.
 *
 * These wrap the existing `/api/auth/sessions/*` endpoints. No separate
 * authentication system is introduced: renewal reuses the same access token
 * and session record the login flow already creates.
 */

import { apiRequest } from "./apiClient";

export interface SessionRenewalResult {
  success: boolean;
  expiresAt: string;
}

/**
 * Asks the server to confirm the current session is still valid and to refresh
 * its last-active timestamp. The server independently enforces inactivity and
 * absolute expiration, so a successful response means the session may continue.
 * The caller keeps its existing access token.
 *
 * Network failure here is deliberate: the caller must not treat it as a
 * successful renewal.
 */
export async function renewSession(): Promise<SessionRenewalResult> {
  return apiRequest<SessionRenewalResult>("/auth/sessions/renew", {
    method: "POST",
  });
}

export interface RevokeSessionResult {
  success: boolean;
}

/**
 * Revokes the current session (Sign Out Now / revoke own device).
 */
export async function revokeCurrentSession(): Promise<RevokeSessionResult> {
  const token = localStorage.getItem("collegeos_token");
  if (!token) return { success: true };
  await apiRequest(`/auth/logout`, { method: "POST" });
  return { success: true };
}
