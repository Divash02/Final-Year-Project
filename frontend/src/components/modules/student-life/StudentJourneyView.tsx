import React, { useEffect, useState } from "react";
import { useToast } from "../../../components/ui/ToastContainer";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { apiRequest } from "../../../services/apiClient";
import {
  faGraduationCap,
  faUser,
  faClock,
  faFileAlt,
  faPlus,
  faEye,
  faEdit,
  faTrash,
  faCheck,
  faTimes,
  faChevronDown,
  faChevronUp,
  faSearch,
  faFilter,
  faArrowRight,
  faArrowLeft,
  faFlag,
  faAward,
  faBuilding,
  faBook,
  faBriefcase,
  faHeart,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface TimelineEvent {
  _id: string;
  student: { _id: string; studentId: string; fullName: string; program: string; semester: number };
  category: "academic" | "attendance" | "financial" | "case" | "exam" | "system";
  title: string;
  description: string;
  timestamp: string;
  actor: { _id: string; name: string; role: string };
  badge?: string;
  metadata?: Record<string, any>;
}

interface StudentStage {
  _id: string;
  student: { _id: string; studentId: string; fullName: string; program: string; semester: number };
  currentStage: "ADMISSION" | "ENROLLMENT" | "ACTIVE_STUDY" | "ACADEMIC_PROBATION" | "LEAVE_OF_ABSENCE" | "GRADUATION_PENDING" | "GRADUATED" | "ALUMNI" | "WITHDRAWN";
  stageHistory: Array<{
    stage: string;
    enteredAt: string;
    exitedAt?: string;
    reason?: string;
    triggeredBy?: { _id: string; name: string };
  }>;
  nextActions: Array<{
    action: string;
    deadline: string;
    responsibleRole: string;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  }>;
  riskFlags: string[];
  lastUpdated: string;
}

interface WorkflowTemplate {
  _id: string;
  name: string;
  description: string;
  category: string;
  steps: Array<{
    stepOrder: number;
    name: string;
    description: string;
    responsibleRole: string;
    slaHours: number;
    formFields: Array<{ fieldName: string; fieldType: string; label: string; required: boolean; options?: string[] }>;
  }>;
  isActive: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  ADMISSION: "Admission",
  ENROLLMENT: "Enrollment",
  ACTIVE_STUDY: "Active Study",
  ACADEMIC_PROBATION: "Academic Probation",
  LEAVE_OF_ABSENCE: "Leave of Absence",
  GRADUATION_PENDING: "Graduation Pending",
  GRADUATED: "Graduated",
  ALUMNI: "Alumni",
  WITHDRAWN: "Withdrawn",
};

const STAGE_COLORS: Record<string, string> = {
  ADMISSION: "bg-blue-100 text-blue-800",
  ENROLLMENT: "bg-indigo-100 text-indigo-800",
  ACTIVE_STUDY: "bg-green-100 text-green-800",
  ACADEMIC_PROBATION: "bg-yellow-100 text-yellow-800",
  LEAVE_OF_ABSENCE: "bg-orange-100 text-orange-800",
  GRADUATION_PENDING: "bg-purple-100 text-purple-800",
  GRADUATED: "bg-emerald-100 text-emerald-800",
  ALUMNI: "bg-teal-100 text-teal-800",
  WITHDRAWN: "bg-red-100 text-red-800",
};

const STAGE_ICONS: Record<string, any> = {
  ADMISSION: faUser,
  ENROLLMENT: faGraduationCap,
  ACTIVE_STUDY: faBook,
  ACADEMIC_PROBATION: faFlag,
  LEAVE_OF_ABSENCE: faHeart,
  GRADUATION_PENDING: faAward,
  GRADUATED: faAward,
  ALUMNI: faBuilding,
  WITHDRAWN: faTimes,
};

export const StudentJourneyView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();
  const isStudent = currentUser?.role === "student";

  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [stages, setStages] = useState<StudentStage[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"timeline" | "stages" | "workflows">("timeline");
  const [filters, setFilters] = useState({ category: "", search: "", page: 1, limit: 50 });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [selectedStudent, setSelectedStudent] = useState<StudentStage | null>(null);
  const [showStageDetail, setShowStageDetail] = useState(false);

  const fetchTimeline = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.category) params.append("category", filters.category);
      if (filters.search) params.append("search", filters.search);
      params.append("page", String(filters.page));
      params.append("limit", String(filters.limit));

      const data = await apiRequest<{ events: TimelineEvent[]; pagination: any }>(`/student-journey/timeline?${params}`);
      setTimeline(data.events);
      setPagination(data.pagination);
    } catch (err) {
      toast.error("Failed to load timeline");
    }
  };

  const fetchStages = async () => {
    try {
      const data = await apiRequest<{ stages: StudentStage[] }>("/student-journey/stages");
      setStages(data.stages);
    } catch (err) {
      toast.error("Failed to load student stages");
    }
  };

  const fetchTemplates = async () => {
    try {
      const data = await apiRequest<{ templates: WorkflowTemplate[] }>("/student-journey/workflow-templates");
      setTemplates(data.templates);
    } catch (err) {
      toast.error("Failed to load workflow templates");
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchTimeline(), fetchStages(), fetchTemplates()]);
      } catch (err) {
        // Errors are handled in individual fetch functions
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [filters.page]);

  const handleInitiateWorkflow = async (templateId: string, studentId: string) => {
    try {
      await apiRequest("/student-journey/initiate-workflow", {
        method: "POST",
        body: JSON.stringify({ templateId, studentId }),
      });
      toast.success("Workflow initiated successfully");
      fetchStages();
    } catch (err) {
      toast.error("Failed to initiate workflow");
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "academic": return faBook;
      case "attendance": return faClock;
      case "financial": return faBuilding;
      case "case": return faFileAlt;
      case "exam": return faGraduationCap;
      default: return faClock;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "academic": return "bg-blue-100 text-blue-800";
      case "attendance": return "bg-green-100 text-green-800";
      case "financial": return "bg-yellow-100 text-yellow-800";
      case "case": return "bg-red-100 text-red-800";
      case "exam": return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
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
          <h1 className="text-2xl font-bold text-gray-900">Student Lifecycle & Case Management</h1>
          <p className="text-gray-500 mt-1">Track student journey stages, timeline events, and manage workflows</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {[
            { id: "timeline", label: "Timeline", icon: faClock },
            { id: "stages", label: "Student Stages", icon: faGraduationCap },
            { id: "workflows", label: "Workflow Templates", icon: faFileAlt },
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

      {/* Timeline Tab */}
      {activeTab === "timeline" && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search timeline events..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value, page: 1 })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Categories</option>
              <option value="academic">Academic</option>
              <option value="attendance">Attendance</option>
              <option value="financial">Financial</option>
              <option value="case">Case</option>
              <option value="exam">Exam</option>
              <option value="system">System</option>
            </select>
          </div>

          <div className="divide-y divide-gray-200">
            {timeline.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No timeline events found</div>
            ) : (
              timeline.map((event) => (
                <div key={event._id} className="p-4 hover:bg-gray-50 flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white text-sm"
                    style={{ backgroundColor: getCategoryColor(event.category).replace("bg-", "").replace(" text-", "") }}>
                    <FontAwesomeIcon icon={getCategoryIcon(event.category)} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900">{event.title}</h4>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getCategoryColor(event.category)}`}>
                        {event.category}
                      </span>
                      {event.badge && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800">
                          {event.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>{new Date(event.timestamp).toLocaleString()}</span>
                      <span>By {event.actor.name} ({event.actor.role})</span>
                    </div>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    {event.student && (
                      <div>
                        <p className="font-medium">{event.student.fullName}</p>
                        <p>{event.student.studentId}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
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

      {/* Stages Tab */}
      {activeTab === "stages" && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex-1 relative">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by student name, ID, or program..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Program</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Stage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk Flags</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Actions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {stages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No student stages found</td>
                  </tr>
                ) : (
                  stages.map((stage) => (
                    <tr key={stage._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <p className="font-medium text-gray-900">{stage.student.fullName}</p>
                        <p className="text-sm text-gray-500">{stage.student.studentId}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {stage.student.program} • Sem {stage.student.semester}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <FontAwesomeIcon icon={STAGE_ICONS[stage.currentStage] || faGraduationCap} className="text-emerald-600" />
                          <span className={`px-2 py-1 text-sm font-medium rounded-full ${STAGE_COLORS[stage.currentStage]}`}>
                            {STAGE_LABELS[stage.currentStage]}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {stage.riskFlags.length === 0 ? (
                            <span className="text-gray-400 text-sm italic">None</span>
                          ) : (
                            stage.riskFlags.map((flag, i) => (
                              <span key={i} className="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded">
                                {flag}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 max-h-20 overflow-y-auto">
                          {stage.nextActions.slice(0, 3).map((action, i) => (
                            <div key={i} className="text-xs flex items-center gap-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${action.status === "COMPLETED" ? "bg-green-500" : action.status === "IN_PROGRESS" ? "bg-blue-500" : "bg-yellow-500"}`} />
                              <span className={action.status === "COMPLETED" ? "line-through text-gray-400" : ""}>
                                {action.action}
                              </span>
                              <span className="text-gray-400">({action.responsibleRole})</span>
                            </div>
                          ))}
                          {stage.nextActions.length > 3 && (
                            <span className="text-xs text-gray-500">+{stage.nextActions.length - 3} more</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {new Date(stage.lastUpdated).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => {
                            setSelectedStudent(stage);
                            setShowStageDetail(true);
                          }}
                          className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                          title="View Details"
                        >
                          <FontAwesomeIcon icon={faEye} size="sm" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Workflows Tab */}
      {activeTab === "workflows" && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Available Workflow Templates</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {templates.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No workflow templates found</div>
            ) : (
              templates.map((template) => (
                <div key={template._id} className="p-4 hover:bg-gray-50">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium text-gray-900">{template.name}</h4>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${template.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                          {template.isActive ? "Active" : "Inactive"}
                        </span>
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                          {template.category}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span>{template.steps.length} steps</span>
                        <span>Est. {template.steps.reduce((sum, s) => sum + s.slaHours, 0)} hours total</span>
                      </div>
                    </div>
                    {!isStudent && template.isActive && (
                      <button
                        onClick={() => {
                          const studentId = prompt("Enter student ID to initiate workflow:");
                          if (studentId) handleInitiateWorkflow(template._id, studentId);
                        }}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                      >
                        Initiate Workflow
                      </button>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {template.steps.map((step, i) => (
                        <div key={i} className="p-3 bg-gray-50 rounded-lg text-sm">
                          <div className="font-medium text-gray-900">Step {step.stepOrder}: {step.name}</div>
                          <div className="text-gray-500 text-xs">{step.responsibleRole}</div>
                          <div className="text-gray-400 text-xs mt-1">{step.slaHours}h SLA</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Stage Detail Modal */}
      {showStageDetail && selectedStudent && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowStageDetail(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Student Stage Details</h3>
                <button onClick={() => setShowStageDetail(false)} className="text-gray-400 hover:text-gray-600">
                  <FontAwesomeIcon icon={faTimes} size="lg" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[70vh]">
                <div className="mb-6">
                  <div className="flex items-center gap-3">
                    <FontAwesomeIcon icon={STAGE_ICONS[selectedStudent.currentStage] || faGraduationCap} className="text-2xl text-emerald-600" />
                    <div>
                      <h4 className="text-xl font-bold text-gray-900">{selectedStudent.student.fullName}</h4>
                      <p className="text-gray-500">{selectedStudent.student.studentId} • {selectedStudent.student.program} • Sem {selectedStudent.student.semester}</p>
                    </div>
                    <span className={`ml-auto px-4 py-2 text-lg font-medium rounded-full ${STAGE_COLORS[selectedStudent.currentStage]}`}>
                      {STAGE_LABELS[selectedStudent.currentStage]}
                    </span>
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-3">Stage History</h4>
                  <div className="space-y-3">
                    {selectedStudent.stageHistory.map((history, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                          <FontAwesomeIcon icon={faArrowRight} size="sm" className="text-emerald-600" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{STAGE_LABELS[history.stage] || history.stage}</div>
                          <div className="text-sm text-gray-500">
                            Entered: {new Date(history.enteredAt).toLocaleString()}
                            {history.exitedAt && ` • Exited: ${new Date(history.exitedAt).toLocaleString()}`}
                          </div>
                          {history.reason && <div className="text-sm text-gray-600 mt-1">Reason: {history.reason}</div>}
                          {history.triggeredBy && <div className="text-xs text-gray-400 mt-1">Triggered by: {history.triggeredBy.name}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-3">Pending Next Actions</h4>
                  <div className="space-y-2">
                    {selectedStudent.nextActions.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">No pending actions</p>
                    ) : (
                      selectedStudent.nextActions.map((action, i) => (
                        <div key={i} className="p-3 bg-gray-50 rounded-lg flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full ${action.status === "COMPLETED" ? "bg-green-500" : action.status === "IN_PROGRESS" ? "bg-blue-500" : "bg-yellow-500"}`} />
                          <div className="flex-1">
                            <div className="font-medium">{action.action}</div>
                            <div className="text-sm text-gray-500">Responsible: {action.responsibleRole} • Deadline: {new Date(action.deadline).toLocaleDateString()}</div>
                          </div>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${action.status === "COMPLETED" ? "bg-green-100 text-green-800" : action.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"}`}>
                            {action.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {selectedStudent.riskFlags.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Risk Flags</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedStudent.riskFlags.map((flag, i) => (
                        <span key={i} className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentJourneyView;