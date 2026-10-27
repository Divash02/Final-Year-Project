import React, { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faTriangleExclamation,
  faCircleXmark,
  faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../../ui/Modal";
import { Button } from "../../ui/Button";

interface QualityIssue {
  severity: "error" | "warning" | "tip";
  title: string;
  description: string;
  questionIndex?: number;
}

interface QuestionLike {
  id: string;
  text: string;
  type: string;
  marks: number;
  options?: Array<{ id: string; text: string }>;
  correctAnswer?: unknown[];
}

interface AIQualityCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  quizTitle: string;
  questions: QuestionLike[];
  maxMarks: number;
}

export const AIQualityCheckModal: React.FC<AIQualityCheckModalProps> = ({
  isOpen,
  onClose,
  quizTitle,
  questions,
  maxMarks,
}) => {
  const issues = useMemo<QualityIssue[]>(() => {
    const list: QualityIssue[] = [];

    // Check empty questions
    if (questions.length === 0) {
      list.push({
        severity: "error",
        title: "No questions in quiz",
        description: "The quiz has no questions. Students will have nothing to attempt.",
      });
      return list;
    }

    // Check total marks match
    const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);
    if (totalMarks !== maxMarks) {
      list.push({
        severity: "warning",
        title: "Marks discrepancy",
        description: `Sum of question marks (${totalMarks}) does not match configured quiz maximum marks (${maxMarks}). Consider synchronizing before publishing.`,
      });
    }

    // Check each question
    const textSeen = new Map<string, number>();

    questions.forEach((q, idx) => {
      const qNum = idx + 1;
      const cleanText = q.text.replace(/<[^>]*>/g, "").trim();

      // Missing text
      if (!cleanText) {
        list.push({
          severity: "error",
          title: `Question ${qNum}: Missing question text`,
          description: "Question has no prompt text configured.",
          questionIndex: qNum,
        });
      }

      // Check duplicate text
      const lower = cleanText.toLowerCase();
      if (textSeen.has(lower)) {
        list.push({
          severity: "warning",
          title: `Duplicate question wording`,
          description: `Question ${qNum} has identical wording to Question ${textSeen.get(lower)}. Verify this is intentional.`,
          questionIndex: qNum,
        });
      } else if (cleanText.length > 5) {
        textSeen.set(lower, qNum);
      }

      // Missing marks
      if (!q.marks || q.marks <= 0) {
        list.push({
          severity: "error",
          title: `Question ${qNum}: Zero or missing marks`,
          description: "This question awards 0 marks. Ensure every question has valid positive marks.",
          questionIndex: qNum,
        });
      }

      // Multiple choice checks
      if (q.type === "MULTIPLE_CHOICE") {
        if (!q.options || q.options.length < 2) {
          list.push({
            severity: "error",
            title: `Question ${qNum}: Insufficient options`,
            description: "Multiple choice questions should have at least 2 distinct answer options.",
            questionIndex: qNum,
          });
        }

        const correct = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
        if (correct.length === 0) {
          list.push({
            severity: "error",
            title: `Question ${qNum}: Missing correct answer`,
            description: "No answer option has been designated as correct.",
            questionIndex: qNum,
          });
        } else if (correct.length > 1) {
          list.push({
            severity: "warning",
            title: `Question ${qNum}: Multiple correct options selected`,
            description: "Single-choice question has more than one correct answer flagged. Consider switching type to Multiple Select.",
            questionIndex: qNum,
          });
        }
      }

      // Short wording warning
      if (cleanText.length > 0 && cleanText.length < 15) {
        list.push({
          severity: "tip",
          title: `Question ${qNum}: Brief prompt`,
          description: "The question text is very concise. Make sure sufficient context is provided so students aren't confused.",
          questionIndex: qNum,
        });
      }
    });

    if (list.length === 0) {
      list.push({
        severity: "tip",
        title: "All quality checks passed",
        description: "No duplicate questions, missing answers, or mark discrepancies detected. Ready to publish!",
      });
    }

    return list;
  }, [questions, maxMarks]);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI Question Quality & Audit Check"
      maxWidth="2xl"
    >
      <div className="space-y-4">
        {/* Header summary badge */}
        <div
          className={`rounded-lg border p-3.5 flex items-center justify-between ${
            errorCount > 0
              ? "bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-200"
              : warningCount > 0
                ? "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200"
                : "bg-teal-50 border-teal-200 text-teal-900 dark:bg-teal-950/30 dark:border-teal-800 dark:text-teal-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">
              {errorCount > 0 ? (
                <FontAwesomeIcon icon={faCircleXmark} className="text-rose-600" />
              ) : warningCount > 0 ? (
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-amber-600" />
              ) : (
                <FontAwesomeIcon icon={faCircleCheck} className="text-teal-600" />
              )}
            </span>
            <div>
              <h4 className="text-sm font-semibold">
                {errorCount > 0
                  ? `${errorCount} Critical issue(s) detected`
                  : warningCount > 0
                    ? `${warningCount} Recommendation(s) to review`
                    : "Assessment is in excellent shape"}
              </h4>
              <p className="text-xs opacity-90">
                Audited {questions.length} questions across clarity, scoring key, and consistency.
              </p>
            </div>
          </div>
        </div>

        {/* Issue list */}
        <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
          {issues.map((issue, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-3 flex items-start gap-3 text-xs leading-relaxed ${
                issue.severity === "error"
                  ? "bg-rose-50/60 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800"
                  : issue.severity === "warning"
                    ? "bg-amber-50/60 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
                    : "bg-slate-50 border-slate-200 dark:bg-slate-800/60 dark:border-slate-700"
              }`}
            >
              <span className="mt-0.5 shrink-0 text-sm">
                {issue.severity === "error" ? (
                  <FontAwesomeIcon icon={faCircleXmark} className="text-rose-600" />
                ) : issue.severity === "warning" ? (
                  <FontAwesomeIcon icon={faTriangleExclamation} className="text-amber-600" />
                ) : (
                  <FontAwesomeIcon icon={faLightbulb} className="text-teal-600" />
                )}
              </span>
              <div className="flex-1">
                <span className="font-semibold text-slate-800 dark:text-slate-200 block text-sm mb-0.5">
                  {issue.title}
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {issue.description}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-700">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done Reviewing
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AIQualityCheckModal;
