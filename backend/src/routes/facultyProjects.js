import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import mongoose from "mongoose";
import { ProjectProposal, Course, Student, User } from "../models/index.js";

export function registerFacultyProjectsRoutes(app) {
  app.get(
    "/api/faculty/research-projects",
    requireAuth,
    requirePermission(["lms.view", "student.view.assigned"]),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const privileged = roles.some((r) => ["super_admin","dean","hod","program_coordinator","registrar"].includes(r));
        const filter = privileged ? {} : { $or: [{ reviewedBy: req.user._id }, { submittedBy: req.user._id }] };
        const proposals = await ProjectProposal.find(filter)
          .populate("course", "code name semester")
          .populate("submittedBy", "firstName lastName email")
          .populate("reviewedBy", "firstName lastName email")
          .populate("group", "name")
          .sort({ updatedAt: -1, createdAt: -1 })
          .limit(200)
          .lean();
        res.json({ projects: proposals.map((p) => ({
          id: String(p._id),
          title: p.title,
          description: p.description || "",
          objectives: p.objectives || "",
          status: p.status,
          semester: p.semester ?? null,
          academicYear: p.academicYear || null,
          course: p.course ? { id: String(p.course._id), code: p.course.code, name: p.course.name } : null,
          group: p.group ? { id: String(p.group._id), name: p.group.name } : null,
          submittedBy: p.submittedBy ? { id: String(p.submittedBy._id), name: [p.submittedBy.firstName,p.submittedBy.lastName].filter(Boolean).join(" ") } : null,
          reviewedBy: p.reviewedBy ? { id: String(p.reviewedBy._id), name: [p.reviewedBy.firstName,p.reviewedBy.lastName].filter(Boolean).join(" ") } : null,
          reviewFeedback: p.reviewFeedback || "",
          rejectionReason: p.rejectionReason || "",
          submittedAt: p.submittedAt || null,
          reviewedAt: p.reviewedAt || null,
          updatedAt: p.updatedAt || p.createdAt,
          version: p.version || 1,
        })) });
      } catch (err) {
        console.error("research-projects error", err);
        res.status(500).json({ error: "Failed to load research/project records." });
      }
    },
  );

  app.patch(
    "/api/faculty/research-projects/:id/review",
    requireAuth,
    requirePermission(["lms.view", "workflow.manage"]),
    async (req, res) => {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid project id." });
        const roles = getUserRoles(req.user);
        const privileged = roles.some((r) => ["super_admin","dean","hod","program_coordinator","faculty"].includes(r));
        if (!privileged) return res.status(403).json({ error: "Not authorized." });
        const p = await ProjectProposal.findById(req.params.id);
        if (!p) return res.status(404).json({ error: "Project proposal not found." });
        const b = req.body || {};
        const status = String(b.status || "").toUpperCase();
        if (!["UNDER_REVIEW","REVISION_REQUIRED","APPROVED","REJECTED"].includes(status)) return res.status(400).json({ error: "Invalid status." });
        p.status = status;
        p.reviewedBy = req.user._id;
        p.reviewedAt = new Date();
        if (b.reviewFeedback != null) p.reviewFeedback = String(b.reviewFeedback).trim().slice(0, 4000);
        if (status === "REJECTED" && b.rejectionReason != null) p.rejectionReason = String(b.rejectionReason).trim().slice(0, 1000);
        if (status === "APPROVED") p.approvedAt = new Date();
        if (status === "REJECTED") p.rejectedAt = new Date();
        await p.save();
        res.json({ project: { id: String(p._id), status: p.status } });
      } catch (err) {
        console.error("research-projects review error", err);
        res.status(500).json({ error: "Failed to review project proposal." });
      }
    },
  );
}
