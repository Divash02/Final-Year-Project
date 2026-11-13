import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faClock,
  faCalendarAlt,
  faSignInAlt,
  faSignOutAlt,
  faExternalLinkAlt,
  faChevronDown,
  faChevronRight,
  faCircle,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { DonutChartCard, type DonutSegment } from "./DonutChartCard";
import { BarChartCard, type BarChartItem } from "./BarChartCard";
import type { IndividualUserActivityResponse } from "../../services/analyticsApi";

interface IndividualUserActivityProps {
  data: IndividualUserActivityResponse | null;
  loading?: boolean;
  onClose: () => void;
}

export const IndividualUserActivity: React.FC<IndividualUserActivityProps> = ({ data, loading, onClose }) => {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  if (!data) {
    return (
      <Modal isOpen={true} onClose={onClose} title="User Activity" maxWidth="2xl">
        <div className="text-center py-8">
          <FontAwesomeIcon icon={faUser} className="text-4xl text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500 mt-2">No user data available.</p>
        </div>
      </Modal>
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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };

  const getActivityIcon = (action: string) => {
    if (action.includes("Logged out")) return <FontAwesomeIcon icon={faSignOutAlt} className="text-red-500" />;
    if (action.includes("Opened") || action.includes("Viewed")) return <FontAwesomeIcon icon={faExternalLinkAlt} className="text-teal-500" />;
    if (action.includes("Navigated")) return <FontAwesomeIcon icon={faChevronRight} className="text-blue-500" />;
    if (action.includes("Heartbeat")) return <FontAwesomeIcon icon={faCircle} className="text-amber-500" size="xs" />;
    return <FontAwesomeIcon icon={faExternalLinkAlt} className="text-slate-400" />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "text-green-600";
      case "idle": return "text-amber-600";
      case "logged_out": return "text-blue-600";
      case "expired": return "text-red-600";
      case "abandoned": return "text-gray-600";
      default: return "text-slate-600";
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`${data.user.userName} - Activity Profile`} maxWidth="2xl">
      <div className="space-y-6">
        {/* User Overview */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
              <FontAwesomeIcon icon={faUser} className="text-2xl text-teal-700" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900">{data.user.userName}</h3>
              <p className="text-sm text-slate-500">{data.user.email}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="neutral" size="sm">{data.user.role.replace("_", " ")}</Badge>
                <Badge variant={data.user.accountStatus === "ACTIVE" ? "success" : "warning"} size="sm">{data.user.accountStatus}</Badge>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-600 shrink-0">
              <div className="flex items-center gap-1.5"><FontAwesomeIcon icon={faSignInAlt} className="text-teal-600" /> Last Login: {formatDate(data.user.lastLogin)}</div>
            </div>
          </div>
        </div>

        {/* Overview KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Visits</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{data.overview.totalVisits}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Time</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{formatDuration(data.overview.totalTimeSpent * 60)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Avg Session</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{formatDuration(data.overview.avgSessionDuration * 60)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Pages Visited</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{data.overview.totalPagesVisited}</div>
          </div>
        </div>

        {/* Activity History */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Activity History</h3>
            <span className="text-xs text-slate-500">{data.activityHistory.length} events</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {data.activityHistory.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No activity recorded for this period.</div>
            ) : (
              data.activityHistory.map((event, idx) => (
                <div
                  key={idx}
                  className="p-4 flex items-start gap-3 hover:bg-slate-50 transition"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                    {getActivityIcon(event.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-slate-900">{event.action}</span>
                      <span className="text-xs text-slate-400">{event.module}</span>
                      {event.isIdle && <Badge variant="warning" size="xs">Idle</Badge>}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {formatDate(event.timestamp)}
                      {event.route && <span className="ml-2 text-teal-600">{event.route}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Module Usage */}
        {data.moduleUsage.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BarChartCard
              title="Module Usage"
              subtitle="Modules accessed by this user."
              items={data.moduleUsage.map((m) => ({
                label: m.module,
                value: m.visits,
                color: "#0f766e",
              }))}
              valueSuffix=" visits"
            />

            <DonutChartCard
              title="Session Status Distribution"
              subtitle="Breakdown of session states."
              segments={data.sessions.reduce((acc, s) => {
                acc[s.sessionStatus] = (acc[s.sessionStatus] || 0) + 1;
                return acc;
              }, {} as Record<string, number>) &&
              Object.entries(
                data.sessions.reduce((acc, s) => {
                  acc[s.sessionStatus] = (acc[s.sessionStatus] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              ).map(([label, value]) => ({
                label,
                value,
                color:
                  label === "active"
                    ? "#0f766e"
                    : label === "idle"
                    ? "#f59e0b"
                    : label === "logged_out"
                    ? "#0284c7"
                    : label === "expired"
                    ? "#e11d48"
                    : "#64748b",
              }))}
              centerLabel="Sessions"
              centerValue={data.sessions.length}
            />
          </div>
        )}

        {/* Sessions List */}
        {data.sessions.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Sessions</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {data.sessions.map((session) => (
                <div
                  key={session.sessionId}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  onClick={() => setExpandedSession(expandedSession === session.sessionId ? null : session.sessionId)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(session.sessionStatus)}`} />
                    <div>
                      <div className="font-medium text-slate-900">
                        {formatDate(session.loginAt)} - {session.logoutAt ? formatDate(session.logoutAt) : "Active"}
                      </div>
                      <div className="text-xs text-slate-500">
                        Duration: {formatDuration(session.totalDuration * 60)} | Active: {formatDuration(session.activeDuration * 60)} | Idle: {formatDuration(session.idleDuration * 60)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-600 shrink-0">
                    <span>{session.pagesVisited} pages</span>
                    <span>{session.modulesAccessed.length} modules</span>
                    <FontAwesomeIcon icon={expandedSession === session.sessionId ? faChevronDown : faChevronRight} className="text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-slate-200">
          <Button variant="primary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
};