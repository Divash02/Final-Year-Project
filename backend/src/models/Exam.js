import mongoose from "mongoose";

const ExamRoomAssignmentSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
    building: { type: String, default: "Block A", trim: true },
    roomNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, default: 40 },
    assignedCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const ExamInvigilatorAssignmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    role: { type: String, default: "Invigilator", trim: true },
    room: { type: String, default: "", trim: true },
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["ASSIGNED", "CONFIRMED", "DECLINED"],
      default: "ASSIGNED",
    },
  },
  { _id: false }
);

const CandidateSnapshotSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    studentUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentId: { type: String, required: true, trim: true },
    rollNumber: { type: String, trim: true },
    fullName: { type: String, required: true, trim: true },
    program: { type: String, trim: true },
    semester: { type: Number, required: true },
    section: { type: String, trim: true, default: "A" },
    attendancePercentage: { type: Number, default: 100 },
    isEligible: { type: Boolean, default: true },
    eligibilityReason: { type: String, default: "Eligible for Examination" },
  },
  { _id: false }
);

const ExamSubjectSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    totalMarks: { type: Number, default: 100 },
    passMarks: { type: Number, default: 40 },
    credits: { type: Number, default: 3 },
  },
  { _id: false }
);

const ExamSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    examCode: { type: String, trim: true, index: true },
    examType: {
      type: String,
      enum: ["MID_TERM", "FINAL", "PRACTICAL", "UNIT_TEST", "SUPPLEMENTARY"],
      default: "FINAL",
    },
    academicYear: { type: String, default: "2083/84", trim: true },
    program: { type: String, default: "BCA", trim: true },
    semester: { type: Number, required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    subjects: [ExamSubjectSchema],
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
    instructions: { type: String, default: "" },

    // Date & Time
    examDate: { type: String, required: true, index: true }, // "YYYY-MM-DD" Gregorian
    nepaliDate: { type: String, default: "", trim: true }, // e.g. "29 Ashwin 2083"
    startTime: { type: String, required: true }, // "10:00"
    endTime: { type: String, required: true }, // "12:00"
    durationMinutes: { type: Number, default: 120 },
    durationHours: { type: Number, default: 2.0 },
    startDateTime: { type: Date, index: true },
    endDateTime: { type: Date, index: true },

    // Rooms & Venues
    room: { type: String, default: "Block A · Room 204" },
    rooms: [ExamRoomAssignmentSchema],

    // Faculty & Invigilators
    assignedFaculty: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    invigilators: [ExamInvigilatorAssignmentSchema],

    // Lifecycle
    status: {
      type: String,
      enum: [
        "DRAFT",
        "SCHEDULED",
        "PUBLISHED",
        "RESCHEDULED",
        "CANCELLED",
        "IN_PROGRESS",
        "COMPLETED",
      ],
      default: "DRAFT",
      index: true,
    },
    cancellationReason: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rescheduledFrom: {
      examDate: String,
      nepaliDate: String,
      startTime: String,
      endTime: String,
      room: String,
      reason: String,
      rescheduledAt: Date,
      rescheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },

    // Candidate Snapshot & Counts
    candidateCount: { type: Number, default: 0 },
    candidateSnapshot: [CandidateSnapshotSchema],

    // Assessment & Results
    totalMarks: { type: Number, default: 100 },
    passMarks: { type: Number, default: 40 },
    resultsStatus: {
      type: String,
      enum: ["DRAFT", "UNDER_EVALUATION", "VERIFIED", "PUBLISHED"],
      default: "DRAFT",
    },

    // Publishing metadata
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    noticeId: { type: mongoose.Schema.Types.ObjectId, ref: "Notice", default: null },

    // Reminders & channels
    reminderSettings: {
      onPublication: { type: Boolean, default: true },
      sevenDays: { type: Boolean, default: true },
      threeDays: { type: Boolean, default: true },
      oneDay: { type: Boolean, default: true },
      twoHours: { type: Boolean, default: true },
      channels: {
        inApp: { type: Boolean, default: true },
        noticeCenter: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
      },
    },
    remindersSent: [
      {
        type: { type: String },
        sentAt: { type: Date, default: Date.now },
        recipientCount: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

ExamSchema.index({ examDate: 1, startTime: 1 });
ExamSchema.index({ status: 1, startDateTime: 1 });

export const Exam = mongoose.model("Exam", ExamSchema);
