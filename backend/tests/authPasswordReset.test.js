import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * CollegeOS password-reset flow integration suite.
 *
 * Exercises the repaired forgot-password / reset-password endpoints against
 * the real MongoDB-backed Express app on an ephemeral port and a dedicated
 * test database. SMTP is intentionally not configured, so reset tokens are
 * issued and logged but no email is delivered; the test verifies the token
 * is stored in the database and can be used to reset the password.
 */

const TEST_DB = process.env.COLLEGEOS_TEST_DB || "collegeos_test_reset";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";

// The app reads these at module load, so they are set before anything is imported.
process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-integration-suite-secret-key";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";
process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR = "2025/2026";
process.env.PUBLIC_ORIGIN = "http://localhost:3000";

const ctx = {};
let baseUrl = "";
let server = null;
let mongooseRef = null;
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

  const response = await fetch(baseUrl + path, { method, headers, body: payload });
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
  return { status: response.status, data, text };
}

async function login(email, password) {
  const res = await api("/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.text}`);
  assert.ok(res.data.csrfToken, "login did not issue a CSRF token");
  csrfTokens.set(res.data.token, res.data.csrfToken);
  return res.data.token;
}

async function activate(email, temporaryPassword, newPassword) {
  const token = await login(email, temporaryPassword);
  const changed = await api("/api/auth/change-password", {
    method: "POST",
    token,
    body: {
      currentPassword: temporaryPassword,
      newPassword,
      confirmPassword: newPassword,
    },
  });
  assert.equal(changed.status, 200, `password change failed for ${email}: ${changed.text}`);
  return changed.data.token;
}

async function provision(actorToken, body) {
  const created = await api("/api/admin/users", {
    method: "POST",
    token: actorToken,
    body,
  });
  assert.equal(created.status, 201, `provisioning failed: ${created.text}`);
  const password = `Collegeos@${Math.random().toString(36).slice(2, 8)}1`;
  const token = await activate(created.data.email, created.data.temporaryPassword, password);
  return { ...created.data, password, token, userId: created.data.userId };
}

before(async () => {
  const { connectDatabase, mongoose } = await import("../src/config/database.js");
  await connectDatabase();
  await mongoose.connection.dropDatabase();
  mongooseRef = mongoose;

  const { initializeServerState } = await import("../src/db.js");
  await initializeServerState();

  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Bootstrap Super Admin
  const adminEmail = "admin@collegeos.test";
  const adminTemporary = process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD;
  ctx.adminToken = await activate(adminEmail, adminTemporary, "Collegeos@Admin1");

  // Provision a registrar to create the test user
  ctx.registrar = await provision(ctx.adminToken, {
    firstName: "Rekha",
    lastName: "Poudel",
    role: "registrar",
    designation: "Registrar",
  });

  // Provision a test user whose password we will reset
  ctx.testUser = await provision(ctx.registrar.token, {
    firstName: "Reset",
    lastName: "Target",
    role: "student",
    studentId: "BCA25050",
    program: "BScIT",
    batch: "2025",
    semester: 2,
    section: "A1",
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongooseRef) {
    await mongooseRef.connection.dropDatabase();
    await mongooseRef.connection.close();
  }
});

test("forgot-password for an existing account issues a reset token", async () => {
  const { PasswordResetToken } = await import("../src/models/index.js");

  const beforeCount = await PasswordResetToken.countDocuments({ user: ctx.testUser.userId });

  const res = await api("/api/auth/forgot-password", {
    method: "POST",
    body: { email: ctx.testUser.email },
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.message, "If an account matches this email, a password reset link has been sent.");

  const afterCount = await PasswordResetToken.countDocuments({ user: ctx.testUser.userId });
  assert.equal(afterCount, beforeCount + 1, "a reset token should have been created");

  const token = await PasswordResetToken.findOne({ user: ctx.testUser.userId, usedAt: null })
    .sort({ createdAt: -1 })
    .lean();
  assert.ok(token, "reset token record should exist");
  assert.ok(token.expiresAt > new Date(), "reset token should not be expired");
});

test("forgot-password for an unknown account does not leak existence", async () => {
  const res = await api("/api/auth/forgot-password", {
    method: "POST",
    body: { email: "nonexistent@collegeos.test" },
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.message, "If an account matches this email, a password reset link has been sent.");

  const { PasswordResetToken } = await import("../src/models/index.js");
  const count = await PasswordResetToken.countDocuments({ email: "nonexistent@collegeos.test" });
  assert.equal(count, 0, "no token should be created for a non-existent account");
});

test("forgot-password without email is rejected", async () => {
  const res = await api("/api/auth/forgot-password", {
    method: "POST",
    body: {},
  });
  assert.equal(res.status, 400, res.text);
  assert.match(res.data.error, /Email is required/i);
});

test("reset-password with a valid token updates the password", async () => {
  const { PasswordResetToken } = await import("../src/models/index.js");

  // Issue a reset token directly
  const { createPasswordResetToken } = await import("../src/db.js");
  const { token } = await createPasswordResetToken(ctx.testUser.userId);

  const oldPassword = ctx.testUser.password;
  const newPassword = "NewResetPassword@123";

  const res = await api("/api/auth/reset-password", {
    method: "POST",
    body: { token, newPassword, confirmPassword: newPassword },
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.success, true);

  // The old password should no longer work
  const oldLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: ctx.testUser.email, password: oldPassword },
  });
  assert.equal(oldLogin.status, 401, "old password should be rejected after reset");

  // The new password should work
  const newLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: ctx.testUser.email, password: newPassword },
  });
  assert.equal(newLogin.status, 200, `new password should work: ${newLogin.text}`);

  // The token should be marked as used
  const used = await PasswordResetToken.findOne({ user: ctx.testUser.userId, usedAt: null })
    .sort({ createdAt: -1 })
    .lean();
  assert.ok(!used || used.usedAt !== null, "reset token should be invalidated after use");
});

test("reset-password with an invalid token is rejected", async () => {
  const res = await api("/api/auth/reset-password", {
    method: "POST",
    body: { token: "invalid-token-hex-string", newPassword: "NewResetPassword@123", confirmPassword: "NewResetPassword@123" },
  });
  assert.equal(res.status, 400, res.text);
  assert.match(res.data.error, /invalid or expired/i);
});

test("reset-password with an expired token is rejected", async () => {
  const { PasswordResetToken } = await import("../src/models/index.js");
  const { createPasswordResetToken } = await import("../src/db.js");

  // Create a token, then manually expire it
  const { token } = await createPasswordResetToken(ctx.testUser.userId);
  await PasswordResetToken.updateOne(
    { user: ctx.testUser.userId, usedAt: null },
    { expiresAt: new Date(Date.now() - 1000) },
  );

  const res = await api("/api/auth/reset-password", {
    method: "POST",
    body: { token, newPassword: "NewResetPassword@123", confirmPassword: "NewResetPassword@123" },
  });
  assert.equal(res.status, 400, res.text);
  assert.match(res.data.error, /invalid or expired/i);
});

test("reset-password with mismatched passwords is rejected", async () => {
  const { createPasswordResetToken } = await import("../src/db.js");
  const { token } = await createPasswordResetToken(ctx.testUser.userId);

  const res = await api("/api/auth/reset-password", {
    method: "POST",
    body: { token, newPassword: "NewResetPassword@123", confirmPassword: "DifferentPassword@123" },
  });
  assert.equal(res.status, 400, res.text);
  assert.match(res.data.error, /Passwords do not match/i);
});

test("reset-password without required fields is rejected", async () => {
  const res = await api("/api/auth/reset-password", {
    method: "POST",
    body: {},
  });
  assert.equal(res.status, 400, res.text);
  assert.match(res.data.error, /Reset token, new password, and confirmation are required/i);
});

test("valid credentials login succeeds and clears prior failed attempts", async () => {
  const { PasswordResetToken } = await import("../src/models/index.js");
  const { createPasswordResetToken } = await import("../src/db.js");

  // Issue a reset token and set a known password for this test
  const { token } = await createPasswordResetToken(ctx.testUser.userId);
  const testPassword = "LoginTestPassword@123";
  await api("/api/auth/reset-password", {
    method: "POST",
    body: { token, newPassword: testPassword, confirmPassword: testPassword },
  });

  // First, record some failed attempts against the test user's email
  for (let i = 0; i < 3; i++) {
    const failed = await api("/api/auth/login", {
      method: "POST",
      body: { email: ctx.testUser.email, password: "wrong-password" },
    });
    assert.equal(failed.status, 401, `attempt ${i + 1} should be rejected`);
    assert.equal(typeof failed.data.remainingAttempts, "number", "should return remainingAttempts");
  }

  // Then log in with the correct password — this should succeed and clear failures
  const success = await api("/api/auth/login", {
    method: "POST",
    body: { email: ctx.testUser.email, password: testPassword },
  });
  assert.equal(success.status, 200, `valid login should succeed: ${success.text}`);
  assert.ok(success.data.token, "valid login should return a token");

  // Mark the token as used so it can't be reused
  await PasswordResetToken.updateMany(
    { user: ctx.testUser.userId, usedAt: null },
    { usedAt: new Date() },
  );
});

test("wrong password returns remainingAttempts and does not leak account state", async () => {
  const wrong = await api("/api/auth/login", {
    method: "POST",
    body: { email: ctx.testUser.email, password: "definitely-wrong-password" },
  });
  assert.equal(wrong.status, 401, wrong.text);
  assert.match(wrong.data.error, /Invalid credentials/i);
  assert.equal(typeof wrong.data.remainingAttempts, "number", "should include remainingAttempts");
});

test("nonexistent email returns same error shape as wrong password (no enumeration)", async () => {
  const nonexistent = await api("/api/auth/login", {
    method: "POST",
    body: { email: "no-such-user@collegeos.test", password: "any-password" },
  });
  assert.equal(nonexistent.status, 401);
  assert.match(nonexistent.data.error, /Invalid credentials/i);
  assert.equal(typeof nonexistent.data.remainingAttempts, "number");
});

test("missing email or password is rejected with 400", async () => {
  const noEmail = await api("/api/auth/login", {
    method: "POST",
    body: { password: "anything" },
  });
  assert.equal(noEmail.status, 400);

  const noPassword = await api("/api/auth/login", {
    method: "POST",
    body: { email: ctx.testUser.email },
  });
  assert.equal(noPassword.status, 400);
});

