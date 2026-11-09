import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faVideo, faMicrophone, faMicrophoneSlash, faVideoSlash, faDesktop, faUsers, faArrowRight, faPhoneSlash, faExpand } from "@fortawesome/free-solid-svg-icons";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { Button } from "../../ui/Button";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { Input } from "../../ui/Input";
import { SelectField } from "../../ui/Input";
import { getConnectSession, requestConnectAdmission } from "../../../services/connectApi";
import { formatScheduleTime12h } from "../../../lib/institutionTime";

type Session = any;

function extractSessionId(pathname: string): string | null {
  const match = pathname.match(/\/online-classes\/([A-Za-z0-9]{24})\/pre-join(\/?)$/);
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
    Array.isArray(s.semesters) ? null : null,
    Array.isArray(t.semesters) && t.semesters[0] ? `Sem ${t.semesters.join(", ")}` : null,
    Array.isArray(t.sectionCodes) && t.sectionCodes[0] ? `Sec ${t.sectionCodes.join(", ")}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "—";
}

const POLICY_LABELS: Record<string, { label: string; desc: string }> = {
  direct: { label: "Direct Entry", desc: "Enter the classroom immediately with valid credentials and academic authorization." },
  approval: { label: "Teacher Approval Required", desc: "Wait in the waiting room until the teacher approves your entry." },
};

type MediaKind = "videoinput" | "audioinput";

export const OnlineClassPreJoinPage: React.FC = () => {
  const { currentUser, setActiveView } = useCollegeOS() as any;
  const sessionId = extractSessionId(window.location.pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Media state
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState("");
  const [micDeviceId, setMicDeviceId] = useState("");
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [joining, setJoining] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const userName = useMemo(() => {
    if (!currentUser) return "Participant";
    return [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || "Participant";
  }, [currentUser]);

  const admissionPolicy = useMemo(() => {
    if (!session) return "direct";
    return String(session.admissionPolicy || "direct");
  }, [session]);

  // Enumerate devices
  const loadDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput"));
      setMicrophones(devices.filter((d) => d.kind === "audioinput"));
    } catch {}
  }, []);

  const stopAudioMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      try { void ctx.close(); } catch {}
    }
  }, []);

  // Start / restart preview with current device + enabled states
  const startPreview = useCallback(async (reset = false) => {
    // Stop previous meter/context before creating a new stream/context.
    stopAudioMeter();
    // Stop existing tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setPermissionError(null);
    setAudioLevel(0);

    const videoConstraint: boolean | MediaTrackConstraints = cameraOn
      ? cameraDeviceId ? { deviceId: { exact: cameraDeviceId } } : true
      : false;
    const audioConstraint: boolean | MediaTrackConstraints = micOn
      ? micDeviceId ? { deviceId: { exact: micDeviceId } } : true
      : false;

    if (!videoConstraint && !audioConstraint) {
      setStream(null);
      return;
    }

    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: audioConstraint });
      streamRef.current = s;
      setStream(s);

      const videoEl = videoRef.current;
      if (videoEl && s.getVideoTracks().length > 0) {
        videoEl.srcObject = s;
        try { void videoEl.play().catch(() => {}); } catch {}
      }

      // Audio level meter from microphone track
      if (s.getAudioTracks().length > 0) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          // If preview restarted/unmounted while constructing, close safely.
          if (streamRef.current !== s) {
            if (ctx.state !== "closed") try { void ctx.close(); } catch {}
          } else {
            audioCtxRef.current = ctx;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            const src = ctx.createMediaStreamSource(s);
            src.connect(analyser);
            analyserRef.current = analyser;
            const data = new Uint8Array(analyser.frequencyBinCount);
            const tick = () => {
              if (audioCtxRef.current !== ctx || ctx.state === "closed") return;
              analyser.getByteFrequencyData(data);
              let sum = 0;
              for (let i = 0; i < data.length; i++) sum += data[i];
              const level = Math.min(100, Math.round((sum / data.length) / 255 * 100));
              setAudioLevel(level);
              rafRef.current = requestAnimationFrame(tick);
            };
            tick();
          }
        }
      }

      await loadDevices();
    } catch (err: any) {
      stopAudioMeter();
      let msg = "Unable to access camera or microphone.";
      const name = String(err?.name || "");
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        msg = "Camera/microphone permission was denied. You can still join with media off.";
      } else if (name === "NotFoundError") {
        msg = "No camera or microphone found.";
      }
      setPermissionError(msg);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setStream(null);
    }
  }, [cameraOn, micOn, cameraDeviceId, micDeviceId, loadDevices, stopAudioMeter]);

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
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || "Unable to load session details.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [sessionId]);

  // Initialize/re-apply preview when session, device, or toggle state changes.
  // `startPreview` already encapsulates the relevant inputs and performs safe cleanup.
  useEffect(() => {
    if (!session) return;
    void startPreview();
    return () => {
      stopAudioMeter();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [session, startPreview, stopAudioMeter]);

  const handleJoinNow = useCallback(async () => {
    setJoinError(null);
    if (!sessionId) return;
    setJoining(true);
    try {
      const policy = admissionPolicy;
      const joinRaw = sessionStorage.getItem(`collegeos:online-class:join:${sessionId}`);
      let joinData: any = null;
      try { joinData = joinRaw ? JSON.parse(joinRaw) : null; } catch {}
      const prefs = {
        cameraOn,
        micOn,
        cameraDeviceId,
        micDeviceId,
        userName,
        credential: joinData?.credential || null,
        role: joinData?.role || (String((session as any)?.assignedTeacher||"")===localUserId||String((session as any)?.host||"")===localUserId ? "TEACHER" : "STUDENT"),
      };
      sessionStorage.setItem(
        `collegeos:online-class:prejoin:${sessionId}`,
        JSON.stringify({ sessionId, policy, prefs, role: prefs.role }),
      );

      // Hosts/teachers manage the room; they must never be routed through student admission requests.
      const hostLike = ["TEACHER","HOST","CO_HOST","STAFF"].includes(String(joinData?.role||"").toUpperCase())
        || String((session as any)?.assignedTeacher||"") === localUserId
        || String((session as any)?.host||"") === localUserId
        || String((session as any)?.createdBy||"") === localUserId;
      if (policy === "approval" && !hostLike) {
        const data: any = await requestConnectAdmission(sessionId);
        if (data?.error) throw new Error(data.error);
        window.history.pushState({}, "", `/online-classes/${sessionId}/waiting`);
        setActiveView("online_class_waiting");
      } else {
        window.history.pushState({}, "", `/online-classes/${sessionId}/classroom`);
        setActiveView("online_class_classroom");
      }
    } catch (e: any) {
      setJoinError(e?.message || "Unable to send admission request. Try again.");
    } finally {
      setJoining(false);
    }
  }, [sessionId, admissionPolicy, cameraOn, micOn, cameraDeviceId, micDeviceId, userName, setActiveView]);

  const toggleMedia = () => { /* handled by individual toggles */ };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#0B1F33] border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-slate-600">Preparing your classroom…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full">
          <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>
          <Button onClick={() => window.history.back()}>Back</Button>
        </div>
      </div>
    );
  }

  const status = String(session.status);
  const live = status === "LIVE" || status === "IN_PROGRESS";
  const hostName = session.assignedTeacherName || (typeof session.host === "string" ? session.host : "Assigned teacher");
  const courseLine = session.courseCode ? `${session.courseCode} — ${session.courseName || ""}` : session.courseName || "Online class";
  const policyInfo = POLICY_LABELS[admissionPolicy];

  const localUserId = String(currentUser?.id || currentUser?._id || "");

  return (
    <div className="min-h-screen bg-slate-50/60">
        <div className="border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-800">CollegeOS Online Class</p>
            <h1 className="text-sm font-semibold text-slate-900">{session.title || courseLine}</h1>
            <p className="text-xs text-slate-600 mt-0.5">{hostName} &middot; {academicGroup(session)}</p>
          </div>
          <a href="/connect" className="text-xs text-slate-800 hover:text-emerald-800 underline">Exit</a>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6">
        <div className="max-w-5xl mx-auto">
          {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: camera preview */}
            <div className="lg:col-span-7 space-y-4">
              <div className="rounded-xl border border-slate-600 bg-black relative overflow-hidden aspect-video group">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full" />
                {!stream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
                    <FontAwesomeIcon icon={cameraOn ? faVideoSlash : faVideo} className="mb-2 text-2xl" />
                    <p className="text-sm">{permissionError || (cameraOn ? "Camera off" : "Camera preview")}</p>
                  </div>
                )}
                {stream && permissionError === null && (
                  <div className="absolute top-2 right-2 z-20 bg-black/60 rounded px-2 py-1 text-[10px] text-emerald-400">
                    LIVE PREVIEW
                  </div>
                )}
              </div>

              {/* Media controls */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Button
                      variant={cameraOn ? "success" : "secondary"}
                      icon={cameraOn ? faVideo : faVideoSlash}
                      iconPosition="left"
                      onClick={() => setCameraOn((c) => !c)}
                      isLoading={!stream && cameraOn}
                    >
                      {cameraOn ? "Camera On" : "Camera Off"}
                    </Button>
                    <Button
                      variant={micOn ? "success" : "secondary"}
                      icon={micOn ? faMicrophone : faMicrophoneSlash}
                      iconPosition="left"
                      onClick={() => setMicOn((m) => !m)}
                      isLoading={!stream && micOn}
                    >
                      {micOn ? "Microphone On" : "Microphone Off"}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-slate-600 uppercase">Audio level</span>
                    <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full bg-emerald-500 transition-all duration-100`} style={{ width: `${Math.max(audioLevel, micOn ? 2 : 0)}%` }} />
                    </div>
                  </div>
                </div>

                {cameras.length > 1 || microphones.length > 1 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-600/50 pt-3">
                    {cameras.length > 1 && (
                      <SelectField label="Camera" value={cameraDeviceId} onChange={(e) => setCameraDeviceId(e.target.value)} wrapperClassName="mb-0">
                        <option value="">Default camera</option>
                        {cameras.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>)}
                      </SelectField>
                    )}
                    {microphones.length > 1 && (
                      <SelectField label="Microphone" value={micDeviceId} onChange={(e) => setMicDeviceId(e.target.value)} wrapperClassName="mb-0">
                        <option value="">Default microphone</option>
                        {microphones.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>)}
                      </SelectField>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-600">Default camera and microphone in use.</p>
                )}

                {permissionError && <Alert variant="warning" className="text-xs">{permissionError}</Alert>}
              </div>

              <div className="text-[11px] text-slate-600 text-center">
                Your camera and microphone choices are applied when you enter the classroom.
              </div>
            </div>

            {/* Right: session info + Join Now */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-800">Joining Online Class</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs text-slate-600 uppercase">Subject</span>
                    <div className="text-sm font-medium text-slate-900">{courseLine}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-600 uppercase">Host / Teacher</span>
                    <div className="text-sm font-medium text-slate-900">{hostName}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-600 uppercase">Academic group</span>
                    <div className="text-sm font-medium text-slate-900">{academicGroup(session)}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-600 uppercase">Schedule</span>
                    <div className="text-sm font-medium text-slate-900">{formatDateTime(session)}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-600 uppercase">Session status</span>
                    <Badge variant={live ? "success" : "info"} size="sm">{status}</Badge>
                  </div>
                  <div className="space-y-1 border-t border-slate-600/50 pt-2">
                    <span className="text-xs text-slate-600 uppercase">Your media</span>
                    <div className="flex items-center gap-2 text-sm text-slate-900">
                      <span>{cameraOn ? "Camera on" : "Camera off"}</span>
                      <span className="text-slate-600">|</span>
                      <span>{micOn ? "Microphone on" : "Microphone off"}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-800 mb-1">Admission policy</p>
                  <p className="text-xs text-slate-700">{policyInfo.label}</p>
                  <p className="text-[10px] text-slate-600 mt-1">{policyInfo.desc}</p>
                </div>
              </div>

              <Alert variant={admissionPolicy === "approval" ? "info" : "success"}>
                {admissionPolicy === "approval"
                  ? "Click Join Now to send an admission request. The teacher will approve your entry before you enter the classroom."
                  : "Click Join Now to enter the classroom directly."}
              </Alert>

              <div className="pt-2">
                <Button
                  onClick={handleJoinNow}
                  icon={faArrowRight}
                  iconPosition="left"
                  isLoading={joining}
                  disabled={joining || !live && status !== "SCHEDULED"}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-base font-semibold py-3"
                >
                  Join Now
                </Button>
              </div>
              {joinError && <Alert variant="error">{joinError}</Alert>}
              <p className="text-[10px] text-center text-slate-600">
                If the class has not started yet, you will be admitted once the teacher starts the session.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnlineClassPreJoinPage;
