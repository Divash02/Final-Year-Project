import mongoose from "mongoose";

/**
 * Software License Management Model
 *
 * Tracks campus software licenses, seat allocations, expiration dates
 * and compliance alerts.
 */
const SoftwareLicenseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    vendor: { type: String, required: true, trim: true },
    licenseType: {
      type: String,
      enum: ["SITE_WIDE", "PER_SEAT", "CONCURRENT", "SUBSCRIPTION", "OPEN_SOURCE_ENTERPRISE"],
      default: "PER_SEAT",
    },
    totalSeats: { type: Number, required: true, default: 1 },
    usedSeats: { type: Number, default: 0 },
    licenseKeyMasked: { type: String, default: "XXXX-XXXX-****" },
    expiryDate: { type: Date, default: null },
    department: { type: String, default: "ALL" },
    allocatedUsers: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        assignedAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "OVER_ALLOCATED", "PENDING_RENEWAL"],
      default: "ACTIVE",
    },
    annualCostNpr: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

export const SoftwareLicense = mongoose.model("SoftwareLicense", SoftwareLicenseSchema);
