import React, { useCallback, useEffect, useState } from "react";
import { faCalendarCheck, faBookOpen, faRotateRight, faClipboardCheck, faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { CardSkeleton } from "../ui/Skeleton";
import { apiRequest } from "../../services/apiClient";

interface CourseSummary {
  id: string; code: string; name: string; program?: string | null; semester?: number | null; academicYear?: string | null;
  totalWeeks?: number; publishedWeeks?: number; totalObjectives?: number; teachingRecords?: number; syllabusCompletionPercentage?: number | null;
}
interface TeachingRecord { id: string; taughtOn: string; topic: string; fromUnit: number; toUnit: number; unitLabel: string; sessionName?: string; sectionCode?: string | null; materialTitle?: string | null; facultyName?: string | null; notes?: string }
interface WeekRow {
  id: string; weekNumber: number; title: string; status: string; teachingPlan: string; expectedOutcome: string; notes: string;
  objectives: { id: string; text: string; code?: string | null }[];
  teachingRecords: TeachingRecord[];
  planned: boolean; completed: boolean; completionEvidence: string;
}
interface Detail {
  course: { id: string; code: string; name: string; program?: string | null; semester?: number | null };
  summary: { totalWeeks: number; publishedWeeks: number; completedWeeks: number; pendingWeeks: number; syllabusCompletionPercentage: number | null; totalObjectives: number; teachingRecords: number };
  weeks: WeekRow[];
  recentTeaching: TeachingRecord[];
  timetableSessions: { id: string; date?: string | null; day: string; startTime?: string | null; endTime?: string | null; sectionCode: string; room?: string | null; sessionType?: string | null; status: string }[];
  attendanceSessions: { id: string; date?: string; sectionCode: string; status: string; topic?: string }[];
}

const statusVariant = (s: string) => s === "PUBLISHED" ? "success" as const : s === "ARCHIVED" ? "neutral" as const : "warning" as const;

export const LessonPlanningView: React.FC = () => {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [courseId, setCourseId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const q = courseId ? `?courseId=${encodeURIComponent(courseId)}` : "";
      const res = await apiRequest<{ courses?: CourseSummary[] } & Partial<Detail>>(`/faculty/lesson-planning${q}`);
      if (res.courses) setCourses(res.courses);
      if (courseId && (res as Detail).course) setDetail(res as Detail);
      else if (!courseId) setDetail(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load lesson planning data."); }
    finally { setLoading(false); }
  }, [courseId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div className="min-w-0">
          <p className="cos-eyebrow">Core Academic Management</p>
          <h1 className="cos-page-title">Lesson Planning &amp; Teaching Records</h1>
          <p className="cos-page-subtitle">Weekly lesson plans, syllabus objectives, teaching records, and planned vs completed analytics from existing CourseWeek, objectives, TeachingProgress, timetable, and attendance data.</p>
        </div>
        <Button variant="secondary" icon={faRotateRight} onClick={() => void load()}>Refresh</Button>
      </header>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-medium text-slate-600">Course
            <select className="cos-input mt-1" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Select a course for detailed planning</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          </label>
        </div>
      </Card>

      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true"><CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>
      : !courseId ? (
        <Card title="Course Syllabus Overview" icon={faBookOpen} padding={false}>
          {courses.length === 0 ? <div className="p-5"><EmptyState icon={faCalendarCheck} title="No courses available" description="No assigned or accessible courses were found for lesson planning." /></div> : (
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-100 text-slate-700 uppercase font-semibold"><tr><th className="px-3 py-2.5">Course</th><th className="px-3 py-2.5 text-center">Weeks</th><th className="px-3 py-2.5 text-center">Objectives</th><th className="px-3 py-2.5 text-center">Teaching Records</th><th className="px-3 py-2.5 text-center">Syllabus</th><th className="px-3 py-2.5"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">{courses.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50"><td className="px-3 py-2.5"><div className="font-semibold text-slate-900">{c.code}</div><div className="text-slate-600">{c.name}</div></td>
                  <td className="px-3 py-2.5 text-center font-mono">{c.publishedWeeks ?? 0}/{c.totalWeeks ?? 0}</td>
                  <td className="px-3 py-2.5 text-center font-mono">{c.totalObjectives ?? 0}</td>
                  <td className="px-3 py-2.5 text-center font-mono">{c.teachingRecords ?? 0}</td>
                  <td className="px-3 py-2.5 text-center">{c.syllabusCompletionPercentage != null ? <Badge variant={c.syllabusCompletionPercentage >= 70 ? "success" : c.syllabusCompletionPercentage >= 40 ? "warning" : "danger"}>{c.syllabusCompletionPercentage}%</Badge> : "—"}</td>
                  <td className="px-3 py-2.5"><Button size="sm" variant="secondary" onClick={() => setCourseId(c.id)}>Open</Button></td></tr>))}</tbody></table></div>)}
        </Card>
      ) : detail ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold text-slate-900">{detail.course.code} · {detail.course.name}</h2><p className="text-xs text-slate-500">{detail.course.program || ""} · Semester {detail.course.semester ?? "—"}</p></div>
            <Button variant="ghost" onClick={() => setCourseId("")}>Back to courses</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <Metric label="Weeks" value={`${detail.summary.publishedWeeks}/${detail.summary.totalWeeks}`} detail="published/total" />
            <Metric label="Syllabus" value={detail.summary.syllabusCompletionPercentage != null ? `${detail.summary.syllabusCompletionPercentage}%` : "—"} />
            <Metric label="Completed" value={String(detail.summary.completedWeeks)} />
            <Metric label="Pending" value={String(detail.summary.pendingWeeks)} tone={detail.summary.pendingWeeks > 0 ? "warning" : undefined} />
            <Metric label="Objectives" value={String(detail.summary.totalObjectives)} />
            <Metric label="Teaching Records" value={String(detail.summary.teachingRecords)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
            <Card title="Weekly Lesson Plan &amp; Syllabus Tracker" icon={faClipboardCheck} padding={false}>
              {detail.weeks.length === 0 ? <div className="p-5"><EmptyState icon={faCalendarCheck} title="No lesson plan weeks" description="Create and manage course weeks in the Course Workspace (LMS). This view reads planned topics, objectives, and teaching records from those records." /></div> : (
                <div className="divide-y divide-slate-100">{detail.weeks.map((w) => (
                  <div key={w.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><div className="flex items-center gap-2"><span className="font-semibold text-slate-900">Week {w.weekNumber}: {w.title}</span><Badge variant={statusVariant(w.status)}>{w.status}</Badge>{w.completed ? <Badge variant="success">COMPLETED</Badge> : w.planned ? <Badge variant="warning">PENDING</Badge> : null}</div>
                        {w.teachingPlan && <p className="mt-1 text-xs text-slate-600"><span className="font-medium">Plan:</span> {w.teachingPlan}</p>}
                        {w.expectedOutcome && <p className="mt-1 text-xs text-slate-600"><span className="font-medium">Outcome:</span> {w.expectedOutcome}</p>}
                      </div>
                      <div className="text-right text-[11px] text-slate-500">{w.objectives.length} objective(s)<br />{w.completionEvidence}</div>
                    </div>
                    {w.objectives.length > 0 && <ul className="mt-2 space-y-1">{w.objectives.map((o) => <li key={o.id} className="text-xs text-slate-700">• {o.code ? `${o.code}: ` : ""}{o.text}</li>)}</ul>}
                    {w.teachingRecords.length > 0 && <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Actual teaching records</p>{w.teachingRecords.slice(0,3).map((r) => <p key={r.id} className="mt-1 text-xs text-emerald-900">{r.taughtOn}{r.sectionCode ? ` · ${r.sectionCode}` : ""}: {r.topic || r.materialTitle || "Teaching recorded"} ({r.fromUnit}–{r.toUnit} {r.unitLabel})</p>)}</div>}
                  </div>))}</div>)}
            </Card>

            <div className="space-y-4">
              <Card title="Recent Teaching Records" icon={faClock}>
                {detail.recentTeaching.length === 0 ? <p className="text-sm text-slate-500">No teaching progress records yet. Record what was taught from Course Workspace materials/timetable to build completion evidence.</p> : (
                  <ul className="space-y-2">{detail.recentTeaching.slice(0,10).map((r) => <li key={r.id} className="rounded-lg border border-slate-200 p-2.5 text-xs"><div className="font-medium text-slate-900">{r.taughtOn}{r.sectionCode ? ` · Sec ${r.sectionCode}` : ""}</div><div className="mt-0.5 text-slate-700">{r.topic || r.materialTitle || "Teaching session"} · {r.fromUnit}–{r.toUnit} {r.unitLabel}</div>{r.sessionName && <div className="text-slate-500">{r.sessionName}</div>}</li>)}</ul>)}
              </Card>
              <Card title="Timetable Sessions" icon={faCalendarCheck}>
                {detail.timetableSessions.length === 0 ? <p className="text-sm text-slate-500">No timetable sessions found for this course.</p> : (
                  <ul className="space-y-2">{detail.timetableSessions.slice(0,8).map((s) => <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5 text-xs"><div><div className="font-medium text-slate-900">{s.date || s.day} · {s.startTime || "—"}–{s.endTime || ""}</div><div className="text-slate-500">Sec {s.sectionCode}{s.room ? ` · ${s.room}` : ""}{s.sessionType ? ` · ${s.sessionType}` : ""}</div></div><Badge variant={s.status === "CANCELLED" ? "danger" : "neutral"}>{s.status}</Badge></li>)}</ul>)}
              </Card>
              <Card title="Attendance/Session Links" icon={faCalendarCheck}>
                {detail.attendanceSessions.length === 0 ? <p className="text-sm text-slate-500">No attendance sessions found for this course.</p> : (
                  <ul className="space-y-2">{detail.attendanceSessions.slice(0,8).map((s) => <li key={s.id} className="rounded-lg border border-slate-200 p-2.5 text-xs"><div className="font-medium text-slate-900">{s.date} · Sec {s.sectionCode}</div><div className="text-slate-500">{s.topic || "No topic recorded"} · {s.status}</div></li>)}</ul>)}
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
};

const Metric: React.FC<{ label: string; value: string; detail?: string; tone?: "warning" | "danger" }> = ({ label, value, detail, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-2xl font-semibold ${tone === "warning" ? "text-amber-700" : tone === "danger" ? "text-red-700" : "text-slate-900"}`}>{value}</p>{detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}</div>
);
