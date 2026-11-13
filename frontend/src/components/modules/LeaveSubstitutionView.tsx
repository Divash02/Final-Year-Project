import React, { useCallback, useEffect, useState } from "react";
import { faFileContract, faRotateRight, faPlus } from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { CardSkeleton } from "../ui/Skeleton";
import { Modal } from "../ui/Modal";
import { apiRequest } from "../../services/apiClient";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useFormValidationFocus } from "../../hooks/useFormValidation";

type Leave = { id: string; leaveType: string; startDate: string; endDate: string; reason: string; status: string; comments?: string | null };
type Sub = { id: string; requesterName: string; replacementName: string; replacementAvailability: string; affectedSessionCount: number; leaveReason: string; status: string; hodApprovalStatus: string; academicAdminStatus: string; timetableUpdated: boolean; affectedSessions: any[] };
type Session = { id: string; date?: string | null; day: string; startTime?: string | null; endTime?: string | null; sectionCode: string; room?: string | null; course?: { code: string; name: string } | null };
type FacultyOpt = { id: string; name: string };

const sVar = (s: string) => ["APPROVED","COMPLETED","COORDINATED"].includes(s) ? "success" as const : ["REJECTED","CONFLICT","CANCELLED"].includes(s) ? "danger" as const : ["PENDING","PENDING_HOD","PENDING_ACADEMIC_ADMIN","PENDING_CHECK"].includes(s) ? "warning" as const : "info" as const;

export const LeaveSubstitutionView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const roles = (currentUser?.roles || []) as string[];
  const canHod = roles.some((r) => ["hod", "super_admin", "dean"].includes(r));
  const canAcademic = roles.some((r) => ["academic_admin", "registrar", "super_admin", "dean"].includes(r));
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [mySessions, setMySessions] = useState<Session[]>([]);
  const [facultyOptions, setFacultyOptions] = useState<FacultyOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showLeave, setShowLeave] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [leaveDraft, setLeaveDraft] = useState({ leaveType: "casual", startDate: "", endDate: "", reason: "" });
  const [subDraft, setSubDraft] = useState({ startDate: "", endDate: "", reason: "", replacementFacultyUserId: "", affectedSessionIds: [] as string[] });
  const { formRef: leaveFormRef, focusFirstInvalid: focusFirstInvalidLeave } = useFormValidationFocus();
  const { formRef: subFormRef, focusFirstInvalid: focusFirstInvalidSub } = useFormValidationFocus();

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiRequest<{ leaves: Leave[]; substitutions: Sub[]; mySessions: Session[]; facultyOptions: FacultyOpt[] }>("/faculty/leave-substitution");
      setLeaves(res.leaves || []); setSubs(res.substitutions || []); setMySessions(res.mySessions || []); setFacultyOptions(res.facultyOptions || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load leave/substitution data."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const createLeave = async () => {
    if (!leaveDraft.startDate || !leaveDraft.endDate || !leaveDraft.reason) {
      setError("Leave type, dates, and reason are required.");
      focusFirstInvalidLeave();
      return;
    }
    setSaving(true); setError("");
    try { await apiRequest("/faculty/leave-substitution/leave", { method: "POST", body: JSON.stringify(leaveDraft) }); setShowLeave(false); setLeaveDraft({ leaveType: "casual", startDate: "", endDate: "", reason: "" }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to submit leave."); } finally { setSaving(false); }
  };
  const createSub = async () => {
    if (!subDraft.reason) {
      setError("Reason is required.");
      focusFirstInvalidSub();
      return;
    }
    setSaving(true); setError("");
    try {
      const res = await apiRequest<{ substitution: Sub; replacementAvailability?: string }>("/faculty/leave-substitution", { method: "POST", body: JSON.stringify(subDraft) });
      setShowSub(false); setSubDraft({ startDate: "", endDate: "", reason: "", replacementFacultyUserId: "", affectedSessionIds: [] });
      if (res.replacementAvailability === "CONFLICT") setError("Substitution created, but replacement faculty has a timetable conflict for selected sessions.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to create substitution."); } finally { setSaving(false); }
  };
  const review = async (id: string, action: string) => {
    const notes = window.prompt("Notes (optional):") || "";
    setBusyId(id); setError("");
    try { await apiRequest(`/faculty/leave-substitution/${id}/review`, { method: "PATCH", body: JSON.stringify({ action, notes }) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Review action failed (check role/permission)."); } finally { setBusyId(""); }
  };

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div className="min-w-0"><p className="cos-eyebrow">Administration &amp; Governance</p><h1 className="cos-page-title">Leave &amp; Class Substitution</h1><p className="cos-page-subtitle">HR leave requests, affected timetable sessions, replacement availability/conflict checks, and HoD ? Academic Admin substitution coordination.</p></div>
        <div className="flex gap-2"><Button variant="secondary" icon={faRotateRight} onClick={() => void load()}>Refresh</Button><Button variant="secondary" icon={faPlus} onClick={() => setShowLeave(true)}>Leave Request</Button><Button icon={faPlus} onClick={() => setShowSub(true)}>Substitution</Button></div>
      </header>
      {error && <Alert variant={/conflict/i.test(error) ? "warning" : "error"} onDismiss={() => setError("")}>{error}</Alert>}
      {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="My Leave Requests" icon={faFileContract} padding={false}>
            {leaves.length === 0 ? <div className="p-5"><EmptyState icon={faFileContract} title="No leave requests" description="Submit leave requests here. HR approval remains a separate workflow." actionLabel="New Leave Request" onAction={() => setShowLeave(true)} /></div> : (
              <div className="divide-y divide-slate-100">{leaves.map((l) => <div key={l.id} className="p-4 text-sm"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-slate-900 capitalize">{l.leaveType} leave</div><div className="text-xs text-slate-500">{new Date(l.startDate).toLocaleDateString()} â€“ {new Date(l.endDate).toLocaleDateString()}</div><p className="mt-1 text-xs text-slate-700">{l.reason}</p></div><Badge variant={sVar(l.status)}>{l.status}</Badge></div></div>)}</div>)}
          </Card>
          <Card title="Class Substitution Requests" icon={faFileContract} padding={false}>
            {subs.length === 0 ? <div className="p-5"><EmptyState icon={faFileContract} title="No substitution requests" description="Create substitution requests for affected classes and coordinate replacement faculty with conflict checks." actionLabel="New Substitution" onAction={() => setShowSub(true)} /></div> : (
              <div className="divide-y divide-slate-100">{subs.map((s) => <div key={s.id} className="p-4 text-sm"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-slate-900">{s.affectedSessionCount} affected session(s){s.replacementName ? ` · ${s.replacementName}` : ""}</div><div className="text-xs text-slate-500">HoD: {s.hodApprovalStatus} · Academic Admin: {s.academicAdminStatus}{s.timetableUpdated ? " · Timetable updated" : ""}</div><p className="mt-1 text-xs text-slate-700">{s.leaveReason}</p></div><div className="flex flex-col items-end gap-1"><Badge variant={sVar(s.status)}>{s.status}</Badge>{s.replacementAvailability && <Badge variant={sVar(s.replacementAvailability)}>{s.replacementAvailability}</Badge>}</div></div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {canHod && s.status === "PENDING_HOD" && <><Button size="sm" disabled={busyId===s.id} onClick={() => void review(s.id, "hod_approve")}>HoD Approve</Button><Button size="sm" variant="secondary" disabled={busyId===s.id} onClick={() => void review(s.id, "hod_reject")}>HoD Reject</Button></>}
                  {canAcademic && s.status === "PENDING_ACADEMIC_ADMIN" && <Button size="sm" disabled={busyId===s.id} onClick={() => void review(s.id, "academic_coordinate")}>Mark Coordinated</Button>}
                </div>
              </div>)}</div>)}
          </Card>
        </div>
      )}

      <Modal isOpen={showLeave} onClose={() => setShowLeave(false)} title="Submit Leave Request" maxWidth="lg" isForm footer={<><Button variant="secondary" onClick={() => setShowLeave(false)}>Cancel</Button><Button onClick={() => void createLeave()} disabled={saving}>{saving?"Submitting...":"Submit"}</Button></>}>
        <form ref={leaveFormRef} onSubmit={(e) => { e.preventDefault(); createLeave(); }} className="grid gap-3 sm:grid-cols-2" noValidate>
          <label className="text-xs font-medium text-slate-600">Leave Type<select required className="cos-input mt-1" value={leaveDraft.leaveType} onChange={(e)=>setLeaveDraft(d=>({...d,leaveType:e.target.value}))}>{["annual","sick","casual","maternity","paternity","unpaid","other"].map(t=><option key={t} value={t}>{t}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600">Start Date<input required type="date" className="cos-input mt-1" value={leaveDraft.startDate} onChange={(e)=>setLeaveDraft(d=>({...d,startDate:e.target.value}))} /></label>
          <label className="text-xs font-medium text-slate-600">End Date<input required type="date" className="cos-input mt-1" value={leaveDraft.endDate} onChange={(e)=>setLeaveDraft(d=>({...d,endDate:e.target.value}))} /></label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">Reason<textarea required className="cos-input mt-1 min-h-[90px]" value={leaveDraft.reason} onChange={(e)=>setLeaveDraft(d=>({...d,reason:e.target.value}))} /></label>
        </form>
        <p className="mt-3 text-[11px] text-slate-500">HR approves leave; academic timetable coordination/substitution is handled separately through the substitution workflow.</p>
      </Modal>

      <Modal isOpen={showSub} onClose={() => setShowSub(false)} title="Create Substitution Request" maxWidth="3xl" isForm footer={<><Button variant="secondary" onClick={() => setShowSub(false)}>Cancel</Button><Button onClick={() => void createSub()} disabled={saving}>{saving?"Creating...":"Create Request"}</Button></>}>
        <form ref={subFormRef} onSubmit={(e) => { e.preventDefault(); createSub(); }} className="grid gap-3 sm:grid-cols-2" noValidate>
          <label className="text-xs font-medium text-slate-600">Start Date<input type="date" className="cos-input mt-1" value={subDraft.startDate} onChange={(e)=>setSubDraft(d=>({...d,startDate:e.target.value}))} /></label>
          <label className="text-xs font-medium text-slate-600">End Date<input type="date" className="cos-input mt-1" value={subDraft.endDate} onChange={(e)=>setSubDraft(d=>({...d,endDate:e.target.value}))} /></label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">Replacement Faculty (optional)<select className="cos-input mt-1" value={subDraft.replacementFacultyUserId} onChange={(e)=>setSubDraft(d=>({...d,replacementFacultyUserId:e.target.value}))}><option value="">Select replacement</option>{facultyOptions.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">Affected Sessions (timetable)<select multiple className="cos-input mt-1 min-h-[140px]" value={subDraft.affectedSessionIds} onChange={(e)=>setSubDraft(d=>({...d,affectedSessionIds:Array.from(e.target.selectedOptions).map(o=>o.value)}))}>{mySessions.map(s=><option key={s.id} value={s.id}>{s.date||s.day} {s.startTime||""}-{s.endTime||""} · {s.course?.code||"Course"} · Sec {s.sectionCode}</option>)}</select><span className="mt-1 block text-[11px] text-slate-500">Selected sessions are checked for replacement timetable conflicts at creation.</span></label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">Reason<textarea required className="cos-input mt-1 min-h-[80px]" value={subDraft.reason} onChange={(e)=>setSubDraft(d=>({...d,reason:e.target.value}))} /></label>
        </form>
      </Modal>
    </section>
  );
};
