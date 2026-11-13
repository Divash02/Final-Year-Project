import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,
  faClock,
  faChartLine,
  faArrowTrendUp,
  faArrowTrendDown,
  faUserPlus,
  faUserCheck,
  faTachometerAlt,
  faExternalLinkAlt,
  faSearch,
  faChevronRight,
  faChevronDown,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { BarChartCard, type BarChartItem } from "./BarChartCard";
import { DonutChartCard, type DonutSegment } from "./DonutChartCard";
import { EmptyChartState } from "./EmptyChartState";
import { AnalyticsKpiCard } from "./AnalyticsKpiCard";

interface WebsiteUsageOverviewProps {
  data: {
    totalVisits: number;
    uniqueUsers: number;
    activeUsersNow: number;
    totalSessions: number;
    avgSessionDuration: number;
    avgActiveSessionDuration: number;
    totalTimeSpent: number;
    avgPagesPerSession: number;
    returningUsers: number;
    newUsers: number;
    peakConcurrentUsers: number;
    sessionTimeline: Array<{ period: string; sessions: number }>;
    topModules: Array<{ module: string; visits: number; uniqueUsers: number; avgTimePerVisit: number }>;
  };
  loading?: boolean;
}

export const WebsiteUsageOverview: React.FC<WebsiteUsageOverviewProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-slate-200 bg-white p-4 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const formatTimeSpent = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <AnalyticsKpiCard
          title="Total Visits"
          value={data.totalVisits.toLocaleString()}
          subtitle="Platform visits in period"
          icon={faUsers}
          tone="teal"
        />
        <AnalyticsKpiCard
          title="Unique Users"
          value={data.uniqueUsers.toLocaleString()}
          subtitle="Distinct authenticated users"
          icon={faUserCheck}
          tone="teal"
        />
        <AnalyticsKpiCard
          title="Active Now"
          value={data.activeUsersNow.toLocaleString()}
          subtitle="Currently active sessions"
          icon={faTachometerAlt}
          tone="teal"
        />
        <AnalyticsKpiCard
          title="Total Sessions"
          value={data.totalSessions.toLocaleString()}
          subtitle="User login sessions"
          icon={faClock}
        />
        <AnalyticsKpiCard
          title="Avg Session"
          value={formatDuration(data.avgSessionDuration)}
          subtitle={`Active: ${formatDuration(data.avgActiveSessionDuration)}`}
          icon={faClock}
        />
        <AnalyticsKpiCard
          title="Total Time Spent"
          value={formatTimeSpent(data.totalTimeSpent)}
          subtitle="Active platform usage"
          icon={faChartLine}
          tone="teal"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <AnalyticsKpiCard
          title="Avg Pages/Session"
          value={data.avgPagesPerSession.toFixed(1)}
          subtitle="Module navigation depth"
          icon={faExternalLinkAlt}
        />
        <AnalyticsKpiCard
          title="Returning Users"
          value={data.returningUsers.toLocaleString()}
          subtitle="Multi-session users"
          icon={faUserCheck}
          tone="teal"
        />
        <AnalyticsKpiCard
          title="New Users"
          value={data.newUsers.toLocaleString()}
          subtitle="First-time visitors"
          icon={faUserPlus}
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrendChart
          title="Session Activity Timeline"
          subtitle="User sessions initiated per hour across the selected period."
          data={data.sessionTimeline.map((t) => ({
            label: t.period.slice(-5),
            value: t.sessions,
          }))}
          primaryLabel="Sessions"
          color="#0f766e"
        />

        <DonutChartCard
          title="User Retention"
          subtitle="Proportion of returning vs new users in the period."
          segments={[
            { label: "Returning Users", value: data.returningUsers, color: "#0f766e" },
            { label: "New Users", value: data.newUsers, color: "#0284c7" },
          ]}
          centerLabel="Users"
          centerValue={data.returningUsers + data.newUsers}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Peak Concurrent Users</h3>
            <p className="text-xs text-slate-500 mt-0.5">Maximum simultaneous active sessions recorded.</p>
          </div>
          <div className="text-3xl font-bold text-teal-700">{data.peakConcurrentUsers}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-3 rounded-lg bg-teal-50">
            <div className="text-2xl font-bold text-teal-700">{data.totalVisits.toLocaleString()}</div>
            <div className="text-xs text-slate-500">Total Visits</div>
          </div>
          <div className="p-3 rounded-lg bg-blue-50">
            <div className="text-2xl font-bold text-blue-700">{data.uniqueUsers.toLocaleString()}</div>
            <div className="text-xs text-slate-500">Unique Users</div>
          </div>
          <div className="p-3 rounded-lg bg-amber-50">
            <div className="text-2xl font-bold text-amber-700">{formatTimeSpent(data.totalTimeSpent)}</div>
            <div className="text-xs text-slate-500">Total Active Time</div>
          </div>
          <div className="p-3 rounded-lg bg-purple-50">
            <div className="text-2xl font-bold text-purple-700">{data.avgPagesPerSession.toFixed(1)}</div>
            <div className="text-xs text-slate-500">Avg Pages/Session</div>
          </div>
        </div>
      </div>

      {data.topModules.length > 0 && (
        <BarChartCard
          title="Top Modules by Visits"
          subtitle="Most frequently accessed CollegeOS modules."
          items={data.topModules.slice(0, 10).map((m) => ({
            label: m.module,
            value: m.visits,
            color: "#0f766e",
            secondaryText: `${m.uniqueUsers} users`,
          }))}
          valueSuffix=" visits"
        />
      )}
    </div>
  );
};