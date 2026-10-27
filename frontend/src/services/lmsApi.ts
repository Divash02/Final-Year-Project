import { apiRequest } from "./apiClient";
import type {
  LmsAnnouncement,
  LmsAnnouncementList,
  LmsAnswerPatch,
  LmsAttemptAvailability,
  LmsAttemptRoster,
  LmsAttemptRuntime,
  LmsAttemptSummary,
  LmsClassSession,
  LmsCourseAssignment,
  LmsCourseIndex,
  LmsCourseOverview,
  LmsCourseTeachingHistory,
  LmsEngagement,
  LmsGradeInput,
  LmsGradeResponse,
  LmsGradebook,
  LmsGradingSheet,
  LmsMaterial,
  LmsMaterialType,
  LmsProgressResponse,
  LmsQuestion,
  LmsQuestionDraft,
  LmsQuestionInsight,
  LmsQuizDetail,
  LmsQuizDraft,
  LmsQuizList,
  LmsQuizSummary,
  LmsRiskSignals,
  LmsSaveResult,
  LmsStudentQuizDetail,
  LmsStudentResult,
  LmsTeachingProgressDraft,
  LmsTeachingRecord,
  LmsTemplate,
  LmsMaterialTeachingProgress,
  LmsWeekDetail,
  LmsWeekList,
  LmsWeeklyProgress,
  MyCoursesResponse,
  ResultReleasePolicy,
} from "../types/lms";

/**
 * Typed LMS client.
 *
 * A thin, explicit wrapper over `apiRequest`. It adds no behaviour of its own —
 * every function maps to exactly one endpoint and returns the server's shape
 * unchanged — so the browser can never be the place where an academic rule is
 * decided. The one thing it owns is that a payload type is written next to the
 * route it belongs to, which keeps the view models and the wire format in step.
 */

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(body),
  };
}

/* ------------------------------------------------------------------ */
/* Course workspace                                                    */
/* ------------------------------------------------------------------ */

/**
 * The caller's own courses, grouped into In Progress, Past and Future.
 *
 * Takes no arguments on purpose: the server resolves the caller from the session,
 * so there is nothing the browser could send to widen the result. Every card and
 * count in the response is derived server-side from real enrolment, teaching and
 * assessment records.
 */
export function fetchMyCourses(): Promise<MyCoursesResponse> {
  return apiRequest<MyCoursesResponse>("/my-courses");
}

/** Courses the caller teaches or is enrolled in, split by relationship. */
export function fetchLmsCourses(): Promise<LmsCourseIndex> {
  return apiRequest<LmsCourseIndex>("/lms/courses");
}

/** Everything the planner header needs, in one round trip. */
export function fetchCourseOverview(
  courseId: string,
  query: { semester?: number } = {},
): Promise<LmsCourseOverview> {
  const params = query.semester ? `?semester=${query.semester}` : "";
  return apiRequest<LmsCourseOverview>(`/lms/courses/${courseId}/overview${params}`);
}

export function fetchCourseWeeks(courseId: string): Promise<LmsWeekList> {
  return apiRequest<LmsWeekList>(`/lms/courses/${courseId}/weeks`);
}

/** One week with its objectives, materials, assignments, quizzes and news. */
export function fetchWeek(weekId: string): Promise<LmsWeekDetail> {
  return apiRequest<LmsWeekDetail>(`/lms/weeks/${weekId}`);
}

export function createWeek(
  courseId: string,
  body: { title: string; releaseAt?: string; description?: string },
): Promise<{ week: LmsWeekDetail["week"] }> {
  return apiRequest<{ week: LmsWeekDetail["week"] }>(
    `/lms/courses/${courseId}/weeks`,
    json(body),
  );
}

/** Publishes a week now, releasing anything due inside it. */
export function publishWeek(weekId: string): Promise<{ week: LmsWeekDetail["week"] }> {
  return apiRequest<{ week: LmsWeekDetail["week"] }>(
    `/lms/weeks/${weekId}/publish`,
    { method: "POST" },
  );
}

export function scheduleWeek(
  weekId: string,
  releaseAt: string,
): Promise<{ week: LmsWeekDetail["week"] }> {
  return apiRequest<{ week: LmsWeekDetail["week"] }>(`/lms/weeks/${weekId}`, {
    method: "PATCH",
    body: JSON.stringify({ releaseAt }),
  });
}

export function addWeekObjectives(
  weekId: string,
  texts: string[],
): Promise<{ objectives: LmsWeekDetail["week"]["objectives"] }> {
  return apiRequest<{ objectives: LmsWeekDetail["week"]["objectives"] }>(
    `/lms/weeks/${weekId}/objectives`,
    json({ texts }),
  );
}

export function removeObjective(objectiveId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/lms/objectives/${objectiveId}`, {
    method: "DELETE",
  });
}

/**
 * Edits a week's own fields, including its `position`.
 *
 * `position` is the planner's ordering contract: moving a
 * week writes the new position here, so drag-and-drop and
 * the keyboard "Move" menu persist through the same route.
 */
export function updateWeek(
  weekId: string,
  patch: {
    title?: string;
    description?: string;
    teachingPlan?: string;
    expectedOutcome?: string;
    studyTimeMinutes?: number | null;
    position?: number;
    releaseAt?: string | null;
    status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  },
): Promise<{ week: LmsWeekDetail["week"] }> {
  return apiRequest<{ week: LmsWeekDetail["week"] }>(
    `/lms/weeks/${weekId}`,
    { ...json(patch), method: "PATCH" },
  );
}

/** Duplicates a week into a new draft week. Objectives are copied. */
export function duplicateWeek(
  weekId: string,
  title?: string,
): Promise<{ week: LmsWeekDetail["week"] }> {
  return apiRequest<{ week: LmsWeekDetail["week"] }>(
    `/lms/weeks/${weekId}/duplicate`,
    json(title ? { title } : {}),
  );
}

/** Applies a course template as draft weeks. */
export function applyTemplate(
  templateId: string,
  courseId: string,
): Promise<{ weeks: { id: string; weekNumber: number }[] }> {
  return apiRequest(`/lms/templates/${templateId}/apply`, {
    ...json({ courseId }),
    method: "POST",
  });
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * Uploads a material against a week.
 *
 * The body is `FormData` rather than JSON because the file itself travels with
 * the metadata. File size, type and signature are all checked server-side, and
 * the section audience is resolved from the caller's teaching scope — none of it
 * is asserted by the browser.
 */
export function uploadWeekMaterial(
  weekId: string,
  draft: {
    file: File;
    title: string;
    description?: string;
    topic?: string;
    materialType?: string;
    estimatedMinutes?: number;
    releaseAt?: string;
    sectionCodes?: string[];
    /**
     * Initial visibility. Defaults to `DRAFT` here on purpose: the server
     * publishes anything it is not told to hold back, so relying on the
     * server default would make every upload reach students the instant the
     * teacher clicked Upload. Scheduling it explicitly here keeps the two-step
     * "upload, then release" flow the teacher sees honest.
     */
    status?: "DRAFT" | "SCHEDULED" | "PUBLISHED";
  },
): Promise<{ material: LmsMaterial }> {
  const form = new FormData();
  form.append("file", draft.file);
  form.append("title", draft.title);
  if (draft.description) form.append("description", draft.description);
  if (draft.topic) form.append("topic", draft.topic);
  if (draft.materialType) form.append("materialType", draft.materialType);
  if (draft.estimatedMinutes !== undefined) {
    form.append("estimatedMinutes", String(draft.estimatedMinutes));
  }
  if (draft.releaseAt) form.append("releaseAt", draft.releaseAt);
  // A release time with a draft status is the server's "scheduled" pairing; send
  // the state that matches rather than letting the two disagree.
  const status =
    draft.status || (draft.releaseAt ? "SCHEDULED" : "DRAFT");
  form.append("status", status);
  for (const code of draft.sectionCodes || []) {
    form.append("sectionCodes", code);
  }
  return apiRequest<{ material: LmsMaterial }>(`/lms/weeks/${weekId}/materials`, {
    method: "POST",
    body: form,
  });
}

/**
 * Edits a material's own fields.
 *
 * Used for the release time, because the status route deliberately accepts only
 * a state: the server rejects `SCHEDULED` unless a release time is already on the
 * material. Setting the time and the state in that order is the contract, not a
 * workaround.
 */
export function updateMaterial(
  materialId: string,
  patch: {
    title?: string;
    description?: string;
    topic?: string | null;
    materialType?: LmsMaterialType;
    releaseAt?: string | null;
    estimatedMinutes?: number | null;
  },
): Promise<{ material: LmsMaterial }> {
  return apiRequest<{ material: LmsMaterial }>(`/lms/materials/${materialId}`, {
    ...json(patch),
    method: "PATCH",
  });
}

/**
 * The teacher's lifecycle decision for a material.
 *
 * The union mirrors the server's accepted set exactly, so the
 * view cannot offer a state the server would reject.
 */
export type MaterialStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHED"
  | "HIDDEN"
  | "ARCHIVED";

/**
 * Moves a material between draft, scheduled, published, hidden and archived.
 *
 * `SCHEDULED` requires a release time, which the server enforces — the view does
 * not offer the state without one.
 */
export function setMaterialStatus(
  materialId: string,
  status: MaterialStatus,
): Promise<{ material: LmsMaterial }> {
  return apiRequest<{ material: LmsMaterial }>(`/lms/materials/${materialId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

/* ------------------------------------------------------------------ */
/* Assignments                                                         */
/* ------------------------------------------------------------------ */

export interface LmsAssignmentDraft {
  title: string;
  courseId: string;
  maxMarks?: number;
  dueAt?: string | null;
  opensAt?: string | null;
  assignmentType?: string;
  description?: string;
  instructions?: string;
  sectionCodes?: string[];
  semester?: number;
  similarityCheckEnabled?: boolean;
  /** The lifecycle state the teacher explicitly requests. */
  status?: "DRAFT" | "SCHEDULED" | "OPEN";
}

/**
 * Creates an assignment for a course.
 *
 * Delegated to the assignments module, which owns submission, audience
 * resolution and the submission window. The course and section are authorised
 * server-side against the caller's teaching scope, so a teacher cannot address a
 * cohort they do not teach by editing this payload.
 *
 * The `status` field is the lifecycle decision the teacher is making:
 * `DRAFT` saves without publishing, `SCHEDULED` holds it for the availability
 * window, and `OPEN` publishes it now. The server enforces that `SCHEDULED`
 * and `OPEN` require a due date — the browser cannot bypass that by omitting
 * the field.
 */
export function createCourseAssignment(
  draft: LmsAssignmentDraft,
): Promise<{ assignment: LmsCourseAssignment }> {
  return apiRequest<{ assignment: LmsCourseAssignment }>(
    "/assignments",
    json({ ...draft, status: draft.status || "OPEN" }),
  );
}

/**
 * Updates an assignment's lifecycle state and fields.
 *
 * Used by the edit drawer to change title, instructions, scheduling and the
 * published state in one call. The server validates every transition, so a
 * request to publish without a due date is rejected rather than silently
 * rewritten into a draft.
 */
export interface LmsAssignmentPatch {
  title?: string;
  description?: string;
  instructions?: string;
  assignmentType?: string;
  opensAt?: string | null;
  dueAt?: string | null;
  maxMarks?: number;
  allowedFileTypes?: string[];
  maxFileSizeMb?: number;
  attemptPolicy?: string;
  allowReplacement?: boolean;
  similarityCheckEnabled?: boolean;
  sectionCodes?: string[];
  status?: "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED";
}

export function updateCourseAssignment(
  assignmentId: string,
  patch: LmsAssignmentPatch,
): Promise<{ assignment: LmsCourseAssignment }> {
  return apiRequest<{ assignment: LmsCourseAssignment }>(
    `/assignments/${assignmentId}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

/**
 * Every assignment in a course, newest due date first.
 *
 * This is the assignments module's own list, scoped server-side from the
 * session: a teacher sees the courses they teach, a student their cohort. It is
 * used instead of the planner's per-week assignments because an assignment
 * created here has no week attached, so it would be invisible in a week-by-week
 * list even though it is live for the cohort.
 */
export function fetchCourseAssignments(
  courseId: string,
  options: { status?: "DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED"; limit?: number } = {},
): Promise<{
  assignments: LmsCourseAssignment[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> {
  const query = new URLSearchParams({ courseId });
  if (options.status) query.set("status", options.status);
  if (options.limit) query.set("limit", String(options.limit));
  return apiRequest(`/assignments?${query.toString()}`);
}

/* ------------------------------------------------------------------ */
/* Teaching progress                                                   */
/* ------------------------------------------------------------------ */

/**
 * The declared teaching position for one material, with its full history.
 *
 * Two kinds of fact are returned side by side and never merged: `opened` (the
 * file was accessed) and `position` (a teacher said they covered a range). A
 * material nobody has opened has no position, and a material opened ten times has
 * a position only if someone declared one.
 */
export function fetchMaterialTeachingProgress(
  materialId: string,
  options: { limit?: number } = {},
): Promise<LmsMaterialTeachingProgress> {
  const suffix = options.limit ? `?limit=${options.limit}` : "";
  return apiRequest<LmsMaterialTeachingProgress>(
    `/lms/materials/${materialId}/teaching-progress${suffix}`,
  );
}

/**
 * Records one teaching session.
 *
 * Every value is the teacher's own declaration, which is the only thing the server
 * will accept as a teaching position. Passing a `timetableSessionId` reuses that
 * class's course, section, date, time window and attendance session instead of
 * asking for them again.
 */
export function recordTeachingProgress(
  materialId: string,
  draft: LmsTeachingProgressDraft,
): Promise<{
  record: LmsTeachingRecord | null;
  position: LmsMaterialTeachingProgress["position"];
  documentLength: LmsMaterialTeachingProgress["documentLength"];
}> {
  return apiRequest(`/lms/materials/${materialId}/teaching-progress`, json(draft));
}

/** Course-wide teaching history, newest first. */
export function fetchCourseTeachingHistory(
  courseId: string,
  options: { section?: string; limit?: number } = {},
): Promise<LmsCourseTeachingHistory> {
  const params = new URLSearchParams();
  if (options.section) params.set("section", options.section);
  if (options.limit) params.set("limit", String(options.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<LmsCourseTeachingHistory>(
    `/lms/courses/${courseId}/teaching-history${suffix}`,
  );
}

/**
 * The caller's own class sessions for one course, from the timetable.
 *
 * Read-only: nothing here writes to the timetable, and the scope is fixed to the
 * session user (`scope=mine`), so a teacher can only pick their own classes. This
 * is what lets a teaching record name the class it happened in instead of
 * re-entering the section and time by hand.
 */
export function fetchMyClassSessions(courseId: string): Promise<{
  timetable: LmsClassSession[];
}> {
  const params = new URLSearchParams({ courseId, scope: "mine" });
  return apiRequest<{ timetable: LmsClassSession[] }>(`/timetable?${params.toString()}`);
}

/* ------------------------------------------------------------------ */
/* Question bank                                                       */
/* ------------------------------------------------------------------ */

export function fetchQuestionBank(
  courseId: string,
  query: { type?: string; difficulty?: string; q?: string } = {},
): Promise<{ questions: LmsQuestion[]; courseId: string; total: number }> {
  const params = new URLSearchParams({ courseId });
  if (query.type) params.set("type", query.type);
  if (query.difficulty) params.set("difficulty", query.difficulty);
  if (query.q) params.set("q", query.q);
  return apiRequest(`/lms/questions?${params.toString()}`);
}

export function createBankQuestion(
  courseId: string,
  draft: LmsQuestionDraft,
): Promise<{ question: LmsQuestion }> {
  return apiRequest<{ question: LmsQuestion }>(
    "/lms/questions",
    json({ ...draft, courseId }),
  );
}

export function deleteQuestion(questionId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/lms/questions/${questionId}`, {
    method: "DELETE",
  });
}

/* ------------------------------------------------------------------ */
/* Quiz authoring                                                      */
/* ------------------------------------------------------------------ */

/**
 * The course quiz list.
 *
 * The two roles share one route and get different payloads, so the element type
 * is a parameter. The default is the student-safe summary; a manager reads
 * `fetchCourseQuizzes<LmsQuizForTeacher>` only after the overview has already
 * reported `canManage`, which is the server's answer and not the caller's claim.
 */
export function fetchCourseQuizzes<T extends LmsQuizSummary = LmsQuizSummary>(
  courseId: string,
  query: { weekId?: string; semester?: number } = {},
): Promise<LmsQuizList<T>> {
  const params = new URLSearchParams();
  if (query.weekId) params.set("weekId", query.weekId);
  if (query.semester) params.set("semester", String(query.semester));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<LmsQuizList<T>>(`/lms/courses/${courseId}/quizzes${suffix}`);
}

/** Creates a draft quiz. Nothing is visible to students until it is published. */
export function createQuiz(courseId: string, draft: LmsQuizDraft): Promise<LmsQuizDetail> {
  return apiRequest<LmsQuizDetail>(`/lms/courses/${courseId}/quizzes`, json(draft));
}

/** The paper and every key, for a teacher. */
export function fetchQuiz(quizId: string): Promise<LmsQuizDetail | LmsStudentQuizDetail> {
  return apiRequest<LmsQuizDetail | LmsStudentQuizDetail>(`/lms/quizzes/${quizId}`);
}

/** Narrows a quiz-detail union to the teacher payload. */
export function isTeacherQuizDetail(
  detail: LmsQuizDetail | LmsStudentQuizDetail,
): detail is LmsQuizDetail {
  return "questions" in detail;
}

export function addQuizQuestion(
  quizId: string,
  draft: LmsQuestionDraft,
): Promise<{ question: LmsQuestion; questionCount: number; questionMarks: number }> {
  return apiRequest(`/lms/quizzes/${quizId}/questions`, json(draft));
}

export function removeQuizQuestion(
  quizId: string,
  questionId: string,
): Promise<{ success: boolean; questionCount: number; questionMarks: number }> {
  return apiRequest(`/lms/quizzes/${quizId}/questions/${questionId}`, {
    method: "DELETE",
  });
}

/**
 * Updates a single question on a paper (text, options, key, marks, position…).
 *
 * The route is `/api/lms/questions/:questionId`; the quiz id is carried only so
 * callers can scope the call and the server re-derives ownership.
 */
export function updateQuizQuestion(
  quizId: string,
  questionId: string,
  draft: LmsQuestionDraft,
): Promise<{ question: LmsQuestion }> {
  return apiRequest(`/lms/questions/${questionId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...draft, quizId }),
  });
}

/**
 * Persists the reordered question order to the backend.
 */
export function reorderQuizQuestions(
  quizId: string,
  questionIds: string[],
): Promise<{ success: boolean; questionCount: number; questionMarks: number; reordered: boolean }> {
  return apiRequest(`/lms/quizzes/${quizId}/questions/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ questionIds }),
  });
}

/**
 * The teacher's lifecycle decision.
 *
 * Opening and closing are still reconciled against the server clock on the same
 * call, so this never lets the browser decide when a window opens.
 */
export function setQuizStatus(
  quizId: string,
  status: "SCHEDULED" | "OPEN" | "CLOSED" | "COMPLETED",
): Promise<{ quiz: LmsQuizDetail["quiz"]; event: string | null; timing: LmsQuizDetail["timing"] }> {
  return apiRequest(`/lms/quizzes/${quizId}/status`, json({ status }));
}

/** Releases results under a `MANUAL` release policy. */
export function releaseQuizResults(quizId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/lms/quizzes/${quizId}/release-results`, {
    method: "POST",
  });
}

/**
 * Duplicates a quiz. The duplicated quiz is created as a draft.
 *
 * Optionally provides a new title for the duplicated quiz.
 */
export function duplicateQuiz(
  quizId: string,
  title?: string,
): Promise<{ quiz: LmsQuizDetail["quiz"] }> {
  return apiRequest<{ quiz: LmsQuizDetail["quiz"] }>(
    `/lms/quizzes/${quizId}/duplicate`,
    json(title ? { title } : {}),
  );
}

/**
 * Retires a quiz. A quiz that has been sat is archived rather than deleted, so
 * `archived` in the response tells the view which actually happened.
 */
export function archiveQuiz(
  quizId: string,
): Promise<{ success: boolean; archived: boolean; reason?: string }> {
  return apiRequest(`/lms/quizzes/${quizId}`, { method: "DELETE" });
}

/**
 * The quiz configuration patch.
 *
 * Every field is optional because the settings drawer sends only
 * what the teacher changed; the server merges it onto the paper.
 * `null` for a date clears it — the server rejects that once the
 * quiz is open, which is the intended guardrail.
 */
export interface LmsQuizPatch {
  title?: string;
  description?: string;
  instructions?: string;
  maxMarks?: number;
  passingMarks?: number;
  durationMinutes?: number | null;
  attemptsAllowed?: number;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  allowBackNavigation?: boolean;
  allowReviewBeforeSubmit?: boolean;
  navigationMethod?: "FREE" | "SEQUENTIAL";
  allowReopenExpired?: boolean;
  resultReleasePolicy?: ResultReleasePolicy;
  showCorrectAnswers?: boolean;
  sectionCodes?: string[];
  openAt?: string | null;
  closeAt?: string | null;
}

/**
 * Saves the quiz configuration — marks, timing, randomisation and
 * the result release policy.
 *
 * The server refuses to let marks or duration change once the
 * paper has been sat, and refuses window changes once it is open;
 * those conflicts surface here as errors, not silent rewrites.
 */
export function updateQuiz(
  quizId: string,
  patch: LmsQuizPatch,
): Promise<{ quiz: LmsQuizDetail["quiz"] }> {
  return apiRequest<{ quiz: LmsQuizDetail["quiz"] }>(
    `/lms/quizzes/${quizId}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export function fetchQuizInsights(quizId: string): Promise<{
  questions: LmsQuestionInsight[];
  quizId: string;
  serverTime: string;
}> {
  return apiRequest(`/lms/quizzes/${quizId}/insights`);
}

/* ------------------------------------------------------------------ */
/* Attempt runtime                                                     */
/* ------------------------------------------------------------------ */

/** What the student needs before deciding whether to begin. */
export function fetchAttemptAvailability(quizId: string): Promise<LmsAttemptAvailability> {
  return apiRequest<LmsAttemptAvailability>(`/lms/quizzes/${quizId}/attempt`);
}

/**
 * Starts an attempt, or resumes a live one.
 *
 * The response carries `resumed` so the view can say so, rather than implying a
 * fresh paper was issued.
 */
export function startAttempt(quizId: string): Promise<LmsAttemptRuntime> {
  return apiRequest<LmsAttemptRuntime>(`/lms/quizzes/${quizId}/attempts`, { method: "POST" });
}

/**
 * Autosaves answers.
 *
 * The server owns the deadline; `msRemaining` in the response is the authority
 * the view uses to correct its countdown rather than recomputing it locally.
 */
export function saveAnswers(
  attemptId: string,
  answers: LmsAnswerPatch[],
): Promise<LmsSaveResult> {
  return apiRequest<LmsSaveResult>(`/lms/attempts/${attemptId}/answers`, {
    method: "PUT",
    body: JSON.stringify({ answers }),
  });
}

/**
 * Records a non-conclusive session signal (hidden tab, dropped connection).
 *
 * This is a signal about the session, never a verdict about the student. The union
 * mirrors the server's accepted set exactly, so the client cannot invent a label
 * the server would reject — a rejected label would be a lost observation, not a
 * stricter one.
 */
export function recordIntegrityEvent(
  attemptId: string,
  type: "TAB_HIDDEN" | "TAB_VISIBLE" | "RECONNECTED" | "AUTOSAVE_FAILED" | "PAUSE",
  detail?: string,
): Promise<{ success: boolean; recorded: string }> {
  return apiRequest<{ success: boolean; recorded: string }>(
    `/lms/attempts/${attemptId}/integrity`,
    json({ type, detail }),
  );
}

/** Submits an attempt. Submitting twice is safe and returns the same result. */
export function submitAttempt(attemptId: string): Promise<LmsStudentResult> {
  return apiRequest<LmsStudentResult>(`/lms/attempts/${attemptId}/submit`, { method: "POST" });
}

/**
 * The student's own result.
 *
 * `released: false` is a normal answer, not an error: the reason explains when
 * the score will appear.
 */
export function fetchAttemptResult(attemptId: string): Promise<LmsStudentResult> {
  return apiRequest<LmsStudentResult>(`/lms/attempts/${attemptId}/result`);
}

/* ------------------------------------------------------------------ */
/* Marking                                                             */
/* ------------------------------------------------------------------ */

export function fetchAttemptRoster(
  quizId: string,
  query: { status?: string; filter?: string } = {},
): Promise<LmsAttemptRoster> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.filter) params.set("filter", query.filter);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<LmsAttemptRoster>(`/lms/quizzes/${quizId}/attempts${suffix}`);
}

/** Whole-class deadline extension */
export function extendQuizDeadline(
  quizId: string,
  data: { newCloseAt?: string; additionalMinutes?: number; reason?: string },
): Promise<{ success: boolean; quiz: LmsQuizDetail; updatedAttemptsCount: number; serverTime: string }> {
  return apiRequest(`/lms/quizzes/${quizId}/extend`, json(data));
}

/** Individual student attempt extension */
export function extendAttemptTime(
  attemptId: string,
  data: { newExpiresAt?: string; additionalMinutes?: number; reason?: string },
): Promise<{ success: boolean; attempt: LmsAttemptSummary; serverTime: string }> {
  return apiRequest(`/lms/attempts/${attemptId}/extend`, json(data));
}

/** Reopen an expired / auto-submitted attempt */
export function reopenAttempt(
  attemptId: string,
  data: { newExpiresAt?: string; additionalMinutes?: number; reason?: string },
): Promise<{ success: boolean; attempt: LmsAttemptSummary; serverTime: string }> {
  return apiRequest(`/lms/attempts/${attemptId}/reopen`, json(data));
}

/** The paper as the marker sees it, with the key and every response. */
export function fetchGradingSheet(attemptId: string): Promise<LmsGradingSheet> {
  return apiRequest<LmsGradingSheet>(`/lms/attempts/${attemptId}/grading`);
}

/**
 * Awards or clears marks.
 *
 * A `null` mark puts the answer back in the queue; the server recomputes the
 * total, so the view never sums marks itself.
 */
export function gradeAttempt(
  attemptId: string,
  input: { marks?: LmsGradeInput[]; overallFeedback?: string },
): Promise<LmsGradeResponse> {
  return apiRequest<LmsGradeResponse>(`/lms/attempts/${attemptId}/grade`, json(input));
}

/* ------------------------------------------------------------------ */
/* Gradebook, progress and analytics                                   */
/* ------------------------------------------------------------------ */

export function fetchGradebook(courseId: string): Promise<LmsGradebook> {
  return apiRequest<LmsGradebook>(`/lms/courses/${courseId}/grades`);
}

/** A teacher sees the cohort; a student sees only their own row. */
export function fetchCourseProgress(courseId: string): Promise<LmsProgressResponse> {
  return apiRequest<LmsProgressResponse>(`/lms/courses/${courseId}/progress`);
}

export function fetchWeeklyProgress(courseId: string): Promise<LmsWeeklyProgress> {
  return apiRequest<LmsWeeklyProgress>(`/lms/courses/${courseId}/weekly-progress`);
}

export function fetchEngagement(courseId: string): Promise<LmsEngagement> {
  return apiRequest<LmsEngagement>(`/lms/courses/${courseId}/analytics`);
}

export function fetchRiskSignals(courseId: string): Promise<LmsRiskSignals> {
  return apiRequest<LmsRiskSignals>(`/lms/courses/${courseId}/risk-signals`);
}

/* ------------------------------------------------------------------ */
/* Announcements and templates                                         */
/* ------------------------------------------------------------------ */

export function fetchAnnouncements(
  courseId: string,
  query: { weekId?: string } = {},
): Promise<LmsAnnouncementList> {
  const suffix = query.weekId ? `?weekId=${query.weekId}` : "";
  return apiRequest<LmsAnnouncementList>(`/lms/courses/${courseId}/announcements${suffix}`);
}

/**
 * Publishes or schedules an announcement.
 *
 * Omitting `publishAt` publishes immediately and delivers to the cohort; passing
 * one hands it to the delivery sweep.
 */
export function createAnnouncement(
  courseId: string,
  body: {
    title: string;
    body: string;
    weekId?: string;
    pinned?: boolean;
    publishAt?: string;
    alsoSendMail?: boolean;
  },
): Promise<{ announcement: { id: string; title: string; recipients: number } }> {
  return apiRequest(`/lms/courses/${courseId}/announcements`, json(body));
}

export function deleteAnnouncement(
  announcementId: string,
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/lms/announcements/${announcementId}`, {
    method: "DELETE",
  });
}

export function fetchTemplates(): Promise<{ templates: LmsTemplate[] }> {
  return apiRequest<{ templates: LmsTemplate[] }>("/lms/templates");
}

/* ------------------------------------------------------------------ */
/* Learning materials (course-wide library)                          */
/* ------------------------------------------------------------------ */

/**
 * The course's material library, with server-side search,
 * status filtering and pagination.
 *
 * This is the materials module's own list — it spans every
 * week, which the per-week material list cannot do, and it is
 * the only list that supports the "type / status / search"
 * toolbar the module exposes.
 */
export function fetchLearningMaterials(
  courseId: string,
  query: {
    q?: string;
    status?: string;
    materialType?: string;
    weekId?: string;
    mine?: boolean;
    includeArchived?: boolean;
    page?: number;
    limit?: number;
  } = {},
): Promise<{
  materials: LmsMaterial[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> {
  const params = new URLSearchParams({ courseId });
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.materialType) params.set("materialType", query.materialType);
  if (query.weekId) params.set("weekId", query.weekId);
  if (query.mine) params.set("mine", "true");
  if (query.includeArchived) params.set("includeArchived", "true");
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  return apiRequest(`/learning-materials?${params.toString()}`);
}

/**
 * One material with its stored file, for the preview drawer.
 *
 * The server returns 404 — not 403 — for material the caller
 * may not see, so an id a student guessed at reads as "nothing
 * exists" rather than "something is hidden from you".
 */
export function fetchLearningMaterial(
  materialId: string,
): Promise<{ material: LmsMaterial; canManage: boolean }> {
  return apiRequest(`/learning-materials/${materialId}`);
}

/**
 * Uploads a material to the course library (not tied to a week).
 *
 * The transfer itself goes through `uploadWithProgress` in the
 * shared upload system, because this is the surface where the
 * progress bar lives; this function documents the wire contract
 * the queue's uploader implements.
 */
export function createLearningMaterial(
  courseId: string,
  body: {
    file: File;
    title: string;
    description?: string;
    topic?: string;
    materialType?: string;
    estimatedMinutes?: number;
    releaseAt?: string;
    status?: "DRAFT" | "SCHEDULED" | "PUBLISHED";
    sectionCodes?: string[];
    /** Attach the material to a planner week. */
    weekId?: string;
  },
): Promise<{ material: LmsMaterial }> {
  const form = new FormData();
  form.append("file", body.file);
  form.append("title", body.title);
  form.append("courseId", courseId);
  if (body.description) form.append("description", body.description);
  if (body.topic) form.append("topic", body.topic);
  if (body.materialType) form.append("materialType", body.materialType);
  if (body.estimatedMinutes !== undefined) {
    form.append("estimatedMinutes", String(body.estimatedMinutes));
  }
  if (body.releaseAt) form.append("releaseAt", body.releaseAt);
  if (body.weekId) form.append("week", body.weekId);
  const status = body.status || (body.releaseAt ? "SCHEDULED" : "DRAFT");
  form.append("status", status);
  for (const code of body.sectionCodes || []) {
    form.append("sectionCodes", code);
  }
  return apiRequest<{ material: LmsMaterial }>("/learning-materials", {
    method: "POST",
    body: form,
  });
}

/** Replaces the stored file of an existing material (a new revision). */
export function replaceLearningMaterialFile(
  materialId: string,
  file: File,
): Promise<{ material: LmsMaterial }> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<{ material: LmsMaterial }>(
    `/learning-materials/${materialId}/file`,
    { method: "POST", body: form },
  );
}

/** Deletes a material (only when it has no teaching records, per the server). */
export function deleteLearningMaterial(
  materialId: string,
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(
    `/learning-materials/${materialId}`,
    { method: "DELETE" },
  );
}

/* ------------------------------------------------------------------ */
/* Assignments — detail, submissions, grading                        */
/* ------------------------------------------------------------------ */

/** One assignment with its roster and submission stats (teacher view). */
export interface AssignmentDetail {
  assignment: LmsCourseAssignment & {
    roster?: {
      studentId: string;
      name: string;
      section: string;
      submissionId: string | null;
      status: string;
      isLate: boolean;
      submittedAt: string | null;
      marks: number | null;
      similarityStatus: string;
      similarityPercentage: number | null;
    }[];
    submissions?: AssignmentSubmission[];
    stats?: {
      targeted: number;
      submitted: number;
      missing: number;
      late: number;
      graded: number;
    };
    mySubmission?: AssignmentSubmission | null;
    canManage: boolean;
    allowedFileTypes: string[];
    maxFileSizeMb: number;
  };
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  status: "DRAFT" | "SUBMITTED" | "LATE" | "GRADED" | "RETURNED";
  isLate: boolean;
  submittedAt: string | null;
  attemptCount: number;
  marks: number | null;
  feedback: string;
  gradedAt: string | null;
  file?: {
    fileId: string;
    originalName: string;
    mimeType: string;
    extension: string;
    sizeBytes: number | null;
    sizeLabel: string;
  } | null;
  similarity?: { status: string; percentage: number | null } | null;
}

export function fetchAssignmentDetail(
  assignmentId: string,
): Promise<AssignmentDetail> {
  return apiRequest<AssignmentDetail>(`/assignments/${assignmentId}`);
}

/**
 * Grades a submission.
 *
 * `marks: null` returns the work for revision — a distinct
 * academic action from a zero, and the server is the only
 * place that distinction is allowed to exist.
 */
export function gradeSubmission(
  submissionId: string,
  input: { marks?: number | null; feedback?: string },
): Promise<{ submission: AssignmentSubmission }> {
  return apiRequest<{ submission: AssignmentSubmission }>(
    `/submissions/${submissionId}/grade`,
    json({ ...input }),
  );
}

/** A student's own submissions, newest first. */
export function fetchMySubmissions(): Promise<{
  submissions: (AssignmentSubmission & {
    assignmentTitle: string;
    courseCode: string | null;
    dueAt: string | null;
    maxMarks: number | null;
  })[];
}> {
  return apiRequest("/submissions/mine");
}

/**
 * Submits (or replaces) a student's own assignment file.
 *
 * The student is taken from the session server-side; the
 * browser cannot name a different submitter. The transfer goes
 * through the shared upload system for its progress bar; this
 * signature documents the wire contract.
 */
export function submitAssignment(
  assignmentId: string,
  file: File,
): Promise<{ submission: AssignmentSubmission }> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<{ submission: AssignmentSubmission }>(
    `/assignments/${assignmentId}/submissions`,
    { method: "POST", body: form },
  );
}

/**
 * Streams a submission's stored file for download.
 *
 * Submission files are private to the submitting student and
 * the markers of that assignment; the download goes through
 * the authorized files route, never a public URL.
 */
export { downloadStoredFile } from "./uploadClient";

/* ------------------------------------------------------------------ */
/* Small helpers the views share                                       */
/* ------------------------------------------------------------------ */

/*
 * The display helpers live in `lib/lmsFormat` so they carry no dependency on
 * this module's API client and can be tested directly. They are re-exported
 * here because the views already import everything else in this file from here.
 */
export {
  formatCountdown,
  formatDeadline,
  formatMark,
  formatPercentage,
} from "../lib/lmsFormat";