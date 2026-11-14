import { requireAuth } from "../middleware/authentication.js";
import { requirePermission, requireRole } from "../middleware/authorization.js";
import { aiTelemetryMiddleware } from "../middleware/aiTelemetry.js";
import { getUserRoles } from "../db.js";
import { processOperationsAgentQuery } from "../services/ai/operationsAgentService.js";
import {
  getAIActivityLogs,
  confirmAIAction,
} from "../services/ai/aiActivityService.js";
import {
  runDeterministicAnomalyDetection,
  getAnomalyAlerts,
  updateAnomalyAlertStatus,
} from "../services/ai/anomalyEngine.js";
import {
  getStudentEarlyWarningAnalytics,
  facultyCopilotAssist,
  studentCopilotAssist,
} from "../services/ai/academicAIService.js";
import {
  getExaminationAnalytics,
  generateExamAIReport,
} from "../services/ai/examAIService.js";
import {
  getFinanceAnalytics,
  generateFinanceAISummary,
} from "../services/ai/financeAIService.js";
import {
  auditAdmissionApplications,
  generateAdmissionRecommendation,
} from "../services/ai/admissionsAIService.js";
import {
  auditWorkflowCasesIntelligence,
  generateCaseAIDiagnosis,
} from "../services/ai/caseAIService.js";
import {
  getSecurityOperationsDashboard,
  triggerSimulatedSecurityIncident,
  investigateSecurityIncident,
} from "../services/ai/securityAIService.js";
import {
  getSystemHealthMetrics,
  triggerSimulatedSystemIncident,
} from "../services/ai/systemHealthService.js";
import { queryKnowledgeAssistant } from "../services/ai/ragService.js";
import { extractTranscriptData } from "../services/ai/documentIntelligenceService.js";
import { generateCustomAIReport } from "../services/ai/reportGeneratorService.js";
import { simulateScenario } from "../services/ai/scenarioSimulatorService.js";
import {
  mineProcessWorkflowData,
  generateProcessMiningAISummary,
} from "../services/ai/processMiningService.js";
import { orchestrateGraduationReadiness } from "../services/ai/orchestratorService.js";
import {
  getITAssetSummary,
  createITTicketWithAITriage,
} from "../services/ai/itServiceManagement.js";
import {
  issueStudentDigitalCredential,
  verifyDigitalCredentialToken,
} from "../services/ai/credentialsService.js";
import {
  createAttendanceQRSession,
  submitStudentQRCheckIn,
  concludeAttendanceQRSession,
} from "../services/ai/smartAttendanceService.js";
import {
  enqueueAIJob,
  getAIJob,
  listAIJobs,
} from "../services/ai/aiJobService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
// Registers the AI job handlers (kind -> service) as a side effect.
import "../services/ai/aiJobHandlers.js";

/**
 * Path -> permission map for the AI surface.
 *
 * The permission catalog already declares granular `ai.*` grants, but the
 * route handlers only checked authentication, so any authenticated user could
 * reach finance/security/system-health AI. This middleware closes that gap in
 * one place instead of repeating the check in every handler.
 *
 * Order matters: the first matching prefix wins, so specific prefixes are
 * listed before broader ones.
 */
const AI_PERMISSION_RULES = [
  [/^\/api\/ai\/operations(\/|$)/, "ai.operations"],
  [/^\/api\/ai\/activity-logs(\/|$)/, "ai.audit.view"],
  [/^\/api\/ai\/actions\/confirm(\/|$)/, "ai.action.confirm"],
  [/^\/api\/ai\/anomalies(\/|$)/, "ai.view"],
  [/^\/api\/ai\/academic(\/|$)/, "ai.academic"],
  [/^\/api\/ai\/examination(\/|$)/, "ai.examination"],
  [/^\/api\/ai\/finance(\/|$)/, "ai.finance"],
  [/^\/api\/ai\/admissions(\/|$)/, "ai.admissions"],
  [/^\/api\/ai\/cases(\/|$)/, "ai.cases"],
  [/^\/api\/ai\/security(\/|$)/, "ai.security"],
  [/^\/api\/ai\/system(\/|$)/, "ai.system_health"],
  [/^\/api\/ai\/knowledge(\/|$)/, "ai.view"],
  [/^\/api\/ai\/documents\/extract-transcript(\/|$)/, "ai.documents.extract"],
  [/^\/api\/ai\/reports(\/|$)/, "ai.operations"],
  [/^\/api\/ai\/simulator(\/|$)/, "ai.scenario.simulate"],
  [/^\/api\/ai\/process-mining(\/|$)/, "ai.view"],
  [/^\/api\/ai\/orchestration(\/|$)/, "ai.operations"],
  [/^\/api\/ai\/it-service(\/|$)/, "ai.assets"],
  [/^\/api\/ai\/credentials\/issue(\/|$)/, "ai.credentials"],
  [/^\/api\/ai\/attendance\/qr-session(\/|$)/, "attendance.session.create"],
  [/^\/api\/ai\/attendance\/qr-checkin(\/|$)/, "attendance.qr.checkin"],
  [/^\/api\/ai\/attendance\/qr-session\/.+\/conclude(\/|$)/, "attendance.session.close"],
  [/^\/api\/ai\/jobs(\/|$)/, "ai.view"],
];

const AI_PUBLIC_PATHS = [/^\/api\/ai\/credentials\/verify\//];

function requestPath(req) {
  // Inside a router mounted at /api/ai, `req.path` is relative to the mount;
  // `req.baseUrl` carries the mount prefix. Combine them so path rules match
  // the full URL regardless of where the middleware is mounted.
  return `${req.baseUrl || ""}${req.path}`;
}

function isAIPublicPath(path) {
  return AI_PUBLIC_PATHS.some((pattern) => pattern.test(path));
}

export function aiAuthorization(req, res, next) {
  const path = requestPath(req);
  if (isAIPublicPath(path)) return next();
  const rule = AI_PERMISSION_RULES.find(([pattern]) => pattern.test(path));
  if (!rule) return next();
  return requirePermission(rule[1])(req, res, next);
}

/**
 * Authenticates the AI surface except for the deliberately public credential
 * verification endpoint, then applies the granular permission for the path.
 * Handlers keep their own requireAuth as defence in depth.
 */
function aiAuthGate(req, res, next) {
  if (isAIPublicPath(requestPath(req))) return next();
  return requireAuth(req, res, next);
}

export function registerAIRoutes(app) {
  app.use(aiTelemetryMiddleware);
  app.use("/api/ai", aiAuthGate, aiAuthorization);

  /* ------------------------------------------------------------- */
  /* 0. Background AI Jobs (async execution & status tracking)     */
  /* ------------------------------------------------------------- */
  app.get(
    "/api/ai/jobs",
    requireAuth,
    asyncHandler(async (req, res) => {
      const jobs = await listAIJobs({
        status: req.query.status,
        limit: Number(req.query.limit) || 25,
      });
      res.json({ jobs });
    }),
  );

  app.get(
    "/api/ai/jobs/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const job = await getAIJob(req.params.id);
      res.json({ job });
    }),
  );

  app.post(
    "/api/ai/jobs",
    requireAuth,
    asyncHandler(async (req, res) => {
      const kind = String(req.body?.kind || "").trim();
      if (!kind) {
        return res.status(400).json({ error: "A job kind is required.", code: "BAD_REQUEST" });
      }
      const { job, reused } = await enqueueAIJob({
        kind,
        payload: req.body?.payload || {},
        idempotencyKey: req.body?.idempotencyKey || null,
        requestedBy: req.user._id || req.user.id,
        requestedRole: getUserRoles(req.user)[0] || null,
      });
      res.status(reused ? 200 : 202).json({ job, reused });
    }),
  );

  /* ------------------------------------------------------------- */
  /* 1. AI Operations Agent                                        */
  /* ------------------------------------------------------------- */
  app.post("/api/ai/operations", requireAuth, async (req, res, next) => {
    try {
      const roles = getUserRoles(req.user);
      const activeRole = roles[0] || "student";
      const result = await processOperationsAgentQuery({
        user: req.user,
        role: activeRole,
        queryPrompt: req.body.queryPrompt,
        idempotencyKey: req.body.idempotencyKey,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 2. AI Activity Log & Human Action Confirmation                */
  /* ------------------------------------------------------------- */
  app.get("/api/ai/activity-logs", requireAuth, async (req, res, next) => {
    try {
      const roles = getUserRoles(req.user);
      const activeRole = roles[0] || "student";
      const logs = await getAIActivityLogs({
        userRole: activeRole,
        userId: req.user._id || req.user.id,
        module: req.query.module,
        limit: req.query.limit,
        page: req.query.page,
        pendingOnly: req.query.pendingOnly === "true",
      });
      res.json(logs);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/actions/confirm", requireAuth, async (req, res, next) => {
    try {
      const result = await confirmAIAction({
        logId: req.body.logId,
        user: req.user,
        approved: req.body.approved !== false,
        notes: req.body.notes,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 3. Deterministic Anomaly Alerts                               */
  /* ------------------------------------------------------------- */
  app.get("/api/ai/anomalies", requireAuth, async (req, res, next) => {
    try {
      const alerts = await getAnomalyAlerts({
        module: req.query.module,
        severity: req.query.severity,
        status: req.query.status || "OPEN",
      });
      res.json({ alerts });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/anomalies/scan", requireAuth, async (req, res, next) => {
    try {
      const created = await runDeterministicAnomalyDetection();
      res.json({ success: true, count: created.length, alerts: created });
    } catch (err) {
      next(err);
    }
  });

  app.patch("/api/ai/anomalies/:id/status", requireAuth, async (req, res, next) => {
    try {
      const updated = await updateAnomalyAlertStatus({
        alertId: req.params.id,
        user: req.user,
        status: req.body.status,
        resolutionNotes: req.body.resolutionNotes,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 4. Academic AI & Early Warning                                */
  /* ------------------------------------------------------------- */
  app.get("/api/ai/academic/early-warnings", requireAuth, async (req, res, next) => {
    try {
      const roles = getUserRoles(req.user);
      const activeRole = roles[0] || "student";
      const result = await getStudentEarlyWarningAnalytics({
        user: req.user,
        role: activeRole,
        department: req.query.department,
        program: req.query.program,
        semester: req.query.semester,
        thresholdAttendance: req.query.thresholdAttendance,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/academic/faculty-copilot", requireAuth, async (req, res, next) => {
    try {
      const result = await facultyCopilotAssist({
        user: req.user,
        action: req.body.action,
        courseId: req.body.courseId,
        contextPayload: req.body.contextPayload,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/academic/student-copilot", requireAuth, async (req, res, next) => {
    try {
      const result = await studentCopilotAssist({
        user: req.user,
        prompt: req.body.prompt,
        idempotencyKey: req.body.idempotencyKey,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 5. Examination AI & Analytics                                 */
  /* ------------------------------------------------------------- */
  app.get("/api/ai/examination/analytics", requireAuth, async (req, res, next) => {
    try {
      const result = await getExaminationAnalytics({
        examId: req.query.examId,
        program: req.query.program,
        semester: req.query.semester,
        academicYear: req.query.academicYear,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/examination/report", requireAuth, async (req, res, next) => {
    try {
      const roles = getUserRoles(req.user);
      const activeRole = roles[0] || "exam_officer";
      const result = await generateExamAIReport({
        user: req.user,
        role: activeRole,
        examId: req.body.examId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 6. Finance AI & Collections Analytics                         */
  /* ------------------------------------------------------------- */
  app.get("/api/ai/finance/analytics", requireAuth, async (req, res, next) => {
    try {
      const result = await getFinanceAnalytics({
        academicYear: req.query.academicYear,
        program: req.query.program,
        semester: req.query.semester,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/finance/summary", requireAuth, async (req, res, next) => {
    try {
      const roles = getUserRoles(req.user);
      const activeRole = roles[0] || "finance_officer";
      const result = await generateFinanceAISummary({
        user: req.user,
        role: activeRole,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 7. Admissions AI                                              */
  /* ------------------------------------------------------------- */
  app.get("/api/ai/admissions/audit", requireAuth, async (req, res, next) => {
    try {
      const result = await auditAdmissionApplications({
        status: req.query.status,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/admissions/recommendation", requireAuth, async (req, res, next) => {
    try {
      const result = await generateAdmissionRecommendation({
        user: req.user,
        applicationId: req.body.applicationId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 8. Requests & Cases AI                                        */
  /* ------------------------------------------------------------- */
  app.get("/api/ai/cases/intelligence", requireAuth, async (req, res, next) => {
    try {
      const result = await auditWorkflowCasesIntelligence();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/cases/diagnose", requireAuth, async (req, res, next) => {
    try {
      const result = await generateCaseAIDiagnosis({
        user: req.user,
        caseId: req.body.caseId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 9. Cybersecurity Operations Center                            */
  /* ------------------------------------------------------------- */
  app.get("/api/ai/security/dashboard", requireAuth, async (req, res, next) => {
    try {
      const result = await getSecurityOperationsDashboard({
        limit: req.query.limit,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/security/simulate", requireAuth, async (req, res, next) => {
    try {
      const result = await triggerSimulatedSecurityIncident({
        scenario: req.body.scenario,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/security/investigate", requireAuth, async (req, res, next) => {
    try {
      const result = await investigateSecurityIncident({
        alertId: req.body.alertId,
        user: req.user,
        action: req.body.action,
        investigationNotes: req.body.investigationNotes,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 10. System Health & Performance Diagnostics                   */
  /* ------------------------------------------------------------- */
  app.get("/api/ai/system/health", requireAuth, async (req, res, next) => {
    try {
      const result = await getSystemHealthMetrics();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/system/simulate", requireAuth, async (req, res, next) => {
    try {
      const result = await triggerSimulatedSystemIncident({
        incidentType: req.body.incidentType,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 11. Knowledge Assistant (RAG)                                 */
  /* ------------------------------------------------------------- */
  app.post("/api/ai/knowledge/query", requireAuth, async (req, res, next) => {
    try {
      const roles = getUserRoles(req.user);
      const activeRole = roles[0] || "student";
      const result = await queryKnowledgeAssistant({
        user: req.user,
        role: activeRole,
        query: req.body.query,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 12. Document Intelligence (Transcripts)                       */
  /* ------------------------------------------------------------- */
  app.post("/api/ai/documents/extract-transcript", requireAuth, async (req, res, next) => {
    try {
      const roles = getUserRoles(req.user);
      const activeRole = roles[0] || "registrar";
      // Long transcripts are CPU/IO heavy: callers may request asynchronous
      // execution and poll /api/ai/jobs/:id instead of holding the request open.
      if (req.body?.async === true) {
        const { job, reused } = await enqueueAIJob({
          kind: "documents.extract-transcript",
          payload: { rawText: req.body.rawText, fileName: req.body.fileName },
          idempotencyKey: req.body.idempotencyKey || null,
          requestedBy: req.user._id || req.user.id,
          requestedRole: activeRole,
        });
        return res.status(reused ? 200 : 202).json({ job, reused });
      }
      const result = await extractTranscriptData({
        user: req.user,
        role: activeRole,
        rawText: req.body.rawText,
        fileName: req.body.fileName,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 13. AI Report Generator                                       */
  /* ------------------------------------------------------------- */
  app.post("/api/ai/reports/generate", requireAuth, async (req, res, next) => {
    try {
      const roles = getUserRoles(req.user);
      const activeRole = roles[0] || "super_admin";
      // Report generation can be long-running; callers may enqueue it and poll
      // for the result instead of blocking on the HTTP request.
      if (req.body?.async === true) {
        const { job, reused } = await enqueueAIJob({
          kind: "reports.generate",
          payload: {
            reportPrompt: req.body.reportPrompt,
            format: req.body.format,
          },
          idempotencyKey: req.body.idempotencyKey || null,
          requestedBy: req.user._id || req.user.id,
          requestedRole: activeRole,
        });
        return res.status(reused ? 200 : 202).json({ job, reused });
      }
      const result = await generateCustomAIReport({
        user: req.user,
        role: activeRole,
        reportPrompt: req.body.reportPrompt,
        format: req.body.format,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 14. What-If Scenario Simulator                                */
  /* ------------------------------------------------------------- */
  app.post("/api/ai/simulator/simulate", requireAuth, async (req, res, next) => {
    try {
      const roles = getUserRoles(req.user);
      const activeRole = roles[0] || "super_admin";
      const result = await simulateScenario({
        user: req.user,
        role: activeRole,
        scenarioType: req.body.scenarioType,
        parameters: req.body.parameters,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 15. Process Mining & Workflow Intelligence                    */
  /* ------------------------------------------------------------- */
  app.get("/api/ai/process-mining", requireAuth, async (req, res, next) => {
    try {
      const result = await mineProcessWorkflowData();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/process-mining/summary", requireAuth, async (req, res, next) => {
    try {
      const roles = getUserRoles(req.user);
      const activeRole = roles[0] || "super_admin";
      const result = await generateProcessMiningAISummary({
        user: req.user,
        role: activeRole,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 16. Multi-Agent Cross-Module Orchestration                    */
  /* ------------------------------------------------------------- */
  app.post("/api/ai/orchestration/graduation-readiness", requireAuth, async (req, res, next) => {
    try {
      const roles = getUserRoles(req.user);
      const activeRole = roles[0] || "student";
      const result = await orchestrateGraduationReadiness({
        user: req.user,
        role: activeRole,
        studentId: req.body.studentId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 17. IT Asset & Service Management                             */
  /* ------------------------------------------------------------- */
  app.get("/api/ai/it-service/summary", requireAuth, async (req, res, next) => {
    try {
      const result = await getITAssetSummary();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/it-service/tickets", requireAuth, async (req, res, next) => {
    try {
      const result = await createITTicketWithAITriage({
        user: req.user,
        title: req.body.title,
        description: req.body.description,
        category: req.body.category,
        priority: req.body.priority,
        linkedAssetId: req.body.linkedAssetId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 18. Digital Student Credentials                               */
  /* ------------------------------------------------------------- */
  app.post("/api/ai/credentials/issue", requireAuth, async (req, res, next) => {
    try {
      const result = await issueStudentDigitalCredential({
        user: req.user,
        studentId: req.body.studentId,
        credentialType: req.body.credentialType,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/ai/credentials/verify/:credentialNumber", async (req, res, next) => {
    try {
      const result = await verifyDigitalCredentialToken(req.params.credentialNumber);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- */
  /* 19. Smart Attendance & QR Verification                        */
  /* ------------------------------------------------------------- */
  app.post("/api/ai/attendance/qr-session", requireAuth, async (req, res, next) => {
    try {
      const result = await createAttendanceQRSession({
        facultyUser: req.user,
        courseId: req.body.courseId,
        sectionCode: req.body.sectionCode,
        durationMinutes: req.body.durationMinutes,
        topic: req.body.topic,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/attendance/qr-checkin", requireAuth, async (req, res, next) => {
    try {
      const result = await submitStudentQRCheckIn({
        studentUser: req.user,
        sessionCode: req.body.sessionCode,
        sessionNonce: req.body.sessionNonce,
        clientIp: req.ip || "127.0.0.1",
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/ai/attendance/qr-session/:id/conclude", requireAuth, async (req, res, next) => {
    try {
      const result = await concludeAttendanceQRSession({
        sessionId: req.params.id,
        user: req.user,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });
}
