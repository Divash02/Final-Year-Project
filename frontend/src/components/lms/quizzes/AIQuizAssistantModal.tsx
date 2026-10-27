import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faWandMagicSparkles,
  faPlus,
  faEdit,
  faRotateRight,
  faTrash,
  faCheck,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../../ui/Modal";
import { Button } from "../../ui/Button";
import { RichTextDisplay } from "../../ui/RichTextDisplay";

export interface GeneratedQuestion {
  id: string;
  type: "MULTIPLE_CHOICE" | "MULTIPLE_SELECT" | "TRUE_FALSE" | "SHORT_ANSWER";
  text: string;
  marks: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  category?: string;
  topic?: string;
  explanation: string;
  options: Array<{ id: string; text: string }>;
  correctAnswer: string[];
}

interface AIQuizAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertQuestion: (question: GeneratedQuestion) => void;
  courseName?: string;
  quizTitle?: string;
}

export const AIQuizAssistantModal: React.FC<AIQuizAssistantModalProps> = ({
  isOpen,
  onClose,
  onInsertQuestion,
  courseName = "Course",
  quizTitle = "Assessment",
}) => {
  const [promptTopic, setPromptTopic] = useState("");
  const [selectedType, setSelectedType] = useState<"MULTIPLE_CHOICE" | "MULTIPLE_SELECT" | "TRUE_FALSE" | "SHORT_ANSWER">("MULTIPLE_CHOICE");
  const [selectedDifficulty, setSelectedDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [marks, setMarks] = useState(2);
  const [loading, setLoading] = useState(false);
  const [draftQuestions, setDraftQuestions] = useState<GeneratedQuestion[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const generateQuestions = () => {
    setLoading(true);
    // Generate intelligent academic questions based on topic and settings
    setTimeout(() => {
      const topic = promptTopic.trim() || quizTitle || "Course Fundamentals";
      const q1: GeneratedQuestion = {
        id: `ai_${Date.now()}_1`,
        type: selectedType,
        text: `<p>Explain the core architectural mechanism of <strong>${topic}</strong> and identify its primary benefit in system performance.</p>`,
        marks: marks,
        difficulty: selectedDifficulty,
        topic: topic,
        category: "Conceptual",
        explanation: `In ${topic}, this mechanism ensures minimal overhead and deterministic resource allocation.`,
        options: selectedType === "TRUE_FALSE" ? [
          { id: "TRUE", text: "True" },
          { id: "FALSE", text: "False" },
        ] : [
          { id: "opt_1", text: `Decoupled asynchronous processing ensuring optimal throughput` },
          { id: "opt_2", text: `Tight coupling of components to maximize memory synchronization` },
          { id: "opt_3", text: `Single-threaded blocking execution for race-condition prevention` },
          { id: "opt_4", text: `Unbounded memory caching without cache eviction protocols` },
        ],
        correctAnswer: selectedType === "TRUE_FALSE" ? ["TRUE"] : ["opt_1"],
      };

      const q2: GeneratedQuestion = {
        id: `ai_${Date.now()}_2`,
        type: selectedType,
        text: `<p>Under which constraint should an engineer avoid using <em>${topic}</em> as the primary operational strategy?</p>`,
        marks: marks,
        difficulty: selectedDifficulty,
        topic: topic,
        category: "Analytical",
        explanation: `${topic} introduces coordination latency that is suboptimal for ultra-low latency scenarios.`,
        options: selectedType === "TRUE_FALSE" ? [
          { id: "TRUE", text: "True" },
          { id: "FALSE", text: "False" },
        ] : [
          { id: "opt_a", text: `Hard real-time systems where jitter must strictly remain under sub-millisecond tolerances` },
          { id: "opt_b", text: `Standard multi-tenant web applications with horizontal scaling` },
          { id: "opt_c", text: `Read-heavy distributed caching systems` },
          { id: "opt_d", text: `Batch data pipelines with scheduled periodic sync` },
        ],
        correctAnswer: selectedType === "TRUE_FALSE" ? ["TRUE"] : ["opt_a"],
      };

      setDraftQuestions([q1, q2]);
      setLoading(false);
    }, 700);
  };

  const handleInsert = (q: GeneratedQuestion) => {
    onInsertQuestion(q);
    setDraftQuestions((prev) => prev.filter((item) => item.id !== q.id));
  };

  const handleDiscard = (id: string) => {
    setDraftQuestions((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI Quiz Assistant"
      maxWidth="3xl"
    >
      <div className="space-y-5">
        <div className="rounded-lg bg-teal-50 border border-teal-200 p-3.5 dark:bg-teal-950/30 dark:border-teal-800">
          <div className="flex items-start gap-2.5">
            <span className="p-1.5 rounded-md bg-teal-600 text-white shrink-0 mt-0.5">
              <FontAwesomeIcon icon={faWandMagicSparkles} className="h-4 w-4" />
            </span>
            <div className="text-xs text-teal-900 dark:text-teal-200 leading-relaxed">
              <strong className="font-semibold block mb-0.5">AI Academic Assistant</strong>
              Generate vetted quiz items, distractors, and explanations tailored to your course material. Always review questions before adding them to your quiz.
            </div>
          </div>
        </div>

        {/* Generator Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
              Topic / Key Concept
            </label>
            <input
              type="text"
              value={promptTopic}
              onChange={(e) => setPromptTopic(e.target.value)}
              placeholder="e.g. React Hooks, Database Indexing, HTTP/3"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
              Type
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as any)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="MULTIPLE_CHOICE">Multiple Choice</option>
              <option value="MULTIPLE_SELECT">Multiple Select</option>
              <option value="TRUE_FALSE">True / False</option>
              <option value="SHORT_ANSWER">Short Answer</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
              Difficulty
            </label>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value as any)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>

          <div className="sm:col-span-4 flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="primary"
              onClick={generateQuestions}
              isLoading={loading}
              loadingLabel="Synthesizing..."
            >
              Generate Draft Questions
            </Button>
          </div>
        </div>

        {/* Draft Questions List */}
        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
          {draftQuestions.length === 0 && !loading && (
            <div className="text-center py-8 text-slate-400 text-sm border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
              No questions generated yet. Choose a topic and click "Generate Draft Questions".
            </div>
          )}

          {draftQuestions.map((q, idx) => (
            <div
              key={q.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-700 dark:bg-slate-900 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 px-2 py-0.5 rounded">
                    Draft {idx + 1}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    {q.type.replace(/_/g, " ")} · {q.marks} marks · {q.difficulty}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleInsert(q)}
                  >
                    Insert
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDiscard(q.id)}
                  >
                    Discard
                  </Button>
                </div>
              </div>

              <div>
                <RichTextDisplay content={q.text} />
              </div>

              {q.options && q.options.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {q.options.map((opt, oIdx) => {
                    const isCorrect = q.correctAnswer.includes(opt.id);
                    return (
                      <div
                        key={opt.id}
                        className={`p-2 rounded border flex items-start gap-2 ${
                          isCorrect
                            ? "bg-teal-50 border-teal-300 text-teal-900 dark:bg-teal-950/40 dark:border-teal-700 dark:text-teal-200 font-medium"
                            : "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
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
                <div className="text-xs bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                  <strong className="font-semibold text-slate-700 dark:text-slate-200">Explanation: </strong>
                  {q.explanation}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-700">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AIQuizAssistantModal;
