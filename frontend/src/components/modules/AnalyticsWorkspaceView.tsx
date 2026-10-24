import React, { useEffect, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import { EmptyState } from "../ui/EmptyState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartPie,
  faUsers,
  faBookOpen,
  faFileInvoiceDollar,
  faClipboardCheck,
} from "@fortawesome/free-solid-svg-icons";

interface AnalyticsSummary {
  totalUsers: number;
  totalStudents: number;
  totalCourses: number;
  totalAssignments: number;
  totalAttendanceSessions: number;
  totalExaminations: number;
  publishedExaminations: number;
  totalAdmissionApplications: number;
  pendingAdmissionApplications: number;
  totalCases: number;
  openCases: number;
  closedCases: number;
  totalInvoices: number;
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
}

export const AnalyticsWorkspaceView: React.FC = () => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<AnalyticsSummary>("/analytics/summary")
      .then((result) => {
        if (active) setSummary(result);
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load analytics.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const groups = summary
    ? [
        {
          title: "Identity & Enrollment",
          icon: faUsers,
          values: [
            ["Active Users", summary.totalUsers],
            ["Students", summary.totalStudents],
          ],
        },
        {
          title: "Academics",
          icon: faBookOpen,
          values: [
            ["Courses", summary.totalCourses],
            ["Assignments", summary.totalAssignments],
            ["Attendance Sessions", summary.totalAttendanceSessions],
            ["Examinations", summary.totalExaminations],
            ["Published Results", summary.publishedExaminations],
          ],
        },
        {
          title: "Admissions & Workflow",
          icon: faClipboardCheck,
          values: [
            ["Applications", summary.totalAdmissionApplications],
            ["Pending Applications", summary.pendingAdmissionApplications],
            ["Cases", summary.totalCases],
            ["Open Cases", summary.openCases],
          ],
        },
        {
          title: "Finance",
          icon: faFileInvoiceDollar,
          values: [
            ["Invoices", summary.totalInvoices],
            ["Invoiced (NPR)", summary.totalInvoiced],
            ["Collected (NPR)", summary.totalCollected],
            ["Outstanding (NPR)", summary.outstandingBalance],
          ],
        },
      ]
    : [];

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <p className="cos-eyebrow">
          Reporting
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
          <FontAwesomeIcon icon={faChartPie} /> Analytics
        </h1>
        <p className="cos-page-subtitle">
          Aggregates calculated from persisted institutional records.
        </p>
      </header>
      {error && (
        <p
          role="alert"
          className="border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Loading database aggregates...
        </p>
      ) : !summary ||
        summary.totalUsers +
          summary.totalStudents +
          summary.totalCourses +
          summary.totalAssignments +
          summary.totalInvoices ===
          0 ? (
        <EmptyState
          icon={faChartPie}
          title="No data available yet"
          description="Analytics appear as institutional records are created and verified."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {groups.map((group) => (
            <section
              key={group.title}
              className="border border-slate-200 bg-white"
            >
              <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 font-semibold">
                <FontAwesomeIcon
                  icon={group.icon}
                  className="text-[var(--color-primary)]"
                />
                {group.title}
              </header>
              <dl className="grid grid-cols-2 gap-px bg-slate-200">
                {group.values.map(([label, value]) => (
                  <div key={String(label)} className="bg-white p-4">
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-2 font-mono text-xl font-semibold">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </section>
  );
};
