import React, { useCallback, useEffect, useState } from "react";
import { faBell, faRotateRight, faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { CardSkeleton } from "../ui/Skeleton";
import { apiRequest } from "../../services/apiClient";

type FAlert = { id: string; module: string; event: string; severity: string; status: string; reason: string; evidence: { key: string; label: string; value: any; threshold?: any }[]; recommendedInvestigation: string; resolutionNotes?: string; affectedRecord?: { identifier?: string; label?: string } | null; createdAt?: string };

export const FacultyAlertsView: React.FC = () => {
  const [alerts, setAlerts] = useState<FAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const res = await apiRequest<{ alerts: FAlert[] }>("/faculty/alerts?status=all"); setAlerts(res.alerts || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load alerts."); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const generate = async () => { setBusy("gen"); setError(""); try { await apiRequest("/faculty/alerts/generate", { method: "POST", body: JSON.stringify({}) }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Failed to generate alerts."); } finally { setBusy(""); } };
  const review = async (id: string, status: string) => { setBusy(id); try { await apiRequest(`/faculty/alerts/${id}/review`, { method: "PATCH", body: JSON.stringify({ status, note: `Marked ${status} from faculty alerts review.` }) }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Failed to update alert."); } finally { setBusy(""); } };
  const sev = (s: string) => s === "CRITICAL" || s === "HIGH" ? "danger" : s === "MEDIUM" ? "warning" : "info";
  return (
    <section className="cos-page">
      <header className="cos-page-header"><div><p className="cos-eyebrow">Core Academic Management</p><h1 className="cos-page-title">Alerts &amp; Review Queue</h1><p className="cos-page-subtitle">Persisted, reviewable alerts generated from attendance/assessment/assignment evidence. Alerts never auto-mutate marks, attendance, or academic standing.</p></div><div className="flex gap-2"><Button variant="secondary" icon={faRotateRight} onClick={() => void load()}>Refresh</Button><Button icon={faCheckCircle} onClick={() => void generate()} disabled={busy==="gen"}>{busy==="gen"?"Generating...":"Generate Alerts"}</Button></div></header>
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {loading ? <div className="grid gap-4 sm:grid-cols-2" aria-busy="true"><CardSkeleton /><CardSkeleton /></div> : (
        <Card title="Persisted Alerts" icon={faBell} padding={false}>
          {alerts.length === 0 ? <div className="p-5"><EmptyState icon={faBell} title="No alerts in scope" description="Generate deterministic alerts from current student evidence, or review alerts created by system/faculty workflows." actionLabel="Generate Alerts" onAction={() => void generate()} /></div> : (
            <div className="divide-y divide-slate-100">{alerts.map((a) => (
              <div key={a.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{a.event}</span><Badge variant={sev(a.severity) as any}>{a.severity}</Badge><Badge variant={a.status==="RESOLVED"||a.status==="FALSE_POSITIVE"?"neutral":"warning"}>{a.status}</Badge><Badge variant="neutral">{a.module}</Badge></div>{a.affectedRecord && <div className="mt-0.5 text-xs text-slate-500">{a.affectedRecord.label || a.affectedRecord.identifier}</div>}</div><div className="text-[11px] text-slate-500">{a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}</div></div>
                <p className="mt-2 text-xs text-slate-700">{a.reason}</p>
                {a.evidence?.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{a.evidence.map((e,i)=><Badge key={i} variant="neutral">{e.label}: {String(e.value)}{e.threshold!=null?` (thr ${e.threshold})`:""}</Badge>)}</div>}
                {a.recommendedInvestigation && <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5 text-xs text-indigo-900"><strong>Recommended action (advisory):</strong> {a.recommendedInvestigation}</div>}
                {a.resolutionNotes && <p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap"><strong>Resolution notes:</strong> {a.resolutionNotes}</p>}
                <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busy===a.id} onClick={() => void review(a.id,"ACKNOWLEDGED")}>Acknowledge</Button><Button size="sm" variant="secondary" disabled={busy===a.id} onClick={() => void review(a.id,"INVESTIGATING")}>Investigating</Button><Button size="sm" disabled={busy===a.id} onClick={() => void review(a.id,"RESOLVED")}>Resolve</Button><Button size="sm" variant="ghost" disabled={busy===a.id} onClick={() => void review(a.id,"FALSE_POSITIVE")}>False Positive</Button></div>
              </div>))}</div>)}
        </Card>
      )}
    </section>
  );
};