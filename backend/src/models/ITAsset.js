import mongoose from "mongoose";

/**
 * IT Asset Inventory Model
 *
 * Replaces physical IoT/Smart Campus hardware with genuine institutional
 * IT inventory records: computers, lab workstations, faculty laptops,
 * servers, networking switches, access points and peripheral equipment.
 */
export const ASSET_CATEGORIES = [
  "WORKSTATION",
  "LAPTOP",
  "SERVER",
  "NETWORK_SWITCH",
  "ROUTER",
  "ACCESS_POINT",
  "PRINTER",
  "AV_EQUIPMENT",
];

export const ASSET_STATUSES = [
  "AVAILABLE",
  "ASSIGNED",
  "UNDER_MAINTENANCE",
  "RESERVED",
  "DECOMMISSIONED",
];

const MaintenanceLogSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    serviceType: { type: String, required: true },
    description: { type: String, required: true },
    performedBy: { type: String, default: "IT Staff" },
    costNpr: { type: Number, default: 0 },
    nextDueDate: { type: Date, default: null },
  },
  { _id: false }
);

const ITAssetSchema = new mongoose.Schema(
  {
    assetTag: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ASSET_CATEGORIES,
      required: true,
      index: true,
    },
    brand: { type: String, required: true, trim: true },
    modelNumber: { type: String, default: "", trim: true },
    serialNumber: { type: String, default: "", trim: true },
    specifications: {
      processor: { type: String, default: "" },
      ramGb: { type: Number, default: null },
      storage: { type: String, default: "" },
      operatingSystem: { type: String, default: "" },
      ipAddress: { type: String, default: "" },
      macAddress: { type: String, default: "" },
    },
    status: {
      type: String,
      enum: ASSET_STATUSES,
      default: "AVAILABLE",
      index: true,
    },
    location: {
      building: { type: String, default: "Block A", trim: true },
      room: { type: String, default: "Server Room", trim: true },
      rackOrDesk: { type: String, default: "", trim: true },
    },
    department: { type: String, default: null, trim: true },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedAt: { type: Date, default: null },
    purchaseDate: { type: Date, default: null },
    purchaseCostNpr: { type: Number, default: null },
    warrantyExpiryDate: { type: Date, default: null },
    maintenanceHistory: [MaintenanceLogSchema],
    notes: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

export const ITAsset = mongoose.model("ITAsset", ITAssetSchema);
