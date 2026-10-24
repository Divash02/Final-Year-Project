import mongoose from "mongoose";

/**
 * Central record for every stored binary.
 *
 * Calendar attachments, learning materials, assignment submissions and
 * institutional documents all resolve to one `StoredFile` document, so the
 * original filename, the stored reference, the verified MIME type, the size,
 * the uploader and the owning record are tracked in exactly one place. Domain
 * records keep a `file` subdocument with the same identifiers so a list view
 * never needs a second query to render "PDF · 1.4 MB".
 */
const StoredFileSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      required: true,
      enum: [
      "academic_calendar",
      "academic_calendar_document",
      "learning_material",
      "assignment_submission",
      "document",
      "avatar",
      "notice_attachment",
      ],
      index: true,
    },
    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true },
    /** Path relative to `backend/uploads`, e.g. `learning-material/2026-10/uuid.pdf`. */
    storagePath: { type: String, required: true },
    mimeType: { type: String, required: true, trim: true },
    extension: { type: String, required: true, lowercase: true, trim: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    /** Set when the declared type was confirmed against the file's magic bytes. */
    verifiedSignature: { type: Boolean, default: false },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    relatedType: { type: String, default: null, trim: true },
    relatedId: { type: String, default: null, index: true },
    downloadCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["STORED", "DELETED"],
      default: "STORED",
      index: true,
    },
    deletedAt: { type: Date, default: null },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

StoredFileSchema.index({ relatedType: 1, relatedId: 1 });

export const StoredFile = mongoose.model("StoredFile", StoredFileSchema);

/**
 * File summary embedded in domain records (calendar events, materials,
 * submissions). Kept in sync with the authoritative `StoredFile` row.
 */
export const FileReferenceSchema = new mongoose.Schema(
  {
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile", required: true },
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    extension: { type: String, required: true, trim: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);
