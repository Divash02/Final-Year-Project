import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Hand,
  Users,
  MessageSquare,
  MoreVertical,
  LogOut,
  PhoneOff,
  X,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  SlidersHorizontal,
  Keyboard,
  Wifi,
  Check,
  PanelRightClose,
  PanelRightOpen,
  GraduationCap,
  Radio,
  SendHorizontal,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { Room, RoomEvent } from "livekit-client";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { Button } from "../../ui/Button";
import { Alert } from "../../ui/Alert";
import { getConnectSession, getConnectWaitingRoom, decideConnectAdmission, endConnectSession, getConnectLiveKitToken, leaveConnectSession } from "../../../services/connectApi";
import { formatScheduleTime12h } from "../../../lib/institutionTime";

type LucideIcon = React.ComponentType<{ className?: string; size?: number | string; strokeWidth?: number }>;

type Session = any;
type WaitingRequest = any;
type Presence = { userId: string; name?: string; role?: string; status?: string; raised?: boolean; at?: string };
type TileModel = {
  key: string;
  userId: string;
  name: string;
  role?: string;
  isLocal: boolean;
  cameraEnabled: boolean;
  micEnabled: boolean;
  raised?: boolean;
  videoTrack?: any;
  hasVideo: boolean;
  isTeacherLike?: boolean;
};
type PresenterInfo = { userId: string; name: string; role?: string; startedAt?: string } | null;
type ScreenShareRequest = { requestId: string; userId: string; name: string; role?: string; requestedAt?: string };

/* ------------------------------------------------------------------ */
/* Theme tokens (premium 2026 classroom, light)                       */
/* ------------------------------------------------------------------ */
const THEME = {
  bg: "bg-[#F8FAFC]",
  stageBg: "bg-[#F1F5F9]",
  surface: "bg-white",
  card: "bg-white border border-[#E2E8F0] rounded-2xl",
  border: "border-[#E2E8F0]",
  textPrimary: "text-[#0F172A]",
  textSecondary: "text-[#475569]",
  accent: "text-[#0284C7]",
  accentBg: "bg-[#0284C7]",
  success: "text-[#16A34A]",
  successBg: "bg-[#16A34A]",
  danger: "text-[#DC2626]",
  dangerBg: "bg-[#DC2626]",
};

function toPresenceMap(list: any): Record<string, Presence> {
  if (!Array.isArray(list)) return {};
  const map: Record<string, Presence> = {};
  for (const p of list) {
    const userId = String(p?.userId || p?.id || "");
    if (!userId) continue;
    map[userId] = { ...p, userId, status: p?.status || "active" };
  }
  return map;
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

function parseUserIdFromMetadata(raw: unknown): string | null {
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    const id = (obj as any)?.userId ?? (obj as any)?.user_id ?? (obj as any)?.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

function getParticipantUserId(p: any, isLocal: boolean, fallbackUid?: string): string {
  return (
    parseUserIdFromMetadata(p?.metadata) ||
    (isLocal && fallbackUid ? fallbackUid : null) ||
    String(p?.identity || p?.sid || "unknown")
  );
}

function getActiveVideoTrack(participant: any): any | null {
  if (!participant) return null;
  try {
    const pubs = [
      ...Array.from(participant.videoTrackPublications?.values?.() || []),
      ...Array.from(participant.trackPublications?.values?.() || []),
    ];
    for (const pub of pubs) {
      const kind = String((pub as any)?.kind || (pub as any)?.track?.kind || "");
      const source = String((pub as any)?.source || "");
      const isVideo = kind === "video" || kind === "1" || kind.toLowerCase().includes("video") || String((pub as any)?.track?.kind||"") === "video";
      if (!isVideo) continue;
      // Prefer camera over screen share for participant tile when both exist.
      if (/screen/i.test(source) || /screen/i.test(String((pub as any)?.trackName || ""))) continue;
      if ((pub as any)?.isSubscribed !== false && (pub as any)?.track) return (pub as any).track;
    }
    // Fallback: any subscribed video track.
    for (const pub of pubs) {
      const track = (pub as any)?.track;
      const source = String((pub as any)?.source || "");
      if (/screen/i.test(source) || /screen/i.test(String((pub as any)?.trackName || ""))) continue;
      if (track && ((pub as any)?.isSubscribed !== false)) return track;
    }
  } catch {}
  return null;
}

function isScreenSharePub(pub: any): boolean {
  try {
    const source = String(pub?.source || pub?.track?.source || "");
    const name = String(pub?.trackName || pub?.track?.name || "");
    if (/screen/i.test(source) || /screen/i.test(name)) return true;
    // LiveKit Track.Source.ScreenShare is often numeric/string in serialized forms; cover common cases.
    if (source === "screen_share" || source === "screen_share_audio" || source === "2" || source === "3") return true;
  } catch {}
  return false;
}

function getScreenShareTrack(participant: any): any | null {
  if (!participant) return null;
  try {
    const pubs = [
      ...Array.from(participant.videoTrackPublications?.values?.() || []),
      ...Array.from(participant.trackPublications?.values?.() || []),
    ];
    for (const pub of pubs) {
      if (!isScreenSharePub(pub)) continue;
      const track = (pub as any)?.track;
      if (track && (pub as any)?.isSubscribed !== false && !(pub as any)?.isMuted) return track;
      // sometimes local/unsubscribed states differ; still return track if present for local presenter
      if (track && !(pub as any)?.isMuted) return track;
    }
  } catch {}
  return null;
}

type ActiveScreenShare = { userId: string; name: string; role?: string; isLocal: boolean; track: any; participant: any } | null;

function getActiveScreenShare(room: Room | null, uid: string, presence: Record<string, Presence>, session: any, fallbackName: string): ActiveScreenShare {
  if (!room) return null;
  const check = (p: any, isLocal: boolean): ActiveScreenShare => {
    const track = getScreenShareTrack(p);
    if (!track) return null;
    const userId = getParticipantUserId(p, isLocal, uid);
    const pres = presence[userId];
    return {
      userId,
      name: pres?.name || p?.name || p?.identity || (isLocal ? fallbackName : "Presenter"),
      role: pres?.role || (isLocal ? undefined : undefined),
      isLocal,
      track,
      participant: p,
    };
  };
  try { const local = check(room.localParticipant, true); if (local) return local; } catch {}
  try {
    for (const rp of room.remoteParticipants.values()) {
      const hit = check(rp, false); if (hit) return hit;
    }
  } catch {}
  return null;
}

function isTeacherLikeRole(role?: string | null, session?: any, userId?: string | null): boolean {
  const r = String(role || "").toUpperCase();
  if (["TEACHER","HOST","CO_HOST"].includes(r)) return true;
  if (!session || !userId) return false;
  return String(session.host||"")===String(userId) || String(session.assignedTeacher||"")===String(userId) || String(session.createdBy||"")===String(userId) || (session.coHosts||[]).some((id:any)=>String(id)===String(userId));
}

function getCameraEnabled(participant: any): boolean {
  try {
    if (typeof participant?.isCameraEnabled === "boolean") return participant.isCameraEnabled;
    const pubs = Array.from(participant?.videoTrackPublications?.values?.() || []);
    for (const pub of pubs) {
      const source = String((pub as any)?.source || "");
      if (/screen/i.test(source)) continue;
      if ((pub as any)?.track && !(pub as any)?.isMuted) return true;
    }
  } catch {}
  return false;
}

function getMicEnabled(participant: any): boolean {
  try {
    if (typeof participant?.isMicrophoneEnabled === "boolean") return participant.isMicrophoneEnabled;
    const pubs = Array.from(participant?.audioTrackPublications?.values?.() || []);
    for (const pub of pubs) {
      if ((pub as any)?.track && !(pub as any)?.isMuted) return true;
    }
  } catch {}
  return false;
}

const VideoTrackView: React.FC<{ track: any; muted?: boolean; className?: string; objectFit?: 'cover' | 'contain' }> = ({ track, muted, className, objectFit = 'cover' }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    if (!track?.attach) return;
    let attachedEl: HTMLElement | null = null;
    try {
      const attached = track.attach() as any;
      if (attached) {
        attachedEl = attached as HTMLElement;
        if (attached.style) {
          attached.style.width = "100%";
          attached.style.height = "100%";
          attached.style.objectFit = objectFit;
          attached.style.display = "block";
          attached.style.background = objectFit === 'contain' ? 'transparent' : '';
        }
        if (muted) attached.muted = true;
        el.appendChild(attached);
      }
    } catch {}
    return () => {
      try { if (attachedEl && track?.detach) track.detach(attachedEl); } catch {}
      try { el.innerHTML = ""; } catch {}
    };
  }, [track, muted, objectFit]);
  return <div ref={ref} className={className || "absolute inset-0 bg-[#111827]"} />;
};

/* ------------------------------------------------------------------ */
/* Persistent meeting singleton                                       */
/* ------------------------------------------------------------------ */
type MeetingState = {
  room: Room | null;
  socket: Socket | null;
  joined: boolean;
  sessionId: string | null;
};

const persistentMeeting: MeetingState = { room: null, socket: null, joined: false, sessionId: null };

function isPersistentMeetingAlive(sid: string | null) {
  return !!persistentMeeting.room && !!persistentMeeting.socket && persistentMeeting.joined && persistentMeeting.sessionId === sid;
}

/* ------------------------------------------------------------------ */
/* UI sub-components                                                  */
/* ------------------------------------------------------------------ */

const ToolbarBtn: React.FC<{
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
  badge?: number | string;
}> = ({ label, icon: Icon, onClick, active, danger, primary, disabled, title, badge }) => {
  const tone = danger
    ? "border-[#DC2626]/35 bg-[#DC2626]/10 text-[#DC2626] hover:bg-[#DC2626]/10 hover:text-[#B91C1C] focus-visible:ring-[#DC2626]/30"
    : primary
      ? "border-[#DC2626] bg-[#DC2626] text-white hover:bg-[#DC2626] hover:text-white focus-visible:ring-[#DC2626]/30"
      : active
        ? "border-[#0284C7]/35 bg-[#0284C7]/10 text-[#0369A1] hover:bg-[#0284C7]/10 hover:text-[#075985] focus-visible:ring-[#0284C7]/30"
        : "border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:border-slate-300 hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:ring-[#0284C7]/25";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={title || label}
      className={`group relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-all duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none motion-reduce:active:scale-100 ${tone}`}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
      <span className="whitespace-nowrap">{label}</span>
      {badge ? (
        <span className="ml-0.5 min-w-[16px] rounded-full bg-[#0284C7] px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
};

const MoreMenu: React.FC<{
  open: boolean;
  onClose: () => void;
  onFullscreen: () => void;
  fullscreenActive: boolean;
  onPictureInPicture: () => void;
  pipActive: boolean;
  onLeave: () => void;
  onEndClass: () => void;
  canEndClass: boolean;
  ending: boolean;
}> = ({ open, onClose, onFullscreen, fullscreenActive, onPictureInPicture, pipActive, onLeave, onEndClass, canEndClass, ending }) => {
  if (!open) return null;
  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#334155] transition-colors duration-150 hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]/25 motion-reduce:transition-none";
  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div
        className="absolute bottom-[88px] right-3 z-[71] w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white/95 p-2 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.16)] backdrop-blur-md sm:right-6"
        onClick={(e) => e.stopPropagation()}
        role="menu"
        aria-label="More meeting options"
      >
        <button type="button" className={item} onClick={(e) => { e.stopPropagation(); onClose(); onFullscreen(); }}>
          {fullscreenActive ? <Minimize2 className="h-4 w-4 text-[#64748B]" strokeWidth={1.8} /> : <Maximize2 className="h-4 w-4 text-[#64748B]" strokeWidth={1.8} />}
          <span>{fullscreenActive ? "Exit full screen" : "Full screen"}</span>
        </button>
        <button type="button" className={item} onClick={(e) => { e.stopPropagation(); onClose(); onPictureInPicture(); }}>
          <PictureInPicture2 className="h-4 w-4 text-[#64748B]" strokeWidth={1.8} />
          <span>{pipActive ? "Exit picture-in-picture" : "Picture-in-picture"}</span>
        </button>
        <div className="my-1.5 h-px bg-slate-200" />
        <button type="button" className={item} onClick={(e) => { e.stopPropagation(); onClose(); try { (window as any).__cosOpenDeviceSettings?.(); } catch {} }}>
          <SlidersHorizontal className="h-4 w-4 text-[#64748B]" strokeWidth={1.8} />
          <span>Audio &amp; video settings</span>
        </button>
        <button type="button" className={`${item} cursor-default opacity-70 hover:bg-transparent`} onClick={(e) => e.stopPropagation()} title="Keyboard shortcuts">
          <Keyboard className="h-4 w-4 text-[#64748B]" strokeWidth={1.8} />
          <span>Keyboard shortcuts</span>
        </button>
        <button type="button" className={`${item} cursor-default opacity-70 hover:bg-transparent`} onClick={(e) => e.stopPropagation()} title="Connection information">
          <Wifi className="h-4 w-4 text-[#64748B]" strokeWidth={1.8} />
          <span>Connection information</span>
        </button>
        <div className="my-1.5 h-px bg-slate-200" />
        <button type="button" className={`${item} text-[#DC2626] hover:bg-[#B91C1C]/10`} onClick={(e) => { e.stopPropagation(); onClose(); onLeave(); }}>
          <LogOut className="h-4 w-4 text-[#DC2626]" strokeWidth={1.8} />
          <span>Leave class</span>
        </button>
        {canEndClass ? (
          <>
            <div className="my-1.5 h-px bg-slate-200" />
            <button type="button" className={`${item} ${ending ? "cursor-not-allowed text-[#64748B]" : "text-[#DC2626] hover:bg-[#B91C1C]/10"}`} onClick={(e) => { e.stopPropagation(); if (!ending) { onClose(); onEndClass(); } }} disabled={ending}>
              <PhoneOff className="h-4 w-4 text-[#DC2626]" strokeWidth={1.8} />
              <span>{ending ? "Ending class…" : "End class for all"}</span>
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main component                                                     */
/* ------------------------------------------------------------------ */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api").replace(/\/+$/, "");
const SOCKET_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

function extractSessionId(pathname: string): string | null {
  const match = pathname.match(/\/online-classes\/([A-Za-z0-9]{24})\/classroom(\/?)$/);
  return match ? match[1] : null;
}

export const OnlineClassClassroomPage: React.FC = () => {
  const { currentUser, setActiveView } = useCollegeOS() as any;
  const sessionId = extractSessionId(window.location.pathname);
  const credential = (() => {
    try {
      if (!sessionId) return null;
      const raw = sessionStorage.getItem(`collegeos:online-class:prejoin:${sessionId}`);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return p?.prefs?.credential || null;
    } catch { return null; }
  })();

  const userName = useMemo(() => {
    if (!currentUser) return "Participant";
    return [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || "Participant";
  }, [currentUser]);

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"participants" | "chat">("participants");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [waitingRequests, setWaitingRequests] = useState<WaitingRequest[]>([]);
  const [ending, setEnding] = useState(false);
  const [meetingEnded, setMeetingEnded] = useState<{ message: string } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);
  const openDeviceSettings = useCallback(() => setDeviceSettingsOpen(true), []);
  useEffect(() => { (window as any).__cosOpenDeviceSettings = openDeviceSettings; return () => { try { if ((window as any).__cosOpenDeviceSettings === openDeviceSettings) delete (window as any).__cosOpenDeviceSettings; } catch {} }; }, [openDeviceSettings]);

  const [lkStatus, setLkStatus] = useState("Requesting secure media token…");
  const [lkConnected, setLkConnected] = useState(false);
  const [lkError, setLkError] = useState<string | null>(null);
  const [lkRetries, setLkRetries] = useState(0);
  const [lkRetryNonce, setLkRetryNonce] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState("Connecting…");
  const [presenceReady, setPresenceReady] = useState(false);

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareRequestStatus, setShareRequestStatus] = useState<"idle"|"pending"|"approved"|"rejected">("idle");
  const [shareRequestId, setShareRequestId] = useState<string | null>(null);
  const [shareRejectReason, setShareRejectReason] = useState<string | null>(null);
  const [screenShareRequests, setScreenShareRequests] = useState<ScreenShareRequest[]>([]);
  const [presenterSignal, setPresenterSignal] = useState<PresenterInfo>(null);
  const [presentationFullscreen, setPresentationFullscreen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [role, setRole] = useState<string>("");
  const [chat, setChat] = useState<{ sessionId: string; message: string; userId: string; name: string; role?: string; clientMsgId?: string | null; at: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [unreadChat, setUnreadChat] = useState(0);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState("");
  const [camId, setCamId] = useState("");
  const [handRaiseToasts, setHandRaiseToasts] = useState<{ id: string; name: string; at: number }[]>([]);
  const [lkVersion, setLkVersion] = useState(0);
  const [gridTick, setGridTick] = useState(0);
  const touchGrid = useCallback(() => setGridTick((n) => n + 1), []);
  const [videoSize, setVideoSize] = useState<'small'|'medium'|'large'>('medium');
  const setVideoSizeByIndex = useCallback((v:number)=>{ const next = v===0?'small':v===2?'large':'medium'; setVideoSize(next as any); (window as any).__cosVideoSizeLabel = next==='small'?'Small':next==='large'?'Large':'Medium'; setGridTick((n) => n + 1); },[]);
  useEffect(()=>{ (window as any).__cosSetVideoSize=setVideoSizeByIndex; (window as any).__cosVideoSizeLabel = videoSize==='small'?'Small':videoSize==='large'?'Large':'Medium'; return ()=>{ try{ if((window as any).__cosSetVideoSize===setVideoSizeByIndex) delete (window as any).__cosSetVideoSize; }catch{} }; },[setVideoSizeByIndex,videoSize]);

  const uid = String(currentUser?.id || currentUser?._id || "");

  const roomRef = useRef<Room | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fullscreenElRef = useRef<HTMLDivElement | null>(null);
  const presentationElRef = useRef<HTMLDivElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const seenMsgs = useRef<Set<string>>(new Set());
  const startedAtRef = useRef<Date | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lkConnectOpRef = useRef(0);
  const mountedRef = useRef(true);
  const screenShareApprovedRef = useRef(false);

  const isTeacher = useMemo(() => {
    if (["HOST", "TEACHER", "CO_HOST"].includes(role)) return true;
    if (!session) return false;
    return (
      String(session.host || "") === uid ||
      String(session.assignedTeacher || "") === uid ||
      String(session.createdBy || "") === uid ||
      ((session.coHosts || []).some((id: any) => String(id) === uid))
    );
  }, [session, uid, role]);

  const admissionPolicy = useMemo(() => String(session?.admissionPolicy || "direct"), [session]);
  const status = useMemo(() => String(session?.status), [session]);
  const live = status === "LIVE" || status === "IN_PROGRESS";

  const elapsedMinutes = useMemo(() => {
    if (!startedAtRef.current) return 0;
    return Math.max(0, Math.floor((Date.now() - startedAtRef.current.getTime()) / 60000));
  }, [gridTick]);

  const participants = useMemo(
    () => Object.values(presence).filter((p) => String(p.status || "active") !== "offline"),
    [presence],
  );

  const canEndClass = isTeacher;
  const safeDisconnectRoom = useCallback((room: Room | null) => {
    if (!room) return;
    try { room.removeAllListeners(); } catch {}
    try { room.disconnect(true); } catch { try { room.disconnect(); } catch {} }
  }, []);

  const syncRoomUi = useCallback(() => {
    const room = roomRef.current;
    if (!room || !mountedRef.current) return;
    try { setMuted(!room.localParticipant.isMicrophoneEnabled); } catch {}
    try { setCameraOff(!room.localParticipant.isCameraEnabled); } catch {}
    try { setSharing(Boolean((room.localParticipant as any).isScreenShareEnabled || getScreenShareTrack(room.localParticipant))); } catch {}
    touchGrid();
  }, [touchGrid]);

  const buildTileModels = useCallback((): TileModel[] => {
    const room = roomRef.current;
    if (!room) return [];
    const out: TileModel[] = [];
    const add = (p: any, isLocal: boolean) => {
      const userId = getParticipantUserId(p, isLocal, uid);
      const pres = presence[userId];
      const videoTrack = getActiveVideoTrack(p);
      const cameraEnabled = getCameraEnabled(p);
      const micEnabled = getMicEnabled(p);
      const resolvedRole = isLocal ? (role || pres?.role) : (pres?.role || role);
      const teacherLike = isTeacherLikeRole(resolvedRole, session, userId) || (isLocal && isTeacher);
      out.push({
        key: isLocal ? `local:${userId}` : `remote:${p?.identity || p?.sid || userId}`,
        userId,
        name: isLocal ? `${userName} (You)` : (pres?.name || p?.name || p?.identity || "Participant"),
        role: resolvedRole,
        isLocal,
        cameraEnabled,
        micEnabled,
        raised: Boolean(pres?.raised),
        videoTrack,
        hasVideo: Boolean(videoTrack && cameraEnabled),
        isTeacherLike: teacherLike,
      });
    };
    try { add(room.localParticipant, true); } catch {}
    try { for (const rp of room.remoteParticipants.values()) add(rp, false); } catch {}
    // Stable ordering: teacher/host first, then others by name/userId. Never random; preserve stable identity keys.
    out.sort((a, b) => {
      const ap = a.isTeacherLike ? 0 : 1;
      const bp = b.isTeacherLike ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const an = String(a.name || "").localeCompare(String(b.name || ""));
      if (an !== 0) return an;
      return String(a.userId).localeCompare(String(b.userId));
    });
    return out;
  }, [presence, role, uid, userName, gridTick, session, isTeacher]);

  const tileModels = useMemo(() => buildTileModels(), [buildTileModels, lkConnected, lkVersion]);
  const participantCount = tileModels.length;
  const participantCountLabel = lkConnected ? `${participantCount} in class` : lkError ? "Not connected" : "Connecting…";
  const activeScreenShare = useMemo(() => getActiveScreenShare(roomRef.current, uid, presence, session, userName), [lkConnected, lkVersion, presence, uid, session, userName]);
  const presentationMode = Boolean(activeScreenShare?.track);

  const toggleFullscreen = useCallback(async () => {
    const el = fullscreenElRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch (e) {
      try { console.warn('[Connect/UI] fullscreen failed', { message: String((e as any)?.message || e) }); } catch {}
      setError('Full screen is not available in this browser/context.');
    }
  }, []);

  const togglePresentationFullscreen = useCallback(async () => {
    const el = presentationElRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else if (document.fullscreenElement === el) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch (e) {
      try { console.warn('[Connect/UI] presentation fullscreen failed', { message: String((e as any)?.message || e) }); } catch {}
      setError('Presentation full screen is not available in this browser/context.');
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      const fsEl = document.fullscreenElement;
      setFullscreenActive(!!fsEl);
      setPresentationFullscreen(Boolean(fsEl && presentationElRef.current && fsEl === presentationElRef.current));
      touchGrid();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [touchGrid]);

  const togglePictureInPicture = useCallback(async () => {
    try {
      if (!document.pictureInPictureElement) {
        const video = pipVideoRef.current;
        if (video?.srcObject) { await (video as any).requestPictureInPicture(); return; }
        const videos = document.querySelectorAll("video");
        const activeVideo = Array.from(videos).find((v) => (v as HTMLVideoElement).srcObject || !(v as HTMLVideoElement).paused);
        if (activeVideo) await (activeVideo as any).requestPictureInPicture();
        else setError("No video available for Picture-in-Picture.");
      } else await (document as any).exitPictureInPicture();
    } catch (e: any) { setError(e?.message || "Picture-in-Picture is not supported in this browser."); }
  }, []);
  useEffect(() => {
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    document.addEventListener("enterpictureinpicture", onEnter);
    document.addEventListener("leavepictureinpicture", onLeave);
    return () => { document.removeEventListener("enterpictureinpicture", onEnter); document.removeEventListener("leavepictureinpicture", onLeave); };
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const allMics = await Room.getLocalDevices("audioinput", true).catch(() => []);
      const allCams = await Room.getLocalDevices("videoinput", true).catch(() => []);
      setMics(allMics || []); setCams(allCams || []);
      if (allMics?.[0]?.deviceId && !micId) setMicId(allMics[0].deviceId);
      if (allCams?.[0]?.deviceId && !camId) setCamId(allCams[0].deviceId);
    } catch {}
  }, []);
  const changeMic = useCallback(async (deviceId: string) => { setMicId(deviceId); const room = roomRef.current; if (room && deviceId) try { await room.switchActiveDevice("audioinput", deviceId, true); } catch {} }, []);
  const changeCam = useCallback(async (deviceId: string) => { setCamId(deviceId); const room = roomRef.current; if (room && deviceId) try { await room.switchActiveDevice("videoinput", deviceId, true); } catch {} }, []);

  const disconnectAll = useCallback(async (emitLeave = true, sid: string | null = null) => {
    const targetSid = sid || sessionId;
    try { if (emitLeave && socketRef.current && targetSid) socketRef.current.emit("connect:leave", { sessionId: targetSid }); socketRef.current?.disconnect(); } catch {}
    socketRef.current = null;
    const room = roomRef.current; roomRef.current = null;
    if (room) safeDisconnectRoom(room);
    setLkConnected(false);
  }, [safeDisconnectRoom, sessionId]);

  useEffect(() => () => {
    mountedRef.current = false;
    try { socketRef.current?.disconnect(); } catch {}
    socketRef.current = null;
    const room = roomRef.current; roomRef.current = null;
    if (room) safeDisconnectRoom(room);
  }, [safeDisconnectRoom]);

  useEffect(() => {
    if (!sessionId) { setError("Invalid session link."); setLoading(false); return; }
    let active = true;
    (async () => {
      try {
        const data: any = await getConnectSession(sessionId);
        if (!active) return;
        const s = data?.session || null;
        if (s?.startedAt) startedAtRef.current = new Date(s.startedAt);
        setSession(s);
      } catch (e: any) { if (active) setError(e?.message || "Unable to load session details."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [sessionId]);

  const loadWaitingRoom = useCallback(async () => {
    if (!sessionId) return;
    try { const data: any = await getConnectWaitingRoom(sessionId); const reqs = data?.requests || data?.waitingRoomRequests || []; setWaitingRequests(Array.isArray(reqs) ? reqs : []); } catch {}
  }, [sessionId]);
  useEffect(() => {
    if (isTeacher && admissionPolicy === "approval") { loadWaitingRoom(); const id = window.setInterval(loadWaitingRoom, 4000); return () => window.clearInterval(id); }
  }, [isTeacher, admissionPolicy, loadWaitingRoom]);

  const handleDecideRow = useCallback(async (requestId: string, decision: "approve" | "reject") => {
    const sid = sessionId; if (!sid) return;
    try { const mod = await import("../../../services/connectApi"); await mod.decideConnectAdmission(sid, requestId, decision); loadWaitingRoom(); }
    catch (e: any) { setError(e?.message || "Admission decision failed."); }
  }, [loadWaitingRoom, sessionId]);

  const toggleMic = useCallback(async () => { const room = roomRef.current; if (!room) return; const next = !muted; await room.localParticipant.setMicrophoneEnabled(!next).catch(() => {}); setMuted(next); socketRef.current?.emit("connect:status", { sessionId, status: next ? "muted" : "unmuted" }); syncRoomUi(); }, [muted, sessionId, syncRoomUi]);
  const toggleCam = useCallback(async () => { const room = roomRef.current; if (!room) return; const next = !cameraOff; await room.localParticipant.setCameraEnabled(!next).catch(() => {}); setCameraOff(next); syncRoomUi(); }, [cameraOff, syncRoomUi]);
  const publishScreenShare = useCallback(async (opts?: { approved?: boolean }) => {
    const room = roomRef.current;
    if (!sessionId) return;
    if (!room || !lkConnected) { setError("Connect to classroom media before sharing your screen."); return; }
    if (shareBusy) return;
    if (!isTeacher && !opts?.approved && !screenShareApprovedRef.current) {
      setError("Teacher approval is required before sharing your screen.");
      return;
    }
    setShareBusy(true);
    setError(null);
    try {
      // Trusted server validation before capture/publish (teacher direct; student needs server grant).
      // Timeout prevents hanging when backend lacks the handler (restart required) or socket is disconnected.
      if (socketRef.current?.connected) {
        const ack: any = await Promise.race([
          new Promise((resolve) => socketRef.current?.emit("connect:screen:start", { sessionId }, (a: any) => resolve(a))),
          new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "Screen-sharing authorization timed out. Restart the backend and reload the classroom, then try again." }), 8000)),
        ]);
        if (!ack?.ok) throw new Error(ack?.error || "Screen sharing was not authorized.");
        if (ack?.presenter) setPresenterSignal(ack.presenter);
      } else if (socketRef.current) {
        throw new Error("Realtime connection is not ready. Wait for reconnection, then try sharing again.");
      }
      await room.localParticipant.setScreenShareEnabled(true);
      const localShare = getScreenShareTrack(room.localParticipant);
      const isEnabled = Boolean((room.localParticipant as any).isScreenShareEnabled || localShare);
      if (!isEnabled) {
        try { socketRef.current?.emit("connect:screen:stop", { sessionId }); } catch {}
        setSharing(false);
        syncRoomUi();
        return;
      }
      setSharing(true);
      screenShareApprovedRef.current = false;
      setShareRequestStatus("idle");
      setShareRequestId(null);
      setShareRejectReason(null);
      try { socketRef.current?.emit("connect:status", { sessionId, status: "presenting" }); } catch {}
      syncRoomUi();
    } catch (e: any) {
      const msg = String(e?.message || "Screen sharing failed.");
      const name = String(e?.name || "");
      const cancelled = name === "AbortError" || /cancel|abort|Permission dismissed|user denied|notallowederror/i.test(msg) && !/not supported|insecure/i.test(msg);
      try { socketRef.current?.emit("connect:screen:stop", { sessionId }); } catch {}
      try { await roomRef.current?.localParticipant?.setScreenShareEnabled(false); } catch {}
      setSharing(false);
      screenShareApprovedRef.current = false;
      if (!cancelled) setError(name === "NotSupportedError" ? "Screen sharing is not supported in this browser." : msg);
      syncRoomUi();
    } finally {
      setShareBusy(false);
    }
  }, [isTeacher, lkConnected, sessionId, shareBusy, syncRoomUi]);

  const stopScreenShare = useCallback(async (opts?: { byTeacher?: boolean; targetUserId?: string }) => {
    if (shareBusy && !opts?.byTeacher) return;
    setShareBusy(true);
    try {
      if (opts?.byTeacher && opts?.targetUserId && opts.targetUserId !== uid) {
        socketRef.current?.emit("connect:screen:stop", { sessionId, targetUserId: opts.targetUserId }, () => {});
      } else {
        try { await roomRef.current?.localParticipant?.setScreenShareEnabled(false); } catch {}
        try { socketRef.current?.emit("connect:screen:stop", { sessionId }, () => {}); } catch {}
        try { socketRef.current?.emit("connect:status", { sessionId, status: "active" }); } catch {}
        setSharing(false);
      }
      screenShareApprovedRef.current = false;
      syncRoomUi();
    } catch (e: any) {
      setError(e?.message || "Unable to stop screen sharing.");
    } finally {
      setShareBusy(false);
    }
  }, [sessionId, shareBusy, syncRoomUi, uid]);

  const requestScreenShare = useCallback(() => {
    if (!sessionId || !lkConnected) { setError("Connect to the classroom before requesting screen sharing."); return; }
    if (shareRequestStatus === "pending") return;
    if (sharing) return;
    if (activeScreenShare) {
      const teacherPresenting = isTeacherLikeRole(activeScreenShare.role, session, activeScreenShare.userId);
      setError(teacherPresenting ? "The teacher is already presenting." : "Another participant is already presenting. Wait for them to stop sharing.");
      return;
    }
    setShareRejectReason(null);
    socketRef.current?.emit("connect:screen:request", { sessionId }, (ack: any) => {
      if (!ack?.ok) { setError(ack?.error || "Screen-sharing request failed."); return; }
      setShareRequestStatus("pending");
      setShareRequestId(ack.requestId || null);
    });
  }, [activeScreenShare, lkConnected, session, sessionId, shareRequestStatus, sharing]);

  const cancelScreenShareRequest = useCallback(() => {
    if (!sessionId) return;
    socketRef.current?.emit("connect:screen:cancel-request", { sessionId, requestId: shareRequestId }, () => {
      setShareRequestStatus("idle");
      setShareRequestId(null);
      setShareRejectReason(null);
    });
  }, [sessionId, shareRequestId]);

  const decideScreenShareRequest = useCallback((requestId: string, decision: "approve" | "reject") => {
    if (!sessionId) return;
    socketRef.current?.emit(decision === "approve" ? "connect:screen:approve" : "connect:screen:reject", { sessionId, requestId }, (ack: any) => {
      if (!ack?.ok) setError(ack?.error || `Unable to ${decision} screen-sharing request.`);
      if (ack?.ok) setScreenShareRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    });
  }, [sessionId]);

  const toggleShare = useCallback(async () => {
    if (!lkConnected) { setError("Connect to classroom media before sharing your screen."); return; }
    if (sharing) { await stopScreenShare(); return; }
    if (isTeacher) { await publishScreenShare(); return; }
    // Student: clear prior rejection on explicit click, then request teacher approval (never open picker directly).
    if (shareRequestStatus === "rejected") { setShareRequestStatus("idle"); setShareRejectReason(null); }
    requestScreenShare();
  }, [isTeacher, lkConnected, publishScreenShare, requestScreenShare, shareRequestStatus, sharing, stopScreenShare]);
  const toggleHand = useCallback(() => { const next = !handRaised; setHandRaised(next); socketRef.current?.emit("connect:hand:raise", { sessionId, raised: next }); }, [handRaised, sessionId]);
  const sendChat = useCallback(() => { const msg = chatInput.trim(); if (!msg) return; const clientMsgId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`; socketRef.current?.emit("connect:chat:send", { sessionId, message: msg, clientMsgId }, (ack: any) => { if (!ack?.ok) setError(ack?.error || "Message not sent."); }); setChatInput(""); }, [chatInput, sessionId]);

  const handleLeave = useCallback(async () => { try { if (sessionId) await leaveConnectSession(sessionId).catch(() => {}); } catch {} await disconnectAll(true, sessionId); setActiveView("connect"); window.history.pushState({}, "", "/connect"); }, [disconnectAll, sessionId, setActiveView]);
  const handleEndClass = useCallback(async () => { const sid = sessionId; if (!sid) return; if (!window.confirm("End this class for everyone?\n\nEnding the class will disconnect all participants and terminate the meeting session. Participants will no longer be able to rejoin this session.")) return; setConfirmEnd(false); setEnding(true); try { await endConnectSession(sid); setMeetingEnded({ message: "Class ended by the teacher." }); await disconnectAll(false, sid); setActiveView("connect"); window.history.pushState({}, "", "/connect"); } catch (e: any) { setEnding(false); setError(e?.message || "Unable to end the session."); } }, [disconnectAll, sessionId, setActiveView]);

  const addHandRaiseToast = useCallback((name: string) => { const id = `${name}-${Date.now()}`; setHandRaiseToasts((prev) => [...prev.filter((t) => t.name !== name), { id, name, at: Date.now() }]); if (toastTimerRef.current) clearTimeout(toastTimerRef.current); toastTimerRef.current = setTimeout(() => setHandRaiseToasts((prev: { id: string; name: string; at: number }[]) => prev.filter((t) => t.id !== id)), 5000); }, []);
  const dismissToast = useCallback((id: string) => setHandRaiseToasts((prev) => prev.filter((t) => t.id !== id)), []);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const token = localStorage.getItem("collegeos_token") || "";
    const authPayload: any = { token };
    if (credential?.sessionId16 && credential?.password) {
      authPayload.sessionCredentialId = credential.sessionId16;
      authPayload.sessionCredentialPassword = credential.password;
    }

    const socket = io(`${SOCKET_ORIGIN}/connect`, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: authPayload,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    const joinSession = () => {
      if (!active) return;
      socket.emit("connect:join", { sessionId, ...authPayload }, (ack: any) => {
        if (!active) return;
        if (!ack?.ok) {
          setRealtimeStatus("Disconnected");
          setError(ack?.error || "Unable to join realtime session.");
          return;
        }
        setRole(ack.role || "");
        setPresenceReady(true);
        setRealtimeStatus("Connected");
        if (Array.isArray(ack.participants)) setPresence(toPresenceMap(ack.participants));
        if (ack?.screenShare?.presenter) setPresenterSignal(ack.screenShare.presenter); else setPresenterSignal(null);
        if (Array.isArray(ack?.screenShare?.pending) && (ack?.role === 'TEACHER' || ack?.role === 'HOST' || ack?.role === 'CO_HOST')) setScreenShareRequests(ack.screenShare.pending);
        socket.emit('connect:screen:state', { sessionId }, (sack: any) => { if (active && sack?.ok) { if (sack.presenter) setPresenterSignal(sack.presenter); else if (sack.hasPresenter === false) setPresenterSignal(null); if (Array.isArray(sack.pending) && (ack?.role === 'TEACHER' || ack?.role === 'HOST' || ack?.role === 'CO_HOST')) setScreenShareRequests(sack.pending); } });
      });
    };

    socket.on("connect", joinSession);
    socket.on("reconnect", () => { if (active) { setRealtimeStatus("Reconnecting…"); joinSession(); } });
    socket.on("disconnect", () => { if (active) setRealtimeStatus("Reconnecting…"); });
    socket.on("connect_error", (e: any) => { if (active) setRealtimeStatus(`Realtime error: ${e?.message || "connection failed"}`); });
    socket.on("connect:participants:updated", (payload: any) => { if (Array.isArray(payload?.participants)) setPresence(toPresenceMap(payload.participants)); setPresenceReady(true); });
    socket.on("connect:participant:joined", (p: any) => setPresence((prev) => ({ ...prev, [p.userId]: { ...(prev[p.userId] || {}), ...p, status: "active" } })));
    socket.on("connect:participant:left", (p: any) => setPresence((prev) => ({ ...prev, [p.userId]: { ...(prev[p.userId] || {}), ...p, status: "offline", raised: false } })));
    socket.on("connect:participant:status", (p: any) => setPresence((prev) => ({ ...prev, [p.userId]: { ...(prev[p.userId] || {}), ...p } })));
    socket.on("connect:hand:changed", (p: any) => {
      setPresence((prev) => ({ ...prev, [p.userId]: { ...(prev[p.userId] || {}), ...p } }));
      if (isTeacher && p.raised && p.userId !== uid) addHandRaiseToast(p.name || p.userId);
      if (p.raised && p.userId !== uid) {
        const key = `hand:${p.userId}:${p.at}`;
        if (!seenMsgs.current.has(key)) {
          seenMsgs.current.add(key);
          setChat((prev) => [...prev.slice(-199), { sessionId, message: `${p.name || p.userId} raised their hand ✋`, userId: p.userId, name: p.name || p.userId, role: p.role, clientMsgId: key, at: p.at || new Date().toISOString() }]);
        }
      }
    });
    socket.on("connect:chat:message", (m: any) => {
      const key = m.clientMsgId || `${m.userId}:${m.at}:${m.message}`;
      if (seenMsgs.current.has(key)) return;
      seenMsgs.current.add(key);
      setChat((prev) => [...prev.slice(-199), m]);
      if (sidebarTab !== "chat" || !sidebarOpen) setUnreadChat((c) => c + 1);
    });
    socket.on("connect:session:ended", async () => {
      if (!active) return;
      setMeetingEnded({ message: "The teacher has ended this class." });
      setLkStatus("Session ended."); setRealtimeStatus("Meeting ended");
      await disconnectAll(false, sessionId);
      window.setTimeout(() => { setActiveView("connect"); window.history.pushState({}, "", "/connect"); }, 1200);
    });
    socket.on("connect:session:started", () => setSession((prev: any) => prev ? { ...prev, status: "LIVE" } : prev));

    const applyScreenState = (payload: any) => {
      if (!active || !payload) return;
      if (payload.presenter) setPresenterSignal(payload.presenter); else setPresenterSignal(null);
      if (Array.isArray(payload.pending) && isTeacher) setScreenShareRequests(payload.pending);
    };
    socket.on('connect:screen:state', applyScreenState);
    socket.on('connect:screen:changed', (payload: any) => { applyScreenState(payload); touchGrid(); });
    socket.on('connect:screen:request', (payload: any) => {
      if (!active) return;
      const req = payload?.request; if (!req?.requestId) return;
      if (isTeacher) setScreenShareRequests((prev) => prev.some((r) => r.requestId === req.requestId) ? prev : [...prev, req]);
      // optional: system chat hint for teacher? keep minimal
    });
    socket.on('connect:screen:request-cancelled', (payload: any) => {
      if (!active) return;
      const rid = String(payload?.requestId || ''); if (!rid) return;
      setScreenShareRequests((prev) => prev.filter((r) => r.requestId !== rid));
    });
    socket.on('connect:screen:approved', (payload: any) => {
      if (!active) return;
      if (String(payload?.userId || '') !== String(uid)) return;
      screenShareApprovedRef.current = true;
      setShareRequestStatus('approved');
      setShareRequestId(String(payload?.requestId || shareRequestId || ''));
      // Open native picker/publish now that teacher approved (must follow approval)
      window.setTimeout(() => { void publishScreenShare({ approved: true }); }, 0);
    });
    socket.on('connect:screen:rejected', (payload: any) => {
      if (!active) return;
      if (String(payload?.userId || '') !== String(uid)) return;
      screenShareApprovedRef.current = false;
      setShareRequestStatus('rejected');
      setShareRejectReason('The teacher has declined your request.');
      setShareRequestId(null);
    });

    return () => {
      active = false;
      try { socket.emit("connect:leave", { sessionId }); socket.disconnect(); } catch {}
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [addHandRaiseToast, credential?.sessionId16, credential?.password, disconnectAll, isTeacher, publishScreenShare, sessionId, setActiveView, touchGrid, uid]);

  const connectLiveKit = useCallback(async (grant: any, opId: number) => {
    const prev = roomRef.current; roomRef.current = null;
    if (prev) safeDisconnectRoom(prev);
    if (opId !== lkConnectOpRef.current || !mountedRef.current) return;

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const bump = () => { if (roomRef.current === room && mountedRef.current) { setLkVersion((v) => v + 1); syncRoomUi(); } };

    room.on(RoomEvent.ParticipantConnected, bump);
    room.on(RoomEvent.ParticipantDisconnected, bump);
    room.on(RoomEvent.TrackSubscribed, bump);
    room.on(RoomEvent.TrackUnsubscribed, (track: any) => { try { track?.detach?.().forEach?.((el: HTMLElement) => el.remove()); } catch {}; bump(); });
    room.on(RoomEvent.TrackPublished, bump);
    room.on(RoomEvent.TrackUnpublished, bump);
    room.on(RoomEvent.TrackMuted, bump);
    room.on(RoomEvent.TrackUnmuted, bump);
    room.on(RoomEvent.LocalTrackPublished, (pub: any) => {
      try {
        if (isScreenSharePub(pub)) {
          setSharing(true);
          socketRef.current?.emit('connect:status', { sessionId, status: 'presenting' });
        }
      } catch {}
      bump();
    });
    room.on(RoomEvent.LocalTrackUnpublished, (pub: any) => {
      try {
        if (isScreenSharePub(pub)) {
          setSharing(false);
          screenShareApprovedRef.current = false;
          socketRef.current?.emit('connect:screen:stop', { sessionId });
          socketRef.current?.emit('connect:status', { sessionId, status: 'active' });
        }
      } catch {}
      bump();
    });
    room.on(RoomEvent.ActiveSpeakersChanged, bump);
    room.on(RoomEvent.ConnectionStateChanged, bump);
    room.on(RoomEvent.Disconnected, (reason: any) => {
      if (roomRef.current !== room) return;
      setLkConnected(false);
      setLkStatus(`LiveKit disconnected${reason ? `: ${String(reason)}` : ""}.`);
    });
    room.on(RoomEvent.Reconnecting, () => { if (roomRef.current === room) setLkStatus("Reconnecting to LiveKit…"); });
    room.on(RoomEvent.Reconnected, () => { if (roomRef.current === room) { setLkConnected(true); setLkStatus("Connected to LiveKit."); bump(); } });

    const connectDeadline = Date.now() + 20000;
    await Promise.race([
      room.connect(grant.url, grant.token),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('LiveKit connection timed out (20s). Check network/VPN/firewall access to the media server, then retry.'), { code: 'LK_TIMEOUT' })), 20000)),
    ]);
    if (opId !== lkConnectOpRef.current || roomRef.current !== room) { safeDisconnectRoom(room); return; }
    // Mark connected immediately after successful room.connect so UI/counts reflect actual LiveKit state
    // even if local media publishing is blocked by browser permissions/devices.
    setLkConnected(true); setLkError(null);
    setLkStatus(`Connected to classroom media as ${grant.role || "participant"}.`);
    bump();
    try { await room.localParticipant.setMicrophoneEnabled(true); } catch (e) { try { console.warn('[Connect/LiveKit] mic enable failed', { sessionId, message: String((e as any)?.message||'') }); } catch {} }
    if (opId !== lkConnectOpRef.current || roomRef.current !== room) return;
    try { await room.localParticipant.setCameraEnabled(true); } catch (e) { try { console.warn('[Connect/LiveKit] camera enable failed', { sessionId, message: String((e as any)?.message||'') }); } catch {} }
    if (opId !== lkConnectOpRef.current || roomRef.current !== room) return;
    try { setMuted(!room.localParticipant.isMicrophoneEnabled); setCameraOff(!room.localParticipant.isCameraEnabled); } catch {}
    try { loadDevices(); } catch {}
    bump();
  }, [loadDevices, safeDisconnectRoom, syncRoomUi]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const opId = ++lkConnectOpRef.current;
    (async () => {
      try {
        if (lkRetryNonce > 0) {
          const delay = Math.min(15000, 1000 * 2 ** Math.max(0, lkRetryNonce - 1));
          setLkStatus(`Retrying secure media token in ${Math.ceil(delay / 1000)}s…`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        if (!active || opId !== lkConnectOpRef.current) return;
        setLkStatus("Requesting secure media token…");
        const payload: any = {};
        if (credential?.sessionId16 && credential?.password) {
          payload.sessionCredentialId = credential.sessionId16;
          payload.sessionCredentialPassword = credential.password;
        }
        const data: any = await getConnectLiveKitToken(sessionId, payload);
        const lk = data?.livekit;
        if (!lk?.token || !lk?.url) throw new Error("LiveKit token response was incomplete.");
        if (!active || opId !== lkConnectOpRef.current) return;
        setLkStatus("Connecting to LiveKit…");
        await connectLiveKit(lk, opId);
      } catch (e: any) {
        try { console.warn('[Connect/LiveKit] connect failed', { sessionId, status: e?.status, code: e?.code, message: String(e?.message||'').slice(0,200), hasCredential: Boolean(credential?.sessionId16 && credential?.password) }); } catch {}
        if (!active || opId !== lkConnectOpRef.current) return;
        const status = typeof e?.status === "number" ? e.status : undefined;
        const msg = String(e?.message || "");
        const is429 = status === 429 || /too many|rate.?limit/i.test(msg);
        const isAuth = status === 401 || status === 403 || /not allowed|authentication failed|unauthorized|forbidden/i.test(msg);
        const isTimeout = e?.code === 'LK_TIMEOUT' || /timed? ?out/i.test(msg);
        setLkConnected(false);
        if (is429) {
          setLkError("LiveKit token request was rate-limited. Retrying…");
          setLkStatus("LiveKit token request was rate-limited.");
          const delay = Math.min(15000, 2000 * 2 ** Math.max(0, lkRetryNonce));
          window.setTimeout(() => { if (active) setLkRetryNonce((n) => n + 1); }, delay);
        } else if (isAuth) {
          setLkError(msg || "LiveKit authentication failed. Verify server LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET match the same LiveKit project, then restart the backend and rejoin.");
          setLkStatus("LiveKit authentication failed.");
        } else if (isTimeout) {
          setLkError(msg || "LiveKit connection timed out. Check network/firewall/VPN access to the media server and retry.");
          setLkStatus("LiveKit connection timed out.");
        } else {
          setLkError(msg || "Failed to connect to LiveKit.");
          setLkStatus("LiveKit not connected.");
        }
      }
    })();
    return () => { active = false; };
  }, [connectLiveKit, credential?.sessionId16, credential?.password, lkRetryNonce, sessionId]);

  const retryLiveKit = useCallback(() => { setLkRetries((n) => n + 1); setLkError(null); setLkRetryNonce((n) => n + 1); }, []);

  if (loading) {
    return (
      <div className={`${THEME.bg} flex min-h-[100dvh] items-center justify-center text-[#0F172A]`}>
        <div className="text-center">
          <div className="mx-auto mb-4 h-11 w-11 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#38BDF8]" />
          <p className="text-sm font-medium text-[#334155]">Entering classroom…</p>
          <p className="mt-1 text-xs text-[#64748B]">Preparing secure media session</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={`${THEME.bg} flex min-h-[100dvh] items-center justify-center p-6`}>
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-xl">
          {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
          <Button onClick={() => window.history.back()}>Back to classes</Button>
        </div>
      </div>
    );
  }

  const hostName = session.assignedTeacherName || (typeof session.host === "string" ? session.host : "Assigned teacher");
  const courseLine = session.courseCode ? `${session.courseCode} — ${session.courseName || ""}` : session.courseName || "Online class";
  const pendingRequests = (waitingRequests || []).filter((r: any) => String(r.status) === "pending");
  const showConnected = lkConnected;
  const othersCount = Math.max(0, participantCount - 1);
  const statusKind = meetingEnded ? "ended" : lkError ? "failed" : lkConnected ? "live" : /connect|request|retry|reconnect/i.test(lkStatus) || /reconnect/i.test(realtimeStatus) ? "connecting" : "idle";
  const statusLabel = meetingEnded ? "Ended" : lkConnected ? "Live" : lkError ? "Failed" : /connect|request|retry|reconnect/i.test(lkStatus) || /reconnect/i.test(realtimeStatus) ? "Connecting" : realtimeStatus || "Waiting";
  const elapsedLabel = `${Math.floor(elapsedMinutes / 60)}:${String(elapsedMinutes % 60).padStart(2, "0")}`;

  const videoSizeLabel = videoSize === 'small' ? 'Small' : videoSize === 'large' ? 'Large' : 'Medium';
  const gridGapClass = videoSize === 'small' ? 'gap-2 sm:gap-2.5' : videoSize === 'large' ? 'gap-3 sm:gap-4' : 'gap-2.5 sm:gap-3';
  const gridColsClass = participantCount <= 1
    ? 'grid-cols-1'
    : participantCount === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : participantCount <= 4
        ? 'grid-cols-2'
        : participantCount <= 6
          ? 'grid-cols-2 md:grid-cols-3'
          : participantCount <= 9
            ? 'grid-cols-2 md:grid-cols-3'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
  const gridWrapClass = participantCount <= 1 ? 'place-items-center' : 'place-content-center';
  const tileSizeClass = participantCount <= 1
    ? (videoSize === 'small' ? 'max-w-[min(100%,32rem)]' : videoSize === 'large' ? 'max-w-[min(100%,56rem)]' : 'max-w-[min(100%,44rem)]')
    : participantCount === 2
      ? (videoSize === 'small' ? 'max-w-[min(100%,22rem)]' : videoSize === 'large' ? 'max-w-[min(100%,38rem)]' : 'max-w-[min(100%,30rem)]')
      : participantCount <= 4
        ? (videoSize === 'small' ? 'max-w-[min(100%,16rem)]' : videoSize === 'large' ? 'max-w-[min(100%,28rem)]' : 'max-w-[min(100%,22rem)]')
        : participantCount <= 6
          ? (videoSize === 'small' ? 'max-w-[min(100%,13rem)]' : videoSize === 'large' ? 'max-w-[min(100%,24rem)]' : 'max-w-[min(100%,18rem)]')
          : participantCount <= 9
            ? (videoSize === 'small' ? 'max-w-[min(100%,11rem)]' : videoSize === 'large' ? 'max-w-[min(100%,20rem)]' : 'max-w-[min(100%,15rem)]')
            : (videoSize === 'small' ? 'max-w-[min(100%,10rem)]' : videoSize === 'large' ? 'max-w-[min(100%,17rem)]' : 'max-w-[min(100%,13rem)]');

  return (
    <div className={`${THEME.bg} flex h-[100dvh] min-h-0 flex-col overflow-hidden text-[#0F172A]`} ref={fullscreenElRef}>
      {meetingEnded && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-6 text-center shadow-[0_24px_60px_-24px_rgba(15,23,42,0.18)]">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F8FAFC] text-[#64748B]">
              <PhoneOff className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <h3 className="text-lg font-semibold text-[#0F172A]">Class ended</h3>
            <p className="mt-2 text-sm text-[#64748B]">{meetingEnded.message}</p>
            <p className="mt-1 text-xs text-[#64748B]">You will be returned to Techspire Meet.</p>
          </div>
        </div>
      )}

      {error && !meetingEnded && (
        <div className="fixed left-1/2 top-4 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2">
          <Alert variant="warning" onDismiss={() => setError(null)}>{error}</Alert>
        </div>
      )}

      <header className="z-30 shrink-0 border-b border-[#E2E8F0] bg-white/90 px-3 py-2 backdrop-blur-md sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#0284C7]">
              <GraduationCap className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0284C7]">Techspire Meet</span>
                <span className="hidden text-[#334155] sm:inline">•</span>
                <span className="hidden truncate text-[11px] text-[#64748B] sm:inline">Virtual Classroom</span>
              </div>
              <div className="flex min-w-0 items-center gap-x-2 gap-y-0.5">
                <h1 className="truncate text-sm font-semibold leading-5 text-[#0F172A]">{session.title || courseLine}</h1>
                <span className="hidden shrink-0 text-[#334155] md:inline">·</span>
                <p className="hidden truncate text-xs text-[#64748B] md:block">{academicGroup(session)} · {hostName}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <div
              className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] ${
                statusKind === "live"
                  ? "border-[#16A34A]/30 bg-[#16A34A]/10 text-[#15803D]"
                  : statusKind === "connecting"
                    ? "border-[#0284C7]/25 bg-[#0284C7]/10 text-[#0369A1]"
                    : statusKind === "failed"
                      ? "border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]"
                      : "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"
              }`}
              title={lkStatus}
            >
              {statusKind === "live" ? (
                <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
              ) : statusKind === "connecting" ? (
                <Radio className="h-3 w-3 animate-pulse motion-reduce:animate-none" strokeWidth={2} />
              ) : (
                <span className={`h-1.5 w-1.5 rounded-full ${statusKind === "failed" ? "bg-[#DC2626]" : "bg-[#64748B]"}`} />
              )}
              <span>{statusLabel}</span>
            </div>
            <div className="inline-flex min-h-[32px] items-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 font-mono text-[11px] text-[#475569]" title="Session duration">
              {elapsedLabel}
            </div>
            <div className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-medium text-[#334155]" title="Connected participants">
              <Users className="h-3.5 w-3.5 text-[#64748B]" strokeWidth={1.8} />
              <span>{presenceReady || lkConnected ? participantCount : "—"}</span>
            </div>
            <label className="hidden items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 lg:inline-flex" title={`Video size: ${videoSizeLabel}`}>
              <span className="text-[11px] font-medium text-[#64748B]">Video</span>
              <input type="range" min={0} max={2} step={1} value={videoSize==='small'?0:videoSize==='large'?2:1} onChange={(e)=>{ const v=Number(e.target.value); setVideoSize(v===0?'small':v===2?'large':'medium'); touchGrid(); }} className="h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-slate-200 accent-[#0284C7]" aria-label="Video size" />
              <span className="w-11 text-right text-[11px] font-semibold text-[#334155]">{videoSizeLabel}</span>
            </label>
            <button type="button" onClick={toggleFullscreen} title={fullscreenActive ? "Exit full screen" : "Enter full screen"} aria-label={fullscreenActive ? "Exit full screen" : "Enter full screen"} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B] transition-colors hover:border-slate-200 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]/25 motion-reduce:transition-none">
              {fullscreenActive ? <Minimize2 className="h-4 w-4" strokeWidth={1.8} /> : <Maximize2 className="h-4 w-4" strokeWidth={1.8} />}
            </button>
            <button type="button" onClick={() => { setSidebarOpen((v) => !v); if (!sidebarOpen) setUnreadChat(0); }} title={sidebarOpen ? "Hide sidebar" : "Show sidebar"} aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]/25 motion-reduce:transition-none ${sidebarOpen ? "border-[#0284C7]/30 bg-[#0284C7]/10 text-[#0369A1]" : "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B] hover:border-slate-200 hover:text-[#0F172A]"}`}>
              {sidebarOpen ? <PanelRightClose className="h-4 w-4" strokeWidth={1.8} /> : <PanelRightOpen className="h-4 w-4" strokeWidth={1.8} />}
            </button>
            <button type="button" onClick={() => void handleLeave()} title="Leave this meeting" aria-label="Leave this meeting" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-[12px] font-medium text-[#DC2626] transition-colors hover:border-[#DC2626]/40 hover:bg-[#B91C1C]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/25 motion-reduce:transition-none">
              <LogOut className="h-4 w-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="min-w-0 min-h-0 flex-1 flex flex-col overflow-hidden">
          <div className={`relative flex-1 min-h-0 min-w-0 overflow-hidden ${THEME.stageBg}`}>
            <div className="absolute inset-0 overflow-hidden p-2 sm:p-3 lg:p-4">
              <div className="flex h-full w-full min-h-0 items-center justify-center">
              {presentationMode && activeScreenShare ? (
                <div className="flex h-full w-full min-h-0 min-w-0 flex-col gap-2 lg:flex-row">
                  <div ref={presentationElRef} className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0B1220] ${presentationFullscreen ? "rounded-none border-0" : ""}`}>
                    <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-7rem)] items-center gap-2 rounded-lg bg-black/45 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                      <MonitorUp className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                      <span className="truncate">{activeScreenShare.name || "Presenter"} is presenting</span>
                      {isTeacherLikeRole(activeScreenShare.role, session, activeScreenShare.userId) ? <span className="shrink-0 rounded bg-[#16A34A]/90 px-1.5 py-0.5 text-[10px] font-semibold">TEACHER</span> : null}
                    </div>
                    <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
                      {isTeacher && !activeScreenShare.isLocal ? (
                        <button type="button" onClick={() => void stopScreenShare({ byTeacher: true, targetUserId: activeScreenShare.userId })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/85 px-2.5 text-[11px] font-medium text-white hover:bg-[#DC2626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/40">
                          Stop presenting
                        </button>
                      ) : null}
                      <button type="button" onClick={() => void togglePresentationFullscreen()} title={presentationFullscreen ? "Exit presentation full screen" : "Full screen presentation"} aria-label={presentationFullscreen ? "Exit presentation full screen" : "Full screen presentation"} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-white hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
                        {presentationFullscreen ? <Minimize2 className="h-4 w-4" strokeWidth={1.8} /> : <Maximize2 className="h-4 w-4" strokeWidth={1.8} />}
                      </button>
                    </div>
                    <div className="relative min-h-[220px] flex-1 min-w-0 bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.8),_#020617_70%)]">
                      <VideoTrackView track={activeScreenShare.track} muted={activeScreenShare.isLocal} objectFit="contain" className="absolute inset-0 bg-transparent" />
                    </div>
                    {presentationFullscreen ? (
                      <div className="shrink-0 border-t border-white/10 bg-black/35 px-3 py-2 text-[11px] text-slate-200">Press Esc to exit full screen. Classroom audio/video remain connected.</div>
                    ) : null}
                  </div>
                  <div className={`${presentationFullscreen ? "hidden" : "flex"} min-h-0 shrink-0 flex-row gap-2 overflow-x-auto overflow-y-hidden lg:w-[220px] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden xl:w-[240px]`}>
                    <div className="hidden px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748B] lg:block">Participants</div>
                    {tileModels.map((t) => {
                      const displayName = t.name.replace(" (You)", "");
                      const host = t.role === "TEACHER" || t.role === "HOST" || t.role === "CO_HOST" || t.isTeacherLike;
                      const MicIcon = t.micEnabled ? Mic : MicOff;
                      const CamIcon = t.cameraEnabled ? Video : VideoOff;
                      return (
                        <article key={t.key} className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl border border-slate-700/50 bg-[#111827] shadow-sm lg:w-full">
                          {t.hasVideo ? (
                            <VideoTrackView track={t.videoTrack} muted={t.isLocal} className="absolute inset-0 bg-[#111827]" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#1E293B] to-[#0F172A]">
                              <div className="flex flex-col items-center gap-1.5">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#334155] text-sm font-semibold text-white">{initials(displayName)}</div>
                                <span className="text-[10px] text-slate-300">{t.cameraEnabled ? "Starting…" : "Camera off"}</span>
                              </div>
                            </div>
                          )}
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent p-2">
                            <div className="flex items-end justify-between gap-1.5">
                              <div className="pointer-events-auto min-w-0">
                                <div className="truncate text-[11px] font-medium text-white">{t.name}</div>
                                {host ? <div className="mt-0.5 inline-flex rounded bg-[#16A34A]/85 px-1 py-px text-[9px] font-semibold text-white">TEACHER</div> : null}
                              </div>
                              <div className="pointer-events-auto flex shrink-0 items-center gap-1">
                                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${t.micEnabled ? "bg-black/30 text-white" : "bg-[#DC2626] text-white"}`} title={t.micEnabled ? "Mic on" : "Muted"}><MicIcon className="h-3 w-3" strokeWidth={1.9} /></span>
                                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${t.cameraEnabled ? "bg-black/30 text-white" : "bg-[#DC2626] text-white"}`} title={t.cameraEnabled ? "Camera on" : "Camera off"}><CamIcon className="h-3 w-3" strokeWidth={1.9} /></span>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : participantCount > 0 ? (
                <div className={`grid ${gridColsClass} ${gridGapClass} h-full w-full max-h-full max-w-full content-center items-stretch ${gridWrapClass}`}>
                  {tileModels.map((t) => {
                    const displayName = t.name.replace(" (You)", "");
                    const isHostRole = t.role === "TEACHER" || t.role === "HOST" || t.role === "CO_HOST" || t.isTeacherLike;
                    const MicIcon = t.micEnabled ? Mic : MicOff;
                    const CamIcon = t.cameraEnabled ? Video : VideoOff;
                    return (
                    <article key={t.key} className={`group relative aspect-video h-auto max-h-full w-full justify-self-center overflow-hidden rounded-2xl border border-slate-700/60 bg-[#111827] shadow-[0_12px_30px_-20px_rgba(15,23,42,0.14)] transition-[border-color,box-shadow,transform] duration-200 hover:border-slate-200 motion-reduce:transition-none ${tileSizeClass}`}>
                      {t.hasVideo ? (
                        <VideoTrackView track={t.videoTrack} muted={t.isLocal} className="absolute inset-0 bg-[#111827]" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.10),_transparent_40%),linear-gradient(180deg,_#1E293B_0%,_#0F172A_100%)]">
                          <div className="flex flex-col items-center gap-3 px-4 text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-[#334155] text-xl font-semibold text-white shadow-inner sm:h-20 sm:w-20 sm:text-2xl">{initials(displayName)}</div>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-medium text-slate-200">
                              <VideoOff className="h-3.5 w-3.5" strokeWidth={1.8} />
                              {t.cameraEnabled ? "Camera starting…" : "Camera off"}
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/90 via-slate-900/25 to-transparent p-2.5 sm:p-3">
                        <div className="flex items-end justify-between gap-2">
                          <div className="pointer-events-auto flex min-w-0 items-center gap-1.5">
                            <span className="truncate rounded-md bg-black/25 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm sm:text-[13px]">{t.name}</span>
                            {isHostRole ? <span className="shrink-0 rounded-md border border-[#16A34A]/30 bg-[#16A34A]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#86EFAC]">{t.isTeacherLike || t.role === 'TEACHER' ? 'TEACHER' : 'HOST'}</span> : null}
                            {t.raised ? <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#F59E0B]/35 bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-semibold text-[#B45309]" title="Hand raised"><Hand className="h-3 w-3" strokeWidth={2} /> Hand</span> : null}
                          </div>
                          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
                            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border backdrop-blur-sm ${t.micEnabled ? "border-white/10 bg-black/30 text-white" : "border-[#DC2626]/35 bg-[#DC2626]/90 text-white"}`} title={t.micEnabled ? "Microphone on" : "Microphone muted"}><MicIcon className="h-3.5 w-3.5" strokeWidth={1.9} /></span>
                            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border backdrop-blur-sm ${t.cameraEnabled ? "border-white/10 bg-black/30 text-white" : "border-[#DC2626]/35 bg-[#DC2626]/90 text-white"}`} title={t.cameraEnabled ? "Camera on" : "Camera off"}><CamIcon className="h-3.5 w-3.5" strokeWidth={1.9} /></span>
                          </div>
                        </div>
                      </div>
                      {t.isLocal ? <span className="absolute left-2.5 top-2.5 rounded-md border border-white/10 bg-black/35 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">You</span> : null}
                    </article>
                  );})}
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-[#E2E8F0] bg-white shadow-lg"><Users className="h-8 w-8 text-[#64748B]" strokeWidth={1.7} /></div>
                  <h2 className="text-lg font-semibold text-[#0F172A]">Classroom ready</h2>
                  <p className="mt-1 max-w-md text-sm text-[#64748B]">{lkConnected ? "Waiting for participants to join." : lkStatus || "Connecting to classroom media…"}</p>
                  {!live && <p className="mt-3 text-xs text-[#64748B]">Session has not started yet. Waiting for the teacher to start class.</p>}
                </div>
              )}
              </div>
            </div>

            {lkError && (
              <div className="pointer-events-none absolute left-4 right-4 top-4 z-20 mx-auto max-w-lg">
                <div className="pointer-events-auto rounded-2xl border border-[#DC2626]/30 bg-white/95 p-4 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.14)] backdrop-blur-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626]" strokeWidth={1.8} />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-[#DC2626]">LiveKit media connection issue</h4>
                      <p className="mt-1 text-xs text-[#64748B]">{lkError}</p>
                      <div className="mt-3">
                        <button type="button" onClick={retryLiveKit} className="inline-flex min-h-[36px] items-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-xs font-medium text-[#334155] transition-colors hover:border-slate-200 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]/25 motion-reduce:transition-none">Retry connection ({lkRetries})</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 z-20 border-t border-[#E2E8F0] bg-white/90 px-2.5 py-2 backdrop-blur-md shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.18)] sm:px-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
              <div className="flex shrink-0 items-center gap-1.5">
                <ToolbarBtn label={muted ? "Unmute" : "Mute"} icon={muted ? MicOff : Mic} onClick={() => void toggleMic()} active={muted} disabled={!lkConnected} title={muted ? "Unmute microphone" : "Mute microphone"} />
                <ToolbarBtn label={cameraOff ? "Camera on" : "Camera off"} icon={cameraOff ? VideoOff : Video} onClick={() => void toggleCam()} active={cameraOff} disabled={!lkConnected} title={cameraOff ? "Turn camera on" : "Turn camera off"} />
                <ToolbarBtn
                  label={sharing ? "Stop share" : shareBusy ? "Sharing…" : !isTeacher && shareRequestStatus === "pending" ? "Waiting…" : shareRequestStatus === "rejected" ? "Request declined" : "Share"}
                  icon={MonitorUp}
                  onClick={() => void toggleShare()}
                  active={sharing || (!isTeacher && shareRequestStatus === "pending")}
                  disabled={!lkConnected || shareBusy || (!isTeacher && shareRequestStatus === "pending")}
                  title={sharing ? "Stop screen sharing" : !isTeacher && shareRequestStatus === "pending" ? "Waiting for teacher approval" : shareRequestStatus === "rejected" ? "Teacher declined your request. Click to request again." : isTeacher ? "Share your screen" : "Request permission to share your screen"}
                />
                <ToolbarBtn label={handRaised ? "Lower hand" : "Raise hand"} icon={Hand} onClick={toggleHand} active={handRaised} disabled={!showConnected} title={handRaised ? "Lower hand" : "Raise hand"} />
              </div>
              <div className="mx-0.5 h-6 w-px shrink-0 bg-[#E2E8F0]" aria-hidden="true" />
              <div className="flex shrink-0 items-center gap-1.5">
                <ToolbarBtn label={`Participants${participantCount ? ` (${participantCount})` : ""}`} icon={Users} onClick={() => { setSidebarOpen(true); setSidebarTab("participants"); }} active={sidebarOpen && sidebarTab === "participants"} title="Open participants panel" />
                <ToolbarBtn label={unreadChat > 0 ? `Chat (${unreadChat})` : "Chat"} icon={MessageSquare} onClick={() => { setSidebarOpen(true); setSidebarTab("chat"); setUnreadChat(0); }} active={sidebarOpen && sidebarTab === "chat"} title="Open meeting chat" />
                {!sidebarOpen ? <ToolbarBtn label="Open chat" icon={PanelRightOpen} onClick={() => { setSidebarOpen(true); setSidebarTab("chat"); setUnreadChat(0); }} title="Open chat sidebar" /> : null}
                <ToolbarBtn label="More" icon={MoreVertical} onClick={() => setMoreOpen(!moreOpen)} title="More options" />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
                <ToolbarBtn label="Leave" icon={LogOut} onClick={() => void handleLeave()} danger title="Leave this meeting" />
                {canEndClass ? (
                  <ToolbarBtn label={ending ? "Ending…" : "End for all"} icon={PhoneOff} onClick={() => { setMoreOpen(false); setConfirmEnd(true); }} primary disabled={ending || !!meetingEnded} title="End class for everyone (teacher only)" />
                ) : null}
              </div>
            </div>
            <div className="mt-1 truncate text-[11px] text-[#64748B]" title={`${lkStatus}${role ? ` · ${role}` : ""}`}>
              {lkStatus}{role ? ` · ${role}` : ""}
            </div>
          </div>
        </div>

        {sidebarOpen ? (
          <aside className="z-30 flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-l border-[#E2E8F0] bg-white shadow-[-12px_0_40px_-28px_rgba(15,23,42,0.12)] transition-[width] duration-200 motion-reduce:transition-none sm:w-[320px] lg:w-[340px] xl:w-[360px]">
            <div className="flex shrink-0 items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
              <div className="flex items-center gap-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-1">
                <button type="button" className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none ${sidebarTab === "participants" ? "bg-[#0284C7]/15 text-[#0369A1]" : "text-[#64748B] hover:text-[#0F172A]"}`} onClick={() => setSidebarTab("participants")}>
                  Participants
                </button>
                <button type="button" className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none ${sidebarTab === "chat" ? "bg-[#0284C7]/15 text-[#0369A1]" : "text-[#64748B] hover:text-[#0F172A]"}`} onClick={() => { setSidebarTab("chat"); setUnreadChat(0); }}>
                  Chat{unreadChat > 0 ? <span className="rounded-full bg-[#0284C7] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{unreadChat}</span> : null}
                </button>
              </div>
              <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" title="Close sidebar" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B] transition-colors hover:border-slate-200 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]/25 motion-reduce:transition-none">
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {sidebarTab === "participants" ? (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">{participantCount} connected</p>
                    <div className="space-y-1.5">
                      {(tileModels.length ? tileModels.map((t) => ({ userId: t.userId, name: t.name.replace(" (You)", "") + (t.isLocal ? " (You)" : ""), role: t.role, raised: t.raised, micEnabled: t.micEnabled, cameraEnabled: t.cameraEnabled })) : []).map((p: any) => {
                        const Pmic = p.micEnabled ? Mic : MicOff;
                        const Pcam = p.cameraEnabled ? Video : VideoOff;
                        const host = p.role === "TEACHER" || p.role === "HOST" || p.role === "CO_HOST";
                        return (
                          <div key={p.userId} className="flex items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/70 px-2.5 py-2 transition-colors hover:border-slate-200 hover:bg-[#F8FAFC] motion-reduce:transition-none">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[11px] font-semibold text-[#334155]">{initials(String(p.name||"").replace(" (You)","") || p.userId)}</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-[13px] font-medium text-[#0F172A]">{p.name}</span>
                                {host ? <span className="rounded bg-[#16A34A]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#166534]">Host</span> : null}
                                {p.raised ? <Hand className="h-3 w-3 shrink-0 text-[#F59E0B]" strokeWidth={2} /> : null}
                              </div>
                              <div className="text-[11px] text-[#64748B]">{host ? "Teacher" : (p.role || "Participant")}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${p.micEnabled ? "text-[#64748B]" : "bg-[#DC2626]/15 text-[#DC2626]"}`} title={p.micEnabled ? "Microphone on" : "Muted"}><Pmic className="h-3.5 w-3.5" strokeWidth={1.8} /></span>
                              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${p.cameraEnabled ? "text-[#64748B]" : "bg-[#DC2626]/15 text-[#DC2626]"}`} title={p.cameraEnabled ? "Camera on" : "Camera off"}><Pcam className="h-3.5 w-3.5" strokeWidth={1.8} /></span>
                            </div>
                          </div>
                        );
                      })}
                      {!tileModels.length ? <div className="rounded-xl border border-dashed border-[#E2E8F0] px-3 py-6 text-center text-xs text-[#64748B]">{lkConnected ? "No connected participants." : "Not connected to media."}</div> : null}
                    </div>
                  </div>
                  {!isTeacher && shareRequestStatus !== "idle" ? (
                    <div>
                      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">Screen sharing</p>
                      <div className={`rounded-xl border p-3 ${shareRequestStatus === "pending" ? "border-[#0284C7]/25 bg-[#0284C7]/[0.06]" : shareRequestStatus === "approved" ? "border-[#16A34A]/25 bg-[#16A34A]/[0.06]" : "border-[#DC2626]/25 bg-[#DC2626]/[0.06]"}`}>
                        {shareRequestStatus === "pending" ? (
                          <>
                            <div className="text-[13px] font-medium text-[#0F172A]">Waiting for teacher approval</div>
                            <p className="mt-1 text-[12px] text-[#64748B]">Your request has been sent to the teacher. You can choose a screen after approval.</p>
                            <button type="button" onClick={cancelScreenShareRequest} className="mt-2 inline-flex min-h-[34px] items-center rounded-lg border border-[#E2E8F0] bg-white px-3 text-[12px] font-medium text-[#334155] hover:border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]/25">Cancel request</button>
                          </>
                        ) : shareRequestStatus === "approved" ? (
                          <>
                            <div className="text-[13px] font-medium text-[#166534]">Request approved</div>
                            <p className="mt-1 text-[12px] text-[#64748B]">Select a screen, window, or tab in the browser dialog.</p>
                          </>
                        ) : (
                          <>
                            <div className="text-[13px] font-medium text-[#DC2626]">Screen sharing request declined</div>
                            <p className="mt-1 text-[12px] text-[#64748B]">{shareRejectReason || "The teacher has declined your request."}</p>
                            <button type="button" onClick={() => { setShareRequestStatus("idle"); setShareRejectReason(null); requestScreenShare(); }} className="mt-2 inline-flex min-h-[34px] items-center rounded-lg border border-[#0284C7]/30 bg-white px-3 text-[12px] font-medium text-[#0369A1] hover:bg-[#0284C7]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]/25">Request again</button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}
                  {isTeacher ? (
                    <div>
                      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">Screen sharing requests ({screenShareRequests.length})</p>
                      {screenShareRequests.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#E2E8F0] px-3 py-4 text-center text-xs text-[#64748B]">{activeScreenShare ? `${activeScreenShare.name} is presenting.` : "No pending screen-sharing requests"}</div>
                      ) : (
                        <div className="space-y-1.5">
                          {screenShareRequests.map((r) => (
                            <div key={r.requestId} className="rounded-xl border border-[#0284C7]/20 bg-[#0284C7]/[0.04] p-2.5">
                              <div className="mb-1 text-[13px] font-medium text-[#0F172A]">{r.name || r.userId}</div>
                              <div className="mb-2 text-[11px] text-[#64748B]">wants to share their screen.</div>
                              <div className="flex gap-1.5">
                                <button type="button" onClick={() => decideScreenShareRequest(r.requestId, "approve")} className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#16A34A] px-2 text-[12px] font-medium text-white transition-colors hover:bg-[#15803D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A]/30"><Check className="h-3.5 w-3.5" strokeWidth={2} />Approve</button>
                                <button type="button" onClick={() => decideScreenShareRequest(r.requestId, "reject")} className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#DC2626]/35 bg-[#DC2626]/10 px-2 text-[12px] font-medium text-[#DC2626] transition-colors hover:bg-[#B91C1C]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/25"><X className="h-3.5 w-3.5" strokeWidth={2} />Reject</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                  {isTeacher && admissionPolicy === "approval" ? (
                    <div>
                      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">Waiting room ({pendingRequests.length})</p>
                      {pendingRequests.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#E2E8F0] px-3 py-4 text-center text-xs text-[#64748B]">No pending admissions</div>
                      ) : (
                        <div className="space-y-1.5">
                          {pendingRequests.map((r: any) => (
                            <div key={r.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/70 p-2.5">
                              <div className="mb-2 truncate text-[13px] font-medium text-[#0F172A]">{r.name || r.userId}</div>
                              <div className="flex gap-1.5">
                                <button type="button" onClick={() => handleDecideRow(r.id, "approve")} className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#16A34A] px-2 text-[12px] font-medium text-white transition-colors hover:bg-[#15803D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A]/30 motion-reduce:transition-none"><Check className="h-3.5 w-3.5" strokeWidth={2} />Approve</button>
                                <button type="button" onClick={() => handleDecideRow(r.id, "reject")} className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#DC2626]/35 bg-[#DC2626]/10 px-2 text-[12px] font-medium text-[#DC2626] transition-colors hover:bg-[#B91C1C]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/25 motion-reduce:transition-none"><X className="h-3.5 w-3.5" strokeWidth={2} />Reject</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full min-h-[260px] flex-col">
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    {chat.length ? chat.map((m) => (
                      <div key={m.clientMsgId || `${m.userId}-${m.at}-${m.message}`} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/50 px-3 py-2">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="truncate text-[12px] font-semibold text-[#0F172A]">{m.name}</span>
                          {m.role ? <span className="text-[10px] uppercase tracking-wide text-[#64748B]">{m.role}</span> : null}
                          <span className="ml-auto shrink-0 text-[10px] text-[#64748B]">{new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}</span>
                        </div>
                        <div className={`text-[13px] leading-5 text-[#475569] ${m.message.includes("raised their hand") ? "italic text-[#B45309]" : ""}`}>{m.message}</div>
                      </div>
                    )) : (
                      <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] px-4 py-8 text-center">
                        <MessageSquare className="mb-2 h-5 w-5 text-[#475569]" strokeWidth={1.7} />
                        <p className="text-sm font-medium text-[#64748B]">No messages yet</p>
                        <p className="mt-1 text-xs text-[#64748B]">Messages sent here are visible to the class.</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 shrink-0 border-t border-[#E2E8F0] pt-3">
                    <div className="flex items-end gap-2">
                      <input className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A] placeholder:text-slate-400 transition-colors focus:border-[#0284C7]/50 focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/20 motion-reduce:transition-none" placeholder="Send a message…" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} aria-label="Chat message" />
                      <button type="button" onClick={sendChat} aria-label="Send message" title="Send message" className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-[#0284C7] text-white transition-colors hover:bg-[#0369A1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]/30 motion-reduce:transition-none">
                        <SendHorizontal className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      <MoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} onFullscreen={toggleFullscreen} fullscreenActive={fullscreenActive} onPictureInPicture={() => void togglePictureInPicture()} pipActive={pipActive} onLeave={() => void handleLeave()} onEndClass={() => { setMoreOpen(false); setConfirmEnd(true); }} canEndClass={canEndClass} ending={ending} />

      {confirmEnd && !meetingEnded && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1E293B]/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#1E293B]">End this class for everyone?</h3>
            <p className="mt-2 text-sm text-[#64748B]">Ending the class will disconnect all participants. They will not be able to rejoin this session.</p>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" onClick={() => setConfirmEnd(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => { setConfirmEnd(false); void handleEndClass(); }} disabled={ending}>{ending ? "Ending…" : "End Class for All"}</Button>
            </div>
          </div>
        </div>
      )}

      {deviceSettingsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1E293B]/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#1E293B]">Audio &amp; Video Settings</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-2">Microphone</label>
                <select className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] focus:outline-none focus:border-[#0F766E]" value={micId} onChange={(e) => void changeMic(e.target.value)}>
                  {mics.length ? mics.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>) : <option value="">Default / unavailable</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-2">Camera</label>
                <select className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] focus:outline-none focus:border-[#0F766E]" value={camId} onChange={(e) => void changeCam(e.target.value)}>
                  {cams.length ? cams.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>) : <option value="">Default / unavailable</option>}
                </select>
              </div>
              <button onClick={() => setDeviceSettingsOpen(false)} className="w-full py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#64748B] hover:bg-[#F8FAFC]">Done</button>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed left-1/2 top-4 z-50 flex -translate-x-1/2 flex-col gap-2">
        {handRaiseToasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-[#F59E0B]/35 bg-white/95 px-3 py-2 text-xs text-[#B45309] shadow-lg backdrop-blur-sm">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#FEF3C7]">
              <Hand className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
            <span className="text-[#0F172A]">{t.name} raised their hand</span>
            <button type="button" onClick={() => dismissToast(t.id)} className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]/25 motion-reduce:transition-none" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
        ))}
      </div>
      <video ref={pipVideoRef} className="hidden" autoPlay playsInline muted />
    </div>
  );
};

export default OnlineClassClassroomPage;
