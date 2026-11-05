import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const TEST_DB = "collegeos_library_facilities_test";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";
process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-library-test-secret-2026";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";

let baseUrl = "";
let server = null;
let mongooseRef = null;
const context = {};

async function api(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: payload });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data, text };
}

async function login(email, password) {
  const result = await api("/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(result.status, 200, result.text);
  return result.data.token;
}

async function activate(email, temporaryPassword, password) {
  const token = await login(email, temporaryPassword);
  const result = await api("/api/auth/change-password", {
    method: "POST",
    token,
    body: { currentPassword: temporaryPassword, newPassword: password, confirmPassword: password },
  });
  assert.equal(result.status, 200, result.text);
  return result.data.token;
}

async function provision(role, firstName) {
  const studentFields = role === "student"
    ? { studentId: `LIB${Date.now()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`, program: "BCA", batch: "2026", semester: 1, section: "LIB" }
    : {};
  const created = await api("/api/admin/users", {
    method: "POST",
    token: context.adminToken,
    body: { firstName, lastName: "Test", role, designation: role, ...studentFields },
  });
  assert.equal(created.status, 201, created.text);
  const password = `Library@${Math.random().toString(36).slice(2, 8)}A1`;
  const token = await activate(created.data.email, created.data.temporaryPassword, password);
  return { ...created.data, token };
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
  context.adminToken = await activate(
    "admin@collegeos.test",
    process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD,
    "LibraryAdmin@1234",
  );
  await api("/api/sections", {
    method: "POST",
    token: context.adminToken,
    body: { code: "LIB", program: "BCA", semester: 1, batch: "2026", room: "Library Test Room" },
  });
  const student = await provision("student", "LibraryStudent");
  context.studentToken = student.token;
  context.studentId = student.userId;
  const financeOfficer = await provision("finance_officer", "LibraryFinance");
  context.financeToken = financeOfficer.token;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongooseRef) {
    await mongooseRef.connection.dropDatabase();
    await mongooseRef.disconnect();
  }
});

test("library catalog, copy circulation, borrower scoping, fines and payment records are persistent", async () => {
  const unauthorized = await api("/api/library/books", { token: context.studentToken });
  assert.equal(unauthorized.status, 200);
  const studentCannotCreate = await api("/api/library/books", {
    method: "POST",
    token: context.studentToken,
    body: { title: "Not authorized" },
  });
  assert.equal(studentCannotCreate.status, 403);

  const created = await api("/api/library/books", {
    method: "POST",
    token: context.adminToken,
    body: { title: "Institutional Systems", isbn13: "9781234567890", author: "A. Author", category: "Computing" },
  });
  assert.equal(created.status, 201, created.text);
  const bookId = created.data.book._id;
  const copies = await api(`/api/library/books/${bookId}/copies`, {
    method: "POST",
    token: context.adminToken,
    body: { count: 2, accessionPrefix: "CS" },
  });
  assert.equal(copies.status, 201, copies.text);
  const availableCopies = copies.data.copies;
  assert.equal(new Set(availableCopies.map((copy) => copy.accessionNumber)).size, 2);

  const issued = await api("/api/library/loans", {
    method: "POST",
    token: context.adminToken,
    body: { copyId: availableCopies[0]._id, memberId: context.studentId },
  });
  assert.equal(issued.status, 201, issued.text);
  const duplicateIssue = await api("/api/library/loans", {
    method: "POST",
    token: context.adminToken,
    body: { copyId: availableCopies[0]._id, memberId: context.studentId },
  });
  assert.equal(duplicateIssue.status, 409);

  const allLoans = await api("/api/library/loans", { token: context.studentToken });
  assert.equal(allLoans.status, 200);
  assert.equal(allLoans.data.loans.length, 1);
  await (await import("../src/models/Library.js")).LibraryLoan.updateOne(
    { _id: issued.data.loan._id },
    { $set: { dueDate: new Date(Date.now() - 3 * 86400000) } },
  );
  const returned = await api(`/api/library/loans/${issued.data.loan._id}/return`, {
    method: "POST",
    token: context.adminToken,
    body: { condition: "Good" },
  });
  assert.equal(returned.status, 200, returned.text);
  assert.equal(returned.data.fines.length, 1);
  assert.ok(returned.data.fines[0].amountNpr > 0);

  const studentFines = await api("/api/library/fines", { token: context.studentToken });
  assert.equal(studentFines.status, 200);
  assert.equal(studentFines.data.fines.length, 1);
  const fine = studentFines.data.fines[0];
  const payment = await api(`/api/library/fines/${fine._id}/payments`, {
    method: "POST",
    token: context.financeToken,
    body: { amountNpr: fine.outstandingNpr, method: "Cash", reference: "TEST-CASH-RECEIPT" },
  });
  assert.equal(payment.status, 201, payment.text);
  assert.ok(payment.data.payment.receiptNumber);
  const settledFines = await api("/api/library/fines", { token: context.studentToken });
  assert.equal(settledFines.data.fines[0].status, "Paid");

  const dashboard = await api("/api/library/dashboard", { token: context.adminToken });
  assert.equal(dashboard.status, 200, dashboard.text);
  assert.equal(dashboard.data.inventory.titles, 1);
  assert.equal(dashboard.data.inventory.copies, 2);
});

test("library reservations are unique and cancellation retains history", async () => {
  const { LibraryBook } = await import("../src/models/Library.js");
  const book = await LibraryBook.findOne({ title: "Institutional Systems" });
  const first = await api(`/api/library/books/${book._id}/reservations`, { method: "POST", token: context.studentToken, body: {} });
  assert.equal(first.status, 201, first.text);
  const duplicate = await api(`/api/library/books/${book._id}/reservations`, { method: "POST", token: context.studentToken, body: {} });
  assert.equal(duplicate.status, 409);
  const cancel = await api(`/api/library/reservations/${first.data.reservation._id}/cancel`, { method: "PATCH", token: context.studentToken, body: { reason: "No longer needed" } });
  assert.equal(cancel.status, 200, cancel.text);
  assert.equal(cancel.data.reservation.status, "cancelled");
});

test("facility requests block overlapping pending bookings and serialize concurrent writes", async () => {
  const building = await api("/api/facilities/buildings", {
    method: "POST",
    token: context.adminToken,
    body: { name: "Library Test Building", code: `LT${Date.now()}`, campus: "Main Campus" },
  });
  assert.equal(building.status, 201, building.text);
  const room = await api("/api/facilities/rooms", {
    method: "POST",
    token: context.adminToken,
    body: { buildingId: building.data.building._id, roomNumber: "R-1", name: "Test Seminar Room", capacity: 30, openingTime: "08:00", closingTime: "18:00" },
  });
  assert.equal(room.status, 201, room.text);
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const request = {
    roomId: room.data.room._id,
    date,
    startTime: "10:00",
    endTime: "11:00",
    purpose: "Library integration test",
    expectedParticipants: 12,
  };
  const first = await api("/api/facilities/reservations", { method: "POST", token: context.studentToken, body: request });
  assert.equal(first.status, 201, first.text);
  const overlap = await api("/api/facilities/reservations", { method: "POST", token: context.studentToken, body: { ...request, startTime: "10:30", endTime: "11:30" } });
  assert.equal(overlap.status, 409);

  const nextDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const concurrentRequest = { ...request, date: nextDate, startTime: "13:00", endTime: "14:00" };
  const concurrent = await Promise.all([
    api("/api/facilities/reservations", { method: "POST", token: context.studentToken, body: concurrentRequest }),
    api("/api/facilities/reservations", { method: "POST", token: context.studentToken, body: { ...concurrentRequest, startTime: "13:30", endTime: "14:30" } }),
  ]);
  assert.deepEqual(concurrent.map((item) => item.status).sort(), [201, 409]);

  const approval = await api(`/api/facilities/reservations/${first.data.reservation._id}/status`, {
    method: "PATCH",
    token: context.adminToken,
    body: { status: "Approved", reason: "Test approval" },
  });
  assert.equal(approval.status, 200, approval.text);
  const studentReservations = await api("/api/facilities/reservations", { token: context.studentToken });
  assert.equal(studentReservations.status, 200);
  assert.ok(studentReservations.data.reservations.every((item) => String(item.requestedBy?._id || item.requestedBy) === context.studentId));
});
