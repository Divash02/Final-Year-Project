import {
  CodingProject,
  CodingShare,
  CodingAssignment,
  CodingSubmission,
  CodingExecution,
  CodingDraft,
  Student,
  Enrollment,
  User,
} from "../models/index.js";
import { requireAuth, requireRole, requirePermission } from "../middleware/auth.js";
import {
  route,
  notFound,
  forbidden,
  validationError,
  badRequest,
} from "../utils/apiError.js";
import {
  requireObjectId,
  requireString,
  optionalString,
  requireEnum,
  optionalEnum,
  readPagination,
  toStringList,
  toInt,
  toNumber,
  optionalBoolean,
} from "../utils/validate.js";
import { getUserRoles, logAudit } from "../db.js";
import {
  isTeachingAuthorized,
  listTeachingScopes,
  listTargetedStudents,
  canManageCurriculum,
} from "../services/accessControl.js";
import { hasPermission } from "../permissions/catalog.js";
import {
  submitExecution,
  getExecutionResult,
  fetchProviderLanguages,
  assertLanguageAvailable,
  getLanguageMeta,
  MAX_FILES_PER_PROJECT,
} from "../services/codeExecution.js";

/**
 * Online Coding Lab API.
 *
 * Every endpoint is gated to `student` and `faculty` roles — no
 * administrative or departmental role can reach the lab, whatever
 * the frontend shows. All identifiers (owner, teacher, student,
 * course) are re-derived from the validated session; values from
 * the request body or path are never trusted for authorization.
 */

const PROJECT_TYPES = ["COMPILER", "PLAYGROUND"];
const SHARE_TYPES = ["COURSE", "SECTION", "STUDENTS"];
const SHARE_PERMISSIONS = ["VIEW", "COPY"];
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,118}$/;
const MAX_TOTAL_FILE_BYTES = 900 * 1024;

function requireCodingLab() {
  return [requireAuth, requireRole(["student", "faculty"]), requirePermission("coding.lab.view")];
}

function requireTeacher() {
  return [
    requireAuth,
    requireRole(["student", "faculty"]),
    requirePermission("coding.lab.view"),
    (req, res, next) => {
      const roles = getUserRoles(req.user);
      if (!roles.includes("faculty") && !canManageCurriculum(req.user)) {
        return res.status(403).json({ error: "Access denied. Teachers only." });
      }
      next();
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */

function safeFilename(value, field = "file name") {
  const name = requireString(value, field, { max: 120 });
  if (!SAFE_FILENAME.test(name) || name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw validationError(`${field} is not a valid filename.`, [
      { field: "name", message: "Use letters, digits, dots, dashes and spaces only." },
    ]);
  }
  return name;
}

/** Validates and normalises the embedded file list of a project. */
function parseFilesInput(files, { max = MAX_FILES_PER_PROJECT } = {}) {
  if (files === undefined || files === null) return [];
  if (!Array.isArray(files)) {
    throw validationError("files must be an array.", [
      { field: "files", message: "Provide a list of files." },
    ]);
  }
  if (files.length > max) {
    throw validationError(`A project may contain at most ${max} files.`);
  }
  let totalBytes = 0;
  const parsed = files.map((file, index) => {
    if (!file || typeof file !== "object") {
      throw validationError(`files[${index}] must be an object.`);
    }
    const name = safeFilename(file.name, `files[${index}].name`);
    const content = typeof file.content === "string" ? file.content : "";
    if (Buffer.byteLength(content, "utf8") > 512 * 1024) {
      throw validationError(`${name} must be 512 KiB or smaller.`);
    }
    totalBytes += Buffer.byteLength(content, "utf8");
    const language =
      typeof file.language === "string" && file.language.trim()
        ? file.language.trim().toLowerCase()
        : null;
    return {
      name,
      content,
      language,
      isMain: Boolean(file.isMain),
    };
  });
  if (totalBytes > MAX_TOTAL_FILE_BYTES) {
    throw validationError(`Total project size must be ${MAX_TOTAL_FILE_BYTES / 1024} KiB or smaller.`);
  }
  return parsed;
}

/* ------------------------------------------------------------------ */
/* Project access resolution                                           */
/* ------------------------------------------------------------------ */

function isShareActive(share, now = new Date()) {
  if (share.revokedAt) return false;
  if (share.expiresAt && share.expiresAt <= now) return false;
  return true;
}

async function findStudentByUserId(userId) {
  return Student.findOne({ user: userId }).select("_id user program batch semester section status").lean();
}

/**
 * Every active share that grants this student access to a
 * project. COURSE shares match enrolment, SECTION shares
 * match the enrolled section, STUDENTS shares match the
 * explicit user list.
 */
async function findActiveSharesForStudent(userId, projectId) {
  const shares = await CodingShare.find({
    project: projectId,
    revokedAt: null,
  }).lean();
  if (!shares.length) return [];

  const student = await findStudentByUserId(userId);
  if (!student || student.status !== "ACTIVE") return [];

  const enrollments = await Enrollment.find({
    student: student._id,
    status: "ENROLLED",
  })
    .select("course sectionCode")
    .lean();
  const enrolledCourseIds = new Set(enrollments.map((row) => String(row.course)));
  const enrolledSections = enrollments.map((row) => ({
    course: String(row.course),
    sectionCode: String(row.sectionCode || "").toUpperCase(),
  }));

  const matches = [];
  for (const share of shares) {
    if (!isShareActive(share)) continue;
    if (share.shareType === "STUDENTS") {
      if (share.studentUsers.some((id) => String(id) === String(userId))) {
        matches.push(share);
      }
      continue;
    }
    if (share.shareType === "COURSE") {
      if (enrolledCourseIds.has(String(share.course))) {
        matches.push(share);
      }
      continue;
    }
    if (share.shareType === "SECTION") {
      const match = enrolledSections.some(
        (row) =>
          row.course === String(share.course) &&
          (!share.sectionCode || row.sectionCode === String(share.sectionCode || "").toUpperCase()),
      );
      if (match) matches.push(share);
    }
  }
  return matches;
}

/**
 * The active share that grants this student access to a
 * project, or null. When several shares match, the most
 * permissive (COPY) one is reported.
 */
async function findActiveShareForStudent(userId, projectId) {
  const shares = await findActiveSharesForStudent(userId, projectId);
  return shares.find((share) => share.permission === "COPY") || shares[0] || null;
}

/**
 * Loads a project and decides whether the caller may read it.
 * Owners always can; students additionally via an active share.
 * Throws 404 (never 403) so private existence stays hidden.
 */
async function loadReadableProject(req) {
  const userId = String(req.user._id || req.user.id);
  const roles = getUserRoles(req.user);
  const project = await CodingProject.findOne({
    _id: requireObjectId(req.params.id, "Project"),
    deletedAt: null,
  }).lean();
  if (!project) throw notFound("Project not found.");

  if (String(project.ownerUser) === userId) {
    return { project, share: null, isOwner: true };
  }
  if (roles.includes("student")) {
    const share = await findActiveShareForStudent(userId, project._id);
    if (share) return { project, share, isOwner: false };
  }
  throw notFound("Project not found.");
}

async function assertProjectOwner(req) {
  const userId = String(req.user._id || req.user.id);
  const project = await CodingProject.findOne({
    _id: requireObjectId(req.params.id, "Project"),
    deletedAt: null,
  }).lean();
  if (!project) throw notFound("Project not found.");
  if (String(project.ownerUser) !== userId) throw notFound("Project not found.");
  return project;
}

/* ------------------------------------------------------------------ */
/* Teacher sharing scope                                               */
/* ------------------------------------------------------------------ */

async function assertTeacherMayShareTo(user, { shareType, courseId, sectionCode, studentIds }) {
  const roles = getUserRoles(user);
  const isFaculty = roles.includes("faculty");
  const curriculumAdmin = canManageCurriculum(user) || hasPermission(roles, "academics.teaching.assign");
  if (!isFaculty && !curriculumAdmin) {
    throw forbidden("Only teachers can share projects.");
  }

  if (shareType === "COURSE" || shareType === "SECTION") {
    if (!courseId) throw validationError("courseId is required for this share type.");
    const authorized = await isTeachingAuthorized(user, {
      courseId,
      sectionCode: shareType === "SECTION" ? sectionCode : undefined,
    });
    if (!authorized) {
      throw forbidden("You can only share projects for courses and sections you teach.");
    }
    return;
  }

  if (shareType === "STUDENTS") {
    if (!courseId) throw validationError("courseId is required when sharing with selected students.");
    if (!studentIds.length) throw validationError("Select at least one student.");
    const authorized = await isTeachingAuthorized(user, { courseId, sectionCode });
    if (!authorized) {
      throw forbidden("You can only share projects with students in your courses.");
    }
    for (const studentUserId of studentIds) {
      const student = await Student.findOne({ user: studentUserId }).select("status").lean();
      if (!student || student.status !== "ACTIVE") {
        throw validationError("One of the selected students does not have an active account.");
      }
      const enrollment = await Enrollment.findOne({
        student: student._id,
        course: courseId,
        status: "ENROLLED",
        ...(sectionCode ? { sectionCode: String(sectionCode).toUpperCase() } : {}),
      }).lean();
      if (!enrollment) {
        throw validationError(
          "Every selected student must be enrolled in the chosen course and section.",
        );
      }
    }
  }
}

function serializeProject(project, { share = null, ownerName = null } = {}) {
  return {
    id: String(project._id),
    ownerUser: String(project.ownerUser),
    ownerRole: project.ownerRole,
    title: project.title,
    description: project.description || "",
    projectType: project.projectType,
    defaultLanguage: project.defaultLanguage,
    files: (project.files || []).map((file) => ({
      name: file.name,
      language: file.language,
      content: file.content,
      isMain: Boolean(file.isMain),
    })),
    course: project.course ? String(project.course) : null,
    sectionCode: project.sectionCode || null,
    visibility: project.visibility,
    assignment: project.assignment ? String(project.assignment) : null,
    copiedFrom: project.copiedFrom ? String(project.copiedFrom) : null,
    shared: Boolean(share),
    sharePermission: share?.permission || null,
    shareType: share?.shareType || null,
    ownerName,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export function registerCodingRoutes(app) {
  /* ---------------- Execution provider ---------------- */

  app.get("/api/coding/languages", ...requireCodingLab(), route(async (req, res) => {
    const { configured, languages } = await fetchProviderLanguages();
    res.json({ configured, languages });
  }));

  app.post("/api/coding/execute", ...requireCodingLab(), route(async (req, res) => {
    const languageId = requireString(req.body?.languageId, "languageId", { max: 40 }).toLowerCase();
    const sourceCode = typeof req.body?.sourceCode === "string" ? req.body.sourceCode : "";
    const stdin = typeof req.body?.stdin === "string" ? req.body.stdin : "";
    let project = null;
    if (req.body?.projectId) {
      const access = await loadReadableProject({
        ...req,
        params: { id: req.body.projectId },
      });
      project = access.project;
    }
    const executionId = await submitExecution({
      user: req.user,
      project,
      languageId,
      sourceCode,
      stdin,
    });
    res.status(202).json({ executionId, status: "QUEUED" });
  }));

  app.get("/api/coding/executions/:id", ...requireCodingLab(), route(async (req, res) => {
    const result = await getExecutionResult(
      req.user,
      requireObjectId(req.params.id, "Execution"),
    );
    res.json({ execution: result });
  }));

  /* ---------------- Projects ---------------- */

  app.get("/api/coding/projects", ...requireCodingLab(), route(async (req, res) => {
    const { limit, skip } = readPagination(req.query, { defaultLimit: 50, maxLimit: 100 });
    const userId = String(req.user._id || req.user.id);
    const roles = getUserRoles(req.user);
    const includeShared = String(req.query.shared || "") === "true";

    const query = { ownerUser: userId, deletedAt: null };
    let projects = await CodingProject.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    let shared = [];
    if (roles.includes("student") && includeShared) {
      const student = await findStudentByUserId(userId);
      if (student && student.status === "ACTIVE") {
        const enrollments = await Enrollment.find({
          student: student._id,
          status: "ENROLLED",
        })
          .select("course sectionCode")
          .lean();
        const courseIds = enrollments.map((row) => String(row.course));
        const shareQuery = {
          revokedAt: null,
          $or: [
            { shareType: "STUDENTS", studentUsers: req.user._id },
            ...(courseIds.length
              ? [
                  { shareType: "COURSE", course: { $in: courseIds } },
                  ...enrollments.map((row) => ({
                    shareType: "SECTION",
                    course: row.course,
                    $or: [
                      { sectionCode: { $exists: false } },
                      { sectionCode: null },
                      { sectionCode: String(row.sectionCode || "").toUpperCase() },
                    ],
                  })),
                ]
              : []),
          ],
        };
        const shares = await CodingShare.find(shareQuery).lean();
        const active = shares.filter((share) => isShareActive(share));
        if (active.length) {
          const projectIds = active.map((share) => share.project);
          shared = await CodingProject.find({
            _id: { $in: projectIds },
            deletedAt: null,
            ownerUser: { $ne: userId },
          })
            .sort({ updatedAt: -1 })
            .lean();
          const shareByProject = new Map(active.map((share) => [String(share.project), share]));
          const ownerIds = [...new Set(shared.map((row) => String(row.ownerUser)))];
          const owners = await User.find({ _id: { $in: ownerIds } })
            .select("firstName lastName")
            .lean();
          const ownerNameById = new Map(
            owners.map((owner) => [
              String(owner._id),
              `${owner.firstName || ""} ${owner.lastName || ""}`.trim(),
            ]),
          );
          shared = shared
            .filter((row) => shareByProject.has(String(row._id)))
            .map((row) =>
              serializeProject(row, {
                share: shareByProject.get(String(row._id)),
                ownerName: ownerNameById.get(String(row.ownerUser)) || "Teacher",
              }),
            );
        }
      }
    }

    projects = projects.map((row) => serializeProject(row));
    const total = await CodingProject.countDocuments(query);
    res.json({
      projects,
      shared,
      pagination: { limit, skip, total },
    });
  }));

  app.post("/api/coding/projects", ...requireCodingLab(), route(async (req, res) => {
    const userId = String(req.user._id || req.user.id);
    const roles = getUserRoles(req.user);
    const ownerRole = roles.includes("student") ? "student" : "faculty";
    const title = requireString(req.body?.title, "title", { max: 180 });
    const projectType = requireEnum(
      req.body?.projectType || "COMPILER",
      "projectType",
      PROJECT_TYPES,
    );
    const defaultLanguage = requireString(
      req.body?.defaultLanguage || "python",
      "defaultLanguage",
      { max: 40 },
    ).toLowerCase();
    getLanguageMeta(defaultLanguage) ||
      (() => {
        throw validationError(`Unsupported language: ${defaultLanguage}.`);
      })();

    const files = parseFilesInput(req.body?.files);
    if (projectType === "PLAYGROUND" && files.length === 0) {
      files.push(
        { name: "index.html", language: "html", content: "", isMain: true },
        { name: "style.css", language: "css", content: "", isMain: false },
        { name: "script.js", language: "javascript", content: "", isMain: false },
      );
    } else if (files.length === 0) {
      const meta = getLanguageMeta(defaultLanguage);
      files.push({
        name: `main.${meta?.extension || "txt"}`,
        language: defaultLanguage,
        content: "",
        isMain: true,
      });
    }

    /**
     * Optional assignment link: a student opening a coding
     * assignment creates a working project seeded with the
     * starter files. Only the assignment's owner or an
     * enrolled student may link a project to it.
     */
    let linkedAssignment = null;
    if (req.body?.assignmentId) {
      const assignment = await CodingAssignment.findById(
        requireObjectId(req.body.assignmentId, "assignmentId"),
      ).lean();
      if (!assignment) throw notFound("Assignment not found.");
      const requesterId = String(req.user._id || req.user.id);
      const isOwner = String(assignment.facultyUser) === requesterId;
      if (roles.includes("student") && !isOwner) {
        const student = await findStudentByUserId(requesterId);
        const enrolled = student
          ? await Enrollment.findOne({
              student: student._id,
              course: assignment.course,
              status: "ENROLLED",
              ...(assignment.sectionCodes?.length
                ? {
                    sectionCode: {
                      $in: assignment.sectionCodes.map((code) =>
                        String(code).toUpperCase(),
                      ),
                    },
                  }
                : {}),
            }).lean()
          : null;
        if (!enrolled) {
          throw forbidden("You are not enrolled in this assignment's course.");
        }
      } else if (!isOwner) {
        const authorized = await isTeachingAuthorized(req.user, {
          courseId: assignment.course,
          sectionCode: assignment.sectionCodes?.[0],
        });
        if (!authorized) {
          throw forbidden("You cannot link projects to this assignment.");
        }
      }
      linkedAssignment = assignment._id;
    }

    const project = await CodingProject.create({
      ownerUser: userId,
      ownerRole,
      title,
      description: optionalString(req.body?.description, "description", { max: 2000 }) || "",
      projectType,
      defaultLanguage,
      files,
      course: req.body?.courseId ? requireObjectId(req.body.courseId, "courseId") : null,
      sectionCode: optionalString(req.body?.sectionCode, "sectionCode", { max: 20 }) || null,
      assignment: linkedAssignment,
    });
    await logAudit({
      userId,
      action: "coding.project.create",
      module: "coding_lab",
      resource: "CodingProject",
      resourceId: project._id.toString(),
      details: JSON.stringify({ title, projectType }),
    });
    res.status(201).json({ project: serializeProject(project) });
  }));

  app.get("/api/coding/projects/:id", ...requireCodingLab(), route(async (req, res) => {
    const { project, share } = await loadReadableProject(req);
    res.json({ project: serializeProject(project, { share }) });
  }));

  app.patch("/api/coding/projects/:id", ...requireCodingLab(), route(async (req, res) => {
    const project = await assertProjectOwner(req);
    const updates = {};
    if (req.body?.title !== undefined) {
      updates.title = requireString(req.body.title, "title", { max: 180 });
    }
    if (req.body?.description !== undefined) {
      updates.description = optionalString(req.body.description, "description", { max: 2000 }) || "";
    }
    if (req.body?.projectType !== undefined) {
      updates.projectType = requireEnum(req.body.projectType, "projectType", PROJECT_TYPES);
    }
    if (req.body?.defaultLanguage !== undefined) {
      updates.defaultLanguage = requireString(req.body.defaultLanguage, "defaultLanguage", {
        max: 40,
      }).toLowerCase();
      getLanguageMeta(updates.defaultLanguage) ||
        (() => {
          throw validationError(`Unsupported language: ${updates.defaultLanguage}.`);
        })();
    }
    if (req.body?.files !== undefined) {
      updates.files = parseFilesInput(req.body.files);
    }
    if (req.body?.courseId !== undefined) {
      updates.course = req.body.courseId ? requireObjectId(req.body.courseId, "courseId") : null;
    }
    if (req.body?.sectionCode !== undefined) {
      updates.sectionCode = optionalString(req.body.sectionCode, "sectionCode", { max: 20 }) || null;
    }
    const saved = await CodingProject.findByIdAndUpdate(project._id, updates, { returnDocument: 'after' }).lean();
    res.json({ project: serializeProject(saved) });
  }));

  app.delete("/api/coding/projects/:id", ...requireCodingLab(), route(async (req, res) => {
    const project = await assertProjectOwner(req);
    await CodingProject.updateOne({ _id: project._id }, { deletedAt: new Date(), visibility: "PRIVATE" });
    await CodingShare.updateMany({ project: project._id }, { revokedAt: new Date() });
    await logAudit({
      userId: String(req.user._id || req.user.id),
      action: "coding.project.delete",
      module: "coding_lab",
      resource: "CodingProject",
      resourceId: String(project._id),
    });
    res.json({ deleted: true });
  }));

  app.post("/api/coding/projects/:id/duplicate", ...requireCodingLab(), route(async (req, res) => {
    const userId = String(req.user._id || req.user.id);
    const roles = getUserRoles(req.user);
    const source = await CodingProject.findOne({
      _id: requireObjectId(req.params.id, "Project"),
      deletedAt: null,
    }).lean();
    if (!source) throw notFound("Project not found.");

    const isOwner = String(source.ownerUser) === userId;
    let allowed = isOwner;
    if (!allowed && roles.includes("student")) {
      const shares = await findActiveSharesForStudent(userId, source._id);
      allowed = shares.some((share) => share.permission === "COPY");
    }
    if (!allowed) throw notFound("Project not found.");

    const title = optionalString(req.body?.title, "title", { max: 180 }) || `${source.title} (copy)`;
    const copy = await CodingProject.create({
      ownerUser: userId,
      ownerRole: roles.includes("student") ? "student" : "faculty",
      title,
      description: source.description || "",
      projectType: source.projectType,
      defaultLanguage: source.defaultLanguage,
      files: (source.files || []).map((file) => ({ ...file })),
      copiedFrom: source._id,
      assignment: req.body?.assignmentId
        ? requireObjectId(req.body.assignmentId, "assignmentId")
        : null,
    });
    res.status(201).json({ project: serializeProject(copy) });
  }));

  /* ---------------- Sharing ---------------- */

  app.post("/api/coding/projects/:id/share", ...requireTeacher(), route(async (req, res) => {
    const project = await assertProjectOwner(req);
    if (project.ownerRole !== "faculty") {
      throw forbidden("Only teacher-owned projects can be shared.");
    }
    const shareType = requireEnum(req.body?.shareType, "shareType", SHARE_TYPES);
    const permission = optionalEnum(
      req.body?.permission || "VIEW",
      "permission",
      SHARE_PERMISSIONS,
    ) || "VIEW";
    const courseId = req.body?.courseId
      ? requireObjectId(req.body.courseId, "courseId")
      : null;
    const sectionCode = optionalString(req.body?.sectionCode, "sectionCode", { max: 20 })?.toUpperCase() || null;
    const studentIds = (Array.isArray(req.body?.studentIds) ? req.body.studentIds : [])
      .map((id) => requireObjectId(id, "studentId"));
    const expiresInDays =
      req.body?.expiresInDays === undefined ||
      req.body?.expiresInDays === null ||
      req.body?.expiresInDays === ""
        ? null
        : toInt(req.body.expiresInDays, "expiresInDays", { min: 1, max: 365 });

    await assertTeacherMayShareTo(req.user, { shareType, courseId, sectionCode, studentIds });

    const share = await CodingShare.create({
      project: project._id,
      sharedBy: req.user._id,
      shareType,
      course: courseId,
      sectionCode,
      studentUsers: studentIds,
      permission,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null,
    });
    await CodingProject.updateOne({ _id: project._id }, { visibility: "SHARED" });
    await logAudit({
      userId: String(req.user._id || req.user.id),
      action: "coding.project.share",
      module: "coding_lab",
      resource: "CodingShare",
      resourceId: String(share._id),
      details: JSON.stringify({ shareType, courseId, sectionCode, permission, studentCount: studentIds.length }),
    });
    res.status(201).json({
      share: {
        id: String(share._id),
        shareType: share.shareType,
        course: share.course ? String(share.course) : null,
        sectionCode: share.sectionCode,
        studentIds: share.studentUsers.map(String),
        permission: share.permission,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt,
      },
    });
  }));

  app.get("/api/coding/projects/:id/shares", ...requireTeacher(), route(async (req, res) => {
    const project = await assertProjectOwner(req);
    const shares = await CodingShare.find({ project: project._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      shares: shares.map((share) => ({
        id: String(share._id),
        shareType: share.shareType,
        course: share.course ? String(share.course) : null,
        sectionCode: share.sectionCode,
        studentIds: (share.studentUsers || []).map(String),
        permission: share.permission,
        expiresAt: share.expiresAt,
        revokedAt: share.revokedAt,
        createdAt: share.createdAt,
      })),
    });
  }));

  app.delete("/api/coding/shares/:id", ...requireTeacher(), route(async (req, res) => {
    const share = await CodingShare.findById(requireObjectId(req.params.id, "Share")).lean();
    if (!share) throw notFound("Share not found.");
    const project = await CodingProject.findById(share.project).lean();
    if (!project || String(project.ownerUser) !== String(req.user._id || req.user.id)) {
      throw notFound("Share not found.");
    }
    await CodingShare.updateOne({ _id: share._id }, { revokedAt: new Date() });
    const remaining = await CodingShare.countDocuments({
      project: share.project,
      revokedAt: null,
    });
    if (remaining === 0) {
      await CodingProject.updateOne({ _id: share.project }, { visibility: "PRIVATE" });
    }
    await logAudit({
      userId: String(req.user._id || req.user.id),
      action: "coding.share.revoke",
      module: "coding_lab",
      resource: "CodingShare",
      resourceId: String(share._id),
    });
    res.json({ revoked: true });
  }));

  /** "Shared with me" for students, "shared by me" for teachers. */
  app.get("/api/coding/shared", ...requireCodingLab(), route(async (req, res) => {
    const userId = String(req.user._id || req.user.id);
    const roles = getUserRoles(req.user);
    if (roles.includes("student")) {
      const student = await findStudentByUserId(userId);
      if (!student || student.status !== "ACTIVE") {
        return res.json({ projects: [] });
      }
      const enrollments = await Enrollment.find({ student: student._id, status: "ENROLLED" })
        .select("course sectionCode")
        .lean();
      const courseIds = enrollments.map((row) => String(row.course));
      const shares = (
        await CodingShare.find({
          revokedAt: null,
          $or: [
            { shareType: "STUDENTS", studentUsers: req.user._id },
            ...(courseIds.length
              ? [
                  { shareType: "COURSE", course: { $in: courseIds } },
                  ...enrollments.map((row) => ({
                    shareType: "SECTION",
                    course: row.course,
                    $or: [
                      { sectionCode: { $exists: false } },
                      { sectionCode: null },
                      { sectionCode: String(row.sectionCode || "").toUpperCase() },
                    ],
                  })),
                ]
              : []),
          ],
        }).lean()
      ).filter((share) => isShareActive(share));

      const projectIds = shares.map((share) => share.project);
      const projects = projectIds.length
        ? await CodingProject.find({
            _id: { $in: projectIds },
            deletedAt: null,
            ownerUser: { $ne: userId },
          })
            .sort({ updatedAt: -1 })
            .lean()
        : [];
      const shareByProject = new Map(shares.map((share) => [String(share.project), share]));
      res.json({
        projects: projects
          .filter((row) => shareByProject.has(String(row._id)))
          .map((row) =>
            serializeProject(row, { share: shareByProject.get(String(row._id)) }),
          ),
      });
      return;
    }

    const mine = await CodingProject.find({
      ownerUser: userId,
      deletedAt: null,
      visibility: "SHARED",
    })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    const shares = await CodingShare.find({
      project: { $in: mine.map((row) => row._id) },
      revokedAt: null,
    }).lean();
    const activeShareByProject = new Map();
    for (const share of shares) {
      if (isShareActive(share) && !activeShareByProject.has(String(share.project))) {
        activeShareByProject.set(String(share.project), share);
      }
    }
    res.json({
      projects: mine.map((row) =>
        serializeProject(row, { share: activeShareByProject.get(String(row._id)) || null }),
      ),
    });
  }));

  /* ---------------- Teaching / enrolment scope helper ---------------- */

  app.get("/api/coding/courses", ...requireCodingLab(), route(async (req, res) => {
    const userId = String(req.user._id || req.user.id);
    const roles = getUserRoles(req.user);
    if (roles.includes("student")) {
      const student = await findStudentByUserId(userId);
      if (!student) return res.json({ courses: [] });
      const enrollments = await Enrollment.find({ student: student._id, status: "ENROLLED" })
        .populate("course", "code name semester program")
        .lean();
      res.json({
        courses: enrollments
          .filter((row) => row.course)
          .map((row) => ({
            courseId: String(row.course._id),
            code: row.course.code,
            name: row.course.name,
            semester: row.course.semester,
            sectionCode: row.sectionCode,
          })),
      });
      return;
    }
    const scopes = await listTeachingScopes(req.user);
    res.json({
      courses: scopes.map((scope) => ({
        courseId: scope.courseId,
        code: scope.courseCode,
        name: scope.courseName,
        semester: scope.semester,
        sectionCode: scope.sectionCode,
      })),
    });
  }));

  /**
   * Enrolled students of one course, for the teacher share
   * dialog. Scoped to the teacher's authorised courses; a
   * student may only list their own cohort membership.
   */
  app.get(
    "/api/coding/courses/:courseId/students",
    ...requireCodingLab(),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "courseId");
      const userId = String(req.user._id || req.user.id);
      const roles = getUserRoles(req.user);
      const sectionCode = optionalString(
        req.query.section,
        "section",
        { max: 20 },
      )?.toUpperCase();

      if (roles.includes("student")) {
        const student = await findStudentByUserId(userId);
        if (!student) return res.json({ students: [] });
        const rows = await listTargetedStudents({
          courseId,
          sectionCodes: student.section ? [String(student.section).toUpperCase()] : [],
        });
        res.json({
          students: rows.map((row) => ({
            id: row.id,
            userId: row.userId,
            studentId: row.studentId,
            name: row.name,
            program: row.program,
            sectionCode: row.section || null,
          })),
        });
        return;
      }

      const authorized = await isTeachingAuthorized(req.user, {
        courseId,
        sectionCode,
      });
      if (!authorized) {
        throw forbidden("You can only list students in your courses.");
      }
      const rows = await listTargetedStudents({ courseId, sectionCodes: sectionCode ? [sectionCode] : undefined });
      res.json({
        students: rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          studentId: row.studentId,
          name: row.name,
          program: row.program,
          sectionCode: row.section || null,
        })),
      });
    }),
  );

  /* ---------------- Assignments ---------------- */

  app.post("/api/coding/assignments", ...requireTeacher(), route(async (req, res) => {
    const userId = String(req.user._id || req.user.id);
    const courseId = requireObjectId(req.body?.courseId, "courseId");
    const sectionCodes = toStringList(req.body?.sectionCodes, { upper: true, maxItems: 50 });
    const authorized = await isTeachingAuthorized(req.user, {
      courseId,
      sectionCode: sectionCodes[0],
    });
    if (!authorized) {
      throw forbidden("You can only create assignments for courses you teach.");
    }
    const title = requireString(req.body?.title, "title", { max: 180 });
    const dueAt = new Date(
      requireString(req.body?.dueAt, "dueAt", { max: 64 }),
    );
    if (Number.isNaN(dueAt.getTime())) {
      throw validationError("dueAt must be a valid date and time.");
    }
    const allowedLanguages = toStringList(req.body?.allowedLanguages, { maxItems: 20 }).map((id) =>
      id.toLowerCase(),
    );
    for (const languageId of allowedLanguages) {
      getLanguageMeta(languageId) ||
        (() => {
          throw validationError(`Unsupported language: ${languageId}.`);
        })();
    }
    const starterFiles = parseFilesInput(req.body?.starterFiles);

    const assignment = await CodingAssignment.create({
      title,
      description: optionalString(req.body?.description, "description", { max: 4000 }) || "",
      instructions: optionalString(req.body?.instructions, "instructions", { max: 8000 }) || "",
      facultyUser: userId,
      course: courseId,
      sectionCodes,
      semester:
        req.body?.semester === undefined || req.body?.semester === null
          ? null
          : toInt(req.body.semester, "semester", { min: 1, max: 16 }),
      program: optionalString(req.body?.program, "program", { max: 20 })?.toUpperCase() || null,
      academicYear: optionalString(req.body?.academicYear, "academicYear", { max: 20 }),
      allowedLanguages,
      starterFiles,
      exampleInput: optionalString(req.body?.exampleInput, "exampleInput", { max: 8000 }) || "",
      exampleOutput: optionalString(req.body?.exampleOutput, "exampleOutput", { max: 8000 }) || "",
      dueAt,
      maxMarks: toNumber(req.body?.maxMarks, "maxMarks", { min: 0, max: 1000, fallback: 100 }),
      status: optionalEnum(req.body?.status, "status", ["DRAFT", "OPEN", "CLOSED"]) || "OPEN",
      opensAt: req.body?.opensAt ? new Date(requireString(req.body.opensAt, "opensAt", { max: 64 })) : null,
    });
    await logAudit({
      userId,
      action: "coding.assignment.create",
      module: "coding_lab",
      resource: "CodingAssignment",
      resourceId: assignment._id.toString(),
      details: JSON.stringify({ title, courseId }),
    });
    res.status(201).json({ assignment: serializeAssignment(assignment) });
  }));

  app.get("/api/coding/assignments", ...requireCodingLab(), route(async (req, res) => {
    const userId = String(req.user._id || req.user.id);
    const roles = getUserRoles(req.user);
    const { limit, skip } = readPagination(req.query, { defaultLimit: 50, maxLimit: 100 });

    if (roles.includes("student")) {
      const student = await findStudentByUserId(userId);
      if (!student || student.status !== "ACTIVE") {
        return res.json({ assignments: [], pagination: { limit, skip, total: 0 } });
      }
      const enrollments = await Enrollment.find({ student: student._id, status: "ENROLLED" })
        .select("course sectionCode")
        .lean();
      const courseIds = enrollments.map((row) => String(row.course));
      const sectionByCourse = new Map(
        enrollments.map((row) => [String(row.course), String(row.sectionCode || "").toUpperCase()]),
      );
      const assignments = await CodingAssignment.find({
        course: { $in: courseIds },
        status: { $in: ["OPEN", "CLOSED"] },
      })
        .sort({ dueAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      const visible = assignments.filter((assignment) => {
        const codes = assignment.sectionCodes || [];
        if (!codes.length) return true;
        return codes.includes(sectionByCourse.get(String(assignment.course)) || "");
      });
      const now = new Date();
      res.json({
        assignments: visible.map((assignment) => ({
          ...serializeAssignment(assignment),
          isPastDue: assignment.dueAt && new Date(assignment.dueAt) < now,
        })),
        pagination: { limit, skip, total: visible.length },
      });
      return;
    }

    const query = { facultyUser: userId };
    const assignments = await CodingAssignment.find(query)
      .sort({ dueAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await CodingAssignment.countDocuments(query);
    res.json({ assignments: assignments.map(serializeAssignment), pagination: { limit, skip, total } });
  }));

  app.get("/api/coding/assignments/:id", ...requireCodingLab(), route(async (req, res) => {
    const assignment = await loadReadableAssignment(req);
    res.json({ assignment: serializeAssignment(assignment) });
  }));

  app.patch("/api/coding/assignments/:id", ...requireTeacher(), route(async (req, res) => {
    const assignment = await CodingAssignment.findById(
      requireObjectId(req.params.id, "Assignment"),
    ).lean();
    if (!assignment) throw notFound("Assignment not found.");
    if (String(assignment.facultyUser) !== String(req.user._id || req.user.id)) {
      throw forbidden("You can only edit assignments you created.");
    }
    const updates = {};
    if (req.body?.title !== undefined) {
      updates.title = requireString(req.body.title, "title", { max: 180 });
    }
    if (req.body?.description !== undefined) {
      updates.description = optionalString(req.body.description, "description", { max: 4000 }) || "";
    }
    if (req.body?.instructions !== undefined) {
      updates.instructions = optionalString(req.body.instructions, "instructions", { max: 8000 }) || "";
    }
    if (req.body?.sectionCodes !== undefined) {
      updates.sectionCodes = toStringList(req.body.sectionCodes, { upper: true, maxItems: 50 });
    }
    if (req.body?.allowedLanguages !== undefined) {
      const allowed = toStringList(req.body.allowedLanguages, { maxItems: 20 }).map((id) => id.toLowerCase());
      for (const languageId of allowed) {
        getLanguageMeta(languageId) ||
          (() => {
            throw validationError(`Unsupported language: ${languageId}.`);
          })();
      }
      updates.allowedLanguages = allowed;
    }
    if (req.body?.starterFiles !== undefined) {
      updates.starterFiles = parseFilesInput(req.body.starterFiles);
    }
    if (req.body?.exampleInput !== undefined) {
      updates.exampleInput = optionalString(req.body.exampleInput, "exampleInput", { max: 8000 }) || "";
    }
    if (req.body?.exampleOutput !== undefined) {
      updates.exampleOutput = optionalString(req.body.exampleOutput, "exampleOutput", { max: 8000 }) || "";
    }
    if (req.body?.dueAt !== undefined) {
      const dueAt = new Date(requireString(req.body.dueAt, "dueAt", { max: 64 }));
      if (Number.isNaN(dueAt.getTime())) {
        throw validationError("dueAt must be a valid date and time.");
      }
      updates.dueAt = dueAt;
    }
    if (req.body?.maxMarks !== undefined) {
      updates.maxMarks = toNumber(req.body.maxMarks, "maxMarks", { min: 0, max: 1000 });
    }
    if (req.body?.status !== undefined) {
      updates.status = optionalEnum(req.body.status, "status", ["DRAFT", "OPEN", "CLOSED"]);
      if (updates.status === "CLOSED") updates.closedAt = new Date();
    }
    const saved = await CodingAssignment.findByIdAndUpdate(assignment._id, updates, { returnDocument: 'after' }).lean();
    res.json({ assignment: serializeAssignment(saved) });
  }));

  /* ---------------- Submissions ---------------- */

  app.post("/api/coding/assignments/:id/submissions", ...requireCodingLab(), route(async (req, res) => {
    const userId = String(req.user._id || req.user.id);
    const roles = getUserRoles(req.user);
    if (!roles.includes("student")) {
      throw forbidden("Only students submit coding assignments.");
    }
    const assignment = await CodingAssignment.findById(
      requireObjectId(req.params.id, "Assignment"),
    ).lean();
    if (!assignment || assignment.status !== "OPEN") {
      throw notFound("Assignment not found.");
    }
    const student = await findStudentByUserId(userId);
    if (!student || student.status !== "ACTIVE") {
      throw forbidden("Only enrolled students with active accounts can submit.");
    }
    const enrollment = await Enrollment.findOne({
      student: student._id,
      course: assignment.course,
      status: "ENROLLED",
      ...(assignment.sectionCodes?.length
        ? { sectionCode: { $in: assignment.sectionCodes.map((code) => String(code).toUpperCase()) } }
        : {}),
    }).lean();
    if (!enrollment) {
      throw forbidden("You are not enrolled in this assignment's course and section.");
    }
    if (assignment.opensAt && new Date(assignment.opensAt) > new Date()) {
      throw forbidden("This assignment is not open yet.");
    }

    const language = requireString(req.body?.language, "language", { max: 40 }).toLowerCase();
    if (assignment.allowedLanguages?.length && !assignment.allowedLanguages.includes(language)) {
      throw validationError(
        `This assignment accepts: ${assignment.allowedLanguages.join(", ")}.`,
      );
    }
    await assertLanguageAvailable(language);
    const files = parseFilesInput(req.body?.files);
    if (!files.length) {
      throw validationError("Attach at least one source file.");
    }

    const dueAt = new Date(assignment.dueAt);
    const now = new Date();
    const isLate = now > dueAt;

    const lastExecution = await resolveExecutionSnapshot(req.user, req.body?.executionId);

    const submission = await CodingSubmission.findOneAndUpdate(
      { assignment: assignment._id, studentUser: userId },
      {
        $set: {
          language,
          files,
          status: "SUBMITTED",
          isLate,
          lastExecution,
        },
        $setOnInsert: { submittedAt: now },
        $inc: { version: 1 },
      },
      { returnDocument: 'after', upsert: true },
    );
    res.status(201).json({ submission: serializeSubmission(submission) });
  }));

  app.get("/api/coding/assignments/:id/submissions", ...requireCodingLab(), route(async (req, res) => {
    const assignment = await loadReadableAssignment(req);
    const userId = String(req.user._id || req.user.id);
    const roles = getUserRoles(req.user);
    const { limit, skip } = readPagination(req.query, { defaultLimit: 100, maxLimit: 200 });

    if (roles.includes("student")) {
      const submission = await CodingSubmission.findOne({
        assignment: assignment._id,
        studentUser: userId,
      })
        .sort({ submittedAt: -1 })
        .lean();
      res.json({ submissions: submission ? [serializeSubmission(submission)] : [] });
      return;
    }

    const isOwner = String(assignment.facultyUser) === userId;
    const authorized =
      isOwner ||
      (await isTeachingAuthorized(req.user, {
        courseId: assignment.course,
        sectionCode: assignment.sectionCodes?.[0],
      }));
    if (!authorized) throw forbidden("You can only review submissions for your own assignments.");

    const submissions = await CodingSubmission.find({ assignment: assignment._id })
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const studentIds = [...new Set(submissions.map((row) => String(row.studentUser)))];
    const users = await User.find({ _id: { $in: studentIds } }).select("firstName lastName email").lean();
    const students = await Student.find({ user: { $in: studentIds } })
      .select("studentId user firstName lastName")
      .lean();
    const nameByUser = new Map(
      users.map((user) => [String(user._id), `${user.firstName || ""} ${user.lastName || ""}`.trim()]),
    );
    const studentByUser = new Map(students.map((row) => [String(row.user), row]));
    res.json({
      submissions: submissions.map((row) => ({
        ...serializeSubmission(row),
        studentName: nameByUser.get(String(row.studentUser)) || "Student",
        studentId: studentByUser.get(String(row.studentUser))?.studentId || null,
      })),
    });
  }));

  app.patch("/api/coding/submissions/:id", ...requireTeacher(), route(async (req, res) => {
    const submission = await CodingSubmission.findById(
      requireObjectId(req.params.id, "Submission"),
    ).lean();
    if (!submission) throw notFound("Submission not found.");
    const assignment = await CodingAssignment.findById(submission.assignment).lean();
    if (!assignment) throw notFound("Assignment not found.");
    const isOwner = String(assignment.facultyUser) === String(req.user._id || req.user.id);
    const authorized =
      isOwner ||
      (await isTeachingAuthorized(req.user, {
        courseId: assignment.course,
        sectionCode: assignment.sectionCodes?.[0],
      }));
    if (!authorized) throw forbidden("You can only grade submissions for your own assignments.");

    const updates = {};
    if (req.body?.feedback !== undefined) {
      updates.feedback = optionalString(req.body.feedback, "feedback", { max: 4000 }) || "";
    }
    if (req.body?.marks !== undefined) {
      updates.marks = toNumber(req.body.marks, "marks", {
        min: 0,
        max: Number(assignment.maxMarks || 100),
      });
    }
    if (Object.keys(updates).length === 0) {
      throw validationError("Provide feedback or marks.");
    }
updates.gradedBy = req.user._id;
    updates.gradedAt = new Date();
    updates.status = "GRADED";
    const saved = await CodingSubmission.findByIdAndUpdate(submission._id, updates, { returnDocument: 'after' }).lean();
    res.json({ submission: serializeSubmission(saved) });
  }));

  /* ---------------- Drafts ---------------- */

  app.get("/api/coding/assignments/:id/draft", ...requireCodingLab(), route(async (req, res) => {
    const userId = String(req.user._id || req.user.id);
    const roles = getUserRoles(req.user);
    if (!roles.includes("student")) {
      throw forbidden("Only students can access drafts.");
    }
    const assignment = await loadReadableAssignment(req);
    const student = await findStudentByUserId(userId);
    if (!student || student.status !== "ACTIVE") {
      throw forbidden("Only enrolled students with active accounts can access drafts.");
    }
    const enrollment = await Enrollment.findOne({
      student: student._id,
      course: assignment.course,
      status: "ENROLLED",
      ...(assignment.sectionCodes?.length
        ? { sectionCode: { $in: assignment.sectionCodes.map((code) => String(code).toUpperCase()) } }
        : {}),
    }).lean();
    if (!enrollment) {
      throw forbidden("You are not enrolled in this assignment's course and section.");
    }

    const draft = await CodingDraft.findOne({
      assignment: assignment._id,
      studentUser: userId,
    }).lean();

    if (!draft) {
      return res.json({ draft: null });
    }

    res.json({
      draft: {
        id: String(draft._id),
        assignment: String(draft.assignment),
        studentUser: String(draft.studentUser),
        language: draft.language,
        files: (draft.files || []).map((file) => ({
          name: file.name,
          language: file.language,
          content: file.content,
          isMain: Boolean(file.isMain),
        })),
        lastSavedAt: draft.lastSavedAt,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      },
    });
  }));

  app.post("/api/coding/assignments/:id/draft", ...requireCodingLab(), route(async (req, res) => {
    const userId = String(req.user._id || req.user.id);
    const roles = getUserRoles(req.user);
    if (!roles.includes("student")) {
      throw forbidden("Only students can save drafts.");
    }
    const assignment = await CodingAssignment.findById(
      requireObjectId(req.params.id, "Assignment"),
    ).lean();
    if (!assignment || assignment.status !== "OPEN") {
      throw notFound("Assignment not found.");
    }
    const student = await findStudentByUserId(userId);
    if (!student || student.status !== "ACTIVE") {
      throw forbidden("Only enrolled students with active accounts can save drafts.");
    }
    const enrollment = await Enrollment.findOne({
      student: student._id,
      course: assignment.course,
      status: "ENROLLED",
      ...(assignment.sectionCodes?.length
        ? { sectionCode: { $in: assignment.sectionCodes.map((code) => String(code).toUpperCase()) } }
        : {}),
    }).lean();
    if (!enrollment) {
      throw forbidden("You are not enrolled in this assignment's course and section.");
    }
    if (assignment.opensAt && new Date(assignment.opensAt) > new Date()) {
      throw forbidden("This assignment is not open yet.");
    }

    const language = requireString(req.body?.language, "language", { max: 40 }).toLowerCase();
    if (assignment.allowedLanguages?.length && !assignment.allowedLanguages.includes(language)) {
      throw validationError(
        `This assignment accepts: ${assignment.allowedLanguages.join(", ")}.`,
      );
    }
    await assertLanguageAvailable(language);
    const files = parseFilesInput(req.body?.files);
    if (!files.length) {
      throw validationError("Attach at least one source file.");
    }

    const draft = await CodingDraft.findOneAndUpdate(
      { assignment: assignment._id, studentUser: userId },
      {
        $set: {
          language,
          files,
          lastSavedAt: new Date(),
        },
      },
      { returnDocument: 'after', upsert: true },
    );

    res.json({
      draft: {
        id: String(draft._id),
        assignment: String(draft.assignment),
        studentUser: String(draft.studentUser),
        language: draft.language,
        files: (draft.files || []).map((file) => ({
          name: file.name,
          language: file.language,
          content: file.content,
          isMain: Boolean(file.isMain),
        })),
        lastSavedAt: draft.lastSavedAt,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      },
    });
  }));

}

/* ------------------------------------------------------------------ */
/* Shared serializers / helpers                                        */
/* ------------------------------------------------------------------ */

function serializeAssignment(assignment) {
  return {
    id: String(assignment._id),
    title: assignment.title,
    description: assignment.description || "",
    instructions: assignment.instructions || "",
    course: String(assignment.course),
    sectionCodes: assignment.sectionCodes || [],
    semester: assignment.semester ?? null,
    program: assignment.program || null,
    academicYear: assignment.academicYear || null,
    allowedLanguages: assignment.allowedLanguages || [],
    starterFiles: (assignment.starterFiles || []).map((file) => ({
      name: file.name,
      language: file.language,
      content: file.content,
      isMain: Boolean(file.isMain),
    })),
    exampleInput: assignment.exampleInput || "",
    exampleOutput: assignment.exampleOutput || "",
    testCases: (assignment.testCases || []).map((testCase) => ({
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      isHidden: Boolean(testCase.isHidden),
    })),
    opensAt: assignment.opensAt || null,
    dueAt: assignment.dueAt,
    maxMarks: assignment.maxMarks,
    status: assignment.status,
    facultyUser: String(assignment.facultyUser),
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}

function serializeSubmission(submission) {
  return {
    id: String(submission._id),
    assignment: String(submission.assignment),
    studentUser: String(submission.studentUser),
    language: submission.language,
    files: (submission.files || []).map((file) => ({
      name: file.name,
      language: file.language,
      content: file.content,
    })),
    status: submission.status,
    submittedAt: submission.submittedAt,
    isLate: Boolean(submission.isLate),
    version: submission.version,
    lastExecution: submission.lastExecution || null,
    feedback: submission.feedback || "",
    marks: submission.marks ?? null,
    gradedBy: submission.gradedBy ? String(submission.gradedBy) : null,
    gradedAt: submission.gradedAt || null,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}

async function loadReadableAssignment(req) {
  const userId = String(req.user._id || req.user.id);
  const roles = getUserRoles(req.user);
  const assignment = await CodingAssignment.findById(
    requireObjectId(req.params.id, "Assignment"),
  ).lean();
  if (!assignment) throw notFound("Assignment not found.");

  if (roles.includes("faculty")) {
    const isOwner = String(assignment.facultyUser) === userId;
    const authorized =
      isOwner ||
      (await isTeachingAuthorized(req.user, {
        courseId: assignment.course,
        sectionCode: assignment.sectionCodes?.[0],
      }));
    if (authorized) return assignment;
    throw notFound("Assignment not found.");
  }

  const student = await findStudentByUserId(userId);
  if (!student || student.status !== "ACTIVE") throw notFound("Assignment not found.");
  const enrollment = await Enrollment.findOne({
    student: student._id,
    course: assignment.course,
    status: "ENROLLED",
    ...(assignment.sectionCodes?.length
      ? { sectionCode: { $in: assignment.sectionCodes.map((code) => String(code).toUpperCase()) } }
      : {}),
  }).lean();
  if (!enrollment) throw notFound("Assignment not found.");
  if (assignment.status === "DRAFT") throw notFound("Assignment not found.");
  return assignment;
}

/** Copies an execution snapshot owned by the caller onto a submission. */
async function resolveExecutionSnapshot(user, executionId) {
  if (!executionId) return null;
  const record = await CodingExecution.findById(
    requireObjectId(executionId, "executionId"),
  ).lean();
  if (!record || String(record.user) !== String(user._id || user.id)) {
    throw badRequest("The referenced execution does not belong to you.");
  }
  return {
    status: record.status,
    description: record.description,
    stdout: record.stdout,
    stderr: record.stderr,
    compileOutput: record.compileOutput,
    exitCode: record.exitCode,
    durationMs: record.durationMs,
    memoryKb: record.memoryKb,
    executedAt: record.createdAt,
  };
}
