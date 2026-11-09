import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faShieldHalved, faDoorOpen, faCheck, faXmark, faVideoSlash, faMicrophoneSlash } from "@fortawesome/free-solid-svg-icons";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { Button } from "../../ui/Button";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { ConnectRoomClient } from "./ConnectRoomClient";
import { getConnectSession, getConnectWaitingRoom, decideConnectAdmission, endConnectSession } from "../../../services/connectApi";
import { formatScheduleTime12h } from "../../../lib/institutionTime";

type Session = any;
type WaitingRequest = any;

function extractSessionId(pathname: string): string | null {
  const match = pathname.match(/\/online-classes\/([A-Za-z0-9]{24})\/room(\/?)$/);
  return match ? match[1] : null;
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

interface PrejoinData {
  sessionId: string;
  policy: string;
  prefs: any;
  role: string;
}

function readPrejoin(sessionId: string): PrejoinData | null {
  try {
    const raw = sessionStorage.getItem(`collegeos:online-class:prejoin:${sessionId}`);
    return raw ? (JSON.parse(raw) as PrejoinData) : null;
  } catch { return null; }
}

export const OnlineClassRoomPage: React.FC = () => {
  const { currentUser, setActiveView } = useCollegeOS() as any;
  const sessionId = extractSessionId(window.location.pathname);
  const prejoin = useMemo(() => (sessionId ? readPrejoin(sessionId) : null), [sessionId]);
  const credential = prejoin?.prefs?.credential || null;
  const userRole = prejoin?.role || "STUDENT";

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waitingRequests, setWaitingRequests] = useState<WaitingRequest[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ending, setEnding] = useState(false);

  const uid = String(currentUser?.id || currentUser?._id || "");

  const isTeacher = useMemo(() => {
    if (!session) return userRole === "TEACHER";
    return (
      String(session.host || "") === uid ||
      String(session.assignedTeacher || "") === uid ||
      String(session.createdBy || "") === uid ||
      ((session.coHosts || []).some((id: any) => String(id) === uid))
    );
  }, [session, uid, userRole]);

  const admissionPolicy = useMemo(() => String(session?.admissionPolicy || "direct"), [session]);

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
      setWaitingRequests(Array.isArray(reqs) ? reqs : []);
    } catch {}
  }, [sessionId]);

  useEffect(() => {
    if (isTeacher && admissionPolicy === "approval") {
      loadWaitingRoom();
      const id = setInterval(loadWaitingRoom, 4000);
      return () => clearInterval(id);
    }
  }, [isTeacher, admissionPolicy, sessionId, loadWaitingRoom, refreshKey]);

  const handleDecide = useCallback(async (requestId: string, decision: "approve" | "reject") => {
    const sid = sessionId;
    if (!sid) return;
    try {
      await decideConnectAdmission(sid, requestId, decision);
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      alert(e?.message || "Admission decision failed.");
    }
  }, [sessionId]);

  const handleEndClass = useCallback(async () => {
    const sid = sessionId;
    if (!sid) return;
    if (!window.confirm("End the class for everyone? This will close the classroom and revoke all credentials.")) return;
    setEnding(true);
    try {
      await endConnectSession(sid);
      setActiveView("connect");
      window.location.href = "/connect";
    } catch (e: any) {
      setEnding(false);
      alert(e?.message || "Unable to end the session.");
    }
  }, [sessionId, setActiveView]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B1F33]">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#D4AF37] border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-slate-300">Entering classroom…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B1F33] p-6">
        <div className="max-w-md w-full">
          <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>
          <Button onClick={() => window.history.back()}>Back to classes</Button>
        </div>
      </div>
    );
  }

  const status = String(session.status);
  const hostName = session.assignedTeacherName || (typeof session.host === "string" ? session.host : "Assigned teacher");
  const courseLine = session.courseCode ? `${session.courseCode} — ${session.courseName || ""}` : session.courseName || "Online class";

  const pendingRequests = (waitingRequests || []).filter((r: any) => String(r.status) === "pending");

  return (
    <div className="min-h-screen bg-[#0B1F33]">
      <div className="border-b border-slate-700 bg-[#0B1F33]/90 px-4 py-3 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[#D4AF37]">CollegeOS Online Class</p>
            <h1 className="text-sm font-semibold text-white">{session.title || courseLine}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{hostName} &middot; {academicGroup(session)} &middot; {formatDateTime(session)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={status === "LIVE" ? "success" : "warning"} size="sm">{status}</Badge>
            <a href="/connect" className="text-xs text-[#D4AF37]/80 hover:text-white underline">Exit classroom</a>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main classroom */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-slate-600 bg-black min-h-[600px] flex flex-col">
                <ConnectRoomClient
                  sessionId={sessionId!}
                  onClose={() => {
                    setActiveView("connect");
                    window.location.href = "/connect";
                  }}
                  credential={credential}
                />
              </div>
            </div>

            {/* Teacher controls / student info sidebar */}
            <div className="lg:col-span-1 space-y-4">
              {isTeacher ? (
                <>
                  <div className="rounded-xl border border-slate-600 bg-[#112640] p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faShieldHalved} className="text-[#D4AF37]" />
                      <span className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider">Teacher Controls</span>
                    </div>
                    {admissionPolicy === "approval" && (
                      <>
                        <div className="space-y-1">
                          <span className="text-[10px] font-medium text-slate-400 uppercase">Waiting room ({pendingRequests.length})</span>
                          {pendingRequests.length === 0 ? (
                            <div className="text-xs text-slate-500 text-center py-2">No pending admissions.</div>
                          ) : (
                            <div className="space-y-2">
                              {pendingRequests.map((r: any) => (
                                <div key={r.id} className="flex items-center justify-between gap-2 bg-black/20 rounded p-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="h-6 w-6 rounded-full bg-slate-600 flex items-center justify-center text-[10px] text-white">
                                      {initials(r.name || r.userId || "?")}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs text-white truncate">{r.name || r.userId}</div>
                                      <div className="text-[10px] text-slate-400 truncate">{r.studentId || r.program || r.section || ""}</div>
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button size="sm" variant="success" onClick={() => handleDecide(r.id, "approve")} className="px-2 py-1 text-[10px]">
                                      <FontAwesomeIcon icon={faCheck} className="w-3 h-3" /> Approve
                                    </Button>
                                    <Button size="sm" variant="danger" onClick={() => handleDecide(r.id, "reject")} className="px-2 py-1 text-[10px]">
                                      <FontAwesomeIcon icon={faXmark} className="w-3 h-3" /> Reject
                                    </Button>
                                  </div>
                                </div>
                              ))}
                              <Button
                                variant="outline"
                                onClick={() => {
                                  pendingRequests.forEach((r: any) => handleDecide(r.id, "approve"));
                                }}
                                className="w-full text-xs border-slate-500 text-slate-300 hover:border-emerald-500 hover:text-emerald-400"
                              >
                                Approve All
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-600/40">
                          <span className="text-[10px] text-slate-400 uppercase">Policy</span>
                          <span className="text-[10px] text-emerald-400 font-medium">Approval required</span>
                        </div>
                      </>
                    )}
                    <div className="pt-2 border-t border-slate-600/40">
                      <Button
                        variant="danger"
                        isLoading={ending}
                        onClick={handleEndClass}
                        className="w-full text-xs py-2"
                      >
                        <FontAwesomeIcon icon={faDoorOpen} className="w-3 h-3 mr-1" /> End Class for Everyone
                      </Button>
                      <p className="text-[10px] text-slate-500 mt-1">Ends the session and revokes all credentials.</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-600 bg-[#112640] p-4">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Media state</div>
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <FontAwesomeIcon icon={faVideoSlash} className="text-slate-500" />
                      <span>Camera controlled per-participant</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-300 mt-1">
                      <FontAwesomeIcon icon={faMicrophoneSlash} className="text-slate-500" />
                      <span>Microphone controlled per-participant</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-slate-600 bg-[#112640] p-6 text-center space-y-4">
                  <div className="flex items-center justify-center gap-2">
                    <FontAwesomeIcon icon={faUsers} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Participant</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-white">You are in the classroom</div>
                    <div className="text-xs text-slate-400">{admissionPolicy === "approval" ? "Admitted by the teacher" : "Direct entry"}</div>
                  </div>
                  <div className="pt-2 border-t border-slate-600/40">
                    <p className="text-[10px] text-slate-500">Your camera and microphone settings from the pre-join lobby are applied.</p>
                  </div>
                  <Button variant="secondary" className="w-full py-2" onClick={() => {
                    setActiveView("connect");
                    window.location.href = "/connect";
                  }}>
                    Leave Meeting
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnlineClassRoomPage;
