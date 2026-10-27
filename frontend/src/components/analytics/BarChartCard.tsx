import React, { useState } from "react";
import { EmptyChartState } from "./EmptyChartState";

export interface BarChartItem {
  label: string;
  value: number;
  color?: string;
  secondaryText?: string;
}

export interface BarChartCardProps {
  title: string;
  subtitle?: string;
  items: BarChartItem[];
  layout?: "horizontal" | "vertical";
  valuePrefix?: string;
  valueSuffix?: string;
  maxItems?: number;
}

export const BarChartCard: React.FC<BarChartCardProps> = ({
  title,
  subtitle,
  items = [],
  layout = "horizontal",
  valuePrefix = "",
  valueSuffix = "",
  maxItems = 8,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const displayItems = items.slice(0, maxItems);
  const maxValue = Math.max(...displayItems.map((i) => i.value), 1);
  const totalValue = displayItems.reduce((acc, i) => acc + i.value, 0);

  if (!displayItems || displayItems.length === 0 || totalValue === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        <div className="mt-4">
          <EmptyChartState
            title="No records to compare"
            message="Categories will render as institutional records are recorded."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        <span className="text-[11px] font-semibold text-slate-500">
          Total: {valuePrefix}
          {totalValue.toLocaleString()}
          {valueSuffix}
        </span>
      </div>

      {layout === "horizontal" ? (
        <div className="mt-4 space-y-3">
          {displayItems.map((item, idx) => {
            const pct = Math.round((item.value / maxValue) * 100);
            const totalPct = totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0;
            const barColor = item.color || "#0f766e";
            const isHovered = hoverIndex === idx;

            return (
              <div
                key={idx}
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                className="group cursor-default"
              >
                <div className="flex items-center justify-between gap-2 text-xs mb-1">
                  <span className="font-semibold text-slate-700 truncate max-w-[65%]">
                    {item.label}
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="font-bold text-slate-900">
                      {valuePrefix}
                      {item.value.toLocaleString()}
                      {valueSuffix}
                    </span>
                    <span className="text-slate-400">({totalPct}%)</span>
                  </div>
                </div>

                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: barColor,
                      opacity: hoverIndex == null || isHovered ? 1 : 0.6,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Vertical Bar Chart */
        <div className="mt-6 flex items-end justify-between gap-3 h-48 border-b border-slate-200 pb-2">
          {displayItems.map((item, idx) => {
            const heightPct = Math.round((item.value / maxValue) * 100);
            const isHovered = hoverIndex === idx;
            const barColor = item.color || "#0f766e";

            return (
              <div
                key={idx}
                className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              >
                {/* Tooltip on hover */}
                {isHovered && (
                  <div className="absolute -top-7 whitespace-nowrap rounded bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm z-10">
                    {valuePrefix}
                    {item.value.toLocaleString()}
                    {valueSuffix}
                  </div>
                )}

                <div
                  className="w-full max-w-[2.5rem] rounded-t transition-all duration-200"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: barColor,
                    opacity: hoverIndex == null || isHovered ? 1 : 0.65,
                  }}
                />

                <span className="mt-2 text-[10px] font-semibold text-slate-600 truncate max-w-full text-center">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
