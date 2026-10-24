import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faBookOpen,
  faCalendarCheck,
  faChevronDown,
  faCircleCheck,
  faClipboardList,
  faCopy,
  faFilePen,
  faFolderOpen,
  faGripVertical,
  faLayerGroup,
  faPlus,
  faRotateRight,
  faClone,
  faTrashCan,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { FormField, Input } from "../../ui/Input";
import { Modal } from "../../ui/Modal";
import { Skeleton } from "../../ui/Skeleton";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { Drawer } from "../shared/Drawer";
import { PageToolbar } from "../shared/PageToolbar";
import { SearchInput } from "../shared/SearchInput";
import { StatusBadge, toSemanticStatus } from "../shared/StatusBadge";
import { useDebouncedValue } from "../shared/useDebouncedValue";
import {
  addWeekObjectives,
  applyTemplate,
  createWeek,
  duplicateWeek,
  fetchCourseWeeks,
  fetchTemplates,
  fetchWeek,
  publishWeek,
  removeObjective,
  scheduleWeek,
  updateWeek,
} from "../../../services/lmsApi";
import type {
  LmsAnnouncementSummary,
  LmsMaterial,
  LmsPlannerAssignment,
  LmsQuizSummary,
  LmsTemplate,
  LmsWeek,
  LmsWeekList,
} from "../../../types/lms";

export interface PlannerViewProps {
  courseId: string;
  /** The server's answer for this caller on this course. */
  access: { canManage: boolean; sections: string[] };
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

type PendingAction =
  | { kind: "delete"; week: LmsWeek }
  | { kind: "archive"; week: LmsWeek }
  | null;

/**
 * The course planner.
 *
 * A week spine with the material, assignment, quiz and
 * objective records hanging off each week. Every structural
 * action — publish, schedule, duplicate, archive, reorder —
 * is a real mutation, and every draggable week also has a
 * keyboard "Move" menu so drag-and-drop is never the only
 * way to reorder.
 */
export const PlannerView: React.FC<PlannerViewProps> = ({
  courseId,
  access,
  onNotice,
  onError,
}) => {
  const [weeks, setWeeks] = useState<LmsWeek[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchCourseWeeks(courseId);
      setWeeks(list.weeks);
      // Open the first unpublished week by default so the
      // teacher lands where the work is.
      setExpanded(
        new Set(
          list.weeks
            .filter((week) => week.state !== "PUBLISHED")
            .map((week) => week.id),
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The course plan could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleWeeks = useMemo(() => {
    const list = weeks ?? [];
    if (!debouncedSearch.trim()) return list;
    const needle = debouncedSearch.trim().toLowerCase();
    return list.filter((week) =>
      week.title.toLowerCase().includes(needle),
    );
  }, [weeks, debouncedSearch]);

  const patchWeek = useCallback(
    (id: string, patch: Partial<LmsWeek>) => {
      setWeeks((current) =>
        (current ?? []).map((week) =>
          week.id === id ? ({ ...week, ...patch } as LmsWeek) : week,
        ),
      );
    },
    [],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ----------------------------- actions ----------------------------- */

  const runAction = useCallback(
    async (id: string, action: () => Promise<unknown>, notice: string) => {
      setBusyId(id);
      try {
        await action();
        onNotice(notice);
      } catch (requestError) {
        onError(
          requestError instanceof Error
            ? requestError.message
            : "The action could not be completed.",
        );
      } finally {
        setBusyId(null);
      }
    },
    [onNotice, onError],
  );

  const handlePublish = (week: LmsWeek) =>
    void runAction(week.id, async () => {
      const { week: updated } = await publishWeek(week.id);
      patchWeek(week.id, updated);
    }, `Week ${week.weekNumber} published. Due materials were released.`);

  const handleSchedule = async (week: LmsWeek) => {
    const value = window.prompt(
      "Release date and time (ISO, e.g. 2026-10-20T09:00:00)",
      week.releaseAt || "",
    );
    if (!value) return;
    await runAction(week.id, async () => {
      const { week: updated } = await scheduleWeek(week.id, value);
      patchWeek(week.id, updated);
    }, `Week ${week.weekNumber} scheduled for release.`);
  };

  const handleDuplicate = (week: LmsWeek) =>
    void runAction(week.id, async () => {
      const { week: copy } = await duplicateWeek(week.id);
      setWeeks((current) => [...(current ?? []), copy]);
      setExpanded((current) => new Set(current).add(copy.id));
    }, `Week ${week.weekNumber} duplicated into a new draft week.`);

  const handleMove = (week: LmsWeek, direction: "up" | "down") => {
    const list = weeks ?? [];
    const index = list.findIndex((row) => row.id === week.id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= list.length) return;
    const other = list[target];
    const thisPosition = week.position ?? index;
    const otherPosition = other.position ?? target;
    // Optimistic swap, corrected by the server response.
    patchWeek(week.id, { position: otherPosition });
    patchWeek(other.id, { position: thisPosition });
    void runAction(week.id, async () => {
      await updateWeek(week.id, { position: otherPosition });
      await updateWeek(other.id, { position: thisPosition });
    }, `Week ${week.weekNumber} moved ${direction}.`);
  };

  const confirmPending = () => {
    if (!pending) return;
    const { kind, week } = pending;
    setPending(null);
    if (kind === "delete") {
      void runAction(week.id, async () => {
        await updateWeek(week.id, { status: "ARCHIVED" });
        setWeeks((current) =>
          (current ?? []).map((row) =>
            row.id === week.id
              ? ({ ...row, status: "ARCHIVED", state: "ARCHIVED" } as LmsWeek)
              : row,
          ),
        );
      }, `Week ${week.weekNumber} archived.`);
    } else {
      void runAction(week.id, async () => {
        await updateWeek(week.id, { status: "ARCHIVED" });
        patchWeek(week.id, { status: "ARCHIVED", state: "ARCHIVED" });
      }, `Week ${week.weekNumber} archived.`);
    }
  };

  /* ----------------------------- render ------------------------------ */

  if (error && !weeks) {
    return (
      <EmptyState
        icon={faTriangleExclamation}
        title="The course plan could not be opened"
        description={`${error} Nothing has been substituted — retry once the connection is restored.`}
        actionLabel="Try again"
        actionIcon={faRotateRight}
        onAction={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageToolbar
        search={{
          value: search,
          onChange: setSearch,
          label: "Search weeks",
          placeholder: "Search weeks…",
        }}
        filters={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={faClone}
                onClick={() => setTemplatesOpen(true)}
            >
              Templates
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setExpanded(
                  expanded.size === visibleWeeks.length
                    ? new Set()
                    : new Set(visibleWeeks.map((week) => week.id)),
                )
              }
            >
              {expanded.size === visibleWeeks.length && visibleWeeks.length > 0
                ? "Collapse all"
                : "Expand all"}
            </Button>
          </>
        }
        actions={[
          {
            id: "add-week",
            label: "Add week",
            icon: faPlus,
            primary: true,
            hidden: !access.canManage,
            onClick: () => setAddOpen(true),
          },
        ]}
      />

      {error && (
        <Alert variant="warning" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {loading && !weeks ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : visibleWeeks.length === 0 ? (
        <EmptyState
          icon={faBookOpen}
          title={debouncedSearch ? "No matching weeks" : "No course structure yet"}
          description={
            debouncedSearch
              ? `Nothing in this course matches "${debouncedSearch}".`
              : "Start from scratch or load a course template — the planner is where the term takes shape."
          }
          actionLabel={debouncedSearch ? undefined : "Create first week"}
          actionIcon={debouncedSearch ? undefined : faPlus}
          onAction={debouncedSearch ? undefined : () => setAddOpen(true)}
        />
      ) : (
        <ol className="space-y-3">
          {visibleWeeks.map((week, index) => (
            <WeekSection
              key={week.id}
              week={week}
              index={index}
              total={visibleWeeks.length}
              expanded={expanded.has(week.id)}
              canManage={access.canManage}
              busy={busyId === week.id}
              onToggle={() => toggleExpanded(week.id)}
              onPublish={() => handlePublish(week)}
              onSchedule={() => void handleSchedule(week)}
              onDuplicate={() => handleDuplicate(week)}
              onMove={(direction) => handleMove(week, direction)}
              onArchive={() => setPending({ kind: "archive", week })}
              onDelete={() => setPending({ kind: "delete", week })}
              onNotice={onNotice}
              onError={onError}
            />
          ))}
        </ol>
      )}

      <CreateWeekModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        courseId={courseId}
        nextNumber={(weeks?.length ?? 0) + 1}
        onCreated={(week) => {
          setWeeks((current) => [...(current ?? []), week]);
          setExpanded((current) => new Set(current).add(week.id));
          onNotice(`Week ${week.weekNumber} created as a draft.`);
        }}
        onError={onError}
      />

      <TemplateDrawer
        isOpen={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        courseId={courseId}
        onApplied={(count) => {
          setTemplatesOpen(false);
          onNotice(`${count} week${count === 1 ? "" : "s"} added from the template as drafts.`);
          void load();
        }}
        onError={onError}
      />

      <ConfirmDialog
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirmPending}
        title={pending?.kind === "delete" ? "Delete week?" : "Archive week?"}
        confirmLabel={pending?.kind === "delete" ? "Delete" : "Archive"}
        message={
          pending?.kind === "delete"
            ? "This week and its objectives will be removed from the plan. Materials and assessments stay in the course but lose their week."
            : "The week is hidden from students and moved out of the active plan. It can be restored."
        }
        subject={pending?.week.title}
        severity={pending?.kind === "delete" ? "danger" : "warning"}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Week section                                                      */
/* ------------------------------------------------------------------ */

interface WeekSectionProps {
  week: LmsWeek;
  index: number;
  total: number;
  expanded: boolean;
  canManage: boolean;
  busy: boolean;
  onToggle: () => void;
  onPublish: () => void;
  onSchedule: () => void;
  onDuplicate: () => void;
  onMove: (direction: "up" | "down") => void;
  onArchive: () => void;
  onDelete: () => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

const WeekSection: React.FC<WeekSectionProps> = ({
  week,
  index,
  total,
  expanded,
  canManage,
  busy,
  onToggle,
  onPublish,
  onSchedule,
  onDuplicate,
  onMove,
  onArchive,
  onDelete,
  onNotice,
  onError,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the week menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [menuOpen]);

  const itemCount =
    (week.materialCount ?? 0) +
    (week.assignmentCount ?? 0) +
    (week.quizCount ?? 0) +
    (week.objectiveCount ?? 0);

  return (
    <li
      className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      aria-label={`Week ${week.weekNumber}: ${week.title}`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Drag handle. Also a button: activates the move menu so
            reordering never requires a mouse. */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label={`Reorder week ${week.weekNumber}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={!canManage}
            onClick={() => setMenuOpen((open) => !open)}
            className="cursor-grab rounded-md p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500 disabled:cursor-default dark:hover:bg-slate-800"
          >
            <FontAwesomeIcon icon={faGripVertical} className="h-4 w-4" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              aria-label={`Week ${week.weekNumber} actions`}
              className="absolute left-8 top-0 z-40 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              <MenuButton
                icon={faArrowUp}
                label="Move up"
                disabled={index === 0 || !canManage}
                onClick={() => {
                  setMenuOpen(false);
                  onMove("up");
                }}
              />
              <MenuButton
                icon={faArrowDown}
                label="Move down"
                disabled={index === total - 1 || !canManage}
                onClick={() => {
                  setMenuOpen(false);
                  onMove("down");
                }}
              />
              <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" role="separator" />
              <MenuButton
                icon={faCircleCheck}
                label="Publish now"
                disabled={!canManage || week.state === "PUBLISHED"}
                onClick={() => {
                  setMenuOpen(false);
                  onPublish();
                }}
              />
              <MenuButton
                icon={faCalendarCheck}
                label="Schedule release…"
                disabled={!canManage}
                onClick={() => {
                  setMenuOpen(false);
                  onSchedule();
                }}
              />
              <MenuButton
                icon={faCopy}
                label="Duplicate week"
                disabled={!canManage}
                onClick={() => {
                  setMenuOpen(false);
                  onDuplicate();
                }}
              />
              <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" role="separator" />
              <MenuButton
                icon={faFolderOpen}
                label="Archive"
                disabled={!canManage || week.state === "ARCHIVED"}
                onClick={() => {
                  setMenuOpen(false);
                  onArchive();
                }}
              />
              <MenuButton
                icon={faTrashCan}
                label="Delete"
                danger
                disabled={!canManage}
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <FontAwesomeIcon
            icon={faChevronDown}
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Week {String(week.weekNumber).padStart(2, "0")}
              </span>
              <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {week.title}
              </span>
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
              {week.materialCount != null && week.materialCount > 0 && (
                <span>{week.materialCount} material{week.materialCount === 1 ? "" : "s"}</span>
              )}
              {week.assignmentCount != null && week.assignmentCount > 0 && (
                <span>{week.assignmentCount} assignment{week.assignmentCount === 1 ? "" : "s"}</span>
              )}
              {week.quizCount != null && week.quizCount > 0 && (
                <span>{week.quizCount} quiz{week.quizCount === 1 ? "" : "es"}</span>
              )}
              {week.objectiveCount != null && week.objectiveCount > 0 && (
                <span>{week.objectiveCount} objective{week.objectiveCount === 1 ? "" : "s"}</span>
              )}
              {itemCount === 0 && <span>Empty</span>}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {busy && (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent"
              role="status"
              aria-label="Working"
            />
          )}
          <WeekStateBadge state={week.state} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-800">
          <WeekBody
            weekId={week.id}
            weekNumber={week.weekNumber}
            canManage={canManage}
            onNotice={onNotice}
            onError={onError}
          />
        </div>
      )}
    </li>
  );
};

const MenuButton: React.FC<{
  icon: typeof faArrowUp;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}> = ({ icon, label, onClick, disabled, danger }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    disabled={disabled}
    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm disabled:opacity-40 ${
      danger
        ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
    }`}
  >
    <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" aria-hidden="true" />
    {label}
  </button>
);

export const WeekStateBadge: React.FC<{ state: LmsWeek["state"] }> = ({
  state,
}) => {
  const label =
    state === "DRAFT"
      ? "Draft"
      : state === "SCHEDULED"
        ? "Scheduled"
        : state === "PUBLISHED"
          ? "Published"
          : "Archived";
  return <StatusBadge status={toSemanticStatus(state)} label={label} />;
};

/* ------------------------------------------------------------------ */
/* Week body — objectives, materials, assignments, quizzes           */
/* ------------------------------------------------------------------ */

const WeekBody: React.FC<{
  weekId: string;
  weekNumber: number;
  canManage: boolean;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ weekId, weekNumber, canManage, onNotice, onError }) => {
  const [detail, setDetail] = useState<{
    materials: LmsMaterial[];
    objectives: { id: string; text: string }[];
    assignments: LmsPlannerAssignment[];
    quizzes: LmsQuizSummary[];
    announcements: LmsAnnouncementSummary[];
  } | null>(null);
  const [error, setError] = useState("");
  const [objectiveDraft, setObjectiveDraft] = useState("");
  const [addingObjective, setAddingObjective] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchWeekDetail(weekId);
        if (!cancelled) {
          setDetail({
            materials: result.week.materials,
            objectives: result.week.objectives,
            assignments: result.week.assignments,
            quizzes: result.week.quizzes,
            announcements: result.week.announcements,
          });
          setError("");
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Week details could not be loaded.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekId]);

  const submitObjective = async () => {
    const text = objectiveDraft.trim();
    if (!text) return;
    setAddingObjective(true);
    try {
      const { objectives } = await addWeekObjectives(weekId, [text]);
      setDetail((current) =>
        current ? { ...current, objectives } : current,
      );
      setObjectiveDraft("");
      onNotice("Learning objective added.");
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The objective could not be added.",
      );
    } finally {
      setAddingObjective(false);
    }
  };

  const removeWeekObjective = async (objectiveId: string) => {
    try {
      await removeObjective(objectiveId);
      setDetail((current) =>
        current
          ? {
              ...current,
              objectives: current.objectives.filter(
                (row) => row.id !== objectiveId,
              ),
            }
          : current,
      );
      onNotice("Objective removed.");
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The objective could not be removed.",
      );
    }
  };

  if (error) {
    return (
      <Alert variant="error" onDismiss={() => setError("")}>
        {error}
      </Alert>
    );
  }
  if (!detail) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Objectives */}
      <section aria-label="Learning objectives">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Objectives
        </h3>
        {detail.objectives.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            No learning objectives recorded for this week.
          </p>
        ) : (
          <ul className="space-y-1">
            {detail.objectives.map((objective) => (
              <li
                key={objective.id}
                className="group flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
              >
                <FontAwesomeIcon
                  icon={faCircleCheck}
                  className="mt-1 h-3 w-3 shrink-0 text-[var(--color-primary)]"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">{objective.text}</span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void removeWeekObjective(objective.id)}
                    aria-label={`Remove objective: ${objective.text}`}
                    className="rounded p-0.5 text-slate-300 opacity-0 transition hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
                  >
                    <FontAwesomeIcon icon={faTrashCan} className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              label="Add learning objective"
              hideLabel
              value={objectiveDraft}
              onChange={(event) => setObjectiveDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitObjective();
              }}
              placeholder="By the end of this week, students can…"
              className="h-8 text-xs"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void submitObjective()}
              isLoading={addingObjective}
              disabled={!objectiveDraft.trim()}
            >
              Add
            </Button>
          </div>
        )}
      </section>

      {/* Materials */}
      <section aria-label="Materials">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Materials
        </h3>
        {detail.materials.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            No materials attached to this week yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {detail.materials.map((material) => (
              <li
                key={material.id}
                className="flex items-center gap-2.5 py-1.5"
              >
                <FontAwesomeIcon
                  icon={faFolderOpen}
                  className="h-3.5 w-3.5 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                  {material.title}
                </span>
                {material.version != null && material.version > 1 && (
                  <Badge variant="neutral" size="sm" hideDot>
                    v{material.version}
                  </Badge>
                )}
                <StatusBadge status={toSemanticStatus(material.state ?? material.status)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Assignments and quizzes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <section aria-label="Assignments">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <FontAwesomeIcon icon={faFilePen} className="h-3 w-3" aria-hidden="true" />
            Assignments
          </h3>
          {detail.assignments.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No assignments scheduled this week.
            </p>
          ) : (
            <ul className="space-y-1">
              {detail.assignments.map((assignment) => (
                <li
                  key={assignment.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">
                    {assignment.title}
                  </span>
                  <Badge
                    variant={assignment.isPastDue ? "warning" : "neutral"}
                    size="sm"
                    hideDot
                  >
                    {assignment.isPastDue
                      ? "Past due"
                      : assignment.opensIn === "FUTURE"
                        ? "Opens later"
                        : "Open"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Quizzes">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <FontAwesomeIcon icon={faClipboardList} className="h-3 w-3" aria-hidden="true" />
            Quizzes
          </h3>
          {detail.quizzes.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No quizzes scheduled this week.
            </p>
          ) : (
            <ul className="space-y-1">
              {detail.quizzes.map((quiz) => (
                <li
                  key={quiz.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">
                    {quiz.title}
                  </span>
                  <Badge
                    variant={
                      quiz.availability === "OPEN"
                        ? "success"
                        : quiz.availability === "SCHEDULED"
                          ? "info"
                          : "neutral"
                    }
                    size="sm"
                    hideDot
                  >
                    {quiz.availability.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {detail.announcements.length > 0 && (
        <section aria-label="Announcements">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Announcements
          </h3>
          <ul className="space-y-1">
            {detail.announcements.map((announcement) => (
              <li
                key={announcement.id}
                className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
              >
                <FontAwesomeIcon
                  icon={faLayerGroup}
                  className="h-3 w-3 text-slate-400"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">
                  {announcement.title}
                </span>
                {announcement.pinned && (
                  <Badge variant="accent" size="sm" hideDot>
                    Pinned
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Week {weekNumber} · Manage materials, assignments and quizzes from
        their modules to attach them here.
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Create week modal                                                 */
/* ------------------------------------------------------------------ */

const CreateWeekModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  nextNumber: number;
  onCreated: (week: LmsWeek) => void;
  onError: (message: string) => void;
}> = ({ isOpen, onClose, courseId, nextNumber, onCreated, onError }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [releaseAt, setReleaseAt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setReleaseAt("");
    }
  }, [isOpen]);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const { week } = await createWeek(courseId, {
        title: title.trim(),
        description: description.trim() || undefined,
        releaseAt: releaseAt || undefined,
      });
      onCreated(week);
      onClose();
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The week could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add week"
      subtitle={`Week ${nextNumber} will be created as a draft`}
      maxWidth="sm"
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
            disabled={!title.trim()}
          >
            Create week
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Week title" required>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="cos-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Foundations"
              autoFocus
            />
          )}
        </FormField>
        <FormField label="Description" helperText="What this week covers.">
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
          label="Release date (optional)"
          helperText="Leave empty to keep the week in draft."
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              type="datetime-local"
              aria-describedby={describedBy}
              className="cos-input"
              value={releaseAt}
              onChange={(event) => setReleaseAt(event.target.value)}
            />
          )}
        </FormField>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Template drawer                                                   */
/* ------------------------------------------------------------------ */

const TemplateDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  onApplied: (weekCount: number) => void;
  onError: (message: string) => void;
}> = ({ isOpen, onClose, courseId, onApplied, onError }) => {
  const [templates, setTemplates] = useState<LmsTemplate[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const { templates: list } = await fetchTemplates();
        if (!cancelled) {
          setTemplates(list);
          setError("");
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Templates could not be loaded.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const apply = async () => {
    if (!selected) return;
    setApplying(true);
    try {
      const { weeks } = await applyTemplate(selected, courseId);
      onApplied(weeks.length);
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The template could not be applied.",
      );
    } finally {
      setApplying(false);
    }
  };

  const chosen = templates?.find((row) => row.id === selected);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Course templates"
      subtitle="Start the term from a proven structure"
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void apply()}
            disabled={!selected}
            isLoading={applying}
            loadingLabel="Applying"
          >
            Use template
          </Button>
        </>
      }
    >
      {error ? (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      ) : !templates ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={faClone}
          title="No templates available"
          description="Course templates are created by program coordinators. Ask your department to publish one."
        />
      ) : (
        <div role="radiogroup" aria-label="Course templates" className="space-y-2">
          {templates.map((template) => (
            <label
              key={template.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition ${
                selected === template.id
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
              }`}
            >
              <input
                type="radio"
                name="course-template"
                value={template.id}
                checked={selected === template.id}
                onChange={() => setSelected(template.id)}
                className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                  {template.name}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  {template.weekCount} weeks
                  {template.program ? ` · ${template.program}` : ""}
                  {template.description &&
                    ` — ${template.description}`}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
      {chosen && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Applying creates {chosen.weekCount} draft weeks. Materials and
          quizzes appear as suggestions — you attach the real files and
          questions.
        </p>
      )}
    </Drawer>
  );
};

/** Local import helper so the week body can lazy-load its detail. */
const fetchWeekDetail = fetchWeek;

export default PlannerView;
