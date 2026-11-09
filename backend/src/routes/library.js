import { createAndEmitNotification } from "../services/notificationService.js";
import { randomUUID } from "node:crypto";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  AuditLog,
  LibraryBook,
  LibraryBookCopy,
  LibraryFine,
  LibraryFinePayment,
  LibraryLoan,
  LibraryPolicy,
  LibraryReservation,
  Student,
  User,
} from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, conflict, notFound } from "../utils/apiError.js";

const POLICY_DEFAULTS = [
  { borrowerCategory: "student", maxBooks: 3, loanDays: 14, renewalLimit: 1, gracePeriodDays: 0, finePerDayNpr: 10, maxFineNpr: 500, damagedBookFineNpr: 0, lostBookFineNpr: 0, reservationAllowed: true, borrowingBlockedWithOutstandingFine: true, maxOutstandingFineNpr: 0 },
  { borrowerCategory: "faculty", maxBooks: 5, loanDays: 30, renewalLimit: 2, gracePeriodDays: 0, finePerDayNpr: 10, maxFineNpr: 1000, damagedBookFineNpr: 0, lostBookFineNpr: 0, reservationAllowed: true, borrowingBlockedWithOutstandingFine: true, maxOutstandingFineNpr: 0 },
  { borrowerCategory: "staff", maxBooks: 3, loanDays: 14, renewalLimit: 1, gracePeriodDays: 0, finePerDayNpr: 10, maxFineNpr: 500, damagedBookFineNpr: 0, lostBookFineNpr: 0, reservationAllowed: true, borrowingBlockedWithOutstandingFine: true, maxOutstandingFineNpr: 0 },
];
const ACTIVE_LOAN_STATUSES = ["issued", "overdue"];
const MAX_PAGE_SIZE = 100;

function actorId(user) {
  return user._id || user.id;
}

function userRoles(user) {
  return Array.isArray(user.roles) ? user.roles : [user.activeRole || "student"];
}

function borrowerCategory(user) {
  const roles = userRoles(user);
  if (roles.includes("student")) return "student";
  if (roles.includes("faculty")) return "faculty";
  return "staff";
}

function isLibraryManager(user) {
  return userRoles(user).some((role) => ["super_admin", "campus_admin"].includes(role));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function remainingFine(fine) {
  return Math.max(0, Number(fine.amountNpr || 0) - Number(fine.paidAmountNpr || 0) - Number(fine.waivedAmountNpr || 0));
}

async function writeAudit(req, action, resource, resourceId, details, oldValue = null, newValue = null) {
  await AuditLog.create({
    user: actorId(req.user),
    action,
    module: "library",
    resource,
    resourceId: String(resourceId),
    details,
    oldValue,
    newValue,
    ipAddress: req.ip,
  });
}

async function syncBookCopyCounts(bookId) {
  const [counts] = await LibraryBookCopy.aggregate([
    { $match: { book: bookId, status: { $ne: "Withdrawn" } } },
    { $group: { _id: null, total: { $sum: 1 }, available: { $sum: { $cond: [{ $eq: ["$status", "Available"] }, 1, 0] } } } },
  ]);
  await LibraryBook.updateOne(
    { _id: bookId },
    { $set: { totalCopies: counts?.total || 0, availableCopies: counts?.available || 0 } },
  );
}

async function getPolicy(category) {
  let policy = await LibraryPolicy.findOne({ borrowerCategory: category, isActive: true }).lean();
  if (policy) return policy;
  const defaults = POLICY_DEFAULTS.find((item) => item.borrowerCategory === category);
  if (!defaults) throw conflict("No active borrowing policy is configured for this borrower category.");
  policy = await LibraryPolicy.findOneAndUpdate(
    { borrowerCategory: category },
    { $setOnInsert: defaults },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return policy;
}

async function assignNextReservation(bookId, copyId, actor) {
  const next = await LibraryReservation.findOneAndUpdate(
    { book: bookId, status: "waiting" },
    {
      $set: { status: "ready", copy: copyId, expiresAt: new Date(Date.now() + 2 * 86400000) },
      $push: { history: { action: "READY", actor, details: { copyId: String(copyId) } } },
    },
    { sort: { queuePosition: 1, placedAt: 1 }, returnDocument: "after" },
  );
  if (!next) return null;
  const held = await LibraryBookCopy.updateOne(
    { _id: copyId, status: "Available" },
    { $set: { status: "Reserved" } },
  );
  if (!held.modifiedCount) {
    await LibraryReservation.updateOne(
      { _id: next._id, status: "ready" },
      { $set: { status: "waiting", copy: null, expiresAt: null } },
    );
    throw conflict("The available copy changed while assigning the next reservation.");
  }
  await createAndEmitNotification({
    user: next.member,
    sender: actor || null,
    senderType: actor ? "user" : "system",
    senderLabel: actor ? null : "CollegeOS Library",
    senderDepartment: "Library",
    title: "Reserved Library Book Available",
    message: "A book on your reservation list is ready for collection. Please collect it within two days.",
    category: "library",
    priority: "normal",
    actionUrl: "/library",
    relatedEntityType: "library_reservation",
    relatedEntityId: next._id,
    idempotencyKey: `library-reservation:${next._id}:ready`,
    metadata: { reservationId: String(next._id), bookId: String(bookId) },
  });
  return next;
}

async function expireReadyReservations() {
  const expired = await LibraryReservation.find({
    status: "ready",
    expiresAt: { $lte: new Date() },
  }).select("_id book copy").limit(100).lean();
  for (const reservation of expired) {
    const claimed = await LibraryReservation.findOneAndUpdate(
      { _id: reservation._id, status: "ready", expiresAt: { $lte: new Date() } },
      {
        $set: { status: "expired" },
        $push: { history: { action: "EXPIRED", details: { reason: "Collection window elapsed." } } },
      },
      { returnDocument: "after" },
    );
    if (!claimed?.copy) continue;
    const released = await LibraryBookCopy.updateOne(
      { _id: claimed.copy, status: "Reserved" },
      { $set: { status: "Available" } },
    );
    if (released.modifiedCount) await assignNextReservation(claimed.book, claimed.copy, null);
    await syncBookCopyCounts(claimed.book);
  }
}

async function assertBorrowerEligible(memberId, category, policy) {
  const member = await User.findById(memberId).lean();
  if (!member || ["SUSPENDED", "DISABLED", "ARCHIVED"].includes(member.accountStatus)) {
    throw conflict("The borrower account is not eligible for circulation.");
  }
  const [activeLoans, outstandingFines] = await Promise.all([
    LibraryLoan.countDocuments({ member: memberId, status: { $in: ACTIVE_LOAN_STATUSES } }),
    LibraryFine.find({ member: memberId, status: { $in: ["Outstanding", "Partially Paid"] } }).lean(),
  ]);
  const outstanding = outstandingFines.reduce((sum, fine) => sum + remainingFine(fine), 0);
  if (activeLoans >= policy.maxBooks) throw conflict(`Borrowing limit reached for ${category} (${policy.maxBooks} books).`);
  if (policy.borrowingBlockedWithOutstandingFine && outstanding > policy.maxOutstandingFineNpr) {
    throw conflict("Outstanding library fines prevent new borrowing.");
  }
  return { member, activeLoans, outstanding };
}

async function calculateDashboard() {
  const today = new Date();
  const dayStart = new Date(today);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const [
    titles,
    copies,
    availableCopies,
    borrowedCopies,
    reservations,
    activeLoans,
    overdueLoans,
    issuedToday,
    returnedToday,
    fines,
    payments,
    recentLoans,
    lowStock,
    recentBooks,
  ] = await Promise.all([
    LibraryBook.countDocuments({ status: "Active" }),
    LibraryBookCopy.countDocuments({ status: { $ne: "Withdrawn" } }),
    LibraryBookCopy.countDocuments({ status: "Available" }),
    LibraryBookCopy.countDocuments({ status: { $in: ["Issued", "Overdue"] } }),
    LibraryReservation.countDocuments({ status: { $in: ["waiting", "ready"] } }),
    LibraryLoan.countDocuments({ status: "issued" }),
    LibraryLoan.countDocuments({ $or: [{ status: "overdue" }, { status: "issued", dueDate: { $lt: today } }] }),
    LibraryLoan.countDocuments({ issueDate: { $gte: dayStart, $lt: dayEnd } }),
    LibraryLoan.countDocuments({ returnDate: { $gte: dayStart, $lt: dayEnd } }),
    LibraryFine.find().lean(),
    LibraryFinePayment.find().lean(),
    LibraryLoan.find().sort({ createdAt: -1 }).limit(8).populate("book", "title").populate("member", "firstName lastName email").lean(),
    LibraryBook.find({ status: "Active", totalCopies: { $lte: 2 } }).sort({ totalCopies: 1 }).limit(8).lean(),
    LibraryBook.find({ status: "Active" }).sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  const allLoans = await LibraryLoan.find().select("book").lean();
  const counts = new Map();
  for (const loan of allLoans) {
    const key = String(loan.book);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const popularBooks = await LibraryBook.find({ _id: { $in: [...counts.keys()] } }).lean();
  const popular = popularBooks
    .map((book) => ({ title: book.title, circulationCount: counts.get(String(book._id)) || 0 }))
    .sort((a, b) => b.circulationCount - a.circulationCount)
    .slice(0, 5);
  const outstandingFinesNpr = fines.reduce((sum, fine) => sum + remainingFine(fine), 0);
  const waivedFinesNpr = fines.reduce((sum, fine) => sum + Number(fine.waivedAmountNpr || 0), 0);
  const finesCollectedNpr = payments.reduce((sum, payment) => sum + Number(payment.amountNpr || 0), 0);
  return {
    inventory: { titles, copies, availableCopies, borrowedCopies },
    circulation: { issuedToday, returnedToday, activeLoans, overdueLoans, pendingReservations: reservations },
    finance: { outstandingFinesNpr, finesCollectedNpr, pendingFinePaymentsNpr: outstandingFinesNpr, waivedFinesNpr },
    recentLoans,
    popularTitles: popular,
    lowStockTitles: lowStock,
    recentAcquisitions: recentBooks,
  };
}

export function registerLibraryRoutes(app) {
  app.get("/api/library/dashboard", requireAuth, requirePermission("library.view"), asyncHandler(async (_req, res) => {
    res.json(await calculateDashboard());
  }));

  app.get("/api/library/books", requireAuth, requirePermission("library.view"), asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req.query);
    const filter = {};
    if (req.query.includeArchived !== "true") filter.status = "Active";
    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.publisher) filter.publisher = new RegExp(escapeRegex(req.query.publisher), "i");
    if (req.query.condition) filter.condition = req.query.condition;
    if (req.query.availability === "available") filter.availableCopies = { $gt: 0 };
    if (req.query.availability === "unavailable") filter.availableCopies = 0;
    if (req.query.search) {
      const search = new RegExp(escapeRegex(req.query.search), "i");
      filter.$or = [{ title: search }, { subtitle: search }, { isbn: search }, { isbn10: search }, { isbn13: search }, { author: search }, { authors: search }, { publisher: search }, { category: search }];
    }
    const [books, total] = await Promise.all([
      LibraryBook.find(filter).sort({ [String(req.query.sort || "createdAt")]: req.query.order === "asc" ? 1 : -1 }).skip(skip).limit(limit).lean(),
      LibraryBook.countDocuments(filter),
    ]);
    res.json({ books, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  }));

  app.post("/api/library/books", requireAuth, requirePermission("library.manage"), asyncHandler(async (req, res) => {
    const input = req.body || {};
    if (!String(input.title || "").trim()) throw badRequest("Book title is required.");
    const authors = Array.isArray(input.authors) ? input.authors.map((name) => String(name).trim()).filter(Boolean) : [];
    const book = await LibraryBook.create({
      ...input,
      isbn: String(input.isbn13 || input.isbn10 || input.isbn || "").trim(),
      authors,
      author: authors.join(", ") || String(input.author || "").trim(),
      totalCopies: 0,
      availableCopies: 0,
      createdBy: actorId(req.user),
      updatedBy: actorId(req.user),
      status: input.status === "Archived" ? "Archived" : "Active",
      isActive: input.status !== "Archived",
    });
    await writeAudit(req, "LIBRARY_BOOK_CREATED", "LibraryBook", book._id, `Cataloged "${book.title}".`, null, { title: book.title, isbn: book.isbn });
    res.status(201).json({ book });
  }));

  app.get("/api/library/books/:id", requireAuth, requirePermission("library.view"), asyncHandler(async (req, res) => {
    const book = await LibraryBook.findById(req.params.id).lean();
    if (!book) throw notFound("Book not found.");
    const projection = isLibraryManager(req.user) ? "" : "-currentBorrower -currentLoan";
    const copies = await LibraryBookCopy.find({ book: book._id }).select(projection).sort({ accessionNumber: 1 }).lean();
    res.json({ book, copies });
  }));

  app.put("/api/library/books/:id", requireAuth, requirePermission("library.manage"), asyncHandler(async (req, res) => {
    const book = await LibraryBook.findById(req.params.id);
    if (!book) throw notFound("Book not found.");
    const oldValue = book.toObject();
    const allowed = ["title", "subtitle", "isbn", "isbn10", "isbn13", "authors", "author", "publisher", "publicationYear", "edition", "language", "category", "subject", "description", "keywords", "coverImageUrl", "shelfLocation", "classificationNumber", "acquisitionDate", "acquisitionCostNpr", "supplier", "condition"];
    for (const field of allowed) if (req.body[field] !== undefined) book[field] = req.body[field];
    if (req.body.authors !== undefined) book.author = book.authors.join(", ");
    book.updatedBy = actorId(req.user);
    await book.save();
    await writeAudit(req, "LIBRARY_BOOK_UPDATED", "LibraryBook", book._id, `Updated "${book.title}".`, oldValue, book.toObject());
    res.json({ book });
  }));

  app.patch("/api/library/books/:id/status", requireAuth, requirePermission("library.manage"), asyncHandler(async (req, res) => {
    const status = req.body.status;
    if (!["Active", "Archived"].includes(status)) throw badRequest("Status must be Active or Archived.");
    const book = await LibraryBook.findById(req.params.id);
    if (!book) throw notFound("Book not found.");
    if (status === "Archived" && await LibraryLoan.exists({ book: book._id, status: { $in: ACTIVE_LOAN_STATUSES } })) {
      throw conflict("A title with active loans cannot be archived.");
    }
    const oldStatus = book.status;
    book.status = status;
    book.isActive = status === "Active";
    book.updatedBy = actorId(req.user);
    await book.save();
    await writeAudit(req, `LIBRARY_BOOK_${status.toUpperCase()}`, "LibraryBook", book._id, `Changed title status from ${oldStatus} to ${status}.`, { status: oldStatus }, { status });
    res.json({ book });
  }));

  app.get("/api/library/copies", requireAuth, requirePermission("library.manage"), asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req.query);
    const filter = {};
    if (req.query.bookId) filter.book = req.query.bookId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const search = new RegExp(escapeRegex(req.query.search), "i");
      filter.$or = [{ accessionNumber: search }, { barcode: search }];
    }
    const [copies, total] = await Promise.all([
      LibraryBookCopy.find(filter).populate("book", "title isbn").populate("currentBorrower", "firstName lastName email").sort({ accessionNumber: 1 }).skip(skip).limit(limit).lean(),
      LibraryBookCopy.countDocuments(filter),
    ]);
    res.json({ copies, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  }));

  app.post("/api/library/books/:id/copies", requireAuth, requirePermission("library.manage"), asyncHandler(async (req, res) => {
    const book = await LibraryBook.findById(req.params.id);
    if (!book || book.status !== "Active") throw notFound("Active book title not found.");
    const count = Number(req.body.count || 1);
    if (!Number.isInteger(count) || count < 1 || count > 100) throw badRequest("Copy count must be between 1 and 100.");
    const copies = [];
    for (let index = 0; index < count; index += 1) {
      const accessionNumber = count === 1 && req.body.accessionNumber
        ? req.body.accessionNumber
        : `${String(req.body.accessionPrefix || "LIB").trim().toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      copies.push({
        book: book._id,
        accessionNumber,
        barcode: count === 1 ? req.body.barcode || null : null,
        branch: req.body.branch || "Main Library",
        shelfLocation: req.body.shelfLocation || book.shelfLocation,
        acquisitionDate: req.body.acquisitionDate || book.acquisitionDate,
        purchasePriceNpr: req.body.purchasePriceNpr ?? book.acquisitionCostNpr,
        condition: req.body.condition || "Good",
        status: "Available",
        createdBy: actorId(req.user),
      });
    }
    const created = await LibraryBookCopy.insertMany(copies, { ordered: true });
    await syncBookCopyCounts(book._id);
    await writeAudit(req, "LIBRARY_COPIES_ADDED", "LibraryBook", book._id, `Added ${created.length} physical copy/copies.`, null, { accessionNumbers: created.map((copy) => copy.accessionNumber) });
    res.status(201).json({ copies: created });
  }));

  app.patch("/api/library/copies/:id/status", requireAuth, requirePermission("library.manage"), asyncHandler(async (req, res) => {
    const status = req.body.status;
    if (!["Available", "Lost", "Damaged", "Under Repair", "Withdrawn"].includes(status)) throw badRequest("Invalid copy status.");
    const copy = await LibraryBookCopy.findById(req.params.id);
    if (!copy) throw notFound("Book copy not found.");
    if (["Issued", "Reserved", "Overdue"].includes(copy.status)) throw conflict("An issued or reserved copy cannot be directly reclassified.");
    const previous = copy.status;
    copy.status = status;
    copy.condition = status === "Lost" || status === "Damaged" || status === "Under Repair" ? status : copy.condition;
    await copy.save();
    await syncBookCopyCounts(copy.book);
    await writeAudit(req, "LIBRARY_COPY_STATUS_CHANGED", "LibraryBookCopy", copy._id, `Changed copy status from ${previous} to ${status}.`, { status: previous }, { status });
    res.json({ copy });
  }));

  app.get("/api/library/borrowers/me", requireAuth, requirePermission("library.view"), asyncHandler(async (req, res) => {
    const memberId = actorId(req.user);
    const [student, loans, fines] = await Promise.all([
      Student.findOne({ user: memberId }).select("studentId program department").lean(),
      LibraryLoan.find({ member: memberId }).populate("book", "title isbn").populate("copy", "accessionNumber").sort({ createdAt: -1 }).lean(),
      LibraryFine.find({ member: memberId }).sort({ createdAt: -1 }).lean(),
    ]);
    res.json({
      borrower: { userId: String(memberId), name: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim(), identifier: student?.studentId || req.user.employeeId || req.user.email, category: borrowerCategory(req.user), program: student?.program || "", department: student?.department || "" },
      loans,
      fines: fines.map((fine) => ({ ...fine, outstandingNpr: remainingFine(fine) })),
      outstandingFinesNpr: fines.reduce((sum, fine) => sum + remainingFine(fine), 0),
    });
  }));

  app.get("/api/library/borrowers", requireAuth, requirePermission("library.manage"), asyncHandler(async (req, res) => {
    const search = String(req.query.search || "").trim();
    if (search.length < 2) throw badRequest("Enter at least two characters to search borrowers.");
    const matcher = new RegExp(escapeRegex(search), "i");
    const users = await User.find({
      $or: [{ firstName: matcher }, { lastName: matcher }, { email: matcher }, { employeeId: matcher }],
      accountStatus: { $nin: ["SUSPENDED", "DISABLED", "ARCHIVED"] },
    }).limit(20).select("firstName lastName email roles employeeId").lean();
    const students = await Student.find({ user: { $in: users.map((user) => user._id) } }).select("user studentId program department").lean();
    const studentsByUser = new Map(students.map((student) => [String(student.user), student]));
    const borrowers = await Promise.all(users.map(async (user) => {
      const [activeLoans, fines] = await Promise.all([
        LibraryLoan.countDocuments({ member: user._id, status: { $in: ACTIVE_LOAN_STATUSES } }),
        LibraryFine.find({ member: user._id, status: { $in: ["Outstanding", "Partially Paid"] } }).lean(),
      ]);
      const student = studentsByUser.get(String(user._id));
      return {
        userId: String(user._id),
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        identifier: student?.studentId || user.employeeId || user.email,
        program: student?.program || "",
        department: student?.department || "",
        category: borrowerCategory(user),
        activeLoans,
        outstandingFinesNpr: fines.reduce((sum, fine) => sum + remainingFine(fine), 0),
      };
    }));
    res.json({ borrowers });
  }));

  app.get("/api/library/loans", requireAuth, requirePermission("library.view"), asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req.query);
    const filter = {};
    if (!isLibraryManager(req.user)) {
      filter.member = actorId(req.user);
    } else if (req.query.memberId) filter.member = req.query.memberId;
    if (req.query.status) filter.status = req.query.status;
    const [loanRecords, total] = await Promise.all([
      LibraryLoan.find(filter).populate("book", "title isbn").populate("copy", "accessionNumber barcode").populate("member", "firstName lastName email").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      LibraryLoan.countDocuments(filter),
    ]);
    const loans = loanRecords.map((loan) => loan.status === "issued" && loan.dueDate < new Date() ? { ...loan, status: "overdue" } : loan);
    res.json({ loans, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  }));

  app.post("/api/library/loans", requireAuth, requirePermission("library.manage"), asyncHandler(async (req, res) => {
    const { copyId, memberId } = req.body || {};
    if (!copyId || !memberId) throw badRequest("Physical copy and borrower are required.");
    const member = await User.findById(memberId).lean();
    if (!member) throw notFound("Borrower not found.");
    const category = borrowerCategory(member);
    const policy = await getPolicy(category);
    await assertBorrowerEligible(memberId, category, policy);
    const reservation = await LibraryReservation.findOne({ member: memberId, copy: copyId, status: "ready" });
    const allowedCopyStatuses = reservation ? ["Available", "Reserved"] : ["Available"];
    const copy = await LibraryBookCopy.findOneAndUpdate(
      { _id: copyId, status: { $in: allowedCopyStatuses }, ...(reservation ? {} : { currentLoan: null }) },
      { $set: { status: "Issued", currentBorrower: memberId } },
      { returnDocument: "after" },
    );
    if (!copy) throw conflict("Copy is unavailable or reserved for another borrower.");
    const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : new Date(Date.now() + policy.loanDays * 86400000);
    if (Number.isNaN(dueDate.getTime()) || dueDate <= new Date()) {
      await LibraryBookCopy.updateOne({ _id: copy._id, status: "Issued", currentBorrower: memberId }, { $set: { status: reservation ? "Reserved" : "Available", currentBorrower: null } });
      throw badRequest("Due date must be a valid future date.");
    }
    let loan;
    try {
      loan = await LibraryLoan.create({
        book: copy.book,
        copy: copy._id,
        member: memberId,
        borrowerCategory: category,
        issuedBy: actorId(req.user),
        dueDate,
        status: "issued",
        history: [{ action: "ISSUED", actor: actorId(req.user), details: { dueDate } }],
      });
      await LibraryBookCopy.updateOne({ _id: copy._id }, { $set: { currentLoan: loan._id } });
      if (reservation) {
        reservation.status = "fulfilled";
        reservation.fulfilledAt = new Date();
        reservation.history.push({ action: "FULFILLED", actor: actorId(req.user), details: { loanId: String(loan._id) } });
        await reservation.save();
      }
      await syncBookCopyCounts(copy.book);
      await writeAudit(req, "LIBRARY_BOOK_ISSUED", "LibraryLoan", loan._id, `Issued copy ${copy.accessionNumber} to borrower ${memberId}.`, null, { copyId: String(copy._id), memberId: String(memberId), dueDate });
    } catch (error) {
      if (!loan) {
        await LibraryBookCopy.updateOne({ _id: copy._id, status: "Issued", currentBorrower: memberId }, { $set: { status: reservation ? "Reserved" : "Available", currentBorrower: null, currentLoan: null } });
      }
      throw error;
    }
    res.status(201).json({ loan: await LibraryLoan.findById(loan._id).populate("book", "title").populate("copy", "accessionNumber").populate("member", "firstName lastName email").lean() });
  }));

  app.post("/api/library/loans/:id/return", requireAuth, requirePermission("library.manage"), asyncHandler(async (req, res) => {
    const loan = await LibraryLoan.findById(req.params.id);
    if (!loan) throw notFound("Loan not found.");
    const condition = req.body.condition || "Good";
    if (!["Good", "Fair", "Damaged", "Lost"].includes(condition)) throw badRequest("Invalid return condition.");
    const returnedAt = req.body.returnDate ? new Date(req.body.returnDate) : new Date();
    if (Number.isNaN(returnedAt.getTime())) throw badRequest("Return date is invalid.");
    const result = await LibraryLoan.findOneAndUpdate(
      { _id: loan._id, status: { $in: ACTIVE_LOAN_STATUSES } },
      { $set: { status: condition === "Lost" ? "lost" : "returned", returnDate: returnedAt, returnedBy: actorId(req.user), returnCondition: condition }, $push: { history: { action: "RETURNED", actor: actorId(req.user), at: returnedAt, details: { condition } } } },
      { returnDocument: "after" },
    );
    if (!result) throw conflict("Loan is no longer active.");
    const copyStatus = condition === "Lost" ? "Lost" : condition === "Damaged" ? "Damaged" : "Available";
    const copy = await LibraryBookCopy.findOneAndUpdate(
      { _id: loan.copy, currentLoan: loan._id, status: { $in: ["Issued", "Overdue"] } },
      { $set: { status: copyStatus, condition, currentBorrower: null, currentLoan: null } },
      { returnDocument: "after" },
    );
    if (!copy) throw conflict("The loan has been returned, but its physical copy could not be updated. Please reconcile the copy record.");
    const policy = await getPolicy(loan.borrowerCategory);
    const overdueDays = Math.max(0, Math.ceil((returnedAt.getTime() - loan.dueDate.getTime() - policy.gracePeriodDays * 86400000) / 86400000));
    const fineAmount = Math.min(policy.maxFineNpr, overdueDays * policy.finePerDayNpr);
    const generatedFines = [];
    if (fineAmount > 0) {
      generatedFines.push(await LibraryFine.findOneAndUpdate(
        { loan: loan._id, type: "Overdue" },
        { $setOnInsert: { member: loan.member, loan: loan._id, type: "Overdue", amountNpr: fineAmount, reason: `${overdueDays} overdue day(s)`, status: "Outstanding", history: [{ action: "CREATED", actor: actorId(req.user), amountNpr: fineAmount, reason: "Automatic overdue fine" }] } },
        { upsert: true, returnDocument: "after" },
      ));
    }
    if (condition === "Damaged" || condition === "Lost") {
      const amountNpr = condition === "Lost"
        ? Number(policy.lostBookFineNpr || copy.purchasePriceNpr || 0)
        : Number(policy.damagedBookFineNpr || 0);
      if (amountNpr > 0) {
        generatedFines.push(await LibraryFine.create({
          member: loan.member, loan: loan._id, type: condition, amountNpr,
          reason: `${condition} copy ${copy.accessionNumber}`,
          status: "Outstanding", createdBy: actorId(req.user),
          history: [{ action: "CREATED", actor: actorId(req.user), amountNpr, reason: "Condition policy assessment" }],
        }));
      }
    }
    if (copyStatus === "Available") {
      await assignNextReservation(loan.book, loan.copy, actorId(req.user));
    }
    await syncBookCopyCounts(loan.book);
    await writeAudit(req, "LIBRARY_BOOK_RETURNED", "LibraryLoan", loan._id, `Returned book copy with condition ${condition}.`, { status: loan.status }, { status: result.status, returnDate: returnedAt, generatedFineNpr: fineAmount });
    res.json({ loan: result, fines: generatedFines });
  }));

  app.post("/api/library/loans/:id/renew", requireAuth, asyncHandler(async (req, res) => {
    const loan = await LibraryLoan.findById(req.params.id);
    if (!loan) throw notFound("Loan not found.");
    const isStaff = isLibraryManager(req.user);
    if (!isStaff && String(loan.member) !== String(actorId(req.user))) throw notFound("Loan not found.");
    if (loan.status !== "issued") throw conflict("Only active issued loans can be renewed.");
    const policy = await getPolicy(loan.borrowerCategory);
    if (loan.renewalCount >= policy.renewalLimit) throw conflict("Renewal limit reached.");
    if (await LibraryReservation.exists({ book: loan.book, status: "waiting" })) throw conflict("This title has an active reservation and cannot be renewed.");
    const fines = await LibraryFine.find({ member: loan.member, status: { $in: ["Outstanding", "Partially Paid"] } }).lean();
    if (policy.borrowingBlockedWithOutstandingFine && fines.reduce((sum, fine) => sum + remainingFine(fine), 0) > policy.maxOutstandingFineNpr) {
      throw conflict("Outstanding library fines prevent renewal.");
    }
    const oldDueDate = loan.dueDate;
    loan.dueDate = new Date(Math.max(Date.now(), oldDueDate.getTime()) + policy.loanDays * 86400000);
    loan.renewalCount += 1;
    loan.history.push({ action: "RENEWED", actor: actorId(req.user), details: { oldDueDate, dueDate: loan.dueDate } });
    await loan.save();
    await writeAudit(req, "LIBRARY_LOAN_RENEWED", "LibraryLoan", loan._id, "Renewed loan.", { dueDate: oldDueDate }, { dueDate: loan.dueDate, renewalCount: loan.renewalCount });
    res.json({ loan });
  }));

  app.get("/api/library/reservations", requireAuth, requirePermission("library.view"), asyncHandler(async (req, res) => {
    await expireReadyReservations();
    const filter = {};
    const isStaff = isLibraryManager(req.user);
    if (!isStaff) filter.member = actorId(req.user);
    else if (req.query.status) filter.status = req.query.status;
    const reservations = await LibraryReservation.find(filter).populate("book", "title isbn").populate("member", "firstName lastName email").populate("copy", "accessionNumber").sort({ queuePosition: 1, placedAt: 1 }).lean();
    res.json({ reservations });
  }));

  app.post("/api/library/books/:id/reservations", requireAuth, requirePermission("library.view"), asyncHandler(async (req, res) => {
    const book = await LibraryBook.findOne({ _id: req.params.id, status: "Active" });
    if (!book) throw notFound("Active book title not found.");
    const memberId = actorId(req.user);
    const policy = await getPolicy(borrowerCategory(req.user));
    if (!policy.reservationAllowed) throw conflict("Reservations are disabled for this borrower category.");
    const activeLoans = await LibraryLoan.countDocuments({ member: memberId, status: { $in: ACTIVE_LOAN_STATUSES } });
    if (activeLoans >= policy.maxBooks) throw conflict("Borrowing limit reached; cancel or return a book before reserving another.");
    const active = await LibraryReservation.exists({ book: book._id, member: memberId, status: { $in: ["waiting", "ready"] } });
    if (active) throw conflict("You already have an active reservation for this title.");
    const last = await LibraryReservation.findOne({ book: book._id, status: { $in: ["waiting", "ready"] } }).sort({ queuePosition: -1 }).select("queuePosition").lean();
    const reservation = await LibraryReservation.create({
      book: book._id,
      member: memberId,
      queuePosition: (last?.queuePosition || 0) + 1,
      history: [{ action: "PLACED", actor: memberId }],
    });
    await writeAudit(req, "LIBRARY_RESERVATION_PLACED", "LibraryReservation", reservation._id, `Placed reservation at queue position ${reservation.queuePosition}.`);
    res.status(201).json({ reservation });
  }));

  app.patch("/api/library/reservations/:id/cancel", requireAuth, requirePermission("library.view"), asyncHandler(async (req, res) => {
    const reservation = await LibraryReservation.findById(req.params.id);
    if (!reservation) throw notFound("Reservation not found.");
    const isStaff = isLibraryManager(req.user);
    if (!isStaff && String(reservation.member) !== String(actorId(req.user))) throw notFound("Reservation not found.");
    if (!["waiting", "ready"].includes(reservation.status)) throw conflict("Reservation cannot be cancelled in its current state.");
    const oldStatus = reservation.status;
    reservation.status = "cancelled";
    reservation.history.push({ action: "CANCELLED", actor: actorId(req.user), details: { reason: req.body.reason || "" } });
    await reservation.save();
    if (oldStatus === "ready" && reservation.copy) {
      await LibraryBookCopy.updateOne({ _id: reservation.copy, status: "Reserved" }, { $set: { status: "Available" } });
      await assignNextReservation(reservation.book, reservation.copy, actorId(req.user));
    }
    await writeAudit(req, "LIBRARY_RESERVATION_CANCELLED", "LibraryReservation", reservation._id, "Cancelled reservation.", { status: oldStatus }, { status: reservation.status });
    res.json({ reservation });
  }));

  app.get("/api/library/fines", requireAuth, requirePermission("library.view"), asyncHandler(async (req, res) => {
    const isStaff = userRoles(req.user).some((role) => ["super_admin", "campus_admin", "finance_officer"].includes(role));
    const filter = isStaff ? {} : { member: actorId(req.user) };
    if (req.query.status) filter.status = req.query.status;
    const fines = await LibraryFine.find(filter).populate("member", "firstName lastName email").populate("loan", "book dueDate").sort({ createdAt: -1 }).lean();
    res.json({ fines: fines.map((fine) => ({ ...fine, outstandingNpr: remainingFine(fine) })) });
  }));

  app.post("/api/library/fines", requireAuth, requirePermission("library.manage"), asyncHandler(async (req, res) => {
    const amountNpr = Number(req.body.amountNpr);
    if (!req.body.memberId || !String(req.body.reason || "").trim() || !Number.isFinite(amountNpr) || amountNpr <= 0) throw badRequest("Borrower, reason, and a positive fine amount are required.");
    const fine = await LibraryFine.create({
      member: req.body.memberId,
      type: "Manual",
      amountNpr,
      reason: String(req.body.reason).trim(),
      status: "Outstanding",
      createdBy: actorId(req.user),
      history: [{ action: "CREATED", actor: actorId(req.user), amountNpr, reason: String(req.body.reason).trim() }],
    });
    await writeAudit(req, "LIBRARY_FINE_CREATED", "LibraryFine", fine._id, fine.reason, null, { amountNpr });
    res.status(201).json({ fine });
  }));

  app.patch("/api/library/fines/:id/waive", requireAuth, requirePermission("library.fines.manage"), asyncHandler(async (req, res) => {
    const amountNpr = Number(req.body.amountNpr);
    const reason = String(req.body.reason || "").trim();
    if (!Number.isFinite(amountNpr) || amountNpr <= 0 || !reason) throw badRequest("A positive waiver amount and reason are required.");
    const fine = await LibraryFine.findById(req.params.id);
    if (!fine) throw notFound("Fine not found.");
    const outstanding = remainingFine(fine);
    if (amountNpr > outstanding) throw conflict("Waiver exceeds the outstanding fine balance.");
    const oldValue = { waivedAmountNpr: fine.waivedAmountNpr, status: fine.status };
    fine.waivedAmountNpr += amountNpr;
    fine.status = remainingFine(fine) === 0 ? "Waived" : fine.paidAmountNpr > 0 ? "Partially Paid" : "Outstanding";
    fine.history.push({ action: "WAIVED", actor: actorId(req.user), amountNpr, reason });
    await fine.save();
    await writeAudit(req, "LIBRARY_FINE_WAIVED", "LibraryFine", fine._id, reason, oldValue, { waivedAmountNpr: fine.waivedAmountNpr, status: fine.status });
    res.json({ fine, outstandingNpr: remainingFine(fine) });
  }));

  app.post("/api/library/fines/:id/payments", requireAuth, requirePermission("library.payments.record"), asyncHandler(async (req, res) => {
    const amountNpr = Number(req.body.amountNpr);
    const method = req.body.method;
    const fine = await LibraryFine.findById(req.params.id);
    if (!fine) throw notFound("Fine not found.");
    if (!Number.isFinite(amountNpr) || amountNpr <= 0 || !["Cash", "Bank Transfer", "Gateway Confirmed", "Other"].includes(method)) throw badRequest("Payment amount or method is invalid.");
    if (method === "Gateway Confirmed" && !String(req.body.gatewayConfirmation || "").trim()) throw badRequest("Verified gateway confirmation is required.");
    const outstanding = remainingFine(fine);
    if (amountNpr > outstanding) throw conflict("Payment exceeds the outstanding fine balance.");
    const nextPaid = fine.paidAmountNpr + amountNpr;
    const updated = await LibraryFine.findOneAndUpdate(
      { _id: fine._id, paidAmountNpr: fine.paidAmountNpr, waivedAmountNpr: fine.waivedAmountNpr },
      { $inc: { paidAmountNpr: amountNpr }, $set: { status: nextPaid + fine.waivedAmountNpr >= fine.amountNpr ? "Paid" : "Partially Paid" }, $push: { history: { action: "PAYMENT_RECORDED", actor: actorId(req.user), amountNpr, reason: req.body.reference || "" } } },
      { returnDocument: "after" },
    );
    if (!updated) throw conflict("Fine balance changed; refresh and retry the payment.");
    const receiptNumber = `LF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
    let payment;
    try {
      payment = await LibraryFinePayment.create({
        fine: fine._id,
        member: fine.member,
        amountNpr,
        method,
        reference: req.body.reference || "",
        receiptNumber,
        recordedBy: actorId(req.user),
        note: req.body.note || "",
      });
    } catch (error) {
      await LibraryFine.updateOne({ _id: fine._id, paidAmountNpr: nextPaid }, { $inc: { paidAmountNpr: -amountNpr }, $set: { status: fine.status } });
      throw error;
    }
    await writeAudit(req, "LIBRARY_FINE_PAYMENT_RECORDED", "LibraryFinePayment", payment._id, `Recorded NPR ${amountNpr} using ${method}.`, null, { fineId: String(fine._id), receiptNumber });
    res.status(201).json({ payment, fine: updated });
  }));

  app.get("/api/library/fines/:id/payments", requireAuth, requirePermission("library.view"), asyncHandler(async (req, res) => {
    const fine = await LibraryFine.findById(req.params.id).lean();
    if (!fine) throw notFound("Fine not found.");
    const isStaff = userRoles(req.user).some((role) => ["super_admin", "campus_admin", "finance_officer"].includes(role));
    if (!isStaff && String(fine.member) !== String(actorId(req.user))) throw notFound("Fine not found.");
    const payments = await LibraryFinePayment.find({ fine: fine._id }).sort({ paymentDate: -1 }).lean();
    res.json({ payments });
  }));

  app.get("/api/library/policies", requireAuth, requirePermission("library.view"), asyncHandler(async (_req, res) => {
    for (const defaults of POLICY_DEFAULTS) {
      await LibraryPolicy.updateOne({ borrowerCategory: defaults.borrowerCategory }, { $setOnInsert: defaults }, { upsert: true });
    }
    res.json({ policies: await LibraryPolicy.find({ isActive: true }).sort({ borrowerCategory: 1 }).lean() });
  }));

  app.put("/api/library/policies/:category", requireAuth, requirePermission("library.manage"), asyncHandler(async (req, res) => {
    const input = req.body || {};
    for (const field of ["maxBooks", "loanDays", "renewalLimit", "gracePeriodDays", "finePerDayNpr", "maxFineNpr", "damagedBookFineNpr", "lostBookFineNpr", "maxOutstandingFineNpr"]) {
      if (input[field] !== undefined && (!Number.isFinite(Number(input[field])) || Number(input[field]) < 0)) throw badRequest(`${field} must be a non-negative number.`);
    }
    const policy = await LibraryPolicy.findOneAndUpdate(
      { borrowerCategory: String(req.params.category).trim().toLowerCase() },
      { $set: { ...input, updatedBy: actorId(req.user), isActive: true } },
      { upsert: true, runValidators: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    await writeAudit(req, "LIBRARY_POLICY_UPDATED", "LibraryPolicy", policy._id, `Updated ${policy.borrowerCategory} borrowing policy.`);
    res.json({ policy });
  }));
}
