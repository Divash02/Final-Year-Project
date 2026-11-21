import {
  badRequest,
  notFound,
  forbidden,
} from "../../utils/apiError.js";
import { logAudit } from "../auditService.js";

/**
 * Controlled workflow state machines for the Internships & Industry Experience module.
 *
 * These transitions are enforced in the service layer so no workflow can be
 * advanced by frontend logic alone. Every transition is audited.
 */

const APPLICATION_TRANSITIONS = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["INTERVIEW_SCHEDULED", "REJECTED"],
  INTERVIEW_SCHEDULED: ["OFFER_EXTENDED", "REJECTED"],
  OFFER_EXTENDED: ["OFFER_ACCEPTED", "OFFER_DECLINED", "REJECTED"],
  OFFER_ACCEPTED: ["ACTIVE", "COMPLETED"],
  OFFER_DECLINED: [],
  REJECTED: [],
  ACTIVE: ["COMPLETED", "TERMINATED"],
  COMPLETED: [],
  TERMINATED: [],
  ARCHIVED: [],
};

const PLACEMENT_TRANSITIONS = {
  PENDING_ONBOARDING: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["ON_LEAVE", "COMPLETED", "TERMINATED", "EXTENDED"],
  ON_LEAVE: ["ACTIVE"],
  COMPLETED: [],
  TERMINATED: [],
  EXTENDED: ["ACTIVE"],
};

const SUBMISSION_TRANSITIONS = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REVISION_REQUESTED", "REJECTED"],
  REVISION_REQUESTED: ["RESUBMITTED", "REJECTED"],
  RESUBMITTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
};

const OFFER_TRANSITIONS = {
  EXTENDED: ["ACCEPTED", "DECLINED", "EXPIRED", "REVOKED"],
  ACCEPTED: [],
  DECLINED: [],
  EXPIRED: [],
  REVOKED: [],
};

const LOGBOOK_TRANSITIONS = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["APPROVED", "REVIEWED", "NEEDS_REVISION"],
  REVIEWED: [],
  NEEDS_REVISION: ["SUBMITTED"],
  APPROVED: [],
};

const REPORT_TRANSITIONS = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW", "REVISION_REQUESTED"],
  UNDER_REVIEW: ["APPROVED", "REVISION_REQUESTED"],
  REVISION_REQUESTED: ["RESUBMITTED"],
  RESUBMITTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
};

const WORKFLOWS = {
  application: APPLICATION_TRANSITIONS,
  placement: PLACEMENT_TRANSITIONS,
  submission: SUBMISSION_TRANSITIONS,
  offer: OFFER_TRANSITIONS,
  logbook: LOGBOOK_TRANSITIONS,
  report: REPORT_TRANSITIONS,
};

/**
 * Validate and record a state transition for a given workflow domain.
 *
 * @param {string} domain - one of: application, placement, submission, offer, logbook, report
 * @param {string} fromStatus - current status
 * @param {string} toStatus - target status
 * @param {Object} context - audit context { userId, resource, resourceId, action, details }
 * @returns {Object} { valid: true, fromStatus, toStatus }
 * @throws {ApiError} 409 if the transition is not permitted
 */
export function validateTransition(domain, fromStatus, toStatus, context = {}) {
  const transitions = WORKFLOWS[domain];
  if (!transitions) {
    throw badRequest(`Unknown workflow domain: ${domain}`);
  }

  const allowed = transitions[fromStatus];
  if (!allowed) {
    throw badRequest(`Unknown status "${fromStatus}" for ${domain} workflow.`);
  }

  if (!allowed.includes(toStatus)) {
    const allowedList = allowed.join(", ") || "(none - terminal state)";
    throw badRequest(
      `Invalid ${domain} transition from "${fromStatus}" to "${toStatus}". Allowed: ${allowedList}.`,
      { code: "INVALID_WORKFLOW_TRANSITION", fromStatus, toStatus, allowed },
    );
  }

  void logAudit({
    userId: context.userId || null,
    action: context.action || `${domain}.transition`,
    module: "internship",
    resource: context.resource || domain,
    resourceId: context.resourceId ? String(context.resourceId) : null,
    oldValue: { status: fromStatus },
    newValue: { status: toStatus },
    details: context.details || null,
    metadata: { domain, fromStatus, toStatus },
  });

  return { valid: true, fromStatus, toStatus };
}

/**
 * Return the allowed next statuses for a given domain and current status.
 */
export function allowedNextStatuses(domain, fromStatus) {
  const transitions = WORKFLOWS[domain];
  if (!transitions) throw badRequest(`Unknown workflow domain: ${domain}`);
  const allowed = transitions[fromStatus];
  if (!allowed) throw badRequest(`Unknown status "${fromStatus}" for ${domain} workflow.`);
  return [...allowed];
}

/**
 * Application-specific transition helpers with descriptive action names.
 */
export const ApplicationWorkflow = {
  submit: (ctx) => validateTransition("application", "DRAFT", "SUBMITTED", ctx),
  startReview: (ctx) =>
    validateTransition("application", "SUBMITTED", "UNDER_REVIEW", ctx),
  shortlist: (ctx) =>
    validateTransition("application", "UNDER_REVIEW", "SHORTLISTED", ctx),
  scheduleInterview: (ctx) =>
    validateTransition("application", "SHORTLISTED", "INTERVIEW_SCHEDULED", ctx),
  extendOffer: (ctx) =>
    validateTransition("application", "INTERVIEW_SCHEDULED", "OFFER_EXTENDED", ctx),
  acceptOffer: (ctx) =>
    validateTransition("application", "OFFER_EXTENDED", "OFFER_ACCEPTED", ctx),
  declineOffer: (ctx) =>
    validateTransition("application", "OFFER_EXTENDED", "OFFER_DECLINED", ctx),
  reject: (ctx, fromStatus) =>
    validateTransition("application", fromStatus, "REJECTED", ctx),
  activate: (ctx) =>
    validateTransition("application", "OFFER_ACCEPTED", "ACTIVE", ctx),
  complete: (ctx) =>
    validateTransition("application", "OFFER_ACCEPTED", "COMPLETED", ctx),
};

export const PlacementWorkflow = {
  confirm: (ctx) =>
    validateTransition("placement", "PENDING_ONBOARDING", "ACTIVE", ctx),
  grantLeave: (ctx) =>
    validateTransition("placement", "ACTIVE", "ON_LEAVE", ctx),
  returnFromLeave: (ctx) =>
    validateTransition("placement", "ON_LEAVE", "ACTIVE", ctx),
  complete: (ctx) =>
    validateTransition("placement", "ACTIVE", "COMPLETED", ctx),
  terminate: (ctx, fromStatus) =>
    validateTransition("placement", fromStatus, "TERMINATED", ctx),
  extend: (ctx) =>
    validateTransition("placement", "ACTIVE", "EXTENDED", ctx),
};

export const SubmissionWorkflow = {
  submit: (ctx) => validateTransition("submission", "DRAFT", "SUBMITTED", ctx),
  startReview: (ctx) =>
    validateTransition("submission", "SUBMITTED", "UNDER_REVIEW", ctx),
  approve: (ctx) =>
    validateTransition("submission", "UNDER_REVIEW", "APPROVED", ctx),
  requestRevision: (ctx) =>
    validateTransition("submission", "UNDER_REVIEW", "REVISION_REQUESTED", ctx),
  resubmit: (ctx) =>
    validateTransition("submission", "REVISION_REQUESTED", "RESUBMITTED", ctx),
  reject: (ctx, fromStatus) =>
    validateTransition("submission", fromStatus, "REJECTED", ctx),
};

export const LogbookWorkflow = {
  submit: (ctx) => validateTransition("logbook", "DRAFT", "SUBMITTED", ctx),
  approve: (ctx) =>
    validateTransition("logbook", "SUBMITTED", "APPROVED", ctx),
  review: (ctx) =>
    validateTransition("logbook", "SUBMITTED", "REVIEWED", ctx),
  requestRevision: (ctx) =>
    validateTransition("logbook", "SUBMITTED", "NEEDS_REVISION", ctx),
  resubmit: (ctx) =>
    validateTransition("logbook", "NEEDS_REVISION", "SUBMITTED", ctx),
};

export const ReportWorkflow = {
  submit: (ctx) => validateTransition("report", "DRAFT", "SUBMITTED", ctx),
  startReview: (ctx) =>
    validateTransition("report", "SUBMITTED", "UNDER_REVIEW", ctx),
  approve: (ctx) =>
    validateTransition("report", "UNDER_REVIEW", "APPROVED", ctx),
  requestRevision: (ctx) =>
    validateTransition("report", "UNDER_REVIEW", "REVISION_REQUESTED", ctx),
  resubmit: (ctx) =>
    validateTransition("report", "REVISION_REQUESTED", "RESUBMITTED", ctx),
  reject: (ctx, fromStatus) =>
    validateTransition("report", fromStatus, "REJECTED", ctx),
};

export const OfferWorkflow = {
  accept: (ctx) => validateTransition("offer", "EXTENDED", "ACCEPTED", ctx),
  decline: (ctx) => validateTransition("offer", "EXTENDED", "DECLINED", ctx),
  expire: (ctx) => validateTransition("offer", "EXTENDED", "EXPIRED", ctx),
  revoke: (ctx) => validateTransition("offer", "EXTENDED", "REVOKED", ctx),
};

export { WORKFLOWS, APPLICATION_TRANSITIONS, PLACEMENT_TRANSITIONS, SUBMISSION_TRANSITIONS };
