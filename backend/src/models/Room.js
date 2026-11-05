import mongoose from "mongoose";

const RoomSchema = new mongoose.Schema(
  {
    building: {
      type: String,
      required: true,
      trim: true,
      default: "Block A",
    },
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      default: null,
      index: true,
    },
    block: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    floor: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    roomNumber: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    roomType: {
      type: String,
      enum: [
        "Classroom",
        "Laboratory",
        "Office",
        "Seminar Hall",
        "Conference Room",
        "Storage",
        "Library",
        "Other",
      ],
      default: "Classroom",
    },
    capacity: {
      type: Number,
      required: true,
      default: 40,
    },
    campus: {
      type: String,
      default: "Main Campus",
      trim: true,
    },
    facilities: [
      {
        type: String,
        trim: true,
      },
    ],
    status: {
      type: String,
      enum: ["Available", "Occupied", "Reserved", "Maintenance", "Unavailable", "Ready"],
      default: "Available",
      index: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
    },
    openingTime: { type: String, default: "08:00" },
    closingTime: { type: String, default: "18:00" },
    isActive: {
      type: Boolean,
      default: true,
    },
    bookingLockId: { type: String, default: null },
    bookingLockAt: { type: Date, default: null },
  },
  { timestamps: true }
);

RoomSchema.index({ building: 1, roomNumber: 1, campus: 1 }, { unique: true });
RoomSchema.index({ buildingId: 1, code: 1 });

export const Room = mongoose.model("Room", RoomSchema);
