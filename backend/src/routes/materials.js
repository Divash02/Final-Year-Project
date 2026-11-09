import {
  LearningMaterial,
  Course,
  describeAudience,
  Program,
  Section,
} from "../models/index.js";
import { logAudit } from "../db.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { route, notFound, forbidden } from "../utils/apiError.js";
import {
  optionalString,
  optionalEnum,
  toInt,
  requireObjectId,
  readPagination,
} from "../utils/validate.js";
import {
  getAudienceContext,
  audienceMatchesStudent,
  buildAudienceVisibilityQuery,
} from "../services/accessControl.js";
import {
  createUploader,
  runFileUpload,
  verifyStoredFile,
  persistStoredFile,
  deleteStoredFile,
  FILE_POLICIES,
  formatBytes,
} from "../services/fileStorage.js";
import {
  canManageMaterial,
  createMaterialFromUpload,
  applyMaterialPatch,
  setMaterialStatus,
} from "../services/lms/materials.js";
import {
  resolveMaterialState,
  isMaterialVisibleToStudents,
  buildMaterialVisibilityFilter,
  materialStateSummary,
} from "../services/lms/materialState.js";
import { MATERIAL_STATUSES } from "../models/LearningMaterial.js";

const uploader = createUploader("learning_material", { field: "file" });

/**
 * Learning Materials — the LMS content library.
 *
 * Teachers and administrators upload lecture notes, handouts and slides for the
 * courses they are authorised to teach. Each material carries its own audience,
 * and the audience decision happens on the server: a BSc IT 2025 Semester 4
 * handout is not retrievable by a Semester 2 student, whether the request is a
 * list query or a direct id lookup.
 */
export function registerLearningMaterialRoutes(app) {
  app.get(
    "/api/learning-materials",
    requireAuth,
    route(async (req, res) => {
      const context = await getAudienceContext(req.user);
      const filter = buildAudienceVisibilityQuery(context);

      const courseId = optionalString(req.query.courseId, "Course", { max: 40 });
      const academicYear = optionalString(req.query.academicYear, "Academic year", { max: 20 });
      const semester = req.query.semester ? toInt(req.query.semester, "Semester", { min: 1, max: 12 }) : null;
      const program = optionalString(req.query.program, "Programme", { max: 40 });
      const section = optionalString(req.query.section, "Section", { max: 10 });
      const requestedStatus = optionalEnum(req.query.status, "Status", MATERIAL_STATUSES, {
        upper: true,
      });
      const search = optionalString(req.query.q, "Search", { max: 120 });
      const includeArchived = String(req.query.includeArchived || "") === "true";
      const { limit, page, skip } = readPagination(req.query, { defaultLimit: 25 });

      if (courseId) filter.course = requireObjectId(courseId, "Course");
      if (academicYear) filter.academicYear = academicYear;
      if (semester) filter.semester = semester;
      if (program) filter.program = program.toUpperCase();
      if (section) {
        filter.$and = [
          ...(filter.$and || []),
          {
            $or: [
              { sectionCodes: section.toUpperCase() },
              { sectionCodes: { $size: 0 } },
              { "audience.target.sectionCodes": section.toUpperCase() },
              { "audience.target.allSections": true },
              { "audience.target.sectionCodes": { $size: 0 } },
            ],
          },
        ];
      }
      // Staff are reviewing drafts and scheduled work, so they see every state.
      // A student only ever receives material that is already released: the
      // release gate is part of the query, not a check the caller can forget.
      const visibility = buildMaterialVisibilityFilter({ isCourseManager: context.isStaff });
      filter.$and = [...(filter.$and || []), ...(visibility.$and || [])];

      if (context.isStaff) {
        if (requestedStatus) filter.status = requestedStatus;
        else if (!includeArchived) filter.status = { $ne: "ARCHIVED" };
      }
      if (search) {
        const pattern = new RegExp(escapeRegExp(search), "i");
        filter.$and = [
          ...(filter.$and || []),
          { $or: [{ title: pattern }, { description: pattern }, { topic: pattern }] },
        ];
      }

      // "mine" is the uploader's own shelf; otherwise the audience rules decide.
      if (String(req.query.mine || "") === "true") {
        filter.uploadedBy = req.user._id || req.user.id;
      }

      const [materials, total] = await Promise.all([
        LearningMaterial.find(filter)
          .populate("course", "code name")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        LearningMaterial.countDocuments(filter),
      ]);

      res.json({
        materials: materials.map((material) => serialiseMaterial(material)),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      });
    }),
  );

  app.get(
    "/api/learning-materials/:id",
    requireAuth,
    route(async (req, res) => {
      const context = await getAudienceContext(req.user);
      const material = await LearningMaterial.findById(
        requireObjectId(req.params.id, "Learning material"),
      )
        .populate("course", "code name")
        .lean();
      if (!material) throw notFound("Learning material not found.");

      const isOwner = String(material.uploadedBy) === String(context.userId);
      const manages = context.isStaff
        ? await canManageMaterial(req.user, material)
        : false;
      if (!isOwner && !manages) {
        // A student is not told whether a draft exists; an unreleased material
        // simply is not found, whatever the id they guessed.
        if (!audienceMatchesStudent(material.audience, context)) {
          throw notFound("Learning material not found.");
        }
        if (!isMaterialVisibleToStudents(material)) {
          throw notFound("Learning material not found.");
        }
      }

      res.json({
        material: serialiseMaterial(material),
        canManage: isOwner || manages,
      });
    }),
  );

  app.get(
    "/api/learning-materials/filters",
    requireAuth,
    route(async (req, res) => {
      const [courses, programs, sections, years] = await Promise.all([
        Course.find({ status: "ACTIVE" }).select("code name program semester academicYear").sort({ code: 1 }).lean(),
        Program.find().select("code name department").sort({ code: 1 }).lean(),
        Section.find().select("code program semester batch").sort({ code: 1 }).lean(),
        LearningMaterial.distinct("academicYear"),
      ]);
      res.json({
        filters: {
          courses: courses.map((course) => ({
            id: String(course._id),
            code: course.code,
            name: course.name,
            program: course.program || null,
            semester: course.semester,
            academicYear: course.academicYear || null,
          })),
          academicYears: years.filter(Boolean).sort().reverse(),
          programCodes: programs.map((row) => row.code),
          batchYears: Array.from(new Set(sections.map((row) => row.batch).filter(Boolean))).sort(),
          semesters: Array.from(new Set(sections.map((row) => row.semester).filter(Boolean))).sort(
            (a, b) => a - b,
          ),
          sectionCodes: Array.from(new Set(sections.map((row) => row.code))).sort(),
        },
      });
    }),
  );

  app.post(
    "/api/learning-materials",
    requireAuth,
    requirePermission("materials.create"),
    (req, res, next) => {
      runFileUpload(
        req,
        res,
        uploader,
        async (uploadError, file) => {
          try {
            if (uploadError) throw uploadError;
            const material = await createMaterialFromUpload({
              actor: req.user,
              file,
              body: req.body || {},
              courseId: requireObjectId((req.body || {}).courseId, "Course"),
            });
            const created = await LearningMaterial.findById(material._id)
              .populate("course", "code name")
              .lean();
            res.status(201).json({ material: serialiseMaterial(created) });
          } catch (error) {
            next(error);
          }
        },
        next,
      );
    },
  );

  app.patch(
    "/api/learning-materials/:id",
    requireAuth,
    requirePermission("materials.create"),
    route(async (req, res) => {
      const material = await LearningMaterial.findById(
        requireObjectId(req.params.id, "Learning material"),
      );
      if (!material) throw notFound("Learning material not found.");
      if (!(await canManageMaterial(req.user, material))) {
        throw forbidden("You are not authorised to edit this learning material.");
      }

      const body = req.body || {};
      await applyMaterialPatch({ material, body, actor: req.user });

      const updated = await LearningMaterial.findById(material._id)
        .populate("course", "code name")
        .lean();
      res.json({ material: serialiseMaterial(updated) });
    }),
  );

  /** Replace the stored file while keeping the material's metadata and audience. */
  app.post(
    "/api/learning-materials/:id/file",
    requireAuth,
    requirePermission("materials.create"),
    (req, res, next) => {
      runFileUpload(
        req,
        res,
        uploader,
        async (uploadError, file) => {
          try {
            if (uploadError) throw uploadError;
            const material = await LearningMaterial.findById(
              requireObjectId(req.params.id, "Learning material"),
            );
            if (!material) throw notFound("Learning material not found.");
            if (!(await canManageMaterial(req.user, material))) {
              throw forbidden("You are not authorised to replace this file.");
            }

            const previous = material.file?.fileId || null;
            const verified = await verifyStoredFile(file.path, FILE_POLICIES.learning_material);
            const persisted = await persistStoredFile({
              module: "learning_material",
              file,
              verifiedSignature: verified.verifiedSignature,
              uploadedBy: req.user._id || req.user.id,
              relatedType: "learning_material",
              relatedId: material._id.toString(),
            });

            material.file = persisted.reference;
            material.updatedBy = req.user._id || req.user.id;
            await material.save();
            if (previous) await deleteStoredFile(previous, req.user._id || req.user.id);

            await logAudit({
              userId: req.user._id || req.user.id,
              action: "LEARNING_MATERIAL_FILE_REPLACED",
              module: "learning_materials",
              resource: "learning_material",
              resourceId: material._id.toString(),
              oldValue: { file: previous ? "previous file" : null },
              newValue: { file: material.file.originalName, sizeBytes: material.file.sizeBytes },
              details: `File replaced on learning material "${material.title}".`,
            });

            const updated = await LearningMaterial.findById(material._id)
              .populate("course", "code name")
              .lean();
            res.json({ material: serialiseMaterial(updated) });
          } catch (error) {
            next(error);
          }
        },
        next,
      );
    },
  );

  app.delete(
    "/api/learning-materials/:id",
    requireAuth,
    requirePermission("materials.create"),
    route(async (req, res) => {
      const material = await LearningMaterial.findById(
        requireObjectId(req.params.id, "Learning material"),
      );
      if (!material) throw notFound("Learning material not found.");
      if (!(await canManageMaterial(req.user, material))) {
        throw forbidden("You are not authorised to archive this learning material.");
      }
      await setMaterialStatus({ material, status: "ARCHIVED", actor: req.user });
      res.json({ success: true, material: serialiseMaterial(material.toObject()) });
    }),
  );

  app.post(
    "/api/learning-materials/:id/restore",
    requireAuth,
    requirePermission("materials.create"),
    route(async (req, res) => {
      const material = await LearningMaterial.findById(
        requireObjectId(req.params.id, "Learning material"),
      );
      if (!material) throw notFound("Learning material not found.");
      if (!(await canManageMaterial(req.user, material))) {
        throw forbidden("You are not authorised to restore this learning material.");
      }
      await setMaterialStatus({ material, status: "PUBLISHED", actor: req.user });
      const updated = await LearningMaterial.findById(material._id)
        .populate("course", "code name")
        .lean();
      res.json({ success: true, material: serialiseMaterial(updated) });
    }),
  );

  /**
   * Download counter and first-view record. Access to the bytes themselves is
   * enforced by `/api/files/:id`, so this only records that a student got far
   * enough to open the material.
   */
  app.post(
    "/api/learning-materials/:id/download",
    requireAuth,
    route(async (req, res) => {
      const context = await getAudienceContext(req.user);
      const material = await LearningMaterial.findById(
        requireObjectId(req.params.id, "Learning material"),
      );
      if (!material) throw notFound("Learning material not found.");
      const isOwner = String(material.uploadedBy) === String(context.userId);
      const manages = context.isStaff ? await canManageMaterial(req.user, material) : false;
      if (!isOwner && !manages) {
        if (!audienceMatchesStudent(material.audience, context)) {
          throw notFound("Learning material not found.");
        }
        if (!isMaterialVisibleToStudents(material)) {
          throw notFound("Learning material not found.");
        }
      }
      const update = { $inc: { downloadCount: 1 } };
      if (!material.firstViewedAt) update.$set = { firstViewedAt: new Date() };
      await LearningMaterial.updateOne({ _id: material._id }, update);
      res.json({
        success: true,
        downloadCount: (material.downloadCount || 0) + 1,
        firstViewedAt: material.firstViewedAt || new Date(),
      });
    }),
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function serialiseMaterial(material) {
  const course = material.course && typeof material.course === "object" ? material.course : null;
  const week = material.week && typeof material.week === "object" ? material.week : null;
  const state = resolveMaterialState(material);
  return {
    id: String(material._id),
    _id: String(material._id),
    title: material.title,
    description: material.description || "",
    topic: material.topic || null,
    courseId: String(course?._id || material.course || ""),
    courseCode: course?.code || null,
    courseName: course?.name || null,
    weekId: String(week?._id || material.week || "") || null,
    weekNumber: week?.weekNumber ?? null,
    weekTitle: week?.title ?? null,
    uploadedBy: String(material.uploadedBy || ""),
    materialType: material.materialType || "FILE",
    /**
     * Which revision of this material the teacher is holding.
     *
     * A replacement upload becomes a new row with the next number, so a teaching
     * record can say which version it was recorded against and the teacher can see
     * at a glance that they are looking at a superseded deck.
     */
    version: material.version || 1,
    supersedesMaterialId: material.supersedes ? String(material.supersedes) : null,
    supersededByMaterialId: material.supersededBy ? String(material.supersededBy) : null,
    url: material.url || null,
    content: material.content || "",
    estimatedMinutes: material.estimatedMinutes ?? null,
    allowDownload: material.allowDownload !== false,
    file: material.file
      ? {
          fileId: String(material.file.fileId),
          originalName: material.file.originalName,
          mimeType: material.file.mimeType,
          extension: material.file.extension,
          sizeBytes: material.file.sizeBytes,
          sizeLabel: formatBytes(material.file.sizeBytes),
          uploadedAt: material.file.uploadedAt || null,
          isPdf: material.file.mimeType === "application/pdf",
          isImage: String(material.file.mimeType || "").startsWith("image/"),
          isAudio: String(material.file.mimeType || "").startsWith("audio/"),
          isVideo: String(material.file.mimeType || "").startsWith("video/"),
        }
      : null,
    academicYear: material.academicYear,
    program: material.program || null,
    batch: material.batch || null,
    semester: material.semester ?? null,
    sectionCodes: material.sectionCodes || [],
    targetType: material.audience?.targetType || "ALL",
    audienceLabel: describeAudience(material.audience),
    status: material.status,
    /** The state a student actually experiences right now, server-derived. */
    state,
    visibility: materialStateSummary(material),
    releaseAt: material.releaseAt || null,
    publishedAt: material.publishedAt || null,
    downloadCount: material.downloadCount || 0,
    viewCount: material.viewCount || 0,
    firstViewedAt: material.firstViewedAt || null,
    /**
     * How long the document actually is, read from the file on upload.
     *
     * This is what lets a teacher be told "20 slides" instead of guessing, so it
     * travels with the material rather than costing a request per row. It is a
     * structural fact about the file — not a claim about teaching — and it is null
     * for a format whose length cannot be established from its bytes, such as a
     * DOCX whose page count only exists once a word processor lays it out.
     */
    documentMeta: material.documentMeta
      ? {
          pageCount: material.documentMeta.pageCount ?? null,
          slideCount: material.documentMeta.slideCount ?? null,
          unitCount: material.documentMeta.unitCount ?? null,
          unitLabel: material.documentMeta.unitLabel || "slide",
          detectedBy: material.documentMeta.detectedBy || null,
          detectedAt: material.documentMeta.detectedAt || null,
        }
      : null,
    /**
     * The teacher's last confirmed teaching position.
     *
     * Written only by an explicit `TeachingProgress` record. It sits next to
     * `firstViewedAt` and is deliberately a different thing: opening a deck says
     * it was opened, never that it was taught.
     */
    lastTaughtAt: material.lastTaughtAt || null,
    lastTaughtFromUnit: material.lastTaughtFromUnit ?? null,
    lastTaughtToUnit: material.lastTaughtToUnit ?? null,
    lastTaughtTopic: material.lastTaughtTopic || null,
    lastTaughtNotes: material.lastTaughtNotes || null,
    archivedAt: material.archivedAt || null,
    createdAt: material.createdAt || null,
    updatedAt: material.updatedAt || null,
  };
}
