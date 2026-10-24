import {
  StoredFile,
  LearningMaterial,
  AcademicCalendarEvent,
  AcademicCalendarDocument,
  Submission,
  Assignment,
  Document,
  Student,
  CourseWeek,
  Notice,
} from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";
import { route, notFound } from "../utils/apiError.js";
import { requireObjectId } from "../utils/validate.js";
import { streamStoredFile } from "../services/fileStorage.js";
import { isMaterialVisibleToStudents } from "../services/lms/materialState.js";
import {
  getAudienceContext,
  audienceMatchesStudent,
  isTeachingAuthorized,
} from "../services/accessControl.js";
import { getUserRoles } from "../db.js";
import { hasPermission } from "../permissions/catalog.js";

/**
 * Authenticated file access.
 *
 * Stored files live outside the web root and are delivered only through this
 * endpoint, which re-checks the caller's entitlement against the record that
 * owns the file. Knowing a file id is therefore never enough: a Semester 2
 * student requesting a Semester 4 handout receives a 404, exactly as they would
 * from the list query.
 */
export function registerFileRoutes(app) {
  app.get(
    "/api/files/:id",
    requireAuth,
    route(async (req, res) => {
      const stored = await StoredFile.findOne({
        _id: requireObjectId(req.params.id, "File"),
        status: "STORED",
      }).lean();
      if (!stored) throw notFound("File not found.");

      const download = String(req.query.download || "") === "true";
      if (!(await canReadFile(req, stored))) throw notFound("File not found.");

      await StoredFile.updateOne({ _id: stored._id }, { $inc: { downloadCount: 1 } });
      streamStoredFile(res, stored, { download });
    }),
  );

  /** Small metadata endpoint so a preview can be shown before downloading. */
  app.get(
    "/api/files/:id/metadata",
    requireAuth,
    route(async (req, res) => {
      const stored = await StoredFile.findOne({
        _id: requireObjectId(req.params.id, "File"),
        status: "STORED",
      }).lean();
      if (!stored) throw notFound("File not found.");
      if (!(await canReadFile(req, stored))) throw notFound("File not found.");
      res.json({
        file: {
          id: String(stored._id),
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          extension: stored.extension,
          sizeBytes: stored.sizeBytes,
          module: stored.module,
          uploadedAt: stored.createdAt,
          isPdf: stored.mimeType === "application/pdf",
          isImage: String(stored.mimeType || "").startsWith("image/"),
        },
      });
    }),
  );
}

/** Resolves the owning record and applies that module's access rules. */
async function canReadFile(req, stored) {
  switch (stored.module) {
    case "academic_calendar":
      return canReadCalendarEvent(req, stored);
    case "academic_calendar_document":
      return canReadCalendarDocument(req, stored);
    case "learning_material":
      return canReadMaterial(req, stored);
    case "assignment_submission":
      return canReadSubmission(req, stored);
    case "document":
      return canReadDocument(req, stored);
    case "notice_attachment":
      return canReadNoticeAttachment(req, stored);
    case "avatar":
      // Profile photos are institutional directory images already served as
      // static assets; the stored-file route allows the signed-in account only.
      return String(stored.uploadedBy) === String(req.user._id || req.user.id);
    default:
      return false;
  }
}

async function canReadCalendarEvent(req, stored) {
  const event = await AcademicCalendarEvent.findById(stored.relatedId).lean();
  if (!event) return false;
  const roles = getUserRoles(req.user);
  if (
    String(event.createdBy) === String(req.user._id || req.user.id) ||
    roles.some((role) => ["super_admin", "dean", "hod", "registrar", "program_coordinator"].includes(role))
  ) {
    return true;
  }
  const context = await getAudienceContext(req.user);
  return audienceMatchesStudent(event.audience, context);
}

async function canReadCalendarDocument(req, stored) {
  const doc = await AcademicCalendarDocument.findById(stored.relatedId).lean();
  if (!doc) return false;
  const context = await getAudienceContext(req.user);
  if (context.isStaff) return true;
  if (doc.lifecycleState !== "PUBLISHED") return false;
  return audienceMatchesStudent(doc.audience, context);
}

async function canReadMaterial(req, stored) {
  const material = await LearningMaterial.findById(stored.relatedId).lean();
  if (!material || material.status === "ARCHIVED") return false;

  // The uploader and authorised teachers keep access to their own drafts and to
  // material that is scheduled but not yet released.
  const managesCourse = await isTeachingAuthorized(req.user, {
    courseId: material.course,
    sectionCode: material.sectionCodes?.[0],
    semester: material.semester,
  });
  if (String(material.uploadedBy) === String(req.user._id || req.user.id)) return true;
  if (managesCourse) return true;

  // A student only reaches material that is genuinely released, and only while
  // the week that carries it is visible. Knowing a file id is never enough.
  const now = new Date();
  if (!isMaterialVisibleToStudents(material, now)) return false;
  if (material.week) {
    const week = await CourseWeek.findById(material.week)
      .select("status releaseAt archivedAt")
      .lean();
    if (!week || week.archivedAt || week.status !== "PUBLISHED") return false;
    if (week.releaseAt && new Date(week.releaseAt) > now) return false;
  }

  const context = await getAudienceContext(req.user);
  return audienceMatchesStudent(material.audience, context);
}

async function canReadSubmission(req, stored) {
  const submission = await Submission.findById(stored.relatedId).lean();
  if (!submission) return false;

  // Only the submitting student or an authorised marker for that assignment may
  // read a submission. Nobody else can, even with the file id.
  if (String(submission.studentUser) === String(req.user._id || req.user.id)) return true;

  const assignment = await Assignment.findById(submission.assignment).lean();
  if (!assignment) return false;
  if (String(assignment.facultyUser) === String(req.user._id || req.user.id)) return true;
  return await isTeachingAuthorized(req.user, {
    courseId: assignment.course,
    sectionCode: assignment.sectionCodes?.[0],
    semester: assignment.semester,
  });
}

async function canReadDocument(req, stored) {
  const document = await Document.findById(stored.relatedId).lean();
  if (!document) return false;
  if (String(document.user) === String(req.user._id || req.user.id)) return true;
  const roles = getUserRoles(req.user);
  if (roles.some((role) => ["super_admin", "registrar", "dean"].includes(role))) return true;
  if (document.student) {
    const student = await Student.findById(document.student).select("user").lean();
    if (student && String(student.user) === String(req.user._id || req.user.id)) return true;
  }
  return false;
}

/**
 * Notice attachments follow their parent notice: a published
 * notice's files are readable by the audience the notice was
 * addressed to; drafts are readable only by their author and
 * notice managers.
 */
async function canReadNoticeAttachment(req, stored) {
  const notice = await Notice.findById(stored.relatedId).lean();
  if (!notice) return false;

  const roles = getUserRoles(req.user);
  const actorId = String(req.user._id || req.user.id);

  if (hasPermission(roles, "notices.publish")) return true;
  if (String(notice.authorUser || "") === actorId) return true;
  if (notice.status !== "PUBLISHED") return false;
  if (notice.expiresAt && new Date(notice.expiresAt) < new Date()) return false;

  const targetUsers = (notice.targetUsers || []).map(String);
  if (targetUsers.length && !targetUsers.includes(actorId)) return false;

  const targetRoles = notice.targetRoles || [];
  if (
    targetRoles.length &&
    !targetRoles.includes("ALL") &&
    !targetRoles.some((role) => roles.includes(role))
  ) {
    return false;
  }

  const context = await getAudienceContext(req.user);
  return audienceMatchesStudent(notice.audience, context);
}
