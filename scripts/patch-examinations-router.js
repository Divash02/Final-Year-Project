import fs from "fs";
import path from "path";

const filePath = path.resolve("./backend/src/routes/examinations.js");
const original = fs.readFileSync(filePath, "utf8");

const marker1 = "15. Get Results & Enrolled Marks";
const marker2 = "20. Exam Audit History API";

const idx1 = original.indexOf(marker1);
const idx2 = original.indexOf(marker2);

if (idx1 === -1 || idx2 === -1) {
  console.error("Markers not found:", { idx1, idx2 });
  process.exit(1);
}

// Find preceding comment start before marker1
const startComment = original.lastIndexOf("/**", idx1);
const endComment = original.lastIndexOf("/**", idx2);

const replacement = `// =========================================================================
  // INSTITUTIONAL MARKSHEET & RESULTS CALCULATION ENGINE
  // =========================================================================

  async function resolveExamSubjects(exam) {
    if (exam.subjects && exam.subjects.length > 0) {
      return exam.subjects;
    }
    if (exam.course) {
      const courseDoc = exam.course._id ? exam.course : await Course.findById(exam.course);
      if (courseDoc) {
        return [
          {
            course: courseDoc._id,
            code: courseDoc.code,
            name: courseDoc.name,
            totalMarks: exam.totalMarks || 100,
            passMarks: exam.passMarks || 40,
            credits: courseDoc.credits || 3,
          },
        ];
      }
    }
    return [
      {
        course: null,
        code: exam.examCode || "ASSESS",
        name: exam.title || "Subject Assessment",
        totalMarks: exam.totalMarks || 100,
        passMarks: exam.passMarks || 40,
        credits: 3,
      },
    ];
  }

  async function getInstitutionProfile() {
    const nameSetting = await InstitutionSetting.findOne({ settingKey: "institution.name" });
    const deptSetting = await InstitutionSetting.findOne({ settingKey: "examination.department" });
    const addressSetting = await InstitutionSetting.findOne({ settingKey: "institution.address" });
    const phoneSetting = await InstitutionSetting.findOne({ settingKey: "institution.phone" });
    const emailSetting = await InstitutionSetting.findOne({ settingKey: "institution.email" });
    const logoSetting = await InstitutionSetting.findOne({ settingKey: "institution.logo" });

    return {
      name: nameSetting?.settingValue || "TECHSPIRE COLLEGE",
      department: deptSetting?.settingValue || "OFFICIAL EXAMINATION DEPARTMENT",
      affiliation: "Affiliated to University · Office of the Controller of Examinations",
      address: addressSetting?.settingValue || "Kathmandu, Nepal",
      phone: phoneSetting?.settingValue || "+977-1-4782000",
      email: emailSetting?.settingValue || "exam@techspire.edu.np",
      logoUrl: logoSetting?.settingValue || "/images/techspirecollege.png",
      watermarkUrl: "/images/techspirecollege.png",
    };
  }

  /**
   * 14b. Institutional Grading Scale API
   */
  app.get(
    "/api/exams/grading-scale",
    requireAuth,
    async (req, res) => {
      try {
        const scale = await loadGradingScale();
        res.json({ scale });
      } catch (err) {
        res.status(500).json({ error: "Failed to load grading scale." });
      }
    }
  );

  /**
   * 14c. Institution Official Profile API
   */
  app.get(
    "/api/exams/institution-profile",
    requireAuth,
    async (req, res) => {
      try {
        const profile = await getInstitutionProfile();
        res.json(profile);
      } catch (err) {
        res.status(500).json({ error: "Failed to load institution profile." });
      }
    }
  );

  /**
   * 15. Get Results & Enrolled Marks (Role-scoped, IDOR-protected)
   *
   * Students see only their own published results.
   * Faculty see results for students in courses they teach.
   * Exam officers see all results for the exam.
   */
  app.get(
    "/api/exams/:id/results",
    requireAuth,
    requirePermission(["exam.view", "exams.view", "exam.manageResults", "exams.results.modify", "exam.results.view.own"]),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const exam = await Exam.findById(req.params.id)
          .populate("course")
          .populate("assignedFaculty", "firstName lastName");
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const isStaff = !roles.includes("student");
        let filter = { exam: exam._id };

        if (roles.includes("student") && !isStaff) {
          const studentRecord = await Student.findOne({ user: req.user._id });
          if (!studentRecord) return res.json({ results: [], exam: null });
          filter.student = studentRecord._id;
          filter.workflowStatus = "PUBLISHED";
        } else if (isFacultyScoped(roles)) {
          const ta = await CourseTeachingAssignment.findOne({
            facultyUser: req.user._id,
            course: exam.course ? exam.course._id : exam.course,
          });
          if (!ta) {
            return res.status(403).json({ error: "Not authorized to view results for this course." });
          }
        }

        const subjects = await resolveExamSubjects(exam);
        const institution = await getInstitutionProfile();

        const existingResults = await ExamResult.find(filter)
          .populate("student studentUser course")
          .sort({ "student.studentId": 1 });

        const resultMap = new Map();
        for (const r of existingResults) {
          const sKey = r.student?._id ? r.student._id.toString() : r.student?.toString();
          if (sKey) resultMap.set(sKey, r);
          if (r.student?.studentId) resultMap.set(r.student.studentId, r);
        }

        // Candidates roster: either candidateSnapshot or enrolled students
        let candidates = exam.candidateSnapshot || [];
        if (candidates.length === 0) {
          const studentQuery = {};
          if (exam.program && exam.program !== "ALL") studentQuery.program = exam.program;
          if (exam.semester) studentQuery.semester = exam.semester;
          if (exam.sectionCode && exam.sectionCode !== "ALL") studentQuery.section = exam.sectionCode;
          const foundStudents = await Student.find(studentQuery).populate("user").sort({ studentId: 1 });
          candidates = foundStudents.map((s) => ({
            student: s._id,
            studentUser: s.user?._id || s.user,
            studentId: s.studentId,
            rollNumber: s.rollNumber || s.studentId,
            fullName: s.fullName || \`\${s.firstName} \${s.lastName}\`.trim(),
            program: s.program || exam.program,
            semester: s.semester || exam.semester,
            section: s.section || "A",
            attendancePercentage: 100,
            isEligible: true,
          }));
        }

        // If candidate is a student querying, only return their row
        if (roles.includes("student") && !isStaff) {
          const studentRec = await Student.findOne({ user: req.user._id });
          if (studentRec) {
            candidates = candidates.filter(
              (c) =>
                c.student?.toString() === studentRec._id.toString() ||
                c.studentId === studentRec.studentId
            );
          }
        }

        const formatted = candidates.map((c, idx) => {
          const candIdStr = c.student ? c.student.toString() : "";
          const existing = resultMap.get(candIdStr) || resultMap.get(c.studentId);

          const subjectMarksObj = {};
          const subjectStatusObj = {};

          if (existing && existing.subjectMarks && existing.subjectMarks.length > 0) {
            for (const sm of existing.subjectMarks) {
              subjectMarksObj[sm.code] = sm.marksObtained;
              subjectStatusObj[sm.code] = sm.status;
            }
          } else if (existing && existing.marksObtained != null && subjects.length === 1) {
            subjectMarksObj[subjects[0].code] = existing.marksObtained;
            subjectStatusObj[subjects[0].code] = existing.status === "PASSED" ? "PASS" : "FAIL";
          } else {
            for (const s of subjects) {
              subjectMarksObj[s.code] = null;
              subjectStatusObj[s.code] = "INCOMPLETE";
            }
          }

          const hasMissing = subjects.some(
            (s) =>
              subjectMarksObj[s.code] === null ||
              subjectMarksObj[s.code] === undefined ||
              subjectMarksObj[s.code] === "" ||
              subjectMarksObj[s.code] === "—"
          );

          return {
            id: existing ? existing._id.toString() : \`temp_\${c.studentId || idx}\`,
            student_ref_id: c.student ? c.student.toString() : null,
            sn: idx + 1,
            student_id: c.studentId,
            student_name: c.fullName,
            roll_number: c.rollNumber || c.studentId,
            symbol_number: c.rollNumber || c.studentId,
            section: c.section || exam.sectionCode || "A",
            program: c.program || exam.program,
            semester: c.semester || exam.semester,
            batch: exam.batch || "",
            subject_marks: subjectMarksObj,
            subject_status: subjectStatusObj,
            is_absent: existing ? existing.isAbsent : false,
            is_incomplete: existing ? existing.isIncomplete : hasMissing,
            total_marks: existing && existing.marksObtained != null ? existing.marksObtained : null,
            total_possible: existing ? existing.totalMarksPossible : subjects.reduce((sum, s) => sum + (s.totalMarks || 100), 0),
            percentage: existing ? existing.percentage : null,
            grade: existing ? existing.grade : (hasMissing ? "—" : ""),
            grade_point: existing ? existing.gradePoint : null,
            status: existing ? (existing.status || "INCOMPLETE") : (hasMissing ? "INCOMPLETE" : "PENDING"),
            workflow_status: existing ? existing.workflowStatus : "DRAFT",
            remarks: existing ? (existing.remarks || "") : "",
            submitted_at: existing ? existing.submittedAt : null,
            verified_at: existing ? existing.verifiedAt : null,
            finalized_at: existing ? existing.finalizedAt : null,
            published_at: existing ? existing.publishedAt : null,
          };
        });

        // Summary calculations
        const totalStudents = formatted.length;
        const completed = formatted.filter((r) => !r.is_incomplete && !r.is_absent && r.total_marks != null).length;
        const incomplete = formatted.filter((r) => r.is_incomplete || r.status === "INCOMPLETE").length;
        const absent = formatted.filter((r) => r.is_absent || r.status === "ABSENT").length;
        const passed = formatted.filter((r) => r.status === "PASSED" || r.status === "PASS").length;
        const failed = formatted.filter((r) => r.status === "FAILED" || r.status === "FAIL").length;
        const completedPercentages = formatted.filter((r) => r.percentage != null).map((r) => r.percentage);
        const avgPercentage =
          completedPercentages.length > 0
            ? (completedPercentages.reduce((a, b) => a + b, 0) / completedPercentages.length).toFixed(2)
            : "0.00";

        let workflowStatus = exam.resultsStatus || "DRAFT";
        if (formatted.length > 0 && formatted.every((r) => r.workflow_status === "PUBLISHED")) {
          workflowStatus = "PUBLISHED";
        } else if (formatted.length > 0 && formatted.every((r) => r.workflow_status === "FINALIZED")) {
          workflowStatus = "FINALIZED";
        } else if (formatted.length > 0 && formatted.every((r) => r.workflow_status === "VERIFIED")) {
          workflowStatus = "VERIFIED";
        } else if (formatted.length > 0 && formatted.some((r) => r.workflow_status === "SUBMITTED")) {
          workflowStatus = "SUBMITTED";
        }

        res.json({
          exam: {
            id: exam._id.toString(),
            title: exam.title,
            code: exam.examCode,
            examType: exam.examType,
            program: exam.program,
            semester: exam.semester,
            sectionCode: exam.sectionCode,
            academicYear: exam.academicYear,
            examinationYear: exam.academicYear ? exam.academicYear.split("/")[0] : "2083",
            nepaliDate: exam.nepaliDate,
            examDate: exam.examDate,
            totalMarks: subjects.reduce((sum, s) => sum + (s.totalMarks || 100), 0),
            passMarks: subjects.reduce((sum, s) => sum + (s.passMarks || 40), 0),
            resultsStatus: exam.resultsStatus,
            workflowStatus,
            subjects,
          },
          institution,
          results: formatted,
          summary: {
            totalStudents,
            totalSubjects: subjects.length,
            totalPossibleMarks: subjects.reduce((sum, s) => sum + (s.totalMarks || 100), 0),
            completed,
            incomplete,
            passed,
            failed,
            absent,
            averagePercentage: Number(avgPercentage),
          },
        });
      } catch (err) {
        console.error("Failed to load results:", err);
        res.status(500).json({ error: "Failed to load exam results." });
      }
    }
  );

  /**
   * Helper: is the user a faculty member scoped below exam officer level?
   */
  function isFacultyScoped(roles) {
    return (
      roles.includes("faculty") &&
      !roles.some((r) => ["super_admin", "exam_officer", "registrar", "hod", "dean"].includes(r))
    );
  }

  /**
   * 15b. Student views own published result
   */
  app.get(
    "/api/student/exams/:examId/my-result",
    requireAuth,
    requirePermission(["exam.results.view.own"]),
    async (req, res) => {
      try {
        const exam = await Exam.findById(req.params.examId).populate("course");
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const studentRecord = await Student.findOne({ user: req.user._id });
        if (!studentRecord) return res.status(404).json({ error: "Student record not found." });

        const result = await ExamResult.findOne({
          exam: exam._id,
          student: studentRecord._id,
          workflowStatus: "PUBLISHED",
        }).populate("student studentUser course");

        if (!result) {
          return res.status(404).json({ error: "Result not available." });
        }

        const subjects = await resolveExamSubjects(exam);
        const institution = await getInstitutionProfile();

        const subjectMarksObj = {};
        const subjectStatusObj = {};
        if (result.subjectMarks && result.subjectMarks.length > 0) {
          for (const sm of result.subjectMarks) {
            subjectMarksObj[sm.code] = sm.marksObtained;
            subjectStatusObj[sm.code] = sm.status;
          }
        } else if (result.marksObtained != null && subjects.length === 1) {
          subjectMarksObj[subjects[0].code] = result.marksObtained;
          subjectStatusObj[subjects[0].code] = result.status === "PASSED" ? "PASS" : "FAIL";
        }

        res.json({
          result: {
            id: result._id.toString(),
            student_id: result.student?.studentId,
            student_name: result.student ? result.student.fullName || \`\${result.student.firstName} \${result.student.lastName}\`.trim() : "Student",
            roll_number: result.student?.rollNumber || result.student?.studentId,
            symbol_number: result.student?.rollNumber || result.student?.studentId,
            enrollment_id: result.student?.enrollmentId,
            program: result.student?.program || exam.program,
            semester: result.student?.semester || exam.semester,
            batch: result.student?.batch || exam.batch,
            section: result.student?.section || "A",
            full_marks: result.totalMarksPossible || exam.totalMarks,
            pass_marks: exam.passMarks,
            obtained_marks: result.marksObtained,
            percentage: result.percentage,
            grade: result.grade,
            grade_point: result.gradePoint,
            status: result.status,
            workflow_status: result.workflowStatus,
            remarks: result.remarks,
            exam_title: exam.title,
            exam_code: exam.examCode,
            academic_year: exam.academicYear,
            subject_marks: subjectMarksObj,
            subject_status: subjectStatusObj,
            subjectMarks: result.subjectMarks || [],
            published_at: result.publishedAt,
          },
          subjects,
          institution,
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to load result." });
      }
    }
  );

  /**
   * 16. Enter / Modify Results (Save Draft)
   *
   * Authoritatively evaluates candidate marks against institutional grading scale.
   */
  app.post(
    "/api/exams/:id/results",
    requireAuth,
    requirePermission(["exam.manageResults", "exams.results.modify"]),
    async (req, res) => {
      try {
        const { marks = [] } = req.body || {};
        const exam = await Exam.findById(req.params.id).populate("course");
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const roles = getUserRoles(req.user);
        const facultyScoped = isFacultyScoped(roles);

        let teachingAssignment = null;
        if (facultyScoped) {
          teachingAssignment = await CourseTeachingAssignment.findOne({
            facultyUser: req.user._id,
            course: exam.course ? exam.course._id : exam.course,
          });
          if (!teachingAssignment) {
            return res.status(403).json({ error: "Not authorized to enter results for this course." });
          }
        }

        const subjects = await resolveExamSubjects(exam);
        let savedCount = 0;
        const errors = [];

        for (const item of marks) {
          const studentLookupId = item.studentId || item.student_id;
          let student = studentLookupId
            ? await Student.findOne({ studentId: studentLookupId })
            : null;

          if (!student && studentLookupId && studentLookupId.match(/^[0-9a-fA-F]{24}$/)) {
            student = await Student.findById(studentLookupId);
          }
          if (!student && item.student_ref_id) {
            student = await Student.findById(item.student_ref_id);
          }
          if (!student) {
            errors.push(\`Student not found: \${studentLookupId}\`);
            continue;
          }

          if (facultyScoped && teachingAssignment) {
            if (student.section !== teachingAssignment.sectionCode) {
              continue;
            }
          }

          const marksMap = item.subjectMarks || item.subject_marks || {};
          if (item.marks !== undefined && Object.keys(marksMap).length === 0 && subjects.length === 1) {
            marksMap[subjects[0].code] = item.marks;
          }

          const calc = await calculateAuthoritativeMarksheetRow({
            subjects,
            marksMap,
            isAbsentCandidate: item.isAbsent || item.is_absent || false,
          });

          if (!calc.valid) {
            errors.push(\`Student \${student.studentId}: \${calc.error}\`);
            continue;
          }

          const existing = await ExamResult.findOne({
            exam: exam._id,
            student: student._id,
          });

          const oldWorkflowStatus = existing ? existing.workflowStatus : "DRAFT";

          if (oldWorkflowStatus === "FINALIZED" || oldWorkflowStatus === "PUBLISHED") {
            if (!roles.some((r) => ["exam_officer", "registrar", "super_admin"].includes(r))) {
              errors.push(\`Student \${student.studentId}: result is finalized and cannot be edited.\`);
              continue;
            }
          }

          const targetWorkflowStatus =
            oldWorkflowStatus === "CORRECTION_REQUIRED" ? "REVISED" : oldWorkflowStatus === "REVISED" ? "REVISED" : "DRAFT";

          const updated = await ExamResult.findOneAndUpdate(
            { exam: exam._id, student: student._id },
            {
              $setOnInsert: {
                workflowStatus: targetWorkflowStatus,
              },
              $set: {
                exam: exam._id,
                student: student._id,
                studentUser: student.user,
                course: exam.course ? (exam.course._id || exam.course) : null,
                marksObtained: calc.totalMarksObtained != null ? calc.totalMarksObtained : 0,
                totalMarksPossible: calc.totalMarksPossible,
                percentage: calc.percentage,
                grade: calc.grade,
                gradePoint: calc.gradePoint,
                gpa: calc.gradePoint,
                status: calc.status === "PASSED" ? "PASSED" : calc.status === "FAILED" ? "FAILED" : calc.status === "ABSENT" ? "ABSENT" : "INCOMPLETE",
                isAbsent: calc.isAbsent,
                isIncomplete: calc.isIncomplete,
                subjectMarks: calc.subjectMarks,
                remarks: item.remarks || "",
                workflowStatus: targetWorkflowStatus,
              },
            },
            { upsert: true, returnDocument: 'after' }
          );

          await logAudit({
            userId: req.user._id,
            action: "RESULT_MARKS_CHANGED",
            module: "examinations",
            resource: "exam_result",
            resourceId: updated._id.toString(),
            oldValue: existing ? { marks: existing.marksObtained, grade: existing.grade, status: existing.status } : null,
            newValue: { marks: calc.totalMarksObtained, grade: calc.grade, status: calc.status },
            details: \`Marks \${existing ? "updated" : "entered"} for student \${student.studentId} (\${student.fullName || student.firstName}) in \${exam.title}.\`,
          });

          savedCount++;
        }

        res.json({ success: true, savedCount, errors });
      } catch (err) {
        console.error("Failed to save exam results:", err);
        res.status(500).json({ error: "Failed to save exam results." });
      }
    }
  );

  /**
   * 16b. Submit Results for Verification
   *
   * Transitions results from DRAFT / REVISED to SUBMITTED.
   */
  app.post(
    "/api/exams/:id/results/submit",
    requireAuth,
    requirePermission(["exam.results.submit"]),
    async (req, res) => {
      try {
        const exam = await Exam.findById(req.params.id).populate("course");
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const roles = getUserRoles(req.user);
        const facultyScoped = isFacultyScoped(roles);

        if (facultyScoped) {
          const ta = await CourseTeachingAssignment.findOne({
            facultyUser: req.user._id,
            course: exam.course ? exam.course._id : exam.course,
          });
          if (!ta) {
            return res.status(403).json({ error: "Not authorized to submit results for this course." });
          }
        }

        const result = await ExamResult.updateMany(
          {
            exam: exam._id,
            workflowStatus: { $in: ["DRAFT", "REVISED"] },
          },
          {
            $set: { workflowStatus: "SUBMITTED", submittedAt: new Date() },
          }
        );

        exam.resultsStatus = "UNDER_EVALUATION";
        await exam.save();

        await logAudit({
          userId: req.user._id,
          action: "RESULTS_SUBMITTED",
          module: "examinations",
          resource: "exam",
          resourceId: exam._id.toString(),
          details: \`Results submitted for verification: \${result.modifiedCount} record(s).\`,
        });

        res.json({
          success: true,
          submitted: result.modifiedCount,
          message: "Results submitted for verification.",
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to submit results." });
      }
    }
  );

  /**
   * 17. Verify Exam Results
   *
   * Transitions results from SUBMITTED to VERIFIED.
   */
  app.post(
    "/api/exams/:id/results/verify",
    requireAuth,
    requirePermission(["exam.verifyResults", "exams.results.modify", "grade.verify"]),
    async (req, res) => {
      try {
        const { remarks = "Results verified by authorized examination scrutinizer." } = req.body || {};
        const exam = await Exam.findById(req.params.id).populate("course");
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const update = await ExamResult.updateMany(
          { exam: exam._id, workflowStatus: { $in: ["SUBMITTED", "UNDER_VERIFICATION", "DRAFT"] } },
          {
            $set: {
              workflowStatus: "VERIFIED",
              verifiedBy: req.user._id,
              verifiedAt: new Date(),
            },
          }
        );

        if (update.modifiedCount > 0) {
          exam.resultsStatus = "VERIFIED";
          exam.examOfficer = req.user._id;
          await exam.save();
        }

        await logAudit({
          userId: req.user._id,
          action: "RESULTS_VERIFIED",
          module: "examinations",
          resource: "exam",
          resourceId: exam._id.toString(),
          details: \`Results verified for \${exam.title}: \${update.modifiedCount} record(s). Remarks: \${remarks}\`,
        });

        res.json({
          success: true,
          verified: update.modifiedCount,
          message: "Exam results verified.",
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to verify results." });
      }
    }
  );

  /**
   * 17b. Finalize Results
   *
   * Transitions VERIFIED -> FINALIZED. Authoritatively locks results.
   */
  app.post(
    "/api/exams/:id/results/finalize",
    requireAuth,
    requirePermission(["exam.results.finalize"]),
    async (req, res) => {
      try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const subjects = await resolveExamSubjects(exam);
        const results = await ExamResult.find({
          exam: exam._id,
          workflowStatus: { $in: ["SUBMITTED", "UNDER_VERIFICATION", "VERIFIED", "DRAFT"] },
        });

        for (const r of results) {
          const marksMap = {};
          if (r.subjectMarks && r.subjectMarks.length > 0) {
            for (const sm of r.subjectMarks) marksMap[sm.code] = sm.marksObtained;
          } else if (r.marksObtained != null && subjects.length === 1) {
            marksMap[subjects[0].code] = r.marksObtained;
          }
          const calc = await calculateAuthoritativeMarksheetRow({
            subjects,
            marksMap,
            isAbsentCandidate: r.isAbsent,
          });
          if (calc.valid) {
            r.marksObtained = calc.totalMarksObtained != null ? calc.totalMarksObtained : 0;
            r.totalMarksPossible = calc.totalMarksPossible;
            r.percentage = calc.percentage;
            r.grade = calc.grade;
            r.gradePoint = calc.gradePoint;
            r.gpa = calc.gradePoint;
            r.status = calc.status === "PASSED" ? "PASSED" : calc.status === "FAILED" ? "FAILED" : calc.status === "ABSENT" ? "ABSENT" : "INCOMPLETE";
            r.isAbsent = calc.isAbsent;
            r.isIncomplete = calc.isIncomplete;
            r.subjectMarks = calc.subjectMarks;
          }
          r.workflowStatus = "FINALIZED";
          r.finalizedBy = req.user._id;
          r.finalizedAt = new Date();
          await r.save();
        }

        exam.resultsStatus = "VERIFIED";
        await exam.save();

        await logAudit({
          userId: req.user._id,
          action: "RESULTS_FINALIZED",
          module: "examinations",
          resource: "exam",
          resourceId: exam._id.toString(),
          details: \`Results finalized and locked for \${exam.title}. \${results.length} record(s) set to FINALIZED.\`,
        });

        res.json({
          success: true,
          finalized: results.length,
          message: "Results finalized and locked.",
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to finalize results." });
      }
    }
  );

  /**
   * 18. Publish Results to Students
   *
   * Transitions FINALIZED -> PUBLISHED. Makes results available to candidates.
   */
  app.post(
    "/api/exams/:id/results/publish",
    requireAuth,
    requirePermission(["exam.publishResults", "exams.results.publish"]),
    async (req, res) => {
      try {
        const exam = await Exam.findById(req.params.id).populate("course");
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const toPublish = await ExamResult.find({
          exam: exam._id,
          workflowStatus: { $in: ["FINALIZED", "VERIFIED"] },
        }).populate("studentUser");

        const update = await ExamResult.updateMany(
          { exam: exam._id, workflowStatus: { $in: ["FINALIZED", "VERIFIED"] } },
          {
            $set: {
              workflowStatus: "PUBLISHED",
              publishedBy: req.user._id,
              publishedAt: new Date(),
            },
          }
        );

        exam.resultsStatus = "PUBLISHED";
        exam.publishedAt = exam.publishedAt || new Date();
        exam.publishedBy = req.user._id;
        await exam.save();

        const { Notification } = await import("../models/index.js");
        for (const resItem of toPublish) {
          if (resItem.studentUser) {
            await Notification.create({
              user: resItem.studentUser._id,
              title: \`Official Statement of Marks Published: \${exam.title}\`,
              message: \`Your official examination marksheet for \${exam.title} (\${exam.program} Sem \${exam.semester}) is now published.\`,
              category: "exam",
              priority: "high",
              actionUrl: "/examination",
              examId: exam._id,
            });
          }
        }

        await logAudit({
          userId: req.user._id,
          action: "EXAM_RESULTS_PUBLISHED",
          module: "examinations",
          resource: "exam",
          resourceId: exam._id.toString(),
          details: \`Published official exam marksheets for \${exam.title} to \${toPublish.length} students.\`,
        });

        res.json({
          success: true,
          published: update.modifiedCount,
          message: "Exam results published to students.",
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to publish exam results." });
      }
    }
  );

  /**
   * 18b. Revoke Publication
   *
   * Transitions PUBLISHED -> CORRECTION_REQUIRED with audit trace.
   */
  app.post(
    "/api/exams/:id/results/revoke",
    requireAuth,
    requirePermission(["exam.results.revoke"]),
    async (req, res) => {
      try {
        const { remarks = "Results revoked for correction." } = req.body || {};
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const update = await ExamResult.updateMany(
          { exam: exam._id, workflowStatus: "PUBLISHED" },
          {
            $set: { workflowStatus: "CORRECTION_REQUIRED" },
            $push: {
              workflowHistory: {
                status: "CORRECTION_REQUIRED",
                actor: req.user._id,
                role: "exam_officer",
                remarks,
                timestamp: new Date(),
              },
            },
          }
        );

        exam.resultsStatus = "UNDER_EVALUATION";
        await exam.save();

        await logAudit({
          userId: req.user._id,
          action: "RESULTS_REVOKED",
          module: "examinations",
          resource: "exam",
          resourceId: exam._id.toString(),
          details: \`Results revoked for correction: \${update.modifiedCount} record(s). Reason: \${remarks}\`,
        });

        res.json({
          success: true,
          revoked: update.modifiedCount,
          message: "Results revoked for correction.",
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to revoke results." });
      }
    }
  );

  /**
   * 18c. Correct a Result (after revocation)
   */
  app.post(
    "/api/exams/:id/results/:studentId/correct",
    requireAuth,
    requirePermission(["exam.results.correct"]),
    async (req, res) => {
      try {
        const { marks, subjectMarks, remarks = "Result corrected by examination controller." } = req.body || {};
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        let student = await Student.findOne({ studentId: req.params.studentId });
        if (!student && req.params.studentId.match(/^[0-9a-fA-F]{24}$/)) {
          student = await Student.findById(req.params.studentId);
        }
        if (!student) return res.status(404).json({ error: "Student not found." });

        const result = await ExamResult.findOne({
          exam: exam._id,
          student: student._id,
        });

        if (!result) {
          return res.status(404).json({ error: "Result not found." });
        }

        if (result.workflowStatus !== "CORRECTION_REQUIRED" && result.workflowStatus !== "REVISED") {
          return res.status(400).json({ error: \`Result must be in CORRECTION_REQUIRED state, currently \${result.workflowStatus}\` });
        }

        const subjects = await resolveExamSubjects(exam);
        const marksMap = subjectMarks || {};
        if (marks !== undefined && Object.keys(marksMap).length === 0 && subjects.length === 1) {
          marksMap[subjects[0].code] = marks;
        }

        const calc = await calculateAuthoritativeMarksheetRow({
          subjects,
          marksMap,
          isAbsentCandidate: req.body.isAbsent || false,
        });

        if (!calc.valid) {
          return res.status(400).json({ error: calc.error });
        }

        const oldValue = {
          marks: result.marksObtained,
          grade: result.grade,
          gradePoint: result.gradePoint,
          status: result.status,
          workflowStatus: result.workflowStatus,
        };

        result.marksObtained = calc.totalMarksObtained != null ? calc.totalMarksObtained : 0;
        result.totalMarksPossible = calc.totalMarksPossible;
        result.percentage = calc.percentage;
        result.grade = calc.grade;
        result.gradePoint = calc.gradePoint;
        result.status = calc.status;
        result.subjectMarks = calc.subjectMarks;
        result.workflowStatus = "REVISED";
        result.verifiedBy = null;
        result.finalizedBy = null;
        result.publishedBy = null;

        result.workflowHistory.push({
          status: "REVISED",
          actor: req.user._id,
          role: "exam_officer",
          remarks,
          oldValue,
          newValue: { marks: calc.totalMarksObtained, grade: calc.grade, status: calc.status },
          timestamp: new Date(),
        });

        await result.save();

        await logAudit({
          userId: req.user._id,
          action: "RESULT_CORRECTED",
          module: "examinations",
          resource: "exam_result",
          resourceId: result._id.toString(),
          oldValue,
          newValue: { marks: calc.totalMarksObtained, grade: calc.grade, status: calc.status },
          details: \`Result corrected for student \${student.studentId} in \${exam.title}.\`,
        });

        res.json({ success: true, message: "Result corrected.", workflowStatus: "REVISED" });
      } catch (err) {
        res.status(500).json({ error: "Failed to correct result." });
      }
    }
  );

  /**
   * 19. Get Official Marksheet Document Data (View B & Review View)
   */
  app.get(
    "/api/exams/:id/results/marksheet",
    requireAuth,
    requirePermission(["exam.results.marksheet", "exam.view"]),
    async (req, res) => {
      try {
        const { studentId } = req.query || {};
        const exam = await Exam.findById(req.params.id)
          .populate("course")
          .populate("assignedFaculty", "firstName lastName");

        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const subjects = await resolveExamSubjects(exam);
        const institution = await getInstitutionProfile();

        let filter = { exam: exam._id };
        if (studentId) {
          let student = await Student.findOne({ studentId });
          if (!student && studentId.match(/^[0-9a-fA-F]{24}$/)) {
            student = await Student.findById(studentId);
          }
          if (!student) return res.status(404).json({ error: "Student not found." });
          filter.student = student._id;
        }

        const results = await ExamResult.find(filter)
          .populate("student studentUser course")
          .sort({ "student.studentId": 1 });

        const marksheetItems = results.map((r, idx) => {
          const subjectMarksObj = {};
          const subjectStatusObj = {};

          if (r.subjectMarks && r.subjectMarks.length > 0) {
            for (const sm of r.subjectMarks) {
              subjectMarksObj[sm.code] = sm.marksObtained;
              subjectStatusObj[sm.code] = sm.status;
            }
          } else if (r.marksObtained != null && subjects.length === 1) {
            subjectMarksObj[subjects[0].code] = r.marksObtained;
            subjectStatusObj[subjects[0].code] = r.status === "PASSED" ? "PASS" : "FAIL";
          }

          return {
            sn: idx + 1,
            result_id: r._id.toString(),
            student_id: r.student?.studentId,
            student_name: r.student ? r.student.fullName || \`\${r.student.firstName} \${r.student.lastName}\`.trim() : "Student",
            roll_number: r.student?.rollNumber || r.student?.studentId,
            symbol_number: r.student?.rollNumber || r.student?.studentId,
            enrollment_id: r.student?.enrollmentId,
            section: r.student?.section || exam.sectionCode || "A",
            program: r.student?.program || exam.program,
            semester: r.student?.semester || exam.semester,
            batch: r.student?.batch || exam.batch,
            subject_marks: subjectMarksObj,
            subject_status: subjectStatusObj,
            subjectMarks: r.subjectMarks || [],
            is_absent: r.isAbsent,
            is_incomplete: r.isIncomplete,
            total_marks: r.marksObtained,
            total_possible: r.totalMarksPossible || subjects.reduce((sum, s) => sum + (s.totalMarks || 100), 0),
            percentage: r.percentage,
            grade: r.grade,
            grade_point: r.gradePoint,
            status: r.status,
            workflow_status: r.workflowStatus,
            remarks: r.remarks,
            submitted_at: r.submittedAt,
            verified_at: r.verifiedAt,
            finalized_at: r.finalizedAt,
            published_at: r.publishedAt,
          };
        });

        const totalStudents = marksheetItems.length;
        const completed = marksheetItems.filter((r) => !r.is_incomplete && !r.is_absent && r.total_marks != null).length;
        const incomplete = marksheetItems.filter((r) => r.is_incomplete || r.status === "INCOMPLETE").length;
        const absent = marksheetItems.filter((r) => r.is_absent || r.status === "ABSENT").length;
        const passed = marksheetItems.filter((r) => r.status === "PASSED" || r.status === "PASS").length;
        const failed = marksheetItems.filter((r) => r.status === "FAILED" || r.status === "FAIL").length;
        const completedPercentages = marksheetItems.filter((r) => r.percentage != null).map((r) => r.percentage);
        const avgPercentage =
          completedPercentages.length > 0
            ? (completedPercentages.reduce((a, b) => a + b, 0) / completedPercentages.length).toFixed(2)
            : "0.00";

        res.json({
          exam: {
            title: exam.title,
            exam_code: exam.examCode,
            exam_type: exam.examType,
            academic_year: exam.academicYear,
            examination_year: exam.academicYear ? exam.academicYear.split("/")[0] : "2083",
            program: exam.program,
            semester: exam.semester,
            section_code: exam.sectionCode,
            batch: exam.batch,
            total_marks: subjects.reduce((sum, s) => sum + (s.totalMarks || 100), 0),
            pass_marks: subjects.reduce((sum, s) => sum + (s.passMarks || 40), 0),
            results_status: exam.resultsStatus,
            published_at: exam.publishedAt,
            assigned_faculty: exam.assignedFaculty?.map((f) => \`\${f.firstName} \${f.lastName}\`.trim()),
          },
          institution,
          subjects,
          results: marksheetItems,
          summary: {
            totalStudents,
            totalSubjects: subjects.length,
            totalPossibleMarks: subjects.reduce((sum, s) => sum + (s.totalMarks || 100), 0),
            completed,
            incomplete,
            passed,
            failed,
            absent,
            averagePercentage: Number(avgPercentage),
          },
          signatures: {
            preparedBy: {
              title: "Prepared By",
              designation: "Examination Officer",
              name: "Examination Control Division",
              date: new Date().toISOString().split("T")[0],
            },
            verifiedBy: {
              title: "Verified By",
              designation: "Authorized Scrutinizer",
              name: "Department of Examination",
              date: new Date().toISOString().split("T")[0],
            },
            controller: {
              title: "Controller / Examination Officer",
              designation: "Controller of Examinations",
              name: "Official Examination Department",
              date: new Date().toISOString().split("T")[0],
            },
            sealText: "OFFICIAL EXAMINATION SEAL",
          },
          footer: {
            disclaimer: "This is a computer-generated statement of marks issued by CollegeOS Examination Management System.",
            generatedDate: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.error("Failed to load marksheet data:", err);
        res.status(500).json({ error: "Failed to load marksheet data." });
      }
    }
  );
\n  `;

const updated = original.substring(0, startComment) + replacement + original.substring(endComment);
fs.writeFileSync(filePath, updated, "utf8");
console.log("Successfully patched examinations router!");
