import React, { useCallback, useEffect, useState } from "react";
import { faChartLine, faRotateRight, faUserGraduate, faClipboardList } from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { CardSkeleton } from "../ui/Skeleton";
import { apiRequest } from "../../services/apiClient";
import { fetchFacultyCourses } from "../../services/assessmentApi";
import type { AssessmentCourse } from "../../services/assessmentApi";

type RiskLevel = "ALL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
interface ProgressStudent {
  studentId: string; studentCode: string; rollNumber: string; name: string; program?: string; semester?: number; section?: string; batch?: string;
  attendance: { percentage: number | null; totalSessions: number; absent: number; late: number; consecutiveAbsences: number; recent: { date: string; status: string }[] };
  assessment: { averagePercentage: number | null; records: number; failing: number; incomplete: number; latest: { courseCode?: string; percentage?: number | null; grade?: string; resultStatus?: string } | null; history?: { courseCode?: string; percentage?: number | null; grade?: string; semester?: number }[] };
  assignments: { submitted: number; late: number; missing: number | null; total: number | null };
  risk: { level: "HIGH" | "MEDIUM" | "LOW" | "NONE"; score: number; evidence: { type: string; detail: string; severity: string }[]; recommendedAction: string };
}
interface ProgressResponse { summary: { total: number; highRisk: number; mediumRisk: number; lowRisk: number; averageAttendance: number | null; averageAssessment: number | null }; students: ProgressStudent[] }
interface Intervention { id: string; studentId: string; interventionType: string; title: string; description?: string; status: string; priority: string; outcome?: string; outcomeNotes?: string; followUpRequired?: boolean; followUpDate?: string | null; scheduledAt?: string | null; createdAt?: string }

const SEMESTERS = Array.from({ length: 8 }, (_, i) => i + 1);
const riskVariant = (level: string): "danger" | "warning" | "info" | "neutral" => level === "HIGH" ? "danger" : level === "MEDIUM" ? "warning" : level === "LOW" ? "info" : "neutral";

export const StudentProgressView: React.FC = () => {
  const [courses, setCourses] = useState<AssessmentCourse[]>([]);
  const [courseId, setCourseId] = useState(""); const [academicYear, setAcademicYear] = useState("2083/84");
  const [semester, setSemester] = useState<number | "">(""); const [section, setSection] = useState("ALL");
  const [batch, setBatch] = useState(""); const [riskLevel, setRiskLevel] = useState<RiskLevel>("ALL");
  const [data, setData] = useState<ProgressResponse | null>(null); const [selected, setSelected] = useState<ProgressStudent | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [interventions, setInterventions] = useState<Intervention[]>([]); const [ivLoading, setIvLoading] = useState(false);
  const [ivDraft, setIvDraft] = useState({ interventionType: "COUNSELING", title: "", description: "", priority: "MODERATE", followUpRequired: false });

  useEffect(() => { fetchFacultyCourses({ academicYear }).then(setCourses).catch(() => {}); }, [academicYear]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const q = new URLSearchParams({ academicYear });
      if (courseId) q.set("courseId", courseId); if (semester) q.set("semester", String(semester));
      if (section && section !== "ALL") q.set("sectionCode", section); if (batch) q.set("batch", batch); if (riskLevel !== "ALL") q.set("riskLevel", riskLevel);
      const res = await apiRequest<ProgressResponse>(`/faculty/student-progress?${q.toString()}`);
      setData(res); setSelected((cur) => (cur ? res.students.find((s) => s.studentId === cur.studentId) || null : null));
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load student progress."); } finally { setLoading(false); }
  }, [academicYear, courseId, semester, section, batch, riskLevel]);

  const loadInterventions = useCallback(async (studentId?: string) => {
    if (!studentId) { setInterventions([]); return; }
    setIvLoading(true);
    try { const res = await apiRequest<{ interventions: Intervention[] }>(`/faculty/student-progress/interventions?studentId=${encodeURIComponent(studentId)}`); setInterventions(res.interventions || []); }
    catch { setInterventions([]); } finally { setIvLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadInterventions(selected?.studentId); }, [selected?.studentId, loadInterventions]);

  const createIntervention = async () => {
    if (!selected || !ivDraft.title.trim()) return;
    try {
      await apiRequest("/faculty/student-progress/interventions", { method: "POST", body: JSON.stringify({ studentId: selected.studentId, interventionType: ivDraft.interventionType, title: ivDraft.title.trim(), description: ivDraft.description.trim(), priority: ivDraft.priority, followUpRequired: ivDraft.followUpRequired, evidence: selected.risk.evidence, recommendedAction: selected.risk.recommendedAction, relatedCourseId: courseId || undefined }) });
      setIvDraft({ interventionType: "COUNSELING", title: "", description: "", priority: "MODERATE", followUpRequired: false });
      await loadInterventions(selected.studentId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to create intervention."); }
  };
  const updateIntervention = async (id: string, body: Record<string, unknown>) => {
    try { await apiRequest(`/faculty/student-progress/interventions/${id}`, { method: "PATCH", body: JSON.stringify(body) }); if (selected) await loadInterventions(selected.studentId); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to update intervention."); }
  };

  const students = data?.students || [];
  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div className="min-w-0"><p className="cos-eyebrow">Core Academic Management</p><h1 className="cos-page-title">Student Progress &amp; At-Risk Monitoring</h1><p className="cos-page-subtitle">Attendance, assessment, assignment, and LMS evidence for assigned students. Indicators are explanatory only and never change marks or academic standing.</p></div>
        <Button variant="secondary" icon={faRotateRight} onClick={() => void load()}>Refresh</Button>
      </header>
      <Card><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs font-medium text-slate-600">Academic Year<select className="cos-input mt-1" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>{["2083/84","2082/83","2081/82"].map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Course<select className="cos-input mt-1" value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">All assigned / filtered</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Semester<select className="cos-input mt-1" value={semester} onChange={(e) => setSemester(e.target.value ? Number(e.target.value) : "")}><option value="">All</option>{SEMESTERS.map((s) => <option key={s} value={s}>Semester {s}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Section<select className="cos-input mt-1" value={section} onChange={(e) => setSection(e.target.value)}>{["ALL","A","B","C","D"].map((s) => <option key={s} value={s}>{s === "ALL" ? "All sections" : `Section ${s}`}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Batch<input className="cos-input mt-1" value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="e.g. 2024" /></label>
        <label className="text-xs font-medium text-slate-600">Risk Level<select className="cos-input mt-1" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}>{(["ALL","HIGH","MEDIUM","LOW","NONE"] as RiskLevel[]).map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
      </div></Card>
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true"><CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton /></div> : data ? <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Students" value={String(data.summary.total)} />
          <Metric label="High Risk" value={String(data.summary.highRisk)} detail="Needs review" tone="danger" />
          <Metric label="Medium Risk" value={String(data.summary.mediumRisk)} detail="Monitor" tone="warning" />
          <Metric label="Avg Attendance" value={data.summary.averageAttendance != null ? `${data.summary.averageAttendance.toFixed(1)}%` : "—"} />
          <Metric label="Avg Assessment" value={data.summary.averageAssessment != null ? `${data.summary.averageAssessment.toFixed(1)}%` : "—"} />
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,1fr)]">
          <Card title="Student Monitoring" icon={faChartLine} padding={false}>
            {students.length === 0 ? <div className="p-5"><EmptyState icon={faUserGraduate} title="No student records" description="No students matched the selected filters or your assigned scope." /></div> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-100 text-slate-700 uppercase font-semibold"><tr><th className="px-3 py-2.5">Student</th><th className="px-3 py-2.5">Section</th><th className="px-3 py-2.5 text-center">Attendance</th><th className="px-3 py-2.5 text-center">Assessment</th><th className="px-3 py-2.5 text-center">Assignments</th><th className="px-3 py-2.5 text-center">Risk</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{students.map((s) => (
                  <tr key={s.studentId} className={`cursor-pointer hover:bg-slate-50 ${selected?.studentId === s.studentId ? "bg-indigo-50/60" : ""}`} onClick={() => setSelected(s)}>
                    <td className="px-3 py-2.5"><div className="font-semibold text-slate-900">{s.name}</div><div className="font-mono text-[11px] text-slate-500">{s.rollNumber || s.studentCode}</div></td>
                    <td className="px-3 py-2.5 text-slate-600">{s.section || "—"}</td>
                    <td className="px-3 py-2.5 text-center font-mono">{s.attendance.percentage != null ? `${s.attendance.percentage.toFixed(1)}%` : "—"}</td>
                    <td className="px-3 py-2.5 text-center font-mono">{s.assessment.averagePercentage != null ? `${s.assessment.averagePercentage.toFixed(1)}%` : "—"}</td>
                    <td className="px-3 py-2.5 text-center">{s.assignments.submitted}{s.assignments.total != null ? `/${s.assignments.total}` : ""}{s.assignments.missing ? <span className="ml-1 text-amber-700">({s.assignments.missing} missing)</span> : null}</td>
                    <td className="px-3 py-2.5 text-center"><Badge variant={riskVariant(s.risk.level)}>{s.risk.level}</Badge></td>
                  </tr>))}</tbody></table></div>)}
          </Card>
          <Card title={selected ? selected.name : "Student Profile"} subtitle={selected ? `${selected.rollNumber || selected.studentCode} · ${selected.program || ""} · Sem ${selected.semester ?? "—"}` : "Select a student to view evidence and intervention guidance."} icon={faClipboardList}>
            {!selected ? <EmptyState icon={faUserGraduate} title="No student selected" description="Choose a student from the monitoring table to inspect evidence and risk indicators." /> : (
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2"><Badge variant={riskVariant(selected.risk.level)}>Risk: {selected.risk.level}</Badge><Badge variant="neutral">Score {selected.risk.score}</Badge>{selected.attendance.consecutiveAbsences >= 3 && <Badge variant="danger">{selected.attendance.consecutiveAbsences} consecutive absences</Badge>}</div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Info label="Attendance" value={selected.attendance.percentage != null ? `${selected.attendance.percentage.toFixed(1)}% (${selected.attendance.totalSessions} sessions)` : "No records"} />
                  <Info label="Assessment Avg" value={selected.assessment.averagePercentage != null ? `${selected.assessment.averagePercentage.toFixed(1)}%` : "No records"} />
                  <Info label="Assignments" value={`${selected.assignments.submitted} submitted${selected.assignments.missing != null ? `, ${selected.assignments.missing} missing` : ""}${selected.assignments.late ? `, ${selected.assignments.late} late` : ""}`} />
                  <Info label="Latest Result" value={selected.assessment.latest ? `${selected.assessment.latest.courseCode || ""} ${selected.assessment.latest.grade || ""} ${selected.assessment.latest.resultStatus || ""}`.trim() : "—"} />
                </div>
                {selected.attendance.recent.length > 0 && <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Attendance Trend</p><div className="mt-2 flex flex-wrap gap-1.5">{selected.attendance.recent.slice(0,10).map((r, i) => <Badge key={i} variant={r.status === "Absent" ? "danger" : r.status === "Late" ? "warning" : "success"}>{r.date}: {r.status}</Badge>)}</div></div>}
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supporting Evidence</p>
                  {selected.risk.evidence.length === 0 ? <p className="mt-1 text-xs text-slate-500">No risk indicators detected from available records.</p> : <ul className="mt-2 space-y-2">{selected.risk.evidence.map((e, i) => <li key={i} className="rounded-lg border border-slate-200 p-2.5"><div className="flex items-center gap-2"><Badge variant={e.severity === "HIGH" ? "danger" : e.severity === "MEDIUM" ? "warning" : "info"}>{e.type}</Badge></div><p className="mt-1 text-xs text-slate-700">{e.detail}</p></li>)}</ul>}
                </div>
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3"><p className="text-xs font-semibold text-indigo-900">Recommended Action (advisory)</p><p className="mt-1 text-xs text-indigo-900/90">{selected.risk.recommendedAction}</p><p className="mt-2 text-[11px] text-indigo-900/70">Indicators explain why the student was flagged and never modify marks, attendance, or academic standing.</p></div>
                <div className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-900">Interventions (persisted, reviewable)</p>{ivLoading && <span className="text-[11px] text-slate-500">Loading…</span>}</div>
                  <div className="mt-2 grid gap-2 text-xs"><input className="cos-input" placeholder="Intervention title" value={ivDraft.title} onChange={(e) => setIvDraft((d) => ({ ...d, title: e.target.value }))} />
                    <textarea className="cos-input min-h-[56px]" placeholder="Description / plan / evidence notes" value={ivDraft.description} onChange={(e) => setIvDraft((d) => ({ ...d, description: e.target.value }))} />
                    <div className="flex flex-wrap gap-2 items-center"><select className="cos-input !w-auto" value={ivDraft.interventionType} onChange={(e) => setIvDraft((d) => ({ ...d, interventionType: e.target.value }))}>{["COUNSELING","ACADEMIC_SUPPORT","TUTORING","ATTENDANCE_WARNING","PARENT_MEETING","PEER_MENTORING","FACULTY_CONSULTATION","OTHER"].map((t) => <option key={t} value={t}>{t}</option>)}</select>
                      <select className="cos-input !w-auto" value={ivDraft.priority} onChange={(e) => setIvDraft((d) => ({ ...d, priority: e.target.value }))}>{["LOW","MODERATE","HIGH","URGENT"].map((p) => <option key={p} value={p}>{p}</option>)}</select>
                      <label className="inline-flex items-center gap-1 text-[11px] text-slate-600"><input type="checkbox" checked={ivDraft.followUpRequired} onChange={(e) => setIvDraft((d) => ({ ...d, followUpRequired: e.target.checked }))} /> Follow-up</label>
                      <Button size="sm" onClick={() => void createIntervention()}>Add Intervention</Button></div>
                  </div>
                  {interventions.length > 0 ? <ul className="mt-3 space-y-2">{interventions.map((iv) => <li key={iv.id} className="rounded-lg border border-slate-200 p-2.5"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-900">{iv.title}</span><Badge variant={iv.status === "COMPLETED" ? "success" : iv.status === "IN_PROGRESS" ? "info" : iv.status === "CANCELLED" ? "neutral" : "warning"}>{iv.status}</Badge><Badge variant="neutral">{iv.priority}</Badge></div><div className="mt-0.5 text-[11px] text-slate-500">{iv.interventionType}{iv.followUpRequired ? " · follow-up required" : ""}</div>{iv.description && <p className="mt-1 text-xs text-slate-700">{iv.description}</p>}{iv.outcomeNotes && <p className="mt-1 text-xs text-slate-600">Outcome: {iv.outcomeNotes}</p>}<div className="mt-2 flex flex-wrap gap-1.5"><Button size="sm" variant="secondary" onClick={() => void updateIntervention(iv.id, { status: "IN_PROGRESS" })}>Start</Button><Button size="sm" variant="secondary" onClick={() => void updateIntervention(iv.id, { status: "COMPLETED", outcome: "IMPROVED", outcomeNotes: iv.outcomeNotes || "Intervention completed" })}>Complete</Button><Button size="sm" variant="ghost" onClick={() => void updateIntervention(iv.id, { status: "DEFERRED" })}>Defer</Button></div></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">No intervention records for this student in your scope.</p>}
                </div>
              </div>)}
          </Card>
        </div>
      </> : null}
    </section>
  );
};

const Metric: React.FC<{ label: string; value: string; detail?: string; tone?: "danger" | "warning" }> = ({ label, value, detail, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-2xl font-semibold ${tone === "danger" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-slate-900"}`}>{value}</p>{detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}</div>
);
const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-0.5 font-medium text-slate-800">{value}</p></div>
);