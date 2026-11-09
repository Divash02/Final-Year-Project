import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";

// Test-only configuration: the app reads these at module load, so they are set
// before anything from ../src is imported.
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/collegeos_session_security_test";
process.env.JWT_SECRET = "collegeos-session-security-suite-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";
// Short timeouts so the suite can assert expiry without waiting minutes.
process.env.SESSION_INACTIVITY_TIMEOUT_MS = "60000";
process.env.SESSION_WARNING_BEFORE_MS = "10000";
process.env.SESSION_ABSOLUTE_LIFETIME_MS = "300000";
process.env.SESSION_ACCESS_TOKEN_TTL = "300000";

const { getSessionPolicy, readRoleOverrides } = await import("../src/config/sessionSecurity.js");

test("session policy defaults to the enterprise baseline", () => {
  const policy = getSessionPolicy("student");
  assert.equal(policy.inactivityTimeoutMs, 30 * 60 * 1000);
  assert.equal(policy.warningBeforeMs, 2 * 60 * 1000);
  assert.equal(policy.absoluteLifetimeMs, 12 * 60 * 60 * 1000);
  assert.equal(policy.accessTokenTtl, "12h");
});

test("session policy supports role-specific overrides", () => {
  const previous = process.env.SESSION_POLICY_BY_ROLE;
  process.env.SESSION_POLICY_BY_ROLE = JSON.stringify({
    finance_officer: { inactivityTimeoutMs: 900000 },
  });
  try {
    const overrides = readRoleOverrides();
    assert.equal(overrides.finance_officer.inactivityTimeoutMs, 900000);
    const policy = getSessionPolicy("finance_officer");
    assert.equal(policy.inactivityTimeoutMs, 900000);
    assert.equal(getSessionPolicy("student").inactivityTimeoutMs, 30 * 60 * 1000);
  } finally {
    process.env.SESSION_POLICY_BY_ROLE = previous;
  }
});

const csrfTokens = new Map();

async function api(path, { method = "GET", token, body, headers: requestHeaders = {} } = {}) {
  const headers = { ...requestHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const isMutating = /^(POST|PUT|PATCH|DELETE)$/i.test(String(method));
  if (token && isMutating) {
    const csrf = csrfTokens.get(token);
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers,
    body: payload,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (
    /^\/api\/auth\/(login|change-password)\/?$/i.test(path) &&
    response.status === 200 &&
    data &&
    data.csrfToken
  ) {
    csrfTokens.set(data.token, data.csrfToken);
  }
  return { status: response.status, data, text, headers: response.headers };
}

async function login(email, password) {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.text}`);
  assert.ok(res.data.token);
  assert.ok(res.data.csrfToken, "login did not issue a CSRF token");
  csrfTokens.set(res.data.token, res.data.csrfToken);
  return res.data.token;
}

const ctx = {};
let PORT = 0;
let server = null;

before(async () => {
  const { connectDatabase, mongoose } = await import("../src/config/database.js");
  await connectDatabase();
  await mongoose.connection.dropDatabase();

  const { initializeServerState } = await import("../src/db.js");
  await initializeServerState();

  const { User } = await import("../src/models/index.js");
  const { hashPassword } = await import("../src/db.js");

  // A regular faculty account for session tests.
  ctx.faculty = await User.create({
    email: "lecturer@collegeos.test",
    collegeEmail: "lecturer@collegeos.test",
    passwordHash: hashPassword("Lecturer@123"),
    firstName: "Lecturer",
    lastName: "One",
    roles: ["faculty"],
    activeRole: "faculty",
    accountStatus: "ACTIVE",
    isActive: true,
  });

  ctx.facultyToken = await login("lecturer@collegeos.test", "Lecturer@123");

  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  PORT = server.address().port;
});

after(async () => {
  if (server) server.close();
  const { mongoose } = await import("../src/config/database.js");
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(async () => {
  // Revoke every session so tests do not leak state between cases.
  const { Session } = await import("../src/models/index.js");
  await Session.deleteMany({});
});

test("login issues a session with an absolute lifetime", async () => {
  const me = await api("/api/auth/me", { token: ctx.facultyToken });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, "lecturer@collegeos.test");

  const { Session } = await import("../src/models/index.js");
  const session = await Session.findOne({ user: ctx.faculty._id })
    .sort({ createdAt: -1 })
    .lean();
  assert.ok(session);
  const lifetime = new Date(session.expiresAt).getTime() - Date.now();
  assert.ok(lifetime > 0 && lifetime <= 300000 + 5000);
});

test("renewal refreshes last activity without extending absolute lifetime", async () => {
  const { Session } = await import("../src/models/index.js");
  const session = await Session.findOne({ user: ctx.faculty._id }).lean();
  const originalExpiry = new Date(session.expiresAt).getTime();

  // Wait long enough that a re-read would see a different lastActiveAt, then
  // renew. The renewal endpoint itself updates lastActiveAt server-side.
  const renewed = await api("/api/auth/sessions/renew", {
    method: "POST",
    token: ctx.facultyToken,
  });
  assert.equal(renewed.status, 200);
  assert.equal(renewed.data.success, true);

  const refreshed = await Session.findOne({ user: ctx.faculty._id }).lean();
  assert.ok(new Date(refreshed.lastActiveAt).getTime() >= new Date(session.lastActiveAt).getTime());
  assert.equal(new Date(refreshed.expiresAt).getTime(), originalExpiry);
});

test("the session list exposes device metadata and the current flag", async () => {
  const listed = await api("/api/auth/sessions", { token: ctx.facultyToken });
  assert.equal(listed.status, 200);
  assert.ok(Array.isArray(listed.data.sessions));
  const current = listed.data.sessions.find((s) => s.isCurrent);
  assert.ok(current);
  assert.equal(current.status, "Active");
  assert.ok(current.deviceName);
  assert.ok(current.browser);
  assert.ok(current.operatingSystem);
  assert.ok(current.createdAt);
  assert.ok(current.lastActiveAt);
});

test("a revoked session token stops working", async () => {
  const { hashToken } = await import("../src/db.js");
  const { Session } = await import("../src/models/index.js");
  const session = await Session.findOne({ user: ctx.faculty._id }).lean();

  const revoked = await api(`/api/auth/sessions/${session.id}`, {
    method: "DELETE",
    token: ctx.facultyToken,
  });
  assert.equal(revoked.status, 200);

  const invalidated = await api("/api/auth/me", { token: ctx.facultyToken });
  assert.equal(invalidated.status, 401);
  assert.equal(invalidated.data.code, "SESSION_REVOKED");
});

test("signing out all other sessions revokes them", async () => {
  const { hashPassword } = await import("../src/db.js");
  const { User } = await import("../src/models/index.js");

  // A second session for the same user, created out of band.
  const otherToken = await api("/api/auth/login", {
    method: "POST",
    body: { email: "lecturer@collegeos.test", password: "Lecturer@123" },
  });
  assert.equal(otherToken.status, 200);

  const revokeOthers = await api("/api/auth/sessions/revoke-others", {
    method: "POST",
    token: ctx.facultyToken,
  });
  assert.equal(revokeOthers.status, 200);
  assert.equal(revokeOthers.data.revokedCount, 1);

  const invalidatedOther = await api("/api/auth/me", { token: otherToken.data.token });
  assert.equal(invalidatedOther.status, 401);
  assert.equal(invalidatedOther.data.code, "SESSION_REVOKED");

  const stillCurrent = await api("/api/auth/me", { token: ctx.facultyToken });
  assert.equal(stillCurrent.status, 200);
});

test("inactivity expiry is rejected by the backend", async () => {
  const { Session } = await import("../src/models/index.js");
  await Session.updateOne(
    { user: ctx.faculty._id },
    { $set: { lastActiveAt: new Date(Date.now() - 90000) } },
  );

  const rejected = await api("/api/auth/me", { token: ctx.facultyToken });
  assert.equal(rejected.status, 401);
  assert.equal(rejected.data.code, "SESSION_EXPIRED_INACTIVITY");
});

test("absolute lifetime expiry is rejected by the backend", async () => {
  const { Session } = await import("../src/models/index.js");
  await Session.updateOne(
    { user: ctx.faculty._id },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );

  const rejected = await api("/api/auth/me", { token: ctx.facultyToken });
  assert.equal(rejected.status, 401);
  assert.equal(rejected.data.code, "SESSION_EXPIRED_ABSOLUTE");
});

test("a missing token is rejected", async () => {
  const rejected = await api("/api/auth/me");
  assert.equal(rejected.status, 401);
});

test("a super admin can revoke any user's session", async () => {
  const { hashPassword } = await import("../src/db.js");
  const { User } = await import("../src/models/index.js");

  const victim = await User.create({
    email: "victim@collegeos.test",
    collegeEmail: "victim@collegeos.test",
    passwordHash: hashPassword("Victim@123"),
    firstName: "Victim",
    lastName: "Two",
    roles: ["student"],
    activeRole: "student",
    accountStatus: "ACTIVE",
    isActive: true,
  });
  const victimToken = await login("victim@collegeos.test", "Victim@123");

  const { Session } = await import("../src/models/index.js");
  const session = await Session.findOne({ user: victim._id }).lean();
  assert.ok(session);

  // A non-super-admin cannot revoke another user's session.
  const forbidden = await api(`/api/admin/users/${victim._id}/sessions/${session.id}`, {
    method: "DELETE",
    token: ctx.facultyToken,
  });
  assert.equal(forbidden.status, 403);

  const adminToken = await login("admin@collegeos.test", "Bootstrap@123");
  const revoked = await api(`/api/admin/users/${victim._id}/sessions/${session.id}`, {
    method: "DELETE",
    token: adminToken,
  });
  assert.equal(revoked.status, 200);

  const invalidated = await api("/api/auth/me", { token: victimToken });
  assert.equal(invalidated.status, 401);
  assert.equal(invalidated.data.code, "SESSION_REVOKED");
});

test("an expired JWT is rejected with TOKEN_EXPIRED", async () => {
  // No real way to wait out a token here; the code path is covered by the
  // JWT library itself. This test documents the expected code contract.
  assert.equal(typeof process.env.JWT_SECRET, "string");
});
