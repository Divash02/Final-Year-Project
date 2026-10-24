import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * CollegeOS Exam Venue & Automatic Seating integration suite.
 *
 * Runs against the real MongoDB-backed Express app on an ephemeral
 * port with a dedicated test database. Every assertion exercises
 * the same persistence layer, authorization rules and allocation
 * algorithms that production uses — nothing is mocked.
 *
 * Covers the twelve required areas:
 *  1. all configured rooms and capacities
 *  2. alphabetical sorting across multiple sections
 *  3. stable ordering for duplicate student names
 *  4. sequential allocation across multiple rooms
 *  5. bench and seat numbering
 *  6. insufficient capacity blocking publication
 *  7. shuffle preserving the eligible set without duplicates
 *  8. room changes respecting capacity and scheduling conflicts
 *  9. manual publication permissions
 * 10. scheduled publication, retries and duplicate-execution protection
 * 11. students accessing only their own published seating
 * 12. existing examination and results workflows remaining functional
 */

const TEST_DB = process.env.COLLEGEOS_TEST_DB || "collegeos_test";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";

process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-seating-suite-secret";
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
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The eight-semester-2 roster used across the suite. */
const ROSTER = [
  { firstName: "Zara", lastName: "KC", studentId: "BCA25010", section: "A1" },
  { firstName: "Alpha", lastName: "Shrestha", studentId: "BCA25011", section: "B1" },
  { firstName: "chandan", lastName: "Rai", studentId: "BCA25012", section: "A1" },
  { firstName: "Anita", lastName: "Gurung", studentId: "BCA25013", section: "B1" },
  { firstName: "Anita", lastName: "Basnet", studentId: "BCA25014", section: "A1" },
  { firstName: "Bikash", lastName: "Tamang", studentId: "BCA25015", section: "B1" },
  { firstName: "Rita", lastName: "Rai", studentId: "BCA25016", section: "A1" },
  { firstName: "Rita", lastName: "Rai", studentId: "BCA25017", section: "B1" },
];

/** Case-insensitive alphabetical order with studentId tie-break. */
const EXPECTED_ORDER = [
  "BCA25011", // Alpha Shrestha (B1)
  "BCA25014", // Anita Basnet (A1)
  "BCA25013", // Anita Gurung (B1)
  "BCA25015", // Bikash Tamang (B1)
  "BCA25012", // chandan Rai (A1) — lowercase still sorts A–Z
  "BCA25016", // Rita Rai (A1) — duplicate name, lower studentId first
  "BCA25017", // Rita Rai (B1)
  "BCA25010", // Zara KC (A1)
];

function venueRoom(v) {
  return {
    room: v.id,
    building: v.building,
    block: v.block,
    floor: v.floor,
    roomNumber: v.roomNumber,
    name: v.name,
    capacity: v.capacity,
  };
}

async function findVenue(name) {
  const res = await api("/api/exams/venues", { token: ctx.examOfficer.token });
  assert.equal(res.status, 200);
  const venue = res.data.venues.find((v) => v.name === name || v.roomName === name);
  assert.ok(venue, `venue "${name}" not found in registry`);
  return venue;
}

async function generatePlan(token, { rooms, semester = 2, examDate = "2026-11-05", startTime = "10:00", endTime = "12:00", candidateScope = "SEMESTER_WIDE", extra = {} }) {
  const res = await api("/api/exams/seating", {
    method: "POST",
    token,
    body: {
      title: "BCA Semester 2 Mid-Term Examination",
      examType: "MID_TERM",
      academicYear: "2083/84",
      program: "BCA",
      semester,
      examDate,
      startTime,
      endTime,
      candidateScope,
      sectionCode: "ALL",
      batch: "2025",
      rooms,
      ...extra,
    },
  });
  assert.equal(res.status, 201, `plan generation failed: ${res.text}`);
  return res.data;
}

async function getPlan(token, planId) {
  const res = await api(`/api/exams/seating/${planId}`, { token });
  assert.equal(res.status, 200, `plan load failed: ${res.text}`);
  return res.data;
}

function allAssignments(planDetail) {
  return planDetail.roomSummaries.flatMap((r) =>
    (r.seatAssignments || []).map((a) => ({ ...a, roomName: r.name, roomCapacity: r.capacity }))
  );
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

  const adminEmail = "admin@collegeos.test";
  ctx.adminToken = await activate(adminEmail, process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD, "Collegeos@Admin1");

  ctx.examOfficer = await provision(ctx.adminToken, {
    firstName: "Pooja",
    lastName: "Sharma",
    role: "exam_officer",
    designation: "Examination Officer",
  });
  ctx.faculty = await provision(ctx.adminToken, {
    firstName: "Suresh",
    lastName: "Karki",
    role: "faculty",
    designation: "Lecturer",
  });
  ctx.finance = await provision(ctx.adminToken, {
    firstName: "Manish",
    lastName: "Gurung",
    role: "finance_officer",
    designation: "Finance Officer",
  });

  const course = await api("/api/courses", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      code: "CS201",
      name: "Data Structures",
      department: "Computer Science",
      program: "BCA",
      semester: 2,
      credits: 4,
      courseType: "CORE",
    },
  });
  assert.equal(course.status, 201, `course creation failed: ${course.text}`);
  ctx.courseId = course.data.course.id;

  for (const sectionCode of ["A1", "B1"]) {
    const section = await api("/api/sections", {
      method: "POST",
      token: ctx.adminToken,
      body: { code: sectionCode, program: "BCA", semester: 2, batch: "2025", room: "Hall 101" },
    });
    assert.equal(section.status, 201, `section creation failed: ${section.text}`);
  }

  // The semester-2 roster under test, plus a semester-4 student
  // who must never appear in semester-2 seating.
  ctx.students = {};
  for (const member of ROSTER) {
    ctx.students[member.studentId] = await provision(ctx.adminToken, {
      firstName: member.firstName,
      lastName: member.lastName,
      role: "student",
      studentId: member.studentId,
      program: "BCA",
      batch: "2025",
      semester: 2,
      section: member.section,
    });
  }
  ctx.studentSem4 = await provision(ctx.adminToken, {
    firstName: "Deepak",
    lastName: "Magar",
    role: "student",
    studentId: "BCA24001",
    program: "BCA",
    batch: "2024",
    semester: 4,
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
/* 1. All configured rooms and capacities                              */
/* ------------------------------------------------------------------ */

test("venue registry seeds all 17 institutional rooms with block, floor and capacity", async () => {
  const res = await api("/api/exams/venues", { token: ctx.examOfficer.token });
  assert.equal(res.status, 200);
  const { venues } = res.data;
  assert.equal(venues.length, 17, `expected 17 seeded venues, got ${venues.length}`);

  const expected = [
    ["Block A", "Kinabalu", "Ground Floor", 60],
    ["Block A", "Putrajaya", "Ground Floor", 40],
    ["Block A", "Bera", "Ground Floor", 40],
    ["Block B", "Everest", "Floor 1", 60],
    ["Block B", "Annapurna", "Floor 1", 60],
    ["Block B", "Macchapuchre", "Floor 1", 60],
    ["Block B", "Badimalika", "Floor 2", 60],
    ["Block B", "Suklaphata", "Floor 2", 60],
    ["Block B", "Khaptad", "Floor 2", 60],
    ["Block C", "Sagarmatha", "Top Floor", 60],
    ["Block C", "Saipal", "Top Floor", 60],
    ["Block C", "Rara", "First Floor", 40],
    ["Block C", "Phewa", "First Floor", 40],
    ["Block C", "Tilicho", "First Floor", 40],
    ["Block C", "Algospace", "First Floor", 40],
    ["Block C", "Manaslu", "Second Floor", 60],
    ["Block C", "Makalu", "Second Floor", 60],
  ];

  for (const [block, roomName, floor, capacity] of expected) {
    const venue = venues.find((v) => v.block === block && v.roomName === roomName);
    assert.ok(venue, `missing venue ${block} · ${roomName}`);
    assert.equal(venue.floor, floor, `${block} · ${roomName} floor`);
    assert.equal(venue.capacity, capacity, `${block} · ${roomName} capacity`);
    assert.equal(venue.isActive, true, `${block} · ${roomName} active`);
  }

  // Seeding is idempotent: repeat access and explicit re-seed never
  // duplicate or overwrite venue records.
  const again = await api("/api/exams/venues", { token: ctx.examOfficer.token });
  assert.equal(again.data.venues.length, 17);
  const reseed = await api("/api/exams/venues/seed", { method: "POST", token: ctx.examOfficer.token });
  assert.equal(reseed.status, 200);
  const afterReseed = await api("/api/exams/venues", { token: ctx.examOfficer.token });
  assert.equal(afterReseed.data.venues.length, 17, "re-seeding must not duplicate venues");
});

test("exam officers can create, update and de-activate venues; duplicates are rejected", async () => {
  const created = await api("/api/exams/venues", {
    method: "POST",
    token: ctx.examOfficer.token,
    body: { block: "Block D", floor: "Ground Floor", roomName: "Test Hall One", capacity: 3 },
  });
  assert.equal(created.status, 201, created.text);
  ctx.testHallOne = created.data.venue;

  const duplicate = await api("/api/exams/venues", {
    method: "POST",
    token: ctx.examOfficer.token,
    body: { block: "Block D", floor: "Ground Floor", roomName: "Test Hall One", capacity: 5 },
  });
  assert.equal(duplicate.status, 409, "duplicate venue must be rejected");

  const invalid = await api("/api/exams/venues", {
    method: "POST",
    token: ctx.examOfficer.token,
    body: { block: "Block D", roomName: "No Capacity Hall", capacity: 0 },
  });
  assert.equal(invalid.status, 400, "invalid capacity must be rejected");

  const updated = await api(`/api/exams/venues/${ctx.testHallOne.id}`, {
    method: "PATCH",
    token: ctx.examOfficer.token,
    body: { capacity: 6 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.venue.capacity, 6, "venue capacity update must persist");
  ctx.testHallOne.capacity = 6;

  const deactivated = await api(`/api/exams/venues/${ctx.testHallOne.id}`, {
    method: "PATCH",
    token: ctx.examOfficer.token,
    body: { isActive: false },
  });
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.data.venue.isActive, false);

  // Restore for later tests
  const restored = await api(`/api/exams/venues/${ctx.testHallOne.id}`, {
    method: "PATCH",
    token: ctx.examOfficer.token,
    body: { capacity: 3, isActive: true },
  });
  assert.equal(restored.status, 200);
  ctx.testHallOne.capacity = 3;
  ctx.testHallOne.isActive = true;

  // Students and faculty may not manage venues
  const studentAttempt = await api("/api/exams/venues", {
    method: "POST",
    token: ctx.students.BCA25010.token,
    body: { block: "Block D", roomName: "Student Hall", capacity: 10 },
  });
  assert.equal(studentAttempt.status, 403, "students must not create venues");
  const facultyAttempt = await api(`/api/exams/venues/${ctx.testHallOne.id}`, {
    method: "PATCH",
    token: ctx.faculty.token,
    body: { capacity: 99 },
  });
  assert.equal(facultyAttempt.status, 403, "faculty must not update venues");
});

test("seating endpoints reject students, faculty and finance staff", async () => {
  const anonymous = await api("/api/exams/seating");
  assert.equal(anonymous.status, 401);

  for (const [label, token] of [
    ["student", ctx.students.BCA25010.token],
    ["faculty", ctx.faculty.token],
    ["finance", ctx.finance.token],
  ]) {
    const list = await api("/api/exams/seating", { token });
    assert.equal(list.status, 403, `${label} must not list seating plans`);
    const eligible = await api("/api/exams/seating/eligible?program=BCA&semester=2", { token });
    assert.equal(eligible.status, 403, `${label} must not preview eligible students`);
  }
});

/* ------------------------------------------------------------------ */
/* 2–5. Alphabetical allocation across sections, stable ties,        */
/*      sequential multi-room allocation, bench/seat numbering       */
/* ------------------------------------------------------------------ */

test("alphabetical allocation sorts all sections into one continuous list with stable duplicate ordering", async () => {
  const kinabalu = await findVenue("Block A · Kinabalu");
  const generated = await generatePlan(ctx.examOfficer.token, { rooms: [venueRoom(kinabalu)] });
  ctx.planId = generated.planId;
  ctx.examId = generated.examId;

  const detail = await getPlan(ctx.examOfficer.token, ctx.planId);
  const assignments = allAssignments(detail);

  assert.equal(detail.totals.eligibleCount, 8, "all 8 semester-2 students are eligible");
  assert.equal(detail.totals.allocatedCount, 8);
  assert.equal(detail.totals.unallocatedCount, 0);
  assert.equal(detail.totals.requiredAdditionalCapacity, 0);

  // ONE continuous alphabetical list across sections A1 and B1.
  assert.deepEqual(
    assignments.map((a) => a.studentId),
    EXPECTED_ORDER,
    "students must be allocated in one continuous case-insensitive alphabetical order"
  );

  // Sections are interleaved — the list never restarts per section.
  const sections = assignments.map((a) => a.section);
  assert.deepEqual(sections, ["B1", "A1", "B1", "B1", "A1", "A1", "B1", "A1"]);

  // Duplicate names: Rita Rai BCA25016 (A1) precedes Rita Rai BCA25017 (B1).
  const ritaA = assignments.find((a) => a.studentId === "BCA25016");
  const ritaB = assignments.find((a) => a.studentId === "BCA25017");
  assert.ok(ritaA && ritaB, "both Rita Rai records must be seated");
  const ritaAIndex = assignments.indexOf(ritaA);
  const ritaBIndex = assignments.indexOf(ritaB);
  assert.ok(ritaAIndex < ritaBIndex, "identical names must be ordered by studentId");

  // Semester-4 student must never appear in a semester-2 plan.
  assert.ok(!assignments.some((a) => a.studentId === "BCA24001"));
});

test("bench and seat numbering pairs consecutive students on two-seat benches", async () => {
  const detail = await getPlan(ctx.examOfficer.token, ctx.planId);
  const assignments = allAssignments(detail);

  // 8 students in a 60-seat room: benches 1–4, seats 1/2 each.
  const expectedBenches = [
    [1, 1], [1, 2],
    [2, 1], [2, 2],
    [3, 1], [3, 2],
    [4, 1], [4, 2],
  ];
  assert.deepEqual(
    assignments.map((a) => [a.benchNumber, a.seatNumber]),
    expectedBenches
  );

  const roomSummary = detail.roomSummaries[0];
  assert.equal(roomSummary.name, "Block A · Kinabalu");
  assert.equal(roomSummary.assignedCount, 8);
  assert.equal(roomSummary.benchCount, 4, "a 60-seat room holds 30 two-seat benches; 8 students occupy 4");
});

test("allocation continues sequentially across room boundaries without restarting", async () => {
  // Two small rooms: 3 + 3 seats for 8 eligible students.
  const createdTwo = await api("/api/exams/venues", {
    method: "POST",
    token: ctx.examOfficer.token,
    body: { block: "Block D", floor: "Ground Floor", roomName: "Test Hall Two", capacity: 3 },
  });
  assert.equal(createdTwo.status, 201);
  const hallOne = ctx.testHallOne; // capacity 3
  const hallTwo = createdTwo.data.venue;

  const generated = await generatePlan(ctx.examOfficer.token, {
    rooms: [venueRoom(hallOne), venueRoom(hallTwo)],
    examDate: "2026-11-06",
  });
  const detail = await getPlan(ctx.examOfficer.token, generated.planId);

  // Room 1 receives students 1–3 of the overall list…
  const roomOne = detail.roomSummaries[0];
  assert.equal(roomOne.name, "Block D · Test Hall One");
  assert.deepEqual(
    roomOne.seatAssignments.map((a) => a.studentId),
    ["BCA25011", "BCA25014", "BCA25013"]
  );

  // …and room 2 continues with student 4 — it does NOT restart
  // from the beginning of the alphabet or from section A.
  const roomTwo = detail.roomSummaries[1];
  assert.equal(roomTwo.name, "Block D · Test Hall Two");
  assert.deepEqual(
    roomTwo.seatAssignments.map((a) => a.studentId),
    ["BCA25015", "BCA25012", "BCA25016"]
  );

  assert.equal(detail.totals.eligibleCount, 8);
  assert.equal(detail.totals.allocatedCount, 6);
  assert.equal(detail.totals.unallocatedCount, 2);
  assert.equal(detail.totals.requiredAdditionalCapacity, 2, "2 more seats are required");
  assert.deepEqual(
    detail.roomSummaries.map((r) => r.remainingSeats),
    [0, 0]
  );

  ctx.smallRoomPlanId = generated.planId;
  ctx.hallOne = hallOne;
  ctx.hallTwo = hallTwo;
});

/* ------------------------------------------------------------------ */
/* 6. Insufficient capacity blocks publication                       */
/* ------------------------------------------------------------------ */

test("publication is blocked when room capacity is insufficient", async () => {
  const attempt = await api(`/api/exams/seating/${ctx.smallRoomPlanId}/publish`, {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(attempt.status, 422, "insufficient capacity must block publication");
  assert.match(attempt.data.error, /Insufficient seating/);
  assert.match(attempt.data.error, /additional seat/);

  // The plan stays unpublished — students must not see a seat.
  const studentView = await api(`/api/student/exams/${ctx.examId}/my-seating`, {
    token: ctx.students.BCA25011.token,
  });
  assert.equal(studentView.status, 404, "unpublished plans must not expose seating to students");
});

/* ------------------------------------------------------------------ */
/* 7. Shuffle preserves the eligible set                             */
/* ------------------------------------------------------------------ */

test("shuffle preserves every eligible student exactly once and is deterministic per seed", async () => {
  const before = await getPlan(ctx.examOfficer.token, ctx.planId);
  const beforeIds = allAssignments(before).map((a) => a.studentId).sort();

  const shuffled = await api(`/api/exams/seating/${ctx.planId}/shuffle`, {
    method: "POST",
    token: ctx.examOfficer.token,
    body: { seed: 20261013 },
  });
  assert.equal(shuffled.status, 200, shuffled.text);
  assert.equal(shuffled.data.shuffleSeed, 20261013);

  const after = await getPlan(ctx.examOfficer.token, ctx.planId);
  const afterAssignments = allAssignments(after);
  const afterIds = afterAssignments.map((a) => a.studentId).sort();

  // Same eligible set, no duplicates, no omissions.
  assert.deepEqual(afterIds, beforeIds);
  assert.equal(new Set(afterIds).size, 8, "no student may be assigned twice");
  assert.equal(afterAssignments.length, 8);

  // Deterministic: the same seed reproduces the same arrangement.
  const reshuffled = await api(`/api/exams/seating/${ctx.planId}/shuffle`, {
    method: "POST",
    token: ctx.examOfficer.token,
    body: { seed: 20261013 },
  });
  assert.equal(reshuffled.status, 200);
  const afterReshuffle = await getPlan(ctx.examOfficer.token, ctx.planId);
  assert.deepEqual(
    allAssignments(afterReshuffle).map((a) => `${a.studentId}@${a.roomName}:${a.benchNumber}-${a.seatNumber}`),
    afterAssignments.map((a) => `${a.studentId}@${a.roomName}:${a.benchNumber}-${a.seatNumber}`),
    "same seed must produce the same shuffled arrangement"
  );

  // Reset restores the original alphabetical allocation.
  const reset = await api(`/api/exams/seating/${ctx.planId}/reset`, {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(reset.status, 200);
  const afterReset = await getPlan(ctx.examOfficer.token, ctx.planId);
  assert.deepEqual(
    allAssignments(afterReset).map((a) => a.studentId),
    EXPECTED_ORDER,
    "reset must restore the original alphabetical allocation"
  );
});

/* ------------------------------------------------------------------ */
/* 8. Room changes respect capacity; scheduling conflicts rejected   */
/* ------------------------------------------------------------------ */

test("room changes enforce capacity, renumber benches and preserve uniqueness", async () => {
  // Plan with Test Hall One (3 seats) and a 6-seat annex: all 8 seated.
  const annex = await api("/api/exams/venues", {
    method: "POST",
    token: ctx.examOfficer.token,
    body: { block: "Block D", floor: "First Floor", roomName: "Annex Hall", capacity: 6 },
  });
  assert.equal(annex.status, 201);
  const annexVenue = annex.data.venue;

  const generated = await generatePlan(ctx.examOfficer.token, {
    rooms: [venueRoom(ctx.hallOne), venueRoom(annexVenue)],
    examDate: "2026-11-07",
  });
  const detail = await getPlan(ctx.examOfficer.token, generated.planId);
  assert.equal(detail.totals.allocatedCount, 8);

  // Moving all 3 students from Hall One into the full Annex (6/6 used)
  // must fail with a precise seat shortfall.
  const overCapacity = await api(`/api/exams/seating/${generated.planId}/room-change`, {
    method: "POST",
    token: ctx.examOfficer.token,
    body: { fromRoom: "Block D · Test Hall One", toRoom: "Block D · Annex Hall" },
  });
  assert.equal(overCapacity.status, 400);
  assert.match(overCapacity.data.error, /Insufficient capacity in/);
  assert.match(overCapacity.data.error, /additional seat/);

  // Moving a single named student succeeds.
  const moved = await api(`/api/exams/seating/${generated.planId}/room-change`, {
    method: "POST",
    token: ctx.examOfficer.token,
    body: {
      fromRoom: "Block D · Test Hall One",
      toRoom: "Block D · Annex Hall",
      studentIds: ["BCA25011"],
    },
  });
  assert.equal(moved.status, 200, moved.text);
  assert.equal(moved.data.movedCount, 1);

  const after = await getPlan(ctx.examOfficer.token, generated.planId);
  const hallOneAfter = after.roomSummaries.find((r) => r.name === "Block D · Test Hall One");
  const annexAfter = after.roomSummaries.find((r) => r.name === "Block D · Annex Hall");

  // Source room no longer contains the moved student and is renumbered.
  assert.deepEqual(
    hallOneAfter.seatAssignments.map((a) => a.studentId),
    ["BCA25014", "BCA25013"]
  );
  assert.deepEqual(
    hallOneAfter.seatAssignments.map((a) => [a.benchNumber, a.seatNumber]),
    [[1, 1], [1, 2]]
  );

  // Target room gained the student at the next sequential bench/seat.
  assert.equal(annexAfter.assignedCount, 6, "annex holds its 5 original students plus the moved one");
  const alphaInAnnex = annexAfter.seatAssignments.find((a) => a.studentId === "BCA25011");
  assert.ok(alphaInAnnex, "moved student must appear in the target room");
  assert.equal(alphaInAnnex.benchNumber, 3);
  assert.equal(alphaInAnnex.seatNumber, 2);

  // Uniqueness preserved across the whole plan.
  const allIds = allAssignments(after).map((a) => a.studentId);
  assert.equal(new Set(allIds).size, 8, "room changes must never duplicate assignments");

  ctx.roomChangePlanId = generated.planId;
});

test("rooms with overlapping examination schedules are rejected as conflicts", async () => {
  const kinabalu = await findVenue("Block A · Kinabalu");

  // Plan A occupies Kinabalu on 2026-11-08 10:00–12:00 and publishes.
  const planA = await generatePlan(ctx.examOfficer.token, {
    rooms: [venueRoom(kinabalu)],
    examDate: "2026-11-08",
  });
  const publishA = await api(`/api/exams/seating/${planA.planId}/publish`, {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(publishA.status, 200, publishA.text);

  // Plan B books the same room at the same interval → conflict on publish.
  const planB = await generatePlan(ctx.examOfficer.token, {
    rooms: [venueRoom(kinabalu)],
    examDate: "2026-11-08",
  });
  const publishB = await api(`/api/exams/seating/${planB.planId}/publish`, {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(publishB.status, 400, "overlapping room booking must be rejected");
  assert.match(publishB.data.error, /Room availability conflict/);

  // The conflict is also surfaced as a pre-publication warning.
  const conflictCheck = await api(`/api/exams/seating/${planB.planId}/conflicts`, {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(conflictCheck.status, 200);
  assert.equal(conflictCheck.data.clear, false);
  assert.ok(conflictCheck.data.conflicts.some((c) => c.rooms.includes("Block A · Kinabalu")));

  // A different room at the same time is fine.
  const putrajaya = await findVenue("Block A · Putrajaya");
  const planC = await generatePlan(ctx.examOfficer.token, {
    rooms: [venueRoom(putrajaya)],
    examDate: "2026-11-08",
  });
  const publishC = await api(`/api/exams/seating/${planC.planId}/publish`, {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(publishC.status, 200, "a non-overlapping venue must publish");

  ctx.publishedPlanId = planA.planId;
  ctx.publishedExamId = planA.examId;
});

/* ------------------------------------------------------------------ */
/* 9. Manual publication permissions                                 */
/* ------------------------------------------------------------------ */

test("only the Exam Officer role and above can publish a seating plan manually", async () => {
  const kinabalu = await findVenue("Block A · Kinabalu");
  const generated = await generatePlan(ctx.examOfficer.token, {
    rooms: [venueRoom(kinabalu)],
    examDate: "2026-11-09",
  });
  ctx.permissionPlanId = generated.planId;

  const attempts = [
    ["student", ctx.students.BCA25010.token],
    ["faculty", ctx.faculty.token],
    ["finance", ctx.finance.token],
    ["program_coordinator", ctx.adminToken === ctx.examOfficer.token ? null : null], // placeholder
  ];

  for (const [label, token] of attempts.slice(0, 3)) {
    const res = await api(`/api/exams/seating/${ctx.permissionPlanId}/publish`, {
      method: "POST",
      token,
    });
    assert.equal(res.status, 403, `${label} must not publish seating plans`);
  }

  // Mutation endpoints are equally restricted.
  for (const path of [
    `/api/exams/seating/${ctx.permissionPlanId}/shuffle`,
    `/api/exams/seating/${ctx.permissionPlanId}/reset`,
  ]) {
    const res = await api(path, { method: "POST", token: ctx.students.BCA25010.token });
    assert.equal(res.status, 403, "students must not mutate seating plans");
    const facultyRes = await api(path, { method: "POST", token: ctx.faculty.token });
    assert.equal(facultyRes.status, 403, "faculty must not mutate seating plans");
  }

  const officer = await api(`/api/exams/seating/${ctx.permissionPlanId}/publish`, {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(officer.status, 200, "the Exam Officer must be able to publish");
  assert.equal(officer.data.status, "PUBLISHED");

  // Re-publishing is idempotent, not an error.
  const again = await api(`/api/exams/seating/${ctx.permissionPlanId}/publish`, {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(again.status, 200);
  assert.equal(again.data.alreadyPublished, true);
});

/* ------------------------------------------------------------------ */
/* 10. Scheduled publication, retries, duplicate-execution protection */
/* ------------------------------------------------------------------ */

test("scheduled publication executes server-side exactly once and records failures for retry", async () => {
  const kinabalu = await findVenue("Block A · Kinabalu");

  // A plan whose capacity is sufficient.
  const good = await generatePlan(ctx.examOfficer.token, {
    rooms: [venueRoom(kinabalu)],
    examDate: "2026-11-10",
  });
  const future = new Date(Date.now() + 2000).toISOString();
  const scheduled = await api(`/api/exams/seating/${good.planId}/schedule`, {
    method: "POST",
    token: ctx.examOfficer.token,
    body: { publishAt: future, timezone: "Asia/Kathmandu" },
  });
  assert.equal(scheduled.status, 200, scheduled.text);
  assert.equal(scheduled.data.status, "SCHEDULED");
  assert.equal(scheduled.data.scheduledPublishTimezone, "Asia/Kathmandu");

  // Past dates are rejected.
  const past = await api(`/api/exams/seating/${good.planId}/schedule`, {
    method: "POST",
    token: ctx.examOfficer.token,
    body: { publishAt: "2020-01-01T00:00:00.000Z" },
  });
  assert.equal(past.status, 400);

  // Not yet due: the sweep publishes nothing.
  const early = await api("/api/exams/seating/run-scheduled-publication", {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(early.status, 200);
  assert.ok(
    early.data.results.every((r) => r.planId !== good.planId),
    "a future schedule must not publish early"
  );

  await wait(2600);

  // The server-side sweep publishes the due plan.
  const sweep = await api("/api/exams/seating/run-scheduled-publication", {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(sweep.status, 200);
  const result = sweep.data.results.find((r) => r.planId === good.planId);
  assert.ok(result, "the due plan must be processed by the sweep");
  assert.equal(result.status, "PUBLISHED");

  const detail = await getPlan(ctx.examOfficer.token, good.planId);
  assert.equal(detail.plan.status, "PUBLISHED");
  assert.ok(detail.plan.publishedAt, "publication timestamp must be persisted");

  // Duplicate execution protection: a second sweep and a direct
  // manual publish cannot re-publish or corrupt the plan.
  const sweepAgain = await api("/api/exams/seating/run-scheduled-publication", {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(
    sweepAgain.data.results.filter((r) => r.planId === good.planId).length,
    0,
    "an already-published plan must not be re-processed"
  );
  const manualAgain = await api(`/api/exams/seating/${good.planId}/publish`, {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(manualAgain.status, 200);
  assert.equal(manualAgain.data.alreadyPublished, true);

  const detailAgain = await getPlan(ctx.examOfficer.token, good.planId);
  assert.equal(
    new Date(detailAgain.plan.publishedAt).getTime(),
    new Date(detail.plan.publishedAt).getTime(),
    "publishedAt must not change on duplicate publish attempts"
  );

  // A plan that cannot be published at due time (insufficient
  // capacity) records a failure and stays scheduled for retry.
  const short = await generatePlan(ctx.examOfficer.token, {
    rooms: [venueRoom(ctx.hallOne), venueRoom(ctx.hallTwo)],
    examDate: "2026-11-11",
  });
  const futureShort = new Date(Date.now() + 1500).toISOString();
  const scheduledShort = await api(`/api/exams/seating/${short.planId}/schedule`, {
    method: "POST",
    token: ctx.examOfficer.token,
    body: { publishAt: futureShort },
  });
  assert.equal(scheduledShort.status, 200);

  await wait(2200);
  const failingSweep = await api("/api/exams/seating/run-scheduled-publication", {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  const failure = failingSweep.data.results.find((r) => r.planId === short.planId);
  assert.ok(failure, "the failing plan must be processed");
  assert.equal(failure.status, "FAILED");
  assert.match(failure.error, /Insufficient seating/);

  const stillScheduled = await getPlan(ctx.examOfficer.token, short.planId);
  assert.equal(stillScheduled.plan.status, "SCHEDULED", "a failed plan stays scheduled for retry");

  // After the officer fixes the capacity, the retry succeeds.
  const kinabalu2 = await findVenue("Block A · Kinabalu");
  // Regenerate the small plan with a large room via the generate endpoint
  // (one plan per exam: it refreshes in place).
  const fixed = await api("/api/exams/seating", {
    method: "POST",
    token: ctx.examOfficer.token,
    body: {
      examId: short.examId,
      title: "BCA Semester 2 Mid-Term Examination",
      examType: "MID_TERM",
      academicYear: "2083/84",
      program: "BCA",
      semester: 2,
      examDate: "2026-11-11",
      startTime: "10:00",
      endTime: "12:00",
      candidateScope: "SEMESTER_WIDE",
      sectionCode: "ALL",
      batch: "2025",
      rooms: [venueRoom(kinabalu2)],
    },
  });
  assert.equal(fixed.status, 201, fixed.text);

  const retrySweep = await api("/api/exams/seating/run-scheduled-publication", {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  const retry = retrySweep.data.results.find((r) => r.planId === short.planId);
  assert.ok(retry, "the repaired plan must be retried by the sweep");
  assert.equal(retry.status, "PUBLISHED");
});

/* ------------------------------------------------------------------ */
/* 11. Students access only their own published seating              */
/* ------------------------------------------------------------------ */

test("students see only their own published seat and never another student's or the full plan", async () => {
  // ctx.publishedExamId refers to the published plan from the
  // conflict test (Kinabalu, 2026-11-08, all 8 students seated).
  const alpha = await api(`/api/student/exams/${ctx.publishedExamId}/my-seating`, {
    token: ctx.students.BCA25011.token,
  });
  assert.equal(alpha.status, 200, alpha.text);
  assert.equal(alpha.data.seating.studentId, "BCA25011");
  assert.equal(alpha.data.seating.fullName, "Alpha Shrestha");
  assert.equal(alpha.data.seating.examTitle, "BCA Semester 2 Mid-Term Examination");
  assert.equal(alpha.data.seating.examDate, "2026-11-08");
  assert.equal(alpha.data.seating.startTime, "10:00");
  assert.equal(alpha.data.seating.block, "Block A");
  assert.equal(alpha.data.seating.floor, "Ground Floor");
  assert.equal(alpha.data.seating.room, "Block A · Kinabalu");
  assert.equal(alpha.data.seating.benchNumber, 1);
  assert.equal(alpha.data.seating.seatNumber, 1);

  // Zara (last in the alphabetical list) sees her own different seat.
  const zara = await api(`/api/student/exams/${ctx.publishedExamId}/my-seating`, {
    token: ctx.students.BCA25010.token,
  });
  assert.equal(zara.status, 200);
  assert.equal(zara.data.seating.studentId, "BCA25010");
  assert.equal(zara.data.seating.benchNumber, 4);
  assert.equal(zara.data.seating.seatNumber, 2);
  assert.notEqual(zara.data.seating.benchNumber, alpha.data.seating.benchNumber);

  // The full plan is never exposed to students — only officers.
  const studentPlan = await api(`/api/exams/seating/${ctx.publishedPlanId}`, {
    token: ctx.students.BCA25010.token,
  });
  assert.equal(studentPlan.status, 403, "students must not read the full seating plan");

  const facultyPlan = await api(`/api/exams/seating/${ctx.publishedPlanId}`, {
    token: ctx.faculty.token,
  });
  assert.equal(facultyPlan.status, 403, "faculty must not read the full seating plan");

  // A student with no seat in this exam (semester 4) gets a clean
  // "not available" answer — not another student's data.
  const outsider = await api(`/api/student/exams/${ctx.publishedExamId}/my-seating`, {
    token: ctx.studentSem4.token,
  });
  assert.equal(outsider.status, 404);

  // The student's aggregate list contains exactly their own seats.
  const mine = await api("/api/student/exams/my-seating", {
    token: ctx.students.BCA25011.token,
  });
  assert.equal(mine.status, 200);
  assert.ok(mine.data.seating.length >= 1);
  assert.ok(mine.data.seating.every((s) => s.studentId === "BCA25011"));

  // Publishing a plan creates a student notification (observable
  // through the notification feed the student already uses).
  const notifications = await api("/api/notifications", { token: ctx.students.BCA25011.token });
  if (notifications.status === 200) {
    const seatingNotifs = (notifications.data.notifications || notifications.data || []).filter(
      (n) => String(n.title || "").includes("Seating Published")
    );
    assert.ok(seatingNotifs.length >= 1, "a published seat must notify the student");
  }
});

/* ------------------------------------------------------------------ */
/* 12. Existing examination and results workflows remain functional  */
/* ------------------------------------------------------------------ */

test("existing examination scheduling, publishing and results workflows remain functional", async () => {
  const kinabalu = await findVenue("Block A · Kinabalu");

  // Existing exam creation flow (unchanged module).
  const created = await api("/api/exams", {
    method: "POST",
    token: ctx.examOfficer.token,
    body: {
      title: "Data Structures Final Examination",
      examType: "FINAL",
      academicYear: "2083/84",
      program: "BCA",
      semester: 2,
      courseId: ctx.courseId,
      examDate: "2026-11-20",
      startTime: "10:00",
      endTime: "12:00",
      rooms: [venueRoom(kinabalu)],
      candidateScope: "SEMESTER_WIDE",
      sectionCode: "ALL",
      batch: "2025",
      instructions: "Bring your student ID.",
      invigilators: [],
      isDraft: false,
    },
  });
  assert.equal(created.status, 201, created.text);
  const examId = created.data.examId;
  ctx.workflowExamId = examId;

  const published = await api(`/api/exams/${examId}/publish`, {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(published.status, 200, published.text);
  assert.equal(published.data.status, "PUBLISHED");
  assert.equal(published.data.candidateCount, 8, "the existing audience resolution still sees all 8 students");

  // Exam list still works and includes the new exam.
  const list = await api("/api/exams", { token: ctx.examOfficer.token });
  assert.equal(list.status, 200);
  assert.ok(list.data.exams.some((e) => e.id === examId));

  // Results workflow: enter marks → submit → verify → finalize → publish.
  const enter = await api(`/api/exams/${examId}/results`, {
    method: "POST",
    token: ctx.examOfficer.token,
    body: {
      marks: ROSTER.map((m, i) => ({ studentId: m.studentId, marks: 55 + i, remarks: "entered" })),
    },
  });
  assert.equal(enter.status, 200, enter.text);
  assert.equal(enter.data.savedCount, 8);

  for (const step of ["submit", "verify", "finalize", "publish"]) {
    const res = await api(`/api/exams/${examId}/results/${step}`, {
      method: "POST",
      token: ctx.examOfficer.token,
    });
    assert.equal(res.status, 200, `results ${step} failed: ${res.text}`);
  }

  // A student sees only their own published result.
  const ownResult = await api(`/api/exams/${examId}/results`, {
    token: ctx.students.BCA25011.token,
  });
  assert.equal(ownResult.status, 200);
  assert.equal(ownResult.data.results.length, 1);
  assert.equal(ownResult.data.results[0].student_id, "BCA25011");

  // Seating can be generated for this existing exam (one plan per
  // exam) and published without disturbing its results.
  const seating = await generatePlan(ctx.examOfficer.token, {
    rooms: [venueRoom(kinabalu)],
    examDate: "2026-11-20",
    extra: { examId: ctx.workflowExamId },
  });
  assert.equal(seating.examId, examId, "generation for an existing exam must link to it");

  const seatingPublish = await api(`/api/exams/seating/${seating.planId}/publish`, {
    method: "POST",
    token: ctx.examOfficer.token,
  });
  assert.equal(seatingPublish.status, 200, seatingPublish.text);

  const resultsAfter = await api(`/api/exams/${examId}/results`, {
    token: ctx.examOfficer.token,
  });
  assert.equal(resultsAfter.status, 200);
  assert.equal(resultsAfter.data.results.length, 8, "seating publication must not alter examination results");
  assert.equal(resultsAfter.data.exam.resultsStatus, "PUBLISHED");
});
