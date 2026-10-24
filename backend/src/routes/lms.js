import mongoose from "mongoose";
import {
  Assignment,
  Course,
  CourseAnnouncement,
  CourseTemplate,
  CourseWeek,
  LearningMaterial,
  LearningObjective,
  Quiz,
  QuizQuestion,
  Student,
  TeachingProgress,
  WEEK_STATUSES,
} from "../models/index.js";
import { logAudit } from "../db.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  route,
  notFound,
  forbidden,
  conflict,
  validationError,
} from "../utils/apiError.js";
import {
  optionalString,
  optionalEnum,
  optionalBoolean,
  toInt,
  toStringList,
  requireObjectId,
} from "../utils/validate.js";
import { createUploader, runFileUpload } from "../services/fileStorage.js";
import {
  assertCanManageCourse as assertManageScope,
  assertCourseVisible as assertVisibleScope,
  canManageCourseContent,
  listCourseTerms,
  listEnrolledCourses,
  listEnrolledStudents,
  listTeachingCourses,
} from "../services/lms/lmsAccess.js";
import {
  canManageMaterial,
  createMaterialFromUpload,
  applyMaterialPatch,
  setMaterialStatus,
} from "../services/lms/materials.js";
import { resolveMaterialState, buildMaterialVisibilityFilter } from "../services/lms/materialState.js";
import { notifyStudents, sendCourseMail } from "../services/lms/notifier.js";
import {
  courseGradebook,
  courseGradeSummary,
} from "../services/lms/gradebook.js";
import {
  courseEngagement,
  courseRiskSignals,
  weeklyProgress,
  studentCourseProgress,
} from "../services/lms/analytics.js";
import { buildCourseActivity } from "../services/lms/courseActivity.js";
import {
  buildCourseTeachingHistory,
  buildTeachingProgress,
  readTeachingProgressPayload,
  recordTeachingProgress,
  resolveClassSession,
  attachTopicToAttendanceSession,
} from "../services/lms/teachingProgress.js";
import { createMaterialVersion } from "../services/lms/materials.js";
import { institutionDate } from "../services/myTimetable.js";
import {
  getInstitutionTimeZone,
  formatForAudit,
} from "../services/academicClock.js";
import { serialiseMaterial } from "./materials.js";

const materialUploader = createUploader("learning_material", { field: "file" });

/**
 * Faculty and student LMS surface.
 *
 * Everything the weekly planner needs lives behind this router: the course
 * spine (weeks), what hangs off a week (objectives, materials, assignments,
 * quizzes, announcements), and the read models the planner needs to be useful
 * (gradebook, progress, engagement, risk).
 *
 * Two rules hold for every route here:
 *  - authorisation is object-level. `requirePermission("lms.view")` only proves
 *    the caller is the kind of account that may open a course workspace; the
 *    course itself is then checked for teaching scope or enrolment in
 *    `lmsAccess.assertCourseVisible`, so a faculty id cannot open a course they
 *    do not teach;
 *  - student-facing reads are derived, never raw. Visibility of weeks and
 *    materials comes from the stored state plus the server clock, so a
 *    scheduled release behaves the same whether or not a sweep has run.
 */
export function registerLmsRoutes(app) {
  registerClockRoute(app);
  registerCourseIndex(app);
  registerCourseOverview(app);
  registerWeeks(app);
  registerObjectives(app);
  registerWeekMaterials(app);
  registerMaterialRoutes(app);
  registerTeachingProgressRoutes(app);
  registerAnnouncements(app);
  registerGradebook(app);
  registerCourseActivity(app);
  registerAnalytics(app);
  registerTemplates(app);
}

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/**
 * Server-authoritative time.
 *
 * Deadlines are absolute instants on the server; this endpoint exists so the
 * browser can compute an accurate countdown and detect clock drift rather than
 * trusting the device clock for anything academic.
 */
function registerClockRoute(app) {
  app.get(
    "/api/lms/server-time",
    requireAuth,
    route(async (req, res) => {
      const timezone = await getInstitutionTimeZone();
      res.json({
        serverTime: new Date().toISOString(),
        timezone,
      });
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Course index and overview                                           */
/* ------------------------------------------------------------------ */

function registerCourseIndex(app) {
  app.get(
    "/api/lms/courses",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const [teaching, enrolled, timezone] = await Promise.all([
        listTeachingCourses(req.user),
        listEnrolledCourses(req.user),
        getInstitutionTimeZone(),
      ]);

      const rows = await Course.find({
        _id: { $in: [...teaching.map((row) => row.courseId), ...enrolled.map((row) => row.courseId)] },
      })
        .select("code name program semester academicYear credits status")
        .lean();

      const byId = new Map(rows.map((row) => [String(row._id), row]));
      const base = (course, role) =>
        course
          ? {
              id: String(course._id),
              code: course.code,
              name: course.name,
              program: course.program || null,
              semester: course.semester ?? null,
              academicYear: course.academicYear || null,
              credits: course.credits ?? null,
              status: course.status,
              role,
            }
          : null;

      const courses = [
        ...teaching.map((row) => ({
          ...(base(byId.get(String(row.courseId)), "TEACHER") || {}),
          sectionCodes: row.sectionCodes,
        })),
        ...enrolled.map((row) => ({
          ...(base(byId.get(String(row.courseId)), "STUDENT") || {}),
          sectionCode: row.sectionCode,
        })),
      ].filter((row) => row.id);

      res.json({
        courses,
        teachingCount: teaching.length,
        enrolledCount: enrolled.length,
        timezone,
      });
    }),
  );
}

/**
 * Everything the planner header needs in one request: the course, the server
 * clock, term context, and per-section teaching scope. One round trip keeps the
 * header from flickering between independently loaded panels.
 */
function registerCourseOverview(app) {
  app.get(
    "/api/lms/courses/:courseId/overview",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const access = await assertCourseVisible(req.user, courseId, {
        semester: req.query.semester
          ? toInt(req.query.semester, "Semester", { min: 1, max: 12 })
          : undefined,
      });

      const [course, timezone, terms, weeks] = await Promise.all([
        Course.findById(courseId)
          .select("code name description program semester academicYear credits status sections")
          .lean(),
        getInstitutionTimeZone(),
        listCourseTerms(courseId),
        loadWeeks({ courseId, manager: access.canManage }),
      ]);

      if (!course) throw notFound("Course not found.");

      const sectionCodes = resolveRequestedSections(access, req.query.section);

      res.json({
        course: serialiseCourse(course),
        access: {
          canManage: access.canManage,
          canManageContent: access.canManageContent,
          sections: access.sections,
          role: access.role,
          enrolledSection: access.enrolledSection,
        },
        scope: {
          sectionCodes,
          sections: access.sections,
          terms,
          semester: access.semester,
        },
        serverTime: new Date().toISOString(),
        timezone,
        weekCount: weeks.length,
        publishedWeekCount: weeks.filter((week) => week.state === "PUBLISHED").length,
        draftWeekCount: weeks.filter((week) => week.state === "DRAFT").length,
      });
    }),
  );
}

function serialiseCourse(course) {
  return {
    id: String(course._id),
    code: course.code,
    name: course.name,
    description: course.description || "",
    program: course.program || null,
    semester: course.semester ?? null,
    academicYear: course.academicYear || null,
    credits: course.credits ?? null,
    status: course.status,
  };
}

/**
 * Flattens a course scope into the shape the views use.
 *
 * `lmsAccess` answers "what is this account's relationship to the course?";
 * the views need "may I edit this?" plus the sections in play, so the
 * translation happens once here rather than at every call site.
 */
function viewAccess(scope) {
  const canManage = canManageCourseContent(scope);
  return {
    canManage,
    canManageContent: canManage,
    role: scope.role,
    sections: scope.sections || [],
    sectionCodes: scope.sections || [],
    enrolledSection: scope.enrollment?.sectionCode || null,
    semester: scope.course?.semester ?? null,
    student: scope.student || null,
  };
}

/** Visible course: resolves to the flattened access shape or 404s. */
async function assertCourseVisible(user, courseId, options) {
  return viewAccess(await assertVisibleScope(user, courseId, options));
}

/** Manageable course: the same shape, but only for an authorised teacher. */
async function assertCanManageCourse(user, courseId, options) {
  return viewAccess(await assertManageScope(user, courseId, options));
}

/* ------------------------------------------------------------------ */
/* Weeks                                                               */
/* ------------------------------------------------------------------ */

function registerWeeks(app) {
  app.get(
    "/api/lms/courses/:courseId/weeks",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const access = await assertCourseVisible(req.user, courseId);
      const weeks = await loadWeeks({ courseId, manager: access.canManage });
      res.json({
        weeks,
        access: { canManage: access.canManage, sections: access.sections },
        serverTime: new Date().toISOString(),
      });
    }),
  );

  app.post(
    "/api/lms/courses/:courseId/weeks",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const scope = await assertCanManageCourse(req.user, courseId);

      const body = req.body || {};
      const title = requireText(body.title, "Week title");
      const semester = body.semester
        ? toInt(body.semester, "Semester", { min: 1, max: 12 })
        : scope.semester ?? null;

      // The number is allocated, never chosen, and never re-used.
      const last = await CourseWeek.findOne({ course: courseId })
        .sort({ weekNumber: -1 })
        .select("weekNumber")
        .lean();

      const created = await CourseWeek.create({
        course: courseId,
        weekNumber: (last?.weekNumber || 0) + 1,
        title,
        description: optionalString(body.description, "Description", { max: 12000 }) || "",
        teachingPlan: optionalString(body.teachingPlan, "Teaching plan", { max: 12000 }) || "",
        expectedOutcome: optionalString(body.expectedOutcome, "Expected outcome", { max: 8000 }) || "",
        studyTimeMinutes: body.studyTimeMinutes
          ? toInt(body.studyTimeMinutes, "Study time", { min: 0, max: 100000 })
          : null,
        semester,
        sectionCodes: scope.sectionCodes || [],
        releaseAt: toOptionalDate(body.releaseAt, "Release time"),
        status: body.releaseAt ? "DRAFT" : "DRAFT",
        createdBy: req.user._id || req.user.id,
        updatedBy: req.user._id || req.user.id,
      });

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "COURSE_WEEK_CREATED",
        module: "lms",
        resource: "course_week",
        resourceId: created._id.toString(),
        newValue: { weekNumber: created.weekNumber, title: created.title },
        details: `Week ${created.weekNumber} "${created.title}" created.`,
      });

      res.status(201).json({ week: serialiseWeek(created) });
    }),
  );

  app.get(
    "/api/lms/weeks/:weekId",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const { week } = await loadWeekForCaller(req);
      res.json(await buildWeekDetail(week, req.user));
    }),
  );

  app.patch(
    "/api/lms/weeks/:weekId",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const week = await loadWeekForManager(req);
      const body = req.body || {};
      const before = {
        title: week.title,
        status: week.status,
        releaseAt: week.releaseAt,
        position: week.position,
      };

      if (body.title !== undefined) week.title = requireText(body.title, "Week title");
      if (body.description !== undefined) {
        week.description = optionalString(body.description, "Description", { max: 12000 }) || "";
      }
      if (body.teachingPlan !== undefined) {
        week.teachingPlan = optionalString(body.teachingPlan, "Teaching plan", { max: 12000 }) || "";
      }
      if (body.expectedOutcome !== undefined) {
        week.expectedOutcome =
          optionalString(body.expectedOutcome, "Expected outcome", { max: 8000 }) || "";
      }
      if (body.notes !== undefined) {
        // Teacher-only working notes. Never released to the cohort.
        week.notes = optionalString(body.notes, "Notes", { max: 8000 }) || "";
      }
      if (body.studyTimeMinutes !== undefined) {
        week.studyTimeMinutes = body.studyTimeMinutes
          ? toInt(body.studyTimeMinutes, "Study time", { min: 0, max: 100000 })
          : null;
      }
      if (body.position !== undefined) {
        week.position = toInt(body.position, "Position", { min: 0, max: 1000 });
      }
      if (body.releaseAt !== undefined) {
        week.releaseAt = toOptionalDate(body.releaseAt, "Release time");
      }
      if (body.status !== undefined) {
        week.status = requireWeekStatus(body.status);
        if (week.status === "PUBLISHED" && !week.publishedAt) {
          week.publishedAt = new Date();
          week.publishedBy = req.user._id || req.user.id;
        }
        if (week.status === "ARCHIVED") {
          week.archivedAt = new Date();
          week.archivedBy = req.user._id || req.user.id;
        }
      }
      week.updatedBy = req.user._id || req.user.id;
      await week.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "COURSE_WEEK_UPDATED",
        module: "lms",
        resource: "course_week",
        resourceId: week._id.toString(),
        oldValue: before,
        newValue: {
          title: week.title,
          status: week.status,
          releaseAt: week.releaseAt,
          position: week.position,
        },
        details: `Week ${week.weekNumber} updated.`,
      });

      res.json({ week: serialiseWeek(week) });
    }),
  );

  /** Publishes a week immediately, releasing its materials to the cohort. */
  app.post(
    "/api/lms/weeks/:weekId/publish",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const week = await loadWeekForManager(req);
      if (week.status === "ARCHIVED") {
        throw conflict("An archived week cannot be published. Restore it first.");
      }
      week.status = "PUBLISHED";
      week.publishedAt = week.publishedAt || new Date();
      week.publishedBy = req.user._id || req.user.id;
      week.updatedBy = req.user._id || req.user.id;
      await week.save();

      const released = await LearningMaterial.updateMany(
        { week: week._id, status: "SCHEDULED", releaseAt: { $lte: new Date() } },
        { $set: { status: "PUBLISHED", publishedAt: new Date() } },
      );

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "COURSE_WEEK_PUBLISHED",
        module: "lms",
        resource: "course_week",
        resourceId: week._id.toString(),
        oldValue: { status: "DRAFT" },
        newValue: { status: "PUBLISHED", materialsReleased: released.modifiedCount },
        details: `Week ${week.weekNumber} published; ${released.modifiedCount} due material(s) released.`,
      });

      res.json({
        week: serialiseWeek(week),
        materialsReleased: released.modifiedCount,
      });
    }),
  );

  /**
   * Duplicates a week's content into a new draft week.
   *
   * Objectives are copied; materials, assignments and quizzes are *listed* as
   * suggestions rather than cloned, because copying an assessment would copy
   * its deadlines and its attempts, which would be a lie about the academic
   * record.
   */
  app.post(
    "/api/lms/weeks/:weekId/duplicate",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const { week } = await loadWeekForManager(req);

      const last = await CourseWeek.findOne({ course: week.course })
        .sort({ weekNumber: -1 })
        .select("weekNumber")
        .lean();

      const copy = await CourseWeek.create({
        course: week.course,
        weekNumber: (last?.weekNumber || 0) + 1,
        title: optionalString((req.body || {}).title, "Week title", { max: 180 }) ||
          `${week.title} (copy)`,
        description: week.description,
        teachingPlan: week.teachingPlan,
        expectedOutcome: week.expectedOutcome,
        studyTimeMinutes: week.studyTimeMinutes,
        position: week.position,
        duplicatedFrom: week._id,
        semester: week.semester ?? null,
        sectionCodes: week.sectionCodes || [],
        status: "DRAFT",
        createdBy: req.user._id || req.user.id,
        updatedBy: req.user._id || req.user.id,
      });

      const objectives = await LearningObjective.find({ week: week._id })
        .sort({ position: 1 })
        .lean();
      if (objectives.length) {
        await LearningObjective.insertMany(
          objectives.map((objective) => ({
            course: objective.course,
            week: copy._id,
            text: objective.text,
            code: objective.code,
            note: objective.note,
            cognitiveLevel: objective.cognitiveLevel,
            position: objective.position,
            createdBy: req.user._id || req.user.id,
          })),
        );
      }

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "COURSE_WEEK_DUPLICATED",
        module: "lms",
        resource: "course_week",
        resourceId: copy._id.toString(),
        newValue: { fromWeekNumber: week.weekNumber, toWeekNumber: copy.weekNumber },
        details: `Week ${week.weekNumber} duplicated into week ${copy.weekNumber} with ${objectives.length} objective(s).`,
      });

      res.status(201).json({
        week: serialiseWeek(copy),
        copiedObjectives: objectives.length,
      });
    }),
  );

  app.delete(
    "/api/lms/weeks/:weekId",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const week = await loadWeekForManager(req);

      // A week that already carries assessed work is retired, not deleted:
      // submissions, attempts and grades must keep resolving.
      const [assignments, quizzes] = await Promise.all([
        Assignment.countDocuments({ week: week._id }),
        Quiz.countDocuments({ week: week._id }),
      ]);

      if (assignments || quizzes) {
        week.status = "ARCHIVED";
        week.archivedAt = new Date();
        week.archivedBy = req.user._id || req.user.id;
        week.updatedBy = req.user._id || req.user.id;
        await week.save();
        await logAudit({
          userId: req.user._id || req.user.id,
          action: "COURSE_WEEK_ARCHIVED",
          module: "lms",
          resource: "course_week",
          resourceId: week._id.toString(),
          details: `Week ${week.weekNumber} archived with ${assignments} assignment(s) and ${quizzes} quiz(zes) preserved.`,
        });
        return res.json({
          success: true,
          archived: true,
          week: serialiseWeek(week),
          reason: "Week contains assessed work and was archived instead of deleted.",
        });
      }

      await LearningObjective.deleteMany({ week: week._id });
      await LearningMaterial.deleteMany({ week: week._id });
      await CourseWeek.deleteOne({ _id: week._id });

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "COURSE_WEEK_DELETED",
        module: "lms",
        resource: "course_week",
        resourceId: week._id.toString(),
        details: `Empty week ${week.weekNumber} deleted.`,
      });

      return res.json({ success: true, archived: false, week: { id: String(week._id) } });
    }),
  );
}

/** Loads a week and proves the caller may open it. */
async function loadWeekForCaller(req) {
  const weekId = requireObjectId(req.params.weekId, "Week");
  const week = await CourseWeek.findById(weekId);
  if (!week) throw notFound("Course week not found.");
  const access = await assertCourseVisible(req.user, week.course);
  const visible = resolveWeekState(week);
  if (visible !== "PUBLISHED" && !access.canManage) {
    // An unpublished week is not a thing a student can discover by guessing an id.
    throw notFound("Course week not found.");
  }
  return { week, access, state: visible };
}

async function loadWeekForManager(req) {
  const weekId = requireObjectId(req.params.weekId, "Week");
  const week = await CourseWeek.findById(weekId);
  if (!week) throw notFound("Course week not found.");
  await assertCanManageCourse(req.user, week.course);
  return week;
}

/** The state a student experiences, derived from the stored state and clock. */
export function resolveWeekState(week, now = new Date()) {
  if (week.status === "ARCHIVED") return "ARCHIVED";
  const releaseAt = week.releaseAt ? new Date(week.releaseAt) : null;

  if (week.status === "DRAFT") {
    // A draft that carries a release time is *scheduled*, not merely
    // unpublished: the sweep publishes it at that instant. Reporting it as
    // plain DRAFT would hide from the teacher which of their drafts are
    // actually going to reach students, and when.
    if (!releaseAt) return "DRAFT";
    return releaseAt <= now ? "PUBLISHED" : "SCHEDULED";
  }
  if (releaseAt && releaseAt > now) return "SCHEDULED";
  return "PUBLISHED";
}

function serialiseWeek(week, extra = {}) {
  return {
    id: String(week._id),
    courseId: String(week.course?._id || week.course || ""),
    weekNumber: week.weekNumber,
    title: week.title,
    description: week.description || "",
    teachingPlan: week.teachingPlan || "",
    expectedOutcome: week.expectedOutcome || "",
    notes: week.notes || "",
    studyTimeMinutes: week.studyTimeMinutes ?? null,
    position: week.position ?? 0,
    status: week.status,
    state: resolveWeekState(week),
    releaseAt: week.releaseAt || null,
    publishedAt: week.publishedAt || null,
    archivedAt: week.archivedAt || null,
    duplicatedFrom: week.duplicatedFrom ? String(week.duplicatedFrom) : null,
    semester: week.semester ?? null,
    sectionCodes: week.sectionCodes || [],
    createdAt: week.createdAt || null,
    updatedAt: week.updatedAt || null,
    ...extra,
  };
}

/** Week list with the counts the planner column headers need. */
async function loadWeeks({ courseId, manager }) {
  const now = new Date();
  const [weeks, materials, assignments, quizzes, objectives] = await Promise.all([
    CourseWeek.find({ course: courseId })
      .sort({ position: 1, weekNumber: 1 })
      .lean(),
    LearningMaterial.find({ course: courseId }).select("week status releaseAt").lean(),
    Assignment.find({ course: courseId }).select("week dueAt status").lean(),
    Quiz.find({ course: courseId }).select("week openAt closeAt status maxMarks").lean(),
    LearningObjective.find({ course: courseId }).select("week").lean(),
  ]);

  const visibleMaterials = manager
    ? materials
    : materials.filter((material) => resolveMaterialState(material, now) === "PUBLISHED");

  return weeks.map((week) => {
    const id = String(week._id);
    const state = resolveWeekState(week, now);
    const weekQuizzes = quizzes.filter((quiz) => String(quiz.week) === id);
    return serialiseWeek(week, {
      materialCount: visibleMaterials.filter((row) => String(row.week) === id).length,
      assignmentCount: assignments.filter((row) => String(row.week) === id).length,
      quizCount: weekQuizzes.length,
      objectiveCount: objectives.filter((row) => String(row.week) === id).length,
      totalQuizMarks: weekQuizzes.reduce((sum, quiz) => sum + (quiz.maxMarks || 0), 0),
      nextDeadline: nextDeadlineFor(
        week,
        assignments.filter((row) => String(row.week) === id),
        weekQuizzes,
        now,
      ),
    });
  });
}

function nextDeadlineFor(week, assignments, quizzes, now) {
  const candidates = [];
  for (const assignment of assignments) {
    if (assignment.dueAt && new Date(assignment.dueAt) >= now) {
      candidates.push({ kind: "ASSIGNMENT", at: assignment.dueAt });
    }
  }
  for (const quiz of quizzes) {
    if (quiz.openAt && new Date(quiz.openAt) >= now) {
      candidates.push({ kind: "QUIZ", at: quiz.openAt });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => new Date(a.at) - new Date(b.at));
  return candidates[0];
}

/** The full week payload: objectives, materials, assignments, quizzes, news. */
async function buildWeekDetail(week, user) {
  const weekId = week._id;
  const access = await assertCourseVisible(user, week.course);
  const manager = access.canManage;
  const now = new Date();
  const state = resolveWeekState(week, now);

  const [objectives, materials, assignments, quizzes, announcements] = await Promise.all([
    LearningObjective.find({ week: weekId }).sort({ position: 1, createdAt: 1 }).lean(),
    LearningMaterial.find({
      week: weekId,
      ...(manager ? {} : buildMaterialVisibilityFilter({ now })),
    })
      .sort({ createdAt: 1 })
      .lean(),
    Assignment.find({ week: weekId }).sort({ dueAt: 1 }).lean(),
    Quiz.find({ week: weekId }).sort({ openAt: 1, createdAt: 1 }).lean(),
    CourseAnnouncement.find({
      course: week.course,
      $or: [{ week: weekId }, { week: null }],
      publishedAt: { $ne: null },
    })
      .sort({ pinned: -1, publishedAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const questionCounts = await countQuestionsByQuiz(
    quizzes.map((quiz) => quiz._id),
  );

  return {
    week: serialiseWeek(week, {
      materials: materials.map((material) => serialiseMaterial(material)),
      objectives: objectives.map(serialiseObjective),
      assignments: assignments.map((assignment) =>
        serialisePlannerAssignment(assignment, now),
      ),
      quizzes: quizzes.map((quiz) =>
        serialisePlannerQuiz(quiz, questionCounts, access, now),
      ),
      announcements: announcements.map((row) => ({
        id: String(row._id),
        title: row.title,
        body: row.body,
        pinned: row.pinned,
        weekId: row.week ? String(row.week) : null,
        publishedAt: row.publishedAt,
      })),
      /**
       * Teaching positions are teacher-only working state. A student receives the
       * same week payload with this field null rather than an empty array, so a
       * client cannot mistake "you may not see this" for "there is nothing here".
       */
      teachingProgress: manager
        ? await courseWeekTeachingProgress(week._id)
        : null,
    }),
    access: {
      canManage: manager,
      canManageContent: manager,
      sections: access.sections,
    },
    serverTime: now.toISOString(),
  };
}

/** Latest teaching position recorded against the materials of one week. */
async function courseWeekTeachingProgress(weekId) {
  const materials = await LearningMaterial.find({ week: weekId })
    .select("_id title version documentMeta")
    .lean();
  if (!materials.length) return [];

  const materialById = new Map(materials.map((row) => [String(row._id), row]));
  const records = await TeachingProgress.find({
    material: { $in: materials.map((row) => row._id) },
  })
    .sort({ taughtOn: -1, createdAt: -1 })
    .lean();

  const seen = new Set();
  const latest = [];
  for (const record of records) {
    const key = String(record.material);
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push({
      materialId: key,
      materialTitle: materialById.get(key)?.title || null,
      materialVersion: record.materialVersion || 1,
      fromUnit: record.fromUnit,
      toUnit: record.toUnit,
      totalUnits: record.totalUnits ?? null,
      unitLabel: record.unitLabel || "slide",
      taughtOn: record.taughtOn,
      topic: record.topic || "",
      notes: record.notes || "",
      nextStartUnit: record.nextStartUnit ?? null,
      /**
       * Which class the position came from. A position recorded against a timetable
       * session is tied to that section and time window, and saying so next to the
       * range is what stops "where was I" from being ambiguous when a course is
       * taught to several cohorts.
       */
      sectionCode: record.sectionCode || null,
      sessionName: record.sessionName || "",
      sessionStartTime: record.sessionStartTime || null,
      sessionEndTime: record.sessionEndTime || null,
    });
  }
  return latest;
}

function serialiseObjective(objective) {
  return {
    id: String(objective._id),
    weekId: String(objective.week),
    text: objective.text,
    code: objective.code || null,
    note: objective.note || "",
    cognitiveLevel: objective.cognitiveLevel || null,
    position: objective.position ?? 0,
  };
}

function serialisePlannerAssignment(assignment, now) {
  const due = assignment.dueAt ? new Date(assignment.dueAt) : null;
  return {
    id: String(assignment._id),
    weekId: assignment.week ? String(assignment.week) : null,
    title: assignment.title,
    assignmentType: assignment.assignmentType,
    opensAt: assignment.opensAt || null,
    dueAt: assignment.dueAt || null,
    maxMarks: assignment.maxMarks ?? 100,
    status: assignment.status,
    opensIn: assignment.opensAt && new Date(assignment.opensAt) > now ? "FUTURE" : "OPEN",
    isPastDue: Boolean(due && due < now && assignment.status !== "CLOSED"),
    submissionWindowState: due
      ? due < now
        ? "CLOSED"
        : "OPEN"
      : "UNKNOWN",
  };
}

function serialisePlannerQuiz(quiz, questionCounts, access, now) {
  const availability = derivePlannerAvailability(quiz, now);
  return {
    id: String(quiz._id),
    weekId: quiz.week ? String(quiz.week) : null,
    title: quiz.title,
    status: quiz.status,
    availability: availability.availability,
    availabilityReason: availability.reason,
    availableFrom: quiz.openAt || null,
    availableUntil: quiz.closeAt || null,
    durationMinutes: quiz.durationMinutes ?? null,
    maxMarks: quiz.maxMarks ?? 0,
    passingMarks: quiz.passingMarks ?? 0,
    questionCount: questionCounts?.get(String(quiz._id)) || 0,
    resultReleasePolicy: quiz.resultReleasePolicy,
    attemptsAllowed: quiz.attemptsAllowed ?? 1,
    randomizeQuestions: Boolean(quiz.randomizeQuestions),
    randomizeOptions: Boolean(quiz.randomizeOptions),
    allowBackNavigation: quiz.allowBackNavigation !== false,
    pendingManualGradeCount: quiz.pendingManualGradeCount || 0,
    attemptCount: quiz.attemptCount || 0,
    canManage: access.canManage,
  };
}

function derivePlannerAvailability(quiz, now) {
  const openAt = quiz.openAt ? new Date(quiz.openAt) : null;
  const closeAt = quiz.closeAt ? new Date(quiz.closeAt) : null;
  if (closeAt && closeAt <= now) {
    return { availability: "CLOSED", reason: "The quiz window has closed." };
  }
  if (openAt && openAt > now) {
    return { availability: "UPCOMING", reason: "The quiz has not opened yet." };
  }
  if (quiz.status === "PUBLISHED" || quiz.status === "OPEN") {
    return { availability: "OPEN", reason: null };
  }
  if (quiz.status === "DRAFT") {
    return { availability: "UPCOMING", reason: "The quiz is still a draft." };
  }
  return { availability: "CLOSED", reason: `The quiz is ${String(quiz.status || "closed").toLowerCase()}.` };
}

/* ------------------------------------------------------------------ */
/* Learning objectives                                                 */
/* ------------------------------------------------------------------ */

function registerObjectives(app) {
  app.post(
    "/api/lms/weeks/:weekId/objectives",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const week = await loadWeekForManager(req);
      const body = req.body || {};
      const texts = Array.isArray(body.texts)
        ? body.texts
        : [body.text].filter(Boolean);
      if (!texts.length) {
        throw validationError("At least one learning objective is required.", [
          { field: "text", message: "Describe what students should learn." },
        ]);
      }

      const created = [];
      for (const text of texts) {
        created.push(
          await LearningObjective.create({
            course: week.course,
            week: week._id,
            text: requireText(text, "Objective"),
            code: optionalString(body.code, "Code", { max: 40 }),
            note: optionalString(body.note, "Note", { max: 2000 }) || "",
            cognitiveLevel: optionalEnum(
              body.cognitiveLevel,
              "Cognitive level",
              ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYSE", "EVALUATE", "CREATE"],
            ),
            position: created.length + 1,
            createdBy: req.user._id || req.user.id,
          }),
        );
      }

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "LEARNING_OBJECTIVES_ADDED",
        module: "lms",
        resource: "course_week",
        resourceId: week._id.toString(),
        newValue: { count: created.length },
        details: `${created.length} learning objective(s) added to week ${week.weekNumber}.`,
      });

      res.status(201).json({ objectives: created.map(serialiseObjective) });
    }),
  );

  app.patch(
    "/api/lms/objectives/:objectiveId",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const objectiveId = requireObjectId(req.params.objectiveId, "Objective");
      const objective = await LearningObjective.findById(objectiveId);
      if (!objective) throw notFound("Learning objective not found.");
      await assertCanManageCourse(req.user, objective.course);

      const body = req.body || {};
      if (body.text !== undefined) objective.text = requireText(body.text, "Objective");
      if (body.code !== undefined) objective.code = optionalString(body.code, "Code", { max: 40 });
      if (body.note !== undefined) {
        objective.note = optionalString(body.note, "Note", { max: 2000 }) || "";
      }
      if (body.cognitiveLevel !== undefined) {
        objective.cognitiveLevel = optionalEnum(
          body.cognitiveLevel,
          "Cognitive level",
          ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYSE", "EVALUATE", "CREATE"],
        );
      }
      if (body.position !== undefined) {
        objective.position = toInt(body.position, "Position", { min: 0, max: 500 });
      }
      await objective.save();

      res.json({ objective: serialiseObjective(objective) });
    }),
  );

  app.delete(
    "/api/lms/objectives/:objectiveId",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const objectiveId = requireObjectId(req.params.objectiveId, "Objective");
      const objective = await LearningObjective.findById(objectiveId);
      if (!objective) throw notFound("Learning objective not found.");
      await assertCanManageCourse(req.user, objective.course);
      await objective.deleteOne();
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "LEARNING_OBJECTIVE_REMOVED",
        module: "lms",
        resource: "course_week",
        resourceId: String(objective.week),
        details: `Learning objective removed.`,
      });
      res.json({ success: true });
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Week-scoped materials                                               */
/* ------------------------------------------------------------------ */

function registerWeekMaterials(app) {
  app.post(
    "/api/lms/weeks/:weekId/materials",
    requireAuth,
    requirePermission("lms.content.manage"),
    (req, res, next) => {
      runFileUpload(
        req,
        res,
        materialUploader,
        async (uploadError, file) => {
          try {
            if (uploadError) throw uploadError;
            const week = await loadWeekForManager(req);
            if (!file) {
              throw validationError("A file is required for this material.", [
                { field: "file", message: "Choose a file to upload." },
              ]);
            }
            const material = await createMaterialFromUpload({
              actor: req.user,
              file,
              body: req.body || {},
              week,
            });
            const populated = await LearningMaterial.findById(material._id)
              .populate("course", "code name")
              .lean();
            res.status(201).json({ material: serialiseMaterial(populated) });
          } catch (error) {
            next(error);
          }
        },
        next,
      );
    },
  );
}

function registerMaterialRoutes(app) {
  app.get(
    "/api/lms/materials/:materialId",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const materialId = requireObjectId(req.params.materialId, "Learning material");
      const material = await LearningMaterial.findById(materialId);
      if (!material) throw notFound("Learning material not found.");
      const access = await assertCourseVisible(req.user, material.course);

      if (!access.canManage && resolveMaterialState(material) !== "PUBLISHED") {
        throw notFound("Learning material not found.");
      }
      if (material.week) {
        const week = await CourseWeek.findById(material.week).select("status releaseAt archivedAt");
        if (!access.canManage) {
          if (!week || week.archivedAt || resolveWeekState(week) !== "PUBLISHED") {
            throw notFound("Learning material not found.");
          }
        }
      }

      res.json({
        material: serialiseMaterial(material.toObject()),
        canManage: access.canManage,
      });
    }),
  );

  app.patch(
    "/api/lms/materials/:materialId",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const materialId = requireObjectId(req.params.materialId, "Learning material");
      const material = await LearningMaterial.findById(materialId);
      if (!material) throw notFound("Learning material not found.");
      if (!(await canManageMaterial(req.user, material))) {
        throw forbidden("You are not authorised to edit this material.");
      }
      await applyMaterialPatch({ material, body: req.body || {}, actor: req.user });
      res.json({ material: serialiseMaterial(material.toObject()) });
    }),
  );

  app.post(
    "/api/lms/materials/:materialId/status",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const materialId = requireObjectId(req.params.materialId, "Learning material");
      const material = await LearningMaterial.findById(materialId);
      if (!material) throw notFound("Learning material not found.");
      if (!(await canManageMaterial(req.user, material))) {
        throw forbidden("You are not authorised to change this material's visibility.");
      }
      const status = requireEnumValue(
        (req.body || {}).status,
        "Status",
        ["DRAFT", "SCHEDULED", "PUBLISHED", "HIDDEN", "ARCHIVED"],
      );
      if (status === "SCHEDULED" && !material.releaseAt) {
        throw validationError("A scheduled material needs a release time.", [
          { field: "releaseAt", message: "Choose when this material becomes visible." },
        ]);
      }
      await setMaterialStatus({ material, status, actor: req.user });

      if (status === "PUBLISHED") {
        const students = await listEnrolledStudents({
          courseId: material.course,
          sectionCodes: material.sectionCodes?.length ? material.sectionCodes : null,
          semester: material.semester,
        });
        if (students.length) {
          await notifyStudents({
            students,
            title: `New material: ${material.title}`,
            message: `${material.title} is now available in your course.`,
            keyPrefix: `material_published_${material._id}`,
            category: "lms_material",
            actionUrl: `/learning/course/${material.course}`,
          });
        }
      }

      res.json({ material: serialiseMaterial(material.toObject()) });
    }),
  );

  app.delete(
    "/api/lms/materials/:materialId",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const materialId = requireObjectId(req.params.materialId, "Learning material");
      const material = await LearningMaterial.findById(materialId);
      if (!material) throw notFound("Learning material not found.");
      if (!(await canManageMaterial(req.user, material))) {
        throw forbidden("You are not authorised to archive this material.");
      }
      await setMaterialStatus({ material, status: "ARCHIVED", actor: req.user });
      res.json({ success: true, material: serialiseMaterial(material.toObject()) });
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Material versions and teaching progress                              */
/* ------------------------------------------------------------------ */

/**
 * Teaching progress and version history.
 *
 * The practical problem this addresses: a teacher uploads a twenty-slide deck for
 * Week 1, teaches slides 1 to 12, and returns three days later unable to recall
 * where they stopped. These routes are the durable answer to that.
 *
 * Two facts are deliberately kept apart. `LearningMaterial.firstViewedAt` says a
 * file was opened. A `TeachingProgress` record says a teacher declared what they
 * taught. Only the second is ever reported as a teaching position, and only a
 * teacher can write it — CollegeOS never claims to know what was actually covered.
 */
function registerTeachingProgressRoutes(app) {
  app.get(
    "/api/lms/materials/:materialId/teaching-progress",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const materialId = requireObjectId(req.params.materialId, "Learning material");
      const material = await LearningMaterial.findById(materialId);
      if (!material) throw notFound("Learning material not found.");
      const access = await assertCourseVisible(req.user, material.course);
      if (!access.canManage) {
        throw forbidden("Teaching positions are visible to the course teacher only.");
      }

      const result = await buildTeachingProgress(materialId, {
        limit: toInt(req.query.limit, "Limit", { min: 1, max: 100, fallback: 30 }),
      });
      res.json(result);
    }),
  );

  app.post(
    "/api/lms/materials/:materialId/teaching-progress",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const materialId = requireObjectId(req.params.materialId, "Learning material");
      const material = await LearningMaterial.findById(materialId);
      if (!material) throw notFound("Learning material not found.");
      if (!(await canManageMaterial(req.user, material))) {
        throw forbidden(
          "You are not authorised to record teaching progress for this material.",
        );
      }

      const body = req.body || {};
      const payload = readTeachingProgressPayload(body, {
        totalUnits: material.documentMeta?.unitCount ?? null,
        unitLabel: material.documentMeta?.unitLabel ?? "slide",
      });

      // Attaching the record to a class session reuses the session's own course,
      // section, week and time window, so the same class is never described twice.
      if (payload.timetableSessionId) {
        const session = await resolveClassSession(payload.timetableSessionId);
        if (!session) {
          throw notFound("Class session not found.");
        }
        if (String(session.courseId) !== String(material.course)) {
          throw validationError("That class session belongs to a different course.", [
            { field: "timetableSessionId", message: "Choose a session for this course." },
          ]);
        }

        /**
         * The session is real, belonging to the course is not enough.
         *
         * A `timetableSessionId` arriving in a body is an identifier, not a claim:
         * without these two checks any teacher who could guess an id could file a
         * teaching record against a colleague's class, inheriting its section and
         * inheriting its attendance register. So the session must be one this caller
         * actually teaches — the same section rule the rest of the LMS applies — and
         * their own class, unless they administer the institution's curriculum.
         */
        const sessionScope = await assertCanManageCourse(req.user, material.course, {
          sectionCodes: session.sectionCodes,
        });
        const actorId = String(req.user._id || req.user.id);
        if (
          session.facultyUserId &&
          session.facultyUserId !== actorId &&
          sessionScope.role !== "manager"
        ) {
          throw forbidden(
            "That class belongs to another teacher. Record your own classes, or ask a curriculum administrator.",
          );
        }

        if (!payload.sectionCodes.length) payload.sectionCodes = session.sectionCodes;
        if (!payload.taughtOn) payload.taughtOn = session.date || (await institutionDate());
        if (!payload.sessionStartTime) payload.sessionStartTime = session.startTime;
        if (!payload.sessionEndTime) payload.sessionEndTime = session.endTime;
        if (!payload.sessionName) payload.sessionName = session.sessionName;
        if (!payload.attendanceSessionId) {
          payload.attendanceSessionId = session.attendanceSessionId;
        }
      }

      if (!payload.taughtOn) payload.taughtOn = await institutionDate();

      const record = await recordTeachingProgress({ material, actor: req.user, payload });
      await attachTopicToAttendanceSession(
        payload.attendanceSessionId,
        record.topic,
      );

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TEACHING_PROGRESS_RECORDED",
        module: "lms",
        resource: "teaching_progress",
        resourceId: record._id.toString(),
        newValue: {
          material: String(material._id),
          materialVersion: record.materialVersion,
          fromUnit: record.fromUnit,
          toUnit: record.toUnit,
          taughtOn: record.taughtOn,
          sectionCode: record.sectionCode,
        },
        details: `Teaching position recorded on "${material.title}" (${record.unitLabel}s ${record.fromUnit}–${record.toUnit}) for ${record.taughtOn}.`,
      });

      const result = await buildTeachingProgress(materialId);
      res.status(201).json({
        record: result.records[0] || null,
        position: result.position,
        documentLength: result.documentLength,
      });
    }),
  );

  app.get(
    "/api/lms/courses/:courseId/teaching-history",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const access = await assertCourseVisible(req.user, courseId);
      if (!access.canManage) {
        throw forbidden("Teaching history is available to the course teacher only.");
      }
      const sectionCodes = resolveRequestedSections(access, req.query.section);
      res.json(
        await buildCourseTeachingHistory(courseId, {
          sectionCodes,
          limit: toInt(req.query.limit, "Limit", { min: 1, max: 200, fallback: 60 }),
        }),
      );
    }),
  );

  /**
   * Uploads a replacement file as the next version.
   *
   * The previous version is retained rather than overwritten, so the historical
   * record of what was taught — and the teaching positions recorded against it —
   * stay intact. The new version inherits the previous one's audience, week and
   * cohort, so a correction reaches exactly the same students.
   */
  app.post(
    "/api/lms/materials/:materialId/versions",
    requireAuth,
    requirePermission("lms.content.manage"),
    (req, res, next) => {
      runFileUpload(
        req,
        res,
        materialUploader,
        async (uploadError, file) => {
          try {
            if (uploadError) throw uploadError;
            if (!file) {
              throw validationError("A file is required to publish a new version.", [
                { field: "file", message: "Choose the replacement file." },
              ]);
            }
            const previous = await LearningMaterial.findById(
              requireObjectId(req.params.materialId, "Learning material"),
            );
            if (!previous) throw notFound("Learning material not found.");
            if (!(await canManageMaterial(req.user, previous))) {
              throw forbidden(
                "You are not authorised to publish a new version of this material.",
              );
            }

            const created = await createMaterialVersion({
              actor: req.user,
              previous,
              file,
              body: req.body || {},
            });
            const populated = await LearningMaterial.findById(created._id)
              .populate("course", "code name")
              .populate("week", "weekNumber title")
              .lean();
            res.status(201).json({
              material: serialiseMaterial(populated),
              previous: { id: String(previous._id), version: previous.version || 1 },
            });
          } catch (error) {
            next(error);
          }
        },
        next,
      );
    },
  );

  /** Version lineage for one material, newest first. */
  app.get(
    "/api/lms/materials/:materialId/versions",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const materialId = requireObjectId(req.params.materialId, "Learning material");
      const material = await LearningMaterial.findById(materialId);
      if (!material) throw notFound("Learning material not found.");
      const access = await assertCourseVisible(req.user, material.course);

      // Follow the supersedes chain in both directions so one request returns the
      // whole lineage regardless of which version the caller opened.
      const [earlier, later] = await Promise.all([
        LearningMaterial.find({
          _id: material.supersedes ? await resolveSupersedesChain(material) : { $in: [] },
        })
          .select("title version createdAt uploadedBy file")
          .sort({ version: 1 })
          .lean(),
        LearningMaterial.find({
          supersedes: { $in: await resolveSupersededChain(material) },
        })
          .select("title version createdAt uploadedBy file")
          .sort({ version: 1 })
          .lean(),
      ]);

      res.json({
        current: { id: String(material._id), version: material.version || 1 },
        versions: [...earlier, ...later].map((row) => ({
          id: String(row._id),
          title: row.title,
          version: row.version || 1,
          fileName: row.file?.originalName || null,
          createdAt: row.createdAt || null,
        })),
      });
    }),
  );
}

/** Every material id in the supersedes chain that leads to `material`. */
async function resolveSupersedesChain(material, depth = 0) {
  if (!material.supersedes || depth > 20) return [];
  const parent = await LearningMaterial.findById(material.supersedes)
    .select("supersedes")
    .lean();
  if (!parent) return [];
  return [parent._id, ...(await resolveSupersedesChain(parent, depth + 1))];
}

/** Every material id in the chain that descends from `material`. */
async function resolveSupersededChain(material, depth = 0) {
  if (depth > 20) return [];
  const children = await LearningMaterial.find({ supersedes: material._id })
    .select("_id")
    .lean();
  const ids = [];
  for (const child of children) {
    ids.push(child._id);
    ids.push(...(await resolveSupersededChain(child, depth + 1)));
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

function registerAnnouncements(app) {
  app.get(
    "/api/lms/courses/:courseId/announcements",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const access = await assertCourseVisible(req.user, courseId);
      const filter = { course: courseId };
      if (!access.canManage) filter.publishedAt = { $ne: null };
      if (req.query.weekId) filter.week = requireObjectId(req.query.weekId, "Week");

      const rows = await CourseAnnouncement.find(filter)
        .sort({ pinned: -1, publishedAt: -1, createdAt: -1 })
        .limit(Math.min(toInt(req.query.limit, "Limit", { min: 1, max: 100 }) || 50, 100))
        .lean();

      res.json({
        announcements: rows.map((row) => ({
          id: String(row._id),
          courseId: String(row.course),
          weekId: row.week ? String(row.week) : null,
          title: row.title,
          body: row.body,
          pinned: row.pinned,
          scheduled: Boolean(row.publishAt) && !row.publishedAt,
          publishAt: row.publishAt || null,
          publishedAt: row.publishedAt || null,
          alsoSendMail: row.alsoSendMail,
          mailSentAt: row.mailSentAt || null,
          mailRecipientCount: row.mailRecipientCount || 0,
          authorUser: String(row.authorUser || ""),
          createdAt: row.createdAt || null,
        })),
        canManage: access.canManage,
      });
    }),
  );

  app.post(
    "/api/lms/courses/:courseId/announcements",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const scope = await assertCanManageCourse(req.user, courseId);
      const body = req.body || {};
      const publishAt = toOptionalDate(body.publishAt, "Publish time");
      const alsoSendMail =
        optionalBoolean(body.alsoSendMail, "Also send mail") ?? false;

      const announcement = await CourseAnnouncement.create({
        course: courseId,
        week: body.weekId ? requireObjectId(body.weekId, "Week") : null,
        title: requireText(body.title, "Title"),
        body: requireText(body.body, "Message", 12000),
        pinned: optionalBoolean(body.pinned, "Pinned") ?? false,
        publishAt,
        publishedAt: publishAt ? null : new Date(),
        alsoSendMail,
        authorUser: req.user._id || req.user.id,
        audience: body.audience,
      });

      let mail = null;
      if (!publishAt) {
        mail = await deliverAnnouncement({
          announcement,
          scope,
          actor: req.user,
          alsoSendMail,
        });
      }

      await logAudit({
        userId: req.user._id || req.user.id,
        action: publishAt ? "COURSE_ANNOUNCEMENT_SCHEDULED" : "COURSE_ANNOUNCEMENT_PUBLISHED",
        module: "lms",
        resource: "course_announcement",
        resourceId: announcement._id.toString(),
        newValue: {
          title: announcement.title,
          pinned: announcement.pinned,
          publishAt: announcement.publishAt,
          recipients: mail?.students?.length ?? 0,
        },
        details: `Announcement "${announcement.title}" ${publishAt ? `scheduled for ${await formatForAudit(publishAt)}` : "published"}.`,
      });

      res.status(201).json({
        announcement: {
          id: String(announcement._id),
          title: announcement.title,
          pinned: announcement.pinned,
          scheduled: Boolean(publishAt),
          publishAt: announcement.publishAt,
          publishedAt: announcement.publishedAt,
          recipients: mail?.students?.length ?? 0,
        },
      });
    }),
  );

  app.patch(
    "/api/lms/announcements/:announcementId",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const announcement = await CourseAnnouncement.findById(
        requireObjectId(req.params.announcementId, "Announcement"),
      );
      if (!announcement) throw notFound("Announcement not found.");
      const scope = await assertCanManageCourse(req.user, announcement.course);
      const body = req.body || {};

      if (body.title !== undefined) announcement.title = requireText(body.title, "Title");
      if (body.body !== undefined) announcement.body = requireText(body.body, "Message", 12000);
      if (body.pinned !== undefined) {
        announcement.pinned = optionalBoolean(body.pinned, "Pinned") ?? false;
      }
      if (body.weekId !== undefined) {
        announcement.week = body.weekId ? requireObjectId(body.weekId, "Week") : null;
      }
      if (body.publishAt !== undefined) {
        announcement.publishAt = toOptionalDate(body.publishAt, "Publish time");
        if (!announcement.publishAt) announcement.publishedAt = announcement.publishedAt || new Date();
      }
      await announcement.save();

      // An announcement published or changed after the fact reaches the cohort;
      // a scheduled one is delivered by the sweep at its instant.
      let mail = null;
      if (announcement.publishedAt && !announcement.mailSentAt) {
        mail = await deliverAnnouncement({
          announcement,
          scope,
          actor: req.user,
          alsoSendMail: announcement.alsoSendMail,
        });
      }

      res.json({
        success: true,
        announcement: {
          id: String(announcement._id),
          title: announcement.title,
          pinned: announcement.pinned,
          scheduled: Boolean(announcement.publishAt) && !announcement.publishedAt,
          publishAt: announcement.publishAt,
          publishedAt: announcement.publishedAt,
          recipients: mail?.students?.length ?? 0,
        },
      });
    }),
  );

  app.delete(
    "/api/lms/announcements/:announcementId",
    requireAuth,
    requirePermission("lms.content.manage"),
    route(async (req, res) => {
      const announcement = await CourseAnnouncement.findById(
        requireObjectId(req.params.announcementId, "Announcement"),
      );
      if (!announcement) throw notFound("Announcement not found.");
      await assertCanManageCourse(req.user, announcement.course);
      await announcement.deleteOne();
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "COURSE_ANNOUNCEMENT_DELETED",
        module: "lms",
        resource: "course_announcement",
        resourceId: String(announcement._id),
        details: `Announcement "${announcement.title}" deleted.`,
      });
      res.json({ success: true });
    }),
  );
}

/**
 * Publishes an announcement to the cohort.
 *
 * The notification is idempotent on the announcement id, so a retry, a double
 * click or an edit-after-publish cannot send the same message twice, and College
 * Mail is mirrored only when the teacher asked for it.
 */
async function deliverAnnouncement({ announcement, scope, actor, alsoSendMail }) {
  const students = await listEnrolledStudents({
    courseId: announcement.course,
    sectionCodes: scope.sectionCodes || [],
    semester: announcement.week
      ? (await CourseWeek.findById(announcement.week).select("semester").lean())?.semester
      : scope.semester,
  });

  if (!students.length) return { students: [], mail: null };

  await notifyStudents({
    students,
    title: announcement.title,
    message: announcement.body,
    keyPrefix: `announcement_${announcement._id}`,
    category: "lms_announcement",
    actionUrl: `/learning/course/${announcement.course}`,
  });

  let mail = null;
  if (alsoSendMail) {
    mail = await sendCourseMail({
      courseId: announcement.course,
      subject: announcement.title,
      body: announcement.body,
      sectionCodes: scope.sectionCodes || [],
      actor,
    });
  }

  announcement.mailSentAt = alsoSendMail ? new Date() : null;
  announcement.mailRecipientCount = students.length;
  await announcement.save();

  return { students, mail };
}

/* ------------------------------------------------------------------ */
/* Gradebook and progress                                              */
/* ------------------------------------------------------------------ */

function registerGradebook(app) {
  app.get(
    "/api/lms/courses/:courseId/grades",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const access = await assertCourseVisible(req.user, courseId);
      if (!access.canManage) throw forbidden("Only course teachers can open the gradebook.");

      const sectionCodes = resolveRequestedSections(access, req.query.section);
      const result = await courseGradebook({
        courseId,
        sectionCodes,
        semester: req.query.semester
          ? toInt(req.query.semester, "Semester", { min: 1, max: 12 })
          : undefined,
      });

      res.json({ ...result, access: { sections: access.sections } });
    }),
  );

  app.get(
    "/api/lms/courses/:courseId/grade-summary",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const access = await assertCourseVisible(req.user, courseId);
      if (!access.canManage) throw forbidden("Only course teachers can open the gradebook.");

      const sectionCodes = resolveRequestedSections(access, req.query.section);
      res.json(
        await courseGradeSummary({ courseId, sectionCodes, semester: access.semester }),
      );
    }),
  );

  /**
   * Per-student progress.
   *
   * A teacher sees the whole cohort; a student sees only their own row, which is
   * resolved from the session, never from a query parameter.
   */
  app.get(
    "/api/lms/courses/:courseId/progress",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const access = await assertCourseVisible(req.user, courseId);
      const sectionCodes = resolveRequestedSections(access, req.query.section);

      let studentIds = null;
      if (!access.canManage) {
        const student = await Student.findOne({ user: req.user._id || req.user.id }).select("_id");
        if (!student) throw notFound("Student record not found.");
        studentIds = [student._id];
      }

      const progress = await studentCourseProgress({
        courseId,
        studentIds,
        sectionCodes,
        semester: access.semester,
      });

      res.json({ ...progress, serverTime: new Date().toISOString() });
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Course activity                                                     */
/* ------------------------------------------------------------------ */

/**
 * The activity feed for one course.
 *
 * Activity is projected rather than stored: every entry names a record that
 * actually happened, so the feed cannot claim something the academic record does
 * not support.
 *
 * The viewer decides the audience, and it is derived from the course scope rather
 * than from a parameter. A student reading this course sees only their own
 * submissions and attempts; a teacher sees the cohort's. Passing a different
 * student id is not possible, because no such parameter is read.
 */
function registerCourseActivity(app) {
  app.get(
    "/api/lms/courses/:courseId/activity",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const access = await assertCourseVisible(req.user, courseId, {
        semester: req.query.semester
          ? toInt(req.query.semester, "Semester", { min: 1, max: 12 })
          : undefined,
      });
      const sectionCodes = resolveRequestedSections(access, req.query.section);

      res.json(
        await buildCourseActivity({
          courseId,
          sectionCodes,
          limit: toInt(req.query.limit, "Limit", { min: 1, max: 100 }),
          viewer:
            access.role === "student" && access.student
              ? { studentId: access.student._id }
              : null,
        }),
      );
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

function registerAnalytics(app) {
  app.get(
    "/api/lms/courses/:courseId/analytics",
    requireAuth,
    requirePermission("lms.analytics.view"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const access = await assertCourseVisible(req.user, courseId);
      if (!access.canManage) {
        throw forbidden("Engagement analytics are available to course teachers.");
      }
      const sectionCodes = resolveRequestedSections(access, req.query.section);
      res.json(
        await courseEngagement({
          courseId,
          sectionCodes,
          semester: access.semester,
        }),
      );
    }),
  );

  app.get(
    "/api/lms/courses/:courseId/risk-signals",
    requireAuth,
    requirePermission("lms.analytics.view"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const access = await assertCourseVisible(req.user, courseId);
      if (!access.canManage) {
        throw forbidden("Risk signals are available to course teachers.");
      }
      const sectionCodes = resolveRequestedSections(access, req.query.section);
      res.json(
        await courseRiskSignals({
          courseId,
          sectionCodes,
          semester: access.semester,
        }),
      );
    }),
  );

  app.get(
    "/api/lms/courses/:courseId/weekly-progress",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const access = await assertCourseVisible(req.user, courseId);
      res.json({
        weeks: await weeklyProgress({ courseId }),
        access: { canManage: access.canManage },
        serverTime: new Date().toISOString(),
      });
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Course templates                                                    */
/* ------------------------------------------------------------------ */

function registerTemplates(app) {
  app.get(
    "/api/lms/templates",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const rows = await CourseTemplate.find({ archivedAt: null })
        .sort({ updatedAt: -1 })
        .lean();
      res.json({
        templates: rows.map((row) => ({
          id: String(row._id),
          code: row.code,
          name: row.name,
          description: row.description || "",
          program: row.program || null,
          semester: row.semester ?? null,
          credits: row.credits ?? null,
          weekCount: row.weeks?.length || 0,
          sourceCourse: row.sourceCourse ? String(row.sourceCourse) : null,
          updatedAt: row.updatedAt || null,
        })),
      });
    }),
  );

  /** Saves the current course plan as a reusable template. */
  app.post(
    "/api/lms/templates",
    requireAuth,
    requirePermission("lms.template.manage"),
    route(async (req, res) => {
      const courseId = requireObjectId((req.body || {}).courseId, "Course");
      await assertCanManageCourse(req.user, courseId);
      const body = req.body || {};

      const course = await Course.findById(courseId)
        .select("code name program semester credits description")
        .lean();
      if (!course) throw notFound("Course not found.");

      const weeks = await CourseWeek.find({ course: courseId })
        .sort({ position: 1, weekNumber: 1 })
        .lean();

      const template = await CourseTemplate.create({
        sourceCourse: courseId,
        sourceWeekCount: weeks.length,
        code: requireText(body.code, "Template code", 20).toUpperCase(),
        name: requireText(body.name, "Template name"),
        description: optionalString(body.description, "Description", { max: 4000 }) || course.description || "",
        program: course.program || null,
        semester: course.semester ?? null,
        credits: course.credits ?? null,
        weeks: await buildTemplateWeeks(courseId, weeks),
        createdBy: req.user._id || req.user.id,
      });

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "COURSE_TEMPLATE_SAVED",
        module: "lms",
        resource: "course_template",
        resourceId: template._id.toString(),
        newValue: { code: template.code, weeks: template.weeks.length },
        details: `Course plan for ${course.code} saved as template ${template.code}.`,
      });

      res.status(201).json({
        template: {
          id: String(template._id),
          code: template.code,
          name: template.name,
          weekCount: template.weeks.length,
        },
      });
    }),
  );

  /**
   * Applies a template to a course as draft weeks.
   *
   * Material and quiz references are stored as *suggestions*: the planner shows
   * the teacher what the standard course expected, and the teacher attaches real
   * files and real questions. Student records are never copied.
   */
  app.post(
    "/api/lms/templates/:templateId/apply",
    requireAuth,
    requirePermission("lms.template.manage"),
    route(async (req, res) => {
      const template = await CourseTemplate.findById(
        requireObjectId(req.params.templateId, "Template"),
      );
      if (!template) throw notFound("Course template not found.");
      const courseId = requireObjectId((req.body || {}).courseId, "Course");
      const scope = await assertCanManageCourse(req.user, courseId);

      const last = await CourseWeek.findOne({ course: courseId })
        .sort({ weekNumber: -1 })
        .select("weekNumber")
        .lean();
      let nextNumber = (last?.weekNumber || 0) + 1;

      const created = [];
      for (const source of template.weeks || []) {
        const week = await CourseWeek.create({
          course: courseId,
          weekNumber: nextNumber,
          title: source.title,
          description: source.description || "",
          teachingPlan: source.teachingPlan || "",
          expectedOutcome: source.expectedOutcome || "",
          studyTimeMinutes: source.studyTimeMinutes ?? null,
          position: nextNumber,
          semester: scope.semester ?? null,
          sectionCodes: scope.sectionCodes || [],
          status: "DRAFT",
          createdBy: req.user._id || req.user.id,
          updatedBy: req.user._id || req.user.id,
        });

        const objectives = Array.isArray(source.objectives) ? source.objectives : [];
        if (objectives.length) {
          await LearningObjective.insertMany(
            objectives.map((objective, index) => ({
              course: courseId,
              week: week._id,
              text: typeof objective === "string" ? objective : objective.text,
              code: typeof objective === "string" ? null : objective.code || null,
              position: index + 1,
              createdBy: req.user._id || req.user.id,
            })),
          );
        }
        created.push(week);
        nextNumber += 1;
      }

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "COURSE_TEMPLATE_APPLIED",
        module: "lms",
        resource: "course_template",
        resourceId: template._id.toString(),
        newValue: { courseId: String(courseId), weeks: created.length },
        details: `Template ${template.code} applied: ${created.length} draft week(s) created.`,
      });

      res.status(201).json({
        success: true,
        weeksCreated: created.length,
        weeks: created.map((week) => serialiseWeek(week)),
      });
    }),
  );
}

/** Captures a week's structure, naming the artefacts as suggestions. */
async function buildTemplateWeeks(courseId, weeks) {
  const weekIds = weeks.map((week) => week._id);
  const [objectives, materials, assignments, quizzes] = await Promise.all([
    LearningObjective.find({ week: { $in: weekIds } }).sort({ position: 1 }).lean(),
    LearningMaterial.find({ week: { $in: weekIds } }).select("title materialType").lean(),
    Assignment.find({ week: { $in: weekIds } }).select("title assignmentType maxMarks").lean(),
    Quiz.find({ week: { $in: weekIds } }).select("title maxMarks passingMarks").lean(),
  ]);

  return weeks.map((week) => ({
    sourceWeekNumber: week.weekNumber,
    title: week.title,
    description: week.description || "",
    teachingPlan: week.teachingPlan || "",
    expectedOutcome: week.expectedOutcome || "",
    studyTimeMinutes: week.studyTimeMinutes ?? null,
    objectives: objectives
      .filter((objective) => String(objective.week) === String(week._id))
      .map((objective) => ({
        text: objective.text,
        code: objective.code || null,
      })),
    materials: materials
      .filter((material) => String(material.week) === String(week._id))
      .map((material) => ({
        title: material.title,
        materialType: material.materialType,
      })),
    assignments: assignments
      .filter((assignment) => String(assignment.week) === String(week._id))
      .map((assignment) => ({
        title: assignment.title,
        assignmentType: assignment.assignmentType,
        maxMarks: assignment.maxMarks ?? 100,
      })),
    quizzes: quizzes
      .filter((quiz) => String(quiz.week) === String(week._id))
      .map((quiz) => ({
        title: quiz.title,
        maxMarks: quiz.maxMarks ?? 0,
        passingMarks: quiz.passingMarks ?? 0,
      })),
  }));
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Question counts per quiz, so the planner can show "8 questions · 20 marks". */
async function countQuestionsByQuiz(quizIds) {
  if (!quizIds?.length) return new Map();
  const rows = await QuizQuestion.aggregate([
    { $match: { quiz: { $in: quizIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } },
    { $group: { _id: "$quiz", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

/** A teacher may narrow the view to sections they actually teach. */
function resolveRequestedSections(access, requested) {
  if (!requested) return access.sections || [];
  const requestedList = toStringList(requested, { upper: true, maxItems: 40 });
  const allowed = access.sections || [];
  if (!allowed.length) return requestedList;
  const granted = requestedList.filter((code) => allowed.includes(code));
  return granted.length ? granted : allowed;
}

function requireText(value, label, max = 180) {
  const text = String(value ?? "").trim();
  if (text.length < 2) {
    throw validationError(`${label} is required.`, [
      { field: label.toLowerCase().replace(/\s+/g, ""), message: `Enter a ${label.toLowerCase()}.` },
    ]);
  }
  if (text.length > max) {
    throw validationError(`${label} must be ${max} characters or fewer.`, [
      { field: label.toLowerCase().replace(/\s+/g, ""), message: `Keep the ${label.toLowerCase()} under ${max} characters.` },
    ]);
  }
  return text;
}

function toOptionalDate(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validationError(`${label} must be a valid date and time.`, [
      { field: "releaseAt", message: "Enter a valid date and time." },
    ]);
  }
  return date;
}

function requireWeekStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  if (!WEEK_STATUSES.includes(status)) {
    throw validationError(`Week status must be one of: ${WEEK_STATUSES.join(", ")}.`, [
      { field: "status", message: "Choose a valid week status." },
    ]);
  }
  return status;
}

function requireEnumValue(value, label, allowed) {
  const normalised = String(value || "").trim().toUpperCase();
  if (!allowed.includes(normalised)) {
    throw validationError(`${label} must be one of: ${allowed.join(", ")}.`, [
      { field: "status", message: `Choose a valid ${label.toLowerCase()}.` },
    ]);
  }
  return normalised;
}

export { serialiseWeek, loadWeeks };