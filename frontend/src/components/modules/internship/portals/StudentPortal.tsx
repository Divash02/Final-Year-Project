import React, { useState, useEffect } from "react";
import * as internshipApi from "../../../../services/internshipApi";
import {
  InternshipOpportunity,
  ApplicationRecord,
  LogbookEntry,
  AttendanceRecord,
  IndustryProject,
} from "../types";
import {
  StatusBadge,
  MetricCard,
  TablePagination,
  EmptyStateView,
  DrawerWrapper,
  ModalWrapper,
} from "../components/SharedWidgets";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBriefcase,
  faBuilding,
  faMapMarkerAlt,
  faClock,
  faMoneyBillWave,
  faCheckCircle,
  faCalendarCheck,
  faBookBookmark,
  faFolderOpen,
  faFileLines,
  faStar,
  faDiagramProject,
  faLaptopCode,
  faPlus,
  faSearch,
  faFilter,
  faArrowRight,
  faExternalLinkAlt,
  faUserGraduate,
  faDownload,
  faCheck,
  faTimes,
  faClipboardCheck,
  faPaperPlane,
  faUserCheck,
} from "@fortawesome/free-solid-svg-icons";

interface StudentPortalProps {
  activePage: string;
  onNavigate: (pageId: string) => void;
  searchQuery: string;
  onEnterVirtualWorkspace?: (membershipId: string) => void;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({
  activePage,
  onNavigate,
  searchQuery,
}) => {
  // Local state for interactive student flows
  const [opportunities, setOpportunities] = useState<InternshipOpportunity[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [logbooks, setLogbooks] = useState<LogbookEntry[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch real data from backend on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [oppsRes, appsRes] = await Promise.all([
          internshipApi.listOpportunities({ page: 1, limit: 50 }),
          internshipApi.listApplications({ page: 1, limit: 50 }),
        ]);
        if (cancelled) return;
        setOpportunities(Array.isArray(oppsRes?.items) ? oppsRes.items : Array.isArray(oppsRes) ? oppsRes : []);
        setApplications(Array.isArray(appsRes?.items) ? appsRes.items : Array.isArray(appsRes) ? appsRes : []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load internship data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Selected detail drawers & modals
  const [selectedOpportunity, setSelectedOpportunity] = useState<InternshipOpportunity | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationRecord | null>(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyCoverLetter, setApplyCoverLetter] = useState("");
  const [applySuccessMsg, setApplySuccessMsg] = useState("");

  // Logbook creation modal state
  const [showNewLogModal, setShowNewLogModal] = useState(false);
  const [newLogWeek, setNewLogWeek] = useState(7);
  const [newLogHours, setNewLogHours] = useState(40);
  const [newLogTasks, setNewLogTasks] = useState("");
  const [newLogLearnings, setNewLogLearnings] = useState("");

  // Daily attendance clock-in state
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInNotes, setClockInNotes] = useState("");

  // Onboarding items state
  const [onboardingTasks, setOnboardingTasks] = useState([
    { id: 1, title: "Review & Sign Student Code of Conduct & NDA", completed: true },
    { id: 2, title: "Complete Workplace Safety & Zero-Trust Orientation", completed: true },
    { id: 3, title: "Configure Corporate VPN & GitHub Organization SSO", completed: true },
    { id: 4, title: "Initial Supervisory Check-in with Faculty Mentor", completed: true },
    { id: 5, title: "Submit Approved Learning Agreement to Internship Office", completed: false },
  ]);

  // Filters for Explore
  const [workModeFilter, setWorkModeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Pagination for tables
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Apply Action
  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpportunity) return;
    try {
      const newApp = await internshipApi.createApplication({
        opportunityId: selectedOpportunity.id,
        coverLetter: applyCoverLetter || "Excited to apply my technical skills to this role.",
      });
      setApplications([newApp, ...applications]);
      setApplySuccessMsg("Application submitted successfully!");
      setTimeout(() => {
        setShowApplyModal(false);
        setApplySuccessMsg("");
        onNavigate("stu_applications");
      }, 1200);
    } catch (err: any) {
      setApplySuccessMsg(err?.message || "Failed to submit application");
    }
  };

  // Add Logbook Entry Action
  const handleNewLogbookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entry: LogbookEntry = {
      id: `log-${Date.now()}`,
      placementId: MOCK_ACTIVE_PLACEMENT.id,
      studentName: "Aarav Sharma",
      weekNumber: newLogWeek,
      dateRange: "2026-11-23 - 2026-11-28",
      hoursWorked: Number(newLogHours),
      tasksCompleted: newLogTasks,
      keyLearnings: newLogLearnings,
      challengesFaced: "Managing complex state transitions.",
      status: "SUBMITTED",
      submittedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    };
    setLogbooks([entry, ...logbooks]);
    setShowNewLogModal(false);
    setNewLogTasks("");
    setNewLogLearnings("");
  };

  // Clock In / Out Toggle
  const handleToggleClockIn = () => {
    if (!isClockedIn) {
      setIsClockedIn(true);
      const newRecord: AttendanceRecord = {
        id: `att-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        checkInTime: "09:00 AM",
        checkOutTime: "In Progress",
        totalHours: 0,
        status: "PRESENT",
        approvedBySupervisor: false,
        notes: clockInNotes || "Clocked in via Student Portal",
      };
      setAttendance([newRecord, ...attendance]);
    } else {
      setIsClockedIn(false);
      if (attendance.length > 0) {
        const updated = [...attendance];
        updated[0] = {
          ...updated[0],
          checkOutTime: "05:00 PM",
          totalHours: 8.0,
        };
        setAttendance(updated);
      }
    }
  };

  // --------------------------------------------------------------------------
  // PAGE 1: INTERNSHIP DASHBOARD
  // --------------------------------------------------------------------------
  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Placement Status Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="bg-white/20 text-white px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider">
              Active Placement
            </span>
            <span className="text-xs text-emerald-100">Fall 2026 Cohort</span>
          </div>
          <h2 className="text-xl font-bold mt-2">
            {MOCK_ACTIVE_PLACEMENT.opportunityTitle}
          </h2>
          <p className="text-sm text-emerald-100 mt-1 flex items-center space-x-2">
            <FontAwesomeIcon icon={faBuilding} />
            <span>{MOCK_ACTIVE_PLACEMENT.companyName}</span>
            <span>•</span>
            <span>Supervisor: {MOCK_ACTIVE_PLACEMENT.industrySupervisor.name}</span>
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => onNavigate("stu_placement")}
            className="px-4 py-2 bg-white text-emerald-800 text-xs font-bold rounded-lg hover:bg-emerald-50 transition-colors shadow-xs"
          >
            Placement Workspace
          </button>
          <button
            onClick={() => onNavigate("stu_logbook")}
            className="px-4 py-2 bg-emerald-800/60 border border-white/20 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 transition-colors"
          >
            Submit Logbook
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Completed Hours"
          value={`${MOCK_ACTIVE_PLACEMENT.completedHours} / ${MOCK_ACTIVE_PLACEMENT.totalRequiredHours} hrs`}
          subtitle="45% of Degree Requirement"
          icon={faClock}
          color="emerald"
        />
        <MetricCard
          title="Active Applications"
          value={applications.length}
          subtitle="1 Offer Extended, 1 Active"
          icon={faBriefcase}
          color="blue"
        />
        <MetricCard
          title="Supervisor Evaluation"
          value="4.6 / 5.0"
          subtitle="Midterm Grade: A (Excellent)"
          icon={faStar}
          color="amber"
        />
        <MetricCard
          title="Weekly Logbooks"
          value={`${logbooks.length} Submitted`}
          subtitle="Next Due: Friday, 5:00 PM"
          icon={faBookBookmark}
          color="indigo"
        />
      </div>

      {/* Two Column Grid: Upcoming Check-ins & Recent Applications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Next Scheduled Meetings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <FontAwesomeIcon icon={faCalendarCheck} className="text-emerald-600" />
              <span>Upcoming Supervisory Check-ins</span>
            </h3>
            <button
              onClick={() => onNavigate("stu_meetings")}
              className="text-xs text-emerald-600 hover:underline font-semibold"
            >
              View Calendar
            </button>
          </div>
          <div className="space-y-3">
            {MOCK_MEETINGS.map((mtg) => (
              <div
                key={mtg.id}
                className="p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between"
              >
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">{mtg.title}</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {mtg.scheduledTime} ({mtg.durationMinutes} mins)
                  </p>
                </div>
                <a
                  href={mtg.meetingLink || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-md border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                >
                  Join Sync
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Application Status Snapshot */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <FontAwesomeIcon icon={faBriefcase} className="text-blue-600" />
              <span>Active Application Tracker</span>
            </h3>
            <button
              onClick={() => onNavigate("stu_applications")}
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              All Applications ({applications.length})
            </button>
          </div>
          <div className="space-y-3">
            {applications.slice(0, 3).map((app) => (
              <div
                key={app.id}
                onClick={() => {
                  setSelectedApplication(app);
                  onNavigate("stu_app_details");
                }}
                className="p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition-all"
              >
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">{app.opportunityTitle}</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{app.companyName}</p>
                </div>
                <StatusBadge status={app.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 2: EXPLORE INTERNSHIPS
  // --------------------------------------------------------------------------
  const renderExploreInternships = () => {
    const filteredOpps = opportunities.filter((opp) => {
      const matchesSearch =
        opp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opp.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opp.skillsRequired.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesMode = workModeFilter === "ALL" || opp.workMode === workModeFilter;
      return matchesSearch && matchesMode;
    });

    return (
      <div className="space-y-5">
        {/* Filter & Search Header */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Filter Work Mode:</span>
            <select
              value={workModeFilter}
              onChange={(e) => setWorkModeFilter(e.target.value)}
              className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Modes (Remote / Hybrid / On-Site)</option>
              <option value="HYBRID">Hybrid</option>
              <option value="REMOTE">Remote</option>
              <option value="ON_SITE">On-Site</option>
            </select>
          </div>
          <div className="text-xs text-slate-500">
            Showing <strong className="text-slate-900 dark:text-white">{filteredOpps.length}</strong> verified opportunities
          </div>
        </div>

        {/* Opportunities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredOpps.map((opp) => (
            <div
              key={opp.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs hover:border-emerald-500/50 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full uppercase">
                      {opp.department}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2 hover:text-emerald-600 transition-colors">
                      {opp.title}
                    </h3>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1 flex items-center space-x-1.5">
                      <FontAwesomeIcon icon={faBuilding} className="text-slate-400 text-xs" />
                      <span>{opp.companyName}</span>
                      {opp.isVerifiedEmployer && (
                        <span className="text-[10px] text-emerald-600 font-bold" title="Institutional Partner Verified">
                          <FontAwesomeIcon icon={faCheckCircle} />
                        </span>
                      )}
                    </p>
                  </div>
                  <StatusBadge status={opp.workMode} />
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 line-clamp-2">
                  {opp.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mt-3.5">
                  {opp.skillsRequired.map((skill, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md font-mono"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">{opp.stipendRange}</span>
                  <span className="text-[11px] text-slate-400 block">{opp.durationMonths} months • {opp.availablePositions} openings</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setSelectedOpportunity(opp);
                      onNavigate("stu_details");
                    }}
                    className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Details
                  </button>
                  <button
                    onClick={() => {
                      setSelectedOpportunity(opp);
                      setShowApplyModal(true);
                    }}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs"
                  >
                    Apply Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // PAGE 3: INTERNSHIP DETAILS
  // --------------------------------------------------------------------------
  const renderInternshipDetails = () => {
    const opp = selectedOpportunity || opportunities[0];

    return (
      <div className="space-y-6">
        <button
          onClick={() => onNavigate("stu_explore")}
          className="text-xs text-emerald-600 hover:underline font-semibold flex items-center space-x-1"
        >
          <span>← Back to Explore Internships</span>
        </button>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full uppercase">
                  {opp.department}
                </span>
                <StatusBadge status={opp.workMode} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-2">{opp.title}</h2>
              <p className="text-xs text-slate-500 mt-1 flex items-center space-x-2">
                <FontAwesomeIcon icon={faBuilding} />
                <span>{opp.companyName}</span>
                <span>•</span>
                <FontAwesomeIcon icon={faMapMarkerAlt} />
                <span>{opp.location}</span>
                <span>•</span>
                <span>Posted {opp.postedDate}</span>
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedOpportunity(opp);
                setShowApplyModal(true);
              }}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs"
            >
              Apply For Internship
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 py-5 border-b border-slate-100 dark:border-slate-800 text-xs">
            <div>
              <span className="text-slate-400 block">Monthly Stipend</span>
              <strong className="text-slate-900 dark:text-white">{opp.stipendRange}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Duration</span>
              <strong className="text-slate-900 dark:text-white">{opp.durationMonths} Months</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Application Deadline</span>
              <strong className="text-slate-900 dark:text-white">{opp.deadline}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Open Positions</span>
              <strong className="text-slate-900 dark:text-white">{opp.availablePositions} Slots ({opp.applicantsCount} Applied)</strong>
            </div>
          </div>

          <div className="mt-6 space-y-6 text-xs text-slate-700 dark:text-slate-300">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Role Overview</h4>
              <p className="leading-relaxed text-slate-600 dark:text-slate-400">{opp.description}</p>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Key Responsibilities</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600 dark:text-slate-400">
                {opp.responsibilities.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Candidate Requirements</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600 dark:text-slate-400">
                {opp.requirements.map((req, i) => (
                  <li key={i}>{req}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Required Skills</h4>
              <div className="flex flex-wrap gap-2">
                {opp.skillsRequired.map((s, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md font-mono text-[11px]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // PAGE 4: MY APPLICATIONS
  // --------------------------------------------------------------------------
  const renderMyApplications = () => {
    return (
      <div className="space-y-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            My Submitted Applications ({applications.length})
          </h2>
          <button
            onClick={() => onNavigate("stu_explore")}
            className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs"
          >
            Explore More Opportunities
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Opportunity & Company</th>
                <th className="py-3 px-4">Applied Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Next Step</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {applications.map((app) => (
                <tr key={app.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-slate-900 dark:text-white block">{app.opportunityTitle}</span>
                    <span className="text-[11px] text-slate-500">{app.companyName}</span>
                  </td>
                  <td className="py-3.5 px-4">{app.appliedDate}</td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="py-3.5 px-4">
                    {app.interviewDate ? (
                      <span className="text-blue-600 font-semibold">Interview: {app.interviewDate}</span>
                    ) : app.offerDeadline ? (
                      <span className="text-emerald-600 font-semibold">Offer Acceptance by {app.offerDeadline}</span>
                    ) : (
                      <span className="text-slate-400">Application Under Review</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => {
                        setSelectedApplication(app);
                        onNavigate("stu_app_details");
                      }}
                      className="px-2.5 py-1 font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-md"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // PAGE 5: APPLICATION DETAILS & OFFERS
  // --------------------------------------------------------------------------
  const renderApplicationDetails = () => {
    const app = selectedApplication || applications[0];

    return (
      <div className="space-y-6">
        <button
          onClick={() => onNavigate("stu_applications")}
          className="text-xs text-emerald-600 hover:underline font-semibold flex items-center space-x-1"
        >
          <span>← Back to My Applications</span>
        </button>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
            <div>
              <div className="flex items-center space-x-2">
                <StatusBadge status={app.status} />
                <span className="text-xs text-slate-400">Application #{app.id}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1.5">{app.opportunityTitle}</h2>
              <p className="text-xs text-slate-500">{app.companyName} • Applied on {app.appliedDate}</p>
            </div>
            {app.status === "OFFER_EXTENDED" && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const updated = applications.map((a) => (a.id === app.id ? { ...a, status: "ACTIVE_PLACEMENT" as const } : a));
                    setApplications(updated);
                    alert("Congratulations! Offer accepted. Placement workspace initialized.");
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs"
                >
                  Accept Formal Offer
                </button>
                <button
                  onClick={() => {
                    const updated = applications.map((a) => (a.id === app.id ? { ...a, status: "OFFER_DECLINED" as const } : a));
                    setApplications(updated);
                    alert("Offer declined.");
                  }}
                  className="px-3.5 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Decline
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6 text-xs">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60">
              <h4 className="font-bold text-slate-900 dark:text-white mb-2">Student Profile Submitted</h4>
              <p><strong>Name:</strong> {app.studentName}</p>
              <p><strong>Program:</strong> {app.studentProgram}</p>
              <p><strong>Semester:</strong> {app.studentSemester} (GPA: {app.studentGpa})</p>
              <p className="mt-2">
                <a href={app.resumeUrl} className="text-emerald-600 hover:underline font-semibold flex items-center space-x-1">
                  <FontAwesomeIcon icon={faDownload} />
                  <span>Download Submitted Resume</span>
                </a>
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60">
              <h4 className="font-bold text-slate-900 dark:text-white mb-2">Interview & Schedule</h4>
              {app.interviewDate ? (
                <>
                  <p><strong>Date & Time:</strong> {app.interviewDate}</p>
                  <p className="mt-1">
                    <a
                      href={app.interviewMeetingLink || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline font-semibold flex items-center space-x-1"
                    >
                      <FontAwesomeIcon icon={faExternalLinkAlt} />
                      <span>Join Interview Video Call</span>
                    </a>
                  </p>
                  {app.interviewNotes && (
                    <p className="mt-2 text-slate-500 italic">"{app.interviewNotes}"</p>
                  )}
                </>
              ) : (
                <p className="text-slate-400">No interview scheduled yet.</p>
              )}
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60">
              <h4 className="font-bold text-slate-900 dark:text-white mb-2">Formal Compensation</h4>
              {app.stipendOffered ? (
                <>
                  <p className="text-emerald-600 font-bold text-sm">{app.stipendOffered}</p>
                  {app.offerDeadline && (
                    <p className="text-slate-500 mt-1">Accept by: {app.offerDeadline}</p>
                  )}
                  {app.offerLetterUrl && (
                    <a href={app.offerLetterUrl} className="mt-2 text-emerald-600 hover:underline font-semibold block">
                      Download Official Offer Letter PDF
                    </a>
                  )}
                </>
              ) : (
                <p className="text-slate-400">Offer not yet extended.</p>
              )}
            </div>
          </div>

          <div className="mt-6 text-xs">
            <h4 className="font-bold text-slate-900 dark:text-white mb-2">Submitted Cover Letter</h4>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60 leading-relaxed text-slate-600 dark:text-slate-400">
              {app.coverLetter}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // PAGE 6: MY PLACEMENT & ONBOARDING
  // --------------------------------------------------------------------------
  const renderMyPlacement = () => {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
            <div>
              <div className="flex items-center space-x-2">
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  Active Placement #{MOCK_ACTIVE_PLACEMENT.id}
                </span>
                <span className="text-xs text-slate-400">
                  {MOCK_ACTIVE_PLACEMENT.startDate} to {MOCK_ACTIVE_PLACEMENT.endDate}
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1.5">
                {MOCK_ACTIVE_PLACEMENT.opportunityTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {MOCK_ACTIVE_PLACEMENT.companyName} • {MOCK_ACTIVE_PLACEMENT.role}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onNavigate("stu_attendance")}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs"
              >
                Log Attendance
              </button>
              <button
                onClick={() => onNavigate("stu_logbook")}
                className="px-3.5 py-2 border border-slate-200 dark:border-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Logbook Entries
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-5 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Placement Progress ({MOCK_ACTIVE_PLACEMENT.completedHours} of {MOCK_ACTIVE_PLACEMENT.totalRequiredHours} required hours)
              </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {MOCK_ACTIVE_PLACEMENT.progressPercentage}% Complete
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${MOCK_ACTIVE_PLACEMENT.progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Supervisor Information Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 text-xs">
            <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <FontAwesomeIcon icon={faBuilding} className="text-emerald-600" />
                <span>Industry Supervisor</span>
              </h4>
              <p className="mt-2 font-semibold text-slate-800 dark:text-slate-200">
                {MOCK_ACTIVE_PLACEMENT.industrySupervisor.name}
              </p>
              <p className="text-slate-500">{MOCK_ACTIVE_PLACEMENT.industrySupervisor.designation}</p>
              <p className="text-slate-500 mt-1">Email: {MOCK_ACTIVE_PLACEMENT.industrySupervisor.email}</p>
              <p className="text-slate-500">Phone: {MOCK_ACTIVE_PLACEMENT.industrySupervisor.phone}</p>
            </div>

            <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <FontAwesomeIcon icon={faUserGraduate} className="text-blue-600" />
                <span>Faculty Academic Supervisor</span>
              </h4>
              <p className="mt-2 font-semibold text-slate-800 dark:text-slate-200">
                {MOCK_ACTIVE_PLACEMENT.facultySupervisor.name}
              </p>
              <p className="text-slate-500">{MOCK_ACTIVE_PLACEMENT.facultySupervisor.department}</p>
              <p className="text-slate-500 mt-1">Email: {MOCK_ACTIVE_PLACEMENT.facultySupervisor.email}</p>
              <p className="text-emerald-600 font-semibold mt-1">Degree Credits: {MOCK_ACTIVE_PLACEMENT.credits} Credits</p>
            </div>
          </div>
        </div>

        {/* Onboarding Checklist Section */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Internship Onboarding Checklist
              </h3>
              <p className="text-xs text-slate-500">
                Required institutional & company orientation milestones
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full">
              {onboardingTasks.filter((t) => t.completed).length} of {onboardingTasks.length} Completed
            </span>
          </div>

          <div className="space-y-2.5">
            {onboardingTasks.map((t) => (
              <div
                key={t.id}
                onClick={() => {
                  const updated = onboardingTasks.map((task) =>
                    task.id === t.id ? { ...task, completed: !task.completed } : task
                  );
                  setOnboardingTasks(updated);
                }}
                className={`p-3.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                  t.completed
                    ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-slate-800 dark:text-slate-200"
                    : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center text-xs ${
                      t.completed ? "bg-emerald-600 text-white" : "border border-slate-300 dark:border-slate-600"
                    }`}
                  >
                    {t.completed && <FontAwesomeIcon icon={faCheck} />}
                  </div>
                  <span className={t.completed ? "line-through opacity-80" : "font-medium"}>
                    {t.title}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  {t.completed ? "Verified" : "Pending action"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // PAGE 7: WEEKLY LOGBOOK
  // --------------------------------------------------------------------------
  const renderLogbook = () => {
    return (
      <div className="space-y-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Weekly Internship Logbook
            </h2>
            <p className="text-xs text-slate-500">
              Submit your weekly activities for supervisor and faculty approval
            </p>
          </div>
          <button
            onClick={() => setShowNewLogModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center space-x-1.5"
          >
            <FontAwesomeIcon icon={faPlus} />
            <span>New Weekly Log</span>
          </button>
        </div>

        <div className="space-y-4">
          {logbooks.map((log) => (
            <div
              key={log.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center space-x-3">
                  <span className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center text-xs">
                    W{log.weekNumber}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Week {log.weekNumber} ({log.dateRange})
                    </h4>
                    <p className="text-[11px] text-slate-400">Submitted on {log.submittedAt}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {log.hoursWorked} Hours
                  </span>
                  <StatusBadge status={log.status} />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <strong className="text-slate-800 dark:text-slate-200 block mb-1">Key Completed Activities:</strong>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                    {log.tasksCompleted}
                  </p>
                </div>
                <div>
                  <strong className="text-slate-800 dark:text-slate-200 block mb-1">Learnings & Challenges:</strong>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                    {log.keyLearnings} {log.challengesFaced && `Challenges: ${log.challengesFaced}`}
                  </p>
                </div>
              </div>

              {log.supervisorFeedback && (
                <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Supervisor Feedback:
                  </span>{" "}
                  <span className="text-slate-600 dark:text-slate-400 italic">
                    "{log.supervisorFeedback}"
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // PAGE 8: ATTENDANCE & TIMESHEET
  // --------------------------------------------------------------------------
  const renderAttendance = () => {
    return (
      <div className="space-y-6">
        {/* Interactive Clock In/Out Box */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  isClockedIn ? "bg-emerald-500 animate-pulse" : "bg-slate-300 dark:bg-slate-600"
                }`}
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isClockedIn ? "Currently Clocked In" : "Not Clocked In Today"}
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
              Daily Attendance & Time Tracker
            </h3>
            <p className="text-xs text-slate-500">
              Verified timesheet records are submitted for university internship credit auditing.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="text"
              placeholder="Optional check-in notes..."
              value={clockInNotes}
              onChange={(e) => setClockInNotes(e.target.value)}
              className="text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <button
              onClick={handleToggleClockIn}
              className={`px-5 py-2.5 text-xs font-bold rounded-lg text-white shadow-xs transition-colors ${
                isClockedIn ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {isClockedIn ? "Clock Out Now" : "Clock In (09:00 AM)"}
            </button>
          </div>
        </div>

        {/* Timesheet Records Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Recent Timesheet Records
            </h4>
            <span className="text-xs font-semibold text-emerald-600">
              Total Approved: 216.0 Hours
            </span>
          </div>

          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Check-In</th>
                <th className="py-3 px-4">Check-Out</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Supervisor Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {attendance.map((att) => (
                <tr key={att.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{att.date}</td>
                  <td className="py-3 px-4">{att.checkInTime}</td>
                  <td className="py-3 px-4">{att.checkOutTime}</td>
                  <td className="py-3 px-4">{att.totalHours} hrs</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={att.status} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    {att.approvedBySupervisor ? (
                      <span className="text-emerald-600 font-semibold flex items-center justify-end space-x-1">
                        <FontAwesomeIcon icon={faCheck} className="text-xs" />
                        <span>Signed Off</span>
                      </span>
                    ) : (
                      <span className="text-amber-500 font-semibold">Pending Sign-off</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // PAGE 9: INDUSTRY PROJECTS
  // --------------------------------------------------------------------------
  const renderIndustryProjects = () => {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-2xl p-6 shadow-sm">
          <span className="text-[10px] font-bold bg-white/20 uppercase tracking-widest px-2.5 py-0.5 rounded-full">
            Industry Projects
          </span>
          <h2 className="text-xl font-bold mt-2">Structured Industry & Mentored Challenges</h2>
          <p className="text-xs text-amber-100 mt-1 max-w-xl">
            Real client problem briefs sponsored by partner enterprises and international innovation hubs. Complete deliverables with faculty and company mentor guidance.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {MOCK_INDUSTRY_PROJECTS.map((proj) => (
            <div
              key={proj.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-0.5 rounded-full">
                    {proj.industry}
                  </span>
                  <StatusBadge status={proj.status} />
                </div>

                <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2.5">
                  {proj.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1">Sponsor: {proj.sponsorCompany}</p>

                <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                  {proj.clientBrief}
                </p>

                <div className="mt-3.5 space-y-1.5 text-xs">
                  <strong className="text-slate-800 dark:text-slate-200 block text-[11px] uppercase tracking-wider">
                    Core Deliverables:
                  </strong>
                  <ul className="list-disc pl-4 space-y-1 text-slate-500">
                    {proj.deliverables.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {proj.durationWeeks} Weeks • Team of {proj.teamSize}
                  </span>
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 block font-semibold">
                    {proj.stipendOrPrize}
                  </span>
                </div>
                <button
                  onClick={() => alert(`Enrolled in project brief: ${proj.title}`)}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-xs"
                >
                  Join Project
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // PAGE 10: DOCUMENTS, EVALUATIONS & PORTFOLIO
  // --------------------------------------------------------------------------
  const renderDocumentsAndEvaluations = () => {
    return (
      <div className="space-y-6">
        {/* Evaluations Rubric */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">
            Official Midterm & Final Evaluation Rubric
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MOCK_EVALUATIONS.map((ev) => (
              <div
                key={ev.id}
                className="p-4 border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 rounded-xl text-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white">{ev.evaluatorName}</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                    Grade: {ev.gradeAwarded}
                  </span>
                </div>
                <div className="space-y-1.5 text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Technical Competency:</span>
                    <strong>{ev.technicalCompetency} / 5.0</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Problem Solving & Independence:</span>
                    <strong>{ev.problemSolving} / 5.0</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Punctuality & Reliability:</span>
                    <strong>{ev.punctualityReliability} / 5.0</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Team Collaboration:</span>
                    <strong>{ev.initiativeTeamwork} / 5.0</strong>
                  </div>
                </div>
                <p className="text-slate-600 dark:text-slate-300 italic border-t border-slate-200 dark:border-slate-700 pt-2">
                  "{ev.writtenFeedback}"
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Documents Repository */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
            Placement Verified Documents & Agreements
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {MOCK_DOCUMENTS.map((doc) => (
              <div key={doc.id} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                    <FontAwesomeIcon icon={faFolderOpen} />
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-900 dark:text-white">{doc.title}</h5>
                    <p className="text-[11px] text-slate-400">
                      {doc.fileName} • {doc.fileSize} • Uploaded {doc.uploadDate}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => alert(`Downloading verified document: ${doc.fileName}`)}
                  className="px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg flex items-center space-x-1"
                >
                  <FontAwesomeIcon icon={faDownload} />
                  <span>Download</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // PAGE 11: PROFESSIONAL PORTFOLIO & SKILLS
  // --------------------------------------------------------------------------
  const renderPortfolioAndSkills = () => {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Verified Skills & Industry Competency Matrix
              </h3>
              <p className="text-xs text-slate-500">
                Endorsed through real internship milestones and simulated workplace pull requests
              </p>
            </div>
            <button
              onClick={() => alert("Portfolio link copied to clipboard: https://collegeos.edu/portfolio/aarav-sharma-2026")}
              className="px-3.5 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg shadow-xs hover:bg-indigo-700"
            >
              Share Public Portfolio
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MOCK_COMPETENCIES.map((comp, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-slate-900 dark:text-white">{comp.skill}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{comp.level}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden mb-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full"
                    style={{ width: `${comp.level}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Category: {comp.category}</span>
                  <span>{comp.endorsementCount} Peer & Mentor Endorsements</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Switch according to active student sub-page
  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      {activePage === "stu_dashboard" && renderDashboard()}
      {activePage === "stu_explore" && renderExploreInternships()}
      {activePage === "stu_details" && renderInternshipDetails()}
      {activePage === "stu_applications" && renderMyApplications()}
      {(activePage === "stu_app_details" || activePage === "stu_interviews") && renderApplicationDetails()}
      {(activePage === "stu_placement" || activePage === "stu_onboarding") && renderMyPlacement()}
      {activePage === "stu_logbook" && renderLogbook()}
      {activePage === "stu_attendance" && renderAttendance()}
      {activePage === "stu_industry_projects" && renderIndustryProjects()}
      {(activePage === "stu_documents" || activePage === "stu_evaluations" || activePage === "stu_reports") &&
        renderDocumentsAndEvaluations()}
      {(activePage === "stu_portfolio" || activePage === "stu_career_opps" || activePage === "stu_settings") &&
        renderPortfolioAndSkills()}

      {/* Fallback for virtual company views when student browses via Student sidebar */}
      {(activePage === "stu_virtual_workplace" ||
        activePage === "stu_virtual_companies" ||
        activePage === "stu_simulation_apps") && (
        <div className="space-y-6">
          <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-6">
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-600 text-white uppercase tracking-wider">
              Simulated Professional Practice
            </span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-2">
              Virtual Workplace Organizations
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
              Immerse yourself into enterprise SaaS software engineering, product management, or design before entering physical workplaces.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {MOCK_VIRTUAL_COMPANIES.map((vc) => (
              <div
                key={vc.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full uppercase">
                    {vc.sector.replace(/_/g, " ")}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2">{vc.name}</h3>
                  <p className="text-xs text-slate-500 italic mt-0.5">{vc.brandTagline}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">{vc.description}</p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {vc.technologies.map((t, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md font-mono"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Difficulty: {vc.difficulty}</span>
                  <button
                    onClick={() => onEnterVirtualWorkspace?.(vc.id)}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs"
                  >
                    Enter Virtual Workplace
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Apply for Internship */}
      <ModalWrapper
        isOpen={showApplyModal}
        onClose={() => setShowApplyModal(false)}
        title={`Apply for ${selectedOpportunity?.title || "Internship"}`}
      >
        <form onSubmit={handleApplySubmit} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Company & Role
            </label>
            <input
              type="text"
              readOnly
              value={`${selectedOpportunity?.companyName} - ${selectedOpportunity?.title}`}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Student Information
            </label>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] space-y-1">
              <p><strong>Name:</strong> Aarav Sharma (STU-2023-0491)</p>
              <p><strong>Department:</strong> B.Sc. Computer Science & Software Engineering (Sem 7)</p>
              <p><strong>Current CGPA:</strong> 3.86 / 4.00</p>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Cover Letter / Statement of Motivation *
            </label>
            <textarea
              rows={4}
              required
              placeholder="Outline your interest, related academic projects, and how your skills match the requirements..."
              value={applyCoverLetter}
              onChange={(e) => setApplyCoverLetter(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-[11px] text-emerald-800 dark:text-emerald-300">
            ✓ Your verified university transcript and default resume (aarav_sharma_cv.pdf) will be bundled automatically.
          </div>

          {applySuccessMsg && (
            <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-lg font-semibold text-center">
              {applySuccessMsg}
            </div>
          )}

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowApplyModal(false)}
              className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs"
            >
              Submit Application
            </button>
          </div>
        </form>
      </ModalWrapper>

      {/* Modal: New Weekly Logbook */}
      <ModalWrapper
        isOpen={showNewLogModal}
        onClose={() => setShowNewLogModal(false)}
        title="Submit Weekly Internship Log"
      >
        <form onSubmit={handleNewLogbookSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1 text-slate-700 dark:text-slate-300">
                Week Number
              </label>
              <input
                type="number"
                min={1}
                max={26}
                value={newLogWeek}
                onChange={(e) => setNewLogWeek(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1 text-slate-700 dark:text-slate-300">
                Total Hours Worked
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={newLogHours}
                onChange={(e) => setNewLogHours(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-1 text-slate-700 dark:text-slate-300">
              Tasks & Activities Completed *
            </label>
            <textarea
              rows={3}
              required
              placeholder="Detail your engineering contributions, pull requests merged, or tickets resolved..."
              value={newLogTasks}
              onChange={(e) => setNewLogTasks(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="font-semibold block mb-1 text-slate-700 dark:text-slate-300">
              Key Technical Learnings & Challenges
            </label>
            <textarea
              rows={2}
              placeholder="What new concepts did you discover? How did you resolve hurdles?"
              value={newLogLearnings}
              onChange={(e) => setNewLogLearnings(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowNewLogModal(false)}
              className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs"
            >
              Submit Weekly Log
            </button>
          </div>
        </form>
      </ModalWrapper>
    </div>
  );
};
