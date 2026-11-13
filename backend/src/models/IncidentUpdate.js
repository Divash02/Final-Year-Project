import mongoose from "mongoose";

const IncidentUpdateSchema = new mongoose.Schema(
  {
    incident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CampusIncident",
      required: true,
      index: true,
    },
    incidentNumber: { type: String, index: true },
    status: { type: String, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: { type: String, trim: true },
    createdByRole: { type: String, trim: true },
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

IncidentUpdateSchema.index({ incident: 1, createdAt: -1 });
IncidentUpdateSchema.index({ incidentNumber: 1, createdAt: -1 });

export const IncidentUpdate = mongoose.model("IncidentUpdate", IncidentUpdateSchema);
