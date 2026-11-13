import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRoute,
  faArrowsAltH,
  faPlay,
  faStop,
  faClock,
  faCalendarAlt,
  faChartLine,
  faUserCheck,
  faRedo,
} from "@fortawesome/free-solid-svg-icons";
import { TabButton } from "./ModuleUsageAnalytics";
import { BarChartCard, type BarChartItem } from "./BarChartCard";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { DonutChartCard, type DonutSegment } from "./DonutChartCard";
import { EmptyChartState } from "./EmptyChartState";
import type { UserBehaviorPatternsResponse } from "../../services/analyticsApi";

interface UserBehaviorPatternsProps {
  data: UserBehaviorPatternsResponse;
  loading?: boolean;
}

type BehaviorTab = "navigation" | "patterns" | "temporal" | "retention";

export const UserBehaviorPatterns: React.FC<UserBehaviorPatternsProps> = ({ data, loading }) => {
  const [activeTab, setActiveTab] = useState<BehaviorTab>("navigation");

  const tabs: Array<{ id: BehaviorTab; label: string; icon: typeof faRoute }> = [
    { id: "navigation", label: "Navigation Paths", icon: faArrowsAltH },
    { id: "patterns", label: "Usage Patterns", icon: faRoute },
    { id: "temporal", label: "Temporal Patterns", icon: faClock },
    { id: "retention", label: "Retention", icon: faUserCheck },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-64 rounded-xl border border-slate-200 bg-white p-5 animate-pulse" />
      </div>
    );
  }

  const renderNavigationFlow = () => {
    if (data.commonNavigationPaths.length === 0) {
      return <EmptyChartState title="No navigation data" message="Navigation paths will appear as users move between modules." />;
    }

    return (
      <div className="space-y-4">
        <h4 className="text-sm font-bold text-slate-900">Top Navigation Flows</h4>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
          {data.commonNavigationPaths.slice(0, 15).map((path, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
              <span className="text-xs font-mono text-slate-400 w-6 text-right">{idx + 1}.</span>
              <div className="flex-1 flex items-center gap-2 text-sm">
                <span className="font-medium text-slate-700 truncate">{path.from || "Entry"}</span>
                <FontAwesomeIcon icon={faArrowsAltH} className="text-slate-400 text-xs" />
                <span className="font-medium text-teal-700 truncate">{path.to}</span>
              </div>
              <Badge variant="neutral" size="sm">{path.count} transitions</Badge>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderStartExitPages = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <BarChartCard
        title="Common Entry Pages"
        subtitle="Where users typically start their sessions."
        items={data.commonStartPages.slice(0, 10).map((p) => ({
          label: p.route,
          value: p.count,
          color: "#0f766e",
        }))}
        valueSuffix=" sessions"
      />
      <BarChartCard
        title="Common Exit Pages"
        subtitle="Where users typically end their sessions."
        items={data.commonExitPages.slice(0, 10).map((p) => ({
          label: p.route,
          value: p.count,
          color: "#e11d48",
        }))}
        valueSuffix=" sessions"
      />
    </div>
  );

  const renderModuleUsage = () => (
    <div className="space-y-6">
      {data.frequentlyVisitedModules.length > 0 ? (
        <BarChartCard
          title="Frequently Visited Modules"
          subtitle="Most accessed routes/modules across all users."
          items={data.frequentlyVisitedModules.slice(0, 15).map((m) => ({
            label: m.route,
            value: m.visits,
            color: "#0f766e",
          }))}
          valueSuffix=" visits"
        />
      ) : (
        <EmptyChartState title="No module visit data" message="Module visits will appear as users navigate the platform." />
      )}
    </div>
  );

  const renderTemporalPatterns = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrendChart
          title="Peak Usage by Hour"
          subtitle="Average concurrent users by hour of day."
          data={data.peakUsageHours.map((h) => ({
            label: `${h.hour.toString().padStart(2, "0")}:00`,
            value: h.visits,
          }))}
          primaryLabel="Visits"
          color="#0f766e"
        />
        <TrendChart
          title="Peak Usage by Day"
          subtitle="Daily visit volume over the period."
          data={data.peakUsageDays.map((d) => ({
            label: d.date.slice(5),
            value: d.visits,
          }))}
          primaryLabel="Visits"
          color="#0284c7"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChartCard
          title="Session Duration by Role"
          subtitle="Average session duration per user role."
          items={data.avgSessionDurationByRole.map((r) => ({
            label: r.role.replace("_", " "),
            value: r.avgDuration,
            color: "#0f766e",
          }))}
          valueSuffix=" min"
          layout="vertical"
        />

        <DonutChartCard
          title="Weekly Usage Pattern"
          subtitle="Visit distribution across days of week."
          segments={[
            { label: "Monday", value: 0, color: "#0f766e" },
            { label: "Tuesday", value: 0, color: "#0284c7" },
            { label: "Wednesday", value: 0, color: "#f59e0b" },
            { label: "Thursday", value: 0, color: "#6366f1" },
            { label: "Friday", value: 0, color: "#ec4899" },
            { label: "Saturday", value: 0, color: "#14b8a6" },
            { label: "Sunday", value: 0, color: "#64748b" },
          ]}
          centerLabel="Visits"
          centerValue={data.peakUsageDays.reduce((sum, d) => sum + d.visits, 0)}
        />
      </div>
    </div>
  );

  const renderRetention = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs text-center">
          <FontAwesomeIcon icon={faUserCheck} className="text-3xl text-teal-600 mx-auto" />
          <div className="text-3xl font-bold text-slate-900 mt-2">{data.returningUserPatterns.totalUsers}</div>
          <div className="text-xs text-slate-500">Total Users</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs text-center">
          <FontAwesomeIcon icon={faRedo} className="text-3xl text-blue-600 mx-auto" />
          <div className="text-3xl font-bold text-slate-900 mt-2">{data.returningUserPatterns.returningUsers}</div>
          <div className="text-xs text-slate-500">Returning Users</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs text-center">
          <FontAwesomeIcon icon={faChartLine} className="text-3xl text-amber-600 mx-auto" />
          <div className="text-3xl font-bold text-slate-900 mt-2">{data.returningUserPatterns.avgVisitsPerUser.toFixed(1)}</div>
          <div className="text-xs text-slate-500">Avg Visits/User</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs text-center">
          <FontAwesomeIcon icon={faCalendarAlt} className="text-3xl text-purple-600 mx-auto" />
          <div className="text-3xl font-bold text-slate-900 mt-2">{data.returningUserPatterns.avgDaysPerUser.toFixed(1)}</div>
          <div className="text-xs text-slate-500">Avg Active Days/User</div>
        </div>
      </div>

      <DonutChartCard
        title="User Retention"
        subtitle="Proportion of users with single vs multiple active days."
        segments={[
          { label: "Returning Users (≥2 days)", value: data.returningUserPatterns.returningUsers, color: "#0f766e" },
          { label: "Single-Day Users", value: data.returningUserPatterns.totalUsers - data.returningUserPatterns.returningUsers, color: "#f59e0b" },
        ]}
        centerLabel="Users"
        centerValue={data.returningUserPatterns.totalUsers}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto pb-1 text-xs">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            id={tab.id}
            label={tab.label}
            icon={tab.icon}
            isActive={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      {activeTab === "navigation" && (
        <div className="space-y-6">
          {renderNavigationFlow()}
          {renderStartExitPages()}
        </div>
      )}

      {activeTab === "patterns" && renderModuleUsage()}

      {activeTab === "temporal" && renderTemporalPatterns()}

      {activeTab === "retention" && renderRetention()}
    </div>
  );
};