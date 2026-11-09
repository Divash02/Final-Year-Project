import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faUsers, faDoorOpen, faShieldHalved, faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { Button } from "../../ui/Button";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { getConnectSession, getConnectWaitingRoom } from "../../../services/connectApi";
import { formatScheduleTime12h } from "../../../lib/institutionTime";

type Session = any;

function extractSessionId(pathname: string): string | null {
  const match = pathname.match(/\/online-classes\/([A-Za-z0-9]{24})\/waiting(\/?)$/);
  return match ? match[1] : null;
}

function initials(name: string): string {
  return (name || "You")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "Y";
}

function formatDateTime(s: Session): string {
  const date = s.scheduledDate || "";
  const start = formatScheduleTime12h(s.startTime);
  const end = formatScheduleTime12h(s.endTime);
  const time = start && end ? `${start}–${end}` : start || end || "";
  return [date, time].filter(Boolean).join(" · ") || "Schedule not set";
}

function academicGroup(s: Session): string {
  const t = s.classTarget;
  if (!t || typeof t !== "object") return "—";
  const parts = [
    Array.isArray(t.programCodes) && t.programCodes[0] ? t.programCodes.join(", ") : null,
    Array.isArray(t.academicYears) && t.academicYears[0] ? t.academicYears.join(", ") : null,
    Array.isArray(t.semesters) && t.semesters[0] ? `Sem ${t.semesters.join(", ")}` : null,
    Array.isArray(t.sectionCodes) && t.sectionCodes[0] ? `Sec ${t.sectionCodes.join(", ")}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "—";
}

export const OnlineClassWaitingRoomPage: React.FC = () => {
  const { currentUser, setActiveView } = useCollegeOS() as any;
  const sessionId = extractSessionId(window.location.pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myRequest, setMyRequest] = useState<{ id: string; status: string; position: number } | null>(null);

  const uid = String(currentUser?.id || currentUser?._id || "");

  useEffect(() => {
    if (!sessionId) {
      setError("Invalid session link.");
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const data: any = await getConnectSession(sessionId);
        if (!active) return;
        setSession(data?.session || null);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || "Unable to load session details.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [sessionId]);

  const loadWaitingRoom = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data: any = await getConnectWaitingRoom(sessionId);
      const reqs = data?.requests || data?.waitingRoomRequests || [];
      const list = Array.isArray(reqs) ? reqs : [];
      const mine = list.find((r: any) => String(r.user) === uid);
      if (mine) {
        const pending = list.filter((r: any) => String(r.status) === "pending");
        const position = pending.findIndex((r: any) => String(r._id || r.id) === String(mine._id || mine.id)) + 1;
        setMyRequest({ id: String(mine._id || mine.id), status: String(mine.status), position: position > 0 ? position : 0 });
      } else {
        setMyRequest(null);
      }
    } catch {}
  }, [sessionId, uid]);

  useEffect(() => {
    loadWaitingRoom();
    const id = setInterval(loadWaitingRoom, 4000);
    return () => clearInterval(id);
  }, [loadWaitingRoom]);

  const userName = useMemo(() => {
    if (!currentUser) return "Participant";
    return [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || "Participant";
  }, [currentUser]);

  const status = String(session?.status);
  const hostName = session?.assignedTeacherName || (typeof session?.host === "string" ? session.host : "Assigned teacher");
  const courseLine = session?.courseCode ? `${session.courseCode} — ${session.courseName || ""}` : session?.courseName || "Online class";

  return (
    <div className="min-h-screen bg-[#0B1F33]">
      <div className="border-b border-slate-700 bg-[#0B1F33]/90 px-4 py-3 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[#D4AF37]">CollegeOS Online Class</p>
            <h1 className="text-sm font-semibold text-white">{session?.title || courseLine}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{hostName} &middot; {academicGroup(session || ({} as Session))}</p>
          </div>
          <a href="/connect" className="text-xs text-[#D4AF37]/80 hover:text-white underline">Exit</a>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6">
        <div className="max-w-lg mx-auto">
          {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

          <div className="rounded-xl border border-slate-600 bg-[#112640] p-8 text-center space-y-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0B1F33] text-[#D4AF37] mx-auto mb-3">
              <FontAwesomeIcon icon={faClock} className="text-xl" />
            </div>
            <h2 className="text-base font-semibold text-white">Waiting for teacher approval</h2>
            <p className="text-sm text-slate-400">
              Your admission request has been sent to <span className="text-white font-medium">{hostName}</span>. Please wait here until the teacher approves your entry into the classroom.
            </p>

            {myRequest && (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 uppercase tracking-wider">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-600 text-[10px]">
                    {myRequest.position > 0 ? myRequest.position : "—"}
                  </span>
                  <span>Your place in line</span>
                </div>
                <Badge variant={myRequest.status === "pending" ? "info" : "success"} size="sm">
                  {myRequest.status === "pending" ? "Waiting for approval" : "Approved — entering classroom…"}
                </Badge>
              </div>
            )}

            {!myRequest && session?.admissionPolicy === "approval" && (
              <div className="text-xs text-slate-500">Submitting your admission request…</div>
            )}

            <Button
              variant="secondary"
              onClick={() => {
                setActiveView("connect");
                window.location.href = "/connect";
              }}
              className="w-full py-2"
            >
              <FontAwesomeIcon icon={faDoorOpen} className="w-3 h-3 mr-1" /> Cancel and exit
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnlineClassWaitingRoomPage;
