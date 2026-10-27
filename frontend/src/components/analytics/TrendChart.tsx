import React, { useState } from "react";
import { EmptyChartState } from "./EmptyChartState";

export interface TrendPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

export interface TrendChartProps {
  title: string;
  subtitle?: string;
  data: TrendPoint[];
  valuePrefix?: string;
  valueSuffix?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  height?: number;
  color?: string;
}

export const TrendChart: React.FC<TrendChartProps> = ({
  title,
  subtitle,
  data = [],
  valuePrefix = "",
  valueSuffix = "",
  primaryLabel = "Value",
  secondaryLabel,
  height = 220,
  color = "#0f766e",
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        <div className="mt-4">
          <EmptyChartState
            title="No trend data recorded"
            message="Trend analysis requires at least two time-indexed records."
          />
        </div>
      </div>
    );
  }

  // Dimensions & padding
  const svgWidth = 600;
  const svgHeight = height;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const getX = (index: number) => {
    if (data.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (data.length - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    return paddingTop + chartHeight - ((val - minVal) / range) * chartHeight;
  };

  // Build SVG path
  const points = data.map((d, i) => `${getX(i)},${getY(d.value)}`);
  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${getX(data.length - 1)},${
    paddingTop + chartHeight
  } L ${getX(0)},${paddingTop + chartHeight} Z`;

  // Horizontal grid lines
  const gridTicks = [0, 0.25, 0.5, 0.75, 1];

  const activePoint = hoverIndex != null ? data[hoverIndex] : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {primaryLabel}
          </span>
          {secondaryLabel && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              {secondaryLabel}
            </span>
          )}
        </div>
      </div>

      <div className="relative mt-4 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {gridTicks.map((tick, i) => {
            const y = paddingTop + chartHeight - tick * chartHeight;
            const tickVal = Math.round(minVal + tick * range);
            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {valuePrefix}
                  {tickVal}
                  {valueSuffix}
                </text>
              </g>
            );
          })}

          {/* Area under curve */}
          <path
            d={areaPath}
            fill={`url(#gradient-${color.replace('#', '')})`}
          />

          {/* Line stroke */}
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points */}
          {data.map((d, i) => {
            const cx = getX(i);
            const cy = getY(d.value);
            const isHovered = hoverIndex === i;
            return (
              <g key={i}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 5 : 3.5}
                  fill="#ffffff"
                  stroke={color}
                  strokeWidth={isHovered ? 2.5 : 2}
                  className="transition-all cursor-pointer"
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex(null)}
                />
              </g>
            );
          })}

          {/* X Axis Labels */}
          {data.map((d, i) => {
            // Show every nth label if too many points
            const step = Math.ceil(data.length / 7);
            if (i % step !== 0 && i !== data.length - 1) return null;
            return (
              <text
                key={i}
                x={getX(i)}
                y={svgHeight - 10}
                textAnchor="middle"
                className="fill-slate-500 text-[10px]"
              >
                {d.label}
              </text>
            );
          })}

          {/* Hover indicator vertical bar */}
          {hoverIndex != null && (
            <line
              x1={getX(hoverIndex)}
              y1={paddingTop}
              x2={getX(hoverIndex)}
              y2={paddingTop + chartHeight}
              stroke="#cbd5e1"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          )}
        </svg>

        {/* Hover Tooltip Box */}
        {activePoint && hoverIndex != null && (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm text-xs"
            style={{
              left: `${(getX(hoverIndex) / svgWidth) * 100}%`,
            }}
          >
            <div className="font-bold text-slate-800">{activePoint.label}</div>
            <div className="font-semibold text-teal-700">
              {primaryLabel}: {valuePrefix}
              {activePoint.value.toLocaleString()}
              {valueSuffix}
            </div>
            {activePoint.secondaryValue != null && secondaryLabel && (
              <div className="text-slate-500 text-[11px]">
                {secondaryLabel}: {activePoint.secondaryValue.toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
