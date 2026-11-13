import React, { useCallback, useEffect, useState } from "react";
import { faCalendarDays, faRotateRight, faPlus } from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { CardSkeleton } from "../ui/Skeleton";
import { Modal } from "../ui/Modal";
import { apiRequest } from "../../services/apiClient";
import { useCollegeOS } from "../../context/CollegeOSContext";

type Room = { _id: string; name: string; roomNumber?: string; roomType?: string; capacity?: number; status?: string; building?: string };
type Reservation = { _id: string; roomId?: any; date: string; startTime: string; endTime: string; purpose?: string; status: string; department?: string; requesterName?: string };

export const ResourceBookingView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const roles = (currentUser?.roles || []) as string[];
  const canManage = roles.some((r) => ["super_admin", "campus_admin", "dean", "hod", "registrar"].includes(r));
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [draft, setDraft] = useState({ roomId: "", date: "", startTime: "09:00", endTime: "10:00", purpose: "", department: "", expectedParticipants: 1, requiredEquipmentText: "" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [roomsRes, resRes] = await Promise.all([
        apiRequest<{ rooms: Room[] }>("/facilities/rooms"),
        apiRequest<{ reservations: Reservation[] }>("/facilities/reservations"),
      ]);
      setRooms(roomsRes.rooms || []); setReservations(resRes.reservations || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load facilities/reservations. Check facilities permissions."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!draft.roomId || !draft.date || !draft.startTime || !draft.endTime || !draft.purpose) return setError("Room, date, time, and purpose are required.");
    setSaving(true); setError("");
    try {
      await apiRequest("/facilities/reservations", { method: "POST", body: JSON.stringify({ roomId: draft.roomId, date: draft.date, startTime: draft.startTime, endTime: draft.endTime, purpose: draft.purpose, department: draft.department, expectedParticipants: Number(draft.expectedParticipants) || 1, requiredEquipment: draft.requiredEquipmentText.split(",").map((s) => s.trim()).filter(Boolean) }) });
      setShow(false); setDraft({ roomId: "", date: "", startTime: "09:00", endTime: "10:00", purpose: "", department: "", expectedParticipants: 1, requiredEquipmentText: "" }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Booking failed. Backend enforces availability, conflicts, and double-booking locks."); } finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: "Approved" | "Rejected" | "Cancelled" | "Completed") => {
    setBusyId(id); setError("");
    try { await apiRequest(`/facilities/reservations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Status update failed (requires facilities.manage and a valid transition)."); }
    finally { setBusyId(""); }
  };

  return (
    <section className="cos-page">
      <header className="cos-page-header"><div><p className="cos-eyebrow">Administration &amp; Governance</p><h1 className="cos-page-title">Classroom &amp; Lab Resource Booking</h1><p className="cos-page-subtitle">Room/lab reservations via existing facilities APIs with backend conflict/lock checks, approval workflow, and history.</p></div><div className="flex gap-2"><Button variant="secondary" icon={faRotateRight} onClick={() => void load()}>Refresh</Button><Button icon={faPlus} onClick={() => setShow(true)}>New Booking</Button></div></header>
      {error && <Alert variant={/conflict|unavailable|double|failed/i.test(error) ? "warning" : "error"} onDismiss={() => setError("")}>{error}</Alert>}
      {loading ? <div className="grid gap-4 sm:grid-cols-2" aria-busy="true"><CardSkeleton /><CardSkeleton /></div> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Rooms & Labs" icon={faCalendarDays} padding={false}>
            <div className="max-h-[520px] overflow-auto divide-y divide-slate-100">{rooms.map((r) => <div key={r._id} className="p-3 text-sm"><div className="flex items-center justify-between gap-2"><div><div className="font-semibold text-slate-900">{r.name} {r.roomNumber ? `(${r.roomNumber})` : ""}</div><div className="text-xs text-slate-500">{r.roomType || "Room"}{r.capacity ? ` · Capacity ${r.capacity}` : ""}{r.building ? ` · ${r.building}` : ""}</div></div><Badge variant={r.status === "Available" || r.status === "Ready" ? "success" : r.status === "Maintenance" || r.status === "Unavailable" ? "danger" : "warning"}>{r.status || "Unknown"}</Badge></div></div>)}
            {!rooms.length && <div className="p-5 text-sm text-slate-500">No rooms found or facilities access is restricted.</div>}</div>
          </Card>
          <Card title="Reservation History" icon={faCalendarDays} padding={false}>
            <div className="max-h-[520px] overflow-auto divide-y divide-slate-100">{reservations.map((r) => <div key={r._id} className="p-3 text-sm"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-slate-900">{r.roomId?.name || r.roomId?.roomNumber || "Room"} · {new Date(r.date).toLocaleDateString()}</div><div className="text-xs text-slate-500">{r.startTime}–{r.endTime}{r.department ? ` · ${r.department}` : ""}{r.requesterName ? ` · ${r.requesterName}` : ""}</div><p className="mt-1 text-xs text-slate-700">{r.purpose}</p></div><Badge variant={r.status === "Approved" ? "success" : r.status === "Rejected" || r.status === "Cancelled" ? "danger" : r.status === "Completed" ? "neutral" : "warning"}>{r.status}</Badge></div>
              {canManage && r.status === "Pending" && <div className="mt-2 flex flex-wrap gap-1.5"><Button size="sm" disabled={busyId===r._id} onClick={() => void updateStatus(r._id, "Approved")}>Approve</Button><Button size="sm" variant="secondary" disabled={busyId===r._id} onClick={() => void updateStatus(r._id, "Rejected")}>Reject</Button><Button size="sm" variant="ghost" disabled={busyId===r._id} onClick={() => void updateStatus(r._id, "Cancelled")}>Cancel</Button></div>}
              {canManage && r.status === "Approved" && <div className="mt-2 flex flex-wrap gap-1.5"><Button size="sm" variant="secondary" disabled={busyId===r._id} onClick={() => void updateStatus(r._id, "Completed")}>Mark Completed</Button><Button size="sm" variant="ghost" disabled={busyId===r._id} onClick={() => void updateStatus(r._id, "Cancelled")}>Cancel</Button></div>}
              {!canManage && r.status === "Pending" && <p className="mt-2 text-[11px] text-slate-500">Awaiting approval by authorized facilities staff.</p>}
            </div>)}
            {!reservations.length && <div className="p-5 text-sm text-slate-500">No reservations found for your access scope.</div>}</div>
          </Card>
        </div>
      )}
      <Modal isOpen={show} onClose={() => setShow(false)} title="New Resource Booking" maxWidth="2xl" footer={<><Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button><Button onClick={() => void create()} disabled={saving}>{saving?"Submitting...":"Submit Booking"}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">Room/Lab<select className="cos-input mt-1" value={draft.roomId} onChange={(e)=>setDraft(d=>({...d,roomId:e.target.value}))}><option value="">Select room</option>{rooms.map(r=><option key={r._id} value={r._id}>{r.name} {r.roomNumber?`(${r.roomNumber})`:""} · {r.roomType||"Room"} · Cap {r.capacity||"—"}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600">Date<input type="date" className="cos-input mt-1" value={draft.date} onChange={(e)=>setDraft(d=>({...d,date:e.target.value}))} /></label>
          <label className="text-xs font-medium text-slate-600">Expected Participants<input type="number" min={1} className="cos-input mt-1" value={draft.expectedParticipants} onChange={(e)=>setDraft(d=>({...d,expectedParticipants:Number(e.target.value)||1}))} /></label>
          <label className="text-xs font-medium text-slate-600">Start<input type="time" className="cos-input mt-1" value={draft.startTime} onChange={(e)=>setDraft(d=>({...d,startTime:e.target.value}))} /></label>
          <label className="text-xs font-medium text-slate-600">End<input type="time" className="cos-input mt-1" value={draft.endTime} onChange={(e)=>setDraft(d=>({...d,endTime:e.target.value}))} /></label>
          <label className="text-xs font-medium text-slate-600">Department<input className="cos-input mt-1" value={draft.department} onChange={(e)=>setDraft(d=>({...d,department:e.target.value}))} /></label>
          <label className="text-xs font-medium text-slate-600">Equipment (comma-separated)<input className="cos-input mt-1" value={draft.requiredEquipmentText} onChange={(e)=>setDraft(d=>({...d,requiredEquipmentText:e.target.value}))} placeholder="Projector, mic" /></label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">Purpose<textarea className="cos-input mt-1 min-h-[80px]" value={draft.purpose} onChange={(e)=>setDraft(d=>({...d,purpose:e.target.value}))} /></label>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">Backend checks operating hours, capacity, maintenance closures, overlapping approved reservations, and uses room booking locks to prevent double bookings. Status transitions require <code>facilities.manage</code>.</p>
      </Modal>
    </section>
  );
};
