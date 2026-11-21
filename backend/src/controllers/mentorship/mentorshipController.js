import {
  listAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  listSessions,
  createSession,
  updateSession,
  listObservations,
  createObservation,
  getMentoringDashboard,
} from "../../services/mentorship/mentorshipService.js";

export async function listAssignmentsController(req, res) {
  const result = await listAssignments({ user: req.user, query: req.query });
  res.json(result);
}

export async function getAssignmentController(req, res) {
  const result = await getAssignment({ user: req.user, assignmentId: req.params.id });
  res.json(result);
}

export async function createAssignmentController(req, res) {
  const result = await createAssignment({ user: req.user, body: req.body });
  res.status(201).json(result);
}

export async function updateAssignmentController(req, res) {
  const result = await updateAssignment({ user: req.user, assignmentId: req.params.id, body: req.body });
  res.json(result);
}

export async function listSessionsController(req, res) {
  const result = await listSessions({ user: req.user, query: req.query });
  res.json(result);
}

export async function createSessionController(req, res) {
  const result = await createSession({ user: req.user, body: req.body });
  res.status(201).json(result);
}

export async function updateSessionController(req, res) {
  const result = await updateSession({ user: req.user, sessionId: req.params.id, body: req.body });
  res.json(result);
}

export async function listObservationsController(req, res) {
  const result = await listObservations({ user: req.user, query: req.query });
  res.json(result);
}

export async function createObservationController(req, res) {
  const result = await createObservation({ user: req.user, body: req.body });
  res.status(201).json(result);
}

export async function getMentoringDashboardController(req, res) {
  const result = await getMentoringDashboard({ user: req.user, query: req.query });
  res.json(result);
}
