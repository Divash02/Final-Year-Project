import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

let Models, Workflow, EmployerSvc, InternshipSvc, PlacementSvc, ActivitySvc, EvalSvc, ProjectSvc, VWSvc;
let adminUser, studentUser, facultyUser, coordinatorUser;
let adminId, studentId, facultyId, coordinatorId;
let studentProfile, employerDoc;

async function seedUsers() {
  const { User, Student, Employer, VirtualCompanyTemplate, VirtualSimulation, Competency, ProfessionalPortfolio } = Models;
  await User.deleteMany({});
  await Student.deleteMany({});
  await Employer.deleteMany({});
  await VirtualCompanyTemplate.deleteMany({});
  await VirtualSimulation.deleteMany({});
  await Competency.deleteMany({});
  await ProfessionalPortfolio.deleteMany({});

  adminUser = await User.create({
    email: "admin@collegeos.test",
    passwordHash: "hash",
    roles: ["super_admin"],
    accountStatus: "ACTIVE",
    firstName: "Admin",
    lastName: "User",
  });
  adminId = adminUser._id;

  facultyUser = await User.create({
    email: "faculty@collegeos.test",
    passwordHash: "hash",
    roles: ["faculty"],
    accountStatus: "ACTIVE",
    firstName: "Faculty",
    lastName: "Member",
  });
  facultyId = facultyUser._id;

  coordinatorUser = await User.create({
    email: "coordinator@collegeos.test",
    passwordHash: "hash",
    roles: ["program_coordinator"],
    accountStatus: "ACTIVE",
    firstName: "Program",
    lastName: "Coordinator",
  });
  coordinatorId = coordinatorUser._id;

  studentUser = await User.create({
    email: "student@collegeos.test",
    passwordHash: "hash",
    roles: ["student"],
    accountStatus: "ACTIVE",
    firstName: "Student",
    lastName: "One",
  });
  studentId = studentUser._id;

  studentProfile = await Student.create({
    user: studentUser._id,
    studentId: "STU-2026-001",
    firstName: "Student",
    lastName: "One",
    program: "Computer Science",
    department: "Engineering",
    semester: 5,
  });

  employerDoc = await Employer.create({
    name: "TechCorp Solutions",
    industry: "Software",
    contactEmail: "hr@techcorp.com",
    isVerified: true,
    verificationStatus: "VERIFIED",
    isActive: true,
  });
}

before(async () => {
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/collegeos_test";
  process.env.JWT_SECRET = "test-secret-key-for-internship-phase-3";
  process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";
  process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";

  Models = (await import("../src/models/index.js"));
  Workflow = (await import("../src/services/internship/workflowService.js"));
  EmployerSvc = (await import("../src/services/internship/employerService.js"));
  InternshipSvc = (await import("../src/services/internship/internshipService.js"));
  PlacementSvc = (await import("../src/services/internship/placementService.js"));
  ActivitySvc = (await import("../src/services/internship/activityService.js"));
  EvalSvc = (await import("../src/services/internship/evaluationService.js"));
  ProjectSvc = (await import("../src/services/internship/industryProjectService.js"));
  VWSvc = (await import("../src/services/internship/virtualWorkplaceService.js"));

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
});

after(async () => {
  await mongoose.disconnect();
});

test("Workflow: application state transitions", async () => {
  await seedUsers();

  const r1 = Workflow.ApplicationWorkflow.submit({
    userId: adminId,
    resource: "InternshipApplication",
    resourceId: "test1",
  });
  assert.equal(r1.valid, true);

  const r2 = Workflow.ApplicationWorkflow.startReview({
    userId: adminId,
    resource: "InternshipApplication",
    resourceId: "test1",
  });
  assert.equal(r2.valid, true);

  const r3 = Workflow.ApplicationWorkflow.shortlist({
    userId: adminId,
    resource: "InternshipApplication",
    resourceId: "test1",
  });
  assert.equal(r3.valid, true);

  const r4 = Workflow.ApplicationWorkflow.scheduleInterview({
    userId: adminId,
    resource: "InternshipApplication",
    resourceId: "test1",
  });
  assert.equal(r4.valid, true);

  const r5 = Workflow.ApplicationWorkflow.extendOffer({
    userId: adminId,
    resource: "InternshipApplication",
    resourceId: "test1",
  });
  assert.equal(r5.valid, true);

  const r6 = Workflow.ApplicationWorkflow.acceptOffer({
    userId: adminId,
    resource: "InternshipApplication",
    resourceId: "test1",
  });
  assert.equal(r6.valid, true);

  const allowed = Workflow.allowedNextStatuses("application", "DRAFT");
  assert.ok(allowed.includes("SUBMITTED"));

  assert.throws(
    () =>
      Workflow.validateTransition(
        "application",
        "OFFER_DECLINED",
        "SUBMITTED",
        { userId: adminId }
      ),
    (err) => err.status === 400 && err.details.code === "INVALID_WORKFLOW_TRANSITION"
  );
});

test("Workflow: placement state transitions", async () => {
  const r1 = Workflow.PlacementWorkflow.confirm({
    userId: adminId,
    resource: "InternshipPlacement",
    resourceId: "test1",
  });
  assert.equal(r1.valid, true);

  const r2 = Workflow.PlacementWorkflow.grantLeave({
    userId: adminId,
    resource: "InternshipPlacement",
    resourceId: "test1",
  });
  assert.equal(r2.valid, true);

  const r3 = Workflow.PlacementWorkflow.returnFromLeave({
    userId: adminId,
    resource: "InternshipPlacement",
    resourceId: "test1",
  });
  assert.equal(r3.valid, true);

  const r4 = Workflow.PlacementWorkflow.complete({
    userId: adminId,
    resource: "InternshipPlacement",
    resourceId: "test1",
  });
  assert.equal(r4.valid, true);
});

test("Workflow: submission state transitions", async () => {
  const r1 = Workflow.SubmissionWorkflow.submit({
    userId: adminId,
    resource: "IndustryProjectSubmission",
    resourceId: "test1",
  });
  assert.equal(r1.valid, true);

  const r2 = Workflow.SubmissionWorkflow.startReview({
    userId: adminId,
    resource: "IndustryProjectSubmission",
    resourceId: "test1",
  });
  assert.equal(r2.valid, true);

  const r3 = Workflow.SubmissionWorkflow.requestRevision({
    userId: adminId,
    resource: "IndustryProjectSubmission",
    resourceId: "test1",
  });
  assert.equal(r3.valid, true);

  const r4 = Workflow.SubmissionWorkflow.resubmit({
    userId: adminId,
    resource: "IndustryProjectSubmission",
    resourceId: "test1",
  });
  assert.equal(r4.valid, true);

  const r5 = Workflow.SubmissionWorkflow.approve({
    userId: adminId,
    resource: "IndustryProjectSubmission",
    resourceId: "test1",
  });
  assert.equal(r5.valid, true);
});

test("Employer: registration and duplicate detection", async () => {
  await seedUsers();

  const employer = await EmployerSvc.registerEmployer(
    {
      name: "New Employer Inc",
      contactEmail: "new@employer.com",
      industry: "Tech",
      size: "SME",
    },
    { createdBy: adminId }
  );
  assert.ok(employer._id);
  assert.equal(employer.name, "New Employer Inc");
  assert.equal(employer.isVerified, false);

  await assert.rejects(
    () =>
      EmployerSvc.registerEmployer(
        {
          name: "Dup Employer",
          contactEmail: "new@employer.com",
        },
        { createdBy: adminId }
      ),
    (err) => err.status === 409 && err.details.code === "DUPLICATE_EMPLOYER_EMAIL"
  );

  const profile = await EmployerSvc.getEmployerProfile(employer._id, {
    includeVerification: true,
  });
  assert.equal(profile.name, "New Employer Inc");

  const updated = await EmployerSvc.updateEmployerProfile(employer._id, {
    name: "Updated Employer Inc",
    city: "Kathmandu",
  }, { updatedBy: adminId });
  assert.equal(updated.name, "Updated Employer Inc");
  assert.equal(updated.city, "Kathmandu");
});

test("Employer: verification submit and review", async () => {
  await seedUsers();

  const verification = await EmployerSvc.submitEmployerVerification(
    {
      employerId: employerDoc._id,
      submittedBy: adminId,
      businessRegistrationNumber: "BRN-12345",
      taxIdentificationNumber: "TIN-67890",
    },
    { submittedBy: adminId }
  );
  assert.equal(verification.status, "PENDING");

  await assert.rejects(
    () =>
      EmployerSvc.submitEmployerVerification(
        {
          employerId: employerDoc._id,
          submittedBy: adminId,
          businessRegistrationNumber: "BRN-99999",
        },
        { submittedBy: adminId }
      ),
    (err) => err.status === 409 && err.details.code === "DUPLICATE_VERIFICATION"
  );

  const reviewed = await EmployerSvc.reviewEmployerVerification(
    verification._id,
    { status: "VERIFIED", reviewedBy: adminId },
    { reviewedBy: adminId }
  );
  assert.equal(reviewed.employer.isVerified, true);

  const verification2 = await EmployerSvc.submitEmployerVerification(
    {
      employerId: employerDoc._id,
      submittedBy: adminId,
      businessRegistrationNumber: "BRN-11111",
    },
    { submittedBy: adminId }
  );
  const rejected = await EmployerSvc.reviewEmployerVerification(
    verification2._id,
    { status: "REJECTED", reviewedBy: adminId, rejectionReason: "Invalid docs" },
    { reviewedBy: adminId }
  );
  assert.equal(rejected.employer.isVerified, false);
});

test("Employer: user management", async () => {
  await seedUsers();

  const eu = await EmployerSvc.addEmployerUser(
    {
      employerId: employerDoc._id,
      userId: adminId,
      employerRole: "HR_RECRUITER",
      designation: "Recruiter",
    },
    adminId
  );
  assert.ok(eu._id);
  assert.equal(eu.employerRole, "HR_RECRUITER");

  const users = await EmployerSvc.listEmployerUsers(employerDoc._id);
  assert.ok(users.length >= 1);

  const updated = await EmployerSvc.updateEmployerUser(eu._id, {
    employerRole: "OWNER",
    designation: "Head of Recruiting",
  }, adminId);
  assert.equal(updated.employerRole, "OWNER");

  await EmployerSvc.removeEmployerUser(eu._id, adminId);
  const after = await EmployerSvc.listEmployerUsers(employerDoc._id);
  assert.ok(after.every((u) => String(u.id) !== String(eu._id)));
});

test("Internship: opportunity create and approve", async () => {
  await seedUsers();

  const opp = await InternshipSvc.createOpportunity(
    {
      employer: employerDoc._id,
      title: "Software Engineering Intern",
      department: "Engineering",
      workMode: "HYBRID",
      durationMonths: 6,
      availablePositions: 2,
      description: "Build web applications",
      deadline: new Date("2027-01-15"),
    },
    { createdBy: adminId }
  );
  assert.ok(opp._id);
  assert.equal(opp.title, "Software Engineering Intern");

  const opened = await InternshipSvc.approveOpportunity(opp._id, { status: "OPEN" }, {
    requestingUser: adminUser,
  });
  assert.equal(opened.status, "OPEN");

  const list = await InternshipSvc.listOpportunities(
    { status: "OPEN" },
    { page: 1, limit: 10 }
  );
  assert.ok(list.items.length >= 1);
});

test("Internship: application create, submit, review, shortlist", async () => {
  await seedUsers();

  const opp = await InternshipSvc.createOpportunity(
    {
      employer: employerDoc._id,
      title: "Backend Intern",
      durationMonths: 3,
      deadline: new Date("2027-06-01"),
      description: "Backend work",
    },
    { createdBy: adminId }
  );
  await InternshipSvc.approveOpportunity(opp._id, { status: "OPEN" }, {
    requestingUser: adminUser,
  });

  const app = await InternshipSvc.createApplication(
    {
      opportunity: opp._id,
      academicYear: "2026/27",
      semester: 5,
      title: "Application for Backend Intern",
      coverLetter: "I am a great candidate",
    },
    { requestingUser: studentUser }
  );
  assert.equal(app.status, "DRAFT");

  await assert.rejects(
    () =>
      InternshipSvc.createApplication(
        {
          opportunity: opp._id,
          academicYear: "2026/27",
          semester: 5,
          title: "Duplicate",
        },
        { requestingUser: studentUser }
      ),
    (err) => err.status === 409 && err.details.code === "DUPLICATE_APPLICATION"
  );

  const submitted = await InternshipSvc.submitApplication(app._id, {
    requestingUser: studentUser,
  });
  assert.equal(submitted.status, "SUBMITTED");

  const reviewed = await InternshipSvc.reviewApplication(app._id, {
    status: "UNDER_REVIEW",
    reviewNotes: "Looking good",
  }, { requestingUser: coordinatorUser });
  assert.equal(reviewed.status, "UNDER_REVIEW");

  const shortlisted = await InternshipSvc.shortlistApplication(app._id, {
    requestingUser: coordinatorUser,
  });
  assert.equal(shortlisted.status, "SHORTLISTED");

  const list = await InternshipSvc.listApplications(
    {},
    { requestingUser: adminUser, page: 1, limit: 10 }
  );
  assert.ok(list.items.length >= 1);
});

test("Internship: issue, accept, decline offer", async () => {
  await seedUsers();

  const opp = await InternshipSvc.createOpportunity(
    {
      employer: employerDoc._id,
      title: "Frontend Intern",
      durationMonths: 3,
      deadline: new Date("2027-06-01"),
      description: "Frontend work",
    },
    { createdBy: adminId }
  );
  await InternshipSvc.approveOpportunity(opp._id, { status: "OPEN" }, {
    requestingUser: adminUser,
  });

  const app = await InternshipSvc.createApplication(
    {
      opportunity: opp._id,
      academicYear: "2026/27",
      semester: 5,
      title: "Frontend application",
    },
    { requestingUser: studentUser }
  );
  await InternshipSvc.submitApplication(app._id, { requestingUser: studentUser });
  await InternshipSvc.reviewApplication(app._id, { status: "UNDER_REVIEW" }, {
    requestingUser: coordinatorUser,
  });
  await InternshipSvc.shortlistApplication(app._id, { requestingUser: coordinatorUser });
  const interview = await InternshipSvc.scheduleInterview(
    {
      application: app._id,
      scheduledStartTime: new Date("2027-06-10T10:00:00Z"),
      scheduledEndTime: new Date("2027-06-10T11:00:00Z"),
      interviewer: coordinatorUser.id,
      mode: "VIDEO_CALL",
    },
    { requestingUser: coordinatorUser }
  );
  await InternshipSvc.completeInterview(interview.id, { status: "COMPLETED" }, { requestingUser: coordinatorUser });

  const offer = await InternshipSvc.issueOffer(
    {
      application: app._id,
      roleTitle: "Frontend Intern",
      startDate: new Date("2027-07-01"),
      endDate: new Date("2027-09-30"),
      responseDeadline: new Date("2027-06-15"),
    },
    { requestingUser: coordinatorUser }
  );
  assert.equal(offer.status, "EXTENDED");

  await assert.rejects(
    () =>
      InternshipSvc.issueOffer(
        {
          application: app._id,
          roleTitle: "Duplicate Offer",
          startDate: new Date("2027-07-01"),
          endDate: new Date("2027-09-30"),
          responseDeadline: new Date("2027-06-15"),
        },
        { requestingUser: coordinatorUser }
      ),
    (err) => err.status === 409 && err.details.code === "DUPLICATE_OFFER"
  );

  const accepted = await InternshipSvc.acceptOffer(offer._id, {
    requestingUser: studentUser,
  });
  assert.equal(accepted.status, "ACCEPTED");

  await assert.rejects(
    () => InternshipSvc.acceptOffer(offer._id, { requestingUser: studentUser }),
    (err) => err.status === 400
  );
});

test("Placement: create, confirm, extend, complete", async () => {
  await seedUsers();

  const opp = await InternshipSvc.createOpportunity(
    {
      employer: employerDoc._id,
      title: "Fullstack Intern",
      durationMonths: 3,
      deadline: new Date("2027-06-01"),
      description: "Fullstack work",
    },
    { createdBy: adminId }
  );
  await InternshipSvc.approveOpportunity(opp._id, { status: "OPEN" }, {
    requestingUser: adminUser,
  });

  const app = await InternshipSvc.createApplication(
    {
      opportunity: opp._id,
      academicYear: "2026/27",
      semester: 5,
      title: "Fullstack application",
    },
    { requestingUser: studentUser }
  );
  await InternshipSvc.submitApplication(app._id, { requestingUser: studentUser });
  await InternshipSvc.reviewApplication(app._id, { status: "UNDER_REVIEW" }, {
    requestingUser: coordinatorUser,
  });
  await InternshipSvc.shortlistApplication(app._id, { requestingUser: coordinatorUser });
  const interview = await InternshipSvc.scheduleInterview(
    {
      application: app._id,
      scheduledStartTime: new Date("2027-06-10T10:00:00Z"),
      scheduledEndTime: new Date("2027-06-10T11:00:00Z"),
      interviewer: coordinatorUser.id,
      mode: "VIDEO_CALL",
    },
    { requestingUser: coordinatorUser }
  );
  await InternshipSvc.completeInterview(interview.id, { status: "COMPLETED" }, { requestingUser: coordinatorUser });

  const offer = await InternshipSvc.issueOffer(
    {
      application: app._id,
      roleTitle: "Fullstack Intern",
      startDate: new Date("2027-07-01"),
      endDate: new Date("2027-09-30"),
      responseDeadline: new Date("2027-06-15"),
    },
    { requestingUser: coordinatorUser }
  );
  await InternshipSvc.acceptOffer(offer._id, { requestingUser: studentUser });

  const placement = await PlacementSvc.createPlacement(
    {
      applicationId: app._id,
      offerId: offer._id,
      academicSupervisorId: facultyId,
      startDate: new Date("2027-07-01"),
      endDate: new Date("2027-09-30"),
      totalRequiredHours: 480,
      academicCredits: 6,
    },
    { requestingUser: coordinatorUser }
  );
  assert.equal(placement.status, "PENDING_ONBOARDING");

  await assert.rejects(
    () =>
      PlacementSvc.createPlacement(
        {
          applicationId: app._id,
          offerId: offer._id,
          academicSupervisorId: facultyId,
          startDate: new Date("2027-07-01"),
          endDate: new Date("2027-09-30"),
        },
        { requestingUser: studentUser }
      ),
    (err) => err.status === 403
  );

  const confirmed = await PlacementSvc.confirmPlacement(placement._id, {
    requestingUser: coordinatorUser,
  });
  assert.equal(confirmed.status, "ACTIVE");

  const extended = await PlacementSvc.extendPlacement(placement._id, {
    endDate: new Date("2027-10-31"),
  }, { requestingUser: coordinatorUser });
  assert.equal(extended.status, "ACTIVE");

  const completed = await PlacementSvc.completePlacement(placement._id, {
    requestingUser: coordinatorUser,
  });
  assert.equal(completed.status, "COMPLETED");
});

test("Placement: supervisor assignment", async () => {
  await seedUsers();

  const supervisor = await PlacementSvc.createSupervisor(
    {
      company: employerDoc._id,
      firstName: "John",
      lastName: "Supervisor",
      email: "john@techcorp.com",
      designation: "Engineering Manager",
    },
    { requestingUser: adminUser }
  );
  assert.ok(supervisor._id);
});

test("Activity: task, logbook, attendance, report", async () => {
  await seedUsers();

  const opp = await InternshipSvc.createOpportunity(
    {
      employer: employerDoc._id,
      title: "Activity Intern",
      durationMonths: 3,
      deadline: new Date("2027-06-01"),
      description: "Activity work",
    },
    { createdBy: adminId }
  );
  await InternshipSvc.approveOpportunity(opp._id, { status: "OPEN" }, {
    requestingUser: adminUser,
  });

  const app = await InternshipSvc.createApplication(
    {
      opportunity: opp._id,
      academicYear: "2026/27",
      semester: 5,
      title: "Activity application",
    },
    { requestingUser: studentUser }
  );
  await InternshipSvc.submitApplication(app._id, { requestingUser: studentUser });
  await InternshipSvc.reviewApplication(app._id, { status: "UNDER_REVIEW" }, {
    requestingUser: coordinatorUser,
  });
  await InternshipSvc.shortlistApplication(app._id, { requestingUser: coordinatorUser });
  const interview = await InternshipSvc.scheduleInterview(
    {
      application: app._id,
      scheduledStartTime: new Date("2027-06-10T10:00:00Z"),
      scheduledEndTime: new Date("2027-06-10T11:00:00Z"),
      interviewer: coordinatorUser.id,
      mode: "VIDEO_CALL",
    },
    { requestingUser: coordinatorUser }
  );
  await InternshipSvc.completeInterview(interview.id, { status: "COMPLETED" }, { requestingUser: coordinatorUser });

  const offer = await InternshipSvc.issueOffer(
    {
      application: app._id,
      roleTitle: "Activity Intern",
      startDate: new Date("2027-07-01"),
      endDate: new Date("2027-09-30"),
      responseDeadline: new Date("2027-06-15"),
    },
    { requestingUser: coordinatorUser }
  );
  await InternshipSvc.acceptOffer(offer._id, { requestingUser: studentUser });

  const placement = await PlacementSvc.createPlacement(
    {
      applicationId: app._id,
      offerId: offer._id,
      academicSupervisorId: facultyId,
      startDate: new Date("2027-07-01"),
      endDate: new Date("2027-09-30"),
    },
    { requestingUser: coordinatorUser }
  );
  await PlacementSvc.confirmPlacement(placement._id, { requestingUser: coordinatorUser });

  const task = await ActivitySvc.createTask(
    {
      placement: placement._id,
      student: studentProfile._id,
      title: "Build login page",
      description: "Implement authentication UI",
      priority: "HIGH",
    },
    { requestingUser: facultyUser }
  );
  assert.ok(task._id);

  const updated = await ActivitySvc.updateTask(task._id, { status: "IN_PROGRESS" }, {
    requestingUser: facultyUser,
  });
  assert.equal(updated.status, "IN_PROGRESS");

  const studentUpdated = await ActivitySvc.updateTask(task._id, { status: "DONE" }, {
    requestingUser: studentUser,
  });
  assert.equal(studentUpdated.status, "DONE");

  const logbook = await ActivitySvc.submitLogbook(
    {
      placement: placement._id,
      application: app._id,
      weekNumber: 1,
      weekStartDate: new Date("2027-07-01"),
      weekEndDate: new Date("2027-07-07"),
      activitiesSummary: "Implemented login page",
      hoursWorked: 40,
    },
    { requestingUser: studentUser }
  );
  assert.equal(logbook.status, "SUBMITTED");

  const reviewed = await ActivitySvc.reviewLogbook(logbook._id, {
    status: "APPROVED",
    supervisorFeedback: "Good work",
  }, { requestingUser: facultyUser });
  assert.equal(reviewed.status, "APPROVED");

  const attendance = await ActivitySvc.recordAttendance(
    {
      placement: placement._id,
      student: studentProfile._id,
      date: new Date("2027-07-01"),
      status: "PRESENT",
      checkInTime: new Date("2027-07-01T09:00:00Z"),
      checkOutTime: new Date("2027-07-01T17:00:00Z"),
    },
    { requestingUser: facultyUser }
  );
  assert.equal(attendance.status, "PRESENT");

  const approved = await ActivitySvc.approveAttendance(attendance._id, {
    requestingUser: facultyUser,
  });
  assert.equal(approved.approvedBySupervisor, true);

  const report = await ActivitySvc.submitReport(
    {
      placement: placement._id,
      reportType: "INTERIM",
      title: "Interim Report",
      executiveSummary: "Progress so far",
    },
    { requestingUser: studentUser }
  );
  assert.equal(report.status, "SUBMITTED");

  const reportUnderReview = await ActivitySvc.reviewReport(report._id, {
    status: "UNDER_REVIEW",
    facultyRemarks: "Reviewing",
  }, { requestingUser: facultyUser });
  assert.equal(reportUnderReview.status, "UNDER_REVIEW");

  const reportReviewed = await ActivitySvc.reviewReport(report._id, {
    status: "APPROVED",
    academicGrade: "A",
    facultyRemarks: "Excellent work",
  }, { requestingUser: facultyUser });
  assert.equal(reportReviewed.status, "APPROVED");

  const tasks = await ActivitySvc.listTasks(placement._id, { requestingUser: facultyUser });
  assert.ok(tasks.length >= 1);
  const logbooks = await ActivitySvc.listLogbooks(placement._id, { requestingUser: facultyUser });
  assert.ok(logbooks.length >= 1);
  const reports = await ActivitySvc.listReports(placement._id, { requestingUser: facultyUser });
  assert.ok(reports.length >= 1);
  const attendanceList = await ActivitySvc.listAttendance(placement._id, { requestingUser: facultyUser });
  assert.ok(attendanceList.length >= 1);
});

test("Evaluation: create, verify completion, issue credential", async () => {
  await seedUsers();

  const opp = await InternshipSvc.createOpportunity(
    {
      employer: employerDoc._id,
      title: "Eval Intern",
      durationMonths: 3,
      deadline: new Date("2027-06-01"),
      description: "Eval work",
    },
    { createdBy: adminId }
  );
  await InternshipSvc.approveOpportunity(opp._id, { status: "OPEN" }, {
    requestingUser: adminUser,
  });

  const app = await InternshipSvc.createApplication(
    {
      opportunity: opp._id,
      academicYear: "2026/27",
      semester: 5,
      title: "Eval application",
    },
    { requestingUser: studentUser }
  );
  await InternshipSvc.submitApplication(app._id, { requestingUser: studentUser });
  await InternshipSvc.reviewApplication(app._id, { status: "UNDER_REVIEW" }, {
    requestingUser: coordinatorUser,
  });
  await InternshipSvc.shortlistApplication(app._id, { requestingUser: coordinatorUser });
  const interview = await InternshipSvc.scheduleInterview(
    {
      application: app._id,
      scheduledStartTime: new Date("2027-06-10T10:00:00Z"),
      scheduledEndTime: new Date("2027-06-10T11:00:00Z"),
      interviewer: coordinatorUser.id,
      mode: "VIDEO_CALL",
    },
    { requestingUser: coordinatorUser }
  );
  await InternshipSvc.completeInterview(interview.id, { status: "COMPLETED" }, { requestingUser: coordinatorUser });

  const offer = await InternshipSvc.issueOffer(
    {
      application: app._id,
      roleTitle: "Eval Intern",
      startDate: new Date("2027-07-01"),
      endDate: new Date("2027-09-30"),
      responseDeadline: new Date("2027-06-15"),
    },
    { requestingUser: coordinatorUser }
  );
  await InternshipSvc.acceptOffer(offer._id, { requestingUser: studentUser });

  const placement = await PlacementSvc.createPlacement(
    {
      applicationId: app._id,
      offerId: offer._id,
      academicSupervisorId: facultyId,
      startDate: new Date("2027-07-01"),
      endDate: new Date("2027-09-30"),
      totalRequiredHours: 100,
      completedHours: 100,
    },
    { requestingUser: coordinatorUser }
  );
  await PlacementSvc.confirmPlacement(placement._id, { requestingUser: coordinatorUser });

  await ActivitySvc.submitLogbook(
    {
      placement: placement._id,
      application: app._id,
      weekNumber: 1,
      weekStartDate: new Date("2027-07-01"),
      weekEndDate: new Date("2027-07-07"),
      activitiesSummary: "Week 1",
      hoursWorked: 40,
    },
    { requestingUser: studentUser }
  );

  await ActivitySvc.submitReport(
    {
      placement: placement._id,
      reportType: "FINAL",
      title: "Final Report",
      executiveSummary: "Done",
    },
    { requestingUser: studentUser }
  );

  const academicEval = await EvalSvc.createEvaluation(
    {
      placement: placement._id,
      student: studentProfile._id,
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
    { requestingUser: facultyUser }
  );
  assert.equal(academicEval.gradeAwarded, "A");

  await assert.rejects(
    () =>
      EvalSvc.createEvaluation(
        {
          placement: placement._id,
          student: studentProfile._id,
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
        { requestingUser: facultyUser }
      ),
    (err) => err.status === 409 && err.details.code === "DUPLICATE_EVALUATION"
  );

  const check1 = await EvalSvc.verifyCompletionRequirements(placement._id);
  assert.equal(check1.eligible, false);
  assert.ok(check1.missing.some((m) => m.includes("industry")));

  const eu = await EmployerSvc.addEmployerUser(
    {
      employerId: employerDoc._id,
      userId: facultyId,
      employerRole: "SUPERVISOR",
    },
    adminId
  );

  const industryEval = await EvalSvc.createEvaluation(
    {
      placement: placement._id,
      student: studentProfile._id,
      evaluatorType: "INDUSTRY_SUPERVISOR",
      evaluationType: "FINAL",
      isFinal: true,
      technicalSkills: 9,
      professionalism: 9,
      communication: 9,
      problemSolving: 9,
      teamwork: 9,
      initiative: 9,
      overallRating: 9,
    },
    { requestingUser: facultyUser }
  );
  assert.equal(industryEval.gradeAwarded, "A+");

  const logbooks = await ActivitySvc.listLogbooks(placement._id, { requestingUser: facultyUser });
  await ActivitySvc.reviewLogbook(logbooks[0].id, { status: "APPROVED" }, { requestingUser: facultyUser });

  const reports = await ActivitySvc.listReports(placement._id, { requestingUser: facultyUser });
  await ActivitySvc.reviewReport(reports[0].id, { status: "UNDER_REVIEW" }, { requestingUser: facultyUser });
  await ActivitySvc.reviewReport(reports[0].id, { status: "APPROVED", academicGrade: "A" }, { requestingUser: facultyUser });

  const check2 = await EvalSvc.verifyCompletionRequirements(placement._id);
  assert.equal(check2.eligible, true);

  await PlacementSvc.completePlacement(placement._id, { requestingUser: coordinatorUser });

  const credential = await EvalSvc.issueCredential(placement._id, {
    requestingUser: coordinatorUser,
  });
  assert.ok(credential.credentialNumber);
  assert.ok(credential.verificationHash);
  assert.equal(credential.status, "ACTIVE");

  await assert.rejects(
    () => EvalSvc.issueCredential(placement._id, { requestingUser: coordinatorUser }),
    (err) => err.status === 409 && err.details.code === "DUPLICATE_CREDENTIAL"
  );

  const verified = await EvalSvc.verifyCredentialByHash(credential.verificationHash);
  assert.ok(verified.valid);
  assert.equal(verified.credentialNumber, credential.credentialNumber);

  const revoked = await EvalSvc.revokeCredential(credential._id, {
    requestingUser: coordinatorUser,
  });
  assert.equal(revoked.status, "REVOKED");

  await assert.rejects(
    () => EvalSvc.issueCredential(placement._id, { requestingUser: studentUser }),
    (err) => err.status === 403
  );
});

test("Industry Project: create, approve, apply, membership, task, submission, evaluation, complete", async () => {
  await seedUsers();

  const project = await ProjectSvc.createProject(
    {
      title: "Green Energy Trading Platform",
      sponsorEmployer: employerDoc._id,
      industry: "Fintech",
      clientBrief: "Design P2P microgrid trading interface",
      durationWeeks: 12,
      teamSize: 4,
      applicationDeadline: new Date("2026-12-15"),
    },
    { requestingUser: adminUser }
  );
  assert.ok(project._id);

  const approved = await ProjectSvc.approveProject(project._id, {
    requestingUser: coordinatorUser,
  });
  assert.equal(approved.status, "ACCEPTING_APPLICATIONS");

  const membership = await ProjectSvc.applyToProject(project._id, {
    requestingUser: studentUser,
  });
  assert.equal(membership.status, "APPLIED");

  await assert.rejects(
    () => ProjectSvc.applyToProject(project._id, { requestingUser: studentUser }),
    (err) => err.status === 409
  );

  const decided = await ProjectSvc.decideMembership(membership._id, {
    status: "ACCEPTED",
    teamRole: "TEAM_LEAD",
  }, { requestingUser: coordinatorUser });
  assert.equal(decided.status, "ACCEPTED");

  const memberships = await ProjectSvc.listMemberships(project._id, {
    requestingUser: coordinatorUser,
  });
  assert.ok(memberships.length >= 1);

  const task = await ProjectSvc.createProjectTask(
    {
      project: project._id,
      milestoneNumber: 1,
      title: "Design API",
      description: "Design REST API",
      dueDate: new Date("2026-12-01"),
    },
    { requestingUser: facultyUser }
  );
  assert.ok(task._id);

  const submission = await ProjectSvc.submitWork(
    {
      task: task._id,
      repositoryUrl: "https://github.com/student/project",
      notes: "Initial implementation",
    },
    { requestingUser: studentUser }
  );
  assert.equal(submission.status, "SUBMITTED");

  await assert.rejects(
    () =>
      ProjectSvc.submitWork(
        { task: task._id, repositoryUrl: "https://github.com/student/project2" },
        { requestingUser: studentUser }
      ),
    (err) => err.status === 409
  );

  const underReview = await ProjectSvc.reviewSubmission(submission._id, {
    status: "UNDER_REVIEW",
    notes: "Reviewing",
  }, { requestingUser: facultyUser });
  assert.equal(underReview.status, "UNDER_REVIEW");

  const reviewed = await ProjectSvc.reviewSubmission(submission._id, {
    status: "APPROVED",
    notes: "Looks good",
  }, { requestingUser: facultyUser });
  assert.equal(reviewed.status, "APPROVED");

  const evaluation = await ProjectSvc.evaluateProjectStudent(
    {
      project: project._id,
      student: studentProfile._id,
      milestoneNumber: 1,
      technicalExecution: 8,
      deliverableCompleteness: 9,
      teamCollaboration: 8,
      score: 85,
    },
    { requestingUser: facultyUser }
  );
  assert.equal(evaluation.score, 85);

  const completed = await ProjectSvc.completeProject(project._id, {
    requestingUser: coordinatorUser,
  });
  assert.equal(completed.status, "COMPLETED");

  const subs = await ProjectSvc.listSubmissions(
    { projectId: project._id },
    { requestingUser: facultyUser }
  );
  assert.ok(subs.length >= 1);
});

test("Virtual Workplace: template, simulation, application, membership, team, project, task, event, competency, portfolio", async () => {
  await seedUsers();

  const template = await VWSvc.createCompanyTemplate(
    {
      templateCode: "NOVATECH-2026",
      name: "NovaTech Cloud",
      sector: "CLOUD_SAAS",
      description: "Enterprise SaaS simulation",
      difficulty: "PRODUCTION_GRADE",
    },
    { requestingUser: coordinatorUser }
  );
  assert.ok(template._id);

  const templates = await VWSvc.listCompanyTemplates({}, { page: 1, limit: 10 });
  assert.ok(templates.items.length >= 1);

  const simulation = await VWSvc.createSimulation(
    {
      template: template._id,
      simulationCode: "SIM-2026-01",
      companyName: "NovaTech Cloud Enterprise",
      academicYear: "2026/27",
      semester: 7,
      startDate: new Date("2026-10-01"),
      endDate: new Date("2027-01-15"),
    },
    { requestingUser: coordinatorUser }
  );
  assert.ok(simulation._id);

  const configured = await VWSvc.configureSimulation(simulation._id, {
    status: "ACTIVE",
  }, { requestingUser: coordinatorUser });
  assert.equal(configured.status, "ACTIVE");

  const sims = await VWSvc.listSimulations({}, { requestingUser: adminUser, page: 1, limit: 10 });
  assert.ok(sims.items.length >= 1);

  const app = await VWSvc.applyToSimulation(simulation._id, {
    targetCareerPath: "frontend_developer",
    statementOfIntent: "I want to learn React",
  }, { requestingUser: studentUser });
  assert.equal(app.status, "PENDING");

  await assert.rejects(
    () =>
      VWSvc.applyToSimulation(simulation._id, {
        targetCareerPath: "frontend_developer",
      }, { requestingUser: studentUser }),
    (err) => err.status === 409
  );

  const reviewed = await VWSvc.reviewSimulationApplication(app._id, {
    status: "ACCEPTED",
  }, { requestingUser: coordinatorUser });
  assert.equal(reviewed.status, "ACCEPTED");

  const membership = await VWSvc.createMembership(app._id, {
    careerPath: "frontend_developer",
  }, { requestingUser: coordinatorUser });
  assert.equal(membership.status, "ACTIVE");

  const members = await VWSvc.listMemberships(simulation._id, {
    requestingUser: coordinatorUser,
  });
  assert.ok(members.length >= 1);

  const team = await VWSvc.createTeam(simulation._id, {
    teamName: "Frontend Squad",
  }, { requestingUser: coordinatorUser });
  assert.ok(team._id);

  const simProject = await VWSvc.createSimulationProject(simulation._id, {
    name: "Auth Module",
    team: team._id,
  }, { requestingUser: coordinatorUser });
  assert.ok(simProject._id);

  const simTask = await VWSvc.createSimulationTask(simulation._id, {
    ticketNumber: "FE-001",
    title: "Implement Login",
    careerPath: "frontend_developer",
    storyPoints: 5,
    priority: "HIGH",
  }, { requestingUser: coordinatorUser });
  assert.ok(simTask._id);

  const event = await VWSvc.createEvent(simulation._id, {
    eventType: "INCIDENT_CRISIS",
    severity: "SEV1_CRITICAL",
    title: "Database Outage",
    scenarioDescription: "Simulated DB outage during peak traffic",
    status: "ACTIVE",
  }, { requestingUser: coordinatorUser });
  assert.ok(event._id);

  const { Competency } = Models;
  const competency = await Competency.create({
    code: "COMP-REACT-01",
    name: "React & Hooks",
    category: "TECHNICAL",
    targetProficiency: 85,
  });

  const evidence = await VWSvc.createCompetencyEvidence(
    {
      competency: competency._id,
      sourceDomain: "VIRTUAL_SIMULATION",
      sourceReferenceId: `SIM-${simulation._id}`,
      evidenceSummary: "Built login page in simulation",
      scoreLevel: 90,
    },
    { requestingUser: studentUser }
  );
  assert.ok(evidence._id);
  assert.equal(evidence.sourceDomain, "VIRTUAL_SIMULATION");

  const verified = await VWSvc.verifyCompetencyEvidence(evidence._id, {
    scoreLevel: 92,
  }, { requestingUser: coordinatorUser });
  assert.ok(verified.verifiedBy);
  assert.equal(verified.scoreLevel, 92);

  const portfolio = await VWSvc.createOrUpdatePortfolio(
    {
      slug: "student-one-2026",
      headline: "Junior Frontend Developer",
      bio: "Aspiring frontend engineer",
      featuredSkills: [{ skillName: "React", level: 90, category: "TECHNICAL", isVerified: true }],
      isPublic: true,
    },
    { requestingUser: studentUser }
  );
  assert.ok(portfolio._id);
  assert.equal(portfolio.slug, "student-one-2026");

  const fetched = await VWSvc.getPortfolio("student-one-2026", {
    requestingUser: adminUser,
  });
  assert.equal(fetched.slug, "student-one-2026");

  const portfolios = await VWSvc.listPortfolios({ requestingUser: adminUser, page: 1, limit: 10 });
  assert.ok(portfolios.items.length >= 1);
});

test("Error classes are correct", async () => {
  const { badRequest, notFound, forbidden, conflict } = await import("../src/utils/apiError.js");
  assert.equal(badRequest("msg").status, 400);
  assert.equal(badRequest("msg").code, "BAD_REQUEST");
  assert.equal(notFound("msg").status, 404);
  assert.equal(notFound("msg").code, "NOT_FOUND");
  assert.equal(forbidden("msg").status, 403);
  assert.equal(forbidden("msg").code, "FORBIDDEN");
  assert.equal(conflict("msg").status, 409);
  assert.equal(conflict("msg").code, "CONFLICT");
});
