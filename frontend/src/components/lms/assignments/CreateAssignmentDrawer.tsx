import React, { useEffect, useState } from "react";
import { Button } from "../../ui/Button";
import { FormField, SelectField } from "../../ui/Input";
import { Drawer } from "../shared/Drawer";
import { createCourseAssignment } from "../../../services/lmsApi";

export interface CreateAssignmentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  overview: any;
  access: { canManage: boolean; role: string; sections: string[] };
  onCreated: (assignment: any) => void;
  onError: (message: string) => void;
}

export const CreateAssignmentDrawer: React.FC<CreateAssignmentDrawerProps> = ({
  isOpen,
  onClose,
  courseId,
  overview,
  access,
  onCreated,
  onError,
}) => {
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");
  const [assignmentType, setAssignmentType] = useState("FILE");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setInstructions("");
      setMaxMarks("100");
      setAssignmentType("FILE");
      setDueDate("");
      setDueTime("");
      setOpensAt("");
    }
  }, [isOpen]);

  const dueAtValid = Boolean(dueDate && dueTime);
  const canPublish = title.trim().length > 0 && dueAtValid;

  const buildDueAt = () => {
    if (!dueDate || !dueTime) return undefined;
    return new Date(`${dueDate}T${dueTime}`).toISOString();
  };

  const submit = async (status: "DRAFT" | "OPEN") => {
    if (status === "OPEN" && !canPublish) return;
    if (!title.trim()) {
      onError("Assignment title is required.");
      return;
    }
    setBusy(true);
    setBusyLabel(status === "OPEN" ? "Publishing..." : "Saving...");
    try {
      const { assignment } = await createCourseAssignment({
        title: title.trim(),
        courseId,
        instructions: instructions.trim() || undefined,
        maxMarks: Number(maxMarks) || 100,
        dueAt: buildDueAt(),
        opensAt: opensAt ? new Date(opensAt).toISOString() : undefined,
        assignmentType,
        sectionCodes: access.sections,
        semester: overview?.scope?.semester ?? undefined,
        status,
      } as any);
      onCreated(assignment);
      onClose();
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : status === "OPEN"
            ? "We couldn't publish this assignment. Please try again."
            : "The assignment could not be saved.",
      );
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Create Assignment"
      subtitle="Configure, schedule, then publish"
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => void submit("DRAFT")}
            isLoading={busy && busyLabel === "Saving..."}
            loadingLabel="Saving"
            disabled={busy || !title.trim()}
          >
            Save Draft
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit("OPEN")}
            isLoading={busy && busyLabel === "Publishing..."}
            loadingLabel="Publishing..."
            disabled={busy || !canPublish}
          >
            Save & Publish
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormField label="Assignment Title" required>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="cos-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Homework 1: Binary Search Trees"
            />
          )}
        </FormField>

        <FormField label="Instructions" required>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              className="cos-input min-h-24 resize-y"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Describe what students need to complete..."
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Points">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                aria-describedby={describedBy}
                className="cos-input"
                value={maxMarks}
                onChange={(e) => setMaxMarks(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="Submission Type">
            {({ id, describedBy }) => (
              <SelectField
                id={id}
                label="Submission Type"
                hideLabel
                aria-describedby={describedBy}
                value={assignmentType}
                onChange={(e) => setAssignmentType(e.target.value)}
              >
                <option value="FILE">File Upload</option>
                <option value="TEXT">Text Entry</option>
                <option value="LINK">Link Submission</option>
                <option value="MULTIPLE">Multiple Submission Types</option>
              </SelectField>
            )}
          </FormField>
        </div>

        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Availability & Schedule
          </h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Choose who can access this assignment and when it is due.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Available From">
              {({ id, describedBy }) => (
                <input
                  id={id}
                  type="datetime-local"
                  aria-describedby={describedBy}
                  className="cos-input"
                  value={opensAt}
                  onChange={(e) => setOpensAt(e.target.value)}
                />
              )}
            </FormField>
            <div />
            <FormField label="Due Date" required>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  type="date"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  className="cos-input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              )}
            </FormField>
            <FormField label="Due Time" required>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  type="time"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  className="cos-input"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                />
              )}
            </FormField>
          </div>
          {!dueDate && (
            <p className="mt-2 text-xs text-amber-600">Set a due date before publishing.</p>
          )}
          {dueDate && !dueTime && (
            <p className="mt-2 text-xs text-amber-600">Set a due time before publishing.</p>
          )}
        </div>
      </div>
    </Drawer>
  );
};

export default CreateAssignmentDrawer;
