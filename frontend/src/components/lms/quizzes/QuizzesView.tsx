import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRotateRight,
  faArrowUpRightFromSquare,
  faChartBar,
  faChartLine,
  faCircleCheck,
  faClipboardList,
  faClock,
  faGraduationCap,
  faLayerGroup,
  faPlay,
  faPlus,
  faRotateRight,
  faTriangleExclamation,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { FormField, Input, SelectField } from "../../ui/Input";
import { Modal } from "../../ui/Modal";
import { Skeleton } from "../../ui/Skeleton";
import { QuizAttemptRunner } from "../../modules/lms/QuizAttemptRunner";
import { QuizGradingPanel } from "../../modules/lms/QuizGradingPanel";
import { PageToolbar } from "../shared/PageToolbar";
import { SearchInput } from "../shared/SearchInput";
import { StatusBadge, toSemanticStatus } from "../shared/StatusBadge";
import { Drawer } from "../shared/Drawer";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { useDebouncedValue } from "../shared/useDebouncedValue";
import {
  addQuizQuestion,
  archiveQuiz,
  createQuiz,
  extendAttemptTime,
  extendQuizDeadline,
  fetchAttemptRoster,
  fetchCourseQuizzes,
  fetchCourseWeeks,
  fetchQuiz,
  fetchQuizInsights,
  isTeacherQuizDetail,
  reopenAttempt,
  removeQuizQuestion,
  releaseQuizResults,
  setQuizStatus,
  updateQuiz,
} from "../../../services/lmsApi";
import type {
  LmsAttemptSummary,
  LmsAttemptRoster,
} from "../../../types/lms";
import type {
  LmsQuestion,
  LmsQuestionDraft,
  LmsQuestionInsight,
  LmsQuizDetail,
  LmsQuizForTeacher,
  LmsQuizSummary,
  LmsStudentQuizDetail,
  LmsWeek,
  ResultReleasePolicy,
} from "../../../types/lms";
import {
  formatDeadline,
  formatMark,
  formatPercentage,
} from "../../../services/lmsApi";

export interface QuizzesViewProps {
  courseId: string;
  /** The server's answer for this caller on this course. */
  access: { canManage: boolean; role: string; sections: string[] };
  /** Server time, so availability badges agree with the clock that governs them. */
  serverTime: string;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

/**
 * The quizzes module.
 *
 * Instructors author quizzes (questions, configuration,
 * availability window), see attempts and grade them.
 * Students see only what the release policy allows them to
 * see — including whether a mark exists at all.
 */
export const QuizzesView: React.FC<QuizzesViewProps> = ({
  courseId,
  access,
  serverTime,
  onNotice,
  onError,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return (
      <QuizDetailView
        quizId={selectedId}
        courseId={courseId}
        access={access}
        serverTime={serverTime}
        onBack={() => setSelectedId(null)}
        onNotice={onNotice}
        onError={onError}
      />
    );
  }

  return (
    <QuizList
      courseId={courseId}
      access={access}
      serverTime={serverTime}
      onOpen={setSelectedId}
      onNotice={onNotice}
      onError={onError}
    />
  );
};

/* ------------------------------------------------------------------ */
/* List                                                              */
/* ------------------------------------------------------------------ */

const AVAILABILITY_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  OPEN: "Open",
  CLOSED: "Closed",
};

const QuizList: React.FC<{
  courseId: string;
  access: QuizzesViewProps["access"];
  serverTime: string;
  onOpen: (quizId: string) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ courseId, access, serverTime, onOpen, onNotice, onError }) => {
  const [quizzes, setQuizzes] = useState<LmsQuizSummary[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // The list route serves two payloads. A manager reads the
      // teacher payload with cohort counts; anyone else gets the
      // student-safe summary. The server decides which is sent —
      // the key never travels to a student.
      const result = access.canManage
        ? await fetchCourseQuizzes<LmsQuizForTeacher>(courseId)
        : await fetchCourseQuizzes(courseId);
      setQuizzes(result.quizzes);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Quizzes could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, access.canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const list = quizzes ?? [];
    if (!debouncedSearch.trim()) return list;
    const needle = debouncedSearch.trim().toLowerCase();
    return list.filter((row) =>
      row.title.toLowerCase().includes(needle),
    );
  }, [quizzes, debouncedSearch]);

  const now = Date.parse(serverTime) || Date.now();

  return (
    <div className="space-y-4">
      <PageToolbar
        search={{
          value: search,
          onChange: setSearch,
          label: "Search quizzes",
          placeholder: "Search quizzes…",
        }}
        actions={[
          {
            id: "create",
            label: "Create quiz",
            icon: faPlus,
            primary: true,
            hidden: !access.canManage,
            onClick: () => setCreateOpen(true),
          },
        ]}
      />

      {error && (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {loading && !quizzes ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={faClipboardList}
          title={debouncedSearch ? "No matching quizzes" : "No quizzes yet"}
          description={
            debouncedSearch
              ? `Nothing matches "${debouncedSearch}".`
              : "Build a quiz from the question bank or author questions directly — multiple choice, SQL, short answer and more."
          }
          actionLabel={
            debouncedSearch || !access.canManage
              ? undefined
              : "Create quiz"
          }
          actionIcon={debouncedSearch || !access.canManage ? undefined : faPlus}
          onAction={
            debouncedSearch || !access.canManage
              ? undefined
              : () => setCreateOpen(true)
          }
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((quiz) => (
            <li key={quiz.id}>
              <button
                type="button"
                onClick={() => onOpen(quiz.id)}
                className="flex w-full items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                  <FontAwesomeIcon icon={faClipboardList} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {quiz.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                    {quiz.questionCount != null && (
                      <span>
                        {quiz.questionCount} question{quiz.questionCount === 1 ? "" : "s"}
                      </span>
                    )}
                    <span>{quiz.maxMarks} marks</span>
                    {quiz.durationMinutes != null && (
                      <span>{quiz.durationMinutes} min</span>
                    )}
                    {quiz.attemptsAllowed > 1 && (
                      <span>{quiz.attemptsAllowed} attempts</span>
                    )}
                    {quiz.availableFrom && (
                      <span>
                        from {new Date(quiz.availableFrom).toLocaleString()}
                      </span>
                    )}
                    {quiz.availableUntil && (
                      <span>
                        until {new Date(quiz.availableUntil).toLocaleString()}
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge
                    status={toSemanticStatus(quiz.availability)}
                    label={AVAILABILITY_LABEL[quiz.availability] ?? quiz.availability}
                  />
                  {access.canManage && "attemptCount" in quiz && (
                    <span className="text-xs text-slate-400">
                      {(quiz as LmsQuizForTeacher).attemptCount} attempt
                      {(quiz as LmsQuizForTeacher).attemptCount === 1 ? "" : "s"}
                    </span>
                  )}
                  {!access.canManage && quiz.bestPercentage != null && (
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Best {formatPercentage(quiz.bestPercentage)}
                    </span>
                  )}
                  {!access.canManage && quiz.hasLiveAttempt && (
                    <Badge variant="info" size="sm" hideDot>
                      In progress
                    </Badge>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <CreateQuizModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        courseId={courseId}
        access={access}
        serverTime={serverTime}
        onCreated={(quiz) => {
          setCreateOpen(false);
          onNotice(`Quiz "${quiz.title}" created as a draft. Add questions before publishing.`);
          onOpen(quiz.id);
        }}
        onError={onError}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Create quiz modal                                               */
/* ------------------------------------------------------------------ */

const CreateQuizModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  access: QuizzesViewProps["access"];
  serverTime: string;
  onCreated: (quiz: LmsQuizDetail["quiz"]) => void;
  onError: (message: string) => void;
}> = ({ isOpen, onClose, courseId, access, serverTime, onCreated, onError }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [duration, setDuration] = useState("30");
  const [maxMarks, setMaxMarks] = useState("100");
  const [passing, setPassing] = useState("40");
  const [attempts, setAttempts] = useState("1");
  const [openAt, setOpenAt] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [weeks, setWeeks] = useState<LmsWeek[]>([]);
  const [weekId, setWeekId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setInstructions("");
      setDuration("30");
      setMaxMarks("100");
      setPassing("40");
      setAttempts("1");
      setOpenAt("");
      setCloseAt("");
      setWeekId("");
    }
  }, [isOpen]);

  // A quiz belongs to exactly one week, so the picker is
  // populated from the course's real week list — never a
  // free-text guess the server would reject.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchCourseWeeks(courseId);
        if (!cancelled) setWeeks(result.weeks);
      } catch {
        // The picker stays empty; the form says what is missing.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const submit = async () => {
    if (!title.trim() || !closeAt || !weekId) return;
    setBusy(true);
    try {
      const base = Date.parse(serverTime) || Date.now();
      const detail = await createQuiz(courseId, {
        weekId,
        title: title.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        durationMinutes: Number(duration) || 30,
        maxMarks: Number(maxMarks) || 100,
        passingMarks: Number(passing) || 0,
        attemptsAllowed: Math.max(1, Number(attempts) || 1),
        openAt: openAt
          ? new Date(openAt).toISOString()
          : new Date(base).toISOString(),
        closeAt: new Date(closeAt).toISOString(),
        sectionCodes: access.sections,
      });
      onCreated(detail.quiz);
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The quiz could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create quiz"
      subtitle="A draft — nothing is visible to students until it is published"
      maxWidth="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            isLoading={busy}
            loadingLabel="Creating"
            disabled={!title.trim() || !closeAt || !weekId}
          >
            Create quiz
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Title" required>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="cos-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Week 4 quiz — Arrays & complexity"
              autoFocus
            />
          )}
        </FormField>
        <FormField label="Week" required helperText="The quiz is filed under this week in the planner.">
          {({ id, describedBy, invalid }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="cos-input"
              value={weekId}
              onChange={(event) => setWeekId(event.target.value)}
            >
              <option value="">Choose a week…</option>
              {weeks.map((week) => (
                <option key={week.id} value={week.id}>
                  Week {week.weekNumber} — {week.title}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Description">
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              className="cos-input min-h-16 resize-y"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Instructions" helperText="Shown to students before they begin.">
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              className="cos-input min-h-16 resize-y"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Time limit (minutes)">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                min={1}
                aria-describedby={describedBy}
                className="cos-input"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Total marks">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                min={1}
                aria-describedby={describedBy}
                className="cos-input"
                value={maxMarks}
                onChange={(event) => setMaxMarks(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Passing marks">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                min={0}
                aria-describedby={describedBy}
                className="cos-input"
                value={passing}
                onChange={(event) => setPassing(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Attempts allowed">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                min={1}
                max={10}
                aria-describedby={describedBy}
                className="cos-input"
                value={attempts}
                onChange={(event) => setAttempts(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Opens">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="datetime-local"
                aria-describedby={describedBy}
                className="cos-input"
                value={openAt}
                onChange={(event) => setOpenAt(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Closes" required>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                type="datetime-local"
                required
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                className="cos-input"
                value={closeAt}
                onChange={(event) => setCloseAt(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Questions are added next — from scratch or from the question
          bank. Randomisation, pool sizing and the results policy are
          set in the quiz settings.
        </p>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Quiz detail — studio (teacher) or attempt (student)             */
/* ------------------------------------------------------------------ */

const QuizDetailView: React.FC<{
  quizId: string;
  courseId: string;
  access: QuizzesViewProps["access"];
  serverTime: string;
  onBack: () => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ quizId, access, serverTime, onBack, onNotice, onError }) => {
  const [detail, setDetail] = useState<LmsQuizDetail | LmsStudentQuizDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [gradingAttempt, setGradingAttempt] = useState<{
    attemptId: string;
    label: string;
  } | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchQuiz(quizId);
      setDetail(result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "This quiz could not be opened.",
      );
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !detail) {
    return (
      <EmptyState
        icon={faTriangleExclamation}
        title="This quiz could not be opened"
        description={`${error} Nothing has been substituted — retry once the connection is restored.`}
        actionLabel="Try again"
        actionIcon={faArrowRotateRight}
        onAction={() => void load()}
      />
    );
  }

  const isTeacher = access.canManage;
  const quiz = detail && isTeacherQuizDetail(detail) ? detail.quiz : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          ← Back to quizzes
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="cos-page-title truncate">
            {quiz?.title ?? "Quiz"}
          </h2>
          {quiz && (
            <p className="cos-page-subtitle">
              {quiz.questionCount ?? 0} questions · {quiz.maxMarks} marks
              {quiz.durationMinutes != null && ` · ${quiz.durationMinutes} min`}
              {quiz.attemptCount} attempts
              {quiz.pendingManualGradeCount > 0 &&
                ` · ${quiz.pendingManualGradeCount} awaiting manual grading`}
            </p>
          )}
        </div>
        {quiz && (
          <div className="flex items-center gap-2">
            <StatusBadge
              status={toSemanticStatus(quiz.availability)}
            />
            {isTeacher && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={faChartBar}
                  onClick={() => setInsightsOpen(true)}
                >
                  Insights
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={faRotateRight}
                  onClick={() => void load()}
                >
                  Refresh
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <Alert variant="warning" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {loading && !detail ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !detail ? null : isTeacher && isTeacherQuizDetail(detail) ? (
        <QuizStudio
          detail={detail}
          access={access}
          serverTime={serverTime}
          onNotice={onNotice}
          onError={onError}
          onChanged={() => void load()}
        />
      ) : (
        <StudentQuizPanel
          quizId={quizId}
          title={detail.quiz.title}
          quiz={detail.quiz}
          running={running}
          onStart={() => setRunning(true)}
          onFinished={() => {
            setRunning(false);
            void load();
          }}
          onNotice={onNotice}
          onError={onError}
        />
      )}

      {gradingAttempt && (
        <QuizGradingPanel
          attemptId={gradingAttempt.attemptId}
          attemptLabel={gradingAttempt.label}
          onClose={() => {
            setGradingAttempt(null);
            void load();
          }}
        />
      )}

      {insightsOpen && (
        <QuizInsightsDrawer
          quizId={quizId}
          title={quiz?.title ?? "Quiz"}
          onClose={() => setInsightsOpen(false)}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Quiz studio — questions, configuration, lifecycle               */
/* ------------------------------------------------------------------ */

const QuizStudio: React.FC<{
  detail: LmsQuizDetail;
  access: QuizzesViewProps["access"];
  serverTime: string;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onChanged: () => void;
}> = ({ detail, access, serverTime, onNotice, onError, onChanged }) => {
  const { quiz, questions, totals } = detail;
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);

  const availability = quiz.availability;

  return (
    <div className="space-y-4">
      {/* Lifecycle bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {quiz.openAt && `Opens ${new Date(quiz.openAt).toLocaleString()}`}
          {" · "}
          {quiz.closeAt && `Closes ${new Date(quiz.closeAt).toLocaleString()}`}
        </span>
        <span className="ms-auto flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </Button>
          {availability !== "OPEN" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await setQuizStatus(quiz.id, "OPEN");
                  onNotice("Quiz is now open for attempts.");
                  onChanged();
                } catch (requestError) {
                  onError(
                    requestError instanceof Error
                      ? requestError.message
                      : "The quiz could not be opened.",
                  );
                }
              }}
            >
              Open now
            </Button>
          )}
          {availability === "OPEN" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await setQuizStatus(quiz.id, "CLOSED");
                  onNotice("Quiz closed. Open attempts continue until their own deadline.");
                  onChanged();
                } catch (requestError) {
                  onError(
                    requestError instanceof Error
                      ? requestError.message
                      : "The quiz could not be closed.",
                  );
                }
              }}
            >
              Close
            </Button>
          )}
          {quiz.resultReleasePolicy === "MANUAL" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await releaseQuizResults(quiz.id);
                  onNotice("Results released to students.");
                  onChanged();
                } catch (requestError) {
                  onError(
                    requestError instanceof Error
                      ? requestError.message
                      : "Results could not be released.",
                  );
                }
              }}
            >
              Release results
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={faUsers}
            onClick={() => setRosterOpen(true)}
          >
            Monitor attempts
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={faClock}
            onClick={() => setExtendOpen(true)}
          >
            Extend deadline
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setBankOpen(true)}
          >
            Question bank
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={faPlus}
            onClick={() => setAddingQuestion(true)}
          >
            Add question
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setArchiveConfirm(true)}
          >
            Archive
          </Button>
        </span>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TotalCard label="Questions" value={String(totals.questionCount)} />
        <TotalCard label="Total marks" value={String(totals.questionMarks)} />
        <TotalCard
          label="Auto-gradable"
          value={String(totals.autoGradableCount)}
        />
        <TotalCard
          label="Manual grading"
          value={String(totals.manualGradingCount)}
          warn={totals.manualGradingCount > 0}
        />
      </div>

      {/* Question list */}
      {questions.length === 0 ? (
        <EmptyState
          icon={faLayerGroup}
          title="No questions yet"
          description="Add questions directly, or pull them from the question bank so this paper reuses vetted items."
          actionLabel="Add question"
          actionIcon={faPlus}
          onAction={() => setAddingQuestion(true)}
        />
      ) : (
        <ol className="space-y-2">
          {questions.map((question, index) => (
            <li
              key={question.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {question.text}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                  <Badge variant="neutral" size="sm" hideDot>
                    {question.type.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                  <Badge variant="neutral" size="sm" hideDot>
                    {question.difficulty.toLowerCase()}
                  </Badge>
                  {question.requiresManualGrading && (
                    <Badge variant="warning" size="sm" hideDot>
                      Manual grading
                    </Badge>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">
                {question.marks} marks
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await removeQuizQuestion(quiz.id, question.id);
                    onNotice("Question removed from the paper.");
                    onChanged();
                  } catch (requestError) {
                    onError(
                      requestError instanceof Error
                        ? requestError.message
                        : "The question could not be removed.",
                    );
                  }
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ol>
      )}

      {addingQuestion && (
        <AddQuestionDrawer
          quizId={quiz.id}
          onClose={() => setAddingQuestion(false)}
          onAdded={() => {
            setAddingQuestion(false);
            onNotice("Question added to the paper.");
            onChanged();
          }}
          onError={onError}
        />
      )}

      {bankOpen && (
        <QuestionBankDrawer
          courseId={detail.quiz.courseId}
          quizId={quiz.id}
          onClose={() => setBankOpen(false)}
          onAdded={(count) => {
            setBankOpen(false);
            onNotice(`${count} question${count === 1 ? "" : "s"} added from the bank.`);
            onChanged();
          }}
          onError={onError}
        />
      )}

      {settingsOpen && (
        <QuizSettingsDrawer
          quiz={quiz}
          serverTime={serverTime}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            onNotice("Quiz settings saved.");
            onChanged();
          }}
          onError={onError}
        />
      )}

      {rosterOpen && (
        <AttemptRosterDrawer
          quizId={quiz.id}
          quizTitle={quiz.title}
          quizStatus={quiz.status}
          availability={quiz.availability}
          closeAt={quiz.closeAt}
          allowReopenExpired={quiz.allowReopenExpired !== false}
          onClose={() => setRosterOpen(false)}
          onAction={() => {
            setRosterOpen(false);
            onChanged();
          }}
          onNotice={onNotice}
          onError={onError}
        />
      )}

      {extendOpen && (
        <ExtendDeadlineDrawer
          quizId={quiz.id}
          quizTitle={quiz.title}
          closeAt={quiz.closeAt}
          extensionHistory={quiz.extensionHistory || []}
          onClose={() => setExtendOpen(false)}
          onApplied={() => {
            setExtendOpen(false);
            onNotice("Deadline extension applied.");
            onChanged();
          }}
          onNotice={onNotice}
          onError={onError}
        />
      )}

      <ConfirmDialog
        isOpen={archiveConfirm}
        onClose={() => setArchiveConfirm(false)}
        onConfirm={async () => {
          setArchiveConfirm(false);
          try {
            const result = await archiveQuiz(quiz.id);
            if (result.archived) {
              onNotice("Quiz archived. Attempt records are retained.");
              onBackToStudio();
            } else {
              onNotice("Quiz purged — it had no attempts.");
              onBackToStudio();
            }
          } catch (requestError) {
            onError(
              requestError instanceof Error
                ? requestError.message
                : "The quiz could not be archived.",
            );
          }
        }}
        title="Archive quiz?"
        confirmLabel="Archive"
        message="The quiz leaves the active list. Student attempt records are retained for the academic record."
        subject={quiz.title}
        severity="warning"
      />
    </div>
  );

  function onBackToStudio() {
    onChanged();
  }
};

const TotalCard: React.FC<{
  label: string;
  value: string;
  warn?: boolean;
}> = ({ label, value, warn }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    <p
      className={`mt-0.5 text-xl font-semibold ${
        warn ? "text-amber-600" : "text-slate-900 dark:text-slate-100"
      }`}
    >
      {value}
    </p>
  </div>
);

/* ------------------------------------------------------------------ */
/* Add question drawer                                             */
/* ------------------------------------------------------------------ */

const QUESTION_TYPES: {
  value: NonNullable<LmsQuestionDraft["type"]>;
  label: string;
  manual: boolean;
}[] = [
  { value: "MULTIPLE_CHOICE", label: "Multiple choice (single)", manual: false },
  { value: "MULTIPLE_SELECT", label: "Multiple response (multiple)", manual: false },
  { value: "TRUE_FALSE", label: "True / false", manual: false },
  { value: "FILL_BLANK", label: "Fill in the blank", manual: false },
  { value: "NUMERIC", label: "Numeric response", manual: false },
  { value: "SHORT_ANSWER", label: "Short answer", manual: true },
  { value: "LONG_ANSWER", label: "Essay / Long answer", manual: true },
];

const AddQuestionDrawer: React.FC<{
  quizId: string;
  onClose: () => void;
  onAdded: () => void;
  onError: (message: string) => void;
}> = ({ quizId, onClose, onAdded, onError }) => {
  const [type, setType] = useState<LmsQuestionDraft["type"]>("MULTIPLE_CHOICE");
  const [text, setText] = useState("");
  const [marks, setMarks] = useState("5");
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [explanation, setExplanation] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(1);
  const [trueIsCorrect, setTrueIsCorrect] = useState(true);
  const [busy, setBusy] = useState(false);

  const isChoice =
    type === "MULTIPLE_CHOICE" || type === "MULTIPLE_SELECT";
  const isTrueFalse = type === "TRUE_FALSE";

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const draft: LmsQuestionDraft = {
        type,
        text: text.trim(),
        marks: Number(marks) || 1,
        difficulty,
        explanation: explanation.trim() || undefined,
      };
      if (isChoice) {
        draft.options = options
          .map((option) => option.trim())
          .filter(Boolean)
          .map((optionText) => ({ text: optionText }));
        draft.correctAnswer = [correctIndex];
      }
      if (isTrueFalse) {
        draft.options = [
          { text: "True" },
          { text: "False" },
        ];
        draft.correctAnswer = [trueIsCorrect ? 0 : 1];
      }
      await addQuizQuestion(quizId, draft);
      onAdded();
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The question could not be added.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Add question"
      subtitle="Added to the end of the paper"
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            isLoading={busy}
            loadingLabel="Adding"
            disabled={!text.trim()}
          >
            Add question
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Question type" required>
          {({ id, describedBy }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              className="cos-input"
              value={type}
              onChange={(event) =>
                setType(event.target.value as LmsQuestionDraft["type"])
              }
            >
              {QUESTION_TYPES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                  {entry.manual ? " (manual grading)" : ""}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label="Question" required>
          {({ id, describedBy, invalid }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="cos-input min-h-20 resize-y"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="What is the time complexity of binary search?"
              autoFocus
            />
          )}
        </FormField>

        {isChoice && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Options — select the correct one
            </p>
            {options.map((option, index) => (
              <label
                key={index}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition ${
                  correctIndex === index
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="correct-option"
                  checked={correctIndex === index}
                  onChange={() => setCorrectIndex(index)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                  aria-label={`Option ${String.fromCharCode(65 + index)} is correct`}
                />
                <span
                  className="me-1 w-4 shrink-0 text-xs font-semibold text-slate-400"
                  aria-hidden="true"
                >
                  {String.fromCharCode(65 + index)}
                </span>
                <input
                  value={option}
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? event.target.value : row,
                      ),
                    )
                  }
                  placeholder={`Option ${String.fromCharCode(65 + index)}`}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  aria-label={`Option ${String.fromCharCode(65 + index)}`}
                />
              </label>
            ))}
          </div>
        )}

        {isTrueFalse && (
          <div className="flex gap-2">
            {(["True", "False"] as const).map((label, index) => (
              <label
                key={label}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  (trueIsCorrect ? 0 : 1) === index
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="tf-correct"
                  checked={(trueIsCorrect ? 0 : 1) === index}
                  onChange={() => setTrueIsCorrect(index === 0)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                {label}
              </label>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Marks">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                min={1}
                aria-describedby={describedBy}
                className="cos-input"
                value={marks}
                onChange={(event) => setMarks(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Difficulty">
            {({ id, describedBy }) => (
              <select
                id={id}
                aria-describedby={describedBy}
                className="cos-input"
                value={difficulty}
                onChange={(event) =>
                  setDifficulty(
                    event.target.value as "EASY" | "MEDIUM" | "HARD",
                  )
                }
              >
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            )}
          </FormField>
          <FormField label="Explanation" helperText="Shown after results are released.">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                className="cos-input"
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
              />
            )}
          </FormField>
        </div>
      </div>
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */
/* Question bank drawer                                            */
/* ------------------------------------------------------------------ */

const QuestionBankDrawer: React.FC<{
  courseId: string;
  quizId: string;
  onClose: () => void;
  onAdded: (count: number) => void;
  onError: (message: string) => void;
}> = ({ courseId, quizId, onClose, onAdded, onError }) => {
  const [bank, setBank] = useState<LmsQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [typeFilter, setTypeFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchQuestionBankFor(courseId, {
        q: debouncedSearch || undefined,
        type: typeFilter || undefined,
        difficulty: difficultyFilter || undefined,
      });
      setBank(result.questions);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The question bank could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, debouncedSearch, typeFilter, difficultyFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const addSelected = async () => {
    setBusy(true);
    let added = 0;
    try {
      for (const question of bank.filter((row) =>
        selected.has(row.id),
      )) {
        try {
          await addQuizQuestion(quizId, {
            bankQuestionId: question.id,
            type: question.type,
            text: question.text,
            marks: question.marks,
            difficulty: question.difficulty,
            category: question.category ?? undefined,
            topic: question.topic ?? undefined,
            explanation: question.explanation || undefined,
            options: question.options.map((option) => ({
              text: option.text,
            })),
            correctAnswer: question.correctAnswer,
          });
          added += 1;
        } catch {
          // One bad item must not stop the rest of the bank import.
          onError(`"${question.text.slice(0, 60)}" could not be added.`);
        }
      }
      onAdded(added);
    } finally {
      setBusy(false);
    }
  };

  const visible = bank.filter((question) => {
    if (
      debouncedSearch.trim() &&
      !question.text.toLowerCase().includes(debouncedSearch.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Question bank"
      subtitle="Reuse vetted questions in this paper"
      width="lg"
      footer={
        <>
          <span className="me-auto text-xs text-slate-500 dark:text-slate-400">
            {selected.size} selected
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void addSelected()}
            disabled={selected.size === 0}
            isLoading={busy}
            loadingLabel="Adding"
          >
            Add selected
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          label="Search question bank"
          placeholder="Search questions…"
          className="w-full sm:w-56"
        />
        <SelectField
          label="Type"
          hideLabel
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          className="h-9 w-40 text-xs"
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {QUESTION_TYPES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Difficulty"
          hideLabel
          value={difficultyFilter}
          onChange={(event) => setDifficultyFilter(event.target.value)}
          className="h-9 w-32 text-xs"
          aria-label="Filter by difficulty"
        >
          <option value="">Any difficulty</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </SelectField>
      </div>

      {error ? (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      ) : loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={faLayerGroup}
          title="The bank is empty"
          description="Questions you author in any course quiz are saved to the bank for reuse."
        />
      ) : (
        <ul className="space-y-1.5">
          {visible.map((question) => (
            <li key={question.id}>
              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition ${
                  selected.has(question.id)
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(question.id)}
                  onChange={() =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(question.id)) next.delete(question.id);
                      else next.add(question.id);
                      return next;
                    })
                  }
                  className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                  aria-label={`Select question: ${question.text}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800 dark:text-slate-200">
                    {question.text}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                    <Badge variant="neutral" size="sm" hideDot>
                      {question.type.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                    <Badge variant="neutral" size="sm" hideDot>
                      {question.difficulty.toLowerCase()}
                    </Badge>
                    {question.topic && <span>{question.topic}</span>}
                    <span>{question.marks} marks</span>
                    {question.usageCount > 0 && (
                      <span>used {question.usageCount}×</span>
                    )}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
};

/** The bank is the course's own question set. */
async function fetchQuestionBankFor(
  courseId: string,
  query: { q?: string; type?: string; difficulty?: string },
): Promise<{ questions: LmsQuestion[] }> {
  const { fetchQuestionBank } = await import("../../../services/lmsApi");
  return fetchQuestionBank(courseId, query);
}

/* ------------------------------------------------------------------ */
/* Quiz settings drawer                                            */
/* ------------------------------------------------------------------ */

const QuizSettingsDrawer: React.FC<{
  quiz: LmsQuizForTeacher;
  serverTime: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}> = ({ quiz, serverTime, onClose, onSaved, onError }) => {
  const [duration, setDuration] = useState(String(quiz.durationMinutes ?? ""));
  const [attempts, setAttempts] = useState(String(quiz.attemptsAllowed));
  const [passing, setPassing] = useState(String(quiz.passingMarks));
  const [randomizeQuestions, setRandomizeQuestions] = useState(quiz.randomizeQuestions);
  const [randomizeOptions, setRandomizeOptions] = useState(quiz.randomizeOptions);
  const [allowBack, setAllowBack] = useState(quiz.allowBackNavigation);
  const [allowReview, setAllowReview] = useState(quiz.allowReviewBeforeSubmit);
  const [releasePolicy, setReleasePolicy] = useState<ResultReleasePolicy>(quiz.resultReleasePolicy);
  const [showCorrect, setShowCorrect] = useState(quiz.showCorrectAnswers);
  const [openAt, setOpenAt] = useState(
    quiz.openAt ? toLocalInput(quiz.openAt) : "",
  );
  const [closeAt, setCloseAt] = useState(
    quiz.closeAt ? toLocalInput(quiz.closeAt) : "",
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      // The whole configuration is patched through the quiz's
      // update route; the server refuses changes the academic
      // record no longer allows (marks once sat, windows once open).
      await updateQuiz(quiz.id, {
        durationMinutes: duration === "" ? null : Number(duration),
        attemptsAllowed: Math.max(1, Number(attempts) || 1),
        passingMarks: Number(passing) || 0,
        randomizeQuestions,
        randomizeOptions,
        allowBackNavigation: allowBack,
        allowReviewBeforeSubmit: allowReview,
        resultReleasePolicy: releasePolicy,
        showCorrectAnswers: showCorrect,
        openAt: openAt ? new Date(openAt).toISOString() : null,
        closeAt: closeAt ? new Date(closeAt).toISOString() : null,
      });
      onSaved();
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Quiz settings"
      subtitle="Availability, attempts and grading policy"
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            isLoading={busy}
            loadingLabel="Saving"
          >
            Save settings
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Time limit (minutes)" helperText="Empty = untimed.">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                min={1}
                aria-describedby={describedBy}
                className="cos-input"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Attempts allowed">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                min={1}
                max={10}
                aria-describedby={describedBy}
                className="cos-input"
                value={attempts}
                onChange={(event) => setAttempts(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Passing marks">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                min={0}
                aria-describedby={describedBy}
                className="cos-input"
                value={passing}
                onChange={(event) => setPassing(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Results release policy">
            {({ id, describedBy }) => (
              <select
                id={id}
                aria-describedby={describedBy}
                className="cos-input"
                value={releasePolicy}
                onChange={(event) =>
                  setReleasePolicy(event.target.value as ResultReleasePolicy)
                }
              >
                <option value="IMMEDIATELY">Immediately</option>
                <option value="AFTER_CLOSE">After the window closes</option>
                <option value="AFTER_GRADING">After grading</option>
                <option value="MANUAL">Manually by the instructor</option>
              </select>
            )}
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Opens">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="datetime-local"
                aria-describedby={describedBy}
                className="cos-input"
                value={openAt}
                onChange={(event) => setOpenAt(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Closes">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="datetime-local"
                aria-describedby={describedBy}
                className="cos-input"
                value={closeAt}
                onChange={(event) => setCloseAt(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <div className="space-y-2">
          <Toggle
            label="Randomize question order"
            checked={randomizeQuestions}
            onChange={setRandomizeQuestions}
          />
          <Toggle
            label="Randomize option order"
            checked={randomizeOptions}
            onChange={setRandomizeOptions}
          />
          <Toggle
            label="Allow back navigation"
            checked={allowBack}
            onChange={setAllowBack}
          />
          <Toggle
            label="Allow review before submit"
            checked={allowReview}
            onChange={setAllowReview}
          />
          <Toggle
            label="Show correct answers after release"
            checked={showCorrect}
            onChange={setShowCorrect}
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Server time is {new Date(serverTime).toLocaleString()} —
          availability is reconciled against the server clock, not
          this device's.
        </p>
      </div>
    </Drawer>
  );
};

const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
    <span className="text-sm text-slate-700 dark:text-slate-300">
      {label}
    </span>
    <input
      type="checkbox"
      role="switch"
      aria-checked={checked}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 accent-[var(--color-primary)]"
    />
  </label>
);

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ------------------------------------------------------------------ */
/* Insights drawer                                                 */
/* ------------------------------------------------------------------ */

const QuizInsightsDrawer: React.FC<{
  quizId: string;
  title: string;
  onClose: () => void;
}> = ({ quizId, title, onClose }) => {
  const [insights, setInsights] = useState<LmsQuestionInsight[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchQuizInsights(quizId);
        if (!cancelled) setInsights(result.questions);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Insights could not be loaded.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const sorted = useMemo(
    () => [...(insights ?? [])].sort((a, b) => {
      const rateA = a.failureRate ?? 0;
      const rateB = b.failureRate ?? 0;
      return rateB - rateA;
    }),
    [insights],
  );

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Quiz insights"
      subtitle={title}
      width="lg"
    >
      {error ? (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      ) : !insights ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : insights.length === 0 ? (
        <EmptyState
          icon={faChartLine}
          title="No attempts yet"
          description="Question performance appears once students have sat the quiz."
        />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sorted by failure rate — the questions the cohort struggles
            with most come first.
          </p>
          {sorted.map((question, index) => {
            const correctRate =
              question.attempts > 0
                ? Math.round((question.correct / question.attempts) * 100)
                : 0;
            return (
              <div
                key={question.id}
                className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    <span className="me-2 text-xs font-semibold text-slate-400">
                      Q{index + 1}
                    </span>
                    {question.text}
                  </p>
                  <span className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {correctRate}% correct
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={correctRate}
                  aria-label={`${correctRate}% answered correctly`}
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                >
                  <div
                    className={`h-full rounded-full ${
                      correctRate < 50
                        ? "bg-amber-500"
                        : "bg-[var(--color-primary)]"
                    }`}
                    style={{ width: `${correctRate}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  {question.attempts} attempts · {question.correct} correct ·{" "}
                  {question.incorrect} incorrect
                  {question.unanswered > 0 &&
                    ` · ${question.unanswered} unanswered`}
                  {question.averageMarks != null &&
                    ` · avg ${formatMark(question.averageMarks, question.marks)}`}
                </p>
                {(question.failureRate ?? 0) > 40 && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />
                    Potential concern — over 40% of attempts missed this
                    question. Consider reteaching the concept.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */
/* Attempt roster drawer                                              */
/* ------------------------------------------------------------------ */

const AttemptRosterDrawer: React.FC<{
  quizId: string;
  quizTitle: string;
  quizStatus: string;
  availability: string;
  closeAt: string | null;
  allowReopenExpired: boolean;
  onClose: () => void;
  onAction: () => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({
  quizId,
  quizTitle,
  quizStatus,
  availability,
  closeAt,
  allowReopenExpired,
  onClose,
  onAction,
  onNotice,
  onError,
}) => {
  const [roster, setRoster] = useState<LmsAttemptRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [extending, setExtending] = useState<string | null>(null);
  const [reopening, setReopening] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAttemptRoster(quizId);
      setRoster(result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The attempt roster could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExtend = async (attempt: LmsAttemptSummary) => {
    setExtending(attempt.id);
    try {
      const additionalMinutes = 30; // Default extension
      await extendAttemptTime(attempt.id, { additionalMinutes, reason: "Teacher extension" });
      onNotice("Attempt extended by 30 minutes.");
      onAction();
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The attempt could not be extended.",
      );
    } finally {
      setExtending(null);
    }
  };

  const handleReopen = async (attempt: LmsAttemptSummary) => {
    if (!allowReopenExpired) {
      onError("This quiz does not permit reopening expired attempts.");
      return;
    }
    setReopening(attempt.id);
    try {
      const additionalMinutes = 30; // Default reopen time
      await reopenAttempt(attempt.id, { additionalMinutes, reason: "Teacher reopened" });
      onNotice("Attempt reopened for 30 minutes.");
      onAction();
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The attempt could not be reopened.",
      );
    } finally {
      setReopening(null);
    }
  };

  const visible = (roster?.attempts || [])
    .filter((attempt: LmsAttemptSummary) => {
      if (!filter) return true;
      const needle = filter.toLowerCase();
      return (
        (attempt.studentId?.toLowerCase().includes(needle) ?? false) ||
        (attempt.name?.toLowerCase().includes(needle) ?? false) ||
        (attempt.section?.toLowerCase().includes(needle) ?? false)
      );
    }) || [];

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Monitor attempts"
      subtitle={quizTitle}
      width="lg"
      footer={
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Close
        </Button>
      }
    >
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={faUsers}
          title="No attempts yet"
          description="Students have not started this quiz."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <SearchInput
              value={filter}
              onChange={setFilter}
              label="Filter attempts"
              placeholder="Search by name, ID or section…"
              className="w-full sm:w-64"
            />
            <select
              className="cos-input w-40 text-xs"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="AUTO_SUBMITTED">Auto-submitted</option>
              <option value="GRADED">Graded</option>
              <option value="PENDING_GRADING">Pending grading</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="pb-2">Student</th>
                  <th className="pb-2">Section</th>
                  <th className="pb-2">Attempt</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Started</th>
                  <th className="pb-2">Submitted</th>
                  <th className="pb-2">Score</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((attempt: LmsAttemptSummary) => (
                  <tr
                    key={attempt.id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-2 font-medium text-slate-900 dark:text-slate-100">
                      {attempt.name || attempt.studentId || "—"}
                    </td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">
                      {attempt.section || "—"}
                    </td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">
                      #{attempt.attemptNumber}
                    </td>
                    <td className="py-2">
                      <StatusBadge
                        status={toSemanticStatus(attempt.status)}
                        label={attempt.status.replace(/_/g, " ").toLowerCase()}
                      />
                    </td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">
                      {attempt.startedAt ? new Date(attempt.startedAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">
                      {attempt.submittedAt
                        ? new Date(attempt.submittedAt).toLocaleString()
                        : attempt.status === "IN_PROGRESS"
                          ? "In progress"
                          : "—"}
                      {attempt.autoSubmitted && <span className="ml-1 text-xs text-amber-600">(auto)</span>}
                    </td>
                    <td className="py-2">
                      {attempt.awardedMarks != null ? (
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {formatMark(attempt.awardedMarks, attempt.maxMarks)}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">Not released</span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        {attempt.status === "IN_PROGRESS" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleExtend(attempt)}
                            disabled={extending === attempt.id}
                            isLoading={extending === attempt.id}
                            loadingLabel="Extending"
                          >
                            Extend
                          </Button>
                        )}
                        {(attempt.status === "SUBMITTED" ||
                          attempt.status === "AUTO_SUBMITTED") &&
                          attempt.pendingManualCount > 0 && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              // Navigation to grading panel handled by parent
                              onClose();
                              // The parent QuizStudio will open the grading panel
                            }}
                          >
                            Grade
                          </Button>
                        )}
                        {allowReopenExpired &&
                          (attempt.status === "SUBMITTED" ||
                            attempt.status === "AUTO_SUBMITTED") && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleReopen(attempt)}
                            disabled={reopening === attempt.id}
                            isLoading={reopening === attempt.id}
                            loadingLabel="Reopening"
                          >
                            Reopen
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */
/* Extend deadline drawer                                             */
/* ------------------------------------------------------------------ */

const ExtendDeadlineDrawer: React.FC<{
  quizId: string;
  quizTitle: string;
  closeAt: string | null;
  extensionHistory: Array<{
    extendedBy: string;
    extendedAt: string;
    previousCloseAt: string;
    revisedCloseAt: string;
    reason: string;
  }>;
  onClose: () => void;
  onApplied: () => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({
  quizId,
  quizTitle,
  closeAt,
  extensionHistory,
  onClose,
  onApplied,
  onNotice,
  onError,
}) => {
  const [newCloseAt, setNewCloseAt] = useState("");
  const [additionalMinutes, setAdditionalMinutes] = useState("30");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    if (!newCloseAt && !additionalMinutes) return;
    setBusy(true);
    try {
      if (newCloseAt) {
        await extendQuizDeadline(quizId, {
          newCloseAt: new Date(newCloseAt).toISOString(),
          reason: reason.trim() || undefined,
        });
      } else {
        await extendQuizDeadline(quizId, {
          additionalMinutes: Number(additionalMinutes) || 30,
          reason: reason.trim() || undefined,
        });
      }
      onNotice("Deadline extended for all students.");
      onApplied();
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The deadline could not be extended.",
      );
    } finally {
      setBusy(false);
    }
  };

  const currentCloseAt = closeAt ? new Date(closeAt).toLocaleString() : "Not set";

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Extend quiz deadline"
      subtitle={quizTitle}
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void apply()}
            isLoading={busy}
            loadingLabel="Applying"
            disabled={!newCloseAt && !additionalMinutes}
          >
            Extend deadline
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Current closing time: <strong>{currentCloseAt}</strong>
          </p>
          {extensionHistory.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-slate-500 cursor-pointer">
                View extension history ({extensionHistory.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                {extensionHistory.map((ext, index) => (
                  <li key={index}>
                    {new Date(ext.extendedAt).toLocaleString()} —
                    {new Date(ext.previousCloseAt).toLocaleString()} →{" "}
                    {new Date(ext.revisedCloseAt).toLocaleString()}
                    {ext.reason && ` (${ext.reason})`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <FormField label="New closing time" helperText="Leave empty to add minutes instead.">
          {({ id, describedBy }) => (
            <input
              id={id}
              type="datetime-local"
              aria-describedby={describedBy}
              className="cos-input"
              value={newCloseAt}
              onChange={(event) => setNewCloseAt(event.target.value)}
            />
          )}
        </FormField>

        <FormField label="Additional minutes" helperText="Used if new closing time is empty.">
          {({ id, describedBy }) => (
            <input
              id={id}
              type="number"
              min={1}
              max={1440}
              aria-describedby={describedBy}
              className="cos-input"
              value={additionalMinutes}
              onChange={(event) => setAdditionalMinutes(event.target.value)}
            />
          )}
        </FormField>

        <FormField label="Reason">
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              className="cos-input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional reason for the extension"
            />
          )}
        </FormField>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          This extends the quiz closing time for all students and pushes the
          deadline for any active attempts. Individual extensions are handled
          from the attempt roster.
        </p>
      </div>
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */
/* Student panel — availability, attempt, result                   */
/* ------------------------------------------------------------------ */

const StudentQuizPanel: React.FC<{
  quizId: string;
  title: string;
  quiz: LmsQuizSummary;
  running: boolean;
  onStart: () => void;
  onFinished: () => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ quizId, title, quiz, running, onStart, onFinished, onNotice, onError }) => {
  const [result, setResult] = useState<string | null>(null);

  if (running) {
    return (
      <QuizAttemptRunner
        quizId={quizId}
        quizTitle={title}
        onFinished={(attemptResult) => {
          onFinished();
          setResult(
            attemptResult.released
              ? `Submitted. ${
                  attemptResult.attempt.awardedMarks != null
                    ? `Score: ${formatMark(
                        attemptResult.attempt.awardedMarks,
                        attemptResult.attempt.maxMarks,
                      )}.`
                    : "Your paper is being marked."
                }`
              : `Submitted. Results appear ${
                  attemptResult.reason
                    ? `— ${attemptResult.reason}`
                    : "after the release policy allows."
                }`,
          );
        }}
        onClose={onFinished}
      />
    );
  }

  const availability = quiz.availability;
  const canStart = availability === "OPEN";

  return (
    <div className="space-y-4">
      {result && (
        <Alert variant="success" onDismiss={() => setResult(null)}>
          {result}
        </Alert>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge
            status={toSemanticStatus(availability)}
            label={AVAILABILITY_LABEL[availability] ?? availability}
          />
          {quiz.attemptsUsed != null && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {quiz.attemptsUsed} of {quiz.attemptsAllowed} attempt
              {quiz.attemptsAllowed === 1 ? "" : "s"} used
            </span>
          )}
          {quiz.availableUntil && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Closes {new Date(quiz.availableUntil).toLocaleString()}
            </span>
          )}
        </div>

        {quiz.instructions && (
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Instructions
            </h3>
            <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
              {quiz.instructions}
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canStart ? (
            <Button
              variant="primary"
              icon={faPlay}
              onClick={onStart}
            >
              {quiz.hasLiveAttempt ? "Resume attempt" : "Start quiz"}
            </Button>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {availability === "DRAFT"
                ? "This quiz is still being prepared."
                : availability === "SCHEDULED"
                  ? "This quiz opens at its scheduled time."
                  : availability === "CLOSED"
                    ? "The submission window for this quiz has closed."
                    : "This quiz is not available right now."}
              {quiz.availabilityReason && ` (${quiz.availabilityReason})`}
            </p>
          )}
        </div>
      </div>

      {/* Attempt history — marks only when the release policy allows */}
      {quiz.attempts && quiz.attempts.length > 0 && (
        <section aria-label="Attempt history">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Attempt history
          </h3>
          <ul className="space-y-1.5">
            {quiz.attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
              >
                <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-300">
                  Attempt {attempt.attemptNumber} ·{" "}
                  {attempt.submittedAt
                    ? new Date(attempt.submittedAt).toLocaleString()
                    : "in progress"}
                  {attempt.autoSubmitted && " (auto-submitted at the deadline)"}
                </span>
                {attempt.awardedMarks != null ? (
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatMark(attempt.awardedMarks, attempt.maxMarks)}
                  </span>
                ) : (
                  <Badge variant="neutral" size="sm" hideDot>
                    Not released
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {quiz.bestPercentage != null && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
          <FontAwesomeIcon icon={faGraduationCap} className="text-[var(--color-primary)]" aria-hidden="true" />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Best score:{" "}
            <span className="font-semibold">
              {formatPercentage(quiz.bestPercentage)}
            </span>
            {quiz.passingMarks > 0 &&
              ` (passing: ${formatPercentage(
                Math.round((quiz.passingMarks / quiz.maxMarks) * 100),
              )})`}
          </p>
        </div>
      )}
    </div>
  );
};

export default QuizzesView;
