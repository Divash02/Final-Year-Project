import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTachometerAlt,
  faChartLine,
  faFilter,
  faExclamationTriangle,
} from "@fortawesome/free-solid-svg-icons";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { EmptyChartState } from "./EmptyChartState";
import { Badge } from "../ui/Badge";
import type { ApiPerformanceHistoryResponse } from "../../services/analyticsApi";

interface ApiPerformanceChartProps {
  data: ApiPerformanceHistoryResponse;
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

export const ApiPerformanceChart: React.FC<ApiPerformanceChartProps> = ({
  data,
  loading,
  timeRange,
  onTimeRangeChange,
}) => {
  const [metric, setMetric] = useState<"avg" | "p50" | "p95" | "p99">("avg");

  const metricData: Record<string, TrendPoint[]> = {
    avg: data.timeline.map((d) => ({ label: d.timestamp.slice(-5), value: d.avgResponse, secondaryValue: d.maxResponse })),
    p50: data.timeline.map((d) => ({ label: d.timestamp.slice(-5), value: d.p50 })),
    p95: data.timeline.map((d) => ({ label: d.timestamp.slice(-5), value: d.p95 })),
    p99: data.timeline.map((d) => ({ label: d.timestamp.slice(-5), value: d.p99 })),
  };

  const errorRateData: TrendPoint[] = data.timeline.map((d) => ({
    label: d.timestamp.slice(-5),
    value: d.errorRate,
  }));

  const requestsData: TrendPoint[] = data.timeline.map((d) => ({
    label: d.timestamp.slice(-5),
    value: d.requestsPerMinute,
  }));

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">API Performance</h3>
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

  const latest = data.timeline[data.timeline.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faTachometerAlt} className="text-teal-700" />
          <h3 className="text-sm font-bold text-slate-900">API Performance</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={timeRange}
            onChange={(e) => onTimeRangeChange(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          >
            {timeRanges.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
            {(["avg", "p50", "p95", "p99"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-2 py-1 rounded text-xs font-medium transition ${
                  metric === m
                    ? "bg-teal-100 text-teal-800"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-center">
          <div className="text-2xl font-bold text-slate-900">{latest?.avgResponse ?? 0}ms</div>
          <div className="text-xs text-slate-500">Avg Response</div>
          <div className="text-xs text-slate-400 mt-1">Max: {latest?.maxResponse ?? 0}ms</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-center">
          <div className="text-2xl font-bold text-slate-900">{latest?.p95 ?? 0}ms</div>
          <div className="text-xs text-slate-500">P95 Latency</div>
          <div className="text-xs text-slate-400 mt-1">P99: {latest?.p99 ?? 0}ms</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-center">
          <div className={`text-2xl font-bold ${latest && latest.errorRate > 5 ? "text-red-600" : latest && latest.errorRate > 1 ? "text-amber-600" : "text-teal-600"}`}>
            {latest?.errorRate.toFixed(2) ?? 0}%
          </div>
          <div className="text-xs text-slate-500">Error Rate</div>
          <div className="text-xs text-slate-400 mt-1">Slow: {latest?.slowRequests ?? 0}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs text-center">
          <div className="text-2xl font-bold text-slate-900">{latest?.requestsPerMinute.toLocaleString() ?? 0}</div>
          <div className="text-xs text-slate-500">Requests/min</div>
          <div className="text-xs text-slate-400 mt-1">Total: {data.timeline.reduce((sum, d) => sum + d.requestsPerMinute, 0).toLocaleString()}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <TrendChart
          title="API Response Time"
          subtitle={`${metric.toUpperCase()} latency over time. Green: Fast (<500ms), Yellow: Moderate (500-1000ms), Red: Slow (>1000ms).`}
          data={metricData[metric]}
          valueSuffix="ms"
          primaryLabel="Latency"
          secondaryLabel={metric === "avg" ? "Max Latency" : undefined}
          color={
            metric === "avg" ? "#0f766e" :
            metric === "p50" ? "#0284c7" :
            metric === "p95" ? "#f59e0b" : "#e11d48"
          }
          height={300}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <TrendChart
            title="Error Rate Trend"
            subtitle="Percentage of failed requests over time."
            data={errorRateData}
            valueSuffix="%"
            primaryLabel="Error Rate"
            color="#e11d48"
            height={220}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <TrendChart
            title="Request Throughput"
            subtitle="Requests per minute over time."
            data={requestsData}
            primaryLabel="Req/min"
            color="#0284c7"
            height={220}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h4 className="text-sm font-bold text-slate-900 mb-3">Performance Thresholds</h4>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="font-medium text-green-800">Fast: &lt;500ms</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="font-medium text-amber-800">Moderate: 500-1000ms</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="font-medium text-red-800">Slow: &gt;1000ms</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50">
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500" />
            <span className="font-medium text-red-800">Critical: &gt;2000ms</span>
          </div>
        </div>
      </div>
    </div>
  );
};