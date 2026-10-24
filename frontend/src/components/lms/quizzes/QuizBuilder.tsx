import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardList, faCopy, faEdit, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { PageHeader } from "../../ui/PageHeader";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Alert } from "../../ui/Alert";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import {
  createQuiz,
  fetchQuiz,
  isTeacherQuizDetail,
  setQuizStatus,
  updateQuiz,
} from "../../../services/lmsApi";
import type { LmsQuizDraft, LmsQuizForTeacher, LmsQuestion } from "../../../types/lms";
import { QuestionEditor } from "./QuestionEditor";
import { QuestionBankPicker } from "./QuestionBankPicker";

/** A single authored question in builder-local state. */
interface BuilderQuestion {
  id: string;
  type: NonNullable<LmsQuestion["type"]>;
  text: string;
  richText: string;
  marks: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  category: string | null;
  topic: string | null;
  explanation: string;
  options: Array<{ id: string; text: string }>;
  correctAnswer: unknown[];
  position: number;
}

type QuizStep = "details" | "questions" | "review";

interface QuizBuilderProps {
  /** The course this quiz belongs to. */
  courseId: string;
  /** Optional week the quiz is filed under. */
  weekId?: string;
  /** Optional existing quiz to edit. */
  quizId?: string;
  onClose: () => void;
  onPublished: (quiz: LmsQuizForTeacher) => void;
}

export const QuizBuilder: React.FC<QuizBuilderProps> = ({
  courseId,
  weekId: initialWeekId,
  quizId: initialQuizId,
  onClose,
  onPublished,
}) => {
  const [step, setStep] = useState<QuizStep>("details");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [quizDraft, setQuizDraft] = useState<LmsQuizDraft>({
    weekId: initialWeekId || "",
    title: "",
    description: "",
    instructions: "",
    maxMarks: 20,
    passingMarks: 10,
    durationMinutes: 30,
    attemptsAllowed: 1,
    randomizeQuestions: false,
    randomizeOptions: false,
    allowBackNavigation: true,
    allowReviewBeforeSubmit: true,
    allowReopenExpired: true,
    navigationMethod: "FREE",
    multipleSelectGrading: "EXACT",
    blankAnswerCaseSensitive: false,
    resultReleasePolicy: "AFTER_GRADING",
    showCorrectAnswers: false,
    openAt: "",
    closeAt: "",
  });
  const [questions, setQuestions] = useState<BuilderQuestion[]>([]);
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);
  const [createdQuizId, setCreatedQuizId] = useState<string | null>(null);

  const effectiveQuizId = useMemo(
    () => initialQuizId || createdQuizId || "",
    [initialQuizId, createdQuizId],
  );

  const totalQuestionMarks = useMemo(
    () => questions.reduce((sum, q) => sum + q.marks, 0),
    [questions],
  );
  const marksMatch =
    quizDraft.maxMarks != null && totalQuestionMarks === quizDraft.maxMarks;

  const loadQuiz = useCallback(async () => {
    if (!initialQuizId) return;
    setLoading(true);
    try {
      const detail = await fetchQuiz(initialQuizId);
      if (isTeacherQuizDetail(detail)) {
        const { quiz, questions: serverQuestions } = detail;
        setQuizDraft({
          weekId: quiz.weekId || "",
          title: quiz.title,
          description: quiz.description || "",
          instructions: quiz.instructions || "",
          maxMarks: quiz.maxMarks,
          passingMarks: quiz.passingMarks,
          durationMinutes: quiz.durationMinutes ?? 30,
          attemptsAllowed: quiz.attemptsAllowed,
          randomizeQuestions: quiz.randomizeQuestions,
          randomizeOptions: quiz.randomizeOptions,
          allowBackNavigation: quiz.allowBackNavigation,
          allowReviewBeforeSubmit: quiz.allowReviewBeforeSubmit,
          allowReopenExpired: quiz.allowReopenExpired,
          navigationMethod: quiz.navigationMethod ?? "FREE",
          multipleSelectGrading: quiz.multipleSelectGrading as
            | "EXACT"
            | "PARTIAL_CREDIT",
          blankAnswerCaseSensitive: quiz.blankAnswerCaseSensitive,
          resultReleasePolicy: quiz.resultReleasePolicy,
          showCorrectAnswers: quiz.showCorrectAnswers,
          openAt: quiz.openAt ? new Date(quiz.openAt).toISOString().slice(0, 16) : "",
          closeAt: quiz.closeAt ? new Date(quiz.closeAt).toISOString().slice(0, 16) : "",
        });
        setQuestions(
          serverQuestions.map((q) => ({
            id: q.id,
            type: q.type,
            text: q.text,
            richText: q.richText,
            marks: q.marks,
            difficulty: q.difficulty,
            category: q.category,
            topic: q.topic,
            explanation: q.explanation,
            options: q.options.map((o) => ({ id: o.id, text: o.text })),
            correctAnswer: q.correctAnswer || [],
            position: q.position,
          })),
        );
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "This quiz could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [initialQuizId]);

  useEffect(() => {
    void loadQuiz();
  }, [loadQuiz]);

  const goToQuestions = async () => {
    if (!quizDraft.title.trim()) {
      setError("Enter a quiz title before continuing.");
      return;
    }
    if (!quizDraft.weekId) {
      setError("Select a week before continuing.");
      return;
    }
    setError("");

    if (!initialQuizId) {
      setSaving(true);
      try {
        const detail = await createQuiz(courseId, {
          weekId: quizDraft.weekId,
          title: quizDraft.title,
          description: quizDraft.description,
          instructions: quizDraft.instructions,
          maxMarks: quizDraft.maxMarks,
          passingMarks: quizDraft.passingMarks,
          durationMinutes: quizDraft.durationMinutes,
          attemptsAllowed: quizDraft.attemptsAllowed,
          openAt: quizDraft.openAt ? new Date(quizDraft.openAt).toISOString() : undefined,
          closeAt: quizDraft.closeAt ? new Date(quizDraft.closeAt).toISOString() : undefined,
          resultReleasePolicy: quizDraft.resultReleasePolicy,
          randomizeQuestions: quizDraft.randomizeQuestions,
          randomizeOptions: quizDraft.randomizeOptions,
          allowBackNavigation: quizDraft.allowBackNavigation,
          allowReviewBeforeSubmit: quizDraft.allowReviewBeforeSubmit,
          allowReopenExpired: quizDraft.allowReopenExpired,
          navigationMethod: quizDraft.navigationMethod,
          multipleSelectGrading: quizDraft.multipleSelectGrading,
          blankAnswerCaseSensitive: quizDraft.blankAnswerCaseSensitive,
          showCorrectAnswers: quizDraft.showCorrectAnswers,
        });
        setCreatedQuizId(detail.quiz.id);
        setStep("questions");
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The quiz could not be created.",
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    setStep("questions");
  };

  const goToReview = () => {
    if (questions.length === 0) {
      setError("Add at least one question before reviewing.");
      return;
    }
    setStep("review");
    setError("");
  };

  const addQuestion = (saved: LmsQuestion) => {
    setQuestions((current) => [
      ...current,
      {
        id: saved.id,
        type: saved.type,
        text: saved.text,
        richText: saved.richText,
        marks: saved.marks,
        difficulty: saved.difficulty,
        category: saved.category,
        topic: saved.topic,
        explanation: saved.explanation,
        options: saved.options.map((o) => ({ id: o.id, text: o.text })),
        correctAnswer: saved.correctAnswer || [],
        position: saved.position,
      },
    ]);
    setQuestionEditorOpen(false);
  };

  const updateQuestion = (saved: LmsQuestion) => {
    setQuestions((current) =>
      current.map((q) =>
        q.id === saved.id
          ? {
              ...q,
              type: saved.type,
              text: saved.text,
              richText: saved.richText,
              marks: saved.marks,
              difficulty: saved.difficulty,
              category: saved.category,
              topic: saved.topic,
              explanation: saved.explanation,
              options: saved.options.map((o) => ({ id: o.id, text: o.text })),
              correctAnswer: saved.correctAnswer || [],
            }
          : q,
      ),
    );
    setEditingQuestionId(null);
    setQuestionEditorOpen(false);
  };

  const openEditor = (question: BuilderQuestion | null) => {
    setEditingQuestionId(question?.id ?? null);
    setQuestionEditorOpen(true);
  };

  const deleteQuestion = async (id: string) => {
    const exists = questions.some((q) => q.id === id);
    if (!exists) {
      setConfirmDeleteOpen(false);
      setDeleteQuestionId(null);
      return;
    }
    // Optimistically remove; the server route also rejects changes once sat.
    setQuestions((current) => current.filter((q) => q.id !== id));
    setConfirmDeleteOpen(false);
    setDeleteQuestionId(null);
  };

  const reorderQuestions = async (orderedIds: string[]) => {
    setQuestions((current) => {
      const byId = new Map(current.map((q) => [q.id, q]));
      return orderedIds.map((id) => byId.get(id)!).filter(Boolean);
    });
  };

  const openBankPicker = () => {
    setBankPickerOpen(true);
  };

  const handleBankAdded = (count: number) => {
    setBankPickerOpen(false);
  };

  const handlePublish = async () => {
    if (!quizDraft.weekId) {
      setError("Select a week.");
      return;
    }
    if (!quizDraft.title.trim()) {
      setError("Enter a quiz title.");
      return;
    }
    if (questions.length === 0) {
      setError("Add at least one question.");
      return;
    }
    if (!marksMatch) {
      setError(
        `Question marks total ${totalQuestionMarks} but quiz max marks is ${quizDraft.maxMarks}. They must match before publishing.`,
      );
      return;
    }
    setSaving(true);
    try {
      let published: LmsQuizForTeacher | null = null;
      if (initialQuizId) {
        await updateQuiz(initialQuizId, {
          title: quizDraft.title,
          description: quizDraft.description,
          instructions: quizDraft.instructions,
          maxMarks: quizDraft.maxMarks,
          passingMarks: quizDraft.passingMarks,
          durationMinutes: quizDraft.durationMinutes,
          attemptsAllowed: quizDraft.attemptsAllowed,
          randomizeQuestions: quizDraft.randomizeQuestions,
          randomizeOptions: quizDraft.randomizeOptions,
          allowBackNavigation: quizDraft.allowBackNavigation,
          allowReviewBeforeSubmit: quizDraft.allowReviewBeforeSubmit,
          allowReopenExpired: quizDraft.allowReopenExpired,
          navigationMethod: quizDraft.navigationMethod,
          resultReleasePolicy: quizDraft.resultReleasePolicy,
          showCorrectAnswers: quizDraft.showCorrectAnswers,
          openAt: quizDraft.openAt ? new Date(quizDraft.openAt).toISOString() : undefined,
          closeAt: quizDraft.closeAt ? new Date(quizDraft.closeAt).toISOString() : undefined,
        });
        const detail = await fetchQuiz(initialQuizId);
        if (isTeacherQuizDetail(detail)) published = detail.quiz;
      } else if (effectiveQuizId) {
        const status = quizDraft.openAt ? "SCHEDULED" : "OPEN";
        const result = await setQuizStatus(effectiveQuizId, status);
        published = result.quiz;
      }
      onClose();
      if (published) onPublished(published);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The quiz could not be published.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cos-page space-y-6">
      <PageHeader
        title={initialQuizId ? "Edit Quiz" : "New Quiz"}
        eyebrow="Quiz builder"
        description={
          step === "details"
            ? "Configure the quiz, then author its questions."
            : step === "questions"
              ? `Authoring questions for "${quizDraft.title}".`
              : "Review and publish the quiz."
        }
        icon={faClipboardList}
      />

      {error && (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      <div
        className="flex flex-col items-center justify-center gap-2"
        style={{ minHeight: 40 }}
      >
        <div className="flex items-center gap-1 text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            1
          </span>
          <span className="mx-1">Quiz Details</span>
          <span className="text-slate-400">→</span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            2
          </span>
          <span className="mx-1">Questions</span>
          <span className="text-slate-400">→</span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            3
          </span>
          <span className="mx-1">Review &amp; Publish</span>
        </div>
      </div>

      {step === "details" && (
        <QuizDetailsForm
          draft={quizDraft}
          onChange={setQuizDraft}
          onContinue={goToQuestions}
          onClose={onClose}
          courseId={courseId}
        />
      )}

      {step === "questions" && (
        <QuestionBoard
          quizId={effectiveQuizId}
          questions={questions}
          totalMarks={totalQuestionMarks}
          maxMarks={quizDraft.maxMarks ?? 0}
          marksMatch={marksMatch}
          onAdd={() => setQuestionEditorOpen(true)}
          onEdit={openEditor}
          onDuplicate={(q) => {
            setQuestions((current) => [
              ...current,
              { ...q, id: "", position: current.length + 1 },
            ]);
          }}
          onDelete={(id) => {
            setDeleteQuestionId(id);
            setConfirmDeleteOpen(true);
          }}
          onReorder={reorderQuestions}
          onBank={openBankPicker}
          courseId={courseId}
        />
      )}

      {step === "review" && (
        <QuizReview
          draft={quizDraft}
          questions={questions}
          totalMarks={totalQuestionMarks}
          maxMarks={quizDraft.maxMarks ?? 0}
          marksMatch={marksMatch}
          onBack={() => setStep("questions")}
          onPublish={handlePublish}
          onClose={onClose}
          saving={saving}
        />
      )}

      {questionEditorOpen && (
        <QuestionEditor
          quizId={effectiveQuizId || "new"}
          question={editingQuestionId
            ? questions.find((q) => q.id === editingQuestionId) ?? null
            : null}
          onClose={() => setQuestionEditorOpen(false)}
          onSaved={editingQuestionId ? updateQuestion : addQuestion}
          onError={setError}
        />
      )}

      {bankPickerOpen && (
        <QuestionBankPicker
          courseId={courseId}
          quizId={effectiveQuizId || "new"}
          onClose={() => setBankPickerOpen(false)}
          onAdded={handleBankAdded}
          onError={setError}
        />
      )}

      {confirmDeleteOpen && (
        <ConfirmDialog
          isOpen={confirmDeleteOpen}
          onClose={() => setConfirmDeleteOpen(false)}
          confirmLabel="Delete question"
          title="Delete question?"
          message="This question and its answer configuration will be removed from the quiz."
          severity="warning"
          onConfirm={() => {
            if (deleteQuestionId) void deleteQuestion(deleteQuestionId);
          }}
        />
      )}
    </div>
  );
};

interface QuizDetailsFormProps {
  draft: LmsQuizDraft;
  onChange: (draft: LmsQuizDraft) => void;
  onContinue: () => void;
  onClose: () => void;
  courseId: string;
}

const QuizDetailsForm: React.FC<QuizDetailsFormProps> = ({
  draft,
  onChange,
  onContinue,
  onClose,
  courseId,
}) => {
  const [weeks, setWeeks] = useState<Array<{ id: string; weekNumber: number; title: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fetchCourseWeeks } = await import(
          "../../../services/lmsApi"
        );
        const result = await fetchCourseWeeks(courseId);
        if (!cancelled) setWeeks(result.weeks);
      } catch {
        // Leave the week list empty; the form says what is missing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  return (
    <form onSubmit={(event) => { event.preventDefault(); onContinue(); }} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Course
          <select
            disabled
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50"
          >
            <option value={courseId}>{courseId}</option>
          </select>
        </label>
        <label className="text-sm">
          Week
          <select
            required
            value={draft.weekId}
            onChange={(event) =>
              onChange({ ...draft, weekId: event.target.value })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Select a week</option>
            {weeks.map((week) => (
              <option key={week.id} value={week.id}>
                Week {week.weekNumber} · {week.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        Title
        <input
          required
          maxLength={180}
          value={draft.title}
          onChange={(event) =>
            onChange({ ...draft, title: event.target.value })
          }
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Database Fundamentals Quiz"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm">
          Max marks
          <input
            required
            type="number"
            min={0}
            value={String(draft.maxMarks ?? 20)}
            onChange={(event) =>
              onChange({ ...draft, maxMarks: Number(event.target.value) || 0 })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Pass mark
          <input
            type="number"
            min={0}
            value={String(draft.passingMarks ?? 10)}
            onChange={(event) =>
              onChange({ ...draft, passingMarks: Number(event.target.value) || 0 })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Minutes
          <input
            required
            type="number"
            min={1}
            max={600}
            value={String(draft.durationMinutes ?? 30)}
            onChange={(event) =>
              onChange({ ...draft, durationMinutes: Number(event.target.value) || 30 })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Attempts
          <input
            type="number"
            min={1}
            max={20}
            value={String(draft.attemptsAllowed ?? 1)}
            onChange={(event) =>
              onChange({ ...draft, attemptsAllowed: Number(event.target.value) || 1 })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Opens at
          <input
            required
            type="datetime-local"
            value={draft.openAt}
            onChange={(event) =>
              onChange({ ...draft, openAt: event.target.value })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Closes at
          <input
            required
            type="datetime-local"
            value={draft.closeAt}
            onChange={(event) =>
              onChange({ ...draft, closeAt: event.target.value })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Quiz settings
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.randomizeQuestions}
              onChange={(event) =>
                onChange({ ...draft, randomizeQuestions: event.target.checked })
              }
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Randomize questions
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.randomizeOptions}
              onChange={(event) =>
                onChange({ ...draft, randomizeOptions: event.target.checked })
              }
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Randomize options
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.allowBackNavigation}
              onChange={(event) =>
                onChange({ ...draft, allowBackNavigation: event.target.checked })
              }
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Allow back navigation
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.allowReviewBeforeSubmit}
              onChange={(event) =>
                onChange({
                  ...draft,
                  allowReviewBeforeSubmit: event.target.checked,
                })
              }
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Allow review before submit
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.allowReopenExpired}
              onChange={(event) =>
                onChange({ ...draft, allowReopenExpired: event.target.checked })
              }
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Allow reopen expired attempts
          </label>
          <label className="text-sm">
            Navigation method
            <select
              value={draft.navigationMethod ?? "FREE"}
              onChange={(event) =>
                onChange({
                  ...draft,
                  navigationMethod: event.target.value as "FREE" | "SEQUENTIAL",
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="FREE">Free navigation</option>
              <option value="SEQUENTIAL">Sequential navigation</option>
            </select>
          </label>
          <label className="text-sm">
            Multiple-select grading
            <select
              value={draft.multipleSelectGrading ?? "EXACT"}
              onChange={(event) =>
                onChange({
                  ...draft,
                  multipleSelectGrading: event.target.value as
                    | "EXACT"
                    | "PARTIAL_CREDIT",
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="EXACT">Exact match</option>
              <option value="PARTIAL_CREDIT">Partial credit</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.blankAnswerCaseSensitive}
              onChange={(event) =>
                onChange({
                  ...draft,
                  blankAnswerCaseSensitive: event.target.checked,
                })
              }
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Case-sensitive blanks
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.showCorrectAnswers}
              onChange={(event) =>
                onChange({ ...draft, showCorrectAnswers: event.target.checked })
              }
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Show correct answers
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Results release policy
            <select
              value={draft.resultReleasePolicy ?? "AFTER_GRADING"}
              onChange={(event) =>
                onChange({
                  ...draft,
                  resultReleasePolicy: event.target.value as
                    | "IMMEDIATELY"
                    | "AFTER_CLOSE"
                    | "AFTER_GRADING"
                    | "MANUAL",
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="IMMEDIATELY">Immediately</option>
              <option value="AFTER_CLOSE">After the window closes</option>
              <option value="AFTER_GRADING">After grading</option>
              <option value="MANUAL">When the teacher releases them</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="submit"
          disabled={!draft.title.trim() || !draft.weekId}
        >
          Save & Continue
        </Button>
      </div>
    </form>
  );
};

interface QuestionBoardProps {
  quizId: string;
  questions: BuilderQuestion[];
  totalMarks: number;
  maxMarks: number;
  marksMatch: boolean;
  onAdd: () => void;
  onEdit: (question: BuilderQuestion | null) => void;
  onDuplicate: (question: BuilderQuestion) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onBank: () => void;
  courseId: string;
}

const QuestionBoard: React.FC<QuestionBoardProps> = ({
  quizId,
  questions,
  totalMarks,
  maxMarks,
  marksMatch,
  onAdd,
  onEdit,
  onDuplicate,
  onDelete,
  onReorder,
  onBank,
  courseId,
}) => {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Questions &amp; Answers
          </h2>
          <p className="cos-page-subtitle">
            {quizId
              ? `Quiz: ${questions.length} question${questions.length === 1 ? "" : "s"} · ${totalMarks} / ${maxMarks} marks`
              : `Draft quiz · ${totalMarks} / ${maxMarks} marks`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onBank}
            disabled={!quizId}
          >
            Question bank
          </Button>
          <Button variant="primary" size="sm" icon={faPlus} onClick={onAdd}>
            Add question
          </Button>
        </div>
      </div>

      {!marksMatch && totalMarks > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-800">
            Total question marks: {totalMarks} · Quiz max marks: {maxMarks}. They must match before publishing.
          </p>
        </div>
      )}

      {questions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-950">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No questions yet. Add questions to build the paper.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {questions.map((question, index) => (
            <li
              key={question.id}
              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {question.text}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {question.marks} marks
                  </span>
                </div>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                  <Badge variant="neutral" size="sm" hideDot>
                    {question.type.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                  <Badge variant="neutral" size="sm" hideDot>
                    {question.difficulty.toLowerCase()}
                  </Badge>
                  {question.options.length > 0 && (
                    <span>{question.options.length} options</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={faEdit}
                  onClick={() => onEdit(question)}
                  aria-label={`Edit question ${index + 1}`}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={faCopy}
                  onClick={() => onDuplicate(question)}
                  aria-label={`Duplicate question ${index + 1}`}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={faTrash}
                  onClick={() => onDelete(question.id)}
                  aria-label={`Delete question ${index + 1}`}
                />
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-2 flex items-baseline gap-3">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Total:
        </span>
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {totalMarks} / {maxMarks} marks
        </span>
      </div>
    </div>
  );
};

interface QuizReviewProps {
  draft: LmsQuizDraft;
  questions: BuilderQuestion[];
  totalMarks: number;
  maxMarks: number;
  marksMatch: boolean;
  onBack: () => void;
  onPublish: () => void;
  onClose: () => void;
  saving: boolean;
}

const QuizReview: React.FC<QuizReviewProps> = ({
  draft,
  questions,
  totalMarks,
  maxMarks,
  marksMatch,
  onBack,
  onPublish,
  onClose,
  saving,
}) => {
  const availabilityLabel: Record<string, string> = {
    DRAFT: "Draft",
    SCHEDULED: "Scheduled",
    OPEN: "Open",
    CLOSED: "Closed",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Review &amp; Publish
          </h2>
          <p className="cos-page-subtitle">
            Final check before students can see this quiz.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Quiz summary
          </p>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Week</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">{draft.weekId}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Title</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100 truncate md:max-w-[200px]">{draft.title}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Total marks</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">{draft.maxMarks}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Pass mark</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">{draft.passingMarks}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Duration</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {draft.durationMinutes} minutes
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Attempts</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {draft.attemptsAllowed}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Settings
          </p>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Randomize questions</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {draft.randomizeQuestions ? "Yes" : "No"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Randomize options</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {draft.randomizeOptions ? "Yes" : "No"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Back navigation</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {draft.allowBackNavigation ? "Allowed" : "Disabled"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Results release</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {(draft.resultReleasePolicy ?? "AFTER_GRADING").replace(/_/g, " ").toLowerCase()}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800 dark:bg-slate-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Questions ({questions.length})
        </p>
        <ol className="mt-2 space-y-1.5">
          {questions.map((question, index) => (
            <div
              key={question.id}
              className="flex items-start gap-2 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50"
            >
              <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                Q{index + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-300 truncate md:max-w-[320px]">
                {question.text}
              </span>
              <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-400">
                {question.marks} marks
              </span>
            </div>
          ))}
          <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-slate-200/50">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Total marks
            </span>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {totalMarks} / {maxMarks}
            </span>
          </div>
        </ol>
      </div>

      {!marksMatch && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">
            Question total ({totalMarks}) does not match quiz max marks ({maxMarks}). Adjust question marks before publishing.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Save draft
        </Button>
        <Button
          variant="primary"
          onClick={onPublish}
          isLoading={saving}
          loadingLabel="Publishing"
          disabled={saving || !marksMatch || questions.length === 0}
        >
          Publish Quiz
        </Button>
      </div>
    </div>
  );
};

export default QuizBuilder;
