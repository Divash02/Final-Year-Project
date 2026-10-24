import { Quiz, QuizQuestion, QuizAttempt } from "../../models/index.js";
import { logAudit } from "../../db.js";
import {
  AUTO_GRADED_TYPES,
  MANUAL_GRADED_TYPES,
} from "../../models/QuizQuestion.js";
import { notifyStudents } from "./notifier.js";
import { listEnrolledStudents } from "./lmsAccess.js";
import { clockPayload, formatForAudit } from "../academicClock.js";
import { syncQuizAttemptGrade } from "./gradebook.js";

/**
 * Quiz engine.
 *
 * This service owns every academic rule about a quiz sitting:
 *
 *  - which state the quiz is in, derived from the stored lifecycle plus the
 *    *server* clock (`now >= openAt`, `now < closeAt`);
 *  - what a student may see when the paper is served — and specifically, what
 *    they may never see (correct answers never leave this module);
 *  - how an objective answer is marked, and how a submitted attempt is turned
 *    into a result;
 *  - what happens when the closing time arrives.
 *
 * The client is never trusted for any of it: it never decides whether a quiz is
 * open, how long is left, whether an attempt may start, what a mark is, or
 * whether a submission is still acceptable.
 */

/** Fills the missing transitions of the quiz lifecycle against the server clock. */
export async function syncQuizLifecycle(quiz, now = new Date()) {
  const current = quiz;
  const openAt = new Date(current.openAt);
  const closeAt = new Date(current.closeAt);

  if (current.status === "DRAFT" || current.status === "COMPLETED") {
    return { quiz: current, changed: false, event: null };
  }

  if (current.status === "SCHEDULED" && now >= openAt) {
    current.status = "OPEN";
    current.openedAt = openAt;
    await current.save();
    await logAudit({
      userId: current.facultyUser,
      action: "QUIZ_OPENED",
      module: "lms",
      resource: "quiz",
      resourceId: current._id.toString(),
      details: `Quiz "${current.title}" opened automatically at ${await formatForAudit(openAt)}.`,
      metadata: { openAt, closeAt },
    });
    await notifyQuizOpened(current);
    return { quiz: current, changed: true, event: "OPENED" };
  }

  if (
    ["OPEN", "SCHEDULED"].includes(current.status) &&
    now >= closeAt &&
    current.status !== "CLOSED"
  ) {
    current.status = "CLOSED";
    current.closedAt = closeAt;
    await current.save();
    await logAudit({
      userId: current.facultyUser,
      action: "QUIZ_CLOSED",
      module: "lms",
      resource: "quiz",
      resourceId: current._id.toString(),
      details: `Quiz "${current.title}" closed automatically at ${await formatForAudit(closeAt)}.`,
      metadata: { openAt, closeAt },
    });
    const submitted = await autoSubmitExpiredAttempts(current, now);
    await notifyQuizClosed(current, submitted);
    return { quiz: current, changed: true, event: "CLOSED", autoSubmitted: submitted };
  }

  return { quiz: current, changed: false, event: null };
}

/**
 * The state a caller experiences, which is not always the stored status.
 *
 * A `SCHEDULED` quiz whose open time has passed *behaves* as open even before a
 * sweep runs, so a missed sweep can never close a window a teacher already
 * scheduled.
 */
export function deriveQuizAvailability(quiz, now = new Date()) {
  const openAt = quiz.openAt ? new Date(quiz.openAt) : null;
  const closeAt = quiz.closeAt ? new Date(quiz.closeAt) : null;
  const status = quiz.status || "DRAFT";

  let availability = status;
  if (["OPEN", "CLOSED", "SCHEDULED"].includes(status) && openAt && closeAt) {
    if (now >= closeAt) availability = "CLOSED";
    else if (now >= openAt) availability = "OPEN";
    else availability = "SCHEDULED";
  }

  const msUntilOpen = openAt ? openAt.getTime() - now.getTime() : null;
  const msUntilClose = closeAt ? closeAt.getTime() - now.getTime() : null;

  return {
    availability,
    storedStatus: status,
    isOpen: availability === "OPEN",
    acceptsAttempts: availability === "OPEN",
    msUntilOpen: msUntilOpen !== null && msUntilOpen > 0 ? msUntilOpen : null,
    msUntilClose: msUntilClose !== null && msUntilClose > 0 ? msUntilClose : null,
    openAt,
    closeAt,
  };
}

/** Server-time payload that keeps a browser countdown anchored to the server. */
export async function quizTimingPayload(quiz, now = new Date()) {
  const availability = deriveQuizAvailability(quiz, now);
  return {
    ...(await clockPayload()),
    availability: availability.availability,
    storedStatus: availability.storedStatus,
    openAt: quiz.openAt,
    closeAt: quiz.closeAt,
    msUntilOpen: availability.msUntilOpen,
    msUntilClose: availability.msUntilClose,
  };
}

/** Cohort a quiz is addressed to, resolved from real enrolments. */
export async function resolveQuizCohort(quiz) {
  return await listEnrolledStudents({
    courseId: quiz.course,
    sectionCodes: quiz.sectionCodes,
    semester: quiz.semester,
    academicYear: quiz.academicYear,
  });
}

async function notifyQuizOpened(quiz) {
  const cohort = await resolveQuizCohort(quiz);
  await notifyStudents({
    students: cohort,
    title: `Quiz open: ${quiz.title}`,
    message: `${quiz.title} is now open. You have ${quiz.durationMinutes} minute${quiz.durationMinutes === 1 ? "" : "s"} to complete it.`,
    keyPrefix: `quiz_open_${quiz._id}`,
    category: "lms_quiz",
    priority: "high",
    actionUrl: `/learning/course/${quiz.course}?quiz=${quiz._id}`,
  });
}

async function notifyQuizClosed(quiz, autoSubmittedCount) {
  const cohort = await resolveQuizCohort(quiz);
  await notifyStudents({
    students: cohort,
    title: `Quiz closed: ${quiz.title}`,
    message:
      autoSubmittedCount > 0
        ? `${quiz.title} has closed. ${autoSubmittedCount} attempt${autoSubmittedCount === 1 ? " was" : "s were"} submitted automatically when the time expired.`
        : `${quiz.title} has closed and no longer accepts new attempts.`,
    keyPrefix: `quiz_close_${quiz._id}`,
    category: "lms_quiz",
    priority: "normal",
    actionUrl: `/learning/course/${quiz.course}?quiz=${quiz._id}`,
  });
}

/**
 * Submits every in-progress attempt whose deadline has passed.
 *
 * This is the automatic submission rule: when the closing time arrives the
 * attempt is locked, the saved answers become final, objective questions are
 * marked and subjective answers are queued for the teacher.
 */
export async function autoSubmitExpiredAttempts(quiz, now = new Date()) {
  const attempts = await QuizAttempt.find({
    quiz: quiz._id,
    status: "IN_PROGRESS",
  });
  if (!attempts.length) return 0;

  const questions = await QuizQuestion.find({ quiz: quiz._id }).lean();
  let submitted = 0;

  for (const attempt of attempts) {
    const deadline = new Date(attempt.expiresAt);
    const effectiveDeadline =
      deadline < now
        ? deadline
        : quiz.closeAt && new Date(quiz.closeAt) < deadline
          ? new Date(quiz.closeAt)
          : deadline;
    if (effectiveDeadline > now) continue;
    await finaliseAttempt(attempt, quiz, questions, {
      reason: "AUTO_SUBMIT",
      auto: true,
      at: effectiveDeadline,
    });
    submitted += 1;
  }
  return submitted;
}

/** Fisher-Yates using the platform CSPRNG-free Math.random: order is not a secret. */
function shuffle(items) {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [list[index], list[swap]] = [list[swap], list[index]];
  }
  return list;
}

/**
 * Builds the order one student receives.
 *
 * The result is stored on the attempt, so a refresh resumes the same paper and a
 * later edit to the quiz cannot reshuffle an attempt already in progress.
 */
export function buildQuestionOrder(quiz, questions) {
  const ordered = [...questions].sort((a, b) => (a.position || 0) - (b.position || 0));
  const questionOrder = quiz.randomizeQuestions
    ? shuffle(ordered)
    : ordered;

  const optionOrder = {};
  if (quiz.randomizeOptions) {
    for (const question of questionOrder) {
      if (!question.options?.length) continue;
      const ids = question.options.map((option) => option.id);
      optionOrder[String(question._id)] = shuffle(ids);
    }
  }
  return {
    questionOrder: questionOrder.map((question) => String(question._id)),
    optionOrder,
  };
}

/** Public shape of a question as a student may receive it — no marking key. */
export function projectQuestionForAttempt(question, optionIds) {
  const options = (question.options || []).map((option) => ({
    id: option.id,
    text: option.text,
  }));
  const orderedOptions = optionIds?.length
    ? optionIds
        .map((id) => options.find((option) => option.id === id))
        .filter(Boolean)
    : options;

  return {
    id: String(question._id),
    type: question.type,
    text: question.text,
    richText: question.richText || "",
    codeSnippet: question.codeSnippet || "",
    notation: question.notation || "",
    imageFileId: question.imageFileId ? String(question.imageFileId) : null,
    marks: question.marks,
    category: question.category || null,
    difficulty: question.difficulty,
    requiresManualGrading: MANUAL_GRADED_TYPES.includes(question.type),
    options: orderedOptions,
  };
}

function normaliseText(value, caseSensitive) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return caseSensitive ? text : text.toLowerCase();
}

/**
 * Marks one answer.
 *
 * Objective questions are decided here and only here. The result carries the
 * awarded marks, whether it is an unanswered item, and how many marks are still
 * waiting for a human.
 */
export function gradeAnswer({ question, response, quiz }) {
  const marks = Number(question.marks) || 0;

  if (MANUAL_GRADED_TYPES.includes(question.type)) {
    return {
      awardedMarks: null,
      isCorrect: null,
      requiresManualGrading: true,
      answered: hasResponse(question.type, response),
    };
  }

  switch (question.type) {
    case "MULTIPLE_CHOICE":
    case "TRUE_FALSE": {
      const expected = String(question.correctAnswer?.[0] ?? "");
      const given = response === null || response === undefined ? "" : String(response);
      const answered = given.length > 0;
      const isCorrect = answered && given === expected;
      return {
        awardedMarks: isCorrect ? marks : 0,
        isCorrect,
        requiresManualGrading: false,
        answered,
      };
    }

    case "MULTIPLE_SELECT": {
      const expected = Array.from(
        new Set((question.correctAnswer || []).map((value) => String(value))),
      ).sort();
      const given = Array.from(
        new Set(
          (Array.isArray(response) ? response : response ? [response] : []).map((value) =>
            String(value),
          ),
        ),
      ).sort();
      const answered = given.length > 0;
      if (!answered) {
        return { awardedMarks: 0, isCorrect: false, requiresManualGrading: false, answered: false };
      }
      const correctSelected = given.filter((id) => expected.includes(id)).length;
      const wrongSelected = given.filter((id) => !expected.includes(id)).length;
      const isExact =
        correctSelected === expected.length && wrongSelected === 0;

      if (quiz.multipleSelectGrading === "PARTIAL_CREDIT" && expected.length) {
        const net = Math.max(0, correctSelected - wrongSelected);
        const awarded = Math.round((marks * net) / expected.length * 100) / 100;
        return {
          awardedMarks: awarded,
          isCorrect: isExact,
          requiresManualGrading: false,
          answered: true,
        };
      }
      return {
        awardedMarks: isExact ? marks : 0,
        isCorrect: isExact,
        requiresManualGrading: false,
        answered: true,
      };
    }

    case "FILL_BLANK": {
      const groups = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
      if (!groups.length) {
        return {
          awardedMarks: null,
          isCorrect: null,
          requiresManualGrading: true,
          answered: hasResponse("FILL_BLANK", response),
        };
      }
      const caseSensitive = Boolean(quiz.blankAnswerCaseSensitive);
      const given = Array.isArray(response) ? response : [response];
      let matched = 0;
      groups.forEach((group, index) => {
        const accepted = (Array.isArray(group) ? group : [group]).map((value) =>
          normaliseText(value, caseSensitive),
        );
        const attemptValue = normaliseText(given[index], caseSensitive);
        if (attemptValue && accepted.includes(attemptValue)) matched += 1;
      });
      const awarded = Math.round((marks * matched) / groups.length * 100) / 100;
      return {
        awardedMarks: awarded,
        isCorrect: matched === groups.length,
        requiresManualGrading: false,
        answered: given.some((value) => String(value ?? "").trim().length > 0),
      };
    }

    case "NUMERIC": {
      const given = response === null || response === undefined ? "" : String(response).trim();
      const answered = given.length > 0;
      if (!answered) {
        return { awardedMarks: 0, isCorrect: false, requiresManualGrading: false, answered: false };
      }
      const numGiven = Number(given);
      if (!Number.isFinite(numGiven)) {
        return { awardedMarks: 0, isCorrect: false, requiresManualGrading: false, answered: true };
      }
      // Expected can be [expectedValue] or [expectedValue, tolerance]
      const rawTarget = question.correctAnswer?.[0];
      const target = Number(rawTarget);
      const tolerance = Number(question.correctAnswer?.[1] ?? 0);
      const safeTolerance = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 0;
      const isCorrect =
        Number.isFinite(target) &&
        Math.abs(numGiven - target) <= safeTolerance;
      return {
        awardedMarks: isCorrect ? marks : 0,
        isCorrect,
        requiresManualGrading: false,
        answered: true,
      };
    }

    default:
      return {
        awardedMarks: null,
        isCorrect: null,
        requiresManualGrading: true,
        answered: hasResponse(question.type, response),
      };
  }
}

function hasResponse(type, response) {
  if (response === null || response === undefined) return false;
  if (Array.isArray(response)) return response.some((value) => String(value ?? "").trim() !== "");
  return String(response).trim().length > 0;
}

/**
 * Marks a submitted attempt and turns it into a result.
 *
 * Objective answers are marked immediately; subjective answers stay `null` and
 * counted as pending, so a partially graded attempt is never reported as a
 * final mark. `at` is the server instant the submission is timestamped with —
 * the deadline for an automatic submission, the request time otherwise.
 */
export async function finaliseAttempt(attempt, quiz, questions, { reason, auto = false, at } = {}) {
  const submittedAt = at ? new Date(at) : new Date();
  const byId = new Map(questions.map((question) => [String(question._id), question]));

  let objectiveMarks = 0;
  let manualMarks = 0;
  let pendingManualCount = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  for (const answer of attempt.answers) {
    const question = byId.get(String(answer.question));
    if (!question) continue;
    const graded = gradeAnswer({
      question,
      response: answer.response,
      quiz,
    });
    answer.awardedMarks = graded.awardedMarks;
    answer.isCorrect = graded.isCorrect;
    answer.requiresManualGrading = graded.requiresManualGrading;
    if (!graded.answered) unansweredCount += 1;
    else if (graded.isCorrect === true) correctCount += 1;
    else if (graded.isCorrect === false) incorrectCount += 1;

    if (graded.requiresManualGrading) pendingManualCount += 1;
    else objectiveMarks += Number(graded.awardedMarks) || 0;
  }

  attempt.objectiveMarks = round2(objectiveMarks);
  attempt.manualMarks = round2(manualMarks);
  attempt.pendingManualCount = pendingManualCount;
  attempt.correctCount = correctCount;
  attempt.incorrectCount = incorrectCount;
  attempt.unansweredCount = unansweredCount;
  attempt.status = auto ? "AUTO_SUBMITTED" : "SUBMITTED";
  attempt.submittedAt = submittedAt;
  attempt.autoSubmitted = Boolean(auto);
  attempt.maxMarksSnapshot = quiz.maxMarks;
  attempt.durationSeconds = Math.max(
    0,
    Math.round((submittedAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000),
  );
  if (!auto) {
    attempt.integrityEvents = (attempt.integrityEvents || []).filter(
      (event) => event.type !== "PAUSE",
    );
  }

  const settled = finaliseMarks(attempt, quiz.passingMarks);
  await attempt.save();

  await logAudit({
    userId: attempt.studentUser,
    action: auto ? "QUIZ_ATTEMPT_AUTO_SUBMITTED" : "QUIZ_ATTEMPT_SUBMITTED",
    module: "lms",
    resource: "quiz_attempt",
    resourceId: attempt._id.toString(),
    details: `Attempt ${attempt.attemptNumber} for quiz "${quiz.title}" ${auto ? "submitted automatically when the quiz closed" : "submitted"}.`,
    metadata: {
      quizId: String(quiz._id),
      attemptNumber: attempt.attemptNumber,
      reason,
      objectiveMarks: attempt.objectiveMarks,
      pendingManualCount,
      autoSubmitted: Boolean(auto),
    },
  });

  await syncQuizAttemptGrade({ attempt, quiz });
  return { attempt, pendingManualCount };
}

/**
 * Computes the total once nothing is waiting for a marker.
 *
 * `passed` is a real comparison against the quiz's pass mark, not a placeholder:
 * a student who scores 40% of a 20-mark quiz has not passed, and the record has
 * to say so before a transcript is ever derived from it.
 */
export function finaliseMarks(attempt, passingMarks = 0) {
  if (attempt.pendingManualCount > 0) {
    attempt.awardedMarks = null;
    attempt.percentage = null;
    attempt.passed = null;
    return attempt;
  }
  const total = round2((attempt.objectiveMarks || 0) + (attempt.manualMarks || 0));
  attempt.awardedMarks = total;
  attempt.percentage = attempt.maxMarksSnapshot
    ? round2((total / attempt.maxMarksSnapshot) * 100)
    : null;
  attempt.passed =
    attempt.percentage === null ? null : attempt.percentage >= (passingMarks || 0);
  return attempt;
}

/** Recomputes a manual grade after a marker awards or clears marks. */
export function recalculateAttemptMarks(attempt, passingMarks = 0) {
  let manualMarks = 0;
  let pending = 0;
  for (const answer of attempt.answers || []) {
    if (answer.requiresManualGrading) {
      if (answer.awardedMarks === null || answer.awardedMarks === undefined) pending += 1;
      else manualMarks += Number(answer.awardedMarks) || 0;
    }
  }
  attempt.manualMarks = round2(manualMarks);
  attempt.pendingManualCount = pending;

  if (pending > 0) {
    attempt.awardedMarks = null;
    attempt.percentage = null;
    attempt.passed = null;
    // Clearing a mark puts the paper back in the queue. `GRADED` must keep
    // meaning "nothing is waiting for a marker", or a badge and a gradebook row
    // would report a settled score for an unmarked answer.
    if (attempt.status === "GRADED") attempt.status = "SUBMITTED";
    return attempt;
  }
  const total = round2((attempt.objectiveMarks || 0) + attempt.manualMarks);
  attempt.awardedMarks = total;
  attempt.percentage = attempt.maxMarksSnapshot
    ? round2((total / attempt.maxMarksSnapshot) * 100)
    : null;
  attempt.passed =
    attempt.percentage === null ? null : attempt.percentage >= (passingMarks || 0);
  if (attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED") {
    attempt.status = "GRADED";
  }
  return attempt;
}

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Whether a student may see their own result yet.
 *
 * The policy is the teacher's decision; this function only evaluates it. It is
 * called on every read of an attempt result, so releasing results is a single
 * state change rather than a broadcast.
 */
export function areResultsReleased(quiz, attempt, now = new Date()) {
  const availability = deriveQuizAvailability(quiz, now);
  switch (quiz.resultReleasePolicy) {
    case "IMMEDIATELY":
      return attempt.status !== "IN_PROGRESS";
    case "AFTER_CLOSE":
      return availability.availability === "CLOSED" ||
        availability.availability === "GRADING" ||
        availability.availability === "COMPLETED";
    case "MANUAL":
      return Boolean(quiz.resultsReleasedAt);
    case "AFTER_GRADING":
    default:
      // Fully graded, and the marker has not withheld the release. A partially
      // graded attempt stays hidden until the whole paper is settled.
      return (
        attempt.awardedMarks !== null &&
        attempt.awardedMarks !== undefined &&
        attempt.status === "GRADED"
      );
  }
}

/** Recomputes the counters and lifecycle state shown on the quiz badge. */
export async function refreshQuizProgress(quizId) {
  const quiz = await Quiz.findById(quizId);
  if (!quiz) return null;

  const [attemptCount, pendingRows] = await Promise.all([
    QuizAttempt.countDocuments({
      quiz: quiz._id,
      status: { $ne: "IN_PROGRESS" },
    }),
    // `pendingManualGradeCount` is derived from the answers themselves so it can
    // never drift from the grading queue the teacher actually sees.
    QuizAttempt.aggregate([
      { $match: { quiz: quiz._id, status: { $in: ["SUBMITTED", "AUTO_SUBMITTED"] } } },
      { $unwind: "$answers" },
      {
        $match: {
          "answers.requiresManualGrading": true,
          "answers.awardedMarks": null,
        },
      },
      { $count: "total" },
    ]),
  ]);
  const pending = pendingRows[0]?.total || 0;

  quiz.attemptCount = attemptCount;
  quiz.pendingManualGradeCount = pending;

  const now = new Date();
  const closedByTime = quiz.closeAt && new Date(quiz.closeAt) <= now;
  if (!["DRAFT", "COMPLETED"].includes(quiz.status) && closedByTime) {
    if (pending > 0) quiz.status = "GRADING";
    else if (quiz.resultReleasePolicy === "MANUAL" && !quiz.resultsReleasedAt) {
      quiz.status = "CLOSED";
    } else quiz.status = "COMPLETED";
    quiz.completedAt = quiz.completedAt || now;
  }
  await quiz.save();
  return quiz;
}

export function isAutoGradable(type) {
  return AUTO_GRADED_TYPES.includes(type);
}