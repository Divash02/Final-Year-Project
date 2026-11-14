import { registerAIJobHandler } from "./aiJobService.js";
import { processOperationsAgentQuery } from "./operationsAgentService.js";
import { generateCustomAIReport } from "./reportGeneratorService.js";
import { extractTranscriptData } from "./documentIntelligenceService.js";
import { generateProcessMiningAISummary } from "./processMiningService.js";
import { generateExamAIReport } from "./examAIService.js";
import { generateFinanceAISummary } from "./financeAIService.js";
import { runDeterministicAnomalyDetection } from "./anomalyEngine.js";

/**
 * Binds AI service functions to job kinds.
 *
 * Routes enqueue a job by kind; the worker resolves the handler from this map.
 * This is the only place that imports the heavy AI services for execution, so
 * the Express request path never depends on them directly.
 */

registerAIJobHandler("operations.query", async ({ payload, user, role }) =>
  processOperationsAgentQuery({
    user,
    role,
    queryPrompt: payload.queryPrompt,
    idempotencyKey: payload.idempotencyKey || null,
  }),
);

registerAIJobHandler("reports.generate", async ({ payload, user, role }) =>
  generateCustomAIReport({
    user,
    role,
    reportPrompt: payload.reportPrompt,
    format: payload.format,
  }),
);

registerAIJobHandler("documents.extract-transcript", async ({ payload, user, role }) =>
  extractTranscriptData({
    user,
    role,
    rawText: payload.rawText,
    fileName: payload.fileName,
  }),
);

registerAIJobHandler("process-mining.summary", async ({ payload, user, role }) =>
  generateProcessMiningAISummary({ user, role, ...payload }),
);

registerAIJobHandler("examination.report", async ({ payload, user, role }) =>
  generateExamAIReport({
    user,
    role,
    examId: payload.examId,
  }),
);

registerAIJobHandler("finance.summary", async ({ payload, user, role }) =>
  generateFinanceAISummary({ user, role, ...payload }),
);

registerAIJobHandler("anomalies.scan", async () => runDeterministicAnomalyDetection());

export default true;