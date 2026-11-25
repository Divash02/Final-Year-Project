import React, { useEffect, useState } from "react";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { PortalRole, ExperienceArea, CareerPath, SimulationMembership } from "./types";
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
  const [virtualWorkspaceMembershipId, setVirtualWorkspaceMembershipId] = useState<string | null>(null);
  const [isFullScreenWorkspace, setIsFullScreenWorkspace] = useState(false);
  const [previousRoute, setPreviousRoute] = useState<string | null>(null);

  // Sync initial sub-path if navigated from deep link
  useEffect(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      if (path.startsWith("/virtual-workplace/")) {
        // Extract membership ID from URL if present: /virtual-workplace/:membershipId/...
        const match = path.match(/^\/virtual-workplace\/([^/]+)(?:\/.*)?$/);
        if (match && match[1] !== "overview" && match[1] !== "projects" && match[1] !== "tasks" && 
            match[1] !== "documentation" && match[1] !== "meetings" && match[1] !== "communication" &&
            match[1] !== "submission" && match[1] !== "reviews" && match[1] !== "incidents" &&
            match[1] !== "performance" && match[1] !== "skills" && match[1] !== "portfolio" &&
            match[1] !== "team" && match[1] !== "company" && match[1] !== "department") {
          // This looks like a membership ID
          setVirtualWorkspaceMembershipId(match[1]);
          setIsFullScreenWorkspace(true);
          setPreviousRoute("/internships/dashboard");
        }
        
        setActiveArea("virtual_workplace");
        if (path.includes("/virtual-workplace/tasks")) {
          setActivePage("vw_tasks");
        } else if (path.includes("/virtual-workplace/projects")) {
          setActivePage("vw_projects");
        } else if (path.includes("/virtual-workplace/companies") || path.includes("/virtual-workplace/company")) {
          setActivePage("vw_company");
        } else if (path.includes("/virtual-workplace/department")) {
          setActivePage("vw_department");
        } else if (path.includes("/virtual-workplace/team")) {
          setActivePage("vw_team");
        } else if (path.includes("/virtual-workplace/documentation")) {
          setActivePage("vw_documentation");
        } else if (path.includes("/virtual-workplace/meetings")) {
          setActivePage("vw_meetings");
        } else if (path.includes("/virtual-workplace/communication")) {
          setActivePage("vw_communication");
        } else if (path.includes("/virtual-workplace/submission")) {
          setActivePage("vw_submission");
        } else if (path.includes("/virtual-workplace/reviews")) {
          setActivePage("vw_reviews");
        } else if (path.includes("/virtual-workplace/incidents")) {
          setActivePage("vw_incidents");
        } else if (path.includes("/virtual-workplace/performance")) {
          setActivePage("vw_performance");
        } else if (path.includes("/virtual-workplace/skills")) {
          setActivePage("vw_skills");
        } else if (path.includes("/virtual-workplace/portfolio")) {
          setActivePage("vw_portfolio");
        } else {
          setActivePage("vw_overview");
        }
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
    // Exit full-screen workspace when switching roles
    setIsFullScreenWorkspace(false);
    setVirtualWorkspaceMembershipId(null);
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
    // Exit full-screen workspace when switching areas
    setIsFullScreenWorkspace(false);
    setVirtualWorkspaceMembershipId(null);
  };

  const handleEnterVirtualWorkspace = (membershipId: string) => {
    setVirtualWorkspaceMembershipId(membershipId);
    setIsFullScreenWorkspace(true);
    setPreviousRoute(window.location.pathname);
    setActiveArea("virtual_workplace");
    setActivePage("vw_overview");
    window.history.pushState({}, "", `/virtual-workplace/${membershipId}`);
  };

  const handleExitWorkspace = () => {
    setIsFullScreenWorkspace(false);
    setVirtualWorkspaceMembershipId(null);
    // Navigate back to the appropriate internship portal
    const returnRoute = previousRoute || "/internships/dashboard";
    window.history.pushState({}, "", returnRoute);
    // Reset to appropriate default page based on role
    if (activeRole === "student") {
      setActivePage("stu_dashboard");
      setActiveArea("real_internships");
    } else if (
      activeRole === "employer_owner" ||
      activeRole === "employer_recruiter" ||
      activeRole === "employer_supervisor"
    ) {
      setActivePage("emp_dashboard");
      setActiveArea("real_internships");
    } else if (activeRole === "faculty_supervisor") {
      setActivePage("fac_dashboard");
      setActiveArea("real_internships");
    } else {
      setActivePage("adm_dashboard");
      setActiveArea("real_internships");
    }
  };

  const handleSelectPage = (pageId: string) => {
    setActivePage(pageId);
    // Sync URL when relevant
    if (pageId.startsWith("vw_")) {
      setActiveArea("virtual_workplace");
      if (isFullScreenWorkspace && virtualWorkspaceMembershipId) {
        if (pageId === "vw_tasks") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/tasks`);
        else if (pageId === "vw_projects") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/projects`);
        else if (pageId === "vw_company") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/company`);
        else if (pageId === "vw_department") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/department`);
        else if (pageId === "vw_team") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/team`);
        else if (pageId === "vw_documentation") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/documentation`);
        else if (pageId === "vw_meetings") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/meetings`);
        else if (pageId === "vw_communication") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/communication`);
        else if (pageId === "vw_submission") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/submission`);
        else if (pageId === "vw_reviews") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/reviews`);
        else if (pageId === "vw_incidents") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/incidents`);
        else if (pageId === "vw_performance") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/performance`);
        else if (pageId === "vw_skills") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/skills`);
        else if (pageId === "vw_portfolio") window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}/portfolio`);
        else window.history.pushState({}, "", `/virtual-workplace/${virtualWorkspaceMembershipId}`);
      } else {
        if (pageId === "vw_tasks") window.history.pushState({}, "", "/internships/virtual-workplace/tasks");
        else if (pageId === "vw_projects") window.history.pushState({}, "", "/internships/virtual-workplace/projects");
        else window.history.pushState({}, "", "/internships/virtual-workplace");
      }
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

  // In full-screen workspace mode, render only the workspace without CollegeOS shell
  if (isFullScreenWorkspace && virtualWorkspaceMembershipId) {
    return (
      <VirtualWorkplaceWorkspace
        activePage={activePage}
        onNavigate={handleSelectPage}
        careerPath={careerPath}
        onChangeCareerPath={setCareerPath}
        membershipId={virtualWorkspaceMembershipId}
        onExitWorkspace={handleExitWorkspace}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors">
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
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <InternshipSidebar
          activeRole={activeRole}
          activePage={activePage}
          onSelectPage={handleSelectPage}
          activeArea={activeArea}
          onSelectArea={handleSelectArea}
          isVirtualWorkspaceMode={isVirtualWorkplaceLayout}
          onExitWorkspace={isVirtualWorkplaceLayout ? handleExitWorkspace : undefined}
        />

        <main className="flex-1 overflow-y-auto bg-slate-50/60 dark:bg-slate-950">
          {/* Virtual Workplace dedicated view (embedded in CollegeOS) */}
          {isVirtualWorkplaceLayout ? (
            <VirtualWorkplaceWorkspace
              activePage={activePage}
              onNavigate={handleSelectPage}
              careerPath={careerPath}
              onChangeCareerPath={setCareerPath}
              membershipId={virtualWorkspaceMembershipId || ""}
              onExitWorkspace={handleExitWorkspace}
            />
          ) : isCareerExplorerLayout ? (
            <CareerExplorerView onNavigate={handleSelectPage} />
          ) : activeRole === "student" ? (
            <StudentPortal
              activePage={activePage}
              onNavigate={handleSelectPage}
              searchQuery={searchQuery}
              onEnterVirtualWorkspace={handleEnterVirtualWorkspace}
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
