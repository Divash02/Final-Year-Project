import mongoose from "mongoose";

const StaffSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    roleType: {
      type: String,
      enum: ["faculty", "staff"],
      default: "faculty",
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    designation: {
      type: String,
      trim: true,
      default: "Lecturer",
    },
    campus: {
      type: String,
      trim: true,
      default: "Main Campus",
    },
    qualification: {
      type: String,
      trim: true,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

export const Staff = mongoose.model("Staff", StaffSchema);
