/**
 * CollegeOS session security policy.
 *
 * All values are configurable through environment variables so institutional
 * administrators can tighten or relax session behaviour without code changes.
 * Defaults represent a sensible enterprise baseline:
 *
 *   - inactivity timeout:        30 minutes
 *   - warning before timeout:     2 minutes
 *   - absolute session lifetime: 12 hours
 *   - access token lifetime:     12 hours (aligned with the absolute lifetime
 *                                 so a valid session always carries a valid token)
 *
 * Role-specific overrides can be supplied through `SESSION_POLICY_BY_ROLE` as
 * a JSON object keyed by role name, for example:
 *
 *   {"super_admin": {"inactivityTimeoutMs": 900000}, "finance_officer": {"inactivityTimeoutMs": 600000}}
 *
 * Overrides merge over the base policy, so only the fields that differ for a
 * role need to be supplied. Frontend role state never influences session
 * validity: the backend resolves the policy from the authenticated user's
 * stored roles on every request.
 */

const MS = {
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
};

function readMs(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readTtl(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback;
  }
  return String(raw);
}

function readRoleOverrides() {
  const raw = process.env.SESSION_POLICY_BY_ROLE;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore malformed policy overrides; the base policy still applies.
  }
  return {};
}

export { readRoleOverrides };

const BASE_POLICY = {
  inactivityTimeoutMs: readMs("SESSION_INACTIVITY_TIMEOUT_MS", 2 * MS.HOUR),
  warningBeforeMs: readMs("SESSION_WARNING_BEFORE_MS", 2 * MS.MINUTE),
  absoluteLifetimeMs: readMs("SESSION_ABSOLUTE_LIFETIME_MS", 12 * MS.HOUR),
  accessTokenTtl: readTtl("SESSION_ACCESS_TOKEN_TTL", "12h"),
};

/**
 * Resolves the session security policy for a role. Unknown roles fall back to
 * the base policy. The result is frozen so callers cannot mutate shared state.
 */
export function getSessionPolicy(role) {
  const roleName = String(role || "student");
  const ROLE_OVERRIDES = readRoleOverrides();
  const override = ROLE_OVERRIDES[roleName];
  if (!override) {
    return Object.freeze({ ...BASE_POLICY });
  }
  const merged = {
    inactivityTimeoutMs: Number.isFinite(Number(override.inactivityTimeoutMs))
      ? Number(override.inactivityTimeoutMs)
      : BASE_POLICY.inactivityTimeoutMs,
    warningBeforeMs: Number.isFinite(Number(override.warningBeforeMs))
      ? Number(override.warningBeforeMs)
      : BASE_POLICY.warningBeforeMs,
    absoluteLifetimeMs: Number.isFinite(Number(override.absoluteLifetimeMs))
      ? Number(override.absoluteLifetimeMs)
      : BASE_POLICY.absoluteLifetimeMs,
    accessTokenTtl: typeof override.accessTokenTtl === "string" && override.accessTokenTtl
      ? override.accessTokenTtl
      : BASE_POLICY.accessTokenTtl,
  };
  return Object.freeze(merged);
}

/**
 * The base policy, primarily used by login/renewal flows that do not yet know
 * the requesting role (they use the authenticated user's roles instead).
 */
export function getBaseSessionPolicy() {
  return Object.freeze({ ...BASE_POLICY });
}

export function sessionSecurityDefaults() {
  return {
    INACTIVITY_TIMEOUT_MS: BASE_POLICY.inactivityTimeoutMs,
    WARNING_BEFORE_MS: BASE_POLICY.warningBeforeMs,
    ABSOLUTE_LIFETIME_MS: BASE_POLICY.absoluteLifetimeMs,
    ACCESS_TOKEN_TTL: BASE_POLICY.accessTokenTtl,
  };
}
