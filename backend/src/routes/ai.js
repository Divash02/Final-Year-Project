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

export function registerAIRoutes(app) {
  app.use(aiTelemetryMiddleware);

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
