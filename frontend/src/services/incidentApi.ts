const configuredApiBase =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const normalizedApiBase = configuredApiBase.replace(/\/+$/, "");
const API_BASE = /\/api$/i.test(normalizedApiBase)
  ? normalizedApiBase
  : `${normalizedApiBase}/api`;

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

/**
 * POST several files as a single multipart request (field name "file") plus
 * optional text fields, reusing the CollegeOS auth + CSRF headers so the
 * backend's CSRF middleware accepts the request.
 */
export function postMultipart(
  route: string,
  files: FileList | File[],
  fields: Record<string, string> = {},
  onProgress?: (progress: UploadProgress) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    const fileArray = files instanceof FileList ? Array.from(files) : Array.isArray(files) ? files : [files];
    for (const file of fileArray) form.append("file", file);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);

    const xhr = new XMLHttpRequest();
    let settled = false;
    const normalizedRoute = route.startsWith("/api/") ? route.slice(4) : route;

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress({ loaded: event.loaded, total: event.total, percent: Math.round((event.loaded / event.total) * 100) });
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
        resolve(data);
        return;
      }
      const body = data as { error?: string };
      reject(new Error(body.error || `Upload failed (HTTP ${xhr.status}).`));
    });

    xhr.addEventListener("error", () => {
      settled = true;
      reject(new Error("Cannot reach the CollegeOS API. Restart the app with npm run dev."));
    });

    xhr.addEventListener("abort", () => {
      settled = true;
      reject(new Error("The upload was cancelled."));
    });

    const token = localStorage.getItem("collegeos_token");
    const csrfToken = localStorage.getItem("collegeos_csrf_token");
    xhr.open("POST", `${API_BASE}${normalizedRoute}`, true);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (csrfToken) xhr.setRequestHeader("X-CSRF-Token", csrfToken);
    xhr.send(form);
  });
}

export function incidentFileUrl(fileId: string): string {
  return `${API_BASE}/files/${fileId}`;
}
