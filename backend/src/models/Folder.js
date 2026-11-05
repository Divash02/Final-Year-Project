import mongoose from "mongoose";
const FolderSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  department: { type: String, default: "", trim: true },
  archived: { type: Boolean, default: false },
}, { timestamps: true });
export const Folder = mongoose.model("Folder", FolderSchema);