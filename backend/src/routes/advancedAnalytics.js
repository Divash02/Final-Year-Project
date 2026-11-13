import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  getWebsiteUsageOverview,
  getUserActivityTable,
  getIndividualUserActivity,
  getModuleUsageAnalytics,
  getUserBehaviorPatterns,
} from "../services/websiteAnalytics.js";
import {
  getSystemPerformanceOverview,
  getCpuPerformanceHistory,
  getMemoryPerformanceHistory,
  getApiPerformanceHistory,
  getDatabasePerformanceHistory,
  getPeakUsageAnalytics,
  getPerformanceAlerts,
  acknowledgeAlert,
  resolveAlert,
  getHistoricalComparison,
} from "../services/systemPerformanceAnalytics.js";
import { collectSystemMetrics, recordRequest, getProcessCpuUsage, getProcessMemoryInfo } from "../services/systemMonitoring.js";
import { UserSession } from "../models/index.js";

export function registerAdvancedAnalyticsRoutes(app) {
  const METRICS_COLLECTION_INTERVAL = 60000;

  setInterval(async () => {
    try {
      const concurrentUsers = await UserSession.countDocuments({
        sessionStatus: "active",
        lastActiveAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
      });
      await collectSystemMetrics({ concurrentUsers });
    } catch (err) {
      console.error("Scheduled metrics collection error:", err.message);
    }
  }, METRICS_COLLECTION_INTERVAL);

  app.use("/api/analytics/website", requireAuth, requirePermission("website_analytics.view"));

  app.get("/api/analytics/website/overview", async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        department: req.query.department,
        role: req.query.role,
        academicYear: req.query.academicYear,
      };
      const data = await getWebsiteUsageOverview(filters);
      res.json(data);
    } catch (err) {
      console.error("Website usage overview error:", err);
      res.status(500).json({ error: "Failed to load website usage overview." });
    }
  });

  app.get("/api/analytics/website/users", async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        department: req.query.department,
        role: req.query.role,
        academicYear: req.query.academicYear,
        userId: req.query.userId,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
        activeOnly: req.query.activeOnly === "true",
      };
      const data = await getUserActivityTable(filters);
      res.json(data);
    } catch (err) {
      console.error("User activity table error:", err);
      res.status(500).json({ error: "Failed to load user activity table." });
    }
  });

  app.get("/api/analytics/website/users/:userId", async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      };
      const data = await getIndividualUserActivity(req.params.userId, filters);
      if (!data) {
        return res.status(404).json({ error: "User not found." });
      }
      res.json(data);
    } catch (err) {
      console.error("Individual user activity error:", err);
      res.status(500).json({ error: "Failed to load individual user activity." });
    }
  });

  app.get("/api/analytics/website/modules", async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        department: req.query.department,
        role: req.query.role,
        academicYear: req.query.academicYear,
      };
      const data = await getModuleUsageAnalytics(filters);
      res.json(data);
    } catch (err) {
      console.error("Module usage analytics error:", err);
      res.status(500).json({ error: "Failed to load module usage analytics." });
    }
  });

  app.get("/api/analytics/website/behavior", async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        department: req.query.department,
        role: req.query.role,
      };
      const data = await getUserBehaviorPatterns(filters);
      res.json(data);
    } catch (err) {
      console.error("User behavior patterns error:", err);
      res.status(500).json({ error: "Failed to load user behavior patterns." });
    }
  });

  app.use("/api/analytics/system", requireAuth, requirePermission("system_performance.view"));

  app.get("/api/analytics/system/overview", async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        interval: req.query.interval,
      };
      const data = await getSystemPerformanceOverview(filters);
      res.json(data);
    } catch (err) {
      console.error("System performance overview error:", err);
      res.status(500).json({ error: "Failed to load system performance overview." });
    }
  });

  app.get("/api/analytics/system/cpu", async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        interval: req.query.interval,
      };
      const data = await getCpuPerformanceHistory(filters);
      res.json(data);
    } catch (err) {
      console.error("CPU performance history error:", err);
      res.status(500).json({ error: "Failed to load CPU performance history." });
    }
  });

  app.get("/api/analytics/system/memory", async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        interval: req.query.interval,
      };
      const data = await getMemoryPerformanceHistory(filters);
      res.json(data);
    } catch (err) {
      console.error("Memory performance history error:", err);
      res.status(500).json({ error: "Failed to load memory performance history." });
    }
  });

  app.get("/api/analytics/system/api", async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        interval: req.query.interval,
      };
      const data = await getApiPerformanceHistory(filters);
      res.json(data);
    } catch (err) {
      console.error("API performance history error:", err);
      res.status(500).json({ error: "Failed to load API performance history." });
    }
  });

  app.get("/api/analytics/system/database", async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        interval: req.query.interval,
      };
      const data = await getDatabasePerformanceHistory(filters);
      res.json(data);
    } catch (err) {
      console.error("Database performance history error:", err);
      res.status(500).json({ error: "Failed to load database performance history." });
    }
  });

  app.get("/api/analytics/system/peak-usage", async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      };
      const data = await getPeakUsageAnalytics(filters);
      res.json(data);
    } catch (err) {
      console.error("Peak usage analytics error:", err);
      res.status(500).json({ error: "Failed to load peak usage analytics." });
    }
  });

  app.get("/api/analytics/system/alerts", async (req, res) => {
    try {
      const filters = {
        status: req.query.status,
        severity: req.query.severity,
        metricType: req.query.metricType,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
      };
      const data = await getPerformanceAlerts(filters);
      res.json(data);
    } catch (err) {
      console.error("Performance alerts error:", err);
      res.status(500).json({ error: "Failed to load performance alerts." });
    }
  });

  app.post("/api/analytics/system/alerts/:alertId/acknowledge", async (req, res) => {
    try {
      const alert = await acknowledgeAlert(req.params.alertId, req.user._id);
      if (!alert) {
        return res.status(404).json({ error: "Alert not found." });
      }
      res.json(alert);
    } catch (err) {
      console.error("Acknowledge alert error:", err);
      res.status(500).json({ error: "Failed to acknowledge alert." });
    }
  });

  app.post("/api/analytics/system/alerts/:alertId/resolve", async (req, res) => {
    try {
      const alert = await resolveAlert(req.params.alertId, req.user._id);
      if (!alert) {
        return res.status(404).json({ error: "Alert not found." });
      }
      res.json(alert);
    } catch (err) {
      console.error("Resolve alert error:", err);
      res.status(500).json({ error: "Failed to resolve alert." });
    }
  });

  app.get("/api/analytics/system/comparison", async (req, res) => {
    try {
      const filters = {
        period: req.query.period || "week",
        endDate: req.query.endDate,
      };
      const data = await getHistoricalComparison(filters);
      res.json(data);
    } catch (err) {
      console.error("Historical comparison error:", err);
      res.status(500).json({ error: "Failed to load historical comparison." });
    }
  });

  app.post("/api/analytics/heartbeat", requireAuth, async (req, res) => {
    try {
      const auth = String(req.headers.authorization || "");
      if (!auth.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const token = auth.slice("Bearer ".length).trim();
      if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { hashToken } = await import("../db.js");
      const tokenHash = hashToken(token);

      const session = await UserSession.findOne({ sessionTokenHash: tokenHash });
      if (!session) {
        return res.status(401).json({ error: "Invalid session" });
      }

      const now = new Date();
      const lastActive = new Date(session.lastActiveAt);
      const timeSinceLastActive = now.getTime() - lastActive.getTime();

      const idleThreshold = session.idleThreshold || 300000;
      const isIdle = timeSinceLastActive > idleThreshold;

      session.lastActiveAt = now;
      session.activeDuration += isIdle ? 0 : timeSinceLastActive;
      session.idleDuration += isIdle ? timeSinceLastActive : 0;
      session.sessionStatus = isIdle ? "idle" : "active";

      await session.save();

      const { UserActivityEvent } = await import("../models/index.js");
      await UserActivityEvent.create({
        user: req.user._id,
        session: session._id,
        eventType: "heartbeat",
        module: session.lastModule,
        route: req.body.currentRoute || null,
        timestamp: now,
        metadata: { isIdle, timeSinceLastActive },
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip || req.connection?.remoteAddress,
      });

      res.json({ status: "ok", sessionStatus: session.sessionStatus });
    } catch (err) {
      console.error("Heartbeat error:", err.message);
      res.status(500).json({ error: "Failed to process heartbeat" });
    }
  });

  app.post("/api/analytics/track", requireAuth, async (req, res) => {
    try {
      const { eventType, module, route, previousRoute, metadata } = req.body;

      const auth = String(req.headers.authorization || "");
      if (!auth.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const token = auth.slice("Bearer ".length).trim();
      if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { hashToken } = await import("../db.js");
      const tokenHash = hashToken(token);

      const session = await UserSession.findOne({ sessionTokenHash: tokenHash });
      if (!session) {
        return res.status(401).json({ error: "Invalid session" });
      }

      const { UserActivityEvent } = await import("../models/index.js");
      await UserActivityEvent.create({
        user: req.user._id,
        session: session._id,
        eventType: eventType || "page_view",
        module,
        route,
        previousRoute,
        timestamp: new Date(),
        metadata,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip || req.connection?.remoteAddress,
      });

      res.json({ status: "ok" });
    } catch (err) {
      console.error("Track event error:", err.message);
      res.status(500).json({ error: "Failed to track event" });
    }
  });

  const originalSend = app.response.send;
  app.response.send = function (body) {
    if (this.statusCode >= 400) {
      recordRequest(0, true);
    }
    return originalSend.call(this, body);
  };
}