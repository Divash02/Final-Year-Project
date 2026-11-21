import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  Employer,
  InternshipCompany,
  EmployerUser,
  EmployerVerification,
  InternshipOpportunity,
  InternshipSupervisor,
  InternshipApplication,
  InternshipInterview,
  InternshipOffer,
  InternshipPlacement,
  InternshipAgreement,
  InternshipTask,
  InternshipLogbook,
  InternshipProgressReport,
  InternshipAttendance,
  InternshipReport,
  InternshipEvaluation,
  InternshipCredential,
  IndustryProject,
  IndustryProjectMembership,
  IndustryProjectTask,
  IndustryProjectSubmission,
  IndustryProjectEvaluation,
  VirtualCompanyTemplate,
  VirtualDepartment,
  VirtualSimulation,
  SimulationApplication,
  SimulationMembership,
  SimulationTeam,
  SimulationProject,
  SimulationTask,
  SimulationSubmission,
  SimulationReview,
  SimulationEvent,
  SimulationMeeting,
  SimulationMessage,
  SimulationAssessment,
  Competency,
  CompetencyEvidence,
  ProfessionalPortfolio,
} from "../src/models/index.js";
import { withTransaction } from "../src/utils/transaction.js";

test("Database Architecture: Model Aliasing and Compatibility", () => {
  // Assert backward compatibility aliases
  assert.equal(Employer, InternshipCompany, "Employer must alias InternshipCompany");
  assert.equal(InternshipLogbook, InternshipProgressReport, "InternshipLogbook must alias InternshipProgressReport");
});

test("Domain A (Real Internships): Schema validation, required fields and enums", () => {
  // Test Employer validation
  const invalidEmployer = new Employer({});
  const employerError = invalidEmployer.validateSync();
  assert.ok(employerError, "Employer without name must fail validation");
  assert.ok(employerError.errors.name, "Employer name is required");

  const validEmployer = new Employer({
    name: "Apex Global Cloud Solutions",
    industry: "Enterprise Cloud",
    size: "ENTERPRISE",
    verificationStatus: "VERIFIED",
  });
  assert.equal(validEmployer.validateSync(), undefined, "Valid employer must pass validation");

  // Test InternshipOpportunity validation
  const validOpp = new InternshipOpportunity({
    employer: new mongoose.Types.ObjectId(),
    title: "Software Engineer Intern",
    department: "Cloud Engineering",
    workMode: "HYBRID",
    durationMonths: 6,
    deadline: new Date("2026-12-31"),
    description: "Build microservices in Go and TypeScript",
  });
  assert.equal(validOpp.validateSync(), undefined, "Valid opportunity must pass validation");

  // Invalid workMode enum
  const invalidOpp = new InternshipOpportunity({
    employer: new mongoose.Types.ObjectId(),
    title: "Test Opp",
    durationMonths: 6,
    deadline: new Date(),
    description: "Test description",
    workMode: "FLYING_MODE",
  });
  const oppErr = invalidOpp.validateSync();
  assert.ok(oppErr.errors.workMode, "Invalid workMode enum should throw validation error");

  // Test InternshipPlacement validation
  const validPlacement = new InternshipPlacement({
    placementCode: "PLC-2026-001",
    student: new mongoose.Types.ObjectId(),
    employer: new mongoose.Types.ObjectId(),
    application: new mongoose.Types.ObjectId(),
    academicSupervisor: new mongoose.Types.ObjectId(),
    startDate: new Date("2026-10-15"),
    endDate: new Date("2027-04-15"),
    status: "ACTIVE",
    totalRequiredHours: 480,
  });
  assert.equal(validPlacement.validateSync(), undefined, "Valid placement must pass validation");

  // Test InternshipLogbook validation
  const validLogbook = new InternshipLogbook({
    placement: new mongoose.Types.ObjectId(),
    student: new mongoose.Types.ObjectId(),
    weekNumber: 5,
    weekStartDate: new Date("2026-11-10"),
    weekEndDate: new Date("2026-11-15"),
    hoursWorked: 40,
    activitiesSummary: "Implemented Redis cache layer with invalidation telemetry.",
    status: "SUBMITTED",
  });
  assert.equal(validLogbook.validateSync(), undefined, "Valid logbook entry must pass validation");

  // Test InternshipEvaluation rubric boundaries (min 1, max 10)
  const invalidEval = new InternshipEvaluation({
    student: new mongoose.Types.ObjectId(),
    evaluatedBy: new mongoose.Types.ObjectId(),
    evaluatorType: "INDUSTRY_SUPERVISOR",
    overallRating: 15, // Out of bounds
    technicalSkills: 12,
  });
  const evalErr = invalidEval.validateSync();
  assert.ok(evalErr.errors.overallRating, "overallRating > 10 must fail validation");
});

test("Domain B (Industry Projects): Schemas and Team Memberships", () => {
  const validProject = new IndustryProject({
    title: "Decentralized Green Energy Trading Platform",
    durationWeeks: 12,
    teamSize: 4,
    difficulty: "ADVANCED",
    clientBrief: "Design peer-to-peer microgrid trading telemetry interface.",
    applicationDeadline: new Date("2026-12-15"),
  });
  assert.equal(validProject.validateSync(), undefined, "Valid industry project must pass validation");

  const validMembership = new IndustryProjectMembership({
    project: new mongoose.Types.ObjectId(),
    student: new mongoose.Types.ObjectId(),
    teamRole: "TEAM_LEAD",
    status: "ACTIVE",
  });
  assert.equal(validMembership.validateSync(), undefined, "Valid project membership must pass validation");

  const validSubmission = new IndustryProjectSubmission({
    project: new mongoose.Types.ObjectId(),
    task: new mongoose.Types.ObjectId(),
    submittedBy: new mongoose.Types.ObjectId(),
    repositoryUrl: "https://github.com/techspire-projects/microgrid-trading",
  });
  assert.equal(validSubmission.validateSync(), undefined, "Valid submission must pass validation");
});

test("Domain C (Virtual Workplace Simulations): Templates, Tasks and Incidents", () => {
  const validTemplate = new VirtualCompanyTemplate({
    templateCode: "NOVATECH-SAAS",
    name: "NovaTech Cloud Enterprise",
    sector: "CLOUD_SAAS",
    description: "Enterprise SaaS identity orchestration simulation.",
  });
  assert.equal(validTemplate.validateSync(), undefined, "Valid company template must pass validation");

  const validSimulation = new VirtualSimulation({
    simulationCode: "SIM-2026-FALL-01",
    template: new mongoose.Types.ObjectId(),
    companyName: "NovaTech Cloud Enterprise",
    academicYear: "2026/27",
    semester: 7,
    startDate: new Date("2026-10-01"),
    endDate: new Date("2027-01-15"),
    status: "ACTIVE",
  });
  assert.equal(validSimulation.validateSync(), undefined, "Valid virtual simulation must pass validation");

  const validTask = new SimulationTask({
    simulation: new mongoose.Types.ObjectId(),
    ticketNumber: "FE-2041",
    title: "Implement Multi-Factor Authentication Verification Modal",
    careerPath: "frontend_developer",
    priority: "HIGH",
    status: "IN_PROGRESS",
    storyPoints: 5,
  });
  assert.equal(validTask.validateSync(), undefined, "Valid simulation task must pass validation");

  const validIncident = new SimulationEvent({
    simulation: new mongoose.Types.ObjectId(),
    eventType: "INCIDENT_CRISIS",
    severity: "SEV1_CRITICAL",
    title: "APM Pod Memory Leak Alert",
    scenarioDescription: "Simulated memory leak during peak auth traffic.",
    status: "ACTIVE",
  });
  assert.equal(validIncident.validateSync(), undefined, "Valid simulation incident must pass validation");
});

test("Competency and Professional Portfolio Models", () => {
  const validCompetency = new Competency({
    code: "COMP-REACT-01",
    name: "Modern React & Hooks Architecture",
    category: "TECHNICAL",
    targetProficiency: 85,
  });
  assert.equal(validCompetency.validateSync(), undefined, "Valid competency must pass validation");

  const validEvidence = new CompetencyEvidence({
    student: new mongoose.Types.ObjectId(),
    competency: new mongoose.Types.ObjectId(),
    sourceDomain: "VIRTUAL_SIMULATION",
    sourceReferenceId: "PR-342",
    scoreLevel: 92,
  });
  assert.equal(validEvidence.validateSync(), undefined, "Valid competency evidence must pass validation");

  const validPortfolio = new ProfessionalPortfolio({
    student: new mongoose.Types.ObjectId(),
    slug: "aarav-sharma-2026",
    headline: "Junior Cloud Services Engineer",
    featuredSkills: [
      { skillName: "React", level: 90, category: "TECHNICAL", isVerified: true },
    ],
  });
  assert.equal(validPortfolio.validateSync(), undefined, "Valid professional portfolio must pass validation");
});

test("Database Indexing & Compound Uniqueness Configuration", () => {
  // Verify compound indexes are registered on schemas
  const applicationIndexes = InternshipApplication.schema.indexes();
  const hasAppStudentOppIndex = applicationIndexes.some(
    ([idx]) => idx.student === 1 && idx.opportunity === 1
  );
  assert.ok(hasAppStudentOppIndex, "InternshipApplication must declare compound index on { student: 1, opportunity: 1 }");

  const placementIndexes = InternshipPlacement.schema.indexes();
  const hasPlacementStudentStatus = placementIndexes.some(
    ([idx]) => idx.student === 1 && idx.status === 1
  );
  assert.ok(hasPlacementStudentStatus, "InternshipPlacement must declare index on { student: 1, status: 1 }");

  const logbookIndexes = InternshipLogbook.schema.indexes();
  const hasLogbookPlacementWeek = logbookIndexes.some(
    ([idx]) => idx.placement === 1 && idx.weekNumber === 1
  );
  assert.ok(hasLogbookPlacementWeek, "InternshipLogbook must declare compound unique index on { placement: 1, weekNumber: 1 }");

  const attendanceIndexes = InternshipAttendance.schema.indexes();
  const hasAttendancePlacementDate = attendanceIndexes.some(
    ([idx]) => idx.placement === 1 && idx.date === 1
  );
  assert.ok(hasAttendancePlacementDate, "InternshipAttendance must declare compound unique index on { placement: 1, date: 1 }");

  const membershipIndexes = IndustryProjectMembership.schema.indexes();
  const hasProjectStudentMembership = membershipIndexes.some(
    ([idx]) => idx.project === 1 && idx.student === 1
  );
  assert.ok(hasProjectStudentMembership, "IndustryProjectMembership must declare compound unique index on { project: 1, student: 1 }");
});

test("Safe Transaction Execution Helper", async () => {
  // Test withTransaction executes callback safely
  const result = await withTransaction(async (session) => {
    return { executed: true, hadSession: Boolean(session) };
  });
  assert.equal(result.executed, true, "withTransaction must execute the callback and return result");
});
