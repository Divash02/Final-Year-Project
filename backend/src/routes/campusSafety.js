import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles, logAudit } from "../db.js";
import mongoose from "mongoose";
import {
  Student,
  User,
  CampusIncident,
  IncidentUpdate,
  IncidentMessage,
  StoredFile,
} from "../models/index.js";
import { runMultiFileUpload, createUploader } from "../services/fileStorage.js";
import { createNotifications } from "../services/workflowEngine.js";

const INCIDENT_TYPES = [
  "THEFT",
  "ASSAULT",
  "HARASSMENT",
    "VANDALISM",
    "FIRE_HAZARD",
  "MEDICAL_EMERGENCY",
  "BULLYING",
  "CYBERBULLYING",
  "SAFETY_CONCERN",
  "UNSAFE_CONDITION",
  "SECURITY_BREACH",
  "SUSPICIOUS_ACTIVITY",
  "OTHER",
];

// Remove duplicate while preserving order
const UNIQUE_INCIDENT_TYPES = [...new Set(INCIDENT_TYPES)];

const INCIDENT_SEVERITIES = ["LOW", "MODERATE", "HIGH", "CRITICAL"];
const INCIDENT_STATUSES = [
  "SUBMITTED",
  "RECEIVED",
  "UNDER_REVIEW",
  "ASSIGNED_FOR_INVESTIGATION",
  "INVESTIGATION_IN_PROGRESS",
  "AWAITING_STUDENT_INFORMATION",
  "ACTION_TAKEN",
  "RESOLVED",
  "CLOSED",
  "REPORTED",
  "ACKNOWLEDGED",
  "UNDER_INVESTIGATION",
  "ESCALATED",
];
const ACCESS_LEVELS = ["SECURITY_STAFF", "CAMPUS_ADMIN", "PRINCIPAL_MANAGEMENT"];

// Roles that may view and manage confidential incidents across the institution.
const CONFIDENTIAL_ACCESS_ROLES = [
  "security_staff",
  "campus_admin",
  "super_admin",
  "dean",
  "registrar",
  "program_coordinator",
  "hod",
];

// Roles that may manage the investigation workflow of an incident.
const MANAGE_ROLES = ["super_admin", "campus_admin", "dean", "hod", "program_coordinator", "registrar", "security_staff"];

const evidenceUploader = createUploader("campus_incident", { multiple: true, maxFiles: 8 });

function userId(user) {
  return String(user._id || user.id);
}

function displayName(user) {
  if (!user) return null;
  return [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ").trim() || null;
}

function isConfidentialAccess(roles) {
  return CONFIDENTIAL_ACCESS_ROLES.some((role) => roles.includes(role));
}

function isManageRole(roles) {
  return MANAGE_ROLES.some((role) => roles.includes(role));
}

function isStudentRole(roles) {
  return roles.includes("student");
}

function statusLabel(status) {
  const labels = {
    SUBMITTED: "Submitted",
    RECEIVED: "Received",
    UNDER_REVIEW: "Under Review",
    ASSIGNED_FOR_INVESTIGATION: "Assigned for Investigation",
    INVESTIGATION_IN_PROGRESS: "Investigation in Progress",
    AWAITING_STUDENT_INFORMATION: "Awaiting Student Information",
    ACTION_TAKEN: "Action Taken",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
    REPORTED: "Reported",
    ACKNOWLEDGED: "Acknowledged",
    UNDER_INVESTIGATION: "Under Investigation",
    ESCALATED: "Escalated",
  };
  return labels[status] || status;
}

function serializeIncident(incident, viewer) {
  const roles = getUserRoles(viewer);
  const isStudent = isStudentRole(roles);
  const isConfidentialAccess = isConfidentialAccess(roles);
  const isManage = isManageRole(roles);
  const actorId = userId(viewer);

  let visible = true;
  if (incident.isConfidential && !isStudent) {
    visible = isConfidentialAccess || isManage;
  }
  if (isStudent && String(incident.reportedBy) !== actorId) {
    visible = false;
  }

  if (!visible) return null;

  const studentOwner = incident.student;
  const reportedBy = incident.reportedBy;
  const assignedTo = incident.assignedTo;

  const base = {
    id: String(incident._id),
    _id: String(incident._id),
    incidentNumber: incident.incidentNumber,
    title: incident.title,
    incidentType: incident.incidentType,
    severity: incident.severity,
    status: incident.status,
    priority: incident.priority,
    description: incident.description,
    location: incident.location || {},
    incidentDate: incident.incidentDate,
    incidentTime: incident.incidentTime,
    occurredAt: incident.occurredAt,
    reportedAt: incident.reportedAt,
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
    peopleInvolved: incident.peopleInvolved || "",
    witnesses: isStudent || isConfidentialAccess || isManage ? (incident.witnesses || []) : [],
    anonymous: Boolean(incident.anonymous),
    confidentialityRequest: Boolean(incident.confidentialityRequest),
    isConfidential: Boolean(incident.isConfidential),
    accessLevel: incident.accessLevel,
    assignedDepartment: incident.assignedDepartment,
    assignedTo: assignedTo
      ? { id: String(assignedTo._id), name: `${assignedTo.firstName || ""} ${assignedTo.lastName || ""}`.trim(), email: assignedTo.email }
      : null,
    assignedAt: incident.assignedAt,
    reportedBy: reportedBy
      ? { id: String(reportedBy._id), name: `${reportedBy.firstName || ""} ${reportedBy.lastName || ""}`.trim(), email: reportedBy.email }
      : null,
    student: studentOwner
      ? { id: String(studentOwner._id), studentId: studentOwner.studentId, fullName: studentOwner.fullName || `${studentOwner.firstName} ${studentOwner.lastName}`.trim(), program: studentOwner.program, semester: studentOwner.semester }
      : null,
    evidence: (incident.evidence || []).map((e) => ({
      id: String(e.fileId),
      fileId: String(e.fileId),
      originalName: e.originalName,
      mimeType: e.mimeType,
      sizeBytes: e.sizeBytes,
      description: e.description,
      uploadedAt: e.uploadedAt,
    })),
    tags: incident.tags || [],
    actions: (incident.actions || []).map((a) => ({
      id: String(a._id),
      action: a.action,
      takenBy: a.takenBy
        ? { id: String(a.takenBy._id), name: `${a.takenBy.firstName || ""} ${a.takenBy.lastName || ""}`.trim() }
        : null,
      takenAt: a.takenAt,
      notes: isManage || isConfidentialAccess ? a.notes : "",
    })),
    internalNotes: isManage || isConfidentialAccess
      ? (incident.internalNotes || []).map((n) => ({
          id: String(n._id),
          note: n.note,
          writtenBy: n.writtenBy ? { id: String(n.writtenBy._id), name: displayName(n.writtenBy) } : null,
          writtenByName: n.writtenByName,
          writtenAt: n.writtenAt,
        }))
      : [],
    resolution: incident.resolution
      ? {
          summary: (isManage || isConfidentialAccess || (isStudent && String(incident.reportedBy) === actorId))
            ? incident.resolution.summary
            : "",
          category: incident.resolution.category,
          actionsTaken:
            isManage || isConfidentialAccess || (isStudent && String(incident.reportedBy) === actorId)
              ? incident.resolution.actionsTaken
              : "",
          resolvedBy: incident.resolution.resolvedBy
            ? { id: String(incident.resolution.resolvedBy._id), name: `${incident.resolution.resolvedBy.firstName || ""} ${incident.resolution.resolvedBy.lastName || ""}`.trim() }
            : null,
          resolvedAt: incident.resolution.resolvedAt,
          outcome: incident.resolution.outcome,
        }
      : null,
  };

  if (isStudent) {
    // Students never receive internal investigation notes or private staff notes.
    base.internalNotes = [];
    base.actions = base.actions.map((a) => ({ ...a, notes: "" }));
  }

  return base;
}

function buildIncidentFilter(roles, query, viewerId) {
  const isStudent = isStudentRole(roles);
  const confidentialAccess = isConfidentialAccess(roles);
  const filter = {};

  if (isStudent) {
    filter.reportedBy = viewerId;
  } else if (!confidentialAccess) {
    filter.$or = [
      { isConfidential: { $ne: true } },
      { $and: [{ confidentialityRequest: { $ne: true } }, { isConfidential: { $ne: true } }] },
    ];
  }

  if (query.incidentType) filter.incidentType = query.incidentType;
  if (query.severity) filter.severity = query.severity;
  if (query.status) filter.status = query.status;
  if (query.assignedDepartment) filter.assignedDepartment = query.assignedDepartment;
  if (query.assignedTo) filter.assignedTo = query.assignedTo;
  if (query.dateFrom || query.dateTo) {
    filter.occurredAt = {};
    if (query.dateFrom) filter.occurredAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) filter.occurredAt.$lte = new Date(query.dateTo);
  }
  if (query.search) {
    const q = String(query.search).trim();
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        ...(filter.$or || []),
        { title: rx },
        { description: rx },
        { incidentNumber: rx },
      ];
    }
  }
  return filter;
}

export function registerCampusSafetyRoutes(app) {
  // --------------------------------------------------------------------------
  // Student incident submission
  // --------------------------------------------------------------------------
  app.post(
    "/api/campus-safety/incidents",
    requireAuth,
    requirePermission("safety.report"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const actorId = userId(req.user);

        let student = null;
        let studentId = null;
        if (isStudentRole(roles)) {
          student = await Student.findOne({ user: actorId });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          studentId = student._id;
        }

        // Administrators must not create student incident reports on behalf of
        // students. The report is always owned by the authenticated account.
        const {
          incidentType,
          severity = "MODERATE",
          title,
          description,
          location = {},
          occurredAt,
          incidentTime,
          peopleInvolved = "",
          witnesses = [],
          tags = [],
          isConfidential = true,
          accessLevel = "SECURITY_STAFF",
          confidentialityRequest = true,
          anonymous = false,
        } = req.body || {};

        if (!incidentType || !title || !description || !occurredAt) {
          return res.status(400).json({ error: "Incident type, title, description, and occurred date are required." });
        }
        if (!UNIQUE_INCIDENT_TYPES.includes(incidentType)) {
          return res.status(400).json({ error: "Invalid incident type." });
        }
        if (!INCIDENT_SEVERITIES.includes(severity)) {
          return res.status(400).json({ error: "Invalid severity." });
        }
        if (!ACCESS_LEVELS.includes(accessLevel)) {
          return res.status(400).json({ error: "Invalid access level." });
        }
        if (!INCIDENT_STATUSES.includes("SUBMITTED")) {
          return res.status(500).json({ error: "Configuration error." });
        }

        const count = await CampusIncident.countDocuments();
        const incidentNumber = `INC-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

        const parsedWitnesses = Array.isArray(witnesses) ? witnesses : [];
        const parsedTags = Array.isArray(tags) ? tags : [];

        const incident = await CampusIncident.create({
          incidentNumber,
          reportedBy: actorId,
          student: studentId,
          incidentType,
          severity,
          title: String(title).trim().slice(0, 200),
          description: String(description).trim().slice(0, 5000),
          location: location || {},
          incidentTime: String(incidentTime || "").trim().slice(0, 50),
          peopleInvolved: String(peopleInvolved || "").trim().slice(0, 1000),
          occurredAt: new Date(occurredAt),
          witnesses: parsedWitnesses,
          tags: parsedTags,
          anonymous: Boolean(anonymous),
          confidentialityRequest: Boolean(confidentialityRequest),
          isConfidential: Boolean(isConfidential),
          accessLevel,
          status: "SUBMITTED",
          priority: severity === "CRITICAL" ? "URGENT" : severity === "HIGH" ? "HIGH" : "NORMAL",
        });

        await logAudit({
          userId: actorId,
          action: "INCIDENT_SUBMITTED",
          module: "campus_safety",
          resource: "CampusIncident",
          resourceId: incident._id.toString(),
          details: `Student incident report submitted: ${incident.incidentNumber}`,
          metadata: { incidentType, severity },
        });

        // Notify authorised staff of a new report.
        const isSecurityOrAdmin = isConfidentialAccess(roles) || isManageRole(roles);
        if (isSecurityOrAdmin || severity === "CRITICAL") {
          const securityStaff = await User.find({
            roles: { $in: ["security_staff", "campus_admin"] },
            isActive: { $ne: false },
          }).select("_id").lean();
          const notificationUsers = securityStaff.map((u) => ({ _id: u._id }));
          if (notificationUsers.length > 0) {
            await createNotifications(
              notificationUsers,
              "New Safety Incident Reported",
              `${incident.incidentNumber}: ${incident.title} (${incident.severity})`,
              `incident:${incident._id}:reported`,
              { actionUrl: `/campus-safety/incidents/${incident._id}`, relatedEntityType: "CampusIncident", relatedEntityId: incident._id }
            );
          }
        }

        const created = await CampusIncident.findById(incident._id)
          .populate("reportedBy", "firstName lastName email")
          .populate("student", "studentId firstName lastName program semester")
          .lean();

        res.status(201).json({ success: true, incident: serializeIncident(created, req.user) });
      } catch (err) {
        console.error("Create incident error:", err);
        res.status(500).json({ error: "Failed to report incident." });
      }
    }
  );

  // --------------------------------------------------------------------------
  // Incident list (student sees own; authorised staff see in scope)
  // --------------------------------------------------------------------------
  app.get(
    "/api/campus-safety/incidents",
    requireAuth,
    requirePermission("safety.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const actorId = userId(req.user);
        const filter = buildIncidentFilter(roles, req.query, actorId);

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const sortField = req.query.sort || "reportedAt";
        const sortOrder = req.query.order === "asc" ? 1 : -1;

        const [incidents, total] = await Promise.all([
          CampusIncident.find(filter)
            .populate("reportedBy", "firstName lastName")
            .populate("student", "studentId firstName lastName")
            .populate("assignedTo", "firstName lastName")
            .sort({ [sortField]: sortOrder, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          CampusIncident.countDocuments(filter),
        ]);

        res.json({
          incidents: incidents
            .map((inc) => serializeIncident(inc, req.user))
            .filter(Boolean),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (err) {
        console.error("Campus safety incidents error:", err);
        res.status(500).json({ error: "Failed to load incidents." });
      }
    }
  );

  // --------------------------------------------------------------------------
  // Emergency contacts
  // --------------------------------------------------------------------------
  app.get(
    "/api/campus-safety/emergency-contacts",
    requireAuth,
    requirePermission("safety.view"),
    async (req, res) => {
      try {
        const contacts = [
          { name: "Campus Security", phone: "+977-1-XXXXXXX", email: "security@college.edu.np", available: "24/7", type: "SECURITY" },
          { name: "Medical Emergency", phone: "102", email: "", available: "24/7", type: "MEDICAL" },
          { name: "Fire Department", phone: "101", email: "", available: "24/7", type: "FIRE" },
          { name: "Police", phone: "100", email: "", available: "24/7", type: "POLICE" },
          { name: "Student Affairs", phone: "+977-1-XXXXXXX", email: "affairs@college.edu.np", available: "9AM-5PM", type: "ADMIN" },
          { name: "Counseling Services", phone: "+977-1-XXXXXXX", email: "counseling@college.edu.np", available: "9AM-5PM", type: "COUNSELING" },
        ];
        res.json({ contacts });
      } catch (err) {
        res.status(500).json({ error: "Failed to load emergency contacts." });
      }
    }
  );

  // --------------------------------------------------------------------------
  // Summary statistics for the admin workspace
  // --------------------------------------------------------------------------
  app.get(
    "/api/campus-safety/summary",
    requireAuth,
    requirePermission("safety.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = isStudentRole(roles);
        const viewerId = userId(req.user);

        let match = buildIncidentFilter(roles, req.query, viewerId);

        const [
          total,
          newReports,
          underReview,
          activeInvestigations,
          awaitingStudent,
          resolvedCases,
          closedCases,
          highCritical,
        ] = await Promise.all([
          CampusIncident.countDocuments(match),
          CampusIncident.countDocuments({ ...match, status: { $in: ["SUBMITTED", "REPORTED"] } }),
          CampusIncident.countDocuments({ ...match, status: { $in: ["UNDER_REVIEW", "ACKNOWLEDGED", "RECEIVED"] } }),
          CampusIncident.countDocuments({ ...match, status: { $in: ["ASSIGNED_FOR_INVESTIGATION", "INVESTIGATION_IN_PROGRESS", "UNDER_INVESTIGATION"] } }),
          CampusIncident.countDocuments({ ...match, status: "AWAITING_STUDENT_INFORMATION" }),
          CampusIncident.countDocuments({ ...match, status: "RESOLVED" }),
          CampusIncident.countDocuments({ ...match, status: "CLOSED" }),
          CampusIncident.countDocuments({ ...match, severity: { $in: ["HIGH", "CRITICAL"] } }),
        ]);

        res.json({
          totalIncidents: total,
          newReports,
          underReview,
          activeInvestigations,
          awaitingStudentResponse: awaitingStudent,
          resolvedCases,
          closedCases,
          highCriticalSeverity: highCritical,
          byStatus: {},
        });
      } catch (err) {
        console.error("Campus safety summary error:", err);
        res.status(500).json({ error: "Failed to load safety summary." });
      }
    }
  );

  // --------------------------------------------------------------------------
  // Incident detail
  // --------------------------------------------------------------------------
  app.get(
    "/api/campus-safety/incidents/:id",
    requireAuth,
    requirePermission("safety.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const actorId = userId(req.user);
        const isStudent = isStudentRole(roles);

        const incident = await CampusIncident.findById(req.params.id)
          .populate("reportedBy", "firstName lastName email")
          .populate("student", "studentId firstName lastName program semester")
          .populate("assignedTo", "firstName lastName email")
          .lean();

        if (!incident) return res.status(404).json({ error: "Incident not found." });

        if (isStudent && String(incident.reportedBy) !== actorId) {
          return res.status(403).json({ error: "Access denied." });
        }

        if (incident.isConfidential && !isConfidentialAccess(roles) && !isManageRole(roles)) {
          if (isStudent && String(incident.reportedBy) === actorId) {
            // Student owns it: allowed.
          } else {
            await logAudit({
              userId: actorId,
              action: "CONFIDENTIAL_INCIDENT_UNAUTHORIZED_ACCESS_ATTEMPT",
              module: "campus_safety",
              resource: "CampusIncident",
              resourceId: incident._id.toString(),
              details: "Unauthorized confidential incident access attempt.",
            });
            return res.status(403).json({ error: "Access denied. Confidential incident." });
          }
        }

        if (incident.isConfidential && (isConfidentialAccess(roles) || isManageRole(roles))) {
          await logAudit({
            userId: actorId,
            action: "CONFIDENTIAL_INCIDENT_VIEW",
            module: "campus_safety",
            resource: "CampusIncident",
            resourceId: incident._id.toString(),
            details: "Authorized confidential incident view.",
          });
        }

        // Student-visible updates and messages only.
        const visibilityFilter = isStudent ? { visibility: "student" } : {};
        const [updates, messages] = await Promise.all([
          IncidentUpdate.find({ incident: incident._id, ...visibilityFilter })
            .populate("createdBy", "firstName lastName")
            .sort({ createdAt: 1 })
            .lean(),
          IncidentMessage.find({ incident: incident._id, ...visibilityFilter })
            .populate("senderId", "firstName lastName")
            .sort({ createdAt: 1 })
            .lean(),
        ]);

        const base = serializeIncident(incident, req.user);
        if (!base) return res.status(403).json({ error: "Access denied." });

        res.json({
          incident: {
            ...base,
            updates: updates.map((u) => ({
              id: String(u._id),
              status: u.status,
              title: u.title,
              description: u.description,
              createdBy: u.createdBy
                ? { id: String(u.createdBy._id), name: `${u.createdBy.firstName || ""} ${u.createdBy.lastName || ""}`.trim() }
                : null,
              createdByName: u.createdByName,
              visibility: u.visibility,
              attachments: (u.attachments || []).map((a) => ({
                id: String(a.fileId),
                fileId: String(a.fileId),
                originalName: a.originalName,
                mimeType: a.mimeType,
                sizeBytes: a.sizeBytes,
              })),
              createdAt: u.createdAt,
            })),
            messages: messages.map((m) => ({
              id: String(m._id),
              senderId: String(m.senderId),
              senderName: m.senderName,
              senderRole: m.senderRole,
              senderType: m.senderType,
              message: m.message,
              visibility: m.visibility,
              attachments: (m.attachments || []).map((a) => ({
                id: String(a.fileId),
                fileId: String(a.fileId),
                originalName: a.originalName,
                mimeType: a.mimeType,
                sizeBytes: a.sizeBytes,
              })),
              createdAt: m.createdAt,
            })),
          },
        });
      } catch (err) {
        console.error("Campus safety incident detail error:", err);
        res.status(500).json({ error: "Failed to load incident." });
      }
    }
  );

  // --------------------------------------------------------------------------
  // Assign / reassign a case
  // --------------------------------------------------------------------------
  app.patch(
    "/api/campus-safety/incidents/:id/assign",
    requireAuth,
    requirePermission("safety.manage"),
    async (req, res) => {
      try {
        const incident = await CampusIncident.findById(req.params.id);
        if (!incident) return res.status(404).json({ error: "Incident not found." });

        const { assignedTo, assignedDepartment, priority, internalNotes } = req.body || {};

        let assignee = null;
        if (assignedTo) {
          if (!mongoose.isValidObjectId(assignedTo)) {
            return res.status(400).json({ error: "Valid assignee ID required." });
          }
          assignee = await User.findById(assignedTo);
          if (!assignee) return res.status(404).json({ error: "Assignee not found." });
        }

        const previousAssignee = incident.assignedTo ? String(incident.assignedTo) : null;
        if (assignedTo) incident.assignedTo = assignedTo;
        incident.assignedAt = new Date();
        if (assignedDepartment) incident.assignedDepartment = String(assignedDepartment).trim();
        if (priority && ["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority)) incident.priority = priority;
        if (!["RESOLVED", "CLOSED"].includes(incident.status)) {
          incident.status = "ASSIGNED_FOR_INVESTIGATION";
        }
        if (internalNotes) {
          incident.internalNotes.push({
            note: String(internalNotes).trim().slice(0, 4000),
            writtenBy: req.user._id || req.user.id,
            writtenByName: displayName(req.user),
            writtenAt: new Date(),
          });
        }
        await incident.save();

        await logAudit({
          userId: userId(req.user),
          action: "INCIDENT_ASSIGNED",
          module: "campus_safety",
          resource: "CampusIncident",
          resourceId: incident._id.toString(),
          details: `Incident ${incident.incidentNumber} assigned${assignedTo ? " to " + displayName(assignee) : " (unassigned)"}`,
          metadata: { assignedTo, assignedDepartment, priority, previousAssignee },
        });

        // Student-visible assignment update.
        await IncidentUpdate.create({
          incident: incident._id,
          incidentNumber: incident.incidentNumber,
          status: incident.status,
          title: assignee ? "Investigation Assigned" : "Assignment Updated",
          description: assignee
            ? `Your case has been assigned to ${displayName(assignee)} (${incident.assignedDepartment || "a department"}).`
            : "Your case assignment has been updated.",
          createdBy: req.user._id || req.user.id,
          createdByName: displayName(req.user),
          createdByRole: (req.user.roles || [])[0] || null,
          visibility: "student",
        });

        // Notify student.
        if (incident.reportedBy) {
          await createNotifications(
            [{ _id: incident.reportedBy }],
            "Case Assignment Updated",
            `Your incident ${incident.incidentNumber} has been ${assignee ? "assigned for investigation" : "reassigned"}.`,
            `incident:${incident._id}:assigned`,
            { actionUrl: `/campus-safety/incidents/${incident._id}`, relatedEntityType: "CampusIncident", relatedEntityId: incident._id }
          );
        }
        // Notify assignee.
        if (assignedTo) {
          await createNotifications(
            [{ _id: assignedTo }],
            "Incident Assigned to You",
            `You have been assigned to investigate ${incident.incidentNumber}: ${incident.title}`,
            `incident:${incident._id}:assigned`,
            { actionUrl: `/campus-safety/incidents/${incident._id}`, relatedEntityType: "CampusIncident", relatedEntityId: incident._id }
          );
        }

        const updated = await CampusIncident.findById(incident._id).lean();
        res.json({ success: true, incident: serializeIncident(updated, req.user) });
      } catch (err) {
        console.error("Assign incident error:", err);
        res.status(500).json({ error: "Failed to assign incident." });
      }
    }
  );

  // --------------------------------------------------------------------------
  // Quick status change
  // --------------------------------------------------------------------------
  app.patch(
    "/api/campus-safety/incidents/:id/status",
    requireAuth,
    requirePermission("safety.manage"),
    async (req, res) => {
      try {
        const incident = await CampusIncident.findById(req.params.id);
        if (!incident) return res.status(404).json({ error: "Incident not found." });

        const { status, title, description } = req.body || {};
        if (!status || !INCIDENT_STATUSES.includes(status)) {
          return res.status(400).json({ error: "Valid status is required." });
        }

        const previousStatus = incident.status;
        incident.status = status;
        if (status === "RESOLVED" && !incident.resolution.resolvedAt) {
          incident.resolution.resolvedAt = new Date();
        }
        await incident.save();

        await logAudit({
          userId: userId(req.user),
          action: "INCIDENT_STATUS_CHANGED",
          module: "campus_safety",
          resource: "CampusIncident",
          resourceId: incident._id.toString(),
          details: `Incident ${incident.incidentNumber} status ${previousStatus} -> ${status}`,
          metadata: { previousStatus, status },
        });

        const updateTitle = title || `Status changed to ${statusLabel(status)}`;
        await IncidentUpdate.create({
          incident: incident._id,
          incidentNumber: incident.incidentNumber,
          status,
          title: updateTitle,
          description: String(description || `The status of your report was changed to ${statusLabel(status)}.`).trim().slice(0, 5000),
          createdBy: req.user._id || req.user.id,
          createdByName: displayName(req.user),
          createdByRole: (req.user.roles || [])[0] || null,
          visibility: "student",
        });

        if (incident.reportedBy) {
          await createNotifications(
            [{ _id: incident.reportedBy }],
            "Case Status Updated",
            `Your incident ${incident.incidentNumber} is now ${statusLabel(status)}.`,
            `incident:${incident._id}:status:${status}`,
            { actionUrl: `/campus-safety/incidents/${incident._id}`, relatedEntityType: "CampusIncident", relatedEntityId: incident._id }
          );
        }

        const updated = await CampusIncident.findById(incident._id).lean();
        res.json({ success: true, incident: serializeIncident(updated, req.user) });
      } catch (err) {
        console.error("Status change error:", err);
        res.status(500).json({ error: "Failed to update status." });
      }
    }
  );

  // --------------------------------------------------------------------------
  // Staff investigation progress update (with optional attachments)
  // --------------------------------------------------------------------------
  app.post(
    "/api/campus-safety/incidents/:id/updates",
    requireAuth,
    requirePermission("safety.manage"),
    (req, res, next) => {
      runMultiFileUpload(req, res, evidenceUploader, async (uploadErr, files) => {
        if (uploadErr) return;
        try {
          const incident = await CampusIncident.findById(req.params.id);
          if (!incident) return res.status(404).json({ error: "Incident not found." });

          const { status, title, description, visibility = "student" } = req.body || {};
          if (!title || !description) {
            return res.status(400).json({ error: "Title and description are required." });
          }
          if (status && !INCIDENT_STATUSES.includes(status)) {
            return res.status(400).json({ error: "Invalid status." });
          }

          if (status) incident.status = status;
          await incident.save();

          const attachmentRefs = (files || []).map((f) => ({
            fileId: f._id,
            originalName: f.originalName,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
          }));

          const update = await IncidentUpdate.create({
            incident: incident._id,
            incidentNumber: incident.incidentNumber,
            status: status || incident.status,
            title: String(title).trim().slice(0, 200),
            description: String(description).trim().slice(0, 5000),
            createdBy: req.user._id || req.user.id,
            createdByName: displayName(req.user),
            createdByRole: (req.user.roles || [])[0] || null,
            visibility,
            attachments: attachmentRefs,
          });

          // Persist file metadata linked to this incident/update.
          await Promise.all(
            (files || []).map((f) =>
              StoredFile.updateOne(
                { _id: f._id },
                { $set: { relatedType: "CampusIncident", relatedId: incident._id.toString() } }
              )
            )
          );

          await logAudit({
            userId: userId(req.user),
            action: "INCIDENT_UPDATE_ADDED",
            module: "campus_safety",
            resource: "CampusIncident",
            resourceId: incident._id.toString(),
            details: `Progress update added to ${incident.incidentNumber}: ${title}`,
            metadata: { status, visibility, attachmentCount: attachmentRefs.length },
          });

          if (visibility === "student" && incident.reportedBy) {
            await createNotifications(
              [{ _id: incident.reportedBy }],
              "Case Update",
              `${incident.incidentNumber}: ${title}`,
              `incident:${incident._id}:update:${update._id}`,
              { actionUrl: `/campus-safety/incidents/${incident._id}`, relatedEntityType: "CampusIncident", relatedEntityId: incident._id }
            );
          }

          const populated = await IncidentUpdate.findById(update._id).populate("createdBy", "firstName lastName").lean();
          res.status(201).json({ success: true, update: { ...populated, id: String(populated._id) } });
        } catch (err) {
          next(err);
        }
      }, next);
    }
  );

  // --------------------------------------------------------------------------
  // Two-way case message (student or staff) with optional attachments
  // --------------------------------------------------------------------------
  app.post(
    "/api/campus-safety/incidents/:id/messages",
    requireAuth,
    (req, res, next) => {
      runMultiFileUpload(req, res, evidenceUploader, async (uploadErr, files) => {
        if (uploadErr) return;
        try {
          const incident = await CampusIncident.findById(req.params.id);
          if (!incident) return res.status(404).json({ error: "Incident not found." });

          const roles = getUserRoles(req.user);
          const actorId = userId(req.user);
          const isStudent = isStudentRole(roles);

          // Ownership: students may only message their own incidents.
          if (isStudent && String(incident.reportedBy) !== actorId) {
            return res.status(403).json({ error: "Access denied." });
          }
          // Non-staff without confidential access may not message incidents they are not tied to.
          if (!isStudent && !isConfidentialAccess(roles) && !isManageRole(roles) && String(incident.assignedTo) !== actorId) {
            return res.status(403).json({ error: "Access denied." });
          }

          const { message, visibility = "student" } = req.body || {};
          if (!message || !message.trim()) {
            return res.status(400).json({ error: "Message is required." });
          }

          const sender = await User.findById(actorId).select("firstName middleName lastName roles").lean();
          const senderType = isStudent ? "student" : "staff";

          const attachmentRefs = (files || []).map((f) => ({
            fileId: f._id,
            originalName: f.originalName,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
          }));

          const msg = await IncidentMessage.create({
            incident: incident._id,
            incidentNumber: incident.incidentNumber,
            senderId: actorId,
            senderName: displayName(sender) || (sender ? `${sender.firstName} ${sender.lastName}` : ""),
            senderRole: (sender && sender.roles && sender.roles[0]) || null,
            senderType,
            message: String(message).trim().slice(0, 5000),
            visibility,
            attachments: attachmentRefs,
          });

          await Promise.all(
            (files || []).map((f) =>
              StoredFile.updateOne(
                { _id: f._id },
                { $set: { relatedType: "CampusIncident", relatedId: incident._id.toString() } }
              )
            )
          );

          await logAudit({
            userId: actorId,
            action: "INCIDENT_MESSAGE_SENT",
            module: "campus_safety",
            resource: "CampusIncident",
            resourceId: incident._id.toString(),
            details: `${senderType} message on ${incident.incidentNumber}`,
            metadata: { visibility, attachmentCount: attachmentRefs.length },
          });

          // Notify the other party: staff messages notify the student; student messages notify assigned staff / security.
          if (senderType === "staff" && incident.reportedBy) {
            await createNotifications(
              [{ _id: incident.reportedBy }],
              "New Message on Your Case",
              `${incident.incidentNumber}: ${String(message).trim().slice(0, 120)}`,
              `incident:${incident._id}:message:${msg._id}`,
              { actionUrl: `/campus-safety/incidents/${incident._id}`, relatedEntityType: "CampusIncident", relatedEntityId: incident._id }
            );
          } else if (senderType === "student") {
            const notifyUsers = [];
            if (incident.assignedTo) notifyUsers.push({ _id: incident.assignedTo });
            const securityStaff = await User.find({ roles: { $in: ["security_staff", "campus_admin"] }, isActive: { $ne: false } }).select("_id").lean();
            securityStaff.forEach((u) => { if (!notifyUsers.some((n) => String(n._id) === String(u._id))) notifyUsers.push({ _id: u._id }); });
            if (notifyUsers.length) {
              await createNotifications(
                notifyUsers,
                "New Message from Student",
                `${incident.incidentNumber}: ${student ? student.fullName || "" : ""} sent a message on your assigned case.`,
                `incident:${incident._id}:message:${msg._id}`,
                { actionUrl: `/campus-safety/incidents/${incident._id}`, relatedEntityType: "CampusIncident", relatedEntityId: incident._id }
              );
            }
          }

          const populated = await IncidentMessage.findById(msg._id).populate("senderId", "firstName lastName").lean();
          res.status(201).json({ success: true, message: { ...populated, id: String(populated._id) } });
        } catch (err) {
          next(err);
        }
      }, next);
    }
  );

  // --------------------------------------------------------------------------
  // Student submits additional evidence for their incident
  // --------------------------------------------------------------------------
  app.post(
    "/api/campus-safety/incidents/:id/evidence",
    requireAuth,
    (req, res, next) => {
      runMultiFileUpload(req, res, evidenceUploader, async (uploadErr, files) => {
        if (uploadErr) return;
        try {
          const roles = getUserRoles(req.user);
          if (!isStudentRole(roles)) {
            return res.status(403).json({ error: "Only students may submit evidence through this endpoint." });
          }
          const actorId = userId(req.user);

          const incident = await CampusIncident.findById(req.params.id);
          if (!incident) return res.status(404).json({ error: "Incident not found." });
          if (String(incident.reportedBy) !== actorId) {
            return res.status(403).json({ error: "Access denied." });
          }
          if (!files || files.length === 0) {
            return res.status(400).json({ error: "At least one file is required." });
          }

          const { description } = req.body || {};

          const evidenceRefs = (files || []).map((f) => ({
            fileId: f._id,
            originalName: f.originalName,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            description: String(description || "").trim().slice(0, 500),
            uploadedBy: actorId,
            uploadedAt: new Date(),
            visibility: "student",
          }));
          incident.evidence = [...(incident.evidence || []), ...evidenceRefs];
          await incident.save();

          await Promise.all(
            (files || []).map((f) =>
              StoredFile.updateOne(
                { _id: f._id },
                { $set: { relatedType: "CampusIncident", relatedId: incident._id.toString() } }
              )
            )
          );

          await logAudit({
            userId: actorId,
            action: "INCIDENT_EVIDENCE_SUBMITTED",
            module: "campus_safety",
            resource: "CampusIncident",
            resourceId: incident._id.toString(),
            details: `Student submitted ${files.length} evidence file(s) for ${incident.incidentNumber}`,
            metadata: { fileCount: files.length },
          });

          await IncidentUpdate.create({
            incident: incident._id,
            incidentNumber: incident.incidentNumber,
            status: incident.status,
            title: "Additional Evidence Submitted",
            description: `You submitted ${files.length} supporting file(s) for this report.`,
            createdBy: actorId,
            createdByName: displayName(req.user),
            createdByRole: "student",
            visibility: "student",
          });

          const securityStaff = await User.find({ roles: { $in: ["security_staff", "campus_admin"] }, isActive: { $ne: false } }).select("_id").lean();
          if (securityStaff.length) {
            await createNotifications(
              securityStaff,
              "New Evidence Submitted",
              `${incident.incidentNumber}: The reporting student submitted additional evidence.`,
              `incident:${incident._id}:evidence`,
              { actionUrl: `/campus-safety/incidents/${incident._id}`, relatedEntityType: "CampusIncident", relatedEntityId: incident._id }
            );
          }

          const updated = await CampusIncident.findById(incident._id).lean();
          res.status(201).json({ success: true, incident: serializeIncident(updated, req.user) });
        } catch (err) {
          next(err);
        }
      }, next);
    }
  );

  // --------------------------------------------------------------------------
  // Internal investigation note (staff only, never exposed to students)
  // --------------------------------------------------------------------------
  app.post(
    "/api/campus-safety/incidents/:id/internal-notes",
    requireAuth,
    requirePermission("safety.manage"),
    async (req, res) => {
      try {
        const incident = await CampusIncident.findById(req.params.id);
        if (!incident) return res.status(404).json({ error: "Incident not found." });

        const { note } = req.body || {};
        if (!note || !note.trim()) {
          return res.status(400).json({ error: "Note is required." });
        }

        incident.internalNotes.push({
          note: String(note).trim().slice(0, 4000),
          writtenBy: req.user._id || req.user.id,
          writtenByName: displayName(req.user),
          writtenAt: new Date(),
        });
        await incident.save();

        await logAudit({
          userId: userId(req.user),
          action: "INCIDENT_INTERNAL_NOTE",
          module: "campus_safety",
          resource: "CampusIncident",
          resourceId: incident._id.toString(),
          details: `Internal note added to ${incident.incidentNumber}`,
        });

        const updated = await CampusIncident.findById(incident._id).lean();
        res.json({ success: true, incident: serializeIncident(updated, req.user) });
      } catch (err) {
        console.error("Internal note error:", err);
        res.status(500).json({ error: "Failed to add internal note." });
      }
    }
  );

  // --------------------------------------------------------------------------
  // Resolve a case
  // --------------------------------------------------------------------------
  app.patch(
    "/api/campus-safety/incidents/:id/resolve",
    requireAuth,
    requirePermission("safety.manage"),
    async (req, res) => {
      try {
        const incident = await CampusIncident.findById(req.params.id);
        if (!incident) return res.status(404).json({ error: "Incident not found." });

        const { summary, category, actionsTaken, outcome = "RESOLVED", studentVisibleSummary } = req.body || {};
        if (!summary || !category) {
          return res.status(400).json({ error: "Resolution summary and category are required." });
        }
        if (!["RESOLVED", "UNFOUNDED", "REFERRED_EXTERNAL", "ONGOING_MONITORING"].includes(outcome)) {
          return res.status(400).json({ error: "Invalid outcome." });
        }

        incident.status = "RESOLVED";
        incident.resolution = {
          summary: String(summary).trim().slice(0, 2000),
          category: String(category).trim().slice(0, 100),
          actionsTaken: String(actionsTaken || "").trim().slice(0, 2000),
          resolvedBy: req.user._id || req.user.id,
          resolvedAt: new Date(),
          outcome,
        };
        await incident.save();

        await logAudit({
          userId: userId(req.user),
          action: "INCIDENT_RESOLVED",
          module: "campus_safety",
          resource: "CampusIncident",
          resourceId: incident._id.toString(),
          details: `Incident ${incident.incidentNumber} resolved (${outcome})`,
          metadata: { category, outcome },
        });

        // Final student-visible update before closure.
        await IncidentUpdate.create({
          incident: incident._id,
          incidentNumber: incident.incidentNumber,
          status: "RESOLVED",
          title: "Case Resolved",
          description: String(studentVisibleSummary || `Your incident ${incident.incidentNumber} has been resolved. ${String(summary).trim().slice(0, 300)}`).trim().slice(0, 5000),
          createdBy: req.user._id || req.user.id,
          createdByName: displayName(req.user),
          createdByRole: (req.user.roles || [])[0] || null,
          visibility: "student",
        });

        if (incident.reportedBy) {
          await createNotifications(
            [{ _id: incident.reportedBy }],
            "Incident Resolved",
            `Your reported incident ${incident.incidentNumber} has been ${outcome.toLowerCase().replace("_", " ")}.`,
            `incident:${incident._id}:resolved`,
            { actionUrl: `/campus-safety/incidents/${incident._id}`, relatedEntityType: "CampusIncident", relatedEntityId: incident._id }
          );
        }

        const updated = await CampusIncident.findById(incident._id).lean();
        res.json({ success: true, incident: serializeIncident(updated, req.user) });
      } catch (err) {
        console.error("Resolve incident error:", err);
        res.status(500).json({ error: "Failed to resolve incident." });
      }
    }
  );

  // --------------------------------------------------------------------------
  // Reopen a resolved/closed case
  // --------------------------------------------------------------------------
  app.patch(
    "/api/campus-safety/incidents/:id/reopen",
    requireAuth,
    requirePermission("safety.manage"),
    async (req, res) => {
      try {
        const incident = await CampusIncident.findById(req.params.id);
        if (!incident) return res.status(404).json({ error: "Incident not found." });

        const { reason } = req.body || {};
        if (!reason || !reason.trim()) {
          return res.status(400).json({ error: "A reason for reopening is required." });
        }

        const previousStatus = incident.status;
        incident.status = "SUBMITTED";
        incident.resolution.reopenedAt = new Date();
        incident.resolution.reopenedBy = req.user._id || req.user.id;
        incident.resolution.reopenReason = String(reason).trim().slice(0, 1000);
        await incident.save();

        await logAudit({
          userId: userId(req.user),
          action: "INCIDENT_REOPENED",
          module: "campus_safety",
          resource: "CampusIncident",
          resourceId: incident._id.toString(),
          details: `Incident ${incident.incidentNumber} reopened (${previousStatus} -> SUBMITTED)`,
          metadata: { previousStatus, reason },
        });

        await IncidentUpdate.create({
          incident: incident._id,
          incidentNumber: incident.incidentNumber,
          status: "SUBMITTED",
          title: "Case Reopened",
          description: `This case has been reopened. Reason: ${String(reason).trim().slice(0, 1000)}`,
          createdBy: req.user._id || req.user.id,
          createdByName: displayName(req.user),
          createdByRole: (req.user.roles || [])[0] || null,
          visibility: "student",
        });

        if (incident.reportedBy) {
          await createNotifications(
            [{ _id: incident.reportedBy }],
            "Case Reopened",
            `Your incident ${incident.incidentNumber} has been reopened for further review.`,
            `incident:${incident._id}:reopened`,
            { actionUrl: `/campus-safety/incidents/${incident._id}`, relatedEntityType: "CampusIncident", relatedEntityId: incident._id }
          );
        }

        const updated = await CampusIncident.findById(incident._id).lean();
        res.json({ success: true, incident: serializeIncident(updated, req.user) });
      } catch (err) {
        console.error("Reopen incident error:", err);
        res.status(500).json({ error: "Failed to reopen incident." });
      }
    }
  );
}
