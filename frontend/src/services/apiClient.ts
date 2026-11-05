const configuredApiBase =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const normalizedApiBase = configuredApiBase.replace(/\/+$/, "");
const API_BASE = /\/api$/i.test(normalizedApiBase)
  ? normalizedApiBase
  : `${normalizedApiBase}/api`;

/**
 * Origin that serves the API. Uploaded profile photos are stored as
 * API-relative paths (`/uploads/avatars/...`) so the value stays valid when the
 * host or port changes; this turns one back into a URL the browser can load.
 */
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

/** Resolves an API-relative asset path (or a data/absolute URL) for display. */
export function resolveAssetUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  return `${API_ORIGIN}${value.startsWith("/") ? "" : "/"}${value}`;
}

function isFormData(body: BodyInit | null | undefined): boolean {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

/**
 * Session failure codes returned by the CollegeOS backend. The frontend uses
 * these to decide whether an API failure should end the session entirely
 * (logout + redirect) or just surface a regular error message.
 */
export type SessionFailureCode =
  | "TOKEN_MISSING"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID"
  | "SESSION_INVALID"
  | "SESSION_REVOKED"
  | "SESSION_EXPIRED_INACTIVITY"
  | "SESSION_EXPIRED_ABSOLUTE"
  | "ACCOUNT_DISABLED"
  | "TEMPORARY_CREDENTIAL_EXPIRED"
  | "PASSWORD_CHANGE_REQUIRED";

/**
 * Session failure codes that mean the current session can no longer be used
 * and every tab should sign the user out.
 */
const TERMINAL_SESSION_CODES = new Set<SessionFailureCode>([
  "SESSION_REVOKED",
  "SESSION_EXPIRED_INACTIVITY",
  "SESSION_EXPIRED_ABSOLUTE",
  "TOKEN_EXPIRED",
  "SESSION_INVALID",
  "ACCOUNT_DISABLED",
]);

/**
 * Invoked by the authentication context whenever an API response proves the
 * current session is no longer valid. Set via setSessionExpiredHandler.
 */
let onSessionExpired: (() => void) | null = null;

/**
 * Registers the handler that runs when any API call proves the session is
 * expired, revoked or otherwise invalid. Only one handler is active at a time.
 */
export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

/**
 * Clears the session-expiry handler (used by tests and teardown).
 */
export function clearSessionExpiredHandler(): void {
  onSessionExpired = null;
}

function sessionCodeFrom(data: unknown): SessionFailureCode | null {
  if (!data || typeof data !== "object") return null;
  const candidate = (data as Record<string, unknown>).code;
  return typeof candidate === "string" ? (candidate as SessionFailureCode) : null;
}

/**
 * An API error that carries the HTTP status so callers can tell a
 * safe, actionable validation message (4xx) from an unexpected
 * server failure (5xx) and word their feedback accordingly.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * An API error that carries the HTTP status and, for session failures, the
 * backend session code so the UI can word the expiry message precisely.
 */
export class SessionExpiredError extends ApiError {
  readonly code: SessionFailureCode | null;

  constructor(message: string, status: number, code: SessionFailureCode | null = null) {
    super(message, status);
    this.name = "SessionExpiredError";
    this.code = code;
  }
}

export interface ApiFetchOptions extends RequestInit {
  /**
   * When true, 401 responses are returned to the caller as-is instead of
   * being thrown as an ApiError. Use this only on endpoints where a 401
   * carries domain-level information (e.g. the login endpoint returns a 401
   * with `remainingAttempts` on bad credentials, not a session expiry).
   */
  skipSessionCheck?: boolean;
}

export async function apiFetch(
  route: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const { skipSessionCheck, ...fetchOptions } = options;
  const token = localStorage.getItem("collegeos_token");
  const isLoginRoute = /\/auth\/login\/?$/i.test(route);
  const headers = new Headers(fetchOptions.headers);
  // FormData bodies must keep the browser-generated multipart boundary, so the
  // Content-Type header is only synthesised for non-FormData payloads.
  if (fetchOptions.body && !headers.has("Content-Type") && !isFormData(fetchOptions.body)) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !isLoginRoute && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    const response = await fetch(`${API_BASE}${route}`, {
      ...fetchOptions,
      headers,
    });

    // A 401 on any endpoint means the credentials stored for this session no
    // longer satisfy the server. Surface a precise session error so the
    // authentication context can end the session in every tab.
    // Exception: when skipSessionCheck is true the caller wants the raw
    // response (e.g. the login endpoint uses 401 to signal wrong credentials,
    // not session expiry).
    if (response.status === 401 && !skipSessionCheck) {
      let data: Record<string, unknown> = {};
      try {
        data = (await response.json()) as Record<string, unknown>;
      } catch {
        data = {};
      }
      const code = sessionCodeFrom(data);
      if (code && TERMINAL_SESSION_CODES.has(code)) {
        onSessionExpired?.();
        throw new SessionExpiredError(
          typeof data.error === "string" ? data.error : "Session expired.",
          401,
          code,
        );
      }
      throw new ApiError(
        typeof data.error === "string" ? data.error : `CollegeOS API request failed (HTTP 401).`,
        401,
      );
    }

    return response;
   } catch (error) {
     if (error instanceof ApiError) throw error;
     throw error instanceof Error ? error : new Error("Cannot reach the CollegeOS API. Restart the app with npm run dev.");
   }
}

export function apiUpload<T>(
  route: string,
  body: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE}${route}`);

    const token = localStorage.getItem("collegeos_token");
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onerror = () => reject(new Error("Cannot reach the CollegeOS API."));
    request.onabort = () => reject(new Error("The CollegeOS upload was cancelled."));
    request.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(request.responseText);
      } catch {
        data = {};
      }
      if (request.status < 200 || request.status >= 300) {
        reject(
          new ApiError(
            typeof data.error === "string"
              ? data.error
              : `CollegeOS API request failed (HTTP ${request.status}).`,
            request.status,
          ),
        );
        return;
      }
      resolve(data as T);
    };
    request.send(body);
  });
}

/**
 * API error carrying the HTTP status so callers can tell a
 * safe, actionable validation message (4xx) from an unexpected
 * server failure (5xx) and word their feedback accordingly.
 */
export async function apiRequest<T>(
  route: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await apiFetch(route, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      data.error || `CollegeOS API request failed (HTTP ${response.status}).`,
      response.status,
    );
  }
  return data as T;
}