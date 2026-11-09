export type NotificationSender = {
  id?: string;
  name: string;
  avatarUrl?: string | null;
  role?: string | null;
  department?: string | null;
  designation?: string | null;
};

export type NotificationItem = {
  id: string;
  _id?: string;
  title: string;
  message: string;
  category: string;
  priority: string;
  read: boolean;
  readAt?: string | null;
  actionUrl?: string | null;
  examId?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  sender?: NotificationSender | null;
  senderType?: "user" | "system" | "department" | "automated";
  senderLabel?: string | null;
  senderDepartment?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string | null;
};

export type NotificationListResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
  nextCursor?: string | null;
  hasMore?: boolean;
};

import { apiRequest } from "./apiClient";

export async function fetchNotifications(params: {
  cursor?: string | null;
  limit?: number;
  read?: boolean;
  category?: string;
  q?: string;
} = {}): Promise<NotificationListResponse> {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.limit) qs.set("limit", String(params.limit));
  if (typeof params.read === "boolean") qs.set("read", String(params.read));
  if (params.category && params.category !== "all") qs.set("category", params.category);
  if (params.q) qs.set("q", params.q);
  const q = qs.toString();
  return apiRequest<NotificationListResponse>(`/notifications${q ? `?${q}` : ""}`);
}

export async function fetchUnreadCount(): Promise<{ unreadCount: number }> {
  return apiRequest("/notifications/unread-count");
}

export async function fetchNotification(id: string): Promise<{ notification: NotificationItem }> {
  return apiRequest(`/notifications/${encodeURIComponent(id)}`);
}

export async function markNotificationRead(id: string): Promise<{ success: boolean; notification?: NotificationItem }> {
  return apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
}

export async function markNotificationUnread(id: string): Promise<{ success: boolean; notification?: NotificationItem }> {
  return apiRequest(`/notifications/${encodeURIComponent(id)}/unread`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<{ success: boolean; updated?: number }> {
  return apiRequest("/notifications/read-all", { method: "POST" });
}

export async function dismissNotification(id: string): Promise<{ success: boolean }> {
  return apiRequest(`/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });
}
