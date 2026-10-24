import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDesktop,
  faTabletAlt,
  faMobileAlt,
  faExpand,
  faCircleCheck,
  faCircleXmark,
  faTriangleExclamation,
  faBroom,
} from "@fortawesome/free-solid-svg-icons";

export interface PlaygroundPreviewProps {
  html: string;
  css: string;
  javascript: string;
  /** Increments to re-render the preview (Run button). */
  runToken: number;
}

type ViewportPreset = "responsive" | "tablet" | "mobile";

const VIEWPORT_WIDTHS: Record<ViewportPreset, string> = {
  responsive: "100%",
  tablet: "768px",
  mobile: "390px",
};

interface ConsoleMessage {
  level: "log" | "info" | "warn" | "error" | "debug";
  args: string[];
}

/**
 * Isolated live preview for the HTML/CSS/JS playground.
 *
 * The preview renders inside an iframe with
 * `sandbox="allow-scripts"` — no `allow-same-origin`, so the
 * document has an opaque origin and cannot read CollegeOS
 * cookies, localStorage, auth tokens or the parent DOM.
 * Student JS never executes in the CollegeOS window.
 *
 * Console output and uncaught errors are captured inside the
 * iframe and forwarded to this component via postMessage with a
 * per-render secret, so only messages from our own preview are
 * accepted.
 */
export const PlaygroundPreview: React.FC<PlaygroundPreviewProps> = ({
  html,
  css,
  javascript,
  runToken,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewport, setViewport] = useState<ViewportPreset>("responsive");
  const [isExpanded, setIsExpanded] = useState(false);
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
  const secretRef = useRef("");

  const secret = useMemo(() => {
    const value = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    secretRef.current = value;
    return value;
    // regenerate on every run so stale iframes cannot inject messages
  }, [runToken]);

  const srcDoc = useMemo(() => {
    const captured = `
<script>
(function () {
  var secret = ${JSON.stringify(secret)};
  function send(level, args) {
    try {
      parent.postMessage({
        source: "collegeos-coding-preview",
        secret: secret,
        level: level,
        args: args.map(function (entry) {
          if (entry === null) return "null";
          if (entry === undefined) return "undefined";
          if (typeof entry === "object") {
            try { return JSON.stringify(entry, null, 2); }
            catch (error) { return String(entry); }
          }
          return String(entry);
        })
      }, "*");
    } catch (error) { /* parent unreachable */ }
  }
  ["log", "info", "warn", "error", "debug"].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      send(level, Array.prototype.slice.call(arguments));
      if (original) { try { original.apply(console, arguments); } catch (e) {} }
    };
  });
  window.addEventListener("error", function (event) {
    send("error", [
      (event.message || "Script error") +
        (event.filename ? " at " + event.filename : "") +
        (event.lineno ? ":" + event.lineno : "")
    ]);
  });
  window.addEventListener("unhandledrejection", function (event) {
    send("error", ["Uncaught promise rejection: " + (event.reason && event.reason.message ? event.reason.message : String(event.reason))]);
  });
})();
<\/script>`;

    return [
      "<!doctype html>",
      "<html>",
      "<head>",
      "<meta charset='utf-8'>",
      "<meta name='viewport' content='width=device-width, initial-scale=1'>",
      "<style>",
      css || "",
      "</style>",
      "</head>",
      "<body>",
      html || "",
      captured,
      "<script>",
      javascript || "",
      "<\/script>",
      "</body>",
      "</html>",
    ].join("\n");
  }, [html, css, javascript, secret]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (
        !data ||
        data.source !== "collegeos-coding-preview" ||
        data.secret !== secretRef.current
      ) {
        return;
      }
      setConsoleMessages((previous) => [
        ...previous.slice(-199),
        { level: data.level, args: data.args || [] },
      ]);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [secret]);

  useEffect(() => {
    setConsoleMessages([]);
  }, [runToken]);

  const levelIcon = (level: ConsoleMessage["level"]) => {
    switch (level) {
      case "error":
        return faCircleXmark;
      case "warn":
        return faTriangleExclamation;
      default:
        return faCircleCheck;
    }
  };

  const levelTone = (level: ConsoleMessage["level"]) => {
    switch (level) {
      case "error":
        return "text-red-300";
      case "warn":
        return "text-amber-300";
      case "info":
        return "text-sky-300";
      default:
        return "text-slate-200";
    }
  };

  const viewportButtons: Array<{
    preset: ViewportPreset;
    icon: typeof faDesktop;
    label: string;
  }> = [
    { preset: "responsive", icon: faDesktop, label: "Responsive width" },
    { preset: "tablet", icon: faTabletAlt, label: "Tablet width (768px)" },
    { preset: "mobile", icon: faMobileAlt, label: "Mobile width (390px)" },
  ];

  const previewFrame = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
        <span className="text-xs font-medium text-slate-600">
          Preview
        </span>
        <div className="flex items-center gap-1">
          {viewportButtons.map(({ preset, icon, label }) => (
            <button
              key={preset}
              type="button"
              aria-label={label}
              aria-pressed={viewport === preset}
              title={label}
              onClick={() => setViewport(preset)}
              className={`rounded p-1.5 ${
                viewport === preset
                  ? "bg-emerald-100 text-emerald-700"
                  : "text-slate-500 hover:bg-slate-200"
              }`}
            >
              <FontAwesomeIcon icon={icon} className="text-xs" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            aria-label={isExpanded ? "Exit expanded preview" : "Expand preview"}
            title={isExpanded ? "Exit expanded preview" : "Expand preview"}
            onClick={() => setIsExpanded((previous) => !previous)}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-200"
          >
            <FontAwesomeIcon icon={faExpand} className="text-xs" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-slate-100 p-2">
        <iframe
          ref={iframeRef}
          title="HTML, CSS and JavaScript preview"
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          className="h-full w-full rounded border border-slate-200 bg-white transition-[max-width] duration-200"
          style={{ maxWidth: VIEWPORT_WIDTHS[viewport] }}
        />
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-slate-800">
        <div className="flex h-8 items-center justify-between px-3">
          <span className="text-[11px] font-medium text-slate-400">
            Console
          </span>
          <button
            type="button"
            onClick={() => setConsoleMessages([])}
            aria-label="Clear preview console"
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          >
            <FontAwesomeIcon icon={faBroom} className="text-[11px]" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-32 min-h-0 overflow-auto px-3 pb-2 font-mono text-[11px] leading-relaxed">
          {consoleMessages.length === 0 ? (
            <p className="text-slate-500">
              console.log() output and runtime errors appear here.
            </p>
          ) : (
            consoleMessages.map((message, index) => (
              <p key={index} className={levelTone(message.level)}>
                <FontAwesomeIcon
                  icon={levelIcon(message.level)}
                  className="mr-1.5 text-[10px]"
                  aria-hidden="true"
                />
                {message.args.join(" ")}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );

  if (isExpanded) {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col bg-white p-3">
        {previewFrame}
      </div>
    );
  }
  return previewFrame;
};

export default PlaygroundPreview;
