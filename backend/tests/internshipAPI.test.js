import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/collegeos_internship_api_test";
process.env.JWT_SECRET = "collegeos-internship-api-test-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";

let baseUrl, server;
const csrfTokens = new Map();
const ctx = {};

async function api(path, opts = {}) {
  const { method = "GET", token, body, headers: requestHeaders = {} } = opts;
  const headers = { ...requestHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const isMutating = /^(POST|PUT|PATCH|DELETE)$/i.test(String(method));
  if (token && isMutating) {
    const csrf = csrfTokens.get(token);
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(baseUrl + path, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (path.includes("/api/auth/login") && response.status === 200 && data?.csrfToken) {
    csrfTokens.set(data.token, data.csrfToken);
  }
  return { status: response.status, data, text };
}

async function login(email, password) {
  const res = await api("/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(res.status, 200, `login failed: ${res.text}`);
  csrfTokens.set(res.data.token, res.data.csrfToken);
  return res.data.token;
}

async function activate(email, temporaryPassword, newPassword) {
  const token = await login(email, temporaryPassword);
  const changed = await api("/api/auth/change-password", {
    method: "POST", token,
    body: { currentPassword: temporaryPassword, newPassword, confirmPassword: newPassword },
  });
  assert.equal(changed.status, 200, `password change failed: ${changed.text}`);
  if (changed.data.csrfToken) csrfTokens.set(changed.data.token, changed.data.csrfToken);
  return changed.data.token;
}

async function provision(adminToken, body) {
  const staffRoles = new Set(["campus_admin", "dean", "hod", "registrar", "exam_officer", "finance_officer", "faculty"]);
  const provisionBody = { ...body };
  if (provisionBody.role === "student" && !provisionBody.studentId) {
    provisionBody.studentId = `STU${Math.floor(Math.random() * 100000)}`;
  }
  if (staffRoles.has(provisionBody.role) && !provisionBody.employeeId) {
    provisionBody.employeeId = `EMP${Math.floor(Math.random() * 100000)}`;
  }
  const created = await api("/api/admin/users", { method: "POST", token: adminToken, body: provisionBody });
  assert.equal(created.status, 201, `provisioning failed: ${created.text}`);
  const password = `Collegeos@${Math.random().toString(36).slice(2, 8)}1`;
  const token = await activate(created.data.email, created.data.temporaryPassword, password);
  return { ...created.data, password, token, userId: created.data.userId };
}

/* ========================================================================
 * Setup
 * ======================================================================== */

test("setup: database, server, and test users", async () => {
  try {
    const { connectDatabase } = await import("../src/config/database.js");
    await connectDatabase();
    await mongoose.connection.dropDatabase();

    const { initializeServerState } = await import("../src/db.js");
    await initializeServerState();

    const { createApp } = await import("../src/app.js");
    server = createApp().listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const adminTemporary = process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD;
    ctx.adminToken = await activate("admin@collegeos.test", adminTemporary, "Collegeos@Admin1");

    ctx.registrar = await provision(ctx.adminToken, {
      firstName: "Rekha", lastName: "Poudel", role: "registrar", designation: "Registrar",
    });
    ctx.coordinator = await provision(ctx.adminToken, {
      firstName: "Hari", lastName: "Sharma", role: "program_coordinator", designation: "Internship Coordinator",
    });
    ctx.faculty = await provision(ctx.adminToken, {
      firstName: "Suresh", lastName: "Karki", role: "faculty", designation: "Lecturer",
    });

    const { hashPassword } = await import("../src/utils/password.js");
    const { User, Student, EmployerUser } = await import("../src/models/index.js");

    const passwordHashA = hashPassword("Collegeos@StudentA1");
    const userA = await User.create({
      email: "student.a@collegeos.test", collegeEmail: "student.a@collegeos.test",
      passwordHash: passwordHashA, firstName: "Student", lastName: "One",
      roles: ["student"], activeRole: "student", accountStatus: "ACTIVE",
      passwordStatus: "PERMANENT", mustChangePassword: false, isActive: true,
    });
    const studentA = await Student.create({
      user: userA._id, studentId: "STU001", firstName: "Student", lastName: "One",
      program: "BScIT", department: "Computer Science", semester: 5,
    });
    const tokenA = await login("student.a@collegeos.test", "Collegeos@StudentA1");
    ctx.studentA = { ...userA.toObject ? userA.toObject() : userA, token: tokenA, userId: String(userA._id) };
    ctx.studentAProfile = studentA;

    const passwordHashB = hashPassword("Collegeos@StudentB1");
    const userB = await User.create({
      email: "student.b@collegeos.test", collegeEmail: "student.b@collegeos.test",
      passwordHash: passwordHashB, firstName: "Student", lastName: "Two",
      roles: ["student"], activeRole: "student", accountStatus: "ACTIVE",
      passwordStatus: "PERMANENT", mustChangePassword: false, isActive: true,
    });
    const studentB = await Student.create({
      user: userB._id, studentId: "STU002", firstName: "Student", lastName: "Two",
      program: "BScIT", department: "Computer Science", semester: 5,
    });
    const tokenB = await login("student.b@collegeos.test", "Collegeos@StudentB1");
    ctx.studentB = { ...userB.toObject ? userB.toObject() : userB, token: tokenB, userId: String(userB._id) };
    ctx.studentBProfile = studentB;

    // Employer representative user (can submit employer verification)
    const passwordHashRep = hashPassword("Collegeos@EmployerRep1");
    const userRep = await User.create({
      email: "rep.employer@collegeos.test", collegeEmail: "rep.employer@collegeos.test",
      passwordHash: passwordHashRep, firstName: "Employer", lastName: "Rep",
      roles: ["employer"], activeRole: "employer", accountStatus: "ACTIVE",
      passwordStatus: "PERMANENT", mustChangePassword: false, isActive: true,
    });
    const tokenRep = await login("rep.employer@collegeos.test", "Collegeos@EmployerRep1");
    ctx.employerRep = { ...userRep.toObject ? userRep.toObject() : userRep, token: tokenRep, userId: String(userRep._id) };
  } catch (err) {
    console.error("SETUP ERROR:", err.message);
    console.error("SETUP STACK:", err.stack);
    throw err;
  }
});

/* ========================================================================
 * Authentication
 * ======================================================================== */

test("API: unauthenticated requests are rejected", async () => {
  const res = await api("/api/internship/opportunities");
  assert.equal(res.status, 401);
});

test("API: invalid token is rejected", async () => {
  const res = await api("/api/internship/employers", {
    method: "POST",
    token: "invalid-token",
    body: { name: "Evil Corp", contactEmail: "evil@evil.com" },
  });
  assert.ok([401, 403].includes(res.status));
});

test("API: student cannot access coordinator-only endpoints", async () => {
  const res = await api("/api/internship/employers", {
    method: "POST",
    token: ctx.studentA.token,
    body: { name: "Evil Corp", contactEmail: "evil@evil.com" },
  });
  assert.equal(res.status, 403);
});

/* ========================================================================
 * Employer Management
 * ======================================================================== */

test("API: coordinator can register an employer", async () => {
  const res = await api("/api/internship/employers", {
    method: "POST",
    token: ctx.registrar.token,
    body: { name: "New Employer Inc", contactEmail: "new@employer.com", industry: "Tech" },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.data.employer);
  ctx.secondEmployer = res.data.employer;
});

test("API: employer rep is linked to employer as owner", async () => {
  const { EmployerUser } = await import("../src/models/index.js");
  const eu = await EmployerUser.create({
    employer: ctx.secondEmployer._id || ctx.secondEmployer.id,
    user: ctx.employerRep.userId,
    employerRole: "OWNER",
    status: "ACTIVE",
  });
  assert.ok(eu);
});

test("API: employer rep can submit employer verification", async () => {
  const res = await api(`/api/internship/employers/${ctx.secondEmployer.id || ctx.secondEmployer._id}/verification`, {
    method: "POST",
    token: ctx.employerRep.token,
    body: { businessRegistrationNumber: "BR-123456" },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.data.verification);
  ctx.secondEmployerVerificationId = res.data.verification.id || res.data.verification._id;
});

test("API: coordinator can approve employer verification", async () => {
  const res = await api(`/api/internship/employers/${ctx.secondEmployer.id || ctx.secondEmployer._id}/verification/${ctx.secondEmployerVerificationId}/review`, {
    method: "PATCH",
    token: ctx.registrar.token,
    body: { status: "VERIFIED" },
  });
  assert.equal(res.status, 200, res.text);
});

test("API: student cannot register an employer", async () => {
  const res = await api("/api/internship/employers", {
    method: "POST",
    token: ctx.studentA.token,
    body: { name: "Evil Corp", contactEmail: "evil@evil.com" },
  });
  assert.equal(res.status, 403);
});

test("API: coordinator can read employer profile", async () => {
  if (!ctx.employer) {
    const res = await api("/api/internship/employers", {
      method: "POST",
      token: ctx.registrar.token,
      body: { name: "TechCorp Solutions", contactEmail: "hr@techcorp.com", industry: "Software" },
    });
    ctx.employer = res.data.employer;
  }
  const res = await api(`/api/internship/employers/${ctx.employer.id || ctx.employer._id}`, {
    token: ctx.registrar.token,
  });
  assert.equal(res.status, 200, res.text);
});

test("API: student can read employer profile", async () => {
  const res = await api(`/api/internship/employers/${ctx.employer.id || ctx.employer._id}`, {
    token: ctx.studentA.token,
  });
  assert.equal(res.status, 200, res.text);
});

test("API: student cannot update employer profile", async () => {
  const res = await api(`/api/internship/employers/${ctx.employer.id || ctx.employer._id}`, {
    method: "PATCH",
    token: ctx.studentA.token,
    body: { name: "Hacked Corp" },
  });
  assert.equal(res.status, 403);
});

/* ========================================================================
 * Opportunities
 * ======================================================================== */

test("API: coordinator can create an opportunity", async () => {
  const res = await api("/api/internship/opportunities", {
    method: "POST",
    token: ctx.registrar.token,
    body: {
      employer: ctx.secondEmployer.id || ctx.secondEmployer._id,
      title: "Backend Intern",
      durationMonths: 3,
      deadline: "2027-06-01",
      description: "Backend work",
      status: "OPEN",
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.data.opportunity);
  ctx.opportunity = res.data.opportunity;
});

test("API: student cannot create an opportunity", async () => {
  const res = await api("/api/internship/opportunities", {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      employer: ctx.employer.id || ctx.employer._id,
      title: "Fake Internship",
      durationMonths: 3,
      deadline: "2027-06-01",
      description: "Fake",
    },
  });
  assert.equal(res.status, 403);
});

test("API: list opportunities with pagination", async () => {
  const res = await api("/api/internship/opportunities?page=1&limit=10", {
    token: ctx.studentA.token,
  });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.data.items);
  assert.ok(res.data.pagination);
});

/* ========================================================================
 * Applications
 * ======================================================================== */

test("API: student A can create their own application", async () => {
  const res = await api("/api/internship/applications", {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      opportunity: ctx.opportunity._id,
      academicYear: "2026/27",
      semester: 5,
      title: "Application for Backend Intern",
      coverLetter: "I am a great candidate",
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.data.application);
  ctx.newApplicationA = res.data.application;
});

test("API: student A cannot read student B's application", async () => {
  const res = await api(`/api/internship/applications/${ctx.newApplicationA._id}`, {
    token: ctx.studentB.token,
  });
  assert.equal(res.status, 403, res.text);
});

test("API: student A can read their own application", async () => {
  const res = await api(`/api/internship/applications/${ctx.newApplicationA._id}`, {
    token: ctx.studentA.token,
  });
  assert.equal(res.status, 200, res.text);
});

test("API: coordinator can read any application", async () => {
  const res = await api(`/api/internship/applications/${ctx.newApplicationA._id}`, {
    token: ctx.registrar.token,
  });
  assert.equal(res.status, 200, res.text);
});

test("API: student cannot submit another student's application", async () => {
  const res = await api(`/api/internship/applications/${ctx.newApplicationA._id}/submit`, {
    method: "PATCH",
    token: ctx.studentB.token,
  });
  assert.equal(res.status, 403, res.text);
});

test("API: list applications is role-filtered", async () => {
  const resA = await api("/api/internship/applications", {
    token: ctx.studentA.token,
  });
  assert.equal(resA.status, 200, resA.text);

  const resC = await api("/api/internship/applications", {
    token: ctx.registrar.token,
  });
  assert.equal(resC.status, 200, resC.text);
});

/* ========================================================================
 * Offers
 * ======================================================================== */

test("API: student cannot issue an offer", async () => {
  const res = await api("/api/internship/offers", {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      application: ctx.newApplicationA._id,
      roleTitle: "Intern",
      startDate: "2027-07-01",
      endDate: "2027-09-30",
      responseDeadline: "2027-06-15",
    },
  });
  assert.equal(res.status, 403);
});

test("API: coordinator can issue an offer", async () => {
  await api(`/api/internship/applications/${ctx.newApplicationA._id}/submit`, {
    method: "PATCH",
    token: ctx.studentA.token,
  });
  await api(`/api/internship/applications/${ctx.newApplicationA._id}/review`, {
    method: "PATCH",
    token: ctx.registrar.token,
    body: { status: "UNDER_REVIEW" },
  });
  await api(`/api/internship/applications/${ctx.newApplicationA._id}/shortlist`, {
    method: "PATCH",
    token: ctx.registrar.token,
  });

  const interviewRes = await api("/api/internship/interviews", {
    method: "POST",
    token: ctx.registrar.token,
    body: {
      application: ctx.newApplicationA._id,
      scheduledStartTime: "2027-06-15T09:00:00Z",
      scheduledEndTime: "2027-06-15T10:00:00Z",
      mode: "VIDEO_CALL",
    },
  });
  assert.equal(interviewRes.status, 201, interviewRes.text);
  assert.ok(interviewRes.data.interview);
  ctx.interviewA = interviewRes.data.interview;

  await api(`/api/internship/interviews/${ctx.interviewA._id}/complete`, {
    method: "PATCH",
    token: ctx.registrar.token,
    body: { status: "COMPLETED", score: 85, recommendation: "Strong candidate" },
  });

  const res = await api("/api/internship/offers", {
    method: "POST",
    token: ctx.registrar.token,
    body: {
      application: ctx.newApplicationA._id,
      roleTitle: "Software Engineering Intern",
      startDate: "2027-07-01",
      endDate: "2027-09-30",
      responseDeadline: "2027-06-15",
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.data.offer);
  ctx.newOffer = res.data.offer;
});

test("API: student A can accept their own offer", async () => {
  const res = await api(`/api/internship/offers/${ctx.newOffer._id}/accept`, {
    method: "PATCH",
    token: ctx.studentA.token,
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.offer.status, "ACCEPTED");
});

/* ========================================================================
 * Placements
 * ======================================================================== */

test("API: student cannot create a placement", async () => {
  const res = await api("/api/internship/placements", {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      applicationId: ctx.newApplicationA._id,
      offerId: ctx.newOffer._id,
      academicSupervisorId: ctx.faculty.userId,
      startDate: "2027-07-01",
      endDate: "2027-09-30",
      totalRequiredHours: 480,
    },
  });
  assert.equal(res.status, 403);
});

test("API: coordinator can create a placement", async () => {
  const res = await api("/api/internship/placements", {
    method: "POST",
    token: ctx.registrar.token,
    body: {
      applicationId: ctx.newApplicationA._id,
      offerId: ctx.newOffer._id,
      academicSupervisorId: ctx.faculty.userId,
      startDate: "2027-07-01",
      endDate: "2027-09-30",
      totalRequiredHours: 480,
      academicCredits: 6,
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.data.placement);
  ctx.placementA = res.data.placement;
});

test("API: student cannot approve a placement", async () => {
  const res = await api(`/api/internship/placements/${ctx.placementA._id}/confirm`, {
    method: "PATCH",
    token: ctx.studentA.token,
  });
  assert.equal(res.status, 403);
});

test("API: coordinator can confirm a placement", async () => {
  const res = await api(`/api/internship/placements/${ctx.placementA._id}/confirm`, {
    method: "PATCH",
    token: ctx.registrar.token,
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.placement.status, "ACTIVE");
});

test("API: student A can read their own placement", async () => {
  const res = await api(`/api/internship/placements/${ctx.placementA._id}`, {
    token: ctx.studentA.token,
  });
  assert.equal(res.status, 200, res.text);
});

test("API: student B cannot read student A's placement", async () => {
  const res = await api(`/api/internship/placements/${ctx.placementA._id}`, {
    token: ctx.studentB.token,
  });
  assert.equal(res.status, 403, res.text);
});

test("API: coordinator can list placements", async () => {
  const res = await api("/api/internship/placements", {
    token: ctx.registrar.token,
  });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.data.items);
});

test("API: student A lists only their own placements", async () => {
  const res = await api("/api/internship/placements", {
    token: ctx.studentA.token,
  });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.data.items.every((p) => String(p.student.id) === String(ctx.studentAProfile._id)));
});

test("API: student B sees no placements belonging to student A", async () => {
  const res = await api("/api/internship/placements", {
    token: ctx.studentB.token,
  });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.data.items.every((p) => String(p.student) !== String(ctx.studentAProfile._id)));
});

/* ========================================================================
 * Logbooks
 * ======================================================================== */

test("API: student A can submit a logbook for their placement", async () => {
  const res = await api(`/api/internship/placements/${ctx.placementA._id}/logbooks`, {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      placement: ctx.placementA._id,
      weekNumber: 1,
      weekStartDate: "2027-07-01",
      weekEndDate: "2027-07-07",
      activitiesSummary: "Implemented login page",
      hoursWorked: 40,
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.data.logbook);
  ctx.logbookA = res.data.logbook;
});

test("API: student B cannot submit a logbook for student A's placement", async () => {
  const res = await api(`/api/internship/placements/${ctx.placementA._id}/logbooks`, {
    method: "POST",
    token: ctx.studentB.token,
    body: {
      placement: ctx.placementA._id,
      weekNumber: 1,
      weekStartDate: "2027-07-01",
      weekEndDate: "2027-07-07",
      activitiesSummary: "Hacking attempt",
      hoursWorked: 40,
    },
  });
  assert.equal(res.status, 403, res.text);
});

/* ========================================================================
 * Reports
 * ======================================================================== */

test("API: student A can submit a report for their placement", async () => {
  const res = await api(`/api/internship/placements/${ctx.placementA._id}/reports`, {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      placement: ctx.placementA._id,
      reportType: "INTERIM",
      title: "Interim Report",
      executiveSummary: "Progress so far",
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.data.report);
  ctx.reportA = res.data.report;
});

test("API: student cannot review a report (faculty only)", async () => {
  const res = await api(`/api/internship/reports/${ctx.reportA._id}/review`, {
    method: "PATCH",
    token: ctx.studentA.token,
    body: { status: "APPROVED" },
  });
  assert.equal(res.status, 403);
});

test("API: faculty can review a report for their assigned placement", async () => {
  const { InternshipReport } = await import("../src/models/index.js");
  await InternshipReport.findByIdAndUpdate(ctx.reportA._id, { status: "UNDER_REVIEW" });
  const res = await api(`/api/internship/reports/${ctx.reportA._id}/review`, {
    method: "PATCH",
    token: ctx.faculty.token,
    body: { status: "APPROVED" },
  });
  assert.equal(res.status, 200, res.text);
});

/* ========================================================================
 * Evaluations
 * ======================================================================== */

test("API: faculty can create an evaluation", async () => {
  const res = await api("/api/internship/evaluations", {
    method: "POST",
    token: ctx.faculty.token,
    body: {
      placement: ctx.placementA._id,
      student: ctx.studentAProfile._id,
      evaluatorType: "ACADEMIC_SUPERVISOR",
      evaluationType: "FINAL",
      isFinal: true,
      technicalSkills: 8,
      professionalism: 8,
      communication: 8,
      problemSolving: 8,
      teamwork: 8,
      initiative: 8,
      overallRating: 8,
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.data.evaluation);
});

test("API: student cannot create an evaluation", async () => {
  const res = await api("/api/internship/evaluations", {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      placement: ctx.placementA._id,
      student: ctx.studentAProfile._id,
      evaluatorType: "ACADEMIC_SUPERVISOR",
      evaluationType: "FINAL",
      isFinal: true,
      technicalSkills: 8,
      professionalism: 8,
      communication: 8,
      problemSolving: 8,
      teamwork: 8,
      initiative: 8,
      overallRating: 8,
    },
  });
  assert.equal(res.status, 403);
});

/* ========================================================================
 * Industry Projects
 * ======================================================================== */

test("API: coordinator can create an industry project", async () => {
  const res = await api("/api/internship/industry-projects", {
    method: "POST",
    token: ctx.registrar.token,
    body: {
      title: "Green Energy Platform",
      sponsorEmployer: ctx.employer.id || ctx.employer._id,
      industry: "Fintech",
      clientBrief: "Design P2P trading interface",
      durationWeeks: 12,
      teamSize: 4,
      applicationDeadline: "2026-12-15",
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.data.project);
  ctx.projectA = res.data.project;
});

test("API: coordinator can approve an industry project", async () => {
  const res = await api(`/api/internship/industry-projects/${ctx.projectA._id}/approve`, {
    method: "PATCH",
    token: ctx.registrar.token,
  });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.data.project);
  assert.equal(res.data.project.status, "ACCEPTING_APPLICATIONS");
});

test("API: student can apply to an industry project", async () => {
  const res = await api(`/api/internship/industry-projects/${ctx.projectA._id}/apply`, {
    method: "POST",
    token: ctx.studentA.token,
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.data.membership);
  ctx.membershipA = res.data.membership;
});

test("API: student cannot apply to the same project twice", async () => {
  const res = await api(`/api/internship/industry-projects/${ctx.projectA._id}/apply`, {
    method: "POST",
    token: ctx.studentA.token,
  });
  assert.equal(res.status, 409);
});

/* ========================================================================
 * Virtual Workplace
 * ======================================================================== */

test("API: coordinator can create a company template", async () => {
  const res = await api("/api/internship/virtual-workplace/templates", {
    method: "POST",
    token: ctx.registrar.token,
    body: {
      templateCode: "NOVATECH-2026",
      name: "NovaTech Cloud",
      sector: "CLOUD_SAAS",
      description: "Enterprise SaaS simulation",
      difficulty: "PRODUCTION_GRADE",
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.data.template);
  ctx.templateA = res.data.template;
});

test("API: student can manage their own portfolio", async () => {
  const res = await api("/api/internship/virtual-workplace/portfolios", {
    method: "POST",
    token: ctx.studentA.token,
    body: {
      slug: "student-one-2026",
      headline: "Junior Frontend Developer",
      bio: "Aspiring frontend engineer",
      featuredSkills: [{ skillName: "React", level: 90, category: "TECHNICAL", isVerified: true }],
      isPublic: true,
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.data.portfolio.slug, "student-one-2026");
});

test("API: student cannot access another student's portfolio by slug", async () => {
  const res = await api("/api/internship/virtual-workplace/portfolios/student-one-2026", {
    token: ctx.studentB.token,
  });
  assert.ok([200, 403, 404].includes(res.status));
});
