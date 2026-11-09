import React, { useCallback, useEffect, useRef, useState } from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faEllipsisVertical, faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  fetchNotifications,
  fetchNotification,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  dismissNotification,
  type NotificationItem,
} from "../../services/notificationsApi";
import { useNotificationSocket } from "../../services/notificationSocket";
import NotificationDetailDrawer from "./NotificationDetailDrawer";

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
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

function mergeUnique(prev: NotificationItem[], incoming: NotificationItem[]) {
  const seen = new Set(prev.map((n) => n.id));
  const merged = [...prev];
  for (const n of incoming) {
    if (!seen.has(n.id)) {
      seen.add(n.id);
      merged.push(n);
    }
  }
  return merged;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  open,
  onClose,
  onUnreadChange,
}) => {
  const { setActiveView, currentUser } = useCollegeOS() as any;
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selected, setSelected] = useState<NotificationItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const applyUnread = useCallback(
    (count: number) => {
      setUnreadCount(count);
      onUnreadChange?.(count);
    },
    [onUnreadChange],
  );

  const load = useCallback(
    async (reset = true) => {
      if (reset) {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await fetchNotifications({ limit: 20, read: filter === "unread" ? false : undefined });
        setNotifications(result.notifications || []);
        setNextCursor(result.nextCursor || null);
        setHasMore(Boolean(result.hasMore));
        applyUnread(result.unreadCount || 0);
      } catch {
        if (reset) setError("Failed to load notifications.");
      } finally {
        if (reset) setLoading(false);
      }
    },
    [filter, applyUnread],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchNotifications({
        limit: 20,
        cursor: nextCursor,
        read: filter === "unread" ? false : undefined,
      });
      setNotifications((prev) => mergeUnique(prev, result.notifications || []));
      setNextCursor(result.nextCursor || null);
      setHasMore(Boolean(result.hasMore));
      applyUnread(result.unreadCount ?? unreadCount);
    } catch {
      // keep existing list
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, loadingMore, filter, unreadCount, applyUnread]);

  useEffect(() => {
    if (open) void load(true);
  }, [open, load]);

  useNotificationSocket(Boolean(currentUser), {
    onNew: (n) => {
      if (!n?.id) return;
      setNotifications((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;
        return [n as NotificationItem, ...prev];
      });
      setUnreadCount((c) => {
        const next = !n.read ? c + 1 : c;
        onUnreadChange?.(next);
        return next;
      });
    },
    onUnread: (p) => {
      if (typeof p?.unreadCount === "number") applyUnread(p.unreadCount);
    },
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (detailOpen) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, detailOpen]);

  const markRead = async (id: string) => {
    setNotifications((cur) => cur.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setSelected((s) => (s?.id === id ? { ...s, read: true } : s));
    try {
      const res = await markNotificationRead(id);
      if (res.notification) {
        setNotifications((cur) => cur.map((n) => (n.id === id ? res.notification! : n)));
        setSelected((s) => (s?.id === id ? res.notification! : s));
      }
      setUnreadCount((c) => {
        const next = Math.max(0, c - 1);
        onUnreadChange?.(next);
        return next;
      });
    } catch {
      void load(true);
    }
  };

  const markUnread = async (id: string) => {
    setNotifications((cur) => cur.map((n) => (n.id === id ? { ...n, read: false } : n)));
    setSelected((s) => (s?.id === id ? { ...s, read: false } : s));
    try {
      const res = await markNotificationUnread(id);
      if (res.notification) {
        setNotifications((cur) => cur.map((n) => (n.id === id ? res.notification! : n)));
        setSelected((s) => (s?.id === id ? res.notification! : s));
      }
      setUnreadCount((c) => {
        const next = c + 1;
        onUnreadChange?.(next);
        return next;
      });
    } catch {
      void load(true);
    }
  };

  const dismiss = async (id: string) => {
    setNotifications((cur) => cur.filter((n) => n.id !== id));
    if (selected?.id === id) {
      setSelected(null);
      setDetailOpen(false);
    }
    try {
      await dismissNotification(id);
    } catch {
      void load(true);
    }
  };

  const markAllRead = async () => {
    setNotifications((cur) => cur.map((n) => ({ ...n, read: true })));
    setSelected((s) => (s ? { ...s, read: true } : s));
    applyUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      void load(true);
    }
  };

  const openDetail = async (n: NotificationItem) => {
    setSelected(n);
    setDetailOpen(true);
    setMenuId(null);
    if (!n.read) void markRead(n.id);
    try {
      const res = await fetchNotification(n.id);
      if (res?.notification) {
        setSelected(res.notification);
        setNotifications((cur) => cur.map((x) => (x.id === n.id ? res.notification : x)));
      }
    } catch {
      // keep optimistic/partial
    }
  };

  const openRelated = (n: NotificationItem) => {
    if (n.actionUrl) {
      const url = n.actionUrl.replace(/^\//, "");
      setActiveView(url);
      setDetailOpen(false);
      onClose();
    }
  };

  const goToCenter = () => {
    setActiveView("notifications");
    setDetailOpen(false);
    onClose();
  };

  if (!open) return null;

  const visible =
    filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) void loadMore();
  };

  return (
    <>
      <div
        ref={containerRef}
        className="absolute right-0 z-[160] mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FontAwesomeIcon icon={faBell} className="text-[var(--color-primary)]" />
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

        <div
          ref={listRef}
          onScroll={onScroll}
          className="max-h-96 divide-y divide-slate-100 overflow-y-auto"
        >
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : error ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              {error}
              <button type="button" onClick={() => void load(true)} className="ml-2 text-[var(--color-primary)]">
                Retry
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </div>
          ) : (
            <>
              {visible.map((n) => (
                <div
                  key={n.id}
                  className={`group relative px-4 py-3 transition ${
                    !n.read ? "bg-[var(--color-primary-soft)]/50 hover:bg-[var(--color-primary-soft)]" : "hover:bg-slate-50"
                  }`}
                >
                  <button type="button" onClick={() => void openDetail(n)} className="block w-full text-left">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">{n.title}</span>
                      <span className="shrink-0 text-xs text-slate-400">{relativeTime(n.created_at)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {n.sender?.name || n.senderLabel || "CollegeOS System"}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuId((prev) => (prev === n.id ? null : n.id))}
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
              ))}
              {loadingMore && <div className="px-4 py-3 text-center text-xs text-slate-400">Loading more…</div>}
            </>
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-2.5">
          <button
            type="button"
            onClick={goToCenter}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            View All Notifications
          </button>
        </div>
      </div>

      <NotificationDetailDrawer
        notification={selected}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onMarkRead={(id) => void markRead(id)}
        onMarkUnread={(id) => void markUnread(id)}
        onOpenRelated={openRelated}
      />
    </>
  );
};

export default NotificationCenter;
