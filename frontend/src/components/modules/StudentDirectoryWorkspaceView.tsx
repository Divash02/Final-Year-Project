import React, { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import { EmptyState } from "../ui/EmptyState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload,
  faMagnifyingGlass,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";

interface DirectoryStudent {
  id: number;
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  phone: string | null;
  program: string | null;
  department: string | null;
  batch: string | null;
  section: string | null;
  semester: number | null;
  campus: string | null;
  account_status: string;
}

export const StudentDirectoryWorkspaceView: React.FC = () => {
  const [students, setStudents] = useState<DirectoryStudent[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const parameters = new URLSearchParams();
    if (query.trim()) parameters.set("q", query.trim());
    if (status) parameters.set("status", status);
    const timer = window.setTimeout(() => {
      apiRequest<{ students: DirectoryStudent[] }>(`/students?${parameters}`)
        .then((result) => {
          if (active) setStudents(result.students);
        })
        .catch((requestError: unknown) => {
          if (active)
            setError(
              requestError instanceof Error
                ? requestError.message
                : "Could not load the student directory.",
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, status]);

  const exportCsv = () => {
    const columns = [
      "student_id",
      "first_name",
      "middle_name",
      "last_name",
      "email",
      "phone",
      "program",
      "department",
      "batch",
      "semester",
      "section",
      "account_status",
    ] as const;
    const escape = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const content = [
      columns.join(","),
      ...students.map((student) =>
        columns.map((column) => escape(student[column])).join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "collegeos-student-directory.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const rows = useMemo(() => students, [students]);

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div>
          <p className="cos-eyebrow">
            Administration
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <FontAwesomeIcon icon={faUsers} /> Student Directory
          </h1>
          <p className="cos-page-subtitle">
            Institutional identity and enrollment records from the database.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={students.length === 0}
          className="inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faDownload} /> Export
        </button>
      </header>
      {error && (
        <p
          role="alert"
          className="border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-2 rounded border border-slate-300 px-2 py-1.5 text-slate-500">
          <FontAwesomeIcon icon={faMagnifyingGlass} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search student, ID, or email"
            className="min-w-56 text-sm text-slate-800 outline-none"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All account statuses</option>
          {["ACTIVE", "PASSIVE", "SUSPENDED", "DISABLED", "ARCHIVED"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
        <span className="self-center text-sm text-slate-500">
          {students.length} records
        </span>
      </div>
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Loading directory...
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={faUsers}
          title="No students registered"
          description="No student identity records match this search."
        />
      ) : (
        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Student</th>
                <th className="px-3 py-3">Institutional Email</th>
                <th className="px-3 py-3">Programme</th>
                <th className="px-3 py-3">Department</th>
                <th className="px-3 py-3">Batch</th>
                <th className="px-3 py-3">Semester / Section</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((student) => (
                <tr key={student.id}>
                  <td className="px-3 py-3">
                    <div className="font-medium">
                      {student.first_name}{" "}
                      {student.middle_name ? `${student.middle_name} ` : ""}
                      {student.last_name}
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {student.student_id}
                    </div>
                  </td>
                  <td className="px-3 py-3">{student.email}</td>
                  <td className="px-3 py-3">
                    {student.program || "Not assigned"}
                  </td>
                  <td className="px-3 py-3">
                    {student.department || "Not assigned"}
                  </td>
                  <td className="px-3 py-3">
                    {student.batch || "Not assigned"}
                  </td>
                  <td className="px-3 py-3">
                    {student.semester ?? "—"} / {student.section || "—"}
                  </td>
                  <td className="px-3 py-3">{student.account_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

