import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Architecture & security verification suite.
 *
 * Exercises the refactored seams end-to-end against the real MongoDB-backed
 * app on an ephemeral port:
 *   - centralized route registration (health, documents, examinations)
 *   - server-side authentication on protected domains
 *   - backend RBAC on the AI surface (frontend role checks are not a boundary)
 *   - asynchronous AI job execution and status tracking
 *   - database/identity decoupling (facade + connection health)
 */

const TEST_DB = process.env.COLLEGEOS_TEST_DB || "collegeos_arch_test";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";

process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-architecture-suite-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.arch.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";

let baseUrl = "";
let server = null;
let mongooseRef = null;
let stopWorker = null;
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
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (data && data.csrfToken && data.token) {
    csrfTokens.set(data.token, data.csrfToken);
  }
  return { status: response.status, data, text };
}

async function createActiveUser({ email, password, roles, activeRole }) {
  const { User } = await import("../src/models/User.js");
  const { hashPassword } = await import("../src/utils/password.js");
  await User.create({
    email,
    collegeEmail: email,
    passwordHash: hashPassword(password),
    firstName: "Test",
    lastName: "User",
    roles,
    activeRole,
    isActive: true,
    mustChangePassword: false,
    accountStatus: "ACTIVE",
    passwordStatus: "PERMANENT",
  });
}

async function login(email, password) {
  const res = await api("/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.text}`);
  return res.data.token;
}

before(async () => {
  const { connectDatabase, mongoose } = await import("../src/config/database.js");
  await connectDatabase();
  await mongoose.connection.dropDatabase();
  mongooseRef = mongoose;

  const { initializeServerState } = await import("../src/db.js");
  await initializeServerState();

  const { startAIJobWorker } = await import("../src/services/ai/aiJobService.js");
  startAIJobWorker({ pollIntervalMs: 50 });
  stopWorker = async () => {
    const { stopAIJobWorker } = await import("../src/services/ai/aiJobService.js");
    await stopAIJobWorker();
  };

  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await createActiveUser({
    email: "student@collegeos.arch.test",
    password: "Student@123",
    roles: ["student"],
    activeRole: "student",
  });
  await createActiveUser({
    email: "admin2@collegeos.arch.test",
    password: "Admin@123",
    roles: ["super_admin"],
    activeRole: "super_admin",
  });
});

after(async () => {
  if (stopWorker) await stopWorker();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongooseRef) {
    await mongooseRef.connection.dropDatabase();
    await mongooseRef.connection.close();
  }
});

test("centralized route registry serves health and protected domains", async () => {
  const health = await api("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);
  assert.equal(health.data.database.ok, true);

  const anonymousDocuments = await api("/api/documents");
  assert.equal(anonymousDocuments.status, 401);
  const anonymousExams = await api("/api/exams");
  assert.equal(anonymousExams.status, 401);
});

test("backend RBAC rejects a student on finance AI and allows a super admin", async () => {
  const studentToken = await login("student@collegeos.arch.test", "Student@123");
  const adminToken = await login("admin2@collegeos.arch.test", "Admin@123");

  const denied = await api("/api/ai/finance/analytics", { token: studentToken });
  assert.equal(denied.status, 403);

  const allowed = await api("/api/ai/finance/analytics", { token: adminToken });
  assert.equal(allowed.status, 200);
});

test("AI jobs execute asynchronously with status tracking and idempotency", async () => {
  const adminToken = await login("admin2@collegeos.arch.test", "Admin@123");

  const first = await api("/api/ai/jobs", {
    method: "POST",
    token: adminToken,
    body: { kind: "anomalies.scan", idempotencyKey: "arch-test-scan" },
  });
  assert.equal(first.status, 202);
  assert.ok(first.data.job._id);
  assert.equal(first.data.job.status, "QUEUED");

  // Same idempotency key returns the same job instead of enqueueing twice.
  const duplicate = await api("/api/ai/jobs", {
    method: "POST",
    token: adminToken,
    body: { kind: "anomalies.scan", idempotencyKey: "arch-test-scan" },
  });
  assert.equal(duplicate.data.reused, true);
  assert.equal(duplicate.data.job._id, first.data.job._id);

  let job = first.data.job;
  for (let attempt = 0; attempt < 100 && job.status !== "COMPLETED" && job.status !== "FAILED"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const poll = await api(`/api/ai/jobs/${first.data.job._id}`, { token: adminToken });
    assert.equal(poll.status, 200);
    job = poll.data.job;
  }
  assert.equal(job.status, "COMPLETED");
  assert.ok(Array.isArray(job.result));
});

test("database layer is decoupled from identity and exposes health", async () => {
  const db = await import("../src/db.js");
  assert.equal(typeof db.getUserRoles, "function");
  assert.equal(typeof db.getAnalyticsSummary, "function");
  assert.deepEqual(db.getUserRoles({ roles: ["institution_admin"] }), ["super_admin"]);

  const summary = await db.getAnalyticsSummary();
  assert.ok(summary.totalUsers >= 1);
});