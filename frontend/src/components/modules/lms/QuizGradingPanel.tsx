import React, { useCallback, useEffect, useState } from "react";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Modal } from "../../ui/Modal";
import { faClipboardCheck, faGraduationCap, faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import {
  fetchGradingSheet,
  formatMark,
  gradeAttempt,
} from "../../../services/lmsApi";
import type {
  LmsGradeInput,
  LmsGradingRow,
  LmsGradingSheet,
  LmsIntegrityEvent,
} from "../../../types/lms";

/**
 * The marking desk.
 *
 * Two rules shape this panel:
 *
 *  - the total is never summed here. Marks are sent one answer at a time and the
 *    server recomputes the total, so a stale or optimistic number cannot be
 *    shown to a student;
 *  - "unmarked" is a first-class state. Clearing a mark returns the answer to
 *    the queue rather than recording a zero, because "not marked yet" and
 *    "earned nothing" are different claims about a student's work.
 */
export const QuizGradingPanel: React.FC<{
  attemptId: string;
  attemptLabel: string;
  onClose: () => void;
}> = ({ attemptId, attemptLabel, onClose }) => {
  const [sheet, setSheet] = useState<LmsGradingSheet | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { marks: string; feedback: string }>>({});
  const [overallFeedback, setOverallFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchGradingSheet(attemptId);
      setSheet(result);
      setOverallFeedback(result.attempt.overallFeedback || "");
      setDrafts(
        Object.fromEntries(
          result.paper
            .filter((row) => row.requiresManualGrading)
            .map((row) => [
              row.question.id,
              {
                marks: row.awardedMarks === null ? "" : String(row.awardedMarks),
                feedback: row.feedback || "",
              },
            ]),
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "This attempt could not be opened for marking.",
      );
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    void load();
  }, [load]);

  const markable = sheet?.paper.filter((row) => row.requiresManualGrading) || [];
  const decided = markable.filter((row) => row.awardedMarks !== null).length;

  const submitMarks = async () => {
    const marks: LmsGradeInput[] = [];
    const unparseable: string[] = [];

    for (const row of markable) {
      const draft = drafts[row.question.id];
      if (!draft) continue;
      const raw = draft.marks.trim();

      // Blank is a deliberate instruction: return the answer to the queue.
      if (raw === "") {
        marks.push({
          questionId: row.question.id,
          awardedMarks: null,
          feedback: draft.feedback,
        });
        continue;
      }

      const parsed = Number(raw);
      // `JSON.stringify(NaN)` is `null`, so an unparseable mark would be sent as
      // a *clear* and silently wipe the mark the marker just typed. It is caught
      // here instead, and reported rather than guessed at.
      if (!Number.isFinite(parsed)) {
        unparseable.push(row.question.text);
        continue;
      }

      marks.push({
        questionId: row.question.id,
        awardedMarks: parsed,
        feedback: draft.feedback,
      });
    }

    if (unparseable.length) {
      setError(
        `These answers have a mark that is not a number: ${unparseable.join("; ")}. Clear the box to return an answer to the queue instead.`,
      );
      return;
    }

    if (!marks.length) {
      setError("Enter a mark for at least one written answer before saving.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await gradeAttempt(attemptId, { marks, overallFeedback });
      setNotice(
        result.pendingManualCount > 0
          ? `${result.pendingManualCount} answer(s) still waiting for a mark.`
          : `Marked. ${formatMark(result.attempt.awardedMarks, result.attempt.maxMarks)}.`,
      );
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Marks could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Marking: ${attemptLabel}`}
      subtitle={
        sheet
          ? `${formatMark(sheet.attempt.awardedMarks, sheet.attempt.maxMarks)} · pass mark ${sheet.attempt.passingMarks}`
          : undefined
      }
      maxWidth="3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            icon={faClipboardCheck}
            onClick={() => void submitMarks()}
            isLoading={saving}
            loadingLabel="Saving marks"
            disabled={loading || !sheet?.canGrade || !markable.length}
          >
            Save marks
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-slate-500">Opening the attempt for marking…</p>
      ) : !sheet ? (
        <Alert variant="error">{error || "This attempt could not be opened."}</Alert>
      ) : (
        <div className="space-y-5">
          {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
          {notice && (
            <Alert variant="success" onDismiss={() => setNotice("")}>
              {notice}
            </Alert>
          )}

          {!sheet.canGrade && (
            <Alert variant="warning">
              This attempt has not been submitted, so there is nothing to mark.
            </Alert>
          )}

          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <Badge variant="neutral">
              {decided} of {markable.length} written answers marked
            </Badge>
            {sheet.attempt.status === "AUTO_SUBMITTED" && (
              <Badge variant="warning">Submitted automatically at the deadline</Badge>
            )}
            {sheet.attempt.passed !== null && sheet.attempt.passed !== undefined && (
              <Badge variant={sheet.attempt.passed ? "success" : "danger"}>
                {sheet.attempt.passed ? "Passed" : "Below the pass mark"}
              </Badge>
            )}
          </div>

          {sheet.paper.map((row) => (
            <QuestionRow
              key={row.question.id}
              row={row}
              draft={drafts[row.question.id]}
              disabled={!sheet.canGrade || !row.requiresManualGrading}
              onChange={(next) =>
                setDrafts((current) => ({
                  ...current,
                  [row.question.id]: { ...current[row.question.id], ...next },
                }))
              }
            />
          ))}

          <Card title="Overall feedback" className="cos-card">
            <textarea
              value={overallFeedback}
              onChange={(event) => setOverallFeedback(event.target.value)}
              maxLength={8000}
              disabled={!sheet.canGrade}
              rows={3}
              placeholder="Shared with the student once the result is released."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </Card>

          <IntegrityNotice events={sheet.integrityEvents} />
        </div>
      )}
    </Modal>
  );
};

/**
 * One answer on the paper.
 *
 * Objective questions show the engine's decision and are not editable here: the
 * mark was decided at submission, and letting a marker overrule it would make
 * the recorded mark disagree with what was actually answered.
 */
const QuestionRow: React.FC<{
  row: LmsGradingRow;
  draft?: { marks: string; feedback: string };
  disabled: boolean;
  onChange: (next: { marks?: string; feedback?: string }) => void;
}> = ({ row, draft, disabled, onChange }) => {
  const { question } = row;
  const autoMarked = !row.requiresManualGrading;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-slate-900">
          {question.text}
        </p>
        <Badge variant={autoMarked ? "info" : "primary"}>
          {question.marks} mark{question.marks === 1 ? "" : "s"}
        </Badge>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {question.type.replace(/_/g, " ").toLowerCase()} ·{" "}
        {question.difficulty.toLowerCase()}
        {question.topic ? ` · ${question.topic}` : ""}
      </p>

      {autoMarked ? (
        <div className="mt-3 space-y-2">
          <Badge variant={row.isCorrect ? "success" : row.isCorrect === false ? "danger" : "neutral"}>
            {row.isCorrect === null
              ? "Not marked yet"
              : row.isCorrect
                ? `Correct · ${formatMark(row.awardedMarks, question.marks)}`
                : `Incorrect · ${formatMark(row.awardedMarks, question.marks)}`}
          </Badge>
          <p className="text-xs text-slate-500">
            Marked automatically when the attempt was submitted. {describeResponse(row)}
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Student response
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
              {row.responseText || describeResponse(row) || "No answer given."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <label className="text-sm">
              Mark
              <input
                type="number"
                min={0}
                max={question.marks}
                step={0.25}
                value={draft?.marks ?? ""}
                disabled={disabled}
                onChange={(event) => onChange({ marks: event.target.value })}
                placeholder="—"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
              />
            </label>
            <label className="text-sm">
              Feedback
              <input
                value={draft?.feedback ?? ""}
                maxLength={4000}
                disabled={disabled}
                onChange={(event) => onChange({ feedback: event.target.value })}
                placeholder="Optional comment for the student"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Out of {question.marks}. Leave blank to return this answer to the queue.
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Session signals.
 *
 * Rendered as observations with a plain explanation of what they are. A hidden
 * tab is a fact about a browser, not a finding about a student, and CollegeOS
 * does not present it as one.
 */
const IntegrityNotice: React.FC<{ events: LmsIntegrityEvent[] }> = ({ events }) => {
  if (!events.length) return null;

  return (
    <Card
      title="Session signals"
      icon={faShieldHalved}
      subtitle="Observations about the browser session. These are not findings about the student."
    >
      <ul className="space-y-1.5 text-sm text-slate-600">
        {events.map((event, index) => (
          <li key={`${event.type}-${event.at}-${index}`} className="flex flex-wrap gap-2">
            <span className="font-medium text-slate-700">
              {event.type.replace(/_/g, " ").toLowerCase()}
            </span>
            <span className="text-slate-400">{new Date(event.at).toLocaleString()}</span>
            {event.detail && <span className="text-slate-500">— {event.detail}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
};

/** Describes an objective response in the marker's own vocabulary. */
function describeResponse(row: LmsGradingRow): string {
  const { question } = row;
  const response = row.response;

  if (response === null || response === undefined || response === "") {
    return "No answer given.";
  }
  if (Array.isArray(response)) {
    if (!response.length) return "No answer given.";
    const labels = response.map((id) => {
      const match = question.options.find((option) => option.id === String(id));
      return match ? match.text : String(id);
    });
    return question.type === "FILL_BLANK"
      ? `Blanks: ${labels.join(", ")}`
      : `Selected: ${labels.join("; ")}`;
  }
  const match = question.options.find((option) => option.id === String(response));
  return match ? match.text : String(response);
}