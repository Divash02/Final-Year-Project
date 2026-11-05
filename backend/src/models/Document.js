import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null, index: true },
    category: {
      type: String,
      enum: ["TRANSCRIPT", "CHARACTER_CERTIFICATE", "ADMISSION_FORM", "FEE_RECEIPT", "ID_CARD", "GENERAL", "POLICY", "ACADEMIC", "HR", "FINANCE", "EXAMINATION"],
      default: "GENERAL",
    },
    folder: { type: String, default: "", trim: true, index: true },
    department: { type: String, default: "", trim: true, index: true },
    academicYear: { type: String, default: "", trim: true },
    documentType: { type: String, default: "GENERAL", trim: true },
    tags: { type: [String], default: [] },
    accessLevel: { type: String, enum: ["public", "department", "restricted", "confidential"], default: "department" },
    approvalStatus: { type: String, enum: ["draft", "pending", "approved", "rejected", "revision_requested"], default: "approved" },
    archived: { type: Boolean, default: false, index: true },
    version: { type: Number, default: 1 },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    file: { type: mongoose.Schema.Types.Mixed, default: null },
    fileSize: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    description: { type: String, default: "", trim: true },
    sharedWith: {
      type: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
          permission: { type: String, enum: ["view", "download"], default: "view" },
          grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
          grantedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    versions: {
      type: [
        {
          version: { type: Number, required: true },
          fileName: { type: String, required: true },
          fileUrl: { type: String, required: true },
          file: { type: mongoose.Schema.Types.Mixed, default: null },
          fileSize: { type: Number, default: 0 },
          uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
          uploadedAt: { type: Date, default: Date.now },
          changeNote: { type: String, default: "", trim: true },
          restoredFrom: { type: Number, default: null },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

DocumentSchema.index({ title: "text", description: "text", tags: "text" });

export const Document = mongoose.model("Document", DocumentSchema);