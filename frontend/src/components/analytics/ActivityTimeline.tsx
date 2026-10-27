import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faExclamationCircle,
  faTriangleExclamation,
  faShieldHalved,
  faUser,
} from "@fortawesome/free-solid-svg-icons";

export interface TimelineEvent {
  id: string;
  timestamp: string;
  action: string;
  module?: string;
  resource?: string;
  details?: string;
  actorName?: string;
  actorRole?: string;
  status?: "success" | "failed" | "warning";
  ipAddress?: string;
  onClick?: () => void;
}

export interface ActivityTimelineProps {
  title?: string;
  subtitle?: string;
  events: TimelineEvent[];
  onSelectEvent?: (event: TimelineEvent) => void;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  title = "Institutional Activity Timeline",
  subtitle = "Chronological record of recent administrative and academic actions.",
  events = [],
  onSelectEvent,
}) => {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        <div className="py-8 text-center text-xs text-slate-400">
          No institutional activity recorded yet.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="mt-4 relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 space-y-4">
        {events.map((evt) => {
          const isFailed =
            evt.status === "failed" ||
            /FAIL|ERROR|BLOCK|DENIED|REJECT/i.test(evt.action);
          const isWarning = evt.status === "warning";

          const statusColor = isFailed
            ? "bg-rose-500 text-white"
            : isWarning
            ? "bg-amber-500 text-white"
            : "bg-teal-600 text-white";

          const formattedTime = new Date(evt.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const formattedDate = new Date(evt.timestamp).toLocaleDateString([], {
            month: "short",
            day: "numeric",
          });

          return (
            <div
              key={evt.id}
              onClick={() => onSelectEvent?.(evt)}
              className={`relative flex flex-col sm:flex-row sm:items-start justify-between gap-2 p-3 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50/80 transition ${
                onSelectEvent ? "cursor-pointer" : ""
              }`}
            >
              {/* Node point on the line */}
              <div
                className={`absolute -left-[1.85rem] top-3 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white ${statusColor}`}
              >
                <FontAwesomeIcon
                  icon={
                    isFailed
                      ? faExclamationCircle
                      : isWarning
                      ? faTriangleExclamation
                      : faCheckCircle
                  }
                  className="text-[9px]"
                />
              </div>

              {/* Main Event Content */}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-xs text-slate-900">
                    {evt.action}
                  </span>
                  {evt.module && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono uppercase text-slate-600">
                      {evt.module}
                    </span>
                  )}
                  {isFailed && (
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                      Failed
                    </span>
                  )}
                </div>

                {evt.details && (
                  <p className="text-xs text-slate-600 max-w-xl">{evt.details}</p>
                )}

                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1 font-medium text-slate-700">
                    <FontAwesomeIcon icon={faUser} className="text-[9px]" />
                    {evt.actorName || "System Actor"}
                  </span>
                  {evt.actorRole && (
                    <span>· {evt.actorRole}</span>
                  )}
                  {evt.ipAddress && (
                    <span>· {evt.ipAddress}</span>
                  )}
                </div>
              </div>

              {/* Timestamp */}
              <div className="text-right shrink-0">
                <span className="font-mono text-xs font-semibold text-slate-700">
                  {formattedTime}
                </span>
                <span className="block text-[10px] text-slate-400">
                  {formattedDate}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
