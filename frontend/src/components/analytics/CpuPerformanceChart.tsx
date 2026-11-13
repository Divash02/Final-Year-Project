import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMicrochip,
  faServer,
  faChartLine,
  faFilter,
} from "@fortawesome/free-solid-svg-icons";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { Button } from "../ui/Button";
import { EmptyChartState } from "./EmptyChartState";
import type { CpuPerformanceHistoryResponse } from "../../services/analyticsApi";

interface CpuPerformanceChartProps {
  data: CpuPerformanceHistoryResponse;
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

export const CpuPerformanceChart: React.FC<CpuPerformanceChartProps> = ({
  data,
  loading,
  timeRange,
  onTimeRangeChange,
}) => {
  const [showHostCpu, setShowHostCpu] = useState(false);

  const processCpuData: TrendPoint[] = data.processCpu.map((d) => ({
    label: d.timestamp.slice(-5),
    value: d.avg,
    secondaryValue: d.max,
  }));

  const hostCpuData: TrendPoint[] = data.hostCpu.map((d) => ({
    label: d.timestamp.slice(-5),
    value: d.avg,
    secondaryValue: d.max,
  }));

  const getMaxCpu = () => {
    const processMax = Math.max(...data.processCpu.map((d) => d.max), 0);
    const hostMax = Math.max(...data.hostCpu.map((d) => d.max), 0);
    return Math.max(processMax, hostMax);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">CPU Performance</h3>
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
          <FontAwesomeIcon icon={faMicrochip} className="text-teal-700" />
          <h3 className="text-sm font-bold text-slate-900">CPU Performance</h3>
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
              checked={showHostCpu}
              onChange={(e) => setShowHostCpu(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Show Host CPU
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-center lg:col-span-1">
          <FontAwesomeIcon icon={faMicrochip} className="text-2xl text-teal-600 mx-auto" />
          <div className="text-3xl font-bold text-slate-900 mt-2">
            {data.processCpu.length > 0 ? data.processCpu[data.processCpu.length - 1].avg.toFixed(1) : 0}%
          </div>
          <div className="text-xs text-slate-500">Current Process CPU</div>
          <div className="text-xs text-slate-400 mt-1">
            Max: {data.processCpu.length > 0 ? data.processCpu[data.processCpu.length - 1].max.toFixed(1) : 0}%
          </div>
        </div>

        {showHostCpu && data.hostCpu.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-center lg:col-span-1">
            <FontAwesomeIcon icon={faServer} className="text-2xl text-blue-600 mx-auto" />
            <div className="text-3xl font-bold text-slate-900 mt-2">
              {data.hostCpu[data.hostCpu.length - 1].avg.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500">Current Host CPU</div>
            <div className="text-xs text-slate-400 mt-1">
              Max: {data.hostCpu[data.hostCpu.length - 1].max.toFixed(1)}%
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-center lg:col-span-1">
          <FontAwesomeIcon icon={faChartLine} className="text-2xl text-amber-600 mx-auto" />
          <div className="text-3xl font-bold text-slate-900 mt-2">{getMaxCpu().toFixed(1)}%</div>
          <div className="text-xs text-slate-500">Peak CPU (Period)</div>
          <div className="text-xs text-slate-400 mt-1">
            Avg: {data.processCpu.length > 0
              ? (data.processCpu.reduce((sum, d) => sum + d.avg, 0) / data.processCpu.length).toFixed(1)
              : 0}%
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <TrendChart
          title={showHostCpu ? "Process & Host CPU Usage" : "Process CPU Usage"}
          subtitle="CPU utilization percentage over time. Green: Healthy (0-60%), Yellow: Warning (61-80%), Red: Critical (>80%)."
          data={showHostCpu && data.hostCpu.length > 0 ? hostCpuData : processCpuData}
          valueSuffix="%"
          primaryLabel="CPU %"
          secondaryLabel="Max CPU %"
          color="#0f766e"
          height={300}
        />
      </div>

      {showHostCpu && data.hostCpu.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs mt-4">
          <TrendChart
            title="Host CPU Usage"
            subtitle="System-level CPU utilization (may be unavailable in containers)."
            data={hostCpuData}
            valueSuffix="%"
            primaryLabel="Host CPU %"
            secondaryLabel="Max Host CPU %"
            color="#0284c7"
            height={250}
          />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h4 className="text-sm font-bold text-slate-900 mb-3">CPU Thresholds</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="font-medium text-green-800">Healthy: 0-60%</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="font-medium text-amber-800">Warning: 61-80%</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="font-medium text-red-800">Critical: >80%</span>
          </div>
        </div>
      </div>
    </div>
  );
};