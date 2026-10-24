import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Online Coding Lab integration suite.
 *
 * Exercises the real MongoDB-backed Express app on an ephemeral
 * port and a dedicated test database, following the conventions of
 * api.test.js: identity, teaching scopes, enrolment and sharing
 * rules are all enforced against stored records, never mocked.
 *
 * The execution provider (Judge0) is intentionally NOT configured
 * in this environment, so the suite asserts the disabled-provider
 * contract (clear 403s, honest `configured: false`) plus every
 * validation and authorisation rule that does not need a live
 * provider.
 */

const TEST_DB = process.env.COLLEGEOS_CODING_TEST_DB || "collegeos_coding_test";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";

// The app reads these at module load, so they are set before anything is imported.
process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-coding-lab-suite-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";
process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR = "2025/2026";

const ctx = {};
let baseUrl = "";
let server = null;
let mongooseRef = null;

async function api(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(baseUrl + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
  return { status: response.status, data, text };
}

async function login(email, password) {
  const res = await api("/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.text}`);
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
  const created = await api("/api/admin/users", { method: "POST", token: actorToken, body });
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

const FUTURE = new Date(Date.now() + 7 * 86400000).toISOString();
const PAST = new Date(Date.now() - 7 * 86400000).toISOString();

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

  const adminToken = await activate(
    "admin@collegeos.test",
    process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD,
    "Collegeos@Admin1",
  );
  ctx.adminToken = adminToken;

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

  ctx.courseSem4 = await createCourse(adminToken, {
    code: "CS401",
    name: "Software Engineering",
    department: "Computer Science",
    program: "BCA",
    semester: 4,
    credits: 4,
    courseType: "CORE",
  });
  ctx.courseSem2 = await createCourse(adminToken, {
    code: "CS201",
    name: "Data Structures",
    department: "Computer Science",
    program: "BCA",
    semester: 2,
    credits: 4,
    courseType: "CORE",
  });

  for (const semester of [2, 4]) {
    const section = await api("/api/sections", {
      method: "POST",
      token: adminToken,
      body: { code: "A1", program: "BCA", semester, batch: "2025", room: "Hall 101" },
    });
    assert.equal(section.status, 201, `section creation failed: ${section.text}`);
  }

  ctx.studentA = await provision(adminToken, {
    firstName: "Sita",
    lastName: "Tamang",
    role: "student",
    studentId: "BCA25001",
    program: "BCA",
    batch: "2025",
    semester: 4,
    section: "A1",
  });
  ctx.studentB = await provision(adminToken, {
    firstName: "Bikash",
    lastName: "Thapa",
    role: "student",
    studentId: "BCA25002",
    program: "BCA",
    batch: "2025",
    semester: 2,
    section: "A1",
  });

  // The teacher teaches CS401 section A1 only.
  const teaching = await api("/api/admin/teaching-assignments", {
    method: "POST",
    token: adminToken,
    body: {
      facultyUserId: ctx.teacher.userId,
      courseId: ctx.courseSem4.id,
      sectionCode: "A1",
      semester: 4,
    },
  });
  assert.equal(teaching.status, 201, `teaching assignment failed: ${teaching.text}`);

  // Student provisioning auto-enrols the account in every course of
  // its semester and section (see administration.js), so the lab's
  // enrolment-based sharing is already exercised against real records.
  const { Student } = await import("../src/models/index.js");
  const studentDocA = await Student.findOne({ user: ctx.studentA.userId });
  const studentDocB = await Student.findOne({ user: ctx.studentB.userId });
  assert.ok(studentDocA, "student A document exists");
  assert.ok(studentDocB, "student B document exists");
  const { Enrollment } = await import("../src/models/index.js");
  const enrolmentA = await Enrollment.findOne({
    student: studentDocA._id,
    course: ctx.courseSem4.id,
  });
  assert.ok(enrolmentA, "student A is enrolled in the semester 4 course");
  const enrolmentB = await Enrollment.findOne({
    student: studentDocB._id,
    course: ctx.courseSem2.id,
  });
  assert.ok(enrolmentB, "student B is enrolled in the semester 2 course");
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

test("the coding lab is limited to students and teachers", async () => {
  const registrar = await api("/api/coding/projects", { token: ctx.registrar.token });
  assert.equal(registrar.status, 403);

  const anonymous = await api("/api/coding/projects");
  assert.equal(anonymous.status, 401);

  const coordinator = await api("/api/coding/languages", { token: ctx.registrar.token });
  assert.equal(coordinator.status, 403);
});

test("students and teachers reach the language catalogue", async () => {
  for (const token of [ctx.teacher.token, ctx.studentA.token]) {
    const res = await api("/api/coding/languages", { token });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.data.configured, false, "no provider is configured in tests");
    assert.ok(Array.isArray(res.data.languages));
  }
});

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

test("a teacher creates, reads, updates and soft-deletes a project", async () => {
  const created = await api("/api/coding/projects", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Hello Python",
      description: "First lab project",
      defaultLanguage: "python",
      courseId: ctx.courseSem4.id,
      sectionCode: "A1",
    },
  });
  assert.equal(created.status, 201, created.text);
  const project = created.data.project;
  assert.equal(project.ownerRole, "faculty");
  assert.equal(project.defaultLanguage, "python");
  assert.equal(project.files.length, 1);
  assert.equal(project.files[0].name, "main.py");
  assert.equal(project.files[0].isMain, true);
  ctx.teacherProjectId = project.id;

  const read = await api(`/api/coding/projects/${project.id}`, { token: ctx.teacher.token });
  assert.equal(read.status, 200);
  assert.equal(read.data.project.title, "Hello Python");

  const patched = await api(`/api/coding/projects/${project.id}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { title: "Hello Python (renamed)" },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.project.title, "Hello Python (renamed)");

  const removed = await api(`/api/coding/projects/${project.id}`, {
    method: "DELETE",
    token: ctx.teacher.token,
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.deleted, true);

  const gone = await api(`/api/coding/projects/${project.id}`, { token: ctx.teacher.token });
  assert.equal(gone.status, 404);
});

test("playground projects ship the three web files", async () => {
  const created = await api("/api/coding/projects", {
    method: "POST",
    token: ctx.teacher.token,
    body: { title: "Web Playground", projectType: "PLAYGROUND" },
  });
  assert.equal(created.status, 201, created.text);
  const names = created.data.project.files.map((file) => file.name).sort();
  assert.deepEqual(names, ["index.html", "script.js", "style.css"]);
  ctx.playgroundProjectId = created.data.project.id;
});

test("projects are private to their owner", async () => {
  const created = await api("/api/coding/projects", {
    method: "POST",
    token: ctx.studentA.token,
    body: { title: "My private solver", defaultLanguage: "javascript" },
  });
  assert.equal(created.status, 201, created.text);
  ctx.studentProjectId = created.data.project.id;

  const stranger = await api(`/api/coding/projects/${ctx.studentProjectId}`, {
    token: ctx.studentB.token,
  });
  assert.equal(stranger.status, 404);

  const patched = await api(`/api/coding/projects/${ctx.studentProjectId}`, {
    method: "PATCH",
    token: ctx.studentB.token,
    body: { title: "hijacked" },
  });
  assert.equal(patched.status, 404);

  const removed = await api(`/api/coding/projects/${ctx.studentProjectId}`, {
    method: "DELETE",
    token: ctx.studentB.token,
  });
  assert.equal(removed.status, 404);

  const owner = await api(`/api/coding/projects/${ctx.studentProjectId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(owner.status, 200);
  assert.equal(owner.data.project.title, "My private solver");
});

test("project file input is validated", async () => {
  const traversal = await api("/api/coding/projects", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Bad files",
      files: [{ name: "../evil.py", content: "print(1)" }],
    },
  });
  assert.equal(traversal.status, 422);

  const tooMany = await api("/api/coding/projects", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Too many files",
      files: Array.from({ length: 21 }, (_, index) => ({
        name: `file${index}.py`,
        content: "",
      })),
    },
  });
  assert.equal(tooMany.status, 422);

  const badLanguage = await api("/api/coding/projects", {
    method: "POST",
    token: ctx.teacher.token,
    body: { title: "Bad language", defaultLanguage: "cobol" },
  });
  assert.equal(badLanguage.status, 422);
});

/* ------------------------------------------------------------------ */
/* Execution provider                                                  */
/* ------------------------------------------------------------------ */

test("execution requests are validated before dispatch", async () => {
  const unsupported = await api("/api/coding/execute", {
    method: "POST",
    token: ctx.studentA.token,
    body: { languageId: "cobol", sourceCode: "print(1)" },
  });
  assert.equal(unsupported.status, 400);

  const playgroundOnly = await api("/api/coding/execute", {
    method: "POST",
    token: ctx.studentA.token,
    body: { languageId: "html", sourceCode: "<p>hi</p>" },
  });
  assert.equal(playgroundOnly.status, 400);

  const empty = await api("/api/coding/execute", {
    method: "POST",
    token: ctx.studentA.token,
    body: { languageId: "python", sourceCode: "   " },
  });
  assert.equal(empty.status, 422);

  const hugeStdin = await api("/api/coding/execute", {
    method: "POST",
    token: ctx.studentA.token,
    body: { languageId: "python", sourceCode: "print(1)", stdin: "x".repeat(65 * 1024) },
  });
  assert.equal(hugeStdin.status, 422);
});

test("execution explains that no provider is configured", async () => {
  const res = await api("/api/coding/execute", {
    method: "POST",
    token: ctx.studentA.token,
    body: { languageId: "python", sourceCode: "print('hi')" },
  });
  assert.equal(res.status, 403);
  assert.match(res.data.error, /not configured/);
});

test("execution records are private to their owner", async () => {
  const res = await api("/api/coding/executions/012345678901234567890123", {
    token: ctx.studentA.token,
  });
  assert.equal(res.status, 404);
});

/* ------------------------------------------------------------------ */
/* Sharing                                                             */
/* ------------------------------------------------------------------ */

test("a teacher shares a course project and enrolled students see it", async () => {
  const created = await api("/api/coding/projects", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Shared lab",
      defaultLanguage: "python",
      files: [{ name: "main.py", content: "print('lab')", isMain: true }],
    },
  });
  assert.equal(created.status, 201, created.text);
  ctx.sharedProjectId = created.data.project.id;

  const share = await api(`/api/coding/projects/${ctx.sharedProjectId}/share`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { shareType: "COURSE", courseId: ctx.courseSem4.id, permission: "VIEW" },
  });
  assert.equal(share.status, 201, share.text);
  ctx.courseShareId = share.data.share.id;

  const enrolled = await api(`/api/coding/projects/${ctx.sharedProjectId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(enrolled.status, 200, enrolled.text);
  assert.equal(enrolled.data.project.shared, true);
  assert.equal(enrolled.data.project.sharePermission, "VIEW");

  const notEnrolled = await api(`/api/coding/projects/${ctx.sharedProjectId}`, {
    token: ctx.studentB.token,
  });
  assert.equal(notEnrolled.status, 404);

  const sharedList = await api("/api/coding/shared", { token: ctx.studentA.token });
  assert.equal(sharedList.status, 200);
  assert.ok(
    sharedList.data.projects.some((row) => row.id === ctx.sharedProjectId),
    "the shared project is listed for the enrolled student",
  );
});

test("students may not share projects", async () => {
  const res = await api(`/api/coding/projects/${ctx.studentProjectId}/share`, {
    method: "POST",
    token: ctx.studentA.token,
    body: { shareType: "COURSE", courseId: ctx.courseSem4.id },
  });
  assert.equal(res.status, 403);
});

test("teachers may only share courses they teach", async () => {
  const own = await api("/api/coding/projects", {
    method: "POST",
    token: ctx.otherTeacher.token,
    body: { title: "Other teacher project", defaultLanguage: "python" },
  });
  assert.equal(own.status, 201, own.text);

  const res = await api(`/api/coding/projects/${own.data.project.id}/share`, {
    method: "POST",
    token: ctx.otherTeacher.token,
    body: { shareType: "COURSE", courseId: ctx.courseSem4.id },
  });
  assert.equal(res.status, 403);
});

test("copy permission lets a student open a shared project as a copy", async () => {
  const share = await api(`/api/coding/projects/${ctx.sharedProjectId}/share`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { shareType: "COURSE", courseId: ctx.courseSem4.id, permission: "COPY" },
  });
  assert.equal(share.status, 201, share.text);
  ctx.copyShareId = share.data.share.id;

  const copy = await api(`/api/coding/projects/${ctx.sharedProjectId}/duplicate`, {
    method: "POST",
    token: ctx.studentA.token,
    body: {},
  });
  assert.equal(copy.status, 201, copy.text);
  assert.equal(copy.data.project.copiedFrom, ctx.sharedProjectId);
  assert.equal(copy.data.project.ownerUser, ctx.studentA.userId);
  assert.equal(copy.data.project.ownerRole, "student");

  const mine = await api(`/api/coding/projects/${copy.data.project.id}`, {
    token: ctx.studentA.token,
  });
  assert.equal(mine.status, 200);
});

test("view-only shares cannot be duplicated", async () => {
  // Remove every active share, then grant view-only access.
  for (const shareId of [ctx.courseShareId, ctx.copyShareId]) {
    const revoked = await api(`/api/coding/shares/${shareId}`, {
      method: "DELETE",
      token: ctx.teacher.token,
    });
    assert.equal(revoked.status, 200, revoked.text);
  }
  const viewShare = await api(`/api/coding/projects/${ctx.sharedProjectId}/share`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { shareType: "COURSE", courseId: ctx.courseSem4.id, permission: "VIEW" },
  });
  assert.equal(viewShare.status, 201, viewShare.text);
  ctx.courseShareId = viewShare.data.share.id;
  ctx.copyShareId = null;

  const refused = await api(`/api/coding/projects/${ctx.sharedProjectId}/duplicate`, {
    method: "POST",
    token: ctx.studentA.token,
    body: {},
  });
  assert.equal(refused.status, 404);
});

test("revoking a share removes student access", async () => {
  const before = await api(`/api/coding/projects/${ctx.sharedProjectId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(before.status, 200);

  const revoked = await api(`/api/coding/shares/${ctx.courseShareId}`, {
    method: "DELETE",
    token: ctx.teacher.token,
  });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.data.revoked, true);

  const after = await api(`/api/coding/projects/${ctx.sharedProjectId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(after.status, 404);
});

test("selected-student shares reach only the listed students", async () => {
  const share = await api(`/api/coding/projects/${ctx.sharedProjectId}/share`, {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      shareType: "STUDENTS",
      courseId: ctx.courseSem4.id,
      studentIds: [ctx.studentA.userId],
      permission: "COPY",
    },
  });
  assert.equal(share.status, 201, share.text);
  ctx.studentShareId = share.data.share.id;

  const listed = await api(`/api/coding/projects/${ctx.sharedProjectId}/shares`, {
    token: ctx.teacher.token,
  });
  assert.equal(listed.status, 200);
  assert.ok(listed.data.shares.some((row) => row.id === ctx.studentShareId));

  const enrolled = await api(`/api/coding/projects/${ctx.sharedProjectId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(enrolled.status, 200);

  const other = await api(`/api/coding/projects/${ctx.sharedProjectId}`, {
    token: ctx.studentB.token,
  });
  assert.equal(other.status, 404);
});

test("a student share requires an enrolled, active student", async () => {
  const res = await api(`/api/coding/projects/${ctx.sharedProjectId}/share`, {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      shareType: "STUDENTS",
      courseId: ctx.courseSem4.id,
      studentIds: [ctx.studentB.userId],
    },
  });
  assert.equal(res.status, 422);
});

test("the courses endpoint reflects teaching scopes and enrolments", async () => {
  const teacherCourses = await api("/api/coding/courses", { token: ctx.teacher.token });
  assert.equal(teacherCourses.status, 200);
  assert.ok(
    teacherCourses.data.courses.some((row) => row.courseId === ctx.courseSem4.id),
    "the teacher's course is listed",
  );

  const studentCourses = await api("/api/coding/courses", { token: ctx.studentA.token });
  assert.equal(studentCourses.status, 200);
  assert.ok(
    studentCourses.data.courses.some(
      (row) => row.courseId === ctx.courseSem4.id && row.sectionCode === "A1",
    ),
    "the student's enrolment is listed with its section",
  );
});

test("the course roster endpoint is scoped to authorised teachers", async () => {
  const roster = await api(
    `/api/coding/courses/${ctx.courseSem4.id}/students`,
    { token: ctx.teacher.token },
  );
  assert.equal(roster.status, 200, roster.text);
  assert.ok(
    roster.data.students.some((row) => row.userId === ctx.studentA.userId),
    "the enrolled student appears in the roster",
  );

  const outsider = await api(
    `/api/coding/courses/${ctx.courseSem4.id}/students`,
    { token: ctx.otherTeacher.token },
  );
  assert.equal(outsider.status, 403);
});

/* ------------------------------------------------------------------ */
/* Assignments and submissions                                         */
/* ------------------------------------------------------------------ */

test("a teacher creates a coding assignment for a course they teach", async () => {
  const created = await api("/api/coding/assignments", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "FizzBuzz in Python",
      description: "Implement FizzBuzz.",
      instructions: "Print numbers 1..20 with Fizz/Buzz substitutions.",
      courseId: ctx.courseSem4.id,
      sectionCodes: ["A1"],
      dueAt: FUTURE,
      maxMarks: 50,
      allowedLanguages: ["python", "javascript"],
      starterFiles: [{ name: "main.py", content: "# starter", language: "python", isMain: true }],
      exampleInput: "",
      exampleOutput: "1\n2\nFizz",
    },
  });
  assert.equal(created.status, 201, created.text);
  const assignment = created.data.assignment;
  assert.equal(assignment.status, "OPEN");
  assert.equal(assignment.maxMarks, 50);
  assert.deepEqual(assignment.allowedLanguages, ["python", "javascript"]);
  assert.equal(assignment.starterFiles[0].name, "main.py");
  ctx.assignmentId = assignment.id;
});

test("assignments are visible to enrolled students only", async () => {
  const student = await api(`/api/coding/assignments/${ctx.assignmentId}`, {
    token: ctx.studentA.token,
  });
  assert.equal(student.status, 200, student.text);
  assert.equal(student.data.assignment.title, "FizzBuzz in Python");

  const outsider = await api(`/api/coding/assignments/${ctx.assignmentId}`, {
    token: ctx.studentB.token,
  });
  assert.equal(outsider.status, 404);

  const unauthorizedTeacher = await api(`/api/coding/assignments/${ctx.assignmentId}`, {
    token: ctx.otherTeacher.token,
  });
  assert.equal(unauthorizedTeacher.status, 404);

  const list = await api("/api/coding/assignments", { token: ctx.studentA.token });
  assert.equal(list.status, 200);
  assert.ok(list.data.assignments.some((row) => row.id === ctx.assignmentId));
  assert.equal(list.data.assignments[0].isPastDue, false);
});

test("students may not create or edit assignments", async () => {
  const create = await api("/api/coding/assignments", {
    method: "POST",
    token: ctx.studentA.token,
    body: { title: "nope", courseId: ctx.courseSem4.id, dueAt: FUTURE },
  });
  assert.equal(create.status, 403);

  const edit = await api(`/api/coding/assignments/${ctx.assignmentId}`, {
    method: "PATCH",
    token: ctx.studentA.token,
    body: { title: "hijacked" },
  });
  assert.equal(edit.status, 403);
});

test("teachers may only create assignments for courses they teach", async () => {
  const res = await api("/api/coding/assignments", {
    method: "POST",
    token: ctx.otherTeacher.token,
    body: {
      title: "Not mine",
      courseId: ctx.courseSem4.id,
      dueAt: FUTURE,
    },
  });
  assert.equal(res.status, 403);
});

test("a student submits and updates an assignment submission", async () => {
  const first = await api(`/api/coding/assignments/${ctx.assignmentId}/submissions`, {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      language: "python",
      files: [{ name: "main.py", content: "print('FizzBuzz')", isMain: true }],
    },
  });
  assert.equal(first.status, 201, first.text);
  const submission = first.data.submission;
  assert.equal(submission.status, "SUBMITTED");
  assert.equal(submission.version, 1);
  assert.equal(submission.isLate, false);
  ctx.submissionId = submission.id;

  const second = await api(`/api/coding/assignments/${ctx.assignmentId}/submissions`, {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      language: "python",
      files: [{ name: "main.py", content: "print('FizzBuzz v2')", isMain: true }],
    },
  });
  assert.equal(second.status, 201, second.text);
  assert.equal(second.data.submission.version, 2);
  assert.equal(second.data.submission.id, ctx.submissionId, "resubmission updates in place");

  const mine = await api(
    `/api/coding/assignments/${ctx.assignmentId}/submissions`,
    { token: ctx.studentA.token },
  );
  assert.equal(mine.status, 200);
  assert.equal(mine.data.submissions.length, 1);
  assert.equal(mine.data.submissions[0].files[0].content, "print('FizzBuzz v2')");
});

test("submissions validate language and enrolment", async () => {
  const disallowed = await api(`/api/coding/assignments/${ctx.assignmentId}/submissions`, {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      language: "java",
      files: [{ name: "Main.java", content: "class Main {}", isMain: true }],
    },
  });
  assert.equal(disallowed.status, 422);

  const noFiles = await api(`/api/coding/assignments/${ctx.assignmentId}/submissions`, {
    method: "POST",
    token: ctx.studentA.token,
    body: { language: "python", files: [] },
  });
  assert.equal(noFiles.status, 422);

  const notEnrolled = await api(`/api/coding/assignments/${ctx.assignmentId}/submissions`, {
    method: "POST",
    token: ctx.studentB.token,
    body: {
      language: "python",
      files: [{ name: "main.py", content: "print(1)", isMain: true }],
    },
  });
  assert.equal(notEnrolled.status, 403);
});

test("a closed assignment no longer accepts submissions", async () => {
  const closed = await api(`/api/coding/assignments/${ctx.assignmentId}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { status: "CLOSED" },
  });
  assert.equal(closed.status, 200);
  assert.equal(closed.data.assignment.status, "CLOSED");

  const refused = await api(`/api/coding/assignments/${ctx.assignmentId}/submissions`, {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      language: "python",
      files: [{ name: "main.py", content: "print(1)", isMain: true }],
    },
  });
  assert.equal(refused.status, 404);

  const reopened = await api(`/api/coding/assignments/${ctx.assignmentId}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { status: "OPEN" },
  });
  assert.equal(reopened.status, 200);
});

test("teachers review and grade submissions", async () => {
  const list = await api(
    `/api/coding/assignments/${ctx.assignmentId}/submissions`,
    { token: ctx.teacher.token },
  );
  assert.equal(list.status, 200, list.text);
  assert.equal(list.data.submissions.length, 1);
  assert.equal(list.data.submissions[0].studentUser, ctx.studentA.userId);
  assert.ok(list.data.submissions[0].studentName);

  // An unauthorised teacher learns nothing: the assignment
  // itself is hidden (404), not merely the submissions.
  const outsider = await api(
    `/api/coding/assignments/${ctx.assignmentId}/submissions`,
    { token: ctx.otherTeacher.token },
  );
  assert.equal(outsider.status, 404);

  const graded = await api(`/api/coding/submissions/${ctx.submissionId}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { marks: 42, feedback: "Correct approach, add input validation." },
  });
  assert.equal(graded.status, 200, graded.text);
  assert.equal(graded.data.submission.status, "GRADED");
  assert.equal(graded.data.submission.marks, 42);
  assert.equal(graded.data.submission.feedback, "Correct approach, add input validation.");
  assert.ok(graded.data.submission.gradedAt);

  const overMarks = await api(`/api/coding/submissions/${ctx.submissionId}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { marks: 51 },
  });
  assert.equal(overMarks.status, 422);

  const empty = await api(`/api/coding/submissions/${ctx.submissionId}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: {},
  });
  assert.equal(empty.status, 422);

  const studentCannotGrade = await api(`/api/coding/submissions/${ctx.submissionId}`, {
    method: "PATCH",
    token: ctx.studentA.token,
    body: { marks: 50 },
  });
  assert.equal(studentCannotGrade.status, 403);
});

test("a past-due submission is flagged as late", async () => {
  const created = await api("/api/coding/assignments", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Late lab",
      courseId: ctx.courseSem4.id,
      sectionCodes: ["A1"],
      dueAt: PAST,
      allowedLanguages: ["python"],
    },
  });
  assert.equal(created.status, 201, created.text);

  const submitted = await api(`/api/coding/assignments/${created.data.assignment.id}/submissions`, {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      language: "python",
      files: [{ name: "main.py", content: "print('late')", isMain: true }],
    },
  });
  assert.equal(submitted.status, 201, submitted.text);
  assert.equal(submitted.data.submission.isLate, true);
});

test("an assignment links a student's working project", async () => {
  const created = await api("/api/coding/projects", {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      title: "FizzBuzz in Python",
      projectType: "COMPILER",
      defaultLanguage: "python",
      assignmentId: ctx.assignmentId,
    },
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.data.project.assignment, ctx.assignmentId);

  const unenrolled = await api("/api/coding/projects", {
    method: "POST",
    token: ctx.studentB.token,
    body: {
      title: "Not enrolled",
      assignmentId: ctx.assignmentId,
    },
  });
  assert.equal(unenrolled.status, 403);
});
