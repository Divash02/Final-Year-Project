import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faArrowTrendUp,
  faArrowTrendDown,
  faMinus,
} from "@fortawesome/free-solid-svg-icons";

export interface AnalyticsKpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: IconDefinition;
  trendPercentage?: number | null;
  trendComparisonLabel?: string;
  sparklineData?: number[];
  tone?: "primary" | "teal" | "warning" | "danger" | "neutral";
  onClick?: () => void;
}

export const AnalyticsKpiCard: React.FC<AnalyticsKpiCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trendPercentage,
  trendComparisonLabel,
  sparklineData = [],
  tone = "primary",
  onClick,
}) => {
  // Sparkline SVG generator
  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length < 2) return null;
    const min = Math.min(...sparklineData);
    const max = Math.max(...sparklineData);
    const range = max - min || 1;
    const width = 64;
    const height = 24;

    const points = sparklineData
      .map((val, idx) => {
        const x = (idx / (sparklineData.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return (
      <svg
        className="overflow-visible h-6 w-16"
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      >
        <polyline
          fill="none"
          stroke={
            trendPercentage && trendPercentage > 0
              ? "#0d9488"
              : trendPercentage && trendPercentage < 0
              ? "#e11d48"
              : "#0284c7"
          }
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  const toneBorder =
    tone === "teal"
      ? "hover:border-teal-300"
      : tone === "warning"
      ? "hover:border-amber-300"
      : tone === "danger"
      ? "hover:border-rose-300"
      : "hover:border-slate-300";

  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition ${toneBorder} ${
        onClick ? "cursor-pointer hover:shadow-md" : ""
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {title}
          </span>
          {icon && (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <FontAwesomeIcon icon={icon} className="text-xs" />
            </div>
          )}
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-3">
          <div className="text-2xl font-bold tracking-tight text-slate-900">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
          {renderSparkline()}
        </div>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-2.5 text-[11px]">
        {trendPercentage != null ? (
          <div className="flex items-center gap-1.5 font-medium">
            <span
              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                trendPercentage > 0
                  ? "bg-teal-50 text-teal-700"
                  : trendPercentage < 0
                  ? "bg-rose-50 text-rose-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              <FontAwesomeIcon
                icon={
                  trendPercentage > 0
                    ? faArrowTrendUp
                    : trendPercentage < 0
                    ? faArrowTrendDown
                    : faMinus
                }
                className="text-[9px]"
              />
              {trendPercentage > 0 ? `+${trendPercentage}%` : `${trendPercentage}%`}
            </span>
            <span className="text-slate-500 truncate">
              {trendComparisonLabel || "vs previous period"}
            </span>
          </div>
        ) : (
          <p className="text-slate-500 truncate">
            {subtitle || "Historical comparison unavailable."}
          </p>
        )}
      </div>
    </div>
  );
};
