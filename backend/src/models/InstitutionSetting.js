import mongoose from "mongoose";

const InstitutionSettingSchema = new mongoose.Schema(
  {
    settingKey: { type: String, required: true, unique: true, index: true },
    settingValue: { type: String, required: true },
    updatedByUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export const InstitutionSetting = mongoose.model("InstitutionSetting", InstitutionSettingSchema);
