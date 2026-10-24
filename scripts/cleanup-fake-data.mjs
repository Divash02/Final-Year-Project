import { connectDatabase } from "../backend/src/config/database.js";
import {
  User,
  Student,
  Enrollment,
  Exam,
  ExamResult,
  AuditLog,
} from "../backend/src/models/index.js";

async function cleanup() {
  console.log("=== CLEANING FAKE/SEEDED DATA ===");
  await connectDatabase();

  const studentIds2083 = [];
  for (let i = 1; i <= 100; i++) {
    studentIds2083.push(2083-);
  }

  const studentEmails = [];
  for (let i = 1; i <= 100; i++) {
    studentEmails.push(student@techspire.edu.np);
  }

  const students = await Student.find({ studentId: { $in: studentIds2083 } }).select("_id user studentId");
  const studentObjectIds = students.map((s) => s._id);
  const userObjectIdsFromStudents = students.map((s) => s.user).filter(Boolean);

  const deletedResults = {};
  
  deletedResults.examResults = await ExamResult.deleteMany({ studentId: { $in: studentIds2083 } });
  deletedResults.enrollments = await Enrollment.deleteMany({ student: { $in: studentObjectIds } });
  deletedResults.students = await Student.deleteMany({ studentId: { $in: studentIds2083 } });
  deletedResults.studentUsers = await User.deleteMany({ email: { $in: studentEmails } });
  
  if (userObjectIdsFromStudents.length > 0) {
    const extra = await User.deleteMany({ 
      _id: { $in: userObjectIdsFromStudents },
      email: { $regex: ^student\d+@techspire\.edu\.np$ }
    });
    if (extra.deletedCount > 0) {
      deletedResults.extraStudentUsers = extra;
    }
  }
  
  deletedResults.exams = await Exam.deleteMany({ 
    title: { $regex: /BCA 4th Semester Final Examination/i } 
  });
  
  console.log("\n=== CLEANUP RESULTS ===");
  console.log(JSON.stringify(deletedResults, null, 2));
  console.log("\n=== CLEANUP COMPLETE ===");
  process.exit(0);
}

cleanup().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
