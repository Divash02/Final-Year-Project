import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRight,
  faClock,
  faCheckCircle,
  faEye,
  faSignOutAlt,
  faFlag,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { RichTextDisplay } from "../../ui/RichTextDisplay";

interface PreviewQuestion {
  id: string;
  type: string;
  text: string;
  marks: number;
  options: Array<{ id: string; text: string }>;
}

interface QuizPreviewProps {
  quizTitle: string;
  instructions?: string;
  durationMinutes: number;
  maxMarks: number;
  questions: PreviewQuestion[];
  onExitPreview: () => void;
}

export const QuizPreview: React.FC<QuizPreviewProps> = ({
  quizTitle,
  instructions,
  durationMinutes,
  maxMarks,
  questions,
  onExitPreview,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex] || null;
  const answeredCount = Object.keys(answers).length;

  const handleSelectOption = (questionId: string, optionId: string, isMulti: boolean) => {
    if (submitted) return;
    if (isMulti) {
      const currentList: string[] = answers[questionId] || [];
      const updated = currentList.includes(optionId)
        ? currentList.filter((id) => id !== optionId)
        : [...currentList, optionId];
      setAnswers((prev) => ({ ...prev, [questionId]: updated }));
    } else {
      setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    }
  };

  const toggleFlag = (index: number) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Simulation Banner */}
      <div className="flex items-center justify-between rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-2.5 text-xs text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-200">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded bg-indigo-600 text-white">
            <FontAwesomeIcon icon={faEye} />
          </span>
          <span>
            <strong>Instructor Student Preview: </strong> Experience the assessment layout, question navigation, and timer exactly as a student would. No real attempt or score is saved.
          </span>
        </div>
        <Button size="sm" variant="secondary" icon={faSignOutAlt} onClick={onExitPreview}>
          Exit Preview
        </Button>
      </div>

      {totalQuestions === 0 ? (
        <div className="text-center p-12 border border-dashed rounded-lg bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700">
          <p className="text-sm text-slate-500">Add questions to this quiz to test student preview.</p>
        </div>
      ) : submitted ? (
        <div className="text-center p-10 border rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-4">
          <FontAwesomeIcon icon={faCheckCircle} className="text-teal-600 text-4xl" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Preview Submission Completed
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            You answered {answeredCount} of {totalQuestions} questions. In student mode, automatic grading and immediate result policies will calculate marks instantly.
          </p>
          <div className="pt-2">
            <Button size="sm" variant="primary" onClick={() => setSubmitted(false)}>
              Retake Preview
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Question Panel */}
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
              {/* Question Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded">
                    Question {currentIndex + 1} of {totalQuestions}
                  </span>
                  <Badge variant="neutral" size="sm" hideDot>
                    {currentQuestion.type.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                  <span className="text-xs font-semibold text-slate-500">
                    {currentQuestion.marks} mark{currentQuestion.marks === 1 ? "" : "s"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => toggleFlag(currentIndex)}
                  className={`text-xs flex items-center gap-1.5 px-2.5 py-1 rounded border transition ${
                    flagged.has(currentIndex)
                      ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300 font-semibold"
                      : "border-slate-200 text-slate-500 hover:text-slate-700 dark:border-slate-700"
                  }`}
                >
                  <FontAwesomeIcon icon={faFlag} />
                  <span>{flagged.has(currentIndex) ? "Flagged for review" : "Flag question"}</span>
                </button>
              </div>

              {/* Question Body */}
              <div className="text-sm font-medium leading-relaxed">
                <RichTextDisplay content={currentQuestion.text} />
              </div>

              {/* Options area */}
              <div className="space-y-2 pt-2">
                {currentQuestion.options && currentQuestion.options.length > 0 ? (
                  currentQuestion.options.map((opt, optIndex) => {
                    const isMulti = currentQuestion.type === "MULTIPLE_SELECT";
                    const isSelected = isMulti
                      ? (answers[currentQuestion.id] || []).includes(opt.id)
                      : answers[currentQuestion.id] === opt.id;

                    return (
                      <label
                        key={opt.id}
                        onClick={() => handleSelectOption(currentQuestion.id, opt.id, isMulti)}
                        className={`flex items-start gap-3 rounded-lg border p-3.5 cursor-pointer text-sm transition ${
                          isSelected
                            ? "border-teal-500 bg-teal-50/70 text-teal-900 dark:bg-teal-950/40 dark:border-teal-700 dark:text-teal-100 font-medium"
                            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/50"
                        }`}
                      >
                        <input
                          type={isMulti ? "checkbox" : "radio"}
                          name={`q_${currentQuestion.id}`}
                          checked={isSelected}
                          onChange={() => {}}
                          className="mt-0.5 h-4 w-4 text-teal-600 accent-teal-600 focus:ring-teal-500"
                        />
                        <span className="font-bold text-slate-500 shrink-0">
                          {String.fromCharCode(65 + optIndex)}.
                        </span>
                        <span className="min-w-0 flex-1">{opt.text}</span>
                      </label>
                    );
                  })
                ) : (
                  <div className="pt-2">
                    <textarea
                      rows={4}
                      value={answers[currentQuestion.id] || ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [currentQuestion.id]: e.target.value,
                        }))
                      }
                      placeholder="Type your response here..."
                      className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}
              </div>

              {/* Navigation Footer */}
              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={faArrowLeft}
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
                >
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {currentIndex < totalQuestions - 1 ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setCurrentIndex((idx) => Math.min(totalQuestions - 1, idx + 1))}
                    >
                      <span>Next</span>
                      <FontAwesomeIcon icon={faArrowRight} className="ml-1.5" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setSubmitted(true)}
                    >
                      Finish Attempt
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar: Palette Navigation & Timer */}
          <div className="space-y-4">
            {/* Timer Box */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 text-center space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-center gap-1.5">
                <FontAwesomeIcon icon={faClock} />
                Time Remaining
              </span>
              <div className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-100">
                {String(durationMinutes || 30).padStart(2, "0")}:00
              </div>
              <p className="text-[11px] text-slate-400">Total allowed: {durationMinutes || 30} mins</p>
            </div>

            {/* Quiz Navigation Palette */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Question Palette
                </h4>
                <span className="text-xs text-slate-500 font-medium">
                  {answeredCount}/{totalQuestions} Answered
                </span>
              </div>

              {/* Grid of question buttons */}
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, idx) => {
                  const isCurrent = idx === currentIndex;
                  const isAnswered = answers[q.id] !== undefined && answers[q.id] !== "";
                  const isFlagged = flagged.has(idx);

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`relative h-9 w-full rounded font-semibold text-xs transition flex items-center justify-center ${
                        isCurrent
                          ? "ring-2 ring-teal-600 bg-teal-600 text-white shadow-xs"
                          : isAnswered
                            ? "bg-teal-100 text-teal-900 dark:bg-teal-950/60 dark:text-teal-200 border border-teal-300 dark:border-teal-700"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {idx + 1}
                      {isFlagged && (
                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-1 ring-white" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] space-y-1 text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded bg-teal-600" />
                  <span>Current Question</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded bg-teal-100 border border-teal-300" />
                  <span>Answered</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded bg-slate-100 border border-slate-300" />
                  <span>Not Answered</span>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-xs"
                  onClick={() => setSubmitted(true)}
                >
                  Submit Assessment
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizPreview;

