import mongoose from "mongoose";

const SeatAssignmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    studentUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentId: { type: String, required: true, trim: true },
    rollNumber: { type: String, trim: true },
    fullName: { type: String, required: true, trim: true },
    program: { type: String, trim: true },
    semester: { type: Number, required: true },
    section: { type: String, trim: true, default: "A" },
    room: { type: String, required: true, trim: true },
    building: { type: String, required: true, trim: true },
    roomNumber: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true },
    benchNumber: { type: Number, required: true },
    seatNumber: { type: Number, required: true, min: 1, max: 2 },
    isEligible: { type: Boolean, default: true },
    eligibilityReason: { type: String, default: "Eligible for Examination" },
  },
  { _id: false }
);

const RoomAllocationSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    building: { type: String, required: true, trim: true },
    block: { type: String, trim: true, default: "" },
    floor: { type: String, trim: true, default: "" },
    roomNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true },
    benchCount: { type: Number, default: 0 },
    assignedCount: { type: Number, default: 0 },
    seatAssignments: [SeatAssignmentSchema],
  },
  { _id: false }
);

const SeatingPlanAuditSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["CREATED", "GENERATED", "SHUFFLED", "ROOM_CHANGED", "REGENERATED", "RESET_TO_ALPHABETICAL", "PUBLISHED", "SCHEDULED", "CANCELLED"],
      required: true,
    },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    performedAt: { type: Date, default: Date.now },
    details: { type: String, default: "" },
    previousState: { type: mongoose.Schema.Types.Mixed },
    newState: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const ExamSeatingPlanSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    examCode: { type: String, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    academicYear: { type: String, default: "2083/84", trim: true },
    program: { type: String, default: "BScIT", trim: true },
    semester: { type: Number, required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    candidateScope: {
      type: String,
      enum: [
        "COURSE_SPECIFIC",
        "SEMESTER_WIDE",
        "PROGRAM_WIDE",
        "SECTION_SPECIFIC",
        "BATCH_SPECIFIC",
        "CUSTOM",
      ],
      default: "COURSE_SPECIFIC",
    },
    sectionCode: { type: String, default: "ALL", uppercase: true, trim: true },
    batch: { type: String, default: "2025", trim: true },

    examDate: { type: String, required: true, index: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    durationMinutes: { type: Number, default: 120 },

    status: {
      type: String,
      enum: ["DRAFT", "GENERATED", "SCHEDULED", "PUBLISHED", "CANCELLED"],
      default: "DRAFT",
      index: true,
    },

    roomAllocations: [RoomAllocationSchema],

    totalEligibleStudents: { type: Number, default: 0 },
    totalAllocatedSeats: { type: Number, default: 0 },
    totalUnallocatedStudents: { type: Number, default: 0 },
    requiredAdditionalCapacity: { type: Number, default: 0 },

    generatedAt: { type: Date, default: null },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    scheduledPublishAt: { type: Date, default: null, index: true },
    scheduledPublishTimezone: { type: String, default: "Asia/Kathmandu" },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancellationReason: { type: String, default: null },

    auditTrail: [SeatingPlanAuditSchema],

    shuffleSeed: { type: Number, default: null },
    lastShuffledAt: { type: Date, default: null },
    lastShuffledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    revisionReason: { type: String, default: null },
  },
  { timestamps: true }
);

ExamSeatingPlanSchema.index({ exam: 1 }, { unique: true });
ExamSeatingPlanSchema.index({ status: 1, scheduledPublishAt: 1 });
ExamSeatingPlanSchema.index({ program: 1, semester: 1, examDate: 1 });

export const ExamSeatingPlan = mongoose.model("ExamSeatingPlan", ExamSeatingPlanSchema);