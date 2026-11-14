/**
 * Central environment configuration.
 *
 * Every module that needs a deployment setting reads it from here instead of
 * touching `process.env` directly. Validation happens once, at first import, so
 * a missing secret fails fast with a clear message rather than surfacing later
 * as a confusing runtime error deep inside a request.
 */

function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

function optional(name, fallback = undefined) {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  return String(value).trim();
}

function intEnv(name, fallback) {
  const parsed = Number.parseInt(optional(name, ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const PLACEHOLDER_SECRETS = new Set([
  "replace-with-a-random-secret",
  "collegeos-super-secure-production-jwt-token-secret-key-2026",
]);

const jwtSecret = required("JWT_SECRET");
if (PLACEHOLDER_SECRETS.has(jwtSecret)) {
  throw new Error("JWT_SECRET must not be left at its default or placeholder value.");
}

const bootstrapAdminPassword = required("COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD");

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: intEnv("PORT", 4000),
  jwtSecret,
  bootstrapAdminPassword,
  mongoUri: optional("MONGODB_URI", "mongodb://127.0.0.1:27017/collegeos"),
  institutionEmailDomain: optional("INSTITUTION_EMAIL_DOMAIN", "techspire.edu.np"),
  allowedOrigins: (optional("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173"))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: optional("NODE_ENV", "development") === "production",
};

export default env;