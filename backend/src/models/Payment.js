import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true, index: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    studentUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    method: {
      type: String,
      enum: ["esewa", "khalti", "connectips", "cash", "bank_transfer", "stripe"],
      default: "esewa",
    },
    transactionId: { type: String, default: null },
    status: { type: String, enum: ["SUCCESS", "FAILED", "REFUNDED"], default: "SUCCESS" },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    remarks: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Payment = mongoose.model("Payment", PaymentSchema);
