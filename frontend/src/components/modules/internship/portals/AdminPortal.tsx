import React, { useState } from "react";
import {
  MOCK_COMPANIES,
  MOCK_OPPORTUNITIES,
  MOCK_APPLICATIONS,
  MOCK_ACTIVE_PLACEMENT,
  MOCK_LOGBOOK_ENTRIES,
  MOCK_ATTENDANCE_RECORDS,
  MOCK_AUDIT_LOGS,
  MOCK_VIRTUAL_COMPANIES,
  MOCK_INDUSTRY_PROJECTS,
} from "../mockData";
import {
  Company,
  InternshipOpportunity,
  ApplicationRecord,
  PlacementDetail,
  AuditLogItem,
  VirtualCompany,
} from "../types";
import {
  StatusBadge,
  MetricCard,
  TablePagination,
  ModalWrapper,
  DrawerWrapper,
} from "../components/SharedWidgets";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShieldHalved,
  faBuilding,
  faBriefcase,
  faUsers,
  faCheck,
  faTimes,
  faSearch,
  faFilter,
  faGraduationCap,
  faFileContract,
  faLaptopCode,
  faSitemap,
  faScroll,
  faTriangleExclamation,
  faUserCheck,
  faPlus,
  faEye,
  faClock,
  faAward,
} from "@fortawesome/free-solid-svg-icons";

interface AdminPortalProps {
  activePage: string;
  onNavigate: (pageId: string) => void;
  searchQuery: string;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  activePage,
  onNavigate,
  searchQuery,
}) => {
  const [companies, setCompanies] = useState<Company[]>(MOCK_COMPANIES);
  const [opportunities, setOpportunities] = useState<InternshipOpportunity[]>(MOCK_OPPORTUNITIES);
  const [applications, setApplications] = useState<ApplicationRecord[]>(MOCK_APPLICATIONS);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(MOCK_AUDIT_LOGS);
  const [virtualCompanies, setVirtualCompanies] = useState<VirtualCompany[]>(MOCK_VIRTUAL_COMPANIES);

  // Selected entities for actions
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedOpp, setSelectedOpp] = useState<InternshipOpportunity | null>(null);
  const [selectedPlacement, setSelectedPlacement] = useState<PlacementDetail | null>(null);
  const [showCertificateModal, setShowCertificateModal] = useState(false);

  // Verification action
  const handleVerifyCompany = (companyId: string, status: "VERIFIED" | "REJECTED") => {
    const updated = companies.map((c) =>
      c.id === companyId ? { ...c, verificationStatus: status, isVerified: status === "VERIFIED" } : c
    );
    setCompanies(updated);
    // Append audit log
    const log: AuditLogItem = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      actor: "CollegeOS Internship Office",
      actorRole: "INTERNSHIP_COORDINATOR",
      action: status === "VERIFIED" ? "EMPLOYER_VERIFIED" : "EMPLOYER_REJECTED",
      entityType: "Company",
      entityId: companyId,
      details: `Company verification updated to ${status}`,
      ipAddress: "192.168.10.1",
    };
    setAuditLogs([log, ...auditLogs]);
  };

  // Opportunity approval action
  const handleApproveOpportunity = (oppId: string, status: "OPEN" | "CLOSED") => {
    const updated = opportunities.map((o) => (o.id === oppId ? { ...o, status } : o));
    setOpportunities(updated);
  };

  // --------------------------------------------------------------------------
  // PAGE 1: ADMINISTRATION DASHBOARD
  // --------------------------------------------------------------------------
  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">
            Institutional Oversight
          </span>
          <h2 className="text-xl font-bold mt-2">
            Internship & Industrial Experience Governance
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Academic Year 2026/27 • Techspire College Internship Directorate
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onNavigate("adm_verification")}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs"
          >
            Pending Verifications (1)
          </button>
          <button
            onClick={() => onNavigate("adm_audit_logs")}
            className="px-3.5 py-2 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-800"
          >
            System Audit Trail
          </button>
        </div>
      </div>

      {/* Institutional Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Partner Employers"
          value={companies.length}
          subtitle="3 Fully Verified MOUs"
          icon={faBuilding}
          color="emerald"
        />
        <MetricCard
          title="Active Placements"
          value="48 Students"
          subtitle="96% On-Track Compliance"
          icon={faUsers}
          color="blue"
        />
        <MetricCard
          title="Simulated Participants"
          value="124 Students"
          subtitle="Virtual Workplace Cohort"
          icon={faLaptopCode}
          color="indigo"
        />
        <MetricCard
          title="Pending Approvals"
          value={opportunities.filter((o) => o.status === "PENDING_APPROVAL").length + companies.filter((c) => c.verificationStatus === "PENDING").length}
          subtitle="Requires Coordinator Sign-off"
          icon={faClock}
          color="amber"
        />
      </div>

      {/* Two Column Section: Opportunity Approvals & Active Monitoring Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <FontAwesomeIcon icon={faBriefcase} className="text-emerald-600" />
              <span>Pending Opportunity Listings</span>
            </h3>
            <button
              onClick={() => onNavigate("adm_opp_approval")}
              className="text-xs text-emerald-600 hover:underline font-semibold"
            >
              All Listings
            </button>
          </div>
          <div className="space-y-3">
            {opportunities.map((opp) => (
              <div
                key={opp.id}
                className="p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between"
              >
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">{opp.title}</h4>
                  <p className="text-[11px] text-slate-500">{opp.companyName} • {opp.stipendRange}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <StatusBadge status={opp.status} />
                  {opp.status === "PENDING_APPROVAL" && (
                    <button
                      onClick={() => handleApproveOpportunity(opp.id, "OPEN")}
                      className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monitoring & Risk Alerts */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <FontAwesomeIcon icon={faTriangleExclamation} className="text-amber-500" />
              <span>Internship Compliance Monitoring</span>
            </h3>
            <span className="text-xs text-slate-400">Live Health Check</span>
          </div>
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 text-xs flex items-center justify-between">
              <div>
                <strong className="text-emerald-900 dark:text-emerald-200 block">All Week 5 Logbooks Reviewed</strong>
                <span className="text-emerald-700 dark:text-emerald-300 text-[11px]">No overdue faculty assessments</span>
              </div>
              <span className="text-emerald-700 font-bold">100% OK</span>
            </div>
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 text-xs flex items-center justify-between">
              <div>
                <strong className="text-amber-900 dark:text-amber-200 block">MedVanguard Digital Health</strong>
                <span className="text-amber-700 dark:text-amber-300 text-[11px]">Partner MOU pending signature</span>
              </div>
              <button
                onClick={() => onNavigate("adm_verification")}
                className="px-2 py-1 text-[11px] font-semibold bg-amber-600 text-white rounded-md"
              >
                Verify
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 2: EMPLOYER VERIFICATION & MANAGEMENT
  // --------------------------------------------------------------------------
  const renderEmployerView = () => (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Employer Verification & Institutional Partnerships
          </h2>
          <p className="text-xs text-slate-500">
            Audit corporate credentials, business registration documents, and approve student-facing postings
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200">
            <tr>
              <th className="py-3 px-4">Organization</th>
              <th className="py-3 px-4">Industry & Size</th>
              <th className="py-3 px-4">Contact Lead</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Verification Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {companies.map((comp) => (
              <tr key={comp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                <td className="py-3.5 px-4">
                  <span className="font-bold text-slate-900 dark:text-white block">{comp.name}</span>
                  <a href={comp.website} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-600 hover:underline">
                    {comp.website}
                  </a>
                </td>
                <td className="py-3.5 px-4">
                  <span className="block font-medium">{comp.industry}</span>
                  <span className="text-[11px] text-slate-400">{comp.size}</span>
                </td>
                <td className="py-3.5 px-4">
                  <span className="font-semibold block">{comp.contactPerson}</span>
                  <span className="text-[11px] text-slate-400">{comp.contactEmail}</span>
                </td>
                <td className="py-3.5 px-4">
                  <StatusBadge status={comp.verificationStatus} />
                </td>
                <td className="py-3.5 px-4 text-right">
                  {comp.verificationStatus === "PENDING" ? (
                    <div className="flex items-center justify-end space-x-1.5">
                      <button
                        onClick={() => handleVerifyCompany(comp.id, "VERIFIED")}
                        className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleVerifyCompany(comp.id, "REJECTED")}
                        className="px-2 py-1 text-[11px] font-semibold border border-rose-300 text-rose-700 rounded-md hover:bg-rose-50"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-emerald-600 font-semibold text-[11px]">MOU Signed & Active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 3: PLACEMENT MANAGEMENT & CERTIFICATES
  // --------------------------------------------------------------------------
  const renderPlacementsAndCertificates = () => (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Placement Management & Certificate Issuance
          </h2>
          <p className="text-xs text-slate-500">
            Verify minimum 480 clock hours, validate rubric grades, and generate university internship certificates
          </p>
        </div>
        <button
          onClick={() => setShowCertificateModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center space-x-1.5"
        >
          <FontAwesomeIcon icon={faGraduationCap} />
          <span>Issue Verified Certificate</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 mb-3">
          Active Student Placement Roster
        </h4>
        <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 text-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-slate-900 dark:text-white">
                {MOCK_ACTIVE_PLACEMENT.studentName} ({MOCK_ACTIVE_PLACEMENT.studentId})
              </span>
              <StatusBadge status={MOCK_ACTIVE_PLACEMENT.status} />
            </div>
            <p className="text-slate-500 mt-1">
              {MOCK_ACTIVE_PLACEMENT.opportunityTitle} at {MOCK_ACTIVE_PLACEMENT.companyName}
            </p>
            <p className="text-slate-500">
              Hours Logged: {MOCK_ACTIVE_PLACEMENT.completedHours} / {MOCK_ACTIVE_PLACEMENT.totalRequiredHours} hrs ({MOCK_ACTIVE_PLACEMENT.progressPercentage}%)
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => alert(`Reviewing academic dossier for ${MOCK_ACTIVE_PLACEMENT.studentName}`)}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-md font-semibold text-slate-700 dark:text-slate-200"
            >
              Audit Hours
            </button>
            <button
              onClick={() => setShowCertificateModal(true)}
              className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-md font-bold shadow-xs hover:bg-emerald-700"
            >
              Generate Certificate
            </button>
          </div>
        </div>
      </div>

      {/* Certificate Modal */}
      <ModalWrapper
        isOpen={showCertificateModal}
        onClose={() => setShowCertificateModal(false)}
        title="Issue University Verified Internship Certificate"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center space-y-1">
            <FontAwesomeIcon icon={faAward} className="text-2xl text-emerald-600 mb-1" />
            <h4 className="font-bold text-slate-900 dark:text-white">Techspire College Internship Directorate</h4>
            <p className="text-slate-600 dark:text-slate-400">Official Certificate of Completion & Industrial Excellence</p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1">
            <p><strong>Candidate:</strong> Aarav Sharma (STU-2023-0491)</p>
            <p><strong>Host Organization:</strong> Apex Global Cloud Solutions</p>
            <p><strong>Awarded Grade:</strong> Grade 'A' (Excellent)</p>
            <p><strong>Academic Credit Grant:</strong> 6 Credit Hours</p>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setShowCertificateModal(false)}
              className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                alert("Certificate cryptographically signed and stored in Digital Credentials!");
                setShowCertificateModal(false);
              }}
              className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg font-bold shadow-xs hover:bg-emerald-700"
            >
              Sign & Issue Certificate
            </button>
          </div>
        </div>
      </ModalWrapper>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 4: VIRTUAL WORKPLACE ADMINISTRATION & SIMULATION MANAGEMENT
  // --------------------------------------------------------------------------
  const renderVirtualWorkplaceAdmin = () => (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Virtual Workplace Simulation Governance
          </h2>
          <p className="text-xs text-slate-500">
            Manage simulated enterprise environments, configure career-track templates, and inject production scenarios
          </p>
        </div>
        <button
          onClick={() => alert("Simulation incident injected into active cohort!")}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center space-x-1"
        >
          <FontAwesomeIcon icon={faPlus} />
          <span>Inject Incident / Crisis</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {virtualCompanies.map((vc) => (
          <div
            key={vc.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full uppercase">
                  {vc.sector.replace(/_/g, " ")}
                </span>
                <span className="text-xs font-semibold text-slate-400">{vc.difficulty}</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2">{vc.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{vc.brandTagline}</p>

              <div className="mt-3.5 space-y-1.5 text-xs">
                <p><strong>Configured Departments:</strong> {vc.departments.length} Squads</p>
                <p><strong>Open Career Tracks:</strong> Frontend Dev, PM, UI/UX Designer, QA</p>
                <p><strong>Active Projects:</strong> {vc.activeProjects.join(", ")}</p>
              </div>
            </div>

            <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-emerald-600 font-semibold">Status: Simulation Live</span>
              <button
                onClick={() => onNavigate("vw_overview")}
                className="px-3 py-1.5 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700"
              >
                Inspect Simulation
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 5: AUDIT LOGS
  // --------------------------------------------------------------------------
  const renderAuditLogs = () => (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Internship Compliance Audit Trail
          </h2>
          <p className="text-xs text-slate-500">
            Immutable log of all evaluation submissions, employer verifications, and credit authorizations
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200">
            <tr>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Actor & Role</th>
              <th className="py-3 px-4">Action</th>
              <th className="py-3 px-4">Details</th>
              <th className="py-3 px-4 text-right">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
            {auditLogs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                <td className="py-3 px-4 text-slate-400">{log.timestamp}</td>
                <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-white">
                  {log.actor}
                  <span className="block text-[10px] text-slate-400 font-mono">{log.actorRole}</span>
                </td>
                <td className="py-3 px-4 text-emerald-600 font-bold">{log.action}</td>
                <td className="py-3 px-4 font-sans text-slate-600 dark:text-slate-300">{log.details}</td>
                <td className="py-3 px-4 text-right text-slate-400">{log.ipAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      {activePage === "adm_dashboard" && renderDashboard()}
      {(activePage === "adm_employers" || activePage === "adm_verification") && renderEmployerView()}
      {(activePage === "adm_opp_approval" || activePage === "adm_applications") && renderDashboard()}
      {(activePage === "adm_placements" || activePage === "adm_completion" || activePage === "adm_supervisors") &&
        renderPlacementsAndCertificates()}
      {(activePage === "adm_vw_admin" || activePage === "adm_templates" || activePage === "adm_sim_management") &&
        renderVirtualWorkplaceAdmin()}
      {activePage === "adm_audit_logs" && renderAuditLogs()}

      {/* Fallback for monitoring/analytics/settings */}
      {(activePage === "adm_monitoring" ||
        activePage === "adm_logbooks" ||
        activePage === "adm_attendance" ||
        activePage === "adm_reports" ||
        activePage === "adm_evaluations" ||
        activePage === "adm_industry_projects" ||
        activePage === "adm_analytics" ||
        activePage === "adm_settings") && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white capitalize">
            {activePage.replace("adm_", "").replace(/_/g, " ")} Suite
          </h3>
          <p className="text-xs text-slate-500">
            Institutional oversight metrics and administrative parameters
          </p>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
            <p><strong>Curricular Requirements:</strong> 480 Total Required Hours (6 Academic Credits)</p>
            <p><strong>Supervision Policy:</strong> Minimum 1 on-site or virtual tripartite sync every 4 weeks</p>
            <p><strong>Evaluation Weightage:</strong> 60% Industry Supervisor Rubric, 40% Faculty Examination</p>
          </div>
        </div>
      )}
    </div>
  );
};
