import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles, logAudit } from "../db.js";
import {
  getOrInitAssessmentStructure,
  getFacultyAssignedCourses,
  getCandidatesForAssessment,
  saveStudentAssessmentMark,
  transitionAssessmentWorkflow,
} from "../services/assessmentService.js";
import { StudentAssessmentMark } from "../models/StudentAssessmentMark.js";
import { CourseAssessmentComponent } from "../models/CourseAssessmentComponent.js";
import { Course, Student } from "../models/index.js";

export function registerAssessmentRoutes(app) {
  /**
   * 1. Get assessment structure for a course offering
   */
  app.get("/api/assessments/structure", requireAuth, async (req, res) => {
    try {
      const { courseId, academicYear = "2083/84", semester = 4, sectionCode = "ALL" } = req.query;
      if (!courseId) return res.status(400).json({ error: "courseId is required" });

      const structure = await getOrInitAssessmentStructure({
        courseId,
        academicYear,
        semester: Number(semester),
        sectionCode,
        userId: req.user._id,
      });

      res.json({ structure });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 2. Configure assessment structure (Admin / Academic Office)
   */
  app.post("/api/assessments/structure", requireAuth, async (req, res) => {
    try {
      const roles = getUserRoles(req.user);
      const isAuthorized = roles.some((r) =>
        ["super_admin", "exam_officer", "registrar", "hod", "dean"].includes(r)
      );
      if (!isAuthorized) {
        return res.status(403).json({ error: "Only academic administrators can configure assessment structures" });
      }

      const { courseId, academicYear = "2083/84", semester = 4, sectionCode = "ALL", components, passingRule } = req.body;
      if (!courseId || !components || !Array.isArray(components)) {
        return res.status(400).json({ error: "courseId and components array are required" });
      }

      const course = await Course.findById(courseId);
      if (!course) return res.status(404).json({ error: "Course not found" });

      const totalMax = components.reduce((sum, c) => sum + Number(c.maxMarks || 0), 0);
      const totalPass = components.reduce((sum, c) => sum + Number(c.passMarks || 0), 0);

      const config = await CourseAssessmentComponent.findOneAndUpdate(
        { course: course._id, academicYear, semester: Number(semester), sectionCode },
        {
          $set: {
            courseCode: course.code,
            courseName: course.name,
            program: course.program || "BScIT",
            components,
            totalMaxMarks: totalMax,
            totalPassMarks: totalPass,
            passingRule: passingRule || "ALL_COMPONENTS_MUST_PASS",
            configuredBy: req.user._id,
            status: "ACTIVE",
          },
        },
        { upsert: true, returnDocument: 'after' }
      );

      res.json({ success: true, structure: config });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 3. Get faculty assigned courses
   */
  app.get("/api/assessments/faculty-courses", requireAuth, async (req, res) => {
    try {
      const { academicYear = "2083/84", semester } = req.query;
      const courses = await getFacultyAssignedCourses({
        user: req.user,
        academicYear,
        semester: semester ? Number(semester) : null,
      });
      res.json({ courses });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 4. Get candidates and assessment marks for a course
   */
  app.get("/api/assessments/candidates", requireAuth, async (req, res) => {
    try {
      const {
        courseId,
        academicYear = "2083/84",
        semester = 4,
        sectionCode = "A",
        program = "BScIT",
      } = req.query;

      if (!courseId) return res.status(400).json({ error: "courseId is required" });

      const result = await getCandidatesForAssessment({
        courseId,
        academicYear,
        semester: Number(semester),
        sectionCode,
        program,
        userId: req.user._id,
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 5. Save student assessment mark (Single student / Autosave / Save & Next)
   */
  app.post(
    "/api/assessments/marks",
    requireAuth,
    requirePermission(["grade.enter", "exam.manageResults", "exams.results.modify"]),
    async (req, res) => {
      try {
        const {
          studentId,
          courseId,
          academicYear = "2083/84",
          semester = 4,
          sectionCode = "A",
          components = [],
          remarks = "",
        } = req.body;

        if (!studentId || !courseId) {
          return res.status(400).json({ error: "studentId and courseId are required" });
        }

        const result = await saveStudentAssessmentMark({
          studentId,
          courseId,
          academicYear,
          semester: Number(semester),
          sectionCode,
          componentsInput: components,
          actorUser: req.user,
          remarks,
        });

        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  /**
   * 6. Submit assessment batch for examination review
   */
  app.post(
    "/api/assessments/submit",
    requireAuth,
    requirePermission(["grade.submit", "exam.results.submit"]),
    async (req, res) => {
      try {
        const { courseId, academicYear = "2083/84", semester = 4, sectionCode = "A", remarks = "" } = req.body;
        if (!courseId) return res.status(400).json({ error: "courseId is required" });

        const result = await transitionAssessmentWorkflow({
          courseId,
          academicYear,
          semester: Number(semester),
          sectionCode,
          toStatus: "SUBMITTED",
          actorUser: req.user,
          remarks: remarks || "Submitted by faculty for examination department review",
        });

        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  /**
   * 7. Examination Reviewer returns assessment for correction with mandatory reason
   */
  app.post(
    "/api/assessments/return",
    requireAuth,
    requirePermission(["grade.review", "grade.verify", "exam.verifyResults", "exams.results.modify"]),
    async (req, res) => {
      try {
        const { courseId, academicYear = "2083/84", semester = 4, sectionCode = "A", studentId = null, reason } = req.body;
        if (!courseId) return res.status(400).json({ error: "courseId is required" });
        if (!reason || !reason.trim()) {
          return res.status(400).json({ error: "Mandatory correction reason must be provided" });
        }

        const result = await transitionAssessmentWorkflow({
          courseId,
          academicYear,
          semester: Number(semester),
          sectionCode,
          studentId,
          toStatus: "RETURNED_FOR_CORRECTION",
          actorUser: req.user,
          remarks: reason.trim(),
        });

        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  /**
   * 8. Verify assessment batch
   */
  app.post(
    "/api/assessments/verify",
    requireAuth,
    requirePermission(["grade.verify", "exam.verifyResults"]),
    async (req, res) => {
      try {
        const { courseId, academicYear = "2083/84", semester = 4, sectionCode = "A", remarks = "" } = req.body;
        if (!courseId) return res.status(400).json({ error: "courseId is required" });

        const result = await transitionAssessmentWorkflow({
          courseId,
          academicYear,
          semester: Number(semester),
          sectionCode,
          toStatus: "VERIFIED",
          actorUser: req.user,
          remarks: remarks || "Marks scrutinized and verified by Examination Department",
        });

        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  /**
   * 9. Finalize assessment batch
   */
  app.post(
    "/api/assessments/finalize",
    requireAuth,
    requirePermission(["exam.results.finalize", "grade.publishOfficialRecord"]),
    async (req, res) => {
      try {
        const { courseId, academicYear = "2083/84", semester = 4, sectionCode = "A", remarks = "" } = req.body;
        if (!courseId) return res.status(400).json({ error: "courseId is required" });

        const result = await transitionAssessmentWorkflow({
          courseId,
          academicYear,
          semester: Number(semester),
          sectionCode,
          toStatus: "FINALIZED",
          actorUser: req.user,
          remarks: remarks || "Results finalized by Controller of Examinations",
        });

        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  /**
   * 10. Publish assessment batch to student portal & official marksheets
   */
  app.post(
    "/api/assessments/publish",
    requireAuth,
    requirePermission(["exam.publishResults", "exams.results.publish", "grade.publishOfficialRecord"]),
    async (req, res) => {
      try {
        const { courseId, academicYear = "2083/84", semester = 4, sectionCode = "A", remarks = "" } = req.body;
        if (!courseId) return res.status(400).json({ error: "courseId is required" });

        const result = await transitionAssessmentWorkflow({
          courseId,
          academicYear,
          semester: Number(semester),
          sectionCode,
          toStatus: "PUBLISHED",
          actorUser: req.user,
          remarks: remarks || "Official results published to student portal and marksheets",
        });

        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  /**
   * 11. Student views own published results semester-wise
   */
  app.get(
    "/api/student/assessments/my-results",
    requireAuth,
    requirePermission(["grade.view.own", "exam.results.view.own"]),
    async (req, res) => {
      try {
        const { semester, academicYear = "2083/84" } = req.query;

        const student = await Student.findOne({ user: req.user._id });
        if (!student) {
          return res.status(404).json({ error: "Student record not found" });
        }

        const query = {
          student: student._id,
          workflowStatus: "PUBLISHED",
        };
        if (semester) query.semester = Number(semester);
        if (academicYear) query.academicYear = academicYear;

        const publishedMarks = await StudentAssessmentMark.find(query)
          .populate("course")
          .sort({ semester: 1, courseCode: 1 });

        const results = publishedMarks.map((m) => ({
          id: m._id.toString(),
          academicYear: m.academicYear,
          semester: m.semester,
          courseCode: m.courseCode,
          courseName: m.courseName,
          components: m.components.map((c) => ({
            name: c.name,
            maxMarks: c.maxMarks,
            marksObtained: c.marksObtained,
            status: c.status,
            isAbsent: c.isAbsent,
          })),
          totalMarksObtained: m.totalMarksObtained,
          totalMaxMarks: m.totalMaxMarks,
          percentage: m.percentage,
          grade: m.grade,
          gradePoint: m.gradePoint,
          resultStatus: m.resultStatus,
          publishedAt: m.publishedAt,
        }));

        res.json({
          student: {
            id: student.studentId,
            symbolNumber: student.rollNumber || student.studentId,
            fullName: student.fullName || `${student.firstName} ${student.lastName}`.trim(),
            program: student.program,
            currentSemester: student.semester,
          },
          academicYear,
          results,
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  /**
   * 12. Assessment Audit Trail
   */
  app.get(
    "/api/assessments/audit-trail",
    requireAuth,
    requirePermission(["exam.viewAudit", "audit.view"]),
    async (req, res) => {
      try {
        const { courseId, academicYear = "2083/84", semester = 4 } = req.query;
        if (!courseId) return res.status(400).json({ error: "courseId is required" });

        const records = await StudentAssessmentMark.find({
          course: courseId,
          academicYear,
          semester: Number(semester),
        }).select("studentId rollNumber auditHistory");

        const auditTrail = [];
        for (const r of records) {
          for (const a of r.auditHistory || []) {
            auditTrail.push({
              studentId: r.studentId,
              symbolNumber: r.rollNumber,
              action: a.action,
              actorName: a.actorName,
              role: a.role,
              timestamp: a.timestamp,
              remarks: a.remarks,
              changes: a.newValues,
            });
          }
        }

        auditTrail.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json({ auditTrail });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );
}
