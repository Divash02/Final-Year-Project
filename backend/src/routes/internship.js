import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  requireApplicationRead,
  requirePlacementRead,
  requireOpportunityRead,
  requireEmployerRead,
  requireEvaluationRead,
  isStudent as isStudentRole,
  isFaculty as isFacultyRole,
  isCoordinator as isCoordinatorRole,
  resolveEmployerForUser,
  canManageApplication,
  canReadOpportunity,
  canManageOpportunity,
  canReadEmployer,
  canManageEmployer,
  buildListFilter,
  paginate,
} from "../services/internship/internshipAccessControl.js";
import {
  registerEmployer,
  getEmployerProfile,
  updateEmployerProfile,
  submitEmployerVerification,
  reviewEmployerVerification,
  listEmployerVerifications,
  addEmployerUser,
  updateEmployerUser,
  removeEmployerUser,
  listEmployerUsers,
} from "../controllers/internship/employerController.js";
import {
  createOpportunity,
  updateOpportunity,
  approveOpportunity,
  listOpportunities,
  createApplication,
  submitApplication,
  reviewApplication,
  shortlistApplication,
  listApplications,
  getApplication,
  scheduleInterview,
  completeInterview,
  issueOffer,
  acceptOffer,
  declineOffer,
} from "../controllers/internship/internshipController.js";
import {
  createPlacement,
  confirmPlacement,
  updatePlacement,
  managePlacementLeave,
  terminatePlacement,
  extendPlacement,
  completePlacement,
  listPlacements,
  getPlacement,
  listSupervisors,
  createSupervisor,
  assignIndustrySupervisor,
} from "../controllers/internship/placementController.js";
import {
  createTask,
  updateTask,
  listTasks,
  submitLogbook,
  reviewLogbook,
  listLogbooks,
  recordAttendance,
  approveAttendance,
  listAttendance,
  submitReport,
  reviewReport,
  listReports,
} from "../controllers/internship/activityController.js";
import {
  createEvaluation,
  listEvaluations,
  verifyCompletionRequirements,
  issueCredential,
  revokeCredential,
  verifyCredentialByHash,
  listCredentials,
} from "../controllers/internship/evaluationController.js";
import {
  createProject,
  approveProject,
  updateProject,
  listProjects,
  applyToProject,
  decideMembership,
  listMemberships,
  createProjectTask,
  updateProjectTask,
  submitWork,
  reviewSubmission,
  listSubmissions,
  evaluateProjectStudent,
  completeProject,
} from "../controllers/internship/industryProjectController.js";
import {
  createCompanyTemplate,
  updateCompanyTemplate,
  listCompanyTemplates,
  createSimulation,
  configureSimulation,
  listSimulations,
  applyToSimulation,
  reviewSimulationApplication,
  createMembership,
  listMemberships as listSimulationMemberships,
  createTeam,
  createSimulationProject,
  createSimulationTask,
  updateSimulationTask,
  submitSimulationWork,
  reviewSimulationSubmission,
  createEvent,
  createCompetencyEvidence,
  verifyCompetencyEvidence,
  createOrUpdatePortfolio,
  getPortfolio,
  listPortfolios,
  validateMembership,
  getWorkspaceData,
  getStudentMemberships,
} from "../controllers/internship/virtualWorkplaceController.js";
import {
  createCareerCategory,
  updateCareerCategory,
  listCareerCategories,
  getCareerCategory,
  createCareerRole,
  updateCareerRole,
  listCareerRoles,
  getCareerRole,
  compareCareerRoles,
  addCareerInterest,
  updateCareerInterest,
  removeCareerInterest,
  listCareerInterests,
  recordExplorationActivity,
  getExplorationHistory,
  getCareerExplorerDashboard,
} from "../controllers/internship/careerController.js";
import {
  generateVirtualCompanyTemplate,
  createVirtualCompanyFromTemplate,
  listVirtualCompanies,
  getVirtualCompany,
  createSpecialistWorkspaceConfig,
  updateSpecialistWorkspaceConfig,
  listSpecialistWorkspaceConfigs,
  getSpecialistWorkspaceConfig,
  seedDefaultWorkspaceConfigs,
} from "../controllers/internship/virtualCompanyController.js";
import {
  createVirtualAgent,
  updateVirtualAgent,
  listVirtualAgents,
  getVirtualAgent,
  seedDefaultAgents,
  createSimulationScenario,
  listSimulationScenarios,
  getSimulationScenario,
  seedDefaultScenarios,
  generateAgentResponse,
  simulateAgentMessage,
} from "../controllers/internship/aiWorkforceController.js";

/* ------------------------------------------------------------------ */
/* Helper middleware                                                  */
/* ------------------------------------------------------------------ */

/**
 * Ensures the authenticated user is a student. Used for student-scoped
 * mutating endpoints (create application, submit logbook, etc.).
 */
function requireStudent(req, res, next) {
  if (!isStudentRole(req.user)) {
    return res.status(403).json({
      error: "Student role required.",
      code: "STUDENT_ROLE_REQUIRED",
    });
  }
  next();
}

/**
 * Ensures the authenticated user is faculty. Used for faculty-scoped
 * mutating endpoints (review logbook, record attendance, etc.).
 */
function requireFaculty(req, res, next) {
  if (!isFacultyRole(req.user)) {
    return res.status(403).json({
      error: "Faculty role required.",
      code: "FACULTY_ROLE_REQUIRED",
    });
  }
  next();
}

/**
 * Ensures the authenticated user is associated with the employer in the
 * route parameter as an OWNER or HR_RECRUITER.
 */
async function requireEmployerOwnerOrRecruiter(req, res, next) {
  const employerId = req.params.id || req.params.employerId;
  const ctx = await resolveEmployerForUser(req.user);
  if (
    !ctx ||
    !["OWNER", "HR_RECRUITER"].includes(ctx.employerUser.employerRole) ||
    ctx.employerId !== employerId
  ) {
    return res.status(403).json({
      error: "Employer owner or recruiter role required for this company.",
      code: "EMPLOYER_ROLE_REQUIRED",
    });
  }
  next();
}

/**
 * Ensures the authenticated user is a coordinator (internship.manage).
 */
function requireCoordinator(req, res, next) {
  if (!isCoordinatorRole(req.user)) {
    return res.status(403).json({
      error: "Internship coordinator role required.",
      code: "COORDINATOR_ROLE_REQUIRED",
    });
  }
  next();
}

/**
 * Pagination middleware: reads page/limit/sort from query and attaches
 * normalized pagination params to req.pagination.
 */
function paginationMiddleware(req, res, next) {
  const { page, limit, skip, sort } = paginate(req.query);
  req.pagination = { page, limit, skip, sort };
  next();
}

export function registerInternshipRoutes(app) {
  /* ========================================================================
   * Domain A: Employer Management
   * ======================================================================== */

  app.get(
    "/api/internship/employers",
    requireAuth,
    requirePermission("internship.view"),
    listEmployerVerifications
  );

  app.post(
    "/api/internship/employers",
    requireAuth,
    requirePermission("internship.manage"),
    registerEmployer
  );

  app.get(
    "/api/internship/employers/:id",
    requireAuth,
    requirePermission("internship.view"),
    requireEmployerRead(),
    getEmployerProfile
  );

  app.patch(
    "/api/internship/employers/:id",
    requireAuth,
    requirePermission("internship.manage"),
    updateEmployerProfile
  );

  app.post(
    "/api/internship/employers/:id/verification",
    requireAuth,
    requireEmployerOwnerOrRecruiter,
    submitEmployerVerification
  );

  app.patch(
    "/api/internship/employers/:id/verification/:verificationId/review",
    requireAuth,
    requirePermission("internship.manage"),
    reviewEmployerVerification
  );

  app.get(
    "/api/internship/employers/verifications",
    requireAuth,
    requirePermission("internship.view"),
    listEmployerVerifications
  );

  app.post(
    "/api/internship/employers/:id/users",
    requireAuth,
    requirePermission("internship.manage"),
    addEmployerUser
  );

  app.patch(
    "/api/internship/employer-users/:id",
    requireAuth,
    requirePermission("internship.manage"),
    updateEmployerUser
  );

  app.delete(
    "/api/internship/employer-users/:id",
    requireAuth,
    requirePermission("internship.manage"),
    removeEmployerUser
  );

  app.get(
    "/api/internship/employers/:id/users",
    requireAuth,
    requirePermission("internship.view"),
    listEmployerUsers
  );

  /* ========================================================================
   * Domain B: Real Internships - Opportunities
   * ======================================================================== */

  app.post(
    "/api/internship/opportunities",
    requireAuth,
    requirePermission("internship.view"),
    async (req, res, next) => {
      // Employer users may create opportunities for their own company;
      // coordinators may create for any company.
      const isCoord = isCoordinatorRole(req.user);
      if (!isCoord) {
        const ctx = await resolveEmployerForUser(req.user);
        if (
          !ctx ||
          !["OWNER", "HR_RECRUITER"].includes(ctx.employerUser.employerRole)
        ) {
          return res.status(403).json({
            error: "Employer owner/recruiter or coordinator role required.",
            code: "EMPLOYER_ROLE_REQUIRED",
          });
        }
      }
      next();
    },
    createOpportunity
  );

  app.patch(
    "/api/internship/opportunities/:id",
    requireAuth,
    requirePermission("internship.view"),
    requireOpportunityRead(),
    async (req, res, next) => {
      const allowed = await canManageOpportunity(req.user, req.opportunity);
      if (!allowed) {
        return res.status(403).json({
          error: "You may only manage opportunities for your own company.",
          code: "OPPORTUNITY_NOT_OWNED",
        });
      }
      next();
    },
    updateOpportunity
  );

  app.patch(
    "/api/internship/opportunities/:id/approve",
    requireAuth,
    requirePermission("internship.manage"),
    approveOpportunity
  );

  app.get(
    "/api/internship/opportunities",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listOpportunities
  );

  /* ========================================================================
   * Domain B: Real Internships - Applications
   * ======================================================================== */

  app.post(
    "/api/internship/applications",
    requireAuth,
    requireStudent,
    createApplication
  );

  app.patch(
    "/api/internship/applications/:id/submit",
    requireAuth,
    requireStudent,
    requireApplicationRead(),
    async (req, res, next) => {
      const owned = await canManageApplication(req.user, req.application);
      if (!owned) {
        return res.status(403).json({
          error: "You may only submit your own applications.",
          code: "APPLICATION_NOT_OWNED",
        });
      }
      next();
    },
    submitApplication
  );

  app.patch(
    "/api/internship/applications/:id/review",
    requireAuth,
    requirePermission("internship.manage"),
    reviewApplication
  );

  app.patch(
    "/api/internship/applications/:id/shortlist",
    requireAuth,
    requirePermission("internship.manage"),
    shortlistApplication
  );

  app.get(
    "/api/internship/applications",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listApplications
  );

  app.get(
    "/api/internship/applications/:id",
    requireAuth,
    requirePermission("internship.view"),
    requireApplicationRead(),
    getApplication
  );

  /* ========================================================================
   * Domain B: Real Internships - Interviews
   * ======================================================================== */

  app.post(
    "/api/internship/interviews",
    requireAuth,
    requirePermission("internship.manage"),
    scheduleInterview
  );

  app.patch(
    "/api/internship/interviews/:id/complete",
    requireAuth,
    requirePermission("internship.manage"),
    completeInterview
  );

  /* ========================================================================
   * Domain B: Real Internships - Offers
   * ======================================================================== */

  app.post(
    "/api/internship/offers",
    requireAuth,
    requirePermission("internship.manage"),
    issueOffer
  );

  app.patch(
    "/api/internship/offers/:id/accept",
    requireAuth,
    requireStudent,
    acceptOffer
  );

  app.patch(
    "/api/internship/offers/:id/decline",
    requireAuth,
    requireStudent,
    declineOffer
  );

  /* ========================================================================
   * Domain B: Real Internships - Placements
   * ======================================================================== */

  app.post(
    "/api/internship/placements",
    requireAuth,
    requirePermission("internship.manage"),
    createPlacement
  );

  app.patch(
    "/api/internship/placements/:id/confirm",
    requireAuth,
    requirePermission("internship.manage"),
    confirmPlacement
  );

  app.patch(
    "/api/internship/placements/:id",
    requireAuth,
    requirePermission("internship.manage"),
    updatePlacement
  );

  app.patch(
    "/api/internship/placements/:id/leave",
    requireAuth,
    requirePermission("internship.manage"),
    managePlacementLeave
  );

  app.patch(
    "/api/internship/placements/:id/terminate",
    requireAuth,
    requirePermission("internship.manage"),
    terminatePlacement
  );

  app.patch(
    "/api/internship/placements/:id/extend",
    requireAuth,
    requirePermission("internship.manage"),
    extendPlacement
  );

  app.patch(
    "/api/internship/placements/:id/complete",
    requireAuth,
    requirePermission("internship.manage"),
    completePlacement
  );

  app.get(
    "/api/internship/placements",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listPlacements
  );

  app.get(
    "/api/internship/placements/:id",
    requireAuth,
    requirePermission("internship.view"),
    requirePlacementRead(),
    getPlacement
  );

  /* ========================================================================
   * Domain B: Real Internships - Supervisors
   * ======================================================================== */

  app.get(
    "/api/internship/supervisors",
    requireAuth,
    requirePermission("internship.view"),
    listSupervisors
  );

  app.post(
    "/api/internship/supervisors",
    requireAuth,
    requirePermission("internship.manage"),
    createSupervisor
  );

  app.patch(
    "/api/internship/placements/:id/supervisor",
    requireAuth,
    requirePermission("internship.manage"),
    assignIndustrySupervisor
  );

  /* ========================================================================
   * Domain B: Real Internships - Tasks
   * ======================================================================== */

  app.post(
    "/api/internship/tasks",
    requireAuth,
    requireFaculty,
    createTask
  );

  app.patch(
    "/api/internship/tasks/:id",
    requireAuth,
    requireFaculty,
    updateTask
  );

  app.get(
    "/api/internship/placements/:placementId/tasks",
    requireAuth,
    requirePermission("internship.view"),
    listTasks
  );

  /* ========================================================================
   * Domain B: Real Internships - Logbooks
   * ======================================================================== */

  app.post(
    "/api/internship/placements/:placementId/logbooks",
    requireAuth,
    requireStudent,
    submitLogbook
  );

  app.patch(
    "/api/internship/logbooks/:id/review",
    requireAuth,
    requireFaculty,
    reviewLogbook
  );

  app.get(
    "/api/internship/placements/:placementId/logbooks",
    requireAuth,
    requirePermission("internship.view"),
    listLogbooks
  );

  /* ========================================================================
   * Domain B: Real Internships - Attendance
   * ======================================================================== */

  app.post(
    "/api/internship/placements/:placementId/attendance",
    requireAuth,
    requireFaculty,
    recordAttendance
  );

  app.patch(
    "/api/internship/attendance/:id/approve",
    requireAuth,
    requireFaculty,
    approveAttendance
  );

  app.get(
    "/api/internship/placements/:placementId/attendance",
    requireAuth,
    requirePermission("internship.view"),
    listAttendance
  );

  /* ========================================================================
   * Domain B: Real Internships - Reports
   * ======================================================================== */

  app.post(
    "/api/internship/placements/:placementId/reports",
    requireAuth,
    requireStudent,
    submitReport
  );

  app.patch(
    "/api/internship/reports/:id/review",
    requireAuth,
    requireFaculty,
    reviewReport
  );

  app.get(
    "/api/internship/placements/:placementId/reports",
    requireAuth,
    requirePermission("internship.view"),
    listReports
  );

  /* ========================================================================
   * Domain B: Real Internships - Evaluations
   * ======================================================================== */

  app.post(
    "/api/internship/evaluations",
    requireAuth,
    async (req, res, next) => {
      // Faculty or employer supervisor may create evaluations.
      const roles = req.user.roles || [];
      if (!roles.includes("faculty")) {
        const ctx = await resolveEmployerForUser(req.user);
        if (
          !ctx ||
          !["OWNER", "HR_RECRUITER", "SUPERVISOR", "MENTOR"].includes(
            ctx.employerUser.employerRole
          )
        ) {
          return res.status(403).json({
            error: "Faculty or employer supervisor role required.",
            code: "EVALUATOR_ROLE_REQUIRED",
          });
        }
      }
      next();
    },
    createEvaluation
  );

  app.get(
    "/api/internship/evaluations",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listEvaluations
  );

  app.get(
    "/api/internship/placements/:id/verify-completion",
    requireAuth,
    requirePermission("internship.manage"),
    verifyCompletionRequirements
  );

  /* ========================================================================
   * Domain B: Real Internships - Credentials
   * ======================================================================== */

  app.post(
    "/api/internship/placements/:id/credentials",
    requireAuth,
    requirePermission("internship.manage"),
    issueCredential
  );

  app.patch(
    "/api/internship/credentials/:id/revoke",
    requireAuth,
    requirePermission("internship.manage"),
    revokeCredential
  );

  app.get(
    "/api/internship/credentials/verify/:hash",
    requireAuth,
    requirePermission("internship.view"),
    verifyCredentialByHash
  );

  app.get(
    "/api/internship/credentials",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listCredentials
  );

  /* ========================================================================
   * Domain C: Industry Projects
   * ======================================================================== */

  app.post(
    "/api/internship/industry-projects",
    requireAuth,
    requirePermission("internship.manage"),
    createProject
  );

  app.patch(
    "/api/internship/industry-projects/:id/approve",
    requireAuth,
    requirePermission("internship.manage"),
    approveProject
  );

  app.patch(
    "/api/internship/industry-projects/:id",
    requireAuth,
    requirePermission("internship.manage"),
    updateProject
  );

  app.get(
    "/api/internship/industry-projects",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listProjects
  );

  app.post(
    "/api/internship/industry-projects/:id/apply",
    requireAuth,
    requireStudent,
    applyToProject
  );

  app.patch(
    "/api/internship/industry-projects/memberships/:id/decide",
    requireAuth,
    requirePermission("internship.manage"),
    decideMembership
  );

  app.get(
    "/api/internship/industry-projects/:id/memberships",
    requireAuth,
    requirePermission("internship.view"),
    listMemberships
  );

  app.post(
    "/api/internship/industry-projects/tasks",
    requireAuth,
    requireFaculty,
    createProjectTask
  );

  app.patch(
    "/api/internship/industry-projects/tasks/:id",
    requireAuth,
    requireFaculty,
    updateProjectTask
  );

  app.post(
    "/api/internship/industry-projects/submissions",
    requireAuth,
    requireStudent,
    submitWork
  );

  app.patch(
    "/api/internship/industry-projects/submissions/:id/review",
    requireAuth,
    requireFaculty,
    reviewSubmission
  );

  app.get(
    "/api/internship/industry-projects/submissions",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listSubmissions
  );

  app.post(
    "/api/internship/industry-projects/evaluations",
    requireAuth,
    requireFaculty,
    evaluateProjectStudent
  );

  app.patch(
    "/api/internship/industry-projects/:id/complete",
    requireAuth,
    requirePermission("internship.manage"),
    completeProject
  );

  /* ========================================================================
   * Domain D: Virtual Workplace Simulations
   * ======================================================================== */

  app.post(
    "/api/internship/virtual-workplace/templates",
    requireAuth,
    requirePermission("internship.manage"),
    createCompanyTemplate
  );

  app.patch(
    "/api/internship/virtual-workplace/templates/:id",
    requireAuth,
    requirePermission("internship.manage"),
    updateCompanyTemplate
  );

  app.get(
    "/api/internship/virtual-workplace/templates",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listCompanyTemplates
  );

  app.post(
    "/api/internship/virtual-workplace/simulations",
    requireAuth,
    requirePermission("internship.manage"),
    createSimulation
  );

  app.patch(
    "/api/internship/virtual-workplace/simulations/:id",
    requireAuth,
    requirePermission("internship.manage"),
    configureSimulation
  );

  app.get(
    "/api/internship/virtual-workplace/simulations",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listSimulations
  );

  app.post(
    "/api/internship/virtual-workplace/simulations/:id/apply",
    requireAuth,
    requireStudent,
    applyToSimulation
  );

  app.patch(
    "/api/internship/virtual-workplace/applications/:id/review",
    requireAuth,
    requirePermission("internship.manage"),
    reviewSimulationApplication
  );

  app.post(
    "/api/internship/virtual-workplace/applications/:id/membership",
    requireAuth,
    requirePermission("internship.manage"),
    createMembership
  );

app.get(
    "/api/internship/virtual-workplace/simulations/:id/memberships",
    requireAuth,
    requirePermission("internship.view"),
    listSimulationMemberships
  );

  app.get(
    "/api/internship/virtual-workplace/memberships/:id/validate",
    requireAuth,
    requirePermission("internship.view"),
    validateMembership
  );

  app.get(
    "/api/internship/virtual-workplace/memberships/:id/workspace",
    requireAuth,
    requirePermission("internship.view"),
    getWorkspaceData
  );

  app.get(
    "/api/internship/virtual-workplace/memberships/mine",
    requireAuth,
    requireStudent,
    getStudentMemberships
  );

  app.post(
    "/api/internship/virtual-workplace/simulations/:id/teams",
    requireAuth,
    requirePermission("internship.manage"),
    createTeam
  );

  app.post(
    "/api/internship/virtual-workplace/simulations/:id/projects",
    requireAuth,
    requirePermission("internship.manage"),
    createSimulationProject
  );

  app.post(
    "/api/internship/virtual-workplace/simulations/:id/tasks",
    requireAuth,
    requirePermission("internship.manage"),
    createSimulationTask
  );

  app.patch(
    "/api/internship/virtual-workplace/tasks/:id",
    requireAuth,
    requirePermission("internship.manage"),
    updateSimulationTask
  );

  app.post(
    "/api/internship/virtual-workplace/tasks/:id/submit",
    requireAuth,
    requireStudent,
    submitSimulationWork
  );

  app.patch(
    "/api/internship/virtual-workplace/submissions/:id/review",
    requireAuth,
    requirePermission("internship.manage"),
    reviewSimulationSubmission
  );

  app.post(
    "/api/internship/virtual-workplace/simulations/:id/events",
    requireAuth,
    requirePermission("internship.manage"),
    createEvent
  );

  app.post(
    "/api/internship/virtual-workplace/competency-evidence",
    requireAuth,
    requireStudent,
    createCompetencyEvidence
  );

  app.patch(
    "/api/internship/virtual-workplace/competency-evidence/:id/verify",
    requireAuth,
    requirePermission("internship.manage"),
    verifyCompetencyEvidence
  );

  app.post(
    "/api/internship/virtual-workplace/portfolios",
    requireAuth,
    requireStudent,
    createOrUpdatePortfolio
  );

  app.get(
    "/api/internship/virtual-workplace/portfolios/:slug",
    requireAuth,
    requirePermission("internship.view"),
    getPortfolio
  );

app.get(
    "/api/internship/virtual-workplace/portfolios",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listPortfolios
  );

  /* ========================================================================
   * Domain E: Career Explorer
   * ======================================================================== */

  app.post(
    "/api/careers/categories",
    requireAuth,
    requirePermission("internship.manage"),
    createCareerCategory
  );

  app.patch(
    "/api/careers/categories/:id",
    requireAuth,
    requirePermission("internship.manage"),
    updateCareerCategory
  );

  app.get(
    "/api/careers/categories",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listCareerCategories
  );

  app.get(
    "/api/careers/categories/:id",
    requireAuth,
    requirePermission("internship.view"),
    getCareerCategory
  );

  app.post(
    "/api/careers/roles",
    requireAuth,
    requirePermission("internship.manage"),
    createCareerRole
  );

  app.patch(
    "/api/careers/roles/:id",
    requireAuth,
    requirePermission("internship.manage"),
    updateCareerRole
  );

  app.get(
    "/api/careers/roles",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listCareerRoles
  );

  app.get(
    "/api/careers/roles/:id",
    requireAuth,
    requirePermission("internship.view"),
    getCareerRole
  );

  app.post(
    "/api/careers/roles/compare",
    requireAuth,
    requirePermission("internship.view"),
    compareCareerRoles
  );

  app.post(
    "/api/careers/interests",
    requireAuth,
    requireStudent,
    addCareerInterest
  );

  app.patch(
    "/api/careers/interests/:id",
    requireAuth,
    requireStudent,
    updateCareerInterest
  );

  app.delete(
    "/api/careers/interests/:id",
    requireAuth,
    requireStudent,
    removeCareerInterest
  );

  app.get(
    "/api/careers/interests",
    requireAuth,
    requireStudent,
    listCareerInterests
  );

  app.post(
    "/api/careers/exploration/activity",
    requireAuth,
    requireStudent,
    recordExplorationActivity
  );

  app.get(
    "/api/careers/exploration/history",
    requireAuth,
    requireStudent,
    getExplorationHistory
  );

  app.get(
    "/api/careers/dashboard",
    requireAuth,
    requirePermission("internship.view"),
    getCareerExplorerDashboard
  );

  /* ========================================================================
   * Domain F: Virtual Company Engine
   * ======================================================================== */

  app.post(
    "/api/virtual-companies/templates/generate",
    requireAuth,
    requirePermission("internship.manage"),
    generateVirtualCompanyTemplate
  );

  app.post(
    "/api/virtual-companies/from-template",
    requireAuth,
    requirePermission("internship.manage"),
    createVirtualCompanyFromTemplate
  );

  app.get(
    "/api/virtual-companies",
    requireAuth,
    requirePermission("internship.view"),
    paginationMiddleware,
    listVirtualCompanies
  );

  app.get(
    "/api/virtual-companies/:id",
    requireAuth,
    requirePermission("internship.view"),
    getVirtualCompany
  );

  app.post(
    "/api/virtual-companies/workspace-configs",
    requireAuth,
    requirePermission("internship.manage"),
    createSpecialistWorkspaceConfig
  );

  app.patch(
    "/api/virtual-companies/workspace-configs/:careerPath",
    requireAuth,
    requirePermission("internship.manage"),
    updateSpecialistWorkspaceConfig
  );

  app.get(
    "/api/virtual-companies/workspace-configs",
    requireAuth,
    requirePermission("internship.view"),
    listSpecialistWorkspaceConfigs
  );

  app.get(
    "/api/virtual-companies/workspace-configs/:careerPath",
    requireAuth,
    requirePermission("internship.view"),
    getSpecialistWorkspaceConfig
  );

  app.post(
    "/api/virtual-companies/workspace-configs/seed",
    requireAuth,
    requirePermission("internship.manage"),
    seedDefaultWorkspaceConfigs
  );

  /* ========================================================================
   * Domain G: AI Virtual Workforce
   * ======================================================================== */

  app.post(
    "/api/ai-workforce/agents",
    requireAuth,
    requirePermission("internship.manage"),
    createVirtualAgent
  );

  app.patch(
    "/api/ai-workforce/agents/:id",
    requireAuth,
    requirePermission("internship.manage"),
    updateVirtualAgent
  );

  app.get(
    "/api/ai-workforce/agents",
    requireAuth,
    requirePermission("internship.view"),
    listVirtualAgents
  );

  app.get(
    "/api/ai-workforce/agents/:id",
    requireAuth,
    requirePermission("internship.view"),
    getVirtualAgent
  );

  app.post(
    "/api/ai-workforce/agents/seed",
    requireAuth,
    requirePermission("internship.manage"),
    seedDefaultAgents
  );

  app.post(
    "/api/ai-workforce/scenarios",
    requireAuth,
    requirePermission("internship.manage"),
    createSimulationScenario
  );

  app.get(
    "/api/ai-workforce/scenarios",
    requireAuth,
    requirePermission("internship.view"),
    listSimulationScenarios
  );

  app.get(
    "/api/ai-workforce/scenarios/:id",
    requireAuth,
    requirePermission("internship.view"),
    getSimulationScenario
  );

  app.post(
    "/api/ai-workforce/scenarios/seed",
    requireAuth,
    requirePermission("internship.manage"),
    seedDefaultScenarios
  );

  app.post(
    "/api/ai-workforce/agents/respond",
    requireAuth,
    requirePermission("internship.view"),
    generateAgentResponse
  );

  app.post(
    "/api/ai-workforce/agents/simulate-message",
    requireAuth,
    requirePermission("internship.manage"),
    simulateAgentMessage
  );
}


