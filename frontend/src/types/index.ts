export type Language = "en" | "ne";
export type CalendarType = "BS" | "AD";

export interface NepaliAddress {
  province: string;
  district: string;
  municipality: string;
  ward: number;
  tole: string;
  street?: string;
  houseNumber?: string;
}

export interface BSADDate {
  bs: string; // e.g. "2081-02-15"
  ad: string; // ISO date string e.g. "2024-05-28"
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRoleType;
  roles?: UserRoleType[];
  permissions?: string[];
  tenantId: string;
  campusId?: string;
  mustChangePassword?: boolean;
  avatarUrl?: string;
}

export interface TimelineEvent {
  id: string;
  studentId: string;
  category:
    | "academic"
    | "attendance"
    | "financial"
    | "case"
    | "exam"
    | "system";
  title: string;
  description: string;
  timestamp: string;
  actor: string;
  badge?: string;
}

export interface NextActionItem {
  id: string;
  title: string;
  category: "financial" | "academic" | "document" | "attendance";
  priority: "urgent" | "high" | "normal";
  deadline: string;
  actionUrl: string;
  actionLabel: string;
  impact: string;
}

export interface GraduationPlan {
  totalRequiredCredits: number;
  completedCredits: number;
  inProgressCredits: number;
  remainingCredits: number;
  prerequisitesMet: boolean;
  unmetPrerequisites: string[];
  expectedGraduationBS: string;
  standing: "GOOD" | "PROBATION" | "AT_RISK";
}

export type UserRoleType =
  | "super_admin"
  | "campus_admin"
  | "dean"
  | "hod"
  | "program_coordinator"
  | "registrar"
  | "exam_officer"
  | "finance_officer"
  | "faculty"
  | "student"
  | "parent";

export type ExamCandidateScope =
  | "COURSE_SPECIFIC"
  | "SEMESTER_WIDE"
  | "PROGRAM_WIDE"
  | "SECTION_SPECIFIC"
  | "BATCH_SPECIFIC"
  | "CUSTOM";

export type ExamStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHED"
  | "RESCHEDULED"
  | "CANCELLED"
  | "IN_PROGRESS"
  | "COMPLETED";

export interface ExamCountdown {
  state:
    | "UPCOMING"
    | "REMINDER"
    | "WARNING"
    | "IMPORTANT"
    | "URGENT"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELLED"
    | "DRAFT"
    | "SCHEDULED";
  label: string;
  subLabel?: string;
  badgeClass:
    | "upcoming"
    | "reminder"
    | "warning"
    | "important"
    | "urgent"
    | "neutral"
    | "danger";
  isPast?: boolean;
  isInProgress?: boolean;
}

export interface ExamRoomAssignment {
  room?: string;
  building: string;
  roomNumber: string;
  name: string;
  capacity: number;
  assignedCount?: number;
}

export interface ExamInvigilatorAssignment {
  user: string;
  name: string;
  email?: string;
  role?: string;
  room?: string;
  status?: "ASSIGNED" | "CONFIRMED" | "DECLINED";
}

export interface CandidateSnapshotItem {
  student: string;
  studentUser: string;
  studentId: string;
  rollNumber?: string;
  fullName: string;
  program: string;
  semester: number;
  section: string;
  attendancePercentage: number;
  isEligible: boolean;
  eligibilityReason?: string;
  batch?: string;
}

export interface FullExamRecord {
  id: string;
  _id?: string;
  examCode: string;
  name?: string;
  title: string;
  examType: "MID_TERM" | "FINAL" | "PRACTICAL" | "UNIT_TEST" | "SUPPLEMENTARY";
  academicYear: string;
  program: string;
  semester: number;
  course_id?: string;
  course_code?: string;
  course_name?: string;
  section_code?: string;
  batch?: string;
  candidateScope: ExamCandidateScope;
  candidateCount: number;
  candidateSnapshot?: CandidateSnapshotItem[];
  examDate: string;
  nepaliDate: string;
  startTime: string;
  endTime: string;
  scheduled_at?: string;
  durationMinutes: number;
  durationHours: number;
  room: string;
  rooms: ExamRoomAssignment[];
  invigilators: ExamInvigilatorAssignment[];
  status: ExamStatus;
  resultsStatus: "DRAFT" | "UNDER_EVALUATION" | "VERIFIED" | "PUBLISHED";
  results_status?: string;
  instructions?: string;
  publishedAt?: string;
  noticeId?: string;
  rescheduledFrom?: {
    examDate: string;
    nepaliDate?: string;
    startTime: string;
    endTime: string;
    room: string;
    reason: string;
    rescheduledAt: string;
  };
  cancellationReason?: string;
  countdown?: ExamCountdown;
  userRoleInExam?: string;
  facultyRole?: string;
}


export type ExamResultWorkflowStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_VERIFICATION"
  | "VERIFIED"
  | "FINALIZED"
  | "PUBLISHED"
  | "CORRECTION_REQUIRED"
  | "REVISED";

export interface ExamResultData {
  id: string;
  student_id: string;
  student_name: string;
  roll_number: string;
  section: string;
  program: string;
  semester: number;
  batch: string;
  course_code: string;
  course_name: string;
  credits?: number;
  marks: number;
  percentage: number;
  full_marks: number;
  pass_marks: number;
  grade: string;
  grade_point: number;
  gpa: number;
  status: "PASSED" | "FAILED" | "ABSENT" | "WITHHELD";
  workflow_status: ExamResultWorkflowStatus;
  remarks: string;
  submitted_at: string | null;
  verified_at: string | null;
  finalized_at: string | null;
  published_at: string | null;
}

export interface MarksheetData {
  exam: {
    title: string;
    exam_code: string;
    exam_type: string;
    academic_year: string;
    program: string;
    semester: number;
    total_marks: number;
    pass_marks: number;
    results_status: string;
    published_at: string | null;
    assigned_faculty?: string[];
  };
  results: ExamResultData[];
  gpa: string;
  total_results: number;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  nameNe: string;
  code: string;
  type: "UNIVERSITY" | "COLLEGE" | "INSTITUTE" | "SCHOOL";
  status: "ACTIVE" | "SUSPENDED";
  config: {
    defaultLanguage: Language;
    defaultCalendar: CalendarType;
    defaultCurrency: "NPR";
    timezone: string;
    academicYearStartBS: string;
    features: {
      admissions: boolean;
      onlinePayment: boolean;
      library: boolean;
      facilities: boolean;
      plagiarismDetection: boolean;
      aiAssistant: boolean;
    };
  };
}

export interface Campus {
  id: string;
  tenantId: string;
  name: string;
  nameNe: string;
  code: string;
  slug: string;
  address: NepaliAddress;
  phone: string;
  email: string;
  status: "ACTIVE" | "INACTIVE";
  workingDays: number[]; // 0=Sunday, 5=Friday
}

export interface Program {
  id: string;
  tenantId: string;
  departmentId: string;
  campusIds: string[];
  name: string;
  nameNe: string;
  code: string;
  degreeType: "bachelor" | "master" | "diploma" | "phd";
  durationYears: number;
  durationSemesters: number;
  totalCredits: number;
  status: "ACTIVE" | "DRAFT";
}

export interface Batch {
  id: string;
  tenantId: string;
  programId: string;
  campusId: string;
  name: string;
  nameNe: string;
  code: string; // e.g. "2081"
  status: "ACTIVE" | "GRADUATED";
}

export interface Section {
  id: string;
  tenantId: string;
  batchId: string;
  name: string;
  code: string;
  capacity: number;
  currentCount: number;
}

export interface Course {
  id: string;
  tenantId: string;
  departmentId: string;
  code: string;
  name: string;
  nameNe: string;
  credits: number;
  type: "theory" | "practical" | "both";
  lectureHours: number;
  labHours: number;
  prerequisites?: string[];
}

export interface CourseOffering {
  id: string;
  tenantId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  termId: string;
  campusId: string;
  sectionCodes: string[];
  facultyId: string;
  facultyName: string;
  status: "ACTIVE" | "COMPLETED";
}

export type StudentStatus =
  | "ADMITTED"
  | "ACTIVE"
  | "ON_LEAVE"
  | "SUSPENDED"
  | "WITHDRAWN"
  | "GRADUATED"
  | "ALUMNI";

export interface Student {
  id: string;
  tenantId: string;
  campusId: string;
  studentId: string; // e.g. "TU-2081-BScIT-001"
  userId: string;
  firstName: string;
  firstNameNe: string;
  lastName: string;
  lastNameNe: string;
  email: string;
  phone: string;
  dateOfBirth: BSADDate;
  gender: "male" | "female" | "other";
  bloodGroup: string;
  citizenshipNumber: string;
  address: NepaliAddress;
  guardian: {
    fatherName: string;
    fatherNameNe: string;
    fatherPhone: string;
    motherName: string;
    motherNameNe: string;
    motherPhone: string;
  };
  programId: string;
  programCode: string;
  batchId: string;
  sectionId: string;
  sectionCode: string;
  currentSemester: number;
  status: StudentStatus;
  enrollmentDate: BSADDate;
  avatarUrl: string;
  gpa: number;
  cgpa: number;
  attendancePercentage: number;
  feeBalanceDue: number;
}

export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "LATE"
  | "EXCUSED"
  | "MEDICAL"
  | "BUNK";

export interface AttendanceRecord {
  id: string;
  tenantId: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  institutionalId: string;
  status: AttendanceStatus;
  remarks?: string;
}

export interface AttendanceSession {
  id: string;
  tenantId: string;
  campusId: string;
  courseOfferingId: string;
  courseCode: string;
  courseName: string;
  sectionCode: string;
  date: BSADDate;
  startTime: string;
  endTime: string;
  roomId: string;
  roomName: string;
  facultyId: string;
  facultyName: string;
  topic: string;
  remarks?: string;
  status: "DRAFT" | "SUBMITTED" | "LOCKED";
  totalStudents: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  records: AttendanceRecord[];
}

export interface TimetableSlot {
  id: string;
  tenantId: string;
  campusId: string;
  dayOfWeek: number; // 0=Sunday, 5=Friday
  startTime: string; // "10:00"
  endTime: string; // "11:00"
  courseCode: string;
  courseName: string;
  sectionCode: string;
  facultyId: string;
  facultyName: string;
  roomId: string;
  roomName: string;
  type: "lecture" | "lab" | "tutorial";
}

export interface Assignment {
  id: string;
  tenantId: string;
  courseOfferingId: string;
  courseCode: string;
  courseName: string;
  sectionCodes: string[];
  title: string;
  titleNe?: string;
  description: string;
  dueDate: BSADDate;
  totalMarks: number;
  passingMarks: number;
  status: "PUBLISHED" | "DRAFT" | "CLOSED";
  allowLate: boolean;
  checkPlagiarism: boolean;
}

export interface Submission {
  id: string;
  tenantId: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  submittedAt: BSADDate;
  isLate: boolean;
  status: "SUBMITTED" | "GRADED";
  fileName: string;
  fileSize: string;
  // Plagiarism & AI
  similarityPercentage?: number;
  matchedSources?: { source: string; percentage: number }[]; // teacher-only
  aiDetectionScore?: number; // teacher-only
  aiDetectionVerdict?: string; // teacher-only
  teacherNotes?: string; // teacher-only
  // Grading
  marksObtained?: number;
  feedback?: string;
  gradedBy?: string;
}

export interface Exam {
  id: string;
  tenantId: string;
  name: string;
  nameNe: string;
  termId: string;
  academicYearBS: string;
  startDate: BSADDate;
  endDate: BSADDate;
  status:
    | "SCHEDULED"
    | "IN_PROGRESS"
    | "MARKS_ENTRY"
    | "MODERATION"
    | "PUBLISHED";
}

export interface MarkEntry {
  id: string;
  tenantId: string;
  examId: string;
  courseCode: string;
  courseName: string;
  studentId: string;
  studentName: string;
  internalMarks: number; // Max 40
  externalMarks: number; // Max 60
  totalMarks: number; // Max 100
  letterGrade: string;
  gradePoint: number;
  isPassed: boolean;
  moderated: boolean;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  descriptionNe: string;
  category: "tuition" | "lab" | "library" | "exam" | "development";
  amount: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  campusId: string;
  studentId: string;
  studentName: string;
  invoiceNumber: string; // e.g. "INV-2081-001234"
  termName: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  issueDate: BSADDate;
  dueDate: BSADDate;
  status: "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";
}

export interface Payment {
  id: string;
  tenantId: string;
  invoiceId: string;
  studentId: string;
  studentName: string;
  paymentNumber: string;
  amount: number;
  method:
    | "esewa"
    | "khalti"
    | "stripe"
    | "connectips"
    | "bank_transfer"
    | "cash";
  gatewayTransactionId?: string;
  status: "CONFIRMED" | "FAILED" | "PENDING";
  confirmedAt: BSADDate;
  receiptNumber: string;
  amountInWordsNe: string;
}

export interface WorkflowRequest {
  id: string;
  tenantId: string;
  campusId: string;
  requestNumber: string; // e.g. "REQ-2081-00456"
  typeCode:
    | "LEAVE"
    | "FEE_ISSUE"
    | "DOC_REQUEST"
    | "COURSE_TRANSFER"
    | "MAINTENANCE";
  title: string;
  titleNe: string;
  requesterId: string;
  requesterName: string;
  requesterRole: UserRoleType;
  status:
    | "SUBMITTED"
    | "IN_REVIEW"
    | "INFO_REQUESTED"
    | "APPROVED"
    | "REJECTED";
  priority: "low" | "medium" | "high" | "urgent";
  currentAssigneeName: string;
  currentAssigneeRole: string;
  slaDeadline: string; // time string
  slaBreached: boolean;
  formData: Record<string, string>;
  history: {
    action: string;
    actor: string;
    timestamp: string;
    comment: string;
  }[];
}

export interface NotificationItem {
  id: string;
  tenantId: string;
  userId?: string;
  title: string;
  titleNe: string;
  message: string;
  category?: "academic" | "financial" | "administrative" | "alert";
  priority?: "normal" | "high" | "urgent";
  createdAt: BSADDate;
  read: boolean;
  actionUrl?: string;
  channels?: {
    inApp: boolean;
    sms: boolean;
    email: boolean;
  };
}

export interface LibraryItem {
  id: string;
  tenantId: string;
  campusId?: string;
  title: string;
  titleNe: string;
  authors: string[];
  isbn: string;
  category: string;
  totalCopies: number;
  availableCopies: number;
  location: string;
  dailyFineNPR: number;
}

export interface BorrowRecord {
  id: string;
  tenantId: string;
  bookId: string;
  bookTitle: string;
  studentId: string;
  studentName: string;
  borrowDate: BSADDate;
  dueDate: BSADDate;
  returnDate?: BSADDate;
  status: "BORROWED" | "OVERDUE" | "RETURNED";
  fineAmountNPR: number;
  finePaid: boolean;
}

export interface RiskAnalysis {
  studentId: string;
  studentName: string;
  programCode: string;
  riskScore: number; // 0-100
  riskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  factors: string[];
  recommendation: string;
}

export interface AnomalyAlert {
  id: string;
  type: "attendance" | "grading" | "financial" | "access";
  title: string;
  description: string;
  severity: "warning" | "critical";
  timestamp: string;
}

/* ------------------------------------------------------------------ */
/* Exam Venue & Automatic Seating                                    */
/* ------------------------------------------------------------------ */

export interface ExamVenue {
  id: string;
  _id: string;
  block: string;
  building: string;
  floor: string;
  roomName: string;
  roomNumber: string;
  name: string;
  capacity: number;
  isActive: boolean;
  facilities: string[];
}

export interface ExamVenueStructure {
  block: string;
  floors: {
    floor: string;
    rooms: ExamVenue[];
  }[];
}

export interface SeatingPlanStats {
  eligibleCount: number;
  totalCapacity: number;
  allocatedCount: number;
  unallocatedCount: number;
  remainingSeats: number;
  requiredAdditionalCapacity: number;
  conflicts: {
    source: string;
    referenceId: string;
    title: string;
    rooms: string[];
    examDate: string;
    startTime: string;
    endTime: string;
  }[];
  sectionBreakdown?: Record<string, number>;
}

export interface SeatingAssignmentItem {
  studentId: string;
  rollNumber: string;
  fullName: string;
  program: string;
  semester: number;
  section: string;
  benchNumber: number;
  seatNumber: number;
  isEligible: boolean;
  eligibilityReason: string;
}

export interface SeatingRoomSummary {
  room: string | null;
  name: string;
  building: string;
  roomNumber: string;
  capacity: number;
  benchCount: number;
  assignedCount: number;
  remainingSeats: number;
  seatAssignments: SeatingAssignmentItem[];
}

export interface SeatingPlanDetail {
  plan: {
    id: string;
    _id: string;
    exam: string | null;
    examCode: string;
    title: string;
    academicYear: string;
    program: string;
    semester: number;
    course: string | null;
    candidateScope: string;
    sectionCode: string;
    batch: string;
    examDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    status: "DRAFT" | "GENERATED" | "SCHEDULED" | "PUBLISHED" | "CANCELLED";
    totalEligibleStudents: number;
    totalAllocatedSeats: number;
    totalUnallocatedStudents: number;
    requiredAdditionalCapacity: number;
    generatedAt: string | null;
    generatedBy: string | null;
    publishedAt: string | null;
    publishedBy: string | null;
    scheduledPublishAt: string | null;
    scheduledPublishTimezone: string | null;
    cancelledAt: string | null;
    cancelledBy: string | null;
    cancellationReason: string | null;
    shuffleSeed: number | null;
    lastShuffledAt: string | null;
    revisionReason: string | null;
    createdAt: string;
    updatedAt: string;
  };
  roomSummaries: SeatingRoomSummary[];
  totals: {
    eligibleCount: number;
    totalCapacity: number;
    allocatedCount: number;
    unallocatedCount: number;
    remainingSeats: number;
    requiredAdditionalCapacity: number;
  };
}

export interface SeatingPlanListItem {
  id: string;
  _id: string;
  exam: string | null;
  examCode: string;
  title: string;
  program: string;
  semester: number;
  examDate: string;
  startTime: string;
  endTime: string;
  status: string;
  totalEligibleStudents: number;
  totalAllocatedSeats: number;
  totalUnallocatedStudents: number;
  requiredAdditionalCapacity: number;
  roomCount: number;
  publishedAt: string | null;
  scheduledPublishAt: string | null;
  scheduledPublishTimezone: string | null;
  generatedAt: string | null;
}

export interface StudentSeatingAssignment {
  planId: string;
  examId: string;
  examTitle: string;
  examCode: string;
  examDate: string;
  startTime: string;
  endTime: string;
  academicYear: string;
  program: string;
  semester: number;
  studentId: string;
  rollNumber: string;
  fullName: string;
  section: string;
  block: string;
  floor: string;
  room: string;
  roomNumber: string;
  benchNumber: number;
  seatNumber: number;
  publishedAt: string | null;
}
