import React, { useEffect, useState } from "react";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { PortalRole, ExperienceArea, CareerPath } from "./types";
import { InternshipHeader } from "./components/InternshipHeader";
import { InternshipSidebar } from "./components/InternshipSidebar";
import { StudentPortal } from "./portals/StudentPortal";
import { EmployerPortal } from "./portals/EmployerPortal";
import { AdminPortal } from "./portals/AdminPortal";
import { FacultyPortal } from "./portals/FacultyPortal";
import { VirtualWorkplaceWorkspace } from "./portals/VirtualWorkplaceWorkspace";
import { CareerExplorerView } from "./CareerExplorerView";

export const InternshipManagementView: React.FC = () => {
  const { currentUser } = useCollegeOS();

  // Determine initial role based on logged in user's role
  const getInitialRole = (): PortalRole => {
    const r = currentUser?.role;
    if (r === "student") return "student";
    if (r === "faculty") return "faculty_supervisor";
    if (
      r === "super_admin" ||
      r === "campus_admin" ||
      r === "dean" ||
      r === "hod" ||
      r === "program_coordinator"
    ) {
      return "internship_coordinator";
    }
    return "student";
  };

  const [activeRole, setActiveRole] = useState<PortalRole>(getInitialRole);
  const [activeArea, setActiveArea] = useState<ExperienceArea>("real_internships");
  const [activePage, setActivePage] = useState<string>("stu_dashboard");
  const [careerPath, setCareerPath] = useState<CareerPath>("frontend_developer");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Sync initial sub-path if navigated from deep link
  useEffect(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      if (path.includes("/virtual-workplace/tasks")) {
        setActiveArea("virtual_workplace");
        setActivePage("vw_tasks");
      } else if (path.includes("/virtual-workplace/projects")) {
        setActiveArea("virtual_workplace");
        setActivePage("vw_projects");
      } else if (path.includes("/virtual-workplace/companies")) {
        setActiveArea("virtual_workplace");
        setActivePage("vw_company");
      } else if (path.includes("/virtual-workplace")) {
        setActiveArea("virtual_workplace");
        setActivePage("vw_overview");
      } else if (path.includes("/career/explorer") || path.includes("/career-explorer")) {
        setActiveArea("career_explorer");
        setActivePage("career_explorer");
      } else if (path.includes("/career/interests")) {
        setActiveArea("career_explorer");
        setActivePage("career_interests");
      } else if (path.includes("/career/roadmap")) {
        setActiveArea("career_explorer");
        setActivePage("career_roadmap");
      } else if (path.includes("/opportunities")) {
        setActiveArea("real_internships");
        setActivePage(activeRole === "student" ? "stu_explore" : "emp_opportunities");
      } else if (path.includes("/applications")) {
        setActiveArea("real_internships");
        setActivePage(activeRole === "student" ? "stu_applications" : "emp_applications");
      } else if (path.includes("/placement")) {
        setActiveArea("real_internships");
        setActivePage(activeRole === "student" ? "stu_placement" : "adm_placements");
      } else if (path.includes("/portfolio")) {
        setActiveArea("real_internships");
        setActivePage("stu_portfolio");
      }
    }
  }, []);

  // Update default active page when switching roles
  const handleSelectRole = (role: PortalRole) => {
    setActiveRole(role);
    if (role === "student") {
      setActivePage("stu_dashboard");
    } else if (
      role === "employer_owner" ||
      role === "employer_recruiter" ||
      role === "employer_supervisor"
    ) {
      setActivePage("emp_dashboard");
    } else if (role === "faculty_supervisor") {
      setActivePage("fac_dashboard");
    } else {
      setActivePage("adm_dashboard");
    }
  };

  // Update default active page when switching areas
  const handleSelectArea = (area: ExperienceArea) => {
    setActiveArea(area);
    if (area === "virtual_workplace") {
      setActivePage("vw_overview");
      if (window.location.pathname !== "/internships/virtual-workplace") {
        window.history.pushState({}, "", "/internships/virtual-workplace");
      }
    } else if (area === "career_explorer") {
      setActivePage("career_explorer");
      if (window.location.pathname !== "/internships/career-explorer") {
        window.history.pushState({}, "", "/internships/career-explorer");
      }
    } else if (area === "industry_projects") {
      if (activeRole === "student") {
        setActivePage("stu_industry_projects");
      } else if (activeRole === "internship_coordinator") {
        setActivePage("adm_industry_projects");
      } else {
        setActivePage("stu_industry_projects");
      }
    } else {
      // Real internships
      if (activeRole === "student") setActivePage("stu_dashboard");
      else if (activeRole === "faculty_supervisor") setActivePage("fac_dashboard");
      else if (
        activeRole === "employer_owner" ||
        activeRole === "employer_recruiter" ||
        activeRole === "employer_supervisor"
      )
        setActivePage("emp_dashboard");
      else setActivePage("adm_dashboard");

      if (window.location.pathname !== "/internships/dashboard") {
        window.history.pushState({}, "", "/internships/dashboard");
      }
    }
  };

  const handleSelectPage = (pageId: string) => {
    setActivePage(pageId);
    // Sync URL when relevant
    if (pageId.startsWith("vw_")) {
      setActiveArea("virtual_workplace");
      if (pageId === "vw_tasks") window.history.pushState({}, "", "/internships/virtual-workplace/tasks");
      else if (pageId === "vw_projects") window.history.pushState({}, "", "/internships/virtual-workplace/projects");
      else window.history.pushState({}, "", "/internships/virtual-workplace");
    } else if (pageId === "stu_explore") {
      setActiveArea("real_internships");
      window.history.pushState({}, "", "/internships/opportunities");
    } else if (pageId === "stu_applications") {
      setActiveArea("real_internships");
      window.history.pushState({}, "", "/internships/applications");
    } else if (pageId === "stu_placement") {
      setActiveArea("real_internships");
      window.history.pushState({}, "", "/internships/placement");
    } else if (pageId === "stu_portfolio") {
      window.history.pushState({}, "", "/internships/portfolio");
    } else if (pageId === "career_explorer") {
      setActiveArea("career_explorer");
      window.history.pushState({}, "", "/internships/career-explorer");
    } else if (pageId === "career_interests") {
      setActiveArea("career_explorer");
      window.history.pushState({}, "", "/internships/career/interests");
    } else if (pageId === "career_roadmap") {
      setActiveArea("career_explorer");
      window.history.pushState({}, "", "/internships/career/roadmap");
    } else if (pageId === "skill_gap") {
      setActiveArea("career_explorer");
      window.history.pushState({}, "", "/internships/career/skill-gap");
    } else if (pageId === "career_assessment") {
      setActiveArea("career_explorer");
      window.history.pushState({}, "", "/internships/career/assessment");
    } else if (pageId.startsWith("emp_")) {
      setActiveArea("real_internships");
      const path = pageId.replace("emp_", "").replace(/_/g, "-");
      window.history.pushState({}, "", `/internships/employer/${path}`);
    } else if (pageId.startsWith("adm_")) {
      setActiveArea("real_internships");
      const path = pageId.replace("adm_", "").replace(/_/g, "-");
      window.history.pushState({}, "", `/internships/admin/${path}`);
    }
  };

  // Build breadcrumbs
  const getBreadcrumbs = () => {
    const areaName =
      activeArea === "real_internships"
        ? "Real Internships"
        : activeArea === "virtual_workplace"
        ? "Virtual Workplace (SIMULATED)"
        : activeArea === "career_explorer"
        ? "Career Explorer"
        : "Industry Projects";

    const formatPageName = (id: string) => {
      return id
        .replace(/^(stu_|emp_|adm_|fac_|vw_|career_)/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    };

    return [
      { label: areaName, onClick: () => handleSelectArea(activeArea) },
      { label: formatPageName(activePage) },
    ];
  };

  const isVirtualWorkplaceLayout =
    activeArea === "virtual_workplace" || activePage.startsWith("vw_");
  const isCareerExplorerLayout = activeArea === "career_explorer" || activePage.startsWith("career_");

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors">
      {/* Module Top Navigation & Switcher Header */}
      <InternshipHeader
        activeArea={activeArea}
        onSelectArea={handleSelectArea}
        activeRole={activeRole}
        onSelectRole={handleSelectRole}
        activeCareerPath={careerPath}
        onSelectCareerPath={setCareerPath}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        breadcrumbs={getBreadcrumbs()}
      />

      {/* Main Layout Area: Contextual Sidebar + Dynamic Content View */}
      <div className="flex flex-1 overflow-hidden">
        <InternshipSidebar
          activeRole={activeRole}
          activePage={activePage}
          onSelectPage={handleSelectPage}
          activeArea={activeArea}
          onSelectArea={handleSelectArea}
          isVirtualWorkspaceMode={isVirtualWorkplaceLayout}
        />

        <main className="flex-1 overflow-y-auto bg-slate-50/60 dark:bg-slate-950">
          {/* Virtual Workplace dedicated view */}
          {isVirtualWorkplaceLayout ? (
            <VirtualWorkplaceWorkspace
              activePage={activePage}
              onNavigate={handleSelectPage}
              careerPath={careerPath}
              onChangeCareerPath={setCareerPath}
            />
          ) : isCareerExplorerLayout ? (
            <CareerExplorerView onNavigate={handleSelectPage} />
          ) : activeRole === "student" ? (
            <StudentPortal
              activePage={activePage}
              onNavigate={handleSelectPage}
              searchQuery={searchQuery}
            />
          ) : activeRole === "employer_owner" ||
            activeRole === "employer_recruiter" ||
            activeRole === "employer_supervisor" ? (
            <EmployerPortal
              activePage={activePage}
              onNavigate={handleSelectPage}
              searchQuery={searchQuery}
            />
          ) : activeRole === "faculty_supervisor" ? (
            <FacultyPortal
              activePage={activePage}
              onNavigate={handleSelectPage}
              searchQuery={searchQuery}
            />
          ) : (
            <AdminPortal
              activePage={activePage}
              onNavigate={handleSelectPage}
              searchQuery={searchQuery}
            />
          )}
        </main>
      </div>
    </div>
  );
};
