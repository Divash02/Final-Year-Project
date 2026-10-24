import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Faculty My Timetable suite.
 *
 * The read model behind `/api/my-timetable` existed with no test and no consumer,
 * and `Timetable.changes` / `notifiedFaculty` / `notifiedAt` were declared on the
 * model but written by nothing — so a change to a teacher's class was silent. These
 * cases pin both halves:
 *
 *  1. **The schedule is the record.** A teacher sees only the classes they deliver,
 *     resolved from their own user id; a colleague's classes are absent, and an
 *     empty week reports that nothing is published rather than inventing a class.
 *  2. **A change is recorded, and the teacher is told.** Moving or cancelling a class
 *     appends to the change trail with the before and after values, and produces one
 *     notification in the centralised feed — not two when the same edit is saved
 *     again, and not one when the person making the change is the teacher affected.
 *  3. **A class connects to the systems that own it.** Opening a class links the
 *     existing attendance register rather than creating a second one, and teaching
 *     progress recorded against that class appears on the class.
 */

const TEST_DB =
  process.env.COLLEGEOS_TIMETABLE_TEST_DB || "collegeos_my_timetable_test";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";

process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-my-timetable-suite-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.INSTITUTION_TIME_ZONE = "Asia/Kathmandu";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";
process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR = "2025/2026";

const ctx = {};
let baseUrl = "";
let server = null;
let mongooseRef = null;

async function api(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    if (body instanceof FormData) {
      // Multipart bodies carry their own boundary; forcing a JSON
      // content type here would strip the uploaded file.
      payload = body;
    } else {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
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
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
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

/** Creates a timetable session through the registrar's own route. */
async function scheduleSession(body) {
  const res = await api("/api/timetable", {
    method: "POST",
    token: ctx.adminToken,
    body,
  });
  assert.equal(res.status, 201, `scheduling failed: ${res.text}`);
  return res.data.session;
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

  const course = await api("/api/courses", {
    method: "POST",
    token: ctx.adminToken,
    body: { code: "CS501", name: "Distributed Systems", semester: 5, credits: 4 },
  });
  assert.equal(course.status, 201, course.text);
  ctx.courseId = course.data.course.id;

  const section = await api("/api/sections", {
    method: "POST",
    token: ctx.adminToken,
    body: { code: "B1", program: "BCS", semester: 5, batch: "2024" },
  });
  assert.ok(section.status === 201 || section.status === 409, section.text);

  // Two teachers on the same course in different sections, plus one who teaches
  // nothing here. The colleague case is what proves scope resolution is real.
  ctx.teacher = await provision(ctx.adminToken, {
    firstName: "Aarav",
    lastName: "Shrestha",
    role: "faculty",
    designation: "Lecturer",
  });
  ctx.colleague = await provision(ctx.adminToken, {
    firstName: "Prativa",
    lastName: "Gurung",
    role: "faculty",
    designation: "Lecturer",
  });

  for (const [who, sectionCode] of [
    [ctx.teacher, "B1"],
    [ctx.colleague, "B2"],
  ]) {
    const sectionRow = await api("/api/sections", {
      method: "POST",
      token: ctx.adminToken,
      body: { code: sectionCode, program: "BCS", semester: 5, batch: "2024" },
    });
    assert.ok(sectionRow.status === 201 || sectionRow.status === 409, sectionRow.text);

    const teaching = await api("/api/admin/teaching-assignments", {
      method: "POST",
      token: ctx.adminToken,
      body: {
        facultyUserId: who.userId,
        courseId: ctx.courseId,
        sectionCode,
        semester: 5,
      },
    });
    assert.ok(teaching.status === 201 || teaching.status === 200, teaching.text);
  }

  // A week to hang a material and a teaching record off.
  const week = await api(`/api/lms/courses/${ctx.courseId}/weeks`, {
    method: "POST",
    token: ctx.teacher.token,
    body: { title: "Week 1 · Replication" },
  });
  assert.equal(week.status, 201, week.text);
  ctx.weekId = week.data.week.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongooseRef) {
    await mongooseRef.connection.dropDatabase();
    await mongooseRef.connection.close();
  }
});

/* ------------------------------------------------------------------ */
/* 1. The schedule is the caller's own record                          */
/* ------------------------------------------------------------------ */

test("a teacher sees the classes they deliver and not a colleague's", async () => {
  const mine = await scheduleSession({
    course: ctx.courseId,
    facultyUser: ctx.teacher.userId,
    semester: 5,
    sectionCode: "B1",
    scheduledDay: "Monday",
    startTime: "10:00",
    endTime: "11:00",
    room: "A-201",
  });
  const theirs = await scheduleSession({
    course: ctx.courseId,
    facultyUser: ctx.colleague.userId,
    semester: 5,
    sectionCode: "B2",
    scheduledDay: "Monday",
    startTime: "10:00",
    endTime: "11:00",
    room: "A-202",
  });
  ctx.mineSessionId = mine.id;
  ctx.theirsSessionId = theirs.id;

  const res = await api("/api/my-timetable?view=week", { token: ctx.teacher.token });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.perspective, "TEACHER");
  assert.equal(res.data.published, true);

  const ids = res.data.entries.map((entry) => entry.id);
  assert.ok(ids.includes(mine.id), "a teacher's own class must appear");
  assert.ok(!ids.includes(theirs.id), "a colleague's class must not appear");
  assert.ok(
    res.data.entries.every((entry) => entry.facultyUserId === ctx.teacher.userId),
    "every entry must belong to the caller",
  );
});

test("each class carries its course, section, faculty, room, time and session state", async () => {
  const res = await api("/api/my-timetable?view=week", { token: ctx.teacher.token });
  const entry = res.data.entries.find((row) => row.id === ctx.mineSessionId);
  assert.ok(entry, "the class is missing from the week");

  assert.equal(entry.courseId, ctx.courseId);
  assert.equal(entry.courseCode, "CS501");
  assert.equal(entry.sectionCode, "B1");
  assert.equal(entry.facultyUserId, ctx.teacher.userId);
  assert.equal(entry.facultyName, "Aarav Shrestha");
  assert.equal(entry.room, "A-201");
  assert.equal(entry.startTime, "10:00");
  assert.equal(entry.endTime, "11:00");
  assert.equal(entry.status, "SCHEDULED");
  assert.equal(entry.sessionType, "REGULAR_CLASS");
  // A recurring weekday resolves to a concrete date inside the window, which is
  // what lets a day column and a month cell agree with each other.
  assert.match(entry.occurrenceDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("the three views are the same data at three scales", async () => {
  const week = await api("/api/my-timetable?view=week", { token: ctx.teacher.token });
  assert.equal(week.data.view, "week");
  assert.equal(week.data.days.length, 7, "a week is always seven days, empties included");
  assert.ok(
    week.data.window.start <= week.data.window.end,
    "the window must be ordered",
  );

  const month = await api("/api/my-timetable?view=month", { token: ctx.teacher.token });
  assert.equal(month.data.view, "month");
  const monthStart = month.data.window.start;
  const monthEnd = month.data.window.end;
  assert.equal(monthStart.slice(0, 7), monthEnd.slice(0, 7), "a month window stays in one month");
  assert.equal(Number(monthStart.slice(8, 10)), 1, "a month window starts on the 1st");

  const today = await api("/api/my-timetable?view=today", { token: ctx.teacher.token });
  assert.equal(today.data.view, "today");
  assert.equal(today.data.days.length, 1);
  assert.equal(today.data.days[0].date, today.data.today);
});

test("an unknown view is refused rather than silently defaulted", async () => {
  const res = await api("/api/my-timetable?view=fortnight", {
    token: ctx.teacher.token,
  });
  assert.equal(res.status, 422, res.text);
});

test("a teacher with no classes sees an unpublished schedule, not an invented one", async () => {
  const nobody = await provision(ctx.adminToken, {
    firstName: "Deepak",
    lastName: "Bhattarai",
    role: "faculty",
    designation: "Lecturer",
  });

  const res = await api("/api/my-timetable?view=week", { token: nobody.token });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.published, false, "nothing published is not the same as empty");
  assert.equal(res.data.entries.length, 0);
  assert.equal(res.data.conflictCount, 0);
});

/* ------------------------------------------------------------------ */
/* 2. A change is recorded, and the teacher is told                    */
/* ------------------------------------------------------------------ */

test("moving a class records the change and notifies the teacher", async () => {
  const patched = await api(`/api/timetable/${ctx.mineSessionId}`, {
    method: "PATCH",
    token: ctx.adminToken,
    body: { startTime: "14:00", endTime: "15:00", room: "B-104" },
  });
  assert.equal(patched.status, 200, patched.text);

  // The response reports what changed rather than making the caller re-derive it.
  const fields = patched.data.changes.map((change) => change.field).sort();
  assert.deepEqual(fields, ["endTime", "room", "startTime"]);

  const changes = await api("/api/my-timetable/changes", { token: ctx.teacher.token });
  assert.equal(changes.status, 200, changes.text);
  assert.ok(changes.data.count > 0, "the change must be in the caller's own history");

  const move = changes.data.changes.find((change) => change.field === "startTime");
  assert.ok(move, "the time change is missing from the trail");
  assert.equal(move.from, "10:00");
  assert.equal(move.to, "14:00");
  assert.equal(move.changedByName, "College Administrator");
  // The field the model declared exists to be checked: was the teacher actually told?
  assert.ok(move.notifiedAt, "a change to someone's class must record who was notified");

  // And the trail must now be visible on the class itself.
  const week = await api("/api/my-timetable?view=week", { token: ctx.teacher.token });
  const entry = week.data.entries.find((row) => row.id === ctx.mineSessionId);
  assert.ok(entry.changes.length >= 3, "the class carries its own change trail");
  assert.equal(entry.startTime, "14:00");
});

test("the teacher has a notification naming the change", async () => {
  const notifications = await api("/api/notifications", { token: ctx.teacher.token });
  assert.equal(notifications.status, 200, notifications.text);

  const change = notifications.data.notifications.find(
    (row) => row.category === "timetable" && row.message.includes("Start time"),
  );
  assert.ok(change, "the change did not reach the teacher's notification feed");
  assert.ok(change.message.includes("10:00") && change.message.includes("14:00"));
  // The bell must lead somewhere real, or the message is a dead end.
  assert.equal(change.actionUrl, "/my_timetable");
  assert.ok(
    ["high", "normal"].includes(change.priority),
    "a time change is disruptive, so it must not be sent as low priority",
  );
});

test("saving the same edit again does not produce a second identical bell", async () => {
  const before = await api("/api/notifications", { token: ctx.teacher.token });
  const beforeCount = before.data.notifications.length;

  await api(`/api/timetable/${ctx.mineSessionId}`, {
    method: "PATCH",
    token: ctx.adminToken,
    body: { startTime: "14:00", endTime: "15:00", room: "B-104" },
  });

  const after = await api("/api/notifications", { token: ctx.teacher.token });
  assert.equal(
    after.data.notifications.length,
    beforeCount,
    "an identical re-save must not notify again",
  );
});

test("a save that changes nothing records no change at all", async () => {
  const before = await api("/api/my-timetable/changes", { token: ctx.teacher.token });
  const res = await api(`/api/timetable/${ctx.mineSessionId}`, {
    method: "PATCH",
    token: ctx.adminToken,
    body: { notes: "" },
  });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.data.changes, [], "an unchanged field is not a change");

  const after = await api("/api/my-timetable/changes", { token: ctx.teacher.token });
  assert.equal(after.data.count, before.data.count);
});

test("cancelling a class records the reason and tells the teacher", async () => {
  const cancelled = await api(`/api/timetable/${ctx.theirsSessionId}/cancel`, {
    method: "POST",
    token: ctx.adminToken,
    body: { reason: "Faculty on approved leave" },
  });
  assert.equal(cancelled.status, 200, cancelled.text);
  assert.equal(cancelled.data.session.status, "CANCELLED");

  const fields = cancelled.data.changes.map((change) => change.field);
  assert.ok(fields.includes("status"), "the status change must be in the trail");
  assert.ok(
    fields.includes("cancellationReason"),
    "the reason a class was cancelled is the part a teacher needs",
  );

  // The colleague who holds it is the one who must hear about it.
  const notifications = await api("/api/notifications", { token: ctx.colleague.token });
  const notice = notifications.data.notifications.find((row) =>
    row.message.includes("Faculty on approved leave"),
  );
  assert.ok(notice, "the cancelled class did not reach its teacher");
  assert.ok(
    notice.priority === "high" || notice.priority === "urgent",
    "a cancellation must not be filed as an ordinary notice",
  );
});

test("a teacher changing their own class is not notified about it", async () => {
  // Self-notification is noise in a bell that has to mean something.
  const before = await api("/api/notifications", { token: ctx.teacher.token });
  const beforeCount = before.data.notifications.length;

  await api(`/api/timetable/${ctx.mineSessionId}`, {
    method: "PATCH",
    token: ctx.teacher.token,
    body: { notes: "Bring the failure-taxonomy handout." },
  });

  const after = await api("/api/notifications", { token: ctx.teacher.token });
  assert.equal(after.data.notifications.length, beforeCount);

  // The change is still recorded, because the record is about the schedule and not
  // about who needed telling.
  const changes = await api("/api/my-timetable/changes", { token: ctx.teacher.token });
  const note = changes.data.changes.find((change) => change.field === "notes");
  assert.ok(note, "the teacher's own change must still be in the trail");
  assert.equal(note.changedByName, "Aarav Shrestha");
});

/* ------------------------------------------------------------------ */
/* 3. A class connects to the systems that own it                     */
/* ------------------------------------------------------------------ */

test("opening a class links the existing attendance register rather than a new one", async () => {
  const started = await api(`/api/timetable/${ctx.mineSessionId}/start`, {
    method: "POST",
    token: ctx.teacher.token,
  });
  assert.equal(started.status, 200, started.text);
  const attendanceSessionId = started.data.attendanceSessionId;
  assert.ok(attendanceSessionId, "opening a class must produce a register to mark");

  // Pressing it again must not leave a teacher with two registers for one class.
  const again = await api(`/api/timetable/${ctx.mineSessionId}/start`, {
    method: "POST",
    token: ctx.teacher.token,
  });
  assert.equal(again.status, 200, again.text);
  assert.equal(
    again.data.attendanceSessionId,
    attendanceSessionId,
    "an already-open class must reuse its register",
  );

  // And the timetable now reports the class as in progress with the register attached.
  const week = await api("/api/my-timetable?view=week", { token: ctx.teacher.token });
  const entry = week.data.entries.find((row) => row.id === ctx.mineSessionId);
  assert.equal(entry.status, "IN_PROGRESS");
  assert.equal(entry.attendanceSessionId, attendanceSessionId);
  assert.equal(entry.attendanceStatus, "OPEN");
  assert.equal(entry.attendanceRecorded, true);
});

test("a teacher cannot open a colleague's class", async () => {
  const session = await scheduleSession({
    course: ctx.courseId,
    facultyUser: ctx.colleague.userId,
    semester: 5,
    sectionCode: "B2",
    scheduledDay: "Wednesday",
    startTime: "09:00",
    endTime: "10:00",
  });

  const res = await api(`/api/timetable/${session.id}/start`, {
    method: "POST",
    token: ctx.teacher.token,
  });
  assert.equal(res.status, 403, res.text);
});

test("a cancelled class cannot be opened", async () => {
  const session = await scheduleSession({
    course: ctx.courseId,
    facultyUser: ctx.teacher.userId,
    semester: 5,
    sectionCode: "B1",
    scheduledDay: "Friday",
    startTime: "09:00",
    endTime: "10:00",
  });
  await api(`/api/timetable/${session.id}/cancel`, {
    method: "POST",
    token: ctx.adminToken,
    body: { reason: "Holiday" },
  });

  const res = await api(`/api/timetable/${session.id}/start`, {
    method: "POST",
    token: ctx.teacher.token,
  });
  assert.equal(res.status, 409, res.text);
});

test("teaching progress recorded against a class appears on that class", async () => {
  const form = new FormData();
  form.append("title", "Replication slides");
  form.append("materialType", "SLIDES");
  form.append("status", "DRAFT");
  form.append(
    "file",
    new Blob([pdfWithPages(30)], { type: "application/pdf" }),
    "replication.pdf",
  );
  const uploaded = await api(`/api/lms/weeks/${ctx.weekId}/materials`, {
    method: "POST",
    token: ctx.teacher.token,
    body: form,
  });
  assert.equal(uploaded.status, 201, uploaded.text);
  const material = uploaded.data.material;
  assert.equal(material.documentMeta.pageCount, 30, "the page count must come from the file");

  const recorded = await api(`/api/lms/materials/${material.id}/teaching-progress`, {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      fromUnit: 1,
      toUnit: 18,
      topic: "Leader election",
      timetableSessionId: ctx.mineSessionId,
    },
  });
  assert.equal(recorded.status, 201, recorded.text);

  // The class now knows what was covered in it, joined on the class itself.
  const week = await api("/api/my-timetable?view=week", { token: ctx.teacher.token });
  const entry = week.data.entries.find((row) => row.id === ctx.mineSessionId);
  assert.equal(entry.teaching.recordCount, 1);
  assert.equal(entry.teaching.materialsTouched, 1);
  assert.equal(entry.teaching.records[0].materialTitle, "Replication slides");
  assert.equal(entry.teaching.records[0].toUnit, 18);
  assert.equal(entry.teaching.records[0].unitLabel, "page");
  // The record inherits the class's own section rather than being free-floating.
  assert.equal(entry.teaching.records[0].sectionCode, "B1");
});

test("a class with no teaching record says so, without implying it was not taught", async () => {
  // A class of its own, so the claim is about the read model and
  // not about whatever else the suite has scheduled so far.
  await scheduleSession({
    course: ctx.courseId,
    facultyUser: ctx.teacher.userId,
    semester: 5,
    sectionCode: "B1",
    scheduledDay: "Thursday",
    startTime: "09:00",
    endTime: "10:00",
    room: "D-202",
  });

  const week = await api("/api/my-timetable?view=week", { token: ctx.teacher.token });
  const untouched = week.data.entries.find(
    (row) => row.teaching.recordCount === 0 && row.id !== ctx.mineSessionId,
  );
  assert.ok(untouched, "expected at least one class with no recorded teaching");
  assert.equal(untouched.teaching.materialsTouched, 0);
  assert.equal(untouched.teaching.lastTaughtOn, null);
  assert.deepEqual(untouched.teaching.records, []);
});

/* ------------------------------------------------------------------ */
/* 4. Conflicts and reports                                           */
/* ------------------------------------------------------------------ */

test("a clash inside the caller's own schedule is surfaced", async () => {
  // Two classes for the same teacher, same room, overlapping time. Written with an
  // override, which is the only way such a pair can exist.
  const first = await scheduleSession({
    course: ctx.courseId,
    facultyUser: ctx.teacher.userId,
    semester: 5,
    sectionCode: "B1",
    scheduledDay: "Tuesday",
    startTime: "11:00",
    endTime: "12:00",
    room: "C-301",
  });
  const second = await api("/api/timetable", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      course: ctx.courseId,
      facultyUser: ctx.teacher.userId,
      semester: 5,
      sectionCode: "B1",
      scheduledDay: "Tuesday",
      startTime: "11:30",
      endTime: "12:30",
      room: "C-301",
      override: true,
    },
  });
  assert.equal(second.status, 201, second.text);

  const week = await api("/api/my-timetable?view=week", { token: ctx.teacher.token });
  assert.ok(week.data.conflictCount > 0, "an existing clash must be visible");
  assert.ok(week.data.conflicts.teacher.length > 0, "the teacher is booked twice");
  assert.ok(week.data.conflicts.room.length > 0, "the room is double-booked");

  const clash = week.data.conflicts.teacher[0];
  assert.ok(clash.first.id && clash.second.id);
  assert.ok(clash.first.sectionCode, "a conflict must name the class it involves");
  assert.ok(clash.type);

  ctx.clashSessionId = first.id;
  ctx.clashOtherId = second.data.session.id;
});

test("the teacher holding the clash is told about it when it is overridden", async () => {
  const notifications = await api("/api/notifications", { token: ctx.teacher.token });
  const alert = notifications.data.notifications.find((row) =>
    row.title.includes("conflict"),
  );
  assert.ok(alert, "an overridden clash must reach the teacher who walks into it");
  assert.equal(alert.actionUrl, "/my_timetable");
});

test("a teacher can report a clash on their own class, and only theirs", async () => {
  const mine = await api("/api/my-timetable/conflicts/report", {
    method: "POST",
    token: ctx.teacher.token,
    body: {
      sessionId: ctx.clashSessionId,
      otherSessionId: ctx.clashOtherId,
      note: "I cannot be in two rooms at once.",
    },
  });
  assert.equal(mine.status, 200, mine.text);
  assert.ok(mine.data.recipients > 0, "someone must be able to resolve it");

  // Reporting is not a fix, and cannot become one.
  const col = await api(`/api/timetable/${ctx.clashSessionId}`, {
    token: ctx.teacher.token,
  });
  assert.equal(col.status, 403, "a teacher cannot manage the timetable itself");

  const stranger = await api("/api/my-timetable/conflicts/report", {
    method: "POST",
    token: ctx.colleague.token,
    body: { sessionId: ctx.clashSessionId },
  });
  assert.equal(stranger.status, 422, stranger.text);
});

/* ------------------------------------------------------------------ */
/* 5. The surface is not left open                                    */
/* ------------------------------------------------------------------ */

test("my timetable requires a session", async () => {
  const read = await api("/api/my-timetable");
  assert.equal(read.status, 401);

  const changes = await api("/api/my-timetable/changes");
  assert.equal(changes.status, 401);

  const report = await api("/api/my-timetable/conflicts/report", {
    method: "POST",
    body: { sessionId: "507f1f77bcf86cd799439011" },
  });
  assert.equal(report.status, 401);
});

test("a timetable change diff only reports fields that actually moved", async () => {
  const { diffTimetableSession } = await import("../src/services/timetableChanges.js");

  const diff = diffTimetableSession(
    { scheduledDay: "Monday", startTime: "10:00", room: null },
    { scheduledDay: "Monday", startTime: "14:00", room: null },
  );
  assert.equal(diff.length, 1, "an unchanged day and an unchanged room are not changes");
  assert.equal(diff[0].field, "startTime");
  assert.equal(diff[0].from, "10:00");
  assert.equal(diff[0].to, "14:00");

  // A value that was never set reads as an absence, not as the string "null".
  const cleared = diffTimetableSession({ room: "A-201" }, { room: null });
  assert.equal(cleared[0].to, "not set");
  assert.equal(cleared[0].label, "Room");
});

/** A PDF with `pages` `/Type /Page` objects, so the page counter has real bytes to read. */
function pdfWithPages(pages) {
  const body = `%PDF-1.4\n`;
  let objects = "";
  for (let index = 0; index < pages; index += 1) {
    objects += `${index + 1} 0 obj\n<< /Type /Page >>\nendobj\n`;
  }
  return `${body}${objects}trailer\n<< /Root 1 0 R >>\n%%EOF`;
}
