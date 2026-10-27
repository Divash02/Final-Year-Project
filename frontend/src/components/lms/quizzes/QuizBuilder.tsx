import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClipboardList,
  faCopy,
  faEdit,
  faPlus,
  faTrash,
  faArrowUp,
  faArrowDown,
  faBookOpen,
  faWandMagicSparkles,
  faShieldHalved,
  faEye,
  faSlidersH,
  faChartPie,
  faSquareCheck,
  faSave,
  faRocket,
  faArrowLeft,
  faCheck,
  faExclamationCircle,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Alert } from "../../ui/Alert";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { RichTextDisplay } from "../../ui/RichTextDisplay";
import {
  createQuiz,
  fetchQuiz,
  isTeacherQuizDetail,
  setQuizStatus,
  updateQuiz,
  reorderQuizQuestions,
  removeQuizQuestion,
  addQuizQuestion,
} from "../../../services/lmsApi";
import type { LmsQuizDraft, LmsQuizForTeacher, LmsQuestion } from "../../../types/lms";
import { QuestionEditor } from "./QuestionEditor";
import { QuestionBankModal } from "./QuestionBankModal";
import { AIQuizAssistantModal, GeneratedQuestion } from "./AIQuizAssistantModal";
import { AIQualityCheckModal } from "./AIQualityCheckModal";
import { PublishQuizModal } from "./PublishQuizModal";
import { QuizPreview } from "./QuizPreview";
import { QuizSettingsTab } from "./QuizSettingsTab";
import { QuizResultsTab } from "./QuizResultsTab";
import { QuizAnalyticsTab } from "./QuizAnalyticsTab";

export interface BuilderQuestion {
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
  section?: string;
}

type StudioTab = "questions" | "preview" | "settings" | "results" | "analytics";

interface QuizBuilderProps {
  courseId: string;
  weekId?: string;
  quizId?: string;
  onClose: () => void;
  onPublished?: (quiz: LmsQuizForTeacher) => void;
}

export const QuizBuilder: React.FC<QuizBuilderProps> = ({
  courseId,
  weekId: initialWeekId,
  quizId: initialQuizId,
  onClose,
  onPublished,
}) => {
  const [activeTab, setActiveTab] = useState<StudioTab>("questions");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [quizStatusState, setQuizStatusState] = useState<string>("DRAFT");

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
  const [createdQuizId, setCreatedQuizId] = useState<string | null>(null);

  // Modals state
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<BuilderQuestion | null>(null);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [qualityCheckOpen, setQualityCheckOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);

  const effectiveQuizId = useMemo(
    () => initialQuizId || createdQuizId || "",
    [initialQuizId, createdQuizId],
  );

  const totalQuestionMarks = useMemo(
    () => questions.reduce((sum, q) => sum + (q.marks || 0), 0),
    [questions],
  );

  const marksMatch = quizDraft.maxMarks != null && totalQuestionMarks === quizDraft.maxMarks;

  const loadQuiz = useCallback(async () => {
    if (!initialQuizId) return;
    setLoading(true);
    try {
      const detail = await fetchQuiz(initialQuizId);
      if (isTeacherQuizDetail(detail)) {
        const { quiz, questions: serverQuestions } = detail;
        setQuizStatusState(quiz.availability || "DRAFT");
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
          multipleSelectGrading: quiz.multipleSelectGrading as "EXACT" | "PARTIAL_CREDIT",
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
            richText: q.richText || "",
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
        requestError instanceof Error ? requestError.message : "This quiz could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [initialQuizId]);

  useEffect(() => {
    void loadQuiz();
  }, [loadQuiz]);

  // Persist question reordering to backend
  const handleMoveQuestion = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const nextList = [...questions];
    const [moved] = nextList.splice(index, 1);
    nextList.splice(targetIndex, 0, moved);
    setQuestions(nextList);

    if (effectiveQuizId) {
      try {
        const ids = nextList.map((q) => q.id);
        await reorderQuizQuestions(effectiveQuizId, ids);
      } catch (err) {
        console.warn("Failed to persist order to backend:", err);
      }
    }
  };

  const handleSaveDraft = async () => {
    if (!quizDraft.title.trim()) {
      setError("Please provide an assessment title.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (effectiveQuizId) {
        await updateQuiz(effectiveQuizId, {
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
        setNotice("Assessment draft successfully saved.");
      } else {
        const detail = await createQuiz(courseId, {
          weekId: quizDraft.weekId || "",
          title: quizDraft.title,
          description: quizDraft.description,
          instructions: quizDraft.instructions,
          maxMarks: quizDraft.maxMarks,
          passingMarks: quizDraft.passingMarks,
          durationMinutes: quizDraft.durationMinutes,
          attemptsAllowed: quizDraft.attemptsAllowed,
          openAt: quizDraft.openAt ? new Date(quizDraft.openAt).toISOString() : undefined,
          closeAt: quizDraft.closeAt ? new Date(quizDraft.closeAt).toISOString() : undefined,
        });
        setCreatedQuizId(detail.quiz.id);
        setNotice("Quiz created as draft. You can now add and reorder questions.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quiz draft.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmPublish = async () => {
    if (!effectiveQuizId) {
      setError("Please save the quiz draft before publishing.");
      setPublishModalOpen(false);
      return;
    }
    setSaving(true);
    try {
      const statusToSet = quizDraft.openAt ? "SCHEDULED" : "OPEN";
      const result = await setQuizStatus(effectiveQuizId, statusToSet);
      setQuizStatusState(statusToSet);
      setPublishModalOpen(false);
      setNotice(`Quiz published successfully (${statusToSet.toLowerCase()}).`);
      if (onPublished && isTeacherQuizDetail(result as any)) {
        onPublished((result as any).quiz);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish assessment.");
    } finally {
      setSaving(false);
    }
  };

  const handleInsertAIQuestion = async (generated: GeneratedQuestion) => {
    if (!effectiveQuizId) {
      // Keep in local list if quiz not yet persisted
      setQuestions((prev) => [
        ...prev,
        {
          id: generated.id,
          type: generated.type,
          text: generated.text,
          richText: generated.text,
          marks: generated.marks,
          difficulty: generated.difficulty,
          topic: generated.topic || null,
          category: generated.category || null,
          explanation: generated.explanation,
          options: generated.options,
          correctAnswer: generated.correctAnswer,
          position: prev.length + 1,
        },
      ]);
      setNotice("AI Question inserted into draft list.");
      return;
    }

    try {
      const saved = await addQuizQuestion(effectiveQuizId, {
        type: generated.type,
        text: generated.text,
        richText: generated.text,
        marks: generated.marks,
        difficulty: generated.difficulty,
        topic: generated.topic,
        category: generated.category,
        explanation: generated.explanation,
        options: generated.options.map((o) => ({ text: o.text })),
        correctAnswer: generated.correctAnswer,
      });

      setQuestions((prev) => [
        ...prev,
        {
          id: saved.question.id,
          type: saved.question.type,
          text: saved.question.text,
          richText: saved.question.richText || "",
          marks: saved.question.marks,
          difficulty: saved.question.difficulty,
          topic: saved.question.topic,
          category: saved.question.category,
          explanation: saved.question.explanation,
          options: saved.question.options.map((o) => ({ id: o.id, text: o.text })),
          correctAnswer: saved.question.correctAnswer || [],
          position: saved.question.position,
        },
      ]);
      setNotice("AI Question successfully saved to quiz.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI question.");
    }
  };

  const handleDuplicateQuestion = async (q: BuilderQuestion) => {
    if (!effectiveQuizId) {
      setQuestions((prev) => [
        ...prev,
        {
          ...q,
          id: `local_dup_${Date.now()}`,
          position: prev.length + 1,
        },
      ]);
      return;
    }

    try {
      const res = await addQuizQuestion(effectiveQuizId, {
        type: q.type,
        text: `${q.text} (Copy)`,
        richText: q.richText ? `${q.richText} (Copy)` : "",
        marks: q.marks,
        difficulty: q.difficulty,
        topic: q.topic || undefined,
        category: q.category || undefined,
        explanation: q.explanation || undefined,
        options: q.options.map((o) => ({ text: o.text })),
        correctAnswer: q.correctAnswer,
      });

      setQuestions((prev) => [
        ...prev,
        {
          id: res.question.id,
          type: res.question.type,
          text: res.question.text,
          richText: res.question.richText || "",
          marks: res.question.marks,
          difficulty: res.question.difficulty,
          topic: res.question.topic,
          category: res.question.category,
          explanation: res.question.explanation,
          options: res.question.options.map((o) => ({ id: o.id, text: o.text })),
          correctAnswer: res.question.correctAnswer || [],
          position: res.question.position,
        },
      ]);
      setNotice("Question duplicated.");
    } catch (err) {
      setError("Failed to duplicate question.");
    }
  };

  const handleDeleteQuestionConfirm = async () => {
    if (!questionToDelete) return;
    if (effectiveQuizId) {
      try {
        await removeQuizQuestion(effectiveQuizId, questionToDelete);
      } catch (err) {
        console.warn("Could not delete from backend:", err);
      }
    }
    setQuestions((prev) => prev.filter((q) => q.id !== questionToDelete));
    setDeleteConfirmOpen(false);
    setQuestionToDelete(null);
    setNotice("Question deleted.");
  };

  return (
    <div className="cos-page space-y-5">
      {/* Top Breadcrumb & Status Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2 text-xs">
          <Button variant="ghost" size="sm" icon={faArrowLeft} onClick={onClose}>
            Back
          </Button>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-slate-500 uppercase tracking-wider">
            {courseId}
          </span>
          <span className="text-slate-400">/</span>
          <span className="font-bold text-slate-800 dark:text-slate-200">
            {quizDraft.title || "New Assessment"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={
              quizStatusState === "OPEN"
                ? "success"
                : quizStatusState === "SCHEDULED"
                  ? "info"
                  : quizStatusState === "CLOSED"
                    ? "warning"
                    : "neutral"
            }
          >
            {quizStatusState}
          </Badge>
          <Button
            size="sm"
            variant="secondary"
            icon={faSave}
            onClick={handleSaveDraft}
            isLoading={saving}
          >
            Save Draft
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={faRocket}
            onClick={() => setPublishModalOpen(true)}
            disabled={questions.length === 0}
          >
            Publish Quiz
          </Button>
        </div>
      </div>

      {/* Assessment Header Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-teal-600 text-white text-sm">
              <FontAwesomeIcon icon={faClipboardList} />
            </span>
            <input
              type="text"
              value={quizDraft.title}
              onChange={(e) => setQuizDraft({ ...quizDraft, title: e.target.value })}
              placeholder="e.g. React Fundamentals & State Architecture Quiz"
              className="text-lg md:text-xl font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-600 focus:outline-none px-1"
            />
          </div>
          <p className="text-xs text-slate-500 pl-10">
            {courseId} · Assessment &amp; Psychometric Examination
          </p>
        </div>

        {/* Quick Stats Badges */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
          <div>
            <span className="text-slate-400 block uppercase text-[10px]">Questions</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {questions.length}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
          <div>
            <span className="text-slate-400 block uppercase text-[10px]">Total Marks</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {totalQuestionMarks} <span className="text-xs font-normal text-slate-400">/ {quizDraft.maxMarks}</span>
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
          <div>
            <span className="text-slate-400 block uppercase text-[10px]">Time Limit</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {quizDraft.durationMinutes || 30}m
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
          <div>
            <span className="text-slate-400 block uppercase text-[10px]">Attempts</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {quizDraft.attemptsAllowed || 1}
            </span>
          </div>
        </div>
      </div>

      {notice && (
        <Alert variant="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {error && (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {/* Main Studio Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab("questions")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === "questions"
              ? "border-teal-600 text-teal-600 dark:text-teal-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <FontAwesomeIcon icon={faSquareCheck} />
          <span>Questions &amp; Structure ({questions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("preview")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === "preview"
              ? "border-teal-600 text-teal-600 dark:text-teal-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <FontAwesomeIcon icon={faEye} />
          <span>Student Preview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === "settings"
              ? "border-teal-600 text-teal-600 dark:text-teal-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <FontAwesomeIcon icon={faSlidersH} />
          <span>Settings</span>
        </button>

        {effectiveQuizId && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab("results")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
                activeTab === "results"
                  ? "border-teal-600 text-teal-600 dark:text-teal-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <FontAwesomeIcon icon={faClipboardList} />
              <span>Results</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
                activeTab === "analytics"
                  ? "border-teal-600 text-teal-600 dark:text-teal-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <FontAwesomeIcon icon={faChartPie} />
              <span>Analytics &amp; Insights</span>
            </button>
          </>
        )}
      </div>

      {/* Tab 1: Questions Studio */}
      {activeTab === "questions" && (
        <div className="space-y-4">
          {/* Builder Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                icon={faPlus}
                onClick={() => {
                  setEditingQuestion(null);
                  setQuestionEditorOpen(true);
                }}
              >
                + Add Question
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={faBookOpen}
                onClick={() => setBankModalOpen(true)}
              >
                Question Bank
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={faWandMagicSparkles}
                onClick={() => setAiAssistantOpen(true)}
              >
                AI Assistant
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={faShieldHalved}
                onClick={() => setQualityCheckOpen(true)}
              >
                AI Quality Check
              </Button>
            </div>
          </div>

          {!marksMatch && totalQuestionMarks > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200">
              <span>
                Total question marks ({totalQuestionMarks}) differs from quiz max marks ({quizDraft.maxMarks}).
              </span>
              <button
                type="button"
                onClick={() => setQuizDraft({ ...quizDraft, maxMarks: totalQuestionMarks })}
                className="underline font-bold text-amber-900 dark:text-amber-100 hover:text-amber-700"
              >
                Sync Quiz Max Marks to {totalQuestionMarks}
              </button>
            </div>
          )}

          {/* Question Cards List */}
          {questions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
              <FontAwesomeIcon icon={faSquareCheck} className="text-4xl text-slate-300 dark:text-slate-600" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                No Questions Added Yet
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Author items directly using the rich-text builder, reuse vetted questions from your Question Bank, or generate candidate items with the AI Assistant.
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  size="sm"
                  variant="primary"
                  icon={faPlus}
                  onClick={() => {
                    setEditingQuestion(null);
                    setQuestionEditorOpen(true);
                  }}
                >
                  Create First Question
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={faBookOpen}
                  onClick={() => setBankModalOpen(true)}
                >
                  Import From Bank
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div
                  key={q.id || idx}
                  className="rounded-lg border border-slate-200 bg-white p-4.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3 hover:border-slate-300 transition"
                >
                  {/* Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded">
                        QUESTION {idx + 1}
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        {q.type.replace(/_/g, " ").toLowerCase()} · <strong>{q.marks} mark{q.marks === 1 ? "" : "s"}</strong>
                      </span>
                      <Badge variant="neutral" size="sm" hideDot>
                        {q.difficulty.toLowerCase()}
                      </Badge>
                      {q.topic && (
                        <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {q.topic}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={faArrowUp}
                        disabled={idx === 0}
                        onClick={() => handleMoveQuestion(idx, "up")}
                        title="Move Up"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={faArrowDown}
                        disabled={idx === questions.length - 1}
                        onClick={() => handleMoveQuestion(idx, "down")}
                        title="Move Down"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={faEdit}
                        onClick={() => {
                          setEditingQuestion(q);
                          setQuestionEditorOpen(true);
                        }}
                        title="Edit Question"
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={faCopy}
                        onClick={() => handleDuplicateQuestion(q)}
                        title="Duplicate"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={faTrash}
                        onClick={() => {
                          setQuestionToDelete(q.id);
                          setDeleteConfirmOpen(true);
                        }}
                        title="Delete Question"
                      />
                    </div>
                  </div>

                  {/* Formatted Question Body */}
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    <RichTextDisplay content={q.richText || q.text} />
                  </div>

                  {/* Options List */}
                  {q.options && q.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                      {q.options.map((opt, oIdx) => {
                        const correctList = Array.isArray(q.correctAnswer)
                          ? q.correctAnswer.map(String)
                          : [];
                        const isCorrect = correctList.includes(opt.id);

                        return (
                          <div
                            key={opt.id}
                            className={`p-2.5 rounded-md border flex items-center gap-2 ${
                              isCorrect
                                ? "border-teal-300 bg-teal-50/80 text-teal-950 dark:bg-teal-950/40 dark:border-teal-700 dark:text-teal-200 font-medium"
                                : "border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                            }`}
                          >
                            <span className="font-bold text-slate-400">
                              {String.fromCharCode(65 + oIdx)}.
                            </span>
                            <span className="flex-1">{opt.text}</span>
                            {isCorrect && (
                              <span className="text-teal-600 font-bold ml-1">✓</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.explanation && (
                    <div className="text-xs bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                      <strong className="text-slate-700 dark:text-slate-200 font-semibold">
                        Explanation:{" "}
                      </strong>
                      {q.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Preview Mode */}
      {activeTab === "preview" && (
        <QuizPreview
          quizTitle={quizDraft.title || "Assessment Preview"}
          instructions={quizDraft.instructions}
          durationMinutes={quizDraft.durationMinutes || 30}
          maxMarks={quizDraft.maxMarks || 20}
          questions={questions.map((q) => ({
            id: q.id,
            type: q.type,
            text: q.richText || q.text,
            marks: q.marks,
            options: q.options,
          }))}
          onExitPreview={() => setActiveTab("questions")}
        />
      )}

      {/* Tab 3: Settings Mode */}
      {activeTab === "settings" && (
        <QuizSettingsTab
          draft={quizDraft}
          onChange={setQuizDraft}
          onSave={handleSaveDraft}
          saving={saving}
        />
      )}

      {/* Tab 4: Results */}
      {activeTab === "results" && effectiveQuizId && (
        <QuizResultsTab
          quizId={effectiveQuizId}
          quizTitle={quizDraft.title}
          maxMarks={quizDraft.maxMarks || totalQuestionMarks}
        />
      )}

      {/* Tab 5: Analytics */}
      {activeTab === "analytics" && effectiveQuizId && (
        <QuizAnalyticsTab
          quizId={effectiveQuizId}
          quizTitle={quizDraft.title}
          maxMarks={quizDraft.maxMarks || totalQuestionMarks}
        />
      )}

      {/* Question Editor Drawer */}
      {questionEditorOpen && (
        <QuestionEditor
          quizId={effectiveQuizId || "temp"}
          question={editingQuestion as any}
          onClose={() => {
            setQuestionEditorOpen(false);
            setEditingQuestion(null);
          }}
          onSaved={(savedQuestion) => {
            if (editingQuestion) {
              setQuestions((prev) =>
                prev.map((q) =>
                  q.id === savedQuestion.id
                    ? {
                        id: savedQuestion.id,
                        type: savedQuestion.type,
                        text: savedQuestion.text,
                        richText: savedQuestion.richText || "",
                        marks: savedQuestion.marks,
                        difficulty: savedQuestion.difficulty,
                        category: savedQuestion.category,
                        topic: savedQuestion.topic,
                        explanation: savedQuestion.explanation,
                        options: savedQuestion.options.map((o) => ({ id: o.id, text: o.text })),
                        correctAnswer: savedQuestion.correctAnswer || [],
                        position: savedQuestion.position,
                      }
                    : q,
                ),
              );
            } else {
              setQuestions((prev) => [
                ...prev,
                {
                  id: savedQuestion.id,
                  type: savedQuestion.type,
                  text: savedQuestion.text,
                  richText: savedQuestion.richText || "",
                  marks: savedQuestion.marks,
                  difficulty: savedQuestion.difficulty,
                  category: savedQuestion.category,
                  topic: savedQuestion.topic,
                  explanation: savedQuestion.explanation,
                  options: savedQuestion.options.map((o) => ({ id: o.id, text: o.text })),
                  correctAnswer: savedQuestion.correctAnswer || [],
                  position: savedQuestion.position,
                },
              ]);
            }
            setQuestionEditorOpen(false);
            setEditingQuestion(null);
            setNotice("Question successfully saved.");
          }}
          onError={setError}
        />
      )}

      {/* Question Bank Modal */}
      {bankModalOpen && (
        <QuestionBankModal
          isOpen={bankModalOpen}
          onClose={() => setBankModalOpen(false)}
          courseId={courseId}
          quizId={effectiveQuizId}
          onQuestionsAdded={(count) => {
            setNotice(`${count} question${count === 1 ? "" : "s"} added from question bank.`);
            void loadQuiz();
          }}
          onError={setError}
        />
      )}

      {/* AI Assistant Modal */}
      {aiAssistantOpen && (
        <AIQuizAssistantModal
          isOpen={aiAssistantOpen}
          onClose={() => setAiAssistantOpen(false)}
          onInsertQuestion={handleInsertAIQuestion}
          courseName={courseId}
          quizTitle={quizDraft.title}
        />
      )}

      {/* AI Quality Check Modal */}
      {qualityCheckOpen && (
        <AIQualityCheckModal
          isOpen={qualityCheckOpen}
          onClose={() => setQualityCheckOpen(false)}
          quizTitle={quizDraft.title}
          questions={questions}
          maxMarks={quizDraft.maxMarks ?? 100}
        />
      )}

      {/* Publish Quiz Confirmation Modal */}
      {publishModalOpen && (
        <PublishQuizModal
          isOpen={publishModalOpen}
          onClose={() => setPublishModalOpen(false)}
          onConfirmPublish={handleConfirmPublish}
          publishing={saving}
          quizTitle={quizDraft.title}
          courseName={courseId}
          questionCount={questions.length}
          totalMarks={totalQuestionMarks}
          maxMarks={quizDraft.maxMarks ?? 100}
          durationMinutes={quizDraft.durationMinutes || 30}
          openAt={quizDraft.openAt}
          closeAt={quizDraft.closeAt}
          attemptsAllowed={quizDraft.attemptsAllowed || 1}
        />
      )}

      {/* Confirm Delete Dialog */}
      {deleteConfirmOpen && (
        <ConfirmDialog
          isOpen={deleteConfirmOpen}
          onClose={() => {
            setDeleteConfirmOpen(false);
            setQuestionToDelete(null);
          }}
          confirmLabel="Delete Question"
          title="Delete Question?"
          message="Are you sure you want to remove this question from the assessment? This cannot be undone."
          severity="danger"
          onConfirm={handleDeleteQuestionConfirm}
        />
      )}
    </div>
  );
};

export default QuizBuilder;
