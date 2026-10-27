import {
  Exam,
  ExamResult,
  Student,
  Course,
  AuditLog,
} from "../../models/index.js";
import { executeAIReasoning } from "./aiProvider.js";
import { logAIActivity } from "./aiActivityService.js";

/**
 * Examination AI & Analytics Engine
 *
 * Implements Section 2 (Examination AI) and Section 7 (Examination Analytics).
 * Calculates real database grade distributions, pass/fail rates, median scores,
 * and identifies missing candidate marks.
 */

export async function getExaminationAnalytics({
  examId = null,
  program = null,
  semester = null,
  academicYear = null,
}) {
  const filter = {};
  if (examId) filter._id = examId;
  if (program) filter.program = program;
  if (semester) filter.semester = Number(semester);
  if (academicYear) filter.academicYear = academicYear;

  const exams = await Exam.find(filter).populate("course").lean();
  const examAnalyticsList = [];

  let aggregateCandidates = 0;
  let aggregatePassed = 0;
  let aggregateFailed = 0;
  let aggregateAbsent = 0;
  let aggregateMissingMarks = 0;

  for (const ex of exams) {
    const results = await ExamResult.find({ exam: ex._id }).lean();
    const candidateCount = results.length;
    aggregateCandidates += candidateCount;

    const gradeDistribution = {
      "A+": 0,
      "A": 0,
      "B+": 0,
      "B": 0,
      "C+": 0,
      "C": 0,
      "F": 0,
      "ABSENT": 0,
      "INCOMPLETE": 0,
    };

    let passCount = 0;
    let failCount = 0;
    let absentCount = 0;
    let missingMarksCount = 0;
    const numericMarks = [];

    for (const r of results) {
      if (r.isAbsent) {
        absentCount++;
        gradeDistribution["ABSENT"]++;
      } else if (r.marksObtained == null) {
        missingMarksCount++;
        gradeDistribution["INCOMPLETE"]++;
      } else {
        numericMarks.push(r.marksObtained);
        if (r.status === "PASSED" || (r.marksObtained >= 40)) {
          passCount++;
        } else {
          failCount++;
        }

        const g = r.grade || "C";
        if (gradeDistribution[g] !== undefined) {
          gradeDistribution[g]++;
        } else {
          gradeDistribution["C"]++;
        }
      }
    }

    aggregatePassed += passCount;
    aggregateFailed += failCount;
    aggregateAbsent += absentCount;
    aggregateMissingMarks += missingMarksCount;

    numericMarks.sort((a, b) => a - b);
    const mean = numericMarks.length > 0 ? numericMarks.reduce((a, b) => a + b, 0) / numericMarks.length : 0;
    const median =
      numericMarks.length > 0
        ? numericMarks.length % 2 === 0
          ? (numericMarks[numericMarks.length / 2 - 1] + numericMarks[numericMarks.length / 2]) / 2
          : numericMarks[Math.floor(numericMarks.length / 2)]
        : 0;

    const passRatePct = candidateCount > 0 ? Math.round((passCount / (candidateCount - absentCount || 1)) * 100) : 0;

    examAnalyticsList.push({
      examId: String(ex._id),
      examCode: ex.examCode || "EXAM",
      examTitle: ex.title,
      program: ex.program,
      semester: ex.semester,
      academicYear: ex.academicYear,
      courseCode: ex.course?.code || "SUBJ",
      courseName: ex.course?.name || ex.title,
      totalCandidates: candidateCount,
      passCount,
      failCount,
      absentCount,
      missingMarksCount,
      passRatePercentage: passRatePct,
      meanMark: Math.round(mean * 10) / 10,
      medianMark: Math.round(median * 10) / 10,
      gradeDistribution,
      status: ex.status,
      resultsStatus: ex.resultsStatus,
    });
  }

  const overallPassRate =
    aggregateCandidates > 0
      ? Math.round((aggregatePassed / (aggregateCandidates - aggregateAbsent || 1)) * 100)
      : 0;

  return {
    totalExamsEvaluated: exams.length,
    aggregateCandidates,
    aggregatePassed,
    aggregateFailed,
    aggregateAbsent,
    aggregateMissingMarks,
    overallPassRate,
    exams: examAnalyticsList,
  };
}

/**
 * Generate AI Examination Audit Report with narrative summary.
 */
export async function generateExamAIReport({ user, role, examId }) {
  const analytics = await getExaminationAnalytics({ examId });
  const exam = analytics.exams[0];
  if (!exam) throw new Error("Examination not found.");

  const aiRes = await executeAIReasoning({
    systemInstruction:
      "You are the CollegeOS Chief Examination Officer AI Assistant. Synthesize verified examination marks into an official institutional evaluation report.",
    userPrompt: `Generate an examination performance overview for ${exam.examTitle}.`,
    contextData: exam,
    fallbackSynthesis: `Official Examination Report for ${exam.examTitle}: ${exam.totalCandidates} candidates enrolled, ${exam.passCount} passed (${exam.passRatePercentage}% pass rate), ${exam.failCount} failed, and ${exam.absentCount} absent. Mean mark achieved was ${exam.meanMark} with a median of ${exam.medianMark}. ${exam.missingMarksCount > 0 ? `${exam.missingMarksCount} candidate marks remain unentered.` : "Marks are complete."}`,
  });

  await logAIActivity({
    user,
    role,
    module: "examination_ai",
    requestCategory: "EXAMINATION_REPORT",
    dataScope: { program: exam.program, semester: exam.semester },
    sourceRecords: [
      { collectionName: "Exam", recordId: exam.examId, label: exam.examTitle, identifier: exam.examCode },
    ],
    recommendation: aiRes.text,
    executionLatencyMs: 30,
  });

  return {
    reportText: aiRes.text,
    analytics: exam,
  };
}
