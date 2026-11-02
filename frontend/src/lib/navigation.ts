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
  faBuilding,
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
  faBell,
  faKey,
  faFileAlt,
  faRoute,
  faWrench,
  faBoxes,
  faClipboardCheck,
  faCalendarCheck,
  faSchool,
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

const accountSection = (): NavSection => {
  return defineSection("account-personal", [
    profileItem,
    { id: "my_documents", labelEn: "My Documents", labelNe: "मेरो कागजातहरू", icon: faFolder, permission: "documents.view" },
    { id: "notification_preferences", labelEn: "Notification Preferences", labelNe: "सूचना प्राथमिकताहरू", icon: faBell },
    { id: "security_sessions", labelEn: "Security & Sessions", labelNe: "सुरक्षा र सत्रहरू", icon: faKey },
  ]);
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
    { id: "documents", labelEn: "My Documents", labelNe: "कागजातहरू", icon: faFolder, permission: "documents.view" },
    { id: "library", labelEn: "Library", labelNe: "पुस्तकालय", icon: faBook, permission: "library.view" },
    intelligenceItem,
  ]),
  defineSection("communication-engagement", [
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    { id: "messages", labelEn: "Messages", labelNe: "सन्देश", icon: faComments, permission: "messages.view" },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
  ]),
  accountSection(),
];

const FACULTY_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Faculty Dashboard", "संकाय ड्यासबोर्ड"),
    /**
     * `my_timetable` is a view of its own rather than the shared
     * `timetable_attendance` entry: that id is claimed by nine role menus and
     * renders the attendance register, which answers a different question from
     * "what am I teaching, and when". A teacher arriving here gets their own
     * schedule, and reaches the register from a class in it.
     */
    { id: "my_timetable", labelEn: "My Timetable", labelNe: "मेरो समयतालिका", icon: faCalendarDays, permission: "timetable.view" },
    { id: "learning", labelEn: "My Courses & LMS", labelNe: "पाठ्यक्रम तथा LMS", icon: faBookOpen, permission: "courses.view" },
    { id: "lms", labelEn: "Course Workspace", labelNe: "पाठ्यक्रम कार्यक्षेत्र", icon: faClipboardList, permission: "lms.view" },
    { id: "quizzes", labelEn: "Quizzes", labelNe: "क्विजहरू", icon: faClipboardList, permission: "lms.quiz.manage" },
    { id: "faculty_assessment", labelEn: "My Assessment & Marks", labelNe: "मेरो मूल्याङ्कन तथा प्राप्ताङ्क", icon: faFilePen, permission: "grade.enter" },
    { id: "teacher_coding_lab", labelEn: "Online Coding Lab", labelNe: "अनलाइन कोडिङ ल्याब", icon: faCode, permission: "coding.lab.view" },
  ]),
  defineSection("people-enrolment", [
    { id: "attendance_sheet", labelEn: "Mark Attendance", labelNe: "दैनिक उपस्थिति", icon: faUserCheck, permission: "attendance.view" },
    { id: "timetable_attendance", labelEn: "All Classes & Registers", labelNe: "कक्षा दर्ता", icon: faClipboardList, permission: "attendance.view" },
    { id: "students", labelEn: "My Students", labelNe: "विद्यार्थी सूची", icon: faUsers, permission: "students.directory.view" },
  ]),
  defineSection("administration-governance", [
    { id: "documents", labelEn: "Teaching Documents", labelNe: "कागजातहरू", icon: faFolder, permission: "documents.view" },
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
  ]),
  defineSection("people-enrolment", [
    { id: "attendance_sheet", labelEn: "Exam Eligibility Check", labelNe: "योग्यता प्रमाणीकरण", icon: faUserCheck, permission: "attendance.view" },
    { id: "students", labelEn: "Exam Candidates Directory", labelNe: "परीक्षार्थी निर्देशिका", icon: faUsers, permission: "students.directory.view" },
  ]),
  defineSection("administration-governance", [
    { id: "analytics", labelEn: "Exam Analytics & Audit", labelNe: "परीक्षा विश्लेषण तथा अडिट", icon: faChartPie, permission: "analytics.view" },
    intelligenceItem,
  ]),
  defineSection("communication-engagement", [
    { id: "notices", labelEn: "Exam Notices", labelNe: "परीक्षा सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
    { id: "messages", labelEn: "Messages", labelNe: "सन्देश", icon: faComments, permission: "messages.view" },
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
  ]),
  defineSection("people-enrolment", [
    { id: "attendance_sheet", labelEn: "Attendance Monitoring", labelNe: "उपस्थिति अनुगमन", icon: faUserCheck, permission: "attendance.view" },
    { id: "students", labelEn: "Department Students", labelNe: "विद्यार्थीहरू", icon: faUsers, permission: "students.directory.view" },
  ]),
  defineSection("administration-governance", [
    { id: "analytics", labelEn: "Department Reports", labelNe: "विभागीय प्रतिवेदन", icon: faChartPie, permission: "analytics.view" },
    intelligenceItem,
  ]),
  defineSection("communication-engagement", [
    {
      id: "requests",
      labelEn: "Department Requests",
      labelNe: "निवेदनहरू",
      icon: faInbox,
      permission: "workflow.view",
      badge: "pendingRequests",
      badgeTone: "warning",
    },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
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
  ]),
  defineSection("people-enrolment", [
    { id: "students", labelEn: "Official Student Records", labelNe: "विद्यार्थी अभिलेख", icon: faUsers, permission: "students.directory.view" },
    { id: "admissions", labelEn: "Admissions & Enrollment", labelNe: "भर्ना तथा दर्ता", icon: faUserPlus, permission: "admissions.application.view" },
  ]),
  defineSection("administration-governance", [
    { id: "documents", labelEn: "Institutional Documents", labelNe: "कागजातहरू", icon: faFolder, permission: "documents.view" },
    { id: "analytics", labelEn: "Academic Audit & Reports", labelNe: "शैक्षिक अडिट तथा प्रतिवेदन", icon: faChartPie, permission: "analytics.view" },
    intelligenceItem,
  ]),
  defineSection("communication-engagement", [
    {
      id: "requests",
      labelEn: "Academic Requests",
      labelNe: "शैक्षिक निवेदन",
      icon: faInbox,
      permission: "workflow.view",
      badge: "pendingRequests",
      badgeTone: "warning",
    },
    { id: "notices", labelEn: "Official Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
  ]),
  accountSection(),
];

const FINANCE_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Finance Dashboard", "वित्त ड्यासबोर्ड"),
  ]),
  defineSection("people-enrolment", [
    { id: "students", labelEn: "Student Financial Profiles", labelNe: "विद्यार्थी खाता", icon: faUsers, permission: "students.directory.view" },
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
  ]),
  defineSection("communication-engagement", [
    { id: "requests", labelEn: "Finance Requests", labelNe: "वित्तीय निवेदन", icon: faInbox, permission: "workflow.view" },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
  ]),
  accountSection(),
];

const CAMPUS_ADMIN_NAV: NavSection[] = [
  defineSection("core-academic", [
    dashboardItem("Campus Dashboard", "क्याम्पस ड्यासबोर्ड"),
    { id: "timetable_attendance", labelEn: "Room Allocations", labelNe: "कोठा विनियोजन", icon: faCalendarDays, permission: "timetable.view" },
    { id: "examination", labelEn: "Exam Venues Support", labelNe: "परीक्षा हल सहायता", icon: faFileLines, permission: "exams.view" },
  ]),
  defineSection("people-enrolment", [
    { id: "students", labelEn: "Campus Directory", labelNe: "निर्देशिका", icon: faUsers, permission: "students.directory.view" },
  ]),
  defineSection("administration-governance", [
    { id: "facilities_library", labelEn: "Buildings & Rooms", labelNe: "भवन तथा कोठाहरू", icon: faBuilding, permission: "library.view" },
    { id: "analytics", labelEn: "Campus Reports", labelNe: "क्याम्पस प्रतिवेदन", icon: faChartPie, permission: "analytics.view" },
    intelligenceItem,
  ]),
  defineSection("communication-engagement", [
    {
      id: "requests",
      labelEn: "Facility Requests",
      labelNe: "मर्मत निवेदन",
      icon: faInbox,
      permission: "workflow.view",
      badge: "pendingRequests",
      badgeTone: "warning",
    },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
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
  ]),
  defineSection("people-enrolment", [
    { id: "students", labelEn: "Faculty Students", labelNe: "विद्यार्थीहरू", icon: faUsers, permission: "students.directory.view" },
  ]),
  defineSection("administration-governance", [
    { id: "analytics", labelEn: "School Analytics & Audit", labelNe: "संकाय विश्लेषण", icon: faChartPie, permission: "analytics.view" },
    intelligenceItem,
  ]),
  defineSection("communication-engagement", [
    {
      id: "requests",
      labelEn: "Faculty Requests",
      labelNe: "निवेदनहरू",
      icon: faInbox,
      permission: "workflow.view",
      badge: "pendingRequests",
      badgeTone: "warning",
    },
    { id: "notices", labelEn: "Notices", labelNe: "सूचनाहरू", icon: faBullhorn, permission: "notices.view" },
    { id: "communication", labelEn: "College Mail", labelNe: "कलेज मेल", icon: faEnvelope, permission: "mail.view" },
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
  ]),
  defineSection("administration-governance", [
    { id: "documents", labelEn: "My Documents", labelNe: "मेरा कागजातहरू", icon: faFolderOpen, permission: "documents.view" },
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
  ]),
  defineSection("people-enrolment", [
    { id: "students", labelEn: "Student Directory", labelNe: "विद्यार्थी निर्देशिका", icon: faUsers, permission: "students.directory.view" },
    { id: "admissions", labelEn: "Admissions Workflow", labelNe: "भर्ना प्रक्रिया", icon: faUserPlus, permission: "admissions.application.view" },
    { id: "attendance_sheet", labelEn: "Attendance Records", labelNe: "दैनिक उपस्थिती", icon: faUserCheck, permission: "attendance.view" },
    { id: "student_lifecycle", labelEn: "Student Lifecycle Management", labelNe: "विद्यार्थी जीवनचक्र व्यवस्थापन", icon: faGraduationCap, permission: "students.directory.view" },
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
    { id: "facilities_library", labelEn: "Campus & Facilities", labelNe: "क्याम्पस तथा सुविधा", icon: faBuilding, permission: "library.view" },
    { id: "campus_buildings", labelEn: "Buildings & Classrooms", labelNe: "भवन तथा कक्षाहरू", icon: faSchool, permission: "library.view" },
    { id: "campus_labs", labelEn: "Laboratories & Equipment", labelNe: "प्रयोगशाला तथा उपकरण", icon: faBoxes, permission: "library.view" },
    { id: "campus_reservations", labelEn: "Room Reservations", labelNe: "कोठा आरक्षण", icon: faCalendarCheck, permission: "library.view" },
    { id: "campus_maintenance", labelEn: "Maintenance Management", labelNe: "मर्मत व्यवस्थापन", icon: faWrench, permission: "library.view" },
    { id: "campus_assets", labelEn: "Assets & Inventory", labelNe: "सम्पत्ति तथा सूची", icon: faBoxes, permission: "library.view" },
    { id: "campus_transport", labelEn: "Transport Management", labelNe: "यातायात व्यवस्थापन", icon: faCar, permission: "library.view" },
    { id: "analytics", labelEn: "Analytics & Audit Logs", labelNe: "विश्लेषण तथा अडिट", icon: faChartPie, permission: "analytics.view" },
    { id: "intelligence", labelEn: "AI Intelligence", labelNe: "कृत्रिम बुद्धिमत्ता", icon: faBrain, permission: "ai.view" },
    { id: "workflow_automation", labelEn: "Workflow Automation", labelNe: "कार्यप्रवाह स्वचालन", icon: faSitemap, permission: "workflow.manage" },
    { id: "smart_documents", labelEn: "Smart Document Centre", labelNe: "स्मार्ट कागजात केन्द्र", icon: faFileAlt, permission: "documents.view" },
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
  ]),
  defineSection("account-personal", [
    { id: "profile", labelEn: "My Profile", labelNe: "मेरो प्रोफाइल", icon: faUser },
    { id: "my_documents", labelEn: "My Documents", labelNe: "मेरो कागजातहरू", icon: faFolder, permission: "documents.view" },
    { id: "notification_preferences", labelEn: "Notification Preferences", labelNe: "सूचना प्राथमिकताहरू", icon: faBell },
    { id: "security_sessions", labelEn: "Security & Sessions", labelNe: "सुरक्षा र सत्रहरू", icon: faKey },
  ]),
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
