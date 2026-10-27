/**
 * LMS view models.
 *
 * These types describe exactly what the LMS endpoints return, and they are
 * written so that a field the server may legitimately withhold is *absent*
 * rather than `null`. That distinction is the whole point: `awardedMarks?: number`
 * means "no mark has been released, or none exists", while `awardedMarks: number |
 * null` would mean "the mark is zero or unknown", which is a different and
 * usually wrong claim.
 *
 * Nothing here re-derives an academic rule. Availability, deadlines, pass marks
 * and release decisions are all computed on the server against its clock; these
 * types only describe the answers it gave.
 */

export type IsoDate = string;

export type WeekStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/**
 * What a week looks like to whoever is reading it.
 *
 * `state` is derived server-side from the stored status and the release instant,
 * so a scheduled week reads as `SCHEDULED` even before the delivery sweep runs.
 */
export type WeekState = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

export type QuizAvailability = "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED";

export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED" | "GRADED";

export type QuestionType =
  | "MULTIPLE_CHOICE"
  | "MULTIPLE_SELECT"
  | "TRUE_FALSE"
  | "FILL_BLANK"
  | "SHORT_ANSWER"
  | "LONG_ANSWER"
  | "NUMERIC";

export type ResultReleasePolicy =
  | "IMMEDIATELY"
  | "AFTER_CLOSE"
  | "AFTER_GRADING"
  | "MANUAL";

export type MaterialState = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";

/* ------------------------------------------------------------------ */
/* Courses and access                                                  */
/* ------------------------------------------------------------------ */

export interface LmsCourseSummary {
  id: string;
  code: string;
  name: string;
  program: string | null;
  semester: number | null;
  academicYear: string | null;
  credits: number | null;
  status: string;
  /** `TEACHER` for a teaching assignment, `STUDENT` for an enrolment. */
  role: "TEACHER" | "STUDENT";
  /** Present for a teacher: the sections they may deliver to. */
  sectionCodes?: string[] | null;
  /** Present for a student: the section they study. */
  sectionCode?: string | null;
}

export interface LmsCourseIndex {
  courses: LmsCourseSummary[];
  teachingCount: number;
  enrolledCount: number;
  timezone: string;
}

/** Whether the signed-in account may edit this course, and for which sections. */
export interface LmsAccess {
  canManage: boolean;
  canManageContent?: boolean;
  role: "manager" | "teacher" | "student" | "none";
  sections: string[];
  enrolledSection?: string | null;
}

export interface LmsCourseDetail {
  id: string;
  code: string;
  name: string;
  description: string;
  program: string | null;
  semester: number | null;
  academicYear: string | null;
  credits: number | null;
  status: string;
}

export interface LmsCourseOverview {
  course: LmsCourseDetail;
  access: LmsAccess;
  scope: {
    sectionCodes: string[];
    sections: string[];
    terms: string[];
    semester: number | null;
  };
  serverTime: IsoDate;
  timezone: string;
  weekCount: number;
  publishedWeekCount: number;
  draftWeekCount: number;
}

/* ------------------------------------------------------------------ */
/* My Courses                                                          */
/* ------------------------------------------------------------------ */

/**
 * Which period of study a course card belongs to.
 *
 * `undated` is a first-class answer, not an error: it means the enrolment record
 * carries no semester the institution has published, so the server declines to
 * claim the course is current. It is surfaced rather than folded into In
 * Progress.
 */
export type MyCourseBucket = "current" | "past" | "undated";

/** How the caller's relationship to the course was established. */
export type MyCourseRelation =
  | "ENROLLED"
  | "TEACHING"
  | "ENROLLED_AND_TEACHING"
  | "OVERSIGHT";

export type EnrollmentStatus = "ENROLLED" | "DROPPED" | "COMPLETED";

/**
 * The academic period every card on the page is grouped against.
 *
 * `basis` records where the period came from, so the interface can say so:
 * `INSTITUTION` means the academic office published it, `RECORDS` means it was
 * derived from the caller's own enrolments because nothing was published.
 */
export interface MyCoursePeriod {
  academicYear: string;
  semester: number | null;
  basis: "INSTITUTION" | "RECORDS";
  configured: boolean;
  /** Set when the period was derived rather than published. */
  note: string | null;
}

export interface MyCourseAttendance {
  /** `null` when no marks have been recorded — never `0`. */
  percentage: number | null;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  recorded: boolean;
}

/** `available: false` means no assessment records exist, so there is nothing to count. */
export interface MyCourseAssignmentMetric {
  total: number;
  submitted: number;
  graded: number;
  pending: number;
  overdue: number;
  available: boolean;
}

export interface MyCourseQuizMetric {
  total: number;
  open: number;
  attempted: number;
  pendingManual: number;
  available: boolean;
}

export interface MyCourseWeekSummary {
  id: string;
  weekNumber: number;
  title: string;
  status: WeekStatus;
  publishedAt: IsoDate | null;
}

/**
 * Course progress.
 *
 * `available: false` with `percentage: null` is the honest answer for a course
 * with no countable work. A view must not substitute 0% there, because "no work
 * exists" and "no work done" are different facts.
 */
export interface MyCourseProgress {
  available: boolean;
  percentage: number | null;
  completed: number;
  total: number;
  reason?: string;
  basis?: string;
}

export interface MyCourseDeadline {
  kind: "ASSIGNMENT" | "QUIZ";
  at: IsoDate;
  assignmentId: string | null;
  quizId: string | null;
}

/**
 * Every number on a card, each one counted from a document that exists.
 *
 * A field here is `null` — never a default — when the institution retained
 * nothing to count.
 */
export interface MyCourseMetrics {
  attendance: MyCourseAttendance;
  assignments: MyCourseAssignmentMetric;
  quizzes: MyCourseQuizMetric;
  materials: { total: number; available: boolean };
  weeks: { total: number; published: number; list: MyCourseWeekSummary[] };
  progress: MyCourseProgress;
  upcomingDeadline: MyCourseDeadline | null;
  lastActivityAt: IsoDate | null;
}

export interface MyCourseFaculty {
  id: string;
  name: string;
}

/**
 * One course the caller is actually attached to.
 *
 * `period.undated` is carried on the card so a course with no recorded semester
 * is never presented as an ordinary current course.
 */
export interface MyCourseCard {
  courseId: string;
  code: string;
  name: string;
  description: string;
  department: string | null;
  program: string | null;
  credits: number | null;
  courseType: string;
  semester: number | null;
  academicYear: string | null;
  courseStatus: string;
  relation: MyCourseRelation;
  enrollmentStatus: EnrollmentStatus | null;
  sectionCodes: string[];
  period: { bucket: MyCourseBucket; basis: string; undated: boolean };
  faculty: MyCourseFaculty[];
  metrics: MyCourseMetrics;
}

export interface MyCoursesResponse {
  period: MyCoursePeriod;
  counts: {
    inProgress: number;
    past: number;
    future: number;
  };
  courses: {
    inProgress: MyCourseCard[];
    past: MyCourseCard[];
    future: MyCourseCard[];
  };
  serverTime: IsoDate;
}

/* ------------------------------------------------------------------ */
/* Weeks, objectives and materials                                     */
/* ------------------------------------------------------------------ */

export interface PlannerDeadline {
  kind: "ASSIGNMENT" | "QUIZ";
  at: IsoDate;
}

export interface LmsWeek {
  id: string;
  courseId: string;
  weekNumber: number;
  title: string;
  description: string;
  teachingPlan: string;
  expectedOutcome: string;
  studyTimeMinutes: number | null;
  position: number;
  status: WeekStatus;
  state: WeekState;
  releaseAt: IsoDate | null;
  publishedAt: IsoDate | null;
  archivedAt: IsoDate | null;
  semester: number | null;
  sectionCodes: string[];
  createdAt: IsoDate | null;
  updatedAt: IsoDate | null;

  // Planner counters, present on the course week list.
  materialCount?: number;
  assignmentCount?: number;
  quizCount?: number;
  objectiveCount?: number;
  totalQuizMarks?: number;
  nextDeadline?: PlannerDeadline | null;
}

export interface LmsWeekList {
  weeks: LmsWeek[];
  access: { canManage: boolean; sections: string[] };
  serverTime: IsoDate;
}

export interface LmsObjective {
  id: string;
  weekId: string;
  text: string;
  code: string | null;
  note: string;
  cognitiveLevel: string | null;
  position: number;
}

/**
 * The stored file behind an uploaded material.
 *
 * Absent for materials that are a link, an embed or a written reading — those
 * carry `url` or `content` instead, which is why the upload path is only offered
 * for real files.
 */
export interface LmsMaterialFile {
  fileId: string;
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number | null;
  /** Human-readable size, formatted server-side. */
  sizeLabel: string;
  uploadedAt: IsoDate | null;
  isPdf: boolean;
  isImage: boolean;
  isAudio: boolean;
  isVideo: boolean;
}

/** The material kinds the server accepts (`MATERIAL_TYPES`). */
export type LmsMaterialType =
  | "FILE"
  | "SLIDES"
  | "DOCUMENT"
  | "IMAGE"
  | "ARCHIVE"
  | "VIDEO"
  | "AUDIO"
  | "LINK"
  | "EMBED"
  | "READING"
  | "TEXT";

/**
 * How long a document actually is, read from its bytes on upload.
 *
 * `unitLabel` says what one unit is: a slide in a deck, a page in a PDF, or a
 * named section when the length is not countable at all. `unitCount` is null
 * whenever the real length could not be established — a DOCX stores no page count
 * until a word processor lays it out — and the teacher then declares the total
 * themselves rather than being given a guess.
 */
export interface LmsDocumentMeta {
  pageCount: number | null;
  slideCount: number | null;
  unitCount: number | null;
  unitLabel: "slide" | "page" | "section";
  detectedBy: string | null;
  detectedAt: IsoDate | null;
}

export interface LmsMaterial {
  id: string;
  courseId: string;
  courseCode?: string | null;
  courseName?: string | null;
  weekId: string | null;
  weekNumber?: number | null;
  weekTitle?: string | null;
  title: string;
  topic?: string | null;
  materialType: string;
  description: string;
  /**
   * Which revision this row is. A replacement upload is a new row with the next
   * number, so the old version is never rewritten — which is what lets a teaching
   * record stay attached to the file that was actually taught.
   */
  version?: number;
  supersedesMaterialId?: string | null;
  supersededByMaterialId?: string | null;
  /** The teacher's stored decision. */
  status: string;
  /** What a student experiences right now, resolved server-side with the clock. */
  state?: MaterialState;
  /** For LINK / VIDEO / AUDIO / EMBED materials. */
  url?: string | null;
  /** For TEXT / READING materials. */
  content?: string;
  estimatedMinutes?: number | null;
  allowDownload?: boolean;
  file?: LmsMaterialFile | null;
  /** Human-readable cohort, e.g. "Section A1". */
  audienceLabel?: string;
  releaseAt: IsoDate | null;
  publishedAt: IsoDate | null;
  fileId: string | null;
  fileName: string | null;
  downloadUrl?: string | null;
  sizeBytes: number | null;
  sectionCodes: string[];
  semester: number | null;
  uploadedAt: IsoDate | null;
  /** Structural length of the document, from the real file. */
  documentMeta?: LmsDocumentMeta | null;
  /**
   * The teacher's last declared teaching position. Never advanced by opening or
   * downloading the file — see `firstViewedAt` for that, which is a separate fact.
   */
  lastTaughtAt?: string | null;
  lastTaughtFromUnit?: number | null;
  lastTaughtToUnit?: number | null;
  lastTaughtTopic?: string | null;
  lastTaughtNotes?: string | null;
}

/* ------------------------------------------------------------------ */
/* Teaching progress                                                    */
/* ------------------------------------------------------------------ */

/** What one position in a document means: a slide, a page, or a section. */
export type LmsTeachingUnitLabel = "slide" | "page" | "section";

/**
 * One class, one material, one declared position.
 *
 * This is a teacher's own declaration, never an inference. `totalUnits` is a
 * snapshot taken when the position was recorded, so replacing the file later does
 * not retroactively rewrite the history of what was taught against the version the
 * teacher was actually holding.
 */
export interface LmsTeachingRecord {
  id: string;
  /** Institution calendar day, `YYYY-MM-DD`. */
  taughtOn: string;
  fromUnit: number;
  toUnit: number;
  totalUnits: number | null;
  unitLabel: LmsTeachingUnitLabel;
  topic: string;
  notes: string;
  nextStartUnit: number | null;
  sectionCode: string | null;
  sessionName: string;
  startTime: string | null;
  endTime: string | null;
  classType: string | null;
  materialId: string;
  materialVersion: number;
  timetableSessionId: string | null;
  attendanceSessionId: string | null;
  recordedAt: IsoDate | null;
}

/** The "where was I" answer for one material, with its full history. */
export interface LmsMaterialTeachingProgress {
  material: {
    id: string;
    title: string;
    version: number;
    weekNumber: number | null;
    weekTitle: string | null;
    courseId: string;
    courseCode: string | null;
    fileName: string | null;
    documentMeta: LmsDocumentMeta | null;
    /**
     * Passive access facts. Shown next to the teaching position and never merged
     * with it: a file can be opened a hundred times and taught once.
     */
    opened: {
      firstViewedAt: IsoDate | null;
      viewCount: number;
      downloadCount: number;
    };
  };
  documentLength: {
    /** False when the length is unknown — no progress bar is drawn against a guess. */
    known: boolean;
    totalUnits: number | null;
    unitLabel: LmsTeachingUnitLabel;
  };
  position: {
    fromUnit: number;
    toUnit: number;
    topic: string;
    notes: string;
    taughtOn: string;
    sectionCode: string | null;
    sessionName: string;
    startTime: string | null;
    endTime: string | null;
    recordedBy: string | null;
    recordedAt: IsoDate | null;
    nextStartUnit: number | null;
    percentage: number | null;
  } | null;
  records: LmsTeachingRecord[];
  recordCount: number;
}

/** Course-wide teaching history, newest first. */
export interface LmsCourseTeachingHistory {
  records: (LmsTeachingRecord & {
    materialTitle: string | null;
    weekNumber: number | null;
    facultyName: string | null;
  })[];
  total: number;
  nextUnit: number | null;
  unitLabel: LmsTeachingUnitLabel;
}

/** The latest declared position for one material within a week. */
export interface LmsWeekTeachingPosition {
  materialId: string;
  materialTitle: string | null;
  materialVersion: number;
  fromUnit: number;
  toUnit: number;
  totalUnits: number | null;
  unitLabel: LmsTeachingUnitLabel;
  taughtOn: string;
  topic: string;
  notes: string;
  nextStartUnit: number | null;
  /** The class this position was declared in, when it was recorded from the timetable. */
  sectionCode: string | null;
  sessionName: string;
  sessionStartTime: string | null;
  sessionEndTime: string | null;
}

/**
 * A class session from the timetable.
 *
 * Read-only here: picking one carries the course, section, date, time window and
 * attendance session into the teaching record, so a class is described once rather
 * than retyped in two places.
 */
export interface LmsClassSession {
  id: string;
  courseId: string;
  courseCode: string | null;
  courseName: string | null;
  facultyUserId: string;
  facultyName: string | null;
  program: string | null;
  batch: string | null;
  semester: number | null;
  sectionCode: string;
  room: string | null;
  date: string | null;
  scheduledDay: string;
  startTime: string | null;
  endTime: string | null;
  sessionType: string | null;
  status: string | null;
  attendanceSessionId: string | null;
  attendanceStatus: string | null;
}

/** What the recording form sends. Every field here is the teacher's own statement. */
export interface LmsTeachingProgressDraft {
  /** 1-based inclusive start of what this class covered. */
  fromUnit: number;
  /** 1-based inclusive end. */
  toUnit: number;
  /** Only needed when the document length could not be read from the file. */
  totalUnits?: number;
  unitLabel?: LmsTeachingUnitLabel;
  /** Defaults to the unit after `toUnit`. */
  nextStartUnit?: number | null;
  taughtOn?: string;
  topic?: string;
  notes?: string;
  sessionName?: string;
  sessionStartTime?: string;
  sessionEndTime?: string;
  classType?: string;
  /** Links the record to a timetable class, which supplies the rest. */
  timetableSessionId?: string | null;
  sectionCodes?: string[];
  weekId?: string | null;
}

export interface LmsPlannerAssignment {
  id: string;
  weekId: string | null;
  title: string;
  assignmentType: string;
  opensAt: IsoDate | null;
  dueAt: IsoDate | null;
  maxMarks: number;
  status: string;
  opensIn: "FUTURE" | "OPEN";
  isPastDue: boolean;
  submissionWindowState: "OPEN" | "CLOSED" | "UNKNOWN";
}

/**
 * A course assignment as the assignments module reports it.
 *
 * This is the shape the assignments module returns for an assignment it owns. It
 * is read, never re-derived: `isPastDue` and the submission window are the
 * server's verdicts against its clock, so a browser with a skewed clock still
 * agrees with the window that actually governs submission.
 */
export interface LmsCourseAssignment {
  id: string;
  title: string;
  description: string;
  instructions: string;
  assignmentType: string;
  courseId: string;
  courseCode?: string | null;
  courseName?: string | null;
  facultyUserId: string;
  facultyName?: string | null;
  opensAt: IsoDate | null;
  dueAt: IsoDate | null;
  maxMarks: number | null;
  allowedFileTypes?: string[];
  maxFileSizeMb?: number | null;
  attemptPolicy: string;
  allowReplacement: boolean;
  similarityCheckEnabled?: boolean;
  audienceLabel: string;
  semester: number | null;
  sectionCodes: string[];
  status: string;
  /**
   * Submission counts, present when the list endpoint aggregates them and absent
   * on a single-record read. `submissions` counts the attempts that exist;
   * `submitted` counts the ones that are actually in.
   */
  stats?: {
    submissions: number;
    submitted: number;
    graded: number;
    late: number;
    average: number | null;
  };
  createdAt: IsoDate | null;
}

export interface LmsAnnouncementSummary {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  weekId: string | null;
  publishedAt: IsoDate | null;
}

export interface LmsWeekDetail {
  week: LmsWeek & {
    materials: LmsMaterial[];
    objectives: LmsObjective[];
    assignments: LmsPlannerAssignment[];
    quizzes: LmsQuizSummary[];
    announcements: LmsAnnouncementSummary[];
    /**
     * The latest declared teaching position for each material of this week.
     *
     * Teacher-only working state, so the server sends `null` rather than an empty
     * list to anyone who may not manage the course — "you may not see this" and
     * "nothing has been taught" are different facts and must not look alike.
     */
    teachingProgress: LmsWeekTeachingPosition[] | null;
  };
  access: { canManage: boolean; canManageContent: boolean; sections: string[] };
  serverTime: IsoDate;
}

/* ------------------------------------------------------------------ */
/* Quizzes                                                             */
/* ------------------------------------------------------------------ */

/** What the planner needs to render a quiz row, whoever is reading it. */
export interface LmsQuizSummary {
  id: string;
  courseId: string;
  weekId: string | null;
  title: string;
  description: string;
  instructions: string;
  availability: QuizAvailability;
  availabilityReason: string | null;
  availableFrom: IsoDate | null;
  availableUntil: IsoDate | null;
  durationMinutes: number | null;
  maxMarks: number;
  passingMarks: number;
  attemptsAllowed: number;
  questionCount: number | null;
  resultReleasePolicy: ResultReleasePolicy;
  navigationMethod?: "FREE" | "SEQUENTIAL";
  allowReopenExpired?: boolean;
  extensionHistory?: {
    extendedBy: string;
    extendedAt: IsoDate;
    previousCloseAt: IsoDate;
    revisedCloseAt: IsoDate;
    reason: string;
  }[];

  // Student-facing attempt history. Marks are deliberately absent: whether they
  // are included depends on the release policy, which the server decides.
  attempts?: LmsAttemptSummary[];
  attemptsUsed?: number;
  hasLiveAttempt?: boolean;
  bestPercentage?: number | null;
}

/** The teacher-facing quiz, including the academic configuration. */
export interface LmsQuizForTeacher extends LmsQuizSummary {
  courseId: string;
  weekId: string | null;
  status: string;
  maxMarks: number;
  passingMarks: number;
  attemptsAllowed: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  allowBackNavigation: boolean;
  allowReviewBeforeSubmit: boolean;
  navigationMethod?: "FREE" | "SEQUENTIAL";
  allowReopenExpired?: boolean;
  extensionHistory?: {
    extendedBy: string;
    extendedAt: IsoDate;
    previousCloseAt: IsoDate;
    revisedCloseAt: IsoDate;
    reason: string;
  }[];
  multipleSelectGrading: string;
  blankAnswerCaseSensitive: boolean;
  resultReleasePolicy: ResultReleasePolicy;
  showCorrectAnswers: boolean;
  resultsReleasedAt: IsoDate | null;
  openAt: IsoDate | null;
  closeAt: IsoDate | null;
  openedAt: IsoDate | null;
  closedAt: IsoDate | null;
  completedAt: IsoDate | null;
  academicYear: string | null;
  program: string | null;
  semester: number | null;
  sectionCodes: string[];
  attemptCount: number;
  pendingManualGradeCount: number;
  archivedAt: IsoDate | null;
  createdAt: IsoDate | null;
  updatedAt: IsoDate | null;
  /** Only on the detail payload. */
  questions?: number;
  questionMarks?: number;
}

export interface LmsQuizOption {
  id: string;
  text: string;
}

/** A question as a teacher sees it, including the marking key. */
export interface LmsQuestion {
  id: string;
  courseId: string;
  weekId: string | null;
  quizId: string | null;
  bankOriginId: string | null;
  type: QuestionType;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  text: string;
  richText: string;
  codeSnippet: string;
  notation: string;
  imageFileId: string | null;
  options: LmsQuizOption[];
  marks: number;
  category: string | null;
  topic: string | null;
  learningObjective: string | null;
  explanation: string;
  correctAnswer: unknown[];
  requiresManualGrading: boolean;
  position: number;
  usageCount: number;
  updatedAt: IsoDate | null;
}

/**
 * A question as a student receives it.
 *
 * There is deliberately no `correctAnswer` field: the key never leaves the
 * server for a paper in progress.
 */
export interface LmsServedQuestion {
  id: string;
  type: QuestionType;
  text: string;
  richText: string;
  codeSnippet: string;
  notation: string;
  imageFileId: string | null;
  marks: number;
  category: string | null;
  difficulty: string;
  requiresManualGrading: boolean;
  options: LmsQuizOption[];
}

/**
 * A served question after release, carrying the student's own outcome.
 *
 * The outcome fields are always present once results are released, but
 * `awardedMarks` is `null` — not zero — while the paper is still waiting for a
 * marker. `correctAnswer` and `explanation` remain optional because the teacher
 * decides whether the key is ever shown; the server omits them otherwise.
 */
export interface LmsReviewedQuestion extends LmsServedQuestion {
  correctAnswer?: unknown[];
  explanation?: string;
  response: unknown;
  responseText: string;
  awardedMarks: number | null;
  isCorrect: boolean | null;
  requiresManualGrading: boolean;
  feedback: string;
}

export interface LmsQuizTotals {
  questionCount: number;
  questionMarks: number;
  maxMarks: number;
  autoGradableCount: number;
  manualGradingCount: number;
}

export interface LmsQuizDetail {
  quiz: LmsQuizForTeacher;
  questions: LmsQuestion[];
  totals: LmsQuizTotals;
  timing: LmsTiming;
}

/** Server-time payload, so a countdown is never anchored to the device clock. */
export interface LmsTiming {
  serverTime: IsoDate;
  timezone?: string;
  availability?: QuizAvailability;
  storedStatus?: string;
  openAt?: IsoDate | null;
  closeAt?: IsoDate | null;
  msUntilOpen?: number | null;
  msUntilClose?: number | null;
  /** Present on an attempt: the attempt's own absolute deadline. */
  expiresAt?: IsoDate;
  msRemaining?: number;
}

/**
 * The course quiz list.
 *
 * One route serves two roles with two different payloads, so the element type is
 * a parameter: a manager reads `LmsQuizList<LmsQuizForTeacher>` and gets the
 * cohort counts it is entitled to, while a student reads the default
 * `LmsQuizList<LmsQuizSummary>`, which carries no key and no cohort mark. Callers
 * pick the parameter *after* the server has told them their role via
 * `access.canManage`, never before.
 */
export interface LmsQuizList<T extends LmsQuizSummary = LmsQuizSummary> {
  quizzes: T[];
  access: { canManage: boolean; sections: string[] };
  serverTime: IsoDate;
}

/* ------------------------------------------------------------------ */
/* Attempts                                                            */
/* ------------------------------------------------------------------ */

/**
 * One sitting.
 *
 * `awardedMarks`, `percentage` and `passed` are optional: a summary is only
 * mark-bearing when the caller is entitled to see the mark. Absent means
 * withheld, and the view must not render it as zero.
 */
export interface LmsAttemptSummary {
  id: string;
  quizId: string;
  courseId: string;
  attemptNumber: number;
  status: AttemptStatus;
  startedAt: IsoDate | null;
  originalExpiresAt?: IsoDate | null;
  expiresAt: IsoDate | null;
  submittedAt: IsoDate | null;
  autoSubmitted: boolean;
  durationSeconds: number | null;
  pendingManualCount: number;
  inProgress: boolean;
  reopenedAt?: IsoDate | null;
  extensionHistory?: {
    grantedBy: string;
    grantedAt: IsoDate;
    previousExpiresAt: IsoDate;
    revisedExpiresAt: IsoDate;
    additionalMinutes: number;
    reason: string;
    action: "EXTENSION" | "REOPEN";
  }[];

  objectiveMarks?: number;
  manualMarks?: number;
  awardedMarks?: number | null;
  maxMarks?: number | null;
  percentage?: number | null;
  passed?: boolean | null;
  correctCount?: number;
  incorrectCount?: number;
  unansweredCount?: number;
  overallFeedback?: string;
  gradedAt?: IsoDate | null;

  // Roster rows only.
  studentId?: string | null;
  name?: string | null;
  section?: string | null;
  studentName?: string | null;
  studentRollNumber?: string | null;
  score?: number | null;
  attemptId?: string | null;
}

export type LmsAttemptRosterItem = LmsAttemptSummary;

/** The runtime a student sits a quiz in. */
export interface LmsAttemptRuntime {
  attempt: {
    id: string;
    quizId: string;
    courseId: string;
    attemptNumber: number;
    status: AttemptStatus;
    startedAt: IsoDate;
    expiresAt: IsoDate;
    submittedAt: IsoDate | null;
  };
  quiz: {
    id: string;
    title: string;
    instructions: string;
    durationMinutes: number | null;
    maxMarks: number;
    attemptsAllowed: number;
    allowBackNavigation: boolean;
    allowReviewBeforeSubmit: boolean;
    navigationMethod?: "FREE" | "SEQUENTIAL";
  };
  questions: LmsServedQuestion[];
  responses: Record<
    string,
    { response: unknown; responseText: string; markedForReview: boolean }
  >;
  timing: LmsTiming;
  serverTime: IsoDate;
  /** True when the request resumed a live attempt instead of starting one. */
  resumed?: boolean;
}

/** What a student needs before deciding whether to begin. */
export interface LmsAttemptAvailability {
  attempt: LmsAttemptSummary | null;
  canStart: boolean;
  attemptsAllowed: number;
  attemptsUsed: number;
  reason: string | null;
  timing: LmsTiming;
  serverTime: IsoDate;
}

export interface LmsStudentQuizDetail {
  quiz: LmsQuizSummary;
  availability: {
    availability: QuizAvailability;
    reason: string | null;
    msUntilClose: number | null;
  };
  attempt: LmsAttemptSummary | null;
  canStart: boolean;
  attemptsAllowed: number;
  attemptsUsed: number;
  timing: LmsTiming;
  serverTime: IsoDate;
}

/**
 * A student's own result.
 *
 * `released` is the answer to "may I see this yet?". When it is false the
 * payload carries a reason and no mark, because "not released yet" and "scored
 * zero" are entirely different things to a student.
 */
export interface LmsStudentResult {
  attempt: LmsAttemptSummary;
  quizId: string;
  title: string;
  maxMarks: number;
  passingMarks: number;
  resultReleasePolicy: ResultReleasePolicy;
  released: boolean;
  reason: string | null;
  submittedLate: boolean;
  idempotent: boolean;
  timing: LmsTiming;
  serverTime: IsoDate;
  questions?: LmsReviewedQuestion[];
}

export interface LmsSaveResult {
  success: boolean;
  saved: number;
  savedAt: IsoDate;
  attemptId: string;
  timing: {
    serverTime: IsoDate;
    expiresAt: IsoDate;
    msRemaining: number;
  };
}

/* ------------------------------------------------------------------ */
/* Marking                                                             */
/* ------------------------------------------------------------------ */

/** One answer as the marker sees it: the question, its key, and the response. */
export interface LmsGradingRow {
  question: LmsQuestion;
  response: unknown;
  responseText: string;
  awardedMarks: number | null;
  isCorrect: boolean | null;
  requiresManualGrading: boolean;
  markedForReview: boolean;
  feedback: string;
  gradedAt: IsoDate | null;
}

export interface LmsIntegrityEvent {
  type: string;
  at: IsoDate;
  ipAddress: string | null;
  userAgent: string | null;
  detail: string | null;
}

export interface LmsGradingSheet {
  attempt: LmsAttemptSummary & { studentId: string | null; passingMarks: number };
  quiz: {
    id: string;
    title: string;
    maxMarks: number;
    passingMarks: number;
    resultReleasePolicy: ResultReleasePolicy;
  };
  paper: LmsGradingRow[];
  integrityEvents: LmsIntegrityEvent[];
  canGrade: boolean;
  serverTime: IsoDate;
}

export interface LmsAttemptRoster {
  quizId: string;
  attempts: LmsAttemptSummary[];
  summary: {
    attempts: number;
    submitted: number;
    pendingManual: number;
    graded: number;
  };
  access: { sections: string[] };
  serverTime: IsoDate;
}

export interface LmsGradeResponse {
  success: boolean;
  attempt: LmsAttemptSummary;
  resultsReleased: boolean;
  pendingManualCount: number;
}

export interface LmsQuestionInsight {
  id: string;
  quizId: string | null;
  text: string;
  type: QuestionType;
  difficulty: string;
  marks: number;
  topic: string | null;
  category: string | null;
  attempts: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  pendingManual: number;
  failureRate: number | null;
  averageMarks: number | null;
  attemptCount?: number;
  correctCount?: number;
  questionId?: string;
}

/* ------------------------------------------------------------------ */
/* Gradebook, progress and analytics                                   */
/* ------------------------------------------------------------------ */

export interface LmsGradebookRow {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  weekNumber: number | null;
  weekTitle: string | null;
  maxMarks: number;
  marksObtained: number | null;
  percentage: number | null;
  status: "PENDING" | "GRADED" | "PUBLISHED" | string;
  isLate: boolean;
  feedback: string;
  gradedAt: IsoDate | null;
}

export interface LmsGradebookStudent {
  studentId: string;
  studentCode: string | null;
  name: string | null;
  section: string | null;
  rows: LmsGradebookRow[];
  totalMarks: number;
  obtainedMarks: number;
  gradedCount: number;
  pendingCount: number;
  percentage: number | null;
}

export interface LmsGradebook {
  assessments: {
    sourceId: string;
    sourceType: string;
    title: string;
    maxMarks: number;
    weekNumber: number | null;
    weekTitle: string | null;
  }[];
  students: LmsGradebookStudent[];
  access?: { sections: string[] };
}

/**
 * Per-student progress.
 *
 * `averageQuizScore` and `percentage` are nullable because a student who has not
 * been assessed yet has no average — reporting 0 would look like a failure.
 */
export interface LmsStudentProgress {
  id: string;
  studentId: string | null;
  name: string;
  program: string | null;
  batch: string | null;
  section: string | null;
  quizAttempts: number;
  assignmentsSubmitted: number;
  assignmentsTotal: number;
  lateSubmissions: number;
  averageQuizScore: number | null;
  obtainedMarks: number;
  totalMarks: number;
  pendingGrades: number;
  percentage: number | null;
}

export interface LmsProgressResponse {
  students: LmsStudentProgress[];
  lateSubmissions: number;
  serverTime: IsoDate;
}

export interface LmsWeeklyProgress {
  weeks: {
    id: string;
    weekNumber: number;
    title: string;
    status: WeekStatus;
    materials: number;
    quizzes: number;
    interactions: number;
    completion: number | null;
  }[];
  access: { canManage: boolean };
  serverTime: IsoDate;
}

export interface LmsEngagement {
  rosterSize: number;
  activeStudents: number;
  weeks: { published: number; total: number };
  materialsPublished: number;
  quizzes: {
    total: number;
    open: number;
    scheduled: number;
    closed: number;
    pendingGrading: number;
    attempts: number;
    participants: number;
    participationRate: number | null;
    averageScore: number | null;
  };
  assignments: {
    total: number;
    submissions: number;
    missing: number;
    late: number;
    submissionRate: number | null;
  };
  grades: {
    recorded: number;
    pending: number;
    averagePercentage: number | null;
  };
}

/**
 * A review prompt.
 *
 * Signals are observations with a suggested interpretation. They never change a
 * grade or a standing, and the view must not present them as a verdict.
 */
export interface LmsRiskSignal {
  key: string;
  severity: "high" | "medium" | "low";
  message: string;
  interpretation: string;
  students: {
    studentId: string | null;
    name: string | null;
    section: string | null;
    missed?: unknown[];
    percentage?: number | null;
  }[];
}

export interface LmsRiskSignals {
  signals: LmsRiskSignal[];
}

/* ------------------------------------------------------------------ */
/* Announcements and templates                                         */
/* ------------------------------------------------------------------ */

export interface LmsAnnouncement {
  id: string;
  courseId: string;
  weekId: string | null;
  title: string;
  body: string;
  pinned: boolean;
  scheduled: boolean;
  publishAt: IsoDate | null;
  publishedAt: IsoDate | null;
  alsoSendMail: boolean;
  mailSentAt: IsoDate | null;
  mailRecipientCount: number;
  authorUser: string;
  createdAt: IsoDate | null;
}

export interface LmsAnnouncementList {
  announcements: LmsAnnouncement[];
  canManage: boolean;
}

export interface LmsTemplate {
  id: string;
  code: string;
  name: string;
  description: string;
  program: string | null;
  semester: number | null;
  credits: number | null;
  weekCount: number;
  sourceCourse: string | null;
  updatedAt: IsoDate | null;
}

/* ------------------------------------------------------------------ */
/* Request payloads                                                    */
/* ------------------------------------------------------------------ */

export interface LmsQuizDraft {
  weekId?: string;
  title: string;
  description?: string;
  instructions?: string;
  maxMarks?: number;
  passingMarks?: number;
  durationMinutes?: number;
  attemptsAllowed?: number;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  allowBackNavigation?: boolean;
  allowReviewBeforeSubmit?: boolean;
  allowReopenExpired?: boolean;
  navigationMethod?: "FREE" | "SEQUENTIAL";
  multipleSelectGrading?: "EXACT" | "PARTIAL_CREDIT";
  blankAnswerCaseSensitive?: boolean;
  resultReleasePolicy?: ResultReleasePolicy;
  showCorrectAnswers?: boolean;
  openAt?: IsoDate;
  closeAt?: IsoDate;
  sectionCodes?: string[];
  semester?: number;
  academicYear?: string;
}

export interface LmsQuestionDraft {
  type?: QuestionType;
  text?: string;
  richText?: string;
  marks?: number;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  category?: string;
  topic?: string;
  explanation?: string;
  options?: { id?: string; text: string }[];
  correctAnswer?: unknown;
  bankQuestionId?: string;
  /** Stored position on the paper; the server assigns it on create. */
  position?: number;
}

export interface LmsAnswerPatch {
  questionId: string;
  response?: unknown;
  responseText?: string;
  markedForReview?: boolean;
}

export interface LmsGradeInput {
  questionId: string;
  /** `null` clears the mark and returns the answer to the queue. */
  awardedMarks?: number | null;
  feedback?: string;
}