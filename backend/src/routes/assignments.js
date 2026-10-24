import path from "node:path";
import {
  Assignment,
  Submission,
  StoredFile,
  Course,
  CourseTeachingAssignment,
  describeAudience,
  Section,
} from "../models/index.js";
import { logAudit, getUserRoles } from "../db.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { route, notFound, forbidden, conflict, validationError } from "../utils/apiError.js";
import {
  requireString,
  optionalString,
  optionalEnum,
  toInt,
  toNumber,
  toStringList,
  requireDate,
  requireObjectId,
  readPagination,
} from "../utils/validate.js";
import {
  getAudienceContext,
  audienceMatchesStudent,
  buildAudienceVisibilityQuery,
  isTeachingAuthorized,
  listTargetedStudents,
  resolveScopedAudience,
} from "../services/accessControl.js";
import {
  createUploader,
  runFileUpload,
  verifyStoredFile,
  persistStoredFile,
  deleteStoredFile,
  FILE_POLICIES,
  formatBytes,
  isSubmissionExtensionAllowed,
} from "../services/fileStorage.js";
import {
  getSimilarityConfiguration,
  runSimilarityCheck,
} from "../services/similarityService.js";

const submissionUploader = createUploader("assignment_submission", { field: "file" });

const DEFAULT_ACADEMIC_YEAR =
  process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR || "2025/2026";

/**
 * Assignments — the LMS workflow.
 *
 * One set of endpoints covers the whole academic loop: a teacher writes a brief
 * for an authorised course and a target cohort, a student uploads a submission
 * under the assignment's own file rules, and the teacher grades it in place. A
 * grade is stored on the submission it belongs to, so a mark can never exist
 * without its submission, and a student can only ever reach their own work.
 */
export function registerAssignmentRoutes(app) {
  /**
   * Assignment list.
   *
   * Students see assignments targeted at their cohort; teachers see the
   * assignments they authored plus the ones for courses they teach; staff with
   * the permission see everything. The scope is derived from the session user.
   */
  app.get(
    "/api/assignments",
    requireAuth,
    route(async (req, res) => {
      const context = await getAudienceContext(req.user);
      const filter = {};

      // Scope: curriculum staff see everything; a teacher sees their own
      // assignments plus the courses they teach; a student sees only what is
      // targeted at their cohort.
      if (!hasCurriculumScope(req.user)) {
        const clauses = [{ facultyUser: context.userId }];
        if (context.isStaff) {
          const teaching = await CourseTeachingAssignment.find({ facultyUser: context.userId })
            .select("course")
            .lean();
          const courseIds = teaching.map((row) => String(row.course));
          if (courseIds.length) clauses.push({ course: { $in: courseIds } });
        } else {
          clauses.push(buildAudienceVisibilityQuery(context));
        }
        filter.$or = clauses;
      }

      const courseId = optionalString(req.query.courseId, "Course", { max: 40 });
      if (courseId) filter.course = requireObjectId(courseId, "Course");
      const status = optionalEnum(req.query.status, "Status", ["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "ARCHIVED"], {
        upper: true,
      });
      if (status) filter.status = status;
      else filter.status = { $ne: "ARCHIVED" };

      const academicYear = optionalString(req.query.academicYear, "Academic year", { max: 20 });
      if (academicYear) filter.academicYear = academicYear;
      const semester = req.query.semester ? toInt(req.query.semester, "Semester", { min: 1, max: 12 }) : null;
      if (semester) filter.semester = semester;
      const section = optionalString(req.query.section, "Section", { max: 10 });
      if (section) filter.sectionCodes = section.toUpperCase();
      const search = optionalString(req.query.q, "Search", { max: 120 });
      if (search) {
        const pattern = new RegExp(escapeRegExp(search), "i");
        filter.title = pattern;
      }

      const { limit, page, skip } = readPagination(req.query, { defaultLimit: 25 });
      const [assignments, total] = await Promise.all([
        Assignment.find(filter)
          .populate("course", "code name")
          .populate("facultyUser", "firstName lastName")
          .sort({ dueAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Assignment.countDocuments(filter),
      ]);

      const assignmentIds = assignments.map((assignment) => assignment._id);
      const submissionStats = assignmentIds.length
        ? await Submission.aggregate([
            { $match: { assignment: { $in: assignmentIds } } },
            {
              $group: {
                _id: "$assignment",
                total: { $sum: 1 },
                submitted: {
                  $sum: { $cond: [{ $in: ["$status", ["SUBMITTED", "LATE", "GRADED", "RETURNED"]] }, 1, 0] },
                },
                graded: { $sum: { $cond: [{ $eq: ["$status", "GRADED"] }, 1, 0] } },
                late: { $sum: { $cond: [{ $eq: ["$isLate", true] }, 1, 0] } },
                marksTotal: { $sum: { $ifNull: ["$marks", 0] } },
                marksCount: { $sum: { $cond: [{ $ne: ["$marks", null] }, 1, 0] } },
              },
            },
          ])
        : [];
      const statsMap = new Map(
        submissionStats.map((row) => [String(row._id), row]),
      );

      res.json({
        assignments: assignments.map((assignment) =>
          serialiseAssignment(assignment, statsMap.get(String(assignment._id))),
        ),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      });
    }),
  );

  app.get(
    "/api/assignments/similarity-configuration",
    requireAuth,
    route(async (req, res) => {
      res.json({ similarity: getSimilarityConfiguration() });
    }),
  );

  app.get(
    "/api/assignments/:id",
    requireAuth,
    route(async (req, res) => {
      const context = await getAudienceContext(req.user);
      const assignment = await loadAssignment(req.params.id);
      const isOwner = String(assignment.facultyUser) === String(context.userId);
      const teachesCourse = await isTeachingAuthorized(req.user, {
        courseId: assignment.course?._id,
        sectionCode: assignment.sectionCodes?.[0],
        semester: assignment.semester,
      });

      if (!isOwner && !teachesCourse && !hasCurriculumScope(req.user)) {
        if (!audienceMatchesStudent(assignment.audience, context)) {
          throw notFound("Assignment not found.");
        }
      }

      const payload = serialiseAssignment(assignment);
      const similarity = getSimilarityConfiguration();

      if (isOwner || teachesCourse || hasCurriculumScope(req.user)) {
        const targeted = await listTargetedStudents({
          courseId: assignment.course?._id,
          sectionCodes: assignment.sectionCodes?.length ? assignment.sectionCodes : null,
          semester: assignment.semester,
        });
        const submissions = await Submission.find({ assignment: assignment._id })
          .sort({ submittedAt: 1 })
          .lean();
        const byStudent = new Map(
          submissions.map((row) => [String(row.student), row]),
        );

        payload.roster = targeted.map((student) => {
          const submission = byStudent.get(student.id);
          return {
            studentId: student.studentId,
            name: student.name,
            section: student.section,
            submissionId: submission ? String(submission._id) : null,
            status: submission ? submission.status : "NOT_SUBMITTED",
            isLate: submission ? submission.isLate : false,
            submittedAt: submission?.submittedAt || null,
            marks: submission?.marks ?? null,
            similarityStatus: submission?.similarity?.status || "NOT_CHECKED",
            similarityPercentage: submission?.similarity?.percentage ?? null,
          };
        });
        payload.submissions = submissions.map(serialiseSubmissionForTeacher);
        payload.stats = buildRosterStats(targeted.length, submissions);
        payload.canManage = true;
      } else {
        const student = context.student;
        const submission = student
          ? await Submission.findOne({ assignment: assignment._id, student: student.id }).lean()
          : null;
        payload.mySubmission = submission ? serialiseSubmissionForStudent(submission) : null;
        payload.canManage = false;
        payload.stats = null;
      }

      payload.similarity = similarity;
      res.json({ assignment: payload });
    }),
  );

  app.get(
    "/api/assignments/:id/submissions/mine",
    requireAuth,
    route(async (req, res) => {
      const context = await getAudienceContext(req.user);
      if (!context.student) throw forbidden("Only student accounts can submit work.");
      const assignment = await loadAssignment(req.params.id);
      if (!audienceMatchesStudent(assignment.audience, context)) {
        throw notFound("Assignment not found.");
      }
      const submission = await Submission.findOne({
        assignment: assignment._id,
        student: context.student.id,
      }).lean();
      res.json({
        submission: submission ? serialiseSubmissionForStudent(submission) : null,
        assignment: serialiseAssignment(assignment),
      });
    }),
  );

  app.post(
    "/api/assignments",
    requireAuth,
    requirePermission("assignments.create"),
    route(async (req, res) => {
      const body = req.body || {};
      const courseId = requireObjectId(body.courseId, "Course");
      const course = await Course.findById(courseId).select("_id code status semester academicYear");
      if (!course) throw notFound("Course not found.");
      if (course.status === "ARCHIVED") {
        throw conflict("Assignments cannot be created for an archived course.");
      }

      const sectionCodes = toStringList(body.sectionCodes, { upper: true, maxItems: 40 });
      const semester = body.semester ? toInt(body.semester, "Semester", { min: 1, max: 12 }) : course.semester || 1;

      // A teacher may only assign a course they are authorised to teach.
      const authorised = await isTeachingAuthorized(req.user, {
        courseId,
        sectionCode: sectionCodes[0],
        semester,
      });
      if (!authorised) {
        throw forbidden(
          "You are not authorised to assign work for this course and section.",
        );
      }

      const audience = resolveScopedAudience(body, {
        course,
        sectionCodes,
        semester,
        batch: optionalString(body.batch, "Batch", { max: 20 }),
      });
      const opensAt = body.opensAt ? requireDate(body.opensAt, "Open date") : null;
      const dueAt = body.dueAt ? requireDate(body.dueAt, "Due date") : null;
      const requestedStatus = optionalEnum(body.status, "Status", ["DRAFT", "SCHEDULED", "OPEN"], { upper: true }) || "OPEN";
      if (requestedStatus !== "DRAFT") {
        if (!dueAt) {
          throw validationError("A due date and time are required before publishing this assignment.", [
            { field: "dueAt", message: "Set a due date and time before publishing." },
          ]);
        }
        if (opensAt && dueAt < opensAt) {
          throw validationError("The due date must be on or after the open date.", [
            { field: "dueAt", message: "Choose a later due date." },
          ]);
        }
      }

      const allowedFileTypes = toStringList(body.allowedFileTypes, { maxItems: 10 }).map(
        (value) => value.replace(/^\./, "").toLowerCase(),
      );
      const policyExtensions = FILE_POLICIES.assignment_submission.extensions;
      const unsupported = allowedFileTypes.filter((type) => !policyExtensions.includes(type));
      if (unsupported.length) {
        throw validationError(
          `These file types cannot be accepted for submissions: ${unsupported.join(", ").toUpperCase()}.`,
          [{ field: "allowedFileTypes", message: `Allowed: ${policyExtensions.join(", ").toUpperCase()}.` }],
        );
      }

      const assignment = await Assignment.create({
        title: requireString(body.title, "Title", { max: 180 }),
        description: optionalString(body.description, "Description", { max: 4000 }) || "",
        instructions: optionalString(body.instructions, "Instructions", { max: 8000 }) || "",
        course: courseId,
        facultyUser: req.user._id || req.user.id,
        assignmentType: optionalEnum(body.assignmentType, "Assignment type", [
          "ESSAY",
          "PROJECT",
          "REPORT",
          "PRESENTATION",
          "PRACTICAL",
          "PROBLEM_SET",
          "OTHER",
        ], { upper: true }) || "ESSAY",
        opensAt,
        dueAt,
        maxMarks: toNumber(body.maxMarks ?? 100, "Maximum marks", { min: 0, max: 1000 }),
        allowedFileTypes: allowedFileTypes.length ? allowedFileTypes : policyExtensions,
        maxFileSizeMb: toInt(body.maxFileSizeMb ?? 10, "Maximum file size", { min: 1, max: 25 }),
        attemptPolicy: optionalEnum(body.attemptPolicy, "Attempt policy", ["SINGLE", "MULTIPLE"], {
          upper: true,
        }) || "MULTIPLE",
        allowReplacement: body.allowReplacement === undefined ? true : Boolean(body.allowReplacement),
        similarityCheckEnabled: Boolean(body.similarityCheckEnabled),
        audience,
        academicYear: optionalString(body.academicYear, "Academic year", { max: 20 }) ||
          course.academicYear ||
          DEFAULT_ACADEMIC_YEAR,
        program: audience.target.programCodes?.[0] || course.program || null,
        batch: audience.target.batchYears?.[0] || null,
        semester,
        sectionCodes: audience.target.sectionCodes || [],
        status: requestedStatus,
      });

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "ASSIGNMENT_CREATED",
        module: "assignments",
        resource: "assignment",
        resourceId: assignment._id.toString(),
        newValue: {
          title: assignment.title,
          course: course.code,
          dueAt: assignment.dueAt,
          audience: describeAudience(assignment.audience),
          maxMarks: assignment.maxMarks,
        },
        details: `Assignment "${assignment.title}" created for ${course.code} (${describeAudience(assignment.audience)}).`,
      });

      res.status(201).json({ assignment: serialiseAssignment(assignment.toObject()) });
    }),
  );

  app.patch(
    "/api/assignments/:id",
    requireAuth,
    requirePermission("assignments.update"),
    route(async (req, res) => {
      const assignment = await Assignment.findById(requireObjectId(req.params.id, "Assignment"));
      if (!assignment) throw notFound("Assignment not found.");
      await assertCanManageAssignment(req, assignment);

      const body = req.body || {};
      const before = {
        title: assignment.title,
        dueAt: assignment.dueAt,
        maxMarks: assignment.maxMarks,
        status: assignment.status,
        audience: describeAudience(assignment.audience),
      };

      if (body.title !== undefined) assignment.title = requireString(body.title, "Title", { max: 180 });
      if (body.description !== undefined) {
        assignment.description = optionalString(body.description, "Description", { max: 4000 }) || "";
      }
      if (body.instructions !== undefined) {
        assignment.instructions = optionalString(body.instructions, "Instructions", { max: 8000 }) || "";
      }
      if (body.assignmentType !== undefined) {
        assignment.assignmentType = requireEnumValue(body.assignmentType, "Assignment type", [
          "ESSAY",
          "PROJECT",
          "REPORT",
          "PRESENTATION",
          "PRACTICAL",
          "PROBLEM_SET",
          "OTHER",
        ]);
      }
      if (body.opensAt !== undefined) {
        assignment.opensAt = body.opensAt ? requireDate(body.opensAt, "Open date") : null;
      }
      if (body.dueAt !== undefined) assignment.dueAt = requireDate(body.dueAt, "Due date");
      if (assignment.opensAt && assignment.dueAt < assignment.opensAt) {
        throw validationError("The due date must be on or after the open date.", [
          { field: "dueAt", message: "Choose a later due date." },
        ]);
      }
      if (body.maxMarks !== undefined) {
        assignment.maxMarks = toNumber(body.maxMarks, "Maximum marks", { min: 0, max: 1000 });
      }
      if (body.allowedFileTypes !== undefined) {
        const allowed = toStringList(body.allowedFileTypes, { maxItems: 10 }).map((value) =>
          value.replace(/^\./, "").toLowerCase(),
        );
        const policyExtensions = FILE_POLICIES.assignment_submission.extensions;
        const unsupported = allowed.filter((type) => !policyExtensions.includes(type));
        if (unsupported.length) {
          throw validationError(
            `These file types cannot be accepted for submissions: ${unsupported.join(", ").toUpperCase()}.`,
            [{ field: "allowedFileTypes", message: `Allowed: ${policyExtensions.join(", ").toUpperCase()}.` }],
          );
        }
        assignment.allowedFileTypes = allowed.length ? allowed : policyExtensions;
      }
      if (body.maxFileSizeMb !== undefined) {
        assignment.maxFileSizeMb = toInt(body.maxFileSizeMb, "Maximum file size", { min: 1, max: 25 });
      }
      if (body.attemptPolicy !== undefined) {
        assignment.attemptPolicy = requireEnumValue(body.attemptPolicy, "Attempt policy", [
          "SINGLE",
          "MULTIPLE",
        ]);
      }
      if (body.allowReplacement !== undefined) assignment.allowReplacement = Boolean(body.allowReplacement);
      if (body.similarityCheckEnabled !== undefined) {
        assignment.similarityCheckEnabled = Boolean(body.similarityCheckEnabled);
      }
      if (body.audience !== undefined || body.targetType !== undefined || body.sectionCodes !== undefined) {
        const audience = resolveScopedAudience(body, {
          course: { program: assignment.program, batch: assignment.batch },
          sectionCodes: toStringList(body.sectionCodes, { upper: true, maxItems: 40 }),
          semester: assignment.semester,
        });
        assignment.audience = audience;
        assignment.sectionCodes = audience.target.sectionCodes || [];
        assignment.batch = audience.target.batchYears?.[0] ?? assignment.batch;
        assignment.program = audience.target.programCodes?.[0] ?? assignment.program;
      }
      if (body.status !== undefined) {
        const status = requireEnumValue(body.status, "Status", ["DRAFT", "SCHEDULED", "OPEN", "CLOSED"]);
        if (status !== "DRAFT" && !assignment.dueAt) {
          throw validationError("A due date and time are required before publishing this assignment.", [
            { field: "dueAt", message: "Set a due date and time before publishing." },
          ]);
        }
        assignment.status = status;
        if (status === "CLOSED") {
          assignment.closedAt = new Date();
          assignment.closedBy = req.user._id || req.user.id;
        }
      }

      assignment.updatedBy = req.user._id || req.user.id;
      await assignment.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "ASSIGNMENT_UPDATED",
        module: "assignments",
        resource: "assignment",
        resourceId: assignment._id.toString(),
        oldValue: before,
        newValue: {
          title: assignment.title,
          dueAt: assignment.dueAt,
          maxMarks: assignment.maxMarks,
          status: assignment.status,
          audience: describeAudience(assignment.audience),
        },
        details: `Assignment "${assignment.title}" updated.`,
      });

      res.json({ assignment: serialiseAssignment(assignment.toObject()) });
    }),
  );

  /** Closes an assignment so no further submissions are accepted. */
  app.post(
    "/api/assignments/:id/close",
    requireAuth,
    requirePermission("assignments.update"),
    route(async (req, res) => {
      const assignment = await Assignment.findById(requireObjectId(req.params.id, "Assignment"));
      if (!assignment) throw notFound("Assignment not found.");
      await assertCanManageAssignment(req, assignment);

      assignment.status = "CLOSED";
      assignment.closedAt = new Date();
      assignment.closedBy = req.user._id || req.user.id;
      await assignment.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "ASSIGNMENT_CLOSED",
        module: "assignments",
        resource: "assignment",
        resourceId: assignment._id.toString(),
        oldValue: { status: "OPEN" },
        newValue: { status: "CLOSED" },
        details: `Assignment "${assignment.title}" closed to new submissions.`,
      });

      res.json({ success: true, assignment: serialiseAssignment(assignment.toObject()) });
    }),
  );

  app.post(
    "/api/assignments/:id/reopen",
    requireAuth,
    requirePermission("assignments.update"),
    route(async (req, res) => {
      const assignment = await Assignment.findById(requireObjectId(req.params.id, "Assignment"));
      if (!assignment) throw notFound("Assignment not found.");
      await assertCanManageAssignment(req, assignment);

      assignment.status = "OPEN";
      assignment.closedAt = null;
      assignment.closedBy = null;
      await assignment.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "ASSIGNMENT_REOPENED",
        module: "assignments",
        resource: "assignment",
        resourceId: assignment._id.toString(),
        details: `Assignment "${assignment.title}" reopened.`,
      });

      res.json({ success: true, assignment: serialiseAssignment(assignment.toObject()) });
    }),
  );

  app.delete(
    "/api/assignments/:id",
    requireAuth,
    requirePermission("assignments.delete"),
    route(async (req, res) => {
      const assignment = await Assignment.findById(requireObjectId(req.params.id, "Assignment"));
      if (!assignment) throw notFound("Assignment not found.");
      await assertCanManageAssignment(req, assignment);

      const submissionCount = await Submission.countDocuments({ assignment: assignment._id });

      if (String(req.query.mode || "").toLowerCase() === "purge" && submissionCount === 0) {
        await assignment.deleteOne();
        await logAudit({
          userId: req.user._id || req.user.id,
          action: "ASSIGNMENT_DELETED",
          module: "assignments",
          resource: "assignment",
          resourceId: assignment._id.toString(),
          details: `Assignment "${assignment.title}" deleted; it had no submissions.`,
        });
        res.json({ success: true, mode: "purged" });
        return;
      }

      assignment.status = "ARCHIVED";
      assignment.archivedAt = new Date();
      assignment.archivedBy = req.user._id || req.user.id;
      await assignment.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "ASSIGNMENT_ARCHIVED",
        module: "assignments",
        resource: "assignment",
        resourceId: assignment._id.toString(),
        details: `Assignment "${assignment.title}" archived with ${submissionCount} submission(s) retained.`,
        metadata: { submissions: submissionCount },
      });

      res.json({
        success: true,
        mode: "archived",
        submissionsRetained: submissionCount,
        assignment: serialiseAssignment(assignment.toObject()),
      });
    }),
  );

  /**
   * Student submission.
   *
   * The student is always derived from the session, never from the request, so
   * changing an identifier in the payload cannot submit work as somebody else.
   */
  app.post(
    "/api/assignments/:id/submissions",
    requireAuth,
    (req, res, next) => {
      runFileUpload(
        req,
        res,
        submissionUploader,
        async (uploadError, file) => {
          try {
            const context = await getAudienceContext(req.user);
            if (!context.student) throw forbidden("Only student accounts can submit work.");

            const assignment = await loadAssignment(req.params.id);
            if (!audienceMatchesStudent(assignment.audience, context)) {
              throw notFound("Assignment not found.");
            }
            if (assignment.status !== "OPEN") {
              throw conflict(
                assignment.status === "CLOSED"
                  ? "This assignment is closed and no longer accepts submissions."
                  : "This assignment is not open for submissions yet.",
              );
            }
            if (assignment.opensAt && new Date() < assignment.opensAt) {
              throw conflict("This assignment has not opened yet.");
            }

            const extension = path.extname(file.originalname || "").replace(/^\./, "").toLowerCase();
            if (!isSubmissionExtensionAllowed(assignment.allowedFileTypes, extension)) {
              throw validationError(
                `This assignment accepts ${assignment.allowedFileTypes.map((type) => type.toUpperCase()).join(", ")} files only.`,
                [{ field: "file", message: "Choose an accepted file type." }],
              );
            }
            const maxBytes = Math.min(
              assignment.maxFileSizeMb * 1024 * 1024,
              FILE_POLICIES.assignment_submission.maxBytes,
            );
            if (file.size > maxBytes) {
              throw validationError(
                `The file is larger than the ${assignment.maxFileSizeMb} MB limit for this assignment.`,
                [{ field: "file", message: `Maximum ${assignment.maxFileSizeMb} MB.` }],
              );
            }

            const existing = await Submission.findOne({
              assignment: assignment._id,
              student: context.student.id,
            });
            if (existing && existing.status !== "DRAFT" && !assignment.allowReplacement) {
              throw conflict(
                "This assignment does not allow a submission to be replaced once submitted.",
              );
            }

            const verified = await verifyStoredFile(file.path, FILE_POLICIES.assignment_submission);
            const previousFile = existing?.file?.fileId || null;
            const persisted = await persistStoredFile({
              module: "assignment_submission",
              file,
              verifiedSignature: verified.verifiedSignature,
              uploadedBy: req.user._id || req.user.id,
              relatedType: "submission",
            });

            const isLate = new Date() > new Date(assignment.dueAt);
            let submission;
            try {
              if (existing) {
                existing.file = persisted.reference;
                existing.status = isLate ? "LATE" : "SUBMITTED";
                existing.submittedAt = new Date();
                existing.isLate = isLate;
                existing.attemptCount = (existing.attemptCount || 0) + 1;
                existing.marks = null;
                existing.feedback = "";
                existing.gradedBy = null;
                existing.gradedAt = null;
                existing.similarity = { status: "NOT_CHECKED" };
                await existing.save();
                submission = existing;
              } else {
                submission = await Submission.create({
                  assignment: assignment._id,
                  student: context.student.id,
                  studentUser: req.user._id || req.user.id,
                  studentId: context.student.studentId,
                  studentName:
                    context.student.studentId +
                    (assignment.course?.code ? ` · ${assignment.course.code}` : ""),
                  file: persisted.reference,
                  status: isLate ? "LATE" : "SUBMITTED",
                  submittedAt: new Date(),
                  isLate,
                  attemptCount: 1,
                  similarity: { status: "NOT_CHECKED" },
                });
              }
            } catch (error) {
              await deleteStoredFile(persisted.stored._id, req.user._id || req.user.id);
              throw error;
            }

            await StoredFile.updateOne(
              { _id: persisted.stored._id },
              { relatedType: "submission", relatedId: submission._id.toString() },
            );
            if (previousFile) await deleteStoredFile(previousFile, req.user._id || req.user.id);

            await logAudit({
              userId: req.user._id || req.user.id,
              action: existing ? "SUBMISSION_REPLACED" : "SUBMISSION_CREATED",
              module: "assignments",
              resource: "submission",
              resourceId: submission._id.toString(),
              newValue: {
                assignment: assignment.title,
                file: submission.file.originalName,
                status: submission.status,
                attempt: submission.attemptCount,
              },
              details: `${isLate ? "Late" : "On-time"} submission recorded for "${assignment.title}".`,
            });

            const updated = await Submission.findById(submission._id).lean();
            res.status(existing ? 200 : 201).json({
              submission: serialiseSubmissionForStudent(updated),
            });
          } catch (error) {
            next(error);
          }
        },
        next,
      );
    },
  );

  /** A student's own submissions, newest first. */
  app.get(
    "/api/submissions/mine",
    requireAuth,
    route(async (req, res) => {
      const context = await getAudienceContext(req.user);
      if (!context.student) {
        res.json({ submissions: [] });
        return;
      }
      const submissions = await Submission.find({ student: context.student.id })
        .populate("assignment", "title dueAt maxMarks course status")
        .sort({ submittedAt: -1 })
        .lean();
      res.json({ submissions: submissions.map(serialiseSubmissionForStudent) });
    }),
  );

  /**
   * Grading. Marks, feedback and private comments are written onto the
   * submission itself, so the student sees the result as soon as it is saved.
   */
  app.patch(
    "/api/submissions/:id/grade",
    requireAuth,
    requirePermission("assignments.grade"),
    route(async (req, res) => {
      const submission = await Submission.findById(requireObjectId(req.params.id, "Submission"));
      if (!submission) throw notFound("Submission not found.");
      const assignment = await loadAssignment(String(submission.assignment));
      await assertCanManageAssignment(req, assignment);

      const body = req.body || {};
      const marks = body.marks === undefined || body.marks === null || body.marks === ""
        ? null
        : toNumber(body.marks, "Marks", { min: 0, max: assignment.maxMarks });
      const feedback = optionalString(body.feedback, "Feedback", { max: 4000 }) || "";
      const privateComment = optionalString(body.privateComment, "Private comment", { max: 4000 }) || "";

      submission.marks = marks;
      submission.feedback = feedback;
      submission.privateComment = privateComment;
      submission.gradedBy = req.user._id || req.user.id;
      submission.gradedAt = new Date();
      submission.status = marks === null ? "RETURNED" : "GRADED";
      await submission.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "ASSIGNMENT_GRADED",
        module: "assignments",
        resource: "submission",
        resourceId: submission._id.toString(),
        newValue: {
          assignment: assignment.title,
          studentId: submission.studentId,
          marks,
          status: submission.status,
        },
        details: `Submission graded: ${marks === null ? "returned for revision" : `${marks}/${assignment.maxMarks}`}.`,
      });

      const updated = await Submission.findById(submission._id).lean();
      res.json({ submission: serialiseSubmissionForTeacher(updated), maxMarks: assignment.maxMarks });
    }),
  );

  /**
   * Similarity check for one submission.
   *
   * The result is whatever the configured provider actually returns. With no
   * provider configured the response is `NOT_SUPPORTED` and the percentage is
   * null, which the UI renders as "Similarity analysis is not configured."
   */
  app.post(
    "/api/submissions/:id/similarity",
    requireAuth,
    requirePermission("assignments.grade"),
    route(async (req, res) => {
      const submission = await Submission.findById(requireObjectId(req.params.id, "Submission"));
      if (!submission) throw notFound("Submission not found.");
      const assignment = await loadAssignment(String(submission.assignment));
      await assertCanManageAssignment(req, assignment);
      if (!submission.file) {
        throw conflict("This submission has no file to analyse.");
      }

      const similarity = await runSimilarityCheck(submission, {
        actorUserId: req.user._id || req.user.id,
      });

      res.json({
        similarity,
        configuration: getSimilarityConfiguration(),
      });
    }),
  );

  /** Course + section options for the assignment form. */
  app.get(
    "/api/assignments/options/teaching",
    requireAuth,
    route(async (req, res) => {
      const userId = req.user._id || req.user.id;
      const teaching = await CourseTeachingAssignment.find({ facultyUser: userId })
        .populate("course", "code name status program semester academicYear")
        .lean();

      const scope = hasCurriculumScope(req.user)
        ? await Course.find({ status: "ACTIVE" }).select("code name program semester academicYear").sort({ code: 1 }).lean()
        : teaching.map((row) => row.course).filter(Boolean);

      const sections = await Section.find().select("code program semester batch").sort({ code: 1 }).lean();
      res.json({
        options: {
          courses: scope.map((course) => ({
            id: String(course._id),
            code: course.code,
            name: course.name,
            program: course.program || null,
            semester: course.semester ?? null,
            academicYear: course.academicYear || null,
            sections: Array.from(
              new Set(
                teaching
                  .filter((row) => String(row.course?._id) === String(course._id))
                  .map((row) => row.sectionCode),
              ),
            ),
          })),
          programs: Array.from(new Set(sections.map((row) => row.program).filter(Boolean))),
          batchYears: Array.from(new Set(sections.map((row) => row.batch).filter(Boolean))),
          semesters: Array.from(new Set(sections.map((row) => row.semester).filter(Boolean))).sort(
            (a, b) => a - b,
          ),
          sectionCodes: Array.from(new Set(sections.map((row) => row.code))).sort(),
          assignmentTypes: ["ESSAY", "PROJECT", "REPORT", "PRESENTATION", "PRACTICAL", "PROBLEM_SET", "OTHER"],
          allowedFileTypes: FILE_POLICIES.assignment_submission.extensions,
          defaultAcademicYear: DEFAULT_ACADEMIC_YEAR,
        },
      });
    }),
  );
}

function hasCurriculumScope(user) {
  const roles = getUserRoles(user);
  return roles.some((role) =>
    ["super_admin", "dean", "hod", "registrar", "program_coordinator"].includes(role),
  );
}

async function loadAssignment(identifier) {
  const assignment = await Assignment.findById(requireObjectId(identifier, "Assignment")).populate(
    "course",
    "code name",
  );
  if (!assignment) throw notFound("Assignment not found.");
  return assignment;
}

async function assertCanManageAssignment(req, assignment) {
  const isOwner = String(assignment.facultyUser?._id || assignment.facultyUser) ===
    String(req.user._id || req.user.id);
  if (isOwner) return;
  if (hasCurriculumScope(req.user)) return;
  const authorised = await isTeachingAuthorized(req.user, {
    courseId: assignment.course?._id,
    sectionCode: assignment.sectionCodes?.[0],
    semester: assignment.semester,
  });
  if (!authorised) {
    throw forbidden("You are not authorised to manage this assignment.");
  }
}

function requireEnumValue(value, field, allowed) {
  const candidate = String(value || "").trim().toUpperCase();
  if (!allowed.includes(candidate)) {
    throw validationError(`${field} must be one of: ${allowed.join(", ")}.`, [
      { field, message: `Allowed values: ${allowed.join(", ")}.` },
    ]);
  }
  return candidate;
}

function buildRosterStats(rosterSize, submissions) {
  const submitted = submissions.filter((row) =>
    ["SUBMITTED", "LATE", "GRADED", "RETURNED"].includes(row.status),
  ).length;
  const graded = submissions.filter((row) => row.marks !== null && row.marks !== undefined).length;
  const late = submissions.filter((row) => row.isLate).length;
  const marks = submissions
    .map((row) => row.marks)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  return {
    targeted: rosterSize,
    submissions: submissions.length,
    submitted,
    missing: Math.max(0, rosterSize - submitted),
    late,
    graded,
    average: marks.length
      ? Number((marks.reduce((sum, value) => sum + value, 0) / marks.length).toFixed(2))
      : null,
  };
}

function serialiseSubmissionForStudent(submission) {
  return {
    id: String(submission._id),
    assignmentId: String(submission.assignment?._id || submission.assignment),
    assignmentTitle: submission.assignment?.title || null,
    dueAt: submission.assignment?.dueAt || null,
    status: submission.status,
    isLate: Boolean(submission.isLate),
    submittedAt: submission.submittedAt || null,
    attemptCount: submission.attemptCount || 1,
    file: submission.file
      ? {
          fileId: String(submission.file.fileId),
          originalName: submission.file.originalName,
          mimeType: submission.file.mimeType,
          extension: submission.file.extension,
          sizeBytes: submission.file.sizeBytes,
          sizeLabel: formatBytes(submission.file.sizeBytes),
          isPdf: submission.file.mimeType === "application/pdf",
        }
      : null,
    marks: submission.marks ?? null,
    maxMarks: submission.assignment?.maxMarks ?? null,
    feedback: submission.feedback || "",
    gradedAt: submission.gradedAt || null,
    similarity: {
      status: submission.similarity?.status || "NOT_CHECKED",
      percentage: submission.similarity?.percentage ?? null,
      matchedSources: submission.similarity?.matchedSources || [],
      message: submission.similarity?.message || null,
      checkedAt: submission.similarity?.checkedAt || null,
    },
  };
}

function serialiseSubmissionForTeacher(submission) {
  return {
    id: String(submission._id),
    assignmentId: String(submission.assignment?._id || submission.assignment),
    studentId: submission.studentId || null,
    studentName: submission.studentName || null,
    status: submission.status,
    isLate: Boolean(submission.isLate),
    submittedAt: submission.submittedAt || null,
    attemptCount: submission.attemptCount || 1,
    file: submission.file
      ? {
          fileId: String(submission.file.fileId),
          originalName: submission.file.originalName,
          mimeType: submission.file.mimeType,
          extension: submission.file.extension,
          sizeBytes: submission.file.sizeBytes,
          sizeLabel: formatBytes(submission.file.sizeBytes),
          isPdf: submission.file.mimeType === "application/pdf",
        }
      : null,
    marks: submission.marks ?? null,
    feedback: submission.feedback || "",
    privateComment: submission.privateComment || "",
    gradedAt: submission.gradedAt || null,
    similarity: {
      status: submission.similarity?.status || "NOT_CHECKED",
      percentage: submission.similarity?.percentage ?? null,
      matchedSources: submission.similarity?.matchedSources || [],
      message: submission.similarity?.message || null,
      checkedAt: submission.similarity?.checkedAt || null,
    },
  };
}

function serialiseAssignment(assignment, stats) {
  const course = assignment.course && typeof assignment.course === "object" ? assignment.course : null;
  const faculty = assignment.facultyUser && typeof assignment.facultyUser === "object"
    ? assignment.facultyUser
    : null;
  const payload = {
    id: String(assignment._id),
    _id: String(assignment._id),
    title: assignment.title,
    description: assignment.description || "",
    instructions: assignment.instructions || "",
    assignmentType: assignment.assignmentType,
    courseId: String(course?._id || assignment.course || ""),
    courseCode: course?.code || null,
    courseName: course?.name || null,
    facultyUserId: String(faculty?._id || assignment.facultyUser || ""),
    facultyName: faculty
      ? `${faculty.firstName || ""} ${faculty.lastName || ""}`.trim()
      : null,
    opensAt: assignment.opensAt || null,
    dueAt: assignment.dueAt,
    maxMarks: assignment.maxMarks ?? null,
    allowedFileTypes: assignment.allowedFileTypes || [],
    maxFileSizeMb: assignment.maxFileSizeMb ?? null,
    attemptPolicy: assignment.attemptPolicy,
    allowReplacement: assignment.allowReplacement !== false,
    similarityCheckEnabled: Boolean(assignment.similarityCheckEnabled),
    targetType: assignment.audience?.targetType || "ALL",
    audienceLabel: describeAudience(assignment.audience),
    audience: assignment.audience || { targetType: "ALL", target: {} },
    academicYear: assignment.academicYear,
    program: assignment.program || null,
    batch: assignment.batch || null,
    semester: assignment.semester ?? null,
    sectionCodes: assignment.sectionCodes || [],
    status: assignment.status,
    createdAt: assignment.createdAt || null,
    updatedAt: assignment.updatedAt || null,
  };
  if (stats) {
    payload.stats = {
      submissions: stats.total || 0,
      submitted: stats.submitted || 0,
      graded: stats.graded || 0,
      late: stats.late || 0,
      average: stats.marksCount
        ? Number((stats.marksTotal / stats.marksCount).toFixed(2))
        : null,
    };
  }
  return payload;
}

export { serialiseAssignment };
