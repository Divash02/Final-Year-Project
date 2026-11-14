import { AuditLog } from "../models/index.js";

/**
 * Audit trail service.
 *
 * Sensitive operations (credential changes, exam workflow transitions,
 * finance actions, AI action confirmations) are recorded here so there is one
 * append-only trail. A failure to write an audit entry must never break the
 * business operation, but it is logged so the gap is visible.
 */

export async function logAudit({
  userId,
  action,
  module = "general",
  resource,
  resourceId,
  oldValue,
  newValue,
  details,
  metadata,
}) {
  try {
    await AuditLog.create({
      user: userId || null,
      action,
      module,
      resource,
      resourceId: resourceId ? String(resourceId) : null,
      oldValue,
      newValue,
      details,
      metadata,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error("Audit logging error:", err.message);
  }
}

export async function recordInstitutionEvent({
  entityType,
  entityId,
  eventType,
  actorUserId,
  details,
  metadata,
}) {
  return await logAudit({
    userId: actorUserId,
    action: eventType,
    module: entityType,
    resource: entityType,
    resourceId: entityId,
    details,
    metadata,
  });
}