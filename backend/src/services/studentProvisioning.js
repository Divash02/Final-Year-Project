import { User, Student, Section, Enrollment, Course, Staff } from "../models/index.js";
import { hashPassword, logAudit } from "../db.js";
import { getMinimumPasswordLength } from "./passwordPolicy.js";
import { generateInstitutionalEmail } from "./institutionalEmail.js";
import { conflict, validationError } from "../utils/apiError.js";
import { createTemporaryPassword } from "../utils/temporaryPassword.js";

/**
 * One place where a student identity comes into existence.
 *
 * The `Student` document is the single institutional identity reused by
 * admissions, enrolment, attendance, assignments, examinations, finance,
 * requests, documents and analytics, so the account + student + section +
 * enrolment sequence must not be re-implemented per entry point. Direct
 * account provisioning (`/api/admin/users`) and admission enrolment
 * (`/api/admissions/applications/:id/enrol`) both call this service.
 */
export async function provisionStudentAccount({
  firstName,
  lastName,
  middleName = null,
  phone = null,
  personalEmail = null,
  studentId,
  program,
  department,
  batch,
  semester,
  section,
  campus,
  createdBy,
}) {
  const normalizedStudentId = String(studentId || "").trim();
  if (!normalizedStudentId) {
    throw validationError("A student ID is required.", [
      { field: "studentId", message: "Enter the institutional student ID." },
    ]);
  }

  const existing = await Student.findOne({ studentId: normalizedStudentId }).select("_id");
  if (existing) {
    throw conflict(`Student ID ${normalizedStudentId} is already in use.`);
  }

  const email = await generateInstitutionalEmail(firstName, lastName, batch);
  const minimumLength = await getMinimumPasswordLength();
  const temporaryPassword = createTemporaryPassword(minimumLength);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const sectionCode = String(section || "").trim().toUpperCase() || null;
  const semesterNumber = Number(semester) || 1;

  const user = await User.create({
    email,
    collegeEmail: email,
    passwordHash: hashPassword(temporaryPassword),
    firstName,
    middleName: middleName || null,
    lastName,
    phone: phone || null,
    personalEmail: personalEmail || null,
    roles: ["student"],
    activeRole: "student",
    mustChangePassword: true,
    credentialExpiresAt: expiresAt,
    accountStatus: "PASSIVE",
    passwordStatus: "TEMPORARY",
    isActive: true,
    createdBy: createdBy || null,
  });

  const student = await Student.create({
    user: user._id,
    studentId: normalizedStudentId,
    rollNumber: normalizedStudentId,
    enrollmentId: `ENR-${normalizedStudentId}`,
    firstName,
    lastName,
    email,
    collegeEmail: email,
    phone: phone || null,
    program: program || null,
    programCode: program || null,
    department: department || null,
    batch: batch || null,
    section: sectionCode,
    semester: semesterNumber,
    campus: campus || null,
    status: "ACTIVE",
  });

  // The section is the academic cohort the student belongs to; create it on
  // demand so a new batch does not require a separate setup step.
  if (sectionCode) {
    await Section.findOneAndUpdate(
      { code: sectionCode, program: program || null, semester: semesterNumber },
      {
        $setOnInsert: {
          code: sectionCode,
          program: program || null,
          semester: semesterNumber,
          batch: batch || null,
        },
      },
      { upsert: true },
    );
  }

  // Enrol the student in the courses already offered to that semester.
  if (sectionCode) {
    const semesterCourses = await Course.find({
      semester: semesterNumber,
      status: "ACTIVE",
    }).select("_id");
    if (semesterCourses.length) {
      await Enrollment.insertMany(
        semesterCourses.map((course) => ({
          student: student._id,
          studentUser: user._id,
          course: course._id,
          sectionCode,
          semester: semesterNumber,
          status: "ENROLLED",
        })),
        { ordered: false },
      ).catch((error) => {
        // A duplicate enrolment for an existing record is not a failure of the
        // provisioning itself, so it is logged and swallowed.
        console.warn("Bulk enrolment skipped a duplicate entry:", error.message);
      });
    }
  }

  await logAudit({
    userId: createdBy,
    action: "STUDENT_ENROLLED",
    module: "academics",
    resource: "student",
    resourceId: student._id.toString(),
    details: `Student ${normalizedStudentId} enrolled in ${program || "unspecified programme"}, semester ${semesterNumber}, section ${sectionCode || "n/a"}.`,
    metadata: { email, sectionCode, semester: semesterNumber, batch: batch || null },
  });

  return { user, student, email, temporaryPassword, credentialExpiresAt: expiresAt };
}

/** Staff counterpart used by account provisioning for non-student roles. */
export async function provisionStaffProfile({
  userId,
  employeeId,
  role,
  department,
  designation,
  campus,
}) {
  return await Staff.create({
    user: userId,
    employeeId: String(employeeId || `EMP-${Date.now().toString().slice(-6)}`).trim(),
    roleType: role === "faculty" ? "faculty" : "staff",
    department: department || "General",
    designation: designation || (role === "faculty" ? "Lecturer" : "Officer"),
    campus: campus || "Main Campus",
  });
}
