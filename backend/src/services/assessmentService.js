import {
  Student,
  Course,
  Enrollment,
  CourseTeachingAssignment,
  FacultySubjectAssignment,
  Grade,
  Exam,
  ExamResult,
  User,
} from "../models/index.js";
import { CourseAssessmentComponent } from "../models/CourseAssessmentComponent.js";
import { StudentAssessmentMark } from "../models/StudentAssessmentMark.js";
import { loadGradingScale } from "./gradingService.js";

/** Formats a Date object into Nepal Standard Time (UTC+5:45) */
export function formatNepalTime(date = new Date()) {
  const d = new Date(date);
  // UTC + 5 hours 45 minutes
  const nptOffset = 5.75 * 60 * 60 * 1000;
  const nptDate = new Date(d.getTime() + nptOffset);
  return nptDate.toISOString().replace("Z", "+05:45");
}

/** Authoritative grade determination on a 4.0 scale */
export function calculateGradeAndPoint(percentage, scale) {
  if (percentage == null || isNaN(percentage)) {
    return { grade: "—", gradePoint: null };
  }
  const pct = Math.round(Number(percentage) * 100) / 100;
  for (const band of scale) {
    const min = band.minimum ?? band.minPercentage;
    const max = band.maximum ?? band.maxPercentage;
    if (min == null || max == null) continue;
    if (pct >= min && pct <= max) {
      return { grade: band.grade, gradePoint: band.gradePoint };
    }
  }
  return { grade: "F", gradePoint: 0.0 };
}

/**
 * Ensures or retrieves the assessment component structure for a course offering.
 */
export async function getOrInitAssessmentStructure({
  courseId,
  academicYear = "2083/84",
  semester = 4,
  sectionCode = "ALL",
  program = "BCA",
  userId = null,
}) {
  let config = await CourseAssessmentComponent.findOne({
    course: courseId,
    academicYear,
    semester,
    sectionCode,
  });

  if (!config) {
    const course = await Course.findById(courseId);
    if (!course) throw new Error("Course not found");

    config = await CourseAssessmentComponent.create({
      course: course._id,
      courseCode: course.code,
      courseName: course.name,
      academicYear,
      semester,
      program: course.program || program,
      sectionCode,
      components: [
        {
          name: "Assignment",
          type: "ASSIGNMENT",
          maxMarks: 100,
          passMarks: 40,
          weightage: 50,
          description: "Internal coursework, continuous assessment and lab submissions",
        },
        {
          name: "Examination",
          type: "EXAMINATION",
          maxMarks: 100,
          passMarks: 40,
          weightage: 50,
          description: "Semester end theoretical written examination",
        },
      ],
      totalMaxMarks: 200,
      totalPassMarks: 80,
      passingRule: "ALL_COMPONENTS_MUST_PASS",
      configuredBy: userId,
      status: "ACTIVE",
    });
  }

  return config;
}

/**
 * Returns courses assigned to the faculty member (or all courses for administrators).
 */
export async function getFacultyAssignedCourses({ user, academicYear = "2083/84", semester = null }) {
  const roles = user.roles || [user.role] || [];
  const isAdminOrOfficer = roles.some((r) =>
    ["super_admin", "exam_officer", "registrar", "hod", "dean"].includes(r)
  );

  let courseIds = [];
  let teachingAssignments = [];

  if (isAdminOrOfficer) {
    const filter = { status: "ACTIVE" };
    if (semester) filter.semester = Number(semester);
    const courses = await Course.find(filter).sort({ semester: 1, code: 1 });
    return courses.map((c) => ({
      id: c._id.toString(),
      code: c.code,
      name: c.name,
      semester: c.semester,
      program: c.program || "BCA",
      department: c.department || "Computer Science",
      credits: c.credits || 3,
      sectionCodes: ["A", "B", "ALL"],
    }));
  }

  // Find assignments for this faculty member
  teachingAssignments = await CourseTeachingAssignment.find({
    facultyUser: user._id,
    ...(semester ? { semester: Number(semester) } : {}),
  }).populate("course");

  const subjectAssignments = await FacultySubjectAssignment.find({
    facultyUser: user._id,
    isActive: true,
  }).populate("course");

  const map = new Map();

  for (const ta of teachingAssignments) {
    if (ta.course) {
      const cId = ta.course._id.toString();
      if (!map.has(cId)) {
        map.set(cId, {
          id: cId,
          code: ta.course.code,
          name: ta.course.name,
          semester: ta.course.semester,
          program: ta.course.program || "BCA",
          department: ta.course.department || "Computer Science",
          credits: ta.course.credits || 3,
          sectionCodes: [ta.sectionCode || "A"],
        });
      } else {
        const item = map.get(cId);
        if (ta.sectionCode && !item.sectionCodes.includes(ta.sectionCode)) {
          item.sectionCodes.push(ta.sectionCode);
        }
      }
    }
  }

  for (const sa of subjectAssignments) {
    if (sa.course) {
      const cId = sa.course._id.toString();
      if (!map.has(cId)) {
        map.set(cId, {
          id: cId,
          code: sa.course.code,
          name: sa.course.name,
          semester: sa.course.semester,
          program: sa.course.program || "BCA",
          department: sa.course.department || "Computer Science",
          credits: sa.course.credits || 3,
          sectionCodes: ["A", "ALL"],
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Loads candidate students and their assessment marks for a specific course offering.
 */
export async function getCandidatesForAssessment({
  courseId,
  academicYear = "2083/84",
  semester = 4,
  sectionCode = "A",
  program = "BCA",
  userId = null,
}) {
  const course = await Course.findById(courseId);
  if (!course) throw new Error("Course not found");

  const structure = await getOrInitAssessmentStructure({
    courseId,
    academicYear,
    semester,
    sectionCode,
    program,
    userId,
  });

  // Query eligible students:
  // 1. By course Enrollment if present
  let enrollments = await Enrollment.find({
    course: courseId,
    academicYear,
    semester,
    ...(sectionCode && sectionCode !== "ALL" ? { sectionCode } : {}),
    status: "ENROLLED",
  }).populate("student studentUser");

  let students = [];
  if (enrollments && enrollments.length > 0) {
    students = enrollments.map((e) => e.student).filter(Boolean);
  } else {
    // 2. By program, semester & section in Student collection
    const studentFilter = {
      program: course.program || program,
      semester: Number(semester),
      status: "ACTIVE",
    };
    if (sectionCode && sectionCode !== "ALL") {
      studentFilter.section = sectionCode;
    }
    students = await Student.find(studentFilter)
      .populate("user")
      .sort({ rollNumber: 1, studentId: 1 });
  }

  // Load existing StudentAssessmentMark rows
  const existingMarks = await StudentAssessmentMark.find({
    course: courseId,
    academicYear,
    semester: Number(semester),
    ...(sectionCode && sectionCode !== "ALL" ? { sectionCode } : {}),
  });

  const marksMap = new Map();
  for (const m of existingMarks) {
    marksMap.set(m.student.toString(), m);
  }

  const gradingScale = await loadGradingScale();

  const candidateRows = [];
  let savedCount = 0;
  let incompleteCount = 0;
  let submittedCount = 0;

  for (let idx = 0; idx < students.length; idx++) {
    const s = students[idx];
    const sId = s._id.toString();
    const existing = marksMap.get(sId);

    const components = structure.components.map((comp) => {
      const match = existing?.components?.find((c) => c.name === comp.name);
      return {
        name: comp.name,
        type: comp.type,
        maxMarks: comp.maxMarks,
        passMarks: comp.passMarks,
        marksObtained: match?.marksObtained != null ? match.marksObtained : null,
        isAbsent: Boolean(match?.isAbsent),
        status: match?.status || (match?.marksObtained != null ? "ENTERED" : "PENDING"),
        enteredAt: match?.enteredAt || null,
        remarks: match?.remarks || "",
      };
    });

    let totalMarksObtained = existing?.totalMarksObtained ?? null;
    let totalMaxMarks = structure.totalMaxMarks;
    let percentage = existing?.percentage ?? null;
    let grade = existing?.grade || "—";
    let gradePoint = existing?.gradePoint ?? null;
    let resultStatus = existing?.resultStatus || "INCOMPLETE";
    let workflowStatus = existing?.workflowStatus || "DRAFT";
    let correctionReason = existing?.correctionReason || "";

    // Count statistics
    if (workflowStatus === "SUBMITTED" || workflowStatus === "VERIFIED" || workflowStatus === "FINALIZED" || workflowStatus === "PUBLISHED") {
      submittedCount++;
    }
    if (resultStatus === "INCOMPLETE" || components.some((c) => c.marksObtained == null && !c.isAbsent)) {
      incompleteCount++;
    } else {
      savedCount++;
    }

    candidateRows.push({
      sn: idx + 1,
      studentId: s.studentId,
      symbolNumber: s.rollNumber || s.studentId,
      fullName: s.fullName || `${s.firstName} ${s.lastName}`.trim(),
      email: s.collegeEmail || s.email,
      program: s.program || program,
      semester: s.semester || semester,
      section: s.section || sectionCode,
      components,
      totalMarksObtained,
      totalMaxMarks,
      percentage,
      grade,
      gradePoint,
      resultStatus,
      workflowStatus,
      correctionReason,
      updatedAt: existing?.updatedAt || null,
    });
  }

  // Derive general batch workflow status
  let overallWorkflowStatus = "DRAFT";
  if (existingMarks.length > 0) {
    const statuses = existingMarks.map((m) => m.workflowStatus);
    if (statuses.every((s) => s === "PUBLISHED")) overallWorkflowStatus = "PUBLISHED";
    else if (statuses.every((s) => s === "FINALIZED")) overallWorkflowStatus = "FINALIZED";
    else if (statuses.every((s) => s === "VERIFIED")) overallWorkflowStatus = "VERIFIED";
    else if (statuses.some((s) => s === "RETURNED_FOR_CORRECTION")) overallWorkflowStatus = "RETURNED_FOR_CORRECTION";
    else if (statuses.every((s) => s === "SUBMITTED")) overallWorkflowStatus = "SUBMITTED";
    else overallWorkflowStatus = "IN_PROGRESS";
  }

  return {
    course: {
      id: course._id.toString(),
      code: course.code,
      name: course.name,
      credits: course.credits || 3,
      program: course.program || program,
      semester: course.semester || semester,
    },
    academicYear,
    semester: Number(semester),
    sectionCode,
    structure: {
      components: structure.components,
      totalMaxMarks: structure.totalMaxMarks,
      totalPassMarks: structure.totalPassMarks,
      passingRule: structure.passingRule,
    },
    gradingScale,
    summary: {
      totalCandidates: students.length,
      savedCount,
      incompleteCount,
      submittedCount,
      workflowStatus: overallWorkflowStatus,
    },
    candidates: candidateRows,
  };
}

/**
 * Saves or updates assessment marks for a student.
 */
export async function saveStudentAssessmentMark({
  studentId,
  courseId,
  academicYear = "2083/84",
  semester = 4,
  sectionCode = "A",
  componentsInput = [],
  actorUser,
  remarks = "",
}) {
  const course = await Course.findById(courseId);
  if (!course) throw new Error("Course not found");

  const student = await Student.findOne({
    $or: [{ studentId }, { rollNumber: studentId }],
  }).populate("user");
  if (!student) throw new Error(`Student ${studentId} not found`);

  const structure = await getOrInitAssessmentStructure({
    courseId,
    academicYear,
    semester,
    sectionCode,
    program: student.program || "BCA",
    userId: actorUser._id,
  });

  let markDoc = await StudentAssessmentMark.findOne({
    student: student._id,
    course: course._id,
    academicYear,
    semester: Number(semester),
  });

  // Check if editing is locked
  if (
    markDoc &&
    ["SUBMITTED", "VERIFIED", "FINALIZED", "PUBLISHED"].includes(markDoc.workflowStatus)
  ) {
    const roles = actorUser.roles || [actorUser.role] || [];
    const isOfficer = roles.some((r) =>
      ["super_admin", "exam_officer", "registrar"].includes(r)
    );
    if (!isOfficer) {
      throw new Error(
        `Assessment is in ${markDoc.workflowStatus} status and locked for editing. Request revision from Examination Department.`
      );
    }
  }

  if (!markDoc) {
    markDoc = new StudentAssessmentMark({
      student: student._id,
      studentUser: student.user?._id || student.user,
      studentId: student.studentId,
      rollNumber: student.rollNumber || student.studentId,
      course: course._id,
      courseCode: course.code,
      courseName: course.name,
      academicYear,
      semester: Number(semester),
      sectionCode: student.section || sectionCode,
      program: student.program || "BCA",
      components: [],
      workflowStatus: "DRAFT",
    });
  }

  const oldValues = {
    components: markDoc.components,
    totalMarksObtained: markDoc.totalMarksObtained,
    percentage: markDoc.percentage,
    grade: markDoc.grade,
    resultStatus: markDoc.resultStatus,
  };

  // Merge components
  const updatedComponents = structure.components.map((structComp) => {
    const input = componentsInput.find((c) => c.name.toLowerCase() === structComp.name.toLowerCase());
    const existing = markDoc.components.find((c) => c.name.toLowerCase() === structComp.name.toLowerCase());

    let marksObtained = existing?.marksObtained ?? null;
    let isAbsent = existing?.isAbsent ?? false;
    let status = existing?.status ?? "PENDING";

    if (input) {
      if (input.isAbsent) {
        marksObtained = 0;
        isAbsent = true;
        status = "ABSENT";
      } else if (input.marksObtained !== undefined && input.marksObtained !== null && input.marksObtained !== "") {
        const val = Number(input.marksObtained);
        if (isNaN(val) || val < 0 || val > structComp.maxMarks) {
          throw new Error(`Marks for ${structComp.name} must be between 0 and ${structComp.maxMarks}`);
        }
        marksObtained = val;
        isAbsent = false;
        status = "ENTERED";
      } else {
        marksObtained = null;
        isAbsent = false;
        status = "PENDING";
      }
    }

    return {
      name: structComp.name,
      type: structComp.type,
      maxMarks: structComp.maxMarks,
      passMarks: structComp.passMarks,
      marksObtained,
      isAbsent,
      isExempt: false,
      status,
      enteredBy: actorUser._id,
      enteredAt: new Date(),
      remarks: input?.remarks || existing?.remarks || "",
    };
  });

  markDoc.components = updatedComponents;

  // Authoritative calculations
  const gradingScale = await loadGradingScale();
  const hasIncomplete = updatedComponents.some((c) => c.marksObtained == null && !c.isAbsent);
  const isAnyAbsent = updatedComponents.every((c) => c.isAbsent);

  if (hasIncomplete) {
    markDoc.totalMarksObtained = null;
    markDoc.totalMaxMarks = structure.totalMaxMarks;
    markDoc.percentage = null;
    markDoc.grade = "—";
    markDoc.gradePoint = null;
    markDoc.resultStatus = "INCOMPLETE";
  } else if (isAnyAbsent) {
    markDoc.totalMarksObtained = 0;
    markDoc.totalMaxMarks = structure.totalMaxMarks;
    markDoc.percentage = 0;
    markDoc.grade = "—";
    markDoc.gradePoint = 0.0;
    markDoc.resultStatus = "ABSENT";
  } else {
    const totalObt = updatedComponents.reduce((acc, c) => acc + (c.marksObtained || 0), 0);
    const totalMax = structure.totalMaxMarks;
    const pct = Math.round((totalObt / totalMax) * 10000) / 100;

    markDoc.totalMarksObtained = totalObt;
    markDoc.totalMaxMarks = totalMax;
    markDoc.percentage = pct;

    // Component-level pass check
    const hasFailedComponent = updatedComponents.some(
      (c) => (c.marksObtained || 0) < c.passMarks
    );

    if (hasFailedComponent || pct < 40) {
      markDoc.resultStatus = "FAIL";
      markDoc.grade = "F";
      markDoc.gradePoint = 0.0;
    } else {
      markDoc.resultStatus = "PASS";
      const { grade, gradePoint } = calculateGradeAndPoint(pct, gradingScale);
      markDoc.grade = grade;
      markDoc.gradePoint = gradePoint;
    }
  }

  // If status was RETURNED_FOR_CORRECTION, transition back to DRAFT or IN_PROGRESS
  if (markDoc.workflowStatus === "RETURNED_FOR_CORRECTION") {
    markDoc.workflowStatus = "DRAFT";
  }

  // Audit history
  markDoc.auditHistory.push({
    action: "MARKS_SAVED",
    actor: actorUser._id,
    actorName: `${actorUser.firstName} ${actorUser.lastName}`.trim(),
    role: actorUser.roles?.[0] || actorUser.role || "faculty",
    timestamp: new Date(),
    remarks: remarks || `Saved marks: ${updatedComponents.map((c) => `${c.name}: ${c.marksObtained ?? "—"}`).join(", ")}`,
    oldValues,
    newValues: {
      totalMarksObtained: markDoc.totalMarksObtained,
      percentage: markDoc.percentage,
      grade: markDoc.grade,
      resultStatus: markDoc.resultStatus,
    },
  });

  await markDoc.save();

  // Synchronize to Grade model for LMS and gradebook consistency
  await syncAssessmentToGrade(markDoc, actorUser);

  // Synchronize to ExamResult if an official Exam exists for this course
  await syncAssessmentToExamResult(markDoc, actorUser);

  return {
    success: true,
    savedAtNepalTime: formatNepalTime(markDoc.updatedAt),
    candidate: {
      studentId: student.studentId,
      symbolNumber: student.rollNumber || student.studentId,
      fullName: student.fullName || `${student.firstName} ${student.lastName}`.trim(),
      components: markDoc.components,
      totalMarksObtained: markDoc.totalMarksObtained,
      totalMaxMarks: markDoc.totalMaxMarks,
      percentage: markDoc.percentage,
      grade: markDoc.grade,
      gradePoint: markDoc.gradePoint,
      resultStatus: markDoc.resultStatus,
      workflowStatus: markDoc.workflowStatus,
    },
  };
}

/**
 * Synchronizes StudentAssessmentMark to Grade collection.
 */
async function syncAssessmentToGrade(markDoc, actorUser) {
  try {
    for (const comp of markDoc.components) {
      if (comp.marksObtained != null) {
        await Grade.findOneAndUpdate(
          {
            student: markDoc.student,
            course: markDoc.course,
            sourceType: comp.type === "EXAMINATION" ? "EXAM" : "ASSIGNMENT",
            sourceId: `${markDoc.courseCode}-${comp.name}-${markDoc.academicYear}`,
          },
          {
            $set: {
              studentUser: markDoc.studentUser,
              assessmentTitle: `${markDoc.courseCode} ${comp.name}`,
              assessmentType: comp.name,
              maxMarks: comp.maxMarks,
              marksObtained: comp.marksObtained,
              percentage: Math.round((comp.marksObtained / comp.maxMarks) * 10000) / 100,
              status: markDoc.workflowStatus === "PUBLISHED" ? "PUBLISHED" : "GRADED",
              academicYear: markDoc.academicYear,
              semester: markDoc.semester,
              sectionCodes: [markDoc.sectionCode],
              gradedBy: actorUser._id,
              gradedAt: new Date(),
            },
          },
          { upsert: true }
        );
      }
    }
  } catch (err) {
    console.error("Grade projection sync warning:", err.message);
  }
}

/**
 * Synchronizes StudentAssessmentMark to ExamResult collection.
 */
async function syncAssessmentToExamResult(markDoc, actorUser) {
  try {
    // Find exam for this course / semester
    const exam = await Exam.findOne({
      $or: [
        { course: markDoc.course },
        { "subjects.code": markDoc.courseCode, semester: markDoc.semester },
        { semester: markDoc.semester, academicYear: markDoc.academicYear },
      ],
    });

    if (exam) {
      const subjectMarkItem = {
        course: markDoc.course,
        code: markDoc.courseCode,
        name: markDoc.courseName,
        marksObtained: markDoc.totalMarksObtained ?? 0,
        totalMarks: markDoc.totalMaxMarks,
        passMarks: 80,
        credits: 3,
        isAbsent: markDoc.resultStatus === "ABSENT",
        status: markDoc.resultStatus === "PASS" ? "PASS" : markDoc.resultStatus === "FAIL" ? "FAIL" : "INCOMPLETE",
        grade: markDoc.grade,
        gradePoint: markDoc.gradePoint,
      };

      await ExamResult.findOneAndUpdate(
        { exam: exam._id, student: markDoc.student },
        {
          $set: {
            studentUser: markDoc.studentUser,
            course: markDoc.course,
            marksObtained: markDoc.totalMarksObtained ?? 0,
            totalMarksPossible: markDoc.totalMaxMarks,
            percentage: markDoc.percentage,
            grade: markDoc.grade,
            gradePoint: markDoc.gradePoint,
            status: markDoc.resultStatus === "PASS" ? "PASSED" : markDoc.resultStatus === "FAIL" ? "FAILED" : markDoc.resultStatus,
            workflowStatus: markDoc.workflowStatus === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
          },
          $addToSet: {
            subjectMarks: subjectMarkItem,
          },
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error("ExamResult sync warning:", err.message);
  }
}

/**
 * Transitions the workflow status of an entire course assessment batch.
 */
export async function transitionAssessmentWorkflow({
  courseId,
  academicYear = "2083/84",
  semester = 4,
  sectionCode = "A",
  toStatus,
  actorUser,
  remarks = "",
  studentId = null,
}) {
  const query = {
    course: courseId,
    academicYear,
    semester: Number(semester),
    ...(sectionCode && sectionCode !== "ALL" ? { sectionCode } : {}),
  };

  if (studentId) {
    const s = await Student.findOne({ $or: [{ studentId }, { rollNumber: studentId }] });
    if (s) query.student = s._id;
  }

  const records = await StudentAssessmentMark.find(query);
  if (records.length === 0) {
    throw new Error("No assessment marks found to transition");
  }

  const now = new Date();
  const updateData = { workflowStatus: toStatus };

  if (toStatus === "SUBMITTED") {
    updateData.submittedBy = actorUser._id;
    updateData.submittedAt = now;
  } else if (toStatus === "RETURNED_FOR_CORRECTION") {
    if (!remarks) throw new Error("Correction reason is mandatory when returning an assessment");
    updateData.correctionReason = remarks;
    updateData.correctionRequestedBy = actorUser._id;
    updateData.correctionRequestedAt = now;
  } else if (toStatus === "VERIFIED") {
    updateData.verifiedBy = actorUser._id;
    updateData.verifiedAt = now;
  } else if (toStatus === "FINALIZED") {
    updateData.finalizedBy = actorUser._id;
    updateData.finalizedAt = now;
  } else if (toStatus === "PUBLISHED") {
    updateData.publishedBy = actorUser._id;
    updateData.publishedAt = now;
  }

  const auditEntry = {
    action: `ASSESSMENT_${toStatus}`,
    actor: actorUser._id,
    actorName: `${actorUser.firstName} ${actorUser.lastName}`.trim(),
    role: actorUser.roles?.[0] || actorUser.role || "officer",
    timestamp: now,
    remarks,
  };

  await StudentAssessmentMark.updateMany(query, {
    $set: updateData,
    $push: { auditHistory: auditEntry },
  });

  // If publishing, sync to Grade and ExamResult
  if (toStatus === "PUBLISHED") {
    for (const r of records) {
      r.workflowStatus = "PUBLISHED";
      await syncAssessmentToGrade(r, actorUser);
      await syncAssessmentToExamResult(r, actorUser);
    }
  }

  return {
    success: true,
    transitionedCount: records.length,
    newStatus: toStatus,
  };
}
