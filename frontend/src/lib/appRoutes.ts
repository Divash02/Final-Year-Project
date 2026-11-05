export interface CodingLabRoute {
  projectId: string | null;
  assignmentId: string | null;
}

export const routeToView: Record<string, string> = {
  "/": "dashboard",
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
  "/assignments": "assignments",
  "/materials": "materials",
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
  "/campus-extended": "campus_facilities_ext",
  "/campus/buildings": "campus_buildings",
  "/campus/laboratories": "campus_labs",
  "/campus/room-reservations": "campus_reservations",
  "/campus/maintenance": "campus_maintenance",
  "/campus/assets": "campus_assets",
  "/campus/transport": "campus_transport",
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

const CODING_LAB_PATH =
  /^\/(student|teacher)\/coding-lab(?:\/projects\/([A-Za-z0-9]+))?(?:\/assignments\/([A-Za-z0-9]+))?$/;

export function resolveRoute(pathname: string): {
  view: string;
  codingLab: CodingLabRoute;
} {
  const match = CODING_LAB_PATH.exec(pathname);
  if (match) {
    return {
      view: match[1] === "teacher" ? "teacher_coding_lab" : "student_coding_lab",
      codingLab: {
        projectId: match[2] || null,
        assignmentId: match[3] || null,
      },
    };
  }

  return {
    view: routeToView[pathname] || "dashboard",
    codingLab: { projectId: null, assignmentId: null },
  };
}
