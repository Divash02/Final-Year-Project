import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { tokenize, tokensToHtml, type GrammarFamily } from "./syntax";

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: GrammarFamily;
  filename?: string;
  onRun?: () => void;
  onSave?: () => void;
  placeholder?: string;
  /** External trigger for fullscreen (toolbar button). */
  fullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
  /** Maximum height in pixels; defaults to filling its container. */
  maxHeight?: number;
  ariaLabel?: string;
}

/**
 * Syntax-highlighted editor built on a transparent textarea over
 * a highlighted pre layer — no external editor dependency, and
 * the user's text stays selectable and accessible. Tab inserts
 * two spaces, Ctrl/Cmd+S saves and Ctrl/Cmd+Enter runs.
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language,
  filename = "source",
  onRun,
  onSave,
  placeholder,
  fullscreen = false,
  onFullscreenChange,
  maxHeight,
  ariaLabel = "Source code editor",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(fullscreen);

  useEffect(() => {
    setIsFullscreen(fullscreen);
  }, [fullscreen]);

  const highlighted = useMemo(
    () => tokensToHtml(tokenize(value || "", language)),
    [value, language],
  );

  const lineCount = useMemo(
    () => Math.max((value || "").split("\n").length, 1),
    [value],
  );

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = textarea.scrollTop;
      highlightRef.current.scrollLeft = textarea.scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textarea.scrollTop;
    }
  }, []);

  useEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (event.key === "Tab") {
      event.preventDefault();
      const { selectionStart, selectionEnd } = textarea;
      const next =
        value.slice(0, selectionStart) + "  " + value.slice(selectionEnd);
      onChange(next);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + 2;
      });
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "s") {
      event.preventDefault();
      onSave?.();
      return;
    }
    if (modifier && event.key.toLowerCase() === "enter") {
      event.preventDefault();
      onRun?.();
      return;
    }
    if (event.key === "F11") {
      event.preventDefault();
      setIsFullscreen((previous) => {
        onFullscreenChange?.(!previous);
        return !previous;
      });
    }
  };

  const fontClass = "text-[13px] leading-relaxed";
  const monoClass =
    "font-['JetBrains_Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace]";

  return (
    <div
      className={[
        "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white",
        isFullscreen ? "fixed inset-0 z-[70] m-0 rounded-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Editor title bar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
        <span className="truncate font-mono text-xs text-slate-600">
          {filename}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">
            {value.length.toLocaleString()} chars · {lineCount}{" "}
            {lineCount === 1 ? "line" : "lines"}
          </span>
          {onFullscreenChange && (
            <button
              type="button"
              aria-label={isFullscreen ? "Exit fullscreen editor" : "Fullscreen editor"}
              title={isFullscreen ? "Exit fullscreen (F11)" : "Fullscreen (F11)"}
              onClick={() => {
                const next = !isFullscreen;
                setIsFullscreen(next);
                onFullscreenChange(next);
              }}
              className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                {isFullscreen ? (
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                ) : (
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                )}
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Code area: line numbers, highlight layer, textarea */}
      <div
        className="relative flex min-h-0 flex-1 bg-[#fafbfc]"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <div
          ref={lineNumbersRef}
          aria-hidden="true"
          className={[
            "shrink-0 select-none overflow-hidden border-r border-slate-200 bg-slate-50 px-2.5 py-3 text-right",
            fontClass,
            monoClass,
            "text-slate-400",
          ].join(" ")}
        >
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <pre
            ref={highlightRef}
            aria-hidden="true"
            className={[
              "pointer-events-none absolute inset-0 overflow-auto whitespace-pre px-3 py-3",
              fontClass,
              monoClass,
              "text-slate-800",
            ].join(" ")}
            style={{ tabSize: 2 }}
          >
            <code dangerouslySetInnerHTML={{ __html: highlighted }} />
          </pre>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={syncScroll}
            placeholder={placeholder}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={ariaLabel}
            className={[
              "absolute inset-0 resize-none overflow-auto whitespace-pre bg-transparent px-3 py-3",
              fontClass,
              monoClass,
              "text-transparent caret-emerald-700 outline-none placeholder:text-slate-400/70",
            ].join(" ")}
            style={{ tabSize: 2 }}
          />
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;
