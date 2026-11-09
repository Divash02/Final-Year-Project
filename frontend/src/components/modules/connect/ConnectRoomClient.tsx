import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Room, RoomEvent } from "livekit-client";
import { Button } from "../../ui/Button";
import { Alert } from "../../ui/Alert";
import { PdfViewer } from "../../shared/viewer/PdfViewer";
import { WhiteboardPanel } from "./WhiteboardPanel";
import { getConnectLiveKitToken, leaveConnectSession } from "../../../services/connectApi";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api").replace(/\/+$/, "");
const SOCKET_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

type ChatMsg = { sessionId: string; message: string; userId: string; name: string; role?: string; clientMsgId?: string | null; at: string };
type Presence = { userId: string; name?: string; role?: string; status?: string; raised?: boolean; at?: string };
type RemoteTile = { key: string; label: string; kind: string };

function makeTile(track: any, label: string, key: string, kind: string): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "overflow-hidden rounded bg-black aspect-video relative";
  wrap.dataset.tileKey = key;
  const cap = document.createElement("div");
  cap.className = "absolute bottom-1 left-1 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white";
  cap.textContent = label;
  try {
    const media = track.attach();
    (media as any).style.width = "100%";
    (media as any).style.height = "100%";
    (media as any).style.objectFit = "cover";
    wrap.appendChild(media);
  } catch {}
  wrap.appendChild(cap);
  return wrap;
}

function clearRemoteTiles(container: HTMLElement | null) {
  if (!container) return;
  container.innerHTML = "";
}

export const ConnectRoomClient: React.FC<{
  sessionId: string;
  onClose: () => void;
  credential?: { sessionId16?: string; password?: string } | null;
}> = ({ sessionId, onClose, credential }) => {
  const [error, setError] = useState<string | null>(null);
  const [lkStatus, setLkStatus] = useState("Requesting secure media token…");
  const [socketStatus, setSocketStatus] = useState("Connecting realtime channel…");
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [role, setRole] = useState<string>("");
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState("");
  const [camId, setCamId] = useState("");
  const [showBoard, setShowBoard] = useState(false);
  const [presentationFileId, setPresentationFileId] = useState("");
  const [presentationPage, setPresentationPage] = useState(1);
  const [lkRoomName, setLkRoomName] = useState<string>("");
  const [lkToken, setLkToken] = useState<any>(null);

  const roomRef = useRef<Room | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const localRef = useRef<HTMLDivElement | null>(null);
  const remoteRef = useRef<HTMLDivElement | null>(null);
  const seenMsgs = useRef<Set<string>>(new Set());
  const joinedSocket = useRef(false);
  // Guards against duplicate LiveKit connections (e.g. React StrictMode dev double-invocation
  // or overlapping token refresh). Connecting the same participant identity twice causes the
  // LiveKit server to send a leave to the previous connection.
  const connectOpRef = useRef(0);
  const connectInFlightRef = useRef<Promise<void> | null>(null);

  const participants = useMemo(() => Object.values(presence).filter((p) => String(p.status || "active") !== "offline"), [presence]);
  const isHost = ["HOST", "TEACHER", "CO_HOST"].includes(role);

  const syncRemoteGrid = useCallback(() => {
    const room = roomRef.current;
    const container = remoteRef.current;
    if (!room || !container) return;
    clearRemoteTiles(container);
    for (const p of room.remoteParticipants.values()) {
      // video/screen publications
      for (const pub of [...p.videoTrackPublications.values(), ...p.trackPublications.values()]) {
        const track = (pub as any).track;
        const kind = String((pub as any).kind || (track as any)?.kind || "");
        if (!track) continue;
        if (kind.includes("Video") || kind === "1") {
          const label = (p.name || p.identity || "Participant") + ((pub as any).source === "screen_share" || String((pub as any).trackName||'').includes('screen') ? " (screen)" : "");
          container.appendChild(makeTile(track, label, `${p.identity}:${(pub as any).trackSid || (pub as any).trackName || kind}`, kind));
        }
      }
    }
  }, []);

  const attachLocal = useCallback(() => {
    const room = roomRef.current;
    if (!room || !localRef.current) return;
    try {
      localRef.current.innerHTML = "";
      const pubs: any[] = Array.from((room.localParticipant as any).videoTrackPublications?.values?.() || []);
      for (const pub of pubs) {
        const track = pub?.track || pub?.videoTrack;
        if (track) localRef.current.appendChild(makeTile(track, "You", "local", "video"));
      }
    } catch {}
  }, []);

  const safeDisconnectRoom = useCallback((room: Room | null) => {
    if (!room) return;
    try { room.removeAllListeners(); } catch {}
    try { room.disconnect(true); } catch { try { room.disconnect(); } catch {} }
  }, []);

  const connectLiveKit = useCallback(async (grant: any, opId: number) => {
    // Prevent duplicate in-flight connects for the same operation generation.
    if (connectInFlightRef.current) {
      try { await connectInFlightRef.current; } catch {}
      // If a newer op superseded us while waiting, stop.
      if (opId !== connectOpRef.current) return;
    }

    const run = (async () => {
      // Disconnect any previous room before creating a new one (same identity => server kicks old).
      const prev = roomRef.current;
      roomRef.current = null;
      if (prev) safeDisconnectRoom(prev);

      if (opId !== connectOpRef.current) return;
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, () => { if (roomRef.current === room) syncRemoteGrid(); });
      room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
        try { (track.detach?.() || []).forEach((el: HTMLElement) => el.remove()); } catch {}
        if (roomRef.current === room) syncRemoteGrid();
      });
      room.on(RoomEvent.ParticipantConnected, () => { if (roomRef.current === room) syncRemoteGrid(); });
      room.on(RoomEvent.ParticipantDisconnected, () => { if (roomRef.current === room) syncRemoteGrid(); });
      room.on(RoomEvent.LocalTrackPublished, () => { if (roomRef.current === room) attachLocal(); });
      room.on(RoomEvent.Disconnected, (reason: any) => {
        // Ignore disconnects from superseded rooms (e.g. intentional reconnect/refresh).
        if (roomRef.current !== room) return;
        setConnected(false);
        setLkStatus(`LiveKit disconnected${reason ? `: ${String(reason)}` : ""}.`);
      });
      room.on(RoomEvent.Reconnecting, () => { if (roomRef.current === room) setLkStatus("Reconnecting to LiveKit…"); });
      room.on(RoomEvent.Reconnected, () => {
        if (roomRef.current !== room) return;
        setLkStatus("Connected to LiveKit.");
        syncRemoteGrid();
        attachLocal();
      });

      await room.connect(grant.url, grant.token);
      if (opId !== connectOpRef.current || roomRef.current !== room) {
        safeDisconnectRoom(room);
        return;
      }
      setConnected(true);
      setLkStatus(`LiveKit connected as ${grant.role || "participant"}.`);
      try { await room.localParticipant.setMicrophoneEnabled(true); } catch {}
      if (opId !== connectOpRef.current || roomRef.current !== room) return;
      try { await room.localParticipant.setCameraEnabled(true); } catch {}
      if (opId !== connectOpRef.current || roomRef.current !== room) return;
      attachLocal();
      syncRemoteGrid();

      // Device selection (best-effort; depends on browser permissions).
      try {
        const allMics = await Room.getLocalDevices("audioinput", true).catch(() => []);
        const allCams = await Room.getLocalDevices("videoinput", true).catch(() => []);
        if (opId !== connectOpRef.current || roomRef.current !== room) return;
        setMics(allMics || []); setCams(allCams || []);
        if (allMics?.[0]?.deviceId) setMicId(allMics[0].deviceId);
        if (allCams?.[0]?.deviceId) setCamId(allCams[0].deviceId);
      } catch {}
    })();

    connectInFlightRef.current = run;
    try {
      await run;
    } finally {
      if (connectInFlightRef.current === run) connectInFlightRef.current = null;
    }
  }, [attachLocal, safeDisconnectRoom, syncRemoteGrid]);

  useEffect(() => {
    let active = true;
    const opId = ++connectOpRef.current;
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
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;
    const joinSession = () => {
      if (!active || connectOpRef.current !== opId) return;
      setSocketStatus("Realtime connected. Joining session…");
      socket.emit("connect:join", { sessionId, ...authPayload }, (ack: any) => {
        if (!active || connectOpRef.current !== opId) return;
        if (!ack?.ok) { setSocketStatus("Realtime join denied."); setError(ack?.error || "Unable to join realtime session."); return; }
        joinedSocket.current = true;
        setRole(ack.role || "");
        setSocketStatus(`Realtime connected${ack.role ? ` as ${ack.role}` : ""}.`);
      });
    };
    socket.on("connect", joinSession);
    socket.on("reconnect", joinSession); // re-authorize/re-join room on reconnect
    socket.on("disconnect", () => { if (active && connectOpRef.current === opId) setSocketStatus("Realtime disconnected. Reconnecting…"); });
    socket.on("connect_error", (e: any) => { if (active && connectOpRef.current === opId) setSocketStatus(`Realtime error: ${e?.message || "connection failed"}`); });
    socket.on("connect:participant:joined", (p: any) => setPresence((prev) => ({ ...prev, [p.userId]: { ...(prev[p.userId] || {}), ...p, status: "active" } })));
    socket.on("connect:participant:left", (p: any) => setPresence((prev) => ({ ...prev, [p.userId]: { ...(prev[p.userId] || {}), ...p, status: "offline" } })));
    socket.on("connect:participant:status", (p: any) => setPresence((prev) => ({ ...prev, [p.userId]: { ...(prev[p.userId] || {}), ...p } })));
    socket.on("connect:hand:changed", (p: any) => setPresence((prev) => ({ ...prev, [p.userId]: { ...(prev[p.userId] || {}), ...p } })));
    socket.on("connect:reaction", (r: any) => {
      if (r.sessionId !== sessionId) return;
      setChat((prev) => [...prev.slice(-199), { sessionId, message: `${r.name} reacted ${r.emoji}`, userId: r.userId, name: r.name, at: r.at }]);
    });
    socket.on("connect:presentation:nav", (p: any) => {
      if (p.sessionId !== sessionId) return;
      setPresentationPage(Number(p.page) || 1);
    });
    socket.on("connect:chat:message", (m: ChatMsg) => {
      const key = m.clientMsgId || `${m.userId}:${m.at}:${m.message}`;
      if (seenMsgs.current.has(key)) return;
      seenMsgs.current.add(key);
      setChat((prev) => [...prev.slice(-199), m]);
    });
    socket.on("connect:control:applied", (c: any) => {
      // Server-authorized host control foundation (LiveKit permission mapping continues).
      if (c.action === "mute_all" && roomRef.current) {
        roomRef.current.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        setMuted(true);
      }
      if (c.action === "lower_hand" && c.targetUserId) {
        setPresence((prev) => ({ ...prev, [c.targetUserId]: { ...(prev[c.targetUserId] || { userId: c.targetUserId }), raised: false } }));
      }
      setChat((prev) => [...prev.slice(-199), { sessionId, message: `[control] ${c.action}${c.targetUserId ? ` → ${c.targetUserId}` : ""}`, userId: c.by || "system", name: "Session control", role: c.role, at: c.at || new Date().toISOString() }]);
    });

    (async () => {
      try {
        const payload: any = {};
        if (credential?.sessionId16 && credential?.password) {
          payload.sessionCredentialId = credential.sessionId16;
          payload.sessionCredentialPassword = credential.password;
        }
        const data: any = await getConnectLiveKitToken(sessionId, payload);
        const lk = data?.livekit;
        if (!lk?.token || !lk?.url) throw new Error("LiveKit token response was incomplete.");
        if (!active || connectOpRef.current !== opId) return;
        setLkToken(lk); setLkRoomName(lk.roomName || "");
        setLkStatus("Connecting to LiveKit…");
        await connectLiveKit(lk, opId);
      } catch (e: any) {
        if (!active || connectOpRef.current !== opId) return;
        setError(e?.message || "Failed to connect to LiveKit.");
        setLkStatus("LiveKit not connected.");
      }
    })();

    return () => {
      active = false;
      if (connectOpRef.current === opId) connectOpRef.current = opId + 1000000; // supersede any late async work
      try { if (joinedSocket.current) socket.emit("connect:leave", { sessionId }); socket.disconnect(); } catch {}
      socketRef.current = null;
      joinedSocket.current = false;
      const room = roomRef.current; roomRef.current = null;
      if (room) safeDisconnectRoom(room);
    };
  }, [sessionId, credential?.sessionId16, credential?.password, connectLiveKit, safeDisconnectRoom]);

  async function refreshLiveKitToken() {
    // Token refresh handling (re-authorized server-side). No simulated success.
    try {
      setLkStatus("Refreshing secure media token…");
      const payload: any = {};
      if (credential?.sessionId16 && credential?.password) { payload.sessionCredentialId = credential.sessionId16; payload.sessionCredentialPassword = credential.password; }
      const data: any = await getConnectLiveKitToken(sessionId, payload);
      const lk = data?.livekit;
      if (!lk?.token || !lk?.url) throw new Error("Token refresh failed.");
      setLkToken(lk);
      const opId = ++connectOpRef.current;
      await connectLiveKit(lk, opId);
    } catch (e: any) {
      setError(e?.message || "Token refresh failed.");
      setLkStatus("LiveKit not connected.");
    }
  }

  async function toggleMic() { const room = roomRef.current; if (!room) return; const next = !muted; await room.localParticipant.setMicrophoneEnabled(!next); setMuted(next); socketRef.current?.emit("connect:status", { sessionId, status: next ? "muted" : "unmuted" }); }
  async function toggleCam() { const room = roomRef.current; if (!room) return; const next = !cameraOff; await room.localParticipant.setCameraEnabled(!next); setCameraOff(next); attachLocal(); }
  async function shareScreen() { const room = roomRef.current; if (!room) return; try { const next = !sharing; await room.localParticipant.setScreenShareEnabled(next); setSharing(next); socketRef.current?.emit("connect:status", { sessionId, status: next ? "presenting" : "active" }); } catch (e: any) { setError(e?.message || "Screen sharing failed."); } }
  function toggleHand() { const next = !handRaised; setHandRaised(next); socketRef.current?.emit("connect:hand:raise", { sessionId, raised: next }); }
  function sendChat() { const msg = chatInput.trim(); if (!msg) return; const clientMsgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; socketRef.current?.emit("connect:chat:send", { sessionId, message: msg, clientMsgId }, (ack: any) => { if (!ack?.ok) setError(ack?.error || "Message not sent."); }); setChatInput(""); }
  async function changeMic(deviceId: string) { setMicId(deviceId); const room = roomRef.current; if (room && deviceId) { try { await room.switchActiveDevice("audioinput", deviceId, true); } catch {} } }
  async function changeCam(deviceId: string) { setCamId(deviceId); const room = roomRef.current; if (room && deviceId) { try { await room.switchActiveDevice("videoinput", deviceId, true); } catch {} } }
  function hostControl(action: string, targetUserId?: string) { socketRef.current?.emit("connect:control", { sessionId, action, targetUserId }, (ack: any) => { if (!ack?.ok) setError(ack?.error || "Control denied."); }); }
  async function disconnect() {
    const opId = ++connectOpRef.current;
    try { await leaveConnectSession(sessionId); } catch {}
    try { if (joinedSocket.current) socketRef.current?.emit("connect:leave", { sessionId }); socketRef.current?.disconnect(); } catch {}
    socketRef.current = null;
    joinedSocket.current = false;
    const room = roomRef.current; roomRef.current = null;
    if (room) safeDisconnectRoom(room);
    void opId;
    onClose();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <div className="font-medium">{lkStatus}</div>
          <div className="text-slate-600">{socketStatus}{role ? ` · ${role}` : ""}{lkRoomName ? ` · room ${lkRoomName.slice(0, 24)}…` : ""}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={toggleMic} disabled={!connected}>{muted ? "Unmute" : "Mute"}</Button>
          <Button variant="secondary" onClick={toggleCam} disabled={!connected}>{cameraOff ? "Camera on" : "Camera off"}</Button>
          <Button variant="secondary" onClick={shareScreen} disabled={!connected}>{sharing ? "Stop share" : "Share screen"}</Button>
          <Button variant="secondary" onClick={toggleHand}>{handRaised ? "Lower hand" : "Raise hand"}</Button>
          <Button variant="secondary" onClick={() => socketRef.current?.emit("connect:reaction", { sessionId, emoji: "👏" })}>👏</Button>
          <Button variant="secondary" onClick={() => setShowBoard((v) => !v)}>{showBoard ? "Hide board" : "Whiteboard"}</Button>
          <Button variant="secondary" onClick={refreshLiveKitToken}>Refresh token/reconnect</Button>
          <Button variant="ghost" onClick={disconnect}>Leave</Button>
        </div>
      </div>

      {error && (
        <Alert variant="warning" onDismiss={() => setError(null)} detail="Real A/V requires server LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET and a reachable LiveKit deployment (TURN/ICE as needed). No audio/video is simulated.">
          Connection issue: {error}
        </Alert>
      )}

      <div className="grid gap-3 lg:grid-cols-4">
        <div className="lg:col-span-3 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <label className="flex items-center gap-1">Mic <select className="rounded border px-1 py-0.5" value={micId} onChange={(e) => changeMic(e.target.value)}>{mics.length ? mics.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0,8)}</option>) : <option value="">Default / unavailable</option>}</select></label>
            <label className="flex items-center gap-1">Camera <select className="rounded border px-1 py-0.5" value={camId} onChange={(e) => changeCam(e.target.value)}>{cams.length ? cams.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0,8)}</option>) : <option value="">Default / unavailable</option>}</select></label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs font-medium text-slate-600 mb-1">You</div>
              <div ref={localRef} className="aspect-video overflow-hidden rounded bg-black relative" />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs font-medium text-slate-600 mb-1">Participants (LiveKit media grid)</div>
              <div ref={remoteRef} className="grid gap-2 sm:grid-cols-2" />
              {showBoard && (
            <WhiteboardPanel sessionId={sessionId} socket={socketRef.current} isHost={isHost} canDraw={true} />
          )}
          {presentationFileId && (
            <div className="h-96">
              <PdfViewer fileId={presentationFileId} page={presentationPage} onPageChange={(pg) => {
                if (!isHost) return;
                setPresentationPage(pg);
                socketRef.current?.emit("connect:presentation:nav", { sessionId, page: pg });
              }} />
            </div>
          )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {isHost && (
            <div className="rounded border bg-white p-2">
              <div className="text-xs font-semibold text-slate-700 mb-1">Host controls (server-authorized)</div>
              <div className="flex flex-wrap gap-1">
                <Button variant="secondary" onClick={() => hostControl("mute_all")}>Mute all</Button>
                <Button variant="secondary" onClick={() => hostControl("lock_chat")}>Lock chat event</Button>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Foundation events only; full LiveKit moderation/admission mapping continues.</div>
            </div>
          )}
          <div className="rounded border bg-white p-2">
            <div className="text-xs font-semibold text-slate-700 mb-1">Participants / presence</div>
            <div className="max-h-36 overflow-auto space-y-1 text-xs">
              {participants.length ? participants.map((p) => (
                <div key={p.userId} className="flex items-center justify-between gap-2">
                  <span className="truncate">{p.name || p.userId}{p.raised ? " ✋" : ""}</span>
                  <span className="text-slate-500">{p.status || "active"}</span>
                  {isHost && p.raised && <button className="text-blue-600" onClick={() => hostControl("lower_hand", p.userId)}>lower</button>}
                </div>
              )) : <div className="text-slate-500">Presence updates appear as participants join/raise/status-change (Socket.IO, server-authorized).</div>}
            </div>
          </div>
          <div className="rounded border bg-white p-2">
            <div className="text-xs font-semibold text-slate-700 mb-1">Chat (server-authorized)</div>
            <div className="max-h-48 overflow-auto space-y-1 text-xs mb-2">
              {chat.map((m, i) => (<div key={m.clientMsgId || `${m.userId}-${m.at}-${i}`}><span className="font-medium">{m.name}:</span> {m.message}</div>))}
              {!chat.length && <div className="text-slate-500">No messages yet.</div>}
            </div>
            <div className="flex gap-1">
              <input className="min-w-0 flex-1 rounded border px-2 py-1 text-sm" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Message" onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} />
              <Button variant="secondary" onClick={sendChat}>Send</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
