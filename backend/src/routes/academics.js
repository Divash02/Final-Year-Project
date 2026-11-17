import { getUserRoles, userToPublic, logAudit } from "../db.js";
import {
  Student,
  Course,
  Section,
  Program,
  Department,
  Enrollment,
  CourseTeachingAssignment,
  FacultySubjectAssignment,
  Assignment,
  Submission,
  LearningMaterial,
  Timetable,
  Exam,
} from "../models/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { route, conflict, notFound, forbidden } from "../utils/apiError.js";
import {
  requireString,
  optionalString,
  requireEnum,
  optionalEnum,
  toNumber,
  toInt,
  toIntList,
  toStringList,
  readPagination,
  requireObjectId,
} from "../utils/validate.js";
import { canManageCurriculum } from "../services/accessControl.js";
import {
  DEFAULT_PROGRAM,
  DEFAULT_SECTION,
  requireValidProgram,
  requireValidSection,
} from "../config/academic.js";
import { buildMyCourses } from "../services/lms/myCourses.js";

const DEFAULT_ACADEMIC_YEAR =
  process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR || "2025/2026";

/** Sections are addressed by code across modules, so the shape stays in one place. */
function serialiseSection(section, studentCount = 0) {
  return {
    id: String(section._id),
    code: section.code,
    program: section.program || null,
    semester: section.semester,
    batch: section.batch || null,
    capacity: section.capacity ?? null,
    room: section.room || null,
    studentCount,
  };
}

/**
 * Courses, curriculum, sections and the student directory.
 *
 * Course management is full CRUD with archive semantics: a course referenced by
 * enrolments, timetable sessions, assignments, materials or examinations is
 * archived instead of deleted so historical reporting keeps a resolvable
 * course, while archived courses disappear from new academic work.
 */
export function registerAcademicsRoutes(app) {
  /**
   * My Courses.
   *
   * The user's own course list, grouped by academic period. This is the single
   * entry point for course-based academic activity, and it is derived exclusively
   * from records the caller already owns: a student from `Enrollment`, a teacher
   * from `CourseTeachingAssignment`, an academic administrator from the course
   * catalogue they oversee.
   *
   * Every count on a card is counted from the documents that hold it, so a course
   * the institution has not recorded anything about reports "not available" rather
   * than a zero that would read as a failing grade.
   */
  app.get(
    "/api/my-courses",
    requireAuth,
    requirePermission("courses.view"),
    route(async (req, res) => {
      res.json(await buildMyCourses(req.user));
    }),
  );

  /**
   * Course list.
   *
   * Administrators and curriculum staff see the whole catalogue with search and
   * filters. A student sees only the courses they are enrolled in and a teacher
   * only the courses they are assigned to teach — the scope is derived from the
   * session user, never from a request parameter.
   */
  app.get(
    "/api/courses",
    requireAuth,
    route(async (req, res) => {
      const roles = getUserRoles(req.user);
      const userId = req.user._id || req.user.id;
      const scope = String(req.query.scope || "auto").toLowerCase();

      const wantsCurriculumView =
        scope === "curriculum" ||
        (scope === "auto" && canManageCurriculum(req.user));

      let courses = [];
      let pagination = null;
      if (wantsCurriculumView) {
        const result = await queryCourses(req.query);
        courses = result.courses;
        pagination = result.pagination;
      } else if (roles.includes("faculty") && scope !== "enrolled") {
        const assignments = await FacultySubjectAssignment.find({ facultyUser: userId, isActive: true })
          .populate("course")
          .lean();
        courses = dedupeById(
          assignments.map((row) => row.course).filter((course) => course && course.status === "ACTIVE"),
        );
      } else {
        const student = await Student.findOne({ user: userId }).select("_id");
        if (student) {
          const enrolments = await Enrollment.find({
            student: student._id,
            status: "ENROLLED",
          })
            .populate("course")
            .lean();
          courses = dedupeById(
            enrolments
              .map((row) => row.course)
              .filter((course) => course && course.status === "ACTIVE"),
          );
        }
      }

      res.json({
        courses: courses.map((course) => serialiseCourse(course)),
        pagination,
      });
    }),
  );

  /**
   * Distinct values used by curriculum/filter controls.
   * Semesters are program-aware: if a program (and its totalSemesters) is known,
   * return the full valid range 1..totalSemesters; otherwise derive from actual
   * curriculum/section/course records for the selected program context.
   */
  app.get(
    "/api/courses/filters",
    requireAuth,
    route(async (req, res) => {
      const programQuery = optionalString(req.query.program, "Programme", { max: 40 });
      const normalizedProgram = programQuery ? programQuery.toUpperCase() : null;

      const [courses, programs, departments, sections] = await Promise.all([
        Course.find().select("department program semester academicYear courseType status").lean(),
        Program.find().select("code name department totalSemesters durationYears").sort({ code: 1 }).lean(),
        Department.find().select("code name").sort({ name: 1 }).lean(),
        Section.find().select("code program semester batch").sort({ code: 1 }).lean(),
      ]);

      const uniqueSorted = (values) =>
        Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
          String(a).localeCompare(String(b), undefined, { numeric: true }),
        );

      const selectedProgram = normalizedProgram
        ? programs.find((p) => String(p.code || "").toUpperCase() === normalizedProgram)
        : null;

      let semesters = [];
      if (selectedProgram?.totalSemesters && Number(selectedProgram.totalSemesters) > 0) {
        const maxSem = Math.min(Math.max(Number(selectedProgram.totalSemesters), 1), 20);
        semesters = Array.from({ length: maxSem }, (_, i) => i + 1);
      } else {
        const matchesProgram = (rowProgram) => {
          if (!normalizedProgram) return true;
          const rp = String(rowProgram || "").trim().toUpperCase();
          return !rp || rp === normalizedProgram; // include legacy untagged curriculum rows
        };
        const programCourseSemesters = courses
          .filter((row) => matchesProgram(row.program))
          .map((row) => row.semester)
          .filter((s) => Number.isInteger(s) && s >= 1);
        const programSectionSemesters = sections
          .filter((row) => matchesProgram(row.program))
          .map((row) => row.semester)
          .filter((s) => Number.isInteger(s) && s >= 1);
        const inferred = [...new Set([...programCourseSemesters, ...programSectionSemesters])].sort((a, b) => a - b);
        if (inferred.length > 0) {
          semesters = inferred;
        } else if (normalizedProgram) {
          // Program selected but no records found — derive from global records as fallback.
          semesters = [...new Set(courses.map((row) => row.semester).filter((s) => Number.isInteger(s) && s >= 1))].sort(
            (a, b) => a - b,
          );
        } else {
          semesters = [...new Set(courses.map((row) => row.semester).filter((s) => Number.isInteger(s) && s >= 1))].sort(
            (a, b) => a - b,
          );
        }
      }

      res.json({
        filters: {
          departments: uniqueSorted(courses.map((row) => row.department)),
          programCodes: uniqueSorted([
            ...courses.map((row) => row.program),
            ...programs.map((row) => row.code),
          ]),
          semesters,
          academicYears: uniqueSorted(courses.map((row) => row.academicYear)),
          courseTypes: uniqueSorted(courses.map((row) => row.courseType)),
          statuses: ["ACTIVE", "ARCHIVED"],
          sectionCodes: uniqueSorted(sections.map((row) => row.code)),
          programs: programs.map((row) => ({
            code: row.code,
            name: row.name,
            department: row.department,
            totalSemesters: row.totalSemesters ?? null,
            durationYears: row.durationYears ?? null,
          })),
          departmentsList: departments.map((row) => ({ code: row.code, name: row.name })),
          defaultAcademicYear: DEFAULT_ACADEMIC_YEAR,
          selectedProgram: normalizedProgram,
        },
      });
    }),
  );

  app.post(
    "/api/courses",
    requireAuth,
    requirePermission("courses.create"),
    route(async (req, res) => {
      const payload = readCoursePayload(req.body, { partial: false });
      const duplicate = await Course.findOne({ code: payload.code }).select("_id");
      if (duplicate) throw conflict(`Course code ${payload.code} is already in use.`);

      const course = await Course.create({
        ...payload,
        createdBy: req.user._id || req.user.id,
      });

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "COURSE_CREATED",
        module: "academics",
        resource: "course",
        resourceId: course._id.toString(),
        newValue: pickCourse(course.toObject()),
        details: `Course created: ${course.code} - ${course.name}.`,
      });

      res.status(201).json({ course: serialiseCourse(course.toObject()) });
    }),
  );

  app.get(
    "/api/courses/:id",
    requireAuth,
    route(async (req, res) => {
      const course = await Course.findById(requireObjectId(req.params.id, "Course"));
      if (!course) throw notFound("Course not found.");
      res.json({ course: serialiseCourse(course.toObject()) });
    }),
  );

  app.patch(
    "/api/courses/:id",
    requireAuth,
    requirePermission("courses.manage"),
    route(async (req, res) => {
      const course = await Course.findById(requireObjectId(req.params.id, "Course"));
      if (!course) throw notFound("Course not found.");

      const before = pickCourse(course.toObject());
      const payload = readCoursePayload({ ...course.toObject(), ...req.body }, { partial: true });

      if (payload.code !== course.code) {
        const duplicate = await Course.findOne({ code: payload.code, _id: { $ne: course._id } })
          .select("_id");
        if (duplicate) throw conflict(`Course code ${payload.code} is already in use.`);
      }

      Object.assign(course, payload, { updatedBy: req.user._id || req.user.id });
      await course.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "COURSE_UPDATED",
        module: "academics",
        resource: "course",
        resourceId: course._id.toString(),
        oldValue: before,
        newValue: pickCourse(course.toObject()),
        details: `Course updated: ${course.code}.`,
      });

      res.json({ course: serialiseCourse(course.toObject()) });
    }),
  );

  /**
   * Archive (default) or purge a course.
   *
   * Archive is the institutional default because courses referenced by
   * enrolments, sessions, assignments, materials or examinations must remain
   * resolvable for reporting. A purge is only possible while nothing references
   * the course, and it is refused with a 409 that names the blockers.
   */
  app.delete(
    "/api/courses/:id",
    requireAuth,
    requirePermission("courses.manage"),
    route(async (req, res) => {
      const course = await Course.findById(requireObjectId(req.params.id, "Course"));
      if (!course) throw notFound("Course not found.");

      const references = await countCourseReferences(course._id);

      if (String(req.query.mode || "").toLowerCase() === "purge") {
        const blockers = Object.entries(references).filter(([, count]) => count > 0);
        if (blockers.length) {
          throw conflict(
            `This course is still referenced by ${blockers
              .map(([label, count]) => `${count} ${label}`)
              .join(", ")}. Archive it instead so those records stay valid.`,
          );
        }
        await course.deleteOne();
        await logAudit({
          userId: req.user._id || req.user.id,
          action: "COURSE_DELETED",
          module: "academics",
          resource: "course",
          resourceId: course._id.toString(),
          oldValue: pickCourse(course.toObject()),
          details: `Course ${course.code} deleted permanently; it had no dependent records.`,
        });
        res.json({ success: true, mode: "purged", courseId: course._id.toString() });
        return;
      }

      if (course.status === "ARCHIVED") {
        res.json({ success: true, mode: "archived", course: serialiseCourse(course.toObject()) });
        return;
      }

      course.status = "ARCHIVED";
      course.archivedAt = new Date();
      course.archivedBy = req.user._id || req.user.id;
      course.updatedBy = req.user._id || req.user.id;
      await course.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "COURSE_ARCHIVED",
        module: "academics",
        resource: "course",
        resourceId: course._id.toString(),
        oldValue: before_status(course),
        newValue: { status: "ARCHIVED" },
        details: `Course ${course.code} archived.`,
        metadata: { references },
      });

      res.json({ success: true, mode: "archived", course: serialiseCourse(course.toObject()) });
    }),
  );

  /** Restores an archived course to the active catalogue. */
  app.post(
    "/api/courses/:id/restore",
    requireAuth,
    requirePermission("courses.manage"),
    route(async (req, res) => {
      const course = await Course.findById(requireObjectId(req.params.id, "Course"));
      if (!course) throw notFound("Course not found.");
      if (course.status !== "ARCHIVED") {
        res.json({ success: true, course: serialiseCourse(course.toObject()) });
        return;
      }
      course.status = "ACTIVE";
      course.archivedAt = null;
      course.archivedBy = null;
      course.updatedBy = req.user._id || req.user.id;
      await course.save();
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "COURSE_RESTORED",
        module: "academics",
        resource: "course",
        resourceId: course._id.toString(),
        details: `Course ${course.code} restored to the active catalogue.`,
      });
      res.json({ success: true, course: serialiseCourse(course.toObject()) });
    }),
  );

  app.get(
    "/api/courses/teaching-assignments",
    requireAuth,
    route(async (req, res) => {
      const assignments = await CourseTeachingAssignment.find({
        facultyUser: req.user._id || req.user.id,
      })
        .populate("course")
        .lean();

      res.json({
        assignments: assignments
          .filter((assignment) => assignment.course)
          .map((assignment) => ({
            id: String(assignment._id),
            courseId: String(assignment.course._id),
            courseCode: assignment.course.code,
            courseName: assignment.course.name,
            courseStatus: assignment.course.status,
            sectionCode: assignment.sectionCode,
            semester: assignment.semester,
            academicYear: assignment.academicYear,
          })),
      });
    }),
  );

  app.post(
    "/api/admin/teaching-assignments",
    requireAuth,
    requirePermission("academics.teaching.assign"),
    route(async (req, res) => {
      const body = req.body || {};
      const facultyUserId = requireObjectId(body.facultyUserId, "Faculty");
      const courseId = requireObjectId(body.courseId, "Course");
      const sectionCode = requireString(body.sectionCode, "Section", { max: 10 }).toUpperCase();
      const semester = toInt(body.semester, "Semester", { min: 1, max: 12 });
      const academicYear = optionalString(body.academicYear, "Academic year", { max: 20 });

      const course = await Course.findById(courseId).select("_id code");
      if (!course) throw notFound("Course not found.");

      const assignment = await CourseTeachingAssignment.findOneAndUpdate(
        { facultyUser: facultyUserId, course: courseId, sectionCode, semester },
        {
          $set: {
            academicYear: academicYear || DEFAULT_ACADEMIC_YEAR,
            assignedBy: req.user._id || req.user.id,
          },
          $setOnInsert: { facultyUser: facultyUserId, course: courseId, sectionCode, semester },
        },
        { upsert: true, returnDocument: 'after' },
      );

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TEACHING_ASSIGNMENT_SET",
        module: "academics",
        resource: "course_teaching_assignment",
        resourceId: assignment._id.toString(),
        details: `${course.code} · semester ${semester} · section ${sectionCode} assigned to a teacher.`,
      });

      res.status(201).json({ assignmentId: assignment._id.toString() });
    }),
  );

  app.delete(
    "/api/admin/teaching-assignments/:id",
    requireAuth,
    requirePermission("academics.teaching.assign"),
    route(async (req, res) => {
      const assignment = await CourseTeachingAssignment.findById(
        requireObjectId(req.params.id, "Teaching assignment"),
      );
      if (!assignment) throw notFound("Teaching assignment not found.");
      await assignment.deleteOne();
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TEACHING_ASSIGNMENT_REMOVED",
        module: "academics",
        resource: "course_teaching_assignment",
        resourceId: String(assignment._id),
        details: `Teaching assignment removed for section ${assignment.sectionCode}, semester ${assignment.semester}.`,
      });
      res.json({ success: true });
    }),
  );

  app.get(
    "/api/sections",
    requireAuth,
    route(async (req, res) => {
      const sections = await Section.find().sort({ program: 1, semester: 1, code: 1 }).lean();
      const counts = await Student.aggregate([
        { $match: { status: "ACTIVE" } },
        { $group: { _id: { section: "$section", program: "$program", semester: "$semester" }, count: { $sum: 1 } } },
      ]);
      const countMap = new Map(
        counts.map((row) => [
          `${row._id.section}|${row._id.program}|${row._id.semester}`,
          row.count,
        ]),
      );

      res.json({
        sections: sections.map((section) =>
          serialiseSection(
            section,
            countMap.get(`${section.code}|${section.program}|${section.semester}`) || 0,
          ),
        ),
      });
    }),
  );

  /**
   * Sections are the institutional cohort that students, timetables, calendar
   * targets and materials all address, so they are managed as real records
   * rather than being typed as free text into three different forms.
   */
  app.post(
    "/api/sections",
    requireAuth,
    requirePermission("sections.manage"),
    route(async (req, res) => {
      const body = req.body || {};
      const code = requireString(body.code, "Section code", { max: 10 }).toUpperCase();
      const program = requireValidProgram(requireString(body.program, "Programme", { max: 40 }), "program");
      const semester = toInt(body.semester, "Semester", { min: 1, max: 12 });
      const batch = optionalString(body.batch, "Batch", { max: 20 }) || "2025";
      requireValidSection(code, "section");

      const existing = await Section.findOne({
        code,
        program,
        semester,
        batch,
      }).select("_id");
      if (existing) {
        throw conflict(`Section ${code} already exists for ${program}, semester ${semester}, batch ${batch}.`);
      }

      const section = await Section.create({
        code,
        program,
        semester,
        batch,
        capacity: body.capacity === undefined ? undefined : toInt(body.capacity, "Capacity", { min: 0, max: 2000 }),
        room: optionalString(body.room, "Room", { max: 80 }),
      });

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "SECTION_CREATED",
        module: "academics",
        resource: "section",
        resourceId: section._id.toString(),
        details: `Section ${code} created for ${program || "unspecified programme"}, semester ${semester}.`,
      });

      res.status(201).json({ section: serialiseSection(section.toObject()) });
    }),
  );

  app.patch(
    "/api/sections/:id",
    requireAuth,
    requirePermission("sections.manage"),
    route(async (req, res) => {
      const section = await Section.findById(requireObjectId(req.params.id, "Section"));
      if (!section) throw notFound("Section not found.");

      const body = req.body || {};
      const before = { code: section.code, capacity: section.capacity, room: section.room };
      if (body.code !== undefined) section.code = requireValidSection(requireString(body.code, "Section code", { max: 10 }).toUpperCase(), "section");
      if (body.program !== undefined) section.program = requireValidProgram(requireString(body.program, "Programme", { max: 40 }), "program");
      if (body.semester !== undefined) section.semester = toInt(body.semester, "Semester", { min: 1, max: 12 });
      if (body.batch !== undefined) section.batch = optionalString(body.batch, "Batch", { max: 20 });
      if (body.capacity !== undefined) section.capacity = toInt(body.capacity, "Capacity", { min: 0, max: 2000 });
      if (body.room !== undefined) section.room = optionalString(body.room, "Room", { max: 80 });

      const clash = await Section.findOne({
        _id: { $ne: section._id },
        code: section.code,
        program: section.program,
        semester: section.semester,
        batch: section.batch,
      }).select("_id");
      if (clash) {
        throw conflict(
          `Another section already uses ${section.code} for ${section.program}, semester ${section.semester}, batch ${section.batch}.`,
        );
      }
      await section.save();

      // Renaming a section has to move the students with it, otherwise the
      // directory and every academic module would disagree about the cohort.
      if (before.code !== section.code) {
        await Promise.all([
          Student.updateMany({ section: before.code }, { section: section.code }),
          Enrollment.updateMany({ sectionCode: before.code }, { sectionCode: section.code }),
          CourseTeachingAssignment.updateMany({ sectionCode: before.code }, { sectionCode: section.code }),
        ]);
      }

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "SECTION_UPDATED",
        module: "academics",
        resource: "section",
        resourceId: section._id.toString(),
        oldValue: before,
        newValue: { code: section.code, capacity: section.capacity, room: section.room },
        details: `Section ${section.code} updated.`,
      });

      res.json({ section: serialiseSection(section.toObject()) });
    }),
  );

  app.delete(
    "/api/sections/:id",
    requireAuth,
    requirePermission("sections.manage"),
    route(async (req, res) => {
      const section = await Section.findById(requireObjectId(req.params.id, "Section"));
      if (!section) throw notFound("Section not found.");

      const [students, enrolments, sessions] = await Promise.all([
        Student.countDocuments({ section: section.code }),
        Enrollment.countDocuments({ sectionCode: section.code }),
        Timetable.countDocuments({ sectionCode: section.code, archivedAt: null }),
      ]);
      if (students + enrolments + sessions > 0) {
        throw conflict(
          `This section still has ${students} student(s), ${enrolments} enrolment(s) and ${sessions} timetable session(s). Empty it first so those records stay resolvable.`,
        );
      }

      await section.deleteOne();
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "SECTION_DELETED",
        module: "academics",
        resource: "section",
        resourceId: String(section._id),
        details: `Section ${section.code} deleted; it had no dependent records.`,
      });

      res.json({ success: true });
    }),
  );

  /**
   * Student directory.
   *
   * One directory query for every module that needs students. Students see only
   * their own record; staff with directory permission see the cohort.
   */
  app.get(
    "/api/students",
    requireAuth,
    route(async (req, res) => {
      const roles = getUserRoles(req.user);
      const userId = req.user._id || req.user.id;

      if (!roles.some((role) =>
        ["super_admin", "registrar", "dean", "hod", "program_coordinator", "campus_admin", "exam_officer", "finance_officer", "faculty"].includes(role),
      )) {
        const own = await Student.findOne({ user: userId }).populate("user").lean();
        res.json({
          students: own ? [serialiseStudent(own)] : [],
          pagination: { page: 1, limit: 1, total: own ? 1 : 0, pages: own ? 1 : 0 },
        });
        return;
      }

      const filter = {};
      const sectionFilter = optionalString(req.query.section, "Section", { max: 10 });
      const programFilter = optionalString(req.query.program, "Programme", { max: 40 });
      const batchFilter = optionalString(req.query.batch, "Batch", { max: 20 });
      const statusFilter = optionalEnum(req.query.status, "Status", [
        "ACTIVE",
        "INACTIVE",
        "TRANSFERRED",
        "SUSPENDED",
        "GRADUATED",
      ]);
      const query = optionalString(req.query.q, "Search", { max: 120 });
      const { limit, page, skip } = readPagination(req.query, { defaultLimit: 50 });

      if (sectionFilter) filter.section = sectionFilter.toUpperCase();
      if (programFilter) filter.program = programFilter.toUpperCase();
      if (batchFilter) filter.batch = batchFilter;
      if (statusFilter) filter.status = statusFilter;
      if (query) {
        const pattern = new RegExp(escapeRegExp(query), "i");
        filter.$or = [
          { studentId: pattern },
          { firstName: pattern },
          { lastName: pattern },
          { collegeEmail: pattern },
          { email: pattern },
          { section: pattern },
        ];
      }

      if (roles.includes("faculty") && String(req.query.scope || "") === "teaching") {
        const teaching = await CourseTeachingAssignment.find({ facultyUser: userId })
          .select("course sectionCode semester")
          .lean();
        if (!teaching.length) {
          res.json({ students: [], pagination: { page: 1, limit, total: 0, pages: 0 } });
          return;
        }
        const students = await Student.find({
          status: "ACTIVE",
          $or: teaching.map((row) => ({
            semester: row.semester,
            section: row.sectionCode,
          })),
        })
          .populate("user")
          .sort({ studentId: 1 })
          .lean();
        res.json({
          students: students.map(serialiseStudent),
          pagination: {
            page: 1,
            limit: students.length,
            total: students.length,
            pages: 1,
          },
        });
        return;
      }

      const [students, total] = await Promise.all([
        Student.find(filter)
          .populate("user")
          .sort({ studentId: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Student.countDocuments(filter),
      ]);

      res.json({
        students: students.map(serialiseStudent),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      });
    }),
  );

  app.get(
    "/api/students/me",
    requireAuth,
    route(async (req, res) => {
      const student = await Student.findOne({ user: req.user._id || req.user.id }).populate("user");
      if (!student) throw notFound("Student profile not found.");
      res.json({
        student: {
          ...student.toObject(),
          id: student._id.toString(),
          avatarUrl: student.user?.avatarUrl || student.avatarUrl || null,
        },
        user: userToPublic(req.user),
      });
    }),
  );

  app.get(
    "/api/students/:id",
    requireAuth,
    route(async (req, res) => {
      const identifier = String(req.params.id || "");
      const student = mongoose_isValidId(identifier)
        ? await Student.findById(identifier).populate("user")
        : await Student.findOne({ studentId: identifier }).populate("user");
      if (!student) throw notFound("Student not found.");

      const roles = getUserRoles(req.user);
      const isOwner = String(student.user?._id || student.user) === String(req.user._id || req.user.id);
      if (!isOwner && !canViewDirectory(req.user)) {
        throw forbidden("You are not authorised to view this student record.");
      }

      res.json({
        student: {
          ...student.toObject(),
          id: student._id.toString(),
          avatarUrl: student.user?.avatarUrl || student.avatarUrl || null,
        },
        user: student.user ? userToPublic(student.user) : null,
      });
    }),
  );

  /** Official student record edits: registrar and super admin only. */
  app.patch(
    "/api/students/:id",
    requireAuth,
    requirePermission("student.update.official"),
    route(async (req, res) => {
      const identifier = String(req.params.id || "");
      const student = mongoose_isValidId(identifier)
        ? await Student.findById(identifier)
        : await Student.findOne({ studentId: identifier });
      if (!student) throw notFound("Student not found.");

      const body = req.body || {};
      const before = {
        section: student.section,
        semester: student.semester,
        status: student.status,
        program: student.program,
        batch: student.batch,
      };

      const section = optionalString(body.section, "Section", { max: 10 });
      if (section) student.section = section.toUpperCase();
      if (body.semester !== undefined && body.semester !== null && body.semester !== "") {
        student.semester = toInt(body.semester, "Semester", { min: 1, max: 12 });
      }
      if (body.status !== undefined && body.status !== null && body.status !== "") {
        student.status = requireEnum(body.status, "Status", [
          "ACTIVE",
          "INACTIVE",
          "TRANSFERRED",
          "SUSPENDED",
          "GRADUATED",
        ]);
      }
      if (body.program !== undefined) {
        student.program = optionalString(body.program, "Programme", { max: 40 })?.toUpperCase() || null;
      }
      if (body.batch !== undefined) student.batch = optionalString(body.batch, "Batch", { max: 20 });
      if (body.phone !== undefined) student.phone = optionalString(body.phone, "Phone", { max: 32 });

      await student.save();

      // Cohort moves must follow the student, otherwise attendance, assignments
      // and timetables would keep pointing at the previous section.
      const cohortChanged = before.section !== student.section || before.semester !== student.semester;
      if (cohortChanged) {
        await Enrollment.updateMany(
          { student: student._id },
          { sectionCode: student.section, semester: student.semester },
        );
      }

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "STUDENT_RECORD_UPDATED",
        module: "academics",
        resource: "student",
        resourceId: student._id.toString(),
        oldValue: before,
        newValue: {
          section: student.section,
          semester: student.semester,
          status: student.status,
          program: student.program,
          batch: student.batch,
        },
        details: `Student ${student.studentId} record updated.`,
      });

      res.json({ success: true, student: serialiseStudent(student.toObject()) });
    }),
  );
}

function canViewDirectory(user) {
  return getUserRoles(user).some((role) =>
    [
      "super_admin",
      "registrar",
      "dean",
      "hod",
      "program_coordinator",
      "campus_admin",
      "exam_officer",
      "finance_officer",
      "faculty",
    ].includes(role),
  );
}

function before_status(course) {
  return { status: course.status === "ARCHIVED" ? "ACTIVE" : course.status };
}

function dedupeById(list) {
  const seen = new Set();
  return list.filter((item) => {
    const key = String(item._id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mongoose_isValidId(value) {
  return /^[0-9a-fA-F]{24}$/.test(String(value));
}

async function countCourseReferences(courseId) {
  const assignmentIdList = await assignmentIds(courseId);
  const [
    enrolments,
    teaching,
    assignments,
    submissions,
    materials,
    timetable,
    exams,
  ] = await Promise.all([
    Enrollment.countDocuments({ course: courseId }),
    CourseTeachingAssignment.countDocuments({ course: courseId }),
    assignmentIdList.length ? Assignment.countDocuments({ course: courseId }) : 0,
    assignmentIdList.length
      ? Submission.countDocuments({ assignment: { $in: assignmentIdList } })
      : 0,
    LearningMaterial.countDocuments({ course: courseId }),
    Timetable.countDocuments({ course: courseId }),
    Exam.countDocuments({ course: courseId }),
  ]);
  return {
    enrolments,
    teachingAssignments: teaching,
    assignments,
    submissions,
    learningMaterials: materials,
    timetableSessions: timetable,
    examinations: exams,
  };
}

async function assignmentIds(courseId) {
  const rows = await Assignment.find({ course: courseId }).select("_id").lean();
  return rows.map((row) => row._id);
}

async function queryCourses(query) {
  const filter = {};
  const search = optionalString(query.q, "Search", { max: 120 });
  const department = optionalString(query.department, "Department", { max: 120 });
  const program = optionalString(query.program, "Programme", { max: 40 });
  const semesters = toIntList(query.semester, "Semester", { min: 1, max: 20, maxItems: 20 });
  const semester = semesters.length === 1 ? semesters[0] : null;
  const academicYear = optionalString(query.academicYear, "Academic year", { max: 20 });
  const courseType = optionalEnum(query.courseType, "Course type", [
    "CORE",
    "ELECTIVE",
    "LAB",
    "PROJECT",
    "INTERNSHIP",
  ]);
  const status = optionalEnum(query.status, "Status", ["ACTIVE", "ARCHIVED"]);
  const { limit, page, skip } = readPagination(query, { defaultLimit: 50 });

  if (department) filter.department = new RegExp(`^${escapeRegExp(department)}$`, "i");
  if (program) {
    // Include legacy curriculum rows that were not tagged with a program.
    filter.$or = filter.$or || [];
    // preserve search $or if present by combining carefully
  }
  if (program) {
    const prog = program.toUpperCase();
    const programMatch = [{ program: prog }, { program: null }, { program: { $exists: false } }, { program: "" }];
    if (filter.$or) {
      // search already set $or; combine with $and
      filter.$and = [...(filter.$and || []), { $or: filter.$or }, { $or: programMatch }];
      delete filter.$or;
    } else {
      filter.$or = programMatch;
    }
  }
  if (semesters.length > 1) filter.semester = { $in: semesters };
  else if (semester) filter.semester = semester;
  if (academicYear) filter.academicYear = academicYear;
  if (courseType) filter.courseType = courseType;
  // Archived courses stay retrievable by asking for them, but they are not part
  // of the catalogue by default, so nothing new is built on a retired course.
  filter.status = status || "ACTIVE";
  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    const searchOr = [{ code: pattern }, { name: pattern }, { description: pattern }];
    if (filter.$and) filter.$and.push({ $or: searchOr });
    else if (filter.$or) filter.$and = [{ $or: filter.$or }, { $or: searchOr }], delete filter.$or;
    else filter.$or = searchOr;
  }

  const [courses, total] = await Promise.all([
    Course.find(filter).sort({ semester: 1, code: 1 }).skip(skip).limit(limit).lean(),
    Course.countDocuments(filter),
  ]);

  return { courses, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
}

function pickCourse(course) {
  return {
    code: course.code,
    name: course.name,
    department: course.department || null,
    program: course.program || null,
    credits: course.credits,
    semester: course.semester,
    academicYear: course.academicYear || null,
    courseType: course.courseType,
    status: course.status,
    prerequisites: course.prerequisites || [],
  };
}

/** Validates and normalises a course create/update payload. */
export function readCoursePayload(body, { partial = false } = {}) {
  const payload = {};
  const assign = (key, value) => {
    if (value !== undefined) payload[key] = value;
  };

  if (!partial || body.code !== undefined) {
    payload.code = requireString(body.code, "Course code", { max: 32 }).toUpperCase();
  }
  if (!partial || body.name !== undefined) {
    payload.name = requireString(body.name, "Course name", { max: 180 });
  }
  assign("department", optionalString(body.department, "Department", { max: 120 }));
  const programRaw = optionalString(body.program, "Programme", { max: 40 });
  assign("program", programRaw ? requireValidProgram(programRaw, "program") : undefined);
  assign("programCode", optionalString(body.programCode, "Programme", { max: 40 })?.toUpperCase());
  if (body.credits !== undefined) assign("credits", toNumber(body.credits, "Credits", { min: 0, max: 60 }));
  if (body.semester !== undefined) assign("semester", toInt(body.semester, "Semester", { min: 1, max: 20 }));
  assign("academicYear", optionalString(body.academicYear, "Academic year", { max: 20 }));
  if (body.courseType !== undefined) {
    assign("courseType", requireEnum(body.courseType, "Course type", ["CORE", "ELECTIVE", "LAB", "PROJECT", "INTERNSHIP"], { upper: true }));
  }
  assign("description", optionalString(body.description, "Description", { max: 4000 }) || "");
  if (body.prerequisites !== undefined) {
    assign("prerequisites", toStringList(body.prerequisites, { upper: true, maxItems: 20 }));
  }
  if (body.status !== undefined) {
    assign("status", requireEnum(body.status, "Status", ["ACTIVE", "ARCHIVED"], { upper: true }));
  }
  if (!partial) payload.academicYear = payload.academicYear || DEFAULT_ACADEMIC_YEAR;
  return payload;
}

export function serialiseCourse(course) {
  return {
    id: String(course._id),
    _id: String(course._id),
    code: course.code,
    name: course.name,
    department: course.department || null,
    program: course.program || course.programCode || null,
    credits: course.credits ?? null,
    semester: course.semester ?? null,
    academicYear: course.academicYear || null,
    courseType: course.courseType || "CORE",
    description: course.description || "",
    prerequisites: course.prerequisites || [],
    status: course.status || "ACTIVE",
    archivedAt: course.archivedAt || null,
    createdAt: course.createdAt || null,
    updatedAt: course.updatedAt || null,
  };
}

export function serialiseStudent(student) {
  const user = student.user && typeof student.user === "object" ? student.user : null;
  return {
    id: String(student._id),
    _id: String(student._id),
    studentId: student.studentId,
    rollNumber: student.rollNumber || student.studentId,
    enrollmentId: student.enrollmentId || null,
    firstName: student.firstName || null,
    lastName: student.lastName || null,
    name: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
    email: student.email || user?.email || null,
    collegeEmail: student.collegeEmail || user?.collegeEmail || student.email || null,
    avatarUrl: user?.avatarUrl || student.avatarUrl || null,
    program: student.program || null,
    department: student.department || null,
    batch: student.batch || null,
    section: student.section || null,
    academicYear: student.academicYear || null,
    semester: student.semester ?? null,
    campus: student.campus || null,
    phone: student.phone || user?.phone || null,
    status: student.status || "ACTIVE",
    attendancePercentage: student.attendancePercentage ?? null,
    gpa: student.gpa ?? null,
    cgpa: student.cgpa ?? null,
    feeBalanceDue: student.feeBalanceDue ?? null,
    userId: String(student.user?._id || student.user || ""),
    createdAt: student.createdAt || null,
  };
}

export { DEFAULT_ACADEMIC_YEAR };
