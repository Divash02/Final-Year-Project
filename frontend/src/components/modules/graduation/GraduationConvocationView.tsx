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
  faSearch,
  faFilter,
  faAward,
  faBuilding,
  faCertificate,
  faCheckCircle,
  faXmarkCircle,
  faArrowRight,
  faScroll,
  faUniversity,
  faCalendar,
  faUserTie,
  faMoneyBillWave,
  faBook,
  faHome,
  faFlask,
  faSave,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface Application {
  _id: string;
  applicationNumber: string;
  student: { _id: string; studentId: string; fullName: string; program: string; semester: number };
  studentId: string;
  studentName: string;
  program: string;
  academicYear: string;
  semester: number;
  graduationCycle: string;
  initiatedBy: { _id: string; name: string };
  status: "ELIGIBILITY_CHECK" | "APPLICATION_SUBMITTED" | "ACADEMIC_CLEARANCE_PENDING" | "ACADEMIC_CLEARANCE_APPROVED" | "ACADEMIC_CLEARANCE_REJECTED" | "FINANCE_CLEARANCE_PENDING" | "FINANCE_CLEARANCE_APPROVED" | "FINANCE_CLEARANCE_REJECTED" | "LIBRARY_CLEARANCE_PENDING" | "LIBRARY_CLEARANCE_APPROVED" | "LIBRARY_CLEARANCE_REJECTED" | "HOSTEL_CLEARANCE_PENDING" | "HOSTEL_CLEARANCE_APPROVED" | "HOSTEL_CLEARANCE_REJECTED" | "LAB_CLEARANCE_PENDING" | "LAB_CLEARANCE_APPROVED" | "LAB_CLEARANCE_REJECTED" | "ALL_CLEARANCES_APPROVED" | "GRADUATION_APPROVED" | "CERTIFICATE_GENERATED" | "CONVOCATION_REGISTERED" | "CONVOCATION_ATTENDED" | "COMPLETED" | "REJECTED" | "WITHDRAWN";
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: { _id: string; name: string };
  reviewRemarks?: string;
  approvedAt?: string;
  completedAt?: string;
  clearances: Clearance[];
  certificate?: Certificate;
  convocation?: Convocation;
  createdAt: string;
  updatedAt: string;
}

interface Clearance {
  clearanceType: "ACADEMIC" | "FINANCE" | "LIBRARY" | "HOSTEL" | "LAB";
  status: "PENDING" | "APPROVED" | "REJECTED";
  remarks: string;
  requestedAt: string;
  approvedAt?: string;
  approvedBy?: { _id: string; name: string };
  documents: string[];
}

interface Certificate {
  certificateNumber: string;
  issuedAt: string;
  issuedBy: { _id: string; name: string };
  certificateUrl: string;
  qrCodeData: string;
  isVerified: boolean;
}

interface Convocation {
  registered: boolean;
  registeredAt?: string;
  ceremonyDate?: string;
  venue?: string;
  guestCount: number;
  regaliaSize?: string;
  specialRequests?: string;
  attended: boolean;
  verifiedBy?: { _id: string; name: string };
  verifiedAt?: string;
}

interface EligibilityResult {
  eligible: boolean;
  student: {
    id: string;
    studentId: string;
    fullName: string;
    program: string;
    semester: number;
    academicYear: string;
  };
  academicCheck: {
    totalCreditsEarned: number;
    requiredCredits: number;
    cgpa: number;
    minCGPARequired: number;
    creditsMet: boolean;
    cgpaMet: boolean;
  };
  pendingClearances: Clearance[];
  nextSteps: string[];
  existingApplication?: {
    id: string;
    applicationNumber: string;
    status: string;
    submittedAt: string;
  };
}

const STATUS_LABELS: Record<string, string> = {
  ELIGIBILITY_CHECK: "Eligibility Check",
  APPLICATION_SUBMITTED: "Application Submitted",
  ACADEMIC_CLEARANCE_PENDING: "Academic Clearance Pending",
  ACADEMIC_CLEARANCE_APPROVED: "Academic Clearance Approved",
  ACADEMIC_CLEARANCE_REJECTED: "Academic Clearance Rejected",
  FINANCE_CLEARANCE_PENDING: "Finance Clearance Pending",
  FINANCE_CLEARANCE_APPROVED: "Finance Clearance Approved",
  FINANCE_CLEARANCE_REJECTED: "Finance Clearance Rejected",
  LIBRARY_CLEARANCE_PENDING: "Library Clearance Pending",
  LIBRARY_CLEARANCE_APPROVED: "Library Clearance Approved",
  LIBRARY_CLEARANCE_REJECTED: "Library Clearance Rejected",
  HOSTEL_CLEARANCE_PENDING: "Hostel Clearance Pending",
  HOSTEL_CLEARANCE_APPROVED: "Hostel Clearance Approved",
  HOSTEL_CLEARANCE_REJECTED: "Hostel Clearance Rejected",
  LAB_CLEARANCE_PENDING: "Lab Clearance Pending",
  LAB_CLEARANCE_APPROVED: "Lab Clearance Approved",
  LAB_CLEARANCE_REJECTED: "Lab Clearance Rejected",
  ALL_CLEARANCES_APPROVED: "All Clearances Approved",
  GRADUATION_APPROVED: "Graduation Approved",
  CERTIFICATE_GENERATED: "Certificate Generated",
  CONVOCATION_REGISTERED: "Convocation Registered",
  CONVOCATION_ATTENDED: "Convocation Attended",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const STATUS_COLORS: Record<string, string> = {
  ELIGIBILITY_CHECK: "bg-gray-100 text-gray-800",
  APPLICATION_SUBMITTED: "bg-blue-100 text-blue-800",
  ACADEMIC_CLEARANCE_PENDING: "bg-yellow-100 text-yellow-800",
  ACADEMIC_CLEARANCE_APPROVED: "bg-green-100 text-green-800",
  ACADEMIC_CLEARANCE_REJECTED: "bg-red-100 text-red-800",
  FINANCE_CLEARANCE_PENDING: "bg-yellow-100 text-yellow-800",
  FINANCE_CLEARANCE_APPROVED: "bg-green-100 text-green-800",
  FINANCE_CLEARANCE_REJECTED: "bg-red-100 text-red-800",
  LIBRARY_CLEARANCE_PENDING: "bg-yellow-100 text-yellow-800",
  LIBRARY_CLEARANCE_APPROVED: "bg-green-100 text-green-800",
  LIBRARY_CLEARANCE_REJECTED: "bg-red-100 text-red-800",
  HOSTEL_CLEARANCE_PENDING: "bg-yellow-100 text-yellow-800",
  HOSTEL_CLEARANCE_APPROVED: "bg-green-100 text-green-800",
  HOSTEL_CLEARANCE_REJECTED: "bg-red-100 text-red-800",
  LAB_CLEARANCE_PENDING: "bg-yellow-100 text-yellow-800",
  LAB_CLEARANCE_APPROVED: "bg-green-100 text-green-800",
  LAB_CLEARANCE_REJECTED: "bg-red-100 text-red-800",
  ALL_CLEARANCES_APPROVED: "bg-purple-100 text-purple-800",
  GRADUATION_APPROVED: "bg-emerald-100 text-emerald-800",
  CERTIFICATE_GENERATED: "bg-indigo-100 text-indigo-800",
  CONVOCATION_REGISTERED: "bg-pink-100 text-pink-800",
  CONVOCATION_ATTENDED: "bg-teal-100 text-teal-800",
  COMPLETED: "bg-purple-100 text-purple-800",
  REJECTED: "bg-red-100 text-red-800",
  WITHDRAWN: "bg-gray-100 text-gray-800",
};

const CLEARANCE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const CLEARANCE_TYPE_ICONS: Record<string, any> = {
  ACADEMIC: faBook,
  FINANCE: faMoneyBillWave,
  LIBRARY: faBuilding,
  HOSTEL: faHome,
  LAB: faFlask,
};

const CLEARANCE_ROLES: Record<string, string[]> = {
  ACADEMIC: ["exam_officer", "hod", "program_coordinator", "registrar", "dean", "super_admin"],
  FINANCE: ["finance_officer", "registrar", "dean", "super_admin"],
  LIBRARY: ["librarian", "registrar", "dean", "super_admin"],
  HOSTEL: ["hostel_warden", "registrar", "dean", "super_admin"],
  LAB: ["lab_incharge", "hod", "registrar", "dean", "super_admin"],
};

export const GraduationConvocationView: React.FC = () => {
  const { currentUser, currentRole } = useCollegeOS();
  const { toast } = useToast();
  const isStudent = currentRole === "student";
  const canManageClearance = CLEARANCE_ROLES.ACADEMIC.includes(currentRole || "") ||
    CLEARANCE_ROLES.FINANCE.includes(currentRole || "") ||
    CLEARANCE_ROLES.LIBRARY.includes(currentRole || "") ||
    CLEARANCE_ROLES.HOSTEL.includes(currentRole || "") ||
    CLEARANCE_ROLES.LAB.includes(currentRole || "");

  const [applications, setApplications] = useState<Application[]>([]);
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [showConvocationModal, setShowConvocationModal] = useState(false);
  const [filters, setFilters] = useState({ status: "", academicYear: "", graduationCycle: "", page: 1, limit: 20 });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [activeTab, setActiveTab] = useState<"applications" | "eligibility" | "convocation">("applications");
  const [clearanceForm, setClearanceForm] = useState({ clearanceType: "", status: "APPROVED", remarks: "", documents: [] as string[] });
  const [certificateForm, setCertificateForm] = useState({ certificateNumber: "", issuedAt: new Date().toISOString().split("T")[0], certificateUrl: "", qrCodeData: "" });
  const [convocationForm, setConvocationForm] = useState({ action: "register", ceremonyDate: "", venue: "", guestCount: 0, regaliaSize: "", specialRequests: "" });

  const fetchApplications = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append("status", filters.status);
      if (filters.academicYear) params.append("academicYear", filters.academicYear);
      if (filters.graduationCycle) params.append("graduationCycle", filters.graduationCycle);
      params.append("page", String(filters.page));
      params.append("limit", String(filters.limit));

      const data = await apiRequest<{ applications: Application[]; pagination: typeof pagination }>(
        `/graduation/applications?${params}`,
      );
      setApplications(data.applications);
      setPagination(data.pagination);
    } catch (err) {
      toast.error("Failed to load applications");
    }
  };

  const fetchEligibility = async () => {
    if (isStudent) {
      try {
        const data = await apiRequest<EligibilityResult>("/graduation/check-eligibility", { method: "POST" });
        setEligibility(data);
      } catch (err) {
        toast.error("Failed to check eligibility");
      }
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchApplications(), fetchEligibility()]);
      setLoading(false);
    };
    loadAll();
  }, [filters.page]);

  const handleCheckEligibility = async (studentId?: string) => {
    try {
      const data = await apiRequest<EligibilityResult>("/graduation/check-eligibility", {
        method: "POST",
        body: JSON.stringify({ studentId }),
      });
      setEligibility(data);
      setShowEligibilityModal(true);
    } catch (err) {
      toast.error("Failed to check eligibility");
    }
  };

  const handleApply = async () => {
    if (!eligibility?.eligible) {
      toast.error("Student is not eligible for graduation");
      return;
    }
    try {
      await apiRequest("/graduation/applications", {
        method: "POST",
        body: JSON.stringify({ graduationCycle: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` }),
      });
      toast.success("Graduation application submitted");
      setShowEligibilityModal(false);
      fetchApplications();
    } catch (err) {
      toast.error("Failed to submit application");
    }
  };

  const handleUpdateClearance = async (applicationId: string, clearanceTypeParam: string) => {
    try {
      const { clearanceType: _, ...restClearanceForm } = clearanceForm;
      await apiRequest(`/graduation/applications/${applicationId}/clearance`, {
        method: "PATCH",
        body: JSON.stringify({ clearanceType: clearanceTypeParam, ...restClearanceForm }),
      });
      toast.success("Clearance updated");
      setClearanceForm({ clearanceType: "", status: "APPROVED", remarks: "", documents: [] });
      fetchApplications();
    } catch (err) {
      toast.error("Failed to update clearance");
    }
  };

  const handleFinalApproval = async (applicationId: string, status: string) => {
    const remarks = prompt("Remarks:");
    if (remarks === null) return;
    try {
      await apiRequest(`/graduation/applications/${applicationId}/final-approval`, {
        method: "PATCH",
        body: JSON.stringify({ status, remarks }),
      });
      toast.success(`Application ${status === "GRADUATION_APPROVED" ? "approved" : "rejected"}`);
      fetchApplications();
    } catch (err) {
      toast.error("Failed to process approval");
    }
  };

  const handleGenerateCertificate = async (applicationId: string) => {
    if (!certificateForm.certificateNumber || !certificateForm.issuedAt) {
      toast.error("Certificate number and issue date required");
      return;
    }
    try {
      await apiRequest(`/graduation/applications/${applicationId}/certificate`, {
        method: "PATCH",
        body: JSON.stringify(certificateForm),
      });
      toast.success("Certificate generated");
      setCertificateForm({ certificateNumber: "", issuedAt: new Date().toISOString().split("T")[0], certificateUrl: "", qrCodeData: "" });
      fetchApplications();
    } catch (err) {
      toast.error("Failed to generate certificate");
    }
  };

  const handleConvocationAction = async (applicationId: string) => {
    try {
      await apiRequest(`/graduation/applications/${applicationId}/convocation`, {
        method: "PATCH",
        body: JSON.stringify(convocationForm),
      });
      toast.success("Convocation updated");
      setConvocationForm({ action: "register", ceremonyDate: "", venue: "", guestCount: 0, regaliaSize: "", specialRequests: "" });
      fetchApplications();
    } catch (err) {
      toast.error("Failed to process convocation");
    }
  };

  const getClearanceProgress = (app: Application) => {
    const total = app.clearances.length;
    const approved = app.clearances.filter(c => c.status === "APPROVED").length;
    return { total, approved, percentage: total > 0 ? Math.round((approved / total) * 100) : 0 };
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
          <h1 className="text-2xl font-bold text-gray-900">Graduation & Convocation</h1>
          <p className="text-gray-500 mt-1">Manage graduation applications, clearances, certificates, and convocation</p>
        </div>
        <div className="flex gap-2">
          {isStudent && eligibility?.eligible && !eligibility?.existingApplication && (
            <button
              onClick={() => handleApply()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              <FontAwesomeIcon icon={faGraduationCap} className="mr-2" /> Apply for Graduation
            </button>
          )}
          {!isStudent && (
            <button
              onClick={() => handleCheckEligibility()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <FontAwesomeIcon icon={faCheckCircle} className="mr-2" /> Check Eligibility
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {[
            { id: "applications", label: "Applications", icon: faFileAlt },
            { id: "eligibility", label: "Eligibility Check", icon: faCheckCircle },
            { id: "convocation", label: "Convocation", icon: faUniversity },
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
                placeholder="Search by student, application number, or program..."
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
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Application #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Program</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cycle</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clearances</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Certificate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Convocation</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {applications.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">No applications found</td>
                  </tr>
                ) : (
                  applications.map((app) => {
                    const clearanceProgress = getClearanceProgress(app);
                    return (
                      <tr key={app._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedApplication(app); setShowDetail(true); }}>
                        <td className="px-4 py-4 font-mono text-sm text-gray-900">{app.applicationNumber}</td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-gray-900">{app.studentName}</p>
                          <p className="text-sm text-gray-500">{app.studentId}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">{app.program}</td>
                        <td className="px-4 py-4 text-sm text-gray-700">{app.graduationCycle}</td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[app.status]}`}>
                            {STATUS_LABELS[app.status]}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-xs">
                              <div
                                className={`h-full rounded-full ${clearanceProgress.approved === clearanceProgress.total ? "bg-green-500" : "bg-emerald-500"}`}
                                style={{ width: `${clearanceProgress.percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{clearanceProgress.approved}/{clearanceProgress.total}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {app.certificate ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800">
                              Generated
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">Not generated</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {app.convocation?.registered ? (
                            app.convocation.attended ? (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-teal-100 text-teal-800">Attended</span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-pink-100 text-pink-800">Registered</span>
                            )
                          ) : (
                            <span className="text-sm text-gray-400">Not registered</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedApplication(app); setShowDetail(true); }}
                              className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <FontAwesomeIcon icon={faEye} size="sm" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
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

      {/* Eligibility Tab */}
      {activeTab === "eligibility" && (
        <div className="bg-white rounded-lg border border-gray-200">
          {isStudent ? (
            eligibility ? (
              <div className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${eligibility.eligible ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                    <FontAwesomeIcon icon={eligibility.eligible ? faCheckCircle : faXmarkCircle} size="2xl" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">
                      {eligibility.eligible ? "Eligible for Graduation" : "Not Eligible for Graduation"}
                    </h3>
                    <p className="text-gray-500 mt-1">
                      {eligibility.student.fullName} • {eligibility.student.studentId} • {eligibility.student.program}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-3">Academic Requirements</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700">Credits Earned</span>
                        <span className="font-bold text-xl">{eligibility.academicCheck.totalCreditsEarned} / {eligibility.academicCheck.requiredCredits}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${eligibility.academicCheck.creditsMet ? "bg-green-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(100, (eligibility.academicCheck.totalCreditsEarned / eligibility.academicCheck.requiredCredits) * 100)}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-500">{eligibility.academicCheck.creditsMet ? "✓ Met" : "✗ Not met"}</p>

                      <div className="flex items-center justify-between">
                        <span className="text-gray-700">CGPA</span>
                        <span className="font-bold text-xl">{eligibility.academicCheck.cgpa.toFixed(2)} / {eligibility.academicCheck.minCGPARequired}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${eligibility.academicCheck.cgpaMet ? "bg-green-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(100, (eligibility.academicCheck.cgpa / eligibility.academicCheck.minCGPARequired) * 100)}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-500">{eligibility.academicCheck.cgpaMet ? "✓ Met" : "✗ Not met"}</p>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-3">Pending Clearances</h4>
                    <div className="space-y-2">
                      {eligibility.pendingClearances.map((cl) => (
                        <div key={cl.clearanceType} className="flex items-center gap-3 p-3 bg-white rounded border">
                          <FontAwesomeIcon icon={CLEARANCE_TYPE_ICONS[cl.clearanceType] || faBuilding} className="text-emerald-600" />
                          <span className="font-medium">{cl.clearanceType}</span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${CLEARANCE_STATUS_COLORS[cl.status]}`}>
                            {cl.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {eligibility.nextSteps.length > 0 && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-blue-800 mb-2">Next Steps</h4>
                    <ul className="list-disc list-inside space-y-1 text-blue-700">
                      {eligibility.nextSteps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {eligibility.existingApplication && (
                  <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <h4 className="font-medium text-yellow-800 mb-2">Existing Application</h4>
                    <p className="text-yellow-700">
                      Application #{eligibility.existingApplication.applicationNumber} - Status: {STATUS_LABELS[eligibility.existingApplication.status] || eligibility.existingApplication.status}
                    </p>
                  </div>
                )}

                {eligibility.eligible && !eligibility.existingApplication && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={() => handleApply()}
                      className="px-8 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-lg"
                    >
                      Apply for Graduation
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">Click "Check Eligibility" to view your graduation status</div>
            )
          ) : (
            <div className="p-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Check Student Eligibility</h3>
              <div className="max-w-md mx-auto">
                <input
                  type="text"
                  placeholder="Enter Student ID"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 mb-4"
                />
                <button
                  onClick={() => handleCheckEligibility()}
                  className="w-full px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  Check Eligibility
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Convocation Tab */}
      {activeTab === "convocation" && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Convocation Management</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Application #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registration</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ceremony Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Venue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attendance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {applications.filter(a => ["CERTIFICATE_GENERATED", "CONVOCATION_REGISTERED", "CONVOCATION_ATTENDED", "COMPLETED"].includes(a.status)).map((app) => (
                  <tr key={app._id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 font-mono text-sm text-gray-900">{app.applicationNumber}</td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-900">{app.studentName}</p>
                      <p className="text-sm text-gray-500">{app.studentId}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[app.status]}`}>
                        {STATUS_LABELS[app.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {app.convocation?.registered ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Registered</span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">Not Registered</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {app.convocation?.ceremonyDate ? new Date(app.convocation.ceremonyDate).toLocaleDateString() : "Not set"}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{app.convocation?.venue || "Not set"}</td>
                    <td className="px-4 py-4">
                      {app.convocation?.attended ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-teal-100 text-teal-800">Attended</span>
                      ) : app.convocation?.registered ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">Pending</span>
                      ) : (
                        <span className="text-sm text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        {!app.convocation?.registered && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConvocationForm({ ...convocationForm, action: "register" }); setShowConvocationModal(true); }}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Register
                          </button>
                        )}
                        {app.convocation?.registered && !app.convocation?.attended && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConvocationForm({ ...convocationForm, action: "attend" }); setShowConvocationModal(true); }}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            Mark Attended
                          </button>
                        )}
                        {app.convocation?.attended && app.status !== "COMPLETED" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConvocationForm({ ...convocationForm, action: "complete" }); setShowConvocationModal(true); }}
                            className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                          >
                            Complete
                          </button>
                        )}
                      </div>
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
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${STATUS_COLORS[selectedApplication.status].replace("bg-", "").replace(" text-", "")}`}>
                    <FontAwesomeIcon icon={faGraduationCap} size="xl" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-gray-900">{selectedApplication.studentName}</h4>
                    <p className="text-gray-500">{selectedApplication.studentId} • {selectedApplication.program}</p>
                    <p className="text-sm text-gray-500">#{selectedApplication.applicationNumber} • {selectedApplication.graduationCycle}</p>
                  </div>
                  <span className={`ml-auto px-3 py-1 text-base font-medium rounded-full ${STATUS_COLORS[selectedApplication.status]}`}>
                    {STATUS_LABELS[selectedApplication.status]}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-500">Academic Year</p>
                    <p className="font-medium">{selectedApplication.academicYear}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Semester</p>
                    <p className="font-medium">{selectedApplication.semester}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Submitted</p>
                    <p className="font-medium">{selectedApplication.submittedAt ? new Date(selectedApplication.submittedAt).toLocaleDateString() : "Not submitted"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Reviewed</p>
                    <p className="font-medium">{selectedApplication.reviewedAt ? new Date(selectedApplication.reviewedAt).toLocaleDateString() : "Not reviewed"}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-3">Clearance Status</h4>
                  <div className="space-y-3">
                    {selectedApplication.clearances.map((cl) => (
                      <div key={cl.clearanceType} className="p-4 bg-gray-50 rounded-lg border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FontAwesomeIcon icon={CLEARANCE_TYPE_ICONS[cl.clearanceType] || faBuilding} className="text-emerald-600" />
                          <div>
                            <p className="font-medium">{cl.clearanceType} Clearance</p>
                            <p className="text-sm text-gray-500">Requested: {new Date(cl.requestedAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`px-3 py-1 text-sm font-medium rounded-full ${CLEARANCE_STATUS_COLORS[cl.status]}`}>
                            {cl.status}
                          </span>
                          {canManageClearance && cl.status === "PENDING" && (
                            <button
                              onClick={() => {
                                setClearanceForm({ ...clearanceForm, clearanceType: cl.clearanceType, status: "APPROVED", remarks: "", documents: [] });
                                setSelectedApplication({ ...selectedApplication!, _id: selectedApplication._id });
                              }}
                              className="px-3 py-1 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              Review
                            </button>
                          )}
                          {cl.approvedBy && (
                            <span className="text-sm text-gray-500">Approved by {cl.approvedBy.name}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedApplication.certificate && (
                  <div className="mb-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                    <h4 className="font-medium text-indigo-800 mb-2 flex items-center gap-2">
                      <FontAwesomeIcon icon={faCertificate} /> Certificate Generated
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div><p className="text-gray-500">Certificate Number</p><p className="font-medium">{selectedApplication.certificate.certificateNumber}</p></div>
                      <div><p className="text-gray-500">Issued Date</p><p className="font-medium">{new Date(selectedApplication.certificate.issuedAt).toLocaleDateString()}</p></div>
                      <div><p className="text-gray-500">Issued By</p><p className="font-medium">{selectedApplication.certificate.issuedBy.name}</p></div>
                    </div>
                    {selectedApplication.certificate.certificateUrl && (
                      <a href={selectedApplication.certificate.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-sm mt-2 inline-block">
                        View Certificate
                      </a>
                    )}
                  </div>
                )}

                {selectedApplication.convocation && (
                  <div className="mb-6 p-4 bg-pink-50 rounded-lg border border-pink-200">
                    <h4 className="font-medium text-pink-800 mb-2 flex items-center gap-2">
                      <FontAwesomeIcon icon={faUniversity} /> Convocation
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div><p className="text-gray-500">Registered</p><p className="font-medium">{selectedApplication.convocation.registered ? "Yes" : "No"}</p></div>
                      {selectedApplication.convocation.ceremonyDate && <div><p className="text-gray-500">Ceremony Date</p><p className="font-medium">{new Date(selectedApplication.convocation.ceremonyDate).toLocaleDateString()}</p></div>}
                      {selectedApplication.convocation.venue && <div><p className="text-gray-500">Venue</p><p className="font-medium">{selectedApplication.convocation.venue}</p></div>}
                      <div><p className="text-gray-500">Guests</p><p className="font-medium">{selectedApplication.convocation.guestCount}</p></div>
                      {selectedApplication.convocation.regaliaSize && <div><p className="text-gray-500">Regalia Size</p><p className="font-medium">{selectedApplication.convocation.regaliaSize}</p></div>}
                      <div><p className="text-gray-500">Attended</p><p className="font-medium">{selectedApplication.convocation.attended ? "Yes" : "No"}</p></div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {canManageClearance && selectedApplication.clearances.some(c => c.status === "PENDING") && (
                    <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                      Review Pending Clearances
                    </button>
                  )}
                  {["ALL_CLEARANCES_APPROVED"].includes(selectedApplication.status) && ["dean", "registrar", "super_admin"].includes(currentRole || "") && (
                    <>
                      <button onClick={() => handleFinalApproval(selectedApplication._id, "GRADUATION_APPROVED")} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                        Approve Graduation
                      </button>
                      <button onClick={() => handleFinalApproval(selectedApplication._id, "REJECTED")} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                        Reject
                      </button>
                    </>
                  )}
                  {selectedApplication.status === "GRADUATION_APPROVED" && ["registrar", "super_admin"].includes(currentRole || "") && (
                    <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700" onClick={() => {
                      setCertificateForm({ ...certificateForm, certificateNumber: `CERT-${selectedApplication.applicationNumber}-${Date.now()}` });
                    }}>
                      Generate Certificate
                    </button>
                  )}
                  {["CERTIFICATE_GENERATED", "CONVOCATION_REGISTERED"].includes(selectedApplication.status) && ["registrar", "dean", "super_admin"].includes(currentRole || "") && (
                    <button className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700" onClick={() => setShowConvocationModal(true)}>
                      Manage Convocation
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clearance Review Modal */}
      {clearanceForm.clearanceType && selectedApplication && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setClearanceForm({ clearanceType: "", status: "APPROVED", remarks: "", documents: [] })} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Review Clearance: {clearanceForm.clearanceType}</h3>
                <button onClick={() => setClearanceForm({ clearanceType: "", status: "APPROVED", remarks: "", documents: [] })} className="text-gray-400 hover:text-gray-600">
                  <FontAwesomeIcon icon={faTimes} size="lg" />
                </button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); handleUpdateClearance(selectedApplication._id, clearanceForm.clearanceType); }} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={clearanceForm.status}
                    onChange={(e) => setClearanceForm({ ...clearanceForm, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <textarea
                    value={clearanceForm.remarks}
                    onChange={(e) => setClearanceForm({ ...clearanceForm, remarks: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button type="button" onClick={() => setClearanceForm({ clearanceType: "", status: "APPROVED", remarks: "", documents: [] })} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Submit</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Generation Modal */}
      {certificateForm.certificateNumber && selectedApplication && selectedApplication.status === "GRADUATION_APPROVED" && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setCertificateForm({ certificateNumber: "", issuedAt: new Date().toISOString().split("T")[0], certificateUrl: "", qrCodeData: "" })} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Generate Certificate</h3>
                <button onClick={() => setCertificateForm({ certificateNumber: "", issuedAt: new Date().toISOString().split("T")[0], certificateUrl: "", qrCodeData: "" })} className="text-gray-400 hover:text-gray-600">
                  <FontAwesomeIcon icon={faTimes} size="lg" />
                </button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); handleGenerateCertificate(selectedApplication._id); }} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Certificate Number</label>
                  <input
                    required
                    type="text"
                    value={certificateForm.certificateNumber}
                    onChange={(e) => setCertificateForm({ ...certificateForm, certificateNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
                  <input
                    required
                    type="date"
                    value={certificateForm.issuedAt}
                    onChange={(e) => setCertificateForm({ ...certificateForm, issuedAt: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Certificate URL (optional)</label>
                  <input
                    type="url"
                    value={certificateForm.certificateUrl}
                    onChange={(e) => setCertificateForm({ ...certificateForm, certificateUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    placeholder="https://example.com/certificates/..."
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button type="button" onClick={() => setCertificateForm({ certificateNumber: "", issuedAt: new Date().toISOString().split("T")[0], certificateUrl: "", qrCodeData: "" })} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Generate</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Convocation Modal */}
      {showConvocationModal && selectedApplication && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowConvocationModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Convocation: {convocationForm.action === "register" ? "Register" : convocationForm.action === "attend" ? "Mark Attended" : "Complete"}</h3>
                <button onClick={() => setShowConvocationModal(false)} className="text-gray-400 hover:text-gray-600">
                  <FontAwesomeIcon icon={faTimes} size="lg" />
                </button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); handleConvocationAction(selectedApplication._id); }} className="p-4 space-y-4">
                {convocationForm.action === "register" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ceremony Date</label>
                      <input required type="date" value={convocationForm.ceremonyDate} onChange={(e) => setConvocationForm({ ...convocationForm, ceremonyDate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
                      <input required type="text" value={convocationForm.venue} onChange={(e) => setConvocationForm({ ...convocationForm, venue: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Guest Count</label>
                      <input required type="number" min="0" value={convocationForm.guestCount} onChange={(e) => setConvocationForm({ ...convocationForm, guestCount: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Regalia Size</label>
                      <select value={convocationForm.regaliaSize} onChange={(e) => setConvocationForm({ ...convocationForm, regaliaSize: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500">
                        <option value="">Select size</option>
                        <option value="S">Small</option>
                        <option value="M">Medium</option>
                        <option value="L">Large</option>
                        <option value="XL">Extra Large</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
                      <textarea value={convocationForm.specialRequests} onChange={(e) => setConvocationForm({ ...convocationForm, specialRequests: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" rows={2} />
                    </div>
                  </>
                )}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button type="button" onClick={() => setShowConvocationModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                    {convocationForm.action === "register" ? "Register" : convocationForm.action === "attend" ? "Mark Attended" : "Complete"}
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

export default GraduationConvocationView;