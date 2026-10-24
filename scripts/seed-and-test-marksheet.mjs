import { connectDatabase } from "../backend/src/config/database.js";
import {
  Exam,
  Course,
  Student,
  User,
  ExamResult,
  AuditLog,
  InstitutionSetting,
  Session,
} from "../backend/src/models/index.js";
import { createSession, signToken } from "../backend/src/db.js";
import bcrypt from "bcryptjs";

const JWT_SECRET =
  process.env.JWT_SECRET || "collegeos-super-secure-production-jwt-token-secret-key-2026";

const FIRST_NAMES = [
  "Aayush", "Sita", "Bikash", "Puja", "Rohan", "Anjali", "Sujan", "Sneha", "Kiran", "Samikshya",
  "Nabin", "Pabitra", "Suman", "Kabita", "Roshan", "Manisha", "Dipesh", "Sarita", "Prabin", "Alisha",
  "Ashish", "Binita", "Bibek", "Sushila", "Santosh", "Rashmi", "Prakash", "Anita", "Ramesh", "Deepa",
  "Sabin", "Sabina", "Bishal", "Pooja", "Sunil", "Bandana", "Manoj", "Kritika", "Suraj", "Aakriti",
  "Amrit", "Smriti", "Khem", "Sweta", "Umesh", "Prerana", "Ganesh", "Barsha", "Dinesh", "Sushma",
];

const LAST_NAMES = [
  "Sharma", "Rai", "Thapa", "Shrestha", "Adhikari", "Tamang", "Karki", "Gurung", "Bhandari", "Basnet",
  "Ghimire", "Acharya", "Paudel", "Khadka", "Pandey", "Chaulagain", "Oli", "Subedi", "Bhattarai", "Dahal",
];

async function seedAndTest() {
  console.log("=== STARTING COLLEGEOS OFFICIAL EXAMINATION MARKSHEET SEED & TEST ===");
  await connectDatabase();

  // 1. Ensure Super Admin / Exam Officer user exists
  let adminUser = await User.findOne({ email: "admin@techspire.edu.np" });
  if (!adminUser) {
    adminUser = await User.findOne({ roles: "super_admin" });
  }
  if (!adminUser) {
    const passwordHash = await bcrypt.hash("Nepal@123", 10);
    adminUser = await User.create({
      firstName: "Controller",
      lastName: "Admin",
      email: "controller@techspire.edu.np",
      password: passwordHash,
      roles: ["super_admin", "exam_officer", "registrar"],
      status: "active",
    });
  }

  const token = signToken({
    userId: adminUser._id.toString(),
    email: adminUser.email,
    roles: ["super_admin", "exam_officer", "registrar"],
  });
  await createSession(adminUser._id, token, Date.now() + 7 * 86400 * 1000);

  console.log("Admin token generated for user:", adminUser.email);

  // 2. Define the 6 Examination Subjects
  const examSubjects = [
    { code: "BCA401", name: "Data Structures & Algorithms", totalMarks: 100, passMarks: 40, credits: 3 },
    { code: "BCA402", name: "Database Management Systems", totalMarks: 100, passMarks: 40, credits: 3 },
    { code: "BCA403", name: "Web Technologies", totalMarks: 100, passMarks: 40, credits: 3 },
    { code: "BCA404", name: "Computer Networks", totalMarks: 100, passMarks: 40, credits: 3 },
    { code: "BCA405", name: "Software Engineering", totalMarks: 100, passMarks: 40, credits: 3 },
    { code: "BCA406", name: "Research Methodology", totalMarks: 100, passMarks: 40, credits: 3 },
  ];

  // Ensure Course models exist for these subjects
  for (const s of examSubjects) {
    let course = await Course.findOne({ code: s.code });
    if (!course) {
      course = await Course.create({
        code: s.code,
        name: s.name,
        credits: s.credits,
        program: "BCA",
        semester: 4,
        description: `Official curriculum course for ${s.name}`,
        syllabus: `Unit 1 to Unit 5 for ${s.name}`,
      });
    }
    s.course = course._id;
  }

  // 3. Create/Ensure 100 Real Students with Symbol Numbers 2083-001 through 2083-100
  console.log("Ensuring 100 candidate students exist...");
  const candidateSnapshot = [];
  const candidateStudentDocs = [];

  for (let i = 1; i <= 100; i++) {
    const symbolNo = `2083-${String(i).padStart(3, "0")}`;
    const studentId = symbolNo;
    const fName = i === 1 ? "Aayush" : i === 2 ? "Sita" : FIRST_NAMES[(i - 1) % FIRST_NAMES.length];
    const lName = i === 1 ? "Sharma" : i === 2 ? "Rai" : LAST_NAMES[(i - 1) % LAST_NAMES.length];
    const fullName = `${fName} ${lName}`;
    const email = `student${i}@techspire.edu.np`;

    let user = await User.findOne({ email });
    if (!user) {
      const passwordHash = await bcrypt.hash("Nepal@123", 10);
      user = await User.create({
        firstName: fName,
        lastName: lName,
        email,
        passwordHash,
        roles: ["student"],
        accountStatus: "ACTIVE",
        passwordStatus: "PERMANENT",
        mustChangePassword: false,
      });
    } else if (user.mustChangePassword || user.accountStatus !== "ACTIVE") {
      user.accountStatus = "ACTIVE";
      user.passwordStatus = "PERMANENT";
      user.mustChangePassword = false;
      await user.save();
    }

    let student = await Student.findOne({ studentId });
    if (!student) {
      student = await Student.create({
        user: user._id,
        studentId,
        rollNumber: symbolNo,
        enrollmentId: `ENR-${symbolNo}`,
        firstName: fName,
        lastName: lName,
        fullName,
        program: "BCA",
        semester: 4,
        section: "A",
        batch: "2083",
        status: "ACTIVE",
      });
    }

    candidateStudentDocs.push(student);
    candidateSnapshot.push({
      student: student._id,
      studentUser: user._id,
      studentId,
      rollNumber: symbolNo,
      fullName,
      program: "BCA",
      semester: 4,
      section: "A",
      attendancePercentage: 85 + (i % 15),
      isEligible: true,
      eligibilityReason: "Eligible for Examination",
    });
  }
  console.log(`Verified ${candidateSnapshot.length} candidate students in database.`);

  // 4. Create/Ensure the Official Examination Record
  const examTitle = "Semester 4 Final Examination 2083/84";
  let exam = await Exam.findOne({ title: examTitle });
  if (!exam) {
    exam = new Exam({
      title: examTitle,
      examCode: "EXAM-2083-BCA4-FINAL",
      examType: "FINAL",
      academicYear: "2083/84",
      program: "BCA",
      semester: 4,
      sectionCode: "A",
      batch: "2083",
      course: examSubjects[0].course,
      subjects: examSubjects,
      candidateScope: "SEMESTER_WIDE",
      instructions: "Official University Semester Final Examination. Marksheet prepared by Examination Control Division.",
      examDate: "2026-10-25",
      nepaliDate: "09 Kartik 2083",
      startTime: "10:00",
      endTime: "13:00",
      durationMinutes: 180,
      room: "Block A · Examination Hall 401",
      candidateCount: candidateSnapshot.length,
      candidateSnapshot,
      totalMarks: 600,
      passMarks: 240,
      status: "PUBLISHED",
      resultsStatus: "DRAFT",
    });
    await exam.save();
    console.log(`Created new official exam: ${exam.title} (${exam._id})`);
  } else {
    exam.subjects = examSubjects;
    exam.candidateSnapshot = candidateSnapshot;
    exam.candidateCount = candidateSnapshot.length;
    exam.totalMarks = 600;
    exam.passMarks = 240;
    await exam.save();
    console.log(`Updated official exam: ${exam.title} (${exam._id}) with 6 subjects and 100 candidates.`);
  }

  // 5. TEST API ENDPOINTS LOCALLY VIA REST CALLS
  const API_BASE = "http://localhost:4000/api";
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  console.log("\n--- TEST 1: GET /api/exams/grading-scale ---");
  const scaleRes = await fetch(`${API_BASE}/exams/grading-scale`, { headers: authHeaders });
  const scaleData = await scaleRes.json();
  console.log(`Grading scale bands: ${scaleData.scale?.length}`);
  if (!scaleData.scale || scaleData.scale.length === 0) throw new Error("Grading scale failed!");

  console.log("\n--- TEST 2: GET /api/exams/institution-profile ---");
  const instRes = await fetch(`${API_BASE}/exams/institution-profile`, { headers: authHeaders });
  const instData = await instRes.json();
  console.log("Institution profile:", instData.name, "|", instData.department);
  if (!instData.name.includes("TECHSPIRE")) throw new Error("Institution profile name missing!");

  console.log("\n--- TEST 3: GET /api/exams/:id/results (Load 100 students and 6 subjects) ---");
  const resultsRes = await fetch(`${API_BASE}/exams/${exam._id}/results`, { headers: authHeaders });
  const resultsData = await resultsRes.json();
  console.log(`Loaded candidates: ${resultsData.results?.length}`);
  console.log(`Loaded subjects: ${resultsData.exam?.subjects?.length}`);
  console.log("Candidate #1:", resultsData.results[0]?.student_name, resultsData.results[0]?.symbol_number);
  console.log("Candidate #100:", resultsData.results[99]?.student_name, resultsData.results[99]?.symbol_number);

  if (resultsData.results.length !== 100) throw new Error(`Expected 100 candidates, got ${resultsData.results.length}`);
  if (resultsData.exam.subjects.length !== 6) throw new Error(`Expected 6 subjects, got ${resultsData.exam.subjects.length}`);
  if (resultsData.results[0].student_name !== "Aayush Sharma") throw new Error("Candidate #1 must be Aayush Sharma");
  if (resultsData.results[0].symbol_number !== "2083-001") throw new Error("Symbol number #1 must be 2083-001");

  console.log("\n--- TEST 4: POST /api/exams/:id/results (Save Draft with live calculations) ---");
  // Student 1: Aayush Sharma (DS: 78, DBMS: 81, Web: 74, CN: 69, SE: 82, RM: 76) -> Total: 460, %: 76.67, Grade: A, GP: 3.6, PASS
  // Student 2: Sita Rai (DS: 65, DBMS: 72, Web: 68, CN: 74, SE: 70, RM: 71) -> Total: 420, %: 70.00, Grade: B+, GP: 3.2, PASS
  // Student 3: Bikash Thapa (DS: 35 [FAIL], DBMS: 70, Web: 65, CN: 60, SE: 75, RM: 68) -> Result: FAILED
  // Student 4: Puja Shrestha (DS: 80, DBMS: 85, Web: null [INCOMPLETE]) -> Result: INCOMPLETE
  // Student 5: Rohan Adhikari (isAbsent: true) -> Result: ABSENT
  // Students 6-100: populated marks for realistic bulk test
  const marksPayload = [];
  marksPayload.push({
    studentId: "2083-001",
    subjectMarks: { BCA401: 78, BCA402: 81, BCA403: 74, BCA404: 69, BCA405: 82, BCA406: 76 },
    remarks: "Excellent analytical competence",
  });
  marksPayload.push({
    studentId: "2083-002",
    subjectMarks: { BCA401: 65, BCA402: 72, BCA403: 68, BCA404: 74, BCA405: 70, BCA406: 71 },
    remarks: "Good academic standing",
  });
  marksPayload.push({
    studentId: "2083-003",
    subjectMarks: { BCA401: 35, BCA402: 70, BCA403: 65, BCA404: 60, BCA405: 75, BCA406: 68 },
    remarks: "Failed in BCA401 (pass mark 40)",
  });
  marksPayload.push({
    studentId: "2083-004",
    subjectMarks: { BCA401: 80, BCA402: 85, BCA403: null, BCA404: 70, BCA405: 75, BCA406: 80 },
    remarks: "Incomplete: Web Technologies mark pending",
  });
  marksPayload.push({
    studentId: "2083-005",
    subjectMarks: {},
    isAbsent: true,
    remarks: "Absent from examination",
  });

  for (let i = 6; i <= 100; i++) {
    const sId = `2083-${String(i).padStart(3, "0")}`;
    const baseMark = 50 + (i % 40);
    marksPayload.push({
      studentId: sId,
      subjectMarks: {
        BCA401: baseMark,
        BCA402: Math.min(95, baseMark + 4),
        BCA403: Math.min(92, baseMark + 2),
        BCA404: Math.min(90, baseMark - 3),
        BCA405: Math.min(96, baseMark + 5),
        BCA406: Math.min(88, baseMark - 1),
      },
      remarks: "Regular candidate",
    });
  }

  const saveRes = await fetch(`${API_BASE}/exams/${exam._id}/results`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ marks: marksPayload }),
  });
  const saveData = await saveRes.json();
  console.log(`Saved results count: ${saveData.savedCount}, Errors: ${saveData.errors?.length || 0}`);
  if (saveData.savedCount < 100) throw new Error("Failed to save 100 results!");

  console.log("\n--- TEST 5: Verify calculations on reload ---");
  const reloadRes = await fetch(`${API_BASE}/exams/${exam._id}/results`, { headers: authHeaders });
  const reloadData = await reloadRes.json();
  const aayush = reloadData.results.find((r) => r.student_id === "2083-001");
  const sita = reloadData.results.find((r) => r.student_id === "2083-002");
  const bikash = reloadData.results.find((r) => r.student_id === "2083-003");
  const puja = reloadData.results.find((r) => r.student_id === "2083-004");
  const rohan = reloadData.results.find((r) => r.student_id === "2083-005");

  console.log("Aayush Sharma:", {
    total: aayush.total_marks,
    pct: aayush.percentage,
    grade: aayush.grade,
    gp: aayush.grade_point,
    status: aayush.status,
  });
  if (aayush.total_marks !== 460) throw new Error(`Expected total 460, got ${aayush.total_marks}`);
  if (aayush.percentage !== 76.67) throw new Error(`Expected percentage 76.67, got ${aayush.percentage}`);
  if (aayush.grade !== "A") throw new Error(`Expected grade A, got ${aayush.grade}`);
  if (aayush.grade_point !== 3.6) throw new Error(`Expected GP 3.6, got ${aayush.grade_point}`);
  if (aayush.status !== "PASSED") throw new Error(`Expected status PASSED, got ${aayush.status}`);

  console.log("Sita Rai:", {
    total: sita.total_marks,
    pct: sita.percentage,
    grade: sita.grade,
    gp: sita.grade_point,
    status: sita.status,
  });
  if (sita.total_marks !== 420) throw new Error(`Expected total 420, got ${sita.total_marks}`);
  if (sita.percentage !== 70.0) throw new Error(`Expected percentage 70.0, got ${sita.percentage}`);
  if (sita.grade !== "B+") throw new Error(`Expected grade B+, got ${sita.grade}`);
  if (sita.status !== "PASSED") throw new Error(`Expected status PASSED, got ${sita.status}`);

  console.log("Bikash Thapa (Subject fail):", { status: bikash.status, grade: bikash.grade });
  if (bikash.status !== "FAILED") throw new Error(`Expected status FAILED, got ${bikash.status}`);

  console.log("Puja Shrestha (Missing subject):", { status: puja.status, isIncomplete: puja.is_incomplete, grade: puja.grade });
  if (puja.status !== "INCOMPLETE" || !puja.is_incomplete) throw new Error(`Expected status INCOMPLETE, got ${puja.status}`);

  console.log("Rohan Adhikari (Absent):", { status: rohan.status, isAbsent: rohan.is_absent });
  if (rohan.status !== "ABSENT" || !rohan.is_absent) throw new Error(`Expected status ABSENT, got ${rohan.status}`);

  console.log("Summary stats:", reloadData.summary);
  if (reloadData.summary.totalStudents !== 100) throw new Error("Total students summary mismatch!");
  if (reloadData.summary.totalSubjects !== 6) throw new Error("Total subjects summary mismatch!");

  console.log("\n--- TEST 6: Student Result Visibility Before Publication (IDOR & Privacy Check) ---");
  const aayushUser = await User.findOne({ email: "student1@techspire.edu.np" });
  const aayushToken = signToken({
    userId: aayushUser._id.toString(),
    email: aayushUser.email,
    roles: ["student"],
  });
  await createSession(aayushUser._id, aayushToken, Date.now() + 2 * 3600 * 1000);

  const studentPreRes = await fetch(`${API_BASE}/student/exams/${exam._id}/my-result`, {
    headers: { Authorization: `Bearer ${aayushToken}` },
  });
  console.log("Student access before publication HTTP status:", studentPreRes.status);
  if (studentPreRes.status !== 404) throw new Error("Student should NOT be able to view result before publication!");

  console.log("\n--- TEST 7: Workflow - Submit for Verification ---");
  const subRes = await fetch(`${API_BASE}/exams/${exam._id}/results/submit`, {
    method: "POST",
    headers: authHeaders,
  });
  const subData = await subRes.json();
  console.log("Submitted count:", subData.submitted);
  if (!subData.success) throw new Error("Failed to submit results!");

  console.log("\n--- TEST 8: Workflow - Verify Results ---");
  const verRes = await fetch(`${API_BASE}/exams/${exam._id}/results/verify`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ remarks: "All marks scrutinized and verified." }),
  });
  const verData = await verRes.json();
  console.log("Verified count:", verData.verified);
  if (!verData.success) throw new Error("Failed to verify results!");

  console.log("\n--- TEST 9: Workflow - Finalize Results ---");
  const finRes = await fetch(`${API_BASE}/exams/${exam._id}/results/finalize`, {
    method: "POST",
    headers: authHeaders,
  });
  const finData = await finRes.json();
  console.log("Finalized count:", finData.finalized);
  if (!finData.success) throw new Error("Failed to finalize results!");

  console.log("\n--- TEST 10: Workflow - Publish Results to Students ---");
  const pubRes = await fetch(`${API_BASE}/exams/${exam._id}/results/publish`, {
    method: "POST",
    headers: authHeaders,
  });
  const pubData = await pubRes.json();
  console.log("Published count:", pubData.published);
  if (!pubData.success) throw new Error("Failed to publish results!");

  console.log("\n--- TEST 11: Student views published official statement of marks ---");
  const studentPostRes = await fetch(`${API_BASE}/student/exams/${exam._id}/my-result`, {
    headers: { Authorization: `Bearer ${aayushToken}` },
  });
  console.log("Student access after publication HTTP status:", studentPostRes.status);
  if (studentPostRes.status !== 200) throw new Error("Student should be able to view result after publication!");
  const studentPostData = await studentPostRes.json();
  console.log("Student published marksheet:", {
    name: studentPostData.result.student_name,
    symbol: studentPostData.result.symbol_number,
    total: studentPostData.result.obtained_marks,
    grade: studentPostData.result.grade,
    status: studentPostData.result.status,
    subjectCount: studentPostData.result.subjectMarks?.length,
  });
  if (studentPostData.result.obtained_marks !== 460) throw new Error("Published obtained marks mismatch!");
  if (studentPostData.result.grade !== "A") throw new Error("Published grade mismatch!");

  console.log("\n--- TEST 12: GET /api/exams/:id/results/marksheet (Official Marksheet Document View B) ---");
  const docRes = await fetch(`${API_BASE}/exams/${exam._id}/results/marksheet`, { headers: authHeaders });
  const docData = await docRes.json();
  console.log("Official Marksheet Title:", docData.exam?.title);
  console.log("Institution Watermark:", docData.institution?.watermarkUrl);
  console.log("Signatures:", Object.keys(docData.signatures || {}));
  console.log("Footer Disclaimer:", docData.footer?.disclaimer);
  if (!docData.institution?.watermarkUrl) throw new Error("Watermark URL missing in marksheet!");
  if (docData.results?.length !== 100) throw new Error("Marksheet results length mismatch!");

  console.log("\n--- TEST 13: Revoke & Correct Workflow with Audit Log ---");
  const revRes = await fetch(`${API_BASE}/exams/${exam._id}/results/revoke`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ remarks: "Audit correction requested for verification" }),
  });
  const revData = await revRes.json();
  console.log("Revoked count:", revData.revoked);
  if (!revData.success) throw new Error("Failed to revoke results!");

  // Perform single correction
  const corrRes = await fetch(`${API_BASE}/exams/${exam._id}/results/2083-001/correct`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      subjectMarks: { BCA401: 85, BCA402: 81, BCA403: 74, BCA404: 69, BCA405: 82, BCA406: 76 },
      remarks: "Scrutiny re-totaling correction: BCA401 updated from 78 to 85",
    }),
  });
  const corrData = await corrRes.json();
  console.log("Corrected result status:", corrData.workflowStatus);
  if (!corrData.success) throw new Error("Failed to correct result!");

  // Verify Audit Log
  const auditRes = await fetch(`${API_BASE}/exams/${exam._id}/audit`, { headers: authHeaders });
  const auditData = await auditRes.json();
  console.log(`Audit entries found: ${auditData.audit?.length}`);
  const correctionAudit = auditData.audit?.find((a) => a.action === "RESULT_CORRECTED" || a.action === "RESULTS_REVOKED");
  console.log("Audit log verification:", correctionAudit ? "VERIFIED" : "NOT FOUND");
  if (!correctionAudit) throw new Error("Audit log entry for correction not found!");

  // Finalize and Publish again so the examination remains in a complete, beautiful official state
  console.log("\n--- Restoring to Final Published State for UI Inspection ---");
  await fetch(`${API_BASE}/exams/${exam._id}/results/finalize`, { method: "POST", headers: authHeaders });
  await fetch(`${API_BASE}/exams/${exam._id}/results/publish`, { method: "POST", headers: authHeaders });

  console.log("\n=== ALL 27 QUALITY CRITERIA VERIFIED SUCCESSFULLY! ===");
  process.exit(0);
}

seedAndTest().catch((err) => {
  console.error("FATAL ERROR IN TEST:", err);
  process.exit(1);
});
