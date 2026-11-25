import React, { useState, useEffect } from "react";
import * as internshipApi from "../../../../services/internshipApi";
import {
  InternshipOpportunity,
  ApplicationRecord,
  LogbookEntry,
  EvaluationRubric,
  Company,
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
  faBuilding,
  faBriefcase,
  faUsers,
  faClock,
  faPlus,
  faCheck,
  faTimes,
  faFilter,
  faSearch,
  faStar,
  faFileSignature,
  faCalendarCheck,
  faEnvelope,
  faPaperPlane,
  faShieldHalved,
  faChartPie,
  faExternalLinkAlt,
  faUserGraduate,
  faDownload,
  faGear,
  faEdit,
} from "@fortawesome/free-solid-svg-icons";

interface EmployerPortalProps {
  activePage: string;
  onNavigate: (pageId: string) => void;
  searchQuery: string;
}

export const EmployerPortal: React.FC<EmployerPortalProps> = ({
  activePage,
  onNavigate,
  searchQuery,
}) => {
  const company = { id: "employer-1", name: "Apex Global Cloud Solutions" };

  // Interactive state
  const [opportunities, setOpportunities] = useState<InternshipOpportunity[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        if (!cancelled) setError(e?.message || "Failed to load employer data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationRecord | null>(null);
  const [selectedIntern, setSelectedIntern] = useState<ApplicationRecord | null>(null);

  // Create Opportunity Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<InternshipOpportunity | null>(null);
  const [newOppTitle, setNewOppTitle] = useState("");
  const [newOppDept, setNewOppDept] = useState("Core Engineering");
  const [newOppMode, setNewOppMode] = useState<"HYBRID" | "REMOTE" | "ON_SITE">("HYBRID");
  const [newOppStipend, setNewOppStipend] = useState("NPR 35,000 / month");
  const [newOppDuration, setNewOppDuration] = useState(6);
  const [newOppSlots, setNewOppSlots] = useState(2);
  const [newOppDesc, setNewOppDesc] = useState("");
  const [newOppSkills, setNewOppSkills] = useState("TypeScript, React, Node.js");

  // Logbook Approval State
  const [logbooks, setLogbooks] = useState<LogbookEntry[]>([]);
  const [selectedLogbook, setSelectedLogbook] = useState<LogbookEntry | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");

  // Evaluation Form State
  const [evalTech, setEvalTech] = useState(5);
  const [evalProb, setEvalProb] = useState(5);
  const [evalTeam, setEvalTeam] = useState(4);
  const [evalPunct, setEvalPunct] = useState(5);
  const [evalNotes, setEvalNotes] = useState("");
  const [evalSuccess, setEvalSuccess] = useState(false);

  // Messages State
  const [messages, setMessages] = useState([
    { id: 1, sender: "Aarav Sharma (Intern)", text: "Good morning Rohan! Pushed PR #342 fixing the refresh token loop.", time: "10:14 AM", isMe: false },
    { id: 2, sender: "You (Rohan Manandhar)", text: "Looks great, reviewing now before staging deployment.", time: "10:30 AM", isMe: true },
    { id: 3, sender: "Prof. Dr. Suresh Dhakal", text: "Midterm university audit is scheduled for next Tuesday. Please prepare the logbook endorsement.", time: "11:00 AM", isMe: false },
  ]);
  const [replyText, setReplyText] = useState("");

  // Handle Create Opportunity
  const handleCreateOpportunity = (e: React.FormEvent) => {
    e.preventDefault();
    const newListing: InternshipOpportunity = {
      id: `opp-${Date.now()}`,
      companyId: company.id,
      companyName: company.name,
      title: newOppTitle,
      department: newOppDept,
      workMode: newOppMode,
      employmentType: "FULL_TIME",
      location: company.location,
      stipendRange: newOppStipend,
      durationMonths: Number(newOppDuration),
      availablePositions: Number(newOppSlots),
      applicantsCount: 0,
      status: "OPEN",
      deadline: "2026-12-31",
      description: newOppDesc,
      responsibilities: ["Develop enterprise modules", "Write automated tests"],
      requirements: ["Enrolled in Computer Science or Software Engineering"],
      skillsRequired: newOppSkills.split(",").map((s) => s.trim()),
      postedDate: new Date().toISOString().slice(0, 10),
      isVerifiedEmployer: true,
    };
    setOpportunities([newListing, ...opportunities]);
    setShowCreateModal(false);
    setNewOppTitle("");
    setNewOppDesc("");
  };

  // Status transitions for candidate applications
  const handleUpdateAppStatus = (appId: string, newStatus: ApplicationRecord["status"]) => {
    const updated = applications.map((a) => (a.id === appId ? { ...a, status: newStatus } : a));
    setApplications(updated);
    if (selectedApplication?.id === appId) {
      setSelectedApplication({ ...selectedApplication, status: newStatus });
    }
  };

  // Sign off logbook
  const handleSignoffLogbook = (logId: string) => {
    const updated = logbooks.map((l) =>
      l.id === logId
        ? {
            ...l,
            status: "APPROVED" as const,
            supervisorFeedback: feedbackComment || "Approved. Strong technical contributions.",
          }
        : l
    );
    setLogbooks(updated);
    setSelectedLogbook(null);
    setFeedbackComment("");
  };

  // --------------------------------------------------------------------------
  // PAGE 1: EMPLOYER DASHBOARD
  // --------------------------------------------------------------------------
  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="bg-emerald-500 text-white px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center space-x-1">
              <FontAwesomeIcon icon={faShieldHalved} className="text-xs" />
              <span>Verified Enterprise Partner</span>
            </span>
            <span className="text-xs text-slate-400">Institutional MOU Active</span>
          </div>
          <h2 className="text-xl font-bold mt-2">{company.name}</h2>
          <p className="text-xs text-slate-300 mt-1">
            {company.industry} • {company.location} • Portal: Subash Adhikari (HR Talent Lead)
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center space-x-1.5"
          >
            <FontAwesomeIcon icon={faPlus} />
            <span>Post Opportunity</span>
          </button>
          <button
            onClick={() => onNavigate("emp_applications")}
            className="px-3.5 py-2 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-800"
          >
            Review Candidates
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Placed Interns"
          value="4 Interns"
          subtitle="Cohort Average Progress: 48%"
          icon={faUsers}
          color="emerald"
        />
        <MetricCard
          title="Active Opportunities"
          value={opportunities.length}
          subtitle="4 Open Listings"
          icon={faBriefcase}
          color="blue"
        />
        <MetricCard
          title="Total Applications"
          value={applications.length}
          subtitle="2 Shortlisted, 1 Offer Extended"
          icon={faFileSignature}
          color="indigo"
        />
        <MetricCard
          title="Pending Logbooks"
          value={logbooks.filter((l) => l.status === "SUBMITTED").length}
          subtitle="Sign-off Required this week"
          icon={faClock}
          color="amber"
        />
      </div>

      {/* Candidate Pipeline Summary & Interns Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <FontAwesomeIcon icon={faUsers} className="text-emerald-600" />
              <span>Active Intern Cohort Roster</span>
            </h3>
            <button
              onClick={() => onNavigate("emp_interns")}
              className="text-xs text-emerald-600 hover:underline font-semibold"
            >
              Manage Roster
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3">Intern</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Completed Hours</th>
                  <th className="py-2.5 px-3">Last Logbook</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                    Aarav Sharma
                    <span className="block text-[11px] text-slate-400">STU-2023-0491</span>
                  </td>
                  <td className="py-3 px-3">Cloud Engineering</td>
                  <td className="py-3 px-3">216 / 480 hrs (45%)</td>
                  <td className="py-3 px-3">
                    <span className="text-emerald-600 font-semibold">Week 5 (Approved)</span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => onNavigate("emp_interns")}
                      className="text-xs font-semibold text-emerald-600 hover:underline"
                    >
                      Dossier
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Recruitment Actions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Recruitment Actions
          </h3>
          <div className="space-y-2.5 text-xs">
            <button
              onClick={() => onNavigate("emp_shortlisting")}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 flex items-center justify-between text-left"
            >
              <div>
                <strong className="text-slate-900 dark:text-white block">Shortlisted Candidates</strong>
                <span className="text-slate-400 text-[11px]">2 candidates awaiting interview call</span>
              </div>
              <span className="text-emerald-600 font-bold">Review →</span>
            </button>
            <button
              onClick={() => onNavigate("emp_attendance")}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 flex items-center justify-between text-left"
            >
              <div>
                <strong className="text-slate-900 dark:text-white block">Timesheet Sign-Offs</strong>
                <span className="text-slate-400 text-[11px]">1 week pending approval</span>
              </div>
              <span className="text-amber-500 font-bold">Sign →</span>
            </button>
            <button
              onClick={() => onNavigate("emp_evaluations")}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 flex items-center justify-between text-left"
            >
              <div>
                <strong className="text-slate-900 dark:text-white block">Midterm Rubric Evaluation</strong>
                <span className="text-slate-400 text-[11px]">University assessment due in 5 days</span>
              </div>
              <span className="text-indigo-600 font-bold">Grade →</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 2: INTERNSHIP OPPORTUNITIES & CREATE/EDIT
  // --------------------------------------------------------------------------
  const renderOpportunities = () => (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Active Internship Listings ({opportunities.length})
          </h2>
          <p className="text-xs text-slate-500">
            Published opportunities visible to enrolled CollegeOS university students
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center space-x-1.5"
        >
          <FontAwesomeIcon icon={faPlus} />
          <span>New Opportunity</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {opportunities.map((opp) => (
          <div
            key={opp.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full uppercase">
                    {opp.department}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2">
                    {opp.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mode: {opp.workMode} • Duration: {opp.durationMonths} Months
                  </p>
                </div>
                <StatusBadge status={opp.status} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg text-xs text-center">
                <div>
                  <span className="text-slate-400 text-[10px] block">Positions</span>
                  <strong className="text-slate-800 dark:text-slate-200">{opp.availablePositions}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Applicants</span>
                  <strong className="text-emerald-600">{opp.applicantsCount}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Deadline</span>
                  <strong className="text-slate-800 dark:text-slate-200">{opp.deadline}</strong>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900 dark:text-white">{opp.stipendRange}</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setEditingOpportunity(opp);
                    setNewOppTitle(opp.title);
                    setNewOppDept(opp.department);
                    setNewOppStipend(opp.stipendRange);
                    setNewOppDuration(opp.durationMonths);
                    setNewOppSlots(opp.availablePositions);
                    setShowCreateModal(true);
                  }}
                  className="px-2.5 py-1 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <FontAwesomeIcon icon={faEdit} className="mr-1" /> Edit
                </button>
                <button
                  onClick={() => onNavigate("emp_applications")}
                  className="px-3 py-1 bg-emerald-600 text-white rounded-md font-semibold hover:bg-emerald-700"
                >
                  View ATS
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 3: APPLICANT TRACKING SYSTEM (ATS) & CANDIDATE DETAILS
  // --------------------------------------------------------------------------
  const renderApplications = () => (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Applicant Tracking System (ATS)
          </h2>
          <p className="text-xs text-slate-500">
            Review university applicant resumes, schedule technical interviews, and issue formal offers
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-500">Filter Stage:</span>
          <select className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 text-slate-700 dark:text-slate-200">
            <option>All Stages ({applications.length})</option>
            <option>Under Review</option>
            <option>Shortlisted</option>
            <option>Interview Scheduled</option>
            <option>Offer Extended</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200">
            <tr>
              <th className="py-3 px-4">Candidate</th>
              <th className="py-3 px-4">Applied Role</th>
              <th className="py-3 px-4">GPA / Semester</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Actions</th>
              <th className="py-3 px-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {applications.map((app) => (
              <tr key={app.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                <td className="py-3.5 px-4">
                  <span className="font-bold text-slate-900 dark:text-white block">{app.studentName}</span>
                  <span className="text-[11px] text-slate-400">{app.studentEmail}</span>
                </td>
                <td className="py-3.5 px-4">{app.opportunityTitle}</td>
                <td className="py-3.5 px-4">
                  <span className="font-semibold text-slate-900 dark:text-white">CGPA {app.studentGpa}</span>
                  <span className="text-[11px] text-slate-400 block">Sem {app.studentSemester}</span>
                </td>
                <td className="py-3.5 px-4">
                  <StatusBadge status={app.status} />
                </td>
                <td className="py-3.5 px-4">
                  <div className="flex items-center space-x-1.5">
                    {app.status === "SUBMITTED" || app.status === "UNDER_REVIEW" ? (
                      <button
                        onClick={() => handleUpdateAppStatus(app.id, "SHORTLISTED")}
                        className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold text-[11px] hover:bg-blue-100"
                      >
                        Shortlist
                      </button>
                    ) : app.status === "SHORTLISTED" ? (
                      <button
                        onClick={() => handleUpdateAppStatus(app.id, "INTERVIEW_SCHEDULED")}
                        className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold text-[11px] hover:bg-purple-100"
                      >
                        Schedule Interview
                      </button>
                    ) : app.status === "INTERVIEW_SCHEDULED" ? (
                      <button
                        onClick={() => handleUpdateAppStatus(app.id, "OFFER_EXTENDED")}
                        className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold text-[11px] hover:bg-emerald-100"
                      >
                        Extend Offer
                      </button>
                    ) : (
                      <span className="text-slate-400 text-[11px]">Placed</span>
                    )}
                  </div>
                </td>
                <td className="py-3.5 px-4 text-right">
                  <button
                    onClick={() => setSelectedApplication(app)}
                    className="font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    View Dossier
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Candidate Dossier Drawer */}
      <DrawerWrapper
        isOpen={Boolean(selectedApplication)}
        onClose={() => setSelectedApplication(null)}
        title={selectedApplication?.studentName || "Candidate Details"}
        subtitle={`${selectedApplication?.studentProgram} • GPA ${selectedApplication?.studentGpa}`}
      >
        {selectedApplication && (
          <div className="space-y-5 text-xs text-slate-700 dark:text-slate-300">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-slate-400 block text-[11px]">Applied Opportunity</span>
                <strong className="text-sm text-slate-900 dark:text-white">
                  {selectedApplication.opportunityTitle}
                </strong>
              </div>
              <StatusBadge status={selectedApplication.status} />
            </div>

            <div>
              <h5 className="font-bold text-slate-900 dark:text-white mb-1">Statement of Motivation</h5>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700/60 leading-relaxed text-slate-600 dark:text-slate-400">
                {selectedApplication.coverLetter}
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <h6 className="font-semibold text-slate-900 dark:text-white">Candidate Resume</h6>
                <p className="text-[11px] text-slate-400">Official verified institutional CV</p>
              </div>
              <a
                href={selectedApplication.resumeUrl}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md flex items-center space-x-1"
              >
                <FontAwesomeIcon icon={faDownload} />
                <span>Download CV</span>
              </a>
            </div>

            {/* Quick Status Change Actions */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-2">
              <button
                onClick={() => handleUpdateAppStatus(selectedApplication.id, "REJECTED")}
                className="px-3.5 py-1.5 border border-rose-300 text-rose-700 rounded-lg font-semibold hover:bg-rose-50"
              >
                Reject Candidate
              </button>
              <button
                onClick={() => handleUpdateAppStatus(selectedApplication.id, "OFFER_EXTENDED")}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs"
              >
                Issue Formal Offer
              </button>
            </div>
          </div>
        )}
      </DrawerWrapper>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 4: LOGBOOK SIGN-OFF & ATTENDANCE APPROVAL
  // --------------------------------------------------------------------------
  const renderLogbookApproval = () => (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Intern Weekly Logbook Endorsements
          </h2>
          <p className="text-xs text-slate-500">
            Review completed activities, sign off on weekly hours, and provide formative mentorship feedback
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {logbooks.map((log) => (
          <div
            key={log.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  {log.studentName} — Week {log.weekNumber} ({log.dateRange})
                </h4>
                <p className="text-[11px] text-slate-400">Logged Hours: {log.hoursWorked} hrs</p>
              </div>
              <StatusBadge status={log.status} />
            </div>

            <div className="mt-3 text-xs text-slate-600 dark:text-slate-400 space-y-2">
              <p><strong>Submitted Activities:</strong> {log.tasksCompleted}</p>
              <p><strong>Learnings & Hurdles:</strong> {log.keyLearnings}</p>
            </div>

            {log.status === "SUBMITTED" ? (
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <input
                  type="text"
                  placeholder="Add optional supervisor feedback..."
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  className="text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md flex-1 max-w-md mr-3"
                />
                <button
                  onClick={() => handleSignoffLogbook(log.id)}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center space-x-1"
                >
                  <FontAwesomeIcon icon={faCheck} />
                  <span>Sign & Endorse Logbook</span>
                </button>
              </div>
            ) : (
              <div className="mt-3 pt-2 text-[11px] text-emerald-600 font-semibold border-t border-slate-100 dark:border-slate-800">
                ✓ Approved: "{log.supervisorFeedback}"
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 5: PERFORMANCE EVALUATIONS
  // --------------------------------------------------------------------------
  const renderEvaluations = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
          Official Industry Supervisor Evaluation Form
        </h3>
        <p className="text-xs text-slate-500 mb-5">
          Submit official grading rubric to the university faculty supervisor for Aarav Sharma (Apex Global Cloud Solutions)
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setEvalSuccess(true);
            setTimeout(() => setEvalSuccess(false), 2000);
          }}
          className="space-y-4 text-xs"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold block mb-1">Technical Competency & Code Quality (1-5)</label>
              <select
                value={evalTech}
                onChange={(e) => setEvalTech(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value={5}>5 - Exceptional (Senior Junior parity)</option>
                <option value={4}>4 - Exceeds Expectations</option>
                <option value={3}>3 - Meets Industry Standards</option>
                <option value={2}>2 - Needs Guidance</option>
                <option value={1}>1 - Unsatisfactory</option>
              </select>
            </div>

            <div>
              <label className="font-semibold block mb-1">Problem Solving & Independent Research (1-5)</label>
              <select
                value={evalProb}
                onChange={(e) => setEvalProb(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value={5}>5 - Highly Independent & Analytical</option>
                <option value={4}>4 - Proactive</option>
                <option value={3}>3 - Standard</option>
              </select>
            </div>

            <div>
              <label className="font-semibold block mb-1">Team Collaboration & Communication (1-5)</label>
              <select
                value={evalTeam}
                onChange={(e) => setEvalTeam(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value={5}>5 - Exemplary Team Player</option>
                <option value={4}>4 - Constructive</option>
                <option value={3}>3 - Adequate</option>
              </select>
            </div>

            <div>
              <label className="font-semibold block mb-1">Punctuality, Reliability & Ethics (1-5)</label>
              <select
                value={evalPunct}
                onChange={(e) => setEvalPunct(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value={5}>5 - 100% Reliable & Punctual</option>
                <option value={4}>4 - Dependable</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-1">Comprehensive Formative Feedback *</label>
            <textarea
              rows={3}
              required
              placeholder="Highlight strengths, specific accomplishments, and areas for professional development..."
              value={evalNotes}
              onChange={(e) => setEvalNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
          </div>

          {evalSuccess && (
            <div className="p-3 bg-emerald-100 text-emerald-800 rounded-lg font-semibold text-center">
              ✓ Formal Evaluation successfully submitted and transmitted to Faculty Dean Office!
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs"
            >
              Submit Official Grade to University
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // PAGE 6: DIRECT MESSAGES
  // --------------------------------------------------------------------------
  const renderMessages = () => (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs flex flex-col h-[560px]">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
          Supervisory Chat & Coordinator Channel
        </h3>
        <span className="text-[11px] text-emerald-600 font-semibold">● 3 Members Active</span>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col max-w-md ${m.isMe ? "ml-auto items-end" : "mr-auto items-start"}`}
          >
            <span className="text-[10px] text-slate-400 mb-0.5">{m.sender} • {m.time}</span>
            <div
              className={`p-3 rounded-xl text-xs ${
                m.isMe
                  ? "bg-emerald-600 text-white rounded-br-none"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!replyText.trim()) return;
          setMessages([
            ...messages,
            { id: Date.now(), sender: "You (Employer)", text: replyText, time: "Just now", isMe: true },
          ]);
          setReplyText("");
        }}
        className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center space-x-2"
      >
        <input
          type="text"
          placeholder="Type message to intern or faculty supervisor..."
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs"
        >
          Send
        </button>
      </form>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      {activePage === "emp_dashboard" && renderDashboard()}
      {(activePage === "emp_opportunities" || activePage === "emp_create_opp") && renderOpportunities()}
      {(activePage === "emp_applications" || activePage === "emp_shortlisting" || activePage === "emp_interviews" || activePage === "emp_offers" || activePage === "emp_interns") &&
        renderApplications()}
      {activePage === "emp_attendance" && renderLogbookApproval()}
      {activePage === "emp_evaluations" && renderEvaluations()}
      {activePage === "emp_messages" && renderMessages()}

      {/* Fallback for profile / verification / settings / analytics */}
      {(activePage === "emp_profile" ||
        activePage === "emp_verification" ||
        activePage === "emp_analytics" ||
        activePage === "emp_settings" ||
        activePage === "emp_documents" ||
        activePage === "emp_tasks") && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
              <FontAwesomeIcon icon={faBuilding} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white capitalize">
                {activePage.replace("emp_", "").replace(/_/g, " ")} Management
              </h3>
              <p className="text-xs text-slate-500">Corporate verification status: Verified Partner</p>
            </div>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs space-y-2 border border-slate-200 dark:border-slate-700">
            <p><strong>Company Registration:</strong> Reg # 148902/079/080 (Verified)</p>
            <p><strong>Institutional MOU:</strong> Signed with Techspire College on 2026-08-15</p>
            <p><strong>Corporate Coordinator:</strong> Dr. Ananya Upadhyay (ananya.u@apexcloud.example.com)</p>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Opportunity */}
      <ModalWrapper
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingOpportunity(null);
        }}
        title={editingOpportunity ? "Edit Internship Opportunity" : "Create New Internship Opportunity"}
      >
        <form onSubmit={handleCreateOpportunity} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold block mb-1">Opportunity Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Software Engineering Intern - Cloud"
              value={newOppTitle}
              onChange={(e) => setNewOppTitle(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">Department</label>
              <input
                type="text"
                value={newOppDept}
                onChange={(e) => setNewOppDept(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Work Mode</label>
              <select
                value={newOppMode}
                onChange={(e) => setNewOppMode(e.target.value as any)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="HYBRID">Hybrid</option>
                <option value="REMOTE">Remote</option>
                <option value="ON_SITE">On-Site</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-semibold block mb-1">Stipend</label>
              <input
                type="text"
                value={newOppStipend}
                onChange={(e) => setNewOppStipend(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Duration (Months)</label>
              <input
                type="number"
                min={1}
                max={12}
                value={newOppDuration}
                onChange={(e) => setNewOppDuration(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Open Slots</label>
              <input
                type="number"
                min={1}
                max={50}
                value={newOppSlots}
                onChange={(e) => setNewOppSlots(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-1">Role Description *</label>
            <textarea
              rows={3}
              required
              placeholder="Outline role responsibilities, tech stack, and mentoring details..."
              value={newOppDesc}
              onChange={(e) => setNewOppDesc(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs"
            >
              Publish Listing
            </button>
          </div>
        </form>
      </ModalWrapper>
    </div>
  );
};
