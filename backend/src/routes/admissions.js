import {
  AdmissionApplication,
  ADMISSION_APPLICATION_STATUSES,
} from "../models/index.js";
import { logAudit } from "../db.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { route, conflict, notFound } from "../utils/apiError.js";
import {
  requireString,
  optionalString,
  requireEmail,
  requireEnum,
  optionalEnum,
  toInt,
  readPagination,
  requireObjectId,
} from "../utils/validate.js";
import { provisionStudentAccount } from "../services/studentProvisioning.js";

/**
 * Admissions Workshop.
 *
 * Replaces the previous implementation, which queried a SQLite table through
 * `better-sqlite3` (`getDb().prepare(...)`) after the persistence layer had
 * moved to MongoDB. Every request therefore failed with a `TypeError` and the
 * screen showed an internal server error. This module is the single MongoDB
 * implementation of the admissions workflow.
 *
 * An application is a candidate record, not a user account: a login is only
 * provisioned when the registrar enrols the applicant, and that enrolment
 * reuses the shared `provisionStudentAccount` service so the resulting student
 * is the same identity every other module reads.
 */
export function registerAdmissionsRoutes(app) {
  app.get(
    "/api/admissions/applications",
    requireAuth,
    requirePermission("admissions.application.view"),
    route(async (req, res) => {
      const status = optionalEnum(
        req.query.status,
        "status",
        ADMISSION_APPLICATION_STATUSES,
        { upper: true },
      );
      const programme = optionalString(req.query.programme, "programme", { max: 120 });
      const query = optionalString(req.query.q, "search", { max: 120 });
      const includeArchived = String(req.query.includeArchived || "") === "true";
      const { limit, page, skip } = readPagination(req.query);

      const filter = {};
      if (status) filter.status = status;
      if (programme) filter.programme = new RegExp(`^${escapeRegExp(programme)}$`, "i");
      if (!includeArchived) filter.archivedAt = null;
      if (query) {
        const pattern = new RegExp(escapeRegExp(query), "i");
        filter.$or = [
          { applicantName: pattern },
          { email: pattern },
          { programme: pattern },
          { phone: pattern },
        ];
      }

      const [applications, total] = await Promise.all([
        AdmissionApplication.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AdmissionApplication.countDocuments(filter),
      ]);

      res.json({
        applications: applications.map(serialiseApplication),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      });
    }),
  );

  app.get(
    "/api/admissions/applications/:id",
    requireAuth,
    requirePermission("admissions.application.view"),
    route(async (req, res) => {
      const application = await AdmissionApplication.findById(
        requireObjectId(req.params.id, "Application"),
      );
      if (!application) throw notFound("Admission application not found.");
      res.json({ application: serialiseApplication(application.toObject()) });
    }),
  );

  app.post(
    "/api/admissions/applications",
    requireAuth,
    requirePermission("admissions.application.create"),
    route(async (req, res) => {
      const body = req.body || {};
      const application = await AdmissionApplication.create({
        applicantName: requireString(body.applicantName, "Applicant name", { max: 180 }),
        email: requireEmail(body.email, "Applicant email"),
        phone: optionalString(body.phone, "Phone", { max: 32 }),
        programme: requireString(body.programme, "Programme", { max: 120 }),
        batch: optionalString(body.batch, "Batch", { max: 20 }),
        semester: body.semester ? toInt(body.semester, "Semester", { min: 1, max: 12 }) : null,
        section: optionalString(body.section, "Section", { max: 10 }),
        gender: optionalString(body.gender, "Gender", { max: 40 }),
        qualification: optionalString(body.qualification, "Qualification", { max: 200 }),
        notes: optionalString(body.notes, "Notes", { max: 2000 }),
        submittedBy: req.user._id || req.user.id,
      });

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "ADMISSION_APPLICATION_CREATED",
        module: "admissions",
        resource: "admission_application",
        resourceId: application._id.toString(),
        details: `Admission application recorded for ${application.programme}.`,
      });

      res.status(201).json({ application: serialiseApplication(application.toObject()) });
    }),
  );

  app.patch(
    "/api/admissions/applications/:id",
    requireAuth,
    requirePermission("admissions.application.update"),
    route(async (req, res) => {
      const application = await AdmissionApplication.findById(
        requireObjectId(req.params.id, "Application"),
      );
      if (!application) throw notFound("Admission application not found.");
      if (application.status === "ENROLLED") {
        throw conflict(
          "This application has already been enrolled. Edit the student record instead of the application.",
        );
      }

      const body = req.body || {};
      const before = application.toObject();
      if (body.applicantName !== undefined) {
        application.applicantName = requireString(body.applicantName, "Applicant name", { max: 180 });
      }
      if (body.email !== undefined) application.email = requireEmail(body.email, "Applicant email");
      if (body.phone !== undefined) application.phone = optionalString(body.phone, "Phone", { max: 32 });
      if (body.programme !== undefined) {
        application.programme = requireString(body.programme, "Programme", { max: 120 });
      }
      if (body.batch !== undefined) application.batch = optionalString(body.batch, "Batch", { max: 20 });
      if (body.section !== undefined) application.section = optionalString(body.section, "Section", { max: 10 });
      if (body.gender !== undefined) application.gender = optionalString(body.gender, "Gender", { max: 40 });
      if (body.qualification !== undefined) {
        application.qualification = optionalString(body.qualification, "Qualification", { max: 200 });
      }
      if (body.notes !== undefined) application.notes = optionalString(body.notes, "Notes", { max: 2000 });
      if (body.semester !== undefined && body.semester !== null && body.semester !== "") {
        application.semester = toInt(body.semester, "Semester", { min: 1, max: 12 });
      }
      await application.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "ADMISSION_APPLICATION_UPDATED",
        module: "admissions",
        resource: "admission_application",
        resourceId: application._id.toString(),
        oldValue: pick(before, ["applicantName", "email", "programme", "batch", "semester", "section", "status"]),
        newValue: pick(application.toObject(), ["applicantName", "email", "programme", "batch", "semester", "section", "status"]),
        details: `Admission application updated for ${application.programme}.`,
      });

      res.json({ application: serialiseApplication(application.toObject()) });
    }),
  );

  app.patch(
    "/api/admissions/applications/:id/decision",
    requireAuth,
    requirePermission("admissions.application.decide"),
    route(async (req, res) => {
      const application = await AdmissionApplication.findById(
        requireObjectId(req.params.id, "Application"),
      );
      if (!application) throw notFound("Admission application not found.");

      const status = requireEnum(req.body?.status, "Decision", [
        "VERIFIED",
        "OFFERED",
        "REJECTED",
        "ENROLLED",
      ]);
      const reason = requireString(req.body?.reason, "Decision reason", {
        min: 8,
        max: 500,
      });

      const previousStatus = application.status;
      application.status = status;
      application.decisionReason = reason;
      application.reviewedBy = req.user._id || req.user.id;
      application.reviewedAt = new Date();
      await application.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "ADMISSION_DECISION_UPDATED",
        module: "admissions",
        resource: "admission_application",
        resourceId: application._id.toString(),
        oldValue: { status: previousStatus },
        newValue: { status, reason },
        details: `Admission status changed from ${previousStatus} to ${status}.`,
      });

      res.json({ application: serialiseApplication(application.toObject()) });
    }),
  );

  /**
   * Turns a verified application into a real student identity.
   *
   * This is the join point between admissions and the rest of the platform:
   * the student directory, attendance, assignments, examinations and finance
   * all read the single `Student` record created here.
   */
  app.post(
    "/api/admissions/applications/:id/enrol",
    requireAuth,
    requirePermission("admissions.application.decide"),
    route(async (req, res) => {
      const application = await AdmissionApplication.findById(
        requireObjectId(req.params.id, "Application"),
      );
      if (!application) throw notFound("Admission application not found.");
      if (application.enrolledStudent) {
        throw conflict("This application has already been enrolled.");
      }
      if (!["VERIFIED", "OFFERED"].includes(application.status)) {
        throw conflict(
          "Verify or offer the application before enrolling the applicant.",
        );
      }

      const studentId = requireString(req.body?.studentId, "Student ID", { max: 40 });
      const semester = toInt(
        req.body?.semester ?? application.semester ?? 1,
        "Semester",
        { min: 1, max: 12 },
      );
      const section = requireString(req.body?.section ?? application.section, "Section", {
        max: 10,
      }).toUpperCase();

      const [firstName, ...rest] = application.applicantName.split(/\s+/);
      const lastName = rest.pop() || firstName;

      const provisioned = await provisionStudentAccount({
        firstName,
        lastName,
        studentId,
        programme: application.programme,
        department: application.programme,
        program: application.programme,
        batch: application.batch,
        semester,
        section,
        campus: req.body?.campus || null,
        createdBy: req.user._id || req.user.id,
      });

      application.status = "ENROLLED";
      application.enrolledStudent = provisioned.student._id;
      application.enrolledUser = provisioned.user._id;
      application.decisionReason =
        application.decisionReason || `Enrolled as student ${studentId}.`;
      await application.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "ADMISSION_ENROLLED",
        module: "admissions",
        resource: "admission_application",
        resourceId: application._id.toString(),
        details: `Application enrolled as student ${studentId}.`,
        metadata: { studentId, section, semester },
      });

      res.status(201).json({
        application: serialiseApplication(application.toObject()),
        student: {
          id: provisioned.student._id.toString(),
          studentId: provisioned.student.studentId,
          name: `${provisioned.student.firstName} ${provisioned.student.lastName}`.trim(),
        },
        // Returned once so the registrar can hand the credential over; the
        // plaintext is never stored or written to the audit trail.
        temporaryPassword: provisioned.temporaryPassword,
        collegeEmail: provisioned.email,
      });
    }),
  );

  app.delete(
    "/api/admissions/applications/:id",
    requireAuth,
    requirePermission("admissions.application.update"),
    route(async (req, res) => {
      const application = await AdmissionApplication.findById(
        requireObjectId(req.params.id, "Application"),
      );
      if (!application) throw notFound("Admission application not found.");
      if (application.enrolledStudent) {
        throw conflict(
          "An enrolled application cannot be deleted. Deactivate the student record instead.",
        );
      }

      application.archivedAt = new Date();
      application.archivedBy = req.user._id || req.user.id;
      await application.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "ADMISSION_APPLICATION_ARCHIVED",
        module: "admissions",
        resource: "admission_application",
        resourceId: application._id.toString(),
        details: `Admission application archived for ${application.applicantName}.`,
      });

      res.json({ success: true, application: serialiseApplication(application.toObject()) });
    }),
  );

  /** Aggregate counts for the workshop header, from real records only. */
  app.get(
    "/api/admissions/summary",
    requireAuth,
    requirePermission("admissions.application.view"),
    route(async (req, res) => {
      const base = { archivedAt: null };
      const [total, pending, offers, rejected, enrolled] = await Promise.all([
        AdmissionApplication.countDocuments(base),
        AdmissionApplication.countDocuments({ ...base, status: "SUBMITTED" }),
        AdmissionApplication.countDocuments({ ...base, status: "OFFERED" }),
        AdmissionApplication.countDocuments({ ...base, status: "REJECTED" }),
        AdmissionApplication.countDocuments({ ...base, status: "ENROLLED" }),
      ]);
      res.json({ summary: { total, pending, offers, rejected, enrolled } });
    }),
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pick(source, keys) {
  return keys.reduce((result, key) => {
    result[key] = source?.[key] ?? null;
    return result;
  }, {});
}

function serialiseApplication(application) {
  return {
    id: String(application._id),
    applicantName: application.applicantName,
    email: application.email,
    phone: application.phone || null,
    programme: application.programme,
    batch: application.batch || null,
    semester: application.semester ?? null,
    section: application.section || null,
    gender: application.gender || null,
    qualification: application.qualification || null,
    notes: application.notes || "",
    status: application.status,
    decisionReason: application.decisionReason || null,
    reviewedAt: application.reviewedAt || null,
    enrolledStudentId: application.enrolledStudent ? String(application.enrolledStudent) : null,
    archived: Boolean(application.archivedAt),
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}

export { serialiseApplication };
