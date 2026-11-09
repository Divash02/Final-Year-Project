import mongoose from "mongoose";

const StrokeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    tool: { type: String, enum: ["pen", "marker", "eraser", "text", "rect", "circle", "line"], required: true },
    color: { type: String, default: "#000000", trim: true },
    width: { type: Number, default: 2, min: 1, max: 40 },
    points: [{ x: Number, y: Number }],
    text: { type: String, default: "", trim: true, maxlength: 500 },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    w: { type: Number, default: 0 },
    h: { type: Number, default: 0 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const PageSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true, min: 0 },
    strokes: { type: [StrokeSchema], default: [] },
  },
  { _id: false },
);

const ClassroomBoardSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: "VirtualSession", required: true, unique: true, index: true },
    pages: { type: [PageSchema], default: [{ index: 0, strokes: [] }] },
    currentPage: { type: Number, default: 0, min: 0 },
    zoom: { type: Number, default: 1, min: 0.25, max: 4 },
    panX: { type: Number, default: 0 },
    panY: { type: Number, default: 0 },
    drawingPermission: { type: String, enum: ["teacher", "all"], default: "teacher" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export const ClassroomBoard = mongoose.model("ClassroomBoard", ClassroomBoardSchema);
