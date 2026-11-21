import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  badRequest,
  notFound,
  forbidden,
} from "../../utils/apiError.js";
import * as internshipService from "../../services/internship/internshipService.js";

/**
 * Domain B: Internship Management Controllers
 * Opportunities, Applications, Interviews, Offers
 * Thin HTTP layer; all business logic lives in internshipService.
 */

/* ------------------------------------------------------------------ */
/* Opportunities                                                      */
/* ------------------------------------------------------------------ */

export const createOpportunity = asyncHandler(async (req, res) => {
  const { employer, title, durationMonths, deadline, description } = req.body;
  if (!employer || !title || !durationMonths || !deadline || !description) {
    throw badRequest("Employer, title, durationMonths, deadline, and description are required.");
  }
  const opportunity = await internshipService.createOpportunity(req.body, {
    createdBy: req.user._id || req.user.id,
  });
  res.status(201).json({ opportunity });
});

export const updateOpportunity = asyncHandler(async (req, res) => {
  const opportunity = await internshipService.updateOpportunity(req.params.id, req.body, {
    updatedBy: req.user._id || req.user.id,
    requestingUser: req.user,
  });
  res.json({ opportunity });
});

export const approveOpportunity = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status || !["DRAFT", "PENDING_APPROVAL", "OPEN", "CLOSED", "ARCHIVED"].includes(status)) {
    throw badRequest("Valid opportunity status is required.");
  }
  const opportunity = await internshipService.approveOpportunity(req.params.id, { status }, {
    requestingUser: req.user,
  });
  res.json({ opportunity });
});

export const listOpportunities = asyncHandler(async (req, res) => {
  const result = await internshipService.listOpportunities(
    {
      employer: req.query.employer,
      status: req.query.status,
      workMode: req.query.workMode,
      isVerified: req.query.isVerified,
    },
    { page: req.query.page, limit: req.query.limit },
  );
  res.json(result);
});

/* ------------------------------------------------------------------ */
/* Applications                                                       */
/* ------------------------------------------------------------------ */

export const createApplication = asyncHandler(async (req, res) => {
  const { opportunity, academicYear, semester, title } = req.body;
  if (!opportunity || !academicYear || !semester || !title) {
    throw badRequest("Opportunity, academicYear, semester, and title are required.");
  }
  const application = await internshipService.createApplication(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ application });
});

export const submitApplication = asyncHandler(async (req, res) => {
  const application = await internshipService.submitApplication(req.params.id, {
    requestingUser: req.user,
  });
  res.json({ application });
});

export const reviewApplication = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) {
    throw badRequest("Status is required.");
  }
  const application = await internshipService.reviewApplication(req.params.id, {
    status,
    reviewNotes: req.body.reviewNotes,
    rejectionReason: req.body.rejectionReason,
    academicSupervisorId: req.body.academicSupervisorId,
    coordinatorId: req.body.coordinatorId,
  }, { requestingUser: req.user });
  res.json({ application });
});

export const shortlistApplication = asyncHandler(async (req, res) => {
  const application = await internshipService.shortlistApplication(req.params.id, {
    requestingUser: req.user,
  });
  res.json({ application });
});

export const listApplications = asyncHandler(async (req, res) => {
  const result = await internshipService.listApplications(
    {
      status: req.query.status,
      company: req.query.company,
      academicYear: req.query.academicYear,
      semester: req.query.semester,
    },
    { requestingUser: req.user, page: req.query.page, limit: req.query.limit },
  );
  res.json(result);
});

export const getApplication = asyncHandler(async (req, res) => {
  const result = await internshipService.getApplication(req.params.id, {
    requestingUser: req.user,
  });
  res.json(result);
});

/* ------------------------------------------------------------------ */
/* Interviews                                                         */
/* ------------------------------------------------------------------ */

export const scheduleInterview = asyncHandler(async (req, res) => {
  const { application, scheduledStartTime, scheduledEndTime } = req.body;
  if (!application || !scheduledStartTime || !scheduledEndTime) {
    throw badRequest("Application, scheduledStartTime, and scheduledEndTime are required.");
  }
  const interview = await internshipService.scheduleInterview(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ interview });
});

export const completeInterview = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) {
    throw badRequest("Status is required.");
  }
  const interview = await internshipService.completeInterview(req.params.id, {
    status,
    feedback: req.body.feedback,
    score: req.body.score,
    recommendation: req.body.recommendation,
  }, { requestingUser: req.user });
  res.json({ interview });
});

/* ------------------------------------------------------------------ */
/* Offers                                                             */
/* ------------------------------------------------------------------ */

export const issueOffer = asyncHandler(async (req, res) => {
  const { application, roleTitle, startDate, endDate, responseDeadline } = req.body;
  if (!application || !roleTitle || !startDate || !endDate || !responseDeadline) {
    throw badRequest("Application, roleTitle, startDate, endDate, and responseDeadline are required.");
  }
  const offer = await internshipService.issueOffer(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ offer });
});

export const acceptOffer = asyncHandler(async (req, res) => {
  const offer = await internshipService.acceptOffer(req.params.id, {
    requestingUser: req.user,
  });
  res.json({ offer });
});

export const declineOffer = asyncHandler(async (req, res) => {
  const offer = await internshipService.declineOffer(req.params.id, {
    declineReason: req.body.declineReason,
  }, { requestingUser: req.user });
  res.json({ offer });
});

