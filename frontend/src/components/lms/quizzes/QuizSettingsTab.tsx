import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClock,
  faSlidersH,
  faShuffle,
  faEye,
  faShieldHalved,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import type { LmsQuizDraft } from "../../../types/lms";

interface QuizSettingsTabProps {
  draft: LmsQuizDraft;
  onChange: (updated: LmsQuizDraft) => void;
  onSave: () => void;
  saving: boolean;
}

export const QuizSettingsTab: React.FC<QuizSettingsTabProps> = ({
  draft,
  onChange,
  onSave,
  saving,
}) => {
  const [activeCategory, setActiveCategory] = useState<"timing" | "attempts" | "behaviour" | "review" | "security">("timing");

  const categories = [
    { id: "timing", label: "Timing & Schedule", icon: faClock },
    { id: "attempts", label: "Attempts & Scoring", icon: faSlidersH },
    { id: "behaviour", label: "Question Behaviour", icon: faShuffle },
    { id: "review", label: "Review & Visibility", icon: faEye },
    { id: "security", label: "Access & Security", icon: faShieldHalved },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Assessment Settings & Behaviour
          </h3>
          <p className="text-xs text-slate-500">
            Configure examination rules, attempt policies, security, and student review options.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={faCheck}
          onClick={onSave}
          isLoading={saving}
          loadingLabel="Saving..."
        >
          Save Settings
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Category Navigation */}
        <div className="md:col-span-1 space-y-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition ${
                activeCategory === cat.id
                  ? "bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-950/40 dark:border-teal-800 dark:text-teal-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <FontAwesomeIcon icon={cat.icon} className="w-3.5 text-slate-400" />
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Setting Panels */}
        <div className="md:col-span-3 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
          {activeCategory === "timing" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
                Timing & Availability
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Opens At
                  </label>
                  <input
                    type="datetime-local"
                    value={draft.openAt || ""}
                    onChange={(e) => onChange({ ...draft, openAt: e.target.value })}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Date and time students can begin sitting.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Closes At
                  </label>
                  <input
                    type="datetime-local"
                    value={draft.closeAt || ""}
                    onChange={(e) => onChange({ ...draft, closeAt: e.target.value })}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Hard deadline after which no new attempts can begin.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Time Limit (Minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={String(draft.durationMinutes || 30)}
                    onChange={(e) => onChange({ ...draft, durationMinutes: Number(e.target.value) || 30 })}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Maximum duration of a single sitting attempt.</p>
                </div>
              </div>
            </div>
          )}

          {activeCategory === "attempts" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
                Attempts & Grading Policy
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Allowed Attempts
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={String(draft.attemptsAllowed || 1)}
                    onChange={(e) => onChange({ ...draft, attemptsAllowed: Number(e.target.value) || 1 })}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Set to 1 for official examinations, or &gt;1 for formative practice.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Multiple-Select Partial Credit
                  </label>
                  <select
                    value={draft.multipleSelectGrading || "EXACT"}
                    onChange={(e) => onChange({ ...draft, multipleSelectGrading: e.target.value as any })}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="EXACT">Exact match only (All correct, no incorrect)</option>
                    <option value="PARTIAL_CREDIT">Partial credit for correct selections</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Passing Marks Threshold
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={String(draft.passingMarks || 0)}
                    onChange={(e) => onChange({ ...draft, passingMarks: Number(e.target.value) || 0 })}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Minimum score required to earn a passing status badge.</p>
                </div>
              </div>
            </div>
          )}

          {activeCategory === "behaviour" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
                Question Delivery & Behaviour
              </h4>
              <div className="space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.randomizeQuestions ?? false}
                    onChange={(e) => onChange({ ...draft, randomizeQuestions: e.target.checked })}
                    className="h-4 w-4 rounded accent-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block">
                      Shuffle Questions
                    </span>
                    <span className="text-xs text-slate-500">
                      Display questions in random order for each student attempt.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.randomizeOptions ?? false}
                    onChange={(e) => onChange({ ...draft, randomizeOptions: e.target.checked })}
                    className="h-4 w-4 rounded accent-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block">
                      Shuffle Options
                    </span>
                    <span className="text-xs text-slate-500">
                      Randomize the order of multiple-choice answer choices for each student.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.allowBackNavigation ?? true}
                    onChange={(e) => onChange({ ...draft, allowBackNavigation: e.target.checked })}
                    className="h-4 w-4 rounded accent-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block">
                      Allow Back Navigation
                    </span>
                    <span className="text-xs text-slate-500">
                      Permit students to return to previous questions and modify responses before submission.
                    </span>
                  </div>
                </label>

                <div className="pt-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Navigation Mode
                  </label>
                  <select
                    value={draft.navigationMethod || "FREE"}
                    onChange={(e) => onChange({ ...draft, navigationMethod: e.target.value as any })}
                    className="w-full sm:w-80 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="FREE">Free Navigation (palette jump to any question)</option>
                    <option value="SEQUENTIAL">Sequential (forced sequential order)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeCategory === "review" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
                Review & Release Policies
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Result Release Policy
                  </label>
                  <select
                    value={draft.resultReleasePolicy || "AFTER_GRADING"}
                    onChange={(e) => onChange({ ...draft, resultReleasePolicy: e.target.value as any })}
                    className="w-full sm:w-80 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="IMMEDIATELY">Immediately upon submission</option>
                    <option value="AFTER_CLOSE">After the quiz closing deadline passes</option>
                    <option value="AFTER_GRADING">After teacher completes manual grading</option>
                    <option value="MANUAL">Manual release by instructor</option>
                  </select>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer pt-2">
                  <input
                    type="checkbox"
                    checked={draft.showCorrectAnswers ?? false}
                    onChange={(e) => onChange({ ...draft, showCorrectAnswers: e.target.checked })}
                    className="h-4 w-4 rounded accent-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block">
                      Reveal Correct Answers in Review
                    </span>
                    <span className="text-xs text-slate-500">
                      When results are released, display the correct marking key and explanations to students.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {activeCategory === "security" && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
                Assessment Integrity & Security
              </h4>
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 space-y-1">
                  <strong className="font-semibold text-slate-800 dark:text-slate-200 block">
                    Institutional Integrity Monitor
                  </strong>
                  <p>
                    CollegeOS automatically logs browser tab-switches, focus loss, and window blur events during active student sittings. Teachers can inspect integrity flags on the Attempt Roster.
                  </p>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer pt-2">
                  <input
                    type="checkbox"
                    checked={draft.allowReopenExpired ?? true}
                    onChange={(e) => onChange({ ...draft, allowReopenExpired: e.target.checked })}
                    className="h-4 w-4 rounded accent-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block">
                      Allow Instructor Reopening
                    </span>
                    <span className="text-xs text-slate-500">
                      Permit instructors to grant individual extension windows for excused absences.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizSettingsTab;

