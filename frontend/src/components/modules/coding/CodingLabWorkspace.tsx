import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCode,
  faClipboardList,
  faArrowLeft,
  faPlus,
  faCircleExclamation,
  faCheckCircle,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { Skeleton } from "../../ui/Skeleton";
import { Tooltip } from "../../ui/Tooltip";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import {
  fetchAssignment,
  fetchAssignments,
  fetchLabCourses,
  fetchLanguages,
  fetchProjects,
  createProject,
  submitAssignmentWork,
} from "./codingApi";
import type {
  CodingAssignment,
  CodingFile,
  CodingProject,
  CodingSubmission,
  LabCourse,
  LabLanguage,
  LabLanguageResponse,
} from "./codingTypes";
import { ProjectListPane } from "./ProjectListPane";
import { CompilerWorkspace } from "./CompilerWorkspace";
import { PlaygroundWorkspace } from "./PlaygroundWorkspace";
import { ShareDialog } from "./ShareDialog";
import { AssignmentDialog } from "./AssignmentDialog";
import { SubmissionsPanel } from "./SubmissionsPanel";

type LabTab = "projects" | "assignments" | "submissions";
type EditorKind = "compiler" | "playground" | null;

/**
 * Online Coding Lab workspace — the teaching and
 * learning environment shared by students and
 * teachers. Role comes from the session, never from
 * the URL, and every action is authorised server-side.
 */
export const CodingLabWorkspace: React.FC<{
  isTeacher: boolean;
  initialProjectId?: string | null;
  initialAssignmentId?: string | null;
}> = ({ isTeacher, initialProjectId, initialAssignmentId }) => {
  const { currentUser } = useCollegeOS();
  const [tab, setTab] = useState<LabTab>("projects");
  const [languages, setLanguages] = useState<LabLanguage[]>([]);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [courses, setCourses] = useState<LabCourse[]>([]);
  const [projects, setProjects] = useState<CodingProject[]>([]);
  const [shared, setShared] = useState<CodingProject[]>([]);
  const [assignments, setAssignments] = useState<CodingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [openProject, setOpenProject] = useState<CodingProject | null>(
    null,
  );
  const [editorKind, setEditorKind] = useState<EditorKind>(null);
  const [assignmentContext, setAssignmentContext] =
    useState<CodingAssignment | null>(null);
  const [shareProject, setShareProject] = useState<CodingProject | null>(
    null,
  );
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] =
    useState<CodingAssignment | null>(null);
  const [reviewingAssignment, setReviewingAssignment] =
    useState<CodingAssignment | null>(null);
  const [reviewSubmissions, setReviewSubmissions] = useState<
    CodingSubmission[]
  >([]);
  const [toasts, setToasts] = useState<
    Array<{ id: number; message: string; tone: "success" | "error" }>
  >([]);

  const toast = useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      const id = Date.now() + Math.random();
      setToasts((previous) => [...previous, { id, message, tone }]);
      setTimeout(() => {
        setToasts((previous) =>
          previous.filter((entry) => entry.id !== id),
        );
      }, 4200);
    },
    [],
  );

  const loadLanguages = useCallback(async () => {
    try {
      const response: LabLanguageResponse = await fetchLanguages();
      setLanguages(response.languages);
      setProviderConfigured(response.configured);
    } catch {
      setLanguages([]);
      setProviderConfigured(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([
        loadLanguages(),
        fetchLabCourses()
          .then((result) => setCourses(result.courses))
          .catch(() => setCourses([])),
        fetchProjects(isTeacher ? false : true)
          .then((result) => {
            setProjects(result.projects);
            setShared(result.shared || []);
          })
          .catch((error) => {
            throw error;
          }),
        fetchAssignments()
          .then((result) => setAssignments(result.assignments))
          .catch(() => setAssignments([])),
      ]);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "The Coding Lab could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [isTeacher, loadLanguages]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Deep link: /coding-lab/projects/:id
  useEffect(() => {
    if (initialProjectId) {
      fetchProjects(isTeacher ? false : true)
        .then((result) => {
          const found =
            result.projects.find(
              (project) => project.id === initialProjectId,
            ) ||
            (result.shared || []).find(
              (project) => project.id === initialProjectId,
            );
          if (found) openProjectInEditor(found);
          else toast("That project is not available to you.", "error");
        })
        .catch(() =>
          toast("That project could not be loaded.", "error"),
        );
    }
    if (initialAssignmentId) {
      fetchAssignment(initialAssignmentId)
        .then((result) => {
          setAssignmentContext(result.assignment);
          setTab("assignments");
        })
        .catch(() =>
          toast("That assignment is not available to you.", "error"),
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProjectId, initialAssignmentId]);

  const openProjectInEditor = (project: CodingProject) => {
    setOpenProject(project);
    setEditorKind(
      project.projectType === "PLAYGROUND" ? "playground" : "compiler",
    );
    if (!assignmentContext) setAssignmentContext(null);
  };

  const openSharedProject = async (project: CodingProject) => {
    if (project.sharePermission === "COPY") {
      try {
        const { duplicateProject } = await import("./codingApi");
        const { project: copy } = await duplicateProject(project.id);
        toast("Project copied to your workspace.", "success");
        await loadAll();
        openProjectInEditor(copy);
        return;
      } catch (error) {
        toast(
          error instanceof Error
            ? error.message
            : "Could not copy the project.",
          "error",
        );
        return;
      }
    }
    openProjectInEditor(project);
  };

  const handleOpenProject = (projectId: string) => {
    const found =
      projects.find((project) => project.id === projectId) ||
      shared.find((project) => project.id === projectId);
    if (!found) return;
    if (found.ownerUser === currentUser?.id) {
      openProjectInEditor(found);
    } else {
      void openSharedProject(found);
    }
  };

  const handleSaved = useCallback(
    (project: CodingProject | null) => {
      if (!project) {
        setOpenProject(null);
        setEditorKind(null);
        setAssignmentContext(null);
        setTab("projects");
        void loadAll();
        return;
      }
      setOpenProject(project);
      setProjects((previous) =>
        previous.some((entry) => entry.id === project.id)
          ? previous.map((entry) =>
              entry.id === project.id ? project : entry,
            )
          : [project, ...previous],
      );
    },
    [loadAll],
  );

  const handleSubmit = useCallback(
    async (payload: {
      language: string;
      files: CodingFile[];
      executionId?: string;
    }) => {
      if (!assignmentContext) return;
      try {
        await submitAssignmentWork(assignmentContext.id, payload);
        toast("Assignment submitted.", "success");
        setAssignmentContext(null);
        setOpenProject(null);
        setEditorKind(null);
        setTab("assignments");
        await loadAll();
      } catch (error) {
        toast(
          error instanceof Error ? error.message : "Submission failed.",
          "error",
        );
      }
    },
    [assignmentContext, loadAll, toast],
  );

  const loadReviewSubmissions = useCallback(
    async (assignment: CodingAssignment) => {
      setReviewingAssignment(assignment);
      try {
        const { fetchSubmissions } = await import("./codingApi");
        const result = await fetchSubmissions(assignment.id);
        setReviewSubmissions(result.submissions);
      } catch (error) {
        toast(
          error instanceof Error
            ? error.message
            : "Could not load submissions.",
          "error",
        );
      }
    },
    [toast],
  );

  const openAssignmentForStudent = async (
    assignment: CodingAssignment,
  ) => {
    setAssignmentContext(assignment);
    setTab("assignments");
    // Create or reuse a working project seeded with the
    // assignment's starter files.
    try {
      const existing = projects.find(
        (project) => project.assignment === assignment.id,
      );
      if (existing) {
        openProjectInEditor(existing);
        return;
      }
      const { project: created } = await createProject({
        title: assignment.title,
        description: `Coding assignment: ${assignment.title}`,
        projectType: "COMPILER",
        defaultLanguage:
          assignment.allowedLanguages?.[0] || "python",
        files:
          assignment.starterFiles?.length
            ? assignment.starterFiles.map((file) => ({ ...file }))
            : undefined,
        courseId: assignment.course,
        assignmentId: assignment.id,
      });
      await loadAll();
      openProjectInEditor(created);
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Could not open the assignment.",
        "error",
      );
    }
  };

  const isDuePassed = (assignment: CodingAssignment) =>
    new Date(assignment.dueAt).getTime() < Date.now();

  const editorLanguages = useMemo(
    () =>
      languages.length
        ? languages
        : [
            {
              id: "python",
              name: "Python",
              extension: "py",
              execution: true,
              providerLanguageId: 71,
            },
          ],
    [languages],
  );

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <EmptyState
          icon={faCircleExclamation}
          title="Coding Lab unavailable"
          description={loadError}
          actionLabel="Try again"
          actionIcon={faCode}
          onAction={() => void loadAll()}
        />
      </div>
    );
  }

  /* ---------------- Editor view ---------------- */
  if (openProject && editorKind) {
    const sharedProps = {
      project: openProject,
      languages: editorLanguages,
      providerConfigured,
      onBack: () => {
        setOpenProject(null);
        setEditorKind(null);
        setAssignmentContext(null);
        setTab("projects");
        void loadAll();
      },
      onSaved: handleSaved,
      toast,
    };
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        {assignmentContext && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <FontAwesomeIcon
              icon={faClipboardList}
              className="text-emerald-700"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-emerald-900">
                {assignmentContext.title}
              </p>
              <p className="truncate text-xs text-emerald-700">
                Due {new Date(assignmentContext.dueAt).toLocaleString()}
                {assignmentContext.allowedLanguages?.length
                  ? ` · ${assignmentContext.allowedLanguages.join(", ")}`
                  : ""}
              </p>
            </div>
            {assignmentContext.description && (
              <Tooltip
                label={assignmentContext.description}
                placement="bottom"
              >
                <span
                  tabIndex={0}
                  aria-label="Assignment problem statement"
                  className="cursor-help rounded-full p-1.5 text-emerald-700 hover:bg-emerald-100"
                >
                  <FontAwesomeIcon icon={faInfoCircle} aria-hidden="true" />
                </span>
              </Tooltip>
            )}
          </div>
        )}
        {editorKind === "compiler" ? (
          <CompilerWorkspace
            {...sharedProps}
            assignmentId={assignmentContext?.id || null}
            assignment={assignmentContext}
            isTeacher={isTeacher}
          />
        ) : (
          <PlaygroundWorkspace {...sharedProps} />
        )}
      </div>
    );
  }

  /* ---------------- List views ---------------- */
  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      {/* Tab bar */}
      <div
        className="mb-4 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1"
        role="tablist"
        aria-label="Coding Lab sections"
      >
        {(
          [
            { id: "projects", label: "Projects", icon: faCode },
            { id: "assignments", label: "Assignments", icon: faClipboardList },
            ...(isTeacher ? [{ id: "submissions", label: "Submissions", icon: faCheckCircle }] : []),
          ] as const
        ).map(({ id, label, icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id as LabTab)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              tab === id
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FontAwesomeIcon icon={icon} className="text-xs" aria-hidden="true" />
            {label}
          </button>
        ))}
        <div className="ml-auto" aria-hidden="true" />
      </div>

      {tab === "projects" && (
        <ProjectListPane
          projects={projects}
          shared={shared}
          isTeacher={isTeacher}
          courses={courses}
          onOpenProject={handleOpenProject}
          onRefresh={loadAll}
          onOpenShareDialog={(project) => setShareProject(project)}
          onOpenAssignments={() => setTab("assignments")}
          toast={toast}
        />
      )}

      {tab === "assignments" && (
        <AssignmentsTab
          assignments={assignments}
          isTeacher={isTeacher}
          onCreate={() => {
            setEditingAssignment(null);
            setAssignmentDialogOpen(true);
          }}
          onEdit={(assignment) => {
            setEditingAssignment(assignment);
            setAssignmentDialogOpen(true);
          }}
          onOpen={openAssignmentForStudent}
          onReview={loadReviewSubmissions}
          isDuePassed={isDuePassed}
          toast={toast}
        />
      )}

      {tab === "submissions" && isTeacher && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Submission review
            </h2>
            {reviewingAssignment && (
              <Button
                variant="ghost"
                size="sm"
                icon={faArrowLeft}
                onClick={() => setReviewingAssignment(null)}
              >
                All assignments
              </Button>
            )}
          </div>
          {reviewingAssignment ? (
            <SubmissionsPanel
              submissions={reviewSubmissions}
              canGrade
              maxMarks={reviewingAssignment.maxMarks}
              toast={toast}
              onGraded={() => void loadReviewSubmissions(reviewingAssignment)}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Choose an assignment from the Assignments tab and open
              its review to see submitted code and execution results.
            </p>
          )}
        </div>
      )}

      {/* Dialogs */}
      <ShareDialog
        project={shareProject}
        courses={courses}
        toast={toast}
        onChanged={() => {
          setShareProject(null);
          void loadAll();
        }}
      />
      {assignmentDialogOpen && (
        <AssignmentDialog
          assignment={editingAssignment}
          courses={courses}
          languages={languages}
          toast={toast}
          onSaved={() => {
            setAssignmentDialogOpen(false);
            setEditingAssignment(null);
            void loadAll();
          }}
          onClose={() => {
            setAssignmentDialogOpen(false);
            setEditingAssignment(null);
          }}
        />
      )}

      {/* Toasts */}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-80 flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((entry) => (
          <div
            key={entry.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg ${
              entry.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            <FontAwesomeIcon
              icon={entry.tone === "success" ? faCheckCircle : faCircleExclamation}
              className={`mt-0.5 shrink-0 ${
                entry.tone === "success" ? "text-emerald-600" : "text-red-600"
              }`}
              aria-hidden="true"
            />
            <span className="min-w-0">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Assignment list shared by both roles. */
const AssignmentsTab: React.FC<{
  assignments: CodingAssignment[];
  isTeacher: boolean;
  onCreate: () => void;
  onEdit: (assignment: CodingAssignment) => void;
  onOpen: (assignment: CodingAssignment) => void;
  onReview: (assignment: CodingAssignment) => void;
  isDuePassed: (assignment: CodingAssignment) => boolean;
  toast: (message: string, tone?: "success" | "error") => void;
}> = ({
  assignments,
  isTeacher,
  onCreate,
  onEdit,
  onOpen,
  onReview,
  isDuePassed,
}) => {
  if (assignments.length === 0) {
    return (
      <EmptyState
        icon={faClipboardList}
        title="No coding assignments"
        description={
          isTeacher
            ? "Create a coding assignment with starter files, a deadline and allowed languages."
            : "Your teachers have not published coding assignments yet."
        }
        actionLabel={isTeacher ? "Create assignment" : undefined}
        actionIcon={isTeacher ? faPlus : undefined}
        onAction={isTeacher ? onCreate : undefined}
      />
    );
  }

  return (
    <div className="space-y-3">
      {isTeacher && (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" icon={faPlus} onClick={onCreate}>
            New assignment
          </Button>
        </div>
      )}
      <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {assignments.map((assignment) => {
          const pastDue = isDuePassed(assignment);
          return (
            <li
              key={assignment.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm"
            >
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-slate-900">
                    {assignment.title}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      assignment.status === "CLOSED" || pastDue
                        ? "bg-slate-100 text-slate-500"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {assignment.status === "CLOSED"
                      ? "Closed"
                      : pastDue
                        ? "Past due"
                        : "Open"}
                  </span>
                </div>
                {assignment.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {assignment.description}
                  </p>
                )}
                <p className="mt-1.5 text-xs text-slate-400">
                  Due {new Date(assignment.dueAt).toLocaleString()} · max{" "}
                  {assignment.maxMarks} marks
                  {assignment.allowedLanguages?.length
                    ? ` · ${assignment.allowedLanguages.join(", ")}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isTeacher ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={faClipboardList}
                      onClick={() => onReview(assignment)}
                    >
                      Review submissions
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(assignment)}
                    >
                      Edit
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={faCode}
                    onClick={() => void onOpen(assignment)}
                    disabled={assignment.status === "CLOSED"}
                  >
                    Open in editor
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default CodingLabWorkspace;
