import {
  Employer,
  EmployerUser,
  EmployerVerification,
  User,
  Student,
} from "../../models/index.js";
import { getUserById, getStudentByUserId, logAudit } from "../../db.js";
import {
  badRequest,
  notFound,
  forbidden,
  conflict,
} from "../../utils/apiError.js";
import { createAndEmitNotification } from "../notificationService.js";

const INSTITUTION_ID = "techspire";

/**
 * Domain A: Employer Management
 *
 * Employer registration, profile management, verification submission/review,
 * and employer-user linkage. All operations are audited and notify the
 * relevant parties via the existing notification service.
 */

/* ------------------------------------------------------------------ */
/* Employer registration                                              */
/* ------------------------------------------------------------------ */

/**
 * Register a new employer/company profile.
 *
 * Business rule: an employer may not be registered twice under the same
 * contact email within an institution.
 *
 * @param {Object} data
 * @param {string} data.name - Employer name
 * @param {string} data.contactEmail - Unique contact email
 * @param {Object} [data.createdBy] - User performing registration
 * @returns {Promise<Object>} Created employer document
 */
export async function registerEmployer(data, { createdBy } = {}) {
  const existing = await Employer.findOne({
    institutionId: INSTITUTION_ID,
    contactEmail: String(data.contactEmail).toLowerCase(),
  }).lean();

  if (existing) {
    throw conflict("An employer with this contact email already exists.", {
      code: "DUPLICATE_EMPLOYER_EMAIL",
      field: "contactEmail",
    });
  }

  const employer = await Employer.create({
    institutionId: INSTITUTION_ID,
    name: String(data.name).trim(),
    industry: data.industry ? String(data.industry).trim() : undefined,
    size: data.size || "SME",
    website: data.website ? String(data.website).trim() : undefined,
    about: data.about ? String(data.about).trim() : undefined,
    logoUrl: data.logoUrl || null,
    address: data.address ? String(data.address).trim() : undefined,
    city: data.city ? String(data.city).trim() : undefined,
    country: data.country ? String(data.country).trim() : "Nepal",
    contactPerson: data.contactPerson ? String(data.contactPerson).trim() : undefined,
    contactEmail: String(data.contactEmail).toLowerCase().trim(),
    contactPhone: data.contactPhone ? String(data.contactPhone).trim() : undefined,
    verificationStatus: "PENDING",
    isVerified: false,
    isActive: true,
    partnershipTier: data.partnershipTier || "STANDARD",
    notes: data.notes ? String(data.notes).trim() : undefined,
  });

  if (createdBy) {
    await logAudit({
      userId: createdBy,
      action: "employer.register",
      module: "internship",
      resource: "Employer",
      resourceId: String(employer._id),
      details: `Employer "${employer.name}" registered by user ${createdBy}`,
      metadata: { employerId: String(employer._id), contactEmail: employer.contactEmail },
    });
  }

  return employer;
}

/**
 * Get employer profile by ID with optional populated verification status.
 *
 * @param {string} employerId
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export async function getEmployerProfile(employerId, { includeVerification = false } = {}) {
  const employer = await Employer.findById(employerId).lean();
  if (!employer) {
    throw notFound("Employer not found.");
  }

  const result = {
    id: String(employer._id),
    ...employer,
  };

  if (includeVerification) {
    const verification = await EmployerVerification.findOne({ employer: employerId })
      .sort({ createdAt: -1 })
      .lean();
    result.verification = verification
      ? {
          id: String(verification._id),
          status: verification.status,
          submittedBy: verification.submittedBy,
          reviewedBy: verification.reviewedBy,
          reviewedAt: verification.reviewedAt,
          rejectionReason: verification.rejectionReason,
          remarks: verification.remarks,
        }
      : null;
  }

  return result;
}

/**
 * Update employer profile. Only non-sensitive fields may be changed here;
 * verification-related changes go through the verification workflow.
 *
 * @param {string} employerId
 * @param {Object} updates
 * @param {Object} [options]
 * @param {string} [options.updatedBy]
 * @returns {Promise<Object>}
 */
export async function updateEmployerProfile(employerId, updates, { updatedBy } = {}) {
  const employer = await Employer.findById(employerId);
  if (!employer) {
    throw notFound("Employer not found.");
  }

  const allowedFields = [
    "name",
    "industry",
    "size",
    "website",
    "about",
    "logoUrl",
    "address",
    "city",
    "country",
    "contactPerson",
    "contactPhone",
    "partnershipTier",
    "notes",
    "isActive",
  ];

  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      const value = updates[field];
      if (field === "contactEmail") {
        changes[field] = String(value).toLowerCase().trim();
      } else if (typeof value === "string") {
        changes[field] = value.trim();
      } else {
        changes[field] = value;
      }
    }
  }

  if (Object.keys(changes).length === 0) {
    return {
      id: String(employer._id),
      ...employer.toObject(),
    };
  }

  Object.assign(employer, changes);
  await employer.save();

  if (updatedBy) {
    await logAudit({
      userId: updatedBy,
      action: "employer.profile.update",
      module: "internship",
      resource: "Employer",
      resourceId: String(employer._id),
      details: `Employer profile updated: ${Object.keys(changes).join(", ")}`,
      metadata: { employerId: String(employer._id), changedFields: Object.keys(changes) },
    });
  }

  return {
    id: String(employer._id),
    ...employer.toObject(),
  };
}

/* ------------------------------------------------------------------ */
/* Employer verification                                              */
/* ------------------------------------------------------------------ */

/**
 * Submit employer verification documents.
 *
 * Business rule: only one verification record may be pending/under review
 * at a time per employer.
 *
 * @param {Object} data
 * @param {string} data.employerId
 * @param {string} data.submittedBy - User id submitting
 * @param {string} data.businessRegistrationNumber
 * @param {string} [data.taxIdentificationNumber]
 * @param {Object} [data.registrationDocument] { fileId, fileName, url }
 * @param {Object} [data.taxClearanceDocument] { fileId, fileName, url }
 * @param {Object} [data.mouDocument] { fileId, fileName, url }
 * @returns {Promise<Object>} Created verification record
 */
export async function submitEmployerVerification(data, { submittedBy }) {
  const employer = await Employer.findById(data.employerId);
  if (!employer) {
    throw notFound("Employer not found.");
  }

  const existing = await EmployerVerification.findOne({
    employer: data.employerId,
    status: { $in: ["PENDING", "UNDER_REVIEW"] },
  });

  if (existing) {
    throw conflict(
      "A verification request is already pending or under review for this employer.",
      { code: "DUPLICATE_VERIFICATION", employerId: data.employerId },
    );
  }

  const verification = await EmployerVerification.create({
    employer: data.employerId,
    submittedBy,
    businessRegistrationNumber: String(data.businessRegistrationNumber).trim(),
    taxIdentificationNumber: data.taxIdentificationNumber
      ? String(data.taxIdentificationNumber).trim()
      : undefined,
    registrationDocument: data.registrationDocument || undefined,
    taxClearanceDocument: data.taxClearanceDocument || undefined,
    mouDocument: data.mouDocument || undefined,
    status: "PENDING",
    auditTrail: [
      {
        action: "submitted",
        actor: submittedBy,
        note: "Verification documents submitted by employer representative.",
      },
    ],
  });

  await logAudit({
    userId: submittedBy,
    action: "employer.verification.submit",
    module: "internship",
    resource: "EmployerVerification",
    resourceId: String(verification._id),
    details: `Verification submitted for employer ${data.employerId}`,
    metadata: { employerId: data.employerId, verificationId: String(verification._id) },
  });

  await createAndEmitNotification({
    user: submittedBy,
    title: "Verification submitted",
    message: "Your employer verification documents have been submitted and are under review.",
    category: "internship",
    priority: "normal",
    actionUrl: `/internship/employers/${data.employerId}/verification`,
    sender: submittedBy,
    metadata: {
      relatedEntityType: "EmployerVerification",
      relatedEntityId: String(verification._id),
    },
  });

  return verification;
}

/**
 * Review an employer verification submission (approve or reject).
 *
 * Business rule: only users with internship.manage permission may review.
 * On approval, the employer is marked verified.
 *
 * @param {string} verificationId
 * @param {Object} data { status: "VERIFIED"|"REJECTED", reviewedBy, rejectionReason?, remarks? }
 * @returns {Promise<Object>} Updated verification record
 */
export async function reviewEmployerVerification(verificationId, data, { reviewedBy }) {
  const verification = await EmployerVerification.findById(verificationId);
  if (!verification) {
    throw notFound("Employer verification record not found.");
  }

  if (verification.status !== "PENDING" && verification.status !== "UNDER_REVIEW") {
    throw badRequest(
      `Verification is already ${verification.status.toLowerCase()} and cannot be reviewed again.`,
      { code: "VERIFICATION_ALLOWED_REVIEWED" },
    );
  }

  const newStatus = data.status === "REJECTED" ? "REJECTED" : "VERIFIED";

  const oldStatus = verification.status;
  verification.status = newStatus;
  verification.reviewedBy = reviewedBy;
  verification.reviewedAt = new Date();
  if (data.rejectionReason) verification.rejectionReason = String(data.rejectionReason).trim();
  if (data.remarks) verification.remarks = String(data.remarks).trim();

  verification.auditTrail.push({
    action: newStatus === "VERIFIED" ? "approved" : "rejected",
    actor: reviewedBy,
    note: newStatus === "VERIFIED" ? "Employer verification approved." : `Rejected: ${data.rejectionReason || ""}`,
  });

  await verification.save();

  const employer = await Employer.findById(verification.employer);
  if (!employer) {
    throw notFound("Linked employer not found.");
  }

  const wasVerified = employer.isVerified;
  employer.isVerified = newStatus === "VERIFIED";
  employer.verificationStatus = newStatus;
  if (newStatus === "VERIFIED") {
    employer.verifiedBy = reviewedBy;
    employer.verifiedAt = new Date();
  }
  await employer.save();

  await logAudit({
    userId: reviewedBy,
    action: `employer.verification.${newStatus.toLowerCase()}`,
    module: "internship",
    resource: "EmployerVerification",
    resourceId: String(verification._id),
    details: `Employer verification ${newStatus.toLowerCase()}: ${oldStatus} -> ${newStatus}`,
    metadata: {
      employerId: String(employer._id),
      verificationId: String(verification._id),
      oldStatus,
      newStatus,
    },
  });

  // Notify the submitter and any employer users
  await createAndEmitNotification({
    user: verification.submittedBy,
    title: `Employer verification ${newStatus.toLowerCase()}`,
    message: `Your employer verification has been ${newStatus.toLowerCase()}.${newStatus === "REJECTED" && data.rejectionReason ? ` Reason: ${data.rejectionReason}` : ""}`,
    category: "internship",
    priority: newStatus === "VERIFIED" ? "high" : "normal",
    actionUrl: `/internship/employers/${employer._id}/verification`,
    sender: reviewedBy,
    metadata: {
      relatedEntityType: "EmployerVerification",
      relatedEntityId: String(verification._id),
    },
  });

  return {
    id: String(verification._id),
    ...verification.toObject(),
    employer: {
      id: String(employer._id),
      isVerified: employer.isVerified,
      verificationStatus: employer.verificationStatus,
    },
  };
}

/**
 * List employer verification records with optional status filter.
 *
 * @param {Object} [filter] { status?, employerId? }
 * @param {Object} [pagination] { page, limit }
 * @returns {Promise<Object>}
 */
export async function listEmployerVerifications(filter = {}, pagination = {}) {
  const query = {};
  if (filter.status) query.status = filter.status;
  if (filter.employerId) query.employer = filter.employerId;

  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(pagination.limit) || 50));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    EmployerVerification.find(query)
      .populate("submittedBy", "firstName lastName email")
      .populate("reviewedBy", "firstName lastName email")
      .populate("employer", "name contactEmail isVerified")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    EmployerVerification.countDocuments(query),
  ]);

  return {
    items: items.map((v) => ({
      id: String(v._id),
      ...v,
      employer: v.employer
        ? { id: String(v.employer._id), name: v.employer.name, contactEmail: v.employer.contactEmail, isVerified: v.employer.isVerified }
        : null,
      submittedBy: v.submittedBy
        ? { id: String(v.submittedBy._id), name: `${v.submittedBy.firstName} ${v.submittedBy.lastName}`, email: v.submittedBy.email }
        : null,
      reviewedBy: v.reviewedBy
        ? { id: String(v.reviewedBy._id), name: `${v.reviewedBy.firstName} ${v.reviewedBy.lastName}`, email: v.reviewedBy.email }
        : null,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

/* ------------------------------------------------------------------ */
/* Employer user management                                           */
/* ------------------------------------------------------------------ */

/**
 * Link a user to an employer with a role and optional permissions.
 *
 * Business rule: a user may only be linked once per employer.
 *
 * @param {Object} data
 * @param {string} data.employerId
 * @param {string} data.userId
 * @param {string} [data.employerRole="HR_RECRUITER"]
 * @param {string} [data.designation]
 * @param {string} [data.department]
 * @param {string} [data.phone]
 * @param {string[]} [data.permissions]
 * @param {string} assignedBy
 * @returns {Promise<Object>}
 */
export async function addEmployerUser(data, assignedBy) {
  const employer = await Employer.findById(data.employerId);
  if (!employer) {
    throw notFound("Employer not found.");
  }

  const user = await getUserById(data.userId);
  if (!user) {
    throw notFound("User not found.");
  }

  const existing = await EmployerUser.findOne({
    employer: data.employerId,
    user: data.userId,
  });
  if (existing) {
    throw conflict(
      "This user is already linked to the employer.",
      { code: "DUPLICATE_EMPLOYER_USER", employerId: data.employerId, userId: data.userId },
    );
  }

  const employerUser = await EmployerUser.create({
    employer: data.employerId,
    user: data.userId,
    employerRole: data.employerRole || "HR_RECRUITER",
    designation: data.designation ? String(data.designation).trim() : undefined,
    department: data.department ? String(data.department).trim() : undefined,
    phone: data.phone ? String(data.phone).trim() : undefined,
    status: "ACTIVE",
    permissions: Array.isArray(data.permissions) ? data.permissions : [],
    assignedBy,
  });

  await logAudit({
    userId: assignedBy,
    action: "employer.user.add",
    module: "internship",
    resource: "EmployerUser",
    resourceId: String(employerUser._id),
    details: `User ${data.userId} linked to employer ${data.employerId} as ${employerUser.employerRole}`,
    metadata: { employerId: data.employerId, userId: data.userId, employerRole: employerUser.employerRole },
  });

  await createAndEmitNotification({
    user: data.userId,
    title: "Employer access granted",
    message: `You have been added to employer "${employer.name}" as a ${employerUser.employerRole}.`,
    category: "internship",
    priority: "normal",
    actionUrl: `/internship/employers/${data.employerId}`,
    sender: assignedBy,
    metadata: {
      relatedEntityType: "EmployerUser",
      relatedEntityId: String(employerUser._id),
    },
  });

  return {
    id: String(employerUser._id),
    ...employerUser.toObject(),
  };
}

/**
 * Update an employer user's role, status, or permissions.
 *
 * @param {string} employerUserId
 * @param {Object} updates
 * @param {string} updatedBy
 * @returns {Promise<Object>}
 */
export async function updateEmployerUser(employerUserId, updates, updatedBy) {
  const employerUser = await EmployerUser.findById(employerUserId);
  if (!employerUser) {
    throw notFound("Employer user linkage not found.");
  }

  const allowedFields = ["employerRole", "designation", "department", "phone", "status", "permissions"];
  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      changes[field] = typeof updates[field] === "string" ? String(updates[field]).trim() : updates[field];
    }
  }

  if (Object.keys(changes).length === 0) {
    return { id: String(employerUser._id), ...employerUser.toObject() };
  }

  Object.assign(employerUser, changes);
  await employerUser.save();

  await logAudit({
    userId: updatedBy,
    action: "employer.user.update",
    module: "internship",
    resource: "EmployerUser",
    resourceId: String(employerUser._id),
    details: `Employer user updated: ${Object.keys(changes).join(", ")}`,
    metadata: { employerUserId, employerId: String(employerUser.employer), userId: String(employerUser.user), changedFields: Object.keys(changes) },
  });

  return { id: String(employerUser._id), ...employerUser.toObject() };
}

/**
 * Remove a user's linkage to an employer.
 *
 * @param {string} employerUserId
 * @param {string} removedBy
 * @returns {Promise<void>}
 */
export async function removeEmployerUser(employerUserId, removedBy) {
  const employerUser = await EmployerUser.findById(employerUserId);
  if (!employerUser) {
    throw notFound("Employer user linkage not found.");
  }

  const employerId = String(employerUser.employer);
  const userId = String(employerUser.user);

  await EmployerUser.deleteOne({ _id: employerUserId });

  await logAudit({
    userId: removedBy,
    action: "employer.user.remove",
    module: "internship",
    resource: "EmployerUser",
    resourceId: employerUserId,
    details: `User ${userId} unlinked from employer ${employerId}`,
    metadata: { employerId, userId },
  });

  await createAndEmitNotification({
    user: userId,
    title: "Employer access removed",
    message: "Your access to an employer company has been removed.",
    category: "internship",
    priority: "normal",
    actionUrl: "/internship/employers",
    sender: removedBy,
    metadata: {
      relatedEntityType: "EmployerUser",
      relatedEntityId: employerUserId,
    },
  });
}

/**
 * List users linked to an employer.
 *
 * @param {string} employerId
 * @returns {Promise<Array>}
 */
export async function listEmployerUsers(employerId) {
  const employer = await Employer.findById(employerId).lean();
  if (!employer) {
    throw notFound("Employer not found.");
  }

  const users = await EmployerUser.find({ employer: employerId })
    .populate("user", "firstName lastName email roles")
    .populate("assignedBy", "firstName lastName email")
    .sort({ createdAt: -1 })
    .lean();

  return users.map((eu) => ({
    id: String(eu._id),
    employerRole: eu.employerRole,
    designation: eu.designation,
    department: eu.department,
    phone: eu.phone,
    status: eu.status,
    permissions: eu.permissions,
    assignedBy: eu.assignedBy
      ? { id: String(eu.assignedBy._id), name: `${eu.assignedBy.firstName} ${eu.assignedBy.lastName}`, email: eu.assignedBy.email }
      : null,
    user: eu.user
      ? {
          id: String(eu.user._id),
          name: `${eu.user.firstName} ${eu.user.lastName}`,
          email: eu.user.email,
          roles: eu.user.roles,
        }
      : null,
  }));
}

/**
 * Check whether a user is authorized to act on behalf of an employer
 * with a specific role. Returns the EmployerUser record if authorized.
 *
 * @param {string} userId
 * @param {string} employerId
 * @param {string[]} [allowedRoles]
 * @returns {Promise<Object|null>}
 */
export async function getAuthorizedEmployerUser(userId, employerId, allowedRoles = ["OWNER", "HR_RECRUITER", "SUPERVISOR", "MENTOR"]) {
  const employerUser = await EmployerUser.findOne({
    employer: employerId,
    user: userId,
    status: "ACTIVE",
  }).lean();

  if (!employerUser) return null;
  if (!allowedRoles.includes(employerUser.employerRole)) return null;

  return employerUser;
}
