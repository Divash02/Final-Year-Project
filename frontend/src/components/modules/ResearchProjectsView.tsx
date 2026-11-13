import React, { useCallback, useEffect, useState } from "react";
import { faGraduationCap, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { CardSkeleton } from "../ui/Skeleton";
import { apiRequest } from "../../services/apiClient";

type Project = { id: string; title: string; description?: string; objectives?: string; status: string; course?: { code: string; name: string } | null; group?: { name: string } | null; submittedBy?: { name: string } | null; reviewFeedback?: string; rejectionReason?: string; updatedAt?: string };
const v = (s: string) => s==="APPROVED"?"success":s==="REJECTED"?"danger":s==="REVISION_REQUIRED"?"warning":s==="SUBMITTED"||s==="UNDER_REVIEW"?"info":"neutral";

export const ResearchProjectsView: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const res = await apiRequest<{ projects: Project[] }>("/faculty/research-projects"); setProjects(res.projects || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load projects."); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const review = async (id: string, status: string) => {
    const feedback = status === "REVISION_REQUIRED" || status === "REJECTED" ? window.prompt("Feedback / reason (optional):") || "" : "";
    setBusyId(id); setError("");
    try { await apiRequest(`/faculty/research-projects/${id}/review`, { method: "PATCH", body: JSON.stringify({ status, reviewFeedback: feedback, rejectionReason: status==="REJECTED"?feedback:"" }) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Review failed."); } finally { setBusyId(""); }
  };

  return (
    <section className="cos-page">
      <header className="cos-page-header"><div><p className="cos-eyebrow">Research &amp; Development</p><h1 className="cos-page-title">Research &amp; Projects</h1><p className="cos-page-subtitle">Supervised project proposals, review status, feedback, and approval workflow integrated with existing project records.</p></div><Button variant="secondary" icon={faRotateRight} onClick={() => void load()}>Refresh</Button></header>
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {loading ? <div className="grid gap-4 sm:grid-cols-2" aria-busy="true"><CardSkeleton /><CardSkeleton /></div> : (
        <Card title="Project Portfolio / Review Queue" icon={faGraduationCap} padding={false}>
          {projects.length === 0 ? <div className="p-5"><EmptyState icon={faGraduationCap} title="No project proposals found" description="Project proposals submitted through existing academic workflows will appear here for authorized supervisors/coordinators." /></div> : (
            <div className="divide-y divide-slate-100">{projects.map((p) => (
              <div key={p.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-slate-900">{p.title}</div><div className="mt-0.5 text-xs text-slate-500">{p.course ? `${p.course.code} · ${p.course.name}` : "No course"}{p.group ? ` · Group ${p.group.name}` : ""}{p.submittedBy ? ` · ${p.submittedBy.name}` : ""}</div>{p.description && <p className="mt-2 text-xs text-slate-700">{p.description}</p>}{p.reviewFeedback && <p className="mt-1 text-xs text-amber-800">Feedback: {p.reviewFeedback}</p>}</div><Badge variant={v(p.status) as any}>{p.status}</Badge></div>
                {["SUBMITTED","UNDER_REVIEW","REVISION_REQUIRED"].includes(p.status) && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busyId===p.id} onClick={() => void review(p.id,"UNDER_REVIEW")}>Mark Under Review</Button><Button size="sm" variant="secondary" disabled={busyId===p.id} onClick={() => void review(p.id,"REVISION_REQUIRED")}>Request Revision</Button><Button size="sm" disabled={busyId===p.id} onClick={() => void review(p.id,"APPROVED")}>Approve</Button><Button size="sm" variant="danger" disabled={busyId===p.id} onClick={() => void review(p.id,"REJECTED")}>Reject</Button></div>}
              </div>))}</div>)}
        </Card>
      )}
    </section>
  );
};
