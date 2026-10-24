import {
  Course,
  LearningMaterial,
  StoredFile,
  describeAudience,
  MATERIAL_TYPES,
} from "../../models/index.js";
import { logAudit, getUserRoles } from "../../db.js";
import { notFound, conflict, validationError } from "../../utils/apiError.js";
import {
  optionalString,
  toInt,
  toStringList,
  requireObjectId,
} from "../../utils/validate.js";
import { isTeachingAuthorized, resolveScopedAudience } from "../accessControl.js";
import { assertCanManageCourse } from "./lmsAccess.js";
import {
  verifyStoredFile,
  persistStoredFile,
  deleteStoredFile,
  FILE_POLICIES,
} from "../fileStorage.js";
import { detectDocumentStructure } from "../documentMeta.js";
import { assertValidMaterialStatus } from "./materialState.js";

/**
 * Material writing rules shared by every entry point.
 *
 * The library endpoints (`/api/learning-materials`) and the week-scoped
 * endpoints (`/api/lms/weeks/:weekId/materials`) are two doors into the same
 * room, so the rules that decide what a material is — who may write it, what it
 * is attached to, when it becomes visible — live here once. Neither route keeps
 * its own copy.
 */

const MANAGER_ROLES = ["super_admin", "dean", "hod", "registrar"];

/** Owners, teachers of the course, and curriculum administrators. */
export async function canManageMaterial(user, material) {
  if (String(material.uploadedBy) === String(user._id || user.id)) return true;
  if (getUserRoles(user).some((role) => MANAGER_ROLES.includes(role))) return true;
  return isTeachingAuthorized(user, {
    courseId: material.course?._id || material.course,
    sectionCode: material.sectionCodes?.[0],
    semester: material.semester,
  });
}

/**
 * Creates a material from an already-uploaded and signature-verified file.
 *
 * The file is persisted first so a material never exists without a real,
 * retrievable file behind it; if the record then fails to validate the upload is
 * deleted again rather than left orphaned on disk.
 */
export async function createMaterialFromUpload({
  actor,
  file,
  body,
  week = null,
  courseId: requestedCourseId = null,
  sectionCodes: requestedSectionCodes = null,
}) {
  const courseId = requestedCourseId || (week ? String(week.course) : null);
  if (!courseId) throw validationError("A course is required.", [
    { field: "courseId", message: "Choose the course this material belongs to." },
  ]);

  const course = await Course.findById(courseId).select(
    "_id code name status program academicYear semester",
  );
  if (!course) throw notFound("Course not found.");
  if (course.status === "ARCHIVED") {
    throw conflict("Materials cannot be added to an archived course.");
  }

  const semester = body.semester
    ? toInt(body.semester, "Semester", { min: 1, max: 12 })
    : week?.semester ?? course.semester ?? null;

  const requested = toStringList(requestedSectionCodes ?? body.sectionCodes, {
    upper: true,
    maxItems: 40,
  });

  /**
   * The audience of a material may never be wider than the uploader's own claim.
   *
   * `assertCanManageCourse` checks that the caller teaches this course and that
   * every section they *named* is one of theirs. What it returns is also used to
   * fill in the sections they did not name: a teacher assigned to A1 who uploads
   * without naming a section used to produce a material with no section filter at
   * all, which the student queries read as "every section in that semester" — so
   * an A1 teacher reached an A2 cohort. The default is now their own sections, and
   * only an institution-wide administrator (`role: "manager"`, `sections: null`)
   * can still address the course as a whole without naming sections.
   */
  const scope = await assertCanManageCourse(actor, courseId, {
    sectionCodes: requested,
    semester,
  });

  const sectionCodes = requested.length
    ? requested
    : scope.sections || [];

  const audience = resolveScopedAudience(body, {
    course,
    sectionCodes,
    semester,
    batch: optionalString(body.batch, "Batch", { max: 20 }),
  });

  const verified = await verifyStoredFile(file.path, FILE_POLICIES.learning_material);
  const persisted = await persistStoredFile({
    module: "learning_material",
    file,
    verifiedSignature: verified.verifiedSignature,
    uploadedBy: actor._id || actor.id,
    relatedType: "learning_material",
  });

  /**
   * Structural facts (slide count, page count) are read from the stored bytes so
   * a teacher can record "slides 1 to 12 of 20" without counting by hand. A file
   * whose structure cannot be established simply carries no count, and the
   * teaching-progress UI falls back to manual entry rather than inventing one.
   */
  const documentMeta = await detectDocumentStructure(persisted.stored);

  let material;
  try {
    material = await LearningMaterial.create({
      title: requireTitle(body.title),
      description: optionalString(body.description, "Description", { max: 4000 }) || "",
      topic: optionalString(body.topic, "Topic", { max: 160 }),
      course: courseId,
      week: week ? week._id : toOptionalId(body.week, "Week"),
      uploadedBy: actor._id || actor.id,
      file: persisted.reference,
      url: optionalString(body.url, "Link", { max: 2000 }) || null,
      content: optionalString(body.content, "Content", { max: 40000 }) || "",
      materialType: toMaterialType(body.materialType || body.type),
      estimatedMinutes: body.estimatedMinutes
        ? toInt(body.estimatedMinutes, "Estimated minutes", { min: 0, max: 10000 })
        : null,
      releaseAt: toOptionalDate(body.releaseAt, "Release time"),
      allowDownload:
        body.allowDownload === undefined
          ? true
          : body.allowDownload !== "false" && body.allowDownload !== false,
      status: toInitialStatus(body.status, body.releaseAt),
      version: 1,
      documentMeta,
      academicYear:
        optionalString(body.academicYear, "Academic year", { max: 20 }) ||
        course.academicYear ||
        "—",
      program:
        optionalString(body.program, "Programme", { max: 40 })?.toUpperCase() ||
        course.program ||
        null,
      batch: audience.target.batchYears?.[0] ?? optionalString(body.batch, "Batch", { max: 20 }),
      semester,
      sectionCodes: audience.target.sectionCodes || [],
      audience,
    });
  } catch (error) {
    await deleteStoredFile(persisted.stored._id, actor._id || actor.id);
    throw error;
  }

  await StoredFile.updateOne(
    { _id: persisted.stored._id },
    { relatedId: material._id.toString() },
  );

  await logAudit({
    userId: actor._id || actor.id,
    action: "LEARNING_MATERIAL_UPLOADED",
    module: "lms",
    resource: "learning_material",
    resourceId: material._id.toString(),
    newValue: {
      title: material.title,
      course: course.code,
      week: week ? `Week ${week.weekNumber}` : null,
      type: material.materialType,
      status: material.status,
      releaseAt: material.releaseAt,
      file: material.file?.originalName || null,
      audience: describeAudience(material.audience),
    },
    details: `Learning material "${material.title}" added to ${course.code}${week ? ` week ${week.weekNumber}` : ""} as ${material.materialType.toLowerCase().replace(/_/g, " ")} (${describeAudience(material.audience)}).`,
  });

  return material;
}

/** Applies a metadata patch. Visibility changes go through the status rules. */
export async function applyMaterialPatch({ material, body, actor, course }) {
  const before = {
    title: material.title,
    topic: material.topic,
    status: material.status,
    materialType: material.materialType,
    releaseAt: material.releaseAt,
    audience: describeAudience(material.audience),
  };

  if (body.title !== undefined) material.title = requireTitle(body.title);
  if (body.description !== undefined) {
    material.description = optionalString(body.description, "Description", { max: 4000 }) || "";
  }
  if (body.topic !== undefined) {
    material.topic = optionalString(body.topic, "Topic", { max: 160 });
  }
  if (body.content !== undefined) {
    material.content = optionalString(body.content, "Content", { max: 20000 }) || "";
  }
  if (body.url !== undefined) {
    material.url = optionalString(body.url, "Link", { max: 2000 }) || null;
  }
  if (body.content !== undefined) {
    material.content = optionalString(body.content, "Content", { max: 40000 }) || "";
  }
  if (body.materialType !== undefined || body.type !== undefined) {
    material.materialType = toMaterialType(body.materialType ?? body.type);
  }
  if (body.estimatedMinutes !== undefined) {
    material.estimatedMinutes = body.estimatedMinutes
      ? toInt(body.estimatedMinutes, "Estimated minutes", { min: 0, max: 10000 })
      : null;
  }
  if (body.allowDownload !== undefined) {
    material.allowDownload =
      body.allowDownload !== "false" && body.allowDownload !== false;
  }
  if (body.releaseAt !== undefined) {
    material.releaseAt = toOptionalDate(body.releaseAt, "Release time");
  }
  if (body.academicYear !== undefined) {
    material.academicYear = requireTitle(body.academicYear, "Academic year", 20);
  }
  if (body.semester !== undefined && body.semester !== null && body.semester !== "") {
    material.semester = toInt(body.semester, "Semester", { min: 1, max: 12 });
  }

  if (body.week !== undefined) material.week = toOptionalId(body.week, "Week");

  if (body.status !== undefined) {
    material.status = assertValidMaterialStatus(String(body.status).trim().toUpperCase());
    if (material.status === "PUBLISHED" && !material.releaseAt) {
      material.publishedAt = new Date();
    }
  }

  if (
    body.audience !== undefined ||
    body.targetType !== undefined ||
    body.sectionCodes !== undefined
  ) {
    const audience = resolveScopedAudience(body, {
      course: course || { program: material.program, batch: material.batch },
      sectionCodes: toStringList(body.sectionCodes, { upper: true, maxItems: 40 }),
      semester: material.semester,
    });
    material.audience = audience;
    material.sectionCodes = audience.target.sectionCodes || [];
    material.batch = audience.target.batchYears?.[0] ?? material.batch;
    material.program = audience.target.programCodes?.[0] ?? material.program;
  }

  material.updatedBy = actor._id || actor.id;
  await material.save();

  await logAudit({
    userId: actor._id || actor.id,
    action: "LEARNING_MATERIAL_UPDATED",
    module: "lms",
    resource: "learning_material",
    resourceId: material._id.toString(),
    oldValue: before,
    newValue: {
      title: material.title,
      topic: material.topic,
      status: material.status,
      materialType: material.materialType,
      releaseAt: material.releaseAt,
      audience: describeAudience(material.audience),
    },
    details: `Learning material "${material.title}" updated.`,
  });

  return material;
}

/**
 * Moves a material to a new visibility state.
 *
 * Publishing is an explicit act, so a material scheduled for a future instant
 * keeps its release gate: the sweep promotes it, and a teacher can still
 * publish early by clearing the release time in the same request.
 */
export async function setMaterialStatus({ material, status, actor }) {
  const next = assertValidMaterialStatus(status);
  const before = material.status;
  material.status = next;
  material.updatedBy = actor._id || actor.id;

  if (next === "PUBLISHED") {
    if (!material.releaseAt) {
      material.publishedAt = new Date();
      material.publishedBy = actor._id || actor.id;
    }
    material.archivedAt = null;
    material.archivedBy = null;
  }
  if (next === "ARCHIVED" || next === "HIDDEN") {
    material.archivedAt = new Date();
    material.archivedBy = actor._id || actor.id;
  }

  await material.save();
  await logAudit({
    userId: actor._id || actor.id,
    action: `LEARNING_MATERIAL_${next}`,
    module: "lms",
    resource: "learning_material",
    resourceId: material._id.toString(),
    oldValue: { status: before },
    newValue: { status: next },
    details: `Learning material "${material.title}" moved from ${before} to ${next}.`,
  });
  return material;
}

function requireTitle(value, label = "Title", max = 180) {
  return optionalString(value, label, { min: 2, max });
}

function toMaterialType(value) {
  const type = String(value || "FILE").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!MATERIAL_TYPES.includes(type)) {
    throw validationError(`Material type must be one of: ${MATERIAL_TYPES.join(", ")}.`, [
      { field: "materialType", message: "Choose a valid material type." },
    ]);
  }
  return type;
}

function toOptionalId(value, label) {
  if (value === undefined || value === null || value === "") return null;
  return requireObjectId(value, label);
}

function toOptionalDate(value, label, field = "releaseAt") {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validationError(`${label} must be a valid date and time.`, [
      { field, message: "Enter a valid date and time." },
    ]);
  }
  return date;
}

function toInitialStatus(value, releaseAt) {
  if (value === undefined || value === null || value === "") {
    return releaseAt ? "SCHEDULED" : "PUBLISHED";
  }
  const status = String(value).trim().toUpperCase();
  if (status === "ARCHIVED" || status === "HIDDEN") {
    throw validationError("New materials are created as draft, scheduled or published.", [
      { field: "status", message: "Choose DRAFT, SCHEDULED or PUBLISHED." },
    ]);
  }
  return assertValidMaterialStatus(status);
}

/**
 * Publishes a replacement upload as the next version of a material.
 *
 * The previous version is never rewritten or deleted. It becomes a superseded
 * sibling that keeps its own file, its own download history and — critically — the
 * teaching-progress records recorded against it, because "the teacher got to
 * slide 12" must keep meaning slide 12 of the deck they were holding, not slide 12
 * of a file uploaded three weeks later.
 *
 * The new version inherits the audience, week and cohort targeting of the version
 * it replaces, so a correction reaches exactly the same students.
 */
export async function createMaterialVersion({ actor, previous, file, body = {} }) {
  if (String(previous.supersededBy || "")) {
    throw conflict(
      "This version has already been superseded. Upload the replacement from the latest version.",
    );
  }

  const verified = await verifyStoredFile(file.path, FILE_POLICIES.learning_material);
  const persisted = await persistStoredFile({
    module: "learning_material",
    file,
    verifiedSignature: verified.verifiedSignature,
    uploadedBy: actor._id || actor.id,
    relatedType: "learning_material",
  });
  const documentMeta = await detectDocumentStructure(persisted.stored);

  const version = (previous.version || 1) + 1;
  let created;
  try {
    created = await LearningMaterial.create({
      title: optionalString(body.title, "Title", { max: 180 }) || previous.title,
      description:
        (optionalString(body.description, "Description", { max: 4000 }) ??
          previous.description) ||
        "",
      topic: optionalString(body.topic, "Topic", { max: 160 }) ?? previous.topic ?? null,
      course: previous.course,
      week: previous.week,
      uploadedBy: actor._id || actor.id,
      materialType:
        body.materialType === undefined
          ? previous.materialType
          : toMaterialType(body.materialType),
      file: persisted.reference,
      url: previous.url,
      content: previous.content,
      estimatedMinutes: previous.estimatedMinutes,
      academicYear: previous.academicYear,
      program: previous.program,
      batch: previous.batch,
      semester: previous.semester,
      sectionCodes: previous.sectionCodes || [],
      audience: previous.audience,
      status: toInitialStatus(body.status, body.releaseAt ?? previous.releaseAt),
      releaseAt: toOptionalDate(body.releaseAt, "Release time") ?? previous.releaseAt ?? null,
      allowDownload: previous.allowDownload !== false,
      replacedFileId: previous.file?.fileId || null,
      version,
      supersedes: previous._id,
      documentMeta,
      updatedBy: actor._id || actor.id,
    });
  } catch (error) {
    await deleteStoredFile(persisted.stored._id, actor._id || actor.id);
    throw error;
  }

  await StoredFile.updateOne(
    { _id: persisted.stored._id },
    { relatedId: created._id.toString() },
  );

  previous.supersededBy = created._id;
  previous.updatedBy = actor._id || actor.id;
  await previous.save();

  await logAudit({
    userId: actor._id || actor.id,
    action: "LEARNING_MATERIAL_VERSION_CREATED",
    module: "lms",
    resource: "learning_material",
    resourceId: created._id.toString(),
    oldValue: { version: previous.version, materialId: String(previous._id) },
    newValue: { version, materialId: String(created._id) },
    details: `Version ${version} of "${previous.title}" uploaded; version ${previous.version} retained as history.`,
  });

  return created;
}
