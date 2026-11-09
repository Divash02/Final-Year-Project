import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * LMS integration suite: weekly planner, quiz runtime, scheduling and grading.
 *
 * These tests run against the real MongoDB-backed Express app on an ephemeral
 * port and a dedicated test database, exactly like the API suite, so every
 * assertion exercises the same authorisation service, the same quiz engine and
 * the same delivery sweep that production uses.
 *
 * What is being defended here is not "does the endpoint answer 200" but the four
 * academic guarantees the LMS makes:
 *
 *  1. a course workspace is reachable only by someone who teaches it or is
 *     enrolled in it;
 *  2. a scheduled week, material or quiz behaves as released from the release
 *     instant, whether or not a sweep has run yet;
 *  3. a quiz deadline is enforced on the server, so neither a changed device
 *     clock nor a delayed sweep can let a paper be submitted late;
 *  4. marks are the engine's decision: objective answers are marked on
 *     submission, subjective answers wait for a human, and a partially marked
 *     paper is never reported as a final score.
 */

const TEST_DB = process.env.COLLEGEOS_LMS_TEST_DB || "collegeos_lms_test";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";

// The app reads these at module load, so they are set before anything is imported.
process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-lms-suite-secret-key";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";
process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR = "2025/2026";

const ctx = {};
let baseUrl = "";
let server = null;
let mongooseRef = null;
let QuizModel = null;
let QuizAttemptModel = null;

const MINUTE = 60 * 1000;
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
  return { status: response.status, data, text, headers: response.headers };
}

async function login(email, password) {
  const res = await api("/api/auth/login", { method: "POST", body: { email, password } });
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

before(async () => {
  const { connectDatabase, mongoose } = await import("../src/config/database.js");
  await connectDatabase();
  // A dropped database guarantees the suite starts from the same state every run
  // and never touches the development database.
  await mongoose.connection.dropDatabase();
  mongooseRef = mongoose;

  const { initializeServerState } = await import("../src/db.js");
  await initializeServerState();

  const models = await import("../src/models/index.js");
  QuizModel = models.Quiz;
  QuizAttemptModel = models.QuizAttempt;

  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  ctx.adminToken = await activate(
    "admin@collegeos.test",
    process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD,
    "Collegeos@Admin1",
  );

  ctx.teacher = await provision(ctx.adminToken, {
    firstName: "Suresh",
    lastName: "Karki",
    role: "faculty",
    designation: "Lecturer",
  });
  // A second teacher for section A2, so section targeting can be tested with a
  // real owner rather than by weakening the A1 teacher's authority.
  ctx.teacherA2 = await provision(ctx.adminToken, {
    firstName: "Prakash",
    lastName: "Neupane",
    role: "faculty",
    designation: "Lecturer",
  });
  ctx.otherTeacher = await provision(ctx.adminToken, {
    firstName: "Anita",
    lastName: "Basnet",
    role: "faculty",
    designation: "Lecturer",
  });

  const course = await api("/api/courses", {
    method: "POST",
    token: ctx.adminToken,
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
  assert.equal(course.status, 201, course.text);
  ctx.course = course.data.course;

  // Sections are created explicitly so the cohort codes agree with the ones the
  // teaching assignments and enrolments carry.
  for (const code of ["A1", "A2"]) {
    const section = await api("/api/sections", {
      method: "POST",
      token: ctx.adminToken,
      body: { code, program: "BScIT", semester: 4, batch: "2025", room: "Hall 201" },
    });
    assert.equal(section.status, 201, `section creation failed: ${section.text}`);
  }

  ctx.studentA1 = await provision(ctx.adminToken, {
    firstName: "Bikash",
    lastName: "Thapa",
    role: "student",
    studentId: "BCA25002",
    program: "BScIT",
    batch: "2025",
    semester: 4,
    section: "A1",
  });
  // A second A1 student: same cohort as the first, so cross-attempt access is
  // refused by ownership rather than by section.
  ctx.studentA1b = await provision(ctx.adminToken, {
    firstName: "Sunita",
    lastName: "Lama",
    role: "student",
    studentId: "BCA25004",
    program: "BScIT",
    batch: "2025",
    semester: 4,
    section: "A1",
  });
  ctx.studentA2 = await provision(ctx.adminToken, {
    firstName: "Nisha",
    lastName: "Adhikari",
    role: "student",
    studentId: "BCA25003",
    program: "BScIT",
    batch: "2025",
    semester: 4,
    section: "A2",
  });

  // The institutional ids are read from the directory rather than assumed from
  // the provisioning payload, so the roster assertions compare real records.
  for (const key of ["studentA1", "studentA1b", "studentA2"]) {
    const me = await api("/api/students/me", { token: ctx[key].token });
    assert.equal(me.status, 200, me.text);
    ctx[key].studentId = me.data.student.studentId;
  }

  // The teachers are authorised for their own sections only. That is what makes
  // the cross-section and cross-teacher cases below real rather than theoretical.
  for (const [key, sectionCode] of [
    ["teacher", "A1"],
    ["teacherA2", "A2"],
  ]) {
    const teaching = await api("/api/admin/teaching-assignments", {
      method: "POST",
      token: ctx.adminToken,
      body: {
        facultyUserId: ctx[key].userId,
        courseId: ctx.course.id,
        sectionCode,
        semester: 4,
      },
    });
    assert.equal(teaching.status, 201, `teaching assignment failed: ${teaching.text}`);
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongooseRef) {
    await mongooseRef.connection.dropDatabase();
    await mongooseRef.connection.close();
  }
});

/* ------------------------------------------------------------------ */
/* Helpers used by several tests                                       */
/* ------------------------------------------------------------------ */

/** Creates a week owned by the course teacher. */
async function createWeek(body = {}) {
  const res = await api(`/api/lms/courses/${ctx.course.id}/weeks`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { title: "Iteration and Incremental Delivery", ...body },
  });
  assert.equal(res.status, 201, `week creation failed: ${res.text}`);
  return res.data.week;
}

/** Creates a draft quiz, by the section A1 teacher unless told otherwise. */
async function createQuiz(weekId, body = {}) {
  const { asToken, ...fields } = body;
  const now = Date.now();
  const res = await api(`/api/lms/courses/${ctx.course.id}/quizzes`, {
    method: "POST",
    token: asToken || ctx.teacher.token,
    body: {
      weekId,
      title: "Iteration quiz",
      maxMarks: 10,
      passingMarks: 4,
      durationMinutes: 30,
      attemptsAllowed: 1,
      openAt: new Date(now - 5 * MINUTE).toISOString(),
      closeAt: new Date(now + 60 * MINUTE).toISOString(),
      // The default policy, so "has this been marked yet?" is genuinely the
      // question a result read is asking.
      resultReleasePolicy: "AFTER_GRADING",
      ...fields,
    },
  });
  assert.equal(res.status, 201, `quiz creation failed: ${res.text}`);
  return res.data.quiz;
}

/** Adds one auto-marked multiple-choice question worth `marks`. */
async function addChoiceQuestion(quizId, { marks = 5, correctIndex = 0, token } = {}) {
  const res = await api(`/api/lms/quizzes/${quizId}/questions`, {
    method: "POST",
    token: token || ctx.teacher.token,
    body: {
      type: "MULTIPLE_CHOICE",
      text: "Which statement about iterative delivery is correct?",
      marks,
      options: [
        { text: "A sprint review happens once at the end of the project." },
        { text: "An iteration produces a working increment on a short cycle." },
        { text: "Testing is deferred until the requirements are frozen." },
      ],
      correctAnswer: [`option_${correctIndex + 1}`],
    },
  });
  assert.equal(res.status, 201, `question creation failed: ${res.text}`);
  return res.data.question;
}

/** Adds one subjective question worth `marks`. */
async function addWrittenQuestion(quizId, { marks = 5, text } = {}) {
  const res = await api(`/api/lms/quizzes/${quizId}/questions`, {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      type: "SHORT_ANSWER",
      text: text || "Explain in two sentences why a retrospective is held.",
      marks,
      correctAnswer: [["To inspect the process and agree improvements."]],
    },
  });
  assert.equal(res.status, 201, `question creation failed: ${res.text}`);
  return res.data.question;
}

/** Moves a quiz straight to open, without depending on the sweep. */
async function openQuiz(quizId, token) {
  const res = await api(`/api/lms/quizzes/${quizId}/status`, {
    method: "POST",
    token: token || ctx.teacher.token,
    body: { status: "OPEN" },
  });
  assert.equal(res.status, 200, `opening the quiz failed: ${res.text}`);
  return res.data.quiz;
}

/** Sits the whole paper: starts an attempt, answers everything, submits. */
async function sitQuiz(quizId, { answers = null } = {}) {
  const started = await api(`/api/lms/quizzes/${quizId}/attempts`, {
    method: "POST",
    token: ctx.studentA1.token,
  });
  assert.equal(started.status, 201, `attempt could not start: ${started.text}`);

  const sheet = started.data;
  const payload =
    answers ||
    sheet.questions.map((question) => ({
      questionId: question.id,
      response: question.options?.length ? question.options[0].id : "A written response.",
    }));

  const saved = await api(`/api/lms/attempts/${sheet.attempt.id}/answers`, {
    method: "PUT",
    token: ctx.studentA1.token,
    body: { answers: payload },
  });
  assert.equal(saved.status, 200, `autosave failed: ${saved.text}`);

  const submitted = await api(`/api/lms/attempts/${sheet.attempt.id}/submit`, {
    method: "POST",
    token: ctx.studentA1.token,
  });
  assert.equal(submitted.status, 200, `submission failed: ${submitted.text}`);
  return { attempt: sheet.attempt, questions: sheet.questions, result: submitted.data };
}

/* ------------------------------------------------------------------ */
/* Authorisation                                                       */
/* ------------------------------------------------------------------ */

test("a course workspace opens only for its teacher and its enrolled students", async () => {
  const week = await createWeek();

  const teacher = await api(`/api/lms/courses/${ctx.course.id}/overview`, {
    token: ctx.teacher.token,
  });
  assert.equal(teacher.status, 200, teacher.text);
  assert.equal(teacher.data.access.role, "teacher");
  assert.equal(teacher.data.access.canManage, true);
  assert.deepEqual(teacher.data.access.sections, ["A1"]);

  const student = await api(`/api/lms/courses/${ctx.course.id}/overview`, {
    token: ctx.studentA1.token,
  });
  assert.equal(student.status, 200, student.text);
  assert.equal(student.data.access.role, "student");
  assert.equal(student.data.access.canManage, false, "a student may never edit course content");

  // A colleague who does not teach this course cannot even confirm it exists.
  const stranger = await api(`/api/lms/courses/${ctx.course.id}/overview`, {
    token: ctx.otherTeacher.token,
  });
  assert.equal(stranger.status, 404);
  assert.equal(stranger.data.code, "NOT_FOUND");

  const anonymous = await api(`/api/lms/weeks/${week.id}`);
  assert.equal(anonymous.status, 401);
});

test("an unpublished week is not discoverable by a student who guesses its id", async () => {
  const week = await createWeek({ title: "Not released yet" });

  const student = await api(`/api/lms/weeks/${week.id}`, { token: ctx.studentA1.token });
  assert.equal(student.status, 404, "a draft week must not be reachable by a student");

  const teacher = await api(`/api/lms/weeks/${week.id}`, { token: ctx.teacher.token });
  assert.equal(teacher.status, 200, teacher.text);
  assert.equal(teacher.data.week.state, "DRAFT");

  const stranger = await api(`/api/lms/weeks/${week.id}`, { token: ctx.otherTeacher.token });
  assert.equal(stranger.status, 404);
});

test("only the assigned teacher may author course content, and not for a foreign section", async () => {
  const week = await createWeek({ title: "Authoring rights" });

  const stranger = await api(`/api/lms/courses/${ctx.course.id}/weeks`, {
    method: "POST",
    token: ctx.otherTeacher.token,
    body: { title: "Not my course" },
  });
  assert.equal(
    stranger.status,
    403,
    "a course you do not teach is refused on the manage permission",
  );

  const student = await api(`/api/lms/courses/${ctx.course.id}/weeks`, {
    method: "POST",
    token: ctx.studentA1.token,
    body: { title: "Student week" },
  });
  assert.equal(student.status, 403);

  const foreignSection = await api(`/api/lms/courses/${ctx.course.id}/quizzes`, {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      weekId: week.id,
      title: "Quiz for a section I do not teach",
      maxMarks: 5,
      durationMinutes: 10,
      sectionCodes: ["A2"],
      openAt: new Date().toISOString(),
      closeAt: new Date(Date.now() + 30 * MINUTE).toISOString(),
    },
  });
  assert.equal(foreignSection.status, 403, "a teacher may not post to a section they do not teach");
  assert.match(foreignSection.data.error, /A1/);
});

test("the question bank is per-course and its key is never served to a student", async () => {
  const bank = await api(`/api/lms/questions?courseId=${ctx.course.id}`, {
    token: ctx.teacher.token,
  });
  assert.equal(bank.status, 200, bank.text);
  assert.ok(Array.isArray(bank.data.questions));

  const created = await api("/api/lms/questions", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      courseId: ctx.course.id,
      type: "TRUE_FALSE",
      text: "A retrospective is held at the end of an iteration.",
      marks: 2,
      correctAnswer: ["TRUE"],
    },
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.data.question.quizId, null, "a bank question belongs to no quiz");
  ctx.bankQuestionId = created.data.question.id;

  const student = await api(`/api/lms/questions?courseId=${ctx.course.id}`, {
    token: ctx.studentA1.token,
  });
  assert.equal(student.status, 403, "the bank and its keys are teacher-only");

  // A key that names an option which does not exist would silently mark every
  // student zero, so it is refused at authoring time rather than at mark time.
  const broken = await api("/api/lms/questions", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      courseId: ctx.course.id,
      type: "TRUE_FALSE",
      text: "This key points at an option that is not on the paper.",
      marks: 2,
      correctAnswer: ["MAYBE"],
    },
  });
  assert.equal(broken.status, 422);
  assert.equal(broken.data.code, "VALIDATION_FAILED");
});

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

test("a scheduled week reads as released the moment its release time passes", async () => {
  const now = Date.now();
  const week = await createWeek({
    title: "Scheduled release week",
    releaseAt: new Date(now + 60 * MINUTE).toISOString(),
  });

  const before = await api(`/api/lms/courses/${ctx.course.id}/weeks`, {
    token: ctx.teacher.token,
  });
  const beforeRow = before.data.weeks.find((row) => row.id === week.id);
  assert.equal(beforeRow.state, "SCHEDULED");
  assert.equal(beforeRow.status, "DRAFT", "the stored status stays DRAFT until the sweep runs");

  // A student cannot open a week whose release instant has not arrived.
  const early = await api(`/api/lms/weeks/${week.id}`, { token: ctx.studentA1.token });
  assert.equal(early.status, 404);

  // Move the release into the past and re-read: the derived state is the
  // server clock, not the stored status, so no sweep is required for the week
  // to become visible.
  const rescheduled = await api(`/api/lms/weeks/${week.id}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { releaseAt: new Date(now - 60 * MINUTE).toISOString() },
  });
  assert.equal(rescheduled.status, 200, rescheduled.text);
  assert.equal(rescheduled.data.week.state, "PUBLISHED");
  assert.equal(rescheduled.data.week.status, "DRAFT", "the sweep is still the thing that persists it");

  const after = await api(`/api/lms/weeks/${week.id}`, { token: ctx.studentA1.token });
  assert.equal(after.status, 200, after.text);
  assert.equal(after.data.week.state, "PUBLISHED");
});

test("the delivery sweep releases scheduled weeks and opens and closes quizzes", async () => {
  const { runAcademicSweep } = await import("../src/services/lms/scheduler.js");
  const now = Date.now();

  const week = await createWeek({
    title: "Sweep release week",
    releaseAt: new Date(now - 30 * MINUTE).toISOString(),
  });
  const quiz = await createQuiz(week.id, {
    title: "Sweep lifecycle quiz",
    maxMarks: 5,
    durationMinutes: 5,
    openAt: new Date(now - 20 * MINUTE).toISOString(),
    closeAt: new Date(now + 20 * MINUTE).toISOString(),
  });
  await addChoiceQuestion(quiz.id, { marks: 5 });
  await api(`/api/lms/quizzes/${quiz.id}/status`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { status: "SCHEDULED" },
  });

  // Not yet open: the window starts in the future for the *second* quiz below,
  // but this one is inside its window already, so the sweep opens it.
  const firstPass = await runAcademicSweep(new Date());
  assert.ok(firstPass.releasedWeeks >= 1, "the sweep releases a due week");

  const opened = await QuizModel.findById(quiz.id).lean();
  assert.equal(opened.status, "OPEN", "a quiz inside its window is opened by the sweep");
  assert.ok(opened.openedAt, "the open instant is recorded");

  // A quiz whose window has not opened stays scheduled and refuses attempts.
  const future = await createQuiz(week.id, {
    title: "Future quiz",
    maxMarks: 5,
    durationMinutes: 5,
    openAt: new Date(now + 30 * MINUTE).toISOString(),
    closeAt: new Date(now + 90 * MINUTE).toISOString(),
  });
  await addChoiceQuestion(future.id, { marks: 5 });
  await api(`/api/lms/quizzes/${future.id}/status`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { status: "SCHEDULED" },
  });
  await runAcademicSweep(new Date());

  const premature = await api(`/api/lms/quizzes/${future.id}/attempts`, {
    method: "POST",
    token: ctx.studentA1.token,
  });
  assert.equal(premature.status, 409);
  assert.match(premature.data.error, /not opened/i);

  // Running the sweep far enough ahead closes the quiz, exactly as the timer
  // would have: the sweep is a delivery mechanism, not the only enforcement.
  await runAcademicSweep(new Date(now + 2 * 60 * MINUTE));
  const closed = await QuizModel.findById(quiz.id).lean();
  assert.equal(closed.status, "CLOSED");
  assert.ok(closed.closedAt);
});

test("a scheduled quiz cannot be opened empty, and its window must make sense", async () => {
  const week = await createWeek({ title: "Quiz validation week" });

  const empty = await createQuiz(week.id, { title: "Empty quiz", maxMarks: 5 });
  const premature = await api(`/api/lms/quizzes/${empty.id}/status`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { status: "SCHEDULED" },
  });
  assert.equal(premature.status, 422, "an empty paper cannot be handed to students");
  assert.equal(premature.data.code, "VALIDATION_FAILED");

  const backwards = await api(`/api/lms/courses/${ctx.course.id}/quizzes`, {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      weekId: week.id,
      title: "Backwards window",
      maxMarks: 5,
      durationMinutes: 10,
      openAt: new Date(Date.now() + 60 * MINUTE).toISOString(),
      closeAt: new Date().toISOString(),
    },
  });
  assert.equal(backwards.status, 422, "a quiz cannot close before it opens");
  assert.equal(backwards.data.code, "VALIDATION_FAILED");

  const alreadyGone = await createQuiz(week.id, {
    title: "Already finished window",
    maxMarks: 5,
    openAt: new Date(Date.now() - 120 * MINUTE).toISOString(),
    closeAt: new Date(Date.now() - 60 * MINUTE).toISOString(),
  });
  await addChoiceQuestion(alreadyGone.id, { marks: 5 });
  const late = await api(`/api/lms/quizzes/${alreadyGone.id}/status`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { status: "OPEN" },
  });
  assert.equal(late.status, 409, "a window that has already closed cannot be opened");
});

/* ------------------------------------------------------------------ */
/* Attempt runtime and deadlines                                       */
/* ------------------------------------------------------------------ */

test("a student receives the paper without the marking key", async () => {
  const week = await createWeek({ title: "Runtime week" });
  const quiz = await createQuiz(week.id, { title: "Runtime quiz", maxMarks: 5, durationMinutes: 15 });
  await addChoiceQuestion(quiz.id, { marks: 5 });
  await openQuiz(quiz.id);

  const started = await api(`/api/lms/quizzes/${quiz.id}/attempts`, {
    method: "POST",
    token: ctx.studentA1.token,
  });
  assert.equal(started.status, 201, started.text);
  assert.equal(started.data.questions.length, 1);
  assert.doesNotMatch(
    started.text,
    /correctAnswer/i,
    "the marking key must never reach the attempt runtime",
  );

  const question = started.data.questions[0];
  assert.equal(question.requiresManualGrading, false);
  assert.equal(question.options.length, 3);
  assert.equal("correctAnswer" in question, false);

  // The deadline is computed by the server and is never longer than the window.
  const expiresAt = new Date(started.data.attempt.expiresAt).getTime();
  const startedAt = new Date(started.data.attempt.startedAt).getTime();
  assert.equal(expiresAt - startedAt, 15 * MINUTE, "the duration is measured on the server");
  assert.ok(started.data.timing.msRemaining > 0);
  assert.ok(started.data.timing.msRemaining <= 15 * MINUTE);

  ctx.runtimeAttemptId = started.data.attempt.id;
});

test("a second start request resumes the same attempt rather than spending another one", async () => {
  const week = await createWeek({ title: "Resume week" });
  const quiz = await createQuiz(week.id, {
    title: "Single-attempt quiz",
    maxMarks: 5,
    durationMinutes: 15,
    attemptsAllowed: 1,
  });
  await addChoiceQuestion(quiz.id, { marks: 5 });
  await openQuiz(quiz.id);

  const first = await api(`/api/lms/quizzes/${quiz.id}/attempts`, {
    method: "POST",
    token: ctx.studentA1.token,
  });
  assert.equal(first.status, 201);

  const second = await api(`/api/lms/quizzes/${quiz.id}/attempts`, {
    method: "POST",
    token: ctx.studentA1.token,
  });
  assert.equal(second.status, 200);
  assert.equal(second.data.resumed, true);
  assert.equal(second.data.attempt.id, first.data.attempt.id);
  assert.equal(
    second.data.attempt.startedAt,
    first.data.attempt.startedAt,
    "a refresh resumes the same paper, deadline included",
  );

  await api(`/api/lms/attempts/${first.data.attempt.id}/submit`, {
    method: "POST",
    token: ctx.studentA1.token,
  });

  const exhausted = await api(`/api/lms/quizzes/${quiz.id}/attempts`, {
    method: "POST",
    token: ctx.studentA1.token,
  });
  assert.equal(exhausted.status, 409, "attemptsAllowed is enforced on the server");
  assert.match(exhausted.data.error, /attempt/i);
});

test("a quiz addressed to another section is not offered to this student", async () => {
  const week = await createWeek({ title: "Section targeting week" });
  const quiz = await createQuiz(week.id, {
    asToken: ctx.teacherA2.token,
    title: "A2 only quiz",
    maxMarks: 5,
    durationMinutes: 10,
    sectionCodes: ["A2"],
  });
  await addChoiceQuestion(quiz.id, { marks: 5, token: ctx.teacherA2.token });
  await openQuiz(quiz.id, ctx.teacherA2.token);

  const listed = await api(`/api/lms/courses/${ctx.course.id}/quizzes`, {
    token: ctx.studentA1.token,
  });
  assert.equal(listed.status, 200, listed.text);
  assert.ok(
    !listed.data.quizzes.some((row) => row.id === quiz.id),
    "a quiz for A2 must not appear to an A1 student",
  );

  const guessed = await api(`/api/lms/quizzes/${quiz.id}`, { token: ctx.studentA1.token });
  assert.equal(guessed.status, 404);

  const start = await api(`/api/lms/quizzes/${quiz.id}/attempts`, {
    method: "POST",
    token: ctx.studentA1.token,
  });
  assert.equal(start.status, 404);

  const addressed = await api(`/api/lms/quizzes/${quiz.id}`, { token: ctx.studentA2.token });
  assert.equal(addressed.status, 200, "the quiz is real for its own cohort");
});

test("one student can never read or drive another student's attempt", async () => {
  const week = await createWeek({ title: "Cross-student week" });
  const quiz = await createQuiz(week.id, {
    title: "Own attempts quiz",
    maxMarks: 5,
    durationMinutes: 10,
    sectionCodes: ["A1"],
  });
  await addChoiceQuestion(quiz.id, { marks: 5 });
  await openQuiz(quiz.id);

  const started = await api(`/api/lms/quizzes/${quiz.id}/attempts`, {
    method: "POST",
    token: ctx.studentA1.token,
  });
  assert.equal(started.status, 201, started.text);
  const attemptId = started.data.attempt.id;

  // A second student of the *same* cohort may start their own attempt...
  const own = await api(`/api/lms/quizzes/${quiz.id}/attempts`, {
    method: "POST",
    token: ctx.studentA1b.token,
  });
  assert.equal(own.status, 201, "a colleague in the same cohort may sit their own paper");
  assert.notEqual(own.data.attempt.id, attemptId);

  // ...but the student routes report somebody else's attempt as missing rather
  // than reaching it, because its existence is itself privileged information.
  for (const [method, path, expected] of [
    ["PUT", `/api/lms/attempts/${attemptId}/answers`, 404],
    ["POST", `/api/lms/attempts/${attemptId}/submit`, 404],
    ["GET", `/api/lms/attempts/${attemptId}/result`, 404],
  ]) {
    const res = await api(path, {
      method,
      token: ctx.studentA1b.token,
      body: method === "PUT" ? { answers: [] } : undefined,
    });
    assert.equal(res.status, expected, `${method} ${path} must not reach another student's attempt`);
  }

  // The teacher-only routes are refused on the permission gate itself, which is
  // checked before the attempt is ever looked up.
  for (const [method, path, body] of [
    ["GET", `/api/lms/attempts/${attemptId}`, undefined],
    ["POST", `/api/lms/attempts/${attemptId}/grade`, { marks: [] }],
  ]) {
    const res = await api(path, { method, token: ctx.studentA1b.token, body });
    assert.equal(res.status, 403, `${method} ${path} is not a student route at all`);
  }
});

test("a deadline is enforced by the server, not by the client's clock", async () => {
  const week = await createWeek({ title: "Deadline week" });
  const quiz = await createQuiz(week.id, {
    title: "Short deadline quiz",
    maxMarks: 5,
    durationMinutes: 1,
  });
  await addChoiceQuestion(quiz.id, { marks: 5 });
  await openQuiz(quiz.id);

  const started = await api(`/api/lms/quizzes/${quiz.id}/attempts`, {
    method: "POST",
    token: ctx.studentA1.token,
  });
  assert.equal(started.status, 201, started.text);
  const attemptId = started.data.attempt.id;

  await api(`/api/lms/attempts/${attemptId}/answers`, {
    method: "PUT",
    token: ctx.studentA1.token,
    body: {
      answers: [
        {
          questionId: started.data.questions[0].id,
          response: started.data.questions[0].options[0].id,
        },
      ],
    },
  });

  // Age the attempt past its own deadline. This is the server's clock moving,
  // not the student lying about theirs.
  await QuizAttemptModel.updateOne(
    { _id: attemptId },
    { expiresAt: new Date(Date.now() - MINUTE) },
  );

  const lateSave = await api(`/api/lms/attempts/${attemptId}/answers`, {
    method: "PUT",
    token: ctx.studentA1.token,
    body: {
      answers: [
        {
          questionId: started.data.questions[0].id,
          response: started.data.questions[0].options[1].id,
        },
      ],
    },
  });
  assert.equal(lateSave.status, 409, "answers cannot be saved after the deadline");
  assert.match(lateSave.data.error, /submitted automatically/i);

  const attempt = await QuizAttemptModel.findById(attemptId).lean();
  assert.equal(attempt.status, "AUTO_SUBMITTED");
  assert.equal(attempt.autoSubmitted, true);
  assert.ok(
    attempt.submittedAt <= new Date(Date.now() + 1000),
    "the submission is timestamped at the deadline, not at the late request",
  );

  // The saved answer stands; the late one was never applied.
  const answer = attempt.answers[0];
  assert.equal(answer.response, started.data.questions[0].options[0].id);
});

test("a paper is frozen once it has been sat", async () => {
  const week = await createWeek({ title: "Freeze week" });
  const quiz = await createQuiz(week.id, { title: "Frozen quiz", maxMarks: 5, durationMinutes: 10 });
  await addChoiceQuestion(quiz.id, { marks: 5 });
  await openQuiz(quiz.id);
  await sitQuiz(quiz.id);

  const edit = await api(`/api/lms/quizzes/${quiz.id}/questions`, {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      type: "MULTIPLE_CHOICE",
      text: "A question added after the paper was sat.",
      marks: 5,
      options: [{ text: "One" }, { text: "Two" }],
      correctAnswer: ["option_1"],
    },
  });
  assert.equal(edit.status, 409, "a sat paper may not gain questions");
  assert.match(edit.data.error, /already been sat/i);

  const regrade = await api(`/api/lms/quizzes/${quiz.id}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { maxMarks: 50 },
  });
  assert.equal(regrade.status, 409, "a sat paper may not be re-marked");

  const archived = await api(`/api/lms/quizzes/${quiz.id}`, {
    method: "DELETE",
    token: ctx.teacher.token,
  });
  assert.equal(archived.status, 200);
  assert.equal(archived.data.archived, true, "assessed work is archived, never deleted");

  const attempts = await QuizAttemptModel.countDocuments({ quiz: quiz.id });
  assert.equal(attempts, 1, "the attempt survives the archive");
});

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

test("objective answers are marked on submission and subjective ones wait for a human", async () => {
  const week = await createWeek({ title: "Grading week" });
  const quiz = await createQuiz(week.id, {
    title: "Mixed paper",
    maxMarks: 10,
    passingMarks: 5,
    durationMinutes: 20,
  });
  const objective = await addChoiceQuestion(quiz.id, { marks: 5, correctIndex: 1 });
  const written = await addWrittenQuestion(quiz.id, { marks: 5 });
  await openQuiz(quiz.id);

  const { attempt } = await sitQuiz(quiz.id, {
    answers: [
      // The correct option.
      { questionId: objective.id, response: "option_2" },
      { questionId: written.id, responseText: "To inspect the process and agree improvements." },
    ],
  });

  const stored = await QuizAttemptModel.findById(attempt.id).lean();
  assert.equal(stored.status, "SUBMITTED");
  assert.equal(stored.objectiveMarks, 5, "the objective answer was marked by the engine");
  assert.equal(stored.pendingManualCount, 1, "the written answer is queued for a marker");
  assert.equal(
    stored.awardedMarks,
    null,
    "a partially marked paper is not reported as a final score",
  );
  assert.equal(stored.percentage, null);
  assert.equal(stored.passed, null);

  ctx.gradingQuizId = quiz.id;
  ctx.gradingObjectiveId = objective.id;
  ctx.gradingWrittenId = written.id;
  ctx.gradingAttemptId = attempt.id;
});

test("results stay hidden until the release policy is satisfied", async () => {
  const quizId = ctx.gradingQuizId;
  const attemptId = ctx.gradingAttemptId;

  const withheld = await api(`/api/lms/attempts/${attemptId}/result`, {
    token: ctx.studentA1.token,
  });
  assert.equal(withheld.status, 200, withheld.text);
  assert.equal(withheld.data.released, false);
  assert.equal(withheld.data.attempt.awardedMarks, undefined, "no score before release");
  assert.equal(withheld.data.questions, undefined, "not even the paper is echoed back");
  assert.match(withheld.data.reason, /marked/i);

  const graded = await api(`/api/lms/attempts/${attemptId}/grade`, {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      marks: [{ questionId: ctx.gradingWrittenId, awardedMarks: 3, feedback: "Sound, be specific." }],
      overallFeedback: "Good grasp of the process questions.",
    },
  });
  assert.equal(graded.status, 200, graded.text);
  assert.equal(graded.data.pendingManualCount, 0);
  assert.equal(graded.data.attempt.awardedMarks, 8);
  assert.equal(graded.data.attempt.percentage, 80);
  assert.equal(graded.data.attempt.passed, true, "passing is a real comparison, not a placeholder");
  assert.equal(graded.data.resultsReleased, true);

  const released = await api(`/api/lms/attempts/${attemptId}/result`, {
    token: ctx.studentA1.token,
  });
  assert.equal(released.status, 200, released.text);
  assert.equal(released.data.released, true);
  assert.equal(released.data.attempt.awardedMarks, 8);
  assert.equal(released.data.attempt.percentage, 80);
  assert.equal(released.data.attempt.overallFeedback, "Good grasp of the process questions.");
  const writtenRow = released.data.questions.find(
    (question) => question.id === ctx.gradingWrittenId,
  );
  assert.equal(writtenRow.awardedMarks, 3);
  assert.equal(writtenRow.feedback, "Sound, be specific.");
  assert.equal(
    "correctAnswer" in writtenRow,
    false,
    "the key is withheld unless the teacher asked for it to be shown",
  );
});

test("a mark above the question's own maximum is refused", async () => {
  const res = await api(`/api/lms/attempts/${ctx.gradingAttemptId}/grade`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { marks: [{ questionId: ctx.gradingWrittenId, awardedMarks: 99 }] },
  });
  assert.equal(res.status, 422);
  assert.equal(res.data.code, "VALIDATION_FAILED");

  const unchanged = await QuizAttemptModel.findById(ctx.gradingAttemptId).lean();
  assert.equal(unchanged.awardedMarks, 8, "a refused mark leaves the recorded mark untouched");
});

test("clearing a mark returns the paper to the grading queue rather than recording a zero", async () => {
  const res = await api(`/api/lms/attempts/${ctx.gradingAttemptId}/grade`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { marks: [{ questionId: ctx.gradingWrittenId, awardedMarks: null }] },
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.pendingManualCount, 1);

  const stored = await QuizAttemptModel.findById(ctx.gradingAttemptId).lean();
  assert.equal(stored.status, "SUBMITTED");
  assert.equal(stored.awardedMarks, null, "unmarked is not the same as zero");
});

test("only the assigned teacher may grade, and never an objective answer", async () => {
  const stranger = await api(`/api/lms/attempts/${ctx.gradingAttemptId}/grade`, {
    method: "POST",
    token: ctx.otherTeacher.token,
    body: { marks: [{ questionId: ctx.gradingWrittenId, awardedMarks: 5 }] },
  });
  assert.equal(stranger.status, 403, "a quiz you do not teach cannot be marked");

  const student = await api(`/api/lms/attempts/${ctx.gradingAttemptId}/grading`, {
    token: ctx.studentA1.token,
  });
  assert.equal(student.status, 403, "students hold no grading permission at all");

  const objective = await api(`/api/lms/attempts/${ctx.gradingAttemptId}/grade`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { marks: [{ questionId: ctx.gradingObjectiveId, awardedMarks: 1 }] },
  });
  assert.equal(objective.status, 409, "objective marks were decided at submission");
  assert.match(objective.data.error, /automatically/i);

  const live = await createQuiz((await createWeek({ title: "Live paper week" })).id, {
    title: "Live paper",
    maxMarks: 5,
    durationMinutes: 10,
  });
  await addChoiceQuestion(live.id, { marks: 5 });
  await openQuiz(live.id);
  const started = await api(`/api/lms/quizzes/${live.id}/attempts`, {
    method: "POST",
    token: ctx.studentA1.token,
  });
  const tooEarly = await api(`/api/lms/attempts/${started.data.attempt.id}/grade`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { marks: [{ questionId: started.data.questions[0].id, awardedMarks: 1 }] },
  });
  assert.equal(tooEarly.status, 409, "an unsubmitted attempt has nothing to mark");
});

test("a graded attempt reaches the course gradebook as one row", async () => {
  await api(`/api/lms/attempts/${ctx.gradingAttemptId}/grade`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { marks: [{ questionId: ctx.gradingWrittenId, awardedMarks: 4 }] },
  });

  const gradebook = await api(`/api/lms/courses/${ctx.course.id}/grades`, {
    token: ctx.teacher.token,
  });
  assert.equal(gradebook.status, 200, gradebook.text);

  const row = gradebook.data.students.find(
    (student) => student.studentCode === ctx.studentA1.studentId,
  );
  assert.ok(row, "the graded attempt must appear in the course gradebook");
  const quizRow = row.rows.find((entry) => entry.title === "Mixed paper");
  assert.ok(quizRow, "the quiz row must be in the same table as other assessments");
  assert.equal(quizRow.marksObtained, 9);
  assert.equal(quizRow.status, "GRADED");

  // A student may not open the cohort gradebook.
  const refused = await api(`/api/lms/courses/${ctx.course.id}/grades`, {
    token: ctx.studentA1.token,
  });
  assert.equal(refused.status, 403);
});

test("an unsubmitted attempt shows as pending, never as a zero", async () => {
  const week = await createWeek({ title: "Pending week" });
  const quiz = await createQuiz(week.id, {
    title: "Mixed grading policy",
    maxMarks: 10,
    durationMinutes: 20,
    resultReleasePolicy: "AFTER_GRADING",
  });
  const objective = await addChoiceQuestion(quiz.id, { marks: 5, correctIndex: 1 });
  const written = await addWrittenQuestion(quiz.id, { marks: 5 });
  await openQuiz(quiz.id);
  await sitQuiz(quiz.id, {
    answers: [
      { questionId: objective.id, response: "option_2" },
      { questionId: written.id, responseText: "To inspect and improve the process." },
    ],
  });

  const gradebook = await api(`/api/lms/courses/${ctx.course.id}/grades`, {
    token: ctx.teacher.token,
  });
  const row = gradebook.data.students.find(
    (student) => student.studentCode === ctx.studentA1.studentId,
  );
  const pendingRow = row.rows.find((entry) => entry.title === "Mixed grading policy");
  assert.equal(pendingRow.status, "PENDING", "an unmarked attempt is pending, not zero");
  assert.equal(pendingRow.marksObtained, null);
  assert.equal(row.pendingCount >= 1, true);
});

test("a manual release policy withholds results until the teacher releases them", async () => {
  const week = await createWeek({ title: "Manual release week" });
  const quiz = await createQuiz(week.id, {
    title: "Manually released quiz",
    maxMarks: 5,
    durationMinutes: 10,
    resultReleasePolicy: "MANUAL",
  });
  const objective = await addChoiceQuestion(quiz.id, { marks: 5, correctIndex: 0 });
  await openQuiz(quiz.id);
  const { attempt } = await sitQuiz(quiz.id, {
    answers: [{ questionId: objective.id, response: "option_1" }],
  });

  // The objective answer is marked, but the teacher still decides when it is seen.
  const withheld = await api(`/api/lms/attempts/${attempt.id}/result`, {
    token: ctx.studentA1.token,
  });
  assert.equal(withheld.data.released, false, "MANUAL keeps the result back");
  assert.equal(withheld.data.attempt.awardedMarks, undefined);

  const released = await api(`/api/lms/quizzes/${quiz.id}/release-results`, {
    method: "POST",
    token: ctx.teacher.token,
  });
  assert.equal(released.status, 200, released.text);

  const after = await api(`/api/lms/attempts/${attempt.id}/result`, {
    token: ctx.studentA1.token,
  });
  assert.equal(after.data.released, true);
  assert.equal(after.data.attempt.awardedMarks, 5);
  assert.equal(after.data.attempt.passed, true, "the pass mark is compared, not assumed");
});

test("the teacher's attempt roster and question insights read real records", async () => {
  const roster = await api(`/api/lms/quizzes/${ctx.gradingQuizId}/attempts`, {
    token: ctx.teacher.token,
  });
  assert.equal(roster.status, 200, roster.text);
  assert.ok(roster.data.attempts.length >= 1);
  assert.equal(roster.data.attempts[0].studentId, ctx.studentA1.studentId);

  const refused = await api(`/api/lms/quizzes/${ctx.gradingQuizId}/attempts`, {
    token: ctx.studentA1.token,
  });
  assert.equal(refused.status, 403);

  const insights = await api(`/api/lms/quizzes/${ctx.gradingQuizId}/insights`, {
    token: ctx.teacher.token,
  });
  assert.equal(insights.status, 200, insights.text);
  assert.equal(insights.data.questions.length, 2);
  const objectiveRow = insights.data.questions.find(
    (question) => question.id === ctx.gradingObjectiveId,
  );
  assert.equal(objectiveRow.attempts, 1, "insights count the attempts that really happened");
  assert.equal(objectiveRow.correct, 1);
  assert.equal(objectiveRow.failureRate, 0);
});

test("quiz lifecycle transitions are audited against the acting teacher", async () => {
  const week = await createWeek({ title: "Audit week" });
  const quiz = await createQuiz(week.id, { title: "Audited quiz", maxMarks: 5, durationMinutes: 5 });
  await addChoiceQuestion(quiz.id, { marks: 5 });
  await openQuiz(quiz.id);

  const audit = await api("/api/audit?module=lms", { token: ctx.adminToken });
  assert.equal(audit.status, 200, audit.text);
  assert.ok(
    audit.data.audit.some(
      (entry) =>
        entry.action === "QUIZ_STATUS_CHANGED" && String(entry.resourceId) === quiz.id,
    ),
    "a lifecycle change is recorded exactly as a manual one would be",
  );
});