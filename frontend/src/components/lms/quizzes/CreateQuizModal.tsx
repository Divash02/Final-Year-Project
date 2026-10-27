import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faSlidersH,
  faClock,
  faShieldHalved,
  faEye,
  faShuffle,
  faLayerGroup,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../../ui/Modal";
import { Button } from "../../ui/Button";
import { createQuiz, fetchCourseWeeks } from "../../../services/lmsApi";
import type { LmsCourseSummary, LmsWeek } from "../../../types/lms";

interface CreateQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: LmsCourseSummary[];
  defaultCourseId?: string;
  onQuizCreated: (quizId: string, courseId: string) => void;
  onError: (msg: string) => void;
}

export const CreateQuizModal: React.FC<CreateQuizModalProps> = ({
  isOpen,
  onClose,
  courses,
  defaultCourseId,
  onQuizCreated,
  onError,
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState(
    defaultCourseId || (courses.length > 0 ? courses[0].id : ""),
  );
  const [weeks, setWeeks] = useState<LmsWeek[]>([]);
  const [weeksLoading, setWeeksLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"basic" | "timing" | "attempts" | "behaviour" | "review">("basic");

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [weekId, setWeekId] = useState("");
  const [maxMarks, setMaxMarks] = useState(20);
  const [passingMarks, setPassingMarks] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [attemptsAllowed, setAttemptsAllowed] = useState(1);
  const [openAt, setOpenAt] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [randomizeOptions, setRandomizeOptions] = useState(false);
  const [navigationMethod, setNavigationMethod] = useState<"FREE" | "SEQUENTIAL">("FREE");
  const [resultReleasePolicy, setResultReleasePolicy] = useState<"IMMEDIATELY" | "AFTER_CLOSE" | "AFTER_GRADING" | "MANUAL">("AFTER_GRADING");
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
  const [publishStatus, setPublishStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");

  // Load weeks when selected course changes
  useEffect(() => {
    if (!selectedCourseId) return;
    setWeeksLoading(true);
    fetchCourseWeeks(selectedCourseId)
      .then((res) => {
        setWeeks(res.weeks || []);
        if (res.weeks?.length > 0) {
          setWeekId(res.weeks[0].id);
        }
      })
      .catch((err) => {
        console.error("Failed to load weeks for course:", err);
      })
      .finally(() => {
        setWeeksLoading(false);
      });
  }, [selectedCourseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      onError("Please enter a quiz title.");
      return;
    }
    if (!selectedCourseId) {
      onError("Please select a course.");
      return;
    }

    setSaving(true);
    try {
      const detail = await createQuiz(selectedCourseId, {
        weekId: weekId || undefined,
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        maxMarks,
        passingMarks,
        durationMinutes,
        attemptsAllowed,
        openAt: openAt ? new Date(openAt).toISOString() : undefined,
        closeAt: closeAt ? new Date(closeAt).toISOString() : undefined,
        randomizeQuestions,
        randomizeOptions,
        navigationMethod,
        resultReleasePolicy,
        showCorrectAnswers,
      });

      onQuizCreated(detail.quiz.id, selectedCourseId);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create quiz.");
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { id: "basic", label: "Basic Information", icon: faLayerGroup },
    { id: "timing", label: "Availability & Timing", icon: faClock },
    { id: "attempts", label: "Attempts & Scoring", icon: faSlidersH },
    { id: "behaviour", label: "Layout & Behaviour", icon: faShuffle },
    { id: "review", label: "Review & Security", icon: faEye },
  ] as const;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Assessment"
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Section Tabs Header */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 overflow-x-auto pb-1">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition whitespace-nowrap ${
                activeSection === s.id
                  ? "bg-teal-50 text-teal-800 border-b-2 border-teal-600 dark:bg-teal-950/40 dark:text-teal-300"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <FontAwesomeIcon icon={s.icon} className="text-xs" />
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Section 1: Basic Information */}
        {activeSection === "basic" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Course *
                </label>
                <select
                  required
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Syllabus Week / Topic
                </label>
                <select
                  value={weekId}
                  onChange={(e) => setWeekId(e.target.value)}
                  disabled={weeksLoading || weeks.length === 0}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">(Optional) General Course Quiz</option>
                  {weeks.map((w) => (
                    <option key={w.id} value={w.id}>
                      Week {w.weekNumber}: {w.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Quiz Name / Title *
              </label>
              <input
                required
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Midterm Examination — Data Structures"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Description
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of topics covered and examination expectations."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Instructions for Candidates
              </label>
              <textarea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Instructions displayed to students before they start (e.g. calculators prohibited, 1 attempt only)."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
        )}

        {/* Section 2: Timing & Availability */}
        {activeSection === "timing" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Open Date &amp; Time
                </label>
                <input
                  type="datetime-local"
                  value={openAt}
                  onChange={(e) => setOpenAt(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <p className="mt-1 text-[11px] text-slate-400">Leave blank to open immediately when published.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Close Date &amp; Time
                </label>
                <input
                  type="datetime-local"
                  value={closeAt}
                  onChange={(e) => setCloseAt(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <p className="mt-1 text-[11px] text-slate-400">Attempts cannot be started after this date.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Time Limit (Minutes) *
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  max={600}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value) || 30)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* Section 3: Attempts & Scoring */}
        {activeSection === "attempts" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Allowed Attempts
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={attemptsAllowed}
                  onChange={(e) => setAttemptsAllowed(Number(e.target.value) || 1)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Max Total Marks
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxMarks}
                  onChange={(e) => setMaxMarks(Number(e.target.value) || 20)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Passing Marks
                </label>
                <input
                  type="number"
                  min={0}
                  value={passingMarks}
                  onChange={(e) => setPassingMarks(Number(e.target.value) || 10)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* Section 4: Behaviour & Layout */}
        {activeSection === "behaviour" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={randomizeQuestions}
                  onChange={(e) => setRandomizeQuestions(e.target.checked)}
                  className="h-4 w-4 rounded accent-teal-600 focus:ring-teal-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block">
                    Shuffle Questions
                  </span>
                  <span className="text-xs text-slate-500">
                    Randomize question presentation order for each attempt.
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={randomizeOptions}
                  onChange={(e) => setRandomizeOptions(e.target.checked)}
                  className="h-4 w-4 rounded accent-teal-600 focus:ring-teal-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block">
                    Shuffle Multiple Choice Options
                  </span>
                  <span className="text-xs text-slate-500">
                    Randomize option order inside each question.
                  </span>
                </div>
              </label>

              <div className="pt-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Navigation Method
                </label>
                <select
                  value={navigationMethod}
                  onChange={(e) => setNavigationMethod(e.target.value as any)}
                  className="w-full sm:w-80 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="FREE">Free (Palette jump between any questions)</option>
                  <option value="SEQUENTIAL">Sequential (Forced linear sequence)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Section 5: Review & Security */}
        {activeSection === "review" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Release Results Policy
              </label>
              <select
                value={resultReleasePolicy}
                onChange={(e) => setResultReleasePolicy(e.target.value as any)}
                className="w-full sm:w-80 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="AFTER_GRADING">After teacher completes manual grading</option>
                <option value="IMMEDIATELY">Immediately after candidate submits</option>
                <option value="AFTER_CLOSE">After assessment close deadline passes</option>
                <option value="MANUAL">Manual teacher release action</option>
              </select>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={showCorrectAnswers}
                onChange={(e) => setShowCorrectAnswers(e.target.checked)}
                className="h-4 w-4 rounded accent-teal-600 focus:ring-teal-500"
              />
              <div>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block">
                  Show Correct Answers on Review
                </span>
                <span className="text-xs text-slate-500">
                  Allow students to see which choices were correct after results are released.
                </span>
              </div>
            </label>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            icon={faPlus}
            isLoading={saving}
            loadingLabel="Creating..."
          >
            Create &amp; Open Quiz Builder
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateQuizModal;

