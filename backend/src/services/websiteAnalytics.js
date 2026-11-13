import { UserActivityEvent, UserSession, User, Student, Department } from "../models/index.js";

const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

export async function getWebsiteUsageOverview(filters = {}) {
  const { startDate, endDate, department, role, academicYear } = filters;

  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) dateQuery.$lte = new Date(endDate);
  const hasDateFilter = Object.keys(dateQuery).length > 0;

  const sessionQuery = {};
  if (hasDateFilter) sessionQuery.loginAt = dateQuery;

  const userQuery = { isActive: true };
  if (role) userQuery.roles = role;
  if (department) {
    const dept = await Department.findOne({ name: department });
    if (dept) {
      const students = await Student.find({ department: dept._id }).distinct("user");
      userQuery._id = { $in: students };
    }
  }

  const userIds = await User.find(userQuery).distinct("_id");

  if (userIds.length === 0) {
    return getEmptyOverview();
  }

  sessionQuery.user = { $in: userIds };

  const [
    totalSessions,
    totalUsers,
    activeSessionsNow,
    sessionsWithDuration,
    sessionsByUser,
    moduleUsageRaw,
    sessionTimelineRaw,
    peakConcurrentRaw,
  ] = await Promise.all([
    UserSession.countDocuments(sessionQuery),
    User.countDocuments(userQuery),
    UserSession.countDocuments({
      ...sessionQuery,
      sessionStatus: "active",
      lastActiveAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
    }),
    UserSession.find(sessionQuery).lean(),
    UserSession.aggregate([
      { $match: sessionQuery },
      { $group: { _id: "$user", sessionCount: { $sum: 1 }, totalActive: { $sum: "$activeDuration" }, totalIdle: { $sum: "$idleDuration" } } },
    ]),
    UserActivityEvent.aggregate([
      { $match: { user: { $in: userIds }, eventType: "module_access", ...(hasDateFilter ? { timestamp: dateQuery } : {}) } },
      { $group: { _id: "$module", visits: { $sum: 1 }, uniqueUsers: { $addToSet: "$user" }, totalTime: { $sum: 1 } } },
      { $sort: { visits: -1 } },
    ]),
    UserSession.aggregate([
      { $match: sessionQuery },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d %H:00", date: "$loginAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    UserSession.aggregate([
      { $match: sessionQuery },
      { $project: { loginAt: 1, logoutAt: 1, lastActiveAt: 1 } },
    ]),
  ]);

  const totalActiveDuration = sessionsWithDuration.reduce((sum, s) => sum + (s.activeDuration || 0), 0);
  const totalIdleDuration = sessionsWithDuration.reduce((sum, s) => sum + (s.idleDuration || 0), 0);
  const totalDuration = totalActiveDuration + totalIdleDuration;

  const avgSessionDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;
  const avgActiveSessionDuration = totalSessions > 0 ? totalActiveDuration / totalSessions : 0;
  const avgPagesPerSession = sessionsWithDuration.reduce((sum, s) => sum + (s.pagesVisited || 0), 0) / totalSessions;

  const uniqueUsersInPeriod = new Set(sessionsByUser.map((s) => s._id.toString())).size;
  const returningUsers = sessionsByUser.filter((s) => s.sessionCount > 1).length;
  const newUsers = uniqueUsersInPeriod - returningUsers;

  let peakConcurrent = 0;
  if (peakConcurrentRaw.length > 0) {
    const concurrentMap = new Map();
    for (const session of peakConcurrentRaw) {
      const login = new Date(session.loginAt).getTime();
      const logout = session.logoutAt ? new Date(session.logoutAt).getTime() : (session.lastActiveAt ? new Date(session.lastActiveAt).getTime() + IDLE_THRESHOLD_MS : login + 3600000);
      for (let t = login; t <= logout; t += 60000) {
        const key = new Date(t).toISOString().slice(0, 16);
        concurrentMap.set(key, (concurrentMap.get(key) || 0) + 1);
      }
    }
    peakConcurrent = Math.max(...concurrentMap.values(), 0);
  }

  return {
    totalVisits: totalSessions,
    uniqueUsers: uniqueUsersInPeriod,
    activeUsersNow: activeSessionsNow,
    totalSessions,
    avgSessionDuration: Math.round(avgSessionDuration / 1000),
    avgActiveSessionDuration: Math.round(avgActiveSessionDuration / 1000),
    totalTimeSpent: Math.round(totalActiveDuration / 1000 / 60),
    avgPagesPerSession: Math.round(avgPagesPerSession * 100) / 100,
    returningUsers,
    newUsers,
    peakConcurrentUsers: peakConcurrent,
    sessionTimeline: sessionTimelineRaw.map((s) => ({ period: s._id, sessions: s.count })),
    topModules: moduleUsageRaw.slice(0, 10).map((m) => ({
      module: m._id,
      visits: m.visits,
      uniqueUsers: m.uniqueUsers.length,
      avgTimePerVisit: 0,
    })),
  };
}

function getEmptyOverview() {
  return {
    totalVisits: 0,
    uniqueUsers: 0,
    activeUsersNow: 0,
    totalSessions: 0,
    avgSessionDuration: 0,
    avgActiveSessionDuration: 0,
    totalTimeSpent: 0,
    avgPagesPerSession: 0,
    returningUsers: 0,
    newUsers: 0,
    peakConcurrentUsers: 0,
    sessionTimeline: [],
    topModules: [],
  };
}

export async function getUserActivityTable(filters = {}) {
  const { startDate, endDate, department, role, academicYear, userId, page = 1, limit = 25, activeOnly } = filters;

  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) dateQuery.$lte = new Date(endDate);
  const hasDateFilter = Object.keys(dateQuery).length > 0;

  const userQuery = { isActive: true };
  if (role) userQuery.roles = role;
  if (userId) userQuery._id = userId;
  if (department) {
    const dept = await Department.findOne({ name: department });
    if (dept) {
      const students = await Student.find({ department: dept._id }).distinct("user");
      userQuery._id = { $in: students };
    }
  }

  if (activeOnly) {
    const recentActiveUsers = await UserSession.distinct("user", {
      sessionStatus: "active",
      lastActiveAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
    });
    userQuery._id = { $in: recentActiveUsers };
  }

  const userIds = await User.find(userQuery).distinct("_id");

  if (userIds.length === 0) {
    return { users: [], pagination: { page, limit, total: 0, totalPages: 0 } };
  }

  const sessionQuery = { user: { $in: userIds } };
  if (hasDateFilter) sessionQuery.loginAt = dateQuery;

  const skip = (page - 1) * limit;

  const [sessionsAgg, totalUsers] = await Promise.all([
    UserSession.aggregate([
      { $match: sessionQuery },
      {
        $group: {
          _id: "$user",
          totalSessions: { $sum: 1 },
          totalActiveDuration: { $sum: "$activeDuration" },
          totalIdleDuration: { $sum: "$idleDuration" },
          lastLoginAt: { $max: "$loginAt" },
          lastActiveAt: { $max: "$lastActiveAt" },
          totalPagesVisited: { $sum: "$pagesVisited" },
          modulesAccessed: { $push: "$modulesAccessed" },
          firstModule: { $first: "$firstModule" },
          lastModule: { $last: "$lastModule" },
        },
      },
      { $sort: { lastActiveAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]),
    User.countDocuments(userQuery),
  ]);

  const userIdsFromAgg = sessionsAgg.map((s) => s._id);
  const users = await User.find({ _id: { $in: userIdsFromAgg } }).lean();

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const activityEvents = await UserActivityEvent.aggregate([
    { $match: { user: { $in: userIdsFromAgg }, eventType: "module_access", ...(hasDateFilter ? { timestamp: dateQuery } : {}) } },
    { $group: { _id: { user: "$user", module: "$module" }, count: { $sum: 1 } } },
    { $sort: { "_id.user": 1, count: -1 } },
  ]);

  const moduleCountByUser = new Map();
  for (const evt of activityEvents) {
    const userIdStr = evt._id.user.toString();
    if (!moduleCountByUser.has(userIdStr)) {
      moduleCountByUser.set(userIdStr, { module: evt._id.module, count: evt.count });
    }
  }

  const enrichedUsers = sessionsAgg.map((session) => {
    const user = userMap.get(session._id.toString());
    const topModule = moduleCountByUser.get(session._id.toString());
    const allModules = [...new Set(session.modulesAccessed.flat())];

    return {
      userId: session._id.toString(),
      userName: user ? `${user.firstName} ${user.middleName || ""} ${user.lastName}`.trim() : "Unknown",
      email: user?.email || "Unknown",
      role: user?.roles?.[0] || "student",
      department: user?.department || null,
      lastLogin: session.lastLoginAt,
      lastActive: session.lastActiveAt,
      totalSessions: session.totalSessions,
      totalTimeSpent: Math.round((session.totalActiveDuration + session.totalIdleDuration) / 1000 / 60),
      avgSessionDuration: session.totalSessions > 0 ? Math.round((session.totalActiveDuration + session.totalIdleDuration) / session.totalSessions / 1000 / 60) : 0,
      mostVisitedModule: topModule?.module || session.lastModule || "N/A",
      totalPagesVisited: session.totalPagesVisited,
      accountStatus: user?.accountStatus || "ACTIVE",
      isActiveNow: session.lastActiveAt && (Date.now() - new Date(session.lastActiveAt).getTime()) < 5 * 60 * 1000,
    };
  });

  return {
    users: enrichedUsers,
    pagination: {
      page,
      limit,
      total: totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
    },
  };
}

export async function getIndividualUserActivity(userId, filters = {}) {
  const { startDate, endDate } = filters;

  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) dateQuery.$lte = new Date(endDate);
  const hasDateFilter = Object.keys(dateQuery).length > 0;

  const user = await User.findById(userId).lean();
  if (!user) return null;

  const sessionQuery = { user: userId };
  if (hasDateFilter) sessionQuery.loginAt = dateQuery;

  const [sessions, events, sessionSummary] = await Promise.all([
    UserSession.find(sessionQuery).sort({ loginAt: -1 }).lean(),
    UserActivityEvent.find({
      user: userId,
      eventType: { $in: ["page_view", "module_access", "navigation", "logout"] },
      ...(hasDateFilter ? { timestamp: dateQuery } : {}),
    }).sort({ timestamp: 1 }).lean(),
    UserSession.aggregate([
      { $match: sessionQuery },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalActiveDuration: { $sum: "$activeDuration" },
          totalIdleDuration: { $sum: "$idleDuration" },
          totalPagesVisited: { $sum: "$pagesVisited" },
        },
      },
    ]),
  ]);

  const summary = sessionSummary[0] || {
    totalSessions: 0,
    totalActiveDuration: 0,
    totalIdleDuration: 0,
    totalPagesVisited: 0,
  };

  const totalDuration = summary.totalActiveDuration + summary.totalIdleDuration;
  const avgSessionDuration = summary.totalSessions > 0 ? totalDuration / summary.totalSessions : 0;

  const activityHistory = events.map((evt) => {
    const moduleName = evt.module || getModuleFromRoute(evt.route);
    const actionMap = {
      page_view: `Viewed ${moduleName}`,
      module_access: `Opened ${moduleName}`,
      navigation: `Navigated to ${moduleName}`,
      logout: `Logged out from ${moduleName}`,
      heartbeat: `Heartbeat (${evt.metadata?.isIdle ? "idle" : "active"})`,
    };
    return {
      timestamp: evt.timestamp,
      action: actionMap[evt.eventType] || evt.eventType,
      module: moduleName,
      route: evt.route,
      isIdle: evt.metadata?.isIdle || false,
    };
  });

  const moduleUsage = events
    .filter((e) => e.eventType === "module_access")
    .reduce((acc, evt) => {
      const module = evt.module || getModuleFromRoute(evt.route);
      if (!acc[module]) acc[module] = { visits: 0, totalTime: 0 };
      acc[module].visits++;
      return acc;
    }, {});

  const moduleUsageArray = Object.entries(moduleUsage).map(([module, data]) => ({
    module,
    visits: data.visits,
    uniqueUsers: 1,
    totalTime: 0,
  }));

  return {
    user: {
      userId: user._id.toString(),
      userName: `${user.firstName} ${user.middleName || ""} ${user.lastName}`.trim(),
      email: user.email,
      role: user.roles?.[0] || "student",
      accountStatus: user.accountStatus,
      lastLogin: user.lastLoginAt,
    },
    overview: {
      totalVisits: summary.totalSessions,
      totalTimeSpent: Math.round(totalDuration / 1000 / 60),
      avgSessionDuration: Math.round(avgSessionDuration / 1000 / 60),
      totalPagesVisited: summary.totalPagesVisited,
    },
    activityHistory,
    moduleUsage: moduleUsageArray,
    sessions: sessions.map((s) => ({
      sessionId: s._id.toString(),
      loginAt: s.loginAt,
      logoutAt: s.logoutAt,
      lastActiveAt: s.lastActiveAt,
      activeDuration: Math.round((s.activeDuration || 0) / 1000 / 60),
      idleDuration: Math.round((s.idleDuration || 0) / 1000 / 60),
      totalDuration: Math.round(((s.activeDuration || 0) + (s.idleDuration || 0)) / 1000 / 60),
      sessionStatus: s.sessionStatus,
      pagesVisited: s.pagesVisited,
      modulesAccessed: s.modulesAccessed,
    })),
  };
}

function getModuleFromRoute(route) {
  if (!route) return "Unknown";
  const moduleMap = {
    "/dashboard": "Dashboard",
    "/connect": "Connect",
    "/mail": "College Mail",
    "/messages": "Messages",
    "/notices": "Notices",
    "/timetable": "Timetable",
    "/my-timetable": "My Timetable",
    "/attendance": "Attendance",
    "/attendance-records": "Attendance Records",
    "/learning": "My Courses",
    "/my-courses": "My Courses",
    "/lms": "LMS",
    "/assignments": "Assignments",
    "/materials": "Learning Materials",
    "/examination": "Examinations",
    "/finance": "Finance",
    "/requests": "Workflow",
    "/documents": "Documents",
    "/smart-documents": "Smart Documents",
    "/calendar": "Academic Calendar",
    "/calendar-documents": "Calendar Documents",
    "/library": "Library",
    "/analytics": "Analytics",
    "/intelligence": "AI Intelligence",
    "/students": "Student Directory",
    "/user-management": "User Management",
    "/admissions": "Admissions",
    "/profile": "Profile",
    "/notifications": "Notifications",
    "/facilities": "Facilities",
  };
  for (const [path, module] of Object.entries(moduleMap)) {
    if (route.startsWith(path)) return module;
  }
  const parts = route.split("/").filter(Boolean);
  return parts.length > 0 ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "Unknown";
}

export async function getModuleUsageAnalytics(filters = {}) {
  const { startDate, endDate, department, role, academicYear, groupBy = "module" } = filters;

  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) dateQuery.$lte = new Date(endDate);
  const hasDateFilter = Object.keys(dateQuery).length > 0;

  const userQuery = { isActive: true };
  if (role) userQuery.roles = role;
  if (department) {
    const dept = await Department.findOne({ name: department });
    if (dept) {
      const students = await Student.find({ department: dept._id }).distinct("user");
      userQuery._id = { $in: students };
    }
  }

  const userIds = await User.find(userQuery).distinct("_id");

  if (userIds.length === 0) return { modules: [], byRole: [], byDepartment: [], byTime: [] };

  const matchQuery = { user: { $in: userIds }, eventType: "module_access" };
  if (hasDateFilter) matchQuery.timestamp = dateQuery;

  const [moduleStats, moduleByRole, moduleByDept, moduleByTime] = await Promise.all([
    UserActivityEvent.aggregate([
      { $match: matchQuery },
      { $group: { _id: "$module", visits: { $sum: 1 }, uniqueUsers: { $addToSet: "$user" } } },
      { $sort: { visits: -1 } },
    ]),
    UserActivityEvent.aggregate([
      { $match: matchQuery },
      {
        $lookup: { from: "users", localField: "user", foreignField: "_id", as: "userDoc" },
      },
      { $unwind: "$userDoc" },
      { $group: { _id: { module: "$module", role: { $arrayElemAt: ["$userDoc.roles", 0] } }, visits: { $sum: 1 }, uniqueUsers: { $addToSet: "$user" } } },
      { $sort: { visits: -1 } },
    ]),
    UserActivityEvent.aggregate([
      { $match: matchQuery },
      {
        $lookup: { from: "users", localField: "user", foreignField: "_id", as: "userDoc" },
      },
      { $unwind: "$userDoc" },
      {
        $lookup: { from: "students", localField: "userDoc._id", foreignField: "user", as: "studentDoc" },
      },
      { $unwind: { path: "$studentDoc", preserveNullAndEmptyArrays: true } },
      {
        $lookup: { from: "departments", localField: "studentDoc.department", foreignField: "_id", as: "deptDoc" },
      },
      { $unwind: { path: "$deptDoc", preserveNullAndEmptyArrays: true } },
      { $group: { _id: { module: "$module", department: { $ifNull: ["$deptDoc.name", "Unknown"] } }, visits: { $sum: 1 }, uniqueUsers: { $addToSet: "$user" } } },
      { $sort: { visits: -1 } },
    ]),
    UserActivityEvent.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            module: "$module",
            hour: { $hour: "$timestamp" },
            dayOfWeek: { $dayOfWeek: "$timestamp" },
          },
          visits: { $sum: 1 },
        },
      },
      { $sort: { "_id.dayOfWeek": 1, "_id.hour": 1 } },
    ]),
  ]);

  const modules = moduleStats.map((m) => ({
    module: m._id,
    visits: m.visits,
    uniqueUsers: m.uniqueUsers.length,
    totalTime: 0,
    avgTimePerVisit: 0,
  }));

  const byRoleMap = new Map();
  for (const m of moduleByRole) {
    const key = `${m._id.module}|${m._id.role}`;
    if (!byRoleMap.has(key)) {
      byRoleMap.set(key, { module: m._id.module, role: m._id.role, visits: 0, uniqueUsers: 0 });
    }
    const entry = byRoleMap.get(key);
    entry.visits += m.visits;
    entry.uniqueUsers = new Set([...entry.uniqueUsers, ...m.uniqueUsers]).size;
  }

  const byDeptMap = new Map();
  for (const m of moduleByDept) {
    const key = `${m._id.module}|${m._id.department}`;
    if (!byDeptMap.has(key)) {
      byDeptMap.set(key, { module: m._id.module, department: m._id.department, visits: 0, uniqueUsers: 0 });
    }
    const entry = byDeptMap.get(key);
    entry.visits += m.visits;
    entry.uniqueUsers = new Set([...entry.uniqueUsers, ...m.uniqueUsers]).size;
  }

  const byTimeMap = new Map();
  for (const m of moduleByTime) {
    const key = `${m._id.module}|${m._id.dayOfWeek}|${m._id.hour}`;
    byTimeMap.set(key, { module: m._id.module, dayOfWeek: m._id.dayOfWeek, hour: m._id.hour, visits: m.visits });
  }

  return {
    modules,
    byRole: Array.from(byRoleMap.values()),
    byDepartment: Array.from(byDeptMap.values()),
    byTime: Array.from(byTimeMap.values()),
  };
}

export async function getUserBehaviorPatterns(filters = {}) {
  const { startDate, endDate, department, role } = filters;

  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) dateQuery.$lte = new Date(endDate);
  const hasDateFilter = Object.keys(dateQuery).length > 0;

  const userQuery = { isActive: true };
  if (role) userQuery.roles = role;
  if (department) {
    const dept = await Department.findOne({ name: department });
    if (dept) {
      const students = await Student.find({ department: dept._id }).distinct("user");
      userQuery._id = { $in: students };
    }
  }

  const userIds = await User.find(userQuery).distinct("_id");

  if (userIds.length === 0) return getEmptyBehaviorPatterns();

  const matchQuery = { user: { $in: userIds }, eventType: { $in: ["page_view", "module_access"] } };
  if (hasDateFilter) matchQuery.timestamp = dateQuery;

  const [topPaths, navigationPaths, startPages, exitPages, sessionDurationByRole, peakDays, peakHours, returningPatterns] = await Promise.all([
    UserActivityEvent.aggregate([
      { $match: matchQuery },
      { $group: { _id: "$route", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    UserActivityEvent.aggregate([
      { $match: { ...matchQuery, eventType: "navigation" } },
      { $group: { _id: { from: "$previousRoute", to: "$route" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    UserActivityEvent.aggregate([
      { $match: { user: { $in: userIds }, eventType: "page_view", ...(hasDateFilter ? { timestamp: dateQuery } : {}) } },
      { $sort: { user: 1, timestamp: 1 } },
      { $group: { _id: "$user", firstRoute: { $first: "$route" } } },
      { $group: { _id: "$firstRoute", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    UserActivityEvent.aggregate([
      { $match: { user: { $in: userIds }, eventType: "logout", ...(hasDateFilter ? { timestamp: dateQuery } : {}) } },
      { $group: { _id: "$route", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    UserActivityEvent.aggregate([
      { $match: matchQuery },
      {
        $lookup: { from: "users", localField: "user", foreignField: "_id", as: "userDoc" },
      },
      { $unwind: "$userDoc" },
      {
        $group: {
          _id: { $arrayElemAt: ["$userDoc.roles", 0] },
          totalDuration: { $sum: 1 },
          count: { $sum: 1 },
        },
      },
    ]),
    UserActivityEvent.aggregate([
      { $match: matchQuery },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    UserActivityEvent.aggregate([
      { $match: matchQuery },
      { $group: { _id: { $hour: "$timestamp" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    UserActivityEvent.aggregate([
      { $match: { user: { $in: userIds }, eventType: "page_view", ...(hasDateFilter ? { timestamp: dateQuery } : {}) } },
      { $group: { _id: "$user", visits: { $sum: 1 }, days: { $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } } } } },
      { $project: { _id: 1, visits: 1, uniqueDays: { $size: "$days" } } },
      { $group: { _id: null, avgVisitsPerUser: { $avg: "$visits" }, avgDaysPerUser: { $avg: "$uniqueDays" }, returningUsers: { $sum: { $cond: [{ $gt: ["$uniqueDays", 1] }, 1, 0] } }, totalUsers: { $sum: 1 } } },
    ]),
  ]);

  return {
    frequentlyVisitedModules: topPaths.map((p) => ({ route: p._id, visits: p.count })),
    commonNavigationPaths: navigationPaths.map((p) => ({ from: p._id.from, to: p._id.to, count: p.count })),
    commonStartPages: startPages.map((p) => ({ route: p._id, count: p.count })),
    commonExitPages: exitPages.map((p) => ({ route: p._id, count: p.count })),
    avgSessionDurationByRole: sessionDurationByRole.map((r) => ({ role: r._id, avgDuration: Math.round(r.totalDuration / r.count) })),
    peakUsageDays: peakDays.map((d) => ({ date: d._id, visits: d.count })),
    peakUsageHours: peakHours.map((h) => ({ hour: h._id, visits: h.count })),
    returningUserPatterns: returningPatterns[0] || { avgVisitsPerUser: 0, avgDaysPerUser: 0, returningUsers: 0, totalUsers: 0 },
  };
}

function getEmptyBehaviorPatterns() {
  return {
    frequentlyVisitedModules: [],
    commonNavigationPaths: [],
    commonStartPages: [],
    commonExitPages: [],
    avgSessionDurationByRole: [],
    peakUsageDays: [],
    peakUsageHours: [],
    returningUserPatterns: { avgVisitsPerUser: 0, avgDaysPerUser: 0, returningUsers: 0, totalUsers: 0 },
  };
}