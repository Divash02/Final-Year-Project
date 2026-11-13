import mongoose from "mongoose";

const IncidentMessageSchema = new mongoose.Schema(
  {
    incident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CampusIncident",
      required: true,
      index: true,
    },
    incidentNumber: { type: String, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderName: { type: String, trim: true },
    senderRole: { type: String, trim: true },
    senderType: { type: String, enum: ["student", "staff"], default: "staff", index: true },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    visibility: {
      type: String,
      enum: ["student", "internal"],
      default: "student",
      index: true,
    },
    attachments: [{
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile", required: true },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      sizeBytes: { type: Number, required: true },
      uploadedAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

IncidentMessageSchema.index({ incident: 1, createdAt: -1 });
IncidentMessageSchema.index({ incidentNumber: 1, createdAt: -1 });

export const IncidentMessage = mongoose.model("IncidentMessage", IncidentMessageSchema);
