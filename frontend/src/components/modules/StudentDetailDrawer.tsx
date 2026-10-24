import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faHistory,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { ApiError, resolveAssetUrl } from "../../services/apiClient";
import {
  type RosterStudent,
  type StudentSummaryResponse,
  fetchStudentSummary,
} from "../../services/attendanceApi";
import {
  STATUS_TO_MARK,
  MARK_STYLES,
  MARK_TO_STATUS,
  type Mark,
} from "./attendanceConstants";

interface StudentDetailDrawerProps {
  student: RosterStudent | null;
  sessionId: string | null;
  onClose: () => void;
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatusPill({ status }: { status: string }) {
  const mark = STATUS_TO_MARK[status] as Mark | undefined;
  if (!mark) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">
        {status}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${MARK_STYLES[mark].idle}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${MARK_STYLES[mark].dot}`} aria-hidden="true" />
      {MARK_TO_STATUS[mark]}
    </span>
  );
}

/**
 * Student detail drawer. Reads the real per-student summary
 * for the open session — identity, current status, attendance
 * percentage and the recent attendance record. No local state,
 * no fabricated history.
 */
const StudentDetailDrawer: React.FC<StudentDetailDrawerProps> = ({
  student,
  sessionId,
  onClose,
}) => {
  const [summary, setSummary] = useState<StudentSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!student || !sessionId) return;
    setLoading(true);
    setError("");
    try {
      const result = await fetchStudentSummary(sessionId, student.studentMongoId);
      setSummary(result);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof ApiError && requestError.status >= 500
          ? "Could not load the student summary."
          : requestError instanceof Error
            ? requestError.message
            : "Could not load the student summary.",
      );
    } finally {
      setLoading(false);
    }
  }, [student, sessionId]);

  useEffect(() => {
    setSummary(null);
    setError("");
    if (student && sessionId) {
      void load();
    }
  }, [load, student, sessionId]);

  useEffect(() => {
    if (!student) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [student, onClose]);

  if (!student) return null;

  const initials = `${student.firstName?.[0] || ""}${student.lastName?.[0] || ""}`.toUpperCase();
  const avatarSrc = resolveAssetUrl(student.avatarUrl);

  return (
    <div className="fixed inset-0 z-[95] flex items-stretch justify-end bg-slate-950/50 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close student details"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-title"
        className="cos-rise relative flex w-full max-w-md flex-col overflow-hidden rounded-l-lg border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-[var(--color-primary-soft)] text-lg font-semibold text-[var(--color-primary-strong)]">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden="true">{initials || "?"}</span>
              )}
            </div>
            <div className="min-w-0">
              <h2 id="student-detail-title" className="truncate text-base font-semibold text-slate-900">
                {student.name}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                <span className="font-mono">{student.studentId}</span>
                <span aria-hidden="true" className="text-slate-300">
                  {" "}
                  ·{" "}
                </span>
                Sec {student.section}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="cos-icon-btn h-9 w-9 shrink-0"
          >
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && !summary && (
            <p className="py-8 text-center text-sm text-slate-500">
              Loading student summary…
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="cos-btn cos-btn-secondary mt-3 h-9 px-3 text-sm"
              >
                Retry
              </button>
            </div>
          )}

          {summary && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
                    Attendance
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {summary.student.attendancePercentage}
                    <span className="text-sm font-semibold text-slate-500">%</span>
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
                    Current status
                  </p>
                  <div className="mt-2">
                    {summary.currentStatus ? (
                      <StatusPill status={summary.currentStatus} />
                    ) : (
                      <span className="text-sm text-slate-500">Unmarked</span>
                    )}
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Batch</dt>
                  <dd className="font-medium text-slate-800">
                    {summary.student.batch || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Programme</dt>
                  <dd className="font-medium text-slate-800">
                    {summary.student.program || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Semester</dt>
                  <dd className="font-medium text-slate-800">
                    {summary.student.semester ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Section</dt>
                  <dd className="font-medium text-slate-800">
                    {summary.student.section || "—"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]">
                    <FontAwesomeIcon icon={faHistory} className="text-xs" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Recent attendance
                  </h3>
                </div>
                {summary.recentAttendance.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    No attendance has been recorded for this student yet.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {summary.recentAttendance.map((row, index) => (
                      <li
                        key={`${row.date}-${row.courseCode}-${row.classType}-${row.section}-${index}`}
                        className="flex min-w-0 flex-col gap-1.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {row.courseCode}
                            {row.courseName ? ` · ${row.courseName}` : ""}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                            <FontAwesomeIcon icon={faCalendarDays} className="text-[0.625rem]" aria-hidden="true" />
                            {formatDate(row.date)}
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            Sec {row.section} · {row.classType}
                          </p>
                        </div>
                        <StatusPill status={row.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentDetailDrawer;
