import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartBar,
  faChevronLeft,
  faClock,
  faEye,
  faFilter,
  faMagnifyingGlass,
  faRotate,
  faSchool,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";
import { ApiError } from "../../services/apiClient";
import { useToast } from "../ui/ToastContainer";
import {
  fetchAttendanceRecords,
  fetchAttendanceRecordHistory,
  type StaffAttendanceRecord,
  type AttendanceRecordHistoryResponse,
} from "../../services/attendanceApi";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Alert } from "../ui/Alert";
import { TableSkeleton } from "../ui/Skeleton";
import { AttendanceStatusBadge } from "./attendanceComponents";
import {
  ATTENDANCE_STATUS_LABELS,
  attendanceStatusVariant,
  formatDate,
  formatDateTime,
  type ColumnKey,
  ALL_COLUMNS,
} from "./attendanceRecordsTypes";

function errorMessage(requestError: unknown, fallback: string): string {
  if (requestError instanceof ApiError) {
    return requestError.status >= 500 ? fallback : requestError.message;
  }
  return requestError instanceof Error ? requestError.message : fallback;
}

const STATUS_OPTIONS: string[] = Object.keys(ATTENDANCE_STATUS_LABELS);

export const AttendanceRecordsWorkspaceView: React.FC = () => {
  const { toast } = useToast();

  const [records, setRecords] = useState<StaffAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const [activeColumns, setActiveColumns] = useState<ColumnKey[]>([
    "student",
    "studentId",
    "course",
    "section",
    "date",
    "status",
    "markedBy",
    "markedAt",
  ]);

  const [selectedRecord, setSelectedRecord] = useState<StaffAttendanceRecord | null>(null);

  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setError("");
    try {
      const result = await fetchAttendanceRecords({
        date: undefined,
        sessionId: undefined,
        courseId: courseFilter || undefined,
        section: sectionFilter || undefined,
      });
      setRecords(result.attendance);
    } catch (requestError: unknown) {
      setLoadFailed(true);
      setError(errorMessage(requestError, "Attendance records could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [courseFilter, sectionFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!query.trim() && !dateFrom && !dateTo && !statusFilter) {
      return records;
    }
    const q = query.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    return records.filter((record) => {
      if (q) {
        const fields = [
          record.studentName,
          record.studentId,
          record.courseCode,
          record.courseName,
          record.section,
          record.markedBy,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!fields.includes(q)) return false;
      }
      if (from) {
        const recordDate = new Date(record.date);
        if (recordDate < from) return false;
      }
      if (to) {
        const recordDate = new Date(record.date);
        if (recordDate > to) return false;
      }
      if (statusFilter && record.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [records, query, dateFrom, dateTo, statusFilter]);

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((record) => {
      counts[record.status] = (counts[record.status] || 0) + 1;
    });
    return counts;
  }, [records]);

  const toggleColumn = useCallback((column: ColumnKey) => {
    setActiveColumns((current) => {
      if (current.includes(column)) {
        return current.filter((c) => c !== column);
      }
      const newCols = [...current, column];
      const order = ALL_COLUMNS.map((c) => c.key);
      return newCols.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    });
  }, []);

  const total = records.length;
  const statusCounts = summary;

  const loadError = loadFailed || !!error;

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div className="min-w-0">
          <p className="cos-eyebrow">Academic</p>
          <h1 className="cos-page-title flex items-center gap-3">
            <FontAwesomeIcon icon={faSchool} className="shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
            <span className="truncate">Attendance Records</span>
          </h1>
          <p className="cos-page-subtitle">
            Search and report on attendance records taken across courses, sections and sessions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={faFilter}
            onClick={() => setShowFilters((current) => !current)}
            aria-expanded={showFilters}
            aria-controls="attendance-filters"
          >
            Filters
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={faRotate}
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>
    </header>

      {loadError && (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search students, courses, sections…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search attendance records"
            className="cos-input h-9 min-h-9 pl-10"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral" size="sm">
            {total} {total === 1 ? "record" : "records"}
          </Badge>
          {Object.entries(statusCounts)
            .filter(([_, count]) => count > 0)
            .map(([status, count]) => (
              <Badge
                key={status}
                variant={attendanceStatusVariant(status)}
                size="sm"
              >
                {ATTENDANCE_STATUS_LABELS[status]}: {count}
              </Badge>
            ))}
        </div>
      </div>

      {showFilters && (
        <Card
          title="Filters"
          icon={faFilter}
          subtitle="Refine the records shown below."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="cos-label" htmlFor="date-from">
                Date from
              </label>
              <input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="cos-input h-9 min-h-9 w-full"
              />
            </div>
            <div>
              <label className="cos-label" htmlFor="date-to">
                Date to
              </label>
              <input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="cos-input h-9 min-h-9 w-full"
              />
            </div>
            <div>
              <label className="cos-label" htmlFor="course-filter">
                Course
              </label>
              <input
                id="course-filter"
                type="text"
                placeholder="e.g. CS101"
                value={courseFilter}
                onChange={(event) => setCourseFilter(event.target.value)}
                className="cos-input h-9 min-h-0 w-full"
              />
            </div>
            <div>
              <label className="cos-label" htmlFor="section-filter">
                Section
              </label>
              <input
                id="section-filter"
                type="text"
                placeholder="e.g. A"
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
                className="cos-input h-9 min-h-0 w-full"
              />
            </div>
            <div>
              <label className="cos-label" htmlFor="status-filter">
                Status
              </label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="cos-input h-9 min-h-9 w-full cursor-pointer"
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {ATTENDANCE_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3.5 text-sm text-slate-600">
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setCourseFilter("");
                setSectionFilter("");
                setStatusFilter("");
              }}
              className="text-[var(--color-primary)] font-semibold hover:underline"
            >
              Clear all filters
            </button>
          </footer>
        </Card>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={activeColumns.length} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={faSearch}
          title="No attendance records found"
          description={
            query || dateFrom || dateTo || courseFilter || sectionFilter || statusFilter
              ? "No records match your current filters. Try adjusting your search."
              : "Attendance records will appear here once a register has been saved for a course session."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {activeColumns.map((column) => {
                  const columnDef = ALL_COLUMNS.find((c) => c.key === column);
                  return (
                    <th
                      key={column}
                      className="px-4 py-2 text-left font-semibold text-slate-700 whitespace-nowrap text-[13px]"
                    >
                      {columnDef?.label || column}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50">
                  {activeColumns.map((column) => (
                    <td key={column} className="px-4 py-2 align-top whitespace-nowrap text-[13px] text-slate-600">
                      {renderCell(record, column, setSelectedRecord)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <footer className="mt-4 flex items-center justify-between border-t border-slate-200 px-2 py-3 text-sm text-slate-500">
          <span>
            Showing {filtered.length} of {total} records
          </span>
            <Button
            size="sm"
            variant="ghost"
            icon={faChartBar}
            onClick={() => {
              const csv = exportCsv(filtered);
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download="attendance-records.csv";
              link.click();
              URL.revokeObjectURL(url);
              toast({
                variant: "success",
                message: "Attendance records exported to CSV.",
              });
            }}
          >
            Export CSV
          </Button>
        </footer>
      )}

      {selectedRecord && (
        <RecordDetailDrawer
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </section>
  );
};

function renderCell(
  record: StaffAttendanceRecord,
  column: ColumnKey,
  onOpen: (record: StaffAttendanceRecord) => void,
): React.ReactNode {
  switch (column) {
    case "student":
      return (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-[var(--color-primary-soft)] text-xs font-bold text-[var(--color-primary-strong)]">
            {record.studentAvatar ? (
              <img
                src={record.studentAvatar}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <span aria-hidden="true">
                {initials(record.studentName)}
              </span>
            )}
          </div>
          <span className="font-medium text-slate-900">{record.studentName || "—"}</span>
        </div>
      );
    case "studentId":
      return <span className="text-slate-600">{record.studentId || "—"}</span>;
    case "course":
      return (
        <div className="text-slate-900">
          <span className="font-medium">{record.courseCode}</span>
          {record.courseName && <span className="text-slate-500"> · {record.courseName}</span>}
        </div>
      );
    case "section":
      return <span className="text-slate-600">Section {record.section}</span>;
    case "date":
      return <span className="text-slate-600">{formatDate(record.date)}</span>;
    case "time":
      return (
        <span className="flex items-center gap-1 text-slate-600">
          <FontAwesomeIcon icon={faClock} className="text-xs" aria-hidden="true" />
          {record.session || "—"}
        </span>
      );
    case "status":
      return <AttendanceStatusBadge status={record.status} />;
    case "markedBy":
      return <span className="text-slate-600">{record.markedBy || "—"}</span>;
    case "markedAt":
      return <span className="text-slate-500">{formatDateTime(record.markedAt)}</span>;
    case "remarks":
      return <span className="text-slate-600">{record.remarks || "—"}</span>;
    case "actions":
      return (
        <button
          type="button"
          onClick={() => onOpen(record)}
          className="text-[var(--color-primary)] hover:text-[var(--color-primary-strong)]"
          aria-label={`View details for ${record.studentName || "student"}`}
        >
          <FontAwesomeIcon icon={faEye} aria-hidden="true" />
        </button>
      );
    default:
      return null;
  }
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function exportCsv(records: StaffAttendanceRecord[]): string {
  const headers = ["Student ID", "Student Name", "Course", "Section", "Date", "Status", "Marked By", "Marked At", "Remarks"];
  const rows = records.map((r) =>
    [
      r.studentId || "",
      r.studentName || "",
      `${r.courseCode || ""} ${r.courseName || ""}`,
      r.section || "",
      r.date || "",
      r.status || "",
      r.markedBy || "",
      r.markedAt || "",
      r.remarks || "",
    ].join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

const RecordDetailDrawer: React.FC<{
  record: StaffAttendanceRecord;
  onClose: () => void;
}> = ({ record, onClose }) => {
  const [history, setHistory] = useState<AttendanceRecordHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const result = await fetchAttendanceRecordHistory(record.id);
        if (active) setHistory(result);
      } catch (requestError: unknown) {
        if (active) {
          setHistoryError(errorMessage(requestError, "Could not load record history."));
        }
      } finally {
        if (active) setHistoryLoading(false);
      }
    };
    void loadHistory();
    return () => {
      active = false;
    };
  }, [record]);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="absolute inset-0 cursor-default" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-detail-title"
        className="relative w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="rotate-180 text-sm" aria-hidden="true" />
        </button>

        <h2 id="record-detail-title" className="text-lg font-semibold text-slate-900 mb-4">
          Attendance detail
        </h2>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Fact label="Student" value={record.studentName || "—"} />
          <Fact label="Student ID" value={record.studentId || "—"} />
          <Fact label="Course" value={`${record.courseCode || ""} ${record.courseName ? `· ${record.courseName}` : ""}`} />
          <Fact label="Section" value={`Section ${record.section || ""}`} />
          <Fact label="Class type" value={record.classType || "—"} />
          <Fact label="Date" value={formatDate(record.date)} />
          <Fact label="Session" value={record.session || "—"} />
          <Fact label="Status" value={<AttendanceStatusBadge status={record.status} />} />
          <Fact label="Recorded by" value={record.markedBy || "—"} />
          <Fact label="Recorded at" value={formatDateTime(record.markedAt)} />
          <Fact label="Remarks" value={record.remarks || "—"} />
        </dl>

        {record.remarks && (
          <p className="mt-3 text-sm text-slate-600">{record.remarks}</p>
        )}

        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Audit trail
          </h3>
          {historyLoading ? (
            <p className="mt-2 text-sm text-slate-500">Loading history…</p>
          ) : historyError ? (
            <Alert variant="error" className="mt-2">{historyError}</Alert>
          ) : history && history.history.length > 0 ? (
            <ol className="mt-3 space-y-2">
              {history.history.map((entry, index) => (
                <li key={index} className="border-l-2 border-slate-200 pl-3">
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">{entry.from || "Unmarked"}</span>
                    {" → "}
                    <span className="font-medium">{entry.to}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    by {entry.changedByName || "staff"} · {entry.changedAt ? formatDateTime(entry.changedAt) : "Unknown time"}
                    {entry.reason && <span className="block mt-0.5">“{entry.reason}”</span>}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No corrections recorded for this student.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
  </div>
);


