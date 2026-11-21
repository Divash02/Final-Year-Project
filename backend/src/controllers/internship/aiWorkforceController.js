import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  badRequest,
  notFound,
} from "../../utils/apiError.js";
import * as aiWorkforceService from "../../services/internship/aiWorkforceService.js";

/**
 * AI Virtual Workforce Controllers
 */

export const createVirtualAgent = asyncHandler(async (req, res) => {
  const { simulation, name, role, careerPath } = req.body;
  if (!simulation || !name || !role || !careerPath) {
    throw badRequest("simulation, name, role, and careerPath are required.");
  }
  const agent = await aiWorkforceService.createVirtualAgent(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ agent });
});

export const updateVirtualAgent = asyncHandler(async (req, res) => {
  const agent = await aiWorkforceService.updateVirtualAgent(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.json({ agent });
});

export const listVirtualAgents = asyncHandler(async (req, res) => {
  const agents = await aiWorkforceService.listVirtualAgents({
    simulation: req.query.simulation,
    role: req.query.role,
    careerPath: req.query.careerPath,
    isActive: req.query.isActive,
  });
  res.json({ agents });
});

export const getVirtualAgent = asyncHandler(async (req, res) => {
  const agent = await aiWorkforceService.getVirtualAgent(req.params.id);
  res.json({ agent });
});

export const seedDefaultAgents = asyncHandler(async (req, res) => {
  const { simulationId } = req.body;
  if (!simulationId) {
    throw badRequest("simulationId is required.");
  }
  const agents = await aiWorkforceService.seedDefaultAgents(simulationId, { requestingUser: req.user });
  res.json({ agents, count: agents.length });
});

/* ------------------------------------------------------------------ */
/* Simulation Scenarios                                               */
/* ------------------------------------------------------------------ */

export const createSimulationScenario = asyncHandler(async (req, res) => {
  const { simulation, name, scenarioType } = req.body;
  if (!simulation || !name || !scenarioType) {
    throw badRequest("simulation, name, and scenarioType are required.");
  }
  const scenario = await aiWorkforceService.createSimulationScenario(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ scenario });
});

export const listSimulationScenarios = asyncHandler(async (req, res) => {
  const scenarios = await aiWorkforceService.listSimulationScenarios({
    simulation: req.query.simulation,
    scenarioType: req.query.scenarioType,
    isActive: req.query.isActive,
  });
  res.json({ scenarios });
});

export const getSimulationScenario = asyncHandler(async (req, res) => {
  const scenario = await aiWorkforceService.getSimulationScenario(req.params.id);
  res.json({ scenario });
});

export const seedDefaultScenarios = asyncHandler(async (req, res) => {
  const { simulationId } = req.body;
  if (!simulationId) {
    throw badRequest("simulationId is required.");
  }
  const scenarios = await aiWorkforceService.seedDefaultScenarios(simulationId, { requestingUser: req.user });
  res.json({ scenarios, count: scenarios.length });
});

/* ------------------------------------------------------------------ */
/* AI Agent Interactions                                              */
/* ------------------------------------------------------------------ */

export const generateAgentResponse = asyncHandler(async (req, res) => {
  const { agentId, context, studentMessage } = req.body;
  if (!agentId || !studentMessage) {
    throw badRequest("agentId and studentMessage are required.");
  }
  const response = await aiWorkforceService.generateAgentResponse(agentId, context, studentMessage);
  res.json({ response });
});

export const simulateAgentMessage = asyncHandler(async (req, res) => {
  const { simulationId, channelName, agentRole, content } = req.body;
  if (!simulationId || !channelName || !agentRole || !content) {
    throw badRequest("simulationId, channelName, agentRole, and content are required.");
  }
  const message = await aiWorkforceService.simulateAgentMessage(simulationId, channelName, agentRole, content, {
    requestingUser: req.user,
  });
  res.status(201).json({ message });
});