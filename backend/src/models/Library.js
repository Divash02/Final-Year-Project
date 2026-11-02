import mongoose from 'mongoose';

const LibraryBookSchema = new mongoose.Schema(
  {
    isbn: { type: String, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    author: { type: String, trim: true, default: '' },
    publisher: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: '' },
    edition: { type: String, trim: true, default: '' },
    publicationYear: { type: Number },
    totalCopies: { type: Number, default: 0 },
    availableCopies: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const LibraryBook = mongoose.model('LibraryBook', LibraryBookSchema);

const LibraryLoanSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryBook', required: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    returnDate: { type: Date, default: null },
    status: { type: String, enum: ['issued', 'returned', 'overdue'], default: 'issued' },
  },
  { timestamps: true }
);

export const LibraryLoan = mongoose.model('LibraryLoan', LibraryLoanSchema);
