/**
 * Upload client.
 *
 * `apiClient` is built on `fetch`, which cannot report upload progress.
 * Every CollegeOS upload that shows a progress bar goes through here
 * instead: one XMLHttpRequest per file, same auth header, same API base,
 * same error contract (`{ error }` in the body).
 *
 * The caller owns the queue; this module owns one transfer and reports
 * what actually happened — bytes sent, server verdict, abort — so the UI
 * never has to guess whether an upload succeeded.
 */

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

export interface UploadProgress {
  /** Bytes transferred so far, when the total is known. */
  loaded: number;
  /** Total bytes, or 0 when the server did not announce a length. */
  total: number;
  /** 0–100, or null while the total is unknown. */
  percent: number | null;
}

export interface UploadResult<T = unknown> {
  status: number;
  data: T;
}

export interface UploadOptions {
  /** Multipart field names beyond the file itself. */
  fields?: Record<string, string>;
  /** Reported at least once per progress event. */
  onProgress?: (progress: UploadProgress) => void;
  /** Called when the caller aborts; distinct from a network failure. */
  onAbort?: () => void;
}

/**
 * A live transfer. `abort` is safe to call more than once and after
 * completion — the second call is a no-op, which keeps queue code simple.
 */
export interface UploadTask {
  promise: Promise<UploadResult>;
  abort: () => void;
}

export function uploadWithProgress(
  route: string,
  file: File,
  options: UploadOptions = {},
): UploadTask {
  const form = new FormData();
  form.append("file", file);
  for (const [key, value] of Object.entries(options.fields || {})) {
    form.append(key, value);
  }

  const xhr = new XMLHttpRequest();
  let settled = false;

  const promise = new Promise<UploadResult>((resolve, reject) => {
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      options.onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.round((event.loaded / event.total) * 100),
      });
    });

    xhr.addEventListener("load", () => {
      settled = true;
      let data: unknown = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ status: xhr.status, data });
        return;
      }
      const body = data as { error?: string };
      reject(
        new Error(
          body.error || `Upload failed (HTTP ${xhr.status}).`,
        ),
      );
    });

    xhr.addEventListener("error", () => {
      settled = true;
      reject(
        new Error(
          "Cannot reach the CollegeOS API. Restart the app with npm run dev.",
        ),
      );
    });

    xhr.addEventListener("abort", () => {
      settled = true;
      options.onAbort?.();
      reject(new Error("Upload cancelled."));
    });

    const token = localStorage.getItem("collegeos_token");
    const csrfToken = localStorage.getItem("collegeos_csrf_token");
    xhr.open("POST", `${API_BASE}${route}`, true);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (csrfToken) xhr.setRequestHeader("X-CSRF-Token", csrfToken);
    xhr.send(form);
  });

  return {
    promise,
    abort: () => {
      if (!settled) xhr.abort();
    },
  };
}

/**
 * Fetches a stored file as a Blob with the session token attached.
 *
 * Used by inline viewers (PDF, image) that need the real bytes to
 * render inside CollegeOS. The `/api/files/:id` route re-checks the
 * caller's entitlement against the owning record before a single byte
 * is streamed, so a private document is never exposed by knowing its
 * id.
 */
export async function fetchStoredFile(fileId: string): Promise<Blob> {
  const token = localStorage.getItem("collegeos_token");
  const response = await fetch(`${API_BASE}/files/${fileId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ||
        `The file could not be loaded (HTTP ${response.status}).`,
    );
  }
  return response.blob();
}

/**
 * Downloads a stored file by id.
 *
 * Files are not public: `/api/files/:id` authorises the request against
 * the owning record, so the browser must send the session token. A plain
 * anchor cannot do that, so the file is fetched as a blob and opened
 * through an object URL instead.
 */
export async function downloadStoredFile(
  fileId: string,
  filename: string,
): Promise<void> {
  const token = localStorage.getItem("collegeos_token");
  const response = await fetch(`${API_BASE}/files/${fileId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ||
        `Download failed (HTTP ${response.status}).`,
    );
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
