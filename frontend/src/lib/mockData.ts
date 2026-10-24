import {
  Tenant,
  Program,
  Batch,
  Section,
  Course,
  Student,
  AttendanceSession,
  TimetableSlot,
  Assignment,
  Submission,
  Invoice,
  Payment,
  WorkflowRequest,
  NotificationItem,
  LibraryItem,
  BorrowRecord,
  RiskAnalysis,
  AnomalyAlert,
} from "../types";

/**
 * CollegeOS Clean Database Initialization
 * Zero hardcoded institutional data, zero fake students, zero fake staff, zero fake courses.
 * All collections start in a verified clean state.
 */

export const INITIAL_TENANTS: Tenant[] = [
  {
    id: "tenant-1",
    slug: "institution",
    name: "Institutional Workspace",
    nameNe: "संस्थागत कार्यक्षेत्र",
    code: "INST",
    type: "UNIVERSITY",
    status: "ACTIVE",
    config: {
      defaultLanguage: "en",
      defaultCalendar: "BS",
      defaultCurrency: "NPR",
      timezone: "Asia/Kathmandu",
      academicYearStartBS: "2081-01-01",
      features: {
        admissions: true,
        onlinePayment: true,
        library: true,
        facilities: true,
        plagiarismDetection: true,
        aiAssistant: true,
      },
    },
  },
];

export const INITIAL_PROGRAMS: Program[] = [];
export const INITIAL_BATCHES: Batch[] = [];
export const INITIAL_SECTIONS: Section[] = [];
export const INITIAL_COURSES: Course[] = [];
export const INITIAL_STUDENTS: Student[] = [];
export const INITIAL_TIMETABLE: TimetableSlot[] = [];
export const INITIAL_ATTENDANCE_SESSION: AttendanceSession | null = null;
export const INITIAL_ASSIGNMENTS: Assignment[] = [];
export const INITIAL_SUBMISSIONS: Submission[] = [];
export const INITIAL_INVOICES: Invoice[] = [];
export const INITIAL_PAYMENTS: Payment[] = [];
export const INITIAL_REQUESTS: WorkflowRequest[] = [];
export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];
export const INITIAL_LIBRARY_ITEMS: LibraryItem[] = [];
export const INITIAL_BORROW_RECORDS: BorrowRecord[] = [];
export const INITIAL_RISK_ANALYSIS: RiskAnalysis[] = [];
export const INITIAL_ANOMALIES: AnomalyAlert[] = [];
