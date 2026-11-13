import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTable,
  faUsers,
  faBuilding,
  faClock,
  faChartBar,
  faChartPie,
} from "@fortawesome/free-solid-svg-icons";
import { TabButton } from "./FilterBar";
import { BarChartCard, type BarChartItem } from "./BarChartCard";
import { DonutChartCard, type DonutSegment } from "./DonutChartCard";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { EmptyChartState } from "./EmptyChartState";
import type { ModuleUsageAnalyticsResponse } from "../../services/analyticsApi";

interface ModuleUsageAnalyticsProps {
  data: ModuleUsageAnalyticsResponse;
  loading?: boolean;
}

type ModuleViewTab = "overview" | "byRole" | "byDepartment" | "byTime";

export const ModuleUsageAnalytics: React.FC<ModuleUsageAnalyticsProps> = ({ data, loading }) => {
  const [activeTab, setActiveTab] = useState<ModuleViewTab>("overview");

  const tabs: Array<{ id: ModuleViewTab; label: string; icon: typeof faTable }> = [
    { id: "overview", label: "Overview", icon: faChartBar },
    { id: "byRole", label: "By Role", icon: faUsers },
    { id: "byDepartment", label: "By Department", icon: faBuilding },
    { id: "byTime", label: "By Time", icon: faClock },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-64 rounded-xl border border-slate-200 bg-white p-5 animate-pulse" />
      </div>
    );
  }

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

      {activeTab === "overview" && (
        <div className="space-y-6">
          {data.modules.length > 0 ? (
            <>
              <BarChartCard
                title="Module Visits"
                subtitle="Total visits per module across the institution."
                items={data.modules.map((m) => ({
                  label: m.module,
                  value: m.visits,
                  color: "#0f766e",
                  secondaryText: `${m.uniqueUsers} unique users`,
                }))}
                valueSuffix=" visits"
              />

              <DonutChartCard
                title="Module Visit Distribution"
                subtitle="Proportion of visits across modules."
                segments={data.modules.slice(0, 8).map((m) => ({
                  label: m.module,
                  value: m.visits,
                }))}
                centerLabel="Visits"
                centerValue={data.modules.reduce((sum, m) => sum + m.visits, 0)}
              />
            </>
          ) : (
            <EmptyChartState title="No module usage data" message="Module visits will appear as users navigate the platform." />
          )}
        </div>
      )}

      {activeTab === "byRole" && (
        <div className="space-y-6">
          {data.byRole.length > 0 ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Module Usage by Role</h3>
                <div className="space-y-4">
                  {data.byRole.reduce((acc, item) => {
                    if (!acc[item.role]) acc[item.role] = [];
                    acc[item.role].push(item);
                    return acc;
                  }, {} as Record<string, typeof data.byRole>).map(([role, items]) => (
                    <BarChartCard
                      key={role}
                      title={`Role: ${role.replace("_", " ")}`}
                      subtitle={`Modules accessed by ${role.replace("_", " ")} users.`}
                      items={items.map((m) => ({
                        label: m.module,
                        value: m.visits,
                        color: "#0f766e",
                        secondaryText: `${m.uniqueUsers} users`,
                      }))}
                      valueSuffix=" visits"
                      maxItems={10}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <EmptyChartState title="No role-based data" message="Module usage by role will populate as users access the platform." />
          )}
        </div>
      )}

      {activeTab === "byDepartment" && (
        <div className="space-y-6">
          {data.byDepartment.length > 0 ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Module Usage by Department</h3>
                <div className="space-y-4">
                  {data.byDepartment.reduce((acc, item) => {
                    if (!acc[item.department]) acc[item.department] = [];
                    acc[item.department].push(item);
                    return acc;
                  }, {} as Record<string, typeof data.byDepartment>).map(([dept, items]) => (
                    <BarChartCard
                      key={dept}
                      title={`Department: ${dept}`}
                      subtitle={`Modules accessed by ${dept} users.`}
                      items={items.map((m) => ({
                        label: m.module,
                        value: m.visits,
                        color: "#0284c7",
                        secondaryText: `${m.uniqueUsers} users`,
                      }))}
                      valueSuffix=" visits"
                      maxItems={10}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <EmptyChartState title="No department data" message="Module usage by department will populate as users access the platform." />
          )}
        </div>
      )}

      {activeTab === "byTime" && (
        <div className="space-y-6">
          {data.byTime.length > 0 ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Module Usage by Day & Hour</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                        <th className="p-3">Module</th>
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                          <th key={day} className="p-3 text-center">{day}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.byTime.reduce((acc, item) => {
                        if (!acc[item.module]) acc[item.module] = {};
                        acc[item.module][`${item.dayOfWeek}-${item.hour}`] = item.visits;
                        return acc;
                      }, {} as Record<string, Record<string, number>>).map((hours, module) => (
                        <tr key={module} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-900">{module}</td>
                          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                            <td key={day} className="p-2 text-center">
                              {Object.entries(hours)
                                .filter(([key]) => key.startsWith(`${day}-`))
                                .map(([, visits]) => (
                                  <div key={visits} className="text-xs font-mono text-teal-700">{visits}</div>
                                ))}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <EmptyChartState title="No time-based data" message="Module usage by time will populate as users access the platform." />
          )}
        </div>
      )}
    </div>
  );
};

interface TabButtonProps {
  id: string;
  label: string;
  icon: typeof faTable;
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ id, label, icon, isActive, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg font-bold transition whitespace-nowrap ${
      isActive
        ? "bg-teal-50 text-teal-900 border border-teal-200 shadow-xs"
        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
    }`}
  >
    <FontAwesomeIcon icon={icon} className={isActive ? "text-teal-700" : "text-slate-400"} />
    <span>{label}</span>
  </button>
);