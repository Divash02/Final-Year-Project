import mongoose from "mongoose";

const SectionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    program: { type: String, required: true, trim: true },
    semester: { type: Number, required: true },
    batch: { type: String, default: "2025", trim: true },
    capacity: { type: Number, default: 40 },
    room: { type: String, default: "Hall 101" },
  },
  { timestamps: true }
);

SectionSchema.index({ code: 1, program: 1, semester: 1, batch: 1 }, { unique: true });

export const Section = mongoose.model("Section", SectionSchema);
