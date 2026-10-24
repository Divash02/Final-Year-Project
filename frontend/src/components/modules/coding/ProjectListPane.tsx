import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCode,
  faFileCode,
  faFolderOpen,
  faCopy,
  faPen,
  faTrash,
  faShareNodes,
  faPlus,
  faArrowLeft,
  faClock,
  faBookOpen,
  faCloud,
  faCircleCheck,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { Modal } from "../../ui/Modal";
import { Input } from "../../ui/Input";
import type { CodingProject, CodingShare, LabCourse } from "./codingTypes";
import {
  createProject,
  deleteProject,
  duplicateProject,
  updateProject,
} from "./codingApi";
import {
  defaultFileNameFor,
  getLanguageDefinition,
  starterFor,
  isPlaygroundLanguage,
} from "./languageRegistry";

export interface ProjectListPaneProps {
  projects: CodingProject[];
  shared: CodingProject[];
  isTeacher: boolean;
  courses: LabCourse[];
  onOpenProject: (projectId: string) => void;
  onRefresh: () => Promise<void>;
  onOpenShareDialog: (project: CodingProject) => void;
  onOpenAssignments: () => void;
  toast: (message: string, tone?: "success" | "error") => void;
}

/**
 * Project list for the Coding Lab. Students see their own
 * projects plus projects teachers shared with them; teachers
 * see their own projects and the ones they have shared.
 */
export const ProjectListPane: React.FC<ProjectListPaneProps> = ({
  projects,
  shared,
  isTeacher,
  courses,
  onOpenProject,
  onRefresh,
  onOpenShareDialog,
  onOpenAssignments,
  toast,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<CodingProject | null>(null);
  const [deleting, setDeleting] = useState<CodingProject | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"COMPILER" | "PLAYGROUND">("COMPILER");
  const [newLanguage, setNewLanguage] = useState("python");
  const [newCourseId, setNewCourseId] = useState("");
  const [renameTitle, setRenameTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const openNewProject = async () => {
    const title = newTitle.trim() || "Untitled project";
    setBusy(true);
    try {
      const language = getLanguageDefinition(newLanguage);
      const files =
        newType === "PLAYGROUND"
          ? [
              {
                name: "index.html",
                language: "html",
                content: starterFor("html"),
                isMain: true,
              },
              {
                name: "style.css",
                language: "css",
                content: starterFor("css"),
                isMain: false,
              },
              {
                name: "script.js",
                language: "javascript",
                content: starterFor("javascript"),
                isMain: false,
              },
            ]
          : [
              {
                name: defaultFileNameFor(language.id),
                language: language.id,
                content: starterFor(language.id),
                isMain: true,
              },
            ];
      const { project } = await createProject({
        title,
        projectType: newType,
        defaultLanguage: language.id,
        files,
        courseId: newCourseId || undefined,
      });
      setIsCreateOpen(false);
      setNewTitle("");
      await onRefresh();
      onOpenProject(project.id);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not create the project.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    if (!renaming) return;
    const title = renameTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      await updateProject(renaming.id, { title });
      setRenaming(null);
      await onRefresh();
      toast("Project renamed.", "success");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not rename the project.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteProject(deleting.id);
      setDeleting(null);
      await onRefresh();
      toast("Project deleted.", "success");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not delete the project.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (project: CodingProject) => {
    setBusy(true);
    try {
      await duplicateProject(project.id);
      await onRefresh();
      toast("Project duplicated to your workspace.", "success");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not duplicate the project.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const projectCard = (project: CodingProject, sharedWithMe = false) => (
    <li
      key={project.id}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpenProject(project.id)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <FontAwesomeIcon
              icon={project.projectType === "PLAYGROUND" ? faFileCode : faCode}
              aria-hidden="true"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-900">
              {project.title}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
              <span>{project.projectType === "PLAYGROUND" ? "Web playground" : getLanguageDefinition(project.defaultLanguage).label}</span>
              {project.sectionCode && <span>· Section {project.sectionCode}</span>}
              <span>
                · edited{" "}
                {new Date(project.updatedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </span>
            {project.shared && sharedWithMe && project.ownerName && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                <FontAwesomeIcon icon={faShareNodes} className="text-[10px]" aria-hidden="true" />
                Shared by {project.ownerName}
                {project.sharePermission === "COPY" ? " · open as copy available" : " · view only"}
              </span>
            )}
            {project.shared && !sharedWithMe && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <FontAwesomeIcon icon={faCircleCheck} className="text-[10px]" aria-hidden="true" />
                Shared with students
              </span>
            )}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {sharedWithMe && project.sharePermission === "COPY" && (
            <Button
              variant="secondary"
              size="sm"
              icon={faCopy}
              onClick={() => void duplicate(project)}
              disabled={busy}
            >
              Open as copy
            </Button>
          )}
          <Button variant="secondary" size="sm" icon={faFolderOpen} onClick={() => onOpenProject(project.id)}>
            Open
          </Button>
          {!sharedWithMe && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={faPen}
                aria-label={`Rename ${project.title}`}
                onClick={() => {
                  setRenaming(project);
                  setRenameTitle(project.title);
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                icon={faShareNodes}
                aria-label={`Share ${project.title}`}
                onClick={() => onOpenShareDialog(project)}
              />
              <Button
                variant="ghost"
                size="sm"
                icon={faCopy}
                aria-label={`Duplicate ${project.title}`}
                onClick={() => void duplicate(project)}
              />
              <Button
                variant="ghost"
                size="sm"
                icon={faTrash}
                aria-label={`Delete ${project.title}`}
                className="hover:text-red-600"
                onClick={() => {
                  setDeleting(project);
                }}
              />
            </>
          )}
        </div>
      </div>
    </li>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-4 pt-1">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {isTeacher ? "Coding projects" : "My coding projects"}
          </h2>
          <p className="text-xs text-slate-500">
            {isTeacher
              ? "Create starter projects, share them with your courses and set coding assignments."
              : "Write, run and save code. Projects persist on your CollegeOS account."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={faBookOpen} onClick={onOpenAssignments}>
            Assignments
          </Button>
          <Button variant="primary" icon={faPlus} onClick={() => setIsCreateOpen(true)}>
            New project
          </Button>
        </div>
      </div>

      {projects.length === 0 && shared.length === 0 ? (
        <EmptyState
          icon={faCode}
          title="No coding projects yet"
          description="Create your first project to write and run code in the browser. Starter templates are included for every supported language."
          actionLabel="Create a project"
          actionIcon={faPlus}
          onAction={() => setIsCreateOpen(true)}
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {projects.map((project) => projectCard(project))}
          </ul>

          {!isTeacher && shared.length > 0 && (
            <section aria-labelledby="shared-with-me" className="mt-6">
              <h3
                id="shared-with-me"
                className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"
              >
                <FontAwesomeIcon icon={faShareNodes} className="text-emerald-600" aria-hidden="true" />
                Shared with me
              </h3>
              <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {shared.map((project) => projectCard(project, true))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Create dialog */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="New coding project"
        subtitle="Choose a workspace type and a starting language."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={faPlus} isLoading={busy} onClick={() => void openNewProject()}>
              Create project
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Project name"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="e.g. Hello World"
            maxLength={180}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="cursor-pointer rounded-lg border p-3 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50">
              <input
                type="radio"
                name="projectType"
                className="sr-only"
                checked={newType === "COMPILER"}
                onChange={() => setNewType("COMPILER")}
              />
              <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <FontAwesomeIcon icon={faCode} aria-hidden="true" />
                Code compiler
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Write and run a single program with stdin and console output.
              </span>
            </label>
            <label className="cursor-pointer rounded-lg border p-3 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50">
              <input
                type="radio"
                name="projectType"
                className="sr-only"
                checked={newType === "PLAYGROUND"}
                onChange={() => setNewType("PLAYGROUND")}
              />
              <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <FontAwesomeIcon icon={faFileCode} aria-hidden="true" />
                Web playground
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Combine HTML, CSS and JavaScript with a live preview.
              </span>
            </label>
          </div>
          {newType === "COMPILER" && (
            <label className="block">
              <span className="cos-label">Language</span>
              <select
                className="cos-input cursor-pointer pr-9"
                value={newLanguage}
                onChange={(event) => setNewLanguage(event.target.value)}
              >
                {["python", "java", "c", "cpp", "javascript", "typescript", "csharp", "php", "go", "rust", "ruby", "kotlin", "swift", "sql"]
                  .map((id) => getLanguageDefinition(id))
                  .map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.label}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {isTeacher && courses.length > 0 && (
            <label className="block">
              <span className="cos-label">Course (optional)</span>
              <select
                className="cos-input cursor-pointer pr-9"
                value={newCourseId}
                onChange={(event) => setNewCourseId(event.target.value)}
              >
                <option value="">Personal project</option>
                {courses.map((course) => (
                  <option key={course.courseId} value={course.courseId}>
                    {course.code} — {course.name}
                    {course.sectionCode ? ` · ${course.sectionCode}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </Modal>

      {/* Rename dialog */}
      <Modal
        isOpen={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename project"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button variant="primary" isLoading={busy} onClick={() => void rename()}>
              Rename
            </Button>
          </>
        }
      >
        <Input
          label="Project name"
          value={renameTitle}
          onChange={(event) => setRenameTitle(event.target.value)}
          maxLength={180}
        />
      </Modal>

      {/* Delete confirmation */}
      <Modal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete project?"
        subtitle="This removes the project and revokes its share links. Student copies and submissions are kept."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Keep project
            </Button>
            <Button variant="danger" icon={faTrash} isLoading={busy} onClick={() => void remove()}>
              Delete project
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          <strong>{deleting?.title}</strong> will be deleted for you. This
          action cannot be undone.
        </p>
      </Modal>
    </div>
  );
};

export default ProjectListPane;
