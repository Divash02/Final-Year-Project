import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import { Student, User, DigitalCredential, CREDENTIAL_TYPES, CREDENTIAL_STATUSES } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireObjectId } from "../utils/validate.js";
import { StoredFile } from "../models/index.js";
import {
  createUploader,
  runMultiFileUpload,
  verifyStoredFile,
  persistStoredFile,
} from "../services/fileStorage.js";

const ACHIEVEMENT_CATEGORIES = [
  "ACADEMIC_AWARD",
  "WORKSHOP_CERTIFICATE",
  "COMPETITION_ACHIEVEMENT",
  "INTERNSHIP_COMPLETION",
  "RESEARCH_ACHIEVEMENT",
  "EXTRACURRICULAR_ACHIEVEMENT",
  "INSTITUTIONAL_RECOGNITION",
  "LEADERSHIP_ROLE",
  "COMMUNITY_SERVICE",
  "SPORTS_ACHIEVEMENT",
  "CULTURAL_ACHIEVEMENT",
  "OTHER",
];

const credentialAttachmentUploader = createUploader("notice_attachment", {
  field: "file",
  multiple: true,
  maxFiles: 10,
});

export function registerDigitalCredentialsRoutes(app) {
  app.get(
    "/api/credentials/types",
    requireAuth,
    requirePermission("credentials.view"),
    async (req, res) => {
      try {
        res.json({
          credentialTypes: CREDENTIAL_TYPES,
          credentialStatuses: CREDENTIAL_STATUSES,
          achievementCategories: ACHIEVEMENT_CATEGORIES,
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to load credential types." });
      }
    }
  );

  app.get(
    "/api/credentials",
    requireAuth,
    requirePermission("credentials.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        const isRegistrar = roles.includes("registrar");
        const isSuperAdmin = roles.includes("super_admin");

        const filter = {};
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          filter.student = student._id;
        } else if (req.query.student) {
          filter.student = req.query.student;
        }

        if (req.query.credentialType) filter.credentialType = req.query.credentialType;
        if (req.query.status) filter.status = req.query.status;
        if (req.query.category) filter["metadata.category"] = req.query.category;

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [credentials, total] = await Promise.all([
          DigitalCredential.find(filter)
            .populate("student", "studentId firstName lastName program")
            .populate("issuedBy", "firstName lastName")
            .populate("revokedBy", "firstName lastName")
            .sort({ issuedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          DigitalCredential.countDocuments(filter),
        ]);

        res.json({
          credentials: credentials.map((c) => ({
            ...c,
            id: String(c._id),
            student: c.student
              ? { id: String(c.student._id), studentId: c.student.studentId, fullName: `${c.student.firstName} ${c.student.lastName}`, program: c.student.program }
              : null,
            issuedBy: c.issuedBy
              ? { id: String(c.issuedBy._id), name: `${c.issuedBy.firstName} ${c.issuedBy.lastName}` }
              : null,
            revokedBy: c.revokedBy
              ? { id: String(c.revokedBy._id), name: `${c.revokedBy.firstName} ${c.revokedBy.lastName}` }
              : null,
          })),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (err) {
        console.error("Digital credentials error:", err);
        res.status(500).json({ error: "Failed to load credentials." });
      }
    }
  );

  app.get(
    "/api/credentials/:id",
    requireAuth,
    requirePermission("credentials.view"),
    async (req, res) => {
      try {
        const credential = await DigitalCredential.findById(req.params.id)
          .populate("student", "studentId firstName lastName program user")
          .populate("issuedBy", "firstName lastName")
          .populate("revokedBy", "firstName lastName")
          .lean();

        if (!credential) return res.status(404).json({ error: "Credential not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student || String(credential.student._id) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        res.json({
          credential: {
            ...credential,
            id: String(credential._id),
            student: credential.student
              ? { id: String(credential.student._id), studentId: credential.student.studentId, fullName: `${credential.student.firstName} ${credential.student.lastName}`, program: credential.student.program }
              : null,
            issuedBy: credential.issuedBy
              ? { id: String(credential.issuedBy._id), name: `${credential.issuedBy.firstName} ${credential.issuedBy.lastName}` }
              : null,
            revokedBy: credential.revokedBy
              ? { id: String(credential.revokedBy._id), name: `${credential.revokedBy.firstName} ${credential.revokedBy.lastName}` }
              : null,
          },
        });
      } catch (err) {
        console.error("Credential detail error:", err);
        res.status(500).json({ error: "Failed to load credential." });
      }
    }
  );

  /**
   * Attachment staging upload for credentials. Files land in the
   * notice-attachment store and are bound to the credential when it is
   * created. Only accounts with `credentials.manage` may stage files.
   */
  app.post(
    "/api/credentials/upload",
    requireAuth,
    requirePermission("credentials.manage"),
    (req, res, next) => {
      runMultiFileUpload(
        req,
        res,
        credentialAttachmentUploader,
        async (uploadError, files) => {
          try {
            if (uploadError) throw uploadError;
            if (!files.length) {
              res.status(400).json({ error: "A file is required for this request." });
              return;
            }

            const actorId = req.user._id || req.user.id;
            const uploaded = [];
            for (const file of files) {
              const verified = await verifyStoredFile(file.path);
              const persisted = await persistStoredFile({
                module: "notice_attachment",
                file,
                verifiedSignature: verified.verifiedSignature,
                uploadedBy: actorId,
                relatedType: "credential_attachment",
                relatedId: null,
              });
              uploaded.push({
                fileId: persisted.stored._id.toString(),
                originalName: persisted.stored.originalName,
                mimeType: persisted.stored.mimeType,
                extension: persisted.stored.extension,
                sizeBytes: persisted.stored.sizeBytes,
                uploadedAt: persisted.stored.createdAt
                  ? new Date(persisted.stored.createdAt).toISOString()
                  : null,
                isPdf: persisted.stored.mimeType === "application/pdf",
                isImage: String(persisted.stored.mimeType).startsWith("image/"),
                isPreviewable:
                  persisted.stored.mimeType === "application/pdf" ||
                  String(persisted.stored.mimeType).startsWith("image/"),
              });
            }

            res.status(201).json({ files: uploaded });
          } catch (error) {
            next(error);
          }
        },
        next,
        { maxFiles: 10 },
      );
    },
  );

  app.post(
    "/api/credentials/achievements",
    requireAuth,
    requirePermission("credentials.manage"),
    async (req, res) => {
      try {
        const {
          studentId,
          credentialType,
          title,
          description,
          category,
          issuedAt,
          expiresAt,
          issuer,
          issuerContact,
          verificationUrl,
          attachmentIds = [],
          metadata = {},
        } = req.body || {};

        if (!studentId || !credentialType || !title || !category) {
          return res.status(400).json({ error: "Student ID, credential type, title, and category are required." });
        }

        const student = await Student.findOne({ studentId: String(studentId).trim() });
        if (!student) return res.status(404).json({ error: "Student not found." });

        const actorId = req.user._id || req.user.id;
        const attachmentIdsList = Array.isArray(attachmentIds) ? attachmentIds : [];
        const attachments = [];
        for (const id of attachmentIdsList) {
          const fileId = requireObjectId(id, "Attachment");
          const stored = await StoredFile.findOne({
            _id: fileId,
            module: "notice_attachment",
            status: "STORED",
            uploadedBy: actorId,
          }).lean();
          if (stored) attachments.push(stored._id);
        }

        const count = await DigitalCredential.countDocuments();
        const credentialNumber = `CRED-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;

        const crypto = await import("crypto");
        const signatureDigest = crypto.createHmac("sha256", process.env.CREDENTIAL_HMAC_SECRET || "collegeos-secret")
          .update(`${credentialNumber}:${studentId}:${Date.now()}`)
          .digest("hex");
        const verificationNonce = crypto.randomBytes(16).toString("hex");

        const credential = await DigitalCredential.create({
          credentialNumber,
          credentialType,
          student: student._id,
          studentId: student.studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          program: student.program,
          academicYear: student.academicYear,
          semester: student.semester,
          issuedAt: issuedAt ? new Date(issuedAt) : new Date(),
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          status: "ACTIVE",
          issuedBy: req.user._id || req.user.id,
          signatureDigest,
          verificationNonce,
          attachments,
          metadata: {
            ...metadata,
            category,
            title,
            description,
            issuer,
            issuerContact,
            verificationUrl,
          },
        });

        res.status(201).json({ success: true, credential: { ...credential.toObject(), id: String(credential._id) } });
      } catch (err) {
        console.error("Create achievement credential error:", err);
        res.status(500).json({ error: "Failed to create credential." });
      }
    }
  );

  app.patch(
    "/api/credentials/:id/revoke",
    requireAuth,
    requirePermission("credentials.manage"),
    async (req, res) => {
      try {
        const credential = await DigitalCredential.findById(req.params.id);
        if (!credential) return res.status(404).json({ error: "Credential not found." });

        const { reason } = req.body || {};
        if (!reason) return res.status(400).json({ error: "Revocation reason required." });

        credential.status = "REVOKED";
        credential.revokedAt = new Date();
        credential.revokedBy = req.user._id || req.user.id;
        credential.revocationReason = String(reason).trim().slice(0, 500);
        await credential.save();

        res.json({ success: true, credential });
      } catch (err) {
        res.status(500).json({ error: "Failed to revoke credential." });
      }
    }
  );

  app.get(
    "/api/credentials/verify/:credentialNumber",
    async (req, res) => {
      try {
        const credential = await DigitalCredential.findOne({
          credentialNumber: req.params.credentialNumber.toUpperCase(),
        })
          .populate("student", "studentId firstName lastName program")
          .populate("issuedBy", "firstName lastName")
          .lean();

        if (!credential) {
          return res.status(404).json({ valid: false, error: "Credential not found." });
        }

        const isValid = credential.status === "ACTIVE" && (!credential.expiresAt || new Date(credential.expiresAt) > new Date());

        res.json({
          valid: isValid,
          credential: isValid
            ? {
                credentialNumber: credential.credentialNumber,
                credentialType: credential.credentialType,
                studentName: credential.studentName,
                studentId: credential.studentId,
                program: credential.program,
                issuedAt: credential.issuedAt,
                expiresAt: credential.expiresAt,
                status: credential.status,
                metadata: credential.metadata,
              }
            : { credentialNumber: credential.credentialNumber, status: credential.status, reason: "Credential is not active or has expired." },
        });
      } catch (err) {
        console.error("Credential verification error:", err);
        res.status(500).json({ valid: false, error: "Verification failed." });
      }
    }
  );

  app.get(
    "/api/credentials/summary",
    requireAuth,
    requirePermission("credentials.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");

        let match = {};
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          match.student = student._id;
        } else if (req.query.student) {
          match.student = req.query.student;
        }

        const [total, byType, byStatus, byCategory] = await Promise.all([
          DigitalCredential.countDocuments(match),
          DigitalCredential.aggregate([{ $match: match }, { $group: { _id: "$credentialType", count: { $sum: 1 } } }]),
          DigitalCredential.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
          DigitalCredential.aggregate([{ $match: match }, { $group: { _id: "$metadata.category", count: { $sum: 1 } } }]),
        ]);

        res.json({
          totalCredentials: total,
          byType: byType.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
          byStatus: byStatus.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
          byCategory: byCategory.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
        });
      } catch (err) {
        console.error("Credentials summary error:", err);
        res.status(500).json({ error: "Failed to load credentials summary." });
      }
    }
  );
}