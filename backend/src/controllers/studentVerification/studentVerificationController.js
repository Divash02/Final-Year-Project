import {
  listVerifications,
  getVerification,
  submitVerification,
  reviewVerification,
  getVerificationHistory,
  getVerificationDashboard,
} from "../../services/studentVerification/studentVerificationService.js";

export async function listVerificationsController(req, res) {
  const result = await listVerifications({ user: req.user, query: req.query });
  res.json(result);
}

export async function getVerificationController(req, res) {
  const result = await getVerification({ user: req.user, verificationId: req.params.id });
  res.json(result);
}

export async function submitVerificationController(req, res) {
  const result = await submitVerification({ user: req.user, body: req.body });
  res.status(201).json(result);
}

export async function reviewVerificationController(req, res) {
  const result = await reviewVerification({
    user: req.user,
    verificationId: req.params.id,
    body: req.body,
  });
  res.json(result);
}

export async function getVerificationHistoryController(req, res) {
  const result = await getVerificationHistory({
    user: req.user,
    verificationId: req.params.id,
  });
  res.json(result);
}

export async function getVerificationDashboardController(req, res) {
  const result = await getVerificationDashboard({ user: req.user, query: req.query });
  res.json(result);
}
