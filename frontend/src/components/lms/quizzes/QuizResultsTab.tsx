import React, { useState, useEffect, useMemo, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faEye,
  faArrowRotateRight,
  faUserGraduate,
  faDownload,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Table } from "../../ui/Table";
import { fetchAttemptRoster } from "../../../services/lmsApi";
import type { LmsAttemptRoster, LmsAttemptRosterItem } from "../../../types/lms";
import { QuizGradingPanel } from "../../modules/lms/QuizGradingPanel";

interface QuizResultsTabProps {
  quizId: string;
  quizTitle: string;
  maxMarks: number;
}

export const QuizResultsTab: React.FC<QuizResultsTabProps> = ({
  quizId,
  quizTitle,
  maxMarks,
}) => {
  const [roster, setRoster] = useState<LmsAttemptRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [gradingAttemptId, setGradingAttemptId] = useState<string | null>(null);
  const [gradingLabel, setGradingLabel] = useState("");

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAttemptRoster(quizId);
      setRoster(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attempt roster.");
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const attempts = roster?.attempts || [];

  const filteredAttempts = useMemo(() => {
    return attempts.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.studentName?.toLowerCase().includes(q) ||
        item.studentRollNumber?.toLowerCase().includes(q)
      );
    });
  }, [attempts, statusFilter, search]);

  const calculateGrade = (percentage: number | null | undefined): string => {
    if (percentage == null) return "—";
    if (percentage >= 90) return "A+";
    if (percentage >= 80) return "A";
    if (percentage >= 70) return "B+";
    if (percentage >= 60) return "B";
    if (percentage >= 50) return "C+";
    if (percentage >= 40) return "C";
    return "F";
  };

  const exportCsv = () => {
    if (!attempts.length) return;
    const headers = ["Student Name", "Roll Number", "Status", "Attempt", "Score", "Max Marks", "Percentage", "Grade", "Submitted At"];
    const rows = attempts.map((a) => [
      a.studentName || "Anonymous",
      a.studentRollNumber || "—",
      a.status,
      String(a.attemptNumber || 1),
      a.score != null ? String(a.score) : "—",
      String(maxMarks),
      a.percentage != null ? `${a.percentage.toFixed(1)}%` : "—",
      calculateGrade(a.percentage),
      a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "—",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map(s => `"${s}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${quizTitle.replace(/\s+/g, "_")}_Results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (gradingAttemptId) {
    return (
      <QuizGradingPanel
        attemptId={gradingAttemptId}
        attemptLabel={gradingLabel}
        onClose={() => {
          setGradingAttemptId(null);
          void loadRoster();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Student Assessment Results
          </h3>
          <p className="text-xs text-slate-500">
            Total {attempts.length} candidate attempts recorded. Inspect individual response cards and manual grading items.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={faDownload}
            onClick={exportCsv}
            disabled={attempts.length === 0}
          >
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={faArrowRotateRight}
            onClick={() => void loadRoster()}
            isLoading={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="relative w-full sm:w-64">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student or roll number..."
            className="w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="ALL">All Statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
      </div>

      {/* Table Roster */}
      {loading && !roster ? (
        <div className="p-8 text-center text-xs text-slate-400">Loading student attempts...</div>
      ) : filteredAttempts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center space-y-2">
          <FontAwesomeIcon icon={faUserGraduate} className="text-3xl text-slate-300 dark:text-slate-600" />
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            No Student Submissions Found
          </h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {search || statusFilter !== "ALL"
              ? "No attempts match the current search filters."
              : "Students will appear here once they begin or complete an attempt."}
          </p>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th className="text-left">Student</th>
              <th className="text-left">Roll No</th>
              <th className="text-left">Attempt</th>
              <th className="text-left">Score</th>
              <th className="text-left">Percentage</th>
              <th className="text-left">Grade</th>
              <th className="text-left">Status</th>
              <th className="text-left">Submitted</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredAttempts.map((item) => {
              const grade = calculateGrade(item.percentage);
              return (
                <tr key={item.attemptId}>
                  <td className="font-semibold text-slate-900 dark:text-slate-100">
                    {item.studentName || "Anonymous Candidate"}
                  </td>
                  <td className="text-xs font-mono text-slate-500">
                    {item.studentRollNumber || "—"}
                  </td>
                  <td className="text-xs text-slate-600 dark:text-slate-400">
                    #{item.attemptNumber || 1}
                  </td>
                  <td className="font-bold text-slate-800 dark:text-slate-200">
                    {item.score != null ? `${item.score} / ${maxMarks}` : "—"}
                  </td>
                  <td className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {item.percentage != null ? `${item.percentage.toFixed(1)}%` : "—"}
                  </td>
                  <td>
                    <span
                      className={`px-2 py-0.5 text-xs font-bold rounded ${
                        grade === "A+" || grade === "A"
                          ? "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300"
                          : grade === "B+" || grade === "B"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                            : grade === "F"
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                              : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {grade}
                    </span>
                  </td>
                  <td>
                    <Badge
                      variant={
                        item.status === "SUBMITTED"
                          ? "success"
                          : item.status === "IN_PROGRESS"
                            ? "info"
                            : "neutral"
                      }
                      size="sm"
                    >
                      {item.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="text-xs text-slate-500">
                    {item.submittedAt ? new Date(item.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={faEye}
                      onClick={() => {
                        setGradingAttemptId(item.attemptId || item.id || null);
                        setGradingLabel(item.studentName || item.name || "Attempt");
                      }}
                    >
                      Inspect
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
};

export default QuizResultsTab;

