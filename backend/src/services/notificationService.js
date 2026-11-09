import mongoose from "mongoose";
import { Notification, User } from "../models/index.js";
import { emitNotificationToUser, emitUnreadCountToUser } from "./notificationRealtime.js";

function displayName(user) {
  if (!user) return null;
  return [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ").trim() || null;
}

export function formatNotification(n, senderUser = null) {
  const obj = n?.toObject ? n.toObject() : n || {};
  const sender = senderUser || (obj.sender && typeof obj.sender === "object" ? obj.sender : null);
  const senderName =
    obj.senderLabel ||
    (obj.senderType === "user" ? displayName(sender) : null) ||
    (obj.senderType === "department" ? obj.senderDepartment || "CollegeOS Department" : null) ||
    (obj.senderType === "automated" ? obj.senderLabel || "CollegeOS Automation" : "CollegeOS System");
  return {
    id: String(obj._id || obj.id),
    _id: String(obj._id || obj.id),
    title: obj.title || "",
    message: obj.message || "",
    category: obj.category || "general",
    priority: obj.priority || "normal",
    read: Boolean(obj.read),
    readAt: obj.readAt ? new Date(obj.readAt).toISOString() : null,
    actionUrl: obj.actionUrl || null,
    examId: obj.examId ? String(obj.examId._id || obj.examId) : null,
    relatedEntityType: obj.relatedEntityType || obj.metadata?.relatedEntityType || obj.metadata?.entityType || null,
    relatedEntityId: obj.relatedEntityId
      ? String(obj.relatedEntityId)
      : obj.metadata?.relatedEntityId || obj.metadata?.sessionId || obj.metadata?.entityId || null,
    sender: sender
      ? {
          id: String(sender._id || sender.id),
          name: displayName(sender) || senderName,
          avatarUrl: sender.avatarUrl || null,
          role: Array.isArray(sender.roles) && sender.roles[0] ? sender.roles[0] : null,
          department: sender.department || obj.senderDepartment || null,
          designation: sender.designation || null,
        }
      : null,
    senderType: obj.senderType || (obj.sender ? "user" : "system"),
    senderLabel: senderName,
    senderDepartment: obj.senderDepartment || null,
    metadata: obj.metadata && typeof obj.metadata === "object" ? obj.metadata : null,
    created_at: obj.createdAt ? new Date(obj.createdAt).toISOString() : obj.created_at || new Date().toISOString(),
    updated_at: obj.updatedAt ? new Date(obj.updatedAt).toISOString() : null,
  };
}

export async function getUnreadCount(userId) {
  return Notification.countDocuments({ user: userId, read: false });
}

export async function emitUnread(userId) {
  try {
    const count = await getUnreadCount(userId);
    emitUnreadCountToUser(userId, count);
  } catch {}
}

export async function createAndEmitNotification(data) {
  const created = await Notification.create(data);
  const populated = await Notification.findById(created._id)
    .populate("sender", "firstName middleName lastName avatarUrl roles")
    .lean();
  const formatted = formatNotification(populated);
  emitNotificationToUser(data.user, formatted);
  await emitUnread(data.user);
  return formatted;
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(String(cursor), "base64url").toString("utf8");
    const [createdAt, id] = raw.split("|");
    if (!createdAt || !mongoose.isValidObjectId(id)) return null;
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return null;
    return { createdAt: d, id: new mongoose.Types.ObjectId(id) };
  } catch {
    return null;
  }
}

function encodeCursor(item) {
  const createdAt = item.createdAt ? new Date(item.createdAt).toISOString() : item.created_at;
  const id = String(item._id || item.id);
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export async function emitForNotificationUsers(userIds = []) {
  const ids = [...new Set(userIds.map((id) => String(id || "")).filter(Boolean))];
  await Promise.all(ids.map((id) => emitUnread(id)));
}

export async function listNotificationsForUser(userId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const filter = { user: userId };
  if (opts.read === true) filter.read = true;
  if (opts.read === false) filter.read = false;
  if (opts.category) filter.category = String(opts.category);
  if (opts.search) {
    const q = String(opts.search).trim();
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: rx }, { message: rx }];
    }
  }
  const cursor = decodeCursor(opts.cursor);
  if (cursor) {
    filter.$and = (filter.$and || []).concat([
      {
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
        ],
      },
    ]);
  }
  const rows = await Notification.find(filter)
    .populate("sender", "firstName middleName lastName avatarUrl roles")
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((n) => formatNotification(n));
  const nextCursor = hasMore && items.length ? encodeCursor(rows[limit - 1]) : null;
  const unreadCount = await getUnreadCount(userId);
  return { notifications: items, unreadCount, nextCursor, hasMore };
}
