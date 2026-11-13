import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import { StudyPlan, StudyActivity, Student, Course, Assignment, Exam, AcademicCalendarEvent } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function registerStudyPlannerRoutes(app) {
  app.get(
    "/api/study-planner/plans",
    requireAuth,
    requirePermission("studyPlanner.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");

        const filter = {};
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          filter.student = student._id;
        } else if (req.query.student) {
          filter.student = req.query.student;
        }

        if (req.query.academicYear) filter.academicYear = req.query.academicYear;
        if (req.query.semester) filter.semester = Number(req.query.semester);
        if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const [plans, total] = await Promise.all([
          StudyPlan.find(filter)
            .populate("student", "studentId firstName lastName program semester")
            .sort({ weekStartDate: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          StudyPlan.countDocuments(filter),
        ]);

        res.json({
          plans: plans.map((plan) => ({
            ...plan,
            id: String(plan._id),
            student: plan.student
              ? { id: String(plan.student._id), studentId: plan.student.studentId, fullName: `${plan.student.firstName} ${plan.student.lastName}`, program: plan.student.program, semester: plan.student.semester }
              : null,
            activities: (plan.activities || []).map((act) => ({
              ...act,
              id: String(act._id),
              course: act.course
                ? { id: String(act.course._id), code: act.course.code, name: act.course.name }
                : null,
            })),
          })),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (err) {
        console.error("Study plans list error:", err);
        res.status(500).json({ error: "Failed to load study plans." });
      }
    }
  );

app.get(
    "/api/study-planner/plans/:id",
    requireAuth,
    requirePermission("studyPlanner.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");

        let studentId = req.query.student;
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          studentId = student._id;
        }
        if (!studentId) return res.status(400).json({ error: "Student ID required." });

        const now = new Date();
        const plan = await StudyPlan.findOne({
          student: studentId,
          weekStartDate: { $lte: now },
          weekEndDate: { $gte: now },
          isActive: true,
        })
          .populate("student", "studentId firstName lastName program semester")
          .populate("activities.course", "code name")
          .lean();

        if (!plan) return res.json({ plan: null });

        res.json({
          plan: {
            ...plan,
            id: String(plan._id),
            student: plan.student
              ? { id: String(plan.student._id), studentId: plan.student.studentId, fullName: `${plan.student.firstName} ${plan.student.lastName}`, program: plan.student.program, semester: plan.student.semester }
              : null,
            activities: (plan.activities || []).map((act) => ({
              ...act,
              id: String(act._id),
              course: act.course
                ? { id: String(act.course._id), code: act.course.code, name: act.course.name }
                : null,
            })),
          },
        });
      } catch (err) {
        console.error("Current study plan error:", err);
        res.status(500).json({ error: "Failed to load current study plan." });
      }
    }
  );

  app.post(
    "/api/study-planner/plans/generate",
    requireAuth,
    requirePermission("studyPlanner.manage"),
    asyncHandler(async (req, res) => {
      const { studentId, academicYear, semester, weekStartDate } = req.body || {};

      if (!studentId || !academicYear || !semester || !weekStartDate) {
        return res.status(400).json({ error: "Student ID, academic year, semester, and week start date are required." });
      }

      const student = await Student.findById(studentId);
      if (!student) return res.status(404).json({ error: "Student not found." });

      const start = new Date(weekStartDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      const existing = await StudyPlan.findOne({ student: studentId, weekStartDate: start });
      if (existing) return res.status(409).json({ error: "Study plan for this week already exists." });

      const [assignments, exams, calendarEvents, courseWeeks] = await Promise.all([
        Assignment.find({
          semester: student.semester,
          status: "PUBLISHED",
          dueDate: { $gte: start, $lte: end },
        }).populate("course", "code name").lean(),
        Exam.find({
          program: student.program,
          semester: student.semester,
          status: { $in: ["PUBLISHED", "SCHEDULED"] },
          examDate: { $gte: start, $lte: end },
        }).lean(),
        AcademicCalendarEvent.find({
          startDate: { $gte: start, $lte: end },
        }).lean(),
        // Could also sync from CourseWeek/LMS
      ]);

      const activities = [];

      for (const a of assignments) {
        const dueDate = new Date(a.dueDate);
        const studyStart = new Date(dueDate);
        studyStart.setDate(studyStart.getDate() - 2);
        if (studyStart < start) studyStart = start;
        activities.push({
          title: `Assignment: ${a.title}`,
          description: a.description,
          type: "ASSIGNMENT",
          sourceType: "LMS_SYNC",
          sourceEntityType: "ASSIGNMENT",
          sourceEntityId: a._id,
          course: a.course?._id,
          startAt: studyStart,
          endAt: dueDate,
          estimatedDurationMinutes: 120,
          priority: "HIGH",
          status: "PLANNED",
          tags: ["assignment", "deadline"],
        });
      }

      for (const e of exams) {
        const examDate = new Date(e.examDate);
        const studyStart = new Date(examDate);
        studyStart.setDate(studyStart.getDate() - 5);
        if (studyStart < start) studyStart = start;
        activities.push({
          title: `Exam Prep: ${e.title}`,
          description: `Prepare for ${e.examType || "exam"}`,
          type: "EXAM_PREPARATION",
          sourceType: "EXAM_SYNC",
          sourceEntityType: "EXAM",
          sourceEntityId: e._id,
          startAt: studyStart,
          endAt: examDate,
          estimatedDurationMinutes: 180,
          priority: "URGENT",
          status: "PLANNED",
          tags: ["exam", "preparation"],
        });
      }

      for (const cal of calendarEvents) {
        if (cal.eventType === "ACADEMIC_DEADLINE" || cal.eventType === "EXAMINATION") {
          const eventDate = new Date(cal.startDate);
          const studyStart = new Date(eventDate);
          studyStart.setDate(studyStart.getDate() - 1);
          if (studyStart < start) studyStart = start;
          activities.push({
            title: cal.title,
            description: cal.description,
            type: "PERSONAL",
            sourceType: "CALENDAR_SYNC",
            sourceEntityType: "ACADEMIC_CALENDAR",
            sourceEntityId: cal._id,
            startAt: studyStart,
            endAt: eventDate,
            estimatedDurationMinutes: 60,
            priority: "NORMAL",
            status: "PLANNED",
            tags: ["calendar", cal.eventType.toLowerCase()],
          });
        }
      }

      const totalPlannedMinutes = activities.reduce((sum, a) => sum + (a.estimatedDurationMinutes || 0), 0);

      const plan = await StudyPlan.create({
        student: studentId,
        academicYear,
        semester,
        weekStartDate: start,
        weekEndDate: end,
        activities,
        isActive: true,
        isAutoGenerated: true,
        lastSyncedAt: new Date(),
        totalPlannedMinutes,
        totalCompletedMinutes: 0,
        completionRate: 0,
      });

      res.status(201).json({
        success: true,
        plan: {
          ...plan.toObject(),
          id: String(plan._id),
          activities: plan.activities.map((a) => ({ ...a, id: String(a._id) })),
        },
      });
    })
  );

  // POST /api/study-planner/auto-generate - Auto-generate study plan (alias for generate)
  app.post(
    "/api/study-planner/auto-generate",
    requireAuth,
    requirePermission("studyPlanner.manage"),
    asyncHandler(async (req, res) => {
      const roles = getUserRoles(req.user);
      const isStudent = roles.includes("student");

      let studentId = req.body.studentId;
      if (isStudent) {
        const student = await Student.findOne({ user: req.user._id || req.user.id });
        if (!student) return res.status(404).json({ error: "Student profile not found." });
        studentId = student._id;
      }

      const { academicYear, semester, weekStart, includeLmsAssignments = true, includeExams = true, includeCalendarEvents = true } = req.body || {};

      if (!studentId || !academicYear || !semester || !weekStart) {
        return res.status(400).json({ error: "Student ID, academic year, semester, and week start are required." });
      }

      const student = await Student.findById(studentId);
      if (!student) return res.status(404).json({ error: "Student not found." });

      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      const existing = await StudyPlan.findOne({ student: studentId, weekStartDate: start });
      if (existing) return res.status(409).json({ error: "Study plan for this week already exists." });

      const activities = [];

      if (includeLmsAssignments) {
        const assignments = await Assignment.find({
          semester: student.semester,
          status: "PUBLISHED",
          dueDate: { $gte: start, $lte: end },
        }).populate("course", "code name").lean();

        for (const a of assignments) {
          const dueDate = new Date(a.dueDate);
          const studyStart = new Date(dueDate);
          studyStart.setDate(studyStart.getDate() - 2);
          if (studyStart < start) studyStart = start;
          activities.push({
            title: `Assignment: ${a.title}`,
            description: a.description,
            type: "ASSIGNMENT",
            sourceType: "LMS",
            sourceEntityType: "ASSIGNMENT",
            sourceEntityId: a._id,
            course: a.course ? a.course._id : null,
            startAt: studyStart,
            endAt: dueDate,
            estimatedDurationMinutes: 60,
            priority: "HIGH",
            status: "PLANNED",
            tags: ["assignment", "deadline"],
          });
        }
      }

      if (includeExams) {
        const exams = await Exam.find({
          program: student.program,
          semester: student.semester,
          status: { $in: ["PUBLISHED", "SCHEDULED"] },
          examDate: { $gte: start, $lte: end },
        }).lean();

        for (const e of exams) {
          const examDate = new Date(e.examDate);
          const studyStart = new Date(examDate);
          studyStart.setDate(studyStart.getDate() - 5);
          if (studyStart < start) studyStart = start;
          activities.push({
            title: `Exam Prep: ${e.title}`,
            description: `Prepare for ${e.examType || "exam"}`,
            type: "EXAM_PREPARATION",
            sourceType: "EXAMS",
            sourceEntityType: "EXAM",
            sourceEntityId: e._id,
            startAt: studyStart,
            endAt: examDate,
            estimatedDurationMinutes: 180,
            priority: "URGENT",
            status: "PLANNED",
            tags: ["exam", "preparation"],
          });
        }
      }

      if (includeCalendarEvents) {
        const calendarEvents = await AcademicCalendarEvent.find({
          startDate: { $gte: start, $lte: end },
        }).lean();

        for (const cal of calendarEvents) {
          if (cal.eventType === "ACADEMIC_DEADLINE" || cal.eventType === "EXAMINATION") {
            const eventDate = new Date(cal.startDate);
            const studyStart = new Date(eventDate);
            studyStart.setDate(studyStart.getDate() - 1);
            if (studyStart < start) studyStart = start;
            activities.push({
              title: cal.title,
              description: cal.description,
              type: "PERSONAL",
              sourceType: "CALENDAR",
              sourceEntityType: "ACADEMIC_CALENDAR",
              sourceEntityId: cal._id,
              startAt: studyStart,
              endAt: eventDate,
              estimatedDurationMinutes: 60,
              priority: "NORMAL",
              status: "PLANNED",
              tags: ["calendar", cal.eventType.toLowerCase()],
            });
          }
        }
      }

      const totalPlannedMinutes = activities.reduce((sum, a) => sum + (a.estimatedDurationMinutes || 0), 0);

      const plan = await StudyPlan.create({
        student: studentId,
        academicYear,
        semester,
        weekStartDate: start,
        weekEndDate: end,
        activities,
        isActive: true,
        isAutoGenerated: true,
        lastSyncedAt: new Date(),
        totalPlannedMinutes,
        totalCompletedMinutes: 0,
        completionRate: 0,
      });

      res.status(201).json({
        success: true,
        plan: {
          ...plan.toObject(),
          id: String(plan._id),
          activities: plan.activities.map((a) => ({ ...a, id: String(a._id) })),
        },
      });
    })
  );

app.post(
    "/api/study-planner/plans",
    requireAuth,
    requirePermission("studyPlanner.manage"),
    async (req, res) => {
      try {
        const plan = await StudyPlan.findById(req.params.id);
        if (!plan) return res.status(404).json({ error: "Study plan not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student || String(plan.student) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        const activityData = req.body || {};
        const activity = {
          ...activityData,
          _id: new mongoose.Types.ObjectId(),
          startAt: new Date(activityData.startAt),
          endAt: new Date(activityData.endAt),
          status: "PLANNED",
        };

        plan.activities.push(activity);
        plan.totalPlannedMinutes += activity.estimatedDurationMinutes || 0;
        await plan.save();

        res.status(201).json({ success: true, activity: { ...activity, id: String(activity._id) } });
      } catch (err) {
        console.error("Add study activity error:", err);
        res.status(500).json({ error: "Failed to add study activity." });
      }
    }
  );

  app.patch(
    "/api/study-planner/activities/:activityId",
    requireAuth,
    requirePermission("studyPlanner.manage"),
    async (req, res) => {
      try {
        const { planId, ...updates } = req.body || {};
        if (!planId) return res.status(400).json({ error: "Plan ID required." });

        const plan = await StudyPlan.findById(planId);
        if (!plan) return res.status(404).json({ error: "Study plan not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student || String(plan.student) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        const activity = plan.activities.id(req.params.activityId);
        if (!activity) return res.status(404).json({ error: "Activity not found." });

        const allowedFields = ["title", "description", "type", "startAt", "endAt", "estimatedDurationMinutes", "actualDurationMinutes", "status", "priority", "tags"];
        let oldMinutes = activity.estimatedDurationMinutes || 0;
        for (const field of allowedFields) {
          if (updates[field] !== undefined) {
            if (field === "startAt" || field === "endAt") {
              activity[field] = new Date(updates[field]);
            } else {
              activity[field] = updates[field];
            }
          }
        }

        if (updates.status === "COMPLETED" && activity.status !== "COMPLETED") {
          activity.completedAt = new Date();
          activity.actualDurationMinutes = activity.actualDurationMinutes || activity.estimatedDurationMinutes || 0;
          plan.totalCompletedMinutes += activity.actualDurationMinutes;
        } else if (activity.status === "COMPLETED" && updates.status !== "COMPLETED") {
          plan.totalCompletedMinutes -= activity.actualDurationMinutes || 0;
          activity.completedAt = null;
        }

        plan.totalPlannedMinutes = plan.totalPlannedMinutes - oldMinutes + (activity.estimatedDurationMinutes || 0);
        plan.completionRate = plan.totalPlannedMinutes > 0 ? Math.round((plan.totalCompletedMinutes / plan.totalPlannedMinutes) * 100) : 0;
        await plan.save();

        res.json({ success: true, activity: { ...activity.toObject(), id: String(activity._id) } });
      } catch (err) {
        console.error("Update study activity error:", err);
        res.status(500).json({ error: "Failed to update study activity." });
      }
    }
  );

  app.delete(
    "/api/study-planner/activities/:activityId",
    requireAuth,
    requirePermission("studyPlanner.manage"),
    async (req, res) => {
      try {
        const { planId } = req.query;
        if (!planId) return res.status(400).json({ error: "Plan ID required." });

        const plan = await StudyPlan.findById(planId);
        if (!plan) return res.status(404).json({ error: "Study plan not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student || String(plan.student) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        const activity = plan.activities.id(req.params.activityId);
        if (!activity) return res.status(404).json({ error: "Activity not found." });

        plan.totalPlannedMinutes -= activity.estimatedDurationMinutes || 0;
        if (activity.status === "COMPLETED") {
          plan.totalCompletedMinutes -= activity.actualDurationMinutes || 0;
        }
        activity.deleteOne();
        plan.completionRate = plan.totalPlannedMinutes > 0 ? Math.round((plan.totalCompletedMinutes / plan.totalPlannedMinutes) * 100) : 0;
        await plan.save();

        res.json({ success: true });
      } catch (err) {
        console.error("Delete study activity error:", err);
        res.status(500).json({ error: "Failed to delete study activity." });
      }
    }
  );

  app.post(
    "/api/study-planner/plans/:id/sync",
    requireAuth,
    requirePermission("studyPlanner.manage"),
    asyncHandler(async (req, res) => {
      const plan = await StudyPlan.findById(req.params.id);
      if (!plan) return res.status(404).json({ error: "Study plan not found." });

      const roles = getUserRoles(req.user);
      const isStudent = roles.includes("student");
      if (isStudent) {
        const student = await Student.findOne({ user: req.user._id || req.user.id });
        if (!student || String(plan.student) !== String(student._id)) {
          return res.status(403).json({ error: "Access denied." });
        }
      }

      const student = await Student.findById(plan.student);
      if (!student) return res.status(404).json({ error: "Student not found." });

      const [assignments, exams] = await Promise.all([
        Assignment.find({
          semester: student.semester,
          status: "PUBLISHED",
          dueDate: { $gte: plan.weekStartDate, $lte: plan.weekEndDate },
        }).populate("course", "code name").lean(),
        Exam.find({
          program: student.program,
          semester: student.semester,
          status: { $in: ["PUBLISHED", "SCHEDULED"] },
          examDate: { $gte: plan.weekStartDate, $lte: plan.weekEndDate },
        }).lean(),
      ]);

      let added = 0;
      for (const a of assignments) {
        const exists = plan.activities.some((act) =>
          act.sourceType === "LMS_SYNC" && act.sourceEntityType === "ASSIGNMENT" && String(act.sourceEntityId) === String(a._id)
        );
        if (!exists) {
          const dueDate = new Date(a.dueDate);
          const studyStart = new Date(dueDate);
          studyStart.setDate(studyStart.getDate() - 2);
          if (studyStart < plan.weekStartDate) studyStart = plan.weekStartDate;
          plan.activities.push({
            title: `Assignment: ${a.title}`,
            description: a.description,
            type: "ASSIGNMENT",
            sourceType: "LMS_SYNC",
            sourceEntityType: "ASSIGNMENT",
            sourceEntityId: a._id,
            course: a.course?._id,
            startAt: studyStart,
            endAt: dueDate,
            estimatedDurationMinutes: 120,
            priority: "HIGH",
            status: "PLANNED",
            tags: ["assignment", "deadline"],
          });
          plan.totalPlannedMinutes += 120;
          added++;
        }
      }

      for (const e of exams) {
        const exists = plan.activities.some((act) =>
          act.sourceType === "EXAM_SYNC" && act.sourceEntityType === "EXAM" && String(act.sourceEntityId) === String(e._id)
        );
        if (!exists) {
          const examDate = new Date(e.examDate);
          const studyStart = new Date(examDate);
          studyStart.setDate(studyStart.getDate() - 5);
          if (studyStart < plan.weekStartDate) studyStart = plan.weekStartDate;
          plan.activities.push({
            title: `Exam Prep: ${e.title}`,
            description: `Prepare for ${e.examType || "exam"}`,
            type: "EXAM_PREPARATION",
            sourceType: "EXAM_SYNC",
            sourceEntityType: "EXAM",
            sourceEntityId: e._id,
            startAt: studyStart,
            endAt: examDate,
            estimatedDurationMinutes: 180,
            priority: "URGENT",
            status: "PLANNED",
            tags: ["exam", "preparation"],
          });
          plan.totalPlannedMinutes += 180;
          added++;
        }
      }

      plan.lastSyncedAt = new Date();
      plan.completionRate = plan.totalPlannedMinutes > 0 ? Math.round((plan.totalCompletedMinutes / plan.totalPlannedMinutes) * 100) : 0;
      await plan.save();

      res.json({ success: true, added, plan: { ...plan.toObject(), id: String(plan._id) } });
    })
  );
}