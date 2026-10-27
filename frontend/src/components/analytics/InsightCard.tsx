import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTriangleExclamation,
  faCircleInfo,
  faCheckCircle,
  faArrowRight,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";

export interface InstitutionalInsight {
  level: "warning" | "info" | "success" | "alert";
  category: string;
  title: string;
  message: string;
  evidence: string;
  targetTab?: string;
}

export interface InsightCardProps {
  insights: InstitutionalInsight[];
  onNavigateTab?: (tab: string) => void;
}

export const InsightCard: React.FC<InsightCardProps> = ({
  insights = [],
  onNavigateTab,
}) => {
  if (!insights || insights.length === 0) {
    return null;
  }

  const getLevelStyles = (level: InstitutionalInsight["level"]) => {
    switch (level) {
      case "warning":
        return {
          border: "border-amber-200",
          bg: "bg-amber-50/60",
          iconBg: "bg-amber-100 text-amber-800",
          icon: faTriangleExclamation,
          badge: "bg-amber-100 text-amber-800",
        };
      case "alert":
        return {
          border: "border-rose-200",
          bg: "bg-rose-50/60",
          iconBg: "bg-rose-100 text-rose-800",
          icon: faShieldHalved,
          badge: "bg-rose-100 text-rose-800",
        };
      case "success":
        return {
          border: "border-teal-200",
          bg: "bg-teal-50/60",
          iconBg: "bg-teal-100 text-teal-800",
          icon: faCheckCircle,
          badge: "bg-teal-100 text-teal-800",
        };
      default:
        return {
          border: "border-sky-200",
          bg: "bg-sky-50/60",
          iconBg: "bg-sky-100 text-sky-800",
          icon: faCircleInfo,
          badge: "bg-sky-100 text-sky-800",
        };
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Institutional Intelligence &amp; Advisory Insights
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Deterministic observations derived from live academic, examination, and financial records.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
          {insights.length} Signals
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {insights.map((ins, idx) => {
          const style = getLevelStyles(ins.level);

          return (
            <div
              key={idx}
              className={`flex flex-col justify-between rounded-lg border p-3.5 transition ${style.border} ${style.bg}`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.badge}`}
                  >
                    {ins.category}
                  </span>
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full ${style.iconBg}`}
                  >
                    <FontAwesomeIcon icon={style.icon} className="text-xs" />
                  </div>
                </div>

                <h4 className="text-xs font-bold text-slate-900">
                  {ins.title}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {ins.message}
                </p>
              </div>

              <div className="mt-3 border-t border-slate-200/60 pt-2 flex items-center justify-between gap-2 text-[11px]">
                <span className="font-mono text-slate-500 truncate" title={ins.evidence}>
                  Evidence: {ins.evidence}
                </span>

                {ins.targetTab && onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab(ins.targetTab!)}
                    className="flex items-center gap-1 font-bold text-teal-800 hover:text-teal-950 transition shrink-0"
                  >
                    <span>View</span>
                    <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
