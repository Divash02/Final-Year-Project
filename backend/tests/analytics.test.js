import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const TEST_DB = "collegeos_analytics_test";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";

process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-analytics-integration-secret-key-2026";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";

let baseUrl = "";
let server = null;
let mongooseRef = null;
let adminToken = "";

async function api(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

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
  return { status: response.status, data, text };
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

  const { User } = await import("../src/models/index.js");
  await User.updateOne({ email: "admin@collegeos.test" }, { mustChangePassword: false });

  const res = await api("/api/auth/login", {
    method: "POST",
    body: { email: "admin@collegeos.test", password: "Bootstrap@123" },
  });
  assert.equal(res.status, 200, `login failed: ${res.text}`);
  adminToken = res.data.token;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (mongooseRef) {
    await mongooseRef.connection.dropDatabase();
    await mongooseRef.disconnect();
  }
});

test("GET /api/analytics/detailed enforces auth and returns structured institutional data", async () => {
  // Unauth request
  const unauth = await api("/api/analytics/detailed");
  assert.equal(unauth.status, 401);

  // Authenticated admin request
  const res = await api("/api/analytics/detailed", { token: adminToken });
  assert.equal(res.status, 200, `analytics detailed failed: ${res.text}`);
  assert.ok(res.data.kpis, "kpis present");
  assert.ok(typeof res.data.kpis.totalUsers === "number");
  assert.ok(res.data.academic, "academic present");
  assert.ok(res.data.attendance, "attendance present");
  assert.ok(res.data.assignments, "assignments present");
  assert.ok(res.data.examination, "examination present");
  assert.ok(res.data.finance, "finance present");
  assert.ok(Array.isArray(res.data.insights), "insights present");
});

test("GET /api/audit/analytics returns forensic activity metrics and paginated records", async () => {
  const { AuditLog, User } = await import("../src/models/index.js");
  const admin = await User.findOne({ roles: "super_admin" });

  await AuditLog.create({
    user: admin._id,
    action: "ANALYTICS_TEST_LOG",
    module: "reporting",
    details: "Verification audit event for institutional analytics",
    ipAddress: "127.0.0.1",
  });

  const res = await api("/api/audit/analytics?page=1&limit=10", { token: adminToken });
  assert.equal(res.status, 200, `audit analytics failed: ${res.text}`);
  assert.ok(res.data.kpis, "kpis present");
  assert.ok(res.data.kpis.totalEvents >= 1);
  assert.ok(Array.isArray(res.data.byModule), "byModule present");
  assert.ok(Array.isArray(res.data.byAction), "byAction present");
  assert.ok(Array.isArray(res.data.logs), "logs present");
  assert.equal(res.data.pagination.page, 1);
});
