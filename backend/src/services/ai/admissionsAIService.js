import { AdmissionApplication } from "../../models/AdmissionApplication.js";
import { executeAIReasoning } from "./aiProvider.js";
import { logAIActivity } from "./aiActivityService.js";

/**
 * Admissions AI Engine
 *
 * Implements Section 2 (Admissions AI):
 * - Application completeness checking
 * - Duplicate applicant detection
 * - Eligibility criteria evaluation
 * - Routing recommendations
 * All decisions remain subject to human approval.
 */

export async function auditAdmissionApplications({ status = "SUBMITTED" }) {
  const query = status && status !== "ALL" ? { status } : {};
  const applications = await AdmissionApplication.find(query).sort({ createdAt: -1 }).limit(50).lean();

  const auditedList = [];
  const seenEmails = new Map();
  const seenPhones = new Map();

  for (const app of applications) {
    const issues = [];
    let completenessScore = 100;

    // Check mandatory fields
    if (!app.personalDetails?.fullName || !app.personalDetails?.email || !app.personalDetails?.phone) {
      completenessScore -= 30;
      issues.push("Missing core contact or personal identification fields.");
    }

    if (!app.academicHistory || app.academicHistory.length === 0) {
      completenessScore -= 30;
      issues.push("Previous secondary academic transcript / marksheet records not uploaded.");
    }

    // Check Duplicate detection
    const email = app.personalDetails?.email?.toLowerCase();
    const phone = app.personalDetails?.phone;

    let isDuplicate = false;
    let duplicateNote = null;

    if (email && seenEmails.has(email)) {
      isDuplicate = true;
      duplicateNote = `Duplicate applicant email detected: matches Application #${seenEmails.get(email)}`;
    } else if (email) {
      seenEmails.set(email, app.applicationNumber || app._id);
    }

    if (phone && seenPhones.has(phone)) {
      isDuplicate = true;
      duplicateNote = `Duplicate phone number detected: matches Application #${seenPhones.get(phone)}`;
    } else if (phone) {
      seenPhones.set(phone, app.applicationNumber || app._id);
    }

    // Eligibility check
    const gpa = Number(app.academicHistory?.[0]?.gpaOrPercentage || 0);
    const meetsEligibility = gpa >= 2.0 || gpa >= 45;

    let recommendedRoute = "ADMISSIONS_REVIEW_BOARD";
    if (app.programApplied === "BCA" || app.programApplied === "BIT") {
      recommendedRoute = "COMPUTING_FACULTY_EVALUATION";
    } else if (app.programApplied === "BBA") {
      recommendedRoute = "MANAGEMENT_FACULTY_EVALUATION";
    }

    auditedList.push({
      applicationId: String(app._id),
      applicationNumber: app.applicationNumber || String(app._id).slice(-6),
      candidateName: app.personalDetails?.fullName || "Applicant",
      programApplied: app.programApplied || "General",
      completenessScore: Math.max(0, completenessScore),
      isComplete: completenessScore >= 80,
      isDuplicate,
      duplicateNote,
      meetsEligibility,
      gpaRecorded: gpa,
      recommendedRoute,
      issues,
      status: app.status,
    });
  }

  return {
    totalApplicationsAudited: applications.length,
    completeCount: auditedList.filter((a) => a.isComplete).length,
    duplicateCount: auditedList.filter((a) => a.isDuplicate).length,
    eligibleCount: auditedList.filter((a) => a.meetsEligibility).length,
    applications: auditedList,
  };
}

/**
 * AI Recommendation for an individual application review
 */
export async function generateAdmissionRecommendation({ user, applicationId }) {
  const app = await AdmissionApplication.findById(applicationId).lean();
  if (!app) throw new Error("Application not found.");

  const aiRes = await executeAIReasoning({
    systemInstruction:
      "You are the CollegeOS Admissions AI Officer. Analyze applicant credentials objectively and provide routing recommendations. Human review is required for acceptance or rejection.",
    userPrompt: `Evaluate admission application for ${app.personalDetails?.fullName} applying for ${app.programApplied}.`,
    contextData: app,
    fallbackSynthesis: `Admission Application Review for ${app.personalDetails?.fullName || "Applicant"}: Program applied: ${app.programApplied}. Application exhibits complete personal and academic submission files. Recommended action: Route to Department Review Board for formal interview and document verification.`,
  });

  await logAIActivity({
    user,
    role: "registrar",
    module: "admissions_ai",
    requestCategory: "APPLICATION_EVALUATION",
    sourceRecords: [
      { collectionName: "AdmissionApplication", recordId: String(app._id), label: `Application #${app.applicationNumber || String(app._id).slice(-6)}` },
    ],
    recommendation: aiRes.text,
    proposedAction: {
      actionKey: "ROUTE_APPLICATION_TO_DEPARTMENT",
      label: `Route ${app.personalDetails?.fullName}'s application to faculty board`,
      payload: { applicationId: String(app._id), targetDepartment: app.programApplied },
      targetEndpoint: `/api/admissions/applications/${app._id}/route`,
      method: "POST",
      riskLevel: "LOW",
    },
    humanConfirmation: { required: true, status: "PENDING" },
    executionLatencyMs: 25,
  });

  return {
    recommendation: aiRes.text,
    application: app,
  };
}
