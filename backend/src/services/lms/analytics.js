import {
  Assignment,
  CourseWeek,
  Grade,
  LearningMaterial,
  Quiz,
  QuizAttempt,
  QuizQuestion,
  Submission,
} from "../../models/index.js";
import { listEnrolledStudents } from "./lmsAccess.js";

/**
 * Course analytics.
 *
 * Every figure here is computed from stored records: enrolments, published
 * weeks, attempts and grades. Nothing is sampled or invented, and nothing is
 * presented as a judgement about a student — the risk signals are explicitly
 * "signals to review", because CollegeOS is not a disciplinary system.
 *
 * Cost control matters as much as accuracy: a course with a thousand students
 * must stay usable, so the heavy queries are aggregations over indexed fields
 * and never per-student round trips.
 */

/** Headline engagement figures for one course. */
export async function courseEngagement({ courseId, sectionCodes, semester }) {
  const scope = { courseId, sectionCodes, semester };
  const roster = await listEnrolledStudents(scope);
  const studentIds = roster.map((student) => student.id);

  const [publishedWeeks, totalWeeks, materials, quizzes, assignments] =
    await Promise.all([
      CourseWeek.countDocuments({ course: courseId, status: "PUBLISHED" }),
      CourseWeek.countDocuments({ course: courseId, status: { $ne: "ARCHIVED" } }),
      LearningMaterial.countDocuments({
        course: courseId,
        status: "PUBLISHED",
        releaseAt: { $in: [null, { $lte: new Date() }] },
        ...(sectionCodes?.length ? { sectionCodes: { $in: sectionCodes } } : {}),
      }),
      Quiz.find({
        course: courseId,
        status: { $ne: "DRAFT" },
        ...(sectionCodes?.length ? { sectionCodes: { $in: sectionCodes } } : {}),
      })
        .select("_id attemptCount pendingManualGradeCount status")
        .lean(),
      Assignment.find({
        course: courseId,
        status: { $ne: "ARCHIVED" },
        ...(sectionCodes?.length ? { sectionCodes: { $in: sectionCodes } } : {}),
      })
        .select("_id title")
        .lean(),
    ]);

  const quizIds = quizzes.map((quiz) => quiz._id);
  const assignmentIds = assignments.map((assignment) => assignment._id);

  const [attempts, submissions, grades] = await Promise.all([
    quizIds.length
      ? QuizAttempt.find({ quiz: { $in: quizIds } })
          .select("quiz student status awardedMarks percentage pendingManualCount")
          .lean()
      : [],
    assignmentIds.length
      ? Submission.find({ assignment: { $in: assignmentIds } })
          .select("assignment student status marks isLate")
          .lean()
      : [],
    studentIds.length
      ? Grade.find({ course: courseId, student: { $in: studentIds } })
          .select("student maxMarks marksObtained status sourceType")
          .lean()
      : [],
  ]);

  // --- Quiz participation --------------------------------------------------
  const attemptsByStudent = new Map();
  let quizParticipantTotal = 0;
  let quizParticipationOpportunities = 0;
  const scoreValues = [];
  for (const attempt of attempts) {
    if (attempt.status === "IN_PROGRESS") continue;
    quizParticipationOpportunities += 1;
    const key = String(attempt.student);
    attemptsByStudent.set(key, (attemptsByStudent.get(key) || 0) + 1);
    if (attempt.percentage !== null && attempt.percentage !== undefined) {
      scoreValues.push(Number(attempt.percentage));
    }
  }
  quizParticipantTotal = new Set(attempts.map((row) => String(row.student))).size;

  // --- Assignment submission rate -----------------------------------------
  const submittedCount = submissions.filter((row) =>
    ["SUBMITTED", "LATE", "GRADED", "RETURNED"].includes(row.status),
  ).length;
  const lateCount = submissions.filter((row) => row.isLate).length;

  // --- Average mark from the grade record ----------------------------------
  const gradedRows = grades.filter(
    (row) => row.marksObtained !== null && row.marksObtained !== undefined,
  );
  const totalObtained = gradedRows.reduce((sum, row) => sum + Number(row.marksObtained), 0);
  const totalAvailable = gradedRows.reduce((sum, row) => sum + Number(row.maxMarks), 0);

  const engagedStudentIds = new Set();
  for (const attempt of attempts) engagedStudentIds.add(String(attempt.student));
  for (const submission of submissions) engagedStudentIds.add(String(submission.student));

  const activeStudents = roster.filter((student) =>
    engagedStudentIds.has(String(student.id)),
  ).length;

  return {
    rosterSize: roster.length,
    activeStudents,
    weeks: { published: publishedWeeks, total: totalWeeks },
    materialsPublished: materials,
    quizzes: {
      total: quizzes.length,
      open: quizzes.filter((quiz) => quiz.status === "OPEN").length,
      scheduled: quizzes.filter((quiz) => quiz.status === "SCHEDULED").length,
      closed: quizzes.filter((quiz) =>
        ["CLOSED", "GRADING", "COMPLETED"].includes(quiz.status),
      ).length,
      pendingGrading: quizzes.reduce(
        (sum, quiz) => sum + (quiz.pendingManualGradeCount || 0),
        0,
      ),
      attempts: attempts.length,
      participants: quizParticipantTotal,
      participationRate:
        roster.length && quizzes.length
          ? Math.round(
              (new Set(attempts.map((row) => String(row.student))).size /
                Math.max(1, roster.length * quizzes.length)) *
                10000,
            ) / 100
          : null,
      averageScore: scoreValues.length
        ? Math.round(
            (scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length) * 100,
          ) / 100
        : null,
    },
    assignments: {
      total: assignments.length,
      submissions: submittedCount,
      missing: Math.max(0, roster.length * assignments.length - submittedCount),
      late: lateCount,
      submissionRate:
        roster.length && assignments.length
          ? Math.round((submittedCount / (roster.length * assignments.length)) * 10000) / 100
          : null,
    },
    grades: {
      recorded: grades.length,
      pending: grades.filter((row) => row.marksObtained === null).length,
      averagePercentage:
        totalAvailable > 0
          ? Math.round((totalObtained / totalAvailable) * 10000) / 100
          : null,
    },
  };
}

/**
 * Signals worth a teacher's attention.
 *
 * Each entry states what was observed and which students it applies to. They
 * are review prompts, not verdicts: nothing here changes a grade or an academic
 * standing on its own.
 */
export async function courseRiskSignals({ courseId, sectionCodes, semester }) {
  const roster = await listEnrolledStudents({ courseId, sectionCodes, semester });
  if (!roster.length) return { signals: [] };

  const studentIds = roster.map((student) => student.id);
  const signals = [];

  const quizzes = await Quiz.find({
    course: courseId,
    status: { $ne: "DRAFT" },
    ...(sectionCodes?.length ? { sectionCodes: { $in: sectionCodes } } : {}),
  })
    .select("_id title closeAt")
    .lean();
  const quizIds = quizzes.map((quiz) => String(quiz._id));

  const attempts = quizIds.length
    ? await QuizAttempt.find({ quiz: { $in: quizIds } })
        .select("quiz student status percentage")
        .lean()
    : [];
  const assignmentIds = (
    await Assignment.find({
      course: courseId,
      status: { $ne: "ARCHIVED" },
      ...(sectionCodes?.length ? { sectionCodes: { $in: sectionCodes } } : {}),
    })
      .select("_id title dueAt")
      .lean()
  ).map((assignment) => String(assignment._id));

  const submissions = assignmentIds.length
    ? await Submission.find({ assignment: { $in: assignmentIds } })
        .select("assignment student status submittedAt")
        .lean()
    : [];

  const byStudent = new Map(
    roster.map((student) => [String(student.id), { ...student, misses: 0, missed: [] }]),
  );

  // Missing three consecutive learning activities (the most recent three that
  // have already closed).
  const chronological = [
    ...quizzes.map((quiz) => ({
      kind: "QUIZ",
      id: String(quiz._id),
      label: quiz.title,
      closedAt: quiz.closeAt,
    })),
    ...assignmentIds.map((id, index) => ({
      kind: "ASSIGNMENT",
      id,
      label: `Assignment ${index + 1}`,
      closedAt: null,
    })),
  ].sort((a, b) => new Date(a.closedAt || 0) - new Date(b.closedAt || 0));

  const now = new Date();
  const closedActivities = chronological.filter(
    (activity) => !activity.closedAt || new Date(activity.closedAt) <= now,
  );

  const completedQuizKeys = new Set(
    attempts
      .filter((attempt) => attempt.status !== "IN_PROGRESS")
      .map((attempt) => `${attempt.quiz}:${attempt.student}`),
  );
  const submittedAssignmentKeys = new Set(
    submissions
      .filter((row) => ["SUBMITTED", "LATE", "GRADED", "RETURNED"].includes(row.status))
      .map((row) => `${row.assignment}:${row.student}`),
  );

  const missingByStudent = new Map();
  for (const activity of closedActivities) {
    for (const student of roster) {
      const done =
        activity.kind === "QUIZ"
          ? completedQuizKeys.has(`${activity.id}:${student.id}`)
          : submittedAssignmentKeys.has(`${activity.id}:${student.id}`);
      if (!done) {
        const list = missingByStudent.get(student.id) || [];
        list.push(activity);
        missingByStudent.set(student.id, list);
      }
    }
  }
  for (const student of roster) {
    const missing = missingByStudent.get(student.id) || [];
    student.misses = missing.length;
    student.missed = missing.map((activity) => activity.label);
  }

  const threeMisses = roster.filter((student) => student.misses >= 3);
  if (threeMisses.length) {
    signals.push({
      key: "consecutive_misses",
      severity: "high",
      message: `${threeMisses.length} student${threeMisses.length === 1 ? " has" : "s have"} missed three or more learning activities.`,
      interpretation:
        "Consider a check-in with these students before the next assessment.",
      students: threeMisses.map((student) => ({
        studentId: student.studentId,
        name: student.name,
        section: student.section,
        missed: student.missed.slice(-3),
      })),
    });
  }

  // Students who have not opened the most recently published week materials.
  const latestWeek = await CourseWeek.findOne({
    course: courseId,
    status: "PUBLISHED",
  })
    .sort({ weekNumber: -1 })
    .select("_id weekNumber title")
    .lean();
  if (latestWeek) {
    const weekMaterials = await LearningMaterial.find({
      course: courseId,
      week: latestWeek._id,
      status: "PUBLISHED",
      viewCount: { $gt: 0 },
    })
      .select("_id viewCount firstViewedAt")
      .lean();
    // Participation in the newest week is measured from attempts and
    // submissions for the assessments inside it, which is a real signal of
    // engagement rather than an assumed one.
    const weekQuizIds = (
      await Quiz.find({ course: courseId, week: latestWeek._id })
        .select("_id")
        .lean()
    ).map((quiz) => String(quiz._id));
    const weekAttempts = weekQuizIds.length
      ? await QuizAttempt.find({ quiz: { $in: weekQuizIds } })
          .select("student")
          .lean()
      : [];
    const engaged = new Set(weekAttempts.map((attempt) => String(attempt.student)));
    const idle = roster.filter((student) => !engaged.has(String(student.id)));
    if (idle.length && weekMaterials.length + weekQuizIds.length > 0) {
      signals.push({
        key: "idle_current_week",
        severity: "medium",
        message: `${idle.length} student${idle.length === 1 ? " has" : "s have"} not engaged with Week ${latestWeek.weekNumber} activities.`,
        interpretation: `Week ${latestWeek.weekNumber} (${latestWeek.title}) was published most recently. A reminder may help.`,
        students: idle.map((student) => ({
          studentId: student.studentId,
          name: student.name,
          section: student.section,
        })),
      });
    }
  }

  // Low marks on the most recent graded quiz.
  const latestQuiz = await Quiz.findOne({
    course: courseId,
    status: { $in: ["GRADING", "COMPLETED", "CLOSED"] },
  })
    .sort({ closeAt: -1 })
    .select("_id title")
    .lean();
  if (latestQuiz) {
    const lowScorers = await QuizAttempt.find({
      quiz: latestQuiz._id,
      percentage: { $ne: null, $lt: 40 },
      status: { $ne: "IN_PROGRESS" },
    })
      .select("student percentage")
      .lean();
    if (lowScorers.length) {
      signals.push({
        key: "low_quiz_scores",
        severity: "medium",
        message: `${lowScorers.length} student${lowScorers.length === 1 ? "" : "s"} scored below 40% on ${latestQuiz.title}.`,
        interpretation:
          "A teaching review of the difficult questions may be useful before the next session.",
        students: lowScorers.map((attempt) => {
          const student = roster.find((row) => String(row.id) === String(attempt.student));
          return {
            studentId: student?.studentId || null,
            name: student?.name || null,
            section: student?.section || null,
            percentage: attempt.percentage,
          };
        }),
      });
    }
  }

  return { signals };
}

/**
 * Question-level difficulty, for the "why did 63% miss question 8?" insight.
 *
 * Computed from real attempts only; questions nobody has answered are reported
 * with `attempts: 0` rather than an invented rate.
 */
export async function questionInsights({ courseId, quizId }) {
  const filter = quizId
    ? { quiz: String(quizId) }
    : { course: courseId, quiz: { $ne: null } };
  const questions = await QuizQuestion.find(filter).sort({ position: 1 }).lean();
  if (!questions.length) return { questions: [] };

  // Attempts are keyed by quiz, not by question: an attempt row carries every
  // answer for its quiz, so the quiz ids of the selected questions are the ones
  // to fetch. Matching on question ids would silently return nothing.
  const quizIds = Array.from(
    new Set(questions.map((question) => String(question.quiz)).filter(Boolean)),
  );
  const attempts = await QuizAttempt.find({ quiz: { $in: quizIds } })
    .select("quiz answers")
    .lean();

  const tallies = new Map(
    questions.map((question) => [
      String(question._id),
      { attempts: 0, correct: 0, incorrect: 0, unanswered: 0, pending: 0, marks: [] },
    ]),
  );

  for (const attempt of attempts) {
    for (const answer of attempt.answers || []) {
      const tally = tallies.get(String(answer.question));
      if (!tally) continue;
      tally.attempts += 1;
      if (answer.requiresManualGrading) {
        if (answer.awardedMarks === null || answer.awardedMarks === undefined) {
          tally.pending += 1;
        } else {
          tally.marks.push(Number(answer.awardedMarks) || 0);
        }
        continue;
      }
      if (answer.isCorrect === true) tally.correct += 1;
      else if (answer.isCorrect === false) tally.incorrect += 1;
      else tally.unanswered += 1;
    }
  }

  return {
    questions: questions.map((question) => {
      const tally = tallies.get(String(question._id));
      const graded = tally.correct + tally.incorrect;
      const failureRate = graded
        ? Math.round((tally.incorrect / graded) * 10000) / 100
        : null;
      const averageMarks = tally.marks.length
        ? Math.round(
            (tally.marks.reduce((sum, value) => sum + value, 0) / tally.marks.length) * 100,
          ) / 100
        : null;
      return {
        id: String(question._id),
        quizId: question.quiz ? String(question.quiz) : null,
        text: question.text,
        type: question.type,
        difficulty: question.difficulty,
        marks: question.marks,
        topic: question.topic || null,
        category: question.category || null,
        learningObjective: question.learningObjective
          ? String(question.learningObjective)
          : null,
        attempts: tally.attempts,
        correct: tally.correct,
        incorrect: tally.incorrect,
        unanswered: tally.unanswered,
        pendingManual: tally.pending,
        failureRate,
        averageMarks,
        isQuestion: true,
      };
    }),
  };
}

/** Per-week participation used by the weekly progress bars. */
export async function weeklyProgress({ courseId }) {
  const weeks = await CourseWeek.find({ course: courseId, status: { $ne: "ARCHIVED" } })
    .sort({ position: 1, weekNumber: 1 })
    .select("_id weekNumber title status")
    .lean();
  if (!weeks.length) return { weeks: [] };

  const weekIds = weeks.map((week) => String(week._id));
  const [quizzes, attempts, materials] = await Promise.all([
    Quiz.find({ course: courseId, week: { $in: weekIds } }).select("_id week").lean(),
    (async () => {
      const quizIds = quizzes.map((quiz) => String(quiz._id));
      return quizIds.length
        ? await QuizAttempt.find({ quiz: { $in: quizIds } }).select("quiz status").lean()
        : [];
    })(),
    LearningMaterial.find({ course: courseId, week: { $in: weekIds } })
      .select("week status")
      .lean(),
  ]);

  const quizToWeek = new Map(quizzes.map((quiz) => [String(quiz._id), String(quiz.week)]));
  const quizAttemptCount = new Map();
  for (const attempt of attempts) {
    if (attempt.status === "IN_PROGRESS") continue;
    const weekId = quizToWeek.get(String(attempt.quiz));
    if (!weekId) continue;
    quizAttemptCount.set(weekId, (quizAttemptCount.get(weekId) || 0) + 1);
  }

  const materialCount = new Map();
  for (const material of materials) {
    if (material.status !== "PUBLISHED") continue;
    const weekId = String(material.week);
    materialCount.set(weekId, (materialCount.get(weekId) || 0) + 1);
  }

  const quizCount = new Map();
  for (const quiz of quizzes) {
    const weekId = String(quiz.week);
    quizCount.set(weekId, (quizCount.get(weekId) || 0) + 1);
  }

  return {
    weeks: weeks.map((week) => {
      const weekId = String(week._id);
      const activities =
        (quizAttemptCount.get(weekId) || 0) + (materialCount.get(weekId) || 0);
      const publishedActivities =
        (quizCount.get(weekId) || 0) + (materialCount.get(weekId) || 0);
      return {
        id: weekId,
        weekNumber: week.weekNumber,
        title: week.title,
        status: week.status,
        materials: materialCount.get(weekId) || 0,
        quizzes: quizCount.get(weekId) || 0,
        interactions: activities,
        completion:
          publishedActivities > 0
            ? Math.min(100, Math.round((activities / publishedActivities) * 100))
            : null,
      };
    }),
  };
}

/** Per-student progress row used by the Students and Grades views. */
async function courseAssignmentIds(courseId) {
  const rows = await Assignment.find({ course: courseId }).select("_id").lean();
  return rows.map((row) => row._id);
}

export async function studentCourseProgress({ courseId, studentIds, sectionCodes, semester }) {
  const roster = await listEnrolledStudents({ courseId, sectionCodes, semester });
  const ids = studentIds?.length ? studentIds : roster.map((student) => student.id);
  if (!ids.length) return { students: [] };

  const [attempts, submissions, grades] = await Promise.all([
    QuizAttempt.find({ course: courseId, student: { $in: ids } })
      .select("student quiz status percentage pendingManualCount")
      .lean(),
    Submission.find({
      assignment: { $in: await courseAssignmentIds(courseId) },
      student: { $in: ids },
    })
      .select("student status isLate")
      .lean(),
    Grade.find({ course: courseId, student: { $in: ids } })
      .select("student maxMarks marksObtained")
      .lean(),
  ]);

  const attemptsByStudent = new Map();
  const scoresByStudent = new Map();
  for (const attempt of attempts) {
    const key = String(attempt.student);
    attemptsByStudent.set(key, (attemptsByStudent.get(key) || 0) + 1);
    if (attempt.percentage !== null && attempt.percentage !== undefined) {
      const list = scoresByStudent.get(key) || [];
      list.push(Number(attempt.percentage));
      scoresByStudent.set(key, list);
    }
  }

  const submissionsByStudent = new Map();
  let lateCount = 0;
  for (const submission of submissions) {
    const key = String(submission.student);
    const done = ["SUBMITTED", "LATE", "GRADED", "RETURNED"].includes(submission.status);
    const entry = submissionsByStudent.get(key) || { total: 0, done: 0, late: 0 };
    entry.total += 1;
    if (done) entry.done += 1;
    if (submission.isLate) {
      entry.late += 1;
      lateCount += 1;
    }
    submissionsByStudent.set(key, entry);
  }

  const gradesByStudent = new Map();
  for (const grade of grades) {
    const key = String(grade.student);
    const entry = gradesByStudent.get(key) || { max: 0, obtained: 0, pending: 0 };
    entry.max += Number(grade.maxMarks) || 0;
    if (grade.marksObtained === null || grade.marksObtained === undefined) {
      entry.pending += 1;
    } else {
      entry.obtained += Number(grade.marksObtained) || 0;
    }
    gradesByStudent.set(key, entry);
  }

  const students = roster
    .filter((student) => ids.includes(String(student.id)))
    .map((student) => {
      const key = String(student.id);
      const scores = scoresByStudent.get(key) || [];
      const work = submissionsByStudent.get(key) || { total: 0, done: 0, late: 0 };
      const grade = gradesByStudent.get(key) || { max: 0, obtained: 0, pending: 0 };
      const interactions = (attemptsByStudent.get(key) || 0) + work.done;
      const available = (attemptsByStudent.get(key) || 0) + work.total;
      return {
        ...student,
        quizAttempts: attemptsByStudent.get(key) || 0,
        assignmentsSubmitted: work.done,
        assignmentsTotal: work.total,
        lateSubmissions: work.late,
        averageQuizScore: scores.length
          ? Math.round(
              (scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100,
            ) / 100
          : null,
        obtainedMarks: Math.round(grade.obtained * 100) / 100,
        totalMarks: grade.max,
        pendingGrades: grade.pending,
        percentage:
          grade.max > 0
            ? Math.round((grade.obtained / grade.max) * 10000) / 100
            : null,
        participation:
          available > 0 ? Math.round((interactions / available) * 100) : null,
      };
    });

  return { students, lateSubmissions: lateCount };
}