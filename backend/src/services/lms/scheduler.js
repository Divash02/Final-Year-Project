import {
  LearningMaterial,
  Quiz,
  QuizAttempt,
  QuizQuestion,
  CourseWeek,
} from "../../models/index.js";
import { logAudit } from "../../db.js";
import { notifyStudents } from "./notifier.js";
import { listEnrolledStudents } from "./lmsAccess.js";
import {
  syncQuizLifecycle,
  autoSubmitExpiredAttempts,
  refreshQuizProgress,
} from "./quizEngine.js";
import { formatForAudit } from "../academicClock.js";
import { runScheduledSeatingPublication } from "../examSeatingService.js";

/**
 * Academic delivery scheduler.
 *
 * CollegeOS does not ask a teacher to be present at 10:00 to open a quiz or to
 * remember to publish a handout. A single low-frequency sweep on the server
 * does it, and every automatic action is written to the audit trail exactly as
 * a manual one would be.
 *
 * Two properties make this safe:
 *  - it is idempotent — a sweep that finds nothing to do changes nothing;
 *  - it is not the *only* enforcement. Every read and write re-derives the same
 *    state from the server clock, so a delayed sweep can never let a student
 *    submit late or see unreleased material.
 */

const DEFAULT_INTERVAL_MS = 30 * 1000;
let timer = null;
let running = false;

function intervalFromEnv() {
  const configured = Number(process.env.COLLEGEOS_LMS_SWEEP_INTERVAL_MS);
  return Number.isFinite(configured) && configured >= 5000
    ? configured
    : DEFAULT_INTERVAL_MS;
}

/**
 * Runs one pass of the sweep.
 *
 * Exported so tests can drive it deterministically instead of waiting for the
 * timer, and so an operator can force a pass.
 */
export async function runAcademicSweep(now = new Date()) {
  const summary = {
    releasedMaterials: 0,
    releasedWeeks: 0,
    openedQuizzes: 0,
    closedQuizzes: 0,
    autoSubmitted: 0,
    scheduledSeatingPublished: 0,
  };

  // 1. Scheduled learning materials become published at their release instant.
  const dueMaterials = await LearningMaterial.find({
    status: "SCHEDULED",
    releaseAt: { $ne: null, $lte: now },
  }).limit(200);
  for (const material of dueMaterials) {
    material.status = "PUBLISHED";
    material.publishedAt = material.releaseAt || now;
    material.updatedBy = material.uploadedBy;
    await material.save();
    summary.releasedMaterials += 1;
    await logAudit({
      userId: material.uploadedBy,
      action: "LEARNING_MATERIAL_RELEASED",
      module: "lms",
      resource: "learning_material",
      resourceId: material._id.toString(),
      details: `Learning material "${material.title}" released to students automatically at ${await formatForAudit(material.releaseAt)}.`,
    });
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
        keyPrefix: `material_release_${material._id}`,
        category: "lms_material",
        actionUrl: `/learning/course/${material.course}`,
      });
    }
  }

  // 2. Scheduled weeks become visible at their release instant.
  const dueWeeks = await CourseWeek.find({
    status: "DRAFT",
    releaseAt: { $ne: null, $lte: now },
  }).limit(200);
  for (const week of dueWeeks) {
    week.status = "PUBLISHED";
    week.publishedAt = week.releaseAt || now;
    await week.save();
    summary.releasedWeeks += 1;
    await logAudit({
      userId: week.createdBy,
      action: "COURSE_WEEK_RELEASED",
      module: "lms",
      resource: "course_week",
      resourceId: week._id.toString(),
      details: `Week ${week.weekNumber} released to students automatically at ${await formatForAudit(week.releaseAt)}.`,
    });
  }

  // 3. Quizzes open and close on their schedule; closing auto-submits attempts.
  const dueQuizzes = await Quiz.find({
    status: { $in: ["SCHEDULED", "OPEN"] },
    closeAt: { $gte: now },
  })
    .sort({ openAt: 1 })
    .limit(200);
  for (const quiz of dueQuizzes) {
    const result = await syncQuizLifecycle(quiz, now);
    if (result.event === "OPENED") summary.openedQuizzes += 1;
  }

  const expiredQuizzes = await Quiz.find({
    status: { $in: ["SCHEDULED", "OPEN"] },
    closeAt: { $lte: now },
  })
    .sort({ closeAt: 1 })
    .limit(200);
  for (const quiz of expiredQuizzes) {
    const result = await syncQuizLifecycle(quiz, now);
    if (result.event === "CLOSED") {
      summary.closedQuizzes += 1;
      summary.autoSubmitted += result.autoSubmitted || 0;
    }
  }

  // 4. Attempts that hit their own deadline are submitted even if the quiz
  //    window is still open (a shorter per-attempt duration than the window).
  const lapsed = await QuizAttempt.find({
    status: "IN_PROGRESS",
    expiresAt: { $lte: now },
  })
    .sort({ expiresAt: 1 })
    .limit(200);
  const touched = new Set();
  for (const attempt of lapsed) {
    if (touched.has(String(attempt.quiz))) continue;
    touched.add(String(attempt.quiz));
    const quiz = await Quiz.findById(attempt.quiz);
    if (!quiz) continue;
    const questions = await QuizQuestion.find({ quiz: quiz._id }).lean();
    summary.autoSubmitted += await autoSubmitExpiredAttempts(quiz, now);
  }

  // 5. Keep the quiz counters and grading state honest.
  if (touched.size) {
    for (const quizId of touched) {
      await refreshQuizProgress(quizId).catch(() => null);
    }
  }

  // 6. Examination seating plans whose scheduled publication
  //    instant has passed are published server-side. The claim
  //    inside the publication workflow is atomic, so retries
  //    and restarts can never publish a plan twice.
  try {
    const seatingResults = await runScheduledSeatingPublication(now);
    summary.scheduledSeatingPublished = seatingResults.filter(
      (r) => r.status === "PUBLISHED"
    ).length;
  } catch (error) {
    console.error("Scheduled seating publication sweep failed:", error.message);
  }

  return summary;
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await runAcademicSweep();
  } catch (error) {
    // A sweep failure must never take the API down; the next tick retries.
    console.error("Academic delivery sweep failed:", error.message);
  } finally {
    running = false;
  }
}

/** Starts the sweep. Idempotent, so repeated boot calls are harmless. */
export function startAcademicScheduler() {
  if (timer) return timer;
  const interval = intervalFromEnv();
  timer = setInterval(tick, interval);
  if (typeof timer.unref === "function") timer.unref();
  console.log(
    `Academic delivery scheduler started (every ${Math.round(interval / 1000)}s).`,
  );
  return timer;
}

export function stopAcademicScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}