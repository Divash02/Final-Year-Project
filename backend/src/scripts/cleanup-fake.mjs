import { connectDatabase } from "../config/database.js";
import { User, Student, Enrollment, Exam, ExamResult } from "../models/index.js";

async function cleanup() {
  await connectDatabase();
  const ids = [];
  for (let i = 1; i <= 100; i++) {
    ids.push("2083-" + String(i).padStart(3, "0"));
  }
  const emails = [];
  for (let i = 1; i <= 100; i++) {
    emails.push("student" + i + "@techspire.edu.np");
  }
  const students = await Student.find({ studentId: { $in: ids } }).select("_id user");
  const sIds = students.map(s => s._id);
  const uIds = students.map(s => s.user).filter(Boolean);
  const res = {};
  res.examResults = await ExamResult.deleteMany({ studentId: { $in: ids } });
  res.enrollments = await Enrollment.deleteMany({ student: { $in: sIds } });
  res.students = await Student.deleteMany({ studentId: { $in: ids } });
  res.studentUsers = await User.deleteMany({ email: { $in: emails } });
  if (uIds.length) {
    res.extra = await User.deleteMany({ _id: { $in: uIds }, email: /student\d+@techspire\.edu\.np$/ });
  }
  res.exams = await Exam.deleteMany({ title: /BCA 4th Semester Final Examination/i });
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

cleanup().catch(e => { console.error(e); process.exit(1); });
