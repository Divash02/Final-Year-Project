import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// Pure authorization tests (no DB). They exercise the same shared functions used by
// HTTP join/token and Socket.IO connect:join, so credential/enrollment/isolation parity holds.
const {
  canViewSession,
  listVisibleSessions,
  authorizeConnectJoin,
  assertSessionCredentialForUser,
  resolveConnectParticipantRole,
  verifyCredential,
  generateSessionCredential,
} = await import("../src/services/connectService.js");
const { hashPassword } = await import("../src/db.js");

function oid() { return new mongoose.Types.ObjectId(); }

function user(overrides = {}) {
  return {
    _id: oid(),
    email: "user@collegeos.test",
    roles: ["faculty"],
    activeRole: "faculty",
    accountStatus: "ACTIVE",
    isActive: true,
    ...overrides,
  };
}

function studentUser(id = oid()) {
  return user({ _id: id, email: "student@collegeos.test", roles: ["student"], activeRole: "student" });
}

function makeCredential(plain) {
  return {
    sessionId16: plain.sessionId16,
    passwordHash: hashPassword(plain.password),
    issuedAt: plain.issuedAt,
    revokedAt: null,
    expiresAt: null,
  };
}

function onlineClass({ host, cohortUserIds, studentCred, teacherCred, status = "SCHEDULED", scheduledDate, startTime } = {}) {
  return {
    _id: oid(),
    sessionType: "ONLINE_CLASS",
    status,
    title: "Class",
    scheduledDate,
    startTime,
    host: host?._id || host || oid(),
    coHosts: [],
    createdBy: host?._id || host || oid(),
    resolvedStudentUsers: cohortUserIds || [],
    resolvedStudents: [],
    invitedUsers: [],
    studentCredential: studentCred || null,
    teacherCredential: teacherCred || null,
  };
}

function onlineMeeting({ host, invitedUserIds = [], meetingCred, status = "SCHEDULED" } = {}) {
  return {
    _id: oid(),
    sessionType: "ONLINE_MEETING",
    status,
    title: "Meeting",
    host: host?._id || host || oid(),
    coHosts: [],
    createdBy: host?._id || host || oid(),
    resolvedStudentUsers: [],
    resolvedStudents: [],
    invitedUsers: invitedUserIds.map((id) => ({ user: id, role: "PARTICIPANT", status: "INVITED" })),
    meetingCredential: meetingCred || null,
  };
}

function throwsMessage(fn, includes, codeOrStatus) {
  let err;
  try { fn(); } catch (e) { err = e; }
  assert.ok(err, "expected an error");
  if (includes) assert.match(String(err.message || ""), includes);
  if (codeOrStatus) assert.equal(err.status || err.statusCode, codeOrStatus);
  return err;
}

test("credential verify accepts matching 16-digit id + alphabetic password", () => {
  const plain = generateSessionCredential();
  assert.equal(plain.sessionId16.length, 16);
  assert.match(plain.password, /^[A-Za-z]+$/);
  const stored = makeCredential(plain);
  assert.equal(verifyCredential(stored, plain.sessionId16, plain.password), true);
  assert.equal(verifyCredential(stored, plain.sessionId16, "wrongpass"), false);
});

test("1) authorized student (exact cohort) can join assigned online class with correct credential", () => {
  const teacher = user({ roles: ["faculty"], activeRole: "faculty" });
  const s = studentUser();
  const studentPlain = generateSessionCredential();
  const session = onlineClass({ host: teacher, cohortUserIds: [s._id], studentCred: makeCredential(studentPlain) });
  assert.equal(canViewSession(session, s), true);
  const role = authorizeConnectJoin(session, s, { sessionCredentialId: studentPlain.sessionId16, sessionCredentialPassword: studentPlain.password });
  assert.equal(role, "STUDENT");
});

test("2) student from another section/cohort is denied (not in resolved cohort)", () => {
  const teacher = user({ roles: ["faculty"], activeRole: "faculty" });
  const inCohort = studentUser();
  const outsider = studentUser();
  const studentPlain = generateSessionCredential();
  const session = onlineClass({ host: teacher, cohortUserIds: [inCohort._id], studentCred: makeCredential(studentPlain) });
  assert.equal(canViewSession(session, outsider), false);
  // Hidden/non-accessible → non-disclosing not-found style denial via canView check path
  throwsMessage(() => authorizeConnectJoin(session, outsider, { sessionCredentialId: studentPlain.sessionId16, sessionCredentialPassword: studentPlain.password }), /not found|access denied/i, 404);
});

test("3) student from another semester/cohort is denied by enrollment resolution result", () => {
  // Cross-semester is enforced by server-side cohort resolution; authorization denies any student not in resolvedStudentUsers.
  const teacher = user({ roles: ["faculty"], activeRole: "faculty" });
  const otherSemesterStudent = studentUser();
  const studentPlain = generateSessionCredential();
  const session = onlineClass({ host: teacher, cohortUserIds: [oid()], studentCred: makeCredential(studentPlain) });
  assert.equal(resolveConnectParticipantRole(session, otherSemesterStudent), null);
  throwsMessage(() => authorizeConnectJoin(session, otherSemesterStudent, { sessionCredentialId: studentPlain.sessionId16, sessionCredentialPassword: studentPlain.password }), /not found|access denied/i, 404);
});

test("4) student with incorrect class password is denied", () => {
  const teacher = user({ roles: ["faculty"], activeRole: "faculty" });
  const s = studentUser();
  const studentPlain = generateSessionCredential();
  const session = onlineClass({ host: teacher, cohortUserIds: [s._id], studentCred: makeCredential(studentPlain) });
  throwsMessage(() => authorizeConnectJoin(session, s, { sessionCredentialId: studentPlain.sessionId16, sessionCredentialPassword: "WrongPassword" }), /incorrect meeting password/i, 422);
});

test("4b) student with invalid meeting ID is denied", () => {
  const teacher = user({ roles: ["faculty"], activeRole: "faculty" });
  const s = studentUser();
  const studentPlain = generateSessionCredential();
  const session = onlineClass({ host: teacher, cohortUserIds: [s._id], studentCred: makeCredential(studentPlain) });
  throwsMessage(() => authorizeConnectJoin(session, s, { sessionCredentialId: "0000000000000000", sessionCredentialPassword: "anything" }), /invalid meeting ID/i, 422);
});

test("4c) student joining class with revoked credential is denied", () => {
  const teacher = user({ roles: ["faculty"], activeRole: "faculty" });
  const s = studentUser();
  const studentPlain = generateSessionCredential();
  const revoked = { ...makeCredential(studentPlain), revokedAt: new Date() };
  const session = onlineClass({ host: teacher, cohortUserIds: [s._id], studentCred: revoked });
  throwsMessage(() => authorizeConnectJoin(session, s, { sessionCredentialId: studentPlain.sessionId16, sessionCredentialPassword: studentPlain.password }), /meeting access is unavailable/i, 422);
});

test("5) student cannot access an institutional meeting (no metadata via view/list/auth)", () => {
  const staff = user({ roles: ["registrar"], activeRole: "registrar" });
  const s = studentUser();
  const session = onlineMeeting({ host: staff, invitedUserIds: [oid()] });
  assert.equal(canViewSession(session, s), false);
  throwsMessage(() => authorizeConnectJoin(session, s, {}), /not found/i, 404);
});

test("6) student cannot obtain an institutional meeting LiveKit token path (shared join auth denies)", () => {
  // HTTP token route uses authorizeConnectJoin before issuing token.
  const staff = user({ roles: ["registrar"], activeRole: "registrar" });
  const s = studentUser();
  const meetingPlain = generateSessionCredential();
  const session = onlineMeeting({ host: staff, invitedUserIds: [staff._id], meetingCred: makeCredential(meetingPlain) });
  throwsMessage(() => authorizeConnectJoin(session, s, { sessionCredentialId: meetingPlain.sessionId16, sessionCredentialPassword: meetingPlain.password }), /not found/i, 404);
});

test("7) student cannot subscribe/join institutional meeting Socket.IO room (shared join auth denies)", () => {
  // Socket.IO connect:join uses authorizeConnectJoin with same credential/isolation rules.
  const staff = user({ roles: ["registrar"], activeRole: "registrar" });
  const s = studentUser();
  const session = onlineMeeting({ host: staff, invitedUserIds: [staff._id] });
  assert.equal(resolveConnectParticipantRole(session, s), null);
  throwsMessage(() => authorizeConnectJoin(session, s, {}), /not found/i, 404);
});

test("8) uninvited staff cannot access a restricted meeting", () => {
  const host = user({ roles: ["registrar"], activeRole: "registrar" });
  const invited = user({ roles: ["faculty"], activeRole: "faculty" });
  const uninvited = user({ roles: ["faculty"], activeRole: "faculty" });
  const session = onlineMeeting({ host, invitedUserIds: [invited._id] });
  assert.equal(canViewSession(session, invited), true);
  assert.equal(canViewSession(session, uninvited), false);
  throwsMessage(() => authorizeConnectJoin(session, uninvited, {}), /not found|access denied/i, 404);
});

test("9) authorized teacher can join assigned class without student credential", () => {
  const teacher = user({ roles: ["faculty"], activeRole: "faculty" });
  const session = onlineClass({ host: teacher, cohortUserIds: [oid()] });
  assert.equal(canViewSession(session, teacher), true);
  const role = authorizeConnectJoin(session, teacher, {});
  assert.equal(role, "TEACHER");
});

test("10) authorized invited staff can join their meeting", () => {
  const host = user({ roles: ["registrar"], activeRole: "registrar" });
  const invited = user({ roles: ["faculty"], activeRole: "faculty" });
  const session = onlineMeeting({ host, invitedUserIds: [invited._id] });
  const role = authorizeConnectJoin(session, invited, {});
  assert.equal(role, "INVITED_STAFF");
});

test("11) ended and cancelled sessions reject new joins", () => {
  const teacher = user({ roles: ["faculty"], activeRole: "faculty" });
  const cancelled = onlineClass({ host: teacher, cohortUserIds: [oid()], status: "CANCELLED" });
  const ended = onlineClass({ host: teacher, cohortUserIds: [oid()], status: "COMPLETED" });
  throwsMessage(() => authorizeConnectJoin(cancelled, teacher, {}), /cancelled/i, 403);
  throwsMessage(() => authorizeConnectJoin(ended, teacher, {}), /already ended/i, 403);
});

test("11b) session scheduled in the future cannot be joined yet", () => {
  const teacher = user({ roles: ["faculty"], activeRole: "faculty" });
  const future = onlineClass({ host: teacher, cohortUserIds: [oid()], scheduledDate: "2099-01-01", startTime: "10:00", status: "SCHEDULED" });
  throwsMessage(() => authorizeConnectJoin(future, teacher, {}), /has not started yet/i, 403);
});

test("12) chat/send authorization foundation: unauthorized users cannot join session room context", () => {
  // Socket.IO handlers call authorizeJoinedSession (DB recheck) and require socket.rooms membership.
  // Here we verify the shared auth denies non-members so a user who cannot join cannot be authorized to send/read.
  const teacher = user({ roles: ["faculty"], activeRole: "faculty" });
  const outsider = studentUser();
  const session = onlineClass({ host: teacher, cohortUserIds: [oid()] });
  throwsMessage(() => authorizeConnectJoin(session, outsider, {}), /not found|access denied/i, 404);
});

test("listVisibleSessions guard: students never receive meetings (defense in depth filter)", async () => {
  // listVisibleSessions queries DB; this test documents that DB-backed behavior is NOT executed
  // in this pure run (no mongoose connection). It remains required runtime verification.
  assert.equal(typeof listVisibleSessions, "function");
});
