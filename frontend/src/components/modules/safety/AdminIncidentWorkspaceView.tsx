import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../../components/ui/ToastContainer";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { apiRequest } from "../../../services/apiClient";
import { downloadStoredFile, fetchStoredFile } from "../../../services/uploadClient";
import { postMultipart } from "../../../services/incidentApi";
import {
  faShieldAlt, faClipboardList, faClock, faFileAlt, faSearch, faFilter, faEye,
  faComment, faPaperclip, faUpload, faArrowUpRightFromSquare, faSpinner, faUser,
  faBuilding, faUserShield, faPlus, faTimes, faHistory, faInboxTray, faCheckCircle,
  faExclamationCircle, faPhone, faEnvelope, faMapMarkerAlt, faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-blue-100 text-blue-800", RECEIVED: "bg-indigo-100 text-indigo-800",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-800",
  ASSIGNED_FOR_INVESTIGATION: "bg-purple-100 text-purple-800",
  INVESTIGATION_IN_PROGRESS: "bg-orange-100 text-orange-800",
  AWAITING_STUDENT_INFORMATION: "bg-amber-100 text-amber-800",
  ACTION_TAKEN: "bg-emerald-100 text-emerald-800", RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-800", REPORTED: "bg-blue-100 text-blue-800",
  ACKNOWLEDGED: "bg-indigo-100 text-indigo-800", UNDER_INVESTIGATION: "bg-orange-100 text-orange-800",
  ESCALATED: "bg-red-100 text-red-800",
};

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  LOW: "bg-green-100 text-green-800", MODERATE: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800", CRITICAL: "bg-red-100 text-red-800",
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

function statusBadge(status: IncidentStatus) {
  return (
    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export const AdminIncidentWorkspaceView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();
  const actorId = String(currentUser?._id || currentUser?.id || "");

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [summary, setSummary] = useState<CampusSafetySummary>({
    totalIncidents: 0, newReports: 0, underReview: 0, activeInvestigations: 0,
    awaitingStudentResponse: 0, resolvedCases: 0, closedCases: 0, highCriticalSeverity: 0,
  });
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [staffUsers, setStaffUsers] = useState<Array<{ id: string; name: string; email: string; department?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: "", incidentType: "", severity: "", status: "", assignedDepartment: "", dateFrom: "", dateTo: "",
  });
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [sort, setSort] = useState("reportedAt");
  const [order, setOrder] = useState("desc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const [assignForm, setAssignForm] = useState({ assignedTo: "", assignedDepartment: "", priority: "NORMAL", internalNotes: "" });
  const [statusForm, setStatusForm] = useState({ status: "", description: "" });
  const [updateForm, setUpdateForm] = useState({ title: "", description: "", visibility: "student" as const });
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
    } catch {
      /* summary non-fatal */
    }
  }, [filters.dateFrom, filters.dateTo, toast]);

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
    } catch {
      /* staff list non-fatal */
    }
  }, [toast]);

  const fetchContacts = useCallback(async () => {
    try {
      const data = await apiRequest<{ contacts: EmergencyContact[] }>("/campus-safety/emergency-contacts");
      setContacts(data.contacts);
    } catch {
      /* fall back to defaults */
    }
  }, [toast]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchIncidents(), fetchSummary(), fetchStaff(), fetchContacts()]).finally(() => setLoading(false));
  }, [fetchIncidents, fetchSummary, fetchStaff, fetchContacts]);

  useEffect(() => {
    fetchIncidents();
  }, [page]);

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
    } finally {
      setDrawerLoading(false);
    }
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
        method: "PATCH",
        body: JSON.stringify({ status: statusForm.status, description: statusForm.description }),
      });
    });
  };

  const handleAddUpdate = async () => {
    await runAction("update", async () => {
      const fields: Record<string, string> = {
        title: updateForm.title,
        description: updateForm.description,
        visibility: updateForm.visibility,
      };
      await postMultipart(`/campus-safety/incidents/${selected!.id}/updates`, updateFiles, fields);
    });
  };

  const handleAddNote = async () => {
    await runAction("note", async () => {
      await apiRequest(`/campus-safety/incidents/${selected!.id}/internal-notes`, {
        method: "POST",
        body: JSON.stringify({ note: noteForm }),
      });
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
      await apiRequest(`/campus-safety/incidents/${selected!.id}/resolve`, {
        method: "PATCH",
        body: JSON.stringify(resolveForm),
      });
    });
  };

  const handleReopen = async () => {
    if (!window.confirm("Reopen this case? The previous investigation history will be preserved.")) return;
    await runAction("reopen", async () => {
      await apiRequest(`/campus-safety/incidents/${selected!.id}/reopen`, {
        method: "PATCH",
        body: JSON.stringify({ reason: reopenForm.reason }),
      });
    });
  };

  const handlePreviewFile = (fileId: string, mimeType: string, name: string) => {
    if (mimeType.startsWith("image/") || mimeType === "application/pdf") {
      void fetchStoredFile(fileId).then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.target = "_blank"; a.rel = "noopener"; a.click();
      });
    } else {
      void downloadStoredFile(fileId, name);
    }
  };

  const statCards = [
    { label: "Total Incidents", value: summary.totalIncidents, icon: faClipboardList, color: "text-blue-600" },
    { label: "New Reports", value: summary.newReports, icon: faInboxTray, color: "text-indigo-600" },
    { label: "Under Review", value: summary.underReview, icon: faEye, color: "text-amber-600" },
    { label: "Active Investigations", value: summary.activeInvestigations, icon: faHistory, color: "text-orange-600" },
    { label: "Awaiting Student", value: summary.awaitingStudentResponse, icon: faComment, color: "text-purple-600" },
    { label: "Resolved", value: summary.resolvedCases, icon: faCheckCircle, color: "text-green-600" },
    { label: "High / Critical", value: summary.highCriticalSeverity, icon: faExclamationCircle, color: "text-red-600" },
  ];

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
    const items: Array<{ when: string; title: string; desc: string; by: string; visibility: string; attachments: any[]; kind: string; status?: string }> = [];
    for (const u of selected.updates || []) {
      items.push({ when: u.createdAt, title: u.title, desc: u.description, by: u.createdBy?.name || "Staff", visibility: u.visibility, attachments: u.attachments, kind: "update", status: u.status });
    }
    for (const m of selected.messages || []) {
      items.push({ when: m.createdAt, title: m.senderType === "student" ? "Student" : "Staff Reply", desc: m.message, by: m.senderName, visibility: m.visibility, attachments: m.attachments, kind: "message" });
    }
    return items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
  }, [selected]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin text-[var(--color-primary)]" size="xl" />
          <p className="text-sm text-gray-500">Loading incident workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incident Management</h1>
          <p className="text-gray-500 mt-1">Review, assign, investigate, and resolve student safety incident reports.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.location.assign("/safety/report-incident")} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-strong)] inline-flex items-center gap-2">
            <FontAwesomeIcon icon={faPlus} className="mr-2" /> New Report
          </button>
        </div>
      </div>

      {/* Emergency Contacts */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <FontAwesomeIcon icon={faShieldAlt} className="text-[var(--color-primary)]" />
          Emergency Contacts
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <div key={contact.name} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${contact.type === "SECURITY" ? "bg-blue-100 text-blue-600" : contact.type === "MEDICAL" ? "bg-red-100 text-red-600" : contact.type === "FIRE" ? "bg-orange-100 text-orange-600" : contact.type === "POLICE" ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-600"}`}>
                  <FontAwesomeIcon icon={contact.type === "SECURITY" ? faShieldAlt : contact.type === "MEDICAL" ? faUser : contact.type === "FIRE" ? faExclamationCircle : contact.type === "POLICE" ? faUserShield : faBuilding} />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{contact.name}</h4>
                  <p className="text-sm text-gray-500">{contact.type} • {contact.available}</p>
                </div>
              </div>
              <div className="space-y-1">
                <a href={`tel:${contact.phone}`} className="text-[var(--color-primary)] hover:underline text-sm flex items-center gap-1">
                  <FontAwesomeIcon icon={faPhone} size="xs" /> {contact.phone}
                </a>
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="text-[var(--color-primary)] hover:underline text-sm flex items-center gap-1">
                    <FontAwesomeIcon icon={faEnvelope} size="xs" /> {contact.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.color} bg-[color-mix(in_srgb,var(--tw-gradient-stops),_20%)]`}>
                <FontAwesomeIcon icon={card.icon} size="lg" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col sm:flex-row gap-4 items-end">
        <div className="relative flex-1 sm:w-96">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search incident number, title, student, description..."
            value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none" />
        </div>
        <select value={filters.incidentType} onChange={(e) => setFilters({ ...filters, incidentType: e.target.value, page: 1 })}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none">
          <option value="">All Types</option>
          {([ "THEFT","ASSAULT","HARASSMENT","VANDALISM","FIRE_HAZARD","MEDICAL_EMERGENCY","BULLYING","CYBERBULLYING","SAFETY_CONCERN","UNSAFE_CONDITION","SECURITY_BREACH","SUSPICIOUS_ACTIVITY","OTHER" ] as IncidentType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <select value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value, page: 1 })}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none">
          <option value="">All Severities</option><option value="LOW">Low</option><option value="MODERATE">Moderate</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none">
          <option value="">All Statuses</option>
          {([ "SUBMITTED","RECEIVED","UNDER_REVIEW","ASSIGNED_FOR_INVESTIGATION","INVESTIGATION_IN_PROGRESS","AWAITING_STUDENT_INFORMATION","ACTION_TAKEN","RESOLVED","CLOSED" ] as IncidentStatus[]).map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
        </select>
        <select value={filters.assignedDepartment} onChange={(e) => setFilters({ ...filters, assignedDepartment: e.target.value, page: 1 })}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none">
          <option value="">All Departments</option>{DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="flex gap-2">
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value, page: 1 })} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value, page: 1 })} className="px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <button onClick={fetchIncidents} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-strong)]">Apply</button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="px-4 py-3 text-left font-medium">Incident Number</th>
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Severity</th>
                <th className="px-4 py-3 text-left font-medium">Submitted</th>
                <th className="px-4 py-3 text-left font-medium">Assigned</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Updated</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredIncidents.length === 0 ? (
                <tr><td colSpan="10" className="p-8 text-center text-gray-500">No incidents found.</td></tr>
              ) : (
                filteredIncidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-gray-50 cursor-pointer group" onClick={() => openDetail(inc.id)}>
                    <td className="px-4 py-3 text-gray-900 font-medium">{inc.incidentNumber}</td>
                    <td className="px-4 py-3 truncate max-w-[200px]">{inc.title}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{inc.student?.fullName || inc.reportedBy?.name || "—"}</div>
                      <div className="text-xs text-gray-500">{inc.student?.studentId || "—"}</div>
                    </td>
                    <td className="px-4 py-3">{TYPE_LABELS[inc.incidentType as IncidentType] || inc.incidentType}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs font-medium rounded-full ${SEVERITY_COLORS[inc.severity]}`}>{inc.severity}</span></td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(inc.reportedAt)}</td>
                    <td className="px-4 py-3 text-gray-600">{inc.assignedTo?.name || inc.assignedDepartment || "—"}</td>
                    <td className="px-4 py-3">{statusBadge(inc.status)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(inc.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <FontAwesomeIcon icon={faArrowRight} className="text-gray-400 group-hover:text-[var(--color-primary)]" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(pagination.page - 1)} disabled={pagination.page === 1} className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50">Previous</button>
              <button onClick={() => setPage(pagination.page + 1)} disabled={pagination.page === pagination.pages} className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Incident detail drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-start" role="dialog" aria-modal="true" aria-label="Incident details" onClick={(e) => { if (e.target === e.currentTarget) closeDrawer(); }}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeDrawer} aria-hidden="true" />
          <div className="relative bg-white w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col h-[95vh]">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FontAwesomeIcon icon={faFileAlt} className="text-[var(--color-primary)]" />
                {selected?.incidentNumber}
              </h3>
              <button onClick={closeDrawer} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100" aria-label="Close">
                <FontAwesomeIcon icon={faTimes} size="lg" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {drawerLoading ? (
                <div className="text-center py-20 text-gray-500"><FontAwesomeIcon icon={faSpinner} className="animate-spin mr-2" /> Loading...</div>
              ) : selected && (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h4 className="font-medium text-gray-900">{selected.title}</h4>
                      <p className="text-sm text-gray-500">{TYPE_LABELS[selected.incidentType as IncidentType] || selected.incidentType} • {selected.severity} severity • {selected.priority} priority</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(selected.status)}
                      <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${SEVERITY_COLORS[selected.severity]}`}>{selected.severity}</span>
                    </div>
                  </div>

                  {/* Original submission */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <FontAwesomeIcon icon={faClipboardList} className="text-[var(--color-primary)]" /> Original Student Submission
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="bg-gray-50 p-3 rounded-lg"><div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Student</div><div className="text-gray-900 font-medium">{selected.student?.fullName}</div><div className="text-xs text-gray-500 mt-1">{selected.student?.studentId}</div></div>
                      <div className="bg-gray-50 p-3 rounded-lg"><div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Reported</div><div className="text-gray-900">{formatDateTime(selected.reportedAt)}</div></div>
                      <div className="bg-gray-50 p-3 rounded-lg"><div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Occurred</div><div className="text-gray-900">{formatDateTime(selected.incidentDate || selected.occurredAt)} {selected.incidentTime ? `• ${selected.incidentTime}` : ""}</div></div>
                      <div className="bg-gray-50 p-3 rounded-lg"><div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Location</div><div className="text-gray-900">{selected.location.building || "—"} {selected.location.room ? `, Room ${selected.location.room}` : ""}</div></div>
                      <div className="bg-gray-50 p-3 rounded-lg"><div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Assigned To</div><div className="text-gray-900">{selected.assignedTo?.name || "Unassigned"}</div><div className="text-xs text-gray-500 mt-1">{selected.assignedDepartment || "—"}</div></div>
                      <div className="bg-gray-50 p-3 rounded-lg"><div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Confidential</div><div className="text-gray-900">{selected.confidentialityRequest ? "Yes" : "No"}</div></div>
                    </div>
                    <div className="mt-4"><div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Description</div><p className="text-gray-700 leading-relaxed">{selected.description}</p></div>
                    {selected.peopleInvolved && <div className="mt-3"><div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">People Involved</div><p className="text-gray-700">{selected.peopleInvolved}</p></div>}
                    {selected.witnesses && selected.witnesses.length && (
                      <div className="mt-3"><div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Witnesses</div><ul className="list-disc list-inside text-sm text-gray-700">{selected.witnesses.map((w, i) => <li key={i}>{w.name}{w.contact ? ` (${w.contact})` : ""}</li>)}</ul></div>
                    )}
                    {selected.evidence && selected.evidence.length && (
                      <div className="mt-4"><div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Evidence</div><div className="flex flex-wrap gap-2">{selected.evidence.map((f) => (
                        <div key={f.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded border border-gray-100 text-xs">
                          <FontAwesomeIcon icon={f.mimeType.startsWith("image/") ? faEye : faPaperclip} className="text-gray-500" size="xs" />
                          <span className="truncate max-w-[160px]">{f.originalName}</span>
                          <button onClick={(e) => { e.stopPropagation(); handlePreviewFile(f.fileId, f.mimeType, f.originalName); }} className="text-[var(--color-primary)] hover:underline">Download</button>
                        </div>
                      ))}</div></div>
                    )}
                  </div>

                  {/* Timeline */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <FontAwesomeIcon icon={faHistory} className="text-[var(--color-primary)]" /> Case Timeline & Updates
                    </h5>
                    <div className="relative pl-4 space-y-4">
                      <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-gray-200" />
                      {tlItems.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-6">No updates yet.</p>
                      ) : (
                        tlItems.map((item, i) => (
                          <div key={i} className="relative">
                            <div className="absolute left-0 top-2 w-2 h-2 rounded-full border-2 border-[var(--color-primary)] bg-white" />
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${item.visibility === "internal" ? "bg-gray-100 text-gray-700" : "bg-blue-50 text-blue-700"}`}>{item.kind === "update" ? STATUS_LABELS[item.status as IncidentStatus] : item.title}</span>
                                  {item.visibility === "internal" && <span className="text-gray-700 text-xs font-bold" title="Internal note">INTERNAL</span>}
                                </div>
                                <p className="text-sm text-gray-700 mt-1">{item.desc}</p>
                                {item.attachments && item.attachments.length && (
                                  <div className="flex flex-wrap gap-2 mt-2">{item.attachments.map((f: any) => (
                                    <div key={f.id} className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs text-gray-700 cursor-pointer" onClick={(e) => { e.stopPropagation(); handlePreviewFile(f.fileId, f.mimeType, f.originalName); }}>
                                      <FontAwesomeIcon icon={faPaperclip} size="xs" /> {f.originalName}
                                    </div>
                                  ))}</div>
                                )}
                              </div>
                              <div className="text-right text-xs text-gray-500">{formatDateTime(item.when)}</div>
                              <div className="text-xs text-gray-500">{item.by}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Management actions */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h5 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <FontAwesomeIcon icon={faUserShield} className="text-[var(--color-primary)]" /> Case Management
                    </h5>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Assign / Reassign</div>
                        <select value={assignForm.assignedTo} onChange={(e) => setAssignForm({ ...assignForm, assignedTo: e.target.value })} className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none">
                          <option value="">Select staff member</option>
                          {staffUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.department || "General"})</option>)}
                        </select>
                        <select value={assignForm.assignedDepartment} onChange={(e) => setAssignForm({ ...assignForm, assignedDepartment: e.target.value })} className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none">
                          <option value="">Department</option>{DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <select value={assignForm.priority} onChange={(e) => setAssignForm({ ...assignForm, priority: e.target.value as any })} className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none">
                          <option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
                        </select>
                        <textarea value={assignForm.internalNotes} onChange={(e) => setAssignForm({ ...assignForm, internalNotes: e.target.value })} rows={2} placeholder="Internal assignment notes..." className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none" />
                        <button onClick={handleAssign} disabled={actionLoading === "assign"} className="w-full px-3 py-2 bg-[var(--color-primary)] text-white rounded-lg disabled:opacity-50">{actionLoading === "assign" ? "Assigning…" : "Assign Case"}</button>
                      </div>

                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Update Status</div>
                        <select value={statusForm.status} onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value as IncidentStatus })} className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none">
                          <option value="">New status</option>
                          {([ "RECEIVED","UNDER_REVIEW","ASSIGNED_FOR_INVESTIGATION","INVESTIGATION_IN_PROGRESS","AWAITING_STUDENT_INFORMATION","ACTION_TAKEN","RESOLVED","CLOSED" ] as IncidentStatus[]).map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
                        </select>
                        <input value={statusForm.description} onChange={(e) => setStatusForm({ ...statusForm, description: e.target.value })} placeholder="Description (optional)" className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none" />
                        <button onClick={handleStatusChange} disabled={actionLoading === "status"} className="w-full px-3 py-2 bg-[var(--color-primary)] text-white rounded-lg disabled:opacity-50">{actionLoading === "status" ? "Updating…" : "Update Status"}</button>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg mt-4">
                      <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Add Investigation Update</div>
                      <input value={updateForm.title} onChange={(e) => setUpdateForm({ ...updateForm, title: e.target.value })} placeholder="Update title" className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none" />
                      <textarea value={updateForm.description} onChange={(e) => setUpdateForm({ ...updateForm, description: e.target.value })} rows={2} placeholder="Progress description" className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none" />
                      <select value={updateForm.visibility} onChange={(e) => setUpdateForm({ ...updateForm, visibility: e.target.value as "student" | "internal" })} className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none">
                        <option value="student">Student-visible</option><option value="internal">Internal note only</option>
                      </select>
                      <input type="file" multiple onChange={(e) => { if (e.target.files) setUpdateFiles(Array.from(e.target.files)); }} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[var(--color-primary)] file:text-white" />
                      <button onClick={handleAddUpdate} disabled={actionLoading === "update"} className="w-full px-3 py-2 bg-[var(--color-primary)] text-white rounded-lg disabled:opacity-50">{actionLoading === "update" ? "Adding…" : "Add Update"}</button>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg mt-4">
                      <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Internal Investigation Note</div>
                      <textarea value={noteForm} onChange={(e) => setNoteForm(e.target.value)} rows={3} placeholder="Confidential internal note (never shown to students)..." className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none" />
                      <button onClick={handleAddNote} disabled={actionLoading === "note"} className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg disabled:opacity-50">{actionLoading === "note" ? "Adding…" : "Add Internal Note"}</button>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg mt-4">
                      <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Message to Student</div>
                      <textarea value={messageForm} onChange={(e) => setMessageForm(e.target.value)} rows={3} placeholder="Type your message to the student..." className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none" />
                      <input type="file" multiple onChange={(e) => { if (e.target.files) setMessageFiles(Array.from(e.target.files)); }} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[var(--color-primary)] file:text-white mb-2" />
                      <button onClick={handleSendMessage} disabled={actionLoading === "message"} className="w-full px-3 py-2 bg-[var(--color-primary)] text-white rounded-lg disabled:opacity-50">{actionLoading === "message" ? "Sending…" : "Send Message"}</button>
                    </div>

                    {(!["RESOLVED", "CLOSED"].includes(selected.status)) && (
                      <div className="bg-green-50 p-4 rounded-lg mt-4 border border-green-100">
                        <div className="text-xs text-green-700 uppercase tracking-wider font-semibold mb-2">Resolve Case</div>
                        <select value={resolveForm.category} onChange={(e) => setResolveForm({ ...resolveForm, category: e.target.value })} className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none">
                          <option value="">Resolution category</option>
                          <option value="RESOLVED">Resolved</option><option value="UNFOUNDED">Unfounded</option><option value="REFERRED_EXTERNAL">Referred External</option><option value="ONGOING_MONITORING">Ongoing Monitoring</option>
                        </select>
                        <input value={resolveForm.summary} onChange={(e) => setResolveForm({ ...resolveForm, summary: e.target.value })} placeholder="Resolution summary" className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none" />
                        <textarea value={resolveForm.actionsTaken} onChange={(e) => setResolveForm({ ...resolveForm, actionsTaken: e.target.value })} rows={2} placeholder="Actions taken (internal)" className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none" />
                        <textarea value={resolveForm.studentVisibleSummary} onChange={(e) => setResolveForm({ ...resolveForm, studentVisibleSummary: e.target.value })} rows={2} placeholder="Final message to student" className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none" />
                        <select value={resolveForm.outcome} onChange={(e) => setResolveForm({ ...resolveForm, outcome: e.target.value as any })} className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none">
                          <option value="RESOLVED">Resolved</option><option value="UNFOUNDED">Unfounded</option><option value="REFERRED_EXTERNAL">Referred External</option><option value="ONGOING_MONITORING">Ongoing Monitoring</option>
                        </select>
                        <button onClick={handleResolve} disabled={actionLoading === "resolve"} className="w-full px-3 py-2 bg-green-700 text-white rounded-lg disabled:opacity-50">{actionLoading === "resolve" ? "Resolving…" : "Resolve Case"}</button>
                      </div>
                    )}
                    {(["RESOLVED", "CLOSED"].includes(selected.status)) && (
                      <div className="bg-amber-50 p-4 rounded-lg mt-4 border border-amber-100">
                        <div className="text-xs text-amber-700 uppercase tracking-wider font-semibold mb-2">Reopen Case</div>
                        <textarea value={reopenForm.reason} onChange={(e) => setReopenForm({ ...reopenForm, reason: e.target.value })} rows={2} placeholder="Reason for reopening..." className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none" />
                        <button onClick={handleReopen} disabled={actionLoading === "reopen"} className="w-full px-3 py-2 bg-amber-700 text-white rounded-lg disabled:opacity-50">{actionLoading === "reopen" ? "Reopening…" : "Reopen Case"}</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
