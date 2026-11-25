export interface CodingLabRoute {
  projectId: string | null;
  assignmentId: string | null;
}

export interface ResolvedRoute {
  view: string;
  codingLab: CodingLabRoute;
  classSession: string | null;
}

export const routeToView: Record<string, string> = {
  "/": "dashboard",
  "/connect": "connect",
  "/mail": "communication",
  "/messages": "messages",
  "/notices": "notices",
  "/timetable": "timetable_attendance",
  "/my-timetable": "my_timetable",
  "/attendance": "attendance_sheet",
  "/attendance-records": "attendance_records",
  "/learning": "learning",
  "/my-courses": "learning",
  "/lms": "lms",
  "/quizzes": "quizzes",
  "/assignments": "assignments",
  "/materials": "materials",
  "/faculty/assessment": "faculty_assessment",
  "/faculty/student-progress": "student_progress",
  "/faculty/lesson-planning": "lesson_planning",
  "/faculty/student-advising": "student_advising",
  "/faculty/leave-substitution": "leave_substitution",
  "/faculty/workload": "faculty_workload",
  "/faculty/alerts": "faculty_alerts",
  "/resources/booking": "resource_booking",
  "/examination": "examination",
  "/finance": "finance",
  "/requests": "requests",
  "/documents": "documents",
  "/smart-documents": "smart_documents",
  "/calendar": "examinations_calendar",
  "/calendar-documents": "calendar_documents",
  "/library": "library",
  "/analytics": "analytics",
  "/intelligence": "intelligence",
  "/students": "students",
  "/user-management": "user_management",
  "/admissions": "admissions",
  "/profile": "profile",
  "/notifications": "notifications",
  "/facilities": "facilities_library",
  "/account/activate": "profile",
  "/student/coding-lab": "student_coding_lab",
  "/teacher/coding-lab": "teacher_coding_lab",
  "/hr": "hr_dashboard",
  "/staff": "staff_portal",
  "/recruitment": "recruitment",
  "/workforce": "workforce_planning",
  "/leave-approval": "leave_approval",
  "/career": "career_placement",
  "/hostel": "hostel_accommodation",
  "/clubs": "student_clubs",
  "/workflows": "workflow_automation",
  "/student-lifecycle": "student_lifecycle",
  "/student-journey": "student_journey",
  "/study-planner": "study_planner",
  "/safety": "safety",
  "/campus-extended": "campus_facilities_ext",
  "/campus/buildings": "campus_buildings",
  "/campus/laboratories": "campus_labs",
  "/campus/room-reservations": "campus_reservations",
  "/campus/maintenance": "campus_maintenance",
  "/campus/assets": "campus_assets",
  "/campus/transport": "campus_transport",
  "/safety/report-incident": "report_incident",
  "/safety/incidents": "safety_incidents",
  "/research": "research",
  "/research-projects": "research_projects",
  "/credentials": "credentials",
  "/early-warning": "early_warning",
  "/internship": "internship",
  "/internships": "internship",
  "/internships/dashboard": "internship",
  "/internships/opportunities": "internship",
  "/internships/applications": "internship",
  "/internships/placement": "internship",
  "/internships/portfolio": "internship",
  "/virtual-workplace": "internship",
  "/virtual-workplace/overview": "internship",
  "/virtual-workplace/projects": "internship",
  "/virtual-workplace/tasks": "internship",
  "/virtual-workplace/documentation": "internship",
  "/virtual-workplace/meetings": "internship",
  "/virtual-workplace/communication": "internship",
  "/virtual-workplace/submission": "internship",
  "/virtual-workplace/reviews": "internship",
  "/virtual-workplace/incidents": "internship",
  "/virtual-workplace/performance": "internship",
  "/virtual-workplace/skills": "internship",
  "/virtual-workplace/portfolio": "internship",
  "/virtual-workplace/team": "internship",
  "/virtual-workplace/company": "internship",
  "/virtual-workplace/department": "internship",
  "/graduation": "graduation",
};

export const viewToRoute: Record<string, string> = Object.fromEntries(
  Object.entries(routeToView).map(([route, view]) => [view, route]),
);

viewToRoute.hr_dashboard = "/hr";
viewToRoute.staff_portal = "/staff";
viewToRoute.recruitment = "/recruitment";
viewToRoute.workforce_planning = "/workforce";
viewToRoute.leave_approval = "/leave-approval";
viewToRoute.career_placement = "/career";
viewToRoute.hostel_accommodation = "/hostel";
viewToRoute.student_clubs = "/clubs";
viewToRoute.workflow_automation = "/workflows";
viewToRoute.smart_documents = "/smart-documents";
viewToRoute.student_lifecycle = "/student-lifecycle";
viewToRoute.notifications = "/notifications";
viewToRoute.report_incident = "/safety/report-incident";
viewToRoute.safety_incidents = "/safety/incidents";

const CODING_LAB_PATH =
  /^\/(student|teacher)\/coding-lab(?:\/projects\/([A-Za-z0-9]+))?(?:\/assignments\/([A-Za-z0-9]+))?$/;

const ONLINE_CLASS_PATH = /^\/online-classes\/([A-Za-z0-9]{24})\/(join|pre-join|room|waiting|classroom)(\/?)$/;

export function resolveRoute(pathname: string): ResolvedRoute {
  const match = CODING_LAB_PATH.exec(pathname);
  if (match) {
    return {
      view: match[1] === "teacher" ? "teacher_coding_lab" : "student_coding_lab",
      codingLab: {
        projectId: match[2] || null,
        assignmentId: match[3] || null,
      },
      classSession: null,
    };
  }

  const classMatch = ONLINE_CLASS_PATH.exec(pathname);
  if (classMatch) {
    return {
      view: `online_class_${classMatch[2]}`,
      codingLab: { projectId: null, assignmentId: null },
      classSession: classMatch[1],
    };
  }

  if (pathname === "/internship" || pathname === "/internships" || pathname.startsWith("/internships/") || pathname.startsWith("/virtual-workplace/") || pathname === "/virtual-workplace") {
    return {
      view: "internship",
      codingLab: { projectId: null, assignmentId: null },
      classSession: null,
    };
  }

  return {
    view: routeToView[pathname] || "dashboard",
    codingLab: { projectId: null, assignmentId: null },
    classSession: null,
  };
}
