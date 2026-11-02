import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    collegeEmail: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    middleName: {
      type: String,
      trim: true,
      default: null,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    personalEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    emergencyContact: {
      type: String,
      trim: true,
      default: null,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    emailSignature: {
      type: String,
      default: null,
    },
    signatureImageUrl: {
      type: String,
      default: null,
    },
    roles: {
      type: [String],
      default: ["student"],
      index: true,
    },
    activeRole: {
      type: String,
      default: "student",
    },
    accountStatus: {
      type: String,
      enum: ["PASSIVE", "ACTIVE", "SUSPENDED", "DISABLED", "ARCHIVED"],
      default: "PASSIVE",
    },
    passwordStatus: {
      type: String,
      enum: ["TEMPORARY", "PERMANENT"],
      default: "TEMPORARY",
    },
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
    credentialExpiresAt: {
      type: Date,
      default: null,
    },
    firstLoginAt: {
      type: Date,
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    lastPasswordChangedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

UserSchema.virtual("name").get(function () {
  return [this.firstName, this.middleName, this.lastName]
    .filter(Boolean)
    .join(" ");
});

export const User = mongoose.model("User", UserSchema);
