import {
  User,
  Student,
  Course,
  Department,
  Program,
  Attendance,
  AttendanceSession,
  Assignment,
  Submission,
  Exam,
  ExamResult,
  Invoice,
  Payment,
  WorkflowCase,
  AdmissionApplication,
  AuditLog,
  SecurityEvent,
} from "../models/index.js";

/**
 * Calculates detailed institutional analytics from persisted MongoDB records.
 * Follows CollegeOS data integrity principles: strictly computes from persisted records.
 * Never invents mock or simulated historical figures.
 */
export async function getDetailedInstitutionalAnalytics(filters = {}) {
  const { department, program, semester, startDate, endDate } = filters;

  // Build date filter if provided
  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) dateQuery.$lte = new Date(endDate);
  const hasDateFilter = Object.keys(dateQuery).length > 0;

  // 1. Identity & Users Overview
  const [
    totalUsers,
    activeUsers,
    userRolesRaw,
    totalStudents,
    activeStudents,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.aggregate([
      { $unwind: "$roles" },
      { $group: { _id: "$roles", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Student.countDocuments(),
    Student.countDocuments({ status: "ACTIVE" }),
  ]);

  const userDistribution = userRolesRaw.map((r) => ({
    role: r._id,
    label: r._id.replace("_", " ").toUpperCase(),
    count: r.count,
  }));

  // 2. Academic: Courses
  const courseMatch = {};
  if (department) courseMatch.department = department;

  const [
    totalCourses,
    activeCourses,
    archivedCourses,
    coursesByDeptRaw,
    coursesByStatusRaw,
  ] = await Promise.all([
    Course.countDocuments(courseMatch),
    Course.countDocuments({ ...courseMatch, status: "ACTIVE" }),
    Course.countDocuments({ ...courseMatch, status: "ARCHIVED" }),
    Course.aggregate([
      { $match: courseMatch },
      {
        $group: {
          _id: { $ifNull: ["$department", "General Academics"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Course.aggregate([
      { $match: courseMatch },
      { $group: { _id: { $ifNull: ["$status", "ACTIVE"] }, count: { $sum: 1 } } },
    ]),
  ]);

  const coursesByDepartment = coursesByDeptRaw.map((d) => ({
    name: String(d._id),
    count: d.count,
  }));

  const courseStatusDistribution = coursesByStatusRaw.map((s) => ({
    status: String(s._id),
    count: s.count,
  }));

  // 3. Attendance Intelligence
  const attendanceMatch = {};
  if (hasDateFilter) attendanceMatch.date = dateQuery;
  if (program) attendanceMatch.program = program;
  if (semester) attendanceMatch.semester = Number(semester);

  const [
    totalAttendanceRecords,
    attendanceStatusRaw,
    attendanceByDateRaw,
    attendanceSessionsCount,
  ] = await Promise.all([
    Attendance.countDocuments(attendanceMatch),
    Attendance.aggregate([
      { $match: attendanceMatch },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Attendance.aggregate([
      { $match: attendanceMatch },
      {
        $group: {
          _id: "$date",
          total: { $sum: 1 },
          present: {
            $sum: {
              $cond: [{ $in: ["$status", ["Present", "Late"]] }, 1, 0],
            },
          },
          absent: {
            $sum: {
              $cond: [{ $eq: ["$status", "Absent"] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ]),
    AttendanceSession.countDocuments(),
  ]);

  const attendanceDistribution = {
    Present: 0,
    Absent: 0,
    Late: 0,
    Bunk: 0,
    Excused: 0,
  };
  let totalAttending = 0;
  for (const item of attendanceStatusRaw) {
    if (item._id && attendanceDistribution[item._id] !== undefined) {
      attendanceDistribution[item._id] = item.count;
    }
    if (["Present", "Late"].includes(item._id)) {
      totalAttending += item.count;
    }
  }

  const overallAttendanceRate =
    totalAttendanceRecords > 0
      ? Math.round((totalAttending / totalAttendanceRecords) * 100)
      : null;

  const attendanceTrends = attendanceByDateRaw.map((d) => {
    const rate = d.total > 0 ? Math.round((d.present / d.total) * 100) : 0;
    return {
      date: typeof d._id === "string" ? d._id : new Date(d._id).toISOString().split("T")[0],
      total: d.total,
      present: d.present,
      absent: d.absent,
      rate,
    };
  });

  // 4. Assignments & Submissions
  const [
    totalAssignments,
    openAssignments,
    totalSubmissions,
    gradedSubmissions,
    submissionsStatusRaw,
  ] = await Promise.all([
    Assignment.countDocuments({ status: { $ne: "ARCHIVED" } }),
    Assignment.countDocuments({ status: "OPEN" }),
    Submission.countDocuments(),
    Submission.countDocuments({ status: "GRADED" }),
    Submission.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const submissionDistribution = {
    SUBMITTED: 0,
    GRADED: 0,
    RESUBMITTED: 0,
    LATE: 0,
  };
  for (const s of submissionsStatusRaw) {
    if (s._id && submissionDistribution[s._id] !== undefined) {
      submissionDistribution[s._id] = s.count;
    }
  }

  const gradingProgressRate =
    totalSubmissions > 0
      ? Math.round((gradedSubmissions / totalSubmissions) * 100)
      : 100;

  // 5. Examinations & Results
  const [
    totalExaminations,
    publishedExaminations,
    examStatusRaw,
    examResultsRaw,
    examGradeDistRaw,
  ] = await Promise.all([
    Exam.countDocuments(),
    Exam.countDocuments({ resultsStatus: "PUBLISHED" }),
    Exam.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    ExamResult.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          avgMarks: { $avg: "$marksObtained" },
        },
      },
    ]),
    ExamResult.aggregate([
      { $match: { grade: { $exists: true, $ne: "" } } },
      { $group: { _id: "$grade", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const examStatusMap = {
    DRAFT: 0,
    PUBLISHED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };
  for (const item of examStatusRaw) {
    if (item._id && examStatusMap[item._id] !== undefined) {
      examStatusMap[item._id] = item.count;
    }
  }

  let totalPassed = 0;
  let totalEvaluated = 0;
  for (const r of examResultsRaw) {
    if (r._id === "PASSED") totalPassed += r.count;
    if (["PASSED", "FAILED"].includes(r._id)) totalEvaluated += r.count;
  }
  const overallPassRate =
    totalEvaluated > 0 ? Math.round((totalPassed / totalEvaluated) * 100) : null;

  const gradeDistribution = [
    "A+",
    "A",
    "B+",
    "B",
    "C+",
    "C",
    "D",
    "F",
  ].map((gradeName) => {
    const entry = examGradeDistRaw.find((g) => g._id === gradeName);
    return {
      grade: gradeName,
      count: entry ? entry.count : 0,
    };
  });

  // 6. Admissions Intelligence
  const [
    totalAdmissionApplications,
    pendingAdmissionApplications,
    admissionsStatusRaw,
    admissionsByProgramRaw,
    admissionsProcessingTimeRaw,
  ] = await Promise.all([
    AdmissionApplication.countDocuments({ archivedAt: null }),
    AdmissionApplication.countDocuments({
      archivedAt: null,
      status: { $in: ["SUBMITTED", "VERIFIED"] },
    }),
    AdmissionApplication.aggregate([
      { $match: { archivedAt: null } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    AdmissionApplication.aggregate([
      { $match: { archivedAt: null } },
      { $group: { _id: { $ifNull: ["$programme", "Unspecified"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    AdmissionApplication.aggregate([
      {
        $match: {
          archivedAt: null,
          reviewedAt: { $exists: true, $ne: null },
          createdAt: { $exists: true },
        },
      },
      {
        $project: {
          durationHours: {
            $divide: [{ $subtract: ["$reviewedAt", "$createdAt"] }, 3600000],
          },
        },
      },
      { $group: { _id: null, avgHours: { $avg: "$durationHours" } } },
    ]),
  ]);

  const admissionFunnel = {
    SUBMITTED: 0,
    VERIFIED: 0,
    OFFERED: 0,
    ENROLLED: 0,
    REJECTED: 0,
  };
  for (const a of admissionsStatusRaw) {
    if (a._id && admissionFunnel[a._id] !== undefined) {
      admissionFunnel[a._id] = a.count;
    }
  }

  const avgAdmissionProcessingDays =
    admissionsProcessingTimeRaw.length > 0 &&
    admissionsProcessingTimeRaw[0].avgHours != null
      ? (admissionsProcessingTimeRaw[0].avgHours / 24).toFixed(1)
      : null;

  // 7. Finance Analytics
  const [
    invoiceTotalsRaw,
    invoicesByStatusRaw,
    paymentsByMethodRaw,
    monthlyCollectionsRaw,
  ] = await Promise.all([
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
    Invoice.aggregate([
      { $match: { status: { $ne: "VOID" } } },
      { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$totalAmount" } } },
    ]),
    Payment.aggregate([
      { $match: { status: "COMPLETED" } },
      { $group: { _id: { $ifNull: ["$paymentMethod", "Cash"] }, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Payment.aggregate([
      { $match: { status: "COMPLETED" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 12 },
    ]),
  ]);

  const totalInvoiced = invoiceTotalsRaw[0]?.totalInvoiced || 0;
  const totalCollected = invoiceTotalsRaw[0]?.totalCollected || 0;
  const outstandingBalance = Math.max(0, totalInvoiced - totalCollected);
  const collectionRate =
    totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 100;

  const paymentMethods = paymentsByMethodRaw.map((p) => ({
    method: String(p._id),
    total: p.total,
    count: p.count,
  }));

  const monthlyCollections = monthlyCollectionsRaw.map((m) => ({
    month: m._id,
    amount: m.total,
    count: m.count,
  }));

  // 8. Cases & Workflow
  const [
    totalCases,
    openCases,
    closedCases,
    casesByDeptRaw,
    casesByStatusRaw,
  ] = await Promise.all([
    WorkflowCase.countDocuments(),
    WorkflowCase.countDocuments({ status: { $in: ["SUBMITTED", "IN_REVIEW", "MORE_INFO"] } }),
    WorkflowCase.countDocuments({ status: { $in: ["APPROVED", "REJECTED", "COMPLETED", "CANCELLED"] } }),
    WorkflowCase.aggregate([
      { $group: { _id: { $ifNull: ["$department", "Registrar"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    WorkflowCase.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const casesByDepartment = casesByDeptRaw.map((c) => ({
    department: String(c._id),
    count: c.count,
  }));

  const caseStatusDistribution = casesByStatusRaw.map((s) => ({
    status: String(s._id),
    count: s.count,
  }));

  // 9. Institutional Insights & Alerts (Deterministic based on real numbers)
  const insights = [];

  if (overallAttendanceRate !== null && overallAttendanceRate < 75) {
    insights.push({
      level: "warning",
      category: "Attendance",
      title: "Attendance Below Benchmark",
      message: `Overall institutional attendance stands at ${overallAttendanceRate}%, below the 75% minimum accreditation threshold.`,
      evidence: `${totalAttending} present sessions out of ${totalAttendanceRecords} total entries.`,
      targetTab: "attendance",
    });
  }

  if (outstandingBalance > 0) {
    insights.push({
      level: "info",
      category: "Finance",
      title: "Outstanding Fee Receivables",
      message: `Total uncollected institutional revenue is NPR ${outstandingBalance.toLocaleString()}, with collection at ${collectionRate}%.`,
      evidence: `NPR ${totalCollected.toLocaleString()} collected against NPR ${totalInvoiced.toLocaleString()} invoiced.`,
      targetTab: "finance",
    });
  }

  const unpublishedExams = totalExaminations - publishedExaminations;
  if (unpublishedExams > 0) {
    insights.push({
      level: "warning",
      category: "Examinations",
      title: "Pending Results Publication",
      message: `${unpublishedExams} examination results await final verification or publication by the Examination Office.`,
      evidence: `${publishedExaminations} published out of ${totalExaminations} total exams.`,
      targetTab: "examination",
    });
  }

  if (openAssignments > 0 && totalSubmissions > 0 && gradingProgressRate < 100) {
    const pendingGrading = totalSubmissions - gradedSubmissions;
    insights.push({
      level: "info",
      category: "Academics",
      title: "Assignment Grading in Progress",
      message: `${pendingGrading} submissions are currently pending teacher assessment across courses.`,
      evidence: `${gradedSubmissions} graded out of ${totalSubmissions} submissions (${gradingProgressRate}%).`,
      targetTab: "assignments",
    });
  }

  if (openCases > 0) {
    insights.push({
      level: "info",
      category: "Operations",
      title: "Open Workflow Cases",
      message: `${openCases} institutional workflow cases are currently in review across administrative departments.`,
      evidence: `${openCases} active cases in the queue.`,
      targetTab: "cases",
    });
  }

  return {
    kpis: {
      totalUsers,
      activeUsers,
      totalStudents,
      activeStudents,
      totalCourses,
      activeCourses,
      totalAssignments,
      openAssignments,
      totalAttendanceSessions,
      overallAttendanceRate,
      totalExaminations,
      publishedExaminations,
      overallPassRate,
      totalAdmissionApplications,
      pendingAdmissionApplications,
      totalCases,
      openCases,
      totalInvoiced,
      totalCollected,
      outstandingBalance,
      collectionRate,
    },
    academic: {
      totalCourses,
      activeCourses,
      archivedCourses,
      coursesByDepartment,
      courseStatusDistribution,
    },
    attendance: {
      totalRecords: totalAttendanceRecords,
      totalSessions: attendanceSessionsCount,
      distribution: attendanceDistribution,
      overallRate: overallAttendanceRate,
      trends: attendanceTrends,
    },
    assignments: {
      totalAssignments,
      openAssignments,
      totalSubmissions,
      gradedSubmissions,
      gradingProgressRate,
      distribution: submissionDistribution,
    },
    examination: {
      totalExaminations,
      publishedExaminations,
      statusBreakdown: examStatusMap,
      passRate: overallPassRate,
      gradeDistribution,
    },
    admissions: {
      totalApplications: totalAdmissionApplications,
      pendingApplications: pendingAdmissionApplications,
      funnel: admissionFunnel,
      byProgram: admissionsByProgramRaw.map((p) => ({
        program: String(p._id),
        count: p.count,
      })),
      avgProcessingDays: avgAdmissionProcessingDays,
    },
    finance: {
      totalInvoiced,
      totalCollected,
      outstandingBalance,
      collectionRate,
      paymentMethods,
      monthlyCollections,
      invoicesByStatus: invoicesByStatusRaw.map((s) => ({
        status: String(s._id),
        count: s.count,
        amount: s.amount,
      })),
    },
    cases: {
      totalCases,
      openCases,
      closedCases,
      byDepartment: casesByDepartment,
      statusDistribution: caseStatusDistribution,
    },
    users: {
      totalUsers,
      activeUsers,
      distribution: userDistribution,
    },
    insights,
    metadata: {
      calculatedAt: new Date().toISOString(),
      filtersApplied: filters,
    },
  };
}

/**
 * Retrieves audit log analytics and paginated forensic audit records.
 */
export async function getAuditAnalyticsAndLogs(params = {}) {
  const {
    page = 1,
    limit = 25,
    search = "",
    module: queryModule,
    action: queryAction,
    status: queryStatus,
    severity: querySeverity,
    startDate,
    endDate,
  } = params;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const skip = (pageNum - 1) * limitNum;

  // Build filter query for AuditLog
  const filter = {};
  if (queryModule && queryModule !== "ALL") filter.module = queryModule;
  if (queryAction && queryAction !== "ALL") filter.action = new RegExp(`^${queryAction}`, "i");
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  if (search && search.trim()) {
    const s = search.trim();
    filter.$or = [
      { action: new RegExp(s, "i") },
      { module: new RegExp(s, "i") },
      { details: new RegExp(s, "i") },
      { resource: new RegExp(s, "i") },
      { resourceId: new RegExp(s, "i") },
      { ipAddress: new RegExp(s, "i") },
    ];
  }

  // Aggregate stats in parallel
  const [
    totalEvents,
    byModuleRaw,
    byActionRaw,
    recentLogs,
    totalFilteredLogs,
    securityEventsCount,
  ] = await Promise.all([
    AuditLog.countDocuments(),
    AuditLog.aggregate([
      { $group: { _id: { $ifNull: ["$module", "general"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    AuditLog.aggregate([
      {
        $group: {
          _id: { $ifNull: ["$action", "UNKNOWN"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    AuditLog.find(filter)
      .populate("user", "firstName lastName email roles isActive")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    AuditLog.countDocuments(filter),
    SecurityEvent.countDocuments(),
  ]);

  // Activity over time (last 14 days)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const trendRaw = await AuditLog.aggregate([
    { $match: { createdAt: { $gte: fourteenDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const activityTrends = trendRaw.map((t) => ({
    date: t._id,
    count: t.count,
  }));

  // Identify successful vs failed/security actions from keywords
  const failedEventsCount = await AuditLog.countDocuments({
    $or: [
      { action: /FAIL|REJECT|ERROR|INVALID|DENIED|BLOCK/i },
      { details: /FAIL|REJECT|ERROR|INVALID|DENIED|BLOCK/i },
    ],
  });

  const adminActionsCount = await AuditLog.countDocuments({
    action: /DELETE|UPDATE|CREATE|PUBLISH|ASSIGN|REVOKE|RESET|ELEVAT/i,
  });

  const successEventsCount = Math.max(0, totalEvents - failedEventsCount);

  return {
    kpis: {
      totalEvents,
      successCount: successEventsCount,
      failedCount: failedEventsCount,
      securityAlertsCount: securityEventsCount,
      adminActionsCount,
    },
    byModule: byModuleRaw.map((m) => ({
      module: String(m._id),
      count: m.count,
    })),
    byAction: byActionRaw.map((a) => ({
      action: String(a._id),
      count: a.count,
    })),
    successVsFail: [
      { label: "Successful", count: successEventsCount },
      { label: "Failed / Flagged", count: failedEventsCount },
    ],
    trend: activityTrends,
    logs: recentLogs.map((log) => ({
      id: log._id.toString(),
      action: log.action,
      module: log.module || "general",
      resource: log.resource,
      resourceId: log.resourceId,
      details: log.details,
      oldValue: log.oldValue,
      newValue: log.newValue,
      metadata: log.metadata,
      ipAddress: log.ipAddress || "127.0.0.1",
      createdAt: log.createdAt || log.timestamp,
      user: log.user
        ? {
            id: log.user._id?.toString(),
            name: `${log.user.firstName || ""} ${log.user.lastName || ""}`.trim() || log.user.email,
            email: log.user.email,
            roles: log.user.roles || [],
          }
        : null,
    })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: totalFilteredLogs,
      totalPages: Math.ceil(totalFilteredLogs / limitNum) || 1,
    },
  };
}
