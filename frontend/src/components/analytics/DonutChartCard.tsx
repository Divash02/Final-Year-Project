import React, { useState } from "react";
import { EmptyChartState } from "./EmptyChartState";

export interface DonutSegment {
  label: string;
  value: number;
  color?: string;
}

export interface DonutChartCardProps {
  title: string;
  subtitle?: string;
  segments: DonutSegment[];
  centerLabel?: string;
  centerValue?: string | number;
}

const DEFAULT_COLORS = [
  "#0f766e", // teal-700
  "#0284c7", // sky-600
  "#f59e0b", // amber-500
  "#6366f1", // indigo-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#64748b", // slate-500
  "#e11d48", // rose-600
];

export const DonutChartCard: React.FC<DonutChartCardProps> = ({
  title,
  subtitle,
  segments = [],
  centerLabel,
  centerValue,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const total = segments.reduce((acc, s) => acc + s.value, 0);

  if (!segments || segments.length === 0 || total === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        <div className="mt-4">
          <EmptyChartState
            title="No distribution data"
            message="No categorization records exist for this period."
          />
        </div>
      </div>
    );
  }

  // Calculate SVG stroke dashes for circle radius = 40
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let accumulatedOffset = 0;

  const segmentArcs = segments.map((seg, idx) => {
    const fraction = total > 0 ? seg.value / total : 0;
    const strokeDasharray = `${fraction * circumference} ${circumference}`;
    const strokeDashoffset = -accumulatedOffset;
    accumulatedOffset += fraction * circumference;
    const color = seg.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];

    return {
      ...seg,
      strokeDasharray,
      strokeDashoffset,
      color,
      percent: Math.round(fraction * 100),
    };
  });

  const activeSegment = hoverIndex != null ? segmentArcs[hoverIndex] : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-6">
        {/* Donut Circle SVG */}
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            {segmentArcs.map((arc, idx) => (
              <circle
                key={idx}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={hoverIndex === idx ? "14" : "11"}
                strokeDasharray={arc.strokeDasharray}
                strokeDashoffset={arc.strokeDashoffset}
                className="transition-all duration-200 cursor-pointer"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            ))}
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-base font-bold text-slate-900">
              {activeSegment
                ? activeSegment.value.toLocaleString()
                : centerValue != null
                ? centerValue
                : total.toLocaleString()}
            </span>
            <span className="text-[10px] uppercase font-bold text-slate-400">
              {activeSegment
                ? activeSegment.label
                : centerLabel || "Total"}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 w-full space-y-2">
          {segmentArcs.map((arc, idx) => (
            <div
              key={idx}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
              className={`flex items-center justify-between text-xs p-1.5 rounded-lg transition cursor-pointer ${
                hoverIndex === idx ? "bg-slate-50 font-bold" : "text-slate-600"
              }`}
            >
              <div className="flex items-center gap-2 truncate max-w-[65%]">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: arc.color }}
                />
                <span className="truncate">{arc.label}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="font-semibold text-slate-800">
                  {arc.value.toLocaleString()}
                </span>
                <span className="text-slate-400 w-9 text-right">
                  {arc.percent}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
