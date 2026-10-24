import mongoose from "mongoose";

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    studentUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, default: "Tuition" },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    dueDate: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"],
      default: "PENDING",
      index: true,
    },
  },
  { timestamps: true }
);

export const Invoice = mongoose.model("Invoice", InvoiceSchema);
