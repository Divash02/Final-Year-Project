import {
  Grade,
  Quiz,
  QuizAttempt,
  Submission,
  Assignment,
  Exam,
} from "../../models/index.js";

/**
 * Central grade record projection.
 *
 * Quizzes, assignments and examinations each own their own mark in the record
 * that produced it. This module projects those marks into one `Grade` collection
 * so the course gradebook, the student transcript and examination reporting all
 * read the same academic record — while the original mark stays the single
 * source of truth and every projection can be rebuilt from it.
 *
 * Nothing here ever invents a mark. A row is written with `PENDING` status when
 * the assessment exists but has not been marked, which is why "not graded yet"
 * can never be read as a zero.
 */

function percentageOf(marks, maxMarks) {
  if (marks === null || marks === undefined || !maxMarks) return null;
  return Math.round((Number(marks) / Number(maxMarks)) * 10000) / 100;
}

/** Projects a graded quiz attempt into the gradebook. */
export async function syncQuizAttemptGrade({ attempt, quiz }) {
  const quizDoc =
    quiz ||
    (await Quiz.findById(attempt.quiz)
      .populate("course", "code name")
      .populate("week", "weekNumber title"));
  if (!quizDoc) return null;

  const course = quizDoc.course;
  const graded = attempt.awardedMarks !== null && attempt.awardedMarks !== undefined;

  return await Grade.findOneAndUpdate(
    { student: attempt.student, sourceType: "QUIZ", sourceId: String(attempt._id) },
    {
      $set: {
        studentUser: attempt.studentUser,
        course: quizDoc.course?._id || quizDoc.course,
        week: quizDoc.week?._id || quizDoc.week || null,
        assessmentTitle: quizDoc.title,
        assessmentType: "QUIZ",
        maxMarks: quizDoc.maxMarks,
        marksObtained: graded ? attempt.awardedMarks : null,
        percentage: graded ? attempt.percentage : null,
        status: graded ? "GRADED" : "PENDING",
        feedback: attempt.overallFeedback || "",
        academicYear: quizDoc.academicYear,
        semester: quizDoc.semester ?? null,
        sectionCodes: quizDoc.sectionCodes || [],
        gradedBy: attempt.gradedBy || null,
        gradedAt: attempt.gradedAt || null,
      },
      $setOnInsert: { sourceId: String(attempt._id) },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
}

/**
 * Projects an assignment submission into the gradebook.
 *
 * Assignments are outside the LMS week planner but belong to the same academic
 * record, so a graded submission appears in the course gradebook next to quiz
 * results rather than in a second, disconnected marking system.
 */
export async function syncSubmissionGrade({ submission, assignment }) {
  const assignmentDoc =
    assignment ||
    (await Assignment.findById(submission.assignment).populate("course", "code name"));
  if (!assignmentDoc) return null;

  const marked = submission.marks !== null && submission.marks !== undefined;

  return await Grade.findOneAndUpdate(
    { student: submission.student, sourceType: "ASSIGNMENT", sourceId: String(submission._id) },
    {
      $set: {
        studentUser: submission.studentUser,
        course: assignmentDoc.course?._id || assignmentDoc.course,
        week: null,
        assessmentTitle: assignmentDoc.title,
        assessmentType: "ASSIGNMENT",
        maxMarks: assignmentDoc.maxMarks ?? 100,
        marksObtained: marked ? submission.marks : null,
        percentage: marked ? percentageOf(submission.marks, assignmentDoc.maxMarks) : null,
        status: marked ? "GRADED" : "PENDING",
        feedback: submission.feedback || "",
        isLate: Boolean(submission.isLate),
        academicYear: assignmentDoc.academicYear,
        semester: assignmentDoc.semester ?? null,
        sectionCodes: assignmentDoc.sectionCodes || [],
        gradedBy: submission.gradedBy || null,
        gradedAt: submission.gradedAt || null,
      },
      $setOnInsert: { sourceId: String(submission._id) },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
}

/** Projects a published examination result into the gradebook. */
export async function syncExamResultGrade({ examResult, exam }) {
  const examDoc =
    exam || (await Exam.findById(examResult.exam).populate("course", "code name"));
  if (!examDoc) return null;

  const maxMarks = examDoc.totalMarks ?? 100;
  return await Grade.findOneAndUpdate(
    { student: examResult.student, sourceType: "EXAM", sourceId: String(examResult._id) },
    {
      $set: {
        studentUser: examResult.studentUser,
        course: examDoc.course?._id || examDoc.course,
        week: null,
        assessmentTitle: examDoc.title,
        assessmentType: "EXAM",
        maxMarks,
        marksObtained: examResult.marksObtained,
        percentage: percentageOf(examResult.marksObtained, maxMarks),
        status: examDoc.resultsStatus === "PUBLISHED" ? "PUBLISHED" : "GRADED",
        feedback: examResult.remarks || "",
        academicYear: examDoc.academicYear || "",
        semester: examDoc.semester ?? null,
        sectionCodes: examDoc.sectionCodes || [],
      },
      $setOnInsert: { sourceId: String(examResult._id) },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
}

/**
 * The course gradebook: one row per student, one column per assessment.
 *
 * Assessments come from the grade record rather than from whichever module
 * happens to be rendered, so a quiz and an exam of the same course sit in one
 * table with consistent totals.
 */
export async function courseGradebook({
  courseId,
  studentIds,
  statusFilter = null,
} = {}) {
  const grades = await Grade.find({
    course: String(courseId),
    ...(studentIds?.length ? { student: { $in: studentIds } } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  })
    .populate("student", "studentId firstName lastName section")
    .populate("week", "weekNumber title")
    .sort({ createdAt: 1 })
    .lean();

  const byStudent = new Map();
  const assessments = new Map();

  for (const grade of grades) {
    const studentId = String(grade.student?._id || grade.student);
    if (!byStudent.has(studentId)) {
      byStudent.set(studentId, {
        studentId,
        studentCode: grade.student?.studentId || null,
        name: grade.student
          ? `${grade.student.firstName || ""} ${grade.student.lastName || ""}`.trim()
          : null,
        section: grade.student?.section || null,
        rows: [],
        totalMarks: 0,
        obtainedMarks: 0,
        gradedCount: 0,
        pendingCount: 0,
      });
    }
    byStudent.get(studentId).rows.push({
      id: String(grade._id),
      sourceType: grade.sourceType,
      sourceId: grade.sourceId,
      title: grade.assessmentTitle,
      weekNumber: grade.week?.weekNumber ?? null,
      weekTitle: grade.week?.title ?? null,
      maxMarks: grade.maxMarks,
      marksObtained: grade.marksObtained,
      percentage: grade.percentage,
      status: grade.status,
      isLate: grade.isLate,
      feedback: grade.feedback,
      gradedAt: grade.gradedAt,
    });

    assessments.set(grade.sourceId, {
      sourceId: grade.sourceId,
      sourceType: grade.sourceType,
      title: grade.assessmentTitle,
      maxMarks: grade.maxMarks,
      weekNumber: grade.week?.weekNumber ?? null,
      weekTitle: grade.week?.title ?? null,
    });

    const row = byStudent.get(studentId);
    row.totalMarks += Number(grade.maxMarks) || 0;
    if (grade.marksObtained !== null && grade.marksObtained !== undefined) {
      row.obtainedMarks += Number(grade.marksObtained) || 0;
      row.gradedCount += 1;
    } else {
      row.pendingCount += 1;
    }
  }

  const students = Array.from(byStudent.values()).map((row) => ({
    ...row,
    obtainedMarks: Math.round(row.obtainedMarks * 100) / 100,
    percentage:
      row.totalMarks > 0
        ? Math.round((row.obtainedMarks / row.totalMarks) * 10000) / 100
        : null,
  }));

  return {
    assessments: Array.from(assessments.values()),
    students,
  };
}

/** Course-level mark statistics used by the workspace overview. */
export async function courseGradeSummary(courseId) {
  const rows = await Grade.aggregate([
    { $match: { course: String(courseId) } },
    {
      $group: {
        _id: "$sourceType",
        assessments: { $addToSet: "$sourceId" },
        students: { $addToSet: "$student" },
        graded: { $sum: { $cond: [{ $ne: ["$marksObtained", null] }, 1, 0] } },
        total: { $sum: 1 },
        marksObtained: { $sum: { $ifNull: ["$marksObtained", 0] } },
        maxMarks: { $sum: { $ifNull: ["$maxMarks", 0] } },
      },
    },
  ]);

  return rows.map((row) => ({
    sourceType: row._id,
    assessments: row.assessments.length,
    students: row.students.length,
    graded: row.graded,
    pending: row.total - row.graded,
    averagePercentage:
      row.maxMarks > 0
        ? Math.round((row.marksObtained / row.maxMarks) * 10000) / 100
        : null,
  }));
}

/** Clears the projection for an attempt that no longer exists. */
export async function removeQuizAttemptGrade(attemptId) {
  await Grade.deleteOne({ sourceType: "QUIZ", sourceId: String(attemptId) });
}

export async function latestAttemptFor(quizId, studentId) {
  return await QuizAttempt.findOne({ quiz: String(quizId), student: String(studentId) })
    .sort({ attemptNumber: -1 })
    .lean();
}

export async function syncSubmissionGradeById(submissionId) {
  const submission = await Submission.findById(submissionId).lean();
  if (!submission) return null;
  return await syncSubmissionGrade({ submission });
}