import { apiFetch, ApiError } from "./apiClient";

export interface AssessmentComponent {
  name: string;
  type: string;
  maxMarks: number;
  passMarks: number;
  weightage?: number;
  description?: string;
}

export interface StudentComponentMark {
  name: string;
  type: string;
  maxMarks: number;
  passMarks: number;
  marksObtained: number | null;
  isAbsent?: boolean;
  status?: string;
  enteredAt?: string | null;
  remarks?: string;
}

export interface AssessmentCandidate {
  sn: number;
  studentId: string;
  symbolNumber: string;
  fullName: string;
  email?: string;
  program: string;
  semester: number;
  section: string;
  components: StudentComponentMark[];
  totalMarksObtained: number | null;
  totalMaxMarks: number;
  percentage: number | null;
  grade: string;
  gradePoint: number | null;
  resultStatus: string;
  workflowStatus: string;
  correctionReason?: string;
  updatedAt?: string | null;
}

export interface AssessmentCourse {
  id: string;
  code: string;
  name: string;
  semester: number;
  program: string;
  department: string;
  credits: number;
  sectionCodes: string[];
}

export interface CandidatesResponse {
  course: {
    id: string;
    code: string;
    name: string;
    credits: number;
    program: string;
    semester: number;
  };
  academicYear: string;
  semester: number;
  sectionCode: string;
  structure: {
    components: AssessmentComponent[];
    totalMaxMarks: number;
    totalPassMarks: number;
    passingRule: string;
  };
  summary: {
    totalCandidates: number;
    savedCount: number;
    incompleteCount: number;
    submittedCount: number;
    workflowStatus: string;
  };
  candidates: AssessmentCandidate[];
}

export interface StudentReleasedResult {
  id: string;
  academicYear: string;
  semester: number;
  courseCode: string;
  courseName: string;
  components: {
    name: string;
    maxMarks: number;
    marksObtained: number | null;
    status: string;
    isAbsent: boolean;
  }[];
  totalMarksObtained: number | null;
  totalMaxMarks: number;
  percentage: number | null;
  grade: string;
  gradePoint: number | null;
  resultStatus: string;
  publishedAt: string | null;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({ error: "Failed to parse JSON" }));
  if (!res.ok) {
    throw new ApiError(json.error || `HTTP ${res.status}`, res.status);
  }
  return json as T;
}

export async function fetchFacultyCourses(params: {
  academicYear?: string;
  semester?: number | null;
}): Promise<AssessmentCourse[]> {
  const query = new URLSearchParams();
  if (params.academicYear) query.set("academicYear", params.academicYear);
  if (params.semester) query.set("semester", String(params.semester));
  const res = await apiFetch(`/assessments/faculty-courses?${query.toString()}`);
  const data = await handleResponse<{ courses: AssessmentCourse[] }>(res);
  return data.courses;
}

export async function fetchAssessmentCandidates(params: {
  courseId: string;
  academicYear?: string;
  semester?: number;
  sectionCode?: string;
}): Promise<CandidatesResponse> {
  const query = new URLSearchParams({
    courseId: params.courseId,
    academicYear: params.academicYear || "2083/84",
    semester: String(params.semester || 4),
    sectionCode: params.sectionCode || "A",
  });
  const res = await apiFetch(`/assessments/candidates?${query.toString()}`);
  return handleResponse<CandidatesResponse>(res);
}

export async function saveStudentAssessmentMark(payload: {
  studentId: string;
  courseId: string;
  academicYear?: string;
  semester?: number;
  sectionCode?: string;
  components: { name: string; marksObtained: number | null; isAbsent?: boolean; remarks?: string }[];
  remarks?: string;
}): Promise<{
  success: boolean;
  savedAtNepalTime: string;
  candidate: AssessmentCandidate;
}> {
  const res = await apiFetch("/assessments/marks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function submitAssessmentBatch(payload: {
  courseId: string;
  academicYear?: string;
  semester?: number;
  sectionCode?: string;
  remarks?: string;
}): Promise<{ success: boolean; transitionedCount: number; newStatus: string }> {
  const res = await apiFetch("/assessments/submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function returnAssessmentForCorrection(payload: {
  courseId: string;
  academicYear?: string;
  semester?: number;
  sectionCode?: string;
  studentId?: string | null;
  reason: string;
}): Promise<{ success: boolean; transitionedCount: number; newStatus: string }> {
  const res = await apiFetch("/assessments/return", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function verifyAssessmentBatch(payload: {
  courseId: string;
  academicYear?: string;
  semester?: number;
  sectionCode?: string;
  remarks?: string;
}): Promise<{ success: boolean; transitionedCount: number; newStatus: string }> {
  const res = await apiFetch("/assessments/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function finalizeAssessmentBatch(payload: {
  courseId: string;
  academicYear?: string;
  semester?: number;
  sectionCode?: string;
  remarks?: string;
}): Promise<{ success: boolean; transitionedCount: number; newStatus: string }> {
  const res = await apiFetch("/assessments/finalize", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function publishAssessmentBatch(payload: {
  courseId: string;
  academicYear?: string;
  semester?: number;
  sectionCode?: string;
  remarks?: string;
}): Promise<{ success: boolean; transitionedCount: number; newStatus: string }> {
  const res = await apiFetch("/assessments/publish", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function fetchStudentMyResults(params: {
  semester?: number | null;
  academicYear?: string;
}): Promise<{
  student: {
    id: string;
    symbolNumber: string;
    fullName: string;
    program: string;
    currentSemester: number;
  };
  academicYear: string;
  results: StudentReleasedResult[];
}> {
  const query = new URLSearchParams();
  if (params.semester) query.set("semester", String(params.semester));
  if (params.academicYear) query.set("academicYear", params.academicYear);
  const res = await apiFetch(`/student/assessments/my-results?${query.toString()}`);
  return handleResponse(res);
}

export async function fetchAssessmentAuditTrail(params: {
  courseId: string;
  academicYear?: string;
  semester?: number;
}): Promise<{
  auditTrail: {
    studentId: string;
    symbolNumber: string;
    action: string;
    actorName: string;
    role: string;
    timestamp: string;
    remarks: string;
    changes?: Record<string, unknown>;
  }[];
}> {
  const query = new URLSearchParams({
    courseId: params.courseId,
    academicYear: params.academicYear || "2083/84",
    semester: String(params.semester || 4),
  });
  const res = await apiFetch(`/assessments/audit-trail?${query.toString()}`);
  return handleResponse(res);
}
