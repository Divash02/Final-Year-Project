import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus, faSquare, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { Drawer } from "../shared/Drawer";
import { FormField } from "../../ui/Input";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { RichTextEditor } from "../../notices/RichTextEditor";
import type { LmsQuestionDraft, LmsQuestion, LmsQuizOption } from "../../../types/lms";
import { addQuizQuestion, updateQuizQuestion } from "../../../services/lmsApi";

/** Every type the question authoring surface supports. */
export type QuestionEditorType =
  | "MULTIPLE_CHOICE"
  | "MULTIPLE_SELECT"
  | "TRUE_FALSE"
  | "FILL_BLANK"
  | "SHORT_ANSWER"
  | "LONG_ANSWER";

interface OptionRow {
  id: string;
  text: string;
}

interface QuestionEditorQuestion {
  id: string;
  type: NonNullable<LmsQuestion["type"]>;
  text: string;
  richText: string;
  marks: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  category: string | null;
  topic: string | null;
  explanation: string;
  options: LmsQuizOption[];
  correctAnswer: unknown[];
}

interface QuestionEditorProps {
  quizId: string;
  /** Question to edit, or null to author a fresh one. */
  question: QuestionEditorQuestion | null;
  onClose: () => void;
  /** Receives the server-saved question (with id / position) so the builder can sync its list. */
  onSaved: (question: LmsQuestion) => void;
  onError: (message: string) => void;
}

export const QuestionEditor: React.FC<QuestionEditorProps> = ({
  quizId,
  question,
  onClose,
  onSaved,
  onError,
}) => {
  const [type, setType] = useState<QuestionEditorType>(
    (question?.type as QuestionEditorType) || "MULTIPLE_CHOICE",
  );
  const [text, setText] = useState(question?.richText || question?.text || "");
  const [marks, setMarks] = useState(String(question?.marks ?? 1));
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">(
    question?.difficulty || "MEDIUM",
  );
  const [category, setCategory] = useState(question?.category || "");
  const [topic, setTopic] = useState(question?.topic || "");
  const [explanation, setExplanation] = useState(question?.explanation || "");

  const [options, setOptions] = useState<OptionRow[]>(() => {
    if (!question?.options?.length) {
      return type === "TRUE_FALSE"
        ? [
            { id: "TRUE", text: "True" },
            { id: "FALSE", text: "False" },
          ]
        : [{ id: "option_1", text: "" }, { id: "option_2", text: "" }];
    }
    return question.options.map((option) => ({ id: option.id, text: option.text }));
  });

  const [correctIndices, setCorrectIndices] = useState<Set<number>>(new Set());
  const [fillBlankGroups, setFillBlankGroups] = useState<string[][]>([]);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isChoice = type === "MULTIPLE_CHOICE" || type === "MULTIPLE_SELECT";
  const isTrueFalse = type === "TRUE_FALSE";
  const isFillBlank = type === "FILL_BLANK";
  const isManual = type === "SHORT_ANSWER" || type === "LONG_ANSWER";

  // Pre-select the stored correct answers when editing an existing question.
  useEffect(() => {
    if (!question) return;
    const initial = new Set<number>();
    if (question.correctAnswer?.length) {
      const key = question.correctAnswer.map((value) => String(value));
      question.options.forEach((option, index) => {
        if (key.includes(option.id)) initial.add(index);
      });
    }
    setCorrectIndices(initial);
  }, [question]);

  const resetOptions = useCallback(() => {
    if (isTrueFalse) {
      setOptions([
        { id: "TRUE", text: "True" },
        { id: "FALSE", text: "False" },
      ]);
      setCorrectIndices(new Set([0]));
    } else {
      setOptions([
        { id: "option_1", text: "" },
        { id: "option_2", text: "" },
      ]);
      setCorrectIndices(new Set());
    }
  }, [isTrueFalse]);

  const addOption = useCallback(() => {
    setOptions((current) => [
      ...current,
      { id: `option_${current.length + 1}`, text: "" },
    ]);
  }, []);

  const removeOption = useCallback((index: number) => {
    setOptions((current) => current.filter((_, i) => i !== index));
    setCorrectIndices((current) => {
      const next = new Set(current);
      next.delete(index);
      current.forEach((i) => {
        if (i > index) next.add(i - 1);
      });
      return next;
    });
  }, []);

  const submit = async () => {
    if (!text.trim()) {
      onError("Enter the question.");
      return;
    }
    const marksValue = Number(marks);
    if (!Number.isFinite(marksValue) || marksValue < 0) {
      onError("Enter a valid mark value.");
      return;
    }

    let correctAnswer: unknown[] = [];
    try {
      if (isChoice) {
        if (type === "MULTIPLE_CHOICE" && correctIndices.size !== 1) {
          onError("Select exactly one correct option.");
          return;
        }
        const picked = [...correctIndices].sort((a, b) => a - b);
        correctAnswer = picked.map((index) => options[index]?.id).filter(Boolean);
        if (correctAnswer.length === 0) {
          onError("Select at least one correct option.");
          return;
        }
      } else if (isTrueFalse) {
        correctAnswer = [
          options[correctIndices.size ? 0 : 1]?.id ||
            (correctIndices.has(0) ? "TRUE" : "FALSE"),
        ];
      } else if (isFillBlank) {
        const usable = fillBlankGroups.filter((group) => group.some(Boolean));
        if (!usable.length) {
          onError("Enter at least one accepted answer per blank.");
          return;
        }
        correctAnswer = usable;
      } else {
        const ref = explanation.trim() || text.trim();
        correctAnswer = [ref];
      }
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The question could not be validated.",
      );
      return;
    }

    const draft: LmsQuestionDraft = {
      type,
      text: text.trim(),
      marks: marksValue,
      difficulty,
      category: category.trim() || undefined,
      topic: topic.trim() || undefined,
      explanation: explanation.trim() || undefined,
      options: isChoice || isTrueFalse
        ? options.map((option) => ({ id: option.id, text: option.text }))
        : undefined,
      correctAnswer,
    };

    setBusy(true);
    try {
      let saved: LmsQuestion;
      if (question) {
        const result = await updateQuizQuestion(quizId, question.id, draft);
        saved = result.question;
      } else {
        const result = await addQuizQuestion(quizId, draft);
        saved = result.question;
      }
      onSaved(saved);
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The question could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () => {
    setDeleteOpen(true);
  };

  const keyLabel = useMemo(() => {
    if (isChoice) {
      return correctIndices.size === 1
        ? `Correct: ${String.fromCharCode(65 + [...correctIndices][0])}`
        : `${correctIndices.size} correct`;
    }
    if (isTrueFalse) {
      return `Correct: ${correctIndices.has(0) ? "True" : "False"}`;
    }
    return isFillBlank ? `${fillBlankGroups.length} blank(s)` : "Manual grading";
  }, [isChoice, isTrueFalse, isFillBlank, correctIndices, fillBlankGroups]);

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={question ? "Edit question" : "Add question"}
      subtitle={`Question ${type.replace(/_/g, " ").toLowerCase()}`}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {question && (
            <Button
              variant="ghost"
              icon={faTrash}
              onClick={handleDelete}
              disabled={busy}
            >
              Delete
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => void submit()}
            isLoading={busy}
            loadingLabel={question ? "Saving" : "Adding"}
            disabled={busy || !text.trim()}
          >
            {question ? "Save question" : "Add question"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-wrap items-start gap-3">
            <FormField
              label="Question type"
              required
              className="w-full md:w-64"
            >
              {({ id, describedBy }) => (
                <select
                  id={id}
                  aria-describedby={describedBy}
                  className="cos-input"
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value as QuestionEditorType);
                    resetOptions();
                    setCorrectIndices(new Set());
                  }}
                >
                  <option value="MULTIPLE_CHOICE">Multiple choice (single answer)</option>
                  <option value="MULTIPLE_SELECT">Multiple select (multiple answers)</option>
                  <option value="TRUE_FALSE">True / false</option>
                  <option value="FILL_BLANK">Fill in the blank</option>
                  <option value="SHORT_ANSWER">Short answer</option>
                  <option value="LONG_ANSWER">Long answer / essay</option>
                </select>
              )}
            </FormField>
            <FormField
              label="Difficulty"
              className="w-full md:w-48"
            >
              {({ id, describedBy }) => (
                <select
                  id={id}
                  aria-describedby={describedBy}
                  className="cos-input"
                  value={difficulty}
                  onChange={(event) =>
                    setDifficulty(event.target.value as "EASY" | "MEDIUM" | "HARD")
                  }
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              )}
            </FormField>
            <FormField label="Marks" className="w-full md:w-40">
              {({ id, describedBy }) => (
                <input
                  id={id}
                  type="number"
                  min={0}
                  step={0.5}
                  aria-describedby={describedBy}
                  className="cos-input"
                  value={marks}
                  onChange={(event) => setMarks(event.target.value)}
                />
              )}
            </FormField>
            <span className="self-end text-xs text-slate-500 dark:text-slate-400">
              {keyLabel}
            </span>
          </div>
        </div>

        <FormField label="Question" required helperText="The question students will read.">
          {({ id, describedBy, invalid }) => (
            <RichTextEditor
              value={text}
              onChange={setText}
              placeholder="Write the question…"
              minHeight="10rem"
            />
          )}
        </FormField>

        {isChoice && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Answer options
            </p>
            {options.map((option, index) => (
              <div
                key={option.id}
                className={`flex items-start gap-2 rounded-lg border p-2.5 ${
                  correctIndices.has(index)
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                {isChoice ? (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={correctIndices.has(index)}
                    onClick={() =>
                      type === "MULTIPLE_CHOICE"
                        ? setCorrectIndices(new Set([index]))
                        : setCorrectIndices((current) =>
                            current.has(index)
                              ? new Set([...current].filter((i) => i !== index))
                              : new Set([...current, index]),
                          )
                    }
                    className={`shrink-0 mt-1 h-4 w-4 rounded-full border ${
                      correctIndices.has(index)
                        ? "bg-[var(--color-primary)] border-[var(--color-primary)]"
                        : "border-slate-300"
                    }`}
                  />
                ) : (
                  <span className="shrink-0 mt-1 h-4 w-4 rounded-full border border-slate-300 flex items-center justify-center text-[0.55rem] text-slate-500">
                    <FontAwesomeIcon icon={faSquare} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <input
                    value={option.text}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, text: event.target.value } : row,
                        ),
                      )
                    }
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none border-none focus:ring-0"
                    aria-label={`Option ${String.fromCharCode(65 + index)}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  className="shrink-0 p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                  aria-label={`Remove option ${String.fromCharCode(65 + index)}`}
                >
                  <FontAwesomeIcon icon={faMinus} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              className="flex items-center gap-1.5 text-sm text-[var(--color-primary)] hover:text-[var(--color-primary-strong)]"
            >
              <FontAwesomeIcon icon={faPlus} className="shrink-0" aria-hidden="true" />
              Add option
            </button>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {type === "MULTIPLE_CHOICE"
                ? "Exactly one option must be marked correct."
                : "Select every correct option."}
            </p>
          </div>
        )}

        {isTrueFalse && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Correct answer
            </p>
            <div className="flex gap-3">
              {["True", "False"].map((label, index) => (
                <label
                  key={label}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                    correctIndices.has(index)
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                      : "border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="tf-correct"
                    checked={correctIndices.has(index)}
                    onChange={() => setCorrectIndices(new Set([index]))}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}

        {isFillBlank && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Accepted answers (one group per blank)
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Write each blank&rsquo;s accepted answers separated by commas. One
              group per blank.
            </p>
            {fillBlankGroups.map((group, groupIndex) => (
              <div
                key={groupIndex}
                className="flex items-start gap-2 rounded-lg border p-2.5 border-slate-200 dark:border-slate-700"
              >
                <span className="shrink-0 mt-1 text-xs font-medium text-slate-500">
                  Blank {groupIndex + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <input
                    value={group.join(", ")}
                    onChange={(event) => {
                      const values = event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean);
                      setFillBlankGroups((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === groupIndex ? values : row,
                        ),
                      );
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none border-none focus:ring-0"
                    placeholder="accepted answer, alternative"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setFillBlankGroups((current) =>
                      current.filter((_, i) => i !== groupIndex),
                    )
                  }
                  className="shrink-0 p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  <FontAwesomeIcon icon={faMinus} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setFillBlankGroups((current) => [...current, []])
              }
              className="flex items-center gap-1.5 text-sm text-[var(--color-primary)] hover:text-[var(--color-primary-strong)]"
            >
              <FontAwesomeIcon icon={faPlus} className="shrink-0" aria-hidden="true" />
              Add blank
            </button>
          </div>
        )}

        {isManual && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Marking reference
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Short answers and essays are marked manually. This text is a
              reference for the marker, not an automatic key.
            </p>
            <FormField label="Model answer / marking notes">
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  aria-describedby={describedBy}
                  className="cos-input min-h-16 resize-y"
                  value={explanation}
                  onChange={(event) => setExplanation(event.target.value)}
                  placeholder="What a strong answer should contain…"
                />
              )}
            </FormField>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Category" helperText="Optional topic grouping.">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                className="cos-input"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Topic" helperText="Optional topic tag for the bank.">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                className="cos-input"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              />
            )}
          </FormField>
        </div>

        <FormField label="Answer explanation" helperText="Shown after results are released, if configured.">
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              className="cos-input min-h-16 resize-y"
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              placeholder="Why this answer is correct…"
            />
          )}
        </FormField>
      </div>

      {deleteOpen && (
        <ConfirmDialog
          isOpen={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          confirmLabel="Delete question"
          title="Delete question?"
          message="This question and its answer configuration will be removed from the quiz."
          subject={text.slice(0, 60)}
          severity="warning"
          onConfirm={() => {
            setDeleteOpen(false);
            onClose();
          }}
        />
      )}
    </Drawer>
  );
};

export default QuestionEditor;
