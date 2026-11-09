import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faVideo,
  faDoorOpen,
  faPlay,
  faStop,
  faEye,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Modal } from "../../ui/Modal";
import { formatScheduleTime12h } from "../../../lib/institutionTime";

type Session = any;

interface ConnectClassCardProps {
  session: Session;
  isStudent: boolean;
  isAdmin?: boolean;
  canStartEnd: boolean;
  onJoin: (s: Session) => void;
  onStart: (id: string) => void;
  onEnd: (id: string) => void;
  onViewCredentials?: (session: Session) => void;
}

const LIVE_STATUSES = new Set(["LIVE", "IN_PROGRESS"]);

function isLive(status: string) {
  return LIVE_STATUSES.has(status);
}

function statusTone(status: string) {
  const s = studentFacingStatus(status);
  if (LIVE_STATUSES.has(s)) {
    return {
      card: "border-emerald-200 bg-emerald-50/80",
      badge: "border-emerald-100 bg-emerald-100 text-emerald-600",
      dot: "bg-emerald-500",
      label: "font-semibold text-emerald-700",
      section: "border-emerald-100 bg-white/50",
      cred: "border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-200",
    };
  }
  if (s === "COMPLETED") {
    return {
      card: "border-slate-200 bg-slate-50/60",
      badge: "border-slate-200 bg-slate-200 text-slate-500",
      dot: "bg-slate-400",
      label: "font-medium text-slate-500",
      section: "border-slate-200 bg-white/40",
      cred: "border-slate-300 bg-slate-700 text-white hover:bg-slate-800 focus-visible:ring-slate-200",
    };
  }
  if (s === "SCHEDULED") {
    return {
      card: "border-blue-200 bg-blue-50/60",
      badge: "border-blue-100 bg-blue-100 text-blue-700",
      dot: "bg-blue-500",
      label: "font-medium text-blue-700",
      section: "border-blue-100 bg-white/50",
      cred: "border-blue-300 bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-200",
    };
  }
  if (s === "CANCELLED" || s === "EXPIRED") {
    return {
      card: "border-red-200 bg-red-50/60",
      badge: "border-red-100 bg-red-100 text-red-700",
      dot: "bg-red-500",
      label: "font-medium text-red-700",
      section: "border-red-100 bg-white/50",
      cred: "border-red-300 bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-200",
    };
  }
  return {
    card: "border-slate-200 bg-white",
    badge: "border-slate-200 bg-white text-slate-700",
    dot: "bg-slate-400",
    label: "font-medium text-slate-700",
    section: "border-slate-200 bg-slate-50/60",
    cred: "border-slate-300 bg-slate-700 text-white hover:bg-slate-800 focus-visible:ring-slate-200",
  };
}

function studentFacingStatus(status: string): string {
  return status === "ENDED" ? "COMPLETED" : status;
}

function statusLabel(status: string): string {
  if (isLive(status)) return "Live now";
  if (status === "SCHEDULED") return "Scheduled";
  if (status === "COMPLETED" || status === "ENDED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "EXPIRED") return "Expired";
  return status;
}

function statusVariant(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (isLive(status)) return "success";
  if (status === "SCHEDULED") return "info";
  if (status === "COMPLETED" || status === "ENDED") return "neutral";
  if (status === "CANCELLED" || status === "EXPIRED") return "danger";
  return "warning";
}

function initials(name: string): string {
  return (name || "Host")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "H";
}

function formatScheduleDate(s: Session): string {
  const raw = String(s.scheduledDate || "").trim();
  if (!raw) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function formatScheduleTime(s: Session): string {
  const start = formatScheduleTime12h(s.startTime);
  const end = formatScheduleTime12h(s.endTime);
  return start && end ? `${start} – ${end}` : start || end || "";
}

function formatDateTime(s: Session): string {
  const date = formatScheduleDate(s);
  const time = formatScheduleTime(s);
  return [date, time].filter(Boolean).join(" · ") || "Schedule not set";
}

function participantCount(s: Session): number {
  if (typeof s.participantCount === "number") return s.participantCount;
  if (Array.isArray(s.resolvedStudentUsers)) return s.resolvedStudentUsers.length;
  return 0;
}

function academicGroupLines(s: Session): string[] {
  const t = s.classTarget;
  if (!t || typeof t !== "object") return ["—"];
  const program = Array.isArray(t.programCodes) && t.programCodes[0] ? t.programCodes.join(", ") : "";
  const year = Array.isArray(t.academicYears) && t.academicYears[0] ? t.academicYears.join(", ") : "";
  const sem = Array.isArray(t.semesters) && t.semesters[0] ? `Semester ${t.semesters.join(", ")}` : "";
  const section = Array.isArray(t.sectionCodes) && t.sectionCodes[0] ? `Section ${t.sectionCodes.join(", ")}` : "";
  const batch = Array.isArray(t.batches) && t.batches[0] ? `Batch ${t.batches.join(", ")}` : "";
  const lines = [
    program,
    [year, sem].filter(Boolean).join(" · "),
    [section, batch].filter(Boolean).join(" · "),
  ].filter(Boolean);
  return lines.length ? lines : ["—"];
}

function academicGroup(s: Session): string {
  return academicGroupLines(s).join(" · ");
}

const InfoCard: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex min-h-[96px] min-w-0 flex-col rounded-xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
    <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">{label}</p>
    <div className="mt-2 min-w-0 flex-1 text-sm font-normal leading-6 text-slate-900">{children}</div>
  </div>
);

export const ConnectClassCard: React.FC<ConnectClassCardProps> = ({
  session,
  isStudent,
  isAdmin = false,
  canStartEnd,
  onJoin,
  onStart,
  onEnd,
  onViewCredentials,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const live = isLive(session.status);
  const tone = statusTone(session.status);
  const hostName = session.assignedTeacherName || (typeof session.host === "string" ? session.host : "Assigned teacher");
  const courseLine = session.courseCode
    ? `${session.courseCode} — ${session.courseName || ""}`
    : session.courseName || "Online class";
  const count = participantCount(session);

  const canStart = canStartEnd && session.status === "SCHEDULED";
  const canEnd = canStartEnd && (session.status === "SCHEDULED" || live);

  const groupLines = academicGroupLines(session);
  const scheduleDate = formatScheduleDate(session);
  const scheduleTime = formatScheduleTime(session);

  return (
    <>
      <section
        className={[
          "rounded-2xl border shadow-sm transition hover:shadow-md focus-within:shadow-md",
          tone.card,
        ].join(" ")}
      >
        <div className="p-4 sm:p-5">
          {/* Top: status + title + host */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={[
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-tight",
                    tone.badge,
                  ].join(" ")}
                >
                  <span
                    className={["h-1.5 w-1.5 shrink-0 rounded-full", tone.dot, live ? "animate-pulse" : ""].join(" ")}
                    aria-hidden="true"
                  />
                  <span className={tone.label}>{statusLabel(session.status)}</span>
                </span>
                <h3 className="min-w-0 text-base font-semibold leading-6 text-slate-900">{session.title || courseLine}</h3>
              </div>
              <div className="mt-2 flex items-center gap-2.5 text-sm text-slate-600">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0B1F33] text-[10px] font-semibold text-white">
                  {initials(hostName)}
                </span>
                <span className="min-w-0 truncate"><span className="font-medium text-slate-500">Host:</span> {hostName}</span>
              </div>
            </div>
          </div>

          <div className={`mt-4 rounded-xl border p-3 sm:p-4 ${tone.section}`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <InfoCard label="Subject">
                <p className="whitespace-normal break-words">{session.title || courseLine || "Online class"}</p>
              </InfoCard>

              <InfoCard label="Academic Group">
                {groupLines.map((line, idx) => (
                  <p key={`${line}-${idx}`} className="whitespace-normal break-words">{line}</p>
                ))}
              </InfoCard>

              <InfoCard label="Schedule">
                {scheduleDate || scheduleTime ? (
                  <>
                    {scheduleDate && <p className="whitespace-normal break-words">{scheduleDate}</p>}
                    {scheduleTime && <p className="whitespace-nowrap tabular-nums">{scheduleTime}</p>}
                  </>
                ) : (
                  <p>Schedule not set</p>
                )}
              </InfoCard>

              <InfoCard label="Participants">
                <p className="whitespace-nowrap tabular-nums">{count} {count === 1 ? "Participant" : "Participants"}</p>
              </InfoCard>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-white/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {canStart && (
                  <Button variant="ghost" size="sm" icon={faPlay} onClick={() => onStart(session.id)}>
                    Start Class
                  </Button>
                )}
                {canEnd && (
                  <Button variant="ghost" size="sm" icon={faStop} onClick={() => onEnd(session.id)}>
                    End Class
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                {live ? (
                  <Button
                    variant="success"
                    size="md"
                    icon={faDoorOpen}
                    iconPosition="left"
                    onClick={() => onJoin(session)}
                    className="w-full sm:w-auto text-base font-semibold"
                  >
                    Join Class
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="md"
                    icon={faEye}
                    iconPosition="left"
                    onClick={() => setShowDetails(true)}
                    className="w-full sm:w-auto"
                  >
                    View Details
                  </Button>
                )}
                {isAdmin && onViewCredentials && (
                  <Button
                    size="sm"
                    icon={faShieldHalved}
                    onClick={() => onViewCredentials(session)}
                    className={`w-full sm:w-auto border ${tone.cred}`}
                  >
                    Credentials
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Modal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        title={session.title || "Online Class"}
        subtitle={formatDateTime(session)}
        icon={faVideo}
        maxWidth="md"
        footer={<Button variant="secondary" onClick={() => setShowDetails(false)}>Close</Button>}
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-1.5 sm:grid-cols-2 text-sm">
              <div><span className="text-slate-500">Status</span><Badge size="sm" variant={statusVariant(session.status)} className="ml-auto">{statusLabel(session.status)}</Badge></div>
              <div className="sm:col-span-2"><span className="text-slate-500">Subject</span><div className="font-medium text-slate-900">{courseLine}</div></div>
              <div className="sm:col-span-2"><span className="text-slate-500">Academic group</span><div className="font-medium text-slate-900">{academicGroup(session)}</div></div>
              <div><span className="text-slate-500">Host</span><div className="font-medium text-slate-900">{hostName}</div></div>
              <div><span className="text-slate-500">Participants resolved</span><div className="font-medium text-slate-900">{count}</div></div>
            </div>
          </div>
          {session.description && (
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Description</span>
              <p className="mt-1 text-slate-700 leading-relaxed">{session.description}</p>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Join access is controlled by session credentials and server-side authorization for your academic group.
          </p>
        </div>
      </Modal>
    </>
  );
};

export default ConnectClassCard;
