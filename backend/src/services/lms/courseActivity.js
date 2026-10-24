import {
  Assignment,
  CourseAnnouncement,
  CourseWeek,
  LearningMaterial,
  Quiz,
  QuizAttempt,
  Student,
  Submission,
  TeachingProgress,
} from "../../models/index.js";

/**
 * Course activity.
 *
 * Activity is never stored as its own feed. Every entry here is projected from
 * the record that actually happened — a submission, an attempt, an uploaded file,
 * a published announcement, a recorded teaching position — so the feed cannot
 * claim something that the academic record does not support, and it cannot drift
 * out of step with the tables it summarises.
 *
 * A student sees their own activity inside a course; a teacher sees the cohort's.
 * The projection is assembled per course and then filtered by viewer, which keeps
 * one query per source table rather than one query per student.
 */
export async function buildCourseActivity({
  courseId,
  sectionCodes = null,
  limit = 40,
  viewer = null,
}) {
  const now = new Date();
  const since = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 365 * 5);
  const cap = Math.min(Math.max(Number(limit) || 40, 1), 100);

  const [assignments, quizzes, materials, announcements, weeks, teaching] =
    await Promise.all([
      Assignment.find({
        course: courseId,
        createdAt: { $gte: since },
        ...(sectionCodes?.length ? { sectionCodes: { $in: sectionCodes } } : {}),
      })
        .select("title dueAt status createdAt updatedAt facultyUser")
        .sort({ createdAt: -1 })
        .lean(),
      Quiz.find({ course: courseId, createdAt: { $gte: since } })
        .select("title status createdAt updatedAt openAt closeAt")
        .sort({ createdAt: -1 })
        .lean(),
      LearningMaterial.find({
        course: courseId,
        createdAt: { $gte: since },
        archivedAt: null,
      })
        .select("title materialType status createdAt updatedAt version supersedes uploadedBy")
        .sort({ createdAt: -1 })
        .lean(),
      CourseAnnouncement.find({ course: courseId, createdAt: { $gte: since } })
        .select("title pinned publishedAt publishAt createdAt authorUser")
        .sort({ createdAt: -1 })
        .lean(),
      CourseWeek.find({ course: courseId, createdAt: { $gte: since } })
        .select("weekNumber title status publishedAt createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      TeachingProgress.find({ course: courseId, createdAt: { $gte: since } })
        .select(
          "taughtOn topic fromUnit toUnit unitLabel totalUnits notes material sectionCode createdAt facultyUser",
        )
        .sort({ createdAt: -1 })
        .lean(),
    ]);

  const assignmentIds = assignments.map((row) => String(row._id));
  const quizIds = quizzes.map((row) => String(row._id));

  const isStudentViewer = Boolean(viewer?.studentId);
  const studentFilter = isStudentViewer ? { student: viewer.studentId } : {};

  const [submissions, attempts, cohortNames] = await Promise.all([
    assignmentIds.length
      ? Submission.find({ assignment: { $in: assignmentIds }, ...studentFilter })
          .select("assignment student studentUser status submittedAt gradedAt createdAt updatedAt")
          .sort({ updatedAt: -1 })
          .lean()
      : Promise.resolve([]),
    quizIds.length
      ? QuizAttempt.find({ quiz: { $in: quizIds }, ...studentFilter })
          .select("quiz student studentUser status submittedAt gradedAt createdAt updatedAt")
          .sort({ updatedAt: -1 })
          .lean()
      : Promise.resolve([]),
    isStudentViewer
      ? Promise.resolve(new Map())
      : Student.find({
          _id: {
            $in: Array.from(
              new Set([
                ...submissions.map((row) => String(row.student)),
                ...attempts.map((row) => String(row.student)),
              ]),
            ),
          },
        })
          .select("firstName lastName studentId")
          .lean()
          .then((rows) => new Map(rows.map((row) => [String(row._id), row]))),
  ]);

  const assignmentTitle = new Map(
    assignments.map((row) => [String(row._id), row.title]),
  );
  const quizTitle = new Map(quizzes.map((row) => [String(row._id), row.title]));
  const materialTitle = new Map(materials.map((row) => [String(row._id), row.title]));

  const events = [];

  const push = (event) => {
    const at = event.at ? new Date(event.at).getTime() : Number.NaN;
    if (Number.isFinite(at) && at >= since.getTime()) events.push(event);
  };

  for (const row of submissions) {
    const who = describeStudent(cohortNames, row.student);
    const title = assignmentTitle.get(String(row.assignment)) || "an assignment";
    if (row.status !== "DRAFT") {
      push({
        id: `submission:${row._id}`,
        kind: "ASSIGNMENT_SUBMITTED",
        at: row.submittedAt || row.updatedAt || row.createdAt,
        actor: who,
        summary: `Submitted ${title}`,
        detail: row.isLate ? "Recorded as a late submission." : null,
        courseId: String(courseId),
        ref: { type: "ASSIGNMENT", id: String(row.assignment) },
      });
    }
    if (row.gradedAt) {
      push({
        id: `graded:${row._id}`,
        kind: "ASSIGNMENT_GRADED",
        at: row.gradedAt,
        actor: null,
        summary: `${title} was marked`,
        detail: who ? `For ${who}` : null,
        courseId: String(courseId),
        ref: { type: "ASSIGNMENT", id: String(row.assignment) },
      });
    }
  }

  for (const row of attempts) {
    const who = describeStudent(cohortNames, row.student);
    const title = quizTitle.get(String(row.quiz)) || "a quiz";
    if (row.submittedAt || (row.status && row.status !== "IN_PROGRESS")) {
      push({
        id: `attempt:${row._id}`,
        kind: "QUIZ_ATTEMPTED",
        at: row.submittedAt || row.updatedAt || row.createdAt,
        actor: who,
        summary: `Attempted ${title}`,
        detail: null,
        courseId: String(courseId),
        ref: { type: "QUIZ", id: String(row.quiz) },
      });
    }
    if (row.gradedAt) {
      push({
        id: `attempt-graded:${row._id}`,
        kind: "QUIZ_GRADED",
        at: row.gradedAt,
        actor: null,
        summary: `${title} was marked`,
        detail: who ? `For ${who}` : null,
        courseId: String(courseId),
        ref: { type: "QUIZ", id: String(row.quiz) },
      });
    }
  }

  for (const row of materials) {
    push({
      id: `material:${row._id}`,
      kind: row.supersedes ? "MATERIAL_VERSIONED" : "MATERIAL_UPLOADED",
      at: row.createdAt,
      actor: null,
      summary:
        row.supersedes
          ? `Uploaded version ${row.version || 2} of ${row.title}`
          : `Uploaded ${row.title}`,
      detail: row.materialType ? row.materialType.replace(/_/g, " ").toLowerCase() : null,
      courseId: String(courseId),
      ref: { type: "MATERIAL", id: String(row._id) },
    });
  }

  for (const row of announcements) {
    push({
      id: `announcement:${row._id}`,
      kind: row.publishedAt ? "ANNOUNCEMENT_POSTED" : "ANNOUNCEMENT_SCHEDULED",
      at: row.publishedAt || row.publishAt || row.createdAt,
      actor: null,
      summary:
        row.publishedAt ? `Posted "${row.title}"` : `Scheduled "${row.title}"`,
      detail: row.pinned ? "Pinned to the course." : null,
      courseId: String(courseId),
      ref: { type: "ANNOUNCEMENT", id: String(row._id) },
    });
  }

  for (const row of weeks) {
    push({
      id: `week:${row._id}`,
      kind: row.status === "PUBLISHED" ? "WEEK_PUBLISHED" : "WEEK_CREATED",
      at: row.publishedAt || row.createdAt,
      actor: null,
      summary:
        row.status === "PUBLISHED"
          ? `Published Week ${row.weekNumber}: ${row.title}`
          : `Created Week ${row.weekNumber}: ${row.title}`,
      detail: null,
      courseId: String(courseId),
      ref: { type: "WEEK", id: String(row._id) },
    });
  }

  for (const row of teaching) {
    const label = row.unitLabel || "slide";
    push({
      id: `teaching:${row._id}`,
      kind: "TEACHING_PROGRESS_RECORDED",
      at: row.createdAt,
      actor: null,
      summary: `Taught ${materialTitle.get(String(row.material)) || "a material"} (${label}s ${row.fromUnit}–${row.toUnit})`,
      detail: row.topic || row.notes || null,
      courseId: String(courseId),
      ref: { type: "MATERIAL", id: String(row.material) },
    });
  }

  events.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());

  return {
    events: events.slice(0, cap),
    total: events.length,
    truncated: events.length > cap,
    serverTime: now.toISOString(),
  };
}

function describeStudent(names, studentId) {
  if (!studentId) return null;
  const student = names.get(String(studentId));
  if (!student) return null;
  return [student.firstName, student.lastName].filter(Boolean).join(" ");
}