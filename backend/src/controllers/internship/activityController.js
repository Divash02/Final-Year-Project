import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  badRequest,
  notFound,
} from "../../utils/apiError.js";
import * as activityService from "../../services/internship/activityService.js";

/**
 * Domain B: Tasks, Logbooks, Attendance, Reports Controllers
 * Thin HTTP layer; all business logic lives in activityService.
 */

/* ------------------------------------------------------------------ */
/* Tasks                                                              */
/* ------------------------------------------------------------------ */

export const createTask = asyncHandler(async (req, res) => {
  const { placement, student, title } = req.body;
  if (!placement || !student || !title) {
    throw badRequest("placement, student, and title are required.");
  }
  const task = await activityService.createTask(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ task });
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await activityService.updateTask(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.json({ task });
});

export const listTasks = asyncHandler(async (req, res) => {
  const tasks = await activityService.listTasks(req.params.placementId, {
    requestingUser: req.user,
  });
  res.json({ tasks });
});

/* ------------------------------------------------------------------ */
/* Logbooks                                                           */
/* ------------------------------------------------------------------ */

export const submitLogbook = asyncHandler(async (req, res) => {
  const { placement, weekNumber, weekStartDate, weekEndDate, activitiesSummary, hoursWorked } = req.body;
  if (!placement || !weekNumber || !weekStartDate || !weekEndDate || !activitiesSummary) {
    throw badRequest("placement, weekNumber, weekStartDate, weekEndDate, activitiesSummary, and hoursWorked are required.");
  }
  const logbook = await activityService.submitLogbook(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ logbook });
});

export const reviewLogbook = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status || !["APPROVED", "REVIEWED", "NEEDS_REVISION"].includes(status)) {
    throw badRequest("Valid status (APPROVED, REVIEWED, or NEEDS_REVISION) is required.");
  }
  const logbook = await activityService.reviewLogbook(req.params.id, {
    status,
    supervisorFeedback: req.body.supervisorFeedback,
    academicSupervisorFeedback: req.body.academicSupervisorFeedback,
  }, { requestingUser: req.user });
  res.json({ logbook });
});

export const listLogbooks = asyncHandler(async (req, res) => {
  const logbooks = await activityService.listLogbooks(req.params.placementId, {
    requestingUser: req.user,
  });
  res.json({ logbooks });
});

/* ------------------------------------------------------------------ */
/* Attendance                                                         */
/* ------------------------------------------------------------------ */

export const recordAttendance = asyncHandler(async (req, res) => {
  const { placement, student, date } = req.body;
  if (!placement || !student || !date) {
    throw badRequest("placement, student, and date are required.");
  }
  const attendance = await activityService.recordAttendance(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ attendance });
});

export const approveAttendance = asyncHandler(async (req, res) => {
  const attendance = await activityService.approveAttendance(req.params.id, {
    requestingUser: req.user,
  });
  res.json({ attendance });
});

export const listAttendance = asyncHandler(async (req, res) => {
  const records = await activityService.listAttendance(req.params.placementId, {
    requestingUser: req.user,
  });
  res.json({ attendance: records });
});

/* ------------------------------------------------------------------ */
/* Reports                                                            */
/* ------------------------------------------------------------------ */

export const submitReport = asyncHandler(async (req, res) => {
  const { placement, reportType, title } = req.body;
  if (!placement || !reportType || !title) {
    throw badRequest("placement, reportType, and title are required.");
  }
  const report = await activityService.submitReport(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ report });
});

export const reviewReport = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status || !["APPROVED", "REVISION_REQUESTED"].includes(status)) {
    throw badRequest("Valid status (APPROVED or REVISION_REQUESTED) is required.");
  }
  const report = await activityService.reviewReport(req.params.id, {
    status,
    academicGrade: req.body.academicGrade,
    facultyRemarks: req.body.facultyRemarks,
  }, { requestingUser: req.user });
  res.json({ report });
});

export const listReports = asyncHandler(async (req, res) => {
  const reports = await activityService.listReports(req.params.placementId, {
    requestingUser: req.user,
  });
  res.json({ reports });
});

