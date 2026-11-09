import mongoose from "mongoose";

/**
 * CollegeOS Connect: virtual classroom and institutional meeting sessions.
 *
 * SECURITY / ISOLATION (enforced by services/routes, never the client):
 * - ONLINE_CLASS: visible/joinable only to the resolved academic cohort from
 *   real enrollment records + assigned teacher/co-teachers + authorized admins.
 * - ONLINE_MEETING: visible/joinable only to explicitly invited authorized
 *   staff/organizer/co-hosts/admins. Students must have zero visibility and
 *   zero metadata exposure (never returned in lists/details/search/calendar).
 *
 * Credentials are session-level access (not CollegeOS accounts). Every
 * participant still authenticates via their own CollegeOS identity. Passwords
 * are stored only as hashes; plaintext is returned once at generation time.
 */

export const VIRTUAL_SESSION_TYPES = ["ONLINE_CLASS", "ONLINE_MEETING"];
export const VIRTUAL_SESSION_STATUSES = [
  "SCHEDULED",
  "LIVE",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
];

const ClassTargetSchema = new mongoose.Schema(
  {
    programCodes: [{ type: String, uppercase: true, trim: true }],
    academicYears: [{ type: String, trim: true }],
    semesters: [{ type: Number }],
    batches: [{ type: String, trim: true }],
    sectionCodes: [{ type: String, uppercase: true, trim: true }],
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
  },
  { _id: false },
);

const InvitedUserSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, trim: true, default: "PARTICIPANT" },
    status: { type: String, enum: ["INVITED", "JOINED", "DECLINED"], default: "INVITED" },
    invitedAt: { type: Date, default: Date.now },
    joinedAt: { type: Date, default: null },
  },
  { _id: false },
);

const CredentialSchema = new mongoose.Schema(
  {
    sessionId16: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    encryptedPassword: { type: String, default: null }, // AES-256-CBC encrypted plaintext, admin-only
    issuedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { _id: false },
);

const AuditEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, default: Date.now },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const WaitingRoomRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, trim: true, default: "Participant" },
    studentId: { type: String, trim: true, default: null },
    program: { type: String, trim: true, default: null },
    section: { type: String, trim: true, default: null },
    cameraOn: { type: Boolean, default: false },
    micOn: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "expired"],
      default: "pending",
      index: true,
    },
    requestedAt: { type: Date, default: Date.now, index: true },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false },
);

const AttendanceEntrySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null },
    joinedAt: { type: Date, default: null },
    leftAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    status: { type: String, enum: ["PRESENT", "LATE", "ABSENT"], default: "PRESENT" },
  },
  { _id: false },
);

const VirtualSessionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    sessionType: {
      type: String,
      enum: VIRTUAL_SESSION_TYPES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: VIRTUAL_SESSION_STATUSES,
      default: "SCHEDULED",
      index: true,
    },
    // Scheduling (ISO date string + HH:mm for consistency with existing modules)
    scheduledDate: { type: String, default: null, trim: true, index: true },
    startTime: { type: String, default: null, trim: true },
    endTime: { type: String, default: null, trim: true },
    durationMinutes: { type: Number, default: null, min: 1, max: 1440 },

    // Ownership
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    coHosts: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // ONLINE_CLASS: curriculum course and the assigned teacher (class host) selected by admin.
    // Persisted explicitly so assignments survive refresh and remain queryable; `host` is
    // authoritative for host permissions and must equal the selected assigned teacher.
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null, index: true },
    assignedTeacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

    // ONLINE_CLASS targeting (resolved against real enrollment/academic records)
    classTarget: { type: ClassTargetSchema, default: () => ({}) },
    resolvedStudentUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    resolvedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],

    // ONLINE_MEETING invites (authorized staff only; students never allowed)
    invitedUsers: { type: [InvitedUserSchema], default: [] },

    // Session-level credentials (hashed). Returned in plaintext only once.
    studentCredential: { type: CredentialSchema, default: null },
    teacherCredential: { type: CredentialSchema, default: null },
    meetingCredential: { type: CredentialSchema, default: null }, // meetings can use a shared invite credential
    credentialRevokedAt: { type: Date, default: null, index: true },

    /* Termination metadata for student-facing Completed/Ended unification. */
    endedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    terminationReason: String,
    wasEndedEarly: Boolean,
    actualStartTime: { type: Date, default: null },
    actualEndTime: { type: Date, default: null },

    // Session-level credentials (hashed). Returned in plaintext only once.
    admissionPolicy: {
      type: String,
      enum: ["direct", "approval"],
      default: "direct",
      index: true,
    },
    waitingRoomRequests: { type: [WaitingRoomRequestSchema], default: [] },

    // Runtime / integration hooks
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    roomKey: { type: String, default: null, trim: true }, // maps to SFU/signaling room
    mediaProvider: { type: String, default: null, trim: true },
    mediaRoomId: { type: String, default: null, trim: true },

    // Tracking (phase 3+; stored now for architecture)
    attendance: { type: [AttendanceEntrySchema], default: [] },
    audit: { type: [AuditEntrySchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

VirtualSessionSchema.index({ sessionType: 1, status: 1, scheduledDate: 1 });
VirtualSessionSchema.index({ "studentCredential.sessionId16": 1 }, { sparse: true });
VirtualSessionSchema.index({ "teacherCredential.sessionId16": 1 }, { sparse: true });
VirtualSessionSchema.index({ "meetingCredential.sessionId16": 1 }, { sparse: true });

export const VirtualSession = mongoose.model("VirtualSession", VirtualSessionSchema);
