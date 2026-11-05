import mongoose from "mongoose";

const BuildingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    campus: { type: String, required: true, trim: true, default: "Main Campus" },
    floors: { type: Number, default: 1, min: 1 },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Under Construction"],
      default: "Active",
    },
    details: { type: String, default: "" },
  },
  { timestamps: true },
);

BuildingSchema.index({ code: 1, campus: 1 }, { unique: true });

export const Building = mongoose.model("Building", BuildingSchema);

const FacilityLabSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      default: null,
      index: true,
    },
    department: { type: String, default: "" },
    laboratoryType: {
      type: String,
      enum: ["Science", "Computer", "Engineering", "Research", "Workshop", "Other"],
      default: "Other",
    },
    capacity: { type: Number, default: 0, min: 0 },
    supervisor: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Active", "Maintenance", "Inactive"],
      default: "Active",
    },
    facilities: [{ type: String, trim: true }],
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

export const FacilityLab = mongoose.model("FacilityLab", FacilityLabSchema);

const ReservationHistorySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    note: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    actor: { type: String, default: "System" },
  },
  { _id: false },
);

const FacilityReservationSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requesterName: { type: String, default: "" },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    startMinutes: { type: Number, default: 0 },
    endMinutes: { type: Number, default: 0 },
    purpose: { type: String, default: "" },
    department: { type: String, default: "" },
    expectedParticipants: { type: Number, min: 1, default: 1 },
    requiredEquipment: [{ type: String, trim: true }],
    bookingType: { type: String, trim: true, default: "Internal Event" },
    supportingDocument: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Cancelled", "Completed"],
      default: "Pending",
      index: true,
    },
    notes: { type: String, default: "" },
    history: [ReservationHistorySchema],
  },
  { timestamps: true },
);

FacilityReservationSchema.index({ roomId: 1, date: 1, startMinutes: 1, endMinutes: 1, status: 1 });

export const FacilityReservation = mongoose.model(
  "FacilityReservation",
  FacilityReservationSchema,
);

const FacilityMaintenanceRequestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      default: null,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      default: null,
      index: true,
    },
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FacilityAsset",
      default: null,
      index: true,
    },
    category: {
      type: String,
      enum: [
        "Electrical",
        "Plumbing",
        "HVAC",
        "Furniture",
        "IT Equipment",
        "Laboratory Equipment",
        "Structural",
        "Cleaning",
        "Other",
      ],
      default: "Other",
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: [
        "Reported",
        "Submitted",
        "Under Review",
        "Assigned",
        "In Progress",
        "Completed",
        "Closed",
      ],
      default: "Reported",
      index: true,
    },
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    assignedTechnician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    reportedDate: { type: Date, default: Date.now },
    notes: { type: String, default: "" },
    workPerformed: { type: String, default: "" },
    completionDetails: { type: String, default: "" },
    history: [ReservationHistorySchema],
  },
  { timestamps: true },
);

export const FacilityMaintenanceRequest = mongoose.model(
  "FacilityMaintenanceRequest",
  FacilityMaintenanceRequestSchema,
);

const FacilityAssetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    tag: { type: String, required: true, trim: true, uppercase: true, unique: true },
    category: { type: String, default: "Other", trim: true },
    description: { type: String, default: "" },
    serialNumber: { type: String, default: "" },
    status: {
      type: String,
      enum: [
        "Registered",
        "Available",
        "Assigned",
        "Under Maintenance",
        "Damaged",
        "Retired",
        "Disposed",
      ],
      default: "Registered",
      index: true,
    },
    condition: { type: String, default: "Good" },
    purchaseDate: { type: Date, default: null },
    purchaseCost: { type: Number, default: null },
    supplier: { type: String, default: "" },
    warrantyInfo: { type: String, default: "" },
    department: { type: String, default: "" },
    assignedEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      default: null,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      default: null,
      index: true,
    },
    quantity: { type: Number, default: 1, min: 0 },
    availableQuantity: { type: Number, default: 1, min: 0 },
    minimumStockLevel: { type: Number, default: 0, min: 0 },
    stockTransactions: [
      {
        type: { type: String, enum: ["Received", "Issued", "Adjusted"], default: "Received" },
        quantity: { type: Number, default: 0 },
        reference: { type: String, default: "" },
        notes: { type: String, default: "" },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

export const FacilityAsset = mongoose.model("FacilityAsset", FacilityAssetSchema);

const TransportVehicleSchema = new mongoose.Schema(
  {
    registrationNumber: { type: String, required: true, unique: true, uppercase: true },
    vehicleType: { type: String, default: "Bus" },
    makeModel: { type: String, default: "" },
    capacity: { type: Number, default: 0, min: 0 },
    registrationDate: { type: Date, default: null },
    insuranceExpiry: { type: Date, default: null },
    status: {
      type: String,
      enum: ["Active", "In Transit", "Maintenance", "Inactive"],
      default: "Active",
      index: true,
    },
    assignedDriver: { type: String, default: "" },
    maintenanceStatus: { type: String, default: "Healthy" },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

export const TransportVehicle = mongoose.model(
  "TransportVehicle",
  TransportVehicleSchema,
);

const TransportRouteSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    startPoint: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    stops: [{ type: String, trim: true }],
    estimatedSchedule: { type: String, default: "" },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransportVehicle",
      default: null,
      index: true,
    },
    assignedDriver: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Planned", "Active", "Suspended"],
      default: "Planned",
      index: true,
    },
  },
  { timestamps: true },
);

export const TransportRoute = mongoose.model("TransportRoute", TransportRouteSchema);
