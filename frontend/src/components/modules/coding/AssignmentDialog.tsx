import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardList, faCalendarDays } from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { Input } from "../../ui/Input";
import type {
  CodingAssignment,
  CodingFile,
  LabCourse,
  LabLanguage,
} from "./codingTypes";
import { createAssignment, updateAssignment } from "./codingApi";
import {
  defaultFileNameFor,
  getLanguageDefinition,
  starterFor,
} from "./languageRegistry";

export interface AssignmentDialogProps {
  /** Assignment being edited, or null to create one. */
  assignment: CodingAssignment | null;
  courses: LabCourse[];
  languages: LabLanguage[];
  toast: (message: string, tone?: "success" | "error") => void;
  onSaved: () => void;
  onClose: () => void;
}

function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Teacher dialog for creating and editing coding
 * assignments: instructions, allowed languages, starter
 * files, deadline and example input/output.
 */
export const AssignmentDialog: React.FC<AssignmentDialogProps> = ({
  assignment,
  courses,
  languages,
  toast,
  onSaved,
  onClose,
}) => {
  const isEdit = assignment !== null;
  const [title, setTitle] = useState(assignment?.title || "");
  const [courseId, setCourseId] = useState("");
  const [sectionCodesText, setSectionCodesText] = useState("");
  const [instructions, setInstructions] = useState(
    assignment?.instructions || "",
  );
  const [description, setDescription] = useState(
    assignment?.description || "",
  );
  const [allowedLanguages, setAllowedLanguages] = useState<string[]>(
    assignment?.allowedLanguages || [],
  );
  const [dueAt, setDueAt] = useState(
    toLocalDateTimeInput(assignment?.dueAt) || "",
  );
  const [maxMarks, setMaxMarks] = useState(
    String(assignment?.maxMarks ?? 100),
  );
  const [exampleInput, setExampleInput] = useState(
    assignment?.exampleInput || "",
  );
  const [exampleOutput, setExampleOutput] = useState(
    assignment?.exampleOutput || "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit && courses.length === 1) {
      setCourseId(courses[0].courseId);
    }
  }, [isEdit, courses]);

  const starter = (languageId: string): CodingFile[] => {
    const definition = getLanguageDefinition(languageId);
    return [
      {
        name: defaultFileNameFor(languageId),
        language: languageId,
        content: starterFor(languageId),
        isMain: true,
      },
    ];
  };

  const toggleLanguage = (languageId: string) => {
    setAllowedLanguages((previous) =>
      previous.includes(languageId)
        ? previous.filter((id) => id !== languageId)
        : [...previous, languageId],
    );
  };

  const save = async () => {
    if (!title.trim()) {
      setError("Give the assignment a title.");
      return;
    }
    if (!courseId) {
      setError("Choose a course.");
      return;
    }
    if (!dueAt) {
      setError("Choose a due date and time.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        description,
        instructions,
        courseId,
        sectionCodes: sectionCodesText
          .split(",")
          .map((code) => code.trim().toUpperCase())
          .filter(Boolean),
        allowedLanguages,
        dueAt: new Date(dueAt).toISOString(),
        maxMarks: Number(maxMarks) || 100,
        exampleInput,
        exampleOutput,
        starterFiles: allowedLanguages.length
          ? allowedLanguages.flatMap(starter)
          : starter("python"),
      };
      if (isEdit && assignment) {
        await updateAssignment(assignment.id, payload);
        toast("Assignment updated.", "success");
      } else {
        await createAssignment(payload);
        toast("Coding assignment created.", "success");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const executable = languages.filter((language) => language.execution);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? "Edit coding assignment" : "New coding assignment"}
      subtitle="Students open it from their Coding Lab, write code and submit."
      maxWidth="xl"
    >
      <div className="space-y-4">
        <Input
          label="Assignment title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. FizzBuzz in Python"
          maxLength={180}
          required
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="cos-label">Course</span>
            <select
              className="cos-input mt-1 cursor-pointer pr-9"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              required
            >
              <option value="">Choose a course…</option>
              {courses.map((course) => (
                <option key={course.courseId} value={course.courseId}>
                  {course.code} — {course.name}
                  {course.sectionCode ? ` · ${course.sectionCode}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="cos-label">Sections (comma separated, optional)</span>
            <input
              className="cos-input mt-1"
              value={sectionCodesText}
              onChange={(event) => setSectionCodesText(event.target.value)}
              placeholder="A, B"
            />
          </label>
          <label className="block">
            <span className="cos-label">
              Due date and time
            </span>
            <input
              type="datetime-local"
              className="cos-input mt-1"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="cos-label">Maximum marks</span>
            <input
              type="number"
              min={0}
              max={1000}
              className="cos-input mt-1"
              value={maxMarks}
              onChange={(event) => setMaxMarks(event.target.value)}
            />
          </label>
        </div>

        <div>
          <span className="cos-label">Allowed languages</span>
          <p className="cos-helper">
            Leave unselected to allow every configured language.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {executable.map((language) => {
              const selected = allowedLanguages.includes(language.id);
              return (
                <button
                  key={language.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleLanguage(language.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    selected
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {language.name}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className="cos-label">Problem statement</span>
          <textarea
            className="cos-input mt-1 min-h-24 resize-y"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What must the program do?"
          />
        </label>

        <label className="block">
          <span className="cos-label">Instructions</span>
          <textarea
            className="cos-input mt-1 min-h-24 resize-y"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Requirements, style rules, how the work is graded…"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="cos-label">Example input (optional)</span>
            <textarea
              className="cos-input mt-1 min-h-20 resize-y font-mono text-xs"
              value={exampleInput}
              onChange={(event) => setExampleInput(event.target.value)}
              placeholder="Standard input the program may receive"
            />
          </label>
          <label className="block">
            <span className="cos-label">Example output (optional)</span>
            <textarea
              className="cos-input mt-1 min-h-20 resize-y font-mono text-xs"
              value={exampleOutput}
              onChange={(event) => setExampleOutput(event.target.value)}
              placeholder="Expected console output"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2.5 border-t border-slate-200 bg-slate-50 px-6 py-4 -mx-6 -mb-5">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          icon={faClipboardList}
          isLoading={busy}
          onClick={() => void save()}
        >
          {isEdit ? "Save changes" : "Create assignment"}
        </Button>
      </div>
    </Modal>
  );
};

export default AssignmentDialog;
