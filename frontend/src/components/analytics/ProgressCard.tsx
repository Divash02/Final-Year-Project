import React from "react";

export interface ProgressMetric {
  label: string;
  current: number;
  total: number;
  prefix?: string;
  suffix?: string;
  color?: string;
}

export interface ProgressCardProps {
  title: string;
  subtitle?: string;
  metrics: ProgressMetric[];
  footerNote?: string;
}

export const ProgressCard: React.FC<ProgressCardProps> = ({
  title,
  subtitle,
  metrics = [],
  footerNote,
}) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {metrics.map((m, idx) => {
          const percent =
            m.total > 0 ? Math.min(100, Math.round((m.current / m.total) * 100)) : 100;
          const barColor =
            m.color ||
            (percent >= 80 ? "#0f766e" : percent >= 50 ? "#d97706" : "#e11d48");

          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">{m.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-900 font-bold">
                    {m.prefix || ""}
                    {m.current.toLocaleString()}
                    {m.suffix || ""}{" "}
                    <span className="text-slate-400 font-normal">
                      / {m.prefix || ""}
                      {m.total.toLocaleString()}
                      {m.suffix || ""}
                    </span>
                  </span>
                  <span
                    className="font-bold text-xs w-11 text-right"
                    style={{ color: barColor }}
                  >
                    {percent}%
                  </span>
                </div>
              </div>

              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${percent}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {footerNote && (
        <div className="mt-4 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          {footerNote}
        </div>
      )}
    </div>
  );
};
