import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDoorOpen, faEye, faEyeSlash, faKey, faShieldHalved, faSignInAlt, faUniversity } from "@fortawesome/free-solid-svg-icons";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { Button } from "../../ui/Button";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { Input } from "../../ui/Input";
import { getConnectSession, joinConnectSession } from "../../../services/connectApi";
import { formatScheduleTime12h } from "../../../lib/institutionTime";

type Session = any;

interface JoinCredentials {
  sessionId16?: string;
  password?: string;
}

function extractSessionId(pathname: string): string | null {
  const match = pathname.match(/\/online-classes\/([A-Za-z0-9]{24})\/join(\/?)$/);
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

export const OnlineClassJoinPage: React.FC = () => {
  const { currentUser, setActiveView } = useCollegeOS() as any;
  const sessionId = extractSessionId(window.location.pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [meetingId, setMeetingId] = useState("");
  const [meetingPassword, setMeetingPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const resolved = useRef<Session | null>(null);

  const isHost = useMemo(() => {
    if (!session || !currentUser) return false;
    const uid = String(currentUser.id || currentUser._id);
    return (
      String(session.host || "") === uid ||
      String(session.assignedTeacher || "") === uid
    );
  }, [session, currentUser]);

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
        const s = data?.session || null;
        if (!active) return;
        setSession(s);
        resolved.current = s;
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || "Unable to load session details.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [sessionId]);

  const handleJoin = useCallback(async () => {
    setJoinError(null);
    if (!sessionId) return;
    setJoining(true);
    try {
      const payload: any = {};
      const hasCreds = meetingId.trim().length > 0 || meetingPassword.trim().length > 0;
      if (hasCreds) {
        payload.sessionCredentialId = meetingId.trim();
        payload.sessionCredentialPassword = meetingPassword.trim();
      }
      const data: any = await joinConnectSession(sessionId, payload);
      const role = data?.role || (isHost ? "TEACHER" : "STUDENT");
      sessionStorage.setItem(
        `collegeos:online-class:join:${sessionId}`,
        JSON.stringify({ sessionId, role, session: data?.session || session, credential: { sessionId16: meetingId.trim(), password: meetingPassword.trim() } }),
      );
      window.history.pushState({}, "", `/online-classes/${sessionId}/pre-join`);
      setActiveView("online_class_pre_join");
    } catch (e: any) {
      setJoinError(e?.message || "Unable to join the session. Check the Meeting ID and Password and try again.");
    } finally {
      setJoining(false);
    }
  }, [sessionId, meetingId, meetingPassword, isHost, session, setActiveView]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#0B1F33] border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-slate-600">Loading class session…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full">
          <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>
          <Button onClick={() => window.history.back()}>Back to classes</Button>
        </div>
      </div>
    );
  }

  const status = String(session.status);
  const live = status === "LIVE" || status === "IN_PROGRESS";
  const hostName = session.assignedTeacherName || (typeof session.host === "string" ? session.host : "Assigned teacher");
  const courseLine = session.courseCode ? `${session.courseCode} — ${session.courseName || ""}` : session.courseName || "Online class";

  return (
    <div className="min-h-screen bg-slate-50/60">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B1F33] text-white shadow-sm">
                <FontAwesomeIcon icon={faUniversity} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Online Classes</p>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">Join Online Class</h1>
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Enter the class session credentials provided by your institution. Access is authorized only for your academic group.
            </p>
          </div>
          <a href="/connect" className="text-sm text-[#0B1F33] hover:underline">Back to Online Classes</a>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      "inline-flex items-center gap-1.5 rounded-md border font-medium leading-tight",
                      live ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700",
                    ].join(" ")}
                  >
                    <span className={[live ? "bg-emerald-600 animate-pulse" : "bg-slate-400", "h-1.5 w-1.5 shrink-0 rounded-full"].join(" ")} aria-hidden="true" />
                    <span className={live ? "font-semibold text-emerald-800" : "font-medium text-slate-700"}>{status}</span>
                  </span>
                </div>
                <h2 className="text-base font-semibold text-slate-900">{session.title || courseLine}</h2>
                <div className="flex items-center gap-2.5 text-xs text-slate-500 mt-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0B1F33] text-[10px] text-white">{initials(hostName)}</span>
                  <span>Host: {hostName}</span>
                </div>
              </div>
              <Badge variant={live ? "success" : "info"} size="sm">{live ? "LIVE NOW" : "Scheduled"}</Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm mt-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Subject</span>
                <div className="font-medium text-slate-900">{courseLine}</div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Academic group</span>
                <div className="font-medium text-slate-900">{academicGroup(session)}</div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Schedule</span>
                <div className="font-medium text-slate-900">{formatDateTime(session)}</div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Access</span>
                <div className="font-medium text-slate-900">{isHost ? "Authenticated host" : "Credential required"}</div>
              </div>
            </div>

            {error && <Alert variant="error" className="mt-4">{error}</Alert>}

            <form onSubmit={(e) => { e.preventDefault(); handleJoin(); }} className="mt-6 space-y-4">
              <p className="text-sm text-slate-600">
                {isHost
                  ? "Join with your authenticated CollegeOS identity as the class host. Credentials are optional."
                  : "Enter the Meeting ID and Meeting Password provided by your institution. Both are required."}
              </p>
              {!isHost && (
                <Alert variant="info" className="mt-2 text-xs">
                  Join with your authenticated CollegeOS identity if you are the assigned host, teacher, or an invited participant. Credentials are validated server-side.
                </Alert>
              )}
              <Input
                label="Meeting ID"
                required={!isHost}
                value={meetingId}
                onChange={(e) => setMeetingId(e.target.value)}
                placeholder="e.g. 1234567890123456"
                leftIcon={faKey}
                error={joinError && !isHost ? "Invalid Meeting ID." : undefined}
                disabled={joining}
              />
              <Input
                label="Meeting Password"
                type={showPassword ? "text" : "password"}
                required={!isHost}
                value={meetingPassword}
                onChange={(e) => setMeetingPassword(e.target.value)}
                placeholder="Meeting password"
                trailing={
                  <Button variant="ghost" size="xs" onClick={() => setShowPassword(!showPassword)} disabled={joining}>
                    <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                  </Button>
                }
                error={joinError && !isHost ? "Incorrect Meeting Password." : undefined}
                disabled={joining}
              />
              <p className="text-xs text-slate-500">
                {isHost ? "Leave the fields blank to join using your CollegeOS account as host." : "Never share your Meeting Password. CollegeOS will never ask for your account password."}
              </p>
              {joinError && <Alert variant="error">{joinError}</Alert>}
              <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => window.history.back()} disabled={joining}>Cancel</Button>
                <Button
                  type="submit"
                  icon={faSignInAlt}
                  iconPosition="left"
                  isLoading={joining}
                  disabled={joining}
                >
                  Join Meeting
                </Button>
              </div>
            </form>
          </div>

          <p className="mt-6 text-xs text-center text-slate-500">
            Credentials remain valid until the teacher ends the class or an administrator revokes them. Refreshing this page will not change your session credentials.
          </p>
        </div>
      </div>
    </div>
  );
};

export default OnlineClassJoinPage;
