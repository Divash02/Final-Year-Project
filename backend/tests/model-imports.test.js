import test from "node:test";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/collegeos_internship_api_test";
process.env.JWT_SECRET = "test-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";

test("model imports", async () => {
  const models = [
    "./User.js",
    "./Student.js",
    "./Staff.js",
    "./Employee.js",
    "./LeaveRequest.js",
    "./Library.js",
    "./Department.js",
    "./Program.js",
    "./Section.js",
    "./Course.js",
    "./Enrollment.js",
    "./CourseTeachingAssignment.js",
    "./FacultySubjectAssignment.js",
    "./Attendance.js",
    "./AttendanceSession.js",
    "./Assignment.js",
    "./Submission.js",
    "./LearningMaterial.js",
    "./CourseWeek.js",
    "./LearningObjective.js",
    "./Quiz.js",
    "./QuizQuestion.js",
    "./QuizAttempt.js",
    "./CourseAnnouncement.js",
    "./CourseTemplate.js",
    "./TeachingProgress.js",
    "./Grade.js",
    "./AcademicRiskIndicator.js",
    "./AcademicIntervention.js",
    "./Internship.js",
    "./IndustryProject.js",
    "./VirtualWorkplace.js",
    "./Competency.js",
    "./ResearchProject.js",
    "./CampusIncident.js",
    "./GraduationApplication.js",
  ];
  
  for (const m of models) {
    try {
      await import("../src/models/" + m);
      console.error("OK: " + m);
    } catch (e) {
      console.error("FAIL: " + m + ": " + e.message);
    }
  }
});
