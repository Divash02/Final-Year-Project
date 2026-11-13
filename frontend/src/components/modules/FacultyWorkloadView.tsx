import React, { useCallback, useEffect, useState } from "react";
import { faBriefcase, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { CardSkeleton } from "../ui/Skeleton";
import { apiRequest } from "../../services/apiClient";

export const FacultyWorkloadView: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await apiRequest("/faculty/workload")); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load workload."); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <section className="cos-page">
      <header className="cos-page-header"><div><p className="cos-eyebrow">Administration &amp; Governance</p><h1 className="cos-page-title">Faculty Workload &amp; Performance</h1><p className="cos-page-subtitle">Teaching hours, courses/sections, timetable, assessment workload, pending marking, teaching records, and advising activity. Faculty see own data; HoD/management scope is backend-authorized.</p></div><Button variant="secondary" icon={faRotateRight} onClick={() => void load()}>Refresh</Button></header>
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true"><CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton /></div> : data ? <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Assigned Courses" value={String(data.summary.assignedCourses)} />
          <Metric label="Weekly Teaching Hours" value={String(data.summary.weeklyTeachingHours)} detail={`${data.summary.practicalLabHours} lab/practical hrs`} />
          <Metric label="Pending Marking" value={String(data.summary.pendingMarkingSubmissions)} detail="submitted/ungraded items (scoped)" />
          <Metric label="Advising Sessions" value={String(data.summary.advisingSessions)} detail={`${data.summary.teachingRecords} teaching records`} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Assigned Courses & Responsibilities" icon={faBriefcase} padding={false}>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-100 text-slate-700 uppercase font-semibold"><tr><th className="px-3 py-2.5">Course</th><th className="px-3 py-2.5 text-center">Sessions</th><th className="px-3 py-2.5 text-center">Teaching</th><th className="px-3 py-2.5 text-center">Assessment</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{(data.courses||[]).map((c:any)=><tr key={c.id}><td className="px-3 py-2.5"><div className="font-semibold text-slate-900">{c.code}</div><div className="text-slate-600">{c.name}</div>{c.sections?.length ? <div className="text-[11px] text-slate-500">Sections: {c.sections.join(", ")}</div> : null}</td><td className="px-3 py-2.5 text-center font-mono">{c.timetableSessions}</td><td className="px-3 py-2.5 text-center font-mono">{c.teachingRecords}</td><td className="px-3 py-2.5 text-center"><Badge variant={c.assessment?.draft>0?"warning":"neutral"}>{c.assessment?.draft||0} draft / {c.assessment?.submitted||0} submitted</Badge></td></tr>)}
              {!data.courses?.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No assigned courses found from teaching assignment records.</td></tr>}</tbody></table></div>
          </Card>
          <Card title="Weekly Schedule (from Timetable)" icon={faBriefcase}>
            <ul className="space-y-2 text-xs">{(data.timetable||[]).slice(0,12).map((s:any)=><li key={s.id} className="rounded-lg border border-slate-200 p-2.5"><div className="font-medium text-slate-900">{s.date||s.day} · {s.startTime||"—"}â€“{s.endTime||""}</div><div className="text-slate-500">{s.course?.code||""} {s.sectionCode?`· Sec ${s.sectionCode}`:""}{s.room?` · ${s.room}`:""}{s.sessionType?` · ${s.sessionType}`:""}</div></li>)}
            {!data.timetable?.length && <li className="text-slate-500">No timetable sessions found.</li>}</ul>
            {data.departmentSummary && <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><strong>Authorized scope:</strong> {data.departmentSummary.note}</div>}
          </Card>
        </div>
      </> : null}
    </section>
  );
};
const Metric: React.FC<{ label: string; value: string; detail?: string }> = ({ label, value, detail }) => (<div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>{detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}</div>);
