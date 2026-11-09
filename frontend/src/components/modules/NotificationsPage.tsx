import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faCheckDouble, faMagnifyingGlass, faRotate } from "@fortawesome/free-solid-svg-icons";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { EmptyState } from "../ui/EmptyState";
import { useCollegeOS } from "../../context/CollegeOSContext";
import {
  fetchNotifications,
  fetchNotification,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  type NotificationItem,
} from "../../services/notificationsApi";
import { useNotificationSocket } from "../../services/notificationSocket";
import NotificationDetailDrawer from "../common/NotificationDetailDrawer";

const CATEGORIES = [
  { value: "all", label: "All categories" },
  { value: "connect", label: "Online Classes" },
  { value: "exam", label: "Exams" },
  { value: "lms_assignment", label: "Assignments" },
  { value: "lms_material", label: "Materials" },
  { value: "lms_quiz", label: "Quizzes" },
  { value: "lms_announcement", label: "Announcements" },
  { value: "attendance", label: "Attendance" },
  { value: "mail", label: "Mail" },
  { value: "message", label: "Messages" },
  { value: "finance", label: "Finance" },
  { value: "notice", label: "Notices" },
  { value: "request", label: "Requests" },
  { value: "system", label: "System" },
];

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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

export const NotificationsPage: React.FC = () => {
  const { setActiveView, currentUser } = useCollegeOS() as any;
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [qInput, setQInput] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selected, setSelected] = useState<NotificationItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (reset = true) => {
      if (reset) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetchNotifications({
          limit: 30,
          read: readFilter === "all" ? undefined : readFilter === "read",
          category: category === "all" ? undefined : category,
          q: query || undefined,
        });
        setItems(res.notifications || []);
        setNextCursor(res.nextCursor || null);
        setHasMore(Boolean(res.hasMore));
        setUnreadCount(res.unreadCount || 0);
      } catch (e: any) {
        if (reset) setError(e?.message || "Failed to load notifications.");
      } finally {
        if (reset) setLoading(false);
      }
    },
    [readFilter, category, query],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchNotifications({
        limit: 30,
        cursor: nextCursor,
        read: readFilter === "all" ? undefined : readFilter === "read",
        category: category === "all" ? undefined : category,
        q: query || undefined,
      });
      setItems((prev) => mergeUnique(prev, res.notifications || []));
      setNextCursor(res.nextCursor || null);
      setHasMore(Boolean(res.hasMore));
      setUnreadCount(res.unreadCount ?? unreadCount);
    } catch {
      // keep list
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, loadingMore, readFilter, category, query, unreadCount]);

  useEffect(() => {
    void load(true);
  }, [load]);

  useNotificationSocket(Boolean(currentUser), {
    onNew: (n) => {
      if (!n?.id) return;
      // Only prepend when it matches current filters broadly (server is source of truth; refresh handles strictness)
      if (readFilter === "read") return;
      if (category !== "all" && n.category !== category) return;
      if (query && !`${n.title} ${n.message}`.toLowerCase().includes(query.toLowerCase())) return;
      setItems((prev) => (prev.some((x) => x.id === n.id) ? prev : [n as NotificationItem, ...prev]));
      if (!n.read) setUnreadCount((c) => c + 1);
    },
    onUnread: (p) => {
      if (typeof p?.unreadCount === "number") setUnreadCount(p.unreadCount);
    },
  });

  useEffect(() => {
    const t = setTimeout(() => setQuery(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) void loadMore();
  };

  const markRead = async (id: string) => {
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setSelected((s) => (s?.id === id ? { ...s, read: true } : s));
    try {
      const res = await markNotificationRead(id);
      if (res.notification) {
        setItems((cur) => cur.map((n) => (n.id === id ? res.notification! : n)));
        setSelected((s) => (s?.id === id ? res.notification! : s));
      }
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      void load(true);
    }
  };

  const markUnread = async (id: string) => {
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, read: false } : n)));
    setSelected((s) => (s?.id === id ? { ...s, read: false } : s));
    try {
      const res = await markNotificationUnread(id);
      if (res.notification) {
        setItems((cur) => cur.map((n) => (n.id === id ? res.notification! : n)));
        setSelected((s) => (s?.id === id ? res.notification! : s));
      }
      setUnreadCount((c) => c + 1);
    } catch {
      void load(true);
    }
  };

  const markAllRead = async () => {
    setItems((cur) => cur.map((n) => ({ ...n, read: true })));
    setSelected((s) => (s ? { ...s, read: true } : s));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      void load(true);
    }
  };

  const openDetail = async (n: NotificationItem) => {
    setSelected(n);
    setDetailOpen(true);
    if (!n.read) void markRead(n.id);
    try {
      const res = await fetchNotification(n.id);
      if (res?.notification) {
        setSelected(res.notification);
        setItems((cur) => cur.map((x) => (x.id === n.id ? res.notification : x)));
      }
    } catch {}
  };

  const openRelated = (n: NotificationItem) => {
    if (n.actionUrl) {
      setActiveView(n.actionUrl.replace(/^\//, ""));
      setDetailOpen(false);
    }
  };

  const visible = useMemo(() => items, [items]);

  return (
    <div className="min-h-full bg-slate-50/40">
      <PageHeader
        title="Notifications"
        description="Stay updated with your academic activities, communication, and important college announcements."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={faRotate} onClick={() => void load(true)} isLoading={loading}>
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={faCheckDouble}
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
            >
              Mark all as read
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6">
        {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "unread", "read"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setReadFilter(f)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    readFilter === f
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {f === "all" ? "All" : f === "unread" ? `Unread${unreadCount ? ` (${unreadCount})` : ""}` : "Read"}
                </button>
              ))}
            </div>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:max-w-xs">
                <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Search notifications..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                aria-label="Filter by category"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div
          ref={listRef}
          onScroll={onScroll}
          className="max-h-[calc(100vh-18rem)] min-h-[24rem] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={faBell}
                title="No notifications"
                description={
                  readFilter === "unread"
                    ? "You're all caught up. Unread notifications will appear here."
                    : query || category !== "all"
                      ? "No notifications match your current filters."
                      : "Your notifications will appear here as academic and system updates are generated."
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void openDetail(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                      !n.read ? "bg-emerald-50/30 hover:bg-emerald-50/50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {(n.sender?.name || n.senderLabel || "C").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className={`text-sm ${!n.read ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>
                          {n.title}
                        </p>
                        <span className="shrink-0 text-xs text-slate-400">{formatDateTime(n.created_at)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{n.message}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>{n.sender?.name || n.senderLabel || "CollegeOS System"}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                          {(n.category || "general").replace(/[_-]/g, " ")}
                        </span>
                        {!n.read && <span className="font-medium text-emerald-700">Unread</span>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {loadingMore && <div className="border-t border-slate-100 px-4 py-3 text-center text-sm text-slate-500">Loading more notifications…</div>}
          {!loading && hasMore && !loadingMore && (
            <div className="border-t border-slate-100 px-4 py-3 text-center">
              <button type="button" onClick={() => void loadMore()} className="text-sm font-medium text-[var(--color-primary)]">
                Load more
              </button>
            </div>
          )}
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
    </div>
  );
};

export default NotificationsPage;
