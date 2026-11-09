import { Notification, Mail, User } from "../../models/index.js";

/**
 * LMS notifications.
 *
 * The LMS never invents its own messaging. Course events become rows in the
 * centralised CollegeOS `Notification` collection (which the navbar already
 * reads) and, when a teacher asks for it, are mirrored into College Mail using
 * the same `Mail` shape the mail module writes. Every notification carries an
 * idempotency key derived from the object and the event, so a repeated sweep, a
 * retry or a double click cannot produce a duplicate message.
 */

import { emitNotificationToUser, emitUnreadCountToUser } from "../notificationRealtime.js";

async function pushRealtime(userId) {
  try {
    const count = await Notification.countDocuments({ user: userId, read: false });
    emitUnreadCountToUser(userId, count);
  } catch {}
}

/** Creates one in-app notification, at most once per key. */
export async function notifyOnce({
  userId,
  title,
  message,
  category = "lms",
  priority = "normal",
  actionUrl = null,
  idempotencyKey,
  metadata = null,
  sender = null,
  senderType = "system",
  senderLabel = null,
  senderDepartment = null,
  relatedEntityType = null,
  relatedEntityId = null,
}) {
  if (!userId) return null;
  try {
    if (idempotencyKey) {
      const existing = await Notification.findOne({ idempotencyKey }).lean();
      if (existing) return existing;
    }
    const created = await Notification.create({
      user: userId,
      sender: sender || null,
      senderType: senderType || "system",
      senderLabel: senderLabel || null,
      senderDepartment: senderDepartment || null,
      title,
      message,
      category,
      priority,
      actionUrl,
      relatedEntityType: relatedEntityType || null,
      relatedEntityId: relatedEntityId || null,
      idempotencyKey: idempotencyKey || null,
      metadata,
    });
    const obj = created.toObject();
    const payload = {
      id: String(obj._id),
      _id: String(obj._id),
      title: obj.title,
      message: obj.message,
      category: obj.category,
      priority: obj.priority,
      read: Boolean(obj.read),
      actionUrl: obj.actionUrl || null,
      senderType: obj.senderType || "system",
      senderLabel: obj.senderLabel || null,
      senderDepartment: obj.senderDepartment || null,
      sender: obj.sender ? String(obj.sender) : null,
      relatedEntityType: obj.relatedEntityType || null,
      relatedEntityId: obj.relatedEntityId ? String(obj.relatedEntityId) : null,
      metadata: obj.metadata || null,
      created_at: obj.createdAt ? new Date(obj.createdAt).toISOString() : new Date().toISOString(),
    };
    emitNotificationToUser(userId, payload);
    void pushRealtime(userId);
    return obj;
  } catch (error) {
    // A concurrent sweep won the race; treat it as delivered.
    if (error?.code === 11000 && idempotencyKey) {
      return Notification.findOne({ idempotencyKey }).lean();
    }
    console.error("LMS notification failed:", error.message);
    return null;
  }
}

/**
 * Notifies a list of students, one message each.
 *
 * Delivery failures are logged rather than thrown: a notification problem must
 * never roll back the academic action that triggered it.
 */
export async function notifyStudents({
  students,
  title,
  message,
  keyPrefix,
  actionUrl = null,
  priority = "normal",
  category = "lms",
  metadata = null,
}) {
  const recipients = (students || []).filter((student) => student.userId);
  const results = await Promise.all(
    recipients.map((student) =>
      notifyOnce({
        userId: student.userId,
        title,
        message,
        category,
        priority,
        actionUrl,
        idempotencyKey: `${keyPrefix}:${student.id}`,
        metadata: metadata
          ? { ...metadata, studentId: student.studentId }
          : { studentId: student.studentId },
      }),
    ),
  );
  return results.filter(Boolean).length;
}

/**
 * Mirrors an announcement into College Mail.
 *
 * Delivery goes through the shared `Mail` collection and is recorded on the
 * announcement, so the announcement view and the mailbox never disagree about
 * whether a cohort was emailed.
 */
export async function sendCourseMail({
  sender,
  students,
  subject,
  body,
}) {
  const recipients = await User.find({
    _id: { $in: (students || []).map((student) => student.userId).filter(Boolean) },
  }).select("email collegeEmail _id");

  if (!recipients.length) return { sent: 0 };

  const recipientEmails = Array.from(
    new Set(
      recipients
        .map((user) => String(user.collegeEmail || user.email || "").toLowerCase())
        .filter(Boolean),
    ),
  );
  const senderEmail = String(sender.collegeEmail || sender.email || "").toLowerCase();
  const senderName = [sender.firstName, sender.lastName].filter(Boolean).join(" ");

  await Mail.create({
    sender: sender._id,
    senderEmail,
    senderName,
    recipientEmails: recipientEmails.filter((email) => email !== senderEmail),
    recipients: recipients.map((user) => user._id),
    subject: String(subject || "").trim() || "Course announcement",
    body: String(body || "").trim(),
    attachments: [],
    isDraft: false,
    userStates: [
      { user: sender._id, folder: "sent", isRead: true, isArchived: false, isDeleted: false },
      ...recipients
        .filter((user) => String(user._id) !== String(sender._id))
        .map((user) => ({
          user: user._id,
          folder: "inbox",
          isRead: false,
          isArchived: false,
          isDeleted: false,
        })),
    ],
  });

  return { sent: recipientEmails.length };
}

/** Category labels used by the notification feed. */
export const LMS_NOTIFICATION_CATEGORY = {
  MATERIAL: "lms_material",
  ASSIGNMENT: "lms_assignment",
  QUIZ: "lms_quiz",
  GRADE: "lms_grade",
  ANNOUNCEMENT: "lms_announcement",
};