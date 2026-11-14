import React, { useEffect, useState } from "react";
import { useToast } from "../../../components/ui/ToastContainer";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { apiRequest } from "../../../services/apiClient";
import {
  faGraduationCap,
  faUser,
  faUserTie,
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
  faFlag,
  faAward,
  faBook,
  faUsers,
  faComment,
  faCalendar,
  faPaperclip,
  faSave,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface ResearchProject {
  _id: string;
  student: { _id: string; studentId: string; fullName: string; program: string; semester: number };
  title: string;
  description: string;
  program: string;
  academicYear: string;
  semester: number;
  course?: { _id: string; code: string; name: string };
  primarySupervisor?: { _id: string; name: string; email: string };
  coSupervisor?: { _id: string; name: string; email: string };
  hod?: { _id: string; name: string; email: string };
  externalExaminer?: { _id: string; name: string; email: string };
  status: "PROPOSAL_DRAFT" | "PROPOSAL_SUBMITTED" | "PROPOSAL_UNDER_REVIEW" | "PROPOSAL_REVISION_REQUIRED" | "PROPOSAL_APPROVED" | "PROPOSAL_REJECTED" | "IN_PROGRESS" | "MILESTONE_REVIEW" | "FINAL_REPORT_DRAFT" | "FINAL_REPORT_SUBMITTED" | "FINAL_REPORT_UNDER_REVIEW" | "FINAL_REPORT_REVISION_REQUIRED" | "COMPLETED";
  proposalSubmittedAt?: string;
  proposalApprovedAt?: string;
  finalReportSubmittedAt?: string;
  finalReportApprovedAt?: string;
  defenseDate?: string;
  defenseResult?: "PASSED" | "PASSED_WITH_REVISIONS" | "REVISIONS_REQUIRED" | "FAILED";
  finalGrade?: string;
  milestones: Milestone[];
  meetings: Meeting[];
  reviewFeedback?: string;
  createdAt: string;
  updatedAt: string;
}

interface Milestone {
  _id: string;
  project: string;
  order: number;
  title: string;
  description: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "APPROVED" | "REJECTED" | "COMPLETED";
  deliverables: string[];
  supervisorFeedback?: string;
  hodFeedback?: string;
  supervisorReviewedBy?: { _id: string; name: string };
  supervisorReviewedAt?: string;
  hodReviewedBy?: { _id: string; name: string };
  hodReviewedAt?: string;
}

interface Meeting {
  _id: string;
  project: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingType: "PROPOSAL_REVIEW" | "PROGRESS_REVIEW" | "MILESTONE_REVIEW" | "FINAL_REVIEW" | "DEFENSE" | "SUPERVISION" | "OTHER";
  title: string;
  agenda: string;
  notes?: string;
  actionItems: string[];
  attendees: Array<{ user: { _id: string; name: string }; role: string; attended: boolean }>;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
  recordingUrl?: string;
}

const STATUS_LABELS: Record<string, string> = {
  PROPOSAL_DRAFT: "Proposal Draft",
  PROPOSAL_SUBMITTED: "Proposal Submitted",
  PROPOSAL_UNDER_REVIEW: "Proposal Under Review",
  PROPOSAL_REVISION_REQUIRED: "Revision Required",
  PROPOSAL_APPROVED: "Proposal Approved",
  PROPOSAL_REJECTED: "Proposal Rejected",
  IN_PROGRESS: "In Progress",
  MILESTONE_REVIEW: "Milestone Review",
  FINAL_REPORT_DRAFT: "Final Report Draft",
  FINAL_REPORT_SUBMITTED: "Final Report Submitted",
  FINAL_REPORT_UNDER_REVIEW: "Final Report Under Review",
  FINAL_REPORT_REVISION_REQUIRED: "Revision Required",
  COMPLETED: "Completed",
};

const STATUS_COLORS: Record<string, string> = {
  PROPOSAL_DRAFT: "bg-gray-100 text-gray-800",
  PROPOSAL_SUBMITTED: "bg-blue-100 text-blue-800",
  PROPOSAL_UNDER_REVIEW: "bg-yellow-100 text-yellow-800",
  PROPOSAL_REVISION_REQUIRED: "bg-orange-100 text-orange-800",
  PROPOSAL_APPROVED: "bg-green-100 text-green-800",
  PROPOSAL_REJECTED: "bg-red-100 text-red-800",
  IN_PROGRESS: "bg-emerald-100 text-emerald-800",
  MILESTONE_REVIEW: "bg-purple-100 text-purple-800",
  FINAL_REPORT_DRAFT: "bg-gray-100 text-gray-800",
  FINAL_REPORT_SUBMITTED: "bg-blue-100 text-blue-800",
  FINAL_REPORT_UNDER_REVIEW: "bg-yellow-100 text-yellow-800",
  FINAL_REPORT_REVISION_REQUIRED: "bg-orange-100 text-orange-800",
  COMPLETED: "bg-purple-100 text-purple-800",
};

const MILESTONE_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  SUBMITTED: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  COMPLETED: "bg-purple-100 text-purple-800",
};

export const ResearchProjectsView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();
  const isStudent = currentUser?.role === "student";

  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<ResearchProject | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [filters, setFilters] = useState({ status: "", academicYear: "", semester: "", page: 1, limit: 20 });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [activeTab, setActiveTab] = useState<"overview" | "milestones" | "meetings">("overview");

  const fetchProjects = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append("status", filters.status);
      if (filters.academicYear) params.append("academicYear", filters.academicYear);
      if (filters.semester) params.append("semester", filters.semester);
      params.append("page", String(filters.page));
      params.append("limit", String(filters.limit));

      const data = await apiRequest<{ projects: ResearchProject[]; pagination: typeof pagination }>(
        `/research/projects?${params}`,
      );
      setProjects(data.projects);
      setPagination(data.pagination);
    } catch (err) {
      toast.error("Failed to load projects");
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [filters.page]);

  const handleSubmitProposal = async (projectId: string) => {
    try {
      await apiRequest(`/research/projects/${projectId}/submit-proposal`, { method: "PATCH" });
      toast.success("Proposal submitted for review");
      fetchProjects();
    } catch (err) {
      toast.error("Failed to submit proposal");
    }
  };

  const handleReviewProposal = async (projectId: string, status: string, feedback: string) => {
    try {
      await apiRequest(`/research/projects/${projectId}/review-proposal`, {
        method: "PATCH",
        body: JSON.stringify({ status, feedback }),
      });
      toast.success("Proposal reviewed");
      fetchProjects();
    } catch (err) {
      toast.error("Failed to review proposal");
    }
  };

  const handleCreateMilestone = async (projectId: string, milestone: Partial<Milestone>) => {
    try {
      await apiRequest(`/research/projects/${projectId}/milestones`, {
        method: "POST",
        body: JSON.stringify(milestone),
      });
      toast.success("Milestone created");
      fetchProjects();
    } catch (err) {
      toast.error("Failed to create milestone");
    }
  };

  const handleUpdateMilestone = async (milestoneId: string, updates: Partial<Milestone>) => {
    try {
      await apiRequest(`/research/milestones/${milestoneId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      toast.success("Milestone updated");
      fetchProjects();
    } catch (err) {
      toast.error("Failed to update milestone");
    }
  };

  const handleCreateMeeting = async (projectId: string, meeting: Partial<Meeting>) => {
    try {
      await apiRequest(`/research/projects/${projectId}/meetings`, {
        method: "POST",
        body: JSON.stringify(meeting),
      });
      toast.success("Meeting scheduled");
      fetchProjects();
    } catch (err) {
      toast.error("Failed to schedule meeting");
    }
  };

  const handleSubmitFinalReport = async (projectId: string) => {
    try {
      await apiRequest(`/research/projects/${projectId}/submit-final-report`, { method: "POST" });
      toast.success("Final report submitted");
      fetchProjects();
    } catch (err) {
      toast.error("Failed to submit final report");
    }
  };

  const handleReviewFinalReport = async (projectId: string, status: string, feedback: string, externalExaminerId?: string, defenseDate?: string) => {
    try {
      await apiRequest(`/research/projects/${projectId}/review-final-report`, {
        method: "PATCH",
        body: JSON.stringify({ status, feedback, externalExaminerId, defenseDate }),
      });
      toast.success("Final report reviewed");
      fetchProjects();
    } catch (err) {
      toast.error("Failed to review final report");
    }
  };

  const handleRecordDefense = async (projectId: string, defenseResult: string, finalGrade?: string, finalGradePoints?: number) => {
    try {
      await apiRequest(`/research/projects/${projectId}/defense-result`, {
        method: "PATCH",
        body: JSON.stringify({ defenseResult, finalGrade, finalGradePoints }),
      });
      toast.success("Defense result recorded");
      fetchProjects();
    } catch (err) {
      toast.error("Failed to record defense result");
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
          <h1 className="text-2xl font-bold text-gray-900">Research & Project Hub</h1>
          <p className="text-gray-500 mt-1">Manage research projects, milestones, and supervision meetings</p>
        </div>
        {!isStudent && (
          <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
            <FontAwesomeIcon icon={faPlus} className="mr-2" /> New Project
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title, student, or supervisor..."
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
          value={filters.academicYear}
          onChange={(e) => setFilters({ ...filters, academicYear: e.target.value, page: 1 })}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All Academic Years</option>
          <option value="2024-2025">2024-2025</option>
          <option value="2023-2024">2023-2024</option>
        </select>
        <select
          value={filters.semester}
          onChange={(e) => setFilters({ ...filters, semester: e.target.value, page: 1 })}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All Semesters</option>
          <option value="1">Semester 1</option>
          <option value="2">Semester 2</option>
        </select>
      </div>

      {/* Projects List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {projects.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No research projects found</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {projects.map((project) => (
              <div key={project._id} className="p-4 hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedProject(project); setShowDetail(true); }}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h4 className="font-medium text-gray-900">{project.title}</h4>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[project.status]}`}>
                        {STATUS_LABELS[project.status]}
                      </span>
                      {project.course && (
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">{project.course.code}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{project.description}</p>
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                      <span><FontAwesomeIcon icon={faUser} className="mr-1" /> {project.student.fullName} ({project.student.studentId})</span>
                      <span><FontAwesomeIcon icon={faGraduationCap} className="mr-1" /> {project.student.program} • Sem {project.student.semester}</span>
                      {project.primarySupervisor && (
                        <span><FontAwesomeIcon icon={faUserTie} className="mr-1" /> Supervisor: {project.primarySupervisor.name}</span>
                      )}
                      <span><FontAwesomeIcon icon={faCalendar} className="mr-1" /> {project.academicYear}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Milestones</p>
                      <p className="font-medium">{project.milestones.length}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Meetings</p>
                      <p className="font-medium">{project.meetings.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

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

      {/* Project Detail Modal */}
      {showDetail && selectedProject && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowDetail(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">{selectedProject.title}</h3>
                <button onClick={() => setShowDetail(false)} className="text-gray-400 hover:text-gray-600">
                  <FontAwesomeIcon icon={faTimes} size="lg" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[70vh]">
                {/* Tabs */}
                <div className="border-b border-gray-200 mb-4">
                  <nav className="-mb-px flex space-x-8" aria-label="Project Tabs">
                    {[
                      { id: "overview", label: "Overview", icon: faFileAlt },
                      { id: "milestones", label: "Milestones", icon: faFlag },
                      { id: "meetings", label: "Meetings", icon: faCalendar },
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

                {/* Overview Tab */}
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Student</p>
                        <p className="font-medium">{selectedProject.student.fullName}</p>
                        <p className="text-sm text-gray-500">{selectedProject.student.studentId} • {selectedProject.student.program} • Sem {selectedProject.student.semester}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Primary Supervisor</p>
                        <p className="font-medium">{selectedProject.primarySupervisor?.name || "Not assigned"}</p>
                        {selectedProject.primarySupervisor?.email && <p className="text-sm text-gray-500">{selectedProject.primarySupervisor.email}</p>}
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Co-Supervisor</p>
                        <p className="font-medium">{selectedProject.coSupervisor?.name || "Not assigned"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">HoD</p>
                        <p className="font-medium">{selectedProject.hod?.name || "Not assigned"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">External Examiner</p>
                        <p className="font-medium">{selectedProject.externalExaminer?.name || "Not assigned"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Course</p>
                        <p className="font-medium">{selectedProject.course ? `${selectedProject.course.code} - ${selectedProject.course.name}` : "Not linked"}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <span className={`px-3 py-1 text-base font-medium rounded-full ${STATUS_COLORS[selectedProject.status]}`}>
                        {STATUS_LABELS[selectedProject.status]}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                      <p className="text-gray-700">{selectedProject.description}</p>
                    </div>

                    {selectedProject.reviewFeedback && (
                      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <h4 className="font-medium text-yellow-800 mb-1">Review Feedback</h4>
                        <p className="text-yellow-700">{selectedProject.reviewFeedback}</p>
                      </div>
                    )}

                    {selectedProject.proposalSubmittedAt && (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                        <div><p className="text-gray-500">Proposal Submitted</p><p className="font-medium">{new Date(selectedProject.proposalSubmittedAt).toLocaleDateString()}</p></div>
                        {selectedProject.proposalApprovedAt && <div><p className="text-gray-500">Proposal Approved</p><p className="font-medium">{new Date(selectedProject.proposalApprovedAt).toLocaleDateString()}</p></div>}
                        {selectedProject.finalReportSubmittedAt && <div><p className="text-gray-500">Final Report Submitted</p><p className="font-medium">{new Date(selectedProject.finalReportSubmittedAt).toLocaleDateString()}</p></div>}
                        {selectedProject.finalReportApprovedAt && <div><p className="text-gray-500">Final Report Approved</p><p className="font-medium">{new Date(selectedProject.finalReportApprovedAt).toLocaleDateString()}</p></div>}
                      </div>
                    )}

                    {!isStudent && [
                      { status: "PROPOSAL_SUBMITTED", action: () => {
                        const feedback = prompt("Review feedback:");
                        if (feedback) handleReviewProposal(selectedProject._id, "PROPOSAL_UNDER_REVIEW", feedback);
                      }, label: "Start Review" },
                      { status: "PROPOSAL_UNDER_REVIEW", action: () => {
                        const feedback = prompt("Feedback:");
                        if (feedback !== null) {
                          const decision = confirm("Approve? (Cancel = Request Revision)");
                          handleReviewProposal(selectedProject._id, decision ? "PROPOSAL_APPROVED" : "PROPOSAL_REVISION_REQUIRED", feedback);
                        }
                      }, label: "Review Proposal" },
                      { status: "PROPOSAL_APPROVED", action: () => handleCreateMilestone(selectedProject._id, { title: "", description: "", order: selectedProject.milestones.length + 1 }), label: "Add Milestone" },
                      { status: "IN_PROGRESS", action: () => {
                        const feedback = prompt("Feedback:");
                        if (feedback !== null) handleReviewFinalReport(selectedProject._id, "FINAL_REPORT_UNDER_REVIEW", feedback);
                      }, label: "Review Final Report" },
                      { status: "FINAL_REPORT_SUBMITTED", action: () => {
                        const feedback = prompt("Feedback:");
                        if (feedback !== null) handleReviewFinalReport(selectedProject._id, "FINAL_REPORT_UNDER_REVIEW", feedback);
                      }, label: "Review Final Report" },
                      { status: "FINAL_REPORT_UNDER_REVIEW", action: () => {
                        const result = prompt("Defense result (PASSED/PASSED_WITH_REVISIONS/REVISIONS_REQUIRED/FAILED):");
                        if (result) handleRecordDefense(selectedProject._id, result);
                      }, label: "Record Defense" },
                    ].filter((btn) => btn.status === selectedProject.status).map((btn) => (
                      <button key={btn.label} onClick={btn.action} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 mr-2 mb-2">
                        {btn.label}
                      </button>
                    ))}
                    {isStudent && selectedProject.status === "PROPOSAL_DRAFT" && (
                      <button onClick={() => handleSubmitProposal(selectedProject._id)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mr-2 mb-2">
                        Submit Proposal
                      </button>
                    )}
                    {isStudent && ["IN_PROGRESS", "MILESTONE_REVIEW", "FINAL_REPORT_DRAFT", "FINAL_REPORT_REVISION_REQUIRED"].includes(selectedProject.status) && (
                      <button onClick={() => handleSubmitFinalReport(selectedProject._id)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 mr-2 mb-2">
                        Submit Final Report
                      </button>
                    )}
                  </div>
                )}

                {/* Milestones Tab */}
                {activeTab === "milestones" && (
                  <div className="space-y-4">
                    {!isStudent && selectedProject.status !== "PROPOSAL_DRAFT" && selectedProject.status !== "PROPOSAL_REJECTED" && (
                      <button onClick={() => handleCreateMilestone(selectedProject._id, { title: "", description: "", order: selectedProject.milestones.length + 1 })} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                        <FontAwesomeIcon icon={faPlus} className="mr-2" /> Add Milestone
                      </button>
                    )}
                    {selectedProject.milestones.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No milestones yet</p>
                    ) : (
                      selectedProject.milestones.map((milestone) => (
                        <div key={milestone._id} className="p-4 bg-gray-50 rounded-lg border">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
                            <div className="flex items-center gap-3">
                              <span className="px-2 py-1 text-sm font-medium bg-emerald-100 text-emerald-800 rounded">Step {milestone.order}</span>
                              <h5 className="font-medium text-gray-900">{milestone.title}</h5>
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${MILESTONE_STATUS_COLORS[milestone.status]}`}>
                                {milestone.status.replace(/_/g, " ")}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {!isStudent && milestone.status !== "APPROVED" && milestone.status !== "COMPLETED" && (
                                <button onClick={() => handleUpdateMilestone(milestone._id, { status: "APPROVED" })} className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">
                                  Approve
                                </button>
                              )}
                              {!isStudent && milestone.status !== "REJECTED" && (
                                <button onClick={() => handleUpdateMilestone(milestone._id, { status: "REJECTED" })} className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">
                                  Reject
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{milestone.description}</p>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                            {milestone.plannedStartDate && <div><p className="text-gray-500">Planned Start</p><p>{new Date(milestone.plannedStartDate).toLocaleDateString()}</p></div>}
                            {milestone.plannedEndDate && <div><p className="text-gray-500">Planned End</p><p>{new Date(milestone.plannedEndDate).toLocaleDateString()}</p></div>}
                            {milestone.actualStartDate && <div><p className="text-gray-500">Actual Start</p><p>{new Date(milestone.actualStartDate).toLocaleDateString()}</p></div>}
                            {milestone.actualEndDate && <div><p className="text-gray-500">Actual End</p><p>{new Date(milestone.actualEndDate).toLocaleDateString()}</p></div>}
                          </div>
                          {milestone.deliverables.length > 0 && (
                            <div className="mt-3">
                              <p className="text-sm text-gray-500">Deliverables</p>
                              <ul className="list-disc list-inside text-sm text-gray-700 mt-1">
                                {milestone.deliverables.map((d, i) => <li key={i}>{d}</li>)}
                              </ul>
                            </div>
                          )}
                          {milestone.supervisorFeedback && (
                            <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
                              <p className="text-sm font-medium text-blue-800">Supervisor Feedback</p>
                              <p className="text-sm text-blue-700">{milestone.supervisorFeedback}</p>
                              <p className="text-xs text-blue-500 mt-1">By {milestone.supervisorReviewedBy?.name} on {new Date(milestone.supervisorReviewedAt || "").toLocaleDateString()}</p>
                            </div>
                          )}
                          {milestone.hodFeedback && (
                            <div className="mt-3 p-3 bg-purple-50 rounded border border-purple-200">
                              <p className="text-sm font-medium text-purple-800">HoD Feedback</p>
                              <p className="text-sm text-purple-700">{milestone.hodFeedback}</p>
                              <p className="text-xs text-purple-500 mt-1">By {milestone.hodReviewedBy?.name} on {new Date(milestone.hodReviewedAt || "").toLocaleDateString()}</p>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Meetings Tab */}
                {activeTab === "meetings" && (
                  <div className="space-y-4">
                    {!isStudent && (
                      <button onClick={() => handleCreateMeeting(selectedProject._id, { title: "", agenda: "", scheduledAt: new Date().toISOString(), durationMinutes: 60, meetingType: "SUPERVISION" })} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                        <FontAwesomeIcon icon={faPlus} className="mr-2" /> Schedule Meeting
                      </button>
                    )}
                    {selectedProject.meetings.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No meetings scheduled</p>
                    ) : (
                      selectedProject.meetings.map((meeting) => (
                        <div key={meeting._id} className="p-4 bg-gray-50 rounded-lg border">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
                            <div className="flex items-center gap-3">
                              <h5 className="font-medium text-gray-900">{meeting.title}</h5>
                              <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">{meeting.meetingType.replace(/_/g, " ")}</span>
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${meeting.status === "COMPLETED" ? "bg-green-100 text-green-800" : meeting.status === "CANCELLED" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}`}>
                                {meeting.status}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500">
                              {new Date(meeting.scheduledAt).toLocaleString()} • {meeting.durationMinutes} min
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{meeting.agenda}</p>
                          {meeting.notes && <p className="text-sm text-gray-600 mb-2"><strong>Notes:</strong> {meeting.notes}</p>}
                          {meeting.actionItems.length > 0 && (
                            <div className="mt-2">
                              <p className="text-sm font-medium text-gray-900">Action Items</p>
                              <ul className="list-disc list-inside text-sm text-gray-700 mt-1">
                                {meeting.actionItems.map((item, i) => <li key={i}>{item}</li>)}
                              </ul>
                            </div>
                          )}
                          <div className="mt-2 text-sm text-gray-500">
                            Attendees: {meeting.attendees.map((a) => a.user.name).join(", ")}
                          </div>
                        </div>
                      ))
                    )}
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

export default ResearchProjectsView;