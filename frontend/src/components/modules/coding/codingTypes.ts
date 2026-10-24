/**
 * Online Coding Lab type definitions.
 *
 * These mirror the backend Mongoose documents exposed by
 * `backend/src/routes/coding.js`. Identifiers are opaque strings.
 */

export type CodingProjectType = "COMPILER" | "PLAYGROUND";
export type CodingProjectVisibility = "PRIVATE" | "SHARED";
export type ShareType = "COURSE" | "SECTION" | "STUDENTS";
export type SharePermission = "VIEW" | "COPY";
export type AssignmentStatus = "DRAFT" | "OPEN" | "CLOSED";
export type SubmissionStatus = "SUBMITTED" | "LATE" | "GRADED";
export type ExecutionStatus =
  | "QUEUED"
  | "PROCESSING"
  | "ACCEPTED"
  | "FAILED"
  | "TIMEOUT"
  | "PROVIDER_ERROR";

export interface CodingFile {
  name: string;
  language: string | null;
  content: string;
  isMain: boolean;
}

export interface CodingProject {
  id: string;
  ownerUser: string;
  ownerRole: "student" | "faculty";
  title: string;
  description: string;
  projectType: CodingProjectType;
  defaultLanguage: string;
  files: CodingFile[];
  course: string | null;
  sectionCode: string | null;
  visibility: CodingProjectVisibility;
  assignment: string | null;
  copiedFrom: string | null;
  shared: boolean;
  sharePermission: SharePermission | null;
  shareType: ShareType | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CodingShare {
  id: string;
  shareType: ShareType;
  course: string | null;
  sectionCode: string | null;
  studentIds: string[];
  permission: SharePermission;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CodingAssignment {
  id: string;
  title: string;
  description: string;
  instructions: string;
  course: string;
  sectionCodes: string[];
  semester: number | null;
  program: string | null;
  academicYear: string | null;
  allowedLanguages: string[];
  starterFiles: CodingFile[];
  exampleInput: string;
  exampleOutput: string;
  opensAt: string | null;
  dueAt: string;
  maxMarks: number;
  status: AssignmentStatus;
  facultyUser: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentWithDue extends CodingAssignment {
  isPastDue?: boolean;
}

export interface ExecutionSnapshot {
  status: ExecutionStatus | string;
  description: string | null;
  stdout: string;
  stderr: string;
  compileOutput: string;
  exitCode: number | null;
  durationMs: number | null;
  memoryKb: number | null;
  executedAt: string | null;
}

export interface CodingSubmission {
  id: string;
  assignment: string;
  studentUser: string;
  studentName?: string;
  studentId?: string | null;
  language: string;
  files: CodingFile[];
  status: SubmissionStatus;
  submittedAt: string;
  isLate: boolean;
  version: number;
  lastExecution: ExecutionSnapshot | null;
  feedback: string;
  marks: number | null;
  gradedBy: string | null;
  gradedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CodingDraft {
  id: string;
  assignment: string;
  studentUser: string;
  language: string;
  files: CodingFile[];
  lastSavedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionResult {
  id: string;
  languageId: string;
  status: ExecutionStatus;
  description: string | null;
  stdout: string;
  stderr: string;
  compileOutput: string;
  exitCode: number | null;
  durationMs: number | null;
  memoryKb: number | null;
  message: string | null;
  createdAt: string;
}

export interface LabLanguage {
  id: string;
  name: string;
  extension: string;
  /** False for playground-only languages (HTML, CSS). */
  execution: boolean;
  providerLanguageId: number | null;
}

export interface LabLanguageResponse {
  configured: boolean;
  languages: LabLanguage[];
}

export interface LabCourse {
  courseId: string;
  code: string;
  name: string;
  semester: number | null;
  sectionCode: string | null;
}

export interface ProjectListResponse {
  projects: CodingProject[];
  shared: CodingProject[];
  pagination: { limit: number; skip: number; total: number };
}

export interface ShareCreateRequest {
  shareType: ShareType;
  courseId?: string;
  sectionCode?: string;
  studentIds?: string[];
  permission?: SharePermission;
  expiresInDays?: number;
}
