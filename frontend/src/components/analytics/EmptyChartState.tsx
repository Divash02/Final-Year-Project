import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine, faFolderOpen } from "@fortawesome/free-solid-svg-icons";

interface EmptyChartStateProps {
  title?: string;
  message?: string;
  height?: string;
}

export const EmptyChartState: React.FC<EmptyChartStateProps> = ({
  title = "No historical data available",
  message = "Visualizations populate as records and student activity are recorded.",
  height = "h-56",
}) => {
  return (
    <div
      className={`flex ${height} flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center`}
    >
      <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <FontAwesomeIcon icon={faChartLine} className="text-base" />
      </div>
      <h4 className="text-xs font-bold text-slate-700">{title}</h4>
      <p className="mt-1 max-w-xs text-[11px] text-slate-500">{message}</p>
    </div>
  );
};

export const ChartSkeleton: React.FC<{ height?: string }> = ({
  height = "h-56",
}) => {
  return (
    <div
      className={`flex ${height} w-full animate-pulse flex-col justify-end gap-2 rounded-lg bg-slate-100/80 p-6`}
    >
      <div className="flex items-end justify-between gap-3 h-full">
        <div className="w-8 rounded-t bg-slate-200 h-2/5" />
        <div className="w-8 rounded-t bg-slate-200 h-3/5" />
        <div className="w-8 rounded-t bg-slate-200 h-4/5" />
        <div className="w-8 rounded-t bg-slate-200 h-1/2" />
        <div className="w-8 rounded-t bg-slate-200 h-3/4" />
        <div className="w-8 rounded-t bg-slate-200 h-2/3" />
      </div>
      <div className="h-2 w-full rounded bg-slate-200" />
    </div>
  );
};
