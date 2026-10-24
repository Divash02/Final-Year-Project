import mongoose from "mongoose";

const RoomSchema = new mongoose.Schema(
  {
    building: {
      type: String,
      required: true,
      trim: true,
      default: "Block A",
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
    name: {
      type: String,
      required: true,
      trim: true,
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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

RoomSchema.index({ building: 1, roomNumber: 1, campus: 1 }, { unique: true });

export const Room = mongoose.model("Room", RoomSchema);
