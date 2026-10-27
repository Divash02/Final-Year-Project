import React, { useState } from "react";
import { EmptyChartState } from "./EmptyChartState";

export interface AttendanceHeatmapProps {
  title?: string;
  subtitle?: string;
  records?: Array<{ date: string; rate: number; total: number }>;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export const AttendanceHeatmap: React.FC<AttendanceHeatmapProps> = ({
  title = "Attendance Activity Heatmap",
  subtitle = "Session density and attendance rate by weekday across institutional schedule.",
  records = [],
}) => {
  const [hoverCell, setHoverCell] = useState<{
    date: string;
    rate: number;
    total: number;
  } | null>(null);

  if (!records || records.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        <div className="mt-4">
          <EmptyChartState
            title="No session attendance records"
            message="Heatmap renders as teachers take attendance in classroom sessions."
          />
        </div>
      </div>
    );
  }

  // Create date lookup map
  const recordMap = new Map<string, { rate: number; total: number }>();
  for (const r of records) {
    recordMap.set(r.date, { rate: r.rate, total: r.total });
  }

  // Generate 8 weeks grid ending today
  const weeks: Array<Array<{ dateStr: string; dayIndex: number; data?: { rate: number; total: number } }>> = [];
  const today = new Date();
  
  for (let w = 7; w >= 0; w--) {
    const weekDays: Array<{ dateStr: string; dayIndex: number; data?: { rate: number; total: number } }> = [];
    for (let d = 0; d < 5; d++) {
      // 0 = Mon, 4 = Fri
      const targetDate = new Date(today);
      const currentDay = today.getDay(); // 0 is Sun, 1 is Mon
      const diffDays = (w * 7) + (currentDay === 0 ? 6 : currentDay - 1) - d;
      targetDate.setDate(today.getDate() - diffDays);
      const dateStr = targetDate.toISOString().split("T")[0];
      const data = recordMap.get(dateStr);
      weekDays.push({ dateStr, dayIndex: d, data });
    }
    weeks.push(weekDays);
  }

  const getIntensityColor = (data?: { rate: number; total: number }) => {
    if (!data || data.total === 0) return "bg-slate-100 hover:ring-1 hover:ring-slate-300";
    if (data.rate >= 90) return "bg-teal-700 text-white";
    if (data.rate >= 75) return "bg-teal-600 text-white";
    if (data.rate >= 60) return "bg-teal-400 text-white";
    if (data.rate >= 40) return "bg-amber-400 text-white";
    return "bg-rose-500 text-white";
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span>Lower</span>
          <span className="h-2.5 w-2.5 rounded bg-slate-100" />
          <span className="h-2.5 w-2.5 rounded bg-teal-400" />
          <span className="h-2.5 w-2.5 rounded bg-teal-600" />
          <span className="h-2.5 w-2.5 rounded bg-teal-700" />
          <span>Higher (90%+)</span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[420px]">
          <div className="grid grid-cols-6 gap-2">
            <div className="space-y-2 pt-1 text-[11px] font-semibold text-slate-400">
              {WEEKDAYS.map((day) => (
                <div key={day} className="h-6 flex items-center">
                  {day}
                </div>
              ))}
            </div>

            <div className="col-span-5 flex gap-2">
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className="flex-1 space-y-2">
                  {week.map((cell, cIdx) => (
                    <div
                      key={cIdx}
                      onMouseEnter={() =>
                        cell.data
                          ? setHoverCell({
                              date: cell.dateStr,
                              rate: cell.data.rate,
                              total: cell.data.total,
                            })
                          : null
                      }
                      onMouseLeave={() => setHoverCell(null)}
                      title={
                        cell.data
                          ? `${cell.dateStr}: ${cell.data.rate}% attendance (${cell.data.total} entries)`
                          : `${cell.dateStr}: No sessions marked`
                      }
                      className={`h-6 w-full rounded transition-all cursor-pointer flex items-center justify-center text-[10px] font-bold ${getIntensityColor(
                        cell.data
                      )}`}
                    >
                      {cell.data && cell.data.rate > 0 ? `${cell.data.rate}%` : ""}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {hoverCell && (
          <div className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-between">
            <span className="font-semibold text-slate-700">
              Date: <span className="font-bold text-slate-900">{hoverCell.date}</span>
            </span>
            <span className="font-bold text-teal-700">
              {hoverCell.rate}% Attendance ({hoverCell.total} records)
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
