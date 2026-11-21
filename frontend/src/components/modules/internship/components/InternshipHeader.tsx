import React from "react";
import { PortalRole, ExperienceArea, CareerPath } from "../types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBriefcase,
  faLaptopCode,
  faDiagramProject,
  faUserGraduate,
  faBuilding,
  faShieldHalved,
  faChalkboardUser,
  faSearch,
  faBell,
  faFlask,
  faArrowRight,
  faCheckCircle,
  faCompass,
  faRoute,
} from "@fortawesome/free-solid-svg-icons";

interface InternshipHeaderProps {
  activeArea: ExperienceArea;
  onSelectArea: (area: ExperienceArea) => void;
  activeRole: PortalRole;
  onSelectRole: (role: PortalRole) => void;
  activeCareerPath?: CareerPath;
  onSelectCareerPath?: (track: CareerPath) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  breadcrumbs: { label: string; onClick?: () => void }[];
}

export const InternshipHeader: React.FC<InternshipHeaderProps> = ({
  activeArea,
  onSelectArea,
  activeRole,
  onSelectRole,
  activeCareerPath,
  onSelectCareerPath,
  searchQuery,
  onSearchChange,
  breadcrumbs,
}) => {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-30 shadow-xs">
      {/* Simulation Notice Banner if in Virtual Workplace */}
      {activeArea === "virtual_workplace" && (
        <div className="bg-indigo-600 dark:bg-indigo-700 text-white px-4 py-1.5 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="bg-amber-400 text-slate-900 font-bold px-2 py-0.5 rounded-full text-[10px] tracking-wide uppercase">
              Simulated Experience
            </span>
            <span>
              <strong>Virtual Workplace:</strong> You are actively operating within NovaTech Cloud Enterprise simulation. All tickets, reviews, and environments represent professional hands-on practice.
            </span>
          </div>
          {activeCareerPath && onSelectCareerPath && (
            <div className="flex items-center space-x-2">
              <span className="text-indigo-200 text-xs">Simulated Role:</span>
              <select
                value={activeCareerPath}
                onChange={(e) => onSelectCareerPath(e.target.value as CareerPath)}
                className="bg-indigo-800 text-white text-xs rounded-md px-2 py-0.5 border border-indigo-400 focus:outline-none focus:ring-1 focus:ring-white"
              >
                <option value="frontend_developer">Frontend Developer (React/TS)</option>
                <option value="project_manager">Technical Project Manager</option>
                <option value="uiux_designer">UI/UX Product Designer</option>
                <option value="qa_engineer">QA & Automation Engineer</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Main Top Navigation Row */}
      <div className="px-6 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Left: Module identity & Breadcrumbs */}
        <div className="flex flex-col">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              <FontAwesomeIcon icon={faBriefcase} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Internships & Industry Experience
                </h1>
                <span className="text-[10px] px-2 py-0.5 font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 rounded-md">
                  CollegeOS 2026
                </span>
              </div>
            </div>
          </div>

          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>Internship Portal</span>
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                <span className="text-slate-300 dark:text-slate-600">/</span>
                {crumb.onClick ? (
                  <button
                    onClick={crumb.onClick}
                    className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors font-medium"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className="text-slate-800 dark:text-slate-200 font-semibold">{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* Center: Search Bar */}
        <div className="relative max-w-md w-full">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"
          />
          <input
            type="text"
            placeholder="Search internships, companies, tickets, students..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition-all"
          />
        </div>

        {/* Right: Role Switcher & Portal Selector for Testing/Evaluation */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 pl-1.5 pr-1">Portal:</span>
            <select
              value={activeRole}
              onChange={(e) => onSelectRole(e.target.value as PortalRole)}
              className="text-xs font-medium bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="student">Student Portal</option>
              <option value="employer_recruiter">Employer / HR Portal</option>
              <option value="internship_coordinator">Administration & Coordinator</option>
              <option value="faculty_supervisor">Faculty Supervisor</option>
            </select>
          </div>

          <button
            title="System Notifications"
            className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <FontAwesomeIcon icon={faBell} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-white dark:ring-slate-900" />
          </button>
        </div>
      </div>

      {/* Primary Area Tabs: Real Internships vs Virtual Workplace vs Industry Projects vs Career Explorer */}
      <div className="px-6 flex items-center space-x-1 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/40">
        <button
          onClick={() => onSelectArea("real_internships")}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition-all ${
            activeArea === "real_internships"
              ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-800/70"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300"
          }`}
        >
          <FontAwesomeIcon icon={faBriefcase} className="text-emerald-500" />
          <span>Real Internships</span>
          <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded-full font-mono">
            Actual Companies
          </span>
        </button>

        <button
          onClick={() => onSelectArea("virtual_workplace")}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition-all ${
            activeArea === "virtual_workplace"
              ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-800/70"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300"
          }`}
        >
          <FontAwesomeIcon icon={faLaptopCode} className="text-indigo-500" />
          <span>Virtual Workplace</span>
          <span className="text-[10px] bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 px-1.5 py-0.2 rounded-full font-mono font-bold tracking-tight">
            SIMULATED
          </span>
        </button>

        <button
          onClick={() => onSelectArea("industry_projects")}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition-all ${
            activeArea === "industry_projects"
              ? "border-amber-600 text-amber-700 dark:text-amber-400 bg-white dark:bg-slate-800/70"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300"
          }`}
        >
          <FontAwesomeIcon icon={faDiagramProject} className="text-amber-500" />
          <span>Industry Projects</span>
          <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.2 rounded-full font-mono">
            Mentored Briefs
          </span>
        </button>

        <button
          onClick={() => onSelectArea("career_explorer")}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition-all ${
            activeArea === "career_explorer"
              ? "border-purple-600 text-purple-700 dark:text-purple-400 bg-white dark:bg-slate-800/70"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300"
          }`}
        >
          <FontAwesomeIcon icon={faCompass} className="text-purple-500" />
          <span>Career Explorer</span>
          <span className="text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-1.5 py-0.2 rounded-full font-mono">
            Explore Paths
          </span>
        </button>
      </div>
    </header>
  );
};
