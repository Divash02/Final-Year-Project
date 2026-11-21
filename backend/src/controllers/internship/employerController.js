import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  badRequest,
  notFound,
} from "../../utils/apiError.js";
import * as employerService from "../../services/internship/employerService.js";

/**
 * Domain A: Employer Management Controllers
 * Thin HTTP layer; all business logic lives in employerService.
 */

/**
 * POST /api/internship/employers
 */
export const registerEmployer = asyncHandler(async (req, res) => {
  const { contactEmail, name, ...rest } = req.body;
  if (!contactEmail || !name) {
    throw badRequest("Employer name and contact email are required.");
  }
  const employer = await employerService.registerEmployer(req.body, {
    createdBy: req.user._id || req.user.id,
  });
  res.status(201).json({
    success: true,
    employer: { id: String(employer._id), ...employer.toObject ? employer.toObject() : employer },
  });
});

/**
 * GET /api/internship/employers/:id
 */
export const getEmployerProfile = asyncHandler(async (req, res) => {
  const employer = await employerService.getEmployerProfile(req.params.id, {
    includeVerification: req.query.includeVerification === "true",
  });
  res.json({ employer });
});

/**
 * PATCH /api/internship/employers/:id
 */
export const updateEmployerProfile = asyncHandler(async (req, res) => {
  const employer = await employerService.updateEmployerProfile(req.params.id, req.body, {
    updatedBy: req.user._id || req.user.id,
  });
  res.json({ employer });
});

/**
 * POST /api/internship/employers/:id/verification
 */
export const submitEmployerVerification = asyncHandler(async (req, res) => {
  const { businessRegistrationNumber } = req.body;
  if (!businessRegistrationNumber) {
    throw badRequest("Business registration number is required.");
  }
  const verification = await employerService.submitEmployerVerification(
    { employerId: req.params.id, ...req.body },
    { submittedBy: req.user._id || req.user.id },
  );
  res.status(201).json({ verification });
});

/**
 * PATCH /api/internship/employers/:id/verification/:verificationId/review
 */
export const reviewEmployerVerification = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status || !["VERIFIED", "REJECTED"].includes(status)) {
    throw badRequest("Valid status (VERIFIED or REJECTED) is required.");
  }
  const result = await employerService.reviewEmployerVerification(
    req.params.verificationId,
    { status, rejectionReason: req.body.rejectionReason, remarks: req.body.remarks },
    { reviewedBy: req.user._id || req.user.id },
  );
  res.json({ verification: result });
});

/**
 * GET /api/internship/employers/verifications
 */
export const listEmployerVerifications = asyncHandler(async (req, res) => {
  const result = await employerService.listEmployerVerifications(
    { status: req.query.status, employerId: req.query.employerId },
    { page: req.query.page, limit: req.query.limit },
  );
  res.json(result);
});

/**
 * POST /api/internship/employers/:id/users
 */
export const addEmployerUser = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    throw badRequest("User ID is required.");
  }
  const employerUser = await employerService.addEmployerUser(
    { employerId: req.params.id, ...req.body },
    req.user._id || req.user.id,
  );
  res.status(201).json({ employerUser });
});

/**
 * PATCH /api/internship/employer-users/:id
 */
export const updateEmployerUser = asyncHandler(async (req, res) => {
  const employerUser = await employerService.updateEmployerUser(
    req.params.id,
    req.body,
    req.user._id || req.user.id,
  );
  res.json({ employerUser });
});

/**
 * DELETE /api/internship/employer-users/:id
 */
export const removeEmployerUser = asyncHandler(async (req, res) => {
  await employerService.removeEmployerUser(req.params.id, req.user._id || req.user.id);
  res.json({ success: true });
});

/**
 * GET /api/internship/employers/:id/users
 */
export const listEmployerUsers = asyncHandler(async (req, res) => {
  const users = await employerService.listEmployerUsers(req.params.id);
  res.json({ users });
});

