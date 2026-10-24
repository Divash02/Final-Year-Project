import { apiRequest, apiFetch, ApiError } from "../../../services/apiClient";
import type {
  CodingProject,
  CodingShare,
  CodingAssignment,
  CodingSubmission,
  ExecutionResult,
  LabLanguageResponse,
  LabCourse,
  ProjectListResponse,
  ShareCreateRequest,
  CodingFile,
  CodingDraft,
} from "./codingTypes";

/**
 * Online Coding Lab API client. Every call is authenticated by
 * `apiFetch` with the session token; ownership is enforced
 * server-side, so the client never decides access.
 */

export async function fetchLanguages(): Promise<LabLanguageResponse> {
  return apiRequest<LabLanguageResponse>("/coding/languages");
}

export async function fetchLabCourses(): Promise<{ courses: LabCourse[] }> {
  return apiRequest<{ courses: LabCourse[] }>("/coding/courses");
}

export interface ExecuteRequest {
  languageId: string;
  sourceCode: string;
  stdin?: string;
  projectId?: string;
}

export async function submitExecution(
  payload: ExecuteRequest,
): Promise<{ executionId: string; status: string }> {
  return apiRequest<{ executionId: string; status: string }>(
    "/coding/execute",
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function fetchExecution(
  executionId: string,
): Promise<{ execution: ExecutionResult }> {
  return apiRequest<{ execution: ExecutionResult }>(
    `/coding/executions/${executionId}`,
  );
}

export interface ProjectCreateRequest {
  title: string;
  description?: string;
  projectType?: "COMPILER" | "PLAYGROUND";
  defaultLanguage?: string;
  files?: CodingFile[];
  courseId?: string;
  sectionCode?: string;
  assignmentId?: string;
}

export interface ProjectUpdateRequest {
  title?: string;
  description?: string;
  projectType?: "COMPILER" | "PLAYGROUND";
  defaultLanguage?: string;
  files?: CodingFile[];
  courseId?: string | null;
  sectionCode?: string | null;
}

export async function fetchProjects(includeShared = false): Promise<ProjectListResponse> {
  return apiRequest<ProjectListResponse>(
    `/coding/projects${includeShared ? "?shared=true" : ""}`,
  );
}

export async function createProject(
  payload: ProjectCreateRequest,
): Promise<{ project: CodingProject }> {
  return apiRequest<{ project: CodingProject }>("/coding/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchProject(
  projectId: string,
): Promise<{ project: CodingProject }> {
  return apiRequest<{ project: CodingProject }>(`/coding/projects/${projectId}`);
}

export async function updateProject(
  projectId: string,
  payload: ProjectUpdateRequest,
): Promise<{ project: CodingProject }> {
  return apiRequest<{ project: CodingProject }>(`/coding/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteProject(projectId: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/coding/projects/${projectId}`, {
    method: "DELETE",
  });
}

export async function duplicateProject(
  projectId: string,
  options: { title?: string; assignmentId?: string } = {},
): Promise<{ project: CodingProject }> {
  return apiRequest<{ project: CodingProject }>(
    `/coding/projects/${projectId}/duplicate`,
    { method: "POST", body: JSON.stringify(options) },
  );
}

export async function createShare(
  projectId: string,
  payload: ShareCreateRequest,
): Promise<{ share: CodingShare }> {
  return apiRequest<{ share: CodingShare }>(`/coding/projects/${projectId}/share`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchShares(
  projectId: string,
): Promise<{ shares: CodingShare[] }> {
  return apiRequest<{ shares: CodingShare[] }>(
    `/coding/projects/${projectId}/shares`,
  );
}

export async function revokeShare(shareId: string): Promise<{ revoked: boolean }> {
  return apiRequest<{ revoked: boolean }>(`/coding/shares/${shareId}`, {
    method: "DELETE",
  });
}

export async function fetchSharedProjects(): Promise<{ projects: CodingProject[] }> {
  return apiRequest<{ projects: CodingProject[] }>("/coding/shared");
}

export interface AssignmentCreateRequest {
  title: string;
  description?: string;
  instructions?: string;
  courseId: string;
  sectionCodes?: string[];
  semester?: number;
  program?: string;
  academicYear?: string;
  allowedLanguages?: string[];
  starterFiles?: CodingFile[];
  exampleInput?: string;
  exampleOutput?: string;
  dueAt: string;
  maxMarks?: number;
  status?: "DRAFT" | "OPEN" | "CLOSED";
  opensAt?: string;
}

export async function fetchAssignments(): Promise<{
  assignments: CodingAssignment[];
}> {
  return apiRequest<{ assignments: CodingAssignment[] }>("/coding/assignments");
}

export async function createAssignment(
  payload: AssignmentCreateRequest,
): Promise<{ assignment: CodingAssignment }> {
  return apiRequest<{ assignment: CodingAssignment }>(
    "/coding/assignments",
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function fetchAssignment(
  assignmentId: string,
): Promise<{ assignment: CodingAssignment }> {
  return apiRequest<{ assignment: CodingAssignment }>(
    `/coding/assignments/${assignmentId}`,
  );
}

export async function updateAssignment(
  assignmentId: string,
  payload: Partial<AssignmentCreateRequest> & { status?: "DRAFT" | "OPEN" | "CLOSED" },
): Promise<{ assignment: CodingAssignment }> {
  return apiRequest<{ assignment: CodingAssignment }>(
    `/coding/assignments/${assignmentId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export interface SubmissionCreateRequest {
  language: string;
  files: CodingFile[];
  executionId?: string;
}

export async function submitAssignmentWork(
  assignmentId: string,
  payload: SubmissionCreateRequest,
): Promise<{ submission: CodingSubmission }> {
  return apiRequest<{ submission: CodingSubmission }>(
    `/coding/assignments/${assignmentId}/submissions`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function fetchSubmissions(
  assignmentId: string,
): Promise<{ submissions: CodingSubmission[] }> {
  return apiRequest<{ submissions: CodingSubmission[] }>(
    `/coding/assignments/${assignmentId}/submissions`,
  );
}

export async function gradeSubmission(
  submissionId: string,
  payload: { feedback?: string; marks?: number },
): Promise<{ submission: CodingSubmission }> {
  return apiRequest<{ submission: CodingSubmission }>(
    `/coding/submissions/${submissionId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export async function fetchDraft(
  assignmentId: string,
): Promise<{ draft: CodingDraft | null }> {
  return apiRequest<{ draft: CodingDraft | null }>(`/coding/assignments/${assignmentId}/draft`);
}

export async function saveDraft(
  assignmentId: string,
  payload: { language: string; files: CodingFile[] },
): Promise<{ draft: CodingDraft }> {
  return apiRequest<{ draft: CodingDraft }>(
    `/coding/assignments/${assignmentId}/draft`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/** Downloads a text payload as a file without leaving the page. */
export function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Extracts a safe message from any API failure. */
export function executionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 503 || error.status === 403) {
      return error.message;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "The request could not be completed.";
}
