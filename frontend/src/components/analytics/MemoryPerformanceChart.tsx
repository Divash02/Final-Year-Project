import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMemory,
  faServer,
  faChartLine,
  faFilter,
} from "@fortawesome/free-solid-svg-icons";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { EmptyChartState } from "./EmptyChartState";
import type { MemoryPerformanceHistoryResponse } from "../../services/analyticsApi";

interface MemoryPerformanceChartProps {
  data: MemoryPerformanceHistoryResponse;
  loading?: boolean;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
}

const timeRanges = [
  { value: "1h", label: "Last Hour" },
  { value: "6h", label: "Last 6 Hours" },
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
];

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const MemoryPerformanceChart: React.FC<MemoryPerformanceChartProps> = ({
  data,
  loading,
  timeRange,
  onTimeRangeChange,
}) => {
  const [showHostMem, setShowHostMem] = useState(false);

  const processMemData: TrendPoint[] = data.processMemory.map((d) => ({
    label: d.timestamp.slice(-5),
    value: d.avgUsage,
    secondaryValue: d.maxUsage,
  }));

  const hostMemData: TrendPoint[] = data.hostMemory.map((d) => ({
    label: d.timestamp.slice(-5),
    value: d.avgUsage,
    secondaryValue: d.maxUsage,
  }));

  const getCurrentProcessMem = () => data.processMemory[data.processMemory.length - 1];
  const getCurrentHostMem = () => data.hostMemory[data.hostMemory.length - 1];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Memory Performance</h3>
          <div className="flex items-center gap-2">
            <select
              value={timeRange}
              onChange={(e) => onTimeRangeChange(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              {timeRanges.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
        <div className="h-64 rounded-xl border border-slate-200 bg-white p-5 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faMemory} className="text-teal-700" />
          <h3 className="text-sm font-bold text-slate-900">Memory Performance</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={timeRange}
            onChange={(e) => onTimeRangeChange(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          >
            {timeRanges.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={showHostMem}
              onChange={(e) => setShowHostMem(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Show Host Memory
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-center">
          <FontAwesomeIcon icon={faMemory} className="text-2xl text-teal-600 mx-auto" />
          <div className="text-3xl font-bold text-slate-900 mt-2">
            {getCurrentProcessMem()?.avgUsage.toFixed(1) ?? 0}%
          </div>
          <div className="text-xs text-slate-500">Process Heap Usage</div>
          <div className="text-xs text-slate-400 mt-1">
            {getCurrentProcessMem()
              ? `${formatBytes(getCurrentProcessMem().avgUsed)} / ${formatBytes(getCurrentProcessMem().avgTotal)}`
              : "N/A"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-center">
          <FontAwesomeIcon icon={faChartLine} className="text-2xl text-amber-600 mx-auto" />
          <div className="text-3xl font-bold text-slate-900 mt-2">
            {data.processMemory.length > 0
              ? Math.max(...data.processMemory.map((d) => d.maxUsage)).toFixed(1)
              : 0}%
          </div>
          <div className="text-xs text-slate-500">Peak Process Memory</div>
          <div className="text-xs text-slate-400 mt-1">
            Avg: {data.processMemory.length > 0
              ? (data.processMemory.reduce((sum, d) => sum + d.avgUsage, 0) / data.processMemory.length).toFixed(1)
              : 0}%
          </div>
        </div>

        {showHostMem && getCurrentHostMem() && (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-center">
              <FontAwesomeIcon icon={faServer} className="text-2xl text-blue-600 mx-auto" />
              <div className="text-3xl font-bold text-slate-900 mt-2">
                {getCurrentHostMem()!.avgUsage.toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">Host Memory Usage</div>
              <div className="text-xs text-slate-400 mt-1">
                {formatBytes(getCurrentHostMem()!.avgUsed)} / {formatBytes(getCurrentHostMem()!.avgTotal)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-center">
              <FontAwesomeIcon icon={faChartLine} className="text-2xl text-purple-600 mx-auto" />
              <div className="text-3xl font-bold text-slate-900 mt-2">
                {Math.max(...data.hostMemory.map((d) => d.maxUsage)).toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">Peak Host Memory</div>
              <div className="text-xs text-slate-400 mt-1">
                Avg: {(data.hostMemory.reduce((sum, d) => sum + d.avgUsage, 0) / data.hostMemory.length).toFixed(1)}%
              </div>
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <TrendChart
          title={showHostMem ? "Process & Host Memory Usage" : "Process Memory Usage"}
          subtitle="Memory utilization percentage over time. Green: Healthy (0-70%), Yellow: Warning (71-85%), Red: Critical (>85%)."
          data={processMemData}
          valueSuffix="%"
          primaryLabel="Memory %"
          secondaryLabel="Max Memory %"
          color="#0f766e"
          height={300}
        />
      </div>

      {showHostMem && data.hostMemory.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs mt-4">
          <TrendChart
            title="Host Memory Usage"
            subtitle="System-level memory utilization (may be unavailable in containers)."
            data={hostMemData}
            valueSuffix="%"
            primaryLabel="Host Memory %"
            secondaryLabel="Max Host Memory %"
            color="#0284c7"
            height={250}
          />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h4 className="text-sm font-bold text-slate-900 mb-3">Memory Thresholds</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="font-medium text-green-800">Healthy: 0-70%</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="font-medium text-amber-800">Warning: 71-85%</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="font-medium text-red-800">Critical: &gt;85%</span>
          </div>
        </div>
      </div>
    </div>
  );
};