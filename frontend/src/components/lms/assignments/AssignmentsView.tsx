import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowRotateRight,
  faArrowUpRightFromSquare,
  faCalendarCheck,
  faCircleCheck,
  faClock,
  faFilePen,
  faFileArrowUp,
  faPlus,
  faRotateRight,
  faTriangleExclamation,
  faUpload,
} from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { FormField, Input, SelectField } from "../../ui/Input";
import { Modal } from "../../ui/Modal";
import { Skeleton } from "../../ui/Skeleton";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { Drawer } from "../shared/Drawer";
import { CreateAssignmentDrawer } from "./CreateAssignmentDrawer";
import { PageToolbar } from "../shared/PageToolbar";
import { SearchInput } from "../shared/SearchInput";
import { StatusBadge, toSemanticStatus } from "../shared/StatusBadge";
import { useDebouncedValue } from "../shared/useDebouncedValue";
import { formatBytes } from "../../shared/upload/fileTypes";
import { FilePreview } from "../../shared/upload/FilePreview";
import { Dropzone } from "../../shared/upload/Dropzone";
import { FileTypeIcon } from "../../shared/upload/FileTypeIcon";
import { uploadWithProgress } from "../../../services/uploadClient";
import {
  createCourseAssignment,
  fetchAssignmentDetail,
  fetchCourseAssignments,
  fetchMySubmissions,
  gradeSubmission,
} from "../../../services/lmsApi";
import type {
  AssignmentDetail,
  AssignmentSubmission,
} from "../../../services/lmsApi";
import type {
  LmsCourseAssignment,
  LmsCourseOverview,
} from "../../../types/lms";

export interface AssignmentsViewProps {
  courseId: string;
  /** Course metadata for the assignment form's defaults. */
  overview: LmsCourseOverview | null;
  /** The server's answer for this caller on this course. */
  access: { canManage: boolean; role: string; sections: string[] };
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

/**
 * The assignments module.
 *
 * One module, two workflows. An instructor sees the cohort:
 * who submitted, who is late, who is waiting to be graded,
 * and a grading workspace with the submission, the mark and
 * the feedback. A student sees their own deadlines and
 * submits real files through the shared upload system.
 *
 * Which workflow renders is decided by `access.role` —
 * the server's answer — never by a title check in the UI.
 */
export const AssignmentsView: React.FC<AssignmentsViewProps> = ({
  courseId,
  overview,
  access,
  onNotice,
  onError,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return (
      <AssignmentDetailView
        assignmentId={selectedId}
        courseId={courseId}
        access={access}
        onBack={() => setSelectedId(null)}
        onNotice={onNotice}
        onError={onError}
      />
    );
  }

  return (
    <AssignmentsList
      courseId={courseId}
      overview={overview}
      access={access}
      onOpen={setSelectedId}
      onNotice={onNotice}
      onError={onError}
    />
  );
};

/* ------------------------------------------------------------------ */
/* List                                                              */
/* ------------------------------------------------------------------ */

const AssignmentsList: React.FC<{
  courseId: string;
  overview: LmsCourseOverview | null;
  access: AssignmentsViewProps["access"];
  onOpen: (assignmentId: string) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ courseId, overview, access, onOpen, onNotice, onError }) => {
  const [assignments, setAssignments] = useState<LmsCourseAssignment[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchCourseAssignments(courseId, {
        limit: 100,
      });
      setAssignments(result.assignments);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Assignments could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const list = assignments ?? [];
    return list
      .filter((row) => {
        if (statusFilter && row.status !== statusFilter) return false;
        if (
          debouncedSearch.trim() &&
          !row.title.toLowerCase().includes(debouncedSearch.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dueA = a.dueAt ? new Date(a.dueAt).getTime() : 0;
        const dueB = b.dueAt ? new Date(b.dueAt).getTime() : 0;
        return dueA - dueB;
      });
  }, [assignments, debouncedSearch, statusFilter]);

  return (
    <div className="space-y-4">
      <PageToolbar
        search={{
          value: search,
          onChange: setSearch,
          label: "Search assignments",
          placeholder: "Search assignments…",
        }}
        filters={
          <SelectField
            label="Status"
            hideLabel
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-9 w-36 text-xs"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="ARCHIVED">Archived</option>
          </SelectField>
        }
        actions={[
          {
            id: "create",
            label: "Create assignment",
            icon: faPlus,
            primary: true,
            hidden: !access.canManage,
            onClick: () => setCreateOpen(true),
          },
        ]}
      />

      {error && (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {loading && !assignments ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={faFilePen}
          title={debouncedSearch ? "No matching assignments" : "No assignments yet"}
          description={
            debouncedSearch
              ? `Nothing matches "${debouncedSearch}".`
              : "Create an assignment to set a deadline, collect files and grade the cohort."
          }
          actionLabel={
            debouncedSearch || !access.canManage
              ? undefined
              : "Create assignment"
          }
          actionIcon={debouncedSearch || !access.canManage ? undefined : faPlus}
          onAction={
            debouncedSearch || !access.canManage
              ? undefined
              : () => setCreateOpen(true)
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <th className="px-4 py-2.5">Assignment</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Due</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Max marks</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">Type</th>
                <th className="px-4 py-2.5">Submissions</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visible.map((assignment) => {
                const stats = assignment.stats;
                const submitted = stats?.submitted ?? 0;
                const graded = stats?.graded ?? 0;
                return (
                  <tr
                    key={assignment.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60"
                    onClick={() => onOpen(assignment.id)}
                  >
                    <td className="px-4 py-3">
                      <span className="block font-medium text-slate-800 dark:text-slate-200">
                        {assignment.title}
                      </span>
                      {assignment.description && (
                        <span className="line-clamp-1 block text-xs text-slate-400">
                          {assignment.description}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-500 dark:text-slate-400 md:table-cell">
                      {assignment.dueAt
                        ? new Date(assignment.dueAt).toLocaleString()
                        : "No deadline"}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-500 dark:text-slate-400 sm:table-cell">
                      {assignment.maxMarks != null ? assignment.maxMarks : "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-500 dark:text-slate-400 lg:table-cell">
                      {assignment.assignmentType || "File"}
                    </td>
                    <td className="px-4 py-3">
                      {access.canManage ? (
                        // The list aggregates counts, not the roster,
                        // so no fraction is claimed here — the detail
                        // drawer is where "of N" exists.
                        <span className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {submitted}
                            </span>{" "}
                            submitted
                          </span>
                          <span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {graded}
                            </span>{" "}
                            graded
                          </span>
                        </span>
                      ) : (
                        <StudentSubmissionState assignmentId={assignment.id} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={toSemanticStatus(assignment.status)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateAssignmentDrawer
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        courseId={courseId}
        overview={overview}
        access={access}
        onCreated={(assignment) => {
          setCreateOpen(false);
          onNotice(`Assignment "${assignment.title}" created.`);
          void load();
        }}
        onError={onError}
      />
    </div>
  );
};

/** A student's own state for one assignment, from the session. */
const StudentSubmissionState: React.FC<{ assignmentId: string }> = ({
  assignmentId,
}) => {
  const [state, setState] = useState<"loading" | "none" | "submitted" | "graded" | "late">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { submission } = await fetchMySubmissionFor(assignmentId);
        if (cancelled) return;
        if (!submission) setState("none");
        else if (submission.marks != null) setState("graded");
        else if (submission.isLate) setState("late");
        else setState("submitted");
      } catch {
        if (!cancelled) setState("none");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  if (state === "loading") {
    return (
      <span className="h-4 w-16 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
    );
  }
  const label =
    state === "graded"
      ? "Graded"
      : state === "submitted"
        ? "Submitted"
        : state === "late"
          ? "Submitted late"
          : "Not submitted";
  return (
    <Badge
      variant={
        state === "graded"
          ? "success"
          : state === "submitted"
            ? "primary"
            : state === "late"
              ? "warning"
              : "neutral"
      }
      size="sm"
      hideDot
    >
      {label}
    </Badge>
  );
};

/**
 * The student's own submission for one assignment.
 *
 * The assignments module owns the roster endpoint; the
 * single-assignment detail carries `mySubmission` for a
 * student, so this asks for exactly that record.
 */
async function fetchMySubmissionFor(
  assignmentId: string,
): Promise<{ submission: AssignmentSubmission | null }> {
  const detail = await fetchAssignmentDetail(assignmentId);
  return {
    submission:
      detail.assignment.mySubmission ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Create assignment modal                                         */
/* ------------------------------------------------------------------ */

const CreateAssignmentModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  overview: LmsCourseOverview | null;
  access: AssignmentsViewProps["access"];
  onCreated: (assignment: LmsCourseAssignment) => void;
  onError: (message: string) => void;
}> = ({ isOpen, onClose, courseId, overview, access, onCreated, onError }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");
  const [dueAt, setDueAt] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [assignmentType, setAssignmentType] = useState("FILE");
  const [allowedTypes, setAllowedTypes] = useState(
    "pdf,doc,docx,ppt,pptx",
  );
  const [maxSizeMb, setMaxSizeMb] = useState("25");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setInstructions("");
      setMaxMarks("100");
      setDueAt("");
      setOpensAt("");
      setAssignmentType("FILE");
      setAllowedTypes("pdf,doc,docx,ppt,pptx");
      setMaxSizeMb("25");
    }
  }, [isOpen]);

  const submit = async () => {
    if (!title.trim() || !dueAt) return;
    setBusy(true);
    try {
      const { assignment } = await createCourseAssignment({
        title: title.trim(),
        courseId,
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        maxMarks: Number(maxMarks) || 100,
        dueAt: new Date(dueAt).toISOString(),
        opensAt: opensAt ? new Date(opensAt).toISOString() : undefined,
        assignmentType,
        sectionCodes: access.sections,
        semester: overview?.scope.semester ?? undefined,
      });
      onCreated(assignment);
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The assignment could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create assignment"
      subtitle="Open immediately; graded from the submissions view"
      maxWidth="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            isLoading={busy}
            loadingLabel="Creating"
            disabled={!title.trim() || !dueAt}
          >
            Create assignment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Title" required>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="cos-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Assignment 01 — Array implementation"
              autoFocus
            />
          )}
        </FormField>
        <FormField label="Description">
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              className="cos-input min-h-20 resize-y"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </FormField>
        <FormField
          label="Instructions"
          helperText="Shown to students beside the submission dropzone."
        >
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              className="cos-input min-h-24 resize-y"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Submit a single archive containing…"
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Max marks" required>
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                min={0}
                aria-describedby={describedBy}
                className="cos-input"
                value={maxMarks}
                onChange={(event) => setMaxMarks(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Opens (optional)">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="datetime-local"
                aria-describedby={describedBy}
                className="cos-input"
                value={opensAt}
                onChange={(event) => setOpensAt(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Due" required>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                type="datetime-local"
                required
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                className="cos-input"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Submission type">
            {({ id, describedBy }) => (
              <select
                id={id}
                aria-describedby={describedBy}
                className="cos-input"
                value={assignmentType}
                onChange={(event) => setAssignmentType(event.target.value)}
              >
                <option value="FILE">File upload</option>
                <option value="TEXT">Text entry</option>
              </select>
            )}
          </FormField>
          <FormField
            label="Accepted file types"
            helperText="Comma-separated extensions."
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                className="cos-input"
                value={allowedTypes}
                onChange={(event) => setAllowedTypes(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Max file size (MB)">
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                min={1}
                max={25}
                aria-describedby={describedBy}
                className="cos-input"
                value={maxSizeMb}
                onChange={(event) => setMaxSizeMb(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Audience is the sections you teach — the server resolves
          it from your teaching scope, so the assignment cannot
          reach a cohort you do not teach.
        </p>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Detail (instructor grading + student submission)                */
/* ------------------------------------------------------------------ */

const AssignmentDetailView: React.FC<{
  assignmentId: string;
  courseId: string;
  access: AssignmentsViewProps["access"];
  onBack: () => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ assignmentId, access, onBack, onNotice, onError }) => {
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState<{
    submission: AssignmentSubmission;
    studentName: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAssignmentDetail(assignmentId);
      setDetail(result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "This assignment could not be opened.",
      );
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !detail) {
    return (
      <EmptyState
        icon={faTriangleExclamation}
        title="This assignment could not be opened"
        description={`${error} Nothing has been substituted — retry once the connection is restored.`}
        actionLabel="Try again"
        actionIcon={faArrowRotateRight}
        onAction={() => void load()}
      />
    );
  }

  const assignment = detail?.assignment;
  const isTeacher = access.canManage;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          ← Back to assignments
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="cos-page-title truncate">
            {assignment?.title ?? "Assignment"}
          </h2>
          {assignment && (
            <p className="cos-page-subtitle">
              {assignment.dueAt
                ? `Due ${new Date(assignment.dueAt).toLocaleString()}`
                : "No deadline"}
              {assignment.maxMarks != null &&
                ` · ${assignment.maxMarks} marks`}
              {isTeacher && assignment.stats &&
                ` · ${assignment.stats.submitted} of ${assignment.stats.targeted} submitted · ${assignment.stats.late} late · ${assignment.stats.graded} graded`}
            </p>
          )}
        </div>
        {assignment && (
          <StatusBadge status={toSemanticStatus(assignment.status)} />
        )}
      </div>

      {error && (
        <Alert variant="warning" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {loading && !detail ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !assignment ? null : (
        <>
          {(assignment.description || assignment.instructions) && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
              {assignment.description && (
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {assignment.description}
                </p>
              )}
              {assignment.instructions && (
                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Instructions
                  </h3>
                  <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">
                    {assignment.instructions}
                  </p>
                </div>
              )}
              <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                Accepts {(assignment.allowedFileTypes ?? []).join(", ").toUpperCase() || "PDF, DOC, DOCX, PPT, PPTX"} ·
                max {(assignment.maxFileSizeMb ?? 25)} MB per file
              </p>
            </div>
          )}

          {isTeacher ? (
            <RosterPanel
              detail={detail}
              onGrade={(submission, studentName) =>
                setGrading({ submission, studentName })
              }
              onNotice={onNotice}
              onError={onError}
              onChanged={() => void load()}
            />
          ) : (
            <StudentSubmissionPanel
              assignment={assignment}
              onNotice={onNotice}
              onError={onError}
              onChanged={() => void load()}
            />
          )}
        </>
      )}

      {grading && (
        <GradingDrawer
          submission={grading.submission}
          studentName={grading.studentName}
          maxMarks={assignment?.maxMarks ?? null}
          onClose={() => setGrading(null)}
          onGraded={() => {
            setGrading(null);
            onNotice("Grade saved and released to the student.");
            void load();
          }}
          onError={onError}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Instructor roster                                               */
/* ------------------------------------------------------------------ */

const RosterPanel: React.FC<{
  detail: AssignmentDetail;
  onGrade: (submission: AssignmentSubmission, studentName: string) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onChanged: () => void;
}> = ({ detail, onGrade, onNotice, onError, onChanged }) => {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 150);
  const [statusFilter, setStatusFilter] = useState("");

  const roster = detail.assignment.roster ?? [];
  const visible = roster.filter((row) => {
    if (
      statusFilter &&
      row.status !== statusFilter.toUpperCase()
    ) {
      return false;
    }
    if (
      debouncedSearch.trim() &&
      !row.name.toLowerCase().includes(debouncedSearch.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const stats = detail.assignment.stats;

  return (
    <section
      aria-label="Submissions"
      className="rounded-lg border border-slate-200 dark:border-slate-800"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
        <SearchInput
          value={search}
          onChange={setSearch}
          label="Search students"
          placeholder="Search students…"
          className="w-full sm:w-56"
        />
        <SelectField
          label="Submission status"
          hideLabel
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 w-40 text-xs"
          aria-label="Filter by submission status"
        >
          <option value="">All statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="LATE">Late</option>
          <option value="GRADED">Graded</option>
          <option value="NOT_SUBMITTED">Missing</option>
        </SelectField>
        {stats && (
          <div className="ms-auto flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {stats.submitted}
              </span>{" "}
              submitted
            </span>
            <span>
              <span className="font-medium text-amber-600">
                {stats.late}
              </span>{" "}
              late
            </span>
            <span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {stats.graded}
              </span>{" "}
              graded
            </span>
            <span>
              <span className="font-medium text-red-600">
                {stats.missing}
              </span>{" "}
              missing
            </span>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">
          No students match this filter.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {visible.map((row) => {
            const submission = detail.assignment.submissions?.find(
              (candidate) => candidate.id === row.submissionId,
            );
            return (
              <li
                key={row.studentId}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {row.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {row.name}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {row.section}
                    {row.submittedAt &&
                      ` · ${row.isLate ? "Late · " : ""}${new Date(row.submittedAt).toLocaleString()}`}
                    {row.similarityPercentage != null &&
                      row.similarityStatus === "CHECKED" &&
                      ` · ${row.similarityPercentage}% similarity`}
                  </span>
                </span>
                {submission?.file && (
                  <FileTypeIcon
                    name={submission.file.originalName}
                    type={submission.file.mimeType}
                    size="sm"
                  />
                )}
                <span className="w-20 text-right text-xs font-medium text-slate-600 dark:text-slate-300">
                  {row.marks != null
                    ? `${row.marks} / ${detail.assignment.maxMarks ?? "?"}`
                    : row.status === "NOT_SUBMITTED"
                      ? "Missing"
                      : "Pending"}
                </span>
                {row.status === "NOT_SUBMITTED" ? (
                  <Badge variant="neutral" size="sm" hideDot>
                    Missing
                  </Badge>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      submission && onGrade(submission, row.name)
                    }
                    disabled={!submission}
                  >
                    {row.marks != null ? "Review" : "Grade"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Grading drawer                                                  */
/* ------------------------------------------------------------------ */

const GradingDrawer: React.FC<{
  submission: AssignmentSubmission;
  studentName: string;
  maxMarks: number | null;
  onClose: () => void;
  onGraded: () => void;
  onError: (message: string) => void;
}> = ({ submission, studentName, maxMarks, onClose, onGraded, onError }) => {
  const [marks, setMarks] = useState(
    submission.marks != null ? String(submission.marks) : "",
  );
  const [feedback, setFeedback] = useState(submission.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [returnForRevision, setReturnForRevision] = useState(false);

  const save = async (release: boolean) => {
    setBusy(true);
    try {
      const value = returnForRevision
        ? null
        : marks.trim() === ""
          ? null
          : Math.max(
              0,
              Math.min(
                maxMarks ?? Number.POSITIVE_INFINITY,
                Number(marks) || 0,
              ),
            );
      await gradeSubmission(submission.id, {
        marks: value,
        feedback: feedback.trim() || undefined,
      });
      if (release) onGraded();
      else {
        onClose();
      }
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The grade could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={`Grading — ${studentName}`}
      subtitle={
        submission.file
          ? `Submission: ${submission.file.originalName}`
          : "No file attached"
      }
      width="lg"
      footer={
        <>
          <label className="me-auto flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={returnForRevision}
              onChange={(event) =>
                setReturnForRevision(event.target.checked)
              }
              className="h-4 w-4 accent-amber-500"
            />
            Return for revision (clears the mark)
          </label>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </Button>
          <Button
            variant="secondary"
            onClick={() => void save(false)}
            isLoading={busy}
            loadingLabel="Saving"
            disabled={!marks.trim() && !returnForRevision}
          >
            Save draft
          </Button>
          <Button
            variant="primary"
            onClick={() => void save(true)}
            isLoading={busy}
            loadingLabel="Returning grade"
            disabled={(!marks.trim() && !returnForRevision) || busy}
          >
            Return grade
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {submission.file?.fileId ? (
          preview ? (
            <div className="min-h-72 rounded-lg border border-slate-200 dark:border-slate-800">
              <FilePreview
                fileId={submission.file.fileId}
                originalName={submission.file.originalName}
                mimeType={submission.file.mimeType}
                sizeBytes={submission.file.sizeBytes}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <FileTypeIcon
                name={submission.file.originalName}
                type={submission.file.mimeType}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {submission.file.originalName}
                </span>
                <span className="block text-xs text-slate-400">
                  {submission.file.mimeType.toUpperCase()} ·{" "}
                  {submission.file.sizeLabel ||
                    formatBytes(submission.file.sizeBytes)} · attempt{" "}
                  {submission.attemptCount}
                </span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={faArrowUpRightFromSquare}
                onClick={() => setPreview(true)}
              >
                Preview
              </Button>
            </div>
          )
        ) : (
          <Alert variant="info">
            This student has not attached a file.
          </Alert>
        )}

        {submission.similarity &&
          submission.similarity.status === "CHECKED" && (
            <Alert
              variant={
                (submission.similarity.percentage ?? 0) > 40
                  ? "warning"
                  : "info"
              }
            >
              Similarity check: {submission.similarity.percentage ?? "—"}%
              match against the submission corpus. A high percentage is a
              signal to review, not a verdict.
            </Alert>
          )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={`Mark ${maxMarks != null ? `/ ${maxMarks}` : ""}`}
            helperText="Leave empty to keep ungraded."
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                min={0}
                max={maxMarks ?? undefined}
                aria-describedby={describedBy}
                className="cos-input"
                value={marks}
                onChange={(event) => setMarks(event.target.value)}
                disabled={returnForRevision}
              />
            )}
          </FormField>
          <FormField label="Attempt" helperText="Server-recorded history.">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                className="cos-input"
                value={
                  submission.submittedAt
                    ? `Attempt ${submission.attemptCount} · ${
                        submission.isLate ? "late · " : ""
                      }${new Date(submission.submittedAt).toLocaleString()}`
                    : "Not submitted"
                }
                readOnly
              />
            )}
          </FormField>
        </div>

        <FormField
          label="Feedback"
          helperText="Returned to the student with the grade."
        >
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              className="cos-input min-h-32 resize-y"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="What was strong, what to fix before the next attempt…"
            />
          )}
        </FormField>
      </div>
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */
/* Student submission panel                                        */
/* ------------------------------------------------------------------ */

const StudentSubmissionPanel: React.FC<{
  assignment: LmsCourseAssignment;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onChanged: () => void;
}> = ({ assignment, onNotice, onError, onChanged }) => {
  const [mine, setMine] = useState<AssignmentSubmission | null | undefined>(
    undefined,
  );
  const [file, setFile] = useState<File | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { mySubmission } = (await fetchAssignmentDetail(
          assignment.id,
        )).assignment;
        if (!cancelled) setMine(mySubmission ?? null);
      } catch {
        if (!cancelled) setMine(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignment.id]);

  const dueDate = assignment.dueAt ? new Date(assignment.dueAt) : null;
  const remaining = dueDate ? dueDate.getTime() - Date.now() : null;

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    setPercent(0);
    try {
      const task = uploadWithProgress(
        `/assignments/${assignment.id}/submissions`,
        file,
        {
          onProgress: (progress) => setPercent(progress.percent),
        },
      );
      const { data } = await task.promise;
      const body = data as { submission: AssignmentSubmission };
      setMine(body.submission);
      setFile(null);
      setPercent(null);
      onNotice(
        body.submission.isLate
          ? "Submitted after the deadline — recorded as late."
          : "Submission received.",
      );
      onChanged();
    } catch (requestError) {
      setPercent(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The submission could not be uploaded.",
      );
    } finally {
      setBusy(false);
    }
  };

  const accepted = (assignment.allowedFileTypes ?? [])
    .map((type) => `.${type}`)
    .join(",");

  return (
    <section
      aria-label="Your submission"
      className="space-y-4"
    >
      {dueDate && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
          <FontAwesomeIcon icon={faClock} className="text-slate-400" aria-hidden="true" />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Due {dueDate.toLocaleString()}
          </span>
          {remaining != null && remaining > 0 && (
            <Badge variant="info" size="sm" hideDot>
              {remaining > 86400000
                ? `${Math.floor(remaining / 86400000)}d ${Math.floor(
                    (remaining % 86400000) / 3600000,
                  )}h remaining`
                : `${Math.floor(remaining / 3600000)}h ${Math.floor(
                    (remaining % 3600000) / 60000,
                  )}m remaining`}
            </Badge>
          )}
          {remaining != null && remaining <= 0 && (
            <Badge variant="danger" size="sm" hideDot>
              Deadline passed
            </Badge>
          )}
        </div>
      )}

      {error && (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {mine ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-center gap-3">
            <FontAwesomeIcon icon={faCircleCheck} className="text-emerald-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {mine.isLate ? "Submitted late" : "Submitted"}
                {mine.status === "GRADED" || mine.marks != null
                  ? ` · graded`
                  : " · awaiting grade"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {mine.submittedAt
                  ? new Date(mine.submittedAt).toLocaleString()
                  : ""}
                {mine.attemptCount > 1 &&
                  ` · attempt ${mine.attemptCount}`}
                {assignment.allowReplacement &&
                  " · you may replace this submission before grading"}
              </p>
            </div>
            {mine.marks != null && (
              <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {mine.marks}
                {assignment.maxMarks != null && ` / ${assignment.maxMarks}`}
              </span>
            )}
          </div>

          {mine.file?.fileId && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <FileTypeIcon
                name={mine.file.originalName}
                type={mine.file.mimeType}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {mine.file.originalName}
                </span>
                <span className="block text-xs text-slate-400">
                  {mine.file.sizeLabel || formatBytes(mine.file.sizeBytes)}
                </span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={faArrowDown}
                onClick={async () => {
                  try {
                    const { downloadStoredFile } = await import(
                      "../../../services/uploadClient"
                    );
                    await downloadStoredFile(
                      mine.file?.fileId ?? "",
                      mine.file?.originalName ?? "submission",
                    );
                  } catch (requestError) {
                    onError(
                      requestError instanceof Error
                        ? requestError.message
                        : "The submission could not be downloaded.",
                    );
                  }
                }}
              >
                Download
              </Button>
            </div>
          )}

          {mine.feedback && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Instructor feedback
              </h3>
              <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
                {mine.feedback}
              </p>
            </div>
          )}

          {assignment.allowReplacement && (
            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Replace submission
              </h3>
              <Dropzone
                onFiles={(files) => setFile(files[0] ?? null)}
                accept={accepted || undefined}
                maxTotalBytes={
                  (assignment.maxFileSizeMb ?? 25) * 1024 * 1024
                }
                multiple={false}
                compact
                label="Drop a replacement file or browse"
                acceptHint={`Accepted: ${(assignment.allowedFileTypes ?? []).join(", ").toUpperCase()}`}
              />
              {file && (
                <div className="mt-2 flex items-center gap-3">
                  <FileTypeIcon name={file.name} type={file.type} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                    {file.name}
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void submit()}
                    isLoading={busy}
                    loadingLabel={percent != null ? `${percent}%` : "Uploading"}
                  >
                    Replace submission
                  </Button>
                </div>
              )}
              {busy && percent != null && (
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  aria-label="Upload progress"
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                >
                  <div
                    className="h-full rounded-full bg-[var(--color-primary)] transition-[width]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <EmptyState
            icon={faFileArrowUp}
            title="No submission yet"
            description="Upload your work before the deadline. You can replace it while the assignment stays open."
          />
          <Dropzone
            onFiles={(files) => setFile(files[0] ?? null)}
            accept={accepted || undefined}
            maxTotalBytes={
              (assignment.maxFileSizeMb ?? 25) * 1024 * 1024
            }
            multiple={false}
            compact
            label="Drop your submission or browse"
            acceptHint={`Accepted: ${(assignment.allowedFileTypes ?? []).join(", ").toUpperCase()} · max ${assignment.maxFileSizeMb ?? 25} MB`}
          />
          {file && (
            <div className="mt-2 flex items-center gap-3">
              <FileTypeIcon name={file.name} type={file.type} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                {file.name}
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void submit()}
                isLoading={busy}
                loadingLabel={percent != null ? `${percent}%` : "Uploading"}
              >
                Submit assignment
              </Button>
            </div>
          )}
          {busy && percent != null && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Upload progress"
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            >
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>
      )}

      {mine && (
        <AttemptHistory assignmentId={assignment.id} />
      )}
    </section>
  );
};

/** Attempt history is the server's own submission record. */
const AttemptHistory: React.FC<{ assignmentId: string }> = ({
  assignmentId,
}) => {
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchAssignmentDetail(assignmentId);
        if (!cancelled) {
          setSubmission(detail.assignment.mySubmission ?? null);
        }
      } catch {
        if (!cancelled) setSubmission(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  if (!submission) return null;

  return (
    <section aria-label="Attempt history">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Attempt history
      </h3>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
          <FontAwesomeIcon icon={faCalendarCheck} className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-300">
            Attempt {submission.attemptCount} ·{" "}
            {submission.isLate ? "submitted late · " : ""}
            {submission.submittedAt
              ? new Date(submission.submittedAt).toLocaleString()
              : "not yet submitted"}
          </span>
          {submission.marks != null ? (
            <Badge variant="success" size="sm" hideDot>
              {submission.marks}
            </Badge>
          ) : (
            <Badge variant="neutral" size="sm" hideDot>
              Pending
            </Badge>
          )}
        </li>
      </ul>
      <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
        Earlier attempts are retained by the institution; ask your
        instructor if you need a previous version.
      </p>
    </section>
  );
};

export default AssignmentsView;
