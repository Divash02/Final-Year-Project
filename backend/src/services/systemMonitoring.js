import os from "node:os";
import { performance } from "node:perf_hooks";
import { SystemMetric, PerformanceAlert } from "../models/index.js";

let requestTimes = [];
let requestCount = 0;
let errorCount = 0;
let slowRequestCount = 0;
const SLOW_REQUEST_THRESHOLD_MS = 1000;
const METRICS_WINDOW_MS = 60000;

let lastCpuUsage = process.cpuUsage();
let lastCpuCheck = Date.now();

function getHostCpuUsage() {
  try {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    return ((1 - idle / total) * 100).toFixed(2);
  } catch {
    return null;
  }
}

function getHostMemoryInfo() {
  try {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      total,
      used,
      free,
      usagePercentage: ((used / total) * 100).toFixed(2),
    };
  } catch {
    return null;
  }
}

function getProcessCpuUsage() {
  try {
    const currentCpuUsage = process.cpuUsage();
    const currentTime = Date.now();

    const userDiff = currentCpuUsage.user - lastCpuUsage.user;
    const systemDiff = currentCpuUsage.system - lastCpuUsage.system;
    const timeDiff = (currentTime - lastCpuCheck) * 1000;

    lastCpuUsage = currentCpuUsage;
    lastCpuCheck = currentTime;

    const cpuPercent = ((userDiff + systemDiff) / timeDiff) * 100;
    return Math.min(Math.max(cpuPercent, 0), 100).toFixed(2);
  } catch {
    return null;
  }
}

function getProcessMemoryInfo() {
  try {
    const mem = process.memoryUsage();
    return {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      usagePercentage: ((mem.heapUsed / mem.heapTotal) * 100).toFixed(2),
    };
  } catch {
    return null;
  }
}

function getEventLoopLag() {
  try {
    const start = performance.now();
    setImmediate(() => {
      const lag = performance.now() - start;
      return lag;
    });
    return null;
  } catch {
    return null;
  }
}

export function recordRequest(durationMs, isError = false, isSlow = false) {
  const now = Date.now();
  requestTimes.push({ time: now, duration: durationMs });
  requestCount++;
  if (isError) errorCount++;
  if (isSlow) slowRequestCount++;

  const cutoff = now - METRICS_WINDOW_MS;
  requestTimes = requestTimes.filter((r) => r.time > cutoff);
}

export function getApiMetrics() {
  const now = Date.now();
  const cutoff = now - METRICS_WINDOW_MS;
  const recentRequests = requestTimes.filter((r) => r.time > cutoff);

  if (recentRequests.length === 0) {
    return {
      avgResponseTime: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      requestsPerMinute: 0,
      errorRate: 0,
      slowRequestsCount: 0,
    };
  }

  const durations = recentRequests.map((r) => r.duration).sort((a, b) => a - b);
  const count = durations.length;

  const sum = durations.reduce((a, b) => a + b, 0);
  const avg = sum / count;

  const p50 = durations[Math.floor(count * 0.5)];
  const p95 = durations[Math.floor(count * 0.95)];
  const p99 = durations[Math.floor(count * 0.99)];

  return {
    avgResponseTime: Math.round(avg),
    p50: Math.round(p50),
    p95: Math.round(p95),
    p99: Math.round(p99),
    requestsPerMinute: count,
    errorRate: requestCount > 0 ? (errorCount / requestCount) * 100 : 0,
    slowRequestsCount: slowRequestCount,
  };
}

export async function collectSystemMetrics(options = {}) {
  const {
    concurrentUsers = 0,
    activeSessions = 0,
    databaseMetrics = {},
  } = options;

  const now = new Date();
  const processCpu = getProcessCpuUsage();
  const processMem = getProcessMemoryInfo();
  const hostCpu = getHostCpuUsage();
  const hostMem = getHostMemoryInfo();
  const apiMetrics = getApiMetrics();
  const uptime = process.uptime();

  const metric = {
    timestamp: now,
    processCpuUsage: processCpu ? Number(processCpu) : null,
    processMemoryUsed: processMem ? processMem.heapUsed : null,
    processMemoryTotal: processMem ? processMem.heapTotal : null,
    processMemoryUsagePercentage: processMem ? Number(processMem.usagePercentage) : null,
    eventLoopLag: null,
    hostCpuUsage: hostCpu ? Number(hostCpu) : null,
    hostMemoryTotal: hostMem ? hostMem.total : null,
    hostMemoryUsed: hostMem ? hostMem.used : null,
    hostMemoryUsagePercentage: hostMem ? Number(hostMem.usagePercentage) : null,
    hostCpuCores: os.cpus().length,
    apiResponseTime: apiMetrics.avgResponseTime,
    apiResponseTimeP50: apiMetrics.p50,
    apiResponseTimeP95: apiMetrics.p95,
    apiResponseTimeP99: apiMetrics.p99,
    requestsPerMinute: apiMetrics.requestsPerMinute,
    errorRate: Number(apiMetrics.errorRate.toFixed(2)),
    slowRequestsCount: apiMetrics.slowRequestsCount,
    databaseResponseTime: databaseMetrics.avgResponseTime || null,
    databaseActiveConnections: databaseMetrics.activeConnections || null,
    databaseConnectionPoolUtilization: databaseMetrics.poolUtilization || null,
    slowQueriesCount: databaseMetrics.slowQueriesCount || 0,
    failedQueriesCount: databaseMetrics.failedQueriesCount || 0,
    databaseOperationVolume: databaseMetrics.operationVolume || 0,
    concurrentUsers,
    activeSessions,
    serverUptime: Math.floor(uptime),
    systemHealthStatus: determineHealthStatus({
      cpu: processCpu ? Number(processCpu) : (hostCpu ? Number(hostCpu) : null),
      memory: processMem ? Number(processMem.usagePercentage) : (hostMem ? Number(hostMem.usagePercentage) : null),
      errorRate: apiMetrics.errorRate,
      apiResponseTime: apiMetrics.avgResponseTime,
    }),
    collectionInterval: 60000,
    source: "server",
  };

  await SystemMetric.create(metric);
  await checkAndCreateAlerts(metric);

  return metric;
}

function determineHealthStatus(metrics) {
  const { cpu, memory, errorRate, apiResponseTime } = metrics;

  if (
    (cpu !== null && cpu > 80) ||
    (memory !== null && memory > 85) ||
    (errorRate > 5) ||
    (apiResponseTime > 2000)
  ) {
    return "critical";
  }

  if (
    (cpu !== null && cpu > 60) ||
    (memory !== null && memory > 70) ||
    (errorRate > 1) ||
    (apiResponseTime > 1000)
  ) {
    return "warning";
  }

  return "healthy";
}

async function checkAndCreateAlerts(metric) {
  const alerts = [];

  if (metric.processCpuUsage !== null && metric.processCpuUsage > 80) {
    alerts.push({
      metricType: "cpu",
      severity: "critical",
      title: "High CPU Usage",
      message: `Process CPU usage is at ${metric.processCpuUsage.toFixed(1)}%`,
      threshold: 80,
      currentValue: metric.processCpuUsage,
      unit: "%",
      affectedService: "api",
    });
  } else if (metric.processCpuUsage !== null && metric.processCpuUsage > 60) {
    alerts.push({
      metricType: "cpu",
      severity: "warning",
      title: "Elevated CPU Usage",
      message: `Process CPU usage is at ${metric.processCpuUsage.toFixed(1)}%`,
      threshold: 60,
      currentValue: metric.processCpuUsage,
      unit: "%",
      affectedService: "api",
    });
  }

  if (metric.processMemoryUsagePercentage !== null && metric.processMemoryUsagePercentage > 85) {
    alerts.push({
      metricType: "memory",
      severity: "critical",
      title: "High Memory Usage",
      message: `Process memory usage is at ${metric.processMemoryUsagePercentage.toFixed(1)}%`,
      threshold: 85,
      currentValue: metric.processMemoryUsagePercentage,
      unit: "%",
      affectedService: "api",
    });
  } else if (metric.processMemoryUsagePercentage !== null && metric.processMemoryUsagePercentage > 70) {
    alerts.push({
      metricType: "memory",
      severity: "warning",
      title: "Elevated Memory Usage",
      message: `Process memory usage is at ${metric.processMemoryUsagePercentage.toFixed(1)}%`,
      threshold: 70,
      currentValue: metric.processMemoryUsagePercentage,
      unit: "%",
      affectedService: "api",
    });
  }

  if (metric.errorRate > 5) {
    alerts.push({
      metricType: "error_rate",
      severity: "critical",
      title: "High API Error Rate",
      message: `API error rate is ${metric.errorRate.toFixed(2)}%`,
      threshold: 5,
      currentValue: metric.errorRate,
      unit: "%",
      affectedService: "api",
    });
  } else if (metric.errorRate > 1) {
    alerts.push({
      metricType: "error_rate",
      severity: "warning",
      title: "Elevated API Error Rate",
      message: `API error rate is ${metric.errorRate.toFixed(2)}%`,
      threshold: 1,
      currentValue: metric.errorRate,
      unit: "%",
      affectedService: "api",
    });
  }

  if (metric.apiResponseTime > 2000) {
    alerts.push({
      metricType: "api_response_time",
      severity: "critical",
      title: "Critical API Slowdown",
      message: `Average API response time is ${metric.apiResponseTime}ms`,
      threshold: 2000,
      currentValue: metric.apiResponseTime,
      unit: "ms",
      affectedService: "api",
    });
  } else if (metric.apiResponseTime > 1000) {
    alerts.push({
      metricType: "api_response_time",
      severity: "warning",
      title: "Slow API Response",
      message: `Average API response time is ${metric.apiResponseTime}ms`,
      threshold: 1000,
      currentValue: metric.apiResponseTime,
      unit: "ms",
      affectedService: "api",
    });
  }

  if (metric.databaseResponseTime !== null && metric.databaseResponseTime > 1000) {
    alerts.push({
      metricType: "database_response_time",
      severity: "critical",
      title: "Slow Database Queries",
      message: `Average database response time is ${metric.databaseResponseTime}ms`,
      threshold: 1000,
      currentValue: metric.databaseResponseTime,
      unit: "ms",
      affectedService: "database",
    });
  } else if (metric.databaseResponseTime !== null && metric.databaseResponseTime > 500) {
    alerts.push({
      metricType: "database_response_time",
      severity: "warning",
      title: "Elevated Database Latency",
      message: `Average database response time is ${metric.databaseResponseTime}ms`,
      threshold: 500,
      currentValue: metric.databaseResponseTime,
      unit: "ms",
      affectedService: "database",
    });
  }

  if (metric.databaseConnectionPoolUtilization !== null && metric.databaseConnectionPoolUtilization > 90) {
    alerts.push({
      metricType: "connection_pool",
      severity: "critical",
      title: "Database Connection Pool Exhaustion",
      message: `Connection pool utilization is at ${metric.databaseConnectionPoolUtilization.toFixed(1)}%`,
      threshold: 90,
      currentValue: metric.databaseConnectionPoolUtilization,
      unit: "%",
      affectedService: "database",
    });
  } else if (metric.databaseConnectionPoolUtilization !== null && metric.databaseConnectionPoolUtilization > 75) {
    alerts.push({
      metricType: "connection_pool",
      severity: "warning",
      title: "High Connection Pool Usage",
      message: `Connection pool utilization is at ${metric.databaseConnectionPoolUtilization.toFixed(1)}%`,
      threshold: 75,
      currentValue: metric.databaseConnectionPoolUtilization,
      unit: "%",
      affectedService: "database",
    });
  }

  for (const alert of alerts) {
    const existing = await PerformanceAlert.findOne({
      metricType: alert.metricType,
      severity: alert.severity,
      status: { $in: ["active", "acknowledged"] },
    });

    if (existing) {
      existing.lastDetectedAt = new Date();
      existing.currentValue = alert.currentValue;
      existing.metadata = { ...existing.metadata, ...alert };
      await existing.save();
    } else {
      await PerformanceAlert.create({
        ...alert,
        firstDetectedAt: new Date(),
        lastDetectedAt: new Date(),
        status: "active",
      });
    }
  }
}

export function resetApiMetrics() {
  requestTimes = [];
  requestCount = 0;
  errorCount = 0;
  slowRequestCount = 0;
}

export { getProcessCpuUsage, getProcessMemoryInfo, getHostCpuUsage, getHostMemoryInfo };