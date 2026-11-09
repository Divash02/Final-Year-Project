import React from "react";
import { Drawer } from "../ui/Drawer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faCalendarDays,
  faCircleInfo,
  faEnvelope,
  faGraduationCap,
  faUser,
  faBuildingColumns,
  faArrowUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";
import type { NotificationItem } from "../../services/notificationsApi";

function initials(name?: string | null) {
  if (!name) return "C";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "C") + (parts[1]?.[0] || "");
}

function formatFullDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function senderIcon(type?: string | null) {
  if (type === "user") return faUser;
  if (type === "department") return faBuildingColumns;
  return faGraduationCap;
}

function categoryLabel(cat?: string) {
  if (!cat) return "General";
  return cat.replace(/[_-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function NotificationDetailDrawer({
  notification,
  open,
  onClose,
  onMarkRead,
  onMarkUnread,
  onOpenRelated,
}: {
  notification: NotificationItem | null;
  open: boolean;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onOpenRelated: (n: NotificationItem) => void;
}) {
  const n = notification;
  const senderName = n?.sender?.name || n?.senderLabel || "CollegeOS System";
  const senderMeta = [
    n?.sender?.role ? n.sender.role.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : null,
    n?.sender?.department || n?.senderDepartment || null,
    n?.sender?.designation || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const md = n?.metadata && typeof n.metadata === "object" ? (n.metadata as Record<string, any>) : {};
  const relatedRows: { label: string; value: string }[] = [];
  const push = (label: string, v: any) => {
    if (v == null || v === "" || v === "—") return;
    relatedRows.push({ label, value: String(v) });
  };
  push("Subject/Course", md.courseCode ? `${md.courseCode}${md.courseName ? ` — ${md.courseName}` : ""}` : md.courseName || md.subject || null);
  push("Program", md.program || md.programCode || null);
  push("Academic Year", md.academicYear || null);
  push("Semester", md.semester != null ? `Semester ${md.semester}` : null);
  push("Batch", md.batch || null);
  push("Section", md.section || null);
  push("Class Date", md.scheduledDate || null);
  push("Time", md.startTime && md.endTime ? `${md.startTime}–${md.endTime}` : md.startTime || null);
  if (n?.relatedEntityType) push("Related To", categoryLabel(n.relatedEntityType));

  return (
    <Drawer
      isOpen={open}
      onClose={onClose}
      title="Notification details"
      subtitle={n?.category ? categoryLabel(n.category) : undefined}
      icon={faBell}
      width="md"
      footer={
        n ? (
          <>
            {n.actionUrl ? (
              <button
                type="button"
                onClick={() => onOpenRelated(n)}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-95"
              >
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" />
                Open related page
              </button>
            ) : null}
            {n.read ? (
              <button
                type="button"
                onClick={() => onMarkUnread(n.id)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Mark as unread
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onMarkRead(n.id)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Mark as read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </>
        ) : null
      }
    >
      {!n ? (
        <p className="text-sm text-slate-500">No notification selected.</p>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold leading-6 text-slate-900">{n.title}</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{n.message}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sender</p>
            <div className="mt-3 flex items-start gap-3">
              {n.sender?.avatarUrl ? (
                <img src={n.sender.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                  {n.senderType === "system" || n.senderType === "department" || n.senderType === "automated" ? (
                    <FontAwesomeIcon icon={senderIcon(n.senderType)} className="text-slate-600" />
                  ) : (
                    initials(senderName).toUpperCase()
                  )}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{senderName}</p>
                {senderMeta ? <p className="text-xs text-slate-500">{senderMeta}</p> : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Date & time</dt>
                <dd className="text-right font-medium text-slate-800">{formatFullDate(n.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Category</dt>
                <dd className="text-right font-medium text-slate-800">{categoryLabel(n.category)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Status</dt>
                <dd className="text-right">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${n.read ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>
                    {n.read ? "Read" : "Unread"}
                  </span>
                </dd>
              </div>
              {n.readAt ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Read at</dt>
                  <dd className="text-right text-slate-700">{formatFullDate(n.readAt)}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          {relatedRows.length > 0 ? (
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Related information</p>
              <dl className="mt-3 space-y-2 text-sm">
                {relatedRows.map((r) => (
                  <div key={r.label} className="flex justify-between gap-4">
                    <dt className="text-slate-500">{r.label}</dt>
                    <dd className="text-right font-medium text-slate-800">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}

export default NotificationDetailDrawer;
