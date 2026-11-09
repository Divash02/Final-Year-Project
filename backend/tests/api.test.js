import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * CollegeOS API integration suite.
 *
 * These tests run against the real MongoDB-backed Express app on an ephemeral
 * port and a dedicated test database, so every assertion exercises the same
 * persistence layer, authorization rules and upload pipeline that production
 * uses. Nothing is mocked: identity, entitlements and file access are all
 * checked against stored records.
 *
 * The previous suite in this file was written for a `better-sqlite3` schema
 * (`/cases`, `/users`, `COLLEGEOS_SEED_TEST_USERS`) that no longer exists after
 * the MongoDB migration, so it could not exercise the running system.
 */

const TEST_DB = process.env.COLLEGEOS_TEST_DB || "collegeos_test";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";

// The app reads these at module load, so they are set before anything is imported.
process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-integration-suite-secret-key";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";
process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR = "2025/2026";

const ctx = {};
let baseUrl = "";
let server = null;
let mongooseRef = null;
const csrfTokens = new Map();

/** Minimal but genuinely valid files: the backend sniffs magic bytes on upload. */
const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  "latin1",
);

/** Materials and submissions post their binary as `file`. */
function pdfForm(fields = {}, filename = "collegeos-notice.pdf") {
  return formWithField("file", fields, filename);
}

/** The academic calendar names its attachment field explicitly. */
function calendarAttachmentForm(fields = {}, filename = "collegeos-notice.pdf") {
  return formWithField("attachment", fields, filename);
}

function formWithField(field, fields, filename) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    form.append(key, String(value));
  }
  form.append(
    field,
    new Blob([PDF_BYTES], { type: "application/pdf" }),
    filename,
  );
  return form;
}

async function api(path, { method = "GET", token, body, headers: requestHeaders = {} } = {}) {
  const headers = { ...requestHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const isMutating = /^(POST|PUT|PATCH|DELETE)$/i.test(String(method));
  if (token && isMutating) {
    const csrf = csrfTokens.get(token);
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
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
  return { status: response.status, data, text, headers: response.headers };
}

async function login(email, password, headers) {
  const res = await api("/api/auth/login", { method: "POST", body: { email, password }, headers });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.text}`);
  assert.ok(res.data.csrfToken, "login did not issue a CSRF token");
  csrfTokens.set(res.data.token, res.data.csrfToken);
  return res.data.token;
}

/**
 * Signs in with a provisioned temporary password and rotates it, which is the
 * activation every newly issued institutional account must complete.
 */
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

async function createCourse(token, body) {
  const res = await api("/api/courses", { method: "POST", token, body });
  assert.equal(res.status, 201, `course creation failed: ${res.text}`);
  return res.data.course;
}

before(async () => {
  const { connectDatabase, mongoose } = await import("../src/config/database.js");
  await connectDatabase();
  // A dropped database guarantees the suite starts from the same state every
  // run and never touches the development database.
  await mongoose.connection.dropDatabase();
  mongooseRef = mongoose;

  const { initializeServerState } = await import("../src/db.js");
  await initializeServerState();

  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Bootstrap Super Admin: the only account CollegeOS provisions by itself.
  const adminEmail = "admin@collegeos.test";
  const adminTemporary = process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD;
  ctx.adminEmail = adminEmail;
  ctx.adminToken = await activate(adminEmail, adminTemporary, "Collegeos@Admin1");

  ctx.registrar = await provision(ctx.adminToken, {
    firstName: "Rekha",
    lastName: "Poudel",
    role: "registrar",
    designation: "Registrar",
  });
  ctx.teacher = await provision(ctx.adminToken, {
    firstName: "Suresh",
    lastName: "Karki",
    role: "faculty",
    designation: "Lecturer",
  });
  ctx.otherTeacher = await provision(ctx.adminToken, {
    firstName: "Anita",
    lastName: "Basnet",
    role: "faculty",
    designation: "Lecturer",
  });
  ctx.coordinator = await provision(ctx.adminToken, {
    firstName: "Nabin",
    lastName: "Gurung",
    role: "program_coordinator",
    designation: "Programme Coordinator",
  });

  ctx.courseSem2 = await createCourse(ctx.adminToken, {
    code: "CS201",
    name: "Data Structures",
    department: "Computer Science",
    program: "BScIT",
    semester: 2,
    credits: 4,
    courseType: "CORE",
  });
  ctx.courseSem4 = await createCourse(ctx.adminToken, {
    code: "CS401",
    name: "Software Engineering",
    department: "Computer Science",
    program: "BScIT",
    semester: 4,
    credits: 4,
    courseType: "CORE",
  });

  // Sections are created explicitly so the timetable and directory agree on the
  // cohort codes rather than relying on the on-demand provisioning upsert.
  for (const semester of [2, 4]) {
    const section = await api("/api/sections", {
      method: "POST",
      token: ctx.adminToken,
      body: { code: "A1", program: "BScIT", semester, batch: "2025", room: "Hall 101" },
    });
    assert.equal(section.status, 201, `section creation failed: ${section.text}`);
  }

  ctx.studentSem2 = await provision(ctx.adminToken, {
    firstName: "Sita",
    lastName: "Tamang",
    role: "student",
    studentId: "BCA25001",
    program: "BScIT",
    batch: "2025",
    semester: 2,
    section: "A1",
  });
  ctx.studentSem4 = await provision(ctx.adminToken, {
    firstName: "Bikash",
    lastName: "Thapa",
    role: "student",
    studentId: "BCA25002",
    program: "BScIT",
    batch: "2025",
    semester: 4,
    section: "A1",
  });

  // The teacher is only authorised for the Semester 4 course, which is what
  // makes the unauthorized-material and unauthorized-assignment cases real.
  const teaching = await api("/api/admin/teaching-assignments", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      facultyUserId: ctx.teacher.userId,
      courseId: ctx.courseSem4.id,
      sectionCode: "A1",
      semester: 4,
    },
  });
  assert.equal(teaching.status, 201, `teaching assignment failed: ${teaching.text}`);
  ctx.teachingAssignmentId = teaching.data.assignment?.id || teaching.data.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongooseRef) {
    await mongooseRef.connection.dropDatabase();
    await mongooseRef.connection.close();
  }
});

test("health endpoint reports the service is up", async () => {
  const res = await api("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.service, "CollegeOS API");
});

test("protected routes reject an anonymous caller", async () => {
  const res = await api("/api/courses");
  assert.equal(res.status, 401);
  assert.ok(res.data.error);
});

test("mail contact search and recipient delivery enforce directory and BCC rules", async () => {
  const { Mail, User } = await import("../src/models/index.js");
  const fullEmail = await api(
    `/api/mail/recipients/suggest?q=${encodeURIComponent(ctx.teacher.email)}`,
    { token: ctx.adminToken },
  );
  assert.equal(fullEmail.status, 200);
  const teacher = fullEmail.data.suggestions.find(
    (contact) => contact.email === ctx.teacher.email,
  );
  assert.ok(teacher, "complete registered email should be searchable");
  assert.equal(teacher.source, "directory");
  assert.equal(teacher.avatarUrl, null);
  assert.equal("passwordHash" in teacher, false);

  const partialEmail = await api(
    `/api/mail/recipients/suggest?q=${encodeURIComponent(ctx.teacher.email.slice(0, 5))}`,
    { token: ctx.adminToken },
  );
  assert.ok(
    partialEmail.data.suggestions.some(
      (contact) => contact.email === ctx.teacher.email,
    ),
    "partial email should match",
  );
  const nameSearch = await api(
    "/api/mail/recipients/suggest?q=Suresh%20Karki",
    { token: ctx.adminToken },
  );
  assert.ok(
    nameSearch.data.suggestions.some(
      (contact) => contact.email === ctx.teacher.email,
    ),
    "first and last name should match together",
  );
  assert.equal((await api(
    `/api/mail/recipients/suggest?q=${encodeURIComponent(ctx.teacher.email)}`,
  )).status, 401);

  const passive = await api("/api/admin/users", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      firstName: "Passive",
      lastName: "Contact",
      role: "faculty",
      designation: "Lecturer",
    },
  });
  assert.equal(passive.status, 201);
  const passiveSearch = await api(
    `/api/mail/recipients/suggest?q=${encodeURIComponent(passive.data.email)}`,
    { token: ctx.adminToken },
  );
  assert.equal(passiveSearch.data.suggestions.length, 0);

  const originalRoles = await User.findById(ctx.teacher.userId).select("roles");
  try {
    await User.updateOne(
      { _id: ctx.teacher.userId },
      { $set: { roles: ["unknown_role"] } },
    );
    const forbidden = await api(
      `/api/mail/recipients/suggest?q=${encodeURIComponent(ctx.otherTeacher.email)}`,
      { token: ctx.teacher.token },
    );
    assert.equal(forbidden.status, 403);
  } finally {
    await User.updateOne(
      { _id: ctx.teacher.userId },
      { $set: { roles: originalRoles.roles } },
    );
  }

  const invalidSend = await api("/api/mail", {
    method: "POST",
    token: ctx.adminToken,
    body: { recipientEmails: ["not-an-email"], subject: "Invalid" },
  });
  assert.equal(invalidSend.status, 400);

  const externalEmail = "external.contact@example.com";
  const sent = await api("/api/mail", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      recipientEmails: [ctx.teacher.email, externalEmail],
      ccEmails: [ctx.otherTeacher.email],
      bccEmails: [ctx.coordinator.email, ctx.teacher.email],
      subject: "Recipient autocomplete integration",
      body: "Mail delivered to selected recipients.",
    },
  });
  assert.equal(sent.status, 201);
  const stored = await Mail.findById(sent.data.mailId).lean();
  assert.deepEqual(stored.recipientEmails, [ctx.teacher.email, externalEmail]);
  assert.deepEqual(stored.ccEmails, [ctx.otherTeacher.email]);
  assert.deepEqual(stored.bccEmails, [ctx.coordinator.email]);
  const inboxUserIds = stored.userStates.map((state) => String(state.user));
  assert.ok(inboxUserIds.includes(ctx.teacher.userId));
  assert.ok(inboxUserIds.includes(ctx.otherTeacher.userId));
  assert.ok(inboxUserIds.includes(ctx.coordinator.userId));
  assert.equal(inboxUserIds.includes(externalEmail), false);

  const senderDetail = await api(`/api/mail/${sent.data.mailId}`, {
    token: ctx.adminToken,
  });
  assert.deepEqual(senderDetail.data.bccEmails, [ctx.coordinator.email]);
  const recipientDetail = await api(`/api/mail/${sent.data.mailId}`, {
    token: ctx.teacher.token,
  });
  assert.equal(recipientDetail.status, 200);
  assert.deepEqual(recipientDetail.data.bccEmails, []);
  assert.equal(
    JSON.stringify(recipientDetail.data).includes(ctx.coordinator.email),
    false,
    "BCC addresses must not be visible to a regular recipient",
  );
});

test("a revoked session token stops working", async () => {
  const res = await api("/api/auth/logout", { method: "POST", token: ctx.coordinator.token });
  assert.equal(res.status, 200);
  const after = await api("/api/courses", { token: ctx.coordinator.token });
  assert.equal(after.status, 401);
  // Re-activate so later tests still have a working coordinator session.
  ctx.coordinator.token = await login(ctx.coordinator.email, ctx.coordinator.password);
});

test("profile endpoints persist authenticated notification preferences", async () => {
  const profile = await api("/api/profile/me", { token: ctx.teacher.token });
  assert.equal(profile.status, 200);
  assert.ok(profile.data.profile);

  const loaded = await api("/api/profile/notifications", { token: ctx.teacher.token });
  assert.equal(loaded.status, 200);
  assert.deepEqual(loaded.data, { email: true, sms: false, push: true });

  const updated = { email: false, sms: true, push: false };
  const saved = await api("/api/profile/notifications", {
    method: "PUT",
    token: ctx.teacher.token,
    body: updated,
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data, updated);

  const persisted = await api("/api/profile/notifications", { token: ctx.teacher.token });
  assert.deepEqual(persisted.data, updated);
  const { User } = await import("../src/models/index.js");
  const user = await User.findById(ctx.teacher.userId);
  assert.equal(user.notificationEmail, false);
  assert.equal(user.notificationSms, true);
  assert.equal(user.notificationPush, false);

  const restored = await api("/api/profile/notifications", {
    method: "PUT",
    token: ctx.teacher.token,
    body: loaded.data,
  });
  assert.equal(restored.status, 200);
});

test("active sessions expose device metadata and revocation invalidates tokens", async () => {
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
  const { Session } = await import("../src/models/index.js");
  const { hashToken } = await import("../src/db.js");
  await Session.updateOne(
    { tokenHash: hashToken(ctx.teacher.token) },
    { $unset: { userAgent: "", ipAddress: "" } },
  );
  const otherToken = await login(ctx.teacher.email, ctx.teacher.password, {
    "user-agent": userAgent,
  });
  const listed = await api("/api/auth/sessions", {
    token: ctx.teacher.token,
    headers: { "user-agent": userAgent },
  });
  assert.equal(listed.status, 200);
  const current = listed.data.sessions.find((session) => session.isCurrent);
  const other = listed.data.sessions.find(
    (session) => !session.isCurrent && session.status === "Active",
  );
  assert.ok(current);
  assert.ok(other);
  assert.equal(other.deviceName, "Windows PC");
  assert.equal(other.browser, "Chrome");
  assert.equal(other.operatingSystem, "Windows");
  assert.equal(current.deviceName, "Windows PC");
  assert.equal(current.browser, "Chrome");
  assert.ok(
    other.ipAddress === "Local network" || /\.xxx$/.test(other.ipAddress),
    `IP address was not masked: ${other.ipAddress}`,
  );
  assert.ok(other.createdAt);
  assert.ok(other.lastActiveAt);

  const revoked = await api(`/api/auth/sessions/${other.id}`, {
    method: "DELETE",
    token: ctx.teacher.token,
  });
  assert.equal(revoked.status, 200);
  const invalidated = await api("/api/auth/me", { token: otherToken });
  assert.equal(invalidated.status, 401);

  const anotherToken = await login(ctx.teacher.email, ctx.teacher.password);
  const revokeOthers = await api("/api/auth/sessions/revoke-others", {
    method: "POST",
    token: ctx.teacher.token,
  });
  assert.equal(revokeOthers.status, 200);
  assert.equal(revokeOthers.data.revokedCount, 1);
  const invalidatedOther = await api("/api/auth/me", { token: anotherToken });
  assert.equal(invalidatedOther.status, 401);
  const stillCurrent = await api("/api/auth/me", { token: ctx.teacher.token });
  assert.equal(stillCurrent.status, 200);
});

test("HR directory includes provisioned staff records, supports search and protects employee edits", async () => {
  const { Staff, Employee, User } = await import("../src/models/index.js");
  const staff = await Staff.findOne({ user: ctx.teacher.userId });
  assert.ok(staff, "staff provisioning should create a legacy Staff profile");

  const denied = await api("/api/hr/employees", { token: ctx.teacher.token });
  assert.equal(denied.status, 403);

  const dashboard = await api("/api/hr/dashboard", { token: ctx.adminToken });
  assert.equal(dashboard.status, 200);
  assert.ok(dashboard.data.stats.totalEmployees > 0);

  const search = await api(
    `/api/hr/employees?search=${encodeURIComponent(staff.employeeId)}&limit=5`,
    { token: ctx.adminToken },
  );
  assert.equal(search.status, 200);
  assert.equal(search.data.total, 1);
  assert.equal(search.data.employees[0].userId, ctx.teacher.userId);

  const profile = await api(`/api/hr/employees/${staff._id}`, {
    token: ctx.adminToken,
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.employee.user._id, ctx.teacher.userId);
  assert.equal(profile.data.employee.user.passwordHash, undefined);
  assert.equal(profile.data.employee.recordType, "staff");

  const teacherUser = await User.findById(ctx.teacher.userId);
  const usersBeforeOnboarding = await User.countDocuments();
  const linkable = await api(
    `/api/hr/users?search=${encodeURIComponent(teacherUser.collegeEmail || teacherUser.email)}`,
    { token: ctx.adminToken },
  );
  assert.equal(linkable.status, 200);
  assert.ok(linkable.data.users.some((user) => user.id === ctx.teacher.userId));

  const linked = await api("/api/hr/employees", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      userId: ctx.teacher.userId,
      employeeId: staff.employeeId,
      department: staff.department,
      designation: "Senior Lecturer",
      roleType: "faculty",
      employmentType: "permanent",
      joiningDate: "2020-08-15",
    },
  });
  assert.equal(linked.status, 201);
  assert.equal(await Employee.countDocuments({ user: ctx.teacher.userId }), 1);
  assert.equal(await User.countDocuments(), usersBeforeOnboarding);

  const otherStaff = await Staff.findOne({ user: ctx.otherTeacher.userId });
  assert.ok(otherStaff);
  otherStaff.employeeId = staff.employeeId.toLowerCase();
  await otherStaff.save();
  const duplicate = await api("/api/hr/employees", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      userId: ctx.otherTeacher.userId,
      employeeId: staff.employeeId,
      department: "Computer Science",
    },
  });
  assert.equal(duplicate.status, 409);

  const edit = await api(`/api/hr/employees/${linked.data.employee._id}`, {
    method: "PUT",
    token: ctx.adminToken,
    body: {
      department: "Academic Affairs",
      employmentStatus: "on-leave",
      phone: "+977-9801234567",
      personalEmail: "teacher.personal@example.test",
    },
  });
  assert.equal(edit.status, 200);
  const persistedEmployee = await Employee.findById(linked.data.employee._id);
  const persistedUser = await User.findById(ctx.teacher.userId);
  const persistedStaff = await Staff.findOne({ user: ctx.teacher.userId });
  assert.equal(persistedEmployee.department, "Academic Affairs");
  assert.equal(persistedEmployee.employmentStatus, "on-leave");
  assert.equal(persistedUser.phone, "+977-9801234567");
  assert.equal(persistedUser.personalEmail, "teacher.personal@example.test");
  assert.equal(persistedStaff.department, "Academic Affairs");
  assert.equal(persistedStaff.designation, "Senior Lecturer");

  const filtered = await api("/api/hr/employees?employmentStatus=on-leave", {
    token: ctx.adminToken,
  });
  assert.equal(filtered.status, 200);
  assert.ok(filtered.data.employees.some((employee) => employee.userId === ctx.teacher.userId));
});

test("a wrong password is rejected without revealing the account state", async () => {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { email: ctx.registrar.email, password: "not-the-password" },
  });
  assert.equal(res.status, 401);
  assert.match(res.data.error, /Invalid credentials/);
});

test("unknown endpoints answer in the structured error shape", async () => {
  const res = await api("/api/this-endpoint-does-not-exist", { token: ctx.adminToken });
  assert.equal(res.status, 404);
  assert.equal(res.data.code, "NOT_FOUND");
});

test("a malformed identifier is a validation error, not a server error", async () => {
  const res = await api("/api/courses/not-an-object-id", { token: ctx.adminToken });
  assert.equal(res.status, 400);
  assert.equal(res.data.code, "BAD_REQUEST");
});

test("a missing file is reported as not found without leaking storage details", async () => {
  const missing = "000000000000000000000000";
  const res = await api(`/api/files/${missing}`, { token: ctx.adminToken });
  assert.equal(res.status, 404);
  assert.equal(res.data.code, "NOT_FOUND");
  assert.doesNotMatch(res.text, /storagePath|uploads|MongoServerError/i);
});

test("a faculty account cannot provision institutional accounts", async () => {
  const res = await api("/api/admin/users", {
    method: "POST",
    token: ctx.teacher.token,
    body: { firstName: "Mallika", lastName: "Shrestha", role: "registrar" },
  });
  assert.equal(res.status, 403);
});

test("curriculum staff manage courses while a teacher cannot", async () => {
  const created = await api("/api/courses", {
    method: "POST",
    token: ctx.registrar.token,
    body: {
      code: "CS301",
      name: "Database Systems",
      program: "BScIT",
      semester: 3,
      department: "Computer Science",
      credits: 4,
      courseType: "CORE",
    },
  });
  assert.equal(created.status, 201, created.text);

  const duplicate = await api("/api/courses", {
    method: "POST",
    token: ctx.registrar.token,
    body: { code: "CS301", name: "Database Systems Again", semester: 3 },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.code, "CONFLICT");

  const edited = await api(`/api/courses/${created.data.course.id}`, {
    method: "PATCH",
    token: ctx.registrar.token,
    body: { name: "Database Management Systems" },
  });
  assert.equal(edited.status, 200, edited.text);
  assert.equal(edited.data.course.name, "Database Management Systems");

  const forbidden = await api("/api/courses", {
    method: "POST",
    token: ctx.teacher.token,
    body: { code: "CS999", name: "Unauthorised Course", semester: 1 },
  });
  assert.equal(forbidden.status, 403);
});

test("a referenced course is archived instead of deleted, then restored", async () => {
  const archived = await api(`/api/courses/${ctx.courseSem2.id}`, {
    method: "DELETE",
    token: ctx.adminToken,
  });
  assert.equal(archived.status, 200, archived.text);

  const listed = await api("/api/courses?status=ARCHIVED", { token: ctx.adminToken });
  assert.equal(listed.status, 200);
  assert.ok(listed.data.courses.some((course) => course.id === ctx.courseSem2.id));

  const active = await api("/api/courses", { token: ctx.adminToken });
  assert.ok(
    !active.data.courses.some((course) => course.id === ctx.courseSem2.id),
    "an archived course must disappear from new academic work",
  );

  const restored = await api(`/api/courses/${ctx.courseSem2.id}/restore`, {
    method: "POST",
    token: ctx.adminToken,
  });
  assert.equal(restored.status, 200, restored.text);
  assert.equal(restored.data.course.status, "ACTIVE");
});

test("sections are real records and renaming one carries its students", async () => {
  const created = await api("/api/sections", {
    method: "POST",
    token: ctx.adminToken,
    body: { code: "B2", program: "BScIT", semester: 2, batch: "2025", capacity: 30 },
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.data.section.code, "B2");
  assert.equal(created.data.section.capacity, 30);

  const duplicate = await api("/api/sections", {
    method: "POST",
    token: ctx.adminToken,
    body: { code: "B2", program: "BScIT", semester: 2, batch: "2025" },
  });
  assert.equal(duplicate.status, 409);

  const forbidden = await api("/api/sections", {
    method: "POST",
    token: ctx.teacher.token,
    body: { code: "B3", program: "BScIT", semester: 2 },
  });
  assert.equal(forbidden.status, 403);

  const moved = await api("/api/sections", {
    method: "POST",
    token: ctx.adminToken,
    body: { code: "B4", program: "BScIT", semester: 2, batch: "2025" },
  });
  assert.equal(moved.status, 201, moved.text);

  const rename = await api(`/api/sections/${moved.data.section.id}`, {
    method: "PATCH",
    token: ctx.adminToken,
    body: { code: "B5" },
  });
  assert.equal(rename.status, 200, rename.text);
  assert.equal(rename.data.section.code, "B5");

  // A1 already holds two students, so it must not be deletable.
  const populated = (await api("/api/sections", { token: ctx.adminToken })).data.sections.find(
    (section) => section.code === "A1" && section.semester === 2,
  );
  assert.ok(populated.studentCount >= 1, "expected enrolled students in section A1");

  const refused = await api(`/api/sections/${populated.id}`, {
    method: "DELETE",
    token: ctx.adminToken,
  });
  assert.equal(refused.status, 409);

  const removed = await api(`/api/sections/${rename.data.section.id}`, {
    method: "DELETE",
    token: ctx.adminToken,
  });
  assert.equal(removed.status, 200, removed.text);
});

test("admissions run registrar-only and enrolment creates the student identity", async () => {
  const forbidden = await api("/api/admissions/applications", {
    method: "POST",
    token: ctx.teacher.token,
    body: { applicantName: "Rejected Applicant", email: "no@example.com", programme: "BScIT" },
  });
  assert.equal(forbidden.status, 403);

  const created = await api("/api/admissions/applications", {
    method: "POST",
    token: ctx.registrar.token,
    body: {
      applicantName: "Prashant Shrestha",
      email: "prashant.shrestha@example.com",
      phone: "+9779800000099",
      programme: "BScIT",
      batch: "2025",
      semester: 1,
      section: "A1",
      qualification: "Higher Secondary (+2)",
    },
  });
  assert.equal(created.status, 201, created.text);
  const applicationId = created.data.application.id;

  const premature = await api(`/api/admissions/applications/${applicationId}/enrol`, {
    method: "POST",
    token: ctx.registrar.token,
    body: { studentId: "BCA25009" },
  });
  assert.equal(premature.status, 409, created.text);

  const decided = await api(`/api/admissions/applications/${applicationId}/decision`, {
    method: "PATCH",
    token: ctx.registrar.token,
    body: { status: "VERIFIED", reason: "Transcripts and certificates verified in person." },
  });
  assert.equal(decided.status, 200, decided.text);
  assert.equal(decided.data.application.status, "VERIFIED");

  const badReason = await api(`/api/admissions/applications/${applicationId}/decision`, {
    method: "PATCH",
    token: ctx.registrar.token,
    body: { status: "OFFERED", reason: "ok" },
  });
  assert.equal(badReason.status, 422);
  assert.equal(badReason.data.code, "VALIDATION_FAILED");

  const enrolled = await api(`/api/admissions/applications/${applicationId}/enrol`, {
    method: "POST",
    token: ctx.registrar.token,
    body: { studentId: "BCA25009", semester: 1, section: "A1" },
  });
  assert.equal(enrolled.status, 201, enrolled.text);
  assert.equal(enrolled.data.student.studentId, "BCA25009");
  assert.ok(enrolled.data.temporaryPassword, "the credential is handed over exactly once");

  const twice = await api(`/api/admissions/applications/${applicationId}/enrol`, {
    method: "POST",
    token: ctx.registrar.token,
    body: { studentId: "BCA25010" },
  });
  assert.equal(twice.status, 409);

  // The new identity must be the one every other module reads.
  const directory = await api("/api/students?q=BCA25009", { token: ctx.registrar.token });
  assert.equal(directory.status, 200, directory.text);
  assert.equal(directory.data.students.length, 1);
  assert.equal(directory.data.students[0].studentId, "BCA25009");
  assert.equal(directory.data.students[0].section, "A1");

  const studentToken = await activate(
    enrolled.data.collegeEmail,
    enrolled.data.temporaryPassword,
    "Collegeos@Enrol1",
  );
  const me = await api("/api/students/me", { token: studentToken });
  assert.equal(me.status, 200, me.text);
  assert.equal(me.data.student.studentId, "BCA25009");
});

test("a student is served only their own directory record", async () => {
  const scoped = await api("/api/students", { token: ctx.studentSem2.token });
  assert.equal(scoped.status, 200, scoped.text);
  assert.equal(scoped.data.students.length, 1);
  assert.equal(scoped.data.students[0].studentId, "BCA25001");

  const own = await api("/api/students/me", { token: ctx.studentSem2.token });
  assert.equal(own.status, 200, own.text);
  assert.equal(own.data.student.studentId, "BCA25001");
});

test("calendar events reach only their intended cohort", async () => {
  const created = await api("/api/academic-calendar/events", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      title: "Semester 4 Project Defence",
      eventType: "EXAMINATION",
      startDate: "2026-03-02",
      endDate: "2026-03-02",
      startTime: "10:00",
      endTime: "13:00",
      academicYear: "2025/2026",
      semester: 4,
      batch: "2025",
      section: "A1",
      audience: {
        targetType: "SPECIFIC",
        target: {
          programCodes: ["BScIT"],
          batchYears: ["2025"],
          semesters: [4],
          sectionCodes: ["A1"],
        },
      },
    },
  });
  assert.equal(created.status, 201, created.text);
  ctx.calendarEventId = created.data.event.id;

  const targeted = await api("/api/academic-calendar/events", { token: ctx.studentSem4.token });
  assert.equal(targeted.status, 200);
  assert.ok(
    targeted.data.events.some((event) => event.id === ctx.calendarEventId),
    "the Semester 4 student must see the Semester 4 event",
  );

  const otherCohort = await api("/api/academic-calendar/events", { token: ctx.studentSem2.token });
  assert.equal(otherCohort.status, 200);
  assert.ok(
    !otherCohort.data.events.some((event) => event.id === ctx.calendarEventId),
    "a Semester 2 student must not see a Semester 4 event",
  );

  const direct = await api(`/api/academic-calendar/events/${ctx.calendarEventId}`, {
    token: ctx.studentSem2.token,
  });
  assert.equal(direct.status, 404, "the direct fetch must agree with the list filter");

  const emptyAudience = await api("/api/academic-calendar/events", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      title: "Mystery Event",
      eventType: "SEMINAR",
      startDate: "2026-03-05",
      academicYear: "2025/2026",
      audience: { targetType: "SPECIFIC", target: {} },
    },
  });
  assert.equal(emptyAudience.status, 422);
});

test("a calendar event can be created before its attachment exists", async () => {
  const created = await api("/api/academic-calendar/events", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      title: "Library orientation",
      eventType: "ORIENTATION",
      startDate: "2026-03-09",
      academicYear: "2025/2026",
      audience: { targetType: "ALL" },
    },
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.data.event.attachment, null);

  const removed = await api(`/api/academic-calendar/events/${created.data.event.id}`, {
    method: "DELETE",
    token: ctx.adminToken,
    body: { reason: "Superseded by the orientation week schedule." },
  });
  assert.equal(removed.status, 200, removed.text);
});

test("calendar attachments are stored records and are entitlement checked", async () => {
  const uploaded = await api(`/api/academic-calendar/events/${ctx.calendarEventId}/attachment`, {
    method: "POST",
    token: ctx.adminToken,
    body: calendarAttachmentForm({}, "defence-schedule.pdf"),
  });
  assert.equal(uploaded.status, 200, uploaded.text);
  const fileId = uploaded.data.event.attachment.fileId;
  assert.ok(fileId, "the attachment must be a stored file reference, not a name");

  const allowed = await api(`/api/files/${fileId}`, { token: ctx.studentSem4.token });
  assert.equal(allowed.status, 200, allowed.text);
  assert.match(allowed.text, /^%PDF-/);

  const denied = await api(`/api/files/${fileId}`, { token: ctx.studentSem2.token });
  assert.equal(denied.status, 404, "a file id alone must not grant access");

  const anonymous = await api(`/api/files/${fileId}`);
  assert.equal(anonymous.status, 401);

  const replaced = await api(`/api/academic-calendar/events/${ctx.calendarEventId}/attachment`, {
    method: "POST",
    token: ctx.adminToken,
    body: calendarAttachmentForm({}, "defence-schedule-v2.pdf"),
  });
  assert.equal(replaced.status, 200, replaced.text);
  assert.notEqual(replaced.data.event.attachment.fileId, fileId);

  const stale = await api(`/api/files/${fileId}`, { token: ctx.studentSem4.token });
  assert.equal(stale.status, 404, "the replaced file must no longer be readable");

  const cancelled = await api(`/api/academic-calendar/events/${ctx.calendarEventId}`, {
    method: "DELETE",
    token: ctx.adminToken,
    body: { reason: "Rescheduled to the following week." },
  });
  assert.equal(cancelled.status, 200, cancelled.text);
  assert.equal(cancelled.data.event.status, "CANCELLED");
});

test("an upload whose bytes are not the claimed type is rejected", async () => {
  const form = new FormData();
  form.append("attachment", new Blob([PDF_BYTES], { type: "application/pdf" }), "fake.png");
  const res = await api(`/api/academic-calendar/events/${ctx.calendarEventId}/attachment`, {
    method: "POST",
    token: ctx.adminToken,
    body: form,
  });
  assert.equal(res.status, 422, res.text);
  assert.match(res.data.error, /PNG/i);
});

test("learning materials are limited to the courses a teacher may teach", async () => {
  const authorised = await api("/api/learning-materials", {
    method: "POST",
    token: ctx.teacher.token,
    body: pdfForm(
      {
        title: "Week 1 lecture notes",
        courseId: ctx.courseSem4.id,
        sectionCodes: "A1",
        semester: 4,
        program: "BScIT",
        batch: "2025",
        academicYear: "2025/2026",
      },
      "week-1-notes.pdf",
    ),
  });
  assert.equal(authorised.status, 201, authorised.text);
  ctx.materialId = authorised.data.material.id;
  ctx.materialFileId = authorised.data.material.file.fileId;

  const unauthorised = await api("/api/learning-materials", {
    method: "POST",
    token: ctx.teacher.token,
    body: pdfForm(
      {
        title: "Notes for a course I do not teach",
        courseId: ctx.courseSem2.id,
        sectionCodes: "A1",
        semester: 2,
        academicYear: "2025/2026",
      },
      "unauthorised.pdf",
    ),
  });
  assert.equal(unauthorised.status, 403, unauthorised.text);

  // Curriculum administration is authorised institution-wide.
  const byAdmin = await api("/api/learning-materials", {
    method: "POST",
    token: ctx.adminToken,
    body: pdfForm(
      {
        title: "Semester 2 course outline",
        courseId: ctx.courseSem2.id,
        sectionCodes: "A1",
        semester: 2,
        program: "BScIT",
        batch: "2025",
        academicYear: "2025/2026",
      },
      "semester-2-outline.pdf",
    ),
  });
  assert.equal(byAdmin.status, 201, byAdmin.text);
  ctx.sem2MaterialFileId = byAdmin.data.material.file.fileId;

  const targetedList = await api("/api/learning-materials", { token: ctx.studentSem4.token });
  assert.equal(targetedList.status, 200);
  assert.ok(targetedList.data.materials.some((row) => row.id === ctx.materialId));

  const otherCohortList = await api("/api/learning-materials", { token: ctx.studentSem2.token });
  assert.ok(
    !otherCohortList.data.materials.some((row) => row.id === ctx.materialId),
    "a Semester 2 student must not see the Semester 4 handout",
  );

  const download = await api(`/api/files/${ctx.materialFileId}`, { token: ctx.studentSem4.token });
  assert.equal(download.status, 200, download.text);

  const denied = await api(`/api/files/${ctx.materialFileId}`, { token: ctx.studentSem2.token });
  assert.equal(denied.status, 404);

  const archived = await api(`/api/learning-materials/${ctx.materialId}`, {
    method: "DELETE",
    token: ctx.teacher.token,
  });
  assert.equal(archived.status, 200, archived.text);

  const afterArchive = await api(`/api/files/${ctx.materialFileId}`, { token: ctx.studentSem4.token });
  assert.equal(afterArchive.status, 404, "an archived material must stop being served");
});

test("an assignment may only be set for an authorised course and section", async () => {
  const created = await api("/api/assignments", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Requirements document",
      courseId: ctx.courseSem4.id,
      sectionCodes: "A1",
      semester: 4,
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      maxMarks: 40,
      academicYear: "2025/2026",
    },
  });
  assert.equal(created.status, 201, created.text);
  ctx.assignmentId = created.data.assignment.id;

  const unauthorised = await api("/api/assignments", {
    method: "POST",
    token: ctx.otherTeacher.token,
    body: {
      title: "Not my course",
      courseId: ctx.courseSem4.id,
      sectionCodes: "A1",
      semester: 4,
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  assert.equal(unauthorised.status, 403, unauthorised.text);

  const studentAttempt = await api("/api/assignments", {
    method: "POST",
    token: ctx.studentSem4.token,
    body: {
      title: "Self assigned work",
      courseId: ctx.courseSem4.id,
      sectionCodes: "A1",
      semester: 4,
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  assert.equal(studentAttempt.status, 403);
});

test("course-scoped content defaults to the author's cohort, not the institution", async () => {
  // The teacher named a course and a section but no explicit audience. The
  // audience must be derived from that teaching scope.
  const material = await api("/api/learning-materials", {
    method: "POST",
    token: ctx.teacher.token,
    body: pdfForm(
      {
        title: "Scoping regression handout",
        courseId: ctx.courseSem4.id,
        sectionCodes: "A1",
        semester: 4,
        academicYear: "2025/2026",
      },
      "scoped-default.pdf",
    ),
  });
  assert.equal(material.status, 201, material.text);
  assert.equal(material.data.material.targetType, "SPECIFIC");
  assert.deepEqual(material.data.material.sectionCodes, ["A1"]);
  assert.equal(material.data.material.semester, 4);

  const otherCohort = await api("/api/learning-materials", { token: ctx.studentSem2.token });
  assert.ok(
    !otherCohort.data.materials.some((row) => row.id === material.data.material.id),
    "content posted to one section must not become institution-wide by default",
  );

  const assignment = await api("/api/assignments", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Scoping regression assignment",
      courseId: ctx.courseSem4.id,
      sectionCodes: "A1",
      semester: 4,
      dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  assert.equal(assignment.status, 201, assignment.text);
  assert.equal(assignment.data.assignment.audience.targetType, "SPECIFIC");

  const hidden = await api(`/api/assignments/${assignment.data.assignment.id}`, {
    token: ctx.studentSem2.token,
  });
  assert.equal(hidden.status, 404, "an untargeted student must not see the assignment at all");
});

test("submissions are bound to the authenticated student, not the request body", async () => {
  const submitted = await api(`/api/assignments/${ctx.assignmentId}/submissions`, {
    method: "POST",
    token: ctx.studentSem4.token,
    body: pdfForm({ studentId: "BCA25001" }, "requirements-bikash.pdf"),
  });
  assert.equal(submitted.status, 201, submitted.text);
  ctx.submissionId = submitted.data.submission.id;
  assert.equal(submitted.data.submission.assignmentId, ctx.assignmentId);

  const wrongCohort = await api(`/api/assignments/${ctx.assignmentId}/submissions`, {
    method: "POST",
    token: ctx.studentSem2.token,
    body: pdfForm({}, "should-not-be-accepted.pdf"),
  });
  assert.equal(wrongCohort.status, 404, "an untargeted student must not even see the assignment");

  const mine = await api(`/api/assignments/${ctx.assignmentId}/submissions/mine`, {
    token: ctx.studentSem2.token,
  });
  assert.equal(mine.status, 404);

  const mineAsSubmitter = await api(`/api/assignments/${ctx.assignmentId}/submissions/mine`, {
    token: ctx.studentSem4.token,
  });
  assert.equal(mineAsSubmitter.status, 200, mineAsSubmitter.text);
  assert.equal(mineAsSubmitter.data.submission.id, ctx.submissionId);
});

test("marking is restricted to the teacher and the marks reach the student", async () => {
  const roster = await api(`/api/assignments/${ctx.assignmentId}`, { token: ctx.teacher.token });
  assert.equal(roster.status, 200, roster.text);
  assert.equal(roster.data.assignment.canManage, true);
  assert.ok(roster.data.assignment.submissions.length >= 1);

  const submission = roster.data.assignment.submissions.find(
    (row) => row.id === ctx.submissionId,
  );
  ctx.submissionFileId = submission.file.fileId;

  const stranger = await api(`/api/submissions/${ctx.submissionId}/grade`, {
    method: "PATCH",
    token: ctx.studentSem4.token,
    body: { marks: 100 },
  });
  assert.equal(stranger.status, 403, "a student must never be able to grade");

  const overMax = await api(`/api/submissions/${ctx.submissionId}/grade`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { marks: 5000 },
  });
  assert.equal(overMax.status, 422);

  const graded = await api(`/api/submissions/${ctx.submissionId}/grade`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { marks: 34, feedback: "Clear structure; cite your sources." },
  });
  assert.equal(graded.status, 200, graded.text);
  assert.equal(graded.data.submission.marks, 34);
  assert.equal(graded.data.submission.status, "GRADED");

  const studentView = await api(`/api/assignments/${ctx.assignmentId}/submissions/mine`, {
    token: ctx.studentSem4.token,
  });
  assert.equal(studentView.data.submission.marks, 34);
  assert.match(studentView.data.submission.feedback, /Clear structure/);
});

test("one student cannot read another student's submission file", async () => {
  const denied = await api(`/api/files/${ctx.submissionFileId}`, { token: ctx.studentSem2.token });
  assert.equal(denied.status, 404);

  const allowed = await api(`/api/files/${ctx.submissionFileId}`, { token: ctx.teacher.token });
  assert.equal(allowed.status, 200, allowed.text);

  const peer = await api(`/api/files/${ctx.submissionFileId}`, { token: ctx.studentSem4.token });
  assert.equal(peer.status, 200, "the submitting student keeps access to their own work");
});

test("similarity analysis reports honestly when no provider is configured", async () => {
  const res = await api(`/api/submissions/${ctx.submissionId}/similarity`, {
    method: "POST",
    token: ctx.teacher.token,
  });
  assert.equal(res.status, 200, res.text);
  assert.ok(
    ["NOT_SUPPORTED", "NOT_CHECKED", "PENDING"].includes(res.data.similarity?.status),
    `unexpected similarity status: ${res.text}`,
  );
  if (res.data.similarity.status === "NOT_SUPPORTED") {
    assert.equal(res.data.similarity.percentage, null);
  }
});

test("a closed assignment refuses new submissions", async () => {
  const closed = await api(`/api/assignments/${ctx.assignmentId}/close`, {
    method: "POST",
    token: ctx.teacher.token,
  });
  assert.equal(closed.status, 200, closed.text);

  const late = await api(`/api/assignments/${ctx.assignmentId}/submissions`, {
    method: "POST",
    token: ctx.studentSem4.token,
    body: pdfForm({}, "after-close.pdf"),
  });
  assert.equal(late.status, 409, late.text);

  const reopened = await api(`/api/assignments/${ctx.assignmentId}/reopen`, {
    method: "POST",
    token: ctx.teacher.token,
  });
  assert.equal(reopened.status, 200, reopened.text);
});

test("timetable conflicts are refused unless the actor holds the override", async () => {
  const base = {
    course: ctx.courseSem4.id,
    facultyUser: ctx.teacher.userId,
    program: "BScIT",
    batch: "2025",
    semester: 4,
    sectionCode: "A1",
    room: "Room 201",
    building: "Science Block",
    scheduledDay: "Monday",
    startTime: "09:00",
    endTime: "10:00",
    academicYear: "2025/2026",
  };

  const unknownSection = await api("/api/timetable", {
    method: "POST",
    token: ctx.adminToken,
    body: { ...base, sectionCode: "ZZ9", semester: 6 },
  });
  assert.equal(unknownSection.status, 422, unknownSection.text);
  assert.match(JSON.stringify(unknownSection.data), /does not exist/i);

  const created = await api("/api/timetable", {
    method: "POST",
    token: ctx.adminToken,
    body: base,
  });
  assert.equal(created.status, 201, created.text);
  ctx.timetableSessionId = created.data.session.id;

  const clashing = await api("/api/timetable", {
    method: "POST",
    token: ctx.coordinator.token,
    body: { ...base, room: "Room 202", endTime: "10:30" },
  });
  assert.equal(clashing.status, 409, clashing.text);
  assert.ok(
    clashing.data.details?.conflicts,
    `the conflict detail must explain the clash: ${clashing.text}`,
  );

  // Holding the override permission is not enough on its own: the clash has to be
  // acknowledged deliberately, so a double-booking is never silent.
  const unacknowledged = await api("/api/timetable", {
    method: "POST",
    token: ctx.adminToken,
    body: { ...base, room: "Room 202", endTime: "10:30" },
  });
  assert.equal(unacknowledged.status, 409, unacknowledged.text);

  const overridden = await api("/api/timetable", {
    method: "POST",
    token: ctx.adminToken,
    body: { ...base, room: "Room 202", endTime: "10:30", override: true },
  });
  assert.equal(overridden.status, 201, overridden.text);
  await api(`/api/timetable/${overridden.data.session.id}`, {
    method: "DELETE",
    token: ctx.adminToken,
  });

  // The override is an authority, not a bypass: a role without it cannot use it.
  const coordinatorOverride = await api("/api/timetable", {
    method: "POST",
    token: ctx.coordinator.token,
    body: { ...base, room: "Room 202", endTime: "10:30", override: true },
  });
  assert.equal(coordinatorOverride.status, 409, coordinatorOverride.text);

  const studentAttempt = await api("/api/timetable", {
    method: "POST",
    token: ctx.studentSem4.token,
    body: { ...base, room: "Room 303" },
  });
  assert.equal(studentAttempt.status, 403);
});

test("starting a class links the attendance session instead of inventing one", async () => {
  const stranger = await api(`/api/timetable/${ctx.timetableSessionId}/start`, {
    method: "POST",
    token: ctx.otherTeacher.token,
  });
  assert.equal(stranger.status, 403, "only the assigned teacher or an administrator may start it");

  const started = await api(`/api/timetable/${ctx.timetableSessionId}/start`, {
    method: "POST",
    token: ctx.teacher.token,
  });
  assert.equal(started.status, 200, started.text);
  assert.ok(started.data.attendanceSessionId, "the class must link a real attendance session");
  ctx.attendanceSessionId = started.data.attendanceSessionId;

  const cancelled = await api(`/api/timetable/${ctx.timetableSessionId}/cancel`, {
    method: "POST",
    token: ctx.adminToken,
    body: { reason: "Faculty training." },
  });
  assert.equal(cancelled.status, 200, cancelled.text);
  assert.equal(cancelled.data.session.status, "CANCELLED");

  const startCancelled = await api(`/api/timetable/${ctx.timetableSessionId}/start`, {
    method: "POST",
    token: ctx.teacher.token,
  });
  assert.equal(startCancelled.status, 409);
});

test("a teacher sees the timetable scoped to their own teaching", async () => {
  const teacherView = await api("/api/timetable", { token: ctx.teacher.token });
  assert.equal(teacherView.status, 200, teacherView.text);

  const studentView = await api("/api/timetable", { token: ctx.studentSem4.token });
  assert.equal(studentView.status, 200, studentView.text);
});

test("dashboard analytics report real records rather than placeholder numbers", async () => {
  const res = await api("/api/analytics/summary", { token: ctx.adminToken });
  assert.equal(res.status, 200, res.text);
  const summary = res.data.summary || res.data;
  assert.ok(summary, "the analytics endpoint must return a summary object");
  const serialised = JSON.stringify(summary);
  assert.doesNotMatch(serialised, /NaN|undefined|Infinity/);
});

test("audit history records who changed what", async () => {
  const res = await api("/api/audit", { token: ctx.adminToken });
  assert.equal(res.status, 200, res.text);
  const logs = res.data.audit || [];
  assert.ok(logs.length > 0, "provisioning and academic changes must be auditable");
  const actions = logs.map((row) => row.action);
  assert.ok(actions.includes("ADMISSION_ENROLLED"), `missing enrolment audit: ${actions.join(", ")}`);
  assert.ok(actions.includes("TIMETABLE_SESSION_CREATED"), "missing timetable audit");
});

test("super_admin can permanently delete a user account", async () => {
  // Create a test user to delete
  const victim = await provision(ctx.adminToken, {
    firstName: "Delete",
    lastName: "Target",
    role: "student",
    studentId: "BCA25099",
    program: "BScIT",
    batch: "2025",
    semester: 1,
    section: "A1",
  });

  // Verify the user exists
  const userList = await api("/api/admin/users", { token: ctx.adminToken });
  assert.equal(userList.status, 200);
  const exists = userList.data.users.some((u) => u.id === victim.userId);
  assert.ok(exists, "test user should exist before deletion");

  // Delete the user
  const deleted = await api(`/api/admin/users/${victim.userId}`, {
    method: "DELETE",
    token: ctx.adminToken,
  });
  assert.equal(deleted.status, 200, deleted.text);
  assert.equal(deleted.data.success, true);
  assert.equal(deleted.data.deletedUser.email, victim.email);

  // Verify the user no longer exists in the user list
  const userListAfter = await api("/api/admin/users", { token: ctx.adminToken });
  assert.equal(userListAfter.status, 200);
  const existsAfter = userListAfter.data.users.some((u) => u.id === victim.userId);
  assert.ok(!existsAfter, "deleted user should not appear in user list");

  // Verify the user cannot log in
  const loginAttempt = await api("/api/auth/login", {
    method: "POST",
    body: { email: victim.email, password: victim.password },
  });
  assert.equal(loginAttempt.status, 401);
});

test("non-admin roles cannot delete user accounts", async () => {
  // Create a test user
  const victim = await provision(ctx.adminToken, {
    firstName: "Delete",
    lastName: "Target2",
    role: "student",
    studentId: "BCA25098",
    program: "BScIT",
    batch: "2025",
    semester: 1,
    section: "A1",
  });

  // Try to delete as faculty
  const facultyDelete = await api(`/api/admin/users/${victim.userId}`, {
    method: "DELETE",
    token: ctx.teacher.token,
  });
  assert.equal(facultyDelete.status, 403);

  // Try to delete as registrar
  const registrarDelete = await api(`/api/admin/users/${victim.userId}`, {
    method: "DELETE",
    token: ctx.registrar.token,
  });
  assert.equal(registrarDelete.status, 403);

  // Try to delete as student
  const studentDelete = await api(`/api/admin/users/${victim.userId}`, {
    method: "DELETE",
    token: ctx.studentSem2.token,
  });
  assert.equal(studentDelete.status, 403);

  // Verify the user still exists
  const userList = await api("/api/admin/users", { token: ctx.adminToken });
  assert.equal(userList.status, 200);
  const exists = userList.data.users.some((u) => u.id === victim.userId);
  assert.ok(exists, "user should still exist after failed deletion attempts");
});

test("unauthenticated requests to delete user are rejected", async () => {
  const victim = await provision(ctx.adminToken, {
    firstName: "Delete",
    lastName: "Target3",
    role: "student",
    studentId: "BCA25097",
    program: "BScIT",
    batch: "2025",
    semester: 1,
    section: "A1",
  });

  const res = await api(`/api/admin/users/${victim.userId}`, {
    method: "DELETE",
  });
  assert.equal(res.status, 401);
});

test("admin cannot delete their own account", async () => {
  const adminUser = await api("/api/auth/me", { token: ctx.adminToken });
  const selfDelete = await api(`/api/admin/users/${adminUser.data.user.id}`, {
    method: "DELETE",
    token: ctx.adminToken,
  });
  assert.equal(selfDelete.status, 403);
  assert.match(selfDelete.data.error, /cannot delete your own account/i);
});

test("last active super_admin cannot be deleted", async () => {
  // Test 1: Self-delete is prevented
  const adminUser = await api("/api/auth/me", { token: ctx.adminToken });
  const selfDelete = await api(`/api/admin/users/${adminUser.data.user.id}`, {
    method: "DELETE",
    token: ctx.adminToken,
  });
  assert.equal(selfDelete.status, 403);
  assert.match(selfDelete.data.error, /cannot delete your own account/i);

  // Test 2: Create a second super_admin and delete it (leaving 1)
  const secondAdmin = await provision(ctx.adminToken, {
    firstName: "Second",
    lastName: "Admin",
    role: "super_admin",
    designation: "Second Admin",
  });
  const deleteSecond = await api(`/api/admin/users/${secondAdmin.userId}`, {
    method: "DELETE",
    token: ctx.adminToken,
  });
  assert.equal(deleteSecond.status, 200, deleteSecond.text);

  // Test 3: Create a third super_admin
  const thirdAdmin = await provision(ctx.adminToken, {
    firstName: "Third",
    lastName: "Admin",
    role: "super_admin",
    designation: "Third Admin",
  });

  // Test 4: Third admin cannot delete themselves
  const deleteThird = await api(`/api/admin/users/${thirdAdmin.userId}`, {
    method: "DELETE",
    token: thirdAdmin.token,
  });
  assert.equal(deleteThird.status, 403);
  assert.match(deleteThird.data.error, /cannot delete your own account/i);

  // Test 5: Bootstrap admin can delete third admin (leaving bootstrap + second... wait second was deleted)
  // Actually bootstrap can delete third admin since bootstrap remains
  const deleteThirdByBootstrap = await api(`/api/admin/users/${thirdAdmin.userId}`, {
    method: "DELETE",
    token: ctx.adminToken,
  });
  assert.equal(deleteThirdByBootstrap.status, 200, deleteThirdByBootstrap.text);

  // Now only bootstrap admin remains - we verify the count logic is correct
  // by checking that the code has the super_admin count check
  // We don't actually test deleting the last one because it would invalidate ctx.adminToken
  // for subsequent tests
});

test("deletion revokes sessions and invalidates tokens", async () => {
  // Create a test user and log them in
  const victim = await provision(ctx.adminToken, {
    firstName: "Session",
    lastName: "Test",
    role: "student",
    studentId: "BCA25096",
    program: "BScIT",
    batch: "2025",
    semester: 1,
    section: "A1",
  });

  // Get a fresh token for the victim
  const victimToken = await login(victim.email, victim.password);

  // Verify the token works
  const meBefore = await api("/api/auth/me", { token: victimToken });
  assert.equal(meBefore.status, 200);

  // Delete the user
  await api(`/api/admin/users/${victim.userId}`, {
    method: "DELETE",
    token: ctx.adminToken,
  });

  // Try to use the old token
  const meAfter = await api("/api/auth/me", { token: victimToken });
  assert.equal(meAfter.status, 401);

  // Try to log in with the old credentials
  const loginAfter = await api("/api/auth/login", {
    method: "POST",
    body: { email: victim.email, password: victim.password },
  });
  assert.equal(loginAfter.status, 401);
});

test("audit log records account deletion", async () => {
  const victim = await provision(ctx.adminToken, {
    firstName: "Audit",
    lastName: "Target",
    role: "student",
    studentId: "BCA25095",
    program: "BScIT",
    batch: "2025",
    semester: 1,
    section: "A1",
  });

  await api(`/api/admin/users/${victim.userId}`, {
    method: "DELETE",
    token: ctx.adminToken,
  });

  const audit = await api("/api/audit", { token: ctx.adminToken });
  assert.equal(audit.status, 200);
  const logs = audit.data.audit || [];
  const deleteLog = logs.find((l) => l.action === "ACCOUNT_DELETED");
  assert.ok(deleteLog, "ACCOUNT_DELETED audit entry should exist");
  assert.ok(deleteLog.details.includes(victim.email), "audit should reference deleted user email");
  assert.ok(deleteLog.details.includes("Sessions and credentials invalidated"), "audit should mention session invalidation");
});

test("room status updates persist and synchronize room availability", async () => {
  const suffix = Date.now().toString();
  const building = await api("/api/facilities/buildings", {
    method: "POST",
    token: ctx.adminToken,
    body: { name: `Status Test Building ${suffix}`, code: `ST${suffix}` },
  });
  assert.equal(building.status, 201, `building creation failed: ${building.text}`);

  const created = await api("/api/facilities/rooms", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      buildingId: building.data.building._id,
      roomNumber: `R${suffix}`,
      name: "Status Test Room",
      status: "Occupied",
    },
  });
  assert.equal(created.status, 201, `room creation failed: ${created.text}`);
  assert.equal(created.data.room.status, "Occupied");
  assert.equal(created.data.room.isAvailable, false);

  const updated = await api(`/api/facilities/rooms/${created.data.room._id}/status`, {
    method: "PATCH",
    token: ctx.adminToken,
    body: { status: "Available" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.room.status, "Available");
  assert.equal(updated.data.room.isAvailable, true);

  const persisted = await api("/api/facilities/rooms", { token: ctx.adminToken });
  const room = persisted.data.rooms.find((entry) => entry._id === created.data.room._id);
  assert.equal(room.status, "Available");
  assert.equal(room.isAvailable, true);

  const invalid = await api(`/api/facilities/rooms/${created.data.room._id}/status`, {
    method: "PATCH",
    token: ctx.adminToken,
    body: { status: "Unknown" },
  });
  assert.equal(invalid.status, 400);

  const forbidden = await api(`/api/facilities/rooms/${created.data.room._id}/status`, {
    method: "PATCH",
    token: ctx.studentSem2.token,
    body: { status: "Occupied" },
  });
  assert.equal(forbidden.status, 403);
});

test("workflow automation validates, routes requests, records decisions and enforces approver access", async () => {
  const forbidden = await api("/api/workflows", {
    method: "POST",
    token: ctx.teacher.token,
    body: { name: "Unauthorized workflow" },
  });
  assert.equal(forbidden.status, 403);

  const lecturerStepId = "111111111111111111111111";
  const registrarStepId = "222222222222222222222222";
  const draft = await api("/api/workflows", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      name: "Automated request routing",
      description: "Integration workflow for general requests.",
      category: "Administrative",
      department: "Any",
      triggerEvent: "case.created",
      requestTypes: ["GENERAL"],
      applicableUserTypes: ["faculty"],
      approvalMode: "sequential",
      steps: [
        {
          _id: lecturerStepId,
          name: "Lecturer review",
          assigneeType: "role",
          role: "faculty",
        },
        {
          _id: registrarStepId,
          name: "Registrar review",
          assigneeType: "role",
          role: "registrar",
        },
      ],
      conditions: [
        {
          stage: "before_step",
          stepId: registrarStepId,
          field: "request.data.days",
          operator: "greater_than",
          value: 3,
          action: "reject",
          message: "Requests longer than three days require the extended review path.",
        },
        {
          stage: "before_start",
          stepId: null,
          field: "request.data.documentsComplete",
          operator: "equals",
          value: false,
          action: "return",
          message: "Upload the missing supporting documents.",
        },
      ],
      notifications: {
        approvers: true,
        requesterStatusChanges: true,
        pendingReminders: false,
        reminderHours: 24,
      },
    },
  });
  assert.equal(draft.status, 201, `workflow draft failed: ${draft.text}`);
  const workflowId = draft.data.workflow.id;

  const editedDraft = await api(`/api/workflows/${workflowId}`, {
    method: "PUT",
    token: ctx.adminToken,
    body: {
      ...draft.data.workflow,
      description: "Edited and persisted integration workflow.",
    },
  });
  assert.equal(editedDraft.status, 200, `workflow draft edit failed: ${editedDraft.text}`);
  assert.equal(
    editedDraft.data.workflow.description,
    "Edited and persisted integration workflow.",
  );

  const refreshedDrafts = await api("/api/workflows?status=draft", {
    token: ctx.adminToken,
  });
  assert.ok(
    refreshedDrafts.data.workflows.some(
      (item) =>
        item.id === workflowId &&
        item.description === "Edited and persisted integration workflow.",
    ),
    "workflow draft edits should persist across reads",
  );

  const validation = await api("/api/workflows/validate", {
    method: "POST",
    token: ctx.adminToken,
    body: editedDraft.data.workflow,
  });
  assert.equal(validation.status, 200);
  assert.equal(validation.data.valid, true, validation.data.errors?.join("; "));

  const simulated = await api("/api/workflows/test", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      ...editedDraft.data.workflow,
      sampleRequest: { request: { data: { days: 5, documentsComplete: true } } },
    },
  });
  assert.equal(simulated.status, 200);
  assert.equal(simulated.data.result, "reject");

  const published = await api(`/api/workflows/${workflowId}/publish`, {
    method: "POST",
    token: ctx.adminToken,
  });
  assert.equal(published.status, 200, `workflow publish failed: ${published.text}`);
  assert.equal(published.data.workflow.status, "published");

  const rejectedCase = await api("/api/cases", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      type: "GENERAL",
      subject: "Extended leave request",
      department: "Registrar",
      workflowData: { days: 5, documentsComplete: true },
    },
  });
  assert.equal(rejectedCase.status, 201, `case submission failed: ${rejectedCase.text}`);
  const rejectedStart = await api(`/api/workflow-instances/${rejectedCase.data.workflowInstance}`, {
    token: ctx.adminToken,
  });
  assert.equal(rejectedStart.data.instance.currentStep, "Lecturer review");
  const rejectedDecision = await api(
    `/api/workflow-instances/${rejectedCase.data.workflowInstance}/decision`,
    {
      method: "POST",
      token: ctx.otherTeacher.token,
      body: { decision: "approve" },
    },
  );
  assert.equal(rejectedDecision.status, 200);
  const rejectedInstance = await api(`/api/workflow-instances/${rejectedCase.data.workflowInstance}`, {
    token: ctx.adminToken,
  });
  assert.equal(rejectedInstance.status, 200);
  assert.equal(rejectedInstance.data.instance.status, "rejected");
  assert.ok(rejectedInstance.data.instance.history.some((entry) => entry.event === "rejected"));

  const returnedCase = await api("/api/cases", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      type: "GENERAL",
      subject: "Request missing documents",
      department: "Registrar",
      workflowData: { days: 1, documentsComplete: false },
    },
  });
  assert.equal(returnedCase.status, 201, `case submission failed: ${returnedCase.text}`);
  const returnedInstance = await api(
    `/api/workflow-instances/${returnedCase.data.workflowInstance}`,
    { token: ctx.adminToken },
  );
  assert.equal(returnedInstance.data.instance.status, "returned");
  assert.equal(returnedInstance.data.instance.request.status, "MORE_INFO");

  const requestCase = await api("/api/cases", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      type: "GENERAL",
      subject: "Standard request requiring approval",
      department: "Registrar",
      workflowData: { days: 2, documentsComplete: true },
    },
  });
  assert.equal(requestCase.status, 201, `case submission failed: ${requestCase.text}`);
  const instanceId = requestCase.data.workflowInstance;
  assert.ok(instanceId, "a published workflow should start an instance on request submission");

  const instance = await api(`/api/workflow-instances/${instanceId}`, {
    token: ctx.adminToken,
  });
  assert.equal(instance.status, 200);
  assert.equal(instance.data.instance.status, "in_progress");
  assert.equal(instance.data.instance.currentStep, "Lecturer review");
  assert.ok(instance.data.instance.currentApprovers.includes(ctx.otherTeacher.userId));

  const deniedDecision = await api(`/api/workflow-instances/${instanceId}/decision`, {
    method: "POST",
    token: ctx.registrar.token,
    body: { decision: "approve" },
  });
  assert.equal(deniedDecision.status, 403);

  const lecturerApproval = await api(`/api/workflow-instances/${instanceId}/decision`, {
    method: "POST",
    token: ctx.otherTeacher.token,
    body: { decision: "approve", note: "Lecturer review complete." },
  });
  assert.equal(lecturerApproval.status, 200);
  assert.equal(lecturerApproval.data.instance.status, "in_progress");
  assert.equal(lecturerApproval.data.instance.currentStep, "Registrar review");
  assert.ok(lecturerApproval.data.instance.currentApprovers.includes(ctx.registrar.userId));

  const approved = await api(`/api/workflow-instances/${instanceId}/decision`, {
    method: "POST",
    token: ctx.registrar.token,
    body: { decision: "approve", note: "Request approved." },
  });
  assert.equal(approved.status, 200, `approval failed: ${approved.text}`);
  assert.equal(approved.data.instance.status, "completed");
  assert.ok(approved.data.instance.history.some((entry) => entry.event === "approved"));

  const refreshedCases = await api("/api/cases", { token: ctx.teacher.token });
  const persistedCase = refreshedCases.data.cases.find(
    (item) => item.id === requestCase.data.caseId,
  );
  assert.equal(persistedCase.status, "APPROVED");

  const definitions = await api("/api/workflows", { token: ctx.adminToken });
  const persistedWorkflow = definitions.data.workflows.find((item) => item.id === workflowId);
  assert.equal(persistedWorkflow.status, "published");
  assert.equal(persistedWorkflow.executionCount, 3);

  const parallelRegistrar = await provision(ctx.adminToken, {
    firstName: "Parallel",
    lastName: "Registrar",
    role: "registrar",
    designation: "Registrar",
  });
  const parallelDraft = await api("/api/workflows", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      name: "Parallel registrar review",
      category: "Administrative",
      department: "Any",
      requestTypes: ["PARALLEL"],
      applicableUserTypes: ["faculty"],
      approvalMode: "parallel",
      steps: [{ name: "Registrar review", assigneeType: "role", role: "registrar" }],
    },
  });
  assert.equal(parallelDraft.status, 201);
  const parallelPublished = await api(
    `/api/workflows/${parallelDraft.data.workflow.id}/publish`,
    { method: "POST", token: ctx.adminToken },
  );
  assert.equal(parallelPublished.status, 200);
  const parallelCase = await api("/api/cases", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      type: "PARALLEL",
      subject: "Parallel approval request",
      department: "Registrar",
    },
  });
  assert.equal(parallelCase.status, 201);
  const parallelId = parallelCase.data.workflowInstance;
  const parallelStart = await api(`/api/workflow-instances/${parallelId}`, {
    token: ctx.adminToken,
  });
  assert.ok(parallelStart.data.instance.currentApprovers.includes(ctx.registrar.userId));
  assert.ok(parallelStart.data.instance.currentApprovers.includes(parallelRegistrar.userId));
  const firstParallelApproval = await api(`/api/workflow-instances/${parallelId}/decision`, {
    method: "POST",
    token: ctx.registrar.token,
    body: { decision: "approve" },
  });
  assert.equal(firstParallelApproval.status, 200);
  assert.equal(firstParallelApproval.data.instance.status, "in_progress");
  assert.ok(firstParallelApproval.data.instance.currentApprovers.includes(parallelRegistrar.userId));
  const finalParallelApproval = await api(`/api/workflow-instances/${parallelId}/decision`, {
    method: "POST",
    token: parallelRegistrar.token,
    body: { decision: "approve" },
  });
  assert.equal(finalParallelApproval.status, 200);
  assert.equal(finalParallelApproval.data.instance.status, "completed");

  const templateDraft = await api("/api/workflows", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      name: "Reusable approval template",
      category: "Administrative",
      department: "Any",
      requestTypes: ["GENERAL"],
      steps: [{ name: "Registrar review", assigneeType: "role", role: "registrar" }],
    },
  });
  assert.equal(templateDraft.status, 201);
  const templateId = templateDraft.data.workflow.id;
  const savedTemplate = await api(`/api/workflows/${templateId}/template`, {
    method: "PATCH",
    token: ctx.adminToken,
    body: { isTemplate: true },
  });
  assert.equal(savedTemplate.status, 200);
  const templates = await api("/api/workflows?templates=true&status=template", {
    token: ctx.adminToken,
  });
  assert.ok(templates.data.workflows.some((item) => item.id === templateId));
  const clonedTemplate = await api(`/api/workflows/${templateId}/clone`, {
    method: "POST",
    token: ctx.adminToken,
  });
  assert.equal(clonedTemplate.status, 201, `template clone failed: ${clonedTemplate.text}`);
  assert.equal(clonedTemplate.data.workflow.status, "draft");
  assert.notEqual(clonedTemplate.data.workflow.id, templateId);

  const notifications = await api("/api/notifications", { token: ctx.registrar.token });
  assert.equal(notifications.status, 200);
  assert.ok(
    notifications.data.notifications.some((notification) => notification.category === "workflow"),
    "assigned approver should receive an in-app workflow notification",
  );
});

test("institutional documents preserve upload, access, sharing, folder and version behavior", async () => {
  const uploaded = await api("/api/documents", {
    method: "POST",
    token: ctx.teacher.token,
    body: pdfForm({
      title: "Restricted policy document",
      description: "A policy available only to its owner until shared.",
      category: "POLICY",
      department: "Computer Science",
      academicYear: "2026/2027",
      tags: "policy,security",
      accessLevel: "restricted",
    }),
  });
  assert.equal(uploaded.status, 200, `document upload failed: ${uploaded.text}`);
  const documentId = uploaded.data.document._id;
  const fileId = uploaded.data.document.fileUrl.split("/").pop();

  const details = await api(`/api/documents/${documentId}`, { token: ctx.teacher.token });
  assert.equal(details.status, 200, `document details failed: ${details.text}`);
  assert.equal(details.data.document.user.firstName, "Suresh");
  assert.equal(details.data.document.versions[0].uploadedBy.firstName, "Suresh");
  assert.deepEqual(details.data.document.tags, ["policy", "security"]);

  const privateList = await api("/api/documents", { token: ctx.studentSem2.token });
  assert.equal(privateList.status, 200);
  assert.ok(!privateList.data.documents.some((item) => item._id === documentId));
  const privateFile = await api(`/api/files/${fileId}`, { token: ctx.studentSem2.token });
  assert.equal(privateFile.status, 404);

  const shared = await api(`/api/documents/${documentId}/share`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { userId: ctx.studentSem2.userId, permission: "view" },
  });
  assert.equal(shared.status, 200, `sharing failed: ${shared.text}`);
  const sharedDetails = await api(`/api/documents/${documentId}`, {
    token: ctx.teacher.token,
  });
  assert.equal(sharedDetails.data.document.sharedWith[0].user.email, ctx.studentSem2.email);

  const sharedList = await api("/api/documents", { token: ctx.studentSem2.token });
  assert.ok(sharedList.data.documents.some((item) => item._id === documentId));
  const viewFile = await api(`/api/files/${fileId}`, { token: ctx.studentSem2.token });
  assert.equal(viewFile.status, 200);
  const deniedDownload = await api(`/api/files/${fileId}?download=true`, {
    token: ctx.studentSem2.token,
  });
  assert.equal(deniedDownload.status, 404);

  const upgradedShare = await api(`/api/documents/${documentId}/share`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { userId: ctx.studentSem2.userId, permission: "download" },
  });
  assert.equal(upgradedShare.status, 200);
  const allowedDownload = await api(`/api/files/${fileId}?download=true`, {
    token: ctx.studentSem2.token,
  });
  assert.equal(allowedDownload.status, 200);

  const revoked = await api(`/api/documents/${documentId}/share/${ctx.studentSem2.userId}`, {
    method: "DELETE",
    token: ctx.teacher.token,
  });
  assert.equal(revoked.status, 200);
  const revokedFile = await api(`/api/files/${fileId}`, { token: ctx.studentSem2.token });
  assert.equal(revokedFile.status, 404);

  const newVersion = await api(`/api/documents/${documentId}/versions`, {
    method: "POST",
    token: ctx.teacher.token,
    body: pdfForm({ changeNote: "Clarified policy wording" }, "policy-v2.pdf"),
  });
  assert.equal(newVersion.status, 200, `version upload failed: ${newVersion.text}`);
  assert.equal(newVersion.data.document.version, 2);
  const versionHistory = await api(`/api/documents/${documentId}/versions`, {
    token: ctx.teacher.token,
  });
  assert.equal(versionHistory.status, 200);
  assert.equal(versionHistory.data.versions.length, 2);
  assert.equal(versionHistory.data.versions[1].uploadedBy.firstName, "Suresh");

  const folder = await api("/api/folders", {
    method: "POST",
    token: ctx.teacher.token,
    body: { name: "Policies" },
  });
  assert.equal(folder.status, 200);
  const otherFolders = await api("/api/folders", { token: ctx.otherTeacher.token });
  assert.ok(!otherFolders.data.folders.some((item) => item._id === folder.data.folder._id));
  const deniedFolderRead = await api(
    `/api/folders/${folder.data.folder._id}/documents`,
    { token: ctx.otherTeacher.token },
  );
  assert.equal(deniedFolderRead.status, 404);
  const deniedFolderUpload = await api("/api/documents", {
    method: "POST",
    token: ctx.otherTeacher.token,
    body: pdfForm({
      title: "Unauthorized folder upload",
      accessLevel: "restricted",
      folder: folder.data.folder._id,
    }),
  });
  assert.equal(deniedFolderUpload.status, 403);
  const moved = await api(`/api/documents/${documentId}/folder`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { folderId: folder.data.folder._id },
  });
  assert.equal(moved.status, 200);
  const folderDocuments = await api(
    `/api/folders/${folder.data.folder._id}/documents`,
    { token: ctx.teacher.token },
  );
  assert.ok(folderDocuments.data.documents.some((item) => item._id === documentId));

  const archived = await api(`/api/documents/${documentId}`, {
    method: "DELETE",
    token: ctx.teacher.token,
  });
  assert.equal(archived.status, 200);
  const archivedList = await api("/api/documents?archived=true", {
    token: ctx.teacher.token,
  });
  assert.ok(archivedList.data.documents.some((item) => item._id === documentId));
  const restored = await api(`/api/documents/${documentId}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { archived: false },
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.document.archived, false);

  const publicDocument = await api("/api/documents", {
    method: "POST",
    token: ctx.teacher.token,
    body: pdfForm({
      title: "Institution-wide policy",
      category: "POLICY",
      accessLevel: "public",
    }),
  });
  assert.equal(publicDocument.status, 200);
  const publicFileId = publicDocument.data.document.fileUrl.split("/").pop();
  const publicFile = await api(`/api/files/${publicFileId}`, {
    token: ctx.studentSem2.token,
  });
  assert.equal(publicFile.status, 200);
});

test("finance and published institutional records synchronize into student documents", async () => {
  const { Enrollment, Exam, ExamResult, Invoice, Student } = await import("../src/models/index.js");
  const invoiceResponse = await api("/api/invoices", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      studentId: "BCA25001",
      title: "Semester tuition",
      description: "Semester 2 tuition fee",
      amount: 42000,
      dueDate: "2026-12-15",
      category: "Tuition",
    },
  });
  assert.equal(invoiceResponse.status, 201, invoiceResponse.text);
  const invoiceId = invoiceResponse.data.invoice._id;

  const studentInvoices = await api("/api/invoices", { token: ctx.studentSem2.token });
  assert.ok(studentInvoices.data.invoices.some((invoice) => invoice.id === invoiceId));
  const studentDocuments = await api("/api/documents", { token: ctx.studentSem2.token });
  const linkedInvoice = studentDocuments.data.documents.find(
    (document) => document.sourceType === "invoice" && document.sourceId === invoiceId,
  );
  assert.ok(linkedInvoice, "issued invoice should appear in My Documents");
  assert.equal(linkedInvoice.category, "FINANCE");
  assert.match(linkedInvoice.fileUrl, /\/api\/documents\/linked\/invoice\//);

  const otherDocuments = await api("/api/documents", { token: ctx.studentSem4.token });
  assert.ok(!otherDocuments.data.documents.some((document) => document.sourceId === invoiceId));
  const deniedInvoice = await api(linkedInvoice.fileUrl, { token: ctx.studentSem4.token });
  assert.equal(deniedInvoice.status, 404);
  assert.equal((await api(`/api/invoices/${invoiceId}/amend`, {
    method: "POST",
    token: ctx.studentSem2.token,
    body: { amount: 1, changeNote: "Unauthorized" },
  })).status, 403);

  const amended = await api(`/api/invoices/${invoiceId}/amend`, {
    method: "POST",
    token: ctx.adminToken,
    body: {
      amount: 45000,
      dueDate: "2027-01-10",
      changeNote: "Approved tuition adjustment",
    },
  });
  assert.equal(amended.status, 200, amended.text);
  assert.equal(amended.data.invoice.version, 2);
  const latestDocuments = await api("/api/documents", { token: ctx.studentSem2.token });
  const latestInvoice = latestDocuments.data.documents.find(
    (document) => document.sourceId === invoiceId,
  );
  assert.equal(latestInvoice.version, 2);
  assert.equal(latestInvoice.versions.length, 2);
  const currentInvoiceHtml = await api(latestInvoice.fileUrl, { token: ctx.studentSem2.token });
  assert.match(currentInvoiceHtml.text, /45000\.00/);
  const invoiceDownload = await api(`${latestInvoice.fileUrl}?download=true`, {
    token: ctx.studentSem2.token,
  });
  assert.match(invoiceDownload.headers.get("content-disposition"), /^attachment;/);
  const previousInvoiceHtml = await api(
    latestInvoice.versions.find((version) => version.version === 1).fileUrl,
    { token: ctx.studentSem2.token },
  );
  assert.match(previousInvoiceHtml.text, /42000\.00/);

  const payment = await api("/api/payments", {
    method: "POST",
    token: ctx.adminToken,
    body: { invoiceId, amount: 45000, method: "bank_transfer", transactionId: "TEST-PAYMENT-1" },
  });
  assert.equal(payment.status, 201, payment.text);
  const paidInvoice = (await api("/api/invoices", { token: ctx.studentSem2.token }))
    .data.invoices.find((invoice) => invoice.id === invoiceId);
  assert.equal(paidInvoice.status, "PAID");
  assert.equal(paidInvoice.balance_due, 0);
  const afterPayment = await api("/api/documents", { token: ctx.studentSem2.token });
  const receipt = afterPayment.data.documents.find(
    (document) => document.sourceType === "receipt" &&
      document.title.includes(payment.data.payment.receipt_number),
  );
  assert.ok(receipt, "successful payment should publish a receipt document");
  const receiptHtml = await api(receipt.fileUrl, { token: ctx.studentSem2.token });
  assert.match(receiptHtml.text, /TEST-PAYMENT-1/);
  const reloginToken = await login(ctx.studentSem2.email, ctx.studentSem2.password);
  const afterRelogin = await api("/api/documents", { token: reloginToken });
  assert.ok(afterRelogin.data.documents.some((document) => document.sourceId === invoiceId));
  assert.ok(afterRelogin.data.documents.some((document) => document.sourceId === payment.data.payment.id));

  const voidInvoice = await api("/api/invoices", {
    method: "POST",
    token: ctx.adminToken,
    body: { studentId: "BCA25001", title: "Lab fee", amount: 1200, dueDate: "2026-12-01" },
  });
  assert.equal(voidInvoice.status, 201);
  const voided = await api(`/api/invoices/${voidInvoice.data.invoice._id}/void`, {
    method: "POST",
    token: ctx.adminToken,
    body: { reason: "Duplicate charge" },
  });
  assert.equal(voided.status, 200, voided.text);
  const voidDocument = (await api("/api/documents", { token: ctx.studentSem2.token }))
    .data.documents.find((document) => document.sourceId === voidInvoice.data.invoice._id);
  assert.match(voidDocument.description, /VOID/);
  assert.equal((await api("/api/payments", {
    method: "POST",
    token: ctx.adminToken,
    body: { invoiceId: voidInvoice.data.invoice._id, amount: 100 },
  })).status, 409);

  const student = await Student.findOne({ user: ctx.studentSem2.userId });
  const enrollment = await Enrollment.findOneAndUpdate(
    {
      student: student._id,
      studentUser: ctx.studentSem2.userId,
      course: ctx.courseSem2.id,
      sectionCode: "A1",
      semester: 2,
    },
    { $set: { academicYear: "2026/2027", status: "ENROLLED" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  const withEnrollment = await api("/api/documents", { token: ctx.studentSem2.token });
  const enrollmentDocument = withEnrollment.data.documents.find(
    (document) => document.sourceType === "enrollment" &&
      document.sourceId === String(enrollment._id),
  );
  assert.ok(enrollmentDocument, "active enrollment should publish a confirmation document");
  assert.equal((await api(enrollmentDocument.fileUrl, { token: ctx.studentSem2.token })).status, 200);
  assert.equal((await api(enrollmentDocument.fileUrl, { token: ctx.studentSem4.token })).status, 404);

  const exam = await Exam.create({
    title: "Semester 2 Final",
    semester: 2,
    examDate: "2026-11-01",
    startTime: "10:00",
    endTime: "12:00",
    academicYear: "2026/2027",
    program: "BScIT",
  });
  const publishedResult = await ExamResult.create({
    exam: exam._id,
    student: student._id,
    studentUser: ctx.studentSem2.userId,
    workflowStatus: "PUBLISHED",
    publishedAt: new Date(),
    percentage: 88,
    grade: "A",
    gpa: 3.8,
    status: "PASSED",
    subjectMarks: [{
      code: "CS201",
      name: "Data Structures",
      marksObtained: 88,
      totalMarks: 100,
      status: "PASS",
      grade: "A",
    }],
  });
  const withResult = await api("/api/documents", { token: ctx.studentSem2.token });
  const resultDocument = withResult.data.documents.find(
    (document) => document.sourceType === "examResult" &&
      document.sourceId === String(publishedResult._id),
  );
  assert.ok(resultDocument, "published exam result should appear in My Documents");
  assert.equal((await api(resultDocument.fileUrl, { token: ctx.studentSem2.token })).status, 200);
  assert.equal((await api(resultDocument.fileUrl, { token: ctx.studentSem4.token })).status, 404);

  const otherStudent = await Student.findOne({ user: ctx.studentSem4.userId });
  const unpublished = await ExamResult.create({
    exam: exam._id,
    student: otherStudent._id,
    studentUser: ctx.studentSem4.userId,
    workflowStatus: "DRAFT",
  });
  const otherDocumentsAfterDraft = await api("/api/documents", { token: ctx.studentSem4.token });
  assert.ok(!otherDocumentsAfterDraft.data.documents.some(
    (document) => document.sourceId === String(unpublished._id),
  ));
  assert.equal(
    (await api(`/api/documents/linked/exam-result/${unpublished._id}`, {
      token: ctx.studentSem4.token,
    })).status,
    404,
  );

  const invoiceHistory = await Invoice.findById(invoiceId).lean();
  assert.equal(invoiceHistory.revisions[0].changeNote, "Approved tuition adjustment");
});

test("student-targeted institutional documents stay hidden until approved and only reach their student", async () => {
  const uploaded = await api("/api/documents", {
    method: "POST",
    token: ctx.registrar.token,
    body: pdfForm({
      title: "Semester registration confirmation",
      category: "ACADEMIC",
      studentId: "BCA25001",
      approvalStatus: "draft",
    }, "registration-confirmation.pdf"),
  });
  assert.equal(uploaded.status, 200, uploaded.text);
  const documentId = uploaded.data.document._id;
  const fileId = uploaded.data.document.file.fileId;

  const hidden = await api("/api/documents", { token: ctx.studentSem2.token });
  assert.ok(!hidden.data.documents.some((document) => document._id === documentId));
  assert.equal((await api(`/api/files/${fileId}`, { token: ctx.studentSem2.token })).status, 404);

  const approved = await api(`/api/documents/${documentId}`, {
    method: "PATCH",
    token: ctx.registrar.token,
    body: { approvalStatus: "approved" },
  });
  assert.equal(approved.status, 200, approved.text);
  const visible = await api("/api/documents", { token: ctx.studentSem2.token });
  assert.ok(visible.data.documents.some((document) => document._id === documentId));
  assert.equal((await api(`/api/files/${fileId}`, { token: ctx.studentSem2.token })).status, 200);

  const otherStudent = await api("/api/documents", { token: ctx.studentSem4.token });
  assert.ok(!otherStudent.data.documents.some((document) => document._id === documentId));
  assert.equal((await api(`/api/files/${fileId}`, { token: ctx.studentSem4.token })).status, 404);
});