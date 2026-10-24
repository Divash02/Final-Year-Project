import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay,
  faSave,
  faCopy,
  faFolderOpen,
  faDownload,
  faUpload,
  faRotateLeft,
  faCircleCheck,
  faTriangleExclamation,
  faCloudArrowUp,
  faColumns,
  faTableCells,
  faXmark,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { Modal } from "../../ui/Modal";
import { CodeEditor } from "./CodeEditor";
import { PlaygroundPreview } from "./PlaygroundPreview";
import type { CodingFile, CodingProject, LabLanguage } from "./codingTypes";
import { downloadTextFile, updateProject } from "./codingApi";
import { PLAYGROUND_FILES, starterFor } from "./languageRegistry";
import { buildZip, readTextFile, sanitizeFileName } from "./zipUtil";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "new";

export interface PlaygroundWorkspaceProps {
  project: CodingProject | null;
  languages: LabLanguage[];
  providerConfigured: boolean;
  onBack: () => void;
  onSaved: (project: CodingProject) => void;
  toast: (message: string, tone?: "success" | "error") => void;
}

const PLAYGROUND_GRAMMARS: Record<string, "html" | "css" | "javascript"> = {
  "index.html": "html",
  "style.css": "css",
  "script.js": "javascript",
};

/**
 * HTML/CSS/JavaScript playground. Three editable source
 * panels and an isolated live preview; Run renders the
 * latest source into a sandboxed iframe. Source files are
 * saved as one project.
 */
export const PlaygroundWorkspace: React.FC<PlaygroundWorkspaceProps> = ({
  project,
  onBack,
  onSaved,
  toast,
}) => {
  const [title, setTitle] = useState(project?.title || "Untitled playground");
  const [files, setFiles] = useState<CodingFile[]>(() => {
    if (project?.files?.length) return project.files.map((file) => ({ ...file }));
    return PLAYGROUND_FILES.map((file) => ({
      name: file.name,
      language: file.language,
      content: starterFor(file.language),
      isMain: file.name === "index.html",
    }));
  });
  const [activeFileName, setActiveFileName] = useState("index.html");
  const [saveState, setSaveState] = useState<SaveState>(
    project ? "saved" : "new",
  );
  const [runToken, setRunToken] = useState(0);
  const [editorFullscreen, setEditorFullscreen] = useState(false);
  const [layout, setLayout] = useState<"horizontal" | "vertical">("horizontal");
  const [splitRatio, setSplitRatio] = useState(55);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsTitle, setSaveAsTitle] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"editor" | "preview">(
    "editor",
  );
  const projectIdRef = useRef(project?.id || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const fileByName = (name: string) =>
    files.find((file) => file.name === name) || {
      name,
      language: "html",
      content: "",
      isMain: false,
    };

  const html = fileByName("index.html").content;
  const css = fileByName("style.css").content;
  const javascript = fileByName("script.js").content;

  const addFile = () => {
    const base = "script.js";
    let name = base;
    let counter = 1;
    while (files.some((file) => file.name === name)) {
      counter += 1;
      name = `script-${counter}.js`;
    }
    setFiles((previous) => [
      ...previous,
      { name, language: "javascript", content: "", isMain: false },
    ]);
    setActiveFileName(name);
    markDirty();
  };

  const closeFile = (fileName: string) => {
    if (["index.html", "style.css", "script.js"].includes(fileName)) {
      // Core playground files can be emptied but not removed.
      setFiles((previous) =>
        previous.map((file) =>
          file.name === fileName ? { ...file, content: "" } : file,
        ),
      );
      markDirty();
      return;
    }
    const remaining = files.filter((file) => file.name !== fileName);
    if (!remaining.length) return;
    setFiles(remaining);
    if (activeFileName === fileName) setActiveFileName(remaining[0].name);
    markDirty();
  };

  const handleUpload = async (list: FileList | null) => {
    if (!list?.length) return;
    const added: CodingFile[] = [];
    for (const file of Array.from(list)) {
      try {
        const content = await readTextFile(file);
        const name = sanitizeFileName(file.name);
        added.push({
          name,
          language: PLAYGROUND_GRAMMARS[name] || "javascript",
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
      setFiles((previous) => [...previous, ...added]);
      setActiveFileName(added[0].name);
      markDirty();
      toast(`${added.length} file${added.length === 1 ? "" : "s"} added.`, "success");
    }
  };

  const downloadAll = () => {
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
    anchor.download = `${title.replace(/[^\w.-]+/g, "-") || "playground"}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const resetStarter = () => {
    setFiles(
      PLAYGROUND_FILES.map((file) => ({
        name: file.name,
        language: file.language,
        content: starterFor(file.language),
        isMain: file.name === "index.html",
      })),
    );
    setActiveFileName("index.html");
    setRunToken((token) => token + 1);
    setResetConfirmOpen(false);
    markDirty();
    toast("Playground reset to the starter template.", "success");
  };

  const save = useCallback(async () => {
    setSaveState("saving");
    try {
      const { project: saved } = await updateProject(
        projectIdRef.current || "",
        { title, projectType: "PLAYGROUND", defaultLanguage: "html", files },
      );
      projectIdRef.current = saved.id;
      onSaved(saved);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      toast(
        error instanceof Error ? error.message : "Save failed.",
        "error",
      );
    }
  }, [files, onSaved, title, toast]);

  const handleSaveAs = async () => {
    const nextTitle = saveAsTitle.trim() || `${title} (copy)`;
    setSaveAsOpen(false);
    setSaveAsTitle("");
    try {
      const { duplicateProject } = await import("./codingApi");
      if (!projectIdRef.current) {
        const { createProject } = await import("./codingApi");
        const { project: created } = await createProject({
          title: nextTitle,
          projectType: "PLAYGROUND",
          defaultLanguage: "html",
          files,
        });
        projectIdRef.current = created.id;
        setTitle(nextTitle);
        setSaveState("saved");
        onSaved(created);
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

  const splitStyle =
    layout === "horizontal"
      ? { gridTemplateColumns: `${splitRatio}% 1fr` }
      : { gridTemplateRows: `${splitRatio}% 1fr` };

  const activeGrammar =
    PLAYGROUND_GRAMMARS[activeFileName] || "javascript";

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

        <Button variant="primary" size="sm" icon={faPlay} onClick={() => setRunToken((token) => token + 1)}>
          Run
        </Button>
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

        <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        <IconButton
          icon={faDownload}
          label="Download project files (ZIP)"
          size="sm"
          variant="secondary"
          onClick={downloadAll}
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
          accept=".html,.css,.js,.txt"
          className="sr-only"
          aria-hidden="true"
          onChange={(event) => {
            void handleUpload(event.target.files);
            event.target.value = "";
          }}
        />
        <IconButton
          icon={faRotateLeft}
          label="Reset starter code"
          size="sm"
          variant="secondary"
          onClick={() => setResetConfirmOpen(true)}
        />

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={layout === "horizontal" ? faColumns : faTableCells}
            onClick={() =>
              setLayout((previous) =>
                previous === "horizontal" ? "vertical" : "horizontal",
              )
            }
          >
            {layout === "horizontal" ? "Vertical" : "Horizontal"}
          </Button>
        </div>
      </div>

      {/* File tabs */}
      <div
        className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"
        role="tablist"
        aria-label="Playground files"
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
            {!["index.html", "style.css", "script.js"].includes(file.name) && (
              <button
                type="button"
                aria-label={`Close ${file.name}`}
                className="hidden text-slate-400 hover:text-slate-700 group-hover:inline"
                onClick={() => closeFile(file.name)}
              >
                <FontAwesomeIcon icon={faXmark} className="text-[10px]" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addFile}
          aria-label="Add JavaScript file"
          className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <FontAwesomeIcon icon={faPlus} className="mr-1 text-[10px]" aria-hidden="true" />
          Add file
        </button>
      </div>

      {/* Mobile panel switcher */}
      <div className="flex gap-1 lg:hidden" role="tablist" aria-label="Workspace panels">
        {(["editor", "preview"] as const).map((panel) => (
          <button
            key={panel}
            role="tab"
            aria-selected={mobilePanel === panel}
            onClick={() => setMobilePanel(panel)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
              mobilePanel === panel
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {panel === "editor" ? "Editor" : "Preview"}
          </button>
        ))}
      </div>

      {/* Workspace */}
      <div className="grid min-h-0 flex-1 gap-2" style={splitStyle}>
        <div
          className={[
            "min-h-0 min-w-0 flex-col gap-2",
            layout === "horizontal" ? "flex" : "flex",
            mobilePanel === "editor" ? "flex" : "hidden lg:flex",
          ].join(" ")}
        >
          <CodeEditor
            value={fileByName(activeFileName).content}
            onChange={updateActiveContent}
            language={activeGrammar}
            filename={activeFileName}
            onSave={() => void save()}
            fullscreen={editorFullscreen}
            onFullscreenChange={setEditorFullscreen}
            placeholder={
              activeFileName === "index.html"
                ? "<!-- Write your HTML here -->"
                : activeFileName === "style.css"
                  ? "/* Write your CSS here */"
                  : "// Write your JavaScript here"
            }
            ariaLabel={`${activeFileName} editor`}
          />
          {layout === "vertical" && (
            <PlaygroundPreview
              html={html}
              css={css}
              javascript={javascript}
              runToken={runToken}
            />
          )}
        </div>
        {layout === "horizontal" && (
          <div
            className={[
              "min-h-0 min-w-0",
              mobilePanel === "preview" ? "block" : "hidden lg:block",
            ].join(" ")}
          >
            <PlaygroundPreview
              html={html}
              css={css}
              javascript={javascript}
              runToken={runToken}
            />
          </div>
        )}
      </div>

      {/* Reset confirmation */}
      <Modal
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Reset playground?"
        subtitle="Unsaved edits are replaced by the starter template."
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetConfirmOpen(false)}>
              Keep my code
            </Button>
            <Button variant="danger" icon={faRotateLeft} onClick={resetStarter}>
              Reset to starter
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This replaces all three playground files with the starter
          template. Saved project files are only affected after you save.
        </p>
      </Modal>

      {/* Save As dialog */}
      <Modal
        isOpen={saveAsOpen}
        onClose={() => setSaveAsOpen(false)}
        title="Save playground as…"
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
    </div>
  );
};

export default PlaygroundWorkspace;
