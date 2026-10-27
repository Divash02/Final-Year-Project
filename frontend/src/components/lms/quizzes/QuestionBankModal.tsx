import React, { useState, useEffect, useMemo, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faShuffle,
  faPlus,
  faCheck,
  faLayerGroup,
  faBookOpen,
} from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../../ui/Modal";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { RichTextDisplay } from "../../ui/RichTextDisplay";
import { fetchQuestionBank, addQuizQuestion } from "../../../services/lmsApi";
import type { LmsQuestion } from "../../../types/lms";

interface QuestionBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  quizId: string;
  onQuestionsAdded: (count: number) => void;
  onError: (msg: string) => void;
}

export const QuestionBankModal: React.FC<QuestionBankModalProps> = ({
  isOpen,
  onClose,
  courseId,
  quizId,
  onQuestionsAdded,
  onError,
}) => {
  const [bank, setBank] = useState<LmsQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // Random picker configuration
  const [showRandomPicker, setShowRandomPicker] = useState(false);
  const [randomCount, setRandomCount] = useState(5);
  const [randomTopic, setRandomTopic] = useState("");
  const [randomDifficulty, setRandomDifficulty] = useState("");

  const loadBank = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchQuestionBank(courseId, {
        q: search || undefined,
        type: typeFilter || undefined,
        difficulty: difficultyFilter || undefined,
      });
      setBank(res.questions || []);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load question bank.");
    } finally {
      setLoading(false);
    }
  }, [courseId, search, typeFilter, difficultyFilter, onError]);

  useEffect(() => {
    if (isOpen) {
      void loadBank();
    }
  }, [isOpen, loadBank]);

  const topics = useMemo(() => {
    const list = bank.map((q) => q.topic).filter(Boolean) as string[];
    return [...new Set(list)].sort();
  }, [bank]);

  const filteredQuestions = useMemo(() => {
    return bank.filter((q) => {
      if (topicFilter && q.topic !== topicFilter) return false;
      return true;
    });
  }, [bank, topicFilter]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (!quizId) {
      onError("Please save the quiz draft before adding questions from the bank.");
      return;
    }
    setAdding(true);
    let addedCount = 0;
    try {
      const toAdd = bank.filter((q) => selectedIds.has(q.id));
      for (const q of toAdd) {
        await addQuizQuestion(quizId, {
          bankQuestionId: q.id,
          type: q.type,
          text: q.text,
          richText: q.richText || "",
          marks: q.marks,
          difficulty: q.difficulty,
          topic: q.topic ?? undefined,
          category: q.category ?? undefined,
          explanation: q.explanation || undefined,
          options: q.options ? q.options.map((opt) => ({ text: opt.text })) : undefined,
          correctAnswer: q.correctAnswer,
        });
        addedCount += 1;
      }
      onQuestionsAdded(addedCount);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add some questions.");
    } finally {
      setAdding(false);
    }
  };

  const handleAddRandom = async () => {
    if (!quizId) {
      onError("Please save the quiz draft before pulling random questions.");
      return;
    }

    const pool = bank.filter((q) => {
      if (randomTopic && q.topic !== randomTopic) return false;
      if (randomDifficulty && q.difficulty !== randomDifficulty) return false;
      return true;
    });

    if (pool.length === 0) {
      onError("No questions in the bank match the configured random criteria.");
      return;
    }

    // Shuffle pool and take N
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const picked = shuffled.slice(0, Math.min(randomCount, shuffled.length));

    setAdding(true);
    let added = 0;
    try {
      for (const q of picked) {
        await addQuizQuestion(quizId, {
          bankQuestionId: q.id,
          type: q.type,
          text: q.text,
          richText: q.richText || "",
          marks: q.marks,
          difficulty: q.difficulty,
          topic: q.topic ?? undefined,
          category: q.category ?? undefined,
          explanation: q.explanation || undefined,
          options: q.options ? q.options.map((opt) => ({ text: opt.text })) : undefined,
          correctAnswer: q.correctAnswer,
        });
        added += 1;
      }
      onQuestionsAdded(added);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add random questions.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Course Question Bank"
      maxWidth="3xl"
    >
      <div className="space-y-4">
        {/* Top Action Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <p className="text-xs text-slate-500">
            Browse vetted questions across this course, or pull a random subset by topic and difficulty.
          </p>

          <Button
            size="sm"
            variant={showRandomPicker ? "primary" : "secondary"}
            icon={faShuffle}
            onClick={() => setShowRandomPicker(!showRandomPicker)}
          >
            {showRandomPicker ? "Manual Selection" : "Random Selection Tool"}
          </Button>
        </div>

        {/* Random Picker Box */}
        {showRandomPicker ? (
          <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4 dark:border-teal-800 dark:bg-teal-950/30 space-y-4">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-teal-600 text-white text-xs">
                <FontAwesomeIcon icon={faShuffle} />
              </span>
              <h4 className="text-sm font-bold text-teal-950 dark:text-teal-200">
                Random Question Selection Configuration
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Topic
                </label>
                <select
                  value={randomTopic}
                  onChange={(e) => setRandomTopic(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Any Topic</option>
                  {topics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Difficulty Level
                </label>
                <select
                  value={randomDifficulty}
                  onChange={(e) => setRandomDifficulty(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Any Difficulty</option>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={randomCount}
                  onChange={(e) => setRandomCount(Number(e.target.value) || 1)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                variant="primary"
                onClick={handleAddRandom}
                isLoading={adding}
                loadingLabel="Sampling & Adding..."
              >
                Pull {randomCount} Random Questions
              </Button>
            </div>
          </div>
        ) : (
          /* Manual Selection Filter Bar */
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="sm:col-span-2 relative">
                <FontAwesomeIcon
                  icon={faSearch}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search questions by text or concept..."
                  className="w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">All Types</option>
                  <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                  <option value="MULTIPLE_SELECT">Multiple Select</option>
                  <option value="TRUE_FALSE">True / False</option>
                  <option value="SHORT_ANSWER">Short Answer</option>
                  <option value="LONG_ANSWER">Long Answer</option>
                </select>
              </div>

              <div>
                <select
                  value={difficultyFilter}
                  onChange={(e) => setDifficultyFilter(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">All Difficulties</option>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
            </div>

            {/* Questions list */}
            <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
              {loading ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading question bank...</div>
              ) : filteredQuestions.length === 0 ? (
                <div className="text-center py-10 border border-dashed rounded-lg border-slate-200 dark:border-slate-700 text-xs text-slate-400 space-y-1">
                  <FontAwesomeIcon icon={faBookOpen} className="text-2xl text-slate-300 dark:text-slate-600 mb-1" />
                  <p>No questions found in this course bank matching the filters.</p>
                </div>
              ) : (
                filteredQuestions.map((q) => {
                  const isChecked = selectedIds.has(q.id);
                  return (
                    <label
                      key={q.id}
                      onClick={() => toggleSelect(q.id)}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition text-xs ${
                        isChecked
                          ? "border-teal-500 bg-teal-50/70 dark:bg-teal-950/40 dark:border-teal-700"
                          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-1 h-4 w-4 rounded accent-teal-600 focus:ring-teal-500 shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {q.type.replace(/_/g, " ").toLowerCase()}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500 font-medium">{q.marks} marks</span>
                          <span className="text-slate-400">·</span>
                          <Badge variant="neutral" size="sm" hideDot>
                            {q.difficulty.toLowerCase()}
                          </Badge>
                          {q.topic && (
                            <span className="text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">
                              {q.topic}
                            </span>
                          )}
                        </div>

                        <div className="line-clamp-2 text-slate-700 dark:text-slate-300 font-normal">
                          <RichTextDisplay content={q.richText || q.text} />
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {/* Footer with Selection Count */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
              <span className="text-xs text-slate-500 font-medium">
                {selectedIds.size} question{selectedIds.size === 1 ? "" : "s"} selected
              </span>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onClose} disabled={adding}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={faPlus}
                  disabled={selectedIds.size === 0}
                  isLoading={adding}
                  loadingLabel="Adding to Quiz..."
                  onClick={handleAddSelected}
                >
                  Add Selected to Quiz
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default QuestionBankModal;

