import { UserActivityEvent, UserSession } from "../models/index.js";
import { hashToken } from "../db.js";

const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

function getModuleFromRoute(route) {
  if (!route) return "unknown";

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
    "/campus-extended": "Campus Facilities",
    "/campus/buildings": "Campus Buildings",
    "/campus/laboratories": "Campus Labs",
    "/campus/room-reservations": "Room Reservations",
    "/campus/maintenance": "Maintenance",
    "/campus/assets": "Assets",
    "/campus/transport": "Transport",
    "/safety/report-incident": "Safety",
    "/hr": "HR Dashboard",
    "/staff": "Staff Portal",
    "/recruitment": "Recruitment",
    "/workforce": "Workforce Planning",
    "/leave-approval": "Leave Approval",
    "/career": "Career Placement",
    "/hostel": "Hostel",
    "/clubs": "Student Clubs",
    "/workflows": "Workflow Automation",
    "/student-lifecycle": "Student Lifecycle",
    "/student/coding-lab": "Coding Lab",
    "/teacher/coding-lab": "Coding Lab",
    "/quizzes": "Quizzes",
    "/faculty-assessment": "Faculty Assessment",
    "/student-progress": "Student Progress",
    "/lesson-planning": "Lesson Planning",
    "/student-advising": "Student Advising",
    "/leave-substitution": "Leave Substitution",
    "/faculty-workload": "Faculty Workload",
    "/research-projects": "Research Projects",
    "/faculty-alerts": "Faculty Alerts",
    "/resource-booking": "Resource Booking",
    "/early-warning": "Early Warning",
    "/study-planner": "Study Planner",
    "/student-journey": "Student Journey",
    "/internship": "Internship",
    "/research": "Research",
    "/credentials": "Digital Credentials",
    "/safety": "Campus Safety",
    "/graduation": "Graduation",
  };

  for (const [path, module] of Object.entries(moduleMap)) {
    if (route.startsWith(path)) {
      return module;
    }
  }

  const parts = route.split("/").filter(Boolean);
  if (parts.length > 0) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }

  return "Unknown";
}

export async function trackUserActivity(req, res, next) {
  if (!req.user || !req.user._id) {
    return next();
  }

  if (req.path.startsWith("/api/analytics/") || req.path.startsWith("/api/audit/") || req.path.startsWith("/api/health/")) {
    return next();
  }

  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) {
    return next();
  }

  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return next();
  }

  const tokenHash = hashToken(token);

  try {
    const session = await UserSession.findOne({ sessionTokenHash: tokenHash }).lean();
    if (!session) {
      return next();
    }

    const route = req.path;
    const module = getModuleFromRoute(route);
    const now = new Date();

    const lastActive = new Date(session.lastActiveAt);
    const timeSinceLastActive = now.getTime() - lastActive.getTime();

    const isIdle = timeSinceLastActive > (session.idleThreshold || IDLE_THRESHOLD_MS);

    await UserSession.updateOne(
      { _id: session._id },
      {
        $set: { lastActiveAt: now },
        $inc: {
          activeDuration: isIdle ? 0 : timeSinceLastActive,
          idleDuration: isIdle ? timeSinceLastActive : 0,
          pagesVisited: 1,
        },
        $addToSet: { modulesAccessed: module },
        $setOnInsert: { firstModule: module },
        $set: { lastModule: module },
      }
    );

    await UserActivityEvent.create({
      user: req.user._id,
      session: session._id,
      eventType: "page_view",
      module,
      route,
      previousRoute: req.headers.referer ? new URL(req.headers.referer).pathname : null,
      timestamp: now,
      metadata: {
        method: req.method,
        query: req.query,
      },
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip || req.connection?.remoteAddress,
    });
  } catch (err) {
    console.error("User activity tracking error:", err.message);
  }

  next();
}

export async function trackModuleAccess(req, res, next) {
  if (!req.user || !req.user._id) {
    return next();
  }

  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) {
    return next();
  }

  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return next();
  }

  const tokenHash = hashToken(token);

  try {
    const session = await UserSession.findOne({ sessionTokenHash: tokenHash }).lean();
    if (!session) {
      return next();
    }

    const module = getModuleFromRoute(req.path);
    const now = new Date();

    await UserActivityEvent.create({
      user: req.user._id,
      session: session._id,
      eventType: "module_access",
      module,
      route: req.path,
      timestamp: now,
      metadata: {
        method: req.method,
      },
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip || req.connection?.remoteAddress,
    });
  } catch (err) {
    console.error("Module access tracking error:", err.message);
  }

  next();
}

export async function handleHeartbeat(req, res) {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const tokenHash = hashToken(token);

  try {
    const session = await UserSession.findOne({ sessionTokenHash: tokenHash });
    if (!session) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const now = new Date();
    const lastActive = new Date(session.lastActiveAt);
    const timeSinceLastActive = now.getTime() - lastActive.getTime();

    const isIdle = timeSinceLastActive > (session.idleThreshold || IDLE_THRESHOLD_MS);

    session.lastActiveAt = now;
    session.activeDuration += isIdle ? 0 : timeSinceLastActive;
    session.idleDuration += isIdle ? timeSinceLastActive : 0;
    session.sessionStatus = isIdle ? "idle" : "active";

    await session.save();

    await UserActivityEvent.create({
      user: req.user._id,
      session: session._id,
      eventType: "heartbeat",
      module: session.lastModule,
      route: req.body.currentRoute || null,
      timestamp: now,
      metadata: {
        isIdle,
        timeSinceLastActive,
      },
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip || req.connection?.remoteAddress,
    });

    res.json({ status: "ok", sessionStatus: session.sessionStatus });
  } catch (err) {
    console.error("Heartbeat error:", err.message);
    res.status(500).json({ error: "Failed to process heartbeat" });
  }
}

export async function handleLogout(req, res, next) {
  if (!req.user || !req.user._id) {
    return next();
  }

  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) {
    return next();
  }

  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return next();
  }

  const tokenHash = hashToken(token);

  try {
    const session = await UserSession.findOne({ sessionTokenHash: tokenHash });
    if (!session) {
      return next();
    }

    const now = new Date();
    const lastActive = new Date(session.lastActiveAt);
    const timeSinceLastActive = now.getTime() - lastActive.getTime();

    const isIdle = timeSinceLastActive > (session.idleThreshold || IDLE_THRESHOLD_MS);

    session.logoutAt = now;
    session.lastActiveAt = now;
    session.activeDuration += isIdle ? 0 : timeSinceLastActive;
    session.idleDuration += isIdle ? timeSinceLastActive : 0;
    session.totalDuration = session.activeDuration + session.idleDuration;
    session.sessionStatus = "logged_out";

    await session.save();

    await UserActivityEvent.create({
      user: req.user._id,
      session: session._id,
      eventType: "logout",
      module: session.lastModule,
      route: req.path,
      timestamp: now,
      metadata: {
        activeDuration: session.activeDuration,
        idleDuration: session.idleDuration,
        totalDuration: session.totalDuration,
        pagesVisited: session.pagesVisited,
        modulesAccessed: session.modulesAccessed,
      },
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip || req.connection?.remoteAddress,
    });
  } catch (err) {
    console.error("Logout tracking error:", err.message);
  }

  next();
}