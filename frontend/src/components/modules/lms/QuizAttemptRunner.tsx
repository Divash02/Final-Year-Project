import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  faArrowLeft,
  faArrowRight,
  faBookmark,
  faCheck,
  faCircleCheck,
  faClock,
  faEraser,
  faExclamationTriangle,
  faFlag,
  faGraduationCap,
  faLayerGroup,
  faPaperPlane,
  faRotate,
  faShieldHalved,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Modal } from "../../ui/Modal";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import {
  fetchAttemptAvailability,
  fetchAttemptResult,
  formatCountdown,
  formatMark,
  formatPercentage,
  recordIntegrityEvent,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "../../../services/lmsApi";
import type {
  LmsAttemptRuntime,
  LmsServedQuestion,
  LmsStudentResult,
} from "../../../types/lms";

const AUTOSAVE_INTERVAL_MS = 15000;

/** The local draft of one answer. `null` means "not answered". */
export type DraftAnswer = { response: unknown; responseText: string; markedForReview: boolean };

export const emptyDraft: DraftAnswer = { response: null, responseText: "", markedForReview: false };

export function isAnswered(draft: DraftAnswer | undefined): boolean {
  if (!draft) return false;
  if (Array.isArray(draft.response)) {
    return draft.response.some((val) => String(val ?? "").trim() !== "");
  }
  if (draft.response !== null && draft.response !== undefined && String(draft.response).trim() !== "") {
    return true;
  }
  return draft.responseText.trim().length > 0;
}

export interface QuizAttemptRunnerProps {
  quizId: string;
  quizTitle: string;
  courseName?: string;
  courseCode?: string;
  previewMode?: boolean;
  onFinished: (result: LmsStudentResult) => void;
  onClose: () => void;
}

/**
 * Moodle-Style 3-Column Examination Runner.
 *
 * Left Sidebar: Question Status & Attempt Information
 * Center Panel: Active Question Card with Rich Media, Form Inputs, Prev/Next Controls, Clear Response
 * Right Sidebar: Question Tile Grid Navigator with Flagged/Answered/Current indicators, Finish Attempt button
 * Top Header: Branding, Quiz & Course title, Student Identity, Attempt Number, Live Server-Synced Countdown Timer, Autosave Status
 */
export const QuizAttemptRunner: React.FC<QuizAttemptRunnerProps> = ({
  quizId,
  quizTitle,
  courseName,
  courseCode,
  previewMode = false,
  onFinished,
  onClose,
}) => {
  const { currentUser } = useCollegeOS();
  const [runtime, setRuntime] = useState<LmsAttemptRuntime | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftAnswer>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [msRemaining, setMsRemaining] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"IDLE" | "SAVING" | "SAVED" | "FAILED">("IDLE");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [result, setResult] = useState<LmsStudentResult | null>(null);

  const dirty = useRef<Set<string>>(new Set());
  const submitted = useRef(false);
  const lastSyncTime = useRef<number>(Date.now());

  /* ---------------------------------------------------------------- */
  /* Loading                                                           */
  /* ---------------------------------------------------------------- */

  const begin = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const availability = await fetchAttemptAvailability(quizId);
      if (!availability.canStart && !availability.attempt) {
        throw new Error(availability.reason || "This quiz cannot be started right now.");
      }
      const started = await startAttempt(quizId);
      const seeded: Record<string, DraftAnswer> = {};
      for (const question of started.questions) {
        const saved = started.responses[question.id];
        seeded[question.id] = saved
          ? {
              response: saved.response,
              responseText: saved.responseText || "",
              markedForReview: Boolean(saved.markedForReview),
            }
          : emptyDraft;
      }
      setDrafts(seeded);
      setRuntime(started);
      setMsRemaining(started.timing.msRemaining ?? null);
      lastSyncTime.current = Date.now();
      dirty.current = new Set();
      setSaveState("SAVED");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The examination paper could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  }, [quizId]);

  useEffect(() => {
    void begin();
  }, [begin]);

  /* ---------------------------------------------------------------- */
  /* Countdown Timer - Server Synced & Monotonic                        */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (msRemaining === null || submitted.current) return;
    const timer = window.setInterval(() => {
      setMsRemaining((current) => {
        if (current === null) return null;
        const next = Math.max(0, current - 1000);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [msRemaining === null]);

  const expired = msRemaining !== null && msRemaining <= 0;

  /* ---------------------------------------------------------------- */
  /* Persistence & Autosave                                            */
  /* ---------------------------------------------------------------- */

  const persist = useCallback(async () => {
    if (submitted.current || !runtime || dirty.current.size === 0) return;
    const questionIds = Array.from(dirty.current);
    setSaving(true);
    setSaveState("SAVING");
    try {
      const saveRes = await saveAnswers(
        runtime.attempt.id,
        questionIds.map((questionId) => {
          const draft = drafts[questionId] ?? emptyDraft;
          return {
            questionId,
            response: draft.response,
            responseText: draft.responseText,
            markedForReview: draft.markedForReview,
          };
        }),
      );
      dirty.current = new Set();
      setSavedAt(saveRes.savedAt);
      setSaveState("SAVED");
      // Server-authoritative remaining time
      if (typeof saveRes.timing.msRemaining === "number") {
        setMsRemaining(saveRes.timing.msRemaining);
      }
    } catch (requestError) {
      setSaveState("FAILED");
      setError(
        requestError instanceof Error
          ? `Autosave failed: ${requestError.message}`
          : "Autosave failed. Retrying shortly.",
      );
      void recordIntegrityEvent(runtime.attempt.id, "AUTOSAVE_FAILED", "Autosave failed").catch(() => {});
    } finally {
      setSaving(false);
    }
  }, [drafts, runtime]);

  useEffect(() => {
    const timer = window.setInterval(() => void persist(), AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [persist]);

  /* ---------------------------------------------------------------- */
  /* Answering & Flagging Handlers                                     */
  /* ---------------------------------------------------------------- */

  const patch = useCallback((questionId: string, changes: Partial<DraftAnswer>) => {
    if (expired || submitted.current) return;
    dirty.current.add(questionId);
    setSaveState("SAVING");
    setDrafts((current) => ({
      ...current,
      [questionId]: { ...(current[questionId] ?? emptyDraft), ...changes },
    }));
  }, [expired]);

  const toggleFlag = useCallback((questionId: string) => {
    if (expired || submitted.current) return;
    dirty.current.add(questionId);
    setDrafts((current) => {
      const existing = current[questionId] ?? emptyDraft;
      return {
        ...current,
        [questionId]: { ...existing, markedForReview: !existing.markedForReview },
      };
    });
  }, [expired]);

  const clearAnswer = useCallback((questionId: string) => {
    if (expired || submitted.current) return;
    dirty.current.add(questionId);
    setDrafts((current) => ({
      ...current,
      [questionId]: { ...(current[questionId] ?? emptyDraft), response: null, responseText: "" },
    }));
  }, [expired]);

  /* ---------------------------------------------------------------- */
  /* Final Submission                                                  */
  /* ---------------------------------------------------------------- */

  const submit = useCallback(async () => {
    if (!runtime || submitted.current) return;
    setBusy(true);
    try {
      if (dirty.current.size > 0) {
        await persist();
      }
      const finalResult = await submitAttempt(runtime.attempt.id);
      submitted.current = true;
      setResult(finalResult);
      onFinished(finalResult);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The attempt could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }, [onFinished, persist, runtime]);

  // When timer hits 0, auto-submit attempt
  useEffect(() => {
    if (expired && runtime && !submitted.current && !busy) {
      void submit();
    }
  }, [busy, expired, runtime, submit]);

  /* ---------------------------------------------------------------- */
  /* Visibility & Connection Integrity Signal Recording                */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!runtime || submitted.current) return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        void recordIntegrityEvent(runtime.attempt.id, "TAB_HIDDEN").catch(() => {});
      } else {
        void recordIntegrityEvent(runtime.attempt.id, "TAB_VISIBLE").catch(() => {});
      }
    };
    const onOnline = () => {
      void recordIntegrityEvent(runtime.attempt.id, "RECONNECTED").catch(() => {});
      void persist();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("online", onOnline);
    };
  }, [persist, runtime]);

  /* ---------------------------------------------------------------- */
  /* Question Status Computations                                      */
  /* ---------------------------------------------------------------- */

  const questions = runtime?.questions ?? [];
  const totalQuestions = questions.length;
  const answeredCount = useMemo(
    () => questions.filter((q) => isAnswered(drafts[q.id])).length,
    [drafts, questions],
  );
  const unansweredCount = totalQuestions - answeredCount;
  const flaggedCount = useMemo(
    () => questions.filter((q) => drafts[q.id]?.markedForReview).length,
    [drafts, questions],
  );

  const activeQuestion: LmsServedQuestion | undefined = questions[currentIndex];
  const activeDraft: DraftAnswer = activeQuestion ? drafts[activeQuestion.id] ?? emptyDraft : emptyDraft;
  const isSequential = runtime?.quiz.navigationMethod === "SEQUENTIAL";

  // Check navigation boundary for sequential mode
  const canGoNext = currentIndex < totalQuestions - 1;
  const canGoPrev = currentIndex > 0 && !isSequential && (runtime?.quiz.allowBackNavigation !== false);

  if (result) {
    return (
      <StudentResultView
        result={result}
        attemptsAllowed={runtime?.quiz.attemptsAllowed ?? 1}
        onReviewAgain={() => {
          setResult(null);
          setRuntime(null);
          void begin();
        }}
        onClose={onClose}
      />
    );
  }

  if (!runtime || !activeQuestion) {
    return (
      <Card title={quizTitle} icon={faClock}>
        {error ? (
          <Alert variant="error" detail="Unable to start examination attempt.">
            {error}
          </Alert>
        ) : (
          <div className="flex items-center gap-3 py-6 text-sm text-slate-500">
            <FontAwesomeIcon icon={faRotate} className="animate-spin text-slate-400" />
            <span>Loading Moodle-Style Examination Interface…</span>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-800 antialiased dark:bg-slate-950 dark:text-slate-100">
      {/* ------------------------------------------------------------ */}
      {/* A. Top Examination Header                                    */}
      {/* ------------------------------------------------------------ */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary,#1d4ed8)] text-white font-bold shadow-xs">
              <FontAwesomeIcon icon={faGraduationCap} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary,#1d4ed8)]">
                  CollegeOS Examination
                </span>
                {previewMode && (
                  <Badge variant="warning" size="sm">
                    Teacher Preview Mode
                  </Badge>
                )}
              </div>
              <h1 className="text-base font-bold text-slate-900 dark:text-slate-50">
                {runtime.quiz.title}
                {(courseCode || courseName) && (
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    {" "}({courseCode ? `${courseCode} · ` : ""}{courseName || ""})
                  </span>
                )}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Authenticated Student Identity & Attempt */}
            <div className="hidden text-right text-xs sm:block">
              <p className="font-medium text-slate-900 dark:text-slate-200">
                {currentUser?.name || currentUser?.email || "Authenticated Student"}
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Attempt {runtime.attempt.attemptNumber} of {runtime.quiz.attemptsAllowed || 1}
              </p>
            </div>

            {/* Live Countdown Timer */}
            {msRemaining !== null && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm font-bold tracking-wider ${
                  msRemaining <= 60000
                    ? "border-red-400 bg-red-50 text-red-700 animate-pulse dark:border-red-800 dark:bg-red-950/60 dark:text-red-300"
                    : msRemaining <= 300000
                      ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      : "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                }`}
                title="Time remaining until effective deadline"
              >
                <FontAwesomeIcon icon={faClock} className="text-xs opacity-75" />
                <span className="text-xs font-sans font-medium text-slate-500 dark:text-slate-400">
                  Time left:
                </span>
                <span className="tabular-nums">{formatCountdown(msRemaining)}</span>
              </div>
            )}

            {/* Autosave Status */}
            <div className="flex items-center">
              {saveState === "SAVING" ? (
                <Badge variant="info" size="sm">
                  Saving…
                </Badge>
              ) : saveState === "FAILED" ? (
                <Badge variant="danger" size="sm">
                  Save failed
                </Badge>
              ) : (
                <Badge variant="success" size="sm">
                  Saved
                </Badge>
              )}
            </div>

            {/* Finish Attempt Top Action */}
            <Button
              size="sm"
              variant="primary"
              icon={faPaperPlane}
              onClick={() => {
                if (dirty.current.size > 0) void persist();
                setConfirmSubmitOpen(true);
              }}
              disabled={expired || busy}
            >
              Finish attempt…
            </Button>
          </div>
        </div>
      </header>

      {/* Expiration or Urgent Alert Banner */}
      {expired && (
        <div className="bg-red-600 px-4 py-2.5 text-center text-xs font-semibold text-white shadow-xs">
          Time expired! The examination deadline has passed. Answers are locked while submission finalizes.
        </div>
      )}
      {msRemaining !== null && msRemaining <= 60000 && !expired && (
        <div className="bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-slate-950">
          Final minute warning! Ensure all responses are complete before the deadline.
        </div>
      )}
      {error && (
        <div className="mx-auto mt-3 max-w-7xl px-4 sm:px-6">
          <Alert variant="warning" onDismiss={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* 3-Column Moodle Examination Layout                           */}
      {/* ------------------------------------------------------------ */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 sm:p-6 lg:flex-row">
        {/* ========================================================== */}
        {/* B. Left Sidebar: Question Status & Attempt Info            */}
        {/* ========================================================== */}
        <aside className="w-full shrink-0 space-y-4 lg:w-64" aria-label="Attempt Information">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Attempt Summary
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Attempt:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {runtime.attempt.attemptNumber} of {runtime.quiz.attemptsAllowed || 1}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Total Questions:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{totalQuestions}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Answered:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {answeredCount}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Not Answered:</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {unansweredCount}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 dark:text-slate-400">Flagged:</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {flaggedCount}
                </span>
              </div>
            </div>
          </div>

          {/* Current Question Meta Box */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Current Question
            </h3>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Question {currentIndex + 1}
            </p>
            <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <p>
                Status:{" "}
                <strong className={isAnswered(activeDraft) ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                  {isAnswered(activeDraft) ? "Answer saved" : "Not yet answered"}
                </strong>
              </p>
              <p>
                Marked out of: <strong>{activeQuestion.marks}</strong>
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button
                size="sm"
                variant={activeDraft.markedForReview ? "secondary" : "secondary"}
                icon={faFlag}
                className="w-full justify-center"
                onClick={() => toggleFlag(activeQuestion.id)}
                disabled={expired}
              >
                {activeDraft.markedForReview ? "Remove flag" : "Flag question"}
              </Button>
            </div>
          </div>

          {/* Guidelines / Navigation rules */}
          {runtime.quiz.instructions && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Notice</h4>
              <p className="line-clamp-4">{runtime.quiz.instructions}</p>
            </div>
          )}
        </aside>

        {/* ========================================================== */}
        {/* C. Center Panel: Active Question                           */}
        {/* ========================================================== */}
        <section className="flex-1 min-w-0 space-y-4" aria-label="Question Content">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            {/* Question Header & Flag Toggle */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Question {currentIndex + 1} of {totalQuestions}
                </span>
                <span className="ms-2 inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {activeQuestion.marks} mark{activeQuestion.marks === 1 ? "" : "s"}
                </span>
                {activeQuestion.category && (
                  <span className="ms-2 text-xs text-slate-400">· {activeQuestion.category}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggleFlag(activeQuestion.id)}
                disabled={expired}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  activeDraft.markedForReview
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <FontAwesomeIcon
                  icon={faFlag}
                  className={activeDraft.markedForReview ? "text-amber-500" : "text-slate-400"}
                />
                <span>{activeDraft.markedForReview ? "Flagged for review" : "Flag for review"}</span>
              </button>
            </div>

            {/* Question Text */}
            <div className="mb-6 space-y-3">
              <div className="text-base font-normal leading-relaxed text-slate-900 dark:text-slate-100">
                {activeQuestion.richText ? (
                  <div dangerouslySetInnerHTML={{ __html: activeQuestion.richText }} />
                ) : (
                  <p className="whitespace-pre-wrap">{activeQuestion.text}</p>
                )}
              </div>

              {/* Code Snippet if applicable */}
              {activeQuestion.codeSnippet && (
                <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-xs text-slate-100">
                  {activeQuestion.codeSnippet}
                </pre>
              )}

              {/* Mathematical / Technical Notation */}
              {activeQuestion.notation && (
                <div className="rounded-lg bg-slate-50 p-3 font-mono text-sm italic text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {activeQuestion.notation}
                </div>
              )}
            </div>

            {/* Question Response Inputs */}
            <div className="mb-6 border-t border-slate-100 pt-5 dark:border-slate-800">
              <QuestionInputRenderer
                question={activeQuestion}
                draft={activeDraft}
                disabled={expired || busy}
                onPatch={(changes) => patch(activeQuestion.id, changes)}
              />
            </div>

            {/* Clear response option where applicable */}
            {isAnswered(activeDraft) && !expired && (
              <div className="mb-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => clearAnswer(activeQuestion.id)}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 underline hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <FontAwesomeIcon icon={faEraser} className="text-xs" />
                  Clear my response
                </button>
              </div>
            )}

            {/* Bottom Question Controls: Prev / Next */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div>
                {canGoPrev ? (
                  <Button
                    variant="secondary"
                    icon={faArrowLeft}
                    onClick={() => setCurrentIndex((prev) => prev - 1)}
                  >
                    Previous page
                  </Button>
                ) : (
                  <div />
                )}
              </div>

              <div className="flex items-center gap-2">
                {canGoNext ? (
                  <Button
                    variant="primary"
                    onClick={() => setCurrentIndex((prev) => prev + 1)}
                  >
                    Next page →
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    icon={faCircleCheck}
                    onClick={() => {
                      if (dirty.current.size > 0) void persist();
                      setConfirmSubmitOpen(true);
                    }}
                    disabled={expired || busy}
                  >
                    Finish attempt…
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================== */}
        {/* D. Right Sidebar: Quiz Navigation Tiles                   */}
        {/* ========================================================== */}
        <aside className="w-full shrink-0 space-y-4 lg:w-72" aria-label="Quiz Navigation">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Quiz Navigation
            </h2>

            {/* Numbered Tiles Grid */}
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-5" role="navigation">
              {questions.map((q, idx) => {
                const draft = drafts[q.id] ?? emptyDraft;
                const answered = isAnswered(draft);
                const isCurrent = idx === currentIndex;
                const flagged = Boolean(draft.markedForReview);

                // In sequential mode, prevent clicking ahead of next allowable question
                const maxAnsweredIdx = Math.max(
                  -1,
                  ...questions
                    .map((item, i) => (isAnswered(drafts[item.id]) ? i : -1))
                    .filter((i) => i >= 0),
                );
                const sequentialLocked = isSequential && idx > maxAnsweredIdx + 1 && !isCurrent;

                return (
                  <button
                    key={q.id}
                    type="button"
                    disabled={sequentialLocked}
                    onClick={() => setCurrentIndex(idx)}
                    className={`relative flex h-11 w-11 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition ${
                      isCurrent
                        ? "border-[var(--color-primary,#1d4ed8)] ring-2 ring-[var(--color-primary,#1d4ed8)] ring-offset-1 dark:ring-offset-slate-900"
                        : "border-slate-300 dark:border-slate-700"
                    } ${
                      answered
                        ? "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100"
                        : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300"
                    } ${sequentialLocked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                    title={`Question ${idx + 1}: ${
                      answered ? "Answered" : "Not answered"
                    }${flagged ? " (Flagged)" : ""}`}
                  >
                    <span>{idx + 1}</span>

                    {/* Moodle-style lower status bar on tile */}
                    <span
                      className={`absolute bottom-0 left-0 right-0 h-1.5 rounded-b-md ${
                        answered ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                      }`}
                    />

                    {/* Flag indicator corner */}
                    {flagged && (
                      <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] text-white shadow-xs">
                        <FontAwesomeIcon icon={faFlag} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-xs bg-slate-200 border border-slate-400 dark:bg-slate-700" />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-xs bg-white border border-slate-300 dark:bg-slate-800" />
                <span>Not answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-500 text-[6px] text-white">
                  ▲
                </span>
                <span>Flagged for review</span>
              </div>
            </div>

            {/* Finish attempt action */}
            <div className="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  if (dirty.current.size > 0) void persist();
                  setConfirmSubmitOpen(true);
                }}
                disabled={expired || busy}
                className="w-full text-center text-xs font-semibold text-[var(--color-primary,#1d4ed8)] hover:underline"
              >
                Finish attempt…
              </button>
            </div>
          </div>
        </aside>
      </main>

      {/* ------------------------------------------------------------ */}
      {/* Submit all and finish Confirmation Dialog                     */}
      {/* ------------------------------------------------------------ */}
      <Modal
        isOpen={confirmSubmitOpen}
        onClose={() => setConfirmSubmitOpen(false)}
        title="Submit all and finish"
        subtitle="Finalize your examination attempt"
        maxWidth="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSubmitOpen(false)}>
              Return to attempt
            </Button>
            <Button
              variant="primary"
              icon={faPaperPlane}
              isLoading={busy}
              onClick={() => {
                setConfirmSubmitOpen(false);
                void submit();
              }}
            >
              Submit all and finish
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Once you submit, you will no longer be able to change your answers for this attempt.
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-900/60">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-500">Answered questions:</span>{" "}
                <strong className="text-emerald-600">{answeredCount}</strong>
              </div>
              <div>
                <span className="text-slate-500">Unanswered questions:</span>{" "}
                <strong className={unansweredCount > 0 ? "text-amber-600" : "text-slate-700"}>
                  {unansweredCount}
                </strong>
              </div>
            </div>
          </div>

          {unansweredCount > 0 && (
            <Alert variant="warning">
              You still have {unansweredCount} unanswered question{unansweredCount === 1 ? "" : "s"}.
              Unanswered questions will receive zero marks upon submission.
            </Alert>
          )}

          <div className="max-h-60 overflow-y-auto space-y-1.5 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
            {questions.map((q, idx) => {
              const draft = drafts[q.id];
              const answered = isAnswered(draft);
              return (
                <div
                  key={q.id}
                  className="flex items-center justify-between rounded px-2.5 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="truncate max-w-[70%]">
                    Question {idx + 1}: {q.text}
                  </span>
                  <div className="flex items-center gap-2">
                    {draft?.markedForReview && <Badge variant="warning" size="sm">Flagged</Badge>}
                    <Badge variant={answered ? "success" : "neutral"} size="sm">
                      {answered ? "Answer saved" : "Not answered"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Question Input Renderer by Type                                    */
/* ------------------------------------------------------------------ */

interface QuestionInputRendererProps {
  question: LmsServedQuestion;
  draft: DraftAnswer;
  disabled: boolean;
  onPatch: (changes: Partial<DraftAnswer>) => void;
}

const QuestionInputRenderer: React.FC<QuestionInputRendererProps> = ({
  question,
  draft,
  disabled,
  onPatch,
}) => {
  const selected: string[] = Array.isArray(draft.response) ? (draft.response as string[]) : [];

  switch (question.type) {
    case "MULTIPLE_CHOICE":
    case "TRUE_FALSE": {
      return (
        <div className="space-y-2.5" role="radiogroup">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Select one answer:
          </p>
          {(question.options || []).map((option, idx) => {
            const checked = selected.includes(option.id) || draft.response === option.id;
            return (
              <label
                key={option.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                  checked
                    ? "border-[var(--color-primary,#1d4ed8)] bg-[var(--color-primary-soft,#eff6ff)] dark:bg-blue-950/30"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
                } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option.id}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onPatch({ response: option.id, responseText: "" })}
                  className="mt-0.5 h-4 w-4 text-[var(--color-primary,#1d4ed8)] focus:ring-[var(--color-primary,#1d4ed8)]"
                />
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  {String.fromCharCode(97 + idx)}.
                </span>
                <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-200">
                  {option.text}
                </span>
              </label>
            );
          })}
        </div>
      );
    }

    case "MULTIPLE_SELECT": {
      return (
        <div className="space-y-2.5" role="group">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Select one or more:
          </p>
          {(question.options || []).map((option, idx) => {
            const checked = selected.includes(option.id);
            return (
              <label
                key={option.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                  checked
                    ? "border-[var(--color-primary,#1d4ed8)] bg-[var(--color-primary-soft,#eff6ff)] dark:bg-blue-950/30"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
                } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <input
                  type="checkbox"
                  name={`question-${question.id}`}
                  value={option.id}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((id) => id !== option.id)
                      : [...selected, option.id];
                    onPatch({ response: next, responseText: "" });
                  }}
                  className="mt-0.5 h-4 w-4 rounded-sm text-[var(--color-primary,#1d4ed8)] focus:ring-[var(--color-primary,#1d4ed8)]"
                />
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  {String.fromCharCode(97 + idx)}.
                </span>
                <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-200">
                  {option.text}
                </span>
              </label>
            );
          })}
        </div>
      );
    }

    case "NUMERIC": {
      return (
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Numeric Answer:
          </label>
          <input
            type="number"
            step="any"
            value={draft.responseText || (draft.response !== null && draft.response !== undefined ? String(draft.response) : "")}
            disabled={disabled}
            onChange={(e) => {
              const val = e.target.value;
              onPatch({ response: val, responseText: val });
            }}
            placeholder="Enter numerical answer"
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-primary,#1d4ed8)] focus:ring-1 focus:ring-[var(--color-primary,#1d4ed8)] dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
      );
    }

    case "FILL_BLANK":
    case "SHORT_ANSWER": {
      return (
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Answer:
          </label>
          <input
            type="text"
            value={draft.responseText}
            disabled={disabled}
            onChange={(e) => onPatch({ response: null, responseText: e.target.value })}
            placeholder="Type your response here"
            className="w-full max-w-md rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-primary,#1d4ed8)] focus:ring-1 focus:ring-[var(--color-primary,#1d4ed8)] dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
      );
    }

    case "LONG_ANSWER":
    default: {
      return (
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Answer text:
          </label>
          <textarea
            value={draft.responseText}
            maxLength={20000}
            rows={8}
            disabled={disabled}
            onChange={(e) => onPatch({ response: null, responseText: e.target.value })}
            placeholder="Type your detailed response here…"
            className="w-full rounded-lg border border-slate-300 p-3.5 text-sm outline-none focus:border-[var(--color-primary,#1d4ed8)] focus:ring-1 focus:ring-[var(--color-primary,#1d4ed8)] dark:border-slate-700 dark:bg-slate-800"
          />
          {question.requiresManualGrading && (
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <FontAwesomeIcon icon={faTriangleExclamation} />
              This question requires manual assessment by the instructor after submission.
            </p>
          )}
        </div>
      );
    }
  }
};

/* ------------------------------------------------------------------ */
/* Post-Submission Result View                                        */
/* ------------------------------------------------------------------ */

const StudentResultView: React.FC<{
  result: LmsStudentResult;
  attemptsAllowed: number;
  onReviewAgain: () => void;
  onClose: () => void;
}> = ({ result, attemptsAllowed, onReviewAgain, onClose }) => (
  <div className="mx-auto max-w-4xl space-y-6 py-6 px-4 sm:px-6">
    <Card title={result.title} icon={faPaperPlane}>
      {!result.released ? (
        <Alert variant="info" detail={result.reason || undefined}>
          Your examination paper has been received. The results have not been released yet according to the quiz policy.
        </Alert>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Score</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {formatMark(result.attempt.awardedMarks, result.maxMarks)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Percentage</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {formatPercentage(result.attempt.percentage)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Outcome</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {result.attempt.passed === undefined ? "—" : result.attempt.passed ? "Pass" : "Not passed"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Passing Mark</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{result.passingMarks}%</p>
          </div>
        </div>
      )}

      {result.submittedLate && (
        <Alert variant="warning" className="mt-4">
          This paper was submitted past the scheduled closing time; recorded as a late submission.
        </Alert>
      )}
    </Card>

    {result.released && result.questions && result.questions.length > 0 && (
      <Card title="Question Review & Feedback" icon={faCircleCheck}>
        <div className="space-y-6">
          {result.questions.map((question, index) => (
            <div
              key={question.id}
              className="border-b border-slate-200 pb-5 last:border-0 dark:border-slate-800"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {index + 1}. {question.text}
                </h4>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {formatMark(question.awardedMarks, question.marks)} / {question.marks}
                </span>
              </div>

              {question.explanation && (
                <div className="mt-2.5 rounded-lg bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                  <strong>Explanation: </strong> {question.explanation}
                </div>
              )}

              {question.feedback && (
                <div className="mt-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <strong>Marker Feedback: </strong> {question.feedback}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    )}

    <div className="flex flex-wrap gap-3">
      {attemptsAllowed > result.attempt.attemptNumber && (
        <Button variant="secondary" icon={faArrowLeft} onClick={onReviewAgain}>
          Start another attempt
        </Button>
      )}
      <Button variant="primary" onClick={onClose}>
        Back to course
      </Button>
    </div>
  </div>
);