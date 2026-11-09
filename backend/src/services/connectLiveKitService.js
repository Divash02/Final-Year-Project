import crypto from "node:crypto";

/**
 * LiveKit integration for CollegeOS Connect (server-side only).
 *
 * Supports LiveKit Cloud (secure wss://) and self-hosted deployments.
 * Secrets are read from environment and never returned to clients, logs, or errors.
 * Tokens are short-lived and scoped to the minimum room grants for the
 * participant's verified role.
 */

let AccessTokenCtor = null;

async function getAccessTokenCtor() {
  if (AccessTokenCtor) return AccessTokenCtor;
  try {
    const mod = await import("livekit-server-sdk");
    AccessTokenCtor = mod.AccessToken;
    return AccessTokenCtor;
  } catch (err) {
    const error = new Error(
      "LiveKit server SDK is not available on the server. Install dependencies and restart the backend.",
    );
    error.status = 503;
    error.code = "LIVEKIT_SDK_UNAVAILABLE";
    error.expose = true;
    throw error;
  }
}

function normalizeLiveKitUrl(raw) {
  const value = String(raw || "").trim().replace(/[\\/]+$/, "");
  if (!value) return "";
  // Convert HTTP(S) URLs to WebSocket URLs for LiveKit client connections.
  if (/^https:\/\//i.test(value)) return value.replace(/^https:\/\//i, "wss://");
  if (/^http:\/\//i.test(value)) return value.replace(/^http:\/\//i, "ws://");
  if (/^wss:\/\//i.test(value) || /^ws:\/\//i.test(value)) return value;
  return value;
}

function isLikelyPlaceholderSecret(value) {
  // Detect masked/example secrets (e.g. bullets, ellipsis, obvious placeholders).
  // Never log or return the secret value.
  const s = String(value || "");
  if (!s) return true;
  if (/[\u2022\u2026]/.test(s)) return true; // • …
  if (/(?:your[-_ ]?(?:livekit|api)?[-_ ]?secret|replace|changeme|example)/i.test(s)) return true;
  if (/^\*{3,}$/.test(s)) return true;
  // LiveKit Cloud secrets are typically long random strings; very short values are unsafe.
  if (s.length < 16) return true;
  return false;
}

export function getLiveKitConfig() {
  const url = normalizeLiveKitUrl(process.env.LIVEKIT_URL);
  const apiKey = String(process.env.LIVEKIT_API_KEY || "").trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || "").trim();
  const missing = [];
  if (!url) missing.push("LIVEKIT_URL");
  if (!apiKey) missing.push("LIVEKIT_API_KEY");
  if (!apiSecret) missing.push("LIVEKIT_API_SECRET");
  const hasScheme = !url || /^wss?:\/\//i.test(url) || /^https?:\/\//i.test(url);
  const secure = /^wss:\/\//i.test(url) || /^https:\/\//i.test(url);
  const secretValid = !apiSecret || !isLikelyPlaceholderSecret(apiSecret);
  return {
    provider: "livekit",
    configured: missing.length === 0 && hasScheme && secretValid,
    // Diagnostic fields are server-side only; never include secret/key values.
    missing,
    urlValid: hasScheme,
    secure,
    secretValid,
  };
}

export function getLiveKitPublicConfig() {
  const cfg = getLiveKitConfig();
  const rawUrl = normalizeLiveKitUrl(process.env.LIVEKIT_URL);
  let host = null;
  try { host = rawUrl ? new URL(rawUrl).host : null; } catch { host = null; }
  const publicMissing = cfg.configured
    ? []
    : [...cfg.missing, ...(cfg.secretValid === false ? ["LIVEKIT_API_SECRET_VALID"] : [])];
  return {
    provider: "livekit",
    configured: cfg.configured,
    // Safe, non-secret hints for admins/clients. Never return key/secret.
    missing: publicMissing,
    urlValid: cfg.urlValid,
    secure: cfg.secure,
    secretValid: cfg.secretValid !== false,
    host, // host only, never credentials
    mode: rawUrl ? (cfg.secure ? "secure" : "insecure-local") : "unconfigured",
  };
}

export function assertLiveKitConfigured() {
  const cfg = getLiveKitConfig();
  const rawUrl = normalizeLiveKitUrl(process.env.LIVEKIT_URL);
  const apiKey = String(process.env.LIVEKIT_API_KEY || "").trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || "").trim();
  if (!cfg.configured) {
    const missing = cfg.missing.length ? ` Missing: ${cfg.missing.join(", ")}.` : "";
    const urlHint = rawUrl && !cfg.urlValid ? " LIVEKIT_URL must use wss:// (LiveKit Cloud/production) or ws:// (local)." : "";
    const secretHint = cfg.secretValid === false
      ? " LIVEKIT_API_SECRET appears masked or invalid; set the real API secret from the same LiveKit project as LIVEKIT_API_KEY/LIVEKIT_URL, then restart the backend."
      : "";
    const err = new Error(`LiveKit is not configured.${missing}${urlHint}${secretHint}`.trim());
    err.status = 503;
    err.code = "LIVEKIT_NOT_CONFIGURED";
    err.expose = true;
    // Server-side diagnostic only (no secret values).
    err.diagnostic = { missing: cfg.missing, urlValid: cfg.urlValid, secretValid: cfg.secretValid !== false };
    throw err;
  }
  return { url: rawUrl, apiKey, apiSecret, provider: "livekit", configured: true };
}

/**
 * Safe startup/runtime diagnostic summary. Never includes secrets, tokens, or
 * full credential values. Suitable for server logs and admin troubleshooting.
 */
export function getLiveKitStartupDiagnostics() {
  const cfg = getLiveKitConfig();
  const rawUrl = normalizeLiveKitUrl(process.env.LIVEKIT_URL);
  const apiKey = String(process.env.LIVEKIT_API_KEY || "").trim();
  let host = null;
  try { host = rawUrl ? new URL(rawUrl).host : null; } catch { host = null; }
  return {
    env: {
      LIVEKIT_URL: Boolean(String(process.env.LIVEKIT_URL || "").trim()),
      LIVEKIT_API_KEY: Boolean(apiKey),
      LIVEKIT_API_SECRET: Boolean(String(process.env.LIVEKIT_API_SECRET || "").trim()),
      LIVEKIT_API_SECRET_VALID: cfg.secretValid !== false,
    },
    project: {
      host,
      secure: cfg.secure,
      urlValid: cfg.urlValid,
      configured: cfg.configured,
      apiKeyPrefix: apiKey ? `${apiKey.slice(0, 4)}...` : null, // non-secret hint only
    },
    tokenGeneration: {
      method: "livekit-server-sdk AccessToken.toJwt()",
      manualJwtSigning: false,
      timingUnit: "unix-seconds (SDK-managed)",
    },
  };
}

export function buildConnectRoomName(session) {
  // Never reuse the 16-digit session credential ID or expose PII.
  const id = String(session?._id || session?.id || "");
  const digest = crypto.createHash("sha256").update(`collegeos-connect:${id}`).digest("hex").slice(0, 24);
  return `cosc_${digest}`;
}

export function buildParticipantIdentity(user) {
  // Stable but non-PII identity for LiveKit participants.
  const id = String(user?._id || user?.id || "");
  const digest = crypto.createHash("sha256").update(`collegeos-user:${id}`).digest("hex").slice(0, 16);
  return `u_${digest}`;
}

function participantDisplayName(user) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return name || "CollegeOS Participant";
}

export function grantsForConnectRole(role) {
  const base = {
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };
  switch (role) {
    case "HOST":
    case "TEACHER":
      return { ...base, roomAdmin: true, canUpdateOwnMetadata: true };
    case "CO_HOST":
      return { ...base, roomAdmin: true, canUpdateOwnMetadata: true };
    case "STAFF":
    case "INVITED_STAFF":
      return { ...base, roomAdmin: false, canUpdateOwnMetadata: true };
    case "STUDENT":
    default:
      return { ...base, roomAdmin: false, canUpdateOwnMetadata: true };
  }
}

export async function createLiveKitAccessToken({ session, user, role, ttlSeconds = 300 }) {
  const cfg = assertLiveKitConfigured();
  const AccessToken = await getAccessTokenCtor();
  const roomName = session.roomKey || buildConnectRoomName(session);
  const identity = buildParticipantIdentity(user);
  const grants = grantsForConnectRole(role);

  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity,
    name: participantDisplayName(user),
    ttl: ttlSeconds,
    metadata: JSON.stringify({
      userId: String(user._id || user.id),
      sessionId: String(session._id),
      sessionType: session.sessionType,
      role,
    }),
  });
  at.addGrant({ ...grants, room: roomName });
  const token = await at.toJwt();

  // Safe diagnostic only (no secret/token). Helps isolate LiveKit 401: confirms
  // the configured project host and token issuer prefix match the LiveKit project.
  try {
    let host = null;
    try { host = cfg.url ? new URL(cfg.url).host : null; } catch {}
    console.log(
      "[Connect/LiveKit] token issued " +
        JSON.stringify({
          host,
          apiKeyPrefix: cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}...` : null,
          roomName,
          identity,
          role,
          expiresInSeconds: ttlSeconds,
          tokenType: typeof token,
          tokenParts: typeof token === "string" ? token.split(".").length : null,
          method: "livekit-server-sdk AccessToken.toJwt()",
        }),
    );
  } catch {}

  return {
    provider: "livekit",
    url: cfg.url,
    roomName,
    token,
    identity,
    role,
    expiresInSeconds: ttlSeconds,
    grants: {
      canPublish: grants.canPublish,
      canSubscribe: grants.canSubscribe,
      canPublishData: grants.canPublishData,
      roomAdmin: Boolean(grants.roomAdmin),
    },
  };
}
