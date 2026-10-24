import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { Drawer } from "../shared/Drawer";
import { EmptyState } from "../../ui/EmptyState";
import { Skeleton } from "../../ui/Skeleton";
import { SelectField } from "../../ui/Input";
import { useDebouncedValue } from "../shared/useDebouncedValue";
import type { LmsQuestion } from "../../../types/lms";
import { addQuizQuestion, fetchQuestionBank } from "../../../services/lmsApi";

interface QuestionBankPickerProps {
  courseId: string;
  quizId: string;
  onClose: () => void;
  onAdded: (count: number) => void;
  onError: (message: string) => void;
}

export const QuestionBankPicker: React.FC<QuestionBankPickerProps> = ({
  courseId,
  quizId,
  onClose,
  onAdded,
  onError,
}) => {
  const [bank, setBank] = useState<LmsQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [typeFilter, setTypeFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchQuestionBank(courseId, {
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

  const topics = useMemo(
    () => [...new Set(bank.map((q) => q.topic).filter((t): t is string => Boolean(t)))].sort(),
    [bank],
  );

  const addSelected = async () => {
    setBusy(true);
    let added = 0;
    try {
      for (const question of bank.filter((row) => selected.has(row.id))) {
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
    if (typeFilter && question.type !== typeFilter) return false;
    if (difficultyFilter && question.difficulty !== difficultyFilter) return false;
    if (topicFilter && question.topic !== topicFilter) return false;
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
      <div className="space-y-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search questions…"
              className="cos-input pl-10 w-full"
            />
          </div>
          <SelectField
            label="Type"
            hideLabel
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="h-9 w-40 text-xs"
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            <option value="MULTIPLE_CHOICE">Multiple choice</option>
            <option value="MULTIPLE_SELECT">Multiple select</option>
            <option value="TRUE_FALSE">True / false</option>
            <option value="FILL_BLANK">Fill in the blank</option>
            <option value="SHORT_ANSWER">Short answer</option>
            <option value="LONG_ANSWER">Long answer / essay</option>
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
          {topics.length && (
            <SelectField
              label="Topic"
              hideLabel
              value={topicFilter}
              onChange={(event) => setTopicFilter(event.target.value)}
              className="h-9 w-40 text-xs"
              aria-label="Filter by topic"
            >
              <option value="">Any topic</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </SelectField>
          )}
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        ) : loading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={faSearch}
            title="No matching questions"
            description="Try a different search, topic, or filter."
          />
        ) : (
          <ul className="space-y-1.5 max-h-[40vh] overflow-y-auto">
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
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-800 dark:text-slate-200">
                      {question.text}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                      <span>{question.type.replace(/_/g, " ").toLowerCase()}</span>
                      <span>{question.difficulty.toLowerCase()}</span>
                      {question.topic && <span>{question.topic}</span>}
                      <span>{question.marks} marks</span>
                      {question.usageCount > 0 && <span>used {question.usageCount}×</span>}
                    </span>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
};

export default QuestionBankPicker;
