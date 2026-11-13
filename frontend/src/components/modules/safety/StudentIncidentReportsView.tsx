import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../../components/ui/ToastContainer";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { apiRequest } from "../../../services/apiClient";
import { downloadStoredFile, fetchStoredFile } from "../../../services/uploadClient";
import { postMultipart, incidentFileUrl } from "../../../services/incidentApi";
import {
  faShieldAlt, faClipboardList, faClock, faFileAlt, faSearch, faFilter,
  faEye, faComment, faComments, faPaperclip, faUpload,   faArrowUpRightFromSquare,
  faCheckCircle, faExclamationCircle, faTimes, faSpinner, faUser, faBuilding,
  faUserShield, faSortAmountDown, faEllipsisV, faPhone, faEnvelope, faMapMarkerAlt,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  Incident, IncidentStatus, IncidentSeverity, IncidentType, EmergencyContact,
  IncidentUpdateVisibility,
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

const TYPE_LABELS: Record<IncidentType, string> = {
  THEFT: "Theft", ASSAULT: "Assault", HARASSMENT: "Harassment", VANDALISM: "Vandalism",
  FIRE_HAZARD: "Fire Hazard", MEDICAL_EMERGENCY: "Medical Emergency", BULLYING: "Bullying",
  CYBERBULLYING: "Cyberbullying", SAFETY_CONCERN: "Safety Concern", UNSAFE_CONDITION: "Unsafe Condition",
  SECURITY_BREACH: "Security Breach", SUSPICIOUS_ACTIVITY: "Suspicious Activity", OTHER: "Other",
};

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

export const StudentIncidentReportsView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();
  const isStudent = currentUser?.roles?.includes("student") || currentUser?.role === "student";

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", incidentType: "", severity: "", status: "" });
  const [newMessage, setNewMessage] = useState("");
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceDesc, setEvidenceDesc] = useState("");
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ id: string; url: string; name: string } | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const fetchIncidents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append("search", filters.search);
      if (filters.incidentType) params.append("incidentType", filters.incidentType);
      if (filters.severity) params.append("severity", filters.severity);
      if (filters.status) params.append("status", filters.status);
      params.append("page", "1");
      params.append("limit", "50");
      const data = await apiRequest<{ incidents: Incident[]; pagination: any }>(`/campus-safety/incidents?${params}`);
      setIncidents(data.incidents);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load your incident reports.");
    }
  }, [filters.search, filters.incidentType, filters.severity, filters.status, toast]);

  const fetchContacts = useCallback(async () => {
    try {
      const data = await apiRequest<{ contacts: EmergencyContact[] }>("/campus-safety/emergency-contacts");
      setContacts(data.contacts);
    } catch {
      /* contacts are optional; fall back to defaults */
    }
  }, [toast]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchIncidents(), fetchContacts()]).finally(() => setLoading(false));
  }, [fetchIncidents, fetchContacts]);

  const filtered = useMemo(() => {
    const s = filters.search.toLowerCase();
    return incidents.filter((inc) => {
      if (s && !inc.incidentNumber.toLowerCase().includes(s)
        && !inc.title.toLowerCase().includes(s)
        && !inc.description.toLowerCase().includes(s)) return false;
      if (filters.incidentType && inc.incidentType !== filters.incidentType) return false;
      if (filters.severity && inc.severity !== filters.severity) return false;
      if (filters.status && inc.status !== filters.status) return false;
      return true;
    });
  }, [incidents, filters]);

  const openDetail = async (incident: Incident) => {
    setSelected(incident);
    setDetailLoading(true);
    try {
      const data = await apiRequest<{ incident: Incident }>(`/campus-safety/incidents/${incident.id}`);
      setSelected(data.incident);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load case details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setNewMessage("");
    setMessageFiles([]);
    setEvidenceFiles([]);
    setEvidenceDesc("");
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
    setPreviewFile(null);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || (!newMessage.trim() && messageFiles.length === 0)) return;
    setSendingMessage(true);
    try {
      const fields: Record<string, string> = { message: newMessage.trim(), visibility: "student" };
      await postMultipart(`/campus-safety/incidents/${selected.id}/messages`, messageFiles, fields);
      setNewMessage("");
      setMessageFiles([]);
      await openDetail(selected);
      toast.success("Message sent.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send message.");
    } finally {
      setSendingMessage(false);
    }
  };

  const submitEvidence = async () => {
    if (!selected || evidenceFiles.length === 0) return;
    setUploadingEvidence(true);
    try {
      const fields: Record<string, string> = { description: evidenceDesc.trim() };
      await postMultipart(`/campus-safety/incidents/${selected.id}/evidence`, evidenceFiles, fields);
      setEvidenceFiles([]);
      setEvidenceDesc("");
      await openDetail(selected);
      toast.success("Evidence submitted.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit evidence.");
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handlePreview = (file: IncidentEvidence) => {
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
    if (file.mimeType.startsWith("image/") || file.mimeType === "application/pdf") {
      fetchStoredFile(file.fileId).then((blob) => {
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewFile({ id: file.id, url, name: file.originalName });
      }).catch(() => toast.error("Could not load preview."));
    } else {
      void downloadStoredFile(file.fileId, file.originalName);
    }
  };

  const handleDownload = (file: IncidentEvidence) => {
    void downloadStoredFile(file.fileId, file.originalName);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin text-[var(--color-primary)]" size="xl" />
          <p className="text-sm text-gray-500">Loading your incident reports...</p>
        </div>
      </div>
    );
  }

  const timelineItems = useMemo(() => {
    if (!selected) return [];
    const items: Array<{ when: string; title: string; desc: string; by: string; visible: IncidentUpdateVisibility; attachments: IncidentEvidence[]; kind: "update" | "message" }> = [];
    for (const u of selected.updates || []) {
      items.push({ when: u.createdAt, title: u.title, desc: u.description, by: u.createdBy?.name || "CollegeOS", visible: u.visibility, attachments: u.attachments, kind: "update" });
    }
    for (const m of selected.messages || []) {
      items.push({ when: m.createdAt, title: m.senderType === "student" ? "You" : "Staff Reply", desc: m.message, by: m.senderName, visible: m.visibility, attachments: m.attachments, kind: "message" });
    }
    return items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
  }, [selected]);

  if (!isStudent) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Incident Reports</h1>
          <p className="text-gray-500 mt-1">Track your submitted safety and security cases from submission to resolution.</p>
        </div>
        <button
          onClick={() => window.location.assign("/safety/report-incident")}
          className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-strong)] inline-flex items-center gap-2"
        >
          <FontAwesomeIcon icon={faFileAlt} className="mr-2" /> Report New Incident
        </button>
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

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="relative flex-1 sm:w-80">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search incident number, title, or description..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none"
            />
          </div>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none"
          >
            <option value="">All Statuses</option>
            {[ "SUBMITTED","RECEIVED","UNDER_REVIEW","ASSIGNED_FOR_INVESTIGATION","INVESTIGATION_IN_PROGRESS","AWAITING_STUDENT_INFORMATION","ACTION_TAKEN","RESOLVED","CLOSED" ] as IncidentStatus[]}.map((st) => (
              <option key={st} value={st}>{STATUS_LABELS[st]}</option>
            ))
          </select>
          <select
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none"
          >
            <option value="">All Severities</option>
            <option value="LOW">Low</option><option value="MODERATE">Moderate</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
          </select>
        </div>
      </div>

      {/* Reports list */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <FontAwesomeIcon icon={faClipboardList} className="mb-3 text-2xl text-gray-300" />
            <p className="text-sm">No incident reports found.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filtered.map((inc) => (
              <div key={inc.id} className="p-4 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => openDetail(inc)}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center ${SEVERITY_COLORS[inc.severity]}`}>
                      <FontAwesomeIcon icon={faExclamationCircle} size="lg" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-gray-900 truncate">{inc.title}</h4>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${SEVERITY_COLORS[inc.severity]}`}>{inc.severity}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[inc.status]}`}>{STATUS_LABELS[inc.status]}</span>
                      </div>
                      <p className="text-sm text-gray-500 truncate mt-1">{inc.description}</p>
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-500">
                        <span><FontAwesomeIcon icon={faClock} className="mr-1" /> {formatDateTime(inc.reportedAt)}</span>
                        <span><FontAwesomeIcon icon={faMapMarkerAlt} className="mr-1" /> {inc.location.building || ""} {inc.location.room ? `, Room ${inc.location.room}` : ""}</span>
                        {inc.assignedTo && <span><FontAwesomeIcon icon={faUserShield} className="mr-1" /> {inc.assignedTo.name}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faArrowRightFromSquare} className="text-gray-400 hover:text-[var(--color-primary)]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Case detail modal */}
      {selected && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="case-detail-title" onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeDetail} aria-hidden="true" />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 id="case-detail-title" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FontAwesomeIcon icon={faClipboardList} className="text-[var(--color-primary)]" />
                {selected.incidentNumber}
              </h3>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100" aria-label="Close">
                <FontAwesomeIcon icon={faTimes} size="lg" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 lg:p-6 space-y-6">
              {detailLoading && <div className="text-center py-10 text-gray-500"><FontAwesomeIcon icon={faSpinner} className="animate-spin mr-2" /> Loading...</div>}
              {!detailLoading && (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
                    <div>
                      <h4 className="font-medium text-gray-900">{selected.title}</h4>
                      <p className="text-sm text-gray-500">{TYPE_LABELS[selected.incidentType as IncidentType] || selected.incidentType} • {selected.severity} severity</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[selected.status]}`}>{STATUS_LABELS[selected.status]}</span>
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${SEVERITY_COLORS[selected.severity]}`}>{selected.severity}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Reported</div>
                      <div className="text-gray-900">{formatDateTime(selected.reportedAt)}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Location</div>
                      <div className="text-gray-900">{selected.location.building || "—"} {selected.location.room ? `, Room ${selected.location.room}` : ""} {selected.location.area ? ` • ${selected.location.area}` : ""}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Occurred</div>
                      <div className="text-gray-900">{formatDateTime(selected.incidentDate || selected.occurredAt)} {selected.incidentTime ? `• ${selected.incidentTime}` : ""}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Assigned</div>
                      <div className="text-gray-900">{selected.assignedTo ? selected.assignedTo.name : "Not yet assigned"}</div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h5 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <FontAwesomeIcon icon={faFileAlt} className="text-[var(--color-primary)]" /> Your Report
                    </h5>
                    <p className="text-gray-700 leading-relaxed mb-2">{selected.description}</p>
                    {selected.peopleInvolved && <p className="text-sm text-gray-600"><span className="font-semibold">People involved:</span> {selected.peopleInvolved}</p>}
                    {selected.witnesses && selected.witnesses.length && (
                      <>
                        <p className="text-sm text-gray-600 mt-2"><span className="font-semibold">Witnesses:</span></p>
                        <ul className="list-disc list-inside text-sm text-gray-600 mt-1">
                          {selected.witnesses.map((w, i) => <li key={i}>{w.name}{w.contact ? ` (${w.contact})` : ""}{w.statement ? ` — ${w.statement}` : ""}</li>)}
                        </ul>
                      </>
                    )}
                    {selected.evidence && selected.evidence.length && (
                      <div className="mt-3">
                        <p className="text-sm text-gray-600 font-semibold mb-1">Supporting Evidence</p>
                        <div className="flex flex-wrap gap-2">
                          {selected.evidence.map((file) => (
                            <div key={file.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded border border-gray-100 text-xs">
                              <FontAwesomeIcon icon={file.mimeType.startsWith("image/") ? faEye : faPaperclip} className="text-gray-500" size="xs" />
                              <span className="truncate max-w-[180px]">{file.originalName}</span>
                              <button onClick={() => handlePreview(file)} className="text-[var(--color-primary)] hover:underline" title="Open or download">{file.mimeType.startsWith("image/") || file.mimeType === "application/pdf" ? "Open" : "Download"}</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <FontAwesomeIcon icon={faClock} className="text-[var(--color-primary)]" /> Case Timeline
                    </h5>
                    <div className="space-y-4 relative pl-4">
                      <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-gray-200" />
                      {timelineItems.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-6">No updates yet.</p>
                      ) : (
                        timelineItems.map((item, i) => (
                          <div key={i} className="relative mb-2">
                            <div className="absolute left-0 top-2 w-2 h-2 rounded-full border-2 border-[var(--color-primary)] bg-white" />
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${item.visible === "internal" ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-700"}`}>{item.kind === "update" ? STATUS_LABELS[item.status || "SUBMITTED" as IncidentStatus] : item.title}</span>
                                  {item.visible === "internal" && <span className="text-[var(--color-danger)] text-xs font-bold" title="Internal note">INTERNAL</span>}
                                </div>
                                <p className="text-sm text-gray-700 mt-1">{item.desc}</p>
                                {item.attachments && item.attachments.length && (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {item.attachments.map((file) => (
                                      <div key={file.id} className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded text-[var(--color-primary)] text-xs hover:bg-blue-100 cursor-pointer" onClick={(e) => { e.stopPropagation(); handlePreview(file); }}>
                                        <FontAwesomeIcon icon={faPaperclip} size="xs" /> {file.originalName}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="text-right text-xs text-gray-500">{formatDateTime(item.when)}</div>
                              <div className="text-[var(--color-gray)] text-xs">{item.by}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <FontAwesomeIcon icon={faComment} className="text-[var(--color-primary)]" /> Send a Message
                    </h5>
                    <p className="text-sm text-gray-500 mb-3">Ask a question, respond to a request for information, or submit additional evidence.</p>
                    <form onSubmit={sendMessage} className="space-y-3">
                      <div className="relative">
                        <textarea
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          rows={3}
                          placeholder="Type your message..."
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none text-gray-900"
                        />
                        {messageFiles.length > 0 && (
                          <div className="absolute right-2 top-2 flex gap-1">
                            {messageFiles.map((f) => (
                              <span key={f.name} className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs text-gray-700">{f.name} <span onClick={(e) => { e.stopPropagation(); setMessageFiles(messageFiles.filter((x) => x !== f)); }} className="cursor-pointer text-[var(--color-primary)]">×</span></span>
                            ))}
                          </div>
                        )}
                        <input type="file" multiple onChange={(e) => { if (e.target.files) setMessageFiles(Array.from(e.target.files)); }} className="sr-only" />
                        <label className="absolute right-2 bottom-2 text-[var(--color-primary)] text-xs cursor-pointer hover:underline" htmlFor={undefined} title="Attach files">Attach files</label>
                      </div>
                      <button type="submit" disabled={sendingMessage} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
                        <FontAwesomeIcon icon={faPaperclip} size="xs" className="mr-1" /> {sendingMessage ? "Sending…" : "Send Message"}
                      </button>
                    </form>
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <FontAwesomeIcon icon={faUpload} className="text-[var(--color-primary)]" /> Submit Additional Evidence
                    </h5>
                    <p className="text-sm text-gray-500 mb-3">Upload supporting documents, photos, or recordings related to this case.</p>
                    <div className="space-y-2">
                      <input type="file" multiple onChange={(e) => { if (e.target.files) setEvidenceFiles(Array.from(e.target.files)); }} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[var(--color-primary)] file:text-white hover:file:bg-[var(--color-primary-strong)]" />
                      <div className="flex gap-2">
                        <input value={evidenceDesc} onChange={(e) => setEvidenceDesc(e.target.value)} placeholder="Description of evidence (optional)" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-[var(--color-primary)] outline-none" />
                        <button onClick={submitEvidence} disabled={uploadingEvidence || evidenceFiles.length === 0} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg disabled:opacity-50">
                          {uploadingEvidence ? "Uploading…" : "Submit Evidence"}
                        </button>
                      </div>
                    </div>
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
