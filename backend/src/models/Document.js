import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null, index: true },
    category: {
      type: String,
      enum: ["TRANSCRIPT", "CHARACTER_CERTIFICATE", "ADMISSION_FORM", "FEE_RECEIPT", "ID_CARD", "GENERAL"],
      default: "GENERAL",
    },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Document = mongoose.model("Document", DocumentSchema);
