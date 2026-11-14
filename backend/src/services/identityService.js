import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { User, Student, PasswordResetToken } from "../models/index.js";
import { normalizeRoles, LEGACY_ROLE_ALIASES } from "../permissions/catalog.js";
import { env } from "../config/environment.js";
import { hashPassword } from "../utils/password.js";
import { hashToken } from "../utils/token.js";
import { logAudit } from "./auditService.js";

/**
 * Identity and role resolution.
 *
 * This service owns *who a user is* and *what roles they hold*. It has no
 * knowledge of database connections, sessions or Express requests, so the
 * database layer stays infrastructure-only and the authorization layer can
 * depend on this without creating a cycle.
 */

/**
 * Historical login domains accepted as aliases for the current institutional
 * domain. The current domain comes from configuration, so no institution's
 * address is hardcoded here; the alias map only exists so accounts created
 * before a domain change keep working.
 */
const LEGACY_EMAIL_DOMAINS = ["edu.np"];

export function getInstitutionEmailDomain() {
  return String(env.institutionEmailDomain || "techspire.edu.np")
    .trim()
    .toLowerCase();
}

export async function getUserByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  let user = await User.findOne({
    $or: [{ email: normalizedEmail }, { collegeEmail: normalizedEmail }],
    isActive: true,
  });

  if (user) return user;

  const atIndex = normalizedEmail.lastIndexOf("@");
  if (atIndex === -1) return null;
  const localPart = normalizedEmail.slice(0, atIndex);
  const alternatives = [getInstitutionEmailDomain(), ...LEGACY_EMAIL_DOMAINS]
    .filter((domain) => domain !== normalizedEmail.slice(atIndex + 1))
    .map((domain) => `${localPart}@${domain}`);

  if (!alternatives.length) return null;

  return await User.findOne({
    $or: alternatives.flatMap((candidate) => [
      { email: candidate },
      { collegeEmail: candidate },
    ]),
    isActive: true,
  });
}

export async function getUserById(userId) {
  if (!userId) return null;
  try {
    return await User.findById(userId);
  } catch {
    return null;
  }
}

export function getUserRoles(userOrRoles) {
  if (!userOrRoles) return ["student"];
  if (Array.isArray(userOrRoles)) return normalizeRoles(userOrRoles);
  if (userOrRoles.roles && Array.isArray(userOrRoles.roles)) {
    return normalizeRoles(userOrRoles.roles);
  }
  return normalizeRoles([userOrRoles.activeRole]);
}

export function userToPublic(user) {
  if (!user) return null;
  const u = user.toObject ? user.toObject() : user;
  const roles = normalizeRoles(u.roles);
  const requestedActive = u.activeRole
    ? normalizeRoles([u.activeRole])[0]
    : roles[0];
  const primaryRole = roles.includes(requestedActive)
    ? requestedActive
    : roles[0] || "student";
  const fullName = [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ");

  return {
    id: String(u._id || u.id),
    _id: String(u._id || u.id),
    email: u.email,
    collegeEmail: u.collegeEmail || u.email,
    name: fullName,
    firstName: u.firstName,
    middleName: u.middleName || null,
    lastName: u.lastName,
    phone: u.phone || null,
    personalEmail: u.personalEmail || null,
    address: u.address || null,
    emergencyContact: u.emergencyContact || null,
    avatarUrl: u.avatarUrl || null,
    roles,
    activeRole: primaryRole,
    mustChangePassword: Boolean(u.mustChangePassword),
    accountStatus: u.accountStatus || (u.mustChangePassword ? "PASSIVE" : "ACTIVE"),
    passwordStatus: u.passwordStatus || (u.mustChangePassword ? "TEMPORARY" : "PERMANENT"),
    createdAt: u.createdAt,
    firstLoginAt: u.firstLoginAt || null,
    activatedAt: u.activatedAt || null,
    lastLoginAt: u.lastLoginAt || null,
    lastPasswordChangedAt: u.lastPasswordChangedAt || null,
  };
}

export function authorizeUser(user, requiredRoleOrRoles) {
  const roles = getUserRoles(user);
  const required = Array.isArray(requiredRoleOrRoles)
    ? requiredRoleOrRoles
    : [requiredRoleOrRoles];
  return roles.some((role) => required.includes(role));
}

export function ensureUserOwnsResource(user, ownerUserId) {
  return String(user.id || user._id) === String(ownerUserId);
}

export async function getStudentByUserId(userId) {
  return await Student.findOne({ user: userId });
}

export async function getStudentById(studentId) {
  if (mongoose.Types.ObjectId.isValid(studentId)) {
    const byObjId = await Student.findById(studentId);
    if (byObjId) return byObjId;
  }
  return await Student.findOne({ studentId });
}

/* ------------------------------------------------------------------ */
/* Password reset credentials                                          */
/* ------------------------------------------------------------------ */

export async function createPasswordResetToken(userId) {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await PasswordResetToken.create({
    user: userId,
    tokenHash,
    expiresAt,
  });
  return { token: rawToken, expiresAt: expiresAt.toISOString() };
}

export async function getPasswordResetToken(userId, rawToken) {
  const tokenHash = hashToken(rawToken);
  return await PasswordResetToken.findOne({
    user: userId,
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
}

export async function getPasswordResetTokenByHash(rawToken) {
  const tokenHash = hashToken(rawToken);
  return await PasswordResetToken.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
}

export async function invalidatePasswordResetTokens(userId) {
  return await PasswordResetToken.updateMany(
    { user: userId, usedAt: null },
    { usedAt: new Date() }
  );
}

/**
 * Rewrites role strings that were consolidated (for example
 * `institution_admin` → `super_admin`) so stored accounts keep working after
 * the consolidation. Idempotent and safe to run on every boot.
 */
export async function migrateConsolidatedRoles() {
  const legacyRoles = Object.keys(LEGACY_ROLE_ALIASES);
  const affected = await User.find({ roles: { $in: legacyRoles } }).select(
    "_id roles activeRole",
  );

  for (const user of affected) {
    const roles = normalizeRoles(user.roles);
    const requestedActive = normalizeRoles([user.activeRole])[0];
    user.roles = roles;
    user.activeRole = roles.includes(requestedActive)
      ? requestedActive
      : roles[0];
    await user.save();
  }

  if (affected.length > 0) {
    const mappings = legacyRoles
      .map((role) => `${role} → ${LEGACY_ROLE_ALIASES[role]}`)
      .join(", ");
    console.log(
      `Role consolidation applied to ${affected.length} account(s): ${mappings}.`,
    );
  }

  return affected.length;
}

/**
 * Provisions only the single login credential CollegeOS cannot start without:
 * the bootstrap Super Admin. No institutional records are fabricated here.
 */
export async function seedBaseUsers() {
  const emailDomain = getInstitutionEmailDomain();
  const adminEmail = `admin@${emailDomain}`;

  const existingAdmin = await User.findOne({
    $or: [{ email: adminEmail }, { collegeEmail: adminEmail }],
  });

  if (!existingAdmin) {
    const adminPasswordHash = hashPassword(env.bootstrapAdminPassword);
    const admin = await User.create({
      email: adminEmail,
      collegeEmail: adminEmail,
      passwordHash: adminPasswordHash,
      firstName: "College",
      lastName: "Administrator",
      phone: "+977-9800000001",
      roles: ["super_admin"],
      activeRole: "super_admin",
      mustChangePassword: true,
      accountStatus: "PASSIVE",
      passwordStatus: "TEMPORARY",
      isActive: true,
    });
    console.log(`Initial Super Admin created: ${adminEmail}`);

    await logAudit({
      userId: admin._id,
      action: "BOOTSTRAP_ADMIN_CREATED",
      module: "auth",
      details: "Initial Super Admin account created in MongoDB.",
    });
  }

  await migrateConsolidatedRoles();
}