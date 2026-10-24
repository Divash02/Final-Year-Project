import {
  Notice,
  StoredFile,
  User,
  Student,
  Exam,
} from "../models/index.js";
import { getUserRoles, logAudit } from "../db.js";
import { hasPermission } from "../permissions/catalog.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { route, notFound, validationError, forbidden } from "../utils/apiError.js";
import {
  requireString,
  optionalString,
  requireEnum,
  optionalEnum,
  requireIsoDate,
  requireObjectId,
  toStringList,
} from "../utils/validate.js";
import {
  getAudienceContext,
  audienceMatchesStudent,
  listTargetedStudents,
  STAFF_ROLES,
} from "../services/accessControl.js";
import {
  createUploader,
  runMultiFileUpload,
  verifyStoredFile,
  persistStoredFile,
  deleteStoredFile,
  FILE_POLICIES,
} from "../services/fileStorage.js";
import { sanitizeNoticeHtml, htmlToPlainText } from "../utils/sanitizeHtml.js";
import { notifyOnce } from "../services/lms/notifier.js";
import {
  normalizeAudienceInput,
  describeAudience,
  isEmptySpecificTarget,
} from "../models/Audience.js";

/**
 * Notices.
 *
 * One route module owns the whole notice lifecycle: rich-text
 * composition, attachments, audience targeting, drafting and
 * publishing. Every mutation re-derives the actor from the session
 * and checks scope server-side; the browser never decides who may
 * read or publish.
 *
 * Publishing rights follow the permission catalogue: `notices.publish`
 * grants full institutional reach. Faculty keep the legacy ability
 * to publish, but only to a *specific* audience — a teacher may
 * not page the whole college. Students (and every other role
 * without the permission) cannot publish at all.
 */

const attachmentUploader = createUploader("notice_attachment", {
  field: "file",
  multiple: true,
  maxFiles: 10,
});

/** Hard ceiling so a college-wide notice cannot loop unbounded. */
const MAX_RECIPIENTS = 2000;
/** Most attachments a single notice may carry. */
const MAX_ATTACHMENTS = 10;

/** Roles that could publish before the permission catalogue existed. */
const LEGACY_PUBLISHERS = [
  "super_admin",
  "hod",
  "program_coordinator",
  "dean",
  "registrar",
  "exam_officer",
  "finance_officer",
  "faculty",
];

/** True when the account may manage every notice, in any scope. */
function isNoticeManager(user) {
  return hasPermission(getUserRoles(user), "notices.publish");
}

/** True when the account may compose notices at all (manager or legacy faculty). */
function canComposeNotices(user) {
  const roles = getUserRoles(user);
  return isNoticeManager(user) || roles.some((role) => LEGACY_PUBLISHERS.includes(role));
}

/**
 * Scope gate for accounts that publish without the catalogue
 * permission: they must address a specific cohort, never the
 * whole institution.
 */
function assertScopedAudience(audience, targetRoles, user) {
  if (isNoticeManager(user)) return;
  const collegeWide =
    audience.targetType === "ALL" ||
    audience.targetType === "STAFF" ||
    !Array.isArray(targetRoles) ||
    targetRoles.length === 0 ||
    targetRoles.includes("ALL");
  if (collegeWide) {
    throw validationError(
      "Teachers may publish only to a specific audience. Choose the roles, users or cohort this notice is for, or contact an administrator for college-wide publishing.",
      [{ field: "audience", message: "A specific audience is required." }],
    );
  }
}

/**
 * Audience + role targeting read from a request body.
 * `targetRoles` (legacy) and `audience` (cohort) are both kept:
 * the first drives role-based visibility, the second cohort-based
 * visibility, and a notice is visible only when both match.
 */
function readNoticeTargeting(body, user) {
  const rawRoles = Array.isArray(body.targetRoles)
    ? body.targetRoles
    : typeof body.targetRoles === "string"
      ? [body.targetRoles]
      : typeof body.audienceRole === "string" && body.audienceRole
        ? [body.audienceRole]
        : ["ALL"];

  const targetRoles = rawRoles
    .map((role) => String(role || "").trim())
    .filter(Boolean);
  if (!targetRoles.length) targetRoles.push("ALL");

  const audience = normalizeAudienceInput(
    body.audience && typeof body.audience === "object" ? body.audience : {},
  );
  if (
    audience.targetType === "SPECIFIC" &&
    isEmptySpecificTarget(audience.target) &&
    !((body.targetUsers || []).length)
  ) {
    throw validationError(
      "Choose who this notice is for: all students, staff, a specific role, or a programme/batch/semester/section cohort.",
      [{ field: "audience", message: "Select an audience." }],
    );
  }

  assertScopedAudience(audience, targetRoles, user);
  return { targetRoles, audience };
}

/** Attachment references are file ids already stored via /api/notices/upload. */
async function resolveAttachmentRefs(fileIds, user) {
  const ids = Array.isArray(fileIds) ? fileIds : [];
  if (ids.length > MAX_ATTACHMENTS) {
    throw validationError(
      `A notice may carry at most ${MAX_ATTACHMENTS} attachments.`,
      [{ field: "attachments", message: "Too many attachments." }],
    );
  }

  const actorId = String(user._id || user.id);
  const manager = isNoticeManager(user);
  const references = [];

  for (const id of ids) {
    const fileId = requireObjectId(id, "Attachment");
    const stored = await StoredFile.findOne({
      _id: fileId,
      module: "notice_attachment",
      status: "STORED",
    }).lean();
    if (!stored) throw notFound("One of the selected files is no longer available.");
    // An uploaded file is bound to whoever uploaded it; only the
    // uploader or a notice manager may attach it to a notice.
    if (!manager && String(stored.uploadedBy || "") !== actorId) {
      throw notFound("One of the selected files is no longer available.");
    }
    references.push({
      fileId: stored._id,
      originalName: stored.originalName,
      mimeType: stored.mimeType,
      extension: stored.extension,
      sizeBytes: stored.sizeBytes,
      uploadedBy: stored.uploadedBy,
      uploadedAt: stored.createdAt,
    });
  }

  return references;
}

/** Whether the signed-in account may read a notice record. */
async function noticeIsReadable(notice, user) {
  const roles = getUserRoles(user);
  const actorId = String(user._id || user.id);

  if (isNoticeManager(user)) return true;
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

  const context = await getAudienceContext(user);
  return audienceMatchesStudent(notice.audience, context);
}

/**
 * Users a published notice is addressed to, resolved from real
 * records. Used by the notification sweep; a draft never reaches
 * this code path.
 */
async function resolveNoticeRecipientUserIds(notice) {
  const ids = new Set();
  for (const id of notice.targetUsers || []) ids.add(String(id));

  const audience = notice.audience;
  if (audience && audience.targetType && audience.targetType !== "ALL") {
    // Cohort targeting is authoritative when present.
    if (audience.targetType === "STAFF") {
      const staff = await User.find({
        roles: { $in: STAFF_ROLES },
        accountStatus: { $in: ["ACTIVE", "PASSIVE"] },
      })
        .select("_id")
        .lean();
      staff.forEach((row) => ids.add(String(row._id)));
      return [...ids];
    }

    const target = audience.target || {};
    for (const id of target.userIds || []) ids.add(String(id));

    if ((target.roleIds || []).length) {
      const byRole = await User.find({
        roles: { $in: target.roleIds },
        accountStatus: { $in: ["ACTIVE", "PASSIVE"] },
      })
        .select("_id")
        .lean();
      byRole.forEach((row) => ids.add(String(row._id)));
    }

    const hasCohort =
      (target.programCodes || []).length > 0 ||
      (target.batchYears || []).length > 0 ||
      (target.semesters || []).length > 0 ||
      (target.sectionCodes || []).length > 0 ||
      target.allSections === true;
    if (hasCohort) {
      const students = await listTargetedStudents({
        programCodes: target.programCodes,
        batchYears: target.batchYears,
        semesters: target.semesters,
        sectionCodes: target.sectionCodes,
      });
      students.forEach((student) => {
        if (student.userId) ids.add(student.userId);
      });
    }
    return [...ids];
  }

  // Legacy role targeting (no cohort audience on the record).
  const roles = notice.targetRoles || [];
  if (!roles.length || roles.includes("ALL")) {
    const everyone = await User.find({
      accountStatus: { $in: ["ACTIVE", "PASSIVE"] },
    })
      .select("_id")
      .limit(MAX_RECIPIENTS)
      .lean();
    everyone.forEach((row) => ids.add(String(row._id)));
    return [...ids];
  }

  const byRole = await User.find({
    roles: { $in: roles },
    accountStatus: { $in: ["ACTIVE", "PASSIVE"] },
  })
    .select("_id")
    .limit(MAX_RECIPIENTS)
    .lean();
  byRole.forEach((row) => ids.add(String(row._id)));
  return [...ids];
}

/**
 * Delivers the publication notification. Idempotency keys include
 * the notice and the recipient, so a retried publish or a double
 * click can never create a duplicate notification.
 */
async function notifyNoticeRecipients(notice, actorUser) {
  let recipients = [];
  try {
    recipients = await resolveNoticeRecipientUserIds(notice);
  } catch (error) {
    console.error("Notice recipient resolution failed:", error.message);
    return 0;
  }

  const authorName = actorUser
    ? `${actorUser.firstName || ""} ${actorUser.lastName || ""}`.trim() || "Administration"
    : "Administration";
  const summary = htmlToPlainText(notice.contentHtml || notice.content || "").slice(0, 140);

  let delivered = 0;
  for (const userId of recipients) {
    const created = await notifyOnce({
      userId,
      title: `Notice: ${notice.title}`,
      message: summary || `Published by ${authorName}.`,
      category: "notice",
      priority: notice.priority === "URGENT" ? "urgent" : notice.priority === "HIGH" ? "high" : "normal",
      actionUrl: "/notices",
      idempotencyKey: `notice:${notice._id.toString()}:${userId}:publish`,
      metadata: { noticeId: notice._id.toString(), authorId: String(notice.authorUser || "") },
    });
    if (created) delivered += 1;
  }
  return delivered;
}

function serializeAttachment(ref) {
  const mimeType = String(ref.mimeType || "");
  return {
    fileId: String(ref.fileId),
    originalName: ref.originalName,
    mimeType,
    extension: ref.extension,
    sizeBytes: ref.sizeBytes,
    uploadedAt: ref.uploadedAt ? new Date(ref.uploadedAt).toISOString() : null,
    isPdf: mimeType === "application/pdf",
    isImage: mimeType.startsWith("image/"),
    isPreviewable: mimeType === "application/pdf" || mimeType.startsWith("image/"),
  };
}

function serializeNotice(notice, { author }) {
  return {
    id: notice._id.toString(),
    title: notice.title,
    body: notice.content,
    contentHtml: notice.contentHtml || null,
    category: notice.category,
    priority: notice.priority,
    examId: notice.examId ? notice.examId.toString() : null,
    exam_id: notice.examId ? notice.examId.toString() : null,
    targetRoles: notice.targetRoles || [],
    audience: notice.audience || { targetType: "ALL", target: {} },
    targetType: notice.audience?.targetType || "ALL",
    audienceLabel: describeAudience(notice.audience),
    targetUsers: (notice.targetUsers || []).map(String),
    status: notice.status || "PUBLISHED",
    attachments: (notice.attachments || []).map(serializeAttachment),
    expiresAt: notice.expiresAt ? notice.expiresAt.toISOString() : null,
    publishedAt: notice.publishedAt ? notice.publishedAt.toISOString() : null,
    createdAt: notice.createdAt ? notice.createdAt.toISOString() : null,
    updatedAt: notice.updatedAt ? notice.updatedAt.toISOString() : null,
    author: author
      ? `${author.firstName || ""} ${author.lastName || ""}`.trim() || "Administration"
      : "Administration",
    authorId: notice.authorUser ? notice.authorUser.toString() : null,
  };
}

export function registerNoticesRoutes(app) {
  /**
   * Notice board. Every account sees the notices addressed to it;
   * managers additionally see drafts and archived records so they
   * can run the queue. Students never see unpublished notices.
   */
  app.get("/api/notices", requireAuth, route(async (req, res) => {
    const user = req.user;
    const roles = getUserRoles(user);
    const manager = isNoticeManager(user);

    const notices = await Notice.find()
      .populate("authorUser", "firstName lastName email")
      .sort({ publishedAt: -1 })
      .limit(200)
      .lean();

    const visible = [];
    for (const notice of notices) {
      if (await noticeIsReadable(notice, user)) visible.push(notice);
    }

    res.json({
      notices: visible.map((notice) =>
        serializeNotice(notice, { author: notice.authorUser }),
      ),
    });
  }));

  /** Single notice by id, with the same entitlement rules as the list. */
  app.get("/api/notices/:id", requireAuth, route(async (req, res) => {
    const notice = await Notice.findById(
      requireObjectId(req.params.id, "Notice"),
    )
      .populate("authorUser", "firstName lastName email")
      .lean();
    if (!notice) throw notFound("Notice not found.");
    if (!(await noticeIsReadable(notice, req.user))) {
      // 404, not 403: an unauthorized reader must not be able to
      // confirm that the notice exists.
      throw notFound("Notice not found.");
    }
    res.json({ notice: serializeNotice(notice, { author: notice.authorUser }) });
  }));

  app.get("/api/notices/exam/:examId", requireAuth, route(async (req, res) => {
    const notice = await Notice.findOne({
      examId: requireObjectId(req.params.examId, "Exam"),
    }).populate("authorUser", "firstName lastName email");
    if (!notice) throw notFound("Notice for this exam not found.");
    if (!(await noticeIsReadable(notice.toObject ? notice.toObject() : notice, req.user))) {
      throw notFound("Notice for this exam not found.");
    }
    res.json({
      notice: serializeNotice(notice, { author: notice.authorUser }),
    });
  }));

  /**
   * Attachment staging upload. Files land in the notice-attachment
   * store and are bound to the notice when the notice is created.
   * Only accounts that may compose notices may stage files.
   */
  app.post(
    "/api/notices/upload",
    requireAuth,
    (req, res, next) => {
      if (!canComposeNotices(req.user)) {
        res.status(403).json({ error: "You cannot publish official notices." });
        return;
      }
      runMultiFileUpload(
        req,
        res,
        attachmentUploader,
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
              const verified = await verifyStoredFile(
                file.path,
                FILE_POLICIES.notice_attachment,
              );
              const persisted = await persistStoredFile({
                module: "notice_attachment",
                file,
                verifiedSignature: verified.verifiedSignature,
                uploadedBy: actorId,
                relatedType: "notice_attachment",
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

  /** Create a notice (draft or published). */
  app.post("/api/notices", requireAuth, route(async (req, res) => {
    const user = req.user;
    if (!canComposeNotices(user)) {
      throw forbidden("You cannot publish official notices.");
    }

    const body = req.body || {};
    const title = requireString(body.title, "Title", { max: 180 });
    const rawHtml = body.contentHtml ?? body.body ?? "";
    const contentHtml = sanitizeNoticeHtml(rawHtml);
    const plainText = htmlToPlainText(contentHtml) || String(body.body || "").trim();
    if (!plainText) {
      throw validationError("A title and body are required.", [
        { field: "body", message: "Write the notice body." },
      ]);
    }

    const { targetRoles, audience } = readNoticeTargeting(body, user);

    const targetUsers = (body.targetUsers || [])
      .map((id) => String(id))
      .filter((id) => /^[0-9a-fA-F]{24}$/.test(id))
      .slice(0, 100);

    const attachments = await resolveAttachmentRefs(body.attachments, user);

    const status = requireEnum(
      body.status || "PUBLISHED",
      "Status",
      ["DRAFT", "PUBLISHED"],
      { upper: true },
    );

    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw validationError("The expiry date is not a valid date.", [
        { field: "expiresAt", message: "Choose a valid expiry date." },
      ]);
    }

    const notice = await Notice.create({
      title,
      content: plainText,
      contentHtml: contentHtml || null,
      category: requireEnum(body.category || "ACADEMIC", "Category", [
        "ACADEMIC",
        "EXAMINATION",
        "ADMINISTRATIVE",
        "EVENT",
        "URGENT",
        "HOLIDAY",
      ]),
      priority: requireEnum(body.priority || "NORMAL", "Priority", [
        "LOW",
        "NORMAL",
        "HIGH",
        "URGENT",
      ]),
      authorUser: user._id || user.id,
      targetRoles,
      targetUsers,
      audience,
      examId: body.examId || null,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
      status,
      attachments,
    });

    // Bind staged files to the notice they now belong to.
    if (attachments.length) {
      await StoredFile.updateMany(
        { _id: { $in: attachments.map((ref) => ref.fileId) } },
        { $set: { relatedType: "notice", relatedId: notice._id.toString() } },
      );
    }

    const populated = await Notice.findById(notice._id).populate(
      "authorUser",
      "firstName lastName email",
    );

    await logAudit({
      userId: user._id || user.id,
      action: status === "DRAFT" ? "NOTICE_DRAFT_CREATED" : "NOTICE_PUBLISHED",
      module: "notices",
      resource: "notice",
      resourceId: notice._id.toString(),
      newValue: {
        title: notice.title,
        category: notice.category,
        priority: notice.priority,
        status: notice.status,
        targetRoles: notice.targetRoles,
        audience: describeAudience(notice.audience),
        attachmentCount: notice.attachments.length,
      },
      details:
        status === "DRAFT"
          ? `Notice draft "${notice.title}" created.`
          : `Official notice published: ${notice.title}.`,
    });

    if (status === "PUBLISHED") {
      await notifyNoticeRecipients(notice, user);
    }

    res.status(201).json({
      success: true,
      noticeId: notice._id.toString(),
      notice: serializeNotice(populated, { author: populated.authorUser }),
    });
  }));

  /** Publish a draft. Notifications are delivered exactly once. */
  app.post("/api/notices/:id/publish", requireAuth, route(async (req, res) => {
    const notice = await Notice.findById(
      requireObjectId(req.params.id, "Notice"),
    );
    if (!notice) throw notFound("Notice not found.");

    const actorId = String(req.user._id || req.user.id);
    const manager = isNoticeManager(req.user);
    if (!manager && String(notice.authorUser || "") !== actorId) {
      throw forbidden("You cannot publish this notice.");
    }
    if (notice.status === "PUBLISHED") {
      // Already published: a retry is a no-op, not a second sweep.
      res.json({
        success: true,
        noticeId: notice._id.toString(),
        notice: serializeNotice(notice, { author: null }),
      });
      return;
    }
    if (notice.status === "ARCHIVED") {
      throw validationError("An archived notice cannot be published.", [
        { field: "status", message: "State is ARCHIVED." },
      ]);
    }

    notice.status = "PUBLISHED";
    notice.publishedAt = new Date();
    notice.updatedBy = req.user._id || req.user.id;
    await notice.save();

    await logAudit({
      userId: req.user._id || req.user.id,
      action: "NOTICE_PUBLISHED",
      module: "notices",
      resource: "notice",
      resourceId: notice._id.toString(),
      newValue: { title: notice.title, status: notice.status },
      details: `Official notice published: ${notice.title}.`,
    });

    await notifyNoticeRecipients(notice, req.user);

    res.json({
      success: true,
      noticeId: notice._id.toString(),
      notice: serializeNotice(notice, { author: null }),
    });
  }));

  /** Edit a notice. Only the author or a notice manager may edit. */
  app.patch("/api/notices/:id", requireAuth, route(async (req, res) => {
    const notice = await Notice.findById(
      requireObjectId(req.params.id, "Notice"),
    );
    if (!notice) throw notFound("Notice not found.");

    const actorId = String(req.user._id || req.user.id);
    const manager = isNoticeManager(req.user);
    if (!manager && String(notice.authorUser || "") !== actorId) {
      throw forbidden("You cannot edit this notice.");
    }

    const body = req.body || {};
    const before = {
      title: notice.title,
      status: notice.status,
      priority: notice.priority,
    };

    if (body.title !== undefined) {
      notice.title = requireString(body.title, "Title", { max: 180 });
    }
    if (body.contentHtml !== undefined || body.body !== undefined) {
      const rawHtml = body.contentHtml ?? body.body ?? "";
      const contentHtml = sanitizeNoticeHtml(rawHtml);
      const plainText = htmlToPlainText(contentHtml) || String(body.body || "").trim();
      if (!plainText) {
        throw validationError("A notice body is required.", [
          { field: "body", message: "Write the notice body." },
        ]);
      }
      notice.content = plainText;
      notice.contentHtml = contentHtml || null;
    }
    if (body.category !== undefined) {
      notice.category = requireEnum(body.category, "Category", [
        "ACADEMIC",
        "EXAMINATION",
        "ADMINISTRATIVE",
        "EVENT",
        "URGENT",
        "HOLIDAY",
      ]);
    }
    if (body.priority !== undefined) {
      notice.priority = requireEnum(body.priority, "Priority", [
        "LOW",
        "NORMAL",
        "HIGH",
        "URGENT",
      ]);
    }
    if (body.targetRoles !== undefined || body.audienceRole !== undefined) {
      const rawRoles = Array.isArray(body.targetRoles)
        ? body.targetRoles
        : typeof body.audienceRole === "string" && body.audienceRole
          ? [body.audienceRole]
          : notice.targetRoles;
      const targetRoles = rawRoles
        .map((role) => String(role || "").trim())
        .filter(Boolean);
      if (targetRoles.length) notice.targetRoles = targetRoles;
    }
    if (body.audience !== undefined) {
      const audience = normalizeAudienceInput(
        body.audience && typeof body.audience === "object" ? body.audience : {},
      );
      if (
        audience.targetType === "SPECIFIC" &&
        isEmptySpecificTarget(audience.target) &&
        !(notice.targetUsers || []).length
      ) {
        throw validationError("Select an audience for this notice.", [
          { field: "audience", message: "Select an audience." },
        ]);
      }
      assertScopedAudience(audience, notice.targetRoles, req.user);
      notice.audience = audience;
    }
    if (body.expiresAt !== undefined) {
      if (!body.expiresAt) {
        notice.expiresAt = null;
      } else {
        const parsed = new Date(body.expiresAt);
        if (Number.isNaN(parsed.getTime())) {
          throw validationError("The expiry date is not a valid date.", [
            { field: "expiresAt", message: "Choose a valid expiry date." },
          ]);
        }
        notice.expiresAt = parsed;
      }
    }

    notice.updatedBy = req.user._id || req.user.id;
    await notice.save();

    await logAudit({
      userId: req.user._id || req.user.id,
      action: "NOTICE_UPDATED",
      module: "notices",
      resource: "notice",
      resourceId: notice._id.toString(),
      oldValue: before,
      newValue: {
        title: notice.title,
        status: notice.status,
        priority: notice.priority,
      },
      details: `Notice "${notice.title}" updated.`,
    });

    const populated = await Notice.findById(notice._id).populate(
      "authorUser",
      "firstName lastName email",
    );
    res.json({
      success: true,
      notice: serializeNotice(populated, { author: populated.authorUser }),
    });
  }));

  /** Attach staged files to an existing notice (draft or managed). */
  app.post("/api/notices/:id/attachments", requireAuth, route(async (req, res) => {
    const notice = await Notice.findById(
      requireObjectId(req.params.id, "Notice"),
    );
    if (!notice) throw notFound("Notice not found.");

    const actorId = String(req.user._id || req.user.id);
    const manager = isNoticeManager(req.user);
    if (!manager && String(notice.authorUser || "") !== actorId) {
      throw forbidden("You cannot attach files to this notice.");
    }

    const fileIds = (req.body && req.body.fileIds) || [];
    const references = await resolveAttachmentRefs(fileIds, req.user);
    const existingIds = (notice.attachments || []).map((ref) =>
      String(ref.fileId),
    );

    const added = references.filter(
      (ref) => !existingIds.includes(String(ref.fileId)),
    );
    if ((notice.attachments || []).length + added.length > MAX_ATTACHMENTS) {
      throw validationError(
        `A notice may carry at most ${MAX_ATTACHMENTS} attachments.`,
        [{ field: "attachments", message: "Too many attachments." }],
      );
    }

    notice.attachments = [...(notice.attachments || []), ...added];
    notice.updatedBy = req.user._id || req.user.id;
    await notice.save();

    if (added.length) {
      await StoredFile.updateMany(
        { _id: { $in: added.map((ref) => ref.fileId) } },
        { $set: { relatedType: "notice", relatedId: notice._id.toString() } },
      );
    }

    await logAudit({
      userId: req.user._id || req.user.id,
      action: "NOTICE_ATTACHMENTS_ADDED",
      module: "notices",
      resource: "notice",
      resourceId: notice._id.toString(),
      newValue: {
        attachmentCount: notice.attachments.length,
        files: added.map((ref) => ref.originalName),
      },
      details: `${added.length} attachment(s) added to "${notice.title}".`,
    });

    res.json({
      success: true,
      attachments: notice.attachments.map(serializeAttachment),
    });
  }));

  /** Remove one attachment from a notice. */
  app.delete("/api/notices/:id/attachments/:fileId", requireAuth, route(async (req, res) => {
    const notice = await Notice.findById(
      requireObjectId(req.params.id, "Notice"),
    );
    if (!notice) throw notFound("Notice not found.");

    const actorId = String(req.user._id || req.user.id);
    const manager = isNoticeManager(req.user);
    if (!manager && String(notice.authorUser || "") !== actorId) {
      throw forbidden("You cannot edit this notice.");
    }

    const fileId = requireObjectId(req.params.fileId, "Attachment");
    const index = (notice.attachments || []).findIndex(
      (ref) => String(ref.fileId) === String(fileId),
    );
    if (index === -1) throw notFound("This notice has no such attachment.");

    const [removed] = notice.attachments.splice(index, 1);
    notice.updatedBy = req.user._id || req.user.id;
    await notice.save();
    await deleteStoredFile(removed.fileId, req.user._id || req.user.id);

    await logAudit({
      userId: req.user._id || req.user.id,
      action: "NOTICE_ATTACHMENT_REMOVED",
      module: "notices",
      resource: "notice",
      resourceId: notice._id.toString(),
      oldValue: { file: removed.originalName },
      details: `Attachment removed from "${notice.title}".`,
    });

    res.json({
      success: true,
      attachments: notice.attachments.map(serializeAttachment),
    });
  }));

  /** Withdraw a notice from every reader. */
  app.post("/api/notices/:id/archive", requireAuth, route(async (req, res) => {
    const notice = await Notice.findById(
      requireObjectId(req.params.id, "Notice"),
    );
    if (!notice) throw notFound("Notice not found.");

    const actorId = String(req.user._id || req.user.id);
    const manager = isNoticeManager(req.user);
    if (!manager && String(notice.authorUser || "") !== actorId) {
      throw forbidden("You cannot archive this notice.");
    }

    notice.status = "ARCHIVED";
    notice.updatedBy = req.user._id || req.user.id;
    await notice.save();

    await logAudit({
      userId: req.user._id || req.user.id,
      action: "NOTICE_ARCHIVED",
      module: "notices",
      resource: "notice",
      resourceId: notice._id.toString(),
      oldValue: { status: "PUBLISHED" },
      newValue: { status: "ARCHIVED" },
      details: `Notice "${notice.title}" archived.`,
    });

    res.json({
      success: true,
      noticeId: notice._id.toString(),
      notice: serializeNotice(notice, { author: null }),
    });
  }));

  /** Restore an archived notice to the board. */
  app.post("/api/notices/:id/restore", requireAuth, route(async (req, res) => {
    const notice = await Notice.findById(
      requireObjectId(req.params.id, "Notice"),
    );
    if (!notice) throw notFound("Notice not found.");

    const actorId = String(req.user._id || req.user.id);
    const manager = isNoticeManager(req.user);
    if (!manager && String(notice.authorUser || "") !== actorId) {
      throw forbidden("You cannot restore this notice.");
    }
    if (notice.status !== "ARCHIVED") {
      throw validationError("Only an archived notice can be restored.", [
        { field: "status", message: `Current state is ${notice.status}.` },
      ]);
    }

    notice.status = "PUBLISHED";
    notice.publishedAt = new Date();
    notice.updatedBy = req.user._id || req.user.id;
    await notice.save();

    await logAudit({
      userId: req.user._id || req.user.id,
      action: "NOTICE_RESTORED",
      module: "notices",
      resource: "notice",
      resourceId: notice._id.toString(),
      newValue: { status: notice.status },
      details: `Notice "${notice.title}" restored to the board.`,
    });

    res.json({
      success: true,
      noticeId: notice._id.toString(),
      notice: serializeNotice(notice, { author: null }),
    });
  }));
}
