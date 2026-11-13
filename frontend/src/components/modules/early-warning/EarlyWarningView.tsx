import React, { useEffect, useState } from "react";
import { useToast } from "../../../components/ui/ToastContainer";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { apiRequest } from "../../../services/apiClient";
import {
  faExclamationTriangle,
  faChartLine,
  faUser,
  faClock,
  faFileAlt,
  faPlus,
  faSearch,
  faFilter,
  faEye,
  faEdit,
  faTrash,
  faCheck,
  faTimes,
  faExclamationCircle,
  faBell,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface RiskIndicator {
  _id: string;
  student: {
    _id: string;
    studentId: string;
    fullName: string;
    program: string;
    semester: number;
  };
  riskScore: number;
  riskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  factors: Array<{
    factor: string;
    weight: number;
    value: number;
    threshold: number;
    description: string;
  }>;
  recommendation: string;
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
  priority: number;
  identifiedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: { _id: string; name: string };
  resolvedAt?: string;
  resolutionNotes?: string;
}

interface InterventionForm {
  indicator?: string;
  student?: string;
  type?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
  startDate?: string;
  targetDate?: string;
}

interface Intervention {
  _id: string;
  indicator: string;
  student: {
    _id: string;
    studentId: string;
    fullName: string;
    program: string;
  };
  type:
    | "ACADEMIC_ADVISING"
    | "COUNSELING_REFERRAL"
    | "PEER_TUTORING"
    | "STUDY_PLAN_ADJUSTMENT"
    | "ATTENDANCE_MONITORING"
    | "FINANCIAL_AID_COUNSELING"
    | "MENTAL_HEALTH_SUPPORT"
    | "PARENT_GUARDIAN_MEETING"
    | "FACULTY_MENTORING"
    | "REMEDIAL_CLASSES"
    | "CUSTOM";
  title: string;
  description: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assignedTo: { _id: string; name: string; role: string };
  startDate: string;
  targetDate: string;
  completedAt?: string;
  outcome?: string;
  effectivenessRating?: number;
  followUpRequired?: boolean;
  followUpDate?: string;
}

interface SummaryStats {
  totalIndicators: number;
  activeIndicators: number;
  byRiskLevel: Record<string, number>;
  byStatus: Record<string, number>;
  pendingInterventions: number;
  overdueInterventions: number;
}

export const EarlyWarningView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();
  const isStudent = currentUser?.role === "student";

  const [indicators, setIndicators] = useState<RiskIndicator[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"indicators" | "interventions" | "summary">("indicators");
  const [filters, setFilters] = useState({
    riskLevel: "",
    status: "",
    search: "",
    page: 1,
    limit: 20,
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [selectedIndicator, setSelectedIndicator] = useState<RiskIndicator | null>(null);
  const [showInterventionModal, setShowInterventionModal] = useState(false);
  const [interventionForm, setInterventionForm] = useState<InterventionForm>({});

  const fetchIndicators = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.riskLevel) params.append("riskLevel", filters.riskLevel);
      if (filters.status) params.append("status", filters.status);
      if (filters.search) params.append("search", filters.search);
      params.append("page", String(filters.page));
      params.append("limit", String(filters.limit));

      const data = await apiRequest<{ indicators: RiskIndicator[]; pagination: any }>(`/early-warning/indicators?${params}`);
      setIndicators(data.indicators);
      setPagination(data.pagination);
    } catch (err) {
      toast.error("Failed to load risk indicators");
    }
  };

  const fetchInterventions = async () => {
    try {
      const data = await apiRequest<{ interventions: Intervention[] }>("/early-warning/interventions");
      setInterventions(data.interventions);
    } catch (err) {
      toast.error("Failed to load interventions");
    }
  };

  const fetchSummary = async () => {
    try {
      const data = await apiRequest<{ summary: SummaryStats }>("/early-warning/summary");
      setSummary(data.summary);
    } catch (err) {
      toast.error("Failed to load summary");
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchIndicators(), fetchInterventions(), fetchSummary()]);
      setLoading(false);
    };
    loadAll();
  }, [filters.page]);

  const handleCreateIntervention = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Convert form data to API format
      const studentObj = indicators.find((ind) => ind.student._id === interventionForm.student)?.student;
      const assignedToObj = interventionForm.assignedTo ? { _id: interventionForm.assignedTo, name: "", role: "" } : undefined;
      const payload = {
        ...interventionForm,
        student: studentObj,
        assignedTo: assignedToObj,
      };
      await apiRequest("/early-warning/interventions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success("Intervention created successfully");
      setShowInterventionModal(false);
      setInterventionForm({});
      fetchInterventions();
    } catch (err) {
      toast.error("Failed to create intervention");
    }
  };

  const handleAcknowledgeIndicator = async (indicatorId: string) => {
    try {
      await apiRequest(`/early-warning/indicators/${indicatorId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ACKNOWLEDGED" }),
      });
      toast.success("Indicator acknowledged");
      fetchIndicators();
    } catch (err) {
      toast.error("Failed to acknowledge indicator");
    }
  };

  const handleResolveIndicator = async (indicatorId: string, notes: string) => {
    try {
      await apiRequest(`/early-warning/indicators/${indicatorId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "RESOLVED", note: notes }),
      });
      toast.success("Indicator resolved");
      fetchIndicators();
    } catch (err) {
      toast.error("Failed to resolve indicator");
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return "bg-red-100 text-red-800 border-red-200";
      case "HIGH":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "MODERATE":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "LOW":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-red-100 text-red-800";
      case "ACKNOWLEDGED":
        return "bg-blue-100 text-blue-800";
      case "RESOLVED":
        return "bg-green-100 text-green-800";
      case "DISMISSED":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
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
          <h1 className="text-2xl font-bold text-gray-900">Early Warning System</h1>
          <p className="text-gray-500 mt-1">
            Monitor student risk indicators and manage proactive interventions
          </p>
        </div>
        <div className="flex gap-2">
          {!isStudent && (
            <button
              onClick={() => {
                setSelectedIndicator(null);
                setInterventionForm({});
                setShowInterventionModal(true);
              }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faPlus} size="sm" />
              Create Intervention
            </button>
          )}
          <button
            onClick={() => apiRequest("/early-warning/calculate", { method: "POST" }).then(() => {
              toast.success("Risk recalculation triggered");
              fetchIndicators();
              fetchSummary();
            })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faChartLine} size="sm" />
            Recalculate Risk
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Total Indicators</p>
            <p className="text-3xl font-bold text-gray-900">{summary.totalIndicators}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Active</p>
            <p className="text-3xl font-bold text-red-600">{summary.activeIndicators}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Critical Risk</p>
            <p className="text-3xl font-bold text-red-600">{summary.byRiskLevel?.CRITICAL || 0}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Pending Interventions</p>
            <p className="text-3xl font-bold text-blue-600">{summary.pendingInterventions}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Overdue Interventions</p>
            <p className="text-3xl font-bold text-orange-600">{summary.overdueInterventions}</p>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {[
            { id: "indicators", label: "Risk Indicators", icon: faExclamationTriangle },
            { id: "interventions", label: "Interventions", icon: faFileAlt },
            { id: "summary", label: "Summary", icon: faChartLine },
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

      {/* Indicators Tab */}
      {activeTab === "indicators" && (
        <div className="bg-white rounded-lg border border-gray-200">
          {/* Filters */}
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <FontAwesomeIcon
                icon={faSearch}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search by student name, ID, or program..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <select
              value={filters.riskLevel}
              onChange={(e) => setFilters({ ...filters, riskLevel: e.target.value, page: 1 })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">All Risk Levels</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MODERATE">Moderate</option>
              <option value="LOW">Low</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Risk Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Risk Level
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Key Factors
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Identified
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {indicators.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No risk indicators found
                    </td>
                  </tr>
                ) : (
                  indicators.map((indicator) => (
                    <tr key={indicator._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{indicator.student.fullName}</p>
                          <p className="text-sm text-gray-500">
                            {indicator.student.studentId} • {indicator.student.program} • Sem {indicator.student.semester}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                indicator.riskLevel === "CRITICAL"
                                  ? "bg-red-500"
                                  : indicator.riskLevel === "HIGH"
                                  ? "bg-orange-500"
                                  : indicator.riskLevel === "MODERATE"
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                              }`}
                              style={{ width: `${indicator.riskScore}%` }}
                            />
                          </div>
                          <span className="font-mono text-sm font-medium">{indicator.riskScore}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getRiskLevelColor(indicator.riskLevel)}`}>
                          {indicator.riskLevel}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {indicator.factors.slice(0, 3).map((f, i) => (
                            <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                              {f.factor}
                            </span>
                          ))}
                          {indicator.factors.length > 3 && (
                            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">
                              +{indicator.factors.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(indicator.status)}`}>
                          {indicator.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {new Date(indicator.identifiedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedIndicator(indicator)}
                            className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="View Details"
                          >
                            <FontAwesomeIcon icon={faEye} size="sm" />
                          </button>
                          {!isStudent && indicator.status === "ACTIVE" && (
                            <button
                              onClick={() => handleAcknowledgeIndicator(indicator._id)}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Acknowledge"
                            >
                              <FontAwesomeIcon icon={faCheck} size="sm" />
                            </button>
                          )}
                          {!isStudent && ["ACTIVE", "ACKNOWLEDGED"].includes(indicator.status) && (
                            <button
                              onClick={() => {
                                const notes = prompt("Resolution notes:");
                                if (notes) handleResolveIndicator(indicator._id, notes);
                              }}
                              className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Resolve"
                            >
                              <FontAwesomeIcon icon={faTimes} size="sm" />
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

          {/* Pagination */}
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

      {/* Interventions Tab */}
      {activeTab === "interventions" && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex-1 relative">
              <FontAwesomeIcon
                icon={faSearch}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search interventions..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {interventions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No interventions found</td>
                  </tr>
                ) : (
                  interventions.map((intervention) => (
                    <tr key={intervention._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <p className="font-medium text-gray-900">{intervention.student.fullName}</p>
                        <p className="text-sm text-gray-500">{intervention.student.studentId}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">{intervention.type.replace(/_/g, " ")}</span>
                      </td>
                      <td className="px-4 py-4 font-medium text-gray-900">{intervention.title}</td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          intervention.status === "COMPLETED" ? "bg-green-100 text-green-800" :
                          intervention.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-800" :
                          intervention.status === "PLANNED" ? "bg-yellow-100 text-yellow-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>
                          {intervention.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{intervention.assignedTo.name}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{new Date(intervention.targetDate).toLocaleDateString()}</td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          intervention.priority === "URGENT" ? "bg-red-100 text-red-800" :
                          intervention.priority === "HIGH" ? "bg-orange-100 text-orange-800" :
                          intervention.priority === "MEDIUM" ? "bg-yellow-100 text-yellow-800" :
                          "bg-green-100 text-green-800"
                        }`}>
                          {intervention.priority}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Tab */}
      {activeTab === "summary" && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Level Distribution</h3>
            <div className="space-y-3">
              {["CRITICAL", "HIGH", "MODERATE", "LOW"].map((level) => (
                <div key={level} className="flex items-center gap-4">
                  <div className={`w-4 h-4 rounded ${level === "CRITICAL" ? "bg-red-500" : level === "HIGH" ? "bg-orange-500" : level === "MODERATE" ? "bg-yellow-500" : "bg-green-500"}`} />
                  <span className="font-medium capitalize">{level.toLowerCase()}</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${level === "CRITICAL" ? "bg-red-500" : level === "HIGH" ? "bg-orange-500" : level === "MODERATE" ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${summary.totalIndicators > 0 ? ((summary.byRiskLevel[level] || 0) / summary.totalIndicators) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm">{summary.byRiskLevel[level] || 0}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Distribution</h3>
            <div className="space-y-3">
              {Object.entries(summary.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center gap-4">
                  <div className={`w-4 h-4 rounded ${status === "ACTIVE" ? "bg-red-500" : status === "ACKNOWLEDGED" ? "bg-blue-500" : status === "RESOLVED" ? "bg-green-500" : "bg-gray-500"}`} />
                  <span className="font-medium capitalize">{status.toLowerCase()}</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${status === "ACTIVE" ? "bg-red-500" : status === "ACKNOWLEDGED" ? "bg-blue-500" : status === "RESOLVED" ? "bg-green-500" : "bg-gray-500"}`}
                      style={{ width: `${summary.totalIndicators > 0 ? (count / summary.totalIndicators) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Indicator Detail Modal */}
      {selectedIndicator && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setSelectedIndicator(null)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Risk Indicator Details</h3>
                <button onClick={() => setSelectedIndicator(null)} className="text-gray-400 hover:text-gray-600">
                  <FontAwesomeIcon icon={faTimes} size="lg" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-500">Student</p>
                    <p className="font-medium">{selectedIndicator.student.fullName}</p>
                    <p className="text-sm text-gray-500">{selectedIndicator.student.studentId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Program / Semester</p>
                    <p className="font-medium">{selectedIndicator.student.program} • Sem {selectedIndicator.student.semester}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Risk Score</p>
                    <p className="font-medium text-2xl">{selectedIndicator.riskScore}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Risk Level</p>
                    <span className={`px-2 py-1 text-sm font-medium rounded-full border ${getRiskLevelColor(selectedIndicator.riskLevel)}`}>
                      {selectedIndicator.riskLevel}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <span className={`px-2 py-1 text-sm font-medium rounded-full ${getStatusColor(selectedIndicator.status)}`}>
                      {selectedIndicator.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Priority</p>
                    <p className="font-medium">{selectedIndicator.priority}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <h4 className="font-medium text-gray-900 mb-2">Risk Factors</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2 text-left">Factor</th>
                          <th className="px-3 py-2 text-left">Weight</th>
                          <th className="px-3 py-2 text-left">Value</th>
                          <th className="px-3 py-2 text-left">Threshold</th>
                          <th className="px-3 py-2 text-left">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedIndicator.factors.map((f, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-2 font-medium">{f.factor}</td>
                            <td className="px-3 py-2">{f.weight}%</td>
                            <td className="px-3 py-2">{f.value}</td>
                            <td className="px-3 py-2">{f.threshold}</td>
                            <td className="px-3 py-2 text-gray-500">{f.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mb-4">
                  <h4 className="font-medium text-gray-900 mb-2">Recommendation</h4>
                  <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">{selectedIndicator.recommendation}</p>
                </div>

                {selectedIndicator.resolutionNotes && (
                  <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
                    <h4 className="font-medium text-green-800 mb-1">Resolution Notes</h4>
                    <p className="text-green-700">{selectedIndicator.resolutionNotes}</p>
                    <p className="text-sm text-green-600 mt-1">
                      Resolved by {selectedIndicator.acknowledgedBy?.name || "Unknown"} on {new Date(selectedIndicator.resolvedAt || "").toLocaleDateString()}
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  {selectedIndicator.status === "ACTIVE" && !isStudent && (
                    <button
                      onClick={() => handleAcknowledgeIndicator(selectedIndicator._id)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Acknowledge
                    </button>
                  )}
                  {["ACTIVE", "ACKNOWLEDGED"].includes(selectedIndicator.status) && !isStudent && (
                    <button
                      onClick={() => {
                        const notes = prompt("Resolution notes:");
                        if (notes) handleResolveIndicator(selectedIndicator._id, notes);
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Intervention Modal */}
      {showInterventionModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowInterventionModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Create Intervention</h3>
                <button onClick={() => setShowInterventionModal(false)} className="text-gray-400 hover:text-gray-600">
                  <FontAwesomeIcon icon={faTimes} size="lg" />
                </button>
              </div>
              <form onSubmit={handleCreateIntervention} className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
                    <select
                      required
                      value={interventionForm.student || ""}
                      onChange={(e) => setInterventionForm({ ...interventionForm, student: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Select Student</option>
                      {indicators.map((ind) => (
                        <option key={ind._id} value={ind.student._id}>
                          {ind.student.fullName} ({ind.student.studentId})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      required
                      value={interventionForm.type || ""}
                      onChange={(e) => setInterventionForm({ ...interventionForm, type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Select Type</option>
                      <option value="ACADEMIC_ADVISING">Academic Advising</option>
                      <option value="COUNSELING_REFERRAL">Counseling Referral</option>
                      <option value="PEER_TUTORING">Peer Tutoring</option>
                      <option value="STUDY_PLAN_ADJUSTMENT">Study Plan Adjustment</option>
                      <option value="ATTENDANCE_MONITORING">Attendance Monitoring</option>
                      <option value="FINANCIAL_AID_COUNSELING">Financial Aid Counseling</option>
                      <option value="MENTAL_HEALTH_SUPPORT">Mental Health Support</option>
                      <option value="PARENT_GUARDIAN_MEETING">Parent/Guardian Meeting</option>
                      <option value="FACULTY_MENTORING">Faculty Mentoring</option>
                      <option value="REMEDIAL_CLASSES">Remedial Classes</option>
                      <option value="CUSTOM">Custom</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    required
                    type="text"
                    value={interventionForm.title || ""}
                    onChange={(e) => setInterventionForm({ ...interventionForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    placeholder="Intervention title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    required
                    value={interventionForm.description || ""}
                    onChange={(e) => setInterventionForm({ ...interventionForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    rows={3}
                    placeholder="Detailed description"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      required
                      value={interventionForm.priority || "MEDIUM"}
                      onChange={(e) => setInterventionForm({ ...interventionForm, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                    <select
                      required
                      value={interventionForm.assignedTo || ""}
                      onChange={(e) => setInterventionForm({ ...interventionForm, assignedTo: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Select Assignee</option>
                      {/* In real app, fetch from API */}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      required
                      type="date"
                      value={interventionForm.startDate || new Date().toISOString().split("T")[0]}
                      onChange={(e) => setInterventionForm({ ...interventionForm, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
                    <input
                      required
                      type="date"
                      value={interventionForm.targetDate || ""}
                      onChange={(e) => setInterventionForm({ ...interventionForm, targetDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowInterventionModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    Create Intervention
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EarlyWarningView;