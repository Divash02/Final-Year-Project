import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const TEST_DB = "collegeos_ai_test";
const MONGO_HOST = process.env.COLLEGEOS_TEST_MONGO_HOST || "127.0.0.1:27017";

process.env.MONGODB_URI = `mongodb://${MONGO_HOST}/${TEST_DB}`;
process.env.JWT_SECRET = "collegeos-ai-integration-suite-secret-key-2026";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";

let baseUrl = "";
let server = null;
let mongooseRef = null;
const ctx = {};

async function api(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await fetch(baseUrl + path, { method, headers, body: payload });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: response.status, data, text, headers: response.headers };
}

async function login(email, password) {
  const res = await api("/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.text}`);
  return res.data.token;
}

async function activate(email, temporaryPassword, newPassword) {
  const token = await login(email, temporaryPassword);
  const changed = await api("/api/auth/change-password", {
    method: "POST",
    token,
    body: {
      currentPassword: temporaryPassword,
      newPassword,
      confirmPassword: newPassword,
    },
  });
  assert.equal(changed.status, 200, `password change failed: ${changed.text}`);
  return changed.data.token;
}

async function provision(actorToken, body) {
  const created = await api("/api/admin/users", {
    method: "POST",
    token: actorToken,
    body,
  });
  assert.equal(created.status, 201, `provisioning failed: ${created.text}`);
  const password = `Collegeos@${Math.random().toString(36).slice(2, 8)}1`;
  const token = await activate(created.data.email, created.data.temporaryPassword, password);
  return { ...created.data, password, token, userId: created.data.userId };
}

before(async () => {
  const { connectDatabase, mongoose } = await import("../src/config/database.js");
  await connectDatabase();
  await mongoose.connection.dropDatabase();
  mongooseRef = mongoose;

  const { initializeServerState } = await import("../src/db.js");
  await initializeServerState();

  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Activate Super Admin
  ctx.adminToken = await activate(
    "admin@collegeos.test",
    process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD,
    "AdminPass@1234"
  );

  // Sections are created explicitly so cohort codes match
  await api("/api/sections", {
    method: "POST",
    token: ctx.adminToken,
    body: { code: "A1", program: "BCA", semester: 2, batch: "2025", room: "Hall 101" },
  });

  // Provision an Exam Officer
  const examOfficer = await provision(ctx.adminToken, {
    firstName: "Exam",
    lastName: "Officer",
    role: "exam_officer",
    designation: "Exam Officer",
  });
  ctx.examOfficerToken = examOfficer.token;

  // Provision a Faculty member
  const faculty = await provision(ctx.adminToken, {
    firstName: "Saroj",
    lastName: "Adhikari",
    role: "faculty",
    designation: "Lecturer",
    department: "Computer Science",
  });
  ctx.facultyToken = faculty.token;

  const hod = await provision(ctx.adminToken, {
    firstName: "Department",
    lastName: "Head",
    role: "hod",
    designation: "Head of Department",
    department: "Computer Science",
  });
  ctx.hodToken = hod.token;
  ctx.hodEmail = hod.email;

  // Provision a Student
  const student = await provision(ctx.adminToken, {
    firstName: "Aarav",
    lastName: "Sharma",
    role: "student",
    studentId: "BCA25011",
    program: "BCA",
    batch: "2025",
    semester: 2,
    section: "A1",
  });
  ctx.studentToken = student.token;

  // Create a Course for test fixtures
  const courseRes = await api("/api/courses", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      code: "CS101",
      name: "Computer Programming",
      department: "Computer Science",
      program: "BCA",
      semester: 2,
      credits: 3,
      courseType: "CORE",
    },
  });
  assert.equal(courseRes.status, 201);
  ctx.courseId = courseRes.data.course.id;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (mongooseRef) {
    await mongooseRef.connection.dropDatabase();
    await mongooseRef.disconnect();
  }
});

/* ------------------------------------------------------------------ */
/* Test 1: Operations Agent & AI Activity Audit Trail                */
/* ------------------------------------------------------------------ */
test("AI Operations Agent queries authorized records and records audit trail", async () => {
  const queryRes = await api("/api/ai/operations", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      queryPrompt: "Which students in my authorized department have attendance below threshold?",
    },
  });

  assert.equal(queryRes.status, 200, queryRes.text);
  assert.ok(queryRes.data.answer);
  assert.equal(queryRes.data.module, "academic_ai");
  assert.ok(Array.isArray(queryRes.data.sourceRecords));

  // Verify interaction is recorded in immutable AI Activity Log
  const logRes = await api("/api/ai/activity-logs", {
    token: ctx.adminToken,
  });
  assert.equal(logRes.status, 200);
  assert.ok(logRes.data.logs.length >= 1);
  assert.equal(logRes.data.logs[0].module, "academic_ai");

  const pendingRes = await api("/api/ai/activity-logs?pendingOnly=true", {
    token: ctx.adminToken,
  });
  assert.equal(pendingRes.status, 200);
  assert.equal(pendingRes.data.count, 0);

  const copilotRes = await api("/api/ai/academic/student-copilot", {
    method: "POST",
    token: ctx.studentToken,
    body: { prompt: "What is my attendance and examination schedule?" },
  });
  assert.equal(copilotRes.status, 200, copilotRes.text);
  assert.ok(copilotRes.data.summary);
  const examQuestion = await api("/api/ai/operations", {
    method: "POST",
    token: ctx.studentToken,
    body: { queryPrompt: "What examinations are scheduled for me?" },
  });
  assert.equal(examQuestion.status, 200, examQuestion.text);
  assert.equal(examQuestion.data.humanConfirmationRequired, false);
  const pendingAfterCopilot = await api("/api/ai/activity-logs?pendingOnly=true", {
    token: ctx.adminToken,
  });
  assert.equal(pendingAfterCopilot.data.count, 0);
});

/* ------------------------------------------------------------------ */
/* Test 2: Human Confirmation Gate for Proposed AI Actions            */
/* ------------------------------------------------------------------ */
test("Consequential AI actions require human confirmation before execution", async () => {
  const { Student } = await import("../src/models/Student.js");
  const { Notification } = await import("../src/models/Notification.js");
  await Student.updateOne({ studentId: "BCA25011" }, { $set: { attendancePercentage: 60 } });

  const body = {
    queryPrompt: "Send attendance warnings",
    idempotencyKey: "ai-attendance-warning-integration-test",
  };
  const stagedResponse = await api("/api/ai/operations", {
    method: "POST",
    token: ctx.hodToken,
    body,
  });
  assert.equal(stagedResponse.status, 200, stagedResponse.text);
  assert.equal(stagedResponse.data.humanConfirmationRequired, true);
  assert.equal(stagedResponse.data.proposedAction.actionKey, "DISPATCH_ATTENDANCE_WARNING_NOTICES");
  assert.equal(stagedResponse.data.proposedAction.requiredPermission, "attendance.reviewCorrection");

  const retriedResponse = await api("/api/ai/operations", {
    method: "POST",
    token: ctx.hodToken,
    body,
  });
  assert.equal(retriedResponse.status, 200, retriedResponse.text);
  assert.equal(retriedResponse.data.logId, stagedResponse.data.logId);

  const pendingResponse = await api("/api/ai/activity-logs?pendingOnly=true", {
    token: ctx.adminToken,
  });
  assert.equal(pendingResponse.data.count, 1);
  const unauthorizedApproval = await api("/api/ai/actions/confirm", {
    method: "POST",
    token: ctx.studentToken,
    body: { logId: stagedResponse.data.logId, approved: true },
  });
  assert.equal(unauthorizedApproval.status, 403);

  const confirmRes = await api("/api/ai/actions/confirm", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      logId: stagedResponse.data.logId,
      approved: true,
      notes: "Approved by Super Admin after review.",
    },
  });

  assert.equal(confirmRes.status, 200, confirmRes.text);
  assert.equal(confirmRes.data.success, true);
  assert.equal(await Notification.countDocuments({ category: "academic" }), 1);
  const duplicateApproval = await api("/api/ai/actions/confirm", {
    method: "POST",
    token: ctx.adminToken,
    body: { logId: stagedResponse.data.logId, approved: true, notes: "Retry" },
  });
  assert.equal(duplicateApproval.status, 409);
});

test("Malformed proposals cannot execute; rejection and stale targets are audited", async () => {
  const { AIActivityLog } = await import("../src/models/AIActivityLog.js");
  const { Student } = await import("../src/models/Student.js");
  const { User } = await import("../src/models/User.js");
  const { logAIActivity } = await import("../src/services/ai/aiActivityService.js");
  const initiator = await User.findOne({ email: ctx.hodEmail });
  const student = await Student.findOne({ studentId: "BCA25011" }).lean();
  const makeAction = (attendancePercentage) => ({
    actionKey: "DISPATCH_ATTENDANCE_WARNING_NOTICES",
    label: "Issue an official attendance warning",
    payload: { studentIds: [student.studentId], threshold: 75 },
    targetModule: "Academic",
    targetRecord: student.studentId,
    operation: "SEND_ATTENDANCE_WARNING_NOTICES",
    currentValue: { attendancePercentage },
    proposedValue: "Issue an official attendance warning notification",
    reason: "Attendance is below the institutional threshold.",
    requiredPermission: "attendance.reviewCorrection",
    targetSnapshot: [{
      studentId: student.studentId,
      attendancePercentage,
      userId: String(student.user),
    }],
    riskLevel: "HIGH",
  });
  const createPending = async (proposedAction) => logAIActivity({
    user: initiator,
    role: "hod",
    module: "academic_ai",
    requestCategory: "ATTENDANCE_WARNING",
    recommendation: "Attendance warning requested.",
    proposedAction,
    humanConfirmation: { required: true, status: "PENDING" },
  });

  const malformed = await createPending({
    label: "Incomplete proposal with no key",
    payload: {},
  });
  assert.equal(malformed.humanConfirmation.required, false);
  const missingKeyApproval = await api("/api/ai/actions/confirm", {
    method: "POST",
    token: ctx.adminToken,
    body: { logId: String(malformed._id), approved: true },
  });
  assert.equal(missingKeyApproval.status, 409);

  const rejected = await createPending(makeAction(student.attendancePercentage));
  const rejectRes = await api("/api/ai/actions/confirm", {
    method: "POST",
    token: ctx.adminToken,
    body: { logId: String(rejected._id), approved: false, notes: "Not approved." },
  });
  assert.equal(rejectRes.status, 200, rejectRes.text);
  const rejectedApproval = await api("/api/ai/actions/confirm", {
    method: "POST",
    token: ctx.adminToken,
    body: { logId: String(rejected._id), approved: true, notes: "Retry" },
  });
  assert.equal(rejectedApproval.status, 409);
  const rejectedLog = await AIActivityLog.findById(rejected._id).lean();
  assert.equal(rejectedLog.humanConfirmation.status, "REJECTED");
  assert.ok(rejectedLog.approvalHistory.some((event) => event.event === "REJECTED"));

  const stale = await createPending(makeAction(student.attendancePercentage));
  await Student.updateOne({ _id: student._id }, { $set: { attendancePercentage: 55 } });
  const staleApproval = await api("/api/ai/actions/confirm", {
    method: "POST",
    token: ctx.adminToken,
    body: { logId: String(stale._id), approved: true, notes: "Approve after recheck." },
  });
  assert.equal(staleApproval.status, 409);
  const staleLog = await AIActivityLog.findById(stale._id).lean();
  assert.equal(staleLog.humanConfirmation.status, "FAILED");
  assert.ok(staleLog.approvalHistory.some((event) => event.event === "EXECUTION_FAILED"));
  const malformedLog = await AIActivityLog.findById(malformed._id).lean();
  assert.ok(malformedLog.approvalHistory.some((event) => event.event === "EXECUTION_BLOCKED"));
});

/* ------------------------------------------------------------------ */
/* Test 3: Deterministic Anomaly Detection Engine                     */
/* ------------------------------------------------------------------ */
test("Anomaly detection engine detects duplicate payment reference patterns", async () => {
  const { Payment } = await import("../src/models/Payment.js");
  const { Student } = await import("../src/models/Student.js");
  const { Invoice } = await import("../src/models/Invoice.js");
  const student = await Student.findOne();

  const invoice = await Invoice.create({
    invoiceNumber: `INV-TEST-DUP-${Date.now()}`,
    student: student._id,
    studentUser: student.user,
    title: "Semester Tuition Fee",
    totalAmount: 30000,
    dueDate: "2026-12-31",
  });

  // Create two payments sharing duplicate reference
  const duplicateRef = "ESWA-TEST-DUP-991";
  await Payment.create([
    {
      invoice: invoice._id,
      student: student._id,
      studentUser: student.user,
      amount: 15000,
      method: "esewa",
      transactionReference: duplicateRef,
      transactionId: duplicateRef,
      receiptNumber: `REC-001-${Date.now()}`,
    },
    {
      invoice: invoice._id,
      student: student._id,
      studentUser: student.user,
      amount: 15000,
      method: "esewa",
      transactionReference: duplicateRef,
      transactionId: duplicateRef,
      receiptNumber: `REC-002-${Date.now()}`,
    },
  ]);

  // Run anomaly scan
  const scanRes = await api("/api/ai/anomalies/scan", {
    method: "POST",
    token: ctx.adminToken,
  });
  assert.equal(scanRes.status, 200);

  // Fetch anomalies
  const alertsRes = await api("/api/ai/anomalies?module=finance", {
    token: ctx.adminToken,
  });
  assert.equal(alertsRes.status, 200);
  assert.ok(alertsRes.data.alerts.length >= 1);
  const dupAlert = alertsRes.data.alerts.find((a) => a.event === "DUPLICATE_PAYMENT_REFERENCE");
  assert.ok(dupAlert, "Should create duplicate payment anomaly alert");
  assert.equal(dupAlert.severity, "HIGH");

  // Acknowledge anomaly alert
  const ackRes = await api(`/api/ai/anomalies/${dupAlert._id}/status`, {
    method: "PATCH",
    token: ctx.adminToken,
    body: { status: "ACKNOWLEDGED", resolutionNotes: "Gateway log verification initiated." },
  });
  assert.equal(ackRes.status, 200);
  assert.equal(ackRes.data.status, "ACKNOWLEDGED");
});

/* ------------------------------------------------------------------ */
/* Test 4: Student Early-Warning Intelligence & Faculty Copilot       */
/* ------------------------------------------------------------------ */
test("Academic early warning identifies support priorities without automatic disciplinary action", async () => {
  const earlyWarningRes = await api("/api/ai/academic/early-warnings", {
    token: ctx.adminToken,
  });
  assert.equal(earlyWarningRes.status, 200);
  assert.ok(typeof earlyWarningRes.data.auditedCount === "number");
  assert.ok(Array.isArray(earlyWarningRes.data.warningList));

  // Test Faculty Copilot quiz question assistance
  const copilotRes = await api("/api/ai/academic/faculty-copilot", {
    method: "POST",
    token: ctx.facultyToken,
    body: {
      action: "GENERATE_QUIZ_QUESTIONS",
      courseId: ctx.courseId,
      contextPayload: { topic: "Binary Search Trees", count: 2 },
    },
  });
  assert.equal(copilotRes.status, 200);
  assert.ok(copilotRes.data.generatedQuestions.length >= 1);

  // Test Student Copilot (restricted to own records)
  const studentCopilotRes = await api("/api/ai/academic/student-copilot", {
    method: "POST",
    token: ctx.studentToken,
    body: { prompt: "Explain my current attendance standing." },
  });
  assert.equal(studentCopilotRes.status, 200);
  assert.ok(studentCopilotRes.data.summary);
});

/* ------------------------------------------------------------------ */
/* Test 5: Examination Analytics & Finance Analytics                  */
/* ------------------------------------------------------------------ */
test("Examination and Finance analytics report verified database calculations", async () => {
  const examAnalyticsRes = await api("/api/ai/examination/analytics", {
    token: ctx.examOfficerToken,
  });
  assert.equal(examAnalyticsRes.status, 200);
  assert.ok(typeof examAnalyticsRes.data.aggregateCandidates === "number");
  assert.ok(typeof examAnalyticsRes.data.overallPassRate === "number");

  const financeAnalyticsRes = await api("/api/ai/finance/analytics", {
    token: ctx.adminToken,
  });
  assert.equal(financeAnalyticsRes.status, 200);
  assert.ok(typeof financeAnalyticsRes.data.totalBilledNpr === "number");
  assert.ok(typeof financeAnalyticsRes.data.totalPaidNpr === "number");
  assert.ok(financeAnalyticsRes.data.paymentMethodBreakdown);
});

/* ------------------------------------------------------------------ */
/* Test 6: Admissions AI & Requests Case Intelligence                 */
/* ------------------------------------------------------------------ */
test("Admissions AI audits application completeness and Cases AI tracks SLAs", async () => {
  const admissionsRes = await api("/api/ai/admissions/audit", {
    token: ctx.adminToken,
  });
  assert.equal(admissionsRes.status, 200);
  assert.ok(Array.isArray(admissionsRes.data.applications));

  const casesRes = await api("/api/ai/cases/intelligence", {
    token: ctx.adminToken,
  });
  assert.equal(casesRes.status, 200);
  assert.ok(typeof casesRes.data.totalCasesAudited === "number");
  assert.ok(casesRes.data.departmentWorkload);
});

/* ------------------------------------------------------------------ */
/* Test 7: Cybersecurity Operations Center & Incident Simulation      */
/* ------------------------------------------------------------------ */
test("Cybersecurity operations timeline monitors events and handles simulated incidents", async () => {
  const dashRes = await api("/api/ai/security/dashboard", {
    token: ctx.adminToken,
  });
  assert.equal(dashRes.status, 200);
  assert.ok(dashRes.data.metrics);
  assert.ok(Array.isArray(dashRes.data.eventTimeline));

  // Trigger simulated credential stuffing incident
  const simRes = await api("/api/ai/security/simulate", {
    method: "POST",
    token: ctx.adminToken,
    body: { scenario: "CREDENTIAL_STUFFING" },
  });
  assert.equal(simRes.status, 200);
  assert.equal(simRes.data.success, true);
  assert.ok(simRes.data.alertId);

  // Investigate & contain incident
  const invRes = await api("/api/ai/security/investigate", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      alertId: simRes.data.alertId,
      action: "CONTAIN",
      investigationNotes: "Perimeter challenge applied to test IP.",
    },
  });
  assert.equal(invRes.status, 200);
  assert.equal(invRes.data.status, "INVESTIGATING");
});

/* ------------------------------------------------------------------ */
/* Test 8: System Health & Performance Instrumentation                */
/* ------------------------------------------------------------------ */
test("System Health intelligence reports live DB connectivity and ring buffer metrics", async () => {
  const healthRes = await api("/api/ai/system/health", {
    token: ctx.adminToken,
  });
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.data.database.status, "CONNECTED");
  assert.ok(healthRes.data.database.latencyMs >= 0);
  assert.ok(healthRes.data.apiHealth);
});

/* ------------------------------------------------------------------ */
/* Test 9: CollegeOS Knowledge Assistant (RAG) & Policy Citations     */
/* ------------------------------------------------------------------ */
test("Knowledge Assistant answers policy queries with document citations and honest fallback", async () => {
  // Query with matching policy
  const policyRes = await api("/api/ai/knowledge/query", {
    method: "POST",
    token: ctx.studentToken,
    body: { query: "What is the minimum attendance required for examination eligibility?" },
  });
  assert.equal(policyRes.status, 200);
  assert.equal(policyRes.data.found, true);
  assert.ok(policyRes.data.answer.includes("75%") || policyRes.data.citations.length > 0);
  assert.ok(policyRes.data.citations[0].documentTitle.includes("Examination"));

  // Query outside policy scope (honest fallback)
  const unknownRes = await api("/api/ai/knowledge/query", {
    method: "POST",
    token: ctx.studentToken,
    body: { query: "What is the quantum teleportation frequency for dorms?" },
  });
  assert.equal(unknownRes.status, 200);
  assert.equal(unknownRes.data.found, false);
});

/* ------------------------------------------------------------------ */
/* Test 10: Document Intelligence (Transcript Extraction)             */
/* ------------------------------------------------------------------ */
test("Document Intelligence extracts structured transcript fields with source references", async () => {
  const sampleTranscript = `
    KATHMANDU UNIVERSITY AFFILIATED COLLEGE
    OFFICIAL ACADEMIC TRANSCRIPT
    Student ID: BCA25011
    Program: Bachelor of Computer Applications (BCA)
    Semester: 1
    CS101 Programming Principles 3 A 3.6
    CS102 Discrete Mathematics 3 B+ 3.2
    CS103 Digital Logic 3 A 3.6
    Summary CGPA: 3.47
  `;

  const extractRes = await api("/api/ai/documents/extract-transcript", {
    method: "POST",
    token: ctx.adminToken,
    body: { rawText: sampleTranscript, fileName: "test_transcript.txt" },
  });

  assert.equal(extractRes.status, 200);
  assert.equal(extractRes.data.extractedData.studentId, "BCA25011");
  assert.equal(extractRes.data.extractedData.program, "Bachelor of Computer Applications (BCA)");
  assert.equal(extractRes.data.proposedAction.riskLevel, "HIGH");
});

/* ------------------------------------------------------------------ */
/* Test 11: AI Report Generator & What-If Scenario Simulator          */
/* ------------------------------------------------------------------ */
test("Report Generator exports CSV data and Scenario Simulator models attendance thresholds", async () => {
  const reportRes = await api("/api/ai/reports/generate", {
    method: "POST",
    token: ctx.adminToken,
    body: { reportPrompt: "Generate the Semester academic performance report" },
  });
  assert.equal(reportRes.status, 200);
  assert.ok(reportRes.data.calculatedFacts);
  assert.ok(reportRes.data.csvExportString.includes("StudentID,FullName"));

  const simRes = await api("/api/ai/simulator/simulate", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      scenarioType: "ATTENDANCE_THRESHOLD",
      parameters: { baselineThreshold: 75, proposedThreshold: 85 },
    },
  });
  assert.equal(simRes.status, 200);
  assert.equal(simRes.data.simulationResult.isSimulation, true);
  assert.ok(simRes.data.simulationResult.projectedImpact);
});

/* ------------------------------------------------------------------ */
/* Test 12: Process Mining & Cross-Module Multi-Agent Orchestration   */
/* ------------------------------------------------------------------ */
test("Process Mining computes stage cycle times and Orchestrator verifies graduation checklist", async () => {
  const miningRes = await api("/api/ai/process-mining", {
    token: ctx.adminToken,
  });
  assert.equal(miningRes.status, 200);
  assert.ok(Array.isArray(miningRes.data.processStages));
  assert.ok(miningRes.data.primaryBottleneckStage);

  const { Student } = await import("../src/models/Student.js");
  const student = await Student.findOne();

  const orchRes = await api("/api/ai/orchestration/graduation-readiness", {
    method: "POST",
    token: ctx.adminToken,
    body: { studentId: student.studentId },
  });
  assert.equal(orchRes.status, 200);
  assert.ok(Array.isArray(orchRes.data.checklist));
  assert.ok(orchRes.data.contributingAgents.includes("Academic_Clearance_Agent"));
  assert.ok(orchRes.data.contributingAgents.includes("Finance_Clearance_Agent"));
});

/* ------------------------------------------------------------------ */
/* Test 13: IT Asset Management & AI Helpdesk Ticketing               */
/* ------------------------------------------------------------------ */
test("IT Asset Management maintains hardware inventory and AI triages support tickets", async () => {
  const assetRes = await api("/api/ai/it-service/summary", {
    token: ctx.adminToken,
  });
  assert.equal(assetRes.status, 200);
  assert.ok(assetRes.data.totalAssetsCount >= 3, "Seeds default enterprise assets");
  assert.ok(assetRes.data.totalSoftwareLicenses >= 2, "Seeds software license seats");

  const ticketRes = await api("/api/ai/it-service/tickets", {
    method: "POST",
    token: ctx.adminToken,
    body: {
      title: "Lab 3 Gateway Network Connection Dropping",
      description: "Workstations in Lab 3 lose wifi and ethernet gateway connection intermittently.",
    },
  });
  assert.equal(ticketRes.status, 200);
  assert.equal(ticketRes.data.category, "NETWORK_CONNECTIVITY");
  assert.ok(ticketRes.data.aiAnalysis.suggestedTroubleshooting.length > 0);
});

/* ------------------------------------------------------------------ */
/* Test 14: Digital Credentials & Smart QR Attendance Verification    */
/* ------------------------------------------------------------------ */
test("Digital Credentials use HMAC signatures and Smart Attendance prevents duplicate check-ins", async () => {
  const { Student } = await import("../src/models/Student.js");
  const student = await Student.findOne();

  // Issue digital credential
  const credRes = await api("/api/ai/credentials/issue", {
    method: "POST",
    token: ctx.adminToken,
    body: { studentId: student.studentId, credentialType: "STUDENT_ID_CARD" },
  });
  assert.equal(credRes.status, 200);
  assert.ok(credRes.data.signatureDigest);
  const certNumber = credRes.data.credentialNumber;

  // Verify digital credential
  const verifyRes = await api(`/api/ai/credentials/verify/${certNumber}`);
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.data.isValid, true);
  assert.equal(verifyRes.data.status, "VERIFIED_AUTHENTIC");

  // Create QR attendance session
  const qrSessionRes = await api("/api/ai/attendance/qr-session", {
    method: "POST",
    token: ctx.facultyToken,
    body: {
      courseId: ctx.courseId,
      sectionCode: "A1",
      durationMinutes: 30,
      topic: "Graph Traversal Algorithms",
    },
  });
  assert.equal(qrSessionRes.status, 200);
  assert.equal(qrSessionRes.data.status, "ACTIVE");
  const sessionCode = qrSessionRes.data.sessionCode;

  // Student check-in
  const checkInRes = await api("/api/ai/attendance/qr-checkin", {
    method: "POST",
    token: ctx.studentToken,
    body: { sessionCode },
  });
  assert.equal(checkInRes.status, 200);
  assert.equal(checkInRes.data.success, true);

  // Duplicate check-in must be rejected
  const dupCheckInRes = await api("/api/ai/attendance/qr-checkin", {
    method: "POST",
    token: ctx.studentToken,
    body: { sessionCode },
  });
  assert.equal(dupCheckInRes.status, 409);
  assert.ok(dupCheckInRes.text.includes("already checked in"));
});
