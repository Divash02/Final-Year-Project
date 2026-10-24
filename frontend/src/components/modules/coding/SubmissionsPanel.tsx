import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faDownload,
  faCheckDouble,
  faClock,
  faCircleXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import type { CodingSubmission, ExecutionSnapshot } from "./codingTypes";
import { downloadTextFile, gradeSubmission } from "./codingApi";

export interface SubmissionsPanelProps {
  submissions: CodingSubmission[];
  /** True when the signed-in user is the reviewing teacher. */
  canGrade: boolean;
  maxMarks: number;
  toast: (message: string, tone?: "success" | "error") => void;
  onGraded: () => void;
}

function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined) return "n/a";
  return `${milliseconds} ms`;
}

function ExecutionDetails({ snapshot }: { snapshot: ExecutionSnapshot | null }) {
  if (!snapshot) {
    return (
      <p className="text-xs text-slate-400">
        No execution result attached to this submission.
      </p>
    );
  }
  const tone =
    snapshot.status === "ACCEPTED"
      ? "text-emerald-600"
      : snapshot.status === "TIMEOUT"
        ? "text-amber-600"
        : "text-red-600";
  return (
    <div className="space-y-2">
      <p className={`text-xs font-semibold ${tone}`}>
        {snapshot.description || snapshot.status}
      </p>
      {snapshot.compileOutput && (
        <div>
          <p className="text-[11px] font-medium text-slate-500">
            Compiler output
          </p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-900 px-2.5 py-2 font-mono text-[11px] text-amber-200">
            {snapshot.compileOutput}
          </pre>
        </div>
      )}
      {snapshot.stdout && (
        <div>
          <p className="text-[11px] font-medium text-slate-500">Stdout</p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-900 px-2.5 py-2 font-mono text-[11px] text-slate-100">
            {snapshot.stdout}
          </pre>
        </div>
      )}
      {snapshot.stderr && (
        <div>
          <p className="text-[11px] font-medium text-slate-500">Stderr</p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-900 px-2.5 py-2 font-mono text-[11px] text-red-300">
            {snapshot.stderr}
          </pre>
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        {formatDuration(snapshot.durationMs)} ·{" "}
        {snapshot.memoryKb !== null && snapshot.memoryKb !== undefined
          ? `${(snapshot.memoryKb / 1024).toFixed(1)} MiB`
          : "memory n/a"}{" "}
        · exit {snapshot.exitCode ?? "—"}
      </p>
    </div>
  );
}

/**
 * Submission review. Teachers grade submissions with
 * feedback and marks; students see their own record.
 * Graded work is frozen — editing a personal project
 * never changes what was submitted.
 */
export const SubmissionsPanel: React.FC<SubmissionsPanelProps> = ({
  submissions,
  canGrade,
  maxMarks,
  toast,
  onGraded,
}) => {
  const [selected, setSelected] = useState<CodingSubmission | null>(null);
  const [feedback, setFeedback] = useState("");
  const [marks, setMarks] = useState("");
  const [busy, setBusy] = useState(false);

  const openSubmission = (submission: CodingSubmission) => {
    setSelected(submission);
    setFeedback(submission.feedback || "");
    setMarks(submission.marks !== null && submission.marks !== undefined ? String(submission.marks) : "");
  };

  const grade = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await gradeSubmission(selected.id, {
        feedback,
        marks: marks === "" ? undefined : Number(marks),
      });
      toast("Feedback and grade saved.", "success");
      setSelected(null);
      onGraded();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not save the grade.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadSubmissionFiles = (submission: CodingSubmission) => {
    if (submission.files.length === 1) {
      downloadTextFile(submission.files[0].name, submission.files[0].content);
      return;
    }
    submission.files.forEach((file) => {
      downloadTextFile(file.name, file.content);
    });
  };

  if (submissions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        No submissions yet. Students submit their work from the
        Coding Lab.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {submissions.map((submission) => (
          <li key={submission.id}>
            <button
              type="button"
              onClick={() => openSubmission(submission)}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {submission.studentName || "Student"}
                  {submission.studentId ? (
                    <span className="ml-2 font-normal text-slate-400">
                      {submission.studentId}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-slate-500">
                  {submission.language} · v{submission.version} ·{" "}
                  {new Date(submission.submittedAt).toLocaleString()}
                  {submission.isLate && (
                    <span className="ml-1 font-medium text-amber-600">
                      late
                    </span>
                  )}
                </span>
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  submission.status === "GRADED"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-sky-50 text-sky-700"
                }`}
              >
                {submission.status === "GRADED" ? (
                  <>
                    <FontAwesomeIcon icon={faCircleCheck} className="text-[10px]" aria-hidden="true" />
                    Graded
                    {submission.marks !== null && submission.marks !== undefined
                      ? ` · ${submission.marks}/${maxMarks}`
                      : ""}
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faClock} className="text-[10px]" aria-hidden="true" />
                    Submitted
                  </>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        title={
          selected
            ? `Submission — ${selected.studentName || "Student"}`
            : "Submission"
        }
        subtitle={
          selected
            ? `${selected.language} · submitted ${new Date(
                selected.submittedAt,
              ).toLocaleString()}`
            : ""
        }
        maxWidth="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {selected.files.length} file
                {selected.files.length === 1 ? "" : "s"}:{" "}
                {selected.files.map((file) => file.name).join(", ")}
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={faDownload}
                onClick={() => downloadSubmissionFiles(selected)}
              >
                Download files
              </Button>
            </div>

            <div>
              <span className="cos-label">Submitted code</span>
              <div className="mt-1.5 max-h-64 overflow-auto rounded-lg border border-slate-200">
                {selected.files.map((file) => (
                  <details key={file.name} className="border-b border-slate-100 last:border-0">
                    <summary className="cursor-pointer bg-slate-50 px-3 py-1.5 font-mono text-xs font-medium text-slate-700">
                      {file.name}
                    </summary>
                    <pre className="overflow-x-auto whitespace-pre px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-700">
                      {file.content}
                    </pre>
                  </details>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="cos-label">Last execution result</span>
              <div className="mt-2">
                <ExecutionDetails snapshot={selected.lastExecution} />
              </div>
            </div>

            {canGrade ? (
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <label className="block">
                  <span className="cos-label">Marks (/{maxMarks})</span>
                  <input
                    type="number"
                    min={0}
                    max={maxMarks}
                    className="cos-input mt-1 max-w-40"
                    value={marks}
                    onChange={(event) => setMarks(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="cos-label">Feedback</span>
                  <textarea
                    className="cos-input mt-1 min-h-24 resize-y"
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="What was done well, what to fix…"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setSelected(null)}>
                    Close
                  </Button>
                  <Button
                    variant="primary"
                    icon={faCheckDouble}
                    isLoading={busy}
                    onClick={() => void grade()}
                  >
                    Save grade
                  </Button>
                </div>
              </div>
            ) : (
              selected.feedback ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <span className="cos-label">
                    Feedback
                    {selected.marks !== null && selected.marks !== undefined
                      ? ` · ${selected.marks}/${maxMarks}`
                      : ""}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {selected.feedback}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  No feedback yet.
                </p>
              )
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SubmissionsPanel;
