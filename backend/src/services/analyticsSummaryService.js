import {
  User,
  Student,
  Course,
  Assignment,
  Submission,
  AttendanceSession,
  LearningMaterial,
  AcademicCalendarEvent,
  Timetable,
  Exam,
  AdmissionApplication,
  Invoice,
  WorkflowCase,
} from "../models/index.js";

/**
 * Institution-wide dashboard statistics.
 *
 * Every number is counted from persisted MongoDB records. There are no
 * defaults that could mask an empty institution: a fresh installation reports
 * zeroes and the UI renders empty states.
 */
export async function getAnalyticsSummary() {
  const [
    totalUsers,
    totalStudents,
    activeStudents,
    openCases,
    closedCases,
    totalCourses,
    activeCourses,
    archivedCourses,
    totalAssignments,
    openAssignments,
    totalSubmissions,
    gradedSubmissions,
    totalAttendanceSessions,
    totalLearningMaterials,
    totalCalendarEvents,
    totalTimetableSessions,
    totalExaminations,
    publishedExaminations,
    totalAdmissionApplications,
    pendingAdmissionApplications,
    invoiceStats,
  ] = await Promise.all([
    User.countDocuments({ isActive: true }),
    Student.countDocuments(),
    Student.countDocuments({ status: "ACTIVE" }),
    WorkflowCase.countDocuments({ status: { $in: ["SUBMITTED", "IN_REVIEW", "MORE_INFO"] } }),
    WorkflowCase.countDocuments({ status: { $in: ["APPROVED", "REJECTED", "COMPLETED", "CANCELLED"] } }),
    Course.countDocuments(),
    Course.countDocuments({ status: "ACTIVE" }),
    Course.countDocuments({ status: "ARCHIVED" }),
    Assignment.countDocuments({ status: { $ne: "ARCHIVED" } }),
    Assignment.countDocuments({ status: "OPEN" }),
    Submission.countDocuments(),
    Submission.countDocuments({ status: "GRADED" }),
    AttendanceSession.countDocuments(),
    LearningMaterial.countDocuments({ status: { $ne: "ARCHIVED" } }),
    AcademicCalendarEvent.countDocuments({ status: { $ne: "CANCELLED" } }),
    Timetable.countDocuments({ archivedAt: null }),
    Exam.countDocuments(),
    Exam.countDocuments({ resultsStatus: "PUBLISHED" }),
    AdmissionApplication.countDocuments({ archivedAt: null }),
    AdmissionApplication.countDocuments({
      archivedAt: null,
      status: { $in: ["SUBMITTED", "VERIFIED"] },
    }),
    Invoice.aggregate([
      { $match: { status: { $ne: "VOID" } } },
      {
        $group: {
          _id: null,
          totalInvoiced: { $sum: "$totalAmount" },
          totalCollected: { $sum: "$paidAmount" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const stat = invoiceStats[0] || { totalInvoiced: 0, totalCollected: 0, count: 0 };
  const totalInvoiced = stat.totalInvoiced || 0;
  const totalCollected = stat.totalCollected || 0;

  return {
    totalUsers,
    totalStudents,
    activeStudents,
    totalCases: openCases + closedCases,
    openCases,
    closedCases,
    totalCourses,
    activeCourses,
    archivedCourses,
    totalAssignments,
    openAssignments,
    totalSubmissions,
    gradedSubmissions,
    totalAttendanceSessions,
    totalLearningMaterials,
    totalCalendarEvents,
    totalTimetableSessions,
    totalExaminations,
    publishedExaminations,
    totalAdmissionApplications,
    pendingAdmissionApplications,
    totalInvoices: stat.count || 0,
    totalInvoiced,
    totalCollected,
    outstandingBalance: Math.max(0, totalInvoiced - totalCollected),
  };
}