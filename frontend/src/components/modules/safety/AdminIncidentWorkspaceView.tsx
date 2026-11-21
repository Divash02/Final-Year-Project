import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../../../components/ui/ToastContainer";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { apiRequest } from "../../../services/apiClient";
import { downloadStoredFile, fetchStoredFile } from "../../../services/uploadClient";
import { postMultipart } from "../../../services/incidentApi";
import {
  Plus, Search, Filter, X, ChevronDown, ChevronUp, RotateCcw, Copy, Check,
  Phone, Mail, Shield, AlertTriangle, User, Users, Clock, FileText, MapPin,
  ChevronRight, MoreHorizontal, Bell, Eye, MessageSquare, Flag, UserCheck,
  Loader2, Inbox, History, Trash2, Edit, Save, Send, XCircle, ArrowRight,
} from "lucide-react";
import {
  Incident, IncidentStatus, IncidentSeverity, IncidentType, EmergencyContact,
  CampusSafetySummary,
} from "../../../types/index";

const STATUS_LABELS: Record<IncidentStatus, string> = {
  SUBMITTED: "Submitted", RECEIVED: "Received", UNDER_REVIEW: "Under Review",
  ASSIGNED_FOR_INVESTIGATION: "Assigned for Investigation",
  INVESTIGATION_IN_PROGRESS: "Investigation in Progress",
  AWAITING_STUDENT_INFORMATION: "Awaiting Student Information",
  ACTION_TAKEN: "Action Taken", RESOLVED: "Resolved", CLOSED: "Closed",
  REPORTED: "Reported", ACKNOWLEDGED: "Acknowledged", UNDER_INVESTIGATION: "Under Investigation",
  ESCALATED: "Escalated",
};

const TYPE_LABELS: Record<IncidentType, string> = {
  THEFT: "Theft", ASSAULT: "Assault", HARASSMENT: "Harassment", VANDALISM: "Vandalism",
  FIRE_HAZARD: "Fire Hazard", MEDICAL_EMERGENCY: "Medical Emergency", BULLYING: "Bullying",
  CYBERBULLYING: "Cyberbullying", SAFETY_CONCERN: "Safety Concern", UNSAFE_CONDITION: "Unsafe Condition",
  SECURITY_BREACH: "Security Breach", SUSPICIOUS_ACTIVITY: "Suspicious Activity", OTHER: "Other",
};

const STATUS_PILL: Record<IncidentStatus, string> = {
  SUBMITTED: "bg-slate-100 text-slate-700", RECEIVED: "bg-slate-100 text-slate-700",
  UNDER_REVIEW: "bg-amber-100 text-amber-700",
  ASSIGNED_FOR_INVESTIGATION: "bg-amber-100 text-amber-700",
  INVESTIGATION_IN_PROGRESS: "bg-amber-100 text-amber-700",
  AWAITING_STUDENT_INFORMATION: "bg-amber-100 text-amber-700",
  ACTION_TAKEN: "bg-emerald-100 text-emerald-700", RESOLVED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-slate-100 text-slate-600", REPORTED: "bg-slate-100 text-slate-700",
  ACKNOWLEDGED: "bg-slate-100 text-slate-700", UNDER_INVESTIGATION: "bg-amber-100 text-amber-700",
  ESCALATED: "bg-red-100 text-red-700",
};

const SEVERITY_PILL: Record<IncidentSeverity, string> = {
  LOW: "bg-slate-100 text-slate-700", MODERATE: "bg-slate-100 text-slate-700",
  HIGH: "bg-red-100 text-red-700", CRITICAL: "bg-red-100 text-red-700",
};

const DEPARTMENTS = [
  "Campus Security", "Student Affairs", "Counseling Services", "Registrar",
  "Administration", "IT Services", "Facilities", "Other",
];

const EMERGENCY_CONTACTS: EmergencyContact[] = [
  { name: "Campus Security", phone: "+977-1-XXXXXXX", email: "security@college.edu.np", available: "24/7", type: "SECURITY" },
  { name: "Medical Emergency", phone: "102", email: "", available: "24/7", type: "MEDICAL" },
  { name: "Fire Department", phone: "101", email: "", available: "24/7", type: "FIRE" },
  { name: "Police", phone: "100", email: "", available: "24/7", type: "POLICE" },
  { name: "Student Affairs", phone: "+977-1-XXXXXXX", email: "affairs@college.edu.np", available: "9AM-5PM", type: "ADMIN" },
  { name: "Counseling Services", phone: "+977-1-XXXXXXX", email: "counseling@college.edu.np", available: "9AM-5PM", type: "COUNSELING" },
];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: IncidentStatus | null | undefined) {
  if (!status) return <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-slate-100 text-slate-600">—</span>;
  return (
    <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${STATUS_PILL[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function severityBadge(severity: IncidentSeverity) {
  return (
    <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${SEVERITY_PILL[severity]}`}>
      {severity}
    </span>
  );
}

function copyToClipboard(text: string, label: string, toast: ReturnType<typeof useToast>["toast"]) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success(`${label} copied`);
  }).catch(() => {
    toast.error(`Failed to copy ${label.toLowerCase()}`);
  });
}

function KPIMetric({ label, value, icon: Icon, critical = false }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; critical?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 flex-1 min-w-0 border-r border-slate-200 last:border-0">
      <Icon className={`h-4 w-4 flex-shrink-0 ${critical ? "text-red-600" : "text-slate-500"}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 truncate">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${critical ? "text-red-600" : "text-slate-900"}`}>{value}</p>
      </div>
    </div>
  );
}

function EmptyState({ onReset, onReport, hasFilters }: { onReset: () => void; onReport: () => void; hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <Inbox className="h-10 w-10 text-slate-300 mb-3" aria-hidden="true" />
      <p className="font-medium text-slate-700">No incidents found</p>
      <p className="text-sm text-slate-500 mt-1">Try adjusting your filters</p>
      <div className="flex flex-col sm:flex-row gap-2 mt-4">
        {hasFilters && (
          <button onClick={onReset} className="px-3 py-1.5 border border-slate-300 rounded text-sm flex items-center gap-1.5 justify-center hover:bg-slate-50">
            <RotateCcw className="h-3.5 w-3.5" /> Reset Filters
          </button>
        )}
      </div>
    </div>
  );
}

function EmergencyContactsStrip({ contacts, toast }: { contacts: EmergencyContact[]; toast: ReturnType<typeof useToast>["toast"] }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {contacts.map((contact) => (
          <div key={contact.name} className="flex flex-col gap-1.5 p-2 bg-slate-50 rounded border border-slate-100 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded flex items-center justify-center bg-gradient-to-br from-amber-100 to-rose-100 text-slate-700 flex-shrink-0">
                <Shield className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate text-sm">{contact.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{contact.type} · {contact.available}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <a href={`tel:${contact.phone}`} className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1 min-w-0 truncate" title="Call">
                <Phone className="h-3.5 w-3.5 flex-shrink-0 text-slate-900" /> <span className="truncate">{contact.phone}</span>
              </a>
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1 min-w-0 truncate" title="Email">
                  <Mail className="h-3.5 w-3.5 flex-shrink-0 text-slate-900" /> <span className="truncate">{contact.email}</span>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const AdminIncidentWorkspaceView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [summary, setSummary] = useState<CampusSafetySummary>({
    totalIncidents: 0, newReports: 0, underReview: 0, activeInvestigations: 0,
    awaitingStudentResponse: 0, resolvedCases: 0, closedCases: 0, highCriticalSeverity: 0,
  });
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [staffUsers, setStaffUsers] = useState<Array<{ id: string; name: string; email: string; department?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: "", incidentType: "", severity: "", status: "", assignedDepartment: "", dateFrom: "", dateTo: "", page: 1,
  });
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [sort, setSort] = useState("reportedAt");
  const [order, setOrder] = useState("desc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState({
    submission: true,
    timeline: true,
    management: true,
  });

  const [assignForm, setAssignForm] = useState({ assignedTo: "", assignedDepartment: "", priority: "NORMAL", internalNotes: "" });
  const [statusForm, setStatusForm] = useState({ status: "", description: "" });
  const [updateForm, setUpdateForm] = useState({ title: "", description: "", visibility: "student" as "student" | "internal" });
  const [updateFiles, setUpdateFiles] = useState<File[]>([]);
  const [noteForm, setNoteForm] = useState("");
  const [messageForm, setMessageForm] = useState("");
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [resolveForm, setResolveForm] = useState({ category: "", summary: "", actionsTaken: "", outcome: "RESOLVED" as const, studentVisibleSummary: "" });
  const [reopenForm, setReopenForm] = useState({ reason: "" });

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchIncidents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append("search", filters.search);
      if (filters.incidentType) params.append("incidentType", filters.incidentType);
      if (filters.severity) params.append("severity", filters.severity);
      if (filters.status) params.append("status", filters.status);
      if (filters.assignedDepartment) params.append("assignedDepartment", filters.assignedDepartment);
      if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.append("dateTo", filters.dateTo);
      params.append("page", String(page));
      params.append("limit", String(limit));
      params.append("sort", sort);
      params.append("order", order);
      const data = await apiRequest<{ incidents: Incident[]; pagination: any }>(`/campus-safety/incidents?${params}`);
      setIncidents(data.incidents);
      setPagination(data.pagination);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load incidents.");
    }
  }, [filters, page, limit, sort, order, toast]);

  const fetchSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.append("dateTo", filters.dateTo);
      const data = await apiRequest<CampusSafetySummary>(`/campus-safety/summary?${params}`);
      setSummary(data);
    } catch { /* non-fatal */ }
  }, [filters.dateFrom, filters.dateTo]);

  const fetchStaff = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([
        apiRequest<{ users: any[] }>("/api/admin/users?role=security_staff"),
        apiRequest<{ users: any[] }>("/api/admin/users?role=campus_admin"),
        apiRequest<{ users: any[] }>("/api/admin/users?role=registrar"),
      ]);
      const all = [...(a.users || []), ...(b.users || []), ...(c.users || [])];
      const seen = new Set<string>();
      const staff = all.filter((u) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return u.accountStatus === "ACTIVE";
      }).map((u) => ({ id: u.id, name: u.name, email: u.email, department: u.department }));
      setStaffUsers(staff);
    } catch { /* non-fatal */ }
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      const data = await apiRequest<{ contacts: EmergencyContact[] }>("/campus-safety/emergency-contacts");
      setContacts(data.contacts);
    } catch { /* fallback */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchIncidents(), fetchSummary(), fetchStaff(), fetchContacts()]).finally(() => setLoading(false));
  }, [fetchIncidents, fetchSummary, fetchStaff, fetchContacts]);

  useEffect(() => { fetchIncidents(); }, [page]);

  const openDetail = async (id: string) => {
    setSelected(null);
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const data = await apiRequest<{ incident: Incident }>(`/campus-safety/incidents/${id}`);
      setSelected(data.incident);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load incident.");
      setDrawerOpen(false);
    } finally { setDrawerLoading(false); }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelected(null);
    setAssignForm({ assignedTo: "", assignedDepartment: "", priority: "NORMAL", internalNotes: "" });
    setStatusForm({ status: "", description: "" });
    setUpdateForm({ title: "", description: "", visibility: "student" });
    setUpdateFiles([]);
    setNoteForm("");
    setMessageForm("");
    setMessageFiles([]);
    setResolveForm({ category: "", summary: "", actionsTaken: "", outcome: "RESOLVED", studentVisibleSummary: "" });
    setReopenForm({ reason: "" });
  };

  const refresh = async () => {
    await fetchIncidents();
    await fetchSummary();
    if (selected) await openDetail(selected.id);
  };

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setActionLoading(key);
    try { await fn(); await refresh(); toast.success("Updated."); }
    catch (err: any) { toast.error(err?.message || "Action failed."); }
    finally { setActionLoading(null); if (drawerOpen && selected) await openDetail(selected.id); }
  };

  const handleAssign = async () => {
    await runAction("assign", async () => {
      const body: any = {};
      if (assignForm.assignedTo) body.assignedTo = assignForm.assignedTo;
      if (assignForm.assignedDepartment) body.assignedDepartment = assignForm.assignedDepartment;
      if (assignForm.priority) body.priority = assignForm.priority;
      if (assignForm.internalNotes) body.internalNotes = assignForm.internalNotes;
      await apiRequest(`/campus-safety/incidents/${selected!.id}/assign`, { method: "PATCH", body: JSON.stringify(body) });
    });
  };

  const handleStatusChange = async () => {
    await runAction("status", async () => {
      await apiRequest(`/campus-safety/incidents/${selected!.id}/status`, {
        method: "PATCH", body: JSON.stringify({ status: statusForm.status, description: statusForm.description }),
      });
    });
  };

  const handleAddUpdate = async () => {
    await runAction("update", async () => {
      const fields: Record<string, string> = { title: updateForm.title, description: updateForm.description, visibility: updateForm.visibility };
      await postMultipart(`/campus-safety/incidents/${selected!.id}/updates`, updateFiles, fields);
    });
  };

  const handleAddNote = async () => {
    await runAction("note", async () => {
      await apiRequest(`/campus-safety/incidents/${selected!.id}/internal-notes`, { method: "POST", body: JSON.stringify({ note: noteForm }) });
    });
  };

  const handleSendMessage = async () => {
    await runAction("message", async () => {
      const fields: Record<string, string> = { message: messageForm, visibility: "student" };
      await postMultipart(`/campus-safety/incidents/${selected!.id}/messages`, messageFiles, fields);
    });
  };

  const handleResolve = async () => {
    await runAction("resolve", async () => {
      await apiRequest(`/campus-safety/incidents/${selected!.id}/resolve`, { method: "PATCH", body: JSON.stringify(resolveForm) });
    });
  };

  const handleReopen = async () => {
    if (!window.confirm("Reopen this case? The previous investigation history will be preserved.")) return;
    await runAction("reopen", async () => {
      await apiRequest(`/campus-safety/incidents/${selected!.id}/reopen`, { method: "PATCH", body: JSON.stringify({ reason: reopenForm.reason }) });
    });
  };

  const handlePreviewFile = (fileId: string, mimeType: string, name: string) => {
    if (mimeType.startsWith("image/") || mimeType === "application/pdf") {
      void fetchStoredFile(fileId).then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.target = "_blank"; a.rel = "noopener"; a.click();
      });
    } else { void downloadStoredFile(fileId, name); }
  };

  const filteredIncidents = useMemo(() => {
    const s = filters.search.toLowerCase();
    return incidents.filter((inc) => {
      if (s && !inc.incidentNumber.toLowerCase().includes(s) && !inc.title.toLowerCase().includes(s)
        && !inc.description.toLowerCase().includes(s) && !inc.student?.fullName.toLowerCase().includes(s)
        && !inc.student?.studentId.toLowerCase().includes(s) && !inc.reportedBy?.name.toLowerCase().includes(s)) return false;
      if (filters.incidentType && inc.incidentType !== filters.incidentType) return false;
      if (filters.severity && inc.severity !== filters.severity) return false;
      if (filters.status && inc.status !== filters.status) return false;
      if (filters.assignedDepartment && inc.assignedDepartment !== filters.assignedDepartment) return false;
      return true;
    });
  }, [incidents, filters]);

  const tlItems = useMemo(() => {
    if (!selected) return [];
    const items: Array<{ when: string; title: string; desc: string; by: string; visibility: string; attachments: any[]; kind: string; status?: IncidentStatus | null }> = [];
    for (const u of selected.updates || []) {
      items.push({ when: u.createdAt, title: u.title, desc: u.description, by: u.createdBy?.name || "Staff", visibility: u.visibility, attachments: u.attachments, kind: "update", status: u.status });
    }
    for (const m of selected.messages || []) {
      items.push({ when: m.createdAt, title: m.senderType === "student" ? "Student" : "Staff Reply", desc: m.message, by: m.senderName, visibility: m.visibility, attachments: m.attachments, kind: "message" });
    }
    return items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
  }, [selected]);

  const hasActiveFilters = !!(filters.search || filters.incidentType || filters.severity || filters.status || filters.assignedDepartment || filters.dateFrom || filters.dateTo);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-80px)] items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-red-600" />
          <p className="text-sm">Loading incident workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen p-4 sm:p-5 space-y-3 sm:space-y-4">
      {/* Header Row - 44px height */}
      <header className="flex items-center justify-between gap-3 h-11 px-1">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-slate-900 truncate">Incident Management</h1>
          <p className="text-[12px] text-slate-500 truncate">Review, assign, investigate, and resolve student safety incident reports.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setContactsOpen(!contactsOpen)}
            className="px-2.5 py-1.5 border border-slate-200 rounded hover:bg-slate-50 transition-colors text-slate-600 hover:text-slate-900"
            aria-label={contactsOpen ? "Hide emergency contacts" : "Show emergency contacts"}
            aria-expanded={contactsOpen}
            title={contactsOpen ? "Hide emergency contacts" : "Show emergency contacts"}
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => window.location.assign("/safety/report-incident")}
            className="px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium flex items-center gap-1.5 hover:bg-red-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New Report
          </button>
        </div>
      </header>

      {/* Emergency Contacts Collapsible Strip */}
      {contactsOpen && contacts.length > 0 && (
        <div className="animate-in slide-in-from-top-2 duration-150">
          <EmergencyContactsStrip contacts={contacts} toast={toast} />
        </div>
      )}

      {/* Unified KPI Strip - Horizontal bar with 4 metrics */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" role="region" aria-label="Key metrics">
        <div className="flex flex-wrap">
          <KPIMetric label="Active / Open" value={summary.underReview + summary.activeInvestigations + summary.awaitingStudentResponse} icon={Users} />
          <KPIMetric label="High / Critical" value={summary.highCriticalSeverity} icon={AlertTriangle} critical />
          <KPIMetric label="Awaiting Student" value={summary.awaitingStudentResponse} icon={Clock} />
          <KPIMetric label="Resolved" value={summary.resolvedCases} icon={Check} />
        </div>
      </div>

      {/* Incident Queue Table with integrated filter toolbar */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden" aria-label="Incident queue">
        {/* Filter Toolbar - attached as table top border */}
        <div className="border-b border-slate-200 p-2.5 bg-slate-50/50 flex flex-wrap gap-2 items-stretch sm:items-end">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search incident #, title, student, description…"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
              className="w-full pl-9 pr-8 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
              aria-label="Search incidents"
            />
            {filters.search && (
              <button
                onClick={() => setFilters({ ...filters, search: "", page: 1 })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select
            value={filters.incidentType}
            onChange={(e) => setFilters({ ...filters, incidentType: e.target.value, page: 1 })}
            className="px-2.5 py-1.5 border border-slate-300 rounded text-sm bg-white min-w-[130px] focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
            aria-label="Filter by incident type"
          >
            <option value="">All Types</option>
            {(["THEFT","ASSAULT","HARASSMENT","VANDALISM","FIRE_HAZARD","MEDICAL_EMERGENCY","BULLYING","CYBERBULLYING","SAFETY_CONCERN","UNSAFE_CONDITION","SECURITY_BREACH","SUSPICIOUS_ACTIVITY","OTHER"] as IncidentType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
          <select
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value, page: 1 })}
            className="px-2.5 py-1.5 border border-slate-300 rounded text-sm bg-white min-w-[110px] focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
            aria-label="Filter by severity"
          >
            <option value="">All Severities</option>
            <option value="LOW">Low</option>
            <option value="MODERATE">Moderate</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
            className="px-2.5 py-1.5 border border-slate-300 rounded text-sm bg-white min-w-[140px] focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            {(["SUBMITTED","RECEIVED","UNDER_REVIEW","ASSIGNED_FOR_INVESTIGATION","INVESTIGATION_IN_PROGRESS","AWAITING_STUDENT_INFORMATION","ACTION_TAKEN","RESOLVED","CLOSED"] as IncidentStatus[]).map((st) => (
              <option key={st} value={st}>{STATUS_LABELS[st]}</option>
            ))}
          </select>
          <select
            value={filters.assignedDepartment}
            onChange={(e) => setFilters({ ...filters, assignedDepartment: e.target.value, page: 1 })}
            className="px-2.5 py-1.5 border border-slate-300 rounded text-sm bg-white min-w-[130px] focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
            aria-label="Filter by department"
          >
            <option value="">All Departments</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="flex gap-1">
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value, page: 1 })} className="px-2 py-1.5 border border-slate-300 rounded text-sm bg-white min-w-[130px] focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" aria-label="Date from" />
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value, page: 1 })} className="px-2 py-1.5 border border-slate-300 rounded text-sm bg-white min-w-[130px] focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" aria-label="Date to" />
          </div>
          <button
            onClick={fetchIncidents}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white border-transparent font-medium rounded text-sm flex items-center gap-1.5 transition-colors whitespace-nowrap"
            aria-label="Apply filters"
          >
            <Filter className="h-3.5 w-3.5" /> Apply
          </button>
          {hasActiveFilters && (
            <button
              onClick={() => setFilters({ search: "", incidentType: "", severity: "", status: "", assignedDepartment: "", dateFrom: "", dateTo: "", page: 1 })}
className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white border-transparent font-medium rounded text-sm flex items-center gap-1.5 transition-colors whitespace-nowrap"
              aria-label="Reset all filters"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="grid">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="px-3 py-2 text-left font-medium w-[70px]" scope="col">ID</th>
                <th className="px-3 py-2 text-left font-medium" scope="col">Type / Summary</th>
                <th className="px-3 py-2 text-left font-medium w-[130px]" scope="col">Department</th>
                <th className="px-3 py-2 text-left font-medium w-[80px]" scope="col">Severity</th>
                <th className="px-3 py-2 text-left font-medium w-[140px]" scope="col">Status</th>
                <th className="px-3 py-2 text-left font-medium w-[130px]" scope="col">Reported</th>
                <th className="px-3 py-2 text-left font-medium w-[150px]" scope="col">Investigator</th>
                <th className="px-3 py-2 text-left font-medium w-[36px]" scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10">
                    <EmptyState
                      onReset={() => setFilters({ search: "", incidentType: "", severity: "", status: "", assignedDepartment: "", dateFrom: "", dateTo: "", page: 1 })}
                      onReport={() => window.location.assign("/safety/report-incident")}
                      hasFilters={hasActiveFilters}
                    />
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((inc) => {
                  const isHighPriority = inc.severity === "HIGH" || inc.severity === "CRITICAL";
                  return (
                    <tr
                      key={inc.id}
                      className={`hover:bg-slate-50 cursor-pointer transition-colors ${isHighPriority ? "bg-red-50/40 border-l-2 border-red-500" : ""}`}
                      onClick={() => openDetail(inc.id)}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(inc.id); } }}
                    >
                      <td className="px-3 py-2 text-slate-900 font-mono font-medium text-xs">{inc.incidentNumber}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${SEVERITY_PILL[inc.severity]}`}>{inc.severity}</span>
                          <span className="text-slate-700 truncate max-w-[280px] font-medium">{inc.title}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[280px] mt-0.5">{TYPE_LABELS[inc.incidentType as IncidentType] || inc.incidentType}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-600 text-sm truncate">{inc.assignedDepartment || "—"}</td>
                      <td className="px-3 py-2">{severityBadge(inc.severity)}</td>
                      <td className="px-3 py-2">{statusBadge(inc.status)}</td>
                      <td className="px-3 py-2 text-slate-600 text-sm">{formatDateTime(inc.reportedAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {inc.assignedTo ? (
                            <>
                              <UserCheck className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
                              <span className="text-slate-700 text-sm font-medium truncate">{inc.assignedTo.name}</span>
                            </>
                          ) : (
                            <span className="text-slate-400 text-sm italic">Unassigned</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0 mx-auto" aria-hidden="true" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <p className="text-sm text-slate-500">Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</p>
            <div className="flex gap-1.5">
              <button onClick={() => setPage(pagination.page - 1)} disabled={pagination.page === 1} className="px-2.5 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50">Prev</button>
              <button onClick={() => setPage(pagination.page + 1)} disabled={pagination.page === pagination.pages} className="px-2.5 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50">Next</button>
            </div>
          </div>
        )}
      </section>

      {/* Incident Detail Drawer - Slide-over from right */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-end" role="dialog" aria-modal="true" aria-label="Incident details">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeDrawer} aria-hidden="true" />
          <div className="relative bg-white w-full max-w-3xl max-h-[95vh] overflow-hidden flex flex-col h-[95vh] shadow-[0_0_0_1px_rgb(0,0,0,0.08),0_25px_50px_-12px_rgb(0,0,0,0.15)] animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="h-4.5 w-4.5 text-slate-500 flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 truncate">{selected?.incidentNumber}</h3>
                  <p className="text-[11px] text-slate-500 truncate">{selected?.title}</p>
                </div>
                {selected && (
                  <div className="flex items-center gap-1.5 flex-wrap ml-2">
                    {statusBadge(selected.status)}
                    {severityBadge(selected.severity)}
                    {selected.priority === "URGENT" && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700">URGENT</span>}
                    {selected.priority === "HIGH" && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700">HIGH</span>}
                  </div>
                )}
              </div>
              <button onClick={closeDrawer} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors flex-shrink-0" aria-label="Close drawer">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {drawerLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-red-600 mr-2" /> Loading…
                </div>
              ) : selected && (
                <>
                  {/* Quick Actions Bar */}
                  <div className="bg-slate-50 rounded border border-slate-200 p-2 flex flex-wrap gap-1.5">
                    <button onClick={handleAssign} disabled={actionLoading === "assign"} className="px-2.5 py-1.5 bg-red-600 text-white rounded text-sm disabled:opacity-50 flex items-center gap-1.5 hover:bg-red-700 transition-colors">
                      <UserCheck className="h-3.5 w-3.5" /> {actionLoading === "assign" ? "Assigning…" : "Assign"}
                    </button>
                    <button onClick={handleStatusChange} disabled={actionLoading === "status"} className="px-2.5 py-1.5 border border-slate-300 rounded text-sm disabled:opacity-50 flex items-center gap-1.5 hover:bg-slate-100 transition-colors">
                      <Flag className="h-3.5 w-3.5" /> {actionLoading === "status" ? "Updating…" : "Status"}
                    </button>
                    <button disabled className="px-2.5 py-1.5 border border-slate-300 rounded text-sm flex items-center gap-1.5 opacity-50 cursor-not-allowed">
                      <Eye className="h-3.5 w-3.5" /> Evidence
                    </button>
                    <button disabled className="px-2.5 py-1.5 border border-slate-300 rounded text-sm flex items-center gap-1.5 opacity-50 cursor-not-allowed">
                      <MessageSquare className="h-3.5 w-3.5" /> Message
                    </button>
                  </div>

                  {/* Original Submission */}
                  <details
                    open={detailsOpen.submission}
                    onToggle={() => setDetailsOpen((d) => ({ ...d, submission: !d.submission }))}
                    className="border border-slate-200 rounded bg-white open:bg-slate-50/30"
                  >
                    <summary className="flex items-center gap-2 px-3 py-2.5 font-medium text-slate-900 cursor-pointer list-none">
                      <FileText className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      Original Submission
                    </summary>
                    <div className="px-3 pb-3 space-y-3 border-t border-slate-100">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                        <div className="px-2 py-1.5 bg-slate-50 rounded border border-slate-100"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Student</p><p className="font-medium text-slate-900">{selected.student?.fullName}</p><p className="text-[11px] text-slate-500">{selected.student?.studentId}</p></div>
                        <div className="px-2 py-1.5 bg-slate-50 rounded border border-slate-100"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Reported</p><p className="text-slate-900">{formatDateTime(selected.reportedAt)}</p></div>
                        <div className="px-2 py-1.5 bg-slate-50 rounded border border-slate-100"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Occurred</p><p className="text-slate-900">{formatDateTime(selected.incidentDate || selected.occurredAt)} {selected.incidentTime ? `· ${selected.incidentTime}` : ""}</p></div>
                        <div className="px-2 py-1.5 bg-slate-50 rounded border border-slate-100"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Location</p><p className="text-slate-900">{selected.location.building || "—"} {selected.location.room ? `, Room ${selected.location.room}` : ""}</p></div>
                        <div className="px-2 py-1.5 bg-slate-50 rounded border border-slate-100"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assigned To</p><p className="text-slate-900">{selected.assignedTo?.name || "Unassigned"}</p><p className="text-[11px] text-slate-500">{selected.assignedDepartment || "—"}</p></div>
                        <div className="px-2 py-1.5 bg-slate-50 rounded border border-slate-100"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Confidential</p><p className="text-slate-900">{selected.confidentialityRequest ? "Yes" : "No"}</p></div>
                      </div>
                      <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Description</p><p className="text-slate-700 leading-relaxed text-sm">{selected.description}</p></div>
                      {selected.peopleInvolved && <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">People Involved</p><p className="text-slate-700 text-sm">{selected.peopleInvolved}</p></div>}
                      {selected.witnesses?.length && (
                        <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Witnesses</p><ul className="list-disc list-inside text-sm text-slate-700 space-y-0.5">{selected.witnesses.map((w, i) => <li key={i}>{w.name}{w.contact ? ` ({w.contact})` : ""}</li>)}</ul></div>
                      )}
                      {selected.evidence?.length && (
                        <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1.5">Evidence <FileText className="h-3 w-3" /></p>
                          <div className="flex flex-wrap gap-1.5">{selected.evidence.map((f) => (
                            <div key={f.id} className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded border border-slate-100 text-xs">
                              {f.mimeType.startsWith("image/") ? <Eye className="h-3 w-3 text-slate-400" /> : <FileText className="h-3 w-3 text-slate-400" />}
                              <span className="truncate max-w-[120px] text-slate-700">{f.originalName}</span>
                              <button onClick={(e) => { e.stopPropagation(); handlePreviewFile(f.fileId, f.mimeType, f.originalName); }} className="text-red-600 hover:underline text-xs">View</button>
                            </div>
                          ))}</div>
                        </div>
                      )}
                    </div>
                  </details>

                  {/* Timeline */}
                  <details
                    open={detailsOpen.timeline}
                    onToggle={() => setDetailsOpen((d) => ({ ...d, timeline: !d.timeline }))}
                    className="border border-slate-200 rounded bg-white open:bg-slate-50/30"
                  >
                    <summary className="flex items-center gap-2 px-3 py-2.5 font-medium text-slate-900 cursor-pointer list-none">
                      <Clock className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      Timeline & Updates
                    </summary>
                    <div className="px-3 pb-3 border-t border-slate-100">
                      <div className="relative pl-3 space-y-2.5">
                        <div className="absolute left-1 top-1.5 bottom-1.5 w-px bg-slate-200" />
                        {tlItems.length === 0 ? (
                          <p className="text-slate-500 text-sm text-center py-3">No updates yet.</p>
                        ) : (
                          tlItems.map((item, i) => (
                            <div key={i} className="relative">
                              <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full border-2 border-red-600 bg-white flex-shrink-0" />
                              <div className="flex justify-between items-start gap-2 pl-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                    <span className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 ${item.visibility === "internal" ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-700"}`}>{item.kind === "update" ? (STATUS_LABELS[item.status as IncidentStatus] || item.title) : item.title}</span>
                                    {item.visibility === "internal" && <span className="text-slate-700 text-[10px] font-bold" title="Internal note">INTERNAL</span>}
                                  </div>
                                  <p className="text-sm text-slate-700">{item.desc}</p>
                                  {item.attachments?.length && (
                                    <div className="flex flex-wrap gap-1.5 mt-1">{item.attachments.map((f: any) => (
                                      <div key={f.id} className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 rounded text-xs text-slate-700 cursor-pointer" onClick={(e) => { e.stopPropagation(); handlePreviewFile(f.fileId, f.mimeType, f.originalName); }}>
                                        <FileText className="h-2.5 w-2.5" /> {f.originalName}
                                      </div>
                                    ))}</div>
                                  )}
                                </div>
                                <div className="text-right text-[11px] text-slate-500 whitespace-nowrap flex-shrink-0">{formatDateTime(item.when)}</div>
                                <div className="text-[11px] text-slate-500 whitespace-nowrap flex-shrink-0">{item.by}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </details>

                  {/* Case Management */}
                  <details
                    open={detailsOpen.management}
                    onToggle={() => setDetailsOpen((d) => ({ ...d, management: !d.management }))}
                    className="border border-slate-200 rounded bg-white open:bg-slate-50/30"
                  >
                    <summary className="flex items-center gap-2 px-3 py-2.5 font-medium text-slate-900 cursor-pointer list-none">
                      <Flag className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      Case Management
                    </summary>
                    <div className="px-3 pb-3 space-y-3 border-t border-slate-100">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Assign / Reassign</p>
                          <select value={assignForm.assignedTo} onChange={(e) => setAssignForm({ ...assignForm, assignedTo: e.target.value })} className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600">
                            <option value="">Select staff member</option>
                            {staffUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.department || "General"})</option>)}
                          </select>
                          <select value={assignForm.assignedDepartment} onChange={(e) => setAssignForm({ ...assignForm, assignedDepartment: e.target.value })} className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600">
                            <option value="">Department</option>{DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                          <select value={assignForm.priority} onChange={(e) => setAssignForm({ ...assignForm, priority: e.target.value as any })} className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600">
                            <option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
                          </select>
                          <textarea value={assignForm.internalNotes} onChange={(e) => setAssignForm({ ...assignForm, internalNotes: e.target.value })} rows={2} placeholder="Internal assignment notes…" className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" />
                          <button onClick={handleAssign} disabled={actionLoading === "assign"} className="w-full px-2 py-1.5 bg-red-600 text-white rounded text-sm disabled:opacity-50 hover:bg-red-700">{actionLoading === "assign" ? "Assigning…" : "Assign Case"}</button>
                        </div>

                        <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Update Status</p>
                          <select value={statusForm.status} onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value as IncidentStatus })} className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600">
                            <option value="">New status</option>
                            {(["RECEIVED","UNDER_REVIEW","ASSIGNED_FOR_INVESTIGATION","INVESTIGATION_IN_PROGRESS","AWAITING_STUDENT_INFORMATION","ACTION_TAKEN","RESOLVED","CLOSED"] as IncidentStatus[]).map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
                          </select>
                          <input value={statusForm.description} onChange={(e) => setStatusForm({ ...statusForm, description: e.target.value })} placeholder="Description (optional)" className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" />
                          <button onClick={handleStatusChange} disabled={actionLoading === "status"} className="w-full px-2 py-1.5 bg-red-600 text-white rounded text-sm disabled:opacity-50 hover:bg-red-700">{actionLoading === "status" ? "Updating…" : "Update Status"}</button>
                        </div>
                      </div>

                      <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Add Investigation Update</p>
                        <input value={updateForm.title} onChange={(e) => setUpdateForm({ ...updateForm, title: e.target.value })} placeholder="Update title" className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" />
                        <textarea value={updateForm.description} onChange={(e) => setUpdateForm({ ...updateForm, description: e.target.value })} rows={2} placeholder="Progress description" className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" />
                        <select value={updateForm.visibility} onChange={(e) => setUpdateForm({ ...updateForm, visibility: e.target.value as "student" | "internal" })} className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600">
                          <option value="student">Student-visible</option><option value="internal">Internal note only</option>
                        </select>
                        <input type="file" multiple onChange={(e) => { if (e.target.files) setUpdateFiles(Array.from(e.target.files)); }} className="block w-full text-sm text-slate-500 file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:font-medium file:bg-red-600 file:text-white mb-2" />
                        <button onClick={handleAddUpdate} disabled={actionLoading === "update"} className="w-full px-2 py-1.5 bg-red-600 text-white rounded text-sm disabled:opacity-50 hover:bg-red-700">{actionLoading === "update" ? "Adding…" : "Add Update"}</button>
                      </div>

                      <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Internal Investigation Note</p>
                        <textarea value={noteForm} onChange={(e) => setNoteForm(e.target.value)} rows={2} placeholder="Confidential internal note (never shown to students)…" className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" />
                        <button onClick={handleAddNote} disabled={actionLoading === "note"} className="w-full px-2 py-1.5 bg-slate-800 text-white rounded text-sm disabled:opacity-50 hover:bg-slate-900">{actionLoading === "note" ? "Adding…" : "Add Internal Note"}</button>
                      </div>

                      <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Message to Student</p>
                        <textarea value={messageForm} onChange={(e) => setMessageForm(e.target.value)} rows={2} placeholder="Type your message to the student…" className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" />
                        <input type="file" multiple onChange={(e) => { if (e.target.files) setMessageFiles(Array.from(e.target.files)); }} className="block w-full text-sm text-slate-500 file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:font-medium file:bg-red-600 file:text-white mb-2" />
                        <button onClick={handleSendMessage} disabled={actionLoading === "message"} className="w-full px-2 py-1.5 bg-red-600 text-white rounded text-sm disabled:opacity-50 hover:bg-red-700">{actionLoading === "message" ? "Sending…" : "Send Message"}</button>
                      </div>

                      {!["RESOLVED", "CLOSED"].includes(selected.status) && (
                        <div className="p-2.5 bg-emerald-50 rounded border border-emerald-100">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-2">Resolve Case</p>
                          <select value={resolveForm.category} onChange={(e) => setResolveForm({ ...resolveForm, category: e.target.value })} className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600">
                            <option value="">Resolution category</option>
                            <option value="RESOLVED">Resolved</option><option value="UNFOUNDED">Unfounded</option><option value="REFERRED_EXTERNAL">Referred External</option><option value="ONGOING_MONITORING">Ongoing Monitoring</option>
                          </select>
                          <input value={resolveForm.summary} onChange={(e) => setResolveForm({ ...resolveForm, summary: e.target.value })} placeholder="Resolution summary" className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" />
                          <textarea value={resolveForm.actionsTaken} onChange={(e) => setResolveForm({ ...resolveForm, actionsTaken: e.target.value })} rows={2} placeholder="Actions taken (internal)" className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" />
                          <textarea value={resolveForm.studentVisibleSummary} onChange={(e) => setResolveForm({ ...resolveForm, studentVisibleSummary: e.target.value })} rows={2} placeholder="Final message to student" className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" />
                          <select value={resolveForm.outcome} onChange={(e) => setResolveForm({ ...resolveForm, outcome: e.target.value as any })} className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600">
                            <option value="RESOLVED">Resolved</option><option value="UNFOUNDED">Unfounded</option><option value="REFERRED_EXTERNAL">Referred External</option><option value="ONGOING_MONITORING">Ongoing Monitoring</option>
                          </select>
                          <button onClick={handleResolve} disabled={actionLoading === "resolve"} className="w-full px-2 py-1.5 bg-emerald-700 text-white rounded text-sm disabled:opacity-50 hover:bg-emerald-800">{actionLoading === "resolve" ? "Resolving…" : "Resolve Case"}</button>
                        </div>
                      )}
                      {(["RESOLVED", "CLOSED"].includes(selected.status)) && (
                        <div className="p-2.5 bg-amber-50 rounded border border-amber-100">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-2">Reopen Case</p>
                          <textarea value={reopenForm.reason} onChange={(e) => setReopenForm({ ...reopenForm, reason: e.target.value })} rows={2} placeholder="Reason for reopening…" className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" />
                          <button onClick={handleReopen} disabled={actionLoading === "reopen"} className="w-full px-2 py-1.5 bg-amber-700 text-white rounded text-sm disabled:opacity-50 hover:bg-amber-800">{actionLoading === "reopen" ? "Reopening…" : "Reopen Case"}</button>
                        </div>
                      )}
                    </div>
                  </details>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};