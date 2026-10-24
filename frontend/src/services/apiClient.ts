const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

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

export async function apiFetch(
  route: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = localStorage.getItem("collegeos_token");
  const headers = new Headers(options.headers);
  // FormData bodies must keep the browser-generated multipart boundary, so the
  // Content-Type header is only synthesised for non-FormData payloads.
  if (options.body && !headers.has("Content-Type") && !isFormData(options.body)) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    return await fetch(`${API_BASE}${route}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Cannot reach the CollegeOS API. Restart the app with npm run dev.",
    );
  }
}

/**
 * API error carrying the HTTP status so callers can tell a
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