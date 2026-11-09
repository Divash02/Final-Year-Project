import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * My Courses integration suite.
 *
 * `GET /api/my-courses` is the read model behind the My Courses page, so what is
 * being defended here is not the shape of the response but the four promises the
 * page makes to a student:
 *
 *  1. an empty database produces three honest empty buckets, never sample cards;
 *  2. In Progress holds only the caller's current-semester enrolments — a future
 *     enrolment can never leak into it;
 *  3. Past and Future are built from real enrolment rows, and a course the
 *     institution recorded nothing about reports "unavailable" rather than 0% or
 *     an invented grade;
 *  4. the list is scoped to the session. One student never sees another's courses,
 *     and the route is closed to accounts without `courses.view`.
 *
 * The suite runs against the real MongoDB-backed Express app on an ephemeral port
 * and a dedicated test database, so every assertion exercises the same
 * authorisation and persistence path production uses.
 */

const TEST_DB = process.env.COLLEGEOS_MYCOURSES_TEST_DB || "collegeos_mycourses_test";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";

// The app reads these at module load, so they are set before anything is imported.
process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-mycourses-suite-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";
process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR = "2025/2026";

const ctx = {};
let baseUrl = "";
let server = null;
let mongooseRef = null;
let InstitutionSettingModel = null;
let EnrollmentModel = null;
let StudentModel = null;
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

/** Signs in with a temporary password and completes the forced rotation. */
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

/** Creates a real course through the curriculum API. */
async function createCourse(body) {
  const res = await api("/api/courses", {
    method: "POST",
    token: ctx.adminToken,
    body,
  });
  assert.equal(res.status, 201, `course creation failed: ${res.text}`);
  return res.data.course;
}

/**
 * Records a historical or future enrolment.
 *
 * Provisioning only enrols a new student in the courses offered to their own
 * semester, so the earlier and later semesters of a study history cannot be
 * produced by it. They are written here as real `Enrollment` rows instead, which
 * is the same document the application stores and the same one the read model
 * queries — no fixture format, no parallel store.
 */
async function enrol({ userId, course, sectionCode, semester, status }) {
  const student = await StudentModel.findOne({ user: userId }).select("_id").lean();
  assert.ok(student, `no student record for user ${userId}`);

  // Upserted on the model's own unique key, so provisioning and this helper cannot
  // produce two rows for the same course, section and term.
  const row = await EnrollmentModel.findOneAndUpdate(
    { student: student._id, course: course.id, sectionCode, semester },
    {
      $set: {
        studentUser: userId,
        academicYear: "2025/2026",
        status,
      },
      $setOnInsert: {
        student: student._id,
        course: course.id,
        sectionCode,
        semester,
      },
    },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  return row;
}

before(async () => {
  const { connectDatabase, mongoose } = await import("../src/config/database.js");
  await connectDatabase();
  await mongoose.connection.dropDatabase();
  mongooseRef = mongoose;

  const { initializeServerState } = await import("../src/db.js");
  await initializeServerState();

  const models = await import("../src/models/index.js");
  InstitutionSettingModel = models.InstitutionSetting;
  EnrollmentModel = models.Enrollment;
  StudentModel = models.Student;

  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  ctx.adminToken = await activate(
    "admin@collegeos.test",
    process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD,
    "Collegeos@Admin1",
  );
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongooseRef) {
    await mongooseRef.connection.dropDatabase();
    await mongooseRef.connection.close();
  }
});

/* ------------------------------------------------------------------ */
/* 1. Empty database                                                   */
/* ------------------------------------------------------------------ */

test("an empty database returns three empty buckets rather than sample courses", async () => {
  const res = await api("/api/my-courses", { token: ctx.adminToken });
  assert.equal(res.status, 200, res.text);

  // The catalogue is genuinely empty at this point, so nothing may be invented.
  assert.deepEqual(res.data.courses.inProgress, []);
  assert.deepEqual(res.data.courses.past, []);
  assert.deepEqual(res.data.courses.future, []);
  assert.deepEqual(res.data.counts, { inProgress: 0, past: 0, future: 0 });

  // With nothing published, the period must be reported as derived, not asserted.
  assert.equal(res.data.period.configured, false);
  assert.equal(res.data.period.basis, "RECORDS");
  assert.equal(typeof res.data.period.note, "string");
});

/* ------------------------------------------------------------------ */
/* 2. Authorization                                                     */
/* ------------------------------------------------------------------ */

test("My Courses requires authentication", async () => {
  const res = await api("/api/my-courses");
  assert.equal(res.status, 401);
});

test("My Courses refuses an account without courses.view", async () => {
  // finance_officer is a real role that deliberately holds no course rights.
  const officer = await provision(ctx.adminToken, {
    firstName: "Gopal",
    lastName: "Adhikari",
    role: "finance_officer",
  });

  const res = await api("/api/my-courses", { token: officer.token });
  assert.equal(res.status, 403);
});

/* ------------------------------------------------------------------ */
/* 3. Period grouping                                                   */
/* ------------------------------------------------------------------ */

test("enrolments are grouped into In Progress, Past and Future by real period", async () => {
  // The academic office publishes the current period. Until it does, the server
  // groups by the periods found in the caller's own records and says so.
  await InstitutionSettingModel.updateOne(
    { settingKey: "institution.academicYear" },
    { settingValue: "2025/2026", updatedByUser: null },
    { upsert: true },
  );
  await InstitutionSettingModel.updateOne(
    { settingKey: "institution.currentSemester" },
    { settingValue: "4", updatedByUser: null },
    { upsert: true },
  );

  ctx.pastCourse = await createCourse({
    code: "CS201",
    name: "Data Structures",
    semester: 2,
    credits: 4,
  });
  ctx.currentCourse = await createCourse({
    code: "CS401",
    name: "Software Engineering",
    semester: 4,
    credits: 4,
  });
  ctx.futureCourse = await createCourse({
    code: "CS601",
    name: "Distributed Systems",
    semester: 6,
    credits: 4,
  });

  // Provisioning a semester-4 student enrols them in the semester-4 course.
  // The earlier and later semesters of a study history are recorded explicitly.
  ctx.student = await provision(ctx.adminToken, {
    firstName: "Bikash",
    lastName: "Thapa",
    role: "student",
    studentId: "BCA25002",
    program: "BScIT",
    semester: 4,
    section: "A1",
  });

  ctx.pastEnrollment = await enrol({
    userId: ctx.student.userId,
    course: ctx.pastCourse,
    sectionCode: "A1",
    semester: 2,
    status: "COMPLETED",
  });
  ctx.futureEnrollment = await enrol({
    userId: ctx.student.userId,
    course: ctx.futureCourse,
    sectionCode: "A1",
    semester: 6,
    status: "ENROLLED",
  });

  const res = await api("/api/my-courses", { token: ctx.student.token });
  assert.equal(res.status, 200, res.text);

  assert.equal(res.data.period.configured, true);
  assert.equal(res.data.period.semester, 4);
  assert.equal(res.data.period.academicYear, "2025/2026");
  assert.equal(res.data.period.note, null);

  const inProgress = res.data.courses.inProgress.map((card) => card.code);
  const past = res.data.courses.past.map((card) => card.code);
  const future = res.data.courses.future.map((card) => card.code);

  assert.ok(inProgress.includes("CS401"), "the current-semester course is in progress");
  assert.ok(past.includes("CS201"), "the earlier semester course is historical");
  assert.ok(future.includes("CS601"), "the later semester course is upcoming");

  // The core guarantee for this tab: no future course may appear in In Progress.
  assert.ok(
    !inProgress.includes("CS601"),
    "a future enrolment must never appear under In Progress",
  );
  assert.ok(!inProgress.includes("CS201"), "a past enrolment must not appear under In Progress");

  // Cards are named from the stored course, never from a template.
  const card = res.data.courses.inProgress.find((entry) => entry.code === "CS401");
  assert.equal(card.name, "Software Engineering");
  assert.equal(card.relation, "ENROLLED");
  assert.equal(card.enrollmentStatus, "ENROLLED");
  assert.equal(card.period.bucket, "current");
  assert.equal(card.period.undated, false);
  assert.ok(card.sectionCodes.includes("A1"), "the section comes from the enrolment row");
});

/* ------------------------------------------------------------------ */
/* 4. No fabrication                                                    */
/* ------------------------------------------------------------------ */

test("a course with no recorded activity reports unavailable, not zero", async () => {
  const res = await api("/api/my-courses", { token: ctx.student.token });
  assert.equal(res.status, 200, res.text);

  const card = res.data.courses.inProgress.find((entry) => entry.code === "CS401");
  assert.ok(card, "the current course is present");

  // Nothing was ever recorded against this course, so every metric must decline
  // to produce a number. A 0% here would read as a failing course.
  assert.equal(card.metrics.progress.available, false);
  assert.equal(card.metrics.progress.percentage, null);
  assert.equal(card.metrics.attendance.percentage, null);
  assert.equal(card.metrics.attendance.recorded, false);
  assert.equal(card.metrics.assignments.available, false);
  assert.equal(card.metrics.assignments.total, 0);
  assert.equal(card.metrics.quizzes.available, false);
  assert.equal(card.metrics.quizzes.total, 0);
  assert.equal(card.metrics.materials.total, 0);
  assert.equal(card.metrics.weeks.total, 0);
  assert.equal(card.metrics.upcomingDeadline, null);
  assert.equal(card.metrics.lastActivityAt, null);
});

test("progress is counted from real submissions once work exists", async () => {
  const teacher = await provision(ctx.adminToken, {
    firstName: "Suresh",
    lastName: "Karki",
    role: "faculty",
    designation: "Lecturer",
  });

  await api("/api/admin/teaching-assignments", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      facultyUserId: teacher.userId,
      courseId: ctx.currentCourse.id,
      sectionCode: "A1",
      semester: 4,
    },
  });

  const week = await api(`/api/lms/courses/${ctx.currentCourse.id}/weeks`, {
    method: "POST",
    token: teacher.token,
    body: { title: "Iteration and Incremental Delivery" },
  });
  assert.equal(week.status, 201, week.text);

  const assignment = await api("/api/assignments", {
    method: "POST",
    token: teacher.token,
    body: {
      title: "Iteration retrospective",
      courseId: ctx.currentCourse.id,
      maxMarks: 20,
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "OPEN",
      sectionCodes: ["A1"],
      semester: 4,
    },
  });
  assert.equal(assignment.status, 201, assignment.text);

  const res = await api("/api/my-courses", { token: ctx.student.token });
  assert.equal(res.status, 200, res.text);

  const card = res.data.courses.inProgress.find((entry) => entry.code === "CS401");
  // The assignment now exists, so the card may claim one — counted from the row.
  assert.equal(card.metrics.assignments.available, true);
  assert.equal(card.metrics.assignments.total, 1);
  assert.equal(card.metrics.assignments.submitted, 0);
  assert.ok(card.metrics.upcomingDeadline, "the real due date is surfaced");
  assert.equal(card.metrics.upcomingDeadline.kind, "ASSIGNMENT");

  // With one piece of countable work and none submitted, progress is 0% — a real
  // measurement this time, not the "unavailable" answer from the previous test.
  assert.equal(card.metrics.progress.available, true);
  assert.equal(card.metrics.progress.percentage, 0);
});

/* ------------------------------------------------------------------ */
/* 5. Scoping                                                           */
/* ------------------------------------------------------------------ */

test("a student receives only their own courses", async () => {
  // A course in a semester the second student does not take, so the two lists
  // differ by a real enrolment rather than by a filter argument.
  ctx.otherOnlyCourse = await createCourse({
    code: "CS501",
    name: "Machine Learning",
    semester: 5,
    credits: 3,
  });

  ctx.otherStudent = await provision(ctx.adminToken, {
    firstName: "Sunita",
    lastName: "Lama",
    role: "student",
    studentId: "BCA25004",
    program: "BScIT",
    semester: 5,
    section: "B1",
  });

  await enrol({
    userId: ctx.otherStudent.userId,
    course: ctx.otherOnlyCourse,
    sectionCode: "B1",
    semester: 5,
    status: "ENROLLED",
  });

  const mine = await api("/api/my-courses", { token: ctx.student.token });
  const theirs = await api("/api/my-courses", { token: ctx.otherStudent.token });
  assert.equal(mine.status, 200, mine.text);
  assert.equal(theirs.status, 200, theirs.text);

  const mineIds = [
    ...mine.data.courses.inProgress,
    ...mine.data.courses.past,
    ...mine.data.courses.future,
  ].map((card) => card.courseId);
  const theirIds = [
    ...theirs.data.courses.inProgress,
    ...theirs.data.courses.past,
    ...theirs.data.courses.future,
  ].map((card) => card.courseId);

  // Neither list may contain a course the student is not enrolled in.
  assert.ok(
    !mineIds.includes(ctx.otherOnlyCourse.id),
    "the first student must not see the second student's semester-5 course",
  );
  assert.ok(
    !theirIds.includes(ctx.currentCourse.id),
    "the second student must not see the first student's semester-4 course",
  );

  assert.ok(theirIds.includes(ctx.otherOnlyCourse.id), "each student sees their own course");

  // Section codes are the enrolment's, never the institution's default.
  const otherCard = [
    ...theirs.data.courses.inProgress,
    ...theirs.data.courses.past,
    ...theirs.data.courses.future,
  ].find((card) => card.courseId === ctx.otherOnlyCourse.id);
  assert.ok(otherCard.sectionCodes.includes("B1"));
  assert.ok(!otherCard.sectionCodes.includes("A1"));
});

test("a dropped enrolment is not presented as an active course", async () => {
  // The current-semester enrolment the provisioning path created.
  const current = await EnrollmentModel.findOne({
    studentUser: ctx.student.userId,
    course: ctx.currentCourse.id,
  }).lean();
  assert.ok(current, "the provisioning path created a real enrolment");
  assert.equal(current.status, "ENROLLED");

  await EnrollmentModel.updateOne({ _id: current._id }, { status: "DROPPED" });

  const res = await api("/api/my-courses", { token: ctx.student.token });
  assert.equal(res.status, 200, res.text);

  const card = [
    ...res.data.courses.inProgress,
    ...res.data.courses.past,
    ...res.data.courses.future,
  ].find((entry) => entry.courseId === ctx.currentCourse.id);

  // The row is still a real institutional record, so it is still listed — but it
  // is not dressed up as an active enrolment.
  assert.ok(card, "a dropped enrolment is still a real record");
  assert.equal(card.enrollmentStatus, "DROPPED");

  await EnrollmentModel.updateOne({ _id: current._id }, { status: "ENROLLED" });
});

/* ------------------------------------------------------------------ */
/* 6. Teachers see teaching scope, not a catalogue                       */
/* ------------------------------------------------------------------ */

test("a teacher receives the courses they are assigned to teach", async () => {
  const teacher = await provision(ctx.adminToken, {
    firstName: "Prakash",
    lastName: "Neupane",
    role: "faculty",
    designation: "Lecturer",
  });

  await api("/api/admin/teaching-assignments", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      facultyUserId: teacher.userId,
      courseId: ctx.futureCourse.id,
      sectionCode: "A1",
      semester: 6,
    },
  });

  const res = await api("/api/my-courses", { token: teacher.token });
  assert.equal(res.status, 200, res.text);

  const all = [
    ...res.data.courses.inProgress,
    ...res.data.courses.past,
    ...res.data.courses.future,
  ];

  // Only the assigned course, and never as an oversight catalogue of everything.
  assert.equal(all.length, 1);
  assert.equal(all[0].courseId, ctx.futureCourse.id);
  assert.equal(all[0].relation, "TEACHING");
  assert.ok(!all.some((card) => card.courseId === ctx.currentCourse.id));
});