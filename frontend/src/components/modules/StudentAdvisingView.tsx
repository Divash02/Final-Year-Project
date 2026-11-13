import React, { useCallback, useEffect, useState } from "react";
import { faUserGroup, faPlus, faRotateRight, faCalendarDays } from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { CardSkeleton } from "../ui/Skeleton";
import { Modal } from "../ui/Modal";
import { apiRequest } from "../../services/apiClient";

interface StudentOpt { id: string; studentCode: string; name: string; program?: string; semester?: number; section?: string }
interface Session {
  id: string; studentName?: string | null; studentCode?: string | null; studentProgram?: string | null; studentSection?: string | null;
  consultationType: string; title: string; description?: string; scheduledDate: string; scheduledTime?: string; mode: string; location?: string;
  status: string; facultyNotes?: string; actionItems: { description: string; completed: boolean }[]; followUpDate?: string | null; referredTo?: string;
}
const statusVariant = (s: string) => s === "COMPLETED" ? "success" as const : s === "CANCELLED" || s === "NO_SHOW" ? "danger" as const : s === "RESCHEDULED" ? "warning" as const : "info" as const;

export const StudentAdvisingView: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<StudentOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Session | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ studentId: "", title: "", description: "", consultationType: "ACADEMIC_ADVISING", scheduledDate: "", scheduledTime: "", mode: "IN_PERSON", location: "", facultyNotes: "" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiRequest<{ sessions: Session[]; students: StudentOpt[] }>("/faculty/advising");
      setSessions(res.sessions || []); setStudents(res.students || []);
      setSelected((cur) => cur ? (res.sessions || []).find((s) => s.id === cur.id) || null : null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load advising records."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!draft.studentId || !draft.title || !draft.scheduledDate) return setError("Student, title, and scheduled date are required.");
    setSaving(true); setError("");
    try {
      await apiRequest("/faculty/advising", { method: "POST", body: JSON.stringify(draft) });
      setShowCreate(false); setDraft({ studentId: "", title: "", description: "", consultationType: "ACADEMIC_ADVISING", scheduledDate: "", scheduledTime: "", mode: "IN_PERSON", location: "", facultyNotes: "" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to create advising session."); }
    finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: string, notes?: string) => {
    try {
      await apiRequest(`/faculty/advising/${id}`, { method: "PATCH", body: JSON.stringify({ status, ...(notes != null ? { facultyNotes: notes } : {}) }) });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to update session."); }
  };

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div className="min-w-0"><p className="cos-eyebrow">People &amp; Enrolment</p><h1 className="cos-page-title">Student Advising &amp; Consultation</h1><p className="cos-page-subtitle">Consultation requests/appointments, advising notes, follow-ups, and referrals. Private records are restricted by backend authorization.</p></div>
        <div className="flex gap-2"><Button variant="secondary" icon={faRotateRight} onClick={() => void load()}>Refresh</Button><Button icon={faPlus} onClick={() => setShowCreate(true)}>New Session</Button></div>
      </header>
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
          <Card title="Consultation Queue & History" icon={faUserGroup} padding={false}>
            {sessions.length === 0 ? <div className="p-5"><EmptyState icon={faUserGroup} title="No advising sessions" description="Schedule consultations, record advising notes, and track follow-up actions for assigned students." actionLabel="New Session" onAction={() => setShowCreate(true)} /></div> : (
              <div className="divide-y divide-slate-100">{sessions.map((s) => (
                <button key={s.id} type="button" className={`w-full p-4 text-left hover:bg-slate-50 ${selected?.id === s.id ? "bg-indigo-50/60" : ""}`} onClick={() => setSelected(s)}>
                  <div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-slate-900">{s.title}</div><div className="text-xs text-slate-600">{s.studentName || "Student"}{s.studentCode ? ` · ${s.studentCode}` : ""}{s.studentSection ? ` · Sec ${s.studentSection}` : ""}</div><div className="mt-1 text-xs text-slate-500">{new Date(s.scheduledDate).toLocaleString()} {s.scheduledTime ? `· ${s.scheduledTime}` : ""} · {s.mode}</div></div><Badge variant={statusVariant(s.status)}>{s.status}</Badge></div>
                </button>))}</div>)}
          </Card>
          <Card title={selected ? "Session Details" : "Select a Session"} icon={faCalendarDays}>
            {!selected ? <EmptyState icon={faCalendarDays} title="No session selected" description="Select a consultation to review notes, concerns, follow-ups, and update status." /> : (
              <div className="space-y-3 text-sm">
                <div><div className="font-semibold text-slate-900">{selected.studentName}</div><div className="text-xs text-slate-500">{selected.consultationType} · {selected.mode}{selected.location ? ` · ${selected.location}` : ""}</div></div>
                {selected.description && <p className="text-xs text-slate-700">{selected.description}</p>}
                <label className="block text-xs font-medium text-slate-600">Advising notes (private)
                  <textarea className="cos-input mt-1 min-h-[90px]" defaultValue={selected.facultyNotes || ""} onBlur={(e) => { if (e.target.value !== (selected.facultyNotes || "")) void updateStatus(selected.id, selected.status, e.target.value); }} />
                </label>
                <div className="flex flex-wrap gap-2">
                  {["SCHEDULED","COMPLETED","RESCHEDULED","CANCELLED"].map((st) => <Button key={st} size="sm" variant={selected.status===st?"primary":"secondary"} onClick={() => void updateStatus(selected.id, st)}>{st}</Button>)}
                </div>
                {selected.followUpDate && <p className="text-xs text-slate-600">Follow-up: {new Date(selected.followUpDate).toLocaleDateString()}</p>}
                {selected.referredTo && <p className="text-xs text-slate-600">Referral: {selected.referredTo}</p>}
              </div>)}
          </Card>
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Advising Session" maxWidth="2xl" footer={<><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button><Button onClick={() => void create()} disabled={saving}>{saving ? "Saving..." : "Create Session"}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">Student<select className="cos-input mt-1" value={draft.studentId} onChange={(e) => setDraft((d) => ({ ...d, studentId: e.target.value }))}><option value="">Select student</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.studentCode}{s.section ? ` · ${s.section}` : ""}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">Title<input className="cos-input mt-1" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} /></label>
          <label className="text-xs font-medium text-slate-600">Type<select className="cos-input mt-1" value={draft.consultationType} onChange={(e) => setDraft((d) => ({ ...d, consultationType: e.target.value }))}>{["ACADEMIC_ADVISING","CAREER_COUNSELING","PERSONAL_SUPPORT","ACADEMIC_INTERVENTION","COURSE_SELECTION","OTHER"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600">Mode<select className="cos-input mt-1" value={draft.mode} onChange={(e) => setDraft((d) => ({ ...d, mode: e.target.value }))}>{["IN_PERSON","ONLINE","PHONE","GROUP"].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600">Date<input type="date" className="cos-input mt-1" value={draft.scheduledDate} onChange={(e) => setDraft((d) => ({ ...d, scheduledDate: e.target.value }))} /></label>
          <label className="text-xs font-medium text-slate-600">Time<input type="time" className="cos-input mt-1" value={draft.scheduledTime} onChange={(e) => setDraft((d) => ({ ...d, scheduledTime: e.target.value }))} /></label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">Location<input className="cos-input mt-1" value={draft.location} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} /></label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">Description<textarea className="cos-input mt-1 min-h-[80px]" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} /></label>
        </div>
      </Modal>
    </section>
  );
};
