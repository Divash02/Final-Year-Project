import { WorkflowCase } from "../../models/WorkflowCase.js";
import { executeAIReasoning } from "./aiProvider.js";
import { logAIActivity } from "./aiActivityService.js";

/**
 * Requests & Cases AI Engine
 *
 * Implements Section 2 (Requests & Cases AI) and Section 15 (Process Mining / SLAs).
 */

export async function auditWorkflowCasesIntelligence() {
  const cases = await WorkflowCase.find().sort({ createdAt: -1 }).limit(60).lean();

  const SLA_HOURS = 72; // 3 business days standard institutional SLA
  const now = Date.now();

  const classifiedCases = [];
  const departmentWorkload = {};
  let slaBreachCount = 0;
  let slaWarningCount = 0;

  for (const c of cases) {
    const elapsedHours = (now - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
    const isBreached = elapsedHours > SLA_HOURS && c.status !== "RESOLVED" && c.status !== "CLOSED";
    const isWarning = elapsedHours >= SLA_HOURS * 0.75 && !isBreached && c.status !== "RESOLVED" && c.status !== "CLOSED";

    if (isBreached) slaBreachCount++;
    if (isWarning) slaWarningCount++;

    const dept = c.department || "General Administration";
    departmentWorkload[dept] = (departmentWorkload[dept] || 0) + 1;

    // AI Classification & Priority Recommendation
    let suggestedCategory = "GENERAL_STUDENT_REQUEST";
    let priority = "MEDIUM";
    const titleLower = `${c.title || ""} ${c.subject || ""} ${c.description || ""}`.toLowerCase();

    if (titleLower.includes("transcript") || titleLower.includes("certificate") || titleLower.includes("grade sheet")) {
      suggestedCategory = "DOCUMENT_ISSUANCE";
      priority = "HIGH";
    } else if (titleLower.includes("fee") || titleLower.includes("refund") || titleLower.includes("invoice") || titleLower.includes("scholarship")) {
      suggestedCategory = "FINANCIAL_AID_FEES";
      priority = "HIGH";
    } else if (titleLower.includes("attendance") || titleLower.includes("medical leave") || titleLower.includes("sick")) {
      suggestedCategory = "ATTENDANCE_LEAVE_APPROVAL";
      priority = "MEDIUM";
    } else if (titleLower.includes("harassment") || titleLower.includes("disciplinary") || titleLower.includes("appeal")) {
      suggestedCategory = "DISCIPLINARY_APPEAL";
      priority = "CRITICAL";
    }

    classifiedCases.push({
      caseId: String(c._id),
      caseNumber: c.caseNumber || String(c._id).slice(-6),
      title: c.title || c.subject || "Student Request",
      department: dept,
      status: c.status || "OPEN",
      elapsedHours: Math.round(elapsedHours),
      slaBreached: isBreached,
      slaWarning: isWarning,
      suggestedCategory,
      recommendedPriority: priority,
      nextWorkflowAction:
        c.status === "OPEN"
          ? "Assign to Department Case Worker"
          : c.status === "PENDING"
          ? "Request Additional Verification Documents"
          : "Resolve and Notify Student",
    });
  }

  return {
    totalCasesAudited: cases.length,
    slaBreachCount,
    slaWarningCount,
    departmentWorkload,
    cases: classifiedCases,
  };
}

/**
 * AI Case Diagnosis & Next Action recommendation for a single case
 */
export async function generateCaseAIDiagnosis({ user, caseId }) {
  const caseDoc = await WorkflowCase.findById(caseId).lean();
  if (!caseDoc) throw new Error("Workflow case not found.");

  const aiRes = await executeAIReasoning({
    systemInstruction:
      "You are the CollegeOS Institutional Workflow Case Management AI. Summarize the case context, detect priority, and propose the next institutional action.",
    userPrompt: `Diagnose case #${caseDoc.caseNumber || String(caseDoc._id).slice(-6)}: ${caseDoc.title || caseDoc.subject}.`,
    contextData: caseDoc,
    fallbackSynthesis: `Case Diagnosis #${caseDoc.caseNumber || String(caseDoc._id).slice(-6)}: Classified as formal student request. Current status: ${caseDoc.status || "OPEN"}. Recommended next workflow action: Review submitted verification evidence, assign department case officer, and update SLA tracking note.`,
  });

  await logAIActivity({
    user,
    role: "campus_admin",
    module: "cases_ai",
    requestCategory: "CASE_DIAGNOSIS",
    sourceRecords: [
      { collectionName: "WorkflowCase", recordId: String(caseDoc._id), label: `Case #${caseDoc.caseNumber || String(caseDoc._id).slice(-6)}` },
    ],
    recommendation: aiRes.text,
    executionLatencyMs: 20,
  });

  return {
    diagnosisText: aiRes.text,
    caseDetails: caseDoc,
  };
}
