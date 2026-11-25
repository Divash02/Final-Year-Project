import React from "react";
import { PortalRole, ExperienceArea } from "../types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGauge,
  faCompass,
  faFileSignature,
  faCalendarCheck,
  faBuildingUser,
  faClipboardCheck,
  faBookOpen,
  faClock,
  faHandshake,
  faFolderOpen,
  faFileLines,
  faStar,
  faDiagramProject,
  faLaptopCode,
  faSitemap,
  faUsers,
  faListCheck,
  faCodeBranch,
  faCodeCompare,
  faAward,
  faUserTie,
  faBriefcase,
  faGear,
  faBuilding,
  faShieldHalved,
  faPlus,
  faUserCheck,
  faComments,
  faChartPie,
  faScroll,
  faGraduationCap,
  faWrench,
  faFileCircleCheck,
  faTriangleExclamation,
  faSquareCheck,
  faBookBookmark,
  faRoute,
  faMapSigns,
  faLayerGroup,
  faMagic,
  faSignOutAlt,
} from "@fortawesome/free-solid-svg-icons";

interface SidebarItem {
  id: string;
  label: string;
  icon: any;
  badge?: string | number;
  badgeColor?: string;
}

interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

interface InternshipSidebarProps {
  activeRole: PortalRole;
  activePage: string;
  onSelectPage: (pageId: string) => void;
  activeArea: ExperienceArea;
  onSelectArea: (area: ExperienceArea) => void;
  isVirtualWorkspaceMode?: boolean;
  onExitWorkspace?: () => void;
}

export const InternshipSidebar: React.FC<InternshipSidebarProps> = ({
  activeRole,
  activePage,
  onSelectPage,
  activeArea,
  onSelectArea,
  isVirtualWorkspaceMode = false,
  onExitWorkspace,
}) => {
  // If in dedicated virtual workspace mode, render Virtual Workplace navigation
  if (isVirtualWorkspaceMode || activeArea === "virtual_workplace") {
    const virtualSections: SidebarSection[] = [
      {
        title: "Workplace Overview",
        items: [
          { id: "vw_overview", label: "Overview", icon: faGauge },
          { id: "vw_company", label: "My Company", icon: faBuilding },
          { id: "vw_department", label: "My Department", icon: faSitemap },
          { id: "vw_team", label: "My Team", icon: faUsers, badge: "5 online", badgeColor: "bg-emerald-500 text-white" },
        ],
      },
      {
        title: "Sprint & Delivery",
        items: [
          { id: "vw_projects", label: "Projects", icon: faDiagramProject },
          { id: "vw_tasks", label: "Tasks & Tickets", icon: faListCheck, badge: 3, badgeColor: "bg-indigo-600 text-white" },
          { id: "vw_documentation", label: "Documentation", icon: faBookOpen },
          { id: "vw_meetings", label: "Meetings", icon: faCalendarCheck },
          { id: "vw_communication", label: "Communication", icon: faComments },
        ],
      },
      {
        title: "Engineering & Quality",
        items: [
          { id: "vw_submission", label: "Work Submission", icon: faCodeBranch },
          { id: "vw_reviews", label: "Reviews", icon: faCodeCompare },
          { id: "vw_qa", label: "QA & Testing", icon: faClipboardCheck },
          { id: "vw_incidents", label: "Incidents & Challenges", icon: faTriangleExclamation, badge: "1 Active", badgeColor: "bg-rose-500 text-white" },
        ],
      },
      {
        title: "Growth & Credentials",
        items: [
          { id: "vw_performance", label: "Performance", icon: faChartPie },
          { id: "vw_skills", label: "Skills & Competencies", icon: faAward },
          { id: "vw_portfolio", label: "Portfolio", icon: faBriefcase },
        ],
      },
    ];

    return (
      <aside className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full min-h-0 overflow-y-auto">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-indigo-50/50 dark:bg-indigo-950/20">
          <div className="flex items-center space-x-2">
            <span className="h-6 w-6 rounded-md bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
              <FontAwesomeIcon icon={faLaptopCode} />
            </span>
            <div className="overflow-hidden">
              <h2 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                Virtual Workplace
              </h2>
              <p className="text-[10px] text-indigo-700 dark:text-indigo-400 font-medium">
                Simulated Enterprise
              </p>
            </div>
          </div>
        </div>

        <div className="p-3 space-y-5">
          {virtualSections.map((sec, idx) => (
            <div key={idx}>
              <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 px-3 mb-1.5">
                {sec.title}
              </h3>
              <ul className="space-y-0.5">
                {sec.items.map((item) => {
                  const isActive = activePage === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => onSelectPage(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition-all ${
                          isActive
                            ? "bg-indigo-600 text-white shadow-xs font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 truncate">
                          <FontAwesomeIcon
                            icon={item.icon}
                            className={`w-3.5 text-center ${isActive ? "text-white" : "text-slate-400"}`}
                          />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-1.5 flex-shrink-0 ${
                              item.badgeColor || (isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300")
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Sidebar Footer - Exit Workspace */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          {onExitWorkspace && (
            <button
              onClick={onExitWorkspace}
              className="w-full flex items-center space-x-2 px-3 py-2 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
            >
              <FontAwesomeIcon icon={faSignOutAlt} className="w-4 h-4" />
              <span>Exit Workspace</span>
            </button>
          )}
        </div>
      </aside>
    );
  }

  // STUDENT PORTAL NAVIGATION
  if (activeRole === "student") {
    const studentSections: SidebarSection[] = [
      {
        title: "Real Internships",
        items: [
          { id: "stu_dashboard", label: "Internship Dashboard", icon: faGauge },
          { id: "stu_explore", label: "Explore Internships", icon: faCompass },
          { id: "stu_details", label: "Internship Details", icon: faBookOpen },
          { id: "stu_applications", label: "My Applications", icon: faFileSignature, badge: 3 },
          { id: "stu_app_details", label: "Application Details", icon: faFileLines },
          { id: "stu_interviews", label: "Interviews & Offers", icon: faCalendarCheck, badge: "1 Offer", badgeColor: "bg-emerald-600 text-white" },
        ],
      },
      {
        title: "Active Placement Tracking",
        items: [
          { id: "stu_placement", label: "My Placement", icon: faBuildingUser },
          { id: "stu_onboarding", label: "Onboarding Checklist", icon: faClipboardCheck },
          { id: "stu_tasks", label: "Tasks & Activities", icon: faListCheck },
          { id: "stu_logbook", label: "Weekly Logbook", icon: faBookBookmark, badge: "Due Fri", badgeColor: "bg-amber-500 text-white" },
          { id: "stu_attendance", label: "Daily Attendance", icon: faClock },
          { id: "stu_meetings", label: "Meetings & Syncs", icon: faHandshake },
          { id: "stu_documents", label: "Official Documents", icon: faFolderOpen },
          { id: "stu_reports", label: "Progress Reports", icon: faFileLines },
          { id: "stu_evaluations", label: "Evaluations & Feedback", icon: faStar },
        ],
      },
      {
        title: "Career Development",
        items: [
          { id: "stu_career_explorer", label: "Career Explorer", icon: faCompass, badge: "New", badgeColor: "bg-indigo-600 text-white" },
          { id: "stu_career_interests", label: "My Career Interests", icon: faRoute },
          { id: "stu_career_roadmap", label: "Career Roadmap", icon: faMapSigns },
          { id: "stu_skill_gap", label: "Skill Gap Analysis", icon: faLayerGroup },
          { id: "stu_career_assessment", label: "Career Assessments", icon: faMagic },
        ],
      },
      {
        title: "Industry & Mentored Projects",
        items: [
          { id: "stu_industry_projects", label: "Industry Projects", icon: faDiagramProject, badge: "New", badgeColor: "bg-indigo-600 text-white" },
        ],
      },
      {
        title: "Simulated Professional Practice",
        items: [
          { id: "stu_virtual_workplace", label: "Virtual Workplace", icon: faLaptopCode, badge: "SIM", badgeColor: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
          { id: "stu_virtual_companies", label: "Explore Virtual Companies", icon: faBuilding },
          { id: "stu_simulation_apps", label: "Simulation Applications", icon: faFileSignature },
          { id: "stu_portfolio", label: "Professional Portfolio", icon: faBriefcase },
          { id: "stu_career_opps", label: "Career Opportunities", icon: faUserTie },
          { id: "stu_settings", label: "Internship Settings", icon: faGear },
        ],
      },
    ];

    return renderSidebar("Student Internship Hub", studentSections);
  }

  // EMPLOYER PORTAL NAVIGATION
  if (activeRole === "employer_owner" || activeRole === "employer_recruiter" || activeRole === "employer_supervisor") {
    const employerSections: SidebarSection[] = [
      {
        title: "Talent Acquisition",
        items: [
          { id: "emp_dashboard", label: "Employer Dashboard", icon: faGauge },
          { id: "emp_profile", label: "Company Profile", icon: faBuilding },
          { id: "emp_verification", label: "Verification Status", icon: faShieldHalved, badge: "Verified", badgeColor: "bg-emerald-600 text-white" },
          { id: "emp_opportunities", label: "Internship Listings", icon: faBriefcase },
          { id: "emp_create_opp", label: "Create Opportunity", icon: faPlus },
          { id: "emp_applications", label: "Applications (ATS)", icon: faFileSignature, badge: 12, badgeColor: "bg-emerald-600 text-white" },
          { id: "emp_shortlisting", label: "Shortlisted Candidates", icon: faUserCheck },
          { id: "emp_interviews", label: "Interviews", icon: faCalendarCheck },
          { id: "emp_offers", label: "Formal Offers", icon: faFileLines },
        ],
      },
      {
        title: "Intern Management",
        items: [
          { id: "emp_interns", label: "Current Interns", icon: faUsers, badge: 4 },
          { id: "emp_tasks", label: "Intern Tasks", icon: faListCheck },
          { id: "emp_attendance", label: "Attendance & Logbook", icon: faClock, badge: "2 pending", badgeColor: "bg-amber-500 text-white" },
          { id: "emp_evaluations", label: "Performance Evaluations", icon: faStar },
          { id: "emp_documents", label: "Documents & NDAs", icon: faFolderOpen },
          { id: "emp_messages", label: "Direct Messages", icon: faComments },
        ],
      },
      {
        title: "Analytics & Governance",
        items: [
          { id: "emp_analytics", label: "Talent Analytics", icon: faChartPie },
          { id: "emp_settings", label: "Company Settings", icon: faGear },
        ],
      },
    ];

    return renderSidebar("Employer Portal", employerSections);
  }

  // ADMINISTRATION & COORDINATOR PORTAL
  if (
    activeRole === "internship_coordinator" ||
    activeRole === "college_admin" ||
    activeRole === "principal_management" ||
    activeRole === "super_admin" ||
    activeRole === "hod" ||
    activeRole === "program_coordinator"
  ) {
    const adminSections: SidebarSection[] = [
      {
        title: "Program Administration",
        items: [
          { id: "adm_dashboard", label: "Administration Dashboard", icon: faGauge },
          { id: "adm_employers", label: "Employer Directory", icon: faBuilding },
          { id: "adm_verification", label: "Employer Verification", icon: faShieldHalved, badge: 1, badgeColor: "bg-amber-500 text-white" },
          { id: "adm_opp_approval", label: "Opportunity Approval", icon: faFileCircleCheck, badge: 2, badgeColor: "bg-amber-500 text-white" },
          { id: "adm_applications", label: "Internship Applications", icon: faFileSignature },
          { id: "adm_placements", label: "Placement Management", icon: faBuildingUser },
          { id: "adm_supervisors", label: "Supervisor Assignment", icon: faUserCheck },
        ],
      },
      {
        title: "Academic Oversight",
        items: [
          { id: "adm_monitoring", label: "Internship Monitoring", icon: faTriangleExclamation },
          { id: "adm_logbooks", label: "Logbook Audits", icon: faBookBookmark },
          { id: "adm_attendance", label: "Attendance Monitoring", icon: faClock },
          { id: "adm_reports", label: "Report Management", icon: faFileLines },
          { id: "adm_evaluations", label: "Evaluations & Grades", icon: faStar },
          { id: "adm_completion", label: "Completion & Certificates", icon: faGraduationCap },
          { id: "adm_industry_projects", label: "Industry Projects Bank", icon: faDiagramProject },
        ],
      },
      {
        title: "Virtual Workplace Admin",
        items: [
          { id: "adm_vw_admin", label: "Simulation Governance", icon: faLaptopCode },
          { id: "adm_templates", label: "Company Templates", icon: faSitemap },
          { id: "adm_sim_management", label: "Simulation Management", icon: faWrench },
          { id: "adm_analytics", label: "Institutional Analytics", icon: faChartPie },
          { id: "adm_audit_logs", label: "System Audit Logs", icon: faScroll },
          { id: "adm_settings", label: "Module Settings", icon: faGear },
        ],
      },
    ];

    return renderSidebar("Internship Administration", adminSections);
  }

  // FACULTY SUPERVISOR PORTAL
  const facultySections: SidebarSection[] = [
    {
      title: "Faculty Supervision",
      items: [
        { id: "fac_dashboard", label: "Supervisor Dashboard", icon: faGauge },
        { id: "fac_assigned", label: "My Assigned Interns", icon: faUsers, badge: 6 },
        { id: "fac_plans", label: "Internship Learning Plans", icon: faBookOpen },
        { id: "fac_progress", label: "Progress Monitoring", icon: faChartPie },
        { id: "fac_logbooks", label: "Logbook Reviews", icon: faBookBookmark, badge: 2, badgeColor: "bg-amber-500 text-white" },
        { id: "fac_reports", label: "Academic Report Reviews", icon: faFileLines, badge: 1, badgeColor: "bg-amber-500 text-white" },
        { id: "fac_meetings", label: "Supervisory Check-ins", icon: faCalendarCheck },
        { id: "fac_feedback", label: "Employer Feedback", icon: faComments },
        { id: "fac_evaluations", label: "Faculty Evaluations", icon: faStar },
        { id: "fac_issues", label: "Issues & Escalations", icon: faTriangleExclamation },
      ],
    },
  ];

  return renderSidebar("Faculty Supervision", facultySections);

  function renderSidebar(portalTitle: string, sections: SidebarSection[]) {
    return (
      <aside className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full min-h-0 overflow-y-auto">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            {portalTitle}
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Role: <span className="font-semibold text-emerald-600 dark:text-emerald-400 capitalize">{activeRole.replace(/_/g, " ")}</span>
          </p>
        </div>

        <div className="p-3 space-y-5">
          {sections.map((sec, idx) => (
            <div key={idx}>
              <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 px-3 mb-1.5">
                {sec.title}
              </h3>
              <ul className="space-y-0.5">
                {sec.items.map((item) => {
                  const isActive = activePage === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => onSelectPage(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition-all ${
                          isActive
                            ? "bg-emerald-600 text-white shadow-xs font-semibold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 truncate">
                          <FontAwesomeIcon
                            icon={item.icon}
                            className={`w-3.5 text-center ${isActive ? "text-white" : "text-slate-400"}`}
                          />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-1.5 flex-shrink-0 ${
                              item.badgeColor || (isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300")
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    );
  }
};