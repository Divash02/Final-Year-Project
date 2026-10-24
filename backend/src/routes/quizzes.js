import {
  AUTO_GRADED_TYPES,
  Course,
  CourseWeek,
  MANUAL_GRADED_TYPES,
  Quiz,
  QuizAttempt,
  QuizQuestion,
  Student,
  MULTI_SELECT_GRADING,
  QUESTION_DIFFICULTIES,
  QUESTION_TYPES,
  QUIZ_STATUSES,
  RESULT_RELEASE_POLICIES,
} from "../models/index.js";
import { logAudit } from "../db.js";
import { getUserRoles } from "../db.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  route,
  notFound,
  forbidden,
  conflict,
  validationError,
} from "../utils/apiError.js";
import { hasPermission } from "../permissions/catalog.js";
import {
  optionalBoolean,
  optionalEnum,
  optionalString,
  toInt,
  toNumber,
  toStringList,
  requireObjectId,
} from "../utils/validate.js";
import {
  assertCanManageCourse,
  canManageCourseContent,
  resolveCourseScope,
} from "../services/lms/lmsAccess.js";
import { notifyOnce, notifyStudents } from "../services/lms/notifier.js";
import {
  areResultsReleased,
  buildQuestionOrder,
  deriveQuizAvailability,
  finaliseAttempt,
  projectQuestionForAttempt,
  quizTimingPayload,
  recalculateAttemptMarks,
  refreshQuizProgress,
  resolveQuizCohort,
  syncQuizLifecycle,
} from "../services/lms/quizEngine.js";
import { syncQuizAttemptGrade } from "../services/lms/gradebook.js";
import { questionInsights } from "../services/lms/analytics.js";
import { formatForAudit } from "../services/academicClock.js";

const DEFAULT_ACADEMIC_YEAR =
  process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR || "2025/2026";

/**
 * Quiz authoring, sitting and grading.
 *
 * This router is the HTTP edge of `services/lms/quizEngine.js`. The engine owns
 * every academic rule about a quiz — when it opens, how long an attempt lasts,
 * what a mark is, what a student may see — and this module's only job is to
 * carry an authenticated, authorised request into it and carry the result back.
 *
 * The rules this module enforces itself are the ones about *identity and scope*:
 *
 *  - a teacher may only author and grade a quiz in a course they are assigned to
 *    teach, and a bank question belongs to the course it was written for;
 *  - a student may only sit a quiz addressed to their own enrolment, and only
 *    ever their own attempts — the student record comes from the session, never
 *    from a request parameter;
 *  - the marking key (`correctAnswer`) is written and read only through teacher
 *    routes; every student-facing projection goes through
 *    `quizEngine.projectQuestionForAttempt`, which is the single place that
 *    decides what leaves the server for a paper;
 *  - once a quiz has been sat, its questions and marks are frozen: changing a
 *    paper that students have already answered would rewrite their record.
 *
 * A quiz is never advanced by the browser. `POST /status` records the teacher's
 * decision, but opening, closing and automatic submission are re-derived from the
 * server clock on every read and write, and the delivery sweep performs the same
 * transitions on its own.
 */
export function registerQuizRoutes(app) {
  registerQuestionBank(app);
  registerQuizAuthoring(app);
  registerQuizAttemptRuntime(app);
  registerQuizGrading(app);
}

/* ------------------------------------------------------------------ */
/* Shared resolution helpers                                           */
/* ------------------------------------------------------------------ */

/** Flattens a course scope the way the LMS views expect it. */
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
  };
}

/** Loads a quiz the caller is allowed to author. */
async function loadQuizForManager(req, paramName = "quizId", label = "Quiz") {
  const quiz = await Quiz.findById(requireObjectId(req.params[paramName], label));
  if (!quiz) throw notFound(`${label} not found.`);
  const access = viewAccess(
    await assertCanManageCourse(req.user, quiz.course, {
      sectionCodes: quiz.sectionCodes,
      semester: quiz.semester ?? undefined,
    }),
  );
  return { quiz, access };
}

/** Loads a quiz by id without checking scope yet. */
async function loadQuiz(req, paramName = "quizId", label = "Quiz") {
  const quiz = await Quiz.findById(requireObjectId(req.params[paramName], label));
  if (!quiz) throw notFound(`${label} not found.`);
  return quiz;
}

/**
 * Resolves the signed-in account as a student of the quiz's course.
 *
 * Enrolment is checked against the quiz's own semester, so a student who has
 * moved on to the next semester cannot sit a quiz addressed to an earlier one —
 * and a section the quiz was not written for is refused explicitly rather than
 * silently producing an empty paper.
 */
async function resolveStudentForQuiz(req, quiz) {
  const scope = await resolveCourseScope(req.user, quiz.course, {
    semester: quiz.semester ?? undefined,
  });
  if (scope.role !== "student" || !scope.student || !scope.enrollment) {
    throw notFound("Quiz not found.");
  }

  const section = scope.enrollment.sectionCode || null;
  const addressed = (quiz.sectionCodes || []).map((code) => String(code).toUpperCase());
  if (addressed.length && section && !addressed.includes(String(section).toUpperCase())) {
    throw notFound("Quiz not found.");
  }

  return {
    student: scope.student,
    enrollment: scope.enrollment,
    section,
    userId: req.user._id || req.user.id,
  };
}

/** Questions of a quiz, ordered by position. */
async function loadQuizQuestions(quizId) {
  return await QuizQuestion.find({ quiz: quizId }).sort({ position: 1, createdAt: 1 });
}

/** Total marks implied by the questions actually on the paper. */
async function sumQuestionMarks(quizId) {
  const rows = await QuizQuestion.aggregate([
    { $match: { quiz: quizId } },
    { $group: { _id: null, marks: { $sum: "$marks" }, count: { $sum: 1 } } },
  ]);
  return {
    marks: Math.round((rows[0]?.marks || 0) * 100) / 100,
    count: rows[0]?.count || 0,
  };
}

/**
 * A paper that students have already sat must not change shape.
 *
 * Removing a question or re-marking one after an attempt exists would make the
 * stored attempt describe a paper that no longer existed, so the router refuses
 * instead. Editing prose is still allowed: a typo fix is not a re-mark.
 */
async function assertQuizEditable(quiz) {
  const attempts = await QuizAttempt.countDocuments({ quiz: quiz._id });
  if (attempts > 0 || !["DRAFT", "SCHEDULED"].includes(quiz.status)) {
    throw conflict(
      "This quiz has already been sat or opened. Its questions and marks can no longer be changed.",
    );
  }
  if (quiz.archivedAt) {
    throw conflict("An archived quiz cannot be edited. Restore it first.");
  }
}

/** Requires at least one question before a quiz may leave the draft stage. */
async function assertQuizHasQuestions(quiz) {
  const { count } = await sumQuestionMarks(quiz._id);
  if (!count) {
    throw validationError("Add at least one question before this quiz can be scheduled or opened.", [
      { field: "questions", message: "The paper is empty." },
    ]);
  }
  return count;
}

/* ------------------------------------------------------------------ */
/* Question bank                                                       */
/* ------------------------------------------------------------------ */

/**
 * The reusable question bank.
 *
 * A bank question is `quiz: null`: it belongs to a course and can be copied into
 * any later quiz in that course. Copying is always a copy — the quiz gets its
 * own document with `bankOriginId` recorded — so editing a paper can never
 * rewrite a question another quiz, or a quiz that already ran, still points at.
 */
function registerQuestionBank(app) {
  app.get(
    "/api/lms/questions",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.query.courseId, "Course");
      // Users with lms.quiz.manage permission can access question bank for any course
      const scope = {
        role: "manager",
        course: await Course.findById(courseId),
        sections: null,
      };
      const access = viewAccess(scope);
      if (!access.canManage) {
        throw forbidden("Only course teachers can browse the question bank.");
      }

      const filter = { course: courseId, quiz: null };
      const type = optionalEnum(req.query.type, "Question type", QUESTION_TYPES, { upper: true });
      if (type) filter.type = type;
      const difficulty = optionalEnum(req.query.difficulty, "Difficulty", QUESTION_DIFFICULTIES, {
        upper: true,
      });
      if (difficulty) filter.difficulty = difficulty;
      const topic = optionalString(req.query.topic, "Topic", { max: 160 });
      if (topic) filter.topic = topic;
      const search = optionalString(req.query.q, "Search", { max: 120 });
      if (search) filter.text = { $regex: escapeRegExp(search), $options: "i" };

      const questions = await QuizQuestion.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(toInt(req.query.limit, "Limit", { min: 1, max: 200, fallback: 100 }))
        .lean();

      res.json({
        questions: questions.map(serialiseQuestionForManager),
        courseId: String(courseId),
        total: questions.length,
      });
    }),
  );

  app.post(
    "/api/lms/questions",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const body = req.body || {};
      const courseId = requireObjectId(body.courseId, "Course");
      await assertCanManageCourse(req.user, courseId);

      const question = await QuizQuestion.create(buildQuestionFields({ body, courseId, actor: req.user }));
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_QUESTION_CREATED",
        module: "lms",
        resource: "quiz_question",
        resourceId: question._id.toString(),
        newValue: { type: question.type, marks: question.marks, inBank: true },
        details: `Bank question added (${question.type}, ${question.marks} mark(s)).`,
      });

      res.status(201).json({ question: serialiseQuestionForManager(question.toObject()) });
    }),
  );

  app.get(
    "/api/lms/questions/:questionId",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const question = await QuizQuestion.findById(
        requireObjectId(req.params.questionId, "Question"),
      );
      if (!question) throw notFound("Question not found.");
      await assertCanManageCourse(req.user, question.course);
      res.json({ question: serialiseQuestionForManager(question.toObject()) });
    }),
  );

  app.patch(
    "/api/lms/questions/:questionId",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const question = await QuizQuestion.findById(
        requireObjectId(req.params.questionId, "Question"),
      );
      if (!question) throw notFound("Question not found.");
      await assertCanManageCourse(req.user, question.course);

      if (question.quiz) {
        await assertQuizEditable(await Quiz.findById(question.quiz));
      }

      const before = { text: question.text, marks: question.marks, type: question.type };
      Object.assign(
        question,
        buildQuestionFields({
          body: req.body || {},
          courseId: question.course,
          actor: req.user,
          base: question.toObject(),
        }),
      );
      await question.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_QUESTION_UPDATED",
        module: "lms",
        resource: "quiz_question",
        resourceId: String(question._id),
        oldValue: before,
        newValue: { text: question.text, marks: question.marks, type: question.type },
        details: `Question updated.`,
      });

      res.json({ question: serialiseQuestionForManager(question.toObject()) });
    }),
  );

  app.delete(
    "/api/lms/questions/:questionId",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const question = await QuizQuestion.findById(
        requireObjectId(req.params.questionId, "Question"),
      );
      if (!question) throw notFound("Question not found.");
      await assertCanManageCourse(req.user, question.course);

      if (question.quiz) {
        const quiz = await Quiz.findById(question.quiz);
        if (quiz) {
          await assertQuizEditable(quiz);
          await reindexQuizQuestions(quiz);
        }
      }

      await question.deleteOne();
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_QUESTION_REMOVED",
        module: "lms",
        resource: "quiz_question",
        resourceId: String(question._id),
        details: "Question removed.",
      });

      res.json({ success: true });
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Quiz authoring                                                      */
/* ------------------------------------------------------------------ */

/**
 * The quiz list for a course.
 *
 * A teacher sees every paper they own in the course; a student sees the papers
 * addressed to them, each carrying only the derived availability and their own
 * attempt history. The two shapes are deliberately different: there is no
 * branch in which a student response includes a question body or a mark.
 */
function registerQuizAuthoring(app) {
  app.get(
    "/api/lms/courses/:courseId/quizzes",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const courseId = requireObjectId(req.params.courseId, "Course");
      const scope = await resolveCourseScope(req.user, courseId, {
        semester: req.query.semester
          ? toInt(req.query.semester, "Semester", { min: 1, max: 12 })
          : undefined,
      });
      if (scope.role === "none") throw notFound("Course not found.");
      const access = viewAccess(scope);

      const filter = { course: courseId };
      if (req.query.weekId) filter.week = requireObjectId(req.query.weekId, "Week");
      if (req.query.includeArchived !== "true") filter.archivedAt = null;

      const quizzes = await Quiz.find(filter).sort({ openAt: 1, createdAt: 1 }).lean();

      if (access.canManage) {
        const counts = await countQuestionsPerQuiz(quizzes.map((quiz) => quiz._id));
        return res.json({
          quizzes: quizzes.map((quiz) =>
            serialiseQuizForManager(quiz, counts.get(String(quiz._id)) || null),
          ),
          access: { canManage: true, sections: access.sections },
          serverTime: new Date().toISOString(),
        });
      }

      const student = await Student.findOne({ user: req.user._id || req.user.id }).select(
        "_id studentId",
      );
      if (!student) throw notFound("Student record not found.");
      const addressed = quizzes.filter((quiz) => isQuizAddressedToStudent(quiz, {
        section: access.enrolledSection,
        studentUserId: String(req.user._id || req.user.id),
      }));
      const attempts = await QuizAttempt.find({
        quiz: { $in: addressed.map((quiz) => quiz._id) },
        student: student._id,
      })
        .select("quiz status attemptNumber awardedMarks percentage pendingManualCount")
        .lean();
      const byQuiz = new Map();
      for (const attempt of attempts) {
        const key = String(attempt.quiz);
        const list = byQuiz.get(key) || [];
        list.push(attempt);
        byQuiz.set(key, list);
      }
      const studentCounts = await countQuestionsPerQuiz(addressed.map((quiz) => quiz._id));

      return res.json({
        quizzes: addressed.map((quiz) =>
          serialiseQuizForStudent(quiz, byQuiz.get(String(quiz._id)) || [], {
            questionCount: studentCounts.get(String(quiz._id))?.count ?? null,
          }),
        ),
        access: { canManage: false, sections: access.sections },
        serverTime: new Date().toISOString(),
      });
    }),
  );

  /** Creates a draft quiz. Nothing is visible to a student until it is published. */
  app.post(
    "/api/lms/courses/:courseId/quizzes",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
const courseId = requireObjectId(req.params.courseId, "Course");
const body = req.body || {};

const course = await Course.findById(courseId)
        .select("code program semester academicYear status")
        .lean();
      if (!course) throw notFound("Course not found.");

      const weekId = requireObjectId(body.weekId, "Week");
      const week = await CourseWeek.findById(weekId)
        .select("course weekNumber title semester")
        .lean();
      if (!week || String(week.course) !== String(courseId)) {
        throw validationError("That week does not belong to this course.", [
          { field: "weekId", message: "Choose a week of this course." },
        ]);
      }

      const semester = body.semester
        ? toInt(body.semester, "Semester", { min: 1, max: 12 })
        : (week.semester ?? course.semester ?? null);

      // The cohort is resolved before authorisation so the shared helper can
      // reject a teacher who is addressing a section they do not teach.
      const requestedSections = toStringList(body.sectionCodes, { upper: true, maxItems: 40 });
      // Users with lms.quiz.manage permission can create quizzes in any course
      const access = viewAccess(
        await assertCanManageCourse(req.user, courseId, {
          sectionCodes: requestedSections,
          semester: semester ?? undefined,
        }),
      );
      const sectionCodes = requestedSections.length ? requestedSections : access.sectionCodes;

      const openAt = requireInstant(body.openAt, "Open time", "openAt");
      const closeAt = requireInstant(body.closeAt, "Close time", "closeAt");
      assertWindowIsSane(openAt, closeAt);

      const durationMinutes = toInt(body.durationMinutes, "Duration", {
        min: 1,
        max: 600,
        fallback: 30,
      });
      const suppliedQuestions = Array.isArray(body.questions) ? body.questions : [];
      const declaredMarks = body.maxMarks !== undefined
        ? toNumber(body.maxMarks, "Maximum marks", { min: 0, max: 1000 })
        : null;
      const maxMarks =
        declaredMarks !== null
          ? declaredMarks
          : suppliedQuestions.reduce(
              (sum, question) => sum + (Number(question?.marks) || 0),
              0,
            );

      const quiz = await Quiz.create({
        course: courseId,
        week: weekId,
        facultyUser: req.user._id || req.user.id,
        title: requireText(body.title, "Quiz title"),
        description: optionalString(body.description, "Description", { max: 8000 }) || "",
        instructions: optionalString(body.instructions, "Instructions", { max: 8000 }) || "",
        maxMarks,
        passingMarks: toNumber(body.passingMarks, "Passing marks", {
          min: 0,
          max: 1000,
          fallback: 0,
        }),
        durationMinutes,
        attemptsAllowed: toInt(body.attemptsAllowed, "Attempts allowed", {
          min: 1,
          max: 20,
          fallback: 1,
        }),
        randomizeQuestions: optionalBoolean(body.randomizeQuestions, "Randomise questions") ?? false,
        randomizeOptions: optionalBoolean(body.randomizeOptions, "Randomise options") ?? false,
        allowBackNavigation: optionalBoolean(body.allowBackNavigation, "Allow going back") ?? true,
        allowReviewBeforeSubmit:
          optionalBoolean(body.allowReviewBeforeSubmit, "Allow review before submit") ?? true,
        navigationMethod:
          optionalEnum(body.navigationMethod, "Navigation method", ["FREE", "SEQUENTIAL"], {
            upper: true,
          }) || "FREE",
        allowReopenExpired: optionalBoolean(body.allowReopenExpired, "Allow reopening expired attempts") ?? true,
        multipleSelectGrading:
          optionalEnum(body.multipleSelectGrading, "Multiple-select grading", MULTI_SELECT_GRADING, {
            upper: true,
          }) || "EXACT",
        blankAnswerCaseSensitive:
          optionalBoolean(body.blankAnswerCaseSensitive, "Case-sensitive blanks") ?? false,
        resultReleasePolicy:
          optionalEnum(body.resultReleasePolicy, "Result release policy", RESULT_RELEASE_POLICIES, {
            upper: true,
          }) || "AFTER_GRADING",
        showCorrectAnswers: optionalBoolean(body.showCorrectAnswers, "Show correct answers") ?? false,
        openAt,
        closeAt,
        academicYear:
          optionalString(body.academicYear, "Academic year", { max: 20 }) ||
          course.academicYear ||
          DEFAULT_ACADEMIC_YEAR,
        program: optionalString(body.program, "Programme", { max: 20 }) || course.program || null,
        semester: body.semester
          ? toInt(body.semester, "Semester", { min: 1, max: 12 })
          : week.semester ?? course.semester ?? null,
        sectionCodes,
        audience: body.audience,
        status: "DRAFT",
        updatedBy: req.user._id || req.user.id,
      });

      // Questions may be supplied with the quiz so a teacher can build a paper
      // in one request; each still passes through the same validation as a
      // separately created one.
      for (const [index, draft] of suppliedQuestions.entries()) {
        await QuizQuestion.create({
          ...buildQuestionFields({ body: draft, courseId, actor: req.user }),
          week: weekId,
          quiz: quiz._id,
          position: index + 1,
          createdBy: req.user._id || req.user.id,
        });
      }
      const totals = await sumQuestionMarks(quiz._id);
      if (!declaredMarks && totals.marks > 0) quiz.maxMarks = totals.marks;
      await quiz.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_CREATED",
        module: "lms",
        resource: "quiz",
        resourceId: quiz._id.toString(),
        newValue: {
          title: quiz.title,
          maxMarks: quiz.maxMarks,
          questions: totals.count,
          openAt: quiz.openAt,
          closeAt: quiz.closeAt,
        },
        details: `Quiz "${quiz.title}" created as a draft with ${totals.count} question(s).`,
      });

      res.status(201).json(await serialiseQuizDetailForManager(quiz));
    }),
  );

  /** Quiz detail: the paper and its keys for a teacher, or the student's sheet. */
  app.get(
    "/api/lms/quizzes/:quizId",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const quiz = await loadQuiz(req);

      const scope = await resolveCourseScope(req.user, quiz.course, {
        semester: quiz.semester ?? undefined,
      });
      if (scope.role === "none") throw notFound("Quiz not found.");
      const access = viewAccess(scope);

      if (access.canManage) {
        return res.json(await serialiseQuizDetailForManager(quiz));
      }

      const student = await resolveStudentForQuiz(req, quiz);
      const attempts = await QuizAttempt.find({
        quiz: quiz._id,
        student: student.student._id,
      })
        .sort({ attemptNumber: -1 })
        .lean();
      const availability = deriveQuizAvailability(quiz);
      const used = attempts.filter((attempt) => attempt.status !== "IN_PROGRESS").length;
      const live = attempts.find((attempt) => attempt.status === "IN_PROGRESS");

      return res.json({
        quiz: serialiseQuizForStudent(quiz, attempts),
        availability: {
          availability: availability.availability,
          reason: availabilityReason(availability),
          msUntilClose: availability.msUntilClose,
        },
        attempt: live ? serialiseAttemptSummary(live) : null,
        canStart:
          Boolean(live) ||
          (availability.acceptsAttempts &&
            used < (quiz.attemptsAllowed || 1) &&
            !quiz.archivedAt),
        attemptsAllowed: quiz.attemptsAllowed || 1,
        attemptsUsed: used,
        timing: await quizTimingPayload(quiz),
        serverTime: new Date().toISOString(),
      });
    }),
  );

  app.patch(
    "/api/lms/quizzes/:quizId",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const { quiz, access } = await loadQuizForManager(req);
      const body = req.body || {};

      if (quiz.archivedAt) {
        throw conflict("An archived quiz cannot be edited. Restore it first.");
      }
      const changingThePaper = ["maxMarks", "passingMarks", "durationMinutes", "attemptsAllowed"]
        .some((field) => body[field] !== undefined);
      if (changingThePaper && !["DRAFT", "SCHEDULED"].includes(quiz.status)) {
        const attempts = await QuizAttempt.countDocuments({ quiz: quiz._id });
        if (attempts > 0) {
          throw conflict(
            "This quiz has already been sat, so its marks and duration can no longer be changed.",
          );
        }
      }

      const before = {
        title: quiz.title,
        maxMarks: quiz.maxMarks,
        openAt: quiz.openAt,
        closeAt: quiz.closeAt,
        status: quiz.status,
      };

      if (body.title !== undefined) quiz.title = requireText(body.title, "Quiz title");
      if (body.description !== undefined) {
        quiz.description = optionalString(body.description, "Description", { max: 8000 }) || "";
      }
      if (body.instructions !== undefined) {
        quiz.instructions = optionalString(body.instructions, "Instructions", { max: 8000 }) || "";
      }
      if (body.maxMarks !== undefined) {
        quiz.maxMarks = toNumber(body.maxMarks, "Maximum marks", { min: 0, max: 1000 });
      }
      if (body.passingMarks !== undefined) {
        quiz.passingMarks = toNumber(body.passingMarks, "Passing marks", { min: 0, max: 1000 });
      }
      if (body.durationMinutes !== undefined) {
        quiz.durationMinutes = toInt(body.durationMinutes, "Duration", { min: 1, max: 600 });
      }
      if (body.attemptsAllowed !== undefined) {
        quiz.attemptsAllowed = toInt(body.attemptsAllowed, "Attempts allowed", { min: 1, max: 20 });
      }
      if (body.randomizeQuestions !== undefined) {
        quiz.randomizeQuestions = optionalBoolean(body.randomizeQuestions, "Randomise questions") ?? false;
      }
      if (body.randomizeOptions !== undefined) {
        quiz.randomizeOptions = optionalBoolean(body.randomizeOptions, "Randomise options") ?? false;
      }
      if (body.allowBackNavigation !== undefined) {
        quiz.allowBackNavigation = optionalBoolean(body.allowBackNavigation, "Allow going back") ?? true;
      }
      if (body.allowReviewBeforeSubmit !== undefined) {
        quiz.allowReviewBeforeSubmit =
          optionalBoolean(body.allowReviewBeforeSubmit, "Allow review before submit") ?? true;
      }
      if (body.navigationMethod !== undefined) {
        quiz.navigationMethod = requireEnumValue(
          body.navigationMethod,
          "Navigation method",
          ["FREE", "SEQUENTIAL"],
        );
      }
      if (body.allowReopenExpired !== undefined) {
        quiz.allowReopenExpired = optionalBoolean(body.allowReopenExpired, "Allow reopening expired attempts") ?? true;
      }
      if (body.multipleSelectGrading !== undefined) {
        quiz.multipleSelectGrading = requireEnumValue(
          body.multipleSelectGrading,
          "Multiple-select grading",
          MULTI_SELECT_GRADING,
        );
      }
      if (body.blankAnswerCaseSensitive !== undefined) {
        quiz.blankAnswerCaseSensitive =
          optionalBoolean(body.blankAnswerCaseSensitive, "Case-sensitive blanks") ?? false;
      }
      if (body.resultReleasePolicy !== undefined) {
        quiz.resultReleasePolicy = requireEnumValue(
          body.resultReleasePolicy,
          "Result release policy",
          RESULT_RELEASE_POLICIES,
        );
      }
      if (body.showCorrectAnswers !== undefined) {
        quiz.showCorrectAnswers = optionalBoolean(body.showCorrectAnswers, "Show correct answers") ?? false;
      }
      if (body.sectionCodes !== undefined) {
        const requested = toStringList(body.sectionCodes, { upper: true, maxItems: 40 });
        if (access.role === "teacher" && access.sections.length) {
          const outside = requested.filter((code) => !access.sections.includes(code));
          if (outside.length) {
            throw forbidden(
              `You are assigned to teach section${access.sections.length > 1 ? "s" : ""} ${access.sections.join(", ")}, not ${outside.join(", ")}.`,
            );
          }
        }
        quiz.sectionCodes = requested;
      }
      if (body.openAt !== undefined || body.closeAt !== undefined) {
        if (!["DRAFT", "SCHEDULED"].includes(quiz.status)) {
          throw conflict(
            "The opening and closing times can only be changed before the quiz is open.",
          );
        }
        const openAt = body.openAt !== undefined
          ? requireInstant(body.openAt, "Open time", "openAt")
          : new Date(quiz.openAt);
        const closeAt = body.closeAt !== undefined
          ? requireInstant(body.closeAt, "Close time", "closeAt")
          : new Date(quiz.closeAt);
        assertWindowIsSane(openAt, closeAt);
        quiz.openAt = openAt;
        quiz.closeAt = closeAt;
      }

      quiz.updatedBy = req.user._id || req.user.id;
      await quiz.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_UPDATED",
        module: "lms",
        resource: "quiz",
        resourceId: quiz._id.toString(),
        oldValue: before,
        newValue: {
          title: quiz.title,
          maxMarks: quiz.maxMarks,
          openAt: quiz.openAt,
          closeAt: quiz.closeAt,
          status: quiz.status,
        },
        details: `Quiz "${quiz.title}" updated.`,
      });

      res.json({ quiz: await serialiseQuizDetailForManager(quiz) });
    }),
  );

  /**
   * Adds a question to a paper — either authored inline or copied from the bank.
   *
   * A bank copy is a new document, never a reference, which is what lets a
   * teacher improve the shared question without rewriting quizzes that already
   * used it.
   */
  app.post(
    "/api/lms/quizzes/:quizId/questions",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const { quiz } = await loadQuizForManager(req);
      await assertQuizEditable(quiz);
      const body = req.body || {};

      const bankQuestionId = body.bankQuestionId
        ? requireObjectId(body.bankQuestionId, "Bank question")
        : null;

      const position =
        (await QuizQuestion.countDocuments({ quiz: quiz._id })) + 1;

      let fields;
      if (bankQuestionId) {
        const source = await QuizQuestion.findById(bankQuestionId).lean();
        if (!source) throw notFound("Bank question not found.");
        if (String(source.course) !== String(quiz.course)) {
          throw validationError("That question belongs to a different course.", [
            { field: "bankQuestionId", message: "Choose a question from this course's bank." },
          ]);
        }
        if (source.quiz) {
          throw validationError("That question belongs to a quiz, not to the bank.", [
            { field: "bankQuestionId", message: "Choose a question from the bank." },
          ]);
        }
        fields = {
          ...buildQuestionFields({
            body: { type: source.type, text: source.text, marks: source.marks },
            courseId: quiz.course,
            actor: req.user,
          }),
          richText: source.richText || "",
          codeSnippet: source.codeSnippet || "",
          notation: source.notation || "",
          imageFileId: source.imageFileId || null,
          options: source.options || [],
          correctAnswer: source.correctAnswer || [],
          category: source.category || null,
          topic: source.topic || null,
          explanation: source.explanation || "",
          learningObjective: source.learningObjective || null,
          difficulty: source.difficulty,
        };
      } else {
        fields = buildQuestionFields({ body, courseId: quiz.course, actor: req.user });
      }

      const question = await QuizQuestion.create({
        ...fields,
        week: quiz.week,
        quiz: quiz._id,
        bankOriginId: bankQuestionId,
        position,
        createdBy: req.user._id || req.user.id,
      });

      if (bankQuestionId) {
        await QuizQuestion.updateOne({ _id: bankQuestionId }, { $inc: { usageCount: 1 } });
      }

      await logAudit({
        userId: req.user._id || req.user.id,
        action: bankQuestionId ? "QUIZ_QUESTION_COPIED" : "QUIZ_QUESTION_ADDED",
        module: "lms",
        resource: "quiz",
        resourceId: quiz._id.toString(),
        newValue: { questionId: String(question._id), position },
        details: bankQuestionId
          ? `Bank question copied into quiz "${quiz.title}".`
          : `Question added to quiz "${quiz.title}".`,
      });

      const totals = await sumQuestionMarks(quiz._id);
      res.status(201).json({
        question: serialiseQuestionForManager(question.toObject()),
        questionCount: totals.count,
        questionMarks: totals.marks,
      });
    }),
  );

  app.delete(
    "/api/lms/quizzes/:quizId/questions/:questionId",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const { quiz } = await loadQuizForManager(req);
      await assertQuizEditable(quiz);
      const question = await QuizQuestion.findById(
        requireObjectId(req.params.questionId, "Question"),
      );
      if (!question || String(question.quiz) !== String(quiz._id)) {
        throw notFound("Question not found.");
      }
      await question.deleteOne();
      await reindexQuizQuestions(quiz);

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_QUESTION_REMOVED",
        module: "lms",
        resource: "quiz",
        resourceId: quiz._id.toString(),
        details: `Question removed from quiz "${quiz.title}".`,
      });

      const totals = await sumQuestionMarks(quiz._id);
      res.json({ success: true, questionCount: totals.count, questionMarks: totals.marks });
    }),
  );

  /**
   * Reorders the questions on a paper by id order. The server reassigns
   * `position` 1..N, so drag-and-drop reordering in the builder never leaves a
   * gap and a student never sees a renumbering burden.
   */
  app.patch(
    "/api/lms/quizzes/:quizId/questions/reorder",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const { quiz } = await loadQuizForManager(req);
      await assertQuizEditable(quiz);
      const body = req.body || {};
      const ids = toStringList(body.questionIds, { maxItems: 500 });
      if (!ids.length) {
        throw validationError("No questions supplied to reorder.", [
          { field: "questionIds", message: "Provide at least one question." },
        ]);
      }
      const questions = await QuizQuestion.find({
        _id: { $in: ids.map((id) => requireObjectId(id, "Question")) },
        quiz: quiz._id,
      });
      if (questions.length !== ids.length) {
        throw validationError("Some questions do not belong to this quiz.", [
          { field: "questionIds", message: "Choose only questions on this paper." },
        ]);
      }
      const byId = new Map(questions.map((question) => [String(question._id), question]));
      let changed = false;
      for (let index = 0; index < ids.length; index += 1) {
        const question = byId.get(ids[index]);
        if (!question) continue;
        const next = index + 1;
        if ((question.position ?? 0) !== next) {
          question.position = next;
          await question.save();
          changed = true;
        }
      }
      if (!changed) {
        const totals = await sumQuestionMarks(quiz._id);
        return res.json({ success: true, questionCount: totals.count, questionMarks: totals.marks, reordered: false });
      }
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_QUESTIONS_REORDERED",
        module: "lms",
        resource: "quiz",
        resourceId: quiz._id.toString(),
        details: `Questions reordered in quiz "${quiz.title}".`,
      });
      const totals = await sumQuestionMarks(quiz._id);
      res.json({ success: true, questionCount: totals.count, questionMarks: totals.marks, reordered: true });
    }),
  );

  /**
   * The teacher's lifecycle decision.
   *
   * `SCHEDULED` hands the paper to the delivery sweep, `OPEN` starts it now and
   * `CLOSED` stops it now. Either way the stored status is reconciled against the
   * server clock on the same call, so a teacher who opens a quiz whose closing
   * time has already passed gets an honest closed quiz rather than one that
   * pretends to be open.
   */
  app.post(
    "/api/lms/quizzes/:quizId/status",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const { quiz } = await loadQuizForManager(req);
      const status = requireEnumValue((req.body || {}).status, "Status", QUIZ_STATUSES);
      const now = new Date();

      if (quiz.archivedAt) {
        throw conflict("An archived quiz cannot change state. Restore it first.");
      }
      if (status === "DRAFT") {
        throw conflict("A published quiz cannot be returned to draft once students may see it.", [
          { field: "status", message: "Choose schedule, open or close instead." },
        ]);
      }

      if (status === "SCHEDULED" || status === "OPEN") {
        await assertQuizHasQuestions(quiz);
        const totals = await sumQuestionMarks(quiz._id);
        if (quiz.maxMarks > 0 && totals.marks > 0 && totals.marks !== quiz.maxMarks) {
          // Reported, not silently reconciled: the declared maximum is the mark
          // students are told the paper is out of, so a mismatch has to be seen.
          throw validationError(
            `This paper carries ${totals.marks} mark(s) but the quiz is set to ${quiz.maxMarks}. Adjust the quiz maximum or the question marks.`,
            [{ field: "maxMarks", message: "Maximum marks does not match the paper." }],
          );
        }
        if (new Date(quiz.closeAt) <= now) {
          throw conflict(
            "The closing time has already passed, so this quiz cannot be scheduled or opened.",
          );
        }
      }

      if (status === "OPEN") {
        quiz.status = "OPEN";
        quiz.openedAt = now;
      } else if (status === "SCHEDULED") {
        quiz.status = "SCHEDULED";
        quiz.openedAt = null;
      } else if (status === "CLOSED") {
        quiz.status = "CLOSED";
        quiz.closedAt = now;
      } else if (status === "COMPLETED") {
        quiz.status = "COMPLETED";
        quiz.completedAt = quiz.completedAt || now;
      }
      quiz.updatedBy = req.user._id || req.user.id;
      await quiz.save();

      const reconciled = await syncQuizLifecycle(quiz, now);
      await refreshQuizProgress(quiz._id);

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_STATUS_CHANGED",
        module: "lms",
        resource: "quiz",
        resourceId: quiz._id.toString(),
        oldValue: { status: reconciled.storedStatus },
        newValue: { status: reconciled.quiz.status, requested: status },
        details: `Quiz "${quiz.title}" set to ${status} by the teacher at ${await formatForAudit(now)}.`,
      });

      const detail = await serialiseQuizDetailForManager(reconciled.quiz);
      res.json({
        quiz: detail.quiz,
        event: reconciled.event,
        timing: await quizTimingPayload(reconciled.quiz),
      });
    }),
  );

  /**
   * Releases results under a `MANUAL` release policy.
   *
   * This is a single state change rather than a broadcast: every later read of an
   * attempt re-evaluates `areResultsReleased`, so a released result appears
   * without anything being re-sent.
   */
  app.post(
    "/api/lms/quizzes/:quizId/release-results",
    requireAuth,
    requirePermission("lms.grade.manage"),
    route(async (req, res) => {
      const { quiz } = await loadQuizForManager(req);
      if (quiz.resultReleasePolicy !== "MANUAL") {
        throw conflict(
          "This quiz releases results automatically; there is nothing to release manually.",
        );
      }
      const pending = await QuizAttempt.countDocuments({
        quiz: quiz._id,
        status: { $in: ["SUBMITTED", "AUTO_SUBMITTED"] },
        pendingManualCount: { $gt: 0 },
      });
      if (pending > 0) {
        throw conflict(
          `${pending} attempt(s) still have answers waiting to be marked, so the results are not complete.`,
        );
      }

      const released = optionalBoolean((req.body || {}).released, "Released") ?? true;
      quiz.resultsReleasedAt = released ? new Date() : null;
      quiz.resultsReleasedBy = released ? req.user._id || req.user.id : null;
      quiz.updatedBy = req.user._id || req.user.id;
      await quiz.save();
      await refreshQuizProgress(quiz._id);

      const cohort = await resolveQuizCohort(quiz);
      if (released && cohort.length) {
        await notifyStudents({
          students: cohort,
          title: `Results released: ${quiz.title}`,
          message: `Your result for ${quiz.title} is now available.`,
          keyPrefix: `quiz_results_${quiz._id}`,
          category: "lms_grade",
          actionUrl: `/learning/course/${quiz.course}?quiz=${quiz._id}`,
        });
      }

      await logAudit({
        userId: req.user._id || req.user.id,
        action: released ? "QUIZ_RESULTS_RELEASED" : "QUIZ_RESULTS_WITHHELD",
        module: "lms",
        resource: "quiz",
        resourceId: quiz._id.toString(),
        newValue: { released, recipients: released ? cohort.length : 0 },
        details: released
          ? `Results for "${quiz.title}" released to ${cohort.length} student(s).`
          : `Results for "${quiz.title}" withheld again.`,
      });

      res.json({
        success: true,
        quiz: await serialiseQuizDetailForManager(await Quiz.findById(quiz._id)),
      });
    }),
  );

  /**
   * Retires a quiz.
   *
   * A quiz that has been sat is archived rather than deleted: attempts, grades
   * and the audit trail must keep resolving. An untouched draft is genuinely
   * removed, because nothing references it.
   */
  app.delete(
    "/api/lms/quizzes/:quizId",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const { quiz } = await loadQuizForManager(req);
      const attempts = await QuizAttempt.countDocuments({ quiz: quiz._id });

      if (attempts > 0 || quiz.status !== "DRAFT") {
        quiz.archivedAt = quiz.archivedAt || new Date();
        quiz.archivedBy = req.user._id || req.user.id;
        quiz.updatedBy = req.user._id || req.user.id;
        await quiz.save();
        await logAudit({
          userId: req.user._id || req.user.id,
          action: "QUIZ_ARCHIVED",
          module: "lms",
          resource: "quiz",
          resourceId: quiz._id.toString(),
          newValue: { attempts },
          details: `Quiz "${quiz.title}" archived with ${attempts} attempt(s) preserved.`,
        });
        return res.json({
          success: true,
          archived: true,
          quiz: serialiseQuizForManager(quiz, { attempts }),
          reason: "Quiz has assessed work and was archived instead of deleted.",
        });
      }

      await QuizQuestion.deleteMany({ quiz: quiz._id });
      await quiz.deleteOne();
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_DELETED",
        module: "lms",
        resource: "quiz",
        resourceId: String(quiz._id),
        details: `Empty draft quiz "${quiz.title}" deleted.`,
      });
      return res.json({ success: true, archived: false, quiz: { id: String(quiz._id) } });
    }),
  );

  /** Per-question difficulty, computed from the attempts that really happened. */
  app.get(
    "/api/lms/quizzes/:quizId/insights",
    requireAuth,
    requirePermission("lms.analytics.view"),
    route(async (req, res) => {
      const { quiz } = await loadQuizForManager(req);
      res.json({
        ...(await questionInsights({ courseId: quiz.course, quizId: quiz._id })),
        quizId: String(quiz._id),
        serverTime: new Date().toISOString(),
      });
    }),
  );
}

/** Question count and total marks per quiz, for the teacher's list view. */
async function countQuestionsPerQuiz(quizIds) {
  if (!quizIds?.length) return new Map();
  const rows = await QuizQuestion.aggregate([
    { $match: { quiz: { $in: quizIds } } },
    {
      $group: {
        _id: "$quiz",
        count: { $sum: 1 },
        marks: { $sum: "$marks" },
        objective: { $sum: { $cond: ["$requiresManualGrading", 0, 1] } },
        manual: { $sum: { $cond: ["$requiresManualGrading", 1, 0] } },
      },
    },
  ]);
  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        count: row.count,
        marks: Math.round((row.marks || 0) * 100) / 100,
        objectiveCount: row.objective || 0,
        manualCount: row.manual || 0,
      },
    ]),
  );
}

/** True when the quiz is addressed to this student's section or to them directly. */
function isQuizAddressedToStudent(quiz, { section, studentUserId }) {
  if (quiz.audience?.targetType === "SPECIFIC") {
    const target = quiz.audience.target || {};
    if (target.userIds?.length) {
      return target.userIds.map(String).includes(String(studentUserId));
    }
  }
  const sections = (quiz.sectionCodes || []).map((code) => String(code).toUpperCase());
  if (!sections.length) return true;
  if (!section) return false;
  return sections.includes(String(section).toUpperCase());
}

function availabilityReason(availability) {
  switch (availability.availability) {
    case "OPEN":
      return null;
    case "SCHEDULED":
      return "This quiz has not opened yet.";
    case "CLOSED":
      return "This quiz has closed.";
    default:
      return "This quiz is not available yet.";
  }
}

function requireInstant(value, label, field) {
  if (value === undefined || value === null || value === "") {
    throw validationError(`${label} is required.`, [
      { field, message: `Choose a ${label.toLowerCase()}.` },
    ]);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validationError(`${label} must be a valid date and time.`, [
      { field, message: "Enter a valid date and time." },
    ]);
  }
  return date;
}

/** A quiz window must close after it opens, and last long enough to sit. */
function assertWindowIsSane(openAt, closeAt) {
  if (closeAt <= openAt) {
    throw validationError("The closing time must be after the opening time.", [
      { field: "closeAt", message: "Choose a time after the quiz opens." },
    ]);
  }
}

/* ------------------------------------------------------------------ */
/* Quiz runtime — the student's side of the attempt                    */
/* ------------------------------------------------------------------ */

/**
 * Starting, answering, autosaving and submitting an attempt.
 *
 * Every route re-derives the clock before it does anything: an attempt that has
 * passed its deadline is submitted automatically on the spot, using the saved
 * answers and the deadline as the submission instant. A student who closes the
 * tab loses nothing and gains nothing — the record is identical either way.
 */
function registerQuizAttemptRuntime(app) {
  /** What the student needs before deciding whether to begin. */
  app.get(
    "/api/lms/quizzes/:quizId/attempt",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const quiz = await loadQuiz(req);
      const student = await resolveStudentForQuiz(req, quiz);
      await syncQuizLifecycle(quiz);

      const attempt = await QuizAttempt.findOne({
        quiz: quiz._id,
        student: student.student._id,
        status: "IN_PROGRESS",
      });

      if (!attempt) {
        const availability = deriveQuizAvailability(quiz);
        const used = await QuizAttempt.countDocuments({
          quiz: quiz._id,
          student: student.student._id,
          status: { $ne: "IN_PROGRESS" },
        });
        return res.json({
          attempt: null,
          canStart:
            !quiz.archivedAt &&
            availability.acceptsAttempts &&
            used < (quiz.attemptsAllowed || 1),
          attemptsAllowed: quiz.attemptsAllowed || 1,
          attemptsUsed: used,
          reason: quiz.archivedAt
            ? "This quiz has been withdrawn."
            : availability.acceptsAttempts
              ? null
              : availabilityReason(availability),
          timing: await quizTimingPayload(quiz),
          serverTime: new Date().toISOString(),
        });
      }

      res.json(await serialiseAttemptRuntime(attempt, quiz));
    }),
  );

  /**
   * Starts an attempt.
   *
   * The deadline is `min(start + duration, quiz close)` computed on the server:
   * a student cannot extend their own paper by moving the device clock, and a
   * quiz that closes early cuts every live attempt short at the same instant.
   */
  app.post(
    "/api/lms/quizzes/:quizId/attempts",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const quiz = await loadQuiz(req);
      const student = await resolveStudentForQuiz(req, quiz);

      if (quiz.archivedAt) {
        throw conflict("This quiz has been withdrawn.");
      }

      const now = new Date();
      await syncQuizLifecycle(quiz, now);
      const availability = deriveQuizAvailability(quiz, now);
      if (!availability.acceptsAttempts) {
        throw conflict(
          availabilityReason(availability) || "This quiz is not open for attempts.",
        );
      }

      // A live attempt is resumed, never duplicated: a double click or a retry
      // after a dropped connection returns the same paper.
      const existing = await QuizAttempt.findOne({
        quiz: quiz._id,
        student: student.student._id,
        status: "IN_PROGRESS",
      });
      if (existing) {
        return res.status(200).json({
          ...(await serialiseAttemptRuntime(existing, quiz)),
          resumed: true,
        });
      }

      const used = await QuizAttempt.countDocuments({
        quiz: quiz._id,
        student: student.student._id,
        status: { $ne: "IN_PROGRESS" },
      });
      if (used >= (quiz.attemptsAllowed || 1)) {
        throw conflict(
          `You have used all ${quiz.attemptsAllowed} attempt${quiz.attemptsAllowed === 1 ? "" : "s"} for this quiz.`,
        );
      }

      const questions = await loadQuizQuestions(quiz._id);
      if (!questions.length) {
        throw conflict("This quiz has no questions yet, so it cannot be started.");
      }

      const { questionOrder, optionOrder } = buildQuestionOrder(quiz, questions);
      const durationMs = (quiz.durationMinutes || 0) * 60 * 1000;
      const durationDeadline = new Date(now.getTime() + durationMs);
      const closeAt = quiz.closeAt ? new Date(quiz.closeAt) : durationDeadline;
      const expiresAt = durationDeadline < closeAt ? durationDeadline : closeAt;

      const attempt = await QuizAttempt.create({
        quiz: quiz._id,
        course: quiz.course,
        student: student.student._id,
        studentUser: student.userId,
        studentCode: student.student.studentId || null,
        attemptNumber: used + 1,
        status: "IN_PROGRESS",
        questionOrder,
        optionOrder,
        startedAt: now,
        originalExpiresAt: expiresAt,
        expiresAt,
        maxMarksSnapshot: quiz.maxMarks,
        answers: [],
        integrityEvents: [
          {
            type: "ATTEMPT_STARTED",
            at: now,
            ipAddress: req.ip || null,
            userAgent: optionalString(req.headers["user-agent"], "User agent", { max: 400 }),
            detail: `Attempt ${used + 1} of ${quiz.attemptsAllowed}`,
          },
        ],
      });

      await logAudit({
        userId: student.userId,
        action: "QUIZ_ATTEMPT_STARTED",
        module: "lms",
        resource: "quiz_attempt",
        resourceId: attempt._id.toString(),
        newValue: {
          quizId: String(quiz._id),
          attemptNumber: attempt.attemptNumber,
          expiresAt: attempt.expiresAt,
        },
        details: `${student.student.studentId || "A student"} started attempt ${attempt.attemptNumber} of "${quiz.title}".`,
      });

      res.status(201).json({
        ...(await serialiseAttemptRuntime(attempt, quiz)),
        resumed: false,
      });
    }),
  );

  /**
   * Autosaves answers.
   *
   * Saving is deliberately not audited: it runs every few seconds, and an audit
   * row per keystroke burst would bury the events an auditor actually reads. The
   * audit trail records the start, the submission and the marking — the moments
   * the academic record is decided.
   */
  app.put(
    "/api/lms/attempts/:attemptId/answers",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const { attempt, quiz } = await loadAttemptForStudent(req);
      const now = new Date();

      if (attempt.status !== "IN_PROGRESS") {
        throw conflict("This attempt has already been submitted.");
      }
      if (now >= new Date(attempt.expiresAt)) {
        await autoSubmit(attempt, quiz, now, "DEADLINE_EXCEEDED");
        throw conflict("Time expired: your saved answers were submitted automatically.");
      }

      const availability = await syncQuizLifecycle(quiz, now);
      if (!deriveQuizAvailability(availability.quiz, now).acceptsAttempts) {
        await autoSubmit(attempt, availability.quiz, now, "QUIZ_CLOSED");
        throw conflict("This quiz has closed and no longer accepts answers.");
      }

      const order = attempt.questionOrder.map(String);
      if (quiz.navigationMethod === "SEQUENTIAL") {
        // Find highest index answered so far
        const answeredIndices = (attempt.answers || [])
          .filter((a) => a.response !== null && a.response !== undefined && a.response !== "")
          .map((a) => order.indexOf(String(a.question)))
          .filter((idx) => idx >= 0);
        const maxAnswered = answeredIndices.length ? Math.max(...answeredIndices) : -1;
        for (const entry of (Array.isArray((req.body || {}).answers) ? req.body.answers : [])) {
          const qId = String(entry?.questionId || entry?.question || "");
          const targetIndex = order.indexOf(qId);
          if (targetIndex > maxAnswered + 1) {
            throw conflict("Sequential navigation is enabled: questions must be completed in order.");
          }
        }
      }
      // Marks are snapshotted from the questions as they are now, so an answer
      // first saved late still carries the mark this question is worth.
      const marksByQuestion = new Map(
        (await loadQuestionsLean(quiz._id)).map((question) => [
          String(question._id),
          question.marks,
        ]),
      );
      const byId = new Map(attempt.answers.map((answer) => [String(answer.question), answer]));
      const incoming = Array.isArray((req.body || {}).answers)
        ? req.body.answers
        : [];

      let saved = 0;
      for (const entry of incoming) {
        const questionId = String(entry?.questionId || entry?.question || "");
        if (!order.includes(questionId)) {
          throw validationError("That question is not part of this attempt.", [
            { field: "answers", message: "A submitted question is not on this paper." },
          ]);
        }
        const marksSnapshot = byId.get(questionId)?.marksSnapshot ?? marksByQuestion.get(questionId) ?? 0;
        const existing = byId.get(questionId);
        if (existing) {
          applyAnswerPatch(existing, entry, marksSnapshot);
        } else {
          const created = {
            question: questionId,
            marksSnapshot: marksSnapshot ?? 0,
            response: entry?.response ?? null,
            responseText: optionalString(entry?.responseText, "Response", { max: 20000 }) || "",
            markedForReview: Boolean(entry?.markedForReview),
          };
          attempt.answers.push(created);
          byId.set(questionId, created);
        }
        saved += 1;
      }
      await attempt.save();

      res.json({
        success: true,
        saved,
        savedAt: now.toISOString(),
        attemptId: String(attempt._id),
        timing: {
          serverTime: now.toISOString(),
          expiresAt: attempt.expiresAt,
          msRemaining: Math.max(0, new Date(attempt.expiresAt).getTime() - now.getTime()),
        },
      });
    }),
  );

  /**
   * Records a non-conclusive academic-integrity signal.
   *
   * A hidden tab or a dropped connection is a fact about the session, not a
   * verdict about the student, and CollegeOS stores it as exactly that.
   */
  app.post(
    "/api/lms/attempts/:attemptId/integrity",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const { attempt } = await loadAttemptForStudent(req);
      if (attempt.status !== "IN_PROGRESS") {
        throw conflict("This attempt has already been submitted.");
      }
      const type = requireEnumValue(
        (req.body || {}).type,
        "Integrity event",
        ["TAB_HIDDEN", "TAB_VISIBLE", "RECONNECTED", "AUTOSAVE_FAILED", "PAUSE"],
      );
      attempt.integrityEvents.push({
        type,
        at: new Date(),
        ipAddress: req.ip || null,
        userAgent: optionalString(req.headers["user-agent"], "User agent", { max: 400 }),
        detail: optionalString((req.body || {}).detail, "Detail", { max: 200 }),
      });
      await attempt.save();
      res.json({ success: true, recorded: type });
    }),
  );

  /**
   * Submits an attempt.
   *
   * Submitting twice is safe and returns the same result. Submitting after the
   * deadline is still accepted — the attempt is closed as an automatic submission
   * timestamped at the deadline, because refusing it would throw away work the
   * student genuinely did.
   */
  app.post(
    "/api/lms/attempts/:attemptId/submit",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const { attempt, quiz } = await loadAttemptForStudent(req);
      const now = new Date();

      if (attempt.status !== "IN_PROGRESS") {
        return res.json(await serialiseStudentResult(attempt, quiz, now, { idempotent: true }));
      }

      const deadline = new Date(attempt.expiresAt);
      let late = false;
      if (now >= deadline) {
        await finaliseAttempt(attempt, quiz, await loadQuestionsLean(quiz._id), {
          reason: "DEADLINE_EXCEEDED",
          auto: true,
          at: deadline,
        });
        late = true;
      } else {
        await finaliseAttempt(attempt, quiz, await loadQuestionsLean(quiz._id), {
          reason: "STUDENT_SUBMIT",
          auto: false,
          at: now,
        });
      }
      await refreshQuizProgress(quiz._id);

      res.json(await serialiseStudentResult(attempt, quiz, now, { late }));
    }),
  );

  /**
   * The student's own result.
   *
   * Release is a policy the teacher chose, evaluated on every read. Until it
   * applies the endpoint answers honestly — the result exists, and its contents
   * are not released yet — rather than erroring or leaking a score.
   */
  app.get(
    "/api/lms/attempts/:attemptId/result",
    requireAuth,
    requirePermission("lms.view"),
    route(async (req, res) => {
      const { attempt, quiz } = await loadAttemptForStudent(req);
      res.json(await serialiseStudentResult(attempt, quiz, new Date()));
    }),
  );
}

/** Closes a lapsed attempt exactly as the closing sweep would have. */
async function autoSubmit(attempt, quiz, now, reason) {
  const deadline = new Date(attempt.expiresAt);
  await finaliseAttempt(attempt, quiz, await loadQuestionsLean(quiz._id), {
    reason,
    auto: true,
    at: deadline <= now ? deadline : now,
  });
  await refreshQuizProgress(quiz._id);
}

/** Loads an attempt and proves the caller owns it. */
async function loadAttemptForStudent(req) {
  const attempt = await QuizAttempt.findById(requireObjectId(req.params.attemptId, "Attempt"));
  if (!attempt) throw notFound("Attempt not found.");
  const quiz = await Quiz.findById(attempt.quiz);
  if (!quiz) throw notFound("Attempt not found.");
  const student = await resolveStudentForQuiz(req, quiz);
  if (String(attempt.student) !== String(student.student._id)) {
    // Another student's attempt is reported as missing rather than forbidden:
    // its existence is itself information the caller is not entitled to.
    throw notFound("Attempt not found.");
  }
  return { attempt, quiz, student };
}

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

/**
 * The teacher's view of the cohort and the marking queue.
 *
 * Marking is server-authoritative in both directions: the awarded mark is
 * validated against the mark the question carried *when the paper was issued*
 * (`marksSnapshot`), so editing a question afterwards cannot inflate a grade,
 * and the total is recomputed by the engine rather than accepted from the body.
 */
function registerQuizGrading(app) {
  app.get(
    "/api/lms/quizzes/:quizId/attempts",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const { quiz, access } = await loadQuizForManager(req);
      const filter = { quiz: quiz._id };
      if (req.query.status) {
        filter.status = requireEnumValue(req.query.status, "Status", [
          "IN_PROGRESS",
          "SUBMITTED",
          "AUTO_SUBMITTED",
          "GRADED",
        ]);
      }

      const attempts = await QuizAttempt.find(filter)
        .populate("student", "studentId firstName lastName section")
        .sort({ attemptNumber: 1, studentCode: 1 })
        .lean();

      let addressed = attempts.filter((attempt) =>
        attemptIsInScope(attempt, access),
      );

      const filterType = (req.query.filter || "").toUpperCase();
      const now = new Date();
      if (filterType === "ACTIVE" || filterType === "IN_PROGRESS") {
        addressed = addressed.filter((a) => a.status === "IN_PROGRESS" && new Date(a.expiresAt) > now);
      } else if (filterType === "EXPIRED") {
        addressed = addressed.filter(
          (a) => a.autoSubmitted || (a.status === "IN_PROGRESS" && new Date(a.expiresAt) <= now),
        );
      } else if (filterType === "EXTENDED") {
        addressed = addressed.filter((a) => a.extensionHistory && a.extensionHistory.length > 0);
      } else if (filterType === "PENDING_GRADING") {
        addressed = addressed.filter((a) => a.pendingManualCount > 0);
      } else if (filterType === "SUBMITTED") {
        addressed = addressed.filter((a) => a.status !== "IN_PROGRESS");
      }

      const totals = addressed.reduce(
        (acc, attempt) => {
          if (attempt.status !== "IN_PROGRESS") acc.submitted += 1;
          if (attempt.pendingManualCount > 0) acc.pendingManual += 1;
          if (attempt.status === "GRADED") acc.graded += 1;
          return acc;
        },
        { submitted: 0, pendingManual: 0, graded: 0 },
      );

      res.json({
        quizId: String(quiz._id),
        attempts: addressed.map((attempt) => ({
          ...serialiseAttemptSummary(attempt, { includeMarks: true }),
          studentId: attempt.student?.studentId || attempt.studentCode || null,
          name: attempt.student
            ? `${attempt.student.firstName || ""} ${attempt.student.lastName || ""}`.trim()
            : null,
          section: attempt.student?.section || null,
          inProgress: attempt.status === "IN_PROGRESS",
        })),
        summary: { ...totals, attempts: addressed.length },
        access: { sections: access.sections },
        serverTime: new Date().toISOString(),
      });
    }),
  );

  /** The full attempt as the marker sees it: responses plus the marking key. */
  app.get(
    "/api/lms/attempts/:attemptId/grading",
    requireAuth,
    requirePermission("lms.grade.manage"),
    route(async (req, res) => {
      const attempt = await QuizAttempt.findById(
        requireObjectId(req.params.attemptId, "Attempt"),
      );
      if (!attempt) throw notFound("Attempt not found.");
      const quiz = await Quiz.findById(attempt.quiz);
      if (!quiz) throw notFound("Attempt not found.");
      await assertCanManageCourse(req.user, quiz.course, {
        sectionCodes: quiz.sectionCodes,
        semester: quiz.semester ?? undefined,
      });

      const questions = await QuizQuestion.find({ quiz: quiz._id })
        .sort({ position: 1, createdAt: 1 })
        .lean();
      const byId = new Map(questions.map((question) => [String(question._id), question]));

      res.json({
        attempt: {
          ...serialiseAttemptSummary(attempt, { includeMarks: true }),
          studentId: attempt.studentCode || null,
          passingMarks: quiz.passingMarks ?? 0,
        },
        quiz: {
          id: String(quiz._id),
          title: quiz.title,
          maxMarks: quiz.maxMarks,
          passingMarks: quiz.passingMarks ?? 0,
          resultReleasePolicy: quiz.resultReleasePolicy,
        },
        paper: attempt.questionOrder.map((id) => {
          const question = byId.get(String(id));
          if (!question) return null;
          const answer = (attempt.answers || []).find(
            (row) => String(row.question) === String(question._id),
          );
          return {
            question: serialiseQuestionForManager(question),
            response: answer?.response ?? null,
            responseText: answer?.responseText || "",
            awardedMarks: answer?.awardedMarks ?? null,
            isCorrect: answer?.isCorrect ?? null,
            requiresManualGrading: Boolean(answer?.requiresManualGrading),
            markedForReview: Boolean(answer?.markedForReview),
            feedback: answer?.feedback || "",
            gradedAt: answer?.gradedAt || null,
          };
        }).filter(Boolean),
        integrityEvents: (attempt.integrityEvents || []).filter(
          (event) => event.type !== "ATTEMPT_STARTED",
        ),
        canGrade: attempt.status !== "IN_PROGRESS",
        serverTime: new Date().toISOString(),
      });
    }),
  );

  /**
   * Awards or clears marks on a submitted attempt.
   *
   * Only subjective answers accept a mark here; objective answers were already
   * decided by the engine at submission. A cleared mark puts the answer back in
   * the queue rather than recording a zero, so "not marked yet" can never be
   * read as "no marks earned".
   */
  app.post(
    "/api/lms/attempts/:attemptId/grade",
    requireAuth,
    requirePermission("lms.grade.manage"),
    route(async (req, res) => {
      const attempt = await QuizAttempt.findById(
        requireObjectId(req.params.attemptId, "Attempt"),
      );
      if (!attempt) throw notFound("Attempt not found.");
      const quiz = await Quiz.findById(attempt.quiz);
      if (!quiz) throw notFound("Attempt not found.");
      await assertCanManageCourse(req.user, quiz.course, {
        sectionCodes: quiz.sectionCodes,
        semester: quiz.semester ?? undefined,
      });

      if (attempt.status === "IN_PROGRESS") {
        throw conflict("This attempt has not been submitted yet, so it cannot be marked.");
      }

      const body = req.body || {};
      const entries = Array.isArray(body.marks) ? body.marks : [];
      if (!entries.length && body.overallFeedback === undefined) {
        throw validationError("Nothing was submitted to mark.", [
          { field: "marks", message: "Enter at least one mark." },
        ]);
      }

      const byId = new Map((attempt.answers || []).map((answer) => [String(answer.question), answer]));
      for (const entry of entries) {
        const questionId = String(entry?.questionId || entry?.question || "");
        const answer = byId.get(questionId);
        if (!answer) {
          throw validationError("That question is not part of this attempt.", [
            { field: "marks", message: "A marked question is not on this paper." },
          ]);
        }
        if (!answer.requiresManualGrading) {
          throw conflict(
            "This question was marked automatically when the attempt was submitted.",
          );
        }
        answer.awardedMarks =
          entry.awardedMarks === null || entry.awardedMarks === undefined || entry.awardedMarks === ""
            ? null
            : toNumber(entry.awardedMarks, "Awarded marks", {
                min: 0,
                max: answer.marksSnapshot ?? 0,
              });
        if (entry.feedback !== undefined) {
          answer.feedback = optionalString(entry.feedback, "Feedback", { max: 4000 }) || "";
        }
        answer.gradedBy = req.user._id || req.user.id;
        answer.gradedAt = new Date();
      }

      if (body.overallFeedback !== undefined) {
        attempt.overallFeedback =
          optionalString(body.overallFeedback, "Overall feedback", { max: 8000 }) || "";
      }

      recalculateAttemptMarks(attempt, quiz.passingMarks);
      if (attempt.awardedMarks !== null && attempt.awardedMarks !== undefined) {
        attempt.gradedBy = req.user._id || req.user.id;
        attempt.gradedAt = new Date();
      }
      await attempt.save();

      await syncQuizAttemptGrade({ attempt, quiz });
      const refreshed = await refreshQuizProgress(quiz._id);

      const released = areResultsReleased(refreshed || quiz, attempt);
      if (released && attempt.awardedMarks !== null) {
        await notifyOnce({
          userId: attempt.studentUser,
          title: `Quiz marked: ${quiz.title}`,
          message: `You scored ${attempt.awardedMarks} out of ${attempt.maxMarksSnapshot} in ${quiz.title}.`,
          category: "lms_grade",
          priority: "high",
          actionUrl: `/learning/course/${quiz.course}?quiz=${quiz._id}`,
          idempotencyKey: `quiz_graded_${attempt._id}`,
          metadata: { attemptId: String(attempt._id) },
        });
      }

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_ATTEMPT_GRADED",
        module: "lms",
        resource: "quiz_attempt",
        resourceId: String(attempt._id),
        newValue: {
          awardedMarks: attempt.awardedMarks,
          percentage: attempt.percentage,
          passed: attempt.passed,
          pendingManualCount: attempt.pendingManualCount,
          resultsReleased: released,
        },
        details: `Attempt ${attempt.attemptNumber} of "${quiz.title}" marked: ${attempt.awardedMarks ?? "not yet settled"} of ${attempt.maxMarksSnapshot}.`,
      });

      res.json({
        success: true,
        attempt: serialiseAttemptSummary(attempt, { includeMarks: true }),
        resultsReleased: released,
        pendingManualCount: attempt.pendingManualCount,
      });
    }),
  );

  /** A teacher's read of any attempt in their course, marks included. */
  app.get(
    "/api/lms/attempts/:attemptId",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const attempt = await QuizAttempt.findById(
        requireObjectId(req.params.attemptId, "Attempt"),
      );
      if (!attempt) throw notFound("Attempt not found.");
      const quiz = await Quiz.findById(attempt.quiz);
      if (!quiz) throw notFound("Attempt not found.");
      await assertCanManageCourse(req.user, quiz.course, {
        sectionCodes: quiz.sectionCodes,
        semester: quiz.semester ?? undefined,
      });
      const questions = await QuizQuestion.find({ quiz: quiz._id })
        .sort({ position: 1, createdAt: 1 })
        .lean();
      const byId = new Map(questions.map((question) => [String(question._id), question]));

      res.json({
        attempt: serialiseAttemptSummary(attempt, { includeMarks: true }),
        quiz: serialiseQuizForManager(quiz),
        answers: (attempt.answers || []).map((answer) => {
          const question = byId.get(String(answer.question));
          return {
            questionId: String(answer.question),
            question: question ? serialiseQuestionForManager(question) : null,
            response: answer.response ?? null,
            responseText: answer.responseText || "",
            awardedMarks: answer.awardedMarks ?? null,
            isCorrect: answer.isCorrect ?? null,
            requiresManualGrading: Boolean(answer.requiresManualGrading),
            feedback: answer.feedback || "",
            marksSnapshot: answer.marksSnapshot,
          };
        }),
        integrityEvents: attempt.integrityEvents || [],
        serverTime: new Date().toISOString(),
      });
    }),
  );

  /**
   * Whole-class deadline extension:
   * POST /api/lms/quizzes/:quizId/extend
   * Extends the quiz closing time and pushes the deadline for any active attempts.
   */
  app.post(
    "/api/lms/quizzes/:quizId/extend",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const { quiz } = await loadQuizForManager(req);
      const body = req.body || {};
      const now = new Date();

      let revisedCloseAt;
      if (body.newCloseAt) {
        revisedCloseAt = requireInstant(body.newCloseAt, "Revised close time", "newCloseAt");
      } else if (body.additionalMinutes) {
        const mins = toInt(body.additionalMinutes, "Additional minutes", { min: 1, max: 1440 });
        const base = new Date(quiz.closeAt) > now ? new Date(quiz.closeAt) : now;
        revisedCloseAt = new Date(base.getTime() + mins * 60 * 1000);
      } else {
        throw validationError("Specify either newCloseAt or additionalMinutes.", [
          { field: "newCloseAt", message: "Enter a revised closing time or minutes." },
        ]);
      }

      if (revisedCloseAt <= new Date(quiz.closeAt)) {
        throw validationError("Revised closing time must be strictly after the current closing time.", [
          { field: "newCloseAt", message: "Choose a time after the current closing deadline." },
        ]);
      }

      const previousCloseAt = new Date(quiz.closeAt);
      const reason = optionalString(body.reason, "Reason", { max: 500 }) || "";

      quiz.closeAt = revisedCloseAt;
      if (["CLOSED", "COMPLETED"].includes(quiz.status) && revisedCloseAt > now) {
        quiz.status = "OPEN";
      }
      quiz.extensionHistory = quiz.extensionHistory || [];
      quiz.extensionHistory.push({
        extendedBy: req.user._id || req.user.id,
        extendedAt: now,
        previousCloseAt,
        revisedCloseAt,
        reason,
      });
      quiz.updatedBy = req.user._id || req.user.id;
      await quiz.save();

      // Extend any currently IN_PROGRESS attempts that were bound by the old closeAt
      const inProgressAttempts = await QuizAttempt.find({
        quiz: quiz._id,
        status: "IN_PROGRESS",
      });

      let updatedAttemptsCount = 0;
      for (const attempt of inProgressAttempts) {
        const currentExp = new Date(attempt.expiresAt);
        // The attempt should get either its full duration or the new closeAt, whichever is earlier
        const durationDeadline = new Date(new Date(attempt.startedAt).getTime() + (quiz.durationMinutes || 30) * 60 * 1000);
        const newEffective = durationDeadline < revisedCloseAt ? durationDeadline : revisedCloseAt;
        if (newEffective > currentExp) {
          attempt.expiresAt = newEffective;
          attempt.extensionHistory.push({
            grantedBy: req.user._id || req.user.id,
            grantedAt: now,
            previousExpiresAt: currentExp,
            revisedExpiresAt: newEffective,
            reason: reason ? `Whole-class extension: ${reason}` : "Whole-class deadline extension",
            action: "EXTENSION",
          });
          await attempt.save();
          updatedAttemptsCount += 1;
        }
      }

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_DEADLINE_EXTENDED",
        module: "lms",
        resource: "quiz",
        resourceId: quiz._id.toString(),
        oldValue: { closeAt: previousCloseAt },
        newValue: { closeAt: revisedCloseAt, reason, updatedAttempts: updatedAttemptsCount },
        details: `Quiz "${quiz.title}" deadline extended from ${previousCloseAt.toISOString()} to ${revisedCloseAt.toISOString()}.`,
      });

      const cohort = await resolveQuizCohort(quiz);
      if (cohort.length) {
        await notifyStudents({
          students: cohort,
          title: `Quiz deadline extended: ${quiz.title}`,
          message: `The deadline for ${quiz.title} has been extended to ${revisedCloseAt.toLocaleString()}.`,
          keyPrefix: `quiz_ext_${quiz._id}_${revisedCloseAt.getTime()}`,
          category: "lms_quiz",
          actionUrl: `/learning/course/${quiz.course}?quiz=${quiz._id}`,
        });
      }

      res.json({
        success: true,
        quiz: await serialiseQuizDetailForManager(quiz),
        updatedAttemptsCount,
        serverTime: now.toISOString(),
      });
    }),
  );

  /**
   * Individual student attempt extension:
   * POST /api/lms/attempts/:attemptId/extend
   * Grants extra time specifically to this student attempt.
   */
  app.post(
    "/api/lms/attempts/:attemptId/extend",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const attempt = await QuizAttempt.findById(
        requireObjectId(req.params.attemptId, "Attempt"),
      );
      if (!attempt) throw notFound("Attempt not found.");
      const quiz = await Quiz.findById(attempt.quiz);
      if (!quiz) throw notFound("Attempt not found.");
      await assertCanManageCourse(req.user, quiz.course, {
        sectionCodes: quiz.sectionCodes,
        semester: quiz.semester ?? undefined,
      });

      if (attempt.status !== "IN_PROGRESS") {
        throw conflict("Only in-progress attempts can receive additional time. Use reopening for finished/expired attempts.");
      }

      const body = req.body || {};
      const now = new Date();
      let revisedExpiresAt;
      let additionalMinutes = 0;

      if (body.newExpiresAt) {
        revisedExpiresAt = requireInstant(body.newExpiresAt, "Revised deadline", "newExpiresAt");
        additionalMinutes = Math.round((revisedExpiresAt.getTime() - new Date(attempt.expiresAt).getTime()) / (60 * 1000));
      } else if (body.additionalMinutes) {
        additionalMinutes = toInt(body.additionalMinutes, "Additional minutes", { min: 1, max: 300 });
        const base = new Date(attempt.expiresAt) > now ? new Date(attempt.expiresAt) : now;
        revisedExpiresAt = new Date(base.getTime() + additionalMinutes * 60 * 1000);
      } else {
        throw validationError("Specify either newExpiresAt or additionalMinutes.", [
          { field: "additionalMinutes", message: "Enter additional minutes or revised deadline." },
        ]);
      }

      if (revisedExpiresAt <= new Date(attempt.expiresAt)) {
        throw validationError("Revised deadline must be strictly after the current deadline.", [
          { field: "newExpiresAt", message: "Choose a time after current deadline." },
        ]);
      }

      const previousExpiresAt = new Date(attempt.expiresAt);
      const reason = optionalString(body.reason, "Reason", { max: 500 }) || "";

      attempt.expiresAt = revisedExpiresAt;
      attempt.extensionHistory = attempt.extensionHistory || [];
      attempt.extensionHistory.push({
        grantedBy: req.user._id || req.user.id,
        grantedAt: now,
        previousExpiresAt,
        revisedExpiresAt,
        additionalMinutes,
        reason,
        action: "EXTENSION",
      });
      await attempt.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_ATTEMPT_EXTENDED",
        module: "lms",
        resource: "quiz_attempt",
        resourceId: String(attempt._id),
        oldValue: { expiresAt: previousExpiresAt },
        newValue: { expiresAt: revisedExpiresAt, reason, additionalMinutes },
        details: `Attempt ${attempt.attemptNumber} deadline extended to ${revisedExpiresAt.toISOString()}.`,
      });

      await notifyOnce({
        userId: attempt.studentUser,
        title: `Extra time granted: ${quiz.title}`,
        message: `Your quiz attempt has received an extension until ${revisedExpiresAt.toLocaleTimeString()}. Reason: ${reason || "Instructor granted"}.`,
        category: "lms_quiz",
        priority: "high",
        actionUrl: `/learning/course/${quiz.course}?quiz=${quiz._id}`,
        idempotencyKey: `attempt_ext_${attempt._id}_${revisedExpiresAt.getTime()}`,
      });

      res.json({
        success: true,
        attempt: serialiseAttemptSummary(attempt, { includeMarks: true }),
        serverTime: now.toISOString(),
      });
    }),
  );

  /**
   * Reopen an expired / auto-submitted attempt:
   * POST /api/lms/attempts/:attemptId/reopen
   */
  app.post(
    "/api/lms/attempts/:attemptId/reopen",
    requireAuth,
    requirePermission("lms.quiz.manage"),
    route(async (req, res) => {
      const attempt = await QuizAttempt.findById(
        requireObjectId(req.params.attemptId, "Attempt"),
      );
      if (!attempt) throw notFound("Attempt not found.");
      const quiz = await Quiz.findById(attempt.quiz);
      if (!quiz) throw notFound("Attempt not found.");
      await assertCanManageCourse(req.user, quiz.course, {
        sectionCodes: quiz.sectionCodes,
        semester: quiz.semester ?? undefined,
      });

      if (quiz.allowReopenExpired === false) {
        throw conflict("The policy for this quiz does not permit reopening expired attempts.");
      }
      if (attempt.status === "IN_PROGRESS") {
        throw conflict("This attempt is already in progress.");
      }
      if (attempt.status === "GRADED") {
        throw conflict("This attempt has already been graded and finalized. It cannot be reopened directly.");
      }

      const body = req.body || {};
      const now = new Date();
      let revisedExpiresAt;
      let additionalMinutes = 0;

      if (body.newExpiresAt) {
        revisedExpiresAt = requireInstant(body.newExpiresAt, "Revised deadline", "newExpiresAt");
        additionalMinutes = Math.round((revisedExpiresAt.getTime() - now.getTime()) / (60 * 1000));
      } else if (body.additionalMinutes) {
        additionalMinutes = toInt(body.additionalMinutes, "Additional minutes", { min: 1, max: 300 });
        revisedExpiresAt = new Date(now.getTime() + additionalMinutes * 60 * 1000);
      } else {
        throw validationError("Specify either newExpiresAt or additionalMinutes.", [
          { field: "additionalMinutes", message: "Enter additional minutes for the reopened attempt." },
        ]);
      }

      if (revisedExpiresAt <= now) {
        throw validationError("Revised deadline must be in the future.", [
          { field: "newExpiresAt", message: "Choose a future deadline." },
        ]);
      }

      const previousExpiresAt = new Date(attempt.expiresAt);
      const reason = optionalString(body.reason, "Reason", { max: 500 }) || "";

      // Transition attempt back to IN_PROGRESS and restore answers for editing
      attempt.status = "IN_PROGRESS";
      attempt.expiresAt = revisedExpiresAt;
      attempt.submittedAt = null;
      attempt.autoSubmitted = false;
      attempt.reopenedAt = now;
      attempt.reopenedBy = req.user._id || req.user.id;
      attempt.extensionHistory = attempt.extensionHistory || [];
      attempt.extensionHistory.push({
        grantedBy: req.user._id || req.user.id,
        grantedAt: now,
        previousExpiresAt,
        revisedExpiresAt,
        additionalMinutes,
        reason,
        action: "REOPEN",
      });

      // Clear provisional grades on objective answers so they are cleanly re-evaluated upon final submission
      for (const ans of attempt.answers || []) {
        ans.awardedMarks = null;
        ans.isCorrect = null;
      }
      attempt.objectiveMarks = 0;
      attempt.manualMarks = 0;
      attempt.awardedMarks = null;
      attempt.percentage = null;
      attempt.passed = null;

      await attempt.save();
      await refreshQuizProgress(quiz._id);

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "QUIZ_ATTEMPT_REOPENED",
        module: "lms",
        resource: "quiz_attempt",
        resourceId: String(attempt._id),
        oldValue: { status: "AUTO_SUBMITTED", expiresAt: previousExpiresAt },
        newValue: { status: "IN_PROGRESS", expiresAt: revisedExpiresAt, reason },
        details: `Attempt ${attempt.attemptNumber} reopened until ${revisedExpiresAt.toISOString()}. Reason: ${reason}.`,
      });

      await notifyOnce({
        userId: attempt.studentUser,
        title: `Attempt reopened: ${quiz.title}`,
        message: `Your attempt for ${quiz.title} has been reopened until ${revisedExpiresAt.toLocaleTimeString()}. You may continue answering.`,
        category: "lms_quiz",
        priority: "high",
        actionUrl: `/learning/course/${quiz.course}?quiz=${quiz._id}`,
        idempotencyKey: `attempt_reopen_${attempt._id}_${revisedExpiresAt.getTime()}`,
      });

      res.json({
        success: true,
        attempt: serialiseAttemptSummary(attempt, { includeMarks: false }),
        serverTime: now.toISOString(),
      });
    }),
  );
}

/**
 * An attempt is in scope when its section is one the teacher teaches.
 *
 * A teacher assigned to A1 must not grade A2's paper even though the quiz is the
 * same document, which is why the section check is applied here and not only on
 * the route that loaded the quiz.
 */
function attemptIsInScope(attempt, access) {
  const sections = (access.sections || []).map((code) => String(code).toUpperCase());
  if (!sections.length) return true;
  const section = attempt.student?.section
    ? String(attempt.student.section).toUpperCase()
    : null;
  if (!section) return true;
  return sections.includes(section);
}

/* ------------------------------------------------------------------ */
/* Attempt serialisation                                               */
/* ------------------------------------------------------------------ */

/**
 * Marks are withheld unless the caller is entitled to them.
 *
 * A student's own attempt summary must not become a way to read a score before
 * the teacher's release policy allows it, so every mark-bearing field is simply
 * absent rather than zeroed.
 */
function serialiseAttemptSummary(attempt, { includeMarks = false } = {}) {
  const base = {
    id: String(attempt._id),
    quizId: String(attempt.quiz?._id || attempt.quiz || ""),
    courseId: String(attempt.course?._id || attempt.course || ""),
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt || null,
    originalExpiresAt: attempt.originalExpiresAt || attempt.expiresAt || null,
    expiresAt: attempt.expiresAt || null,
    submittedAt: attempt.submittedAt || null,
    autoSubmitted: Boolean(attempt.autoSubmitted),
    durationSeconds: attempt.durationSeconds ?? null,
    pendingManualCount: attempt.pendingManualCount || 0,
    inProgress: attempt.status === "IN_PROGRESS",
    reopenedAt: attempt.reopenedAt || null,
    extensionHistory: (attempt.extensionHistory || []).map((ext) => ({
      grantedBy: String(ext.grantedBy),
      grantedAt: ext.grantedAt,
      previousExpiresAt: ext.previousExpiresAt,
      revisedExpiresAt: ext.revisedExpiresAt,
      additionalMinutes: ext.additionalMinutes || 0,
      reason: ext.reason || "",
      action: ext.action || "EXTENSION",
    })),
  };
  if (!includeMarks) return base;

  return {
    ...base,
    objectiveMarks: attempt.objectiveMarks ?? 0,
    manualMarks: attempt.manualMarks ?? 0,
    awardedMarks: attempt.awardedMarks ?? null,
    maxMarks: attempt.maxMarksSnapshot ?? null,
    percentage: attempt.percentage ?? null,
    passed: attempt.passed ?? null,
    correctCount: attempt.correctCount || 0,
    incorrectCount: attempt.incorrectCount || 0,
    unansweredCount: attempt.unansweredCount || 0,
    overallFeedback: attempt.overallFeedback || "",
    gradedAt: attempt.gradedAt || null,
  };
}

/** The paper as the student sees it, with their saved answers alongside. */
async function serialiseAttemptRuntime(attempt, quiz) {
  const now = new Date();
  const questions = await loadQuestionsLean(quiz._id);
  const order = (attempt.questionOrder || []).map(String);
  const byId = new Map(questions.map((question) => [String(question._id), question]));

  const responses = {};
  for (const answer of attempt.answers || []) {
    responses[String(answer.question)] = {
      response: answer.response ?? null,
      responseText: answer.responseText || "",
      markedForReview: Boolean(answer.markedForReview),
    };
  }

  const expiresAt = new Date(attempt.expiresAt);
  return {
    attempt: {
      id: String(attempt._id),
      quizId: String(quiz._id),
      courseId: String(quiz.course),
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      startedAt: attempt.startedAt,
      expiresAt,
      submittedAt: attempt.submittedAt || null,
    },
    quiz: {
      id: String(quiz._id),
      title: quiz.title,
      instructions: quiz.instructions || "",
      durationMinutes: quiz.durationMinutes ?? null,
      maxMarks: quiz.maxMarks ?? 0,
      attemptsAllowed: quiz.attemptsAllowed || 1,
      allowBackNavigation: quiz.allowBackNavigation !== false,
      allowReviewBeforeSubmit: quiz.allowReviewBeforeSubmit !== false,
      navigationMethod: quiz.navigationMethod || "FREE",
    },
    questions: order
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((question) => projectQuestionForAttempt(question, readOptionOrder(attempt, String(question._id)))),
    responses,
    timing: {
      ...(await quizTimingPayload(quiz, now)),
      expiresAt,
      msRemaining: Math.max(0, expiresAt.getTime() - now.getTime()),
    },
    serverTime: now.toISOString(),
  };
}

/** The student's result, or an honest statement that it is not released yet. */
async function serialiseStudentResult(attempt, quiz, now, { idempotent = false, late = false } = {}) {
  const released = areResultsReleased(quiz, attempt, now);
  const base = {
    attempt: serialiseAttemptSummary(attempt, { includeMarks: released }),
    quizId: String(quiz._id),
    title: quiz.title,
    maxMarks: attempt.maxMarksSnapshot ?? quiz.maxMarks,
    passingMarks: quiz.passingMarks ?? 0,
    resultReleasePolicy: quiz.resultReleasePolicy,
    released,
    reason: released ? null : resultWithheldReason(quiz, attempt),
    submittedLate: late,
    idempotent,
    timing: await quizTimingPayload(quiz, now),
    serverTime: now.toISOString(),
  };

  if (!released) return base;

  const questions = await loadQuestionsLean(quiz._id);
  const byId = new Map(questions.map((question) => [String(question._id), question]));
  const showKey = Boolean(quiz.showCorrectAnswers);

  return {
    ...base,
    // The marking key is served only when the teacher opted into it *and* the
    // release policy has already been satisfied.
    questions: (attempt.questionOrder || []).map(String).map((id) => {
      const question = byId.get(id);
      if (!question) return null;
      const answer = (attempt.answers || []).find((row) => String(row.question) === id);
      const projected = projectQuestionForAttempt(question, null);
      return {
        ...projected,
        correctAnswer: showKey ? question.correctAnswer || [] : undefined,
        explanation: showKey ? question.explanation || "" : undefined,
        response: answer?.response ?? null,
        responseText: answer?.responseText || "",
        awardedMarks: answer?.awardedMarks ?? null,
        isCorrect: answer?.isCorrect ?? null,
        requiresManualGrading: Boolean(answer?.requiresManualGrading),
        feedback: answer?.feedback || "",
      };
    }).filter(Boolean),
  };
}

function resultWithheldReason(quiz, attempt) {
  switch (quiz.resultReleasePolicy) {
    case "IMMEDIATELY":
      return "You have not submitted this attempt yet.";
    case "AFTER_CLOSE":
      return "Results appear once this quiz has closed.";
    case "MANUAL":
      return "Your teacher releases results for this quiz when marking is complete.";
    case "AFTER_GRADING":
    default:
      return attempt.pendingManualCount > 0
        ? "This paper is still being marked."
        : "Your result appears once the marking is complete.";
  }
}

/* ------------------------------------------------------------------ */
/* Quiz serialisation and small helpers                               */
/* ------------------------------------------------------------------ */

function serialiseQuizForManager(quiz, extra = {}) {
  const availability = deriveQuizAvailability(quiz);
  return {
    id: String(quiz._id),
    courseId: String(quiz.course?._id || quiz.course || ""),
    weekId: quiz.week ? String(quiz.week) : null,
    title: quiz.title,
    description: quiz.description || "",
    instructions: quiz.instructions || "",
    status: quiz.status,
    availability: availability.availability,
    availabilityReason: availabilityReason(availability),
    maxMarks: quiz.maxMarks ?? 0,
    passingMarks: quiz.passingMarks ?? 0,
    durationMinutes: quiz.durationMinutes ?? null,
    attemptsAllowed: quiz.attemptsAllowed || 1,
    randomizeQuestions: Boolean(quiz.randomizeQuestions),
    randomizeOptions: Boolean(quiz.randomizeOptions),
    allowBackNavigation: quiz.allowBackNavigation !== false,
    allowReviewBeforeSubmit: quiz.allowReviewBeforeSubmit !== false,
    navigationMethod: quiz.navigationMethod || "FREE",
    allowReopenExpired: quiz.allowReopenExpired !== false,
    extensionHistory: (quiz.extensionHistory || []).map((ext) => ({
      extendedBy: String(ext.extendedBy),
      extendedAt: ext.extendedAt,
      previousCloseAt: ext.previousCloseAt,
      revisedCloseAt: ext.revisedCloseAt,
      reason: ext.reason || "",
    })),
    multipleSelectGrading: quiz.multipleSelectGrading || "EXACT",
    blankAnswerCaseSensitive: Boolean(quiz.blankAnswerCaseSensitive),
    resultReleasePolicy: quiz.resultReleasePolicy,
    showCorrectAnswers: Boolean(quiz.showCorrectAnswers),
    resultsReleasedAt: quiz.resultsReleasedAt || null,
    openAt: quiz.openAt || null,
    closeAt: quiz.closeAt || null,
    openedAt: quiz.openedAt || null,
    closedAt: quiz.closedAt || null,
    completedAt: quiz.completedAt || null,
    academicYear: quiz.academicYear || null,
    program: quiz.program || null,
    semester: quiz.semester ?? null,
    sectionCodes: quiz.sectionCodes || [],
    attemptCount: quiz.attemptCount || 0,
    pendingManualGradeCount: quiz.pendingManualGradeCount || 0,
    archivedAt: quiz.archivedAt || null,
    createdAt: quiz.createdAt || null,
    updatedAt: quiz.updatedAt || null,
    ...extra,
  };
}

/** Student-facing quiz summary. Carries no question, no key and no cohort mark. */
function serialiseQuizForStudent(quiz, attempts = [], { questionCount = null } = {}) {
  const availability = deriveQuizAvailability(quiz);
  const settled = attempts.filter((attempt) => attempt.status !== "IN_PROGRESS");
  const best = settled.reduce(
    (max, attempt) =>
      attempt.percentage !== null && attempt.percentage !== undefined
        ? Math.max(max, attempt.percentage)
        : max,
    null,
  );

  return {
    id: String(quiz._id),
    courseId: String(quiz.course),
    weekId: quiz.week ? String(quiz.week) : null,
    title: quiz.title,
    description: quiz.description || "",
    instructions: quiz.instructions || "",
    availability: availability.availability,
    availabilityReason: availabilityReason(availability),
    availableFrom: quiz.openAt || null,
    availableUntil: quiz.closeAt || null,
    durationMinutes: quiz.durationMinutes ?? null,
    maxMarks: quiz.maxMarks ?? 0,
    passingMarks: quiz.passingMarks ?? 0,
    attemptsAllowed: quiz.attemptsAllowed || 1,
    questionCount,
    resultReleasePolicy: quiz.resultReleasePolicy,
    attempts: attempts.map((attempt) => serialiseAttemptSummary(attempt)),
    attemptsUsed: settled.length,
    hasLiveAttempt: attempts.some((attempt) => attempt.status === "IN_PROGRESS"),
    bestPercentage: best,
  };
}

/** Quiz detail for the authoring view: the paper plus every key. */
async function serialiseQuizDetailForManager(quiz) {
  const doc = typeof quiz?.save === "function" ? quiz : await Quiz.findById(quiz?._id || quiz);
  if (!doc) throw notFound("Quiz not found.");
  const questions = await QuizQuestion.find({ quiz: doc._id })
    .sort({ position: 1, createdAt: 1 })
    .lean();
  const totals = await sumQuestionMarks(doc._id);

  return {
    quiz: serialiseQuizForManager(doc, {
      questions: questions.length,
      questionMarks: totals.marks,
    }),
    questions: questions.map(serialiseQuestionForManager),
    totals: {
      questionCount: totals.count,
      questionMarks: totals.marks,
      maxMarks: doc.maxMarks ?? 0,
      autoGradableCount: questions.filter((question) =>
        AUTO_GRADED_TYPES.includes(question.type),
      ).length,
      manualGradingCount: questions.filter((question) =>
        MANUAL_GRADED_TYPES.includes(question.type),
      ).length,
    },
    timing: await quizTimingPayload(doc),
  };
}

function loadQuestionsLean(quizId) {
  return QuizQuestion.find({ quiz: quizId }).sort({ position: 1, createdAt: 1 }).lean();
}

/**
 * The shuffled option order this attempt received.
 *
 * Stored as a Mongo map, but readable as a plain object after `lean()`, so both
 * shapes are accepted rather than assuming the driver round-tripped it.
 */
function readOptionOrder(attempt, questionId) {
  const source = attempt.optionOrder;
  if (!source) return null;
  const key = String(questionId);
  if (typeof source.get === "function") {
    const value = source.get(key);
    if (Array.isArray(value)) return value;
  }
  const plain = source[key];
  return Array.isArray(plain) ? plain : null;
}

/** Applies one autosave entry without touching fields the client does not own. */
function applyAnswerPatch(answer, entry, marksSnapshot) {
  if (entry.response !== undefined) answer.response = entry.response;
  if (entry.responseText !== undefined) {
    answer.responseText = optionalString(entry.responseText, "Response", { max: 20000 }) || "";
  }
  if (entry.markedForReview !== undefined) {
    answer.markedForReview = Boolean(entry.markedForReview);
  }
  if (marksSnapshot !== null && marksSnapshot !== undefined) {
    answer.marksSnapshot = marksSnapshot;
  }
}

/* ------------------------------------------------------------------ */
/* Question serialisation and validation                               */
/* ------------------------------------------------------------------ */

/** Teacher-facing shape. Includes the marking key — never served to a student. */
function serialiseQuestionForManager(question) {
  return {
    id: String(question._id),
    courseId: String(question.course?._id || question.course || ""),
    weekId: question.week ? String(question.week) : null,
    quizId: question.quiz ? String(question.quiz) : null,
    bankOriginId: question.bankOriginId ? String(question.bankOriginId) : null,
    type: question.type,
    difficulty: question.difficulty,
    text: question.text,
    richText: question.richText || "",
    codeSnippet: question.codeSnippet || "",
    notation: question.notation || "",
    imageFileId: question.imageFileId ? String(question.imageFileId) : null,
    options: (question.options || []).map((option) => ({
      id: option.id,
      text: option.text,
    })),
    marks: question.marks,
    category: question.category || null,
    topic: question.topic || null,
    learningObjective: question.learningObjective
      ? String(question.learningObjective)
      : null,
    explanation: question.explanation || "",
    correctAnswer: question.correctAnswer || [],
    requiresManualGrading: MANUAL_GRADED_TYPES.includes(question.type),
    position: question.position ?? 0,
    usageCount: question.usageCount || 0,
    updatedAt: question.updatedAt || null,
  };
}

const TRUE_FALSE_OPTIONS = [
  { id: "TRUE", text: "True" },
  { id: "FALSE", text: "False" },
];

/**
 * Validates and normalises a question payload.
 *
 * The grading key is checked against the question type here rather than at mark
 * time: a multiple-choice question whose key names an option that does not exist
 * would silently score every student zero, and that has to be impossible to
 * store in the first place.
 */
function buildQuestionFields({ body, courseId, actor, base = {} }) {
  const type = optionalEnum(body.type, "Question type", QUESTION_TYPES, { upper: true }) ||
    base.type;
  if (!type) {
    throw validationError("A question type is required.", [
      { field: "type", message: "Choose a question type." },
    ]);
  }

  const text = body.text !== undefined
    ? requireQuestionText(body.text)
    : base.text;
  const marks =
    body.marks !== undefined
      ? toNumber(body.marks, "Marks", { min: 0, max: 1000 })
      : Number(base.marks ?? 0);
  if (!Number.isFinite(marks) || marks < 0) {
    throw validationError("Marks must be a number of zero or more.", [
      { field: "marks", message: "Enter the marks this question carries." },
    ]);
  }

  const options = buildQuestionOptions({ body, type, base });
  const correctAnswer = buildCorrectAnswer({ body, type, options, text, base });

  const fields = {
    course: courseId,
    type,
    text,
    richText:
      body.richText !== undefined
        ? optionalString(body.richText, "Rich text", { max: 24000 }) || ""
        : base.richText || "",
    codeSnippet:
      body.codeSnippet !== undefined
        ? optionalString(body.codeSnippet, "Code snippet", { max: 8000 }) || ""
        : base.codeSnippet || "",
    notation:
      body.notation !== undefined
        ? optionalString(body.notation, "Notation", { max: 4000 }) || ""
        : base.notation || "",
    imageFileId:
      body.imageFileId !== undefined
        ? body.imageFileId
          ? requireObjectId(body.imageFileId, "Image file")
          : null
        : base.imageFileId || null,
    options,
    marks: Math.round(marks * 100) / 100,
    position:
      body.position !== undefined
        ? toInt(body.position, "Position", { min: 1 })
        : Number(base.position ?? 0),
    category:
      body.category !== undefined
        ? optionalString(body.category, "Category", { max: 120 })
        : base.category || null,
    topic:
      body.topic !== undefined
        ? optionalString(body.topic, "Topic", { max: 160 })
        : base.topic || null,
    learningObjective:
      body.learningObjective !== undefined
        ? body.learningObjective
          ? requireObjectId(body.learningObjective, "Learning objective")
          : null
        : base.learningObjective || null,
    explanation:
      body.explanation !== undefined
        ? optionalString(body.explanation, "Explanation", { max: 8000 }) || ""
        : base.explanation || "",
    correctAnswer,
    requiresManualGrading: MANUAL_GRADED_TYPES.includes(type),
    // Authorship is set once, at creation. An edit keeps the original author.
    createdBy: base.createdBy || actor?._id || actor?.id || null,
    updatedBy: actor?._id || actor?.id || null,
  };

  return fields;
}

function requireQuestionText(value) {
  const text = String(value ?? "").trim();
  if (text.length < 3) {
    throw validationError("Question text is required.", [
      { field: "text", message: "Enter the question." },
    ]);
  }
  if (text.length > 8000) {
    throw validationError("Question text must be 8000 characters or fewer.", [
      { field: "text", message: "Keep the question under 8000 characters." },
    ]);
  }
  return text;
}

/** Options are normalised once, with stable ids that the key can refer to. */
function buildQuestionOptions({ body, type, base }) {
  if (type === "TRUE_FALSE") return TRUE_FALSE_OPTIONS;

  if (!["MULTIPLE_CHOICE", "MULTIPLE_SELECT"].includes(type)) return [];

  const source = body.options !== undefined ? body.options : base.options;
  const list = Array.isArray(source) ? source : [];
  const options = [];
  const seen = new Set();

  list.forEach((entry, index) => {
    const optionText = String(entry?.text ?? "").trim();
    if (!optionText) return;
    let id = String(entry?.id ?? "").trim() || `option_${index + 1}`;
    if (seen.has(id)) id = `${id}_${index + 1}`;
    seen.add(id);
    options.push({ id, text: optionText.slice(0, 2000) });
  });

  if (options.length < 2) {
    throw validationError("A choice question needs at least two options.", [
      { field: "options", message: "Add at least two answer options." },
    ]);
  }
  return options;
}

/** Builds the grading key and refuses one that could not be marked. */
function buildCorrectAnswer({ body, type, options, text, base }) {
  const optionIds = options.map((option) => option.id);

  switch (type) {
    case "MULTIPLE_CHOICE":
    case "TRUE_FALSE": {
      const raw =
        body.correctAnswer !== undefined
          ? body.correctAnswer
          : Array.isArray(base.correctAnswer)
            ? base.correctAnswer
            : [];
      const picked = (Array.isArray(raw) ? raw : [raw])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
      if (picked.length !== 1 || !optionIds.includes(picked[0])) {
        throw validationError("Choose exactly one correct option.", [
          { field: "correctAnswer", message: "Select the single correct option." },
        ]);
      }
      return [picked[0]];
    }

    case "MULTIPLE_SELECT": {
      const raw =
        body.correctAnswer !== undefined
          ? body.correctAnswer
          : Array.isArray(base.correctAnswer)
            ? base.correctAnswer
            : [];
      const picked = Array.from(
        new Set((Array.isArray(raw) ? raw : [raw]).map((value) => String(value ?? "").trim())),
      ).filter(Boolean);
      if (!picked.length || picked.some((id) => !optionIds.includes(id))) {
        throw validationError("Choose every correct option for this question.", [
          { field: "correctAnswer", message: "Select at least one listed option." },
        ]);
      }
      return picked;
    }

    case "FILL_BLANK": {
      const raw = body.correctAnswer !== undefined ? body.correctAnswer : base.correctAnswer;
      const groups = (Array.isArray(raw) ? raw : []).map((group) =>
        (Array.isArray(group) ? group : [group])
          .map((value) => String(value ?? "").trim())
          .filter(Boolean),
      );
      const usable = groups.filter((group) => group.length);
      if (!usable.length) {
        throw validationError("Each blank needs at least one accepted answer.", [
          { field: "correctAnswer", message: "Enter the accepted answers for each blank." },
        ]);
      }
      const blanks = (String(text).match(/_{3,}/g) || []).length;
      if (blanks && blanks !== usable.length) {
        throw validationError(
          `This question has ${blanks} blank(s) but ${usable.length} answer group(s) were given.`,
          [
            {
              field: "correctAnswer",
              message: "Give exactly one answer group per blank.",
            },
          ],
        );
      }
      return usable;
    }

    case "NUMERIC": {
      const raw = body.correctAnswer !== undefined ? body.correctAnswer : base.correctAnswer;
      const arr = Array.isArray(raw) ? raw : raw !== undefined && raw !== null ? [raw] : [];
      if (!arr.length) {
        throw validationError("A correct numeric value is required.", [
          { field: "correctAnswer", message: "Enter the correct numeric answer." },
        ]);
      }
      const val = Number(arr[0]);
      if (!Number.isFinite(val)) {
        throw validationError("Correct numeric answer must be a valid number.", [
          { field: "correctAnswer", message: "Enter a valid numeric answer." },
        ]);
      }
      const tolerance = arr[1] !== undefined && arr[1] !== null && arr[1] !== "" ? Number(arr[1]) : 0;
      if (!Number.isFinite(tolerance) || tolerance < 0) {
        throw validationError("Tolerance must be zero or a positive number.", [
          { field: "tolerance", message: "Enter a non-negative tolerance." },
        ]);
      }
      return [val, tolerance];
    }

    case "SHORT_ANSWER":
    case "LONG_ANSWER":
    default: {
      const raw = body.correctAnswer !== undefined ? body.correctAnswer : base.correctAnswer;
      const reference = (Array.isArray(raw) ? raw : raw ? [raw] : [])
        .map((value) => (Array.isArray(value) ? value.join(" / ") : String(value ?? "").trim()))
        .filter(Boolean);
      // The model answer is a marking reference only; it never produces a mark.
      return reference.length ? [reference.join(" · ")] : [];
    }
  }
}

/** Rewrites `position` so a removed question leaves no gap in the paper. */
async function reindexQuizQuestions(quiz) {
  const questions = await loadQuizQuestions(quiz._id);
  let changed = false;
  for (let index = 0; index < questions.length; index += 1) {
    if ((questions[index].position ?? 0) !== index + 1) {
      questions[index].position = index + 1;
      await questions[index].save();
      changed = true;
    }
  }
  return { count: questions.length, changed };
}

/** A user-supplied search term must not act as a regular expression. */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requireText(value, label, max = 180) {
  const text = String(value ?? "").trim();
  if (text.length < 2) {
    throw validationError(`${label} is required.`, [
      {
        field: label.toLowerCase().replace(/\s+/g, ""),
        message: `Enter a ${label.toLowerCase()}.`,
      },
    ]);
  }
  if (text.length > max) {
    throw validationError(`${label} must be ${max} characters or fewer.`, [
      {
        field: label.toLowerCase().replace(/\s+/g, ""),
        message: `Keep the ${label.toLowerCase()} under ${max} characters.`,
      },
    ]);
  }
  return text;
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

export { escapeRegExp, serialiseQuestionForManager };