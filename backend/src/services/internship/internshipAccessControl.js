import {
  InternshipApplication,
  InternshipOpportunity,
  InternshipPlacement,
  InternshipEvaluation,
  InternshipCredential,
  Employer,
  EmployerUser,
  Student,
  InternshipSupervisor,
} from "../../models/index.js";
import { getUserRoles, getStudentByUserId } from "../../db.js";
import { hasPermission } from "../../permissions/catalog.js";
import { notFound, forbidden } from "../../utils/apiError.js";

/**
 * Roles permitted to manage the internship module at the institution level.
 */
const MANAGE_ROLES = new Set([
  "super_admin",
  "dean",
  "hod",
  "program_coordinator",
  "registrar",
]);

/**
 * Roles permitted to view internship records.
 */
const VIEW_ROLES = new Set([
  "super_admin",
  "campus_admin",
  "dean",
  "hod",
  "program_coordinator",
  "registrar",
  "exam_officer",
  "finance_officer",
  "faculty",
  "student",
]);

/**
 * Resolve the authenticated user's roles.
 */
export function resolveRoles(user) {
  return getUserRoles(user);
}

/**
 * True when the user holds an internship.manage-equivalent role.
 */
export function isCoordinator(user) {
  const roles = resolveRoles(user);
  return roles.some((r) => MANAGE_ROLES.has(r));
}

/**
 * True when the user holds an internship.view-equivalent role.
 */
export function isViewer(user) {
  const roles = resolveRoles(user);
  return roles.some((r) => VIEW_ROLES.has(r));
}

/**
 * True when the user is a student.
 */
export function isStudent(user) {
  return getUserRoles(user).includes("student");
}

/**
 * True when the user is faculty.
 */
export function isFaculty(user) {
  return getUserRoles(user).includes("faculty");
}

/**
 * Resolve the student document for the authenticated user, if the user is a
 * student. Returns null otherwise.
 */
export async function resolveStudentForUser(user) {
  if (!isStudent(user)) return null;
  return await getStudentByUserId(String(user._id || user.id));
}

/**
 * Resolve the employer document that the authenticated user is associated
 * with through EmployerUser. Returns the employer id and the employer user
 * record, or null if no association exists.
 */
export async function resolveEmployerForUser(user) {
  const userId = String(user._id || user.id);
  const eu = await EmployerUser.findOne({ user: userId, status: "ACTIVE" }).lean();
  if (!eu) return null;
  return { employerId: String(eu.employer), employerUser: eu };
}

/**
 * Object-level authorisation: can the user read this application?
 *
 * Rules:
 * - Coordinators (internship.manage) may read any application.
 * - Faculty may read applications for placements they supervise.
 * - Students may read their own applications.
 * - Employer users (OWNER/HR_RECRUITER) may read applications to their own
 *   company's opportunities.
 * - Everyone else: denied.
 */
export async function canReadApplication(user, application) {
  const roles = resolveRoles(user);
  if (roles.some((r) => MANAGE_ROLES.has(r))) return true;

  const applicationStudentId = String(application.student);
  const applicationCompanyId = String(application.company);

  // Student owns their own application.
  if (isStudent(user)) {
    const student = await resolveStudentForUser(user);
    if (student && String(student._id) === applicationStudentId) return true;
  }

  // Faculty may read applications for their assigned placements.
  if (isFaculty(user)) {
    const placement = await InternshipPlacement.findOne({
      application: application._id,
      academicSupervisor: String(user._id || user.id),
    }).lean();
    if (placement) return true;
  }

  // Employer users may read applications to their own company.
  const employerCtx = await resolveEmployerForUser(user);
  if (
    employerCtx &&
    ["OWNER", "HR_RECRUITER"].includes(employerCtx.employerUser.employerRole) &&
    employerCtx.employerId === applicationCompanyId
  ) {
    return true;
  }

  return false;
}

/**
 * Object-level authorisation: can the user manage this application?
 * (submit, withdraw, update draft)
 */
export async function canManageApplication(user, application) {
  if (isStudent(user)) {
    const student = await resolveStudentForUser(user);
    if (student && String(student._id) === String(application.student)) return true;
  }
  return false;
}

/**
 * Object-level authorisation: can the user read this placement?
 */
export async function canReadPlacement(user, placement) {
  const roles = resolveRoles(user);
  if (roles.some((r) => MANAGE_ROLES.has(r))) return true;

  // Student owns their own placement.
  if (isStudent(user)) {
    const student = await resolveStudentForUser(user);
    if (student && String(student._id) === String(placement.student)) return true;
  }

  // Faculty supervisor.
  if (isFaculty(user)) {
    if (
      String(placement.academicSupervisor) === String(user._id || user.id) ||
      String(placement.industrySupervisor) === String(user._id || user.id)
    ) {
      return true;
    }
  }

  // Employer users for their own company's placements.
  const employerCtx = await resolveEmployerForUser(user);
  if (
    employerCtx &&
    ["OWNER", "HR_RECRUITER", "SUPERVISOR"].includes(employerCtx.employerUser.employerRole) &&
    employerCtx.employerId === String(placement.employer)
  ) {
    return true;
  }

  return false;
}

/**
 * Object-level authorisation: can the user read this opportunity?
 */
export async function canReadOpportunity(user, opportunity) {
  const roles = resolveRoles(user);
  if (roles.some((r) => VIEW_ROLES.has(r))) return true;

  // Employer users for their own company's opportunities.
  const employerCtx = await resolveEmployerForUser(user);
  if (
    employerCtx &&
    ["OWNER", "HR_RECRUITER"].includes(employerCtx.employerUser.employerRole) &&
    employerCtx.employerId === String(opportunity.employer)
  ) {
    return true;
  }

  return false;
}

/**
 * Object-level authorisation: can the user manage this opportunity?
 */
export async function canManageOpportunity(user, opportunity) {
  if (!isCoordinator(user)) {
    const employerCtx = await resolveEmployerForUser(user);
    if (
      employerCtx &&
      ["OWNER", "HR_RECRUITER"].includes(employerCtx.employerUser.employerRole) &&
      employerCtx.employerId === String(opportunity.employer)
    ) {
      return true;
    }
    return false;
  }
  return true;
}

/**
 * Object-level authorisation: can the user read this evaluation?
 */
export async function canReadEvaluation(user, evaluation) {
  const roles = resolveRoles(user);
  if (roles.some((r) => MANAGE_ROLES.has(r))) return true;

  // Evaluator owns their evaluation.
  if (String(evaluation.evaluatedBy) === String(user._id || user.id)) return true;

  // Student owns their own evaluation.
  if (isStudent(user)) {
    const student = await resolveStudentForUser(user);
    if (student && String(student._id) === String(evaluation.student)) return true;
  }

  return false;
}

/**
 * Object-level authorisation: can the user read this credential?
 */
export async function canReadCredential(user, credential) {
  const roles = resolveRoles(user);
  if (roles.some((r) => MANAGE_ROLES.has(r))) return true;

  if (isStudent(user)) {
    const student = await resolveStudentForUser(user);
    if (student && String(student._id) === String(credential.student)) return true;
  }

  return false;
}

/**
 * Object-level authorisation: can the user read this employer?
 */
export async function canReadEmployer(user, employer) {
  const roles = resolveRoles(user);
  if (roles.some((r) => VIEW_ROLES.has(r))) return true;

  const employerCtx = await resolveEmployerForUser(user);
  if (employerCtx && employerCtx.employerId === String(employer._id)) return true;

  return false;
}

/**
 * Object-level authorisation: can the user manage this employer?
 */
export async function canManageEmployer(user, employer) {
  if (isCoordinator(user)) return true;

  const employerCtx = await resolveEmployerForUser(user);
  if (
    employerCtx &&
    employerCtx.employerUser.employerRole === "OWNER" &&
    employerCtx.employerId === String(employer._id)
  ) {
    return true;
  }
  return false;
}

/**
 * Middleware factory: load an application by id and attach it to req, then
 * verify the user may read it. Use on GET /api/internship/applications/:id.
 */
export function requireApplicationRead() {
  return async (req, res, next) => {
    const application = await InternshipApplication.findById(req.params.id).lean();
    if (!application) return res.status(404).json({ error: "Application not found.", code: "NOT_FOUND" });
    const allowed = await canReadApplication(req.user, application);
    if (!allowed) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions.", code: "FORBIDDEN" });
    }
    req.application = application;
    next();
  };
}

/**
 * Middleware factory: load a placement by id and attach it to req, then
 * verify the user may read it.
 */
export function requirePlacementRead() {
  return async (req, res, next) => {
    const placement = await InternshipPlacement.findById(req.params.id).lean();
    if (!placement) return res.status(404).json({ error: "Placement not found.", code: "NOT_FOUND" });
    const allowed = await canReadPlacement(req.user, placement);
    if (!allowed) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions.", code: "FORBIDDEN" });
    }
    req.placement = placement;
    next();
  };
}

/**
 * Middleware factory: load an opportunity by id and attach it to req, then
 * verify the user may read it.
 */
export function requireOpportunityRead() {
  return async (req, res, next) => {
    const opportunity = await InternshipOpportunity.findById(req.params.id).lean();
    if (!opportunity) return res.status(404).json({ error: "Opportunity not found.", code: "NOT_FOUND" });
    const allowed = await canReadOpportunity(req.user, opportunity);
    if (!allowed) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions.", code: "FORBIDDEN" });
    }
    req.opportunity = opportunity;
    next();
  };
}

/**
 * Middleware factory: load an employer by id and attach it to req, then
 * verify the user may read it.
 */
export function requireEmployerRead() {
  return async (req, res, next) => {
    const employer = await Employer.findById(req.params.id).lean();
    if (!employer) return res.status(404).json({ error: "Employer not found.", code: "NOT_FOUND" });
    const allowed = await canReadEmployer(req.user, employer);
    if (!allowed) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions.", code: "FORBIDDEN" });
    }
    req.employer = employer;
    next();
  };
}

/**
 * Middleware factory: load an evaluation by id and attach it to req, then
 * verify the user may read it.
 */
export function requireEvaluationRead() {
  return async (req, res, next) => {
    const evaluation = await InternshipEvaluation.findById(req.params.id).lean();
    if (!evaluation) return res.status(404).json({ error: "Evaluation not found.", code: "NOT_FOUND" });
    const allowed = await canReadEvaluation(req.user, evaluation);
    if (!allowed) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions.", code: "FORBIDDEN" });
    }
    req.evaluation = evaluation;
    next();
  };
}

/**
 * Build a Mongo filter that restricts list results to what the user may read,
 * based on their role and the resource type.
 *
 * @param {Object} user - authenticated user
 * @param {string} resource - "application" | "placement" | "opportunity" | "employer" | "evaluation" | "credential"
 * @returns {Object} Mongo query filter
 */
export async function buildListFilter(user, resource) {
  const roles = resolveRoles(user);

  // Coordinators see everything.
  if (roles.some((r) => MANAGE_ROLES.has(r))) return {};

  // Students see only their own records.
  if (isStudent(user)) {
    const student = await resolveStudentForUser(user);
    if (!student) return { _id: null }; // match nothing
    switch (resource) {
      case "application":
        return { student: student._id };
      case "placement":
        return { student: student._id };
      case "evaluation":
        return { student: student._id };
      case "credential":
        return { student: student._id };
      default:
        return { _id: null };
    }
  }

  // Faculty see records for their assigned placements/students.
  if (isFaculty(user)) {
    switch (resource) {
      case "placement":
        return {
          $or: [
            { academicSupervisor: String(user._id || user.id) },
            { industrySupervisor: String(user._id || user.id) },
          ],
        };
      case "evaluation":
        return { evaluatedBy: String(user._id || user.id) };
      default:
        return {};
    }
  }

  // Employer users see records for their own company.
  const employerCtx = await resolveEmployerForUser(user);
  if (employerCtx) {
    switch (resource) {
      case "opportunity":
        return { employer: employerCtx.employerId };
      case "application":
        return { company: employerCtx.employerId };
      case "placement":
        return { employer: employerCtx.employerId };
      default:
        return {};
    }
  }

  return {};
}

/**
 * Pagination helper: normalise page/limit and compute skip/limit.
 * @param {Object} query - Express query object
 * @returns {Object} { page, limit, skip, sort }
 */
export function paginate(query) {
  const page = Math.max(1, parseInt(String(query.page || "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || "20"), 10)));
  const skip = (page - 1) * limit;
  const sort = {};
  const sortField = query.sortBy || "createdAt";
  const sortDir = String(query.sortDir || "desc").toLowerCase() === "asc" ? 1 : -1;
  sort[sortField] = sortDir;
  return { page, limit, skip, sort };
}

/**
 * Standard list response wrapper.
 * @param {Array} items - hydrated documents
 * @param {number} total - total matching count
 * @param {Object} pagination - { page, limit, skip }
 * @returns {Object}
 */
export function listResponse(items, total, pagination) {
  return {
    items,
    total,
    page: pagination.page,
    limit: pagination.limit,
    pages: Math.ceil(total / pagination.limit),
    hasMore: pagination.page * pagination.limit < total,
  };
}
