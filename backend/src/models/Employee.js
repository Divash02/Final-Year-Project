import mongoose from "mongoose";

const EmployeeSchema = new mongoose.Schema(
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
      enum: ["faculty", "staff", "teaching", "non-teaching"],
      default: "staff",
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    designation: {
      type: String,
      trim: true,
      default: "Staff",
    },
    employmentType: {
      type: String,
      enum: ["permanent", "contract", "temporary", "probation", "part-time"],
      default: "permanent",
    },
    employmentStatus: {
      type: String,
      enum: ["active", "inactive", "on-leave", "terminated", "retired"],
      default: "active",
    },
    campus: {
      type: String,
      trim: true,
      default: "Main Campus",
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    reportingManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    contractInfo: {
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null },
      contractType: { type: String, default: null },
      terms: { type: String, default: null },
    },
    qualification: {
      type: String,
      trim: true,
      default: null,
    },
    experience: {
      type: String,
      trim: true,
      default: null,
    },
    emergencyContact: {
      name: { type: String, trim: true, default: null },
      relation: { type: String, trim: true, default: null },
      phone: { type: String, trim: true, default: null },
    },
    documents: [
      {
        name: String,
        type: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

export const Employee = mongoose.model("Employee", EmployeeSchema);
