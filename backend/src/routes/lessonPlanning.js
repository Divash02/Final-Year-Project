import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import mongoose from "mongoose";
import {
  Course,
  CourseWeek,
  LearningObjective,
  TeachingProgress,
  LearningMaterial,
  Enrollment,
  CourseTeachingAssignment,
  FacultySubjectAssignment,
  Timetable,
  AttendanceSession,
} from "../models/index.js";
import { weeklyProgress } from "../services/lms/analytics.js";
import { institutionDate } from "../services/myTimetable.js";

export function registerLessonPlanningRoutes(app) {
  app.get(
    "/api/faculty/lesson-planning",
    requireAuth,
    requirePermission(["lms.view", "lms.content.manage"]),
    async (req, res) => {
      try {
        const { courseId } = req.query || {};
        const roles = getUserRoles(req.user);
        const isPrivileged = roles.some((r) =>
          ["super_admin", "dean", "hod", "program_coordinator", "registrar"].includes(r),
        );

        let scopedCourseIds = null;
        if (!isPrivileged && roles.includes("faculty")) {
          const [ta, sa] = await Promise.all([
            CourseTeachingAssignment.find({ facultyUser: req.user._id }).select("course").lean(),
            FacultySubjectAssignment.find({ facultyUser: req.user._id, isActive: true }).select("course").lean(),
          ]);
          scopedCourseIds = Array.from(new Set([...ta, ...sa].map((r) => String(r.course))));
          if (courseId && !scopedCourseIds.includes(String(courseId))) {
            return res.status(403).json({ error: "You are not assigned to this course." });
          }
        }

        const courseFilter = courseId
          ? { _id: courseId }
          : scopedCourseIds
            ? { _id: { $in: scopedCourseIds } }
            : {};
        const courses = await Course.find(courseFilter)
          .select("code name program semester academicYear status")
          .sort({ code: 1 })
          .limit(courseId ? 1 : 200)
          .lean();

        if (!courseId) {
          const summaries = await Promise.all(
            courses.map(async (c) => summarizeCourse(String(c._id))),
          );
          const byId = new Map(summaries.map((s) => [s.courseId, s]));
          return res.json({
            courses: courses.map((c) => ({
              id: String(c._id),
              code: c.code,
              name: c.name,
              program: c.program || null,
              semester: c.semester ?? null,
              academicYear: c.academicYear || null,
              status: c.status,
              ...(byId.get(String(c._id))?.summary || {}),
            })),
            serverDate: await institutionDate(),
          });
        }

        const selected = courses[0];
        if (!selected) return res.status(404).json({ error: "Course not found." });

        const [weeks, objectives, teaching, weekly, upcomingSessions, recentAttendance] = await Promise.all([
          CourseWeek.find({ course: selected._id }).sort({ position: 1, weekNumber: 1 }).lean(),
          LearningObjective.find({ course: selected._id }).sort({ position: 1, createdAt: 1 }).lean(),
          TeachingProgress.find({ course: selected._id })
            .populate("material", "title version week")
            .populate("facultyUser", "firstName middleName lastName")
            .sort({ taughtOn: -1, createdAt: -1 })
            .limit(120)
            .lean(),
          weeklyProgress({ courseId: String(selected._id) }).catch(() => []),
          Timetable.find({
            course: selected._id,
            ...(isPrivileged ? {} : { facultyUser: req.user._id }),
            status: { $ne: "CANCELLED" },
          })
            .select("date scheduledDay startTime endTime sectionCode room sessionType status facultyName")
            .sort({ date: 1, startTime: 1 })
            .limit(60)
            .lean(),
          AttendanceSession.find({ course: selected._id })
            .select("date startTime endTime sectionCode status topic completedAt facultyName")
            .sort({ date: -1, startTime: -1 })
            .limit(40)
            .lean(),
        ]);

        const objectivesByWeek = groupBy(objectives, (o) => String(o.week));
        const progressByWeek = groupBy(teaching, (t) => String(t.week || t.material?.week || ""));

        const weekRows = weeks.map((w) => {
          const id = String(w._id);
          const wObjectives = objectivesByWeek.get(id) || [];
          const wTeaching = progressByWeek.get(id) || [];
          const completed = w.status === "PUBLISHED" && wTeaching.length > 0;
          return {
            id,
            weekNumber: w.weekNumber,
            title: w.title,
            status: w.status,
            releaseAt: w.releaseAt || null,
            teachingPlan: w.teachingPlan || "",
            expectedOutcome: w.expectedOutcome || "",
            description: w.description || "",
            notes: w.notes || "",
            studyTimeMinutes: w.studyTimeMinutes ?? null,
            objectives: wObjectives.map((o) => ({ id: String(o._id), text: o.text, code: o.code || null, cognitiveLevel: o.cognitiveLevel || null })),
            teachingRecords: wTeaching.map((r) => serializeTeaching(r)),
            planned: w.status !== "ARCHIVED",
            completed,
            completionEvidence: wTeaching.length > 0 ? `${wTeaching.length} teaching record(s)` : w.status === "PUBLISHED" ? "Published, no teaching record yet" : "Not completed",
          };
        });

        const totalWeeks = weekRows.length;
        const completedWeeks = weekRows.filter((w) => w.completed).length;
        const pendingWeeks = weekRows.filter((w) => w.planned && !w.completed).length;
        const totalObjectives = objectives.length;
        const coveredObjectives = weekRows.filter((w) => w.objectives.length > 0 && w.teachingRecords.length > 0).reduce((n, w) => n + w.objectives.length, 0);

        res.json({
          course: {
            id: String(selected._id),
            code: selected.code,
            name: selected.name,
            program: selected.program || null,
            semester: selected.semester ?? null,
            academicYear: selected.academicYear || null,
          },
          summary: {
            totalWeeks,
            publishedWeeks: weekRows.filter((w) => w.status === "PUBLISHED").length,
            completedWeeks,
            pendingWeeks,
            syllabusCompletionPercentage: totalWeeks ? Math.round((completedWeeks / totalWeeks) * 100) : null,
            totalObjectives,
            coveredObjectivesApprox: coveredObjectives,
            teachingRecords: teaching.length,
          },
          weeks: weekRows,
          weeklyAnalytics: weekly,
          recentTeaching: teaching.slice(0, 20).map(serializeTeaching),
          timetableSessions: upcomingSessions.map((s) => ({
            id: String(s._id),
            date: s.date || null,
            day: s.scheduledDay,
            startTime: s.startTime,
            endTime: s.endTime,
            sectionCode: s.sectionCode,
            room: s.room || null,
            sessionType: s.sessionType || null,
            status: s.status,
            facultyName: s.facultyName || null,
          })),
          attendanceSessions: recentAttendance.map((s) => ({
            id: String(s._id),
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
            sectionCode: s.sectionCode,
            status: s.status,
            topic: s.topic || "",
            completedAt: s.completedAt || null,
          })),
          serverDate: await institutionDate(),
        });
      } catch (err) {
        console.error("lesson-planning error", err);
        res.status(500).json({ error: "Failed to load lesson planning data." });
      }
    },
  );
}

async function summarizeCourse(courseId) {
  const [weeks, objectives, teaching] = await Promise.all([
    CourseWeek.countDocuments({ course: courseId, status: { $ne: "ARCHIVED" } }),
    LearningObjective.countDocuments({ course: courseId }),
    TeachingProgress.countDocuments({ course: courseId }),
  ]);
  const completedWeeks = await CourseWeek.countDocuments({ course: courseId, status: "PUBLISHED" });
  return {
    courseId,
    summary: {
      totalWeeks: weeks,
      publishedWeeks: completedWeeks,
      totalObjectives: objectives,
      teachingRecords: teaching,
      syllabusCompletionPercentage: weeks ? Math.round((Math.min(completedWeeks, weeks) / weeks) * 100) : null,
    },
  };
}
function groupBy(list, keyFn) {
  const m = new Map();
  for (const item of list) { const k = keyFn(item); if (!k) continue; const a = m.get(k) || []; a.push(item); m.set(k, a); }
  return m;
}
function serializeTeaching(r) {
  const faculty = r.facultyUser ? [r.facultyUser.firstName, r.facultyUser.middleName, r.facultyUser.lastName].filter(Boolean).join(" ") : null;
  return {
    id: String(r._id),
    taughtOn: r.taughtOn,
    fromUnit: r.fromUnit,
    toUnit: r.toUnit,
    totalUnits: r.totalUnits ?? null,
    unitLabel: r.unitLabel || "slide",
    topic: r.topic || "",
    notes: r.notes || "",
    sessionName: r.sessionName || "",
    sectionCode: r.sectionCode || null,
    materialTitle: r.material?.title || null,
    materialVersion: r.material?.version || r.materialVersion || 1,
    facultyName: faculty,
    nextStartUnit: r.nextStartUnit ?? null,
  };
}
