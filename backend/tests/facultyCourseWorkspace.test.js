import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Faculty Course Workspace authorisation suite.
 *
 * The workspace was reported as unusable for faculty: quiz authoring refused with
 * "Quiz authoring is limited to the course team." This suite pins down what the
 * endpoints actually promise, so the browser's view of who may author can never be
 * the only thing standing between a teacher and their own course:
 *
 *  1. a faculty member with a real `CourseTeachingAssignment` for a section of the
 *     course is told `canManage: true` by the server and can create a quiz in
 *     their own section — the case that was broken;
 *  2. that same teacher cannot reach a section they do not teach, in any of the
 *     three authoring routes (quiz, assignment, material), because each route
 *     re-derives the caller's teaching scope server-side;
 *  3. a faculty member with no teaching claim on the course cannot reach it at
 *     all, and a teacher cannot schedule a material release without a release
 *     time, which is why the workspace writes the time before it moves the state;
 *  4. a material uploaded without naming sections reaches only the uploader's own
 *     sections, so an A1 teacher cannot publish into an A2 cohort by omitting the
 *     audience.
 *
 * Every case runs against the real Express app on an ephemeral port and a dedicated
 * test database, so the assertions exercise the same middleware, authorisation
 * service and persistence path production uses.
 */

const TEST_DB =
  process.env.COLLEGEOS_FACULTY_LMS_TEST_DB || "collegeos_faculty_lms_test";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";

// The app reads these at module load, so they are set before anything is imported.
process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-faculty-lms-suite-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";
process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR = "2025/2026";

const ctx = {};
let baseUrl = "";
let server = null;
let mongooseRef = null;

/**
 * One request helper for both payload shapes.
 *
 * The material routes are multipart, so a plain JSON string is not enough; a
 * `FormData` body is passed through untouched and the browser sets the boundary.
 */
async function api(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

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
  return { status: response.status, data, text };
}

async function login(email, password) {
  const res = await api("/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.text}`);
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

  ctx.adminToken = await activate(
    "admin@collegeos.test",
    process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD,
    "Collegeos@Admin1",
  );

  /* --- Real academic records, created through the public APIs --------------- */

  const course = await api("/api/courses", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      code: "CS401",
      name: "Software Engineering",
      semester: 4,
      credits: 4,
    },
  });
  assert.equal(course.status, 201, `course creation failed: ${course.text}`);
  ctx.courseId = course.data.course.id;

  for (const code of ["A1", "A2"]) {
    const section = await api("/api/sections", {
      method: "POST",
      token: ctx.adminToken,
      body: { code, program: "BCA", semester: 4, batch: "2025" },
    });
    assert.ok(section.status === 201 || section.status === 409, section.text);
  }

  // Two faculty members: one teaches A1, the other teaches nothing on this course.
  ctx.teacher = await provision(ctx.adminToken, {
    firstName: "Suresh",
    lastName: "Karki",
    role: "faculty",
    designation: "Lecturer",
  });
  ctx.outsider = await provision(ctx.adminToken, {
    firstName: "Nisha",
    lastName: "Thapa",
    role: "faculty",
    designation: "Lecturer",
  });

  const teaching = await api("/api/admin/teaching-assignments", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      facultyUserId: ctx.teacher.userId,
      courseId: ctx.courseId,
      sectionCode: "A1",
      semester: 4,
    },
  });
  assert.ok(teaching.status === 201 || teaching.status === 200, teaching.text);

  // A week to author against, created by the teacher who is allowed to create it.
  const week = await api(`/api/lms/courses/${ctx.courseId}/weeks`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { title: "Week 1 · Foundations" },
  });
  assert.equal(week.status, 201, `week creation failed: ${week.text}`);
  ctx.weekId = week.data.week.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongooseRef) {
    await mongooseRef.connection.dropDatabase();
    await mongooseRef.connection.close();
  }
});

/** A future window, so a created quiz can never open while the suite runs. */
function quizWindow() {
  return {
    openAt: new Date(Date.now() + 3_600_000).toISOString(),
    closeAt: new Date(Date.now() + 7_200_000).toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* 1. Assigned faculty can author — the case that was reported broken */
/* ------------------------------------------------------------------ */

test("assigned faculty are told they can manage the course and can create a quiz", async () => {
  const overview = await api(`/api/lms/courses/${ctx.courseId}/overview`, {
    token: ctx.teacher.token,
  });
  assert.equal(overview.status, 200, overview.text);
  assert.equal(overview.data.access.canManage, true);
  assert.deepEqual(overview.data.scope.sectionCodes, ["A1"]);

  // The quiz list carries the same verdict, and it is the one the workspace reads
  // to decide whether to offer authoring. It must not disagree with the overview.
  const list = await api(`/api/lms/courses/${ctx.courseId}/quizzes`, {
    token: ctx.teacher.token,
  });
  assert.equal(list.status, 200, list.text);
  assert.equal(list.data.access.canManage, true);
  assert.deepEqual(list.data.access.sections, ["A1"]);

  const created = await api(`/api/lms/courses/${ctx.courseId}/quizzes`, {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      weekId: ctx.weekId,
      title: "Foundations checkpoint",
      maxMarks: 10,
      passingMarks: 4,
      durationMinutes: 20,
      attemptsAllowed: 1,
      resultReleasePolicy: "AFTER_GRADING",
      ...quizWindow(),
    },
  });
  assert.equal(created.status, 201, `assigned faculty must be able to author: ${created.text}`);
  assert.deepEqual(created.data.quiz.sectionCodes, ["A1"]);
  assert.equal(created.data.quiz.status, "DRAFT");
  ctx.quizId = created.data.quiz.id;
});

test("a teacher may add questions to a quiz in their own section", async () => {
  const added = await api(`/api/lms/quizzes/${ctx.quizId}/questions`, {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      type: "MULTIPLE_CHOICE",
      text: "Which HTTP status means created?",
      marks: 5,
      options: [{ text: "201" }, { text: "404" }],
      correctAnswer: ["option_1"],
    },
  });
  assert.equal(added.status, 201, added.text);
  assert.equal(added.data.questionCount, 1);
});

/* ------------------------------------------------------------------ */
/* 2. Section and course scope are re-checked on every write           */
/* ------------------------------------------------------------------ */

test("a teacher cannot create a quiz for a section they do not teach", async () => {
  const res = await api(`/api/lms/courses/${ctx.courseId}/quizzes`, {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      weekId: ctx.weekId,
      title: "Smuggled into another section",
      maxMarks: 10,
      passingMarks: 4,
      durationMinutes: 20,
      attemptsAllowed: 1,
      resultReleasePolicy: "AFTER_GRADING",
      sectionCodes: ["A2"],
      ...quizWindow(),
    },
  });
  assert.equal(res.status, 403, res.text);
});

test("a teacher cannot set an assignment for a section they do not teach", async () => {
  const res = await api("/api/assignments", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Section A2 problem set",
      courseId: ctx.courseId,
      sectionCodes: ["A2"],
      semester: 4,
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  assert.equal(res.status, 403, res.text);
});

test("a teacher cannot set an assignment for a semester they do not teach", async () => {
  // The course runs in semester 4 and the teaching claim is for semester 4; the
  // audience resolver must not let the payload move the assignment to semester 6.
  const res = await api("/api/assignments", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Next semester's problem set",
      courseId: ctx.courseId,
      sectionCodes: ["A1"],
      semester: 6,
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  assert.equal(res.status, 403, res.text);
});

test("an assigned teacher can set an assignment for their own section", async () => {
  const res = await api("/api/assignments", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      title: "Foundations problem set",
      description: "Answer every part.",
      courseId: ctx.courseId,
      sectionCodes: ["A1"],
      semester: 4,
      maxMarks: 50,
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.deepEqual(res.data.assignment.sectionCodes, ["A1"]);
  assert.equal(res.data.assignment.status, "OPEN");
  assert.equal(res.data.assignment.facultyUserId, ctx.teacher.userId);
});

/* ------------------------------------------------------------------ */
/* 3. No teaching claim means read-only, not an error                  */
/* ------------------------------------------------------------------ */

test("faculty with no teaching claim on the course cannot see it", async () => {
  // The workspace is opened from the course the caller teaches, so this is the
  // case where a staff account lands on a course that is not theirs. Both reads
  // report "not found" rather than "forbidden", so the course is not confirmed to
  // exist by probing its id.
  const overview = await api(`/api/lms/courses/${ctx.courseId}/overview`, {
    token: ctx.outsider.token,
  });
  assert.equal(overview.status, 404, overview.text);

  const list = await api(`/api/lms/courses/${ctx.courseId}/quizzes`, {
    token: ctx.outsider.token,
  });
  assert.equal(list.status, 404, list.text);
});

test("faculty with no teaching claim cannot create a quiz", async () => {
  const res = await api(`/api/lms/courses/${ctx.courseId}/quizzes`, {
    method: "POST",
    token: ctx.outsider.token,
    body: {
      weekId: ctx.weekId,
      title: "Not mine to set",
      maxMarks: 10,
      passingMarks: 4,
      durationMinutes: 20,
      attemptsAllowed: 1,
      resultReleasePolicy: "AFTER_GRADING",
      ...quizWindow(),
    },
  });
  assert.equal(res.status, 403, res.text);
});

test("faculty with no teaching claim cannot upload a material to the week", async () => {
  const form = new FormData();
  form.append("title", "Someone else's handout");
  form.append(
    "file",
    new Blob(["%PDF-1.4 test handout"], { type: "application/pdf" }),
    "handout.pdf",
  );

  const res = await api(`/api/lms/weeks/${ctx.weekId}/materials`, {
    method: "POST",
    token: ctx.outsider.token,
    body: form,
  });
  assert.equal(res.status, 403, res.text);
});

/* ------------------------------------------------------------------ */
/* 4. Material upload and release by an assigned teacher               */
/* ------------------------------------------------------------------ */

test("an assigned teacher can upload a material and it stays invisible until released", async () => {
  const form = new FormData();
  form.append("title", "Week 1 slides");
  form.append("materialType", "SLIDES");
  // The workspace always states DRAFT explicitly: the server publishes anything it
  // is not told to hold back, so relying on the default would put this in front of
  // students at the moment of upload.
  form.append("status", "DRAFT");
  form.append(
    "file",
    new Blob(["%PDF-1.4 week one slides"], { type: "application/pdf" }),
    "week1.pdf",
  );

  const res = await api(`/api/lms/weeks/${ctx.weekId}/materials`, {
    method: "POST",
    token: ctx.teacher.token,
    body: form,
  });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.data.material.status, "DRAFT");
  assert.equal(res.data.material.state, "DRAFT");
  // The upload named no section. The audience must still be the uploader's own
  // sections rather than every section in the semester, which is what an empty
  // section filter means to the student-facing queries.
  assert.deepEqual(res.data.material.sectionCodes, ["A1"]);
  ctx.materialId = res.data.material.id;

  // Draft state is confirmed by a read, not only by the write's response.
  const week = await api(`/api/lms/weeks/${ctx.weekId}`, { token: ctx.teacher.token });
  assert.equal(week.status, 200, week.text);
  const stored = week.data.week.materials.find((row) => row.id === ctx.materialId);
  assert.ok(stored, "the uploaded material is missing from its week");
  assert.equal(stored.state, "DRAFT");
});

test("a teacher cannot upload a material naming a section they do not teach", async () => {
  const form = new FormData();
  form.append("title", "Handout for the wrong section");
  form.append("materialType", "DOCUMENT");
  form.append("status", "DRAFT");
  form.append("sectionCodes", "A2");
  form.append(
    "file",
    new Blob(["%PDF-1.4 wrong section"], { type: "application/pdf" }),
    "wrong-section.pdf",
  );

  const res = await api(`/api/lms/weeks/${ctx.weekId}/materials`, {
    method: "POST",
    token: ctx.teacher.token,
    body: form,
  });
  // The audience is resolved before the file is stored, so a refused upload does
  // not leave an orphaned file behind.
  assert.equal(res.status, 403, res.text);
});

test("a material cannot be scheduled without a release time", async () => {
  // The status route accepts only a state. The workspace therefore writes the
  // release time with a PATCH first, and this is the failure that ordering avoids.
  const res = await api(`/api/lms/materials/${ctx.materialId}/status`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { status: "SCHEDULED" },
  });
  assert.equal(res.status, 422, res.text);
});

test("a release time and then a state move the material to scheduled", async () => {
  const patched = await api(`/api/lms/materials/${ctx.materialId}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { releaseAt: new Date(Date.now() + 172_800_000).toISOString() },
  });
  assert.equal(patched.status, 200, patched.text);

  const scheduled = await api(`/api/lms/materials/${ctx.materialId}/status`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { status: "SCHEDULED" },
  });
  assert.equal(scheduled.status, 200, scheduled.text);
  assert.equal(scheduled.data.material.state, "SCHEDULED");

  // Published materials are resolved by the server clock, so a future release
  // instant stays SCHEDULED rather than being reported as live.
  const week = await api(`/api/lms/weeks/${ctx.weekId}`, { token: ctx.teacher.token });
  const stored = week.data.week.materials.find((row) => row.id === ctx.materialId);
  assert.equal(stored.state, "SCHEDULED");
});

test("releasing a scheduled material now must also clear the release instant", async () => {
  // The effective state honours a future `releaseAt` over the stored status, so
  // setting PUBLISHED alone would leave it scheduled and invisible. This is the
  // order the workspace performs: clear the time, then set the state.
  const patched = await api(`/api/lms/materials/${ctx.materialId}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { releaseAt: null },
  });
  assert.equal(patched.status, 200, patched.text);
  assert.equal(patched.data.material.releaseAt, null);

  const published = await api(`/api/lms/materials/${ctx.materialId}/status`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { status: "PUBLISHED" },
  });
  assert.equal(published.status, 200, published.text);
  assert.equal(published.data.material.state, "PUBLISHED");

  const archived = await api(`/api/lms/materials/${ctx.materialId}/status`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { status: "ARCHIVED" },
  });
  assert.equal(archived.status, 200, archived.text);
  assert.equal(archived.data.material.state, "ARCHIVED");
  assert.equal(archived.data.material.id, ctx.materialId);
});

/* ------------------------------------------------------------------ */
/* 5. The routes are not left open to anonymous callers                */
/* ------------------------------------------------------------------ */

test("quiz authoring routes require a session", async () => {
  const list = await api(`/api/lms/courses/${ctx.courseId}/quizzes`);
  assert.equal(list.status, 401);

  const create = await api(`/api/lms/courses/${ctx.courseId}/quizzes`, {
    method: "POST",
    body: { weekId: ctx.weekId, title: "Anonymous" },
  });
  assert.equal(create.status, 401);
});

/* ------------------------------------------------------------------ */
/* 6. Teaching progress is declared, never inferred from opening       */
/* ------------------------------------------------------------------ */

/**
 * Uploads a deck for the teaching-progress cases.
 *
 * A real PPTX body is used rather than a labelled blob, because the upload route
 * verifies the stored content against the declared family. A file the server would
 * reject could not be used to prove anything about recording progress.
 */
async function uploadDeck(title, slideCount = 24) {
  const form = new FormData();
  form.append("title", title);
  form.append("materialType", "SLIDES");
  form.append("status", "DRAFT");
  form.append(
    "file",
    new Blob([buildPptx(slideCount)], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    "week1-slides.pptx",
  );

  const res = await api(`/api/lms/weeks/${ctx.weekId}/materials`, {
    method: "POST",
    token: ctx.teacher.token,
    body: form,
  });
  assert.equal(res.status, 201, res.text);
  return res.data.material;
}

/**
 * A genuine PPTX: an Office Open XML package carrying the parts a presentation has.
 *
 * Entries are stored uncompressed so the container is readable both by the upload
 * policy's content check, which looks for `ppt/presentation.xml`, and by the slide
 * counter, which counts `ppt/slides/slideN.xml` entries. The slide count therefore
 * comes from the real file rather than from anything the client declared.
 */
function buildPptx(slideCount) {
  const slides = Array.from(
    { length: slideCount },
    (_unused, index) => [`ppt/slides/slide${index + 1}.xml`, '<p:sld xmlns:a="x"><a:t>x</a:t></p:sld>'],
  );
  return storedZip([
    ["[Content_Types].xml", '<Types xmlns="x"/>'],
    ["ppt/presentation.xml", '<p:presentation xmlns:a="x"/>'],
    ...slides,
  ]);
}

/** Builds a ZIP archive with every entry stored uncompressed. */
function storedZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const dataBytes = Buffer.from(content, "utf8");
    const crc = crc32(dataBytes);

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBytes.length, 18);
    local.writeUInt32LE(dataBytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    localParts.push(local, dataBytes);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBytes.length, 20);
    central.writeUInt32LE(dataBytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centralParts.push(central);

    offset += local.length + dataBytes.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

test("reading a material reports no teaching position, because none was declared", async () => {
  const material = await uploadDeck("Week 1 deck");

  const read = await api(`/api/lms/materials/${material.id}/teaching-progress`, {
    token: ctx.teacher.token,
  });
  assert.equal(read.status, 200, read.text);

  // Opening a file is not teaching. The read model keeps the two apart deliberately,
  // so this is null even though the teacher has certainly seen the file.
  assert.equal(read.data.position, null);
  assert.equal(read.data.recordCount, 0);
  assert.equal(read.data.material.opened.firstViewedAt, null);
});

test("a teacher records a session and the position becomes the next starting point", async () => {
  const material = await uploadDeck("Foundations deck");

  const recorded = await api(`/api/lms/materials/${material.id}/teaching-progress`, {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      fromUnit: 1,
      toUnit: 12,
      topic: "Requirement elicitation",
      notes: "Stop before the worked example.",
      sectionCodes: ["A1"],
    },
  });
  assert.equal(recorded.status, 201, recorded.text);
  assert.equal(recorded.data.position.toUnit, 12);

  const read = await api(`/api/lms/materials/${material.id}/teaching-progress`, {
    token: ctx.teacher.token,
  });
  assert.equal(read.data.position.fromUnit, 1);
  assert.equal(read.data.position.sectionCode, "A1");
  assert.equal(read.data.position.recordedBy, "Suresh Karki");

  // The material's own marker moves with the declaration, so the planner can show a
  // position without a second round trip.
  const week = await api(`/api/lms/weeks/${ctx.weekId}`, { token: ctx.teacher.token });
  const stored = week.data.week.materials.find((row) => row.id === material.id);
  assert.equal(stored.lastTaughtToUnit, 12);
  assert.equal(stored.lastTaughtTopic, "Requirement elicitation");

  // And the week's teaching-progress payload carries the class it was declared in.
  const position = week.data.week.teachingProgress.find((row) => row.materialId === material.id);
  assert.ok(position, "the week payload is missing the declared position");
  assert.equal(position.toUnit, 12);
  assert.equal(position.sectionCode, "A1");

  ctx.recordedMaterialId = material.id;
});

test("a later session is the position, and the earlier one is kept as history", async () => {
  const recorded = await api(`/api/lms/materials/${ctx.recordedMaterialId}/teaching-progress`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { fromUnit: 13, toUnit: 20, topic: "Estimation", sectionCodes: ["A1"] },
  });
  assert.equal(recorded.status, 201, recorded.text);
  assert.equal(recorded.data.position.fromUnit, 13);

  const read = await api(`/api/lms/materials/${ctx.recordedMaterialId}/teaching-progress`, {
    token: ctx.teacher.token,
  });
  assert.equal(read.data.recordCount, 2, "the earlier session must not be overwritten");
  // Newest first, so the first row is the one a teacher resumes from.
  assert.equal(read.data.records[0].fromUnit, 13);
  assert.equal(read.data.records[1].toUnit, 12);
});

test("a position beyond the end of the real document is refused", async () => {
  // The deck genuinely holds five slides, so the server knows its length from the
  // file and the teacher does not declare a total at all.
  const material = await uploadDeck("Length-checked deck", 5);
  assert.equal(material.documentMeta.slideCount, 5);

  const declared = await api(`/api/lms/materials/${material.id}/teaching-progress`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { fromUnit: 1, toUnit: 5, sectionCodes: ["A1"] },
  });
  assert.equal(declared.status, 201, declared.text);

  const beyond = await api(`/api/lms/materials/${material.id}/teaching-progress`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { fromUnit: 6, toUnit: 9, sectionCodes: ["A1"] },
  });
  assert.equal(beyond.status, 422, beyond.text);
});

test("a document whose length cannot be read takes the teacher's own total", async () => {
  // A legacy PowerPoint file is an OLE2 compound document: there is no slide list to
  // count, so the system reports no length rather than inventing one. The teacher then
  // declares the total, and that declared figure is what a range is checked against.
  const form = new FormData();
  form.append("title", "Legacy deck");
  form.append("materialType", "SLIDES");
  form.append("status", "DRAFT");
  form.append(
    "file",
    new Blob([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 1, 2, 3])], {
      type: "application/vnd.ms-powerpoint",
    }),
    "legacy.ppt",
  );
  const uploaded = await api(`/api/lms/weeks/${ctx.weekId}/materials`, {
    method: "POST",
    token: ctx.teacher.token,
    body: form,
  });
  assert.equal(uploaded.status, 201, uploaded.text);
  const material = uploaded.data.material;
  assert.equal(material.documentMeta.unitCount, null, "an OLE2 deck has no countable structure");

  const declared = await api(`/api/lms/materials/${material.id}/teaching-progress`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { fromUnit: 1, toUnit: 4, totalUnits: 4, sectionCodes: ["A1"] },
  });
  assert.equal(declared.status, 201, declared.text);
  assert.equal(declared.data.documentLength.known, true);
  assert.equal(declared.data.documentLength.totalUnits, 4);

  const beyond = await api(`/api/lms/materials/${material.id}/teaching-progress`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { fromUnit: 5, toUnit: 8, totalUnits: 4, sectionCodes: ["A1"] },
  });
  assert.equal(beyond.status, 422, beyond.text);

  // Without a length anywhere the record is still kept, because an honest unknown is
  // not a reason to refuse a teacher's own account of the class.
  const withoutTotal = await api(`/api/lms/materials/${material.id}/teaching-progress`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { fromUnit: 1, toUnit: 3, sectionCodes: ["A1"] },
  });
  assert.equal(withoutTotal.status, 201, withoutTotal.text);
  assert.equal(withoutTotal.data.documentLength.known, false);
  assert.equal(withoutTotal.data.position.percentage, null);
});

test("an ending position before the starting one is refused", async () => {
  const res = await api(`/api/lms/materials/${ctx.recordedMaterialId}/teaching-progress`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { fromUnit: 10, toUnit: 4, sectionCodes: ["A1"] },
  });
  assert.equal(res.status, 422, res.text);
});

test("the course teaching history is scoped to the sections the teacher teaches", async () => {
  const all = await api(`/api/lms/courses/${ctx.courseId}/teaching-history`, {
    token: ctx.teacher.token,
  });
  assert.equal(all.status, 200, all.text);
  assert.ok(all.data.records.length > 0, "recorded sessions must appear in the history");

  // Every row names the material it was declared against, so a teacher can find the
  // session they recorded rather than only a bare range.
  const titles = all.data.records.map((row) => row.materialTitle);
  assert.ok(titles.includes("Foundations deck"), titles.join(", "));
  assert.ok(
    all.data.records.every((row) => row.sectionCode === "A1" || row.sectionCode === null),
    "history must not include another cohort's sessions",
  );
  assert.ok(
    all.data.records.some((row) => row.facultyName === "Suresh Karki"),
    "each session must name the teacher who declared it",
  );

  // Asking for a section the caller does not teach narrows to their own rather than
  // widening: the query is a filter, never a way to read a colleague's records. A2 is
  // therefore answered with the A1 sessions, not with A2's and not with an error that
  // would confirm A2 sessions exist.
  const other = await api(
    `/api/lms/courses/${ctx.courseId}/teaching-history?section=A2`,
    { token: ctx.teacher.token },
  );
  assert.equal(other.status, 200, other.text);
  assert.ok(
    other.data.records.every((row) => row.sectionCode !== "A2"),
    "a section filter must not return another cohort's sessions",
  );
});

test("a teacher cannot record a position on another teacher's class", async () => {
  // The outsider is given a real teaching claim on A2 so the refusal below is about
  // whose class it is, not about the course being unknown to them.
  const teaching = await api("/api/admin/teaching-assignments", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      facultyUserId: ctx.outsider.userId,
      courseId: ctx.courseId,
      sectionCode: "A2",
      semester: 4,
    },
  });
  assert.ok(teaching.status === 201 || teaching.status === 200, teaching.text);

  const session = await api("/api/timetable", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      course: ctx.courseId,
      facultyUser: ctx.outsider.userId,
      semester: 4,
      sectionCode: "A2",
      scheduledDay: "Monday",
      startTime: "10:00",
      endTime: "11:00",
    },
  });
  assert.equal(session.status, 201, session.text);
  ctx.outsiderSessionId = session.data.session.id;

  const material = await uploadDeck("Recorded against a colleague's class");
  const res = await api(`/api/lms/materials/${material.id}/teaching-progress`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { fromUnit: 1, toUnit: 4, timetableSessionId: ctx.outsiderSessionId },
  });
  // A session id in a body is an identifier, not a claim: inheriting its section
  // would also inherit its attendance register, so another teacher's class is refused.
  assert.equal(res.status, 403, res.text);
});

test("a session belonging to a different course cannot be attached", async () => {
  const otherCourse = await api("/api/courses", {
    method: "POST",
    token: ctx.adminToken,
    body: { code: "CS402", name: "Databases", semester: 4, credits: 3 },
  });
  assert.equal(otherCourse.status, 201, otherCourse.text);

  const session = await api("/api/timetable", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      course: otherCourse.data.course.id,
      facultyUser: ctx.teacher.userId,
      semester: 4,
      sectionCode: "A1",
      scheduledDay: "Tuesday",
      startTime: "10:00",
      endTime: "11:00",
    },
  });
  assert.equal(session.status, 201, session.text);

  const res = await api(`/api/lms/materials/${ctx.recordedMaterialId}/teaching-progress`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { fromUnit: 21, toUnit: 24, timetableSessionId: session.data.session.id },
  });
  assert.equal(res.status, 422, res.text);
});

test("teaching positions and history are not readable by faculty with no claim", async () => {
  const noClaim = await provision(ctx.adminToken, {
    firstName: "Bina",
    lastName: "Adhikari",
    role: "faculty",
    designation: "Lecturer",
  });

  // A caller with no teaching claim is answered as though the course were not
  // there at all, rather than "forbidden" — the same answer a stranger gets. Leaking
  // "forbidden" would confirm the course and its materials exist.
  const progress = await api(`/api/lms/materials/${ctx.recordedMaterialId}/teaching-progress`, {
    token: noClaim.token,
  });
  assert.equal(progress.status, 404, progress.text);

  const history = await api(`/api/lms/courses/${ctx.courseId}/teaching-history`, {
    token: noClaim.token,
  });
  assert.equal(history.status, 404, history.text);

  // A teacher who does teach the course, but not the material's section, is refused
  // explicitly: here the course is visible to them, so hiding it would be a lie.
  const scoped = await provision(ctx.adminToken, {
    firstName: "Gopal",
    lastName: "Rijal",
    role: "faculty",
    designation: "Lecturer",
  });
  const claim = await api("/api/admin/teaching-assignments", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      facultyUserId: scoped.userId,
      courseId: ctx.courseId,
      sectionCode: "A2",
      semester: 4,
    },
  });
  assert.ok(claim.status === 201 || claim.status === 200, claim.text);

  // A colleague who teaches the same course sees the same course-level position,
  // because a material's week is course-scoped work. What they may not do is write
  // into another cohort's record, which the write route checks against the session.
  const colleague = await api(
    `/api/lms/materials/${ctx.recordedMaterialId}/teaching-progress`,
    { token: scoped.token },
  );
  assert.equal(colleague.status, 200, colleague.text);

  const written = await api(`/api/lms/materials/${ctx.recordedMaterialId}/teaching-progress`, {
    method: "POST",
    token: scoped.token,
    body: { fromUnit: 1, toUnit: 2, sectionCodes: ["A1"] },
  });
  assert.equal(written.status, 403, written.text);
});

test("teaching progress routes require a session", async () => {
  const read = await api(`/api/lms/materials/${ctx.recordedMaterialId}/teaching-progress`);
  assert.equal(read.status, 401);

  const record = await api(`/api/lms/materials/${ctx.recordedMaterialId}/teaching-progress`, {
    method: "POST",
    body: { fromUnit: 1, toUnit: 2 },
  });
  assert.equal(record.status, 401);

  const history = await api(`/api/lms/courses/${ctx.courseId}/teaching-history`);
  assert.equal(history.status, 401);
});