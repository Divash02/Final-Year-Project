import React, { useEffect, useState } from "react";
import { useToast } from "../../../components/ui/ToastContainer";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { apiRequest } from "../../../services/apiClient";
import {
  faBriefcaseMedical,
  faBuilding,
  faUser,
  faClock,
  faFileAlt,
  faPlus,
  faEye,
  faEdit,
  faTrash,
  faCheck,
  faTimes,
  faSearch,
  faFilter,
  faGraduationCap,
  faUserTie,
  faStar,
  faChartLine,
  faFileContract,
  faCalendar,
  faMoneyBillWave,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface Company {
  _id: string;
  name: string;
  industry: string;
  size: "STARTUP" | "SME" | "LARGE" | "ENTERPRISE";
  website?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  isActive: boolean;
  createdAt: string;
}

interface Supervisor {
  _id: string;
  company: { _id: string; name: string };
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  designation: string;
  department?: string;
  isActive: boolean;
}

interface InternshipApplication {
  _id: string;
  student: { _id: string; studentId: string; fullName: string; program: string; semester: number };
  company: Company;
  supervisor?: Supervisor;
  academicSupervisor?: { _id: string; name: string };
  status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "ACTIVE" | "COMPLETED" | "TERMINATED";
  type: "FULL_TIME" | "PART_TIME" | "REMOTE" | "HYBRID";
  startDate: string;
  endDate: string;
  stipend?: number;
  currency?: string;
  workHoursPerWeek?: number;
  description: string;
  learningObjectives: string[];
  skillsToDevelop: string[];
  appliedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  progressReports: ProgressReport[];
  evaluation?: Evaluation;
}

interface ProgressReport {
  _id: string;
  application: string;
  reportingPeriod: { start: string; end: string };
  submittedAt: string;
  submittedBy: { _id: string; name: string };
  activities: string[];
  achievements: string[];
  challenges: string[];
  hoursWorked: number;
  supervisorFeedback?: string;
  academicSupervisorFeedback?: string;
  status: "SUBMITTED" | "REVIEWED" | "APPROVED" | "REVISION_REQUIRED";
}

interface Evaluation {
  _id: string;
  application: string;
  evaluatedAt: string;
  evaluatedBy: { _id: string; name: string; role: string };
  technicalSkills: number;
  communicationSkills: number;
  teamwork: number;
  problemSolving: number;
  initiative: number;
  reliability: number;
  overallRating: number;
  strengths: string;
  areasForImprovement: string;
  recommendation: string;
  wouldRehire: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  TERMINATED: "Terminated",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  SUBMITTED: "bg-blue-100 text-blue-800",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  COMPLETED: "bg-purple-100 text-purple-800",
  TERMINATED: "bg-gray-100 text-gray-800",
};

const TYPE_COLORS: Record<string, string> = {
  FULL_TIME: "bg-blue-100 text-blue-800",
  PART_TIME: "bg-green-100 text-green-800",
  REMOTE: "bg-purple-100 text-purple-800",
  HYBRID: "bg-orange-100 text-orange-800",
};

export const InternshipManagementView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();
  const isStudent = currentUser?.role === "student";

  const [applications, setApplications] = useState<InternshipApplication[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"applications" | "companies" | "supervisors">("applications");
  const [filters, setFilters] = useState({ status: "", type: "", search: "", page: 1, limit: 20 });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [selectedApplication, setSelectedApplication] = useState<InternshipApplication | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showNewApplication, setShowNewApplication] = useState(false);
  const [newAppLoading, setNewAppLoading] = useState(false);
  const [newAppForm, setNewAppForm] = useState({
    companyId: "",
    type: "FULL_TIME",
    startDate: "",
    endDate: "",
    stipend: "",
    currency: "NPR",
    workHoursPerWeek: "",
    description: "",
    learningObjectives: [""],
    skillsToDevelop: [""],
  });

  const fetchApplications = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append("status", filters.status);
      if (filters.type) params.append("type", filters.type);
      if (filters.search) params.append("search", filters.search);
      params.append("page", String(filters.page));
      params.append("limit", String(filters.limit));

      const data = await apiRequest<{ applications: InternshipApplication[]; pagination: any }>(`/internship/applications?${params}`);
      setApplications(data.applications);
      setPagination(data.pagination);
    } catch (err) {
      toast.error("Failed to load applications");
    }
  };

  const fetchCompanies = async () => {
    try {
      const data = await apiRequest<{ companies: Company[] }>("/internship/companies");
      setCompanies(data.companies);
    } catch (err) {
      toast.error("Failed to load companies");
    }
  };

  const fetchSupervisors = async () => {
    try {
      const data = await apiRequest<{ supervisors: Supervisor[] }>("/internship/supervisors");
      setSupervisors(data.supervisors);
    } catch (err) {
      toast.error("Failed to load supervisors");
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchApplications(), fetchCompanies(), fetchSupervisors()]);
      setLoading(false);
    };
    loadAll();
  }, [filters.page]);

  const handleUpdateStatus = async (applicationId: string, status: string, notes?: string) => {
    try {
      await apiRequest(`/internship/applications/${applicationId}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, reviewNotes: notes }),
      });
      toast.success("Status updated successfully");
      fetchApplications();
      if (selectedApplication?._id === applicationId) setShowDetail(false);
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const handleSubmitProgressReport = async (applicationId: string, report: Partial<ProgressReport>) => {
    try {
      await apiRequest(`/internship/applications/${applicationId}/progress-reports`, {
        method: "POST",
        body: JSON.stringify(report),
      });
      toast.success("Progress report submitted");
      fetchApplications();
    } catch (err) {
      toast.error("Failed to submit report");
    }
  };

  const handleSubmitEvaluation = async (applicationId: string, evaluation: Partial<Evaluation>) => {
    try {
      await apiRequest(`/internship/applications/${applicationId}/evaluations`, {
        method: "POST",
        body: JSON.stringify(evaluation),
      });
      toast.success("Evaluation submitted");
      fetchApplications();
    } catch (err) {
      toast.error("Failed to submit evaluation");
    }
  };

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate required fields
    if (!newAppForm.companyId) {
      toast.error("Company is required");
      return;
    }
    if (!newAppForm.startDate || !newAppForm.endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    if (!newAppForm.description.trim()) {
      toast.error("Description is required");
      return;
    }
    if (newAppForm.learningObjectives.length === 0 || !newAppForm.learningObjectives[0].trim()) {
      toast.error("At least one learning objective is required");
      return;
    }

    setNewAppLoading(true);
    try {
      await apiRequest("/internship/applications", {
        method: "POST",
        body: JSON.stringify({
          ...newAppForm,
          learningObjectives: newAppForm.learningObjectives.filter((o) => o.trim()),
          skillsToDevelop: newAppForm.skillsToDevelop.filter((s) => s.trim()),
          stipend: newAppForm.stipend ? Number(newAppForm.stipend) : undefined,
          workHoursPerWeek: newAppForm.workHoursPerWeek ? Number(newAppForm.workHoursPerWeek) : undefined,
        }),
      });
      toast.success("Application created successfully");
      setShowNewApplication(false);
      setNewAppForm({
        companyId: "",
        type: "FULL_TIME",
        startDate: "",
        endDate: "",
        stipend: "",
        currency: "NPR",
        workHoursPerWeek: "",
        description: "",
        learningObjectives: [""],
        skillsToDevelop: [""],
      });
      fetchApplications();
    } catch (err) {
      toast.error("Failed to create application");
    } finally {
      setNewAppLoading(false);
    }
  };

  const addLearningObjective = () => {
    setNewAppForm((prev) => ({ ...prev, learningObjectives: [...prev.learningObjectives, ""] }));
  };
  const removeLearningObjective = (index: number) => {
    setNewAppForm((prev) => ({ ...prev, learningObjectives: prev.learningObjectives.filter((_, i) => i !== index) }));
  };
  const addSkill = () => {
    setNewAppForm((prev) => ({ ...prev, skillsToDevelop: [...prev.skillsToDevelop, ""] }));
  };
  const removeSkill = (index: number) => {
    setNewAppForm((prev) => ({ ...prev, skillsToDevelop: prev.skillsToDevelop.filter((_, i) => i !== index) }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Internship Management</h1>
          <p className="text-gray-500 mt-1">Manage internship applications, companies, and supervisors</p>
        </div>
        <div className="flex gap-2">
          {!isStudent && activeTab === "companies" && (
            <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              <FontAwesomeIcon icon={faPlus} className="mr-2" /> Add Company
            </button>
          )}
          {!isStudent && activeTab === "supervisors" && (
            <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              <FontAwesomeIcon icon={faPlus} className="mr-2" /> Add Supervisor
            </button>
          )}
          {!isStudent && activeTab === "applications" && (
            <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700" onClick={() => setShowNewApplication(true)}>
              <FontAwesomeIcon icon={faPlus} className="mr-2" /> New Application
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {[
            { id: "applications", label: "Applications", icon: faFileAlt },
            { id: "companies", label: "Companies", icon: faBuilding },
            { id: "supervisors", label: "Supervisors", icon: faUserTie },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                activeTab === tab.id
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <FontAwesomeIcon icon={tab.icon} size="sm" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Applications Tab */}
      {activeTab === "applications" && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by student, company, or status..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Types</option>
              {Object.entries(TYPE_COLORS).map(([value]) => (
                <option key={value} value={value}>{value.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stipend</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {applications.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No applications found</td>
                  </tr>
                ) : (
                  applications.map((app) => (
                    <tr key={app._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedApplication(app); setShowDetail(true); }}>
                      <td className="px-4 py-4">
                        <p className="font-medium text-gray-900">{app.student.fullName}</p>
                        <p className="text-sm text-gray-500">{app.student.studentId} • {app.student.program}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-gray-900">{app.company.name}</p>
                        <p className="text-sm text-gray-500">{app.company.industry}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${TYPE_COLORS[app.type]}`}>
                          {app.type.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {new Date(app.startDate).toLocaleDateString()} - {new Date(app.endDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[app.status]}`}>
                          {STATUS_LABELS[app.status]}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {app.stipend ? `${app.currency || "NPR"} ${app.stipend.toLocaleString()}/month` : "Unpaid"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-xs">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${app.progressReports.length > 0 ? Math.min(100, app.progressReports.length * 25) : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{app.progressReports.length} reports</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedApplication(app); setShowDetail(true); }}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                          >
                            <FontAwesomeIcon icon={faEye} size="sm" />
                          </button>
                          {!isStudent && ["SUBMITTED", "UNDER_REVIEW"].includes(app.status) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUpdateStatus(app._id, "APPROVED"); }}
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                              title="Approve"
                            >
                              <FontAwesomeIcon icon={faCheck} size="sm" />
                            </button>
                          )}
                          {!isStudent && ["SUBMITTED", "UNDER_REVIEW"].includes(app.status) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); const reason = prompt("Rejection reason:"); if (reason) handleUpdateStatus(app._id, "REJECTED", reason); }}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Reject"
                            >
                              <FontAwesomeIcon icon={faTimes} size="sm" />
                            </button>
                          )}
                          {!isStudent && app.status === "APPROVED" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUpdateStatus(app._id, "ACTIVE"); }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Start Internship"
                            >
                              <FontAwesomeIcon icon={faClock} size="sm" />
                            </button>
                          )}
                          {!isStudent && app.status === "ACTIVE" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUpdateStatus(app._id, "COMPLETED"); }}
                              className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded"
                              title="Complete"
                            >
                              <FontAwesomeIcon icon={faGraduationCap} size="sm" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                  disabled={filters.page === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                  disabled={filters.page === pagination.pages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Companies Tab */}
      {activeTab === "companies" && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Industry</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {companies.map((company) => (
                  <tr key={company._id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 font-medium text-gray-900">{company.name}</td>
                    <td className="px-4 py-4 text-gray-700">{company.industry}</td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">{company.size}</span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {company.contactPerson || "—"}<br />
                      {company.contactEmail || "—"}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${company.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                        {company.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded">
                        <FontAwesomeIcon icon={faEye} size="sm" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Supervisors Tab */}
      {activeTab === "supervisors" && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supervisor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Designation</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {supervisors.map((sup) => (
                  <tr key={sup._id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 font-medium text-gray-900">{sup.firstName} {sup.lastName}</td>
                    <td className="px-4 py-4 text-gray-700">{sup.company.name}</td>
                    <td className="px-4 py-4 text-gray-700">{sup.designation}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{sup.email}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${sup.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                        {sup.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded">
                        <FontAwesomeIcon icon={faEye} size="sm" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Application Detail Modal */}
      {showDetail && selectedApplication && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowDetail(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Application Details</h3>
                <button onClick={() => setShowDetail(false)} className="text-gray-400 hover:text-gray-600">
                  <FontAwesomeIcon icon={faTimes} size="lg" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-500">Student</p>
                    <p className="font-medium">{selectedApplication.student.fullName}</p>
                    <p className="text-sm text-gray-500">{selectedApplication.student.studentId} • {selectedApplication.student.program} • Sem {selectedApplication.student.semester}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Company</p>
                    <p className="font-medium">{selectedApplication.company.name}</p>
                    <p className="text-sm text-gray-500">{selectedApplication.company.industry} • {selectedApplication.company.size}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Type</p>
                    <span className={`px-2 py-1 text-sm font-medium rounded-full ${TYPE_COLORS[selectedApplication.type]}`}>
                      {selectedApplication.type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <span className={`px-2 py-1 text-sm font-medium rounded-full ${STATUS_COLORS[selectedApplication.status]}`}>
                      {STATUS_LABELS[selectedApplication.status]}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Period</p>
                    <p className="font-medium">{new Date(selectedApplication.startDate).toLocaleDateString()} - {new Date(selectedApplication.endDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Stipend</p>
                    <p className="font-medium">{selectedApplication.stipend ? `${selectedApplication.currency || "NPR"} ${selectedApplication.stipend.toLocaleString()}/month` : "Unpaid"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Hours/Week</p>
                    <p className="font-medium">{selectedApplication.workHoursPerWeek || "Not specified"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Supervisor</p>
                    <p className="font-medium">{selectedApplication.supervisor ? `${selectedApplication.supervisor.firstName} ${selectedApplication.supervisor.lastName}` : "Not assigned"}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                  <p className="text-gray-700">{selectedApplication.description}</p>
                </div>

                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-2">Learning Objectives</h4>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    {selectedApplication.learningObjectives.map((obj, i) => (
                      <li key={i}>{obj}</li>
                    ))}
                  </ul>
                </div>

                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-2">Skills to Develop</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedApplication.skillsToDevelop.map((skill, i) => (
                      <span key={i} className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-sm">{skill}</span>
                    ))}
                  </div>
                </div>

                {selectedApplication.progressReports.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-2">Progress Reports</h4>
                    <div className="space-y-3">
                      {selectedApplication.progressReports.map((report) => (
                        <div key={report._id} className="p-4 bg-gray-50 rounded-lg border">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-medium">Period: {new Date(report.reportingPeriod.start).toLocaleDateString()} - {new Date(report.reportingPeriod.end).toLocaleDateString()}</h5>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${report.status === "APPROVED" ? "bg-green-100 text-green-800" : report.status === "REVISION_REQUIRED" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-800"}`}>
                              {report.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-gray-500">Activities</p>
                              <ul className="list-disc list-inside">
                                {report.activities.map((a, i) => <li key={i}>{a}</li>)}
                              </ul>
                            </div>
                            <div>
                              <p className="text-gray-500">Achievements</p>
                              <ul className="list-disc list-inside">
                                {report.achievements.map((a, i) => <li key={i}>{a}</li>)}
                              </ul>
                            </div>
                            <div>
                              <p className="text-gray-500">Challenges</p>
                              <ul className="list-disc list-inside">
                                {report.challenges.map((c, i) => <li key={i}>{c}</li>)}
                              </ul>
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-gray-500">
                            Hours: {report.hoursWorked} • Submitted by: {report.submittedBy.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedApplication.evaluation && (
                  <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <h4 className="font-medium text-purple-800 mb-2">Evaluation</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Technical Skills</p>
                        <p className="font-bold text-2xl text-purple-600">{selectedApplication.evaluation.technicalSkills}/10</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Communication</p>
                        <p className="font-bold text-2xl text-purple-600">{selectedApplication.evaluation.communicationSkills}/10</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Teamwork</p>
                        <p className="font-bold text-2xl text-purple-600">{selectedApplication.evaluation.teamwork}/10</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Problem Solving</p>
                        <p className="font-bold text-2xl text-purple-600">{selectedApplication.evaluation.problemSolving}/10</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Initiative</p>
                        <p className="font-bold text-2xl text-purple-600">{selectedApplication.evaluation.initiative}/10</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Reliability</p>
                        <p className="font-bold text-2xl text-purple-600">{selectedApplication.evaluation.reliability}/10</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <p className="font-medium text-gray-900">Overall Rating: <span className="text-2xl text-purple-600">{selectedApplication.evaluation.overallRating}/10</span></p>
                      <p className="text-gray-700 mt-2"><strong>Strengths:</strong> {selectedApplication.evaluation.strengths}</p>
                      <p className="text-gray-700"><strong>Areas for Improvement:</strong> {selectedApplication.evaluation.areasForImprovement}</p>
                      <p className="text-gray-700"><strong>Recommendation:</strong> {selectedApplication.evaluation.recommendation}</p>
                      <p className="text-gray-700"><strong>Would Rehire:</strong> {selectedApplication.evaluation.wouldRehire ? "Yes" : "No"}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Application Modal */}
      {showNewApplication && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowNewApplication(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">New Internship Application</h3>
                <button onClick={() => setShowNewApplication(false)} className="text-gray-400 hover:text-gray-600">
                  <FontAwesomeIcon icon={faTimes} size="lg" />
                </button>
              </div>
              <form onSubmit={handleCreateApplication} className="p-4 overflow-y-auto max-h-[70vh] space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-600">Company<select className="cos-input mt-1" value={newAppForm.companyId} onChange={(e) => setNewAppForm({ ...newAppForm, companyId: e.target.value })}><option value="">Select company</option>{companies.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
                  <label className="text-xs font-medium text-gray-600">Type<select className="cos-input mt-1" value={newAppForm.type} onChange={(e) => setNewAppForm({ ...newAppForm, type: e.target.value })}><option value="FULL_TIME">Full Time</option><option value="PART_TIME">Part Time</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option></select></label>
                  <label className="text-xs font-medium text-gray-600">Start Date<input type="date" className="cos-input mt-1" value={newAppForm.startDate} onChange={(e) => setNewAppForm({ ...newAppForm, startDate: e.target.value })} /></label>
                  <label className="text-xs font-medium text-gray-600">End Date<input type="date" className="cos-input mt-1" value={newAppForm.endDate} onChange={(e) => setNewAppForm({ ...newAppForm, endDate: e.target.value })} /></label>
                  <label className="text-xs font-medium text-gray-600">Stipend (monthly)<input type="number" className="cos-input mt-1" value={newAppForm.stipend} onChange={(e) => setNewAppForm({ ...newAppForm, stipend: e.target.value })} /></label>
                  <label className="text-xs font-medium text-gray-600">Currency<input type="text" className="cos-input mt-1" value={newAppForm.currency} onChange={(e) => setNewAppForm({ ...newAppForm, currency: e.target.value })} /></label>
                  <label className="text-xs font-medium text-gray-600">Hours/Week<input type="number" className="cos-input mt-1" value={newAppForm.workHoursPerWeek} onChange={(e) => setNewAppForm({ ...newAppForm, workHoursPerWeek: e.target.value })} /></label>
                </div>
                <label className="text-xs font-medium text-gray-600">Description<textarea className="cos-input mt-1 min-h-[80px]" value={newAppForm.description} onChange={(e) => setNewAppForm({ ...newAppForm, description: e.target.value })} /></label>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-600">Learning Objectives</label>
                    <button type="button" onClick={addLearningObjective} className="text-xs text-emerald-600 hover:underline">+ Add</button>
                  </div>
                  <div className="space-y-2">
                    {newAppForm.learningObjectives.map((obj, i) => (
                      <div key={i} className="flex gap-2">
                        <input type="text" className="cos-input flex-1" value={obj} onChange={(e) => setNewAppForm({ ...newAppForm, learningObjectives: newAppForm.learningObjectives.map((o, j) => (j === i ? e.target.value : o)) })} placeholder={`Objective ${i + 1}`} />
                        {newAppForm.learningObjectives.length > 1 && <button type="button" onClick={() => removeLearningObjective(i)} className="p-1.5 text-gray-400 hover:text-red-600"><FontAwesomeIcon icon={faTrash} size="sm" /></button>}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-600">Skills to Develop</label>
                    <button type="button" onClick={addSkill} className="text-xs text-emerald-600 hover:underline">+ Add</button>
                  </div>
                  <div className="space-y-2">
                    {newAppForm.skillsToDevelop.map((skill, i) => (
                      <div key={i} className="flex gap-2">
                        <input type="text" className="cos-input flex-1" value={skill} onChange={(e) => setNewAppForm({ ...newAppForm, skillsToDevelop: newAppForm.skillsToDevelop.map((s, j) => (j === i ? e.target.value : s)) })} placeholder={`Skill ${i + 1}`} />
                        {newAppForm.skillsToDevelop.length > 1 && <button type="button" onClick={() => removeSkill(i)} className="p-1.5 text-gray-400 hover:text-red-600"><FontAwesomeIcon icon={faTrash} size="sm" /></button>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button type="button" onClick={() => setShowNewApplication(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                  <button type="submit" disabled={newAppLoading} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">{newAppLoading ? "Creating..." : "Create Application"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InternshipManagementView;