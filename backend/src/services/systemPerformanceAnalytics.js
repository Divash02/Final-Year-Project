import { SystemMetric, PerformanceAlert, UserSession } from "../models/index.js";

export async function getSystemPerformanceOverview(filters = {}) {
  const { startDate, endDate, interval = "1h" } = filters;

  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) dateQuery.$lte = new Date(endDate);
  const hasDateFilter = Object.keys(dateQuery).length > 0;

  const matchQuery = hasDateFilter ? { timestamp: dateQuery } : {};

  const [latestMetric, metricsAgg, activeAlerts, concurrentUsers] = await Promise.all([
    SystemMetric.findOne().sort({ timestamp: -1 }).lean(),
    SystemMetric.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          avgCpu: { $avg: "$processCpuUsage" },
          maxCpu: { $max: "$processCpuUsage" },
          minCpu: { $min: "$processCpuUsage" },
          avgMemory: { $avg: "$processMemoryUsagePercentage" },
          maxMemory: { $max: "$processMemoryUsagePercentage" },
          avgApiResponse: { $avg: "$apiResponseTime" },
          maxApiResponse: { $max: "$apiResponseTime" },
          avgDbResponse: { $avg: "$databaseResponseTime" },
          avgErrorRate: { $avg: "$errorRate" },
          avgConcurrentUsers: { $avg: "$concurrentUsers" },
          maxConcurrentUsers: { $max: "$concurrentUsers" },
          avgRequestsPerMinute: { $avg: "$requestsPerMinute" },
          totalSlowRequests: { $sum: "$slowRequestsCount" },
          totalSlowQueries: { $sum: "$slowQueriesCount" },
          totalFailedQueries: { $sum: "$failedQueriesCount" },
        },
      },
    ]),
    PerformanceAlert.countDocuments({ status: { $in: ["active", "acknowledged"] } }),
    UserSession.countDocuments({ sessionStatus: "active", lastActiveAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }),
  ]);

  const agg = metricsAgg[0] || {};

  return {
    current: {
      cpuUsage: latestMetric?.processCpuUsage ?? null,
      hostCpuUsage: latestMetric?.hostCpuUsage ?? null,
      memoryUsage: latestMetric?.processMemoryUsagePercentage ?? null,
      hostMemoryUsage: latestMetric?.hostMemoryUsagePercentage ?? null,
      memoryUsed: latestMetric?.processMemoryUsed ?? null,
      memoryTotal: latestMetric?.processMemoryTotal ?? null,
      apiResponseTime: latestMetric?.apiResponseTime ?? null,
      apiResponseTimeP50: latestMetric?.apiResponseTimeP50 ?? null,
      apiResponseTimeP95: latestMetric?.apiResponseTimeP95 ?? null,
      apiResponseTimeP99: latestMetric?.apiResponseTimeP99 ?? null,
      databaseResponseTime: latestMetric?.databaseResponseTime ?? null,
      concurrentUsers: latestMetric?.concurrentUsers ?? concurrentUsers,
      activeSessions: latestMetric?.activeSessions ?? concurrentUsers,
      requestsPerMinute: latestMetric?.requestsPerMinute ?? 0,
      errorRate: latestMetric?.errorRate ?? 0,
      serverUptime: latestMetric?.serverUptime ?? null,
      systemHealthStatus: latestMetric?.systemHealthStatus ?? "unknown",
      activeConnections: latestMetric?.databaseActiveConnections ?? null,
      connectionPoolUtilization: latestMetric?.databaseConnectionPoolUtilization ?? null,
    },
    summary: {
      avgCpu: Math.round((agg.avgCpu || 0) * 100) / 100,
      maxCpu: Math.round((agg.maxCpu || 0) * 100) / 100,
      minCpu: Math.round((agg.minCpu || 0) * 100) / 100,
      avgMemory: Math.round((agg.avgMemory || 0) * 100) / 100,
      maxMemory: Math.round((agg.maxMemory || 0) * 100) / 100,
      avgApiResponse: Math.round(agg.avgApiResponse || 0),
      maxApiResponse: Math.round(agg.maxApiResponse || 0),
      avgDbResponse: Math.round(agg.avgDbResponse || 0),
      avgErrorRate: Math.round((agg.avgErrorRate || 0) * 100) / 100,
      avgConcurrentUsers: Math.round(agg.avgConcurrentUsers || 0),
      maxConcurrentUsers: agg.maxConcurrentUsers || 0,
      avgRequestsPerMinute: Math.round(agg.avgRequestsPerMinute || 0),
      totalSlowRequests: agg.totalSlowRequests || 0,
      totalSlowQueries: agg.totalSlowQueries || 0,
      totalFailedQueries: agg.totalFailedQueries || 0,
    },
    activeAlertsCount: activeAlerts,
  };
}

export async function getCpuPerformanceHistory(filters = {}) {
  const { startDate, endDate, interval = "1h" } = filters;

  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) dateQuery.$lte = new Date(endDate);
  const hasDateFilter = Object.keys(dateQuery).length > 0;

  const matchQuery = hasDateFilter ? { timestamp: dateQuery } : {};

  let groupFormat;
  switch (interval) {
    case "1m":
      groupFormat = "%Y-%m-%d %H:%M";
      break;
    case "1h":
      groupFormat = "%Y-%m-%d %H:00";
      break;
    case "1d":
      groupFormat = "%Y-%m-%d";
      break;
    default:
      groupFormat = "%Y-%m-%d %H:00";
  }

  const [processCpuData, hostCpuData] = await Promise.all([
    SystemMetric.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$timestamp" } },
          avgProcessCpu: { $avg: "$processCpuUsage" },
          maxProcessCpu: { $max: "$processCpuUsage" },
          avgHostCpu: { $avg: "$hostCpuUsage" },
          maxHostCpu: { $max: "$hostCpuUsage" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    SystemMetric.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$timestamp" } },
          avgHostCpu: { $avg: "$hostCpuUsage" },
          maxHostCpu: { $max: "$hostCpuUsage" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    processCpu: processCpuData.map((d) => ({
      timestamp: d._id,
      avg: Math.round((d.avgProcessCpu || 0) * 100) / 100,
      max: Math.round((d.maxProcessCpu || 0) * 100) / 100,
    })),
    hostCpu: hostCpuData.map((d) => ({
      timestamp: d._id,
      avg: Math.round((d.avgHostCpu || 0) * 100) / 100,
      max: Math.round((d.maxHostCpu || 0) * 100) / 100,
    })),
  };
}

export async function getMemoryPerformanceHistory(filters = {}) {
  const { startDate, endDate, interval = "1h" } = filters;

  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) dateQuery.$lte = new Date(endDate);
  const hasDateFilter = Object.keys(dateQuery).length > 0;

  const matchQuery = hasDateFilter ? { timestamp: dateQuery } : {};

  let groupFormat;
  switch (interval) {
    case "1m":
      groupFormat = "%Y-%m-%d %H:%M";
      break;
    case "1h":
      groupFormat = "%Y-%m-%d %H:00";
      break;
    case "1d":
      groupFormat = "%Y-%m-%d";
      break;
    default:
      groupFormat = "%Y-%m-%d %H:00";
  }

  const [processMemData, hostMemData] = await Promise.all([
    SystemMetric.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$timestamp" } },
          avgProcessMem: { $avg: "$processMemoryUsagePercentage" },
          maxProcessMem: { $max: "$processMemoryUsagePercentage" },
          avgProcessMemUsed: { $avg: "$processMemoryUsed" },
          avgProcessMemTotal: { $avg: "$processMemoryTotal" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    SystemMetric.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$timestamp" } },
          avgHostMem: { $avg: "$hostMemoryUsagePercentage" },
          maxHostMem: { $max: "$hostMemoryUsagePercentage" },
          avgHostMemUsed: { $avg: "$hostMemoryUsed" },
          avgHostMemTotal: { $avg: "$hostMemoryTotal" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    processMemory: processMemData.map((d) => ({
      timestamp: d._id,
      avgUsage: Math.round((d.avgProcessMem || 0) * 100) / 100,
      maxUsage: Math.round((d.maxProcessMem || 0) * 100) / 100,
      avgUsed: Math.round(d.avgProcessMemUsed || 0),
      avgTotal: Math.round(d.avgProcessMemTotal || 0),
    })),
    hostMemory: hostMemData.map((d) => ({
      timestamp: d._id,
      avgUsage: Math.round((d.avgHostMem || 0) * 100) / 100,
      maxUsage: Math.round((d.maxHostMem || 0) * 100) / 100,
      avgUsed: Math.round(d.avgHostMemUsed || 0),
      avgTotal: Math.round(d.avgHostMemTotal || 0),
    })),
  };
}

export async function getApiPerformanceHistory(filters = {}) {
  const { startDate, endDate, interval = "1h" } = filters;

  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) dateQuery.$lte = new Date(endDate);
  const hasDateFilter = Object.keys(dateQuery).length > 0;

  const matchQuery = hasDateFilter ? { timestamp: dateQuery } : {};

  let groupFormat;
  switch (interval) {
    case "1m":
      groupFormat = "%Y-%m-%d %H:%M";
      break;
    case "1h":
      groupFormat = "%Y-%m-%d %H:00";
      break;
    case "1d":
      groupFormat = "%Y-%m-%d";
      break;
    default:
      groupFormat = "%Y-%m-%d %H:00";
  }

  const [apiData, endpointData] = await Promise.all([
    SystemMetric.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$timestamp" } },
          avgResponse: { $avg: "$apiResponseTime" },
          maxResponse: { $max: "$apiResponseTime" },
          avgP50: { $avg: "$apiResponseTimeP50" },
          avgP95: { $avg: "$apiResponseTimeP95" },
          avgP99: { $avg: "$apiResponseTimeP99" },
          avgErrorRate: { $avg: "$errorRate" },
          avgRequestsPerMinute: { $avg: "$requestsPerMinute" },
          totalSlowRequests: { $sum: "$slowRequestsCount" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    SystemMetric.aggregate([
      { $match: matchQuery },
      { $project: { timestamp: 1, apiResponseTime: 1, errorRate: 1, requestsPerMinute: 1 } },
      { $sort: { timestamp: -1 } },
      { $limit: 1000 },
    ]),
  ]);

  return {
    timeline: apiData.map((d) => ({
      timestamp: d._id,
      avgResponse: Math.round(d.avgResponse || 0),
      maxResponse: Math.round(d.maxResponse || 0),
      p50: Math.round(d.avgP50 || 0),
      p95: Math.round(d.avgP95 || 0),
      p99: Math.round(d.avgP99 || 0),
      errorRate: Math.round((d.avgErrorRate || 0) * 100) / 100,
      requestsPerMinute: Math.round(d.avgRequestsPerMinute || 0),
      slowRequests: d.totalSlowRequests || 0,
    })),
    endpointPerformance: [],
  };
}

export async function getDatabasePerformanceHistory(filters = {}) {
  const { startDate, endDate, interval = "1h" } = filters;

  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) dateQuery.$lte = new Date(endDate);
  const hasDateFilter = Object.keys(dateQuery).length > 0;

  const matchQuery = hasDateFilter ? { timestamp: dateQuery } : {};

  let groupFormat;
  switch (interval) {
    case "1m":
      groupFormat = "%Y-%m-%d %H:%M";
      break;
    case "1h":
      groupFormat = "%Y-%m-%d %H:00";
      break;
    case "1d":
      groupFormat = "%Y-%m-%d";
      break;
    default:
      groupFormat = "%Y-%m-%d %H:00";
  }

  const dbData = await SystemMetric.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: { $dateToString: { format: groupFormat, date: "$timestamp" } },
        avgResponse: { $avg: "$databaseResponseTime" },
        maxResponse: { $max: "$databaseResponseTime" },
        avgConnections: { $avg: "$databaseActiveConnections" },
        maxConnections: { $max: "$databaseActiveConnections" },
        avgPoolUtilization: { $avg: "$databaseConnectionPoolUtilization" },
        totalSlowQueries: { $sum: "$slowQueriesCount" },
        totalFailedQueries: { $sum: "$failedQueriesCount" },
        totalOperations: { $sum: "$databaseOperationVolume" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    timeline: dbData.map((d) => ({
      timestamp: d._id,
      avgResponse: Math.round(d.avgResponse || 0),
      maxResponse: Math.round(d.maxResponse || 0),
      avgConnections: Math.round(d.avgConnections || 0),
      maxConnections: d.maxConnections || 0,
      avgPoolUtilization: Math.round((d.avgPoolUtilization || 0) * 100) / 100,
      slowQueries: d.totalSlowQueries || 0,
      failedQueries: d.totalFailedQueries || 0,
      totalOperations: d.totalOperations || 0,
    })),
  };
}

export async function getPeakUsageAnalytics(filters = {}) {
  const { startDate, endDate } = filters;

  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) dateQuery.$lte = new Date(endDate);
  const hasDateFilter = Object.keys(dateQuery).length > 0;

  const matchQuery = hasDateFilter ? { timestamp: dateQuery } : {};

  const [hourlyData, dailyData, weeklyData, monthlyData, concurrentTimeline, heatmapData] = await Promise.all([
    SystemMetric.aggregate([
      { $match: matchQuery },
      { $group: { _id: { $hour: "$timestamp" }, avgConcurrent: { $avg: "$concurrentUsers" }, maxConcurrent: { $max: "$concurrentUsers" }, avgRequests: { $avg: "$requestsPerMinute" } } },
      { $sort: { _id: 1 } },
    ]),
    SystemMetric.aggregate([
      { $match: matchQuery },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }, avgConcurrent: { $avg: "$concurrentUsers" }, maxConcurrent: { $max: "$concurrentUsers" }, totalRequests: { $sum: "$requestsPerMinute" } } },
      { $sort: { _id: 1 } },
    ]),
    SystemMetric.aggregate([
      { $match: matchQuery },
      { $group: { _id: { $week: "$timestamp" }, avgConcurrent: { $avg: "$concurrentUsers" }, maxConcurrent: { $max: "$concurrentUsers" }, totalRequests: { $sum: "$requestsPerMinute" } } },
      { $sort: { _id: 1 } },
    ]),
    SystemMetric.aggregate([
      { $match: matchQuery },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$timestamp" } }, avgConcurrent: { $avg: "$concurrentUsers" }, maxConcurrent: { $max: "$concurrentUsers" }, totalRequests: { $sum: "$requestsPerMinute" } } },
      { $sort: { _id: 1 } },
    ]),
    SystemMetric.aggregate([
      { $match: matchQuery },
      { $project: { timestamp: 1, concurrentUsers: 1, requestsPerMinute: 1 } },
      { $sort: { timestamp: 1 } },
    ]),
    SystemMetric.aggregate([
      { $match: matchQuery },
      { $group: { _id: { dayOfWeek: { $dayOfWeek: "$timestamp" }, hour: { $hour: "$timestamp" } }, avgConcurrent: { $avg: "$concurrentUsers" }, maxConcurrent: { $max: "$concurrentUsers" }, count: { $sum: 1 } } },
      { $sort: { "_id.dayOfWeek": 1, "_id.hour": 1 } },
    ]),
  ]);

  const peakHourly = hourlyData.reduce((max, curr) => (curr.maxConcurrent > max.maxConcurrent ? curr : max), { maxConcurrent: 0 });
  const peakDaily = dailyData.reduce((max, curr) => (curr.maxConcurrent > max.maxConcurrent ? curr : max), { maxConcurrent: 0 });

  return {
    hourlyUsage: hourlyData.map((d) => ({ hour: d._id, avgConcurrent: Math.round(d.avgConcurrent), maxConcurrent: d.maxConcurrent, avgRequests: Math.round(d.avgRequests) })),
    dailyUsage: dailyData.map((d) => ({ date: d._id, avgConcurrent: Math.round(d.avgConcurrent), maxConcurrent: d.maxConcurrent, totalRequests: d.totalRequests })),
    weeklyUsage: weeklyData.map((d) => ({ week: d._id, avgConcurrent: Math.round(d.avgConcurrent), maxConcurrent: d.maxConcurrent, totalRequests: d.totalRequests })),
    monthlyUsage: monthlyData.map((d) => ({ month: d._id, avgConcurrent: Math.round(d.avgConcurrent), maxConcurrent: d.maxConcurrent, totalRequests: d.totalRequests })),
    concurrentTimeline: concurrentTimeline.map((d) => ({ timestamp: d.timestamp, concurrent: d.concurrentUsers, requests: d.requestsPerMinute })),
    weekdayHourHeatmap: heatmapData.map((d) => ({ dayOfWeek: d._id.dayOfWeek, hour: d._id.hour, avgConcurrent: Math.round(d.avgConcurrent), maxConcurrent: d.maxConcurrent })),
    peakStats: {
      peakHour: peakHourly._id,
      peakHourConcurrent: peakHourly.maxConcurrent,
      peakDate: peakDaily._id,
      peakDateConcurrent: peakDaily.maxConcurrent,
      currentConcurrent: concurrentTimeline[concurrentTimeline.length - 1]?.concurrent || 0,
      avgConcurrent: Math.round(hourlyData.reduce((sum, d) => sum + d.avgConcurrent, 0) / (hourlyData.length || 1)),
    },
  };
}

export async function getPerformanceAlerts(filters = {}) {
  const { status, severity, metricType, page = 1, limit = 25 } = filters;

  const query = {};
  if (status) query.status = status;
  if (severity) query.severity = severity;
  if (metricType) query.metricType = metricType;

  const skip = (page - 1) * limit;

  const [alerts, total] = await Promise.all([
    PerformanceAlert.find(query)
      .populate("acknowledgedBy", "firstName lastName email")
      .populate("resolvedBy", "firstName lastName email")
      .sort({ lastDetectedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PerformanceAlert.countDocuments(query),
  ]);

  return {
    alerts: alerts.map((a) => ({
      id: a._id.toString(),
      metricType: a.metricType,
      severity: a.severity,
      title: a.title,
      message: a.message,
      threshold: a.threshold,
      currentValue: a.currentValue,
      unit: a.unit,
      firstDetectedAt: a.firstDetectedAt,
      lastDetectedAt: a.lastDetectedAt,
      acknowledgedAt: a.acknowledgedAt,
      acknowledgedBy: a.acknowledgedBy,
      resolvedAt: a.resolvedAt,
      resolvedBy: a.resolvedBy,
      status: a.status,
      affectedService: a.affectedService,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function acknowledgeAlert(alertId, userId) {
  const alert = await PerformanceAlert.findByIdAndUpdate(
    alertId,
    { status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: userId },
    { new: true }
  ).populate("acknowledgedBy", "firstName lastName email");
  return alert;
}

export async function resolveAlert(alertId, userId) {
  const alert = await PerformanceAlert.findByIdAndUpdate(
    alertId,
    { status: "resolved", resolvedAt: new Date(), resolvedBy: userId },
    { new: true }
  ).populate("resolvedBy", "firstName lastName email");
  return alert;
}

export async function getHistoricalComparison(filters = {}) {
  const { period = "week", endDate } = filters;

  const end = endDate ? new Date(endDate) : new Date();
  let currentStart, previousStart, previousEnd;

  switch (period) {
    case "day":
      currentStart = new Date(end);
      currentStart.setDate(currentStart.getDate() - 1);
      previousEnd = new Date(currentStart);
      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - 1);
      break;
    case "week":
      currentStart = new Date(end);
      currentStart.setDate(currentStart.getDate() - 7);
      previousEnd = new Date(currentStart);
      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - 7);
      break;
    case "month":
      currentStart = new Date(end);
      currentStart.setMonth(currentStart.getMonth() - 1);
      previousEnd = new Date(currentStart);
      previousStart = new Date(previousEnd);
      previousStart.setMonth(previousStart.getMonth() - 1);
      break;
    default:
      currentStart = new Date(end);
      currentStart.setDate(currentStart.getDate() - 7);
      previousEnd = new Date(currentStart);
      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - 7);
  }

  const [currentMetrics, previousMetrics, currentUsers, previousUsers, currentSessions, previousSessions] = await Promise.all([
    SystemMetric.aggregate([
      { $match: { timestamp: { $gte: currentStart, $lte: end } } },
      {
        $group: {
          _id: null,
          avgCpu: { $avg: "$processCpuUsage" },
          avgMemory: { $avg: "$processMemoryUsagePercentage" },
          avgApiResponse: { $avg: "$apiResponseTime" },
          avgErrorRate: { $avg: "$errorRate" },
          avgConcurrentUsers: { $avg: "$concurrentUsers" },
          maxConcurrentUsers: { $max: "$concurrentUsers" },
          totalRequests: { $sum: "$requestsPerMinute" },
        },
      },
    ]),
    SystemMetric.aggregate([
      { $match: { timestamp: { $gte: previousStart, $lte: previousEnd } } },
      {
        $group: {
          _id: null,
          avgCpu: { $avg: "$processCpuUsage" },
          avgMemory: { $avg: "$processMemoryUsagePercentage" },
          avgApiResponse: { $avg: "$apiResponseTime" },
          avgErrorRate: { $avg: "$errorRate" },
          avgConcurrentUsers: { $avg: "$concurrentUsers" },
          maxConcurrentUsers: { $max: "$concurrentUsers" },
          totalRequests: { $sum: "$requestsPerMinute" },
        },
      },
    ]),
    UserSession.countDocuments({ loginAt: { $gte: currentStart, $lte: end } }),
    UserSession.countDocuments({ loginAt: { $gte: previousStart, $lte: previousEnd } }),
    UserSession.aggregate([
      { $match: { loginAt: { $gte: currentStart, $lte: end } } },
      { $group: { _id: null, avgDuration: { $avg: { $add: ["$activeDuration", "$idleDuration"] } } } },
    ]),
    UserSession.aggregate([
      { $match: { loginAt: { $gte: previousStart, $lte: previousEnd } } },
      { $group: { _id: null, avgDuration: { $avg: { $add: ["$activeDuration", "$idleDuration"] } } } },
    ]),
  ]);

  const curr = currentMetrics[0] || {};
  const prev = previousMetrics[0] || {};
  const currSess = currentSessions[0] || {};
  const prevSess = previousSessions[0] || {};

  const calculateChange = (current, previous) => {
    if (previous === 0 || previous === null || previous === undefined) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100 * 100) / 100;
  };

  return {
    period,
    currentPeriod: { start: currentStart, end },
    previousPeriod: { start: previousStart, end: previousEnd },
    metrics: {
      cpu: {
        current: Math.round((curr.avgCpu || 0) * 100) / 100,
        previous: Math.round((prev.avgCpu || 0) * 100) / 100,
        change: calculateChange(curr.avgCpu || 0, prev.avgCpu || 0),
      },
      memory: {
        current: Math.round((curr.avgMemory || 0) * 100) / 100,
        previous: Math.round((prev.avgMemory || 0) * 100) / 100,
        change: calculateChange(curr.avgMemory || 0, prev.avgMemory || 0),
      },
      apiResponseTime: {
        current: Math.round(curr.avgApiResponse || 0),
        previous: Math.round(prev.avgApiResponse || 0),
        change: calculateChange(curr.avgApiResponse || 0, prev.avgApiResponse || 0),
      },
      errorRate: {
        current: Math.round((curr.avgErrorRate || 0) * 100) / 100,
        previous: Math.round((prev.avgErrorRate || 0) * 100) / 100,
        change: calculateChange(curr.avgErrorRate || 0, prev.avgErrorRate || 0),
      },
      concurrentUsers: {
        current: Math.round(curr.avgConcurrentUsers || 0),
        previous: Math.round(prev.avgConcurrentUsers || 0),
        change: calculateChange(curr.avgConcurrentUsers || 0, prev.avgConcurrentUsers || 0),
      },
      peakConcurrentUsers: {
        current: curr.maxConcurrentUsers || 0,
        previous: prev.maxConcurrentUsers || 0,
        change: calculateChange(curr.maxConcurrentUsers || 0, prev.maxConcurrentUsers || 0),
      },
      totalRequests: {
        current: curr.totalRequests || 0,
        previous: prev.totalRequests || 0,
        change: calculateChange(curr.totalRequests || 0, prev.totalRequests || 0),
      },
      totalSessions: {
        current: currentUsers,
        previous: previousUsers,
        change: calculateChange(currentUsers, previousUsers),
      },
      avgSessionDuration: {
        current: Math.round((currSess.avgDuration || 0) / 1000 / 60),
        previous: Math.round((prevSess.avgDuration || 0) / 1000 / 60),
        change: calculateChange(currSess.avgDuration || 0, prevSess.avgDuration || 0),
      },
    },
  };
}