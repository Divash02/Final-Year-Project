import mongoose from "mongoose";

const ProgramSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    durationYears: { type: Number, default: 4 },
    totalSemesters: { type: Number, default: 8 },
  },
  { timestamps: true }
);

export const Program = mongoose.model("Program", ProgramSchema);
