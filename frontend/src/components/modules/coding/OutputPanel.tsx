import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faCircleXmark,
  faTriangleExclamation,
  faClock,
  faSpinner,
  faTerminal,
  faKeyboard,
  faCopy,
  faBroom,
} from "@fortawesome/free-solid-svg-icons";
import type { ExecutionResult, ExecutionStatus } from "./codingTypes";

export interface OutputPanelProps {
  /** Latest execution result, null while idle. */
  execution: ExecutionResult | null;
  running: boolean;
  stdin: string;
  onStdinChange: (value: string) => void;
  onClear: () => void;
  unavailableMessage?: string | null;
}

const STATUS_META: Record<
  ExecutionStatus,
  { label: string; icon: typeof faCircleCheck; tone: string }
> = {
  QUEUED: {
    label: "Queued",
    icon: faClock,
    tone: "text-slate-500",
  },
  PROCESSING: {
    label: "Running",
    icon: faSpinner,
    tone: "text-sky-600",
  },
  ACCEPTED: {
    label: "Completed",
    icon: faCircleCheck,
    tone: "text-emerald-600",
  },
  FAILED: {
    label: "Error",
    icon: faCircleXmark,
    tone: "text-red-600",
  },
  TIMEOUT: {
    label: "Time limit exceeded",
    icon: faClock,
    tone: "text-amber-600",
  },
  PROVIDER_ERROR: {
    label: "Execution service error",
    icon: faTriangleExclamation,
    tone: "text-red-600",
  },
};

/**
 * Console panel: execution status, stdout, stderr, compiler
 * output, resource metrics, standard input and copy/clear
 * actions. Output is rendered as plain text — never as HTML —
 * so a program cannot inject markup into the lab.
 */
export const OutputPanel: React.FC<OutputPanelProps> = ({
  execution,
  running,
  stdin,
  onStdinChange,
  onClear,
  unavailableMessage,
}) => {
  const [copied, setCopied] = useState(false);
  const stdoutRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (stdoutRef.current) {
      stdoutRef.current.scrollTop = stdoutRef.current.scrollHeight;
    }
  }, [execution?.stdout, execution?.stderr, execution?.compileOutput]);

  const meta = execution ? STATUS_META[execution.status] || STATUS_META.FAILED : null;

  const copyOutput = async () => {
    if (!execution) return;
    const text = [
      execution.compileOutput,
      execution.stdout,
      execution.stderr,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable; output remains selectable */
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-700/60 bg-slate-800 px-3">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon
            icon={faTerminal}
            className="text-xs text-slate-400"
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-slate-200">Console</span>
          {meta && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}
            >
              <FontAwesomeIcon
                icon={meta.icon}
                className={execution?.status === "PROCESSING" ? "animate-spin" : ""}
                aria-hidden="true"
              />
              {meta.label}
              {execution?.description ? ` · ${execution.description}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {execution && (
            <button
              type="button"
              onClick={copyOutput}
              aria-label="Copy console output"
              title="Copy output"
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            >
              <FontAwesomeIcon
                icon={copied ? faCircleCheck : faCopy}
                className="text-xs"
                aria-hidden="true"
              />
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear console"
            title="Clear console"
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          >
            <FontAwesomeIcon icon={faBroom} className="text-xs" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed">
        {unavailableMessage && !execution && (
          <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-amber-300">
            {unavailableMessage}
          </p>
        )}
        {!execution && !unavailableMessage && !running && (
          <p className="text-slate-500">
            Run your program to see its output here. Stdout, stderr,
            compiler messages and resource usage appear in this console.
          </p>
        )}
        {running && !execution && (
          <p className="flex items-center gap-2 text-slate-400">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin" aria-hidden="true" />
            Sending your program to the execution service…
          </p>
        )}

        {execution?.compileOutput ? (
          <section aria-label="Compiler output">
            <p className="text-slate-500">— compiler output —</p>
            <pre className="whitespace-pre-wrap text-amber-300/90">
              {execution.compileOutput}
            </pre>
          </section>
        ) : null}

        {execution?.stdout ? (
          <section aria-label="Program output">
            <p className="text-slate-500">— stdout —</p>
            <pre ref={stdoutRef} className="whitespace-pre-wrap text-slate-100">
              {execution.stdout}
            </pre>
          </section>
        ) : null}

        {execution?.stderr ? (
          <section aria-label="Program errors">
            <p className="text-slate-500">— stderr —</p>
            <pre className="whitespace-pre-wrap text-red-300">
              {execution.stderr}
            </pre>
          </section>
        ) : null}

        {execution && execution.status === "ACCEPTED" && !execution.stdout && (
          <p className="text-slate-400">(program produced no output)</p>
        )}

        {execution?.message ? (
          <p className="mt-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300">
            {execution.message}
          </p>
        ) : null}

        {execution && (
          <p className="mt-2 border-t border-slate-700/60 pt-1.5 text-[11px] text-slate-400">
            {execution.durationMs !== null && execution.durationMs !== undefined
              ? `${execution.durationMs} ms`
              : "duration n/a"}{" "}
            ·{" "}
            {execution.memoryKb !== null && execution.memoryKb !== undefined
              ? `${(execution.memoryKb / 1024).toFixed(1)} MiB`
              : "memory n/a"}{" "}
            · exit{" "}
            {execution.exitCode !== null && execution.exitCode !== undefined
              ? execution.exitCode
              : "—"}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-700/60 bg-slate-800">
        <div className="flex items-center gap-1.5 px-3 pt-1.5">
          <FontAwesomeIcon
            icon={faKeyboard}
            className="text-[11px] text-slate-400"
            aria-hidden="true"
          />
          <label
            htmlFor="coding-stdin"
            className="text-[11px] font-medium text-slate-400"
          >
            Standard input (stdin)
          </label>
        </div>
        <textarea
          id="coding-stdin"
          value={stdin}
          onChange={(event) => onStdinChange(event.target.value)}
          rows={2}
          placeholder="Input your program reads via input() / scanf() / cin >>"
          aria-label="Standard input"
          className="w-full resize-none bg-slate-900 px-3 pb-2 font-mono text-xs text-slate-100 outline-none placeholder:text-slate-500"
        />
      </div>
    </div>
  );
};

export default OutputPanel;
