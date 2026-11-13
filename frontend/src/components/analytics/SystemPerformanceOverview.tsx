import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMicrochip,
  faMemory,
  faTachometerAlt,
  faDatabase,
  faUsers,
  faExclamationTriangle,
  faCheckCircle,
  faTimesCircle,
  faInfoCircle,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { BarChartCard, type BarChartItem } from "./BarChartCard";
import { DonutChartCard, type DonutSegment } from "./DonutChartCard";
import { EmptyChartState } from "./EmptyChartState";
import { AnalyticsKpiCard } from "./AnalyticsKpiCard";
import type { SystemPerformanceOverviewResponse } from "../../services/analyticsApi";

interface SystemPerformanceOverviewProps {
  data: SystemPerformanceOverviewResponse;
  loading?: boolean;
  onRefresh?: () => void;
}

const formatBytes = (bytes: number | null) => {
  if (bytes === null || bytes === undefined) return "N/A";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const formatUptime = (seconds: number | null) => {
  if (seconds === null || seconds === undefined) return "N/A";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
};

const getHealthStatus = (status: string) => {
  switch (status) {
    case "healthy": return { label: "Healthy", icon: faCheckCircle, color: "text-green-600", bg: "bg-green-100" };
    case "warning": return { label: "Warning", icon: faExclamationTriangle, color: "text-amber-600", bg: "bg-amber-100" };
    case "critical": return { label: "Critical", icon: faTimesCircle, color: "text-red-600", bg: "bg-red-100" };
    default: return { label: "Unknown", icon: faInfoCircle, color: "text-slate-600", bg: "bg-slate-100" };
  }
};

export const SystemPerformanceOverview: React.FC<SystemPerformanceOverviewProps> = ({ data, loading, onRefresh }) => {
  const { current, summary, activeAlertsCount } = data;
  const health = getHealthStatus(current.systemHealthStatus);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-slate-200 bg-white p-4 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const getMetricColor = (value: number | null, warning: number, critical: number) => {
    if (value === null) return "text-slate-400";
    if (value >= critical) return "text-red-600";
    if (value >= warning) return "text-amber-600";
    return "text-teal-600";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">System Health Status</h2>
          <p className="text-xs text-slate-500">Real-time infrastructure and application performance metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${health.bg}`}>
            <FontAwesomeIcon icon={health.icon} className={health.color} />
            <span className="font-bold text-sm">{health.label}</span>
          </div>
          {onRefresh && (
            <Button size="sm" variant="secondary" onClick={onRefresh} isLoading={loading}>
              Refresh
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <AnalyticsKpiCard
          title="Process CPU"
          value={current.cpuUsage !== null ? `${current.cpuUsage.toFixed(1)}%` : "N/A"}
          subtitle={current.hostCpuUsage !== null ? `Host: ${current.hostCpuUsage.toFixed(1)}%` : "Host: N/A"}
          icon={faMicrochip}
          tone={getMetricColor(current.cpuUsage, 60, 80).replace("text-", "").replace("-600", "") as "teal" | "warning" | "danger" | "neutral"}
        />
        <AnalyticsKpiCard
          title="Process Memory"
          value={current.memoryUsage !== null ? `${current.memoryUsage.toFixed(1)}%` : "N/A"}
          subtitle={current.hostMemoryUsage !== null ? `Host: ${current.hostMemoryUsage.toFixed(1)}%` : "Host: N/A"}
          icon={faMemory}
          tone={getMetricColor(current.memoryUsage, 70, 85).replace("text-", "").replace("-600", "") as "teal" | "warning" | "danger" | "neutral"}
        />
        <AnalyticsKpiCard
          title="API Response"
          value={current.apiResponseTime !== null ? `${current.apiResponseTime}ms` : "N/A"}
          subtitle={`P95: ${current.apiResponseTimeP95 ?? "N/A"}ms | P99: ${current.apiResponseTimeP99 ?? "N/A"}ms`}
          icon={faTachometerAlt}
          tone={getMetricColor(current.apiResponseTime, 1000, 2000).replace("text-", "").replace("-600", "") as "teal" | "warning" | "danger" | "neutral"}
        />
        <AnalyticsKpiCard
          title="Concurrent Users"
          value={current.concurrentUsers.toLocaleString()}
          subtitle={`Active: ${current.activeSessions}`}
          icon={faUsers}
        />
        <AnalyticsKpiCard
          title="System Uptime"
          value={formatUptime(current.serverUptime)}
          subtitle="Server uptime"
          icon={faClock}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Memory Usage</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Process Heap</span>
                <span className="font-medium text-slate-900">
                  {formatBytes(current.memoryUsed)} / {formatBytes(current.memoryTotal)}
                  {current.memoryUsage !== null && ` (${current.memoryUsage.toFixed(1)}%)`}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${current.memoryUsage ?? 0}%`,
                    backgroundColor: getMetricColor(current.memoryUsage, 70, 85).replace("text-", "bg-"),
                  }}
                />
              </div>
            </div>
            {current.hostMemoryUsage !== null && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">Host Memory</span>
                  <span className="font-medium text-slate-900">{current.hostMemoryUsage.toFixed(1)}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${current.hostMemoryUsage}%`,
                      backgroundColor: getMetricColor(current.hostMemoryUsage, 70, 85).replace("text-", "bg-"),
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4">API Performance</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Avg Response</span>
              <span className="font-mono font-medium">{current.apiResponseTime !== null ? `${current.apiResponseTime}ms` : "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">P50 Latency</span>
              <span className="font-mono font-medium">{current.apiResponseTimeP50 !== null ? `${current.apiResponseTimeP50}ms` : "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">P95 Latency</span>
              <span className="font-mono font-medium">{current.apiResponseTimeP95 !== null ? `${current.apiResponseTimeP95}ms` : "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">P99 Latency</span>
              <span className="font-mono font-medium">{current.apiResponseTimeP99 !== null ? `${current.apiResponseTimeP99}ms` : "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Error Rate</span>
              <span className={`font-mono font-medium ${getMetricColor(current.errorRate, 1, 5)}`}>{current.errorRate.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Requests/min</span>
              <span className="font-mono font-medium">{current.requestsPerMinute.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Database</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Avg Query Time</span>
              <span className="font-mono font-medium">{current.databaseResponseTime !== null ? `${current.databaseResponseTime}ms` : "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Active Connections</span>
              <span className="font-mono font-medium">{current.activeConnections !== null ? current.activeConnections.toLocaleString() : "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Pool Utilization</span>
              <span className={`font-mono font-medium ${getMetricColor(current.connectionPoolUtilization, 75, 90)}`}>
                {current.connectionPoolUtilization !== null ? `${current.connectionPoolUtilization.toFixed(1)}%` : "N/A"}
              </span>
            </div>
            {activeAlertsCount > 0 && (
              <div className="flex items-center gap-2 text-amber-600 text-xs mt-2">
                <FontAwesomeIcon icon={faExclamationTriangle} />
                <span>{activeAlertsCount} active alert{activeAlertsCount !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrendChart
          title="CPU Usage Trend (Process)"
          subtitle="Historical process CPU utilization percentage."
          data={[]}
          primaryLabel="CPU %"
          color="#0f766e"
        />

        <TrendChart
          title="Memory Usage Trend (Process)"
          subtitle="Historical process memory utilization percentage."
          data={[]}
          primaryLabel="Memory %"
          color="#0284c7"
        />
      </div>
    </div>
  );
};