import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Notice board integration suite.
 *
 * Exercises the real MongoDB-backed Express app on an ephemeral
 * port and a dedicated test database, following the conventions of
 * api.test.js: audience targeting, draft state, sanitization,
 * attachment entitlement and notification delivery are all enforced
 * against stored records, never mocked.
 */

const TEST_DB = process.env.COLLEGEOS_NOTICES_TEST_DB || "collegeos_notices_test";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";

// The app reads these at module load, so they are set before anything is imported.
process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-notices-suite-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";
process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR = "2025/2026";

const ctx = {};
let baseUrl = "";
let server = null;
let mongooseRef = null;

/** Minimal but genuinely valid files: the backend sniffs magic bytes on upload. */
const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  "latin1",
);
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function uploadForm(filename, bytes, mimeType) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), filename);
  return form;
}

const csrfTokens = new Map();

async function api(path, { method = "GET", token, body } = {}) {
  const headers = {};
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
  return { status: response.status, data, text };
}

async function login(email, password) {
  const res = await api("/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.text}`);
  assert.ok(res.data.csrfToken, "login did not issue a CSRF token");
  csrfTokens.set(res.data.token, res.data.csrfToken);
  return res.data.token;
}

/** Signs in with a provisioned temporary password and rotates it. */
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
  const created = await api("/api/admin/users", { method: "POST", token: actorToken, body });
  assert.equal(created.status, 201, `provisioning failed: ${created.text}`);
  const password = `Collegeos@${Math.random().toString(36).slice(2, 8)}1`;
  const token = await activate(created.data.email, created.data.temporaryPassword, password);
  return { ...created.data, password, token, userId: created.data.userId };
}

/** Creates a notice and asserts success. */
async function createNotice(token, body) {
  const created = await api("/api/notices", { method: "POST", token, body });
  assert.equal(created.status, 201, `notice creation failed: ${created.text}`);
  return created.data;
}

/** Publishes a draft and asserts success. */
async function publishNotice(token, noticeId) {
  const published = await api(`/api/notices/${noticeId}/publish`, { method: "POST", token });
  assert.equal(published.status, 200, `publish failed: ${published.text}`);
  return published.data;
}

/** Counts the notice notifications a student actually received. */
async function noticeNotifications(token, noticeId) {
  const { Notification } = await import("../src/models/index.js");
  const rows = await Notification.find({ user: token.userId }).lean();
  return rows.filter(
    (row) =>
      String(row.metadata?.noticeId || "") === noticeId &&
      String(row.category || "") === "notice",
  );
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const PAST = new Date(Date.now() - 3 * 86400000).toISOString();

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

  const adminToken = await activate(
    "admin@collegeos.test",
    process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD,
    "Collegeos@Admin1",
  );
  ctx.adminToken = adminToken;

  // A course is required by the examination routes and gives the
  // cohort fixtures something real to be enrolled against.
  const course = await api("/api/courses", {
    method: "POST",
    token: adminToken,
    body: {
      code: "CS401",
      name: "Software Engineering",
      department: "Computer Science",
      program: "BScIT",
      semester: 4,
      credits: 4,
      courseType: "CORE",
    },
  });
  assert.equal(course.status, 201, `course creation failed: ${course.text}`);
  ctx.courseId = course.data.course.id;

  ctx.teacher = await provision(adminToken, {
    firstName: "Suresh",
    lastName: "Karki",
    role: "faculty",
    designation: "Lecturer",
  });
  ctx.otherTeacher = await provision(adminToken, {
    firstName: "Anita",
    lastName: "Basnet",
    role: "faculty",
    designation: "Lecturer",
  });
  ctx.registrar = await provision(adminToken, {
    firstName: "Rekha",
    lastName: "Poudel",
    role: "registrar",
    designation: "Registrar",
  });
  ctx.examOfficer = await provision(adminToken, {
    firstName: "Deepak",
    lastName: "Gurung",
    role: "exam_officer",
    designation: "Examination Officer",
  });

  // Semester 4 and Semester 2 students in the same programme and batch,
  // so cohort targeting has a real discriminator between them.
  ctx.studentA = await provision(adminToken, {
    firstName: "Sita",
    lastName: "Tamang",
    role: "student",
    studentId: "BCA25001",
    program: "BScIT",
    batch: "2025",
    semester: 4,
    section: "A1",
  });
  ctx.studentB = await provision(adminToken, {
    firstName: "Bikash",
    lastName: "Thapa",
    role: "student",
    studentId: "BCA25002",
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

/* ------------------------------------------------------------------ */
/* Access control                                                      */
/* ------------------------------------------------------------------ */

test("the notice board requires a session", async () => {
  const anonymous = await api("/api/notices");
  assert.equal(anonymous.status, 401);

  const student = await api("/api/notices", { token: ctx.studentA.token });
  assert.equal(student.status, 200, student.text);
  assert.ok(Array.isArray(student.data.notices));
});

test("students cannot compose notices or stage attachments", async () => {
  const compose = await api("/api/notices", {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      title: "Student announcement",
      contentHtml: "<p>Not allowed</p>",
      targetRoles: ["student"],
      audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
    },
  });
  assert.equal(compose.status, 403, compose.text);

  const upload = await api("/api/notices/upload", {
    method: "POST",
    token: ctx.studentA.token,
    body: uploadForm("handout.pdf", PDF_BYTES, "application/pdf"),
  });
  assert.equal(upload.status, 403, upload.text);
});

/* ------------------------------------------------------------------ */
/* Audience enforcement                                                */
/* ------------------------------------------------------------------ */

test("a teacher may publish only to a specific audience", async () => {
  const specific = await createNotice(ctx.teacher.token, {
    title: "CS401 office hours",
    contentHtml: "<p>Office hours moved to Thursday.</p>",
    targetRoles: ["student"],
    audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
  });
  assert.equal(specific.notice.status, "PUBLISHED");

  const collegeWide = await api("/api/notices", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Whole college",
      contentHtml: "<p>Everyone</p>",
      targetRoles: ["ALL"],
      audience: { targetType: "ALL" },
    },
  });
  assert.equal(collegeWide.status, 422, collegeWide.text);

  const staffWide = await api("/api/notices", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "All staff",
      contentHtml: "<p>Staff only</p>",
      targetRoles: ["staff"],
      audience: { targetType: "STAFF" },
    },
  });
  assert.equal(staffWide.status, 422, staffWide.text);
});

test("an empty specific audience is rejected", async () => {
  const empty = await api("/api/notices", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "No audience",
      contentHtml: "<p>Nobody</p>",
      targetRoles: ["student"],
      audience: { targetType: "SPECIFIC", target: {} },
    },
  });
  assert.equal(empty.status, 422, empty.text);
});

test("a registrar may publish college-wide and staff-wide", async () => {
  const collegeWide = await createNotice(ctx.registrar.token, {
    title: "College holiday",
    contentHtml: "<p>Campus closed Friday.</p>",
    targetRoles: ["ALL"],
    audience: { targetType: "ALL" },
  });
  assert.equal(collegeWide.notice.status, "PUBLISHED");

  const staffWide = await createNotice(ctx.registrar.token, {
    title: "Staff meeting",
    contentHtml: "<p>All hands Monday.</p>",
    targetRoles: ["faculty", "staff"],
    audience: { targetType: "STAFF" },
  });
  assert.equal(staffWide.notice.status, "PUBLISHED");
});

/* ------------------------------------------------------------------ */
/* Validation and sanitization                                       */
/* ------------------------------------------------------------------ */

test("rich text is sanitized on write", async () => {
  const created = await createNotice(ctx.teacher.token, {
    title: "Sanitized notice",
    contentHtml:
      '<script>alert("xss")</script>' +
      '<p onclick="evil()">Hello</p>' +
      '<a href="javascript:evil()">link</a>' +
      '<img src="x" onerror="evil()">' +
      '<span style="color: #ff0000; position: fixed">red</span>',
    targetRoles: ["student"],
    audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
  });

  const detail = await api(`/api/notices/${created.noticeId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(detail.status, 200, detail.text);
  const html = detail.data.notice.contentHtml;
  assert.ok(html, "contentHtml is stored");
  assert.ok(!html.includes("<script"), "scripts are stripped");
  assert.ok(!html.includes("onclick"), "event handlers are stripped");
  assert.ok(!html.includes("onerror"), "image handlers are stripped");
  assert.ok(!html.includes("javascript:"), "javascript URLs are stripped");
  assert.ok(!html.includes("position"), "unsafe CSS is stripped");
  assert.ok(html.includes("color: #ff0000"), "safe color CSS is kept");
  assert.ok(html.includes("Hello"), "text content is kept");
});

test("a notice body is required", async () => {
  const empty = await api("/api/notices", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Empty body",
      contentHtml: "   ",
      targetRoles: ["student"],
      audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
    },
  });
  assert.equal(empty.status, 422, empty.text);
});

test("titles are bounded", async () => {
  const long = await api("/api/notices", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "T".repeat(181),
      contentHtml: "<p>Body</p>",
      targetRoles: ["student"],
      audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
    },
  });
  assert.equal(long.status, 422, long.text);
});

/* ------------------------------------------------------------------ */
/* Draft lifecycle                                                   */
/* ------------------------------------------------------------------ */

test("a draft stays invisible until it is published", async () => {
  const draft = await createNotice(ctx.teacher.token, {
    title: "Draft syllabus update",
    contentHtml: "<p>Not yet visible.</p>",
    targetRoles: ["student"],
    audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
    status: "DRAFT",
  });
  assert.equal(draft.notice.status, "DRAFT");

  const list = await api("/api/notices", { token: ctx.studentA.token });
  assert.equal(
    list.data.notices.some((notice) => notice.id === draft.noticeId),
    false,
    "students never see drafts",
  );
  const detail = await api(`/api/notices/${draft.noticeId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(detail.status, 404, "draft detail is hidden from students");

  const managerDetail = await api(`/api/notices/${draft.noticeId}`, {
    token: ctx.registrar.token,
  });
  assert.equal(managerDetail.status, 200, "managers see drafts");
  assert.equal(managerDetail.data.notice.status, "DRAFT");

  await publishNotice(ctx.teacher.token, draft.noticeId);
  const published = await api(`/api/notices/${draft.noticeId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(published.status, 200, published.text);
  assert.equal(published.data.notice.status, "PUBLISHED");
});

test("publishing a draft is idempotent and notifies once", async () => {
  const draft = await createNotice(ctx.teacher.token, {
    title: "Idempotent publication",
    contentHtml: "<p>Published exactly once.</p>",
    targetRoles: ["student"],
    audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
    status: "DRAFT",
  });

  await publishNotice(ctx.teacher.token, draft.noticeId);
  const retry = await publishNotice(ctx.teacher.token, draft.noticeId);
  assert.equal(retry.notice.status, "PUBLISHED");

  const delivered = await noticeNotifications(ctx.studentA, draft.noticeId);
  assert.equal(delivered.length, 1, "a retried publish cannot notify twice");
  assert.equal(delivered[0].actionUrl, "/notices");
  assert.ok(
    String(delivered[0].title).startsWith("Notice: "),
    "the notification names the notice",
  );
});

test("an archived notice is withdrawn and can be restored", async () => {
  const published = await createNotice(ctx.teacher.token, {
    title: "Withdrawn notice",
    contentHtml: "<p>No longer true.</p>",
    targetRoles: ["student"],
    audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
  });

  const archived = await api(
    `/api/notices/${published.noticeId}/archive`,
    { method: "POST", token: ctx.teacher.token },
  );
  assert.equal(archived.status, 200, archived.text);

  const student = await api(`/api/notices/${published.noticeId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(student.status, 404, "archived notices leave the board");

  const manager = await api(`/api/notices/${published.noticeId}`, {
    token: ctx.registrar.token,
  });
  assert.equal(manager.status, 200, "managers still see the record");
  assert.equal(manager.data.notice.status, "ARCHIVED");

  const publishArchived = await api(
    `/api/notices/${published.noticeId}/publish`,
    { method: "POST", token: ctx.teacher.token },
  );
  assert.equal(publishArchived.status, 422, "archived notices cannot publish");

  const restored = await api(
    `/api/notices/${published.noticeId}/restore`,
    { method: "POST", token: ctx.teacher.token },
  );
  assert.equal(restored.status, 200, restored.text);
  const back = await api(`/api/notices/${published.noticeId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(back.status, 200, "restored notices return to the board");

  const restoreAgain = await api(
    `/api/notices/${published.noticeId}/restore`,
    { method: "POST", token: ctx.teacher.token },
  );
  assert.equal(restoreAgain.status, 422, "only archived notices restore");
});

/* ------------------------------------------------------------------ */
/* Visibility rules                                                  */
/* ------------------------------------------------------------------ */

test("cohort targeting limits the audience", async () => {
  const created = await createNotice(ctx.registrar.token, {
    title: "Semester 4 exam routine",
    contentHtml: "<p>For BCA 2025 Semester 4 only.</p>",
    targetRoles: ["ALL"],
    audience: {
      targetType: "SPECIFIC",
      target: {
        programCodes: ["BScIT"],
        batchYears: ["2025"],
        semesters: [4],
        allSections: true,
      },
    },
  });

  const inCohort = await api(`/api/notices/${created.noticeId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(inCohort.status, 200, "the Semester 4 student sees the notice");

  const outOfCohort = await api(`/api/notices/${created.noticeId}`, {
    token: ctx.studentB.token,
  });
  assert.equal(outOfCohort.status, 404, "the Semester 2 student does not");
});

test("expired notices disappear from student view", async () => {
  const created = await createNotice(ctx.registrar.token, {
    title: "Expired notice",
    contentHtml: "<p>Past its expiry.</p>",
    targetRoles: ["ALL"],
    audience: { targetType: "ALL" },
    expiresAt: PAST,
  });

  const student = await api(`/api/notices/${created.noticeId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(student.status, 404, "expired notices are invisible to students");

  const manager = await api(`/api/notices/${created.noticeId}`, {
    token: ctx.registrar.token,
  });
  assert.equal(manager.status, 200, "managers can review expired records");
});

test("explicit target users restrict visibility", async () => {
  const created = await createNotice(ctx.registrar.token, {
    title: "Personal notice",
    contentHtml: "<p>For one student only.</p>",
    targetRoles: ["ALL"],
    audience: { targetType: "SPECIFIC", target: { userIds: [ctx.studentA.userId] } },
    targetUsers: [ctx.studentA.userId],
  });

  const addressed = await api(`/api/notices/${created.noticeId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(addressed.status, 200, "the addressed student sees it");

  const other = await api(`/api/notices/${created.noticeId}`, {
    token: ctx.studentB.token,
  });
  assert.equal(other.status, 404, "other students do not");
});

test("only the author or a manager may edit a notice", async () => {
  const created = await createNotice(ctx.teacher.token, {
    title: "Editable notice",
    contentHtml: "<p>Original text.</p>",
    targetRoles: ["student"],
    audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
  });

  const stranger = await api(`/api/notices/${created.noticeId}`, {
    method: "PATCH",
    token: ctx.otherTeacher.token,
    body: { title: "Hijacked" },
  });
  assert.equal(stranger.status, 403, stranger.text);

  const author = await api(`/api/notices/${created.noticeId}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { title: "Updated title" },
  });
  assert.equal(author.status, 200, author.text);
  assert.equal(author.data.notice.title, "Updated title");
});

/* ------------------------------------------------------------------ */
/* Attachments                                                     */
/* ------------------------------------------------------------------ */

test("attachments are staged, bound and entitlement-checked", async () => {
  const uploaded = await api("/api/notices/upload", {
    method: "POST",
    token: ctx.teacher.token,
    body: uploadForm("syllabus.pdf", PDF_BYTES, "application/pdf"),
  });
  assert.equal(uploaded.status, 201, uploaded.text);
  const fileId = uploaded.data.files[0].fileId;
  assert.equal(uploaded.data.files[0].isPreviewable, true);
  assert.equal(uploaded.data.files[0].isPdf, true);

  const created = await createNotice(ctx.teacher.token, {
    title: "Notice with attachment",
    contentHtml: "<p>See the attached syllabus.</p>",
    targetRoles: ["student"],
    audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
    attachments: [fileId],
  });
  assert.equal(created.notice.attachments.length, 1);
  assert.equal(created.notice.attachments[0].fileId, fileId);
  assert.equal(created.notice.attachments[0].originalName, "syllabus.pdf");

  const detail = await api(`/api/notices/${created.noticeId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(detail.status, 200, detail.text);
  assert.equal(detail.data.notice.attachments[0].fileId, fileId);

  const served = await api(`/api/files/${fileId}`, { token: ctx.studentA.token });
  assert.equal(served.status, 200, "the addressed student may download");
  assert.equal(served.text, PDF_BYTES.toString("latin1"));

  const denied = await api(`/api/files/${fileId}`, { token: ctx.otherTeacher.token });
  assert.equal(denied.status, 404, "a non-audience teacher cannot read the file");

  const foreignAttach = await api(
    `/api/notices/${created.noticeId}/attachments`,
    {
      method: "POST",
      token: ctx.otherTeacher.token,
      body: { fileIds: [fileId] },
    },
  );
  assert.equal(foreignAttach.status, 403, "only the author or a manager may attach");
});

test("images are staged as previewable attachments", async () => {
  const uploaded = await api("/api/notices/upload", {
    method: "POST",
    token: ctx.teacher.token,
    body: uploadForm("flyer.png", PNG_BYTES, "image/png"),
  });
  assert.equal(uploaded.status, 201, uploaded.text);
  assert.equal(uploaded.data.files[0].isImage, true);
  assert.equal(uploaded.data.files[0].isPreviewable, true);
});

test("forbidden file types never reach the store", async () => {
  const rejected = await api("/api/notices/upload", {
    method: "POST",
    token: ctx.teacher.token,
    body: uploadForm("evil.html", Buffer.from("<script>alert(1)</script>"), "text/html"),
  });
  assert.ok(rejected.status >= 400, `expected rejection, got ${rejected.status}`);
});

test("attachments may be added and removed", async () => {
  const first = await api("/api/notices/upload", {
    method: "POST",
    token: ctx.teacher.token,
    body: uploadForm("a.pdf", PDF_BYTES, "application/pdf"),
  });
  assert.equal(first.status, 201, first.text);
  const second = await api("/api/notices/upload", {
    method: "POST",
    token: ctx.teacher.token,
    body: uploadForm("b.pdf", PDF_BYTES, "application/pdf"),
  });
  assert.equal(second.status, 201, second.text);

  const created = await createNotice(ctx.teacher.token, {
    title: "Attachment lifecycle",
    contentHtml: "<p>Attachments change over time.</p>",
    targetRoles: ["student"],
    audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
    attachments: [first.data.files[0].fileId],
  });

  const added = await api(
    `/api/notices/${created.noticeId}/attachments`,
    {
      method: "POST",
      token: ctx.teacher.token,
      body: { fileIds: [second.data.files[0].fileId] },
    },
  );
  assert.equal(added.status, 200, added.text);
  assert.equal(added.data.attachments.length, 2);

  const removed = await api(
    `/api/notices/${created.noticeId}/attachments/${second.data.files[0].fileId}`,
    { method: "DELETE", token: ctx.teacher.token },
  );
  assert.equal(removed.status, 200, removed.text);
  assert.equal(removed.data.attachments.length, 1);
  assert.equal(removed.data.attachments[0].fileId, first.data.files[0].fileId);
});

test("a notice carries at most ten attachments", async () => {
  const ids = Array.from({ length: 11 }, () => "507f1f77bcf86cd799439011");
  const tooMany = await api("/api/notices", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Too many attachments",
      contentHtml: "<p>Rejected.</p>",
      targetRoles: ["student"],
      audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
      attachments: ids,
    },
  });
  assert.equal(tooMany.status, 422, tooMany.text);
});

/* ------------------------------------------------------------------ */
/* Examination linkage                                             */
/* ------------------------------------------------------------------ */

test("a notice may be linked to an exam", async () => {
  const exam = await api("/api/exams", {
    method: "POST",
    token: ctx.examOfficer.token,
    body: {
      title: "CS401 Midterm",
      examDate: FUTURE.slice(0, 10),
      startTime: "10:00",
      endTime: "12:00",
      program: "BScIT",
      semester: 4,
      courseId: ctx.courseId,
      batch: "2025",
    },
  });
  assert.equal(exam.status, 201, `exam creation failed: ${exam.text}`);

  const created = await createNotice(ctx.examOfficer.token, {
    title: "Midterm arrangement",
    contentHtml: "<p>Bring your hall ticket.</p>",
    targetRoles: ["student"],
    audience: { targetType: "SPECIFIC", target: { roleIds: ["student"] } },
    examId: exam.data.exam.id,
  });
  assert.equal(created.notice.examId, exam.data.exam.id);

  const byExam = await api(`/api/notices/exam/${exam.data.exam.id}`, {
    token: ctx.studentA.token,
  });
  assert.equal(byExam.status, 200, byExam.text);
  assert.equal(byExam.data.notice.id, created.noticeId);
});

/* ------------------------------------------------------------------ */
/* Notifications                                                   */
/* ------------------------------------------------------------------ */

test("publication notifies the addressed audience", async () => {
  const created = await createNotice(ctx.registrar.token, {
    title: "Urgent: campus alert",
    contentHtml: "<p>Please read carefully.</p>",
    category: "URGENT",
    priority: "URGENT",
    targetRoles: ["ALL"],
    audience: { targetType: "ALL" },
  });

  const forA = await noticeNotifications(ctx.studentA, created.noticeId);
  const forB = await noticeNotifications(ctx.studentB, created.noticeId);
  assert.equal(forA.length, 1, "every active account is notified");
  assert.equal(forB.length, 1, "every active account is notified");
  assert.equal(forA[0].category, "notice");
  assert.equal(forA[0].priority, "urgent");
  assert.equal(forA[0].actionUrl, "/notices");
  assert.ok(
    String(forA[0].message).includes("Please read carefully"),
    "the notification carries a plain-text summary",
  );
});
