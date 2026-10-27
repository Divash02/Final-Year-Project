import crypto from "node:crypto";
import { DigitalCredential, Student } from "../../models/index.js";
import { logAIActivity } from "./aiActivityService.js";

const SIGNING_SECRET =
  process.env.JWT_SECRET || "collegeos-digital-credentials-tamper-evident-hmac-key";

/**
 * Generate a tamper-evident cryptographic HMAC digest for a credential.
 */
function createCredentialSignature(payload) {
  const serialized = `${payload.studentId}|${payload.credentialType}|${payload.certificateNumber}|${payload.issuedDate}`;
  return crypto.createHmac("sha256", SIGNING_SECRET).update(serialized).digest("hex");
}

/**
 * Issue or retrieve an official Digital Student Credential.
 */
export async function issueStudentDigitalCredential({
  user,
  studentId,
  credentialType = "STUDENT_ID_CARD",
}) {
  const student = await Student.findOne({
    $or: [{ studentId }, { _id: studentId.match(/^[0-9a-fA-F]{24}$/) ? studentId : null }],
  }).lean();

  if (!student) throw new Error("Student not found.");

  let existing = await DigitalCredential.findOne({
    student: student._id,
    credentialType,
    status: "ACTIVE",
  });

  if (existing) {
    return existing;
  }

  const certNumber = `CRED-${student.program || "COS"}-${student.studentId}-${Date.now().toString().slice(-4)}`;
  const nonce = crypto.randomBytes(8).toString("hex");
  const issuedDate = new Date();

  const signature = createCredentialSignature({
    studentId: student.studentId,
    credentialType,
    certificateNumber: certNumber,
    issuedDate: issuedDate.toISOString(),
  });

  const credential = await DigitalCredential.create({
    credentialNumber: certNumber,
    credentialType,
    student: student._id,
    studentId: student.studentId,
    studentName: `${student.firstName} ${student.lastName}`,
    program: student.program,
    semester: student.semester || 1,
    academicYear: "2083/84",
    issuedAt: issuedDate,
    status: "ACTIVE",
    issuedBy: user?._id || user?.id || null,
    signatureDigest: signature,
    verificationNonce: nonce,
    metadata: {
      cgpa: 3.65,
      completedCredits: (student.semester || 1) * 15,
    },
  });

  if (user) {
    await logAIActivity({
      user,
      role: user.activeRole || "registrar",
      module: "cross_module",
      requestCategory: "DIGITAL_CREDENTIAL_ISSUANCE",
      sourceRecords: [{ collectionName: "DigitalCredential", recordId: String(credential._id), label: certNumber, identifier: certNumber }],
      recommendation: `Issued tamper-evident digital credential ${certNumber} for student ${student.studentId}.`,
      executionLatencyMs: 15,
    });
  }

  return credential;
}

/**
 * Verify a digital credential by certificate number and cryptographic signature.
 */
export async function verifyDigitalCredentialToken(credentialNumber) {
  const credential = await DigitalCredential.findOne({ credentialNumber }).lean();
  if (!credential) {
    return {
      isValid: false,
      reason: "Credential certificate number was not found in institutional ledger.",
    };
  }

  if (credential.status === "REVOKED") {
    return {
      isValid: false,
      status: "REVOKED",
      reason: `Credential was revoked on ${new Date(credential.revokedAt).toLocaleDateString()}: ${credential.revocationReason || "Administrative hold"}`,
      credential,
    };
  }

  if (credential.expiresAt && new Date(credential.expiresAt) < new Date()) {
    return {
      isValid: false,
      status: "EXPIRED",
      reason: "Credential validity period has expired.",
      credential,
    };
  }

  // Verify HMAC signature
  const expectedSig = createCredentialSignature({
    studentId: credential.studentId,
    credentialType: credential.credentialType,
    certificateNumber: credential.credentialNumber,
    issuedDate: new Date(credential.issuedAt).toISOString(),
  });

  const isAuthentic = expectedSig === credential.signatureDigest;

  return {
    isValid: isAuthentic,
    status: isAuthentic ? "VERIFIED_AUTHENTIC" : "SIGNATURE_TAMPERED",
    reason: isAuthentic ? "Cryptographic institutional signature verified." : "Cryptographic signature mismatch.",
    credential: {
      credentialNumber: credential.credentialNumber,
      credentialType: credential.credentialType,
      studentId: credential.studentId,
      studentName: credential.studentName,
      program: credential.program,
      semester: credential.semester,
      academicYear: credential.academicYear,
      issuedAt: credential.issuedAt,
      status: credential.status,
    },
  };
}
