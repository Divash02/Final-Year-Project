import React, { useCallback, useEffect, useRef, useState } from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { apiRequest } from "../../services/apiClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faCheck,
  faEllipsisVertical,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

type Notification = {
  id: string;
  title: string;
  message: string;
  category: string;
  priority: string;
  read: boolean;
  actionUrl: string | null;
  created_at: string;
};

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  open,
  onClose,
}) => {
  const { setActiveView } = useCollegeOS();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [menuId, setMenuId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ notifications: Notification[] }>(
        "/notifications",
      );
      setNotifications(result.notifications || []);
    } catch {
      setError("Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = async (id: string) => {
    setNotifications((cur) =>
      cur.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    try {
      await apiRequest(`/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      void load();
    }
  };

  const markUnread = async (id: string) => {
    setNotifications((cur) =>
      cur.map((n) => (n.id === id ? { ...n, read: false } : n)),
    );
    try {
      await apiRequest(`/notifications/${id}/unread`, { method: "PATCH" });
    } catch {
      void load();
    }
  };

  const dismiss = async (id: string) => {
    setNotifications((cur) => cur.filter((n) => n.id !== id));
    try {
      await apiRequest(`/notifications/${id}`, { method: "DELETE" });
    } catch {
      void load();
    }
  };

  const markAllRead = async () => {
    setNotifications((cur) => cur.map((n) => ({ ...n, read: true })));
    try {
      await apiRequest("/notifications/read-all", { method: "POST" });
    } catch {
      void load();
    }
  };

  const handleClick = (n: Notification) => {
    if (!n.read) void markRead(n.id);
    if (n.actionUrl) {
      setActiveView(n.actionUrl.replace(/^\//, ""));
      onClose();
    }
  };

  if (!open) return null;

  const visible =
    filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div
      ref={containerRef}
      className="absolute right-0 z-[160] mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FontAwesomeIcon
            icon={faBell}
            className="text-[var(--color-primary)]"
          />
          <span>Notifications</span>
          {unreadCount > 0 && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className="text-xs font-medium text-[var(--color-primary)] disabled:opacity-40"
          >
            Mark all read
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="ml-2 text-slate-400 hover:text-slate-600"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-100 px-4 py-2">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              filter === f
                ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "All" : "Unread"}
          </button>
        ))}
      </div>

      <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            {error}
            <button
              type="button"
              onClick={() => void load()}
              className="ml-2 text-[var(--color-primary)]"
            >
              Retry
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            {filter === "unread"
              ? "No unread notifications"
              : "No notifications yet"}
          </div>
        ) : (
          visible.map((n) => (
            <div
              key={n.id}
              className={`group relative px-4 py-3 transition ${
                !n.read
                  ? "bg-[var(--color-primary-soft)]/60 hover:bg-[var(--color-primary-soft)]"
                  : "hover:bg-slate-50"
              }`}
            >
              <button
                type="button"
                onClick={() => handleClick(n)}
                className="block w-full text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {n.title}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {relativeTime(n.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{n.message}</p>
              </button>
              <button
                type="button"
                onClick={() =>
                  setMenuId((prev) => (prev === n.id ? null : n.id))
                }
                aria-label="More actions"
                className="absolute right-2 top-2 rounded p-1 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100"
              >
                <FontAwesomeIcon icon={faEllipsisVertical} size="xs" />
              </button>
              {menuId === n.id && (
                <div className="absolute right-2 top-8 z-10 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {!n.read ? (
                    <button
                      type="button"
                      onClick={() => {
                        void markRead(n.id);
                        setMenuId(null);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                    >
                      Mark as read
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void markUnread(n.id);
                        setMenuId(null);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                    >
                      Mark as unread
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void dismiss(n.id);
                      setMenuId(null);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
