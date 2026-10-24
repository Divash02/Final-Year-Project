import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay,
  faStop,
  faSave,
  faCopy,
  faFolderOpen,
  faDownload,
  faUpload,
  faRotateLeft,
  faPlus,
  faXmark,
  faFileCode,
  faPen,
  faCloudArrowUp,
  faTriangleExclamation,
  faCircleCheck,
  faHistory,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { Modal } from "../../ui/Modal";
import { CodeEditor } from "./CodeEditor";
import { OutputPanel } from "./OutputPanel";
import { pollExecution, runCode } from "./execution";
import type {
  CodingFile,
  CodingProject,
  ExecutionResult,
  LabLanguage,
  CodingAssignment,
  CodingDraft,
  CodingSubmission,
} from "./codingTypes";
import { downloadTextFile, updateProject } from "./codingApi";
import { fetchDraft, saveDraft, submitAssignmentWork, fetchSubmissions } from "./codingApi";
import {
  defaultFileNameFor,
  getLanguageDefinition,
  languageForFileName,
  starterFor,
} from "./languageRegistry";
import type { GrammarFamily } from "./syntax";
import {
  buildZip,
  readTextFile,
  sanitizeFileName,
} from "./zipUtil";
import { SubmissionConfirmDialog } from "./SubmissionConfirmDialog";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "new";

export interface CompilerWorkspaceProps {
  project: CodingProject | null;
  /** Assignment context — enables the submit action for students. */
  assignmentId?: string | null;
  assignment: CodingAssignment | null;
  languages: LabLanguage[];
  providerConfigured: boolean;
  isTeacher: boolean;
  onBack: () => void;
  onSaved: (project: CodingProject) => void;
  toast: (message: string, tone?: "success" | "error") => void;
}

/**
 * General-purpose online compiler. The editor manages one or
 * more source files; the active file runs against the
 * execution service with its stdin. Save persists to the
 * CollegeOS account; download/upload move work to the device.
 */
export const CompilerWorkspace: React.FC<CompilerWorkspaceProps> = ({
  project,
  assignmentId,
  assignment,
  languages,
  providerConfigured,
  isTeacher,
  onBack,
  onSaved,
  toast,
}) => {
  const [title, setTitle] = useState(project?.title || "Untitled project");
  const [files, setFiles] = useState<CodingFile[]>(
    () =>
      project?.files?.length
        ? project.files.map((file) => ({ ...file }))
        : [
            {
              name: defaultFileNameFor(project?.defaultLanguage || "python"),
              language: project?.defaultLanguage || "python",
              content: starterFor(project?.defaultLanguage || "python"),
              isMain: true,
            },
          ],
  );
  const [activeFileName, setActiveFileName] = useState(
    files[0]?.name || "",
  );
  const [languageId, setLanguageId] = useState(
    project?.defaultLanguage ||
      files[0]?.language ||
      "python",
  );
  const [stdin, setStdin] = useState("");
  const [saveState, setSaveState] = useState<SaveState>(
    project ? "saved" : "new",
  );
  const [execution, setExecution] = useState<ExecutionResult | null>(null);
  const [running, setRunning] = useState(false);
  const [polling, setPolling] = useState(false);
  const [editorFullscreen, setEditorFullscreen] = useState(false);
  const [panelSplit, setPanelSplit] = useState<"horizontal" | "vertical">(
    "vertical",
  );
  const [splitRatio, setSplitRatio] = useState(58);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsTitle, setSaveAsTitle] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [unavailableHint, setUnavailableHint] = useState<string | null>(
    null,
  );
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissions, setSubmissions] = useState<CodingSubmission[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const projectIdRef = useRef(project?.id || null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Execution language capability comes from the provider.
  const executableLanguages = useMemo(
    () => languages.filter((entry) => entry.execution),
    [languages],
  );

  // Load draft when assignment is available
  useEffect(() => {
    if (assignmentId && !draftLoaded && !projectIdRef.current) {
      loadDraft();
    }
  }, [assignmentId, draftLoaded]);

  const loadDraft = async () => {
    if (!assignmentId) return;
    try {
      const { draft } = await fetchDraft(assignmentId);
      if (draft) {
        setFiles(draft.files.map((file) => ({ ...file })));
        setLanguageId(draft.language);
        setActiveFileName(draft.files[0]?.name || "");
        toast("Draft loaded.", "success");
      }
    } catch (error) {
      // Silently ignore draft load errors
      console.debug("Could not load draft:", error);
    } finally {
      setDraftLoaded(true);
    }
  };

  const saveDraftHandler = async () => {
    if (!assignmentId) return;
    setSavingDraft(true);
    setDraftSaveState("saving");
    try {
      const { draft } = await saveDraft(assignmentId, {
        language: activeFile.language || languageId,
        files,
      });
      setDraftSaveState("saved");
      toast("Draft saved.", "success");
      setTimeout(() => setDraftSaveState("idle"), 2000);
    } catch (error) {
      setDraftSaveState("error");
      toast(
        error instanceof Error ? error.message : "Failed to save draft.",
        "error",
      );
      setTimeout(() => setDraftSaveState("idle"), 3000);
    } finally {
      setSavingDraft(false);
    }
  };

  const loadSubmissions = async () => {
    if (!assignmentId) return;
    setLoadingHistory(true);
    try {
      const { submissions } = await fetchSubmissions(assignmentId);
      setSubmissions(submissions);
      setShowHistory(true);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not load submission history.",
        "error",
      );
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSubmitClick = () => {
    if (!activeFile) return;
    setSubmitConfirmOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (!activeFile || !assignmentId) return;
    setSubmitting(true);
    try {
      await submitAssignmentWork(assignmentId, {
        language: activeFile.language || languageId,
        files,
        executionId: execution?.id || undefined,
      });
      toast("Assignment submitted successfully.", "success");
      setSubmitConfirmOpen(false);
      await loadSubmissions();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Submission failed.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!providerConfigured) {
      setUnavailableHint(
        "The code execution service is not configured on this deployment. You can still write and save code — running programs needs the service.",
      );
    } else {
      setUnavailableHint(null);
    }
  }, [providerConfigured]);

  const activeFile = useMemo(
    () => files.find((file) => file.name === activeFileName) || files[0],
    [files, activeFileName],
  );

  const markDirty = useCallback(() => {
    setSaveState((previous) =>
      previous === "saved" || previous === "new" ? "dirty" : previous,
    );
  }, []);

  const updateActiveContent = useCallback(
    (content: string) => {
      setFiles((previous) =>
        previous.map((file) =>
          file.name === activeFileName ? { ...file, content } : file,
        ),
      );
      markDirty();
    },
    [activeFileName, markDirty],
  );

  const updateActiveLanguage = useCallback(
    (nextLanguage: string) => {
      setLanguageId(nextLanguage);
      setFiles((previous) =>
        previous.map((file) =>
          file.name === activeFileName
            ? { ...file, language: nextLanguage }
            : file,
        ),
      );
      markDirty();
    },
    [activeFileName, markDirty],
  );

  const addFile = () => {
    const definition = getLanguageDefinition(languageId);
    const base = defaultFileNameFor(definition.id);
    let name = base;
    let counter = 1;
    while (files.some((file) => file.name === name)) {
      counter += 1;
      const dot = base.lastIndexOf(".");
      name =
        dot > 0
          ? `${base.slice(0, dot)}-${counter}${base.slice(dot)}`
          : `${base}-${counter}`;
    }
    const newFile: CodingFile = {
      name,
      language: definition.id,
      content: starterFor(definition.id),
      isMain: files.length === 0,
    };
    setFiles((previous) => [...previous, newFile]);
    setActiveFileName(name);
    markDirty();
  };

  const closeFile = (fileName: string) => {
    const remaining = files.filter((file) => file.name !== fileName);
    if (remaining.length === 0) return;
    setFiles(remaining);
    if (activeFileName === fileName) {
      setActiveFileName(remaining[0].name);
    }
    markDirty();
  };

  const renameFile = (fileName: string, nextName: string) => {
    const cleaned = sanitizeFileName(nextName);
    if (files.some((file) => file.name === cleaned)) {
      toast("A file with that name already exists.", "error");
      return;
    }
    setFiles((previous) =>
      previous.map((file) =>
        file.name === fileName
          ? { ...file, name: cleaned, language: languageForFileName(cleaned) === "plaintext" ? file.language : languageForFileName(cleaned) }
          : file,
      ),
    );
    if (activeFileName === fileName) setActiveFileName(cleaned);
    markDirty();
  };

  const handleUpload = async (list: FileList | null) => {
    if (!list?.length) return;
    const added: CodingFile[] = [];
    for (const file of Array.from(list)) {
      try {
        const content = await readTextFile(file);
        const name = sanitizeFileName(file.name);
        const language = languageForFileName(name);
        added.push({
          name,
          language: language === "plaintext" ? languageId : language,
          content,
          isMain: false,
        });
      } catch (error) {
        toast(
          error instanceof Error ? error.message : "Could not read that file.",
          "error",
        );
      }
    }
    if (added.length) {
      setFiles((previous) => {
        const merged = [...previous];
        for (const file of added) {
          const index = merged.findIndex(
            (existing) => existing.name === file.name,
          );
          if (index >= 0) merged[index] = file;
          else merged.push(file);
        }
        return merged;
      });
      setActiveFileName(added[0].name);
      markDirty();
      toast(`${added.length} file${added.length === 1 ? "" : "s"} added.`, "success");
    }
  };

  const downloadActive = () => {
    if (activeFile) {
      downloadTextFile(activeFile.name, activeFile.content);
    }
  };

  const downloadProject = () => {
    if (files.length === 1) {
      downloadTextFile(files[0].name, files[0].content);
      return;
    }
    const zip = buildZip(
      files.map((file) => ({ name: file.name, data: file.content })),
    );
    const url = URL.createObjectURL(zip);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.replace(/[^\w.-]+/g, "-") || "project"}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const resetToStarter = () => {
    const definition = getLanguageDefinition(languageId);
    setFiles([
      {
        name: defaultFileNameFor(definition.id),
        language: definition.id,
        content: starterFor(definition.id),
        isMain: true,
      },
    ]);
    setActiveFileName(defaultFileNameFor(definition.id));
    setStdin("");
    setExecution(null);
    setResetConfirmOpen(false);
    markDirty();
    toast("Editor reset to the starter template.", "success");
  };

  const save = useCallback(
    async (overrideTitle?: string) => {
      setSaveState("saving");
      setSaveError(null);
      try {
        const { project: saved } = await updateProject(
          projectIdRef.current || "",
          {
            title: overrideTitle || title,
            defaultLanguage: languageId,
            files,
          },
        );
        projectIdRef.current = saved.id;
        onSaved(saved);
        setSaveState("saved");
        if (overrideTitle) setTitle(overrideTitle);
        return saved;
      } catch (error) {
        setSaveState("error");
        const message =
          error instanceof Error ? error.message : "Save failed.";
        setSaveError(message);
        toast(message, "error");
        return null;
      }
    },
    [files, languageId, onSaved, title, toast],
  );

  // Warn before losing unsaved edits.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (saveState === "dirty") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  const handleRun = async () => {
    if (!activeFile) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setRunning(true);
    setExecution(null);
    try {
      const { executionId } = await runCode({
        languageId: activeFile.language || languageId,
        sourceCode: activeFile.content,
        stdin,
        projectId: projectIdRef.current || undefined,
      });
      setPolling(true);
      const result = await pollExecution(executionId, {
        signal: abortRef.current.signal,
        onTick: setExecution,
      });
      setExecution(result);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setExecution({
          id: "",
          languageId: languageId,
          status: "FAILED",
          description: "Cancelled",
          stdout: "",
          stderr: "Execution cancelled by the user.",
          compileOutput: "",
          exitCode: null,
          durationMs: null,
          memoryKb: null,
          message: null,
          createdAt: new Date().toISOString(),
        });
      } else {
        const message =
          error instanceof Error ? error.message : "Execution failed.";
        setExecution({
          id: "",
          languageId: languageId,
          status: "PROVIDER_ERROR",
          description: null,
          stdout: "",
          stderr: "",
          compileOutput: "",
          exitCode: null,
          durationMs: null,
          memoryKb: null,
          message,
          createdAt: new Date().toISOString(),
        });
      }
    } finally {
      setRunning(false);
      setPolling(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleSaveAs = async () => {
    const nextTitle = saveAsTitle.trim() || `${title} (copy)`;
    // Save As creates a new project server-side via the
    // duplicate endpoint, then switches to it.
    setSaveAsOpen(false);
    setSaveAsTitle("");
    try {
      const { duplicateProject } = await import("./codingApi");
      if (!projectIdRef.current) {
        // New unsaved project: just persist it under the new name.
        const saved = await save(nextTitle);
        if (saved) {
          setTitle(nextTitle);
          toast("Project saved.", "success");
        }
        return;
      }
      const { project: copy } = await duplicateProject(projectIdRef.current, {
        title: nextTitle,
      });
      projectIdRef.current = copy.id;
      setTitle(copy.title);
      setFiles(copy.files.map((file) => ({ ...file })));
      setSaveState("saved");
      onSaved(copy);
      toast(`Saved as “${copy.title}”.`, "success");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Save As failed.",
        "error",
      );
    }
  };

  const splitStyle =
    panelSplit === "vertical"
      ? { gridTemplateRows: `${splitRatio}% 1fr` }
      : { gridTemplateColumns: `${splitRatio}% 1fr` };

  const grammar: GrammarFamily = getLanguageDefinition(
    activeFile.language || languageId,
  ).grammar;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
        <Button variant="ghost" size="sm" icon={faFolderOpen} onClick={onBack} className="text-slate-600">
          Projects
        </Button>

        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            markDirty();
          }}
          aria-label="Project name"
          className="min-w-0 max-w-56 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-slate-900 outline-none transition hover:border-slate-200 focus:border-emerald-500 focus:bg-white"
        />

        <span
          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
            saveState === "saved"
              ? "text-emerald-600"
              : saveState === "dirty"
                ? "text-amber-600"
                : saveState === "saving"
                  ? "text-sky-600"
                  : saveState === "error"
                    ? "text-red-600"
                    : "text-slate-400"
          }`}
          role="status"
          aria-live="polite"
        >
          {saveState === "saved" && (
            <>
              <FontAwesomeIcon icon={faCircleCheck} className="text-[10px]" aria-hidden="true" />
              Saved
            </>
          )}
          {saveState === "dirty" && (
            <>
              <FontAwesomeIcon icon={faTriangleExclamation} className="text-[10px]" aria-hidden="true" />
              Unsaved changes
            </>
          )}
          {saveState === "saving" && (
            <>
              <FontAwesomeIcon icon={faCloudArrowUp} className="animate-pulse text-[10px]" aria-hidden="true" />
              Saving…
            </>
          )}
          {saveState === "error" && <>Save failed</>}
          {saveState === "new" && <>Not saved yet</>}
        </span>

        <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        {/* Language selector */}
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Language</span>
          <FontAwesomeIcon icon={faFileCode} className="text-xs text-slate-400" aria-hidden="true" />
          <select
            value={activeFile.language || languageId}
            onChange={(event) => updateActiveLanguage(event.target.value)}
            aria-label="Language"
            className="cos-input h-8 w-auto cursor-pointer pr-7 text-xs"
          >
            {languages.map((language: LabLanguage) => (
              <option key={language.id} value={language.id}>
                {language.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        {running || polling ? (
          <Button variant="secondary" size="sm" icon={faStop} onClick={handleStop}>
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            icon={faPlay}
            onClick={() => void handleRun()}
            disabled={!providerConfigured}
            title={providerConfigured ? "Run code (Ctrl+Enter)" : "Execution service unavailable"}
          >
            Run code
          </Button>
        )}

        {/* Assignment-specific actions */}
        {assignmentId && !isTeacher && (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={faSave}
              onClick={saveDraftHandler}
              disabled={savingDraft || (saveState !== "dirty" && saveState !== "new")}
              title="Save draft (Ctrl+Shift+S)"
            >
              Save Draft
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={faCircleCheck}
              onClick={handleSubmitClick}
              disabled={running || polling || submitting || !activeFile}
              title="Submit assignment"
            >
              Submit Code
            </Button>
          </>
        )}

        {(!assignmentId || isTeacher) && (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={faSave}
              onClick={() => void save()}
              disabled={saveState !== "dirty" && saveState !== "new"}
              title="Save project (Ctrl+S)"
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={faCopy}
              onClick={() => {
                setSaveAsTitle(`${title} (copy)`);
                setSaveAsOpen(true);
              }}
            >
              Save as
            </Button>
          </>
        )}

        <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        <IconButton
          icon={faDownload}
          label="Download file"
          size="sm"
          variant="secondary"
          onClick={downloadActive}
        />
        <IconButton
          icon={faPlus}
          label="Download project as ZIP"
          size="sm"
          variant="secondary"
          onClick={downloadProject}
        />
        <IconButton
          icon={faUpload}
          label="Upload source file"
          size="sm"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".py,.java,.c,.cpp,.js,.ts,.cs,.php,.go,.rs,.rb,.kt,.swift,.sql,.txt,.html,.css"
          className="sr-only"
          aria-hidden="true"
          onChange={(event) => {
            void handleUpload(event.target.files);
            event.target.value = "";
          }}
        />
        <IconButton
          icon={faRotateLeft}
          label="Reset to starter code"
          size="sm"
          variant="secondary"
          onClick={() => setResetConfirmOpen(true)}
        />

        {/* Draft save status indicator */}
        {assignmentId && !isTeacher && draftSaveState !== "idle" && (
          <span className="text-xs text-slate-500 flex items-center gap-1">
            {draftSaveState === "saving" && (
              <>
                <FontAwesomeIcon icon={faCloudArrowUp} className="animate-spin text-[10px]" aria-hidden="true" />
                Saving draft…
              </>
            )}
            {draftSaveState === "saved" && (
              <>
                <FontAwesomeIcon icon={faCircleCheck} className="text-emerald-600 text-[10px]" aria-hidden="true" />
                Draft saved
              </>
            )}
            {draftSaveState === "error" && (
              <>
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-red-600 text-[10px]" aria-hidden="true" />
                Draft save failed
              </>
            )}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {assignmentId && !isTeacher && (
            <Button
              variant="ghost"
              size="sm"
              icon={faHistory}
              onClick={loadSubmissions}
              disabled={loadingHistory}
              title="Submission history"
            >
              History
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setPanelSplit((previous) =>
                previous === "vertical" ? "horizontal" : "vertical",
              )
            }
          >
            {panelSplit === "vertical" ? "Side by side" : "Stacked"}
          </Button>
        </div>
      </div>

      {/* File tabs */}
      {files.length > 1 && (
        <div
          className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"
          role="tablist"
          aria-label="Open files"
        >
          {files.map((file) => (
            <div
              key={file.name}
              role="tab"
              aria-selected={file.name === activeFileName}
              className={`group flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                file.name === activeFileName
                  ? "bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveFileName(file.name)}
                className="max-w-40 truncate"
                title={file.name}
              >
                {file.name}
              </button>
              <button
                type="button"
                aria-label={`Rename ${file.name}`}
                className="hidden text-slate-400 hover:text-slate-700 group-hover:inline"
                onClick={() => {
                  const next = window.prompt("New file name", file.name);
                  if (next) renameFile(file.name, next);
                }}
              >
                <FontAwesomeIcon icon={faPen} className="text-[10px]" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Close ${file.name}`}
                className="hidden text-slate-400 hover:text-slate-700 group-hover:inline"
                onClick={() => closeFile(file.name)}
              >
                <FontAwesomeIcon icon={faXmark} className="text-[10px]" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addFile}
            aria-label="Add file"
            className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <FontAwesomeIcon icon={faPlus} className="mr-1 text-[10px]" aria-hidden="true" />
            Add file
          </button>
        </div>
      )}

      {/* Workspace area */}
      <div
        className="grid min-h-0 flex-1 gap-2"
        style={splitStyle}
      >
        <CodeEditor
          value={activeFile?.content || ""}
          onChange={updateActiveContent}
          language={grammar}
          filename={activeFile?.name || "source"}
          onRun={() => void handleRun()}
          onSave={() => void save()}
          fullscreen={editorFullscreen}
          onFullscreenChange={setEditorFullscreen}
          placeholder="// Write your code here"
          ariaLabel={`Source editor for ${activeFile?.name || "source file"}`}
        />
        <OutputPanel
          execution={execution}
          running={running || polling}
          stdin={stdin}
          onStdinChange={setStdin}
          onClear={() => setExecution(null)}
          unavailableMessage={unavailableHint}
        />
      </div>

      {/* Submission History Panel */}
      {showHistory && (
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Submission History</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
              Close
            </Button>
          </div>
          {loadingHistory ? (
            <div className="p-8 text-center text-slate-500">Loading…</div>
          ) : submissions.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No submissions yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {submissions.map((submission) => (
                <li key={submission.id}>
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        Attempt #{submission.version}
                      </span>
                      <span className="text-xs text-slate-500">
                        {submission.language} · {new Date(submission.submittedAt).toLocaleString()}
                        {submission.isLate && (
                          <span className="ml-1 font-medium text-amber-600">late</span>
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
                          {submission.marks !== null && submission.marks !== undefined ? (
                            ` · {submission.marks}/{assignment?.maxMarks ?? 100}`
                          ) : null}
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
          )}
        </div>
      )}

      {/* Reset confirmation */}
      <Modal
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Reset code?"
        subtitle="Unsaved edits in the editor will be replaced by the starter template."
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetConfirmOpen(false)}>
              Keep my code
            </Button>
            <Button variant="danger" icon={faRotateLeft} onClick={resetToStarter}>
              Reset to starter
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This replaces the contents of the editor with the{" "}
          <strong>{getLanguageDefinition(languageId).label}</strong> starter
          template. Saved project files are only affected after you save.
        </p>
      </Modal>

      {/* Save As dialog */}
      <Modal
        isOpen={saveAsOpen}
        onClose={() => setSaveAsOpen(false)}
        title="Save project as…"
        subtitle="Creates a separate project with the current files."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveAsOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={faCopy} onClick={() => void handleSaveAs()}>
              Save as new project
            </Button>
          </>
        }
      >
        <input
          autoFocus
          value={saveAsTitle}
          onChange={(event) => setSaveAsTitle(event.target.value)}
          maxLength={180}
          aria-label="New project name"
          className="cos-input"
          placeholder="Project name"
        />
      </Modal>

      {saveError && (
        <p role="alert" className="sr-only">
          {saveError}
        </p>
      )}

      {/* Submission confirmation dialog */}
      <SubmissionConfirmDialog
        isOpen={submitConfirmOpen}
        onClose={() => setSubmitConfirmOpen(false)}
        onConfirm={handleConfirmSubmit}
        assignment={assignment}
        languageId={activeFile?.language || languageId}
        attemptNumber={submissions.length > 0 ? Math.max(...submissions.map(s => s.version)) + 1 : 1}
        maxAttempts={null}
        isLoading={submitting}
      />
    </div>
  );
};

export default CompilerWorkspace;
