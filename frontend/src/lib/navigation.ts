import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faGauge,
  faBookOpen,
  faCalendarDays,
  faUserCheck,
  faFilePen,
  faFolderOpen,
  faFileLines,
  faEnvelope,
  faComments,
  faBullhorn,
  faInbox,
  faFolder,
  faUser,
  faUsers,
  faUserPlus,
  faFileInvoiceDollar,
  faChartPie,
  faShieldHalved,
  faBook,
  faClipboardList,
  faFileImage,
  faCode,
  faBrain,
  faUserTie,
  faBriefcase,
  faHandshake,
  faGraduationCap,
  faHotel,
  faCar,
  faSitemap,
  faUserGroup,
  faFileContract,
  faIdCard,
  faFileAlt,
  faRoute,
  faWrench,
  faBoxes,
  faClipboardCheck,
  faCalendarCheck,
  faCircleExclamation,
  faSchool,
  faVideo,
  faExclamationTriangle,
  faCalendarAlt,
  faBriefcaseMedical,
  faAward,
  faShieldAlt,
  faScroll,
  faUniversity,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { UserRoleType } from "../types";

export interface NavItem {
  id: string;
  labelEn: string;
  labelNe: string;
  icon: IconDefinition;
  /** Permission required for this entry. Omitted entries are always visible. */
  permission?: string;
  /** Count badge source key resolved by the sidebar. */
  badge?: "pendingRequests" | "overdueInvoices";
  badgeTone?: "danger" | "warning" | "neutral";
}

/**
 * Standard navigation section identifiers. Every role portal groups its
 * pages under these five sections; a role only renders the sections that
 * contain at least one page the active role can access.
 */
export type NavSectionId =
  | "core-academic"
  | "people-enrolment"
  | "administration-governance"
  | "people-workforce"
  | "communication-engagement"
  | "campus-learning-services"
  | "account-personal";

export interface NavSection {
  id: NavSectionId;
  titleEn: string;
  titleNe: string;
  items: NavItem[];
}

/**
 * Authoritative labels for the five standard navigation sections. Defined
 * once here so every role portal uses identical heading text.
 */
export const STANDARD_NAV_SECTIONS: Record<
  NavSectionId,
  { titleEn: string; titleNe: string }
> = {
  "core-academic": {
    titleEn: "Core Academic Management",
    titleNe: "मुख्य शैक्षिक व्यवस्थापन",
  },
  "people-enrolment": {
    titleEn: "People & Enrolment",
    titleNe: "जनशक्ति तथा नामांकन",
  },
  "administration-governance": {
    titleEn: "Administration & Governance",
    titleNe: "प्रशासन तथा शासन",
  },
  "people-workforce": {
    titleEn: "People & Workforce",
    titleNe: "जनशक्ति",
  },
  "campus-learning-services": {
    titleEn: "Campus & Learning Services",
    titleNe: "क्याम्पस तथा सिकाइ सेवाहरू",
  },
  "communication-engagement": {
    titleEn: "Communication & Engagement",
    titleNe: "सञ्चार तथा सहभागिता",
  },
  "account-personal": {
    titleEn: "Account & Personal",
    titleNe: "खाता तथा व्यक्तिगत",
  },
};

export const STANDARD_NAV_SECTION_IDS = Object.keys(
  STANDARD_NAV_SECTIONS,
) as NavSectionId[];

/** Build a standard section, deriving its heading from the section id. */
function defineSection(id: NavSectionId, items: NavItem[]): NavSection {
  return { id, ...STANDARD_NAV_SECTIONS[id], items };
}

const dashboardItem = (labelEn: string, labelNe: string): NavItem => ({
  id: "dashboard",
  labelEn,
  labelNe,
  icon: faGauge,
});

const profileItem: NavItem = {
  id: "profile",
  labelEn: "Profile",
  labelNe: "प्रोफाइल",
  icon: faUser,
};

const intelligenceItem: NavItem = {
  id: "intelligence",
  labelEn: "AI Intelligence",
  labelNe: "कृत्रिम बुद्धिमत्ता",
  icon: faBrain,
  permission: "ai.view",
};

const earlyWarningItem: NavItem = {
  id: "early_warning",
  labelEn: "Early Warning System",
  labelNe: "अर्ली वार्निङ प्रणाली",
  icon: faExclamationTriangle,
  permission: "earlyWarning.view",
};

const studyPlannerItem: NavItem = {
  id: "study_planner",
  labelEn: "Smart Academic Planner",
  labelNe: "स्मार्ट शैक्षिक योजनाकार",
  icon: faCalendarAlt,
  permission: "studyPlanner.view",
};

const studentJourneyItem: NavItem = {
  id: "student_journey",
  labelEn: "Student Lifecycle",
  labelNe: "विद्यार्थी जीवनचक्र",
  icon: faGraduationCap,
  permission: "studentJourney.view",
};

const internshipItem: NavItem = {
  id: "internship",
  labelEn: "Internship Management",
  labelNe: "इन्टर्नशिप व्यवस्थापन",
  icon: faBriefcaseMedical,
  permission: "internship.view",
};

const researchItem: NavItem = {
  id: "research",
  labelEn: "Research & Projects",
  labelNe: "अनुसन्धान तथा परियोजना",
  icon: faGraduationCap,
  permission: "research.view",
};

const credentialsItem: NavItem = {
  id: "credentials",
  labelEn: "Digital Credentials",
  labelNe: "डिजिटल प्रमाणपत्र",
  icon: faAward,
  permission: "credentials.view",
};

const safetyItem: NavItem = {
  id: "safety",
  labelEn: "Campus Safety",
  labelNe: "क्याम्पस सुरक्षा",
  icon: faShieldAlt,
  permission: "safety.view",
};

const graduationItem: NavItem = {
  id: "graduation",
  labelEn: "Graduation & Convocation",
  labelNe: "स्नातक तथा दीक्षान्त",
  icon: faUniversity,
  permission: "graduation.view",
};

const connectItem: NavItem = {
  id: "connect",
  labelEn: "Techspire Meet",
  labelNe: "टेक्स्पायर मीट",
  icon: faVideo,
  permission: "connect.view",
};

const accountSection = (): NavSection => {
  return defineSection("account-personal", [profileItem]);
};

const workforceDashboardItem: NavItem = {
  id: "hr_dashboard",
  labelEn: "HR Dashboard",
  labelNe: "मानव संसाधन ड्यासबोर्ड",
  icon: faUserTie,
  permission: "hr.view",
};

const staffPortalDashboardItem: NavItem = {
  id: "staff_portal",
  labelEn: "Staff Portal",
  labelNe: "कर्मचारी पोर्टल",
  icon: faIdCard,
  permission: "staff.self.view",
};

const STUDENT_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Student Dashboard", "विद्यार्थी ड्यासबोर्ड"),
    { id: "learning", labelEn: "My Courses", labelNe: "मेरो विषयहरू", icon: faBookOpen, permission: "courses.view" },
    { id: "lms", labelEn: "Course LMS", labelNe: "पाठ्यक्रम LMS", icon: faClipboardList, permission: "lms.view" },
    { id: "timetable_attendance", labelEn: "My Timetable", labelNe: "समयतालिका", icon: faCalendarDays, permission: "timetable.view" },
    { id: "examination", labelEn: "Exams & Results", labelNe: "परीक्षा तथा नतिजा", icon: faFileLines, permission: "exams.view" },
    { id: "calendar_documents", labelEn: "Academic Calendar", labelNe: "शैक्षिक क्यालेन्डर", icon: faCalendarDays, permission: "calendar.view" },
    { id: "student_coding_lab", labelEn: "Online Coding Lab", labelNe: "अनलाइन कोडिङ ल्याब", icon: faCode, permission: "coding.lab.view" },
    studyPlannerItem,
  ]),
  defineSection("people-enrolment", [
    { id: "attendance_sheet", labelEn: "Attendance", labelNe: "उपस्थिति", icon: faUserCheck, permission: "attendance.view" },
  ]),
  defineSection("administration-governance", [
    {
      id: "finance",
      labelEn: "Fees & Payments",
      labelNe: "शुल्क तथा भुक्तानी",
      icon: faFileInvoiceDollar,
      permission: "finance.invoice.view",
      badge: "overdueInvoices",
      badgeTone: "danger",
    },
    {
      id: "requests",
      labelEn: "Student Requests",
      labelNe: "विद्यार्थी निवेदन",
      icon: faInbox,
      permission: "workflow.view",
      badge: "pendingRequests",
      badgeTone: "warning",
    },
    { id: "smart_documents", labelEn: "My Documents", labelNe: "कागजातहरू", icon: faFolder, permission: "documents.view" },
    { id: "library", labelEn: "Library", labelNe: "पुस्तकालय", icon: faBook, permission: "library.view" },
    studentJourneyItem,
    credentialsItem,
    earlyWarningItem,
    internshipItem,
    graduationItem,
    safetyItem,
    intelligenceItem,
  ]),
  defineSection("communication-engagement", [
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    { id: "messages", labelEn: "Messages", labelNe: "सन्देश", icon: faComments, permission: "messages.view" },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    connectItem,
  ]),
  accountSection(),
];

const FACULTY_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Faculty Dashboard", "संकाय ड्यासबोर्ड"),
    { id: "my_timetable", labelEn: "My Timetable", labelNe: "मेरो समयतालिका", icon: faCalendarDays, permission: "timetable.view" },
    { id: "learning", labelEn: "My Courses & LMS", labelNe: "पाठ्यक्रम तथा LMS", icon: faBookOpen, permission: "courses.view" },
    { id: "faculty_assessment", labelEn: "My Assessment & Marks", labelNe: "मेरो मूल्याङ्कन तथा प्राप्ताङ्क", icon: faFilePen, permission: "grade.enter" },
    { id: "student_progress", labelEn: "Student Progress & Analytics", labelNe: "विद्यार्थी प्रगति", icon: faChartPie, permission: "attendance.view.course" },
    { id: "faculty_alerts", labelEn: "Alerts & Review Queue", labelNe: "सूचना र समीक्षा", icon: faCircleExclamation, permission: "attendance.view.course" },
    { id: "teacher_coding_lab", labelEn: "Online Coding Lab", labelNe: "अनलाइन कोडिङ ल्याब", icon: faCode, permission: "coding.lab.view" },
    { id: "lms", labelEn: "Course Workspace", labelNe: "पाठ्यक्रम कार्यक्षेत्र", icon: faClipboardList, permission: "lms.view" },
    { id: "lesson_planning", labelEn: "Lesson Planning", labelNe: "पाठ योजना", icon: faCalendarCheck, permission: "lms.content.manage" },
    { id: "quizzes", labelEn: "Quizzes", labelNe: "क्विजहरू", icon: faClipboardCheck, permission: "lms.quiz.manage" },
    studyPlannerItem,
    earlyWarningItem,
  ]),
  defineSection("people-enrolment", [
    { id: "attendance_sheet", labelEn: "Mark Attendance", labelNe: "दैनिक उपस्थिति", icon: faUserCheck, permission: "attendance.view" },
    { id: "students", labelEn: "My Students", labelNe: "विद्यार्थी सूची", icon: faUsers, permission: "students.directory.view" },
    { id: "student_advising", labelEn: "Student Advising", labelNe: "विद्यार्थी परामर्श", icon: faUserGroup, permission: "student.view.assigned" },
  ]),
  defineSection("administration-governance", [
    { id: "faculty_workload", labelEn: "Faculty Workload", labelNe: "कार्यभार", icon: faBriefcase, permission: "lms.view" },
    { id: "leave_substitution", labelEn: "Leave & Substitution", labelNe: "बिदा तथा प्रतिस्थापन", icon: faFileContract, permission: "attendance.session.create" },
    { id: "resource_booking", labelEn: "Resource Booking", labelNe: "स्रोत आरक्षण", icon: faCalendarDays, permission: "facilities.view" },
    { id: "documents", labelEn: "Teaching Documents", labelNe: "कागजातहरू", icon: faFolder, permission: "documents.view" },
    studentJourneyItem,
    researchItem,
    internshipItem,
    intelligenceItem,
  ]),
  defineSection("communication-engagement", [
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    { id: "messages", labelEn: "Messages", labelNe: "सन्देश", icon: faComments, permission: "messages.view" },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    {
      id: "requests",
      labelEn: "Student Requests",
      labelNe: "निवेदनहरू",
      icon: faInbox,
      permission: "workflow.view",
      badge: "pendingRequests",
      badgeTone: "warning",
    },
    connectItem,
  ]),
  defineSection("campus-learning-services", [
    { id: "research_projects", labelEn: "Research & Projects", labelNe: "अनुसन्धान तथा परियोजना", icon: faGraduationCap, permission: "lms.view" },
  ]),
  accountSection(),
];

const EXAM_OFFICER_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Exam Dashboard", "परीक्षा ड्यासबोर्ड"),
    { id: "examination", labelEn: "Official Examinations", labelNe: "परीक्षा तथा नतिजा", icon: faFileLines, permission: "exams.view" },
    { id: "faculty_assessment", labelEn: "Assessment & Marks Review", labelNe: "मूल्याङ्कन तथा प्राप्ताङ्क समीक्षा", icon: faFilePen, permission: "exam.manageResults" },
    { id: "timetable_attendance", labelEn: "Exam Sessions & Timetable", labelNe: "परीक्षा समयतालिका", icon: faCalendarDays, permission: "timetable.view" },
    { id: "learning", labelEn: "Curriculum & Courses", labelNe: "पाठ्यक्रम तथा विषयहरू", icon: faBookOpen, permission: "courses.view" },
    { id: "quizzes", labelEn: "Quizzes", labelNe: "क्विजहरू", icon: faClipboardList, permission: "lms.quiz.manage" },
    earlyWarningItem,
    graduationItem,
  ]),
  defineSection("people-enrolment", [
    { id: "attendance_sheet", labelEn: "Exam Eligibility Check", labelNe: "योग्यता प्रमाणीकरण", icon: faUserCheck, permission: "attendance.view" },
    { id: "students", labelEn: "Exam Candidates Directory", labelNe: "परीक्षार्थी निर्देशिका", icon: faUsers, permission: "students.directory.view" },
  ]),
  defineSection("administration-governance", [
    { id: "analytics", labelEn: "Exam Analytics & Audit", labelNe: "परीक्षा विश्लेषण तथा अडिट", icon: faChartPie, permission: "analytics.view" },
    intelligenceItem,
    studentJourneyItem,
  ]),
  defineSection("communication-engagement", [
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    { id: "messages", labelEn: "Messages", labelNe: "सन्देश", icon: faComments, permission: "messages.view" },
    { id: "notices", labelEn: "Exam Notices", labelNe: "परीक्षा सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    connectItem,
  ]),
  accountSection(),
];

const DEPARTMENT_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Department Dashboard", "विभाग ड्यासबोर्ड"),
    { id: "learning", labelEn: "Department Courses", labelNe: "विभागीय विषयहरू", icon: faBookOpen, permission: "courses.view" },
    { id: "timetable_attendance", labelEn: "Department Timetable", labelNe: "समयतालिका", icon: faCalendarDays, permission: "timetable.view" },
    { id: "examination", labelEn: "Examinations & Results", labelNe: "परीक्षा तथा नतिजा", icon: faFileLines, permission: "exams.view" },
    { id: "calendar_documents", labelEn: "Academic Calendar", labelNe: "शैक्षिक क्यालेन्डर", icon: faCalendarDays, permission: "calendar.manage" },
    { id: "quizzes", labelEn: "Quizzes", labelNe: "क्विजहरू", icon: faClipboardList, permission: "lms.quiz.manage" },
    earlyWarningItem,
  ]),
  defineSection("people-enrolment", [
    { id: "attendance_sheet", labelEn: "Attendance Monitoring", labelNe: "उपस्थिति अनुगमन", icon: faUserCheck, permission: "attendance.view" },
    { id: "students", labelEn: "Department Students", labelNe: "विद्यार्थीहरू", icon: faUsers, permission: "students.directory.view" },
  ]),
  defineSection("administration-governance", [
    { id: "analytics", labelEn: "Department Reports", labelNe: "विभागीय प्रतिवेदन", icon: faChartPie, permission: "analytics.view" },
    intelligenceItem,
    studentJourneyItem,
    researchItem,
    internshipItem,
  ]),
  defineSection("communication-engagement", [
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    {
      id: "requests",
      labelEn: "Department Requests",
      labelNe: "निवेदनहरू",
      icon: faInbox,
      permission: "workflow.view",
      badge: "pendingRequests",
      badgeTone: "warning",
    },
    connectItem,
  ]),
  accountSection(),
];

const REGISTRAR_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Registrar Dashboard", "रजिस्ट्रार ड्यासबोर्ड"),
    { id: "learning", labelEn: "Curriculum & Programs", labelNe: "पाठ्यक्रम तथा कार्यक्रम", icon: faBookOpen, permission: "courses.view" },
    { id: "examination", labelEn: "Academic Records & Results", labelNe: "शैक्षिक नतिजा अभिलेख", icon: faFileLines, permission: "exams.view" },
    { id: "timetable_attendance", labelEn: "Academic Timetable", labelNe: "शैक्षिक समयतालिका", icon: faCalendarDays, permission: "timetable.view" },
    { id: "calendar_documents", labelEn: "Academic Calendar", labelNe: "शैक्षिक क्यालेन्चर", icon: faCalendarDays, permission: "calendar.manage" },
    { id: "quizzes", labelEn: "Quizzes", labelNe: "क्विजहरू", icon: faClipboardList, permission: "lms.quiz.manage" },
    earlyWarningItem,
    graduationItem,
    credentialsItem,
  ]),
  defineSection("people-enrolment", [
    { id: "students", labelEn: "Official Student Records", labelNe: "विद्यार्थी अभिलेख", icon: faUsers, permission: "students.directory.view" },
    { id: "admissions", labelEn: "Admissions & Enrollment", labelNe: "भर्ना तथा दर्ता", icon: faUserPlus, permission: "admissions.application.view" },
    studentJourneyItem,
  ]),
  defineSection("administration-governance", [
    { id: "documents", labelEn: "Institutional Documents", labelNe: "कागजातहरू", icon: faFolder, permission: "documents.view" },
    { id: "analytics", labelEn: "Academic Audit & Reports", labelNe: "शैक्षिक अडिट तथा प्रतिवेदन", icon: faChartPie, permission: "analytics.view" },
    intelligenceItem,
    researchItem,
    internshipItem,
  ]),
  defineSection("communication-engagement", [
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    { id: "notices", labelEn: "Official Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    {
      id: "requests",
      labelEn: "Academic Requests",
      labelNe: "शैक्षिक निवेदन",
      icon: faInbox,
      permission: "workflow.view",
      badge: "pendingRequests",
      badgeTone: "warning",
    },
    connectItem,
  ]),
  accountSection(),
];

const FINANCE_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Finance Dashboard", "वित्त ड्यासबोर्ड"),
    earlyWarningItem,
    graduationItem,
  ]),
  defineSection("people-enrolment", [
    { id: "students", labelEn: "Student Financial Profiles", labelNe: "विद्यार्थी खाता", icon: faUsers, permission: "students.directory.view" },
    studentJourneyItem,
  ]),
  defineSection("administration-governance", [
    {
      id: "finance",
      labelEn: "Invoices & Payments",
      labelNe: "बिल तथा भुक्तानी",
      icon: faFileInvoiceDollar,
      permission: "finance.invoice.view",
      badge: "overdueInvoices",
      badgeTone: "danger",
    },
    { id: "analytics", labelEn: "Revenue & Financial Audit", labelNe: "वित्तीय विश्लेषण", icon: faChartPie, permission: "analytics.view" },
    intelligenceItem,
    safetyItem,
  ]),
  defineSection("communication-engagement", [
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    { id: "requests", labelEn: "Finance Requests", labelNe: "वित्तीय निवेदन", icon: faInbox, permission: "workflow.view" },
    connectItem,
  ]),
  accountSection(),
];

const CAMPUS_ADMIN_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Campus Dashboard", "क्याम्पस ड्यासबोर्ड"),
    { id: "timetable_attendance", labelEn: "Room Allocations", labelNe: "कोठा विनियोजन", icon: faCalendarDays, permission: "timetable.view" },
    { id: "examination", labelEn: "Exam Venues Support", labelNe: "परीक्षा हल सहायता", icon: faFileLines, permission: "exams.view" },
    earlyWarningItem,
  ]),
  defineSection("people-enrolment", [
    { id: "students", labelEn: "Campus Directory", labelNe: "निर्देशिका", icon: faUsers, permission: "students.directory.view" },
    studentJourneyItem,
  ]),
  defineSection("administration-governance", [
    { id: "analytics", labelEn: "Campus Reports", labelNe: "क्याम्पस प्रतिवेदन", icon: faChartPie, permission: "analytics.view" },
    intelligenceItem,
    safetyItem,
  ]),
  defineSection("campus-learning-services", [
    { id: "library", labelEn: "Library", labelNe: "पुस्तकालय", icon: faBook, permission: "library.view" },
    { id: "campus_buildings", labelEn: "Buildings & Classrooms", labelNe: "भवन तथा कक्षाहरू", icon: faSchool, permission: "facilities.view" },
    { id: "campus_labs", labelEn: "Laboratories & Equipment", labelNe: "प्रयोगशाला तथा उपकरण", icon: faBoxes, permission: "facilities.view" },
    { id: "campus_reservations", labelEn: "Room Reservations", labelNe: "कोठा आरक्षण", icon: faCalendarCheck, permission: "facilities.view" },
    { id: "campus_maintenance", labelEn: "Maintenance Management", labelNe: "मर्मत व्यवस्थापन", icon: faWrench, permission: "facilities.view" },
    { id: "campus_assets", labelEn: "Assets & Inventory", labelNe: "सम्पत्ति तथा सूची", icon: faBoxes, permission: "facilities.view" },
    { id: "campus_transport", labelEn: "Transport Management", labelNe: "यातायात व्यवस्थापन", icon: faCar, permission: "facilities.view" },
  ]),
  defineSection("communication-engagement", [
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    {
      id: "requests",
      labelEn: "Facility Requests",
      labelNe: "मर्मत निवेदन",
      icon: faInbox,
      permission: "workflow.view",
      badge: "pendingRequests",
      badgeTone: "warning",
    },
    connectItem,
  ]),
  accountSection(),
];

const DEAN_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Dean Dashboard", "डीन ड्यासबोर्ड"),
    { id: "learning", labelEn: "Curriculum & Programs", labelNe: "पाठ्यक्रम तथा कार्यक्रम", icon: faBookOpen, permission: "courses.view" },
    { id: "examination", labelEn: "Examinations Oversight", labelNe: "परीक्षा तथा मूल्याङ्कन", icon: faFileLines, permission: "exams.view" },
    { id: "timetable_attendance", labelEn: "Academic Timetable", labelNe: "समयतालिका", icon: faCalendarDays, permission: "timetable.view" },
    { id: "calendar_documents", labelEn: "Academic Calendar", labelNe: "शैक्षिक क्यालेन्चर", icon: faCalendarDays, permission: "calendar.manage" },
    { id: "quizzes", labelEn: "Quizzes", labelNe: "क्विजहरू", icon: faClipboardList, permission: "lms.quiz.manage" },
    earlyWarningItem,
    studentJourneyItem,
  ]),
  defineSection("people-enrolment", [
    { id: "students", labelEn: "Faculty Students", labelNe: "विद्यार्थीहरू", icon: faUsers, permission: "students.directory.view" },
    internshipItem,
  ]),
  defineSection("administration-governance", [
    { id: "analytics", labelEn: "School Analytics & Audit", labelNe: "संकाय विश्लेषण", icon: faChartPie, permission: "analytics.view" },
    intelligenceItem,
    researchItem,
    credentialsItem,
  ]),
  defineSection("communication-engagement", [
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    {
      id: "requests",
      labelEn: "Faculty Requests",
      labelNe: "निवेदनहरू",
      icon: faInbox,
      permission: "workflow.view",
      badge: "pendingRequests",
      badgeTone: "warning",
    },
    connectItem,
  ]),
  accountSection(),
];

/**
 * Parent/guardian navigation. Parent is a genuine read-only role, so it gets
 * an explicit menu instead of falling through to the administrative default.
 */
const PARENT_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Parent Dashboard", "अभिभावक ड्यासबोर्ड"),
    { id: "timetable_attendance", labelEn: "Academic Timetable", labelNe: "समयतालिका", icon: faCalendarDays, permission: "timetable.view" },
    { id: "examination", labelEn: "Examinations & Results", labelNe: "परीक्षा तथा नतिजा", icon: faFileLines, permission: "exams.view" },
    earlyWarningItem,
  ]),
  defineSection("administration-governance", [
    { id: "documents", labelEn: "My Documents", labelNe: "मेरा कागजातहरू", icon: faFolderOpen, permission: "documents.view" },
    credentialsItem,
    safetyItem,
    graduationItem,
  ]),
  defineSection("communication-engagement", [
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    {
      id: "requests",
      labelEn: "My Requests",
      labelNe: "मेरा निवेदनहरू",
      icon: faInbox,
      permission: "workflow.view",
    },
  ]),
  accountSection(),
];

const SUPER_ADMIN_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Institution Dashboard", "संस्था ड्यासबोर्ड"),
    { id: "learning", labelEn: "Courses & Curriculum", labelNe: "पाठ्यक्रम तथा विषयहरू", icon: faBookOpen, permission: "courses.view" },
    { id: "lms", labelEn: "Course Workspaces", labelNe: "पाठ्यक्रम कार्यक्षेत्र", icon: faClipboardList, permission: "lms.view" },
    { id: "timetable_attendance", labelEn: "Timetable & Sessions", labelNe: "समयतालिका तथा कक्षा", icon: faCalendarDays, permission: "timetable.view" },
    { id: "calendar_documents", labelEn: "Academic Calendar", labelNe: "शैक्षिक क्यालेन्चर", icon: faCalendarDays, permission: "calendar.manage" },
    { id: "examination", labelEn: "Examinations Suite", labelNe: "परीक्षा व्यवस्थापन", icon: faFileLines, permission: "exams.view" },
    { id: "quizzes", labelEn: "Quizzes", labelNe: "क्विजहरू", icon: faClipboardList, permission: "lms.quiz.manage" },
    earlyWarningItem,
    studyPlannerItem,
    studentJourneyItem,
    graduationItem,
  ]),
  defineSection("people-enrolment", [
    { id: "students", labelEn: "Student Directory", labelNe: "विद्यार्थी निर्देशिका", icon: faUsers, permission: "students.directory.view" },
    { id: "admissions", labelEn: "Admissions Workflow", labelNe: "भर्ना प्रक्रिया", icon: faUserPlus, permission: "admissions.application.view" },
    { id: "attendance_sheet", labelEn: "Attendance Records", labelNe: "दैनिक उपस्थिती", icon: faUserCheck, permission: "attendance.view" },
    { id: "student_lifecycle", labelEn: "Student Lifecycle Management", labelNe: "विद्यार्थी जीवनचक्र व्यवस्थापन", icon: faGraduationCap, permission: "students.directory.view" },
    internshipItem,
  ]),
  defineSection("administration-governance", [
    { id: "user_management", labelEn: "User & Role Management", labelNe: "प्रयोगकर्ता तथा भूमिका", icon: faShieldHalved, permission: "accounts.manage" },
    {
      id: "finance",
      labelEn: "Finance & Invoices",
      labelNe: "वित्त तथा शुल्क",
      icon: faFileInvoiceDollar,
      permission: "finance.invoice.view",
      badge: "overdueInvoices",
      badgeTone: "danger",
    },
    { id: "analytics", labelEn: "Analytics & Audit Logs", labelNe: "विश्लेषण तथा अडिट", icon: faChartPie, permission: "analytics.view" },
    { id: "intelligence", labelEn: "AI Intelligence", labelNe: "कृत्रिम बुद्धिमत्ता", icon: faBrain, permission: "ai.view" },
    { id: "workflow_automation", labelEn: "Workflow Automation", labelNe: "कार्यप्रवाह स्वचालन", icon: faSitemap, permission: "workflow.manage" },
    { id: "smart_documents", labelEn: "Smart Document Centre", labelNe: "स्मार्ट कागजात केन्द्र", icon: faFileAlt, permission: "documents.view" },
    researchItem,
    credentialsItem,
    safetyItem,
  ]),
  defineSection("people-workforce", [
    workforceDashboardItem,
  ]),
  defineSection("campus-learning-services", [
    { id: "library", labelEn: "Library", labelNe: "पुस्तकालय", icon: faBook, permission: "library.view" },
    { id: "campus_buildings", labelEn: "Buildings & Classrooms", labelNe: "भवन तथा कक्षाहरू", icon: faSchool, permission: "facilities.view" },
    { id: "campus_labs", labelEn: "Laboratories & Equipment", labelNe: "प्रयोगशाला तथा उपकरण", icon: faBoxes, permission: "facilities.view" },
    { id: "campus_reservations", labelEn: "Room Reservations", labelNe: "कोठा आरक्षण", icon: faCalendarCheck, permission: "facilities.view" },
    { id: "campus_maintenance", labelEn: "Maintenance Management", labelNe: "मर्मत व्यवस्थापन", icon: faWrench, permission: "facilities.view" },
    { id: "campus_assets", labelEn: "Assets & Inventory", labelNe: "सम्पत्ति तथा सूची", icon: faBoxes, permission: "facilities.view" },
    { id: "campus_transport", labelEn: "Transport Management", labelNe: "यातायात व्यवस्थापन", icon: faCar, permission: "facilities.view" },
  ]),
  defineSection("communication-engagement", [
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    { id: "messages", labelEn: "Messages", labelNe: "सन्देश", icon: faComments, permission: "messages.view" },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    {
      id: "requests",
      labelEn: "Requests & Cases",
      labelNe: "निवेदन तथा केस",
      icon: faInbox,
      permission: "workflow.view",
      badge: "pendingRequests",
      badgeTone: "warning",
    },
    connectItem,
  ]),
  defineSection("account-personal", [
    { id: "profile", labelEn: "My Profile", labelNe: "मेरो प्रोफाइल", icon: faUser },
  ]),
];

const SECURITY_STAFF_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Security Dashboard", "सुरक्षा ड्यासबोर्ड"),
    earlyWarningItem,
    studentJourneyItem,
  ]),
  defineSection("people-enrolment", [
    { id: "students", labelEn: "Campus Directory", labelNe: "निर्देशिका", icon: faUsers, permission: "students.directory.view" },
  ]),
  defineSection("administration-governance", [
    { id: "analytics", labelEn: "Campus Reports", labelNe: "क्याम्पस प्रतिवेदन", icon: faChartPie, permission: "analytics.view" },
    intelligenceItem,
    safetyItem,
  ]),
  defineSection("communication-engagement", [
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    {
      id: "requests",
      labelEn: "Safety Requests",
      labelNe: "सुरक्षा निवेदन",
      icon: faInbox,
      permission: "workflow.view",
      badge: "pendingRequests",
      badgeTone: "warning",
    },
    connectItem,
  ]),
  accountSection(),
];

/** Role-aware navigation with permission filtering applied by the sidebar. */
export function getNavSectionsForRole(role: UserRoleType): NavSection[] {
  switch (role) {
    case "student":
      return STUDENT_NAV;
    case "faculty":
      return FACULTY_NAV;
    case "exam_officer":
      return EXAM_OFFICER_NAV;
    case "program_coordinator":
    case "hod":
      return DEPARTMENT_NAV;
    case "registrar":
      return REGISTRAR_NAV;
    case "finance_officer":
      return FINANCE_NAV;
    case "parent":
      return PARENT_NAV;
    case "campus_admin":
      return CAMPUS_ADMIN_NAV;
    case "dean":
      return DEAN_NAV;
    case "security_staff":
      return SECURITY_STAFF_NAV;
    case "super_admin":
    default:
      return SUPER_ADMIN_NAV;
  }
}

/**
 * Resolve the sections a role may actually see: items are filtered against
 * the session user's granted permissions, duplicate ids keep their first
 * occurrence, and sections left without any visible item are dropped so no
 * empty heading is rendered. Authorization itself remains enforced by the
 * backend on every request.
 */
export function getVisibleNavSectionsForRole(
  role: UserRoleType,
  permissions: ReadonlySet<string> | readonly string[],
): NavSection[] {
  const granted =
    permissions instanceof Set ? permissions : new Set(permissions);
  const seen = new Set<string>();

  return getNavSectionsForRole(role)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (seen.has(item.id)) return false;
        if (item.permission && !granted.has(item.permission)) return false;
        seen.add(item.id);
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);
}
