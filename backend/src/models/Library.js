import mongoose from "mongoose";

const LibraryBookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 240, index: true },
    subtitle: { type: String, trim: true, default: "" },
    isbn: { type: String, trim: true, default: "" },
    isbn10: { type: String, trim: true, default: "" },
    isbn13: { type: String, trim: true, default: "" },
    authors: [{ type: String, trim: true }],
    author: { type: String, trim: true, default: "" },
    publisher: { type: String, trim: true, default: "", index: true },
    publicationYear: { type: Number, min: 1000, max: 9999 },
    edition: { type: String, trim: true, default: "" },
    language: { type: String, trim: true, default: "English" },
    category: { type: String, trim: true, default: "", index: true },
    subject: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    keywords: [{ type: String, trim: true }],
    coverImageUrl: { type: String, trim: true, default: "" },
    shelfLocation: { type: String, trim: true, default: "" },
    classificationNumber: { type: String, trim: true, default: "" },
    totalCopies: { type: Number, min: 0, default: 0 },
    availableCopies: { type: Number, min: 0, default: 0 },
    acquisitionDate: { type: Date, default: null },
    acquisitionCostNpr: { type: Number, min: 0, default: null },
    supplier: { type: String, trim: true, default: "" },
    condition: {
      type: String,
      enum: ["Good", "Fair", "Damaged", "Mixed"],
      default: "Good",
    },
    status: { type: String, enum: ["Active", "Archived"], default: "Active", index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

LibraryBookSchema.index({ title: "text", author: "text", authors: "text", publisher: "text", category: "text", isbn: "text" });
LibraryBookSchema.index({ isbn: 1 }, { unique: true, partialFilterExpression: { isbn: { $type: "string", $gt: "" } } });

export const LibraryBook = mongoose.model("LibraryBook", LibraryBookSchema);

const LibraryBookCopySchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "LibraryBook", required: true, index: true },
    accessionNumber: { type: String, required: true, trim: true, uppercase: true },
    barcode: { type: String, trim: true, uppercase: true, default: null },
    branch: { type: String, trim: true, default: "Main Library" },
    shelfLocation: { type: String, trim: true, default: "" },
    acquisitionDate: { type: Date, default: null },
    purchasePriceNpr: { type: Number, min: 0, default: null },
    condition: {
      type: String,
      enum: ["Good", "Fair", "Damaged", "Lost", "Under Repair"],
      default: "Good",
    },
    status: {
      type: String,
      enum: ["Available", "Issued", "Reserved", "Overdue", "Lost", "Damaged", "Under Repair", "Withdrawn"],
      default: "Available",
      index: true,
    },
    currentBorrower: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    currentLoan: { type: mongoose.Schema.Types.ObjectId, ref: "LibraryLoan", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

LibraryBookCopySchema.index({ accessionNumber: 1 }, { unique: true });
LibraryBookCopySchema.index(
  { barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: "string" } } },
);
export const LibraryBookCopy = mongoose.model("LibraryBookCopy", LibraryBookCopySchema);

const LibraryLoanSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "LibraryBook", required: true, index: true },
    copy: { type: mongoose.Schema.Types.ObjectId, ref: "LibraryBookCopy", required: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    borrowerCategory: { type: String, required: true, trim: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    returnDate: { type: Date, default: null },
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    returnCondition: { type: String, enum: ["Good", "Fair", "Damaged", "Lost"], default: null },
    renewalCount: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ["issued", "returned", "overdue", "lost"], default: "issued", index: true },
    history: [{
      _id: false,
      action: { type: String, required: true },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      at: { type: Date, default: Date.now },
      details: { type: mongoose.Schema.Types.Mixed, default: null },
    }],
  },
  { timestamps: true },
);

LibraryLoanSchema.index(
  { copy: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["issued", "overdue"] } } },
);
LibraryLoanSchema.index({ member: 1, status: 1, dueDate: 1 });
export const LibraryLoan = mongoose.model("LibraryLoan", LibraryLoanSchema);

const LibraryReservationSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "LibraryBook", required: true, index: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    queuePosition: { type: Number, min: 1, required: true },
    status: { type: String, enum: ["waiting", "ready", "fulfilled", "cancelled", "expired"], default: "waiting", index: true },
    copy: { type: mongoose.Schema.Types.ObjectId, ref: "LibraryBookCopy", default: null },
    placedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    fulfilledAt: { type: Date, default: null },
    history: [{
      _id: false,
      action: { type: String, required: true },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      at: { type: Date, default: Date.now },
      details: { type: mongoose.Schema.Types.Mixed, default: null },
    }],
  },
  { timestamps: true },
);
LibraryReservationSchema.index(
  { book: 1, member: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["waiting", "ready"] } } },
);
LibraryReservationSchema.index(
  { book: 1, queuePosition: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["waiting", "ready"] } } },
);
export const LibraryReservation = mongoose.model("LibraryReservation", LibraryReservationSchema);

const LibraryFineSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    loan: { type: mongoose.Schema.Types.ObjectId, ref: "LibraryLoan", default: null, index: true },
    type: { type: String, enum: ["Overdue", "Damaged", "Lost", "Manual"], required: true },
    amountNpr: { type: Number, min: 0, required: true },
    paidAmountNpr: { type: Number, min: 0, default: 0 },
    waivedAmountNpr: { type: Number, min: 0, default: 0 },
    reason: { type: String, trim: true, required: true },
    status: { type: String, enum: ["Outstanding", "Partially Paid", "Paid", "Waived"], default: "Outstanding", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    history: [{
      _id: false,
      action: { type: String, required: true },
      amountNpr: { type: Number, default: null },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      at: { type: Date, default: Date.now },
      reason: { type: String, default: "" },
    }],
  },
  { timestamps: true },
);
LibraryFineSchema.index({ loan: 1, type: 1 }, { unique: true, partialFilterExpression: { loan: { $type: "objectId" } } });
export const LibraryFine = mongoose.model("LibraryFine", LibraryFineSchema);

const LibraryFinePaymentSchema = new mongoose.Schema(
  {
    fine: { type: mongoose.Schema.Types.ObjectId, ref: "LibraryFine", required: true, index: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amountNpr: { type: Number, min: 0.01, required: true },
    method: { type: String, enum: ["Cash", "Bank Transfer", "Gateway Confirmed", "Other"], required: true },
    reference: { type: String, trim: true, default: "" },
    receiptNumber: { type: String, required: true, unique: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    paymentDate: { type: Date, default: Date.now },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);
export const LibraryFinePayment = mongoose.model("LibraryFinePayment", LibraryFinePaymentSchema);

const LibraryPolicySchema = new mongoose.Schema(
  {
    borrowerCategory: { type: String, required: true, unique: true, trim: true },
    maxBooks: { type: Number, min: 0, required: true },
    loanDays: { type: Number, min: 1, required: true },
    renewalLimit: { type: Number, min: 0, default: 0 },
    gracePeriodDays: { type: Number, min: 0, default: 0 },
    finePerDayNpr: { type: Number, min: 0, default: 0 },
    maxFineNpr: { type: Number, min: 0, default: 0 },
    damagedBookFineNpr: { type: Number, min: 0, default: 0 },
    lostBookFineNpr: { type: Number, min: 0, default: 0 },
    reservationAllowed: { type: Boolean, default: true },
    borrowingBlockedWithOutstandingFine: { type: Boolean, default: true },
    maxOutstandingFineNpr: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);
export const LibraryPolicy = mongoose.model("LibraryPolicy", LibraryPolicySchema);
