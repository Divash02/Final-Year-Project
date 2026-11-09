import { Server as SocketIOServer } from "socket.io";
import {
  verifyToken,
  classifySession,
  getUserById,
  getUserRoles,
  touchSession,
  logAudit,
} from "../db.js";
import { getSessionPolicy } from "../config/sessionSecurity.js";
import { VirtualSession } from "../models/index.js";
import { authorizeConnectJoin, canViewSession, isStudentOnly, resolveConnectParticipantRole, requestAdmission, decideAdmission, setAdmissionPolicy, isAdmissionManaged, getWaitingRoomRequests, expireCredentials } from "./connectService.js";

function safeText(value, max = 500) {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function parseAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeOrigin(origin) {
  if (!origin) return null;
  try { return new URL(origin).origin; } catch { return origin; }
}

function originAllowed(origin) {
  if (!origin) return true;
  const allowed = parseAllowedOrigins();
  if (!allowed.length) return true;
  const normalized = normalizeOrigin(origin);
  return allowed.some((a) => normalizeOrigin(a) === normalized);
}

function roomChannel(sessionId) { return `connect:session:${String(sessionId)}`; }
function displayName(user) {
  return [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(" ").trim() || "Participant";
}

async function getSessionParticipants(io, sessionId) {
  const nsp = io.of("/connect");
  const room = roomChannel(sessionId);
  let sockets = [];
  try { sockets = await nsp.in(room).fetchSockets(); } catch { sockets = []; }
  const byUser = new Map();
  for (const s of sockets) {
    const u = s.data?.user;
    const uid = String(u?._id || u?.id || "");
    if (!uid) continue;
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        userId: uid,
        name: displayName(u),
        role: s.data?.sessionRoles?.[String(sessionId)] || "PARTICIPANT",
        status: "active",
      });
    }
  }
  return Array.from(byUser.values());
}

async function emitParticipants(io, sessionId) {
  if (!io) return;
  const participants = await getSessionParticipants(io, sessionId);
  io.of("/connect").to(roomChannel(sessionId)).emit("connect:participants:updated", {
    sessionId: String(sessionId),
    participants,
    count: participants.length,
    at: new Date().toISOString(),
  });
}

async function authenticateSocket(socket) {
  const authToken = socket.handshake?.auth?.token;
  const header = socket.handshake?.headers?.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = typeof authToken === "string" && authToken ? authToken : bearer;
  if (!token) throw new Error("Authentication required.");

  let payload;
  try { payload = verifyToken(token); } catch { throw new Error("Invalid or expired session."); }
  const classification = await classifySession(token);
  const session = classification.session;
  if (!session || classification.status !== "ACTIVE") throw new Error("Invalid session.");
  const user = await getUserById(payload.userId);
  if (!user || String(session.user || session.user_id) !== String(user._id || user.id)) {
    throw new Error("Invalid session.");
  }
  const roles = getUserRoles(user);
  const policy = getSessionPolicy(roles[0]);
  const lastActiveAt = session.lastActiveAt ? new Date(session.lastActiveAt).getTime() : 0;
  if (lastActiveAt > 0 && Date.now() - lastActiveAt > policy.inactivityTimeoutMs) {
    throw new Error("Session expired due to inactivity.");
  }
  const accountStatus = user.accountStatus || user.account_status;
  if (["SUSPENDED", "DISABLED", "ARCHIVED"].includes(accountStatus)) throw new Error("Account is not active.");
  await touchSession(session._id, { userAgent: socket.handshake?.headers?.["user-agent"], ipAddress: socket.handshake?.address }, session);
  return { user, token, authSession: session };
}

function createRateLimiter({ windowMs, max }) {
  const buckets = new Map();
  return function allow(key) {
    const now = Date.now();
    const bucket = buckets.get(key) || [];
    const recent = bucket.filter((t) => now - t < windowMs);
    if (recent.length >= max) { buckets.set(key, recent); return false; }
    recent.push(now);
    buckets.set(key, recent);
    return true;
  };
}

const chatRateLimit = createRateLimiter({ windowMs: 10_000, max: 12 });
const handRateLimit = createRateLimiter({ windowMs: 5_000, max: 8 });
const screenShareRateLimit = createRateLimiter({ windowMs: 5_000, max: 8 });

// In-memory screen-share coordination per session (single process). Source of truth for
// active media remains LiveKit tracks; this coordinates approval/conflict signaling.
const screenShareState = new Map(); // sessionId -> { presenter, pending, grants }
const screenShareGrants = new Map(); // grantKey(sessionId,userId) -> { requestId, expiresAt, grantedBy }

function getScreenShareSession(sessionId) {
  const id = String(sessionId || "");
  if (!screenShareState.has(id)) screenShareState.set(id, { presenter: null, pending: new Map() });
  return screenShareState.get(id);
}

function screenGrantKey(sessionId, userId){ return `${String(sessionId)}:${String(userId)}`; }
function screenShareSnapshot(sessionId) {
  const s = getScreenShareSession(sessionId);
  const presenter = s.presenter ? { ...s.presenter } : null;
  const pending = Array.from(s.pending.values()).map((r) => ({
    requestId: r.requestId, userId: r.userId, name: r.name, role: r.role, requestedAt: r.requestedAt,
  }));
  return { sessionId: String(sessionId), presenter, pending, hasPresenter: Boolean(presenter) };
}

async function clearPresenterIfDisconnected(io, sessionId, userId) {
  const s = getScreenShareSession(sessionId);
  if (s.presenter && String(s.presenter.userId) === String(userId)) {
    s.presenter = null;
    io.of("/connect").to(roomChannel(sessionId)).emit("connect:screen:changed", { ...screenShareSnapshot(sessionId), at: new Date().toISOString(), reason: "presenter_disconnected" });
  }
  for (const [rid, req] of s.pending.entries()) {
    if (String(req.userId) === String(userId)) s.pending.delete(rid);
  }
}

async function authorizeJoinedSession(socket, sessionId, _payload = {}) {
  const id = safeText(sessionId, 64);
  if (!id) throw new Error("Session is required.");
  if (!socket.rooms.has(roomChannel(id))) throw new Error("Join the session first.");
  const session = await VirtualSession.findById(id);
  if (!session) throw new Error("Session not found.");
  // Re-authorize on every sensitive event (server-side): student/meeting isolation,
  // cohort/invitation visibility, and session status. Session credential was verified at
  // connect:join; do not require re-submission, but never trust room membership alone.
  if (session.sessionType === "ONLINE_MEETING" && isStudentOnly(socket.data.user)) throw new Error("Session not found.");
  if (!canViewSession(session, socket.data.user)) throw new Error("Session not found.");
  if (["CANCELLED", "EXPIRED"].includes(session.status)) throw new Error("This session is not available.");
  if (["COMPLETED", "ENDED"].includes(session.status)) throw new Error("This session has already ended.");
  const priorRole = socket.data.sessionRoles?.[id];
  const { resolveConnectParticipantRole } = await import("./connectService.js");
  const role = resolveConnectParticipantRole(session, socket.data.user);
  if (!role) throw new Error("Access denied.");
  if (priorRole && priorRole !== role) throw new Error("Access denied.");
  socket.data.sessionRoles = socket.data.sessionRoles || {};
  socket.data.sessionRoles[id] = role;
  return { session, role, sessionId: id };
}

function isHostRole(role) {
  return ["HOST", "TEACHER", "CO_HOST"].includes(role);
}

export function initializeConnectRealtime(server, existingIo = null) {
  const io =
    existingIo ||
    new SocketIOServer(server, {
      path: "/socket.io",
      cors: {
        origin(origin, callback) {
          if (originAllowed(origin)) return callback(null, true);
          return callback(new Error("Not allowed by CORS policy"));
        },
        credentials: true,
        methods: ["GET", "POST"],
      },
    });

  const nsp = io.of("/connect");

  nsp.use(async (socket, next) => {
    try {
      const auth = await authenticateSocket(socket);
      socket.data.user = auth.user;
      socket.data.authSession = auth.authSession;
      next();
    } catch (err) { next(err); }
  });

  nsp.on("connection", (socket) => {
    const user = socket.data.user;

    socket.on("connect:join", async (payload = {}, ack) => {
      try {
        const sessionId = safeText(payload.sessionId, 64);
        if (!sessionId) throw new Error("Session is required.");
        const session = await VirtualSession.findById(sessionId);
        if (!session) throw new Error("Session not found.");

        // CRITICAL: use same authorization as HTTP join/token (identity + cohort/invite +
        // session credential where required + status + student/meeting isolation).
        const credentials = {
          sessionCredentialId: payload.sessionCredentialId || payload.credentialId || payload.sessionId16,
          sessionCredentialPassword: payload.sessionCredentialPassword || payload.credentialPassword || payload.password,
        };
        const role = authorizeConnectJoin(session, user, credentials);

        const channel = roomChannel(sessionId);
        socket.join(channel);
        socket.data.joinedSessions = socket.data.joinedSessions || new Set();
        socket.data.joinedSessions.add(sessionId);
        socket.data.sessionRoles = socket.data.sessionRoles || {};
        socket.data.sessionRoles[sessionId] = role;
        // Do not retain plaintext session password after successful authorization.

        socket.to(channel).emit("connect:participant:joined", {
          sessionId,
          userId: String(user._id || user.id),
          name: displayName(user),
          role,
          at: new Date().toISOString(),
        });
        const participants = await getSessionParticipants(io, sessionId);
        socket.emit("connect:participants:updated", {
          sessionId,
          participants,
          count: participants.length,
          at: new Date().toISOString(),
        });
        await emitParticipants(io, sessionId);
        try { socket.emit('connect:screen:state', screenShareSnapshot(sessionId)); } catch {}
        if (typeof ack === "function") ack({ ok: true, sessionId, role, participants, count: participants.length, screenShare: screenShareSnapshot(sessionId) });
      } catch (err) {
        // Non-disclosing for hidden meeting cases handled by authorizeConnectJoin.
        if (typeof ack === "function") ack({ ok: false, error: err?.message || "Unable to join session." });
      }
    });

    socket.on("connect:leave", async (payload = {}, ack) => {
      const sessionId = safeText(payload.sessionId, 64);
      if (sessionId) {
        const channel = roomChannel(sessionId);
        socket.leave(channel);
        socket.to(channel).emit("connect:participant:left", {
          sessionId,
          userId: String(user._id || user.id),
          name: displayName(user),
          at: new Date().toISOString(),
        });
        socket.data.joinedSessions?.delete(sessionId);
        if (socket.data.sessionRoles) delete socket.data.sessionRoles[sessionId];
        await emitParticipants(io, sessionId);
      }
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("connect:chat:send", async (payload = {}, ack) => {
      try {
        const userId = String(user._id || user.id);
        const sessionId = safeText(payload.sessionId, 64);
        if (!chatRateLimit(`${userId}:${sessionId}`)) throw new Error("Too many messages. Please slow down.");
        const message = safeText(payload.message, 2000);
        if (!message) throw new Error("Message is required.");
        const { role } = await authorizeJoinedSession(socket, sessionId, payload);
        const clientMsgId = safeText(payload.clientMsgId, 80) || null;
        nsp.to(roomChannel(sessionId)).emit("connect:chat:message", {
          sessionId,
          message,
          userId,
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Participant",
          role,
          clientMsgId,
          at: new Date().toISOString(),
        });
        if (typeof ack === "function") ack({ ok: true, clientMsgId });
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, error: err?.message || "Unable to send message." });
      }
    });

    socket.on("connect:hand:raise", async (payload = {}, ack) => {
      try {
        const userId = String(user._id || user.id);
        if (!handRateLimit(userId)) throw new Error("Please wait before changing hand state.");
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        nsp.to(roomChannel(sessionId)).emit("connect:hand:changed", {
          sessionId,
          userId,
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Participant",
          role,
          raised: Boolean(payload.raised),
          at: new Date().toISOString(),
        });
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err?.message || "Unable to update hand state." });
      }
    });

    socket.on("connect:status", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        const status = safeText(payload.status, 40);
        if (!["active", "away", "presenting", "muted", "unmuted"].includes(status)) throw new Error("Invalid status.");
        nsp.to(roomChannel(sessionId)).emit("connect:participant:status", {
          sessionId,
          userId: String(user._id || user.id),
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Participant",
          role,
          status,
          at: new Date().toISOString(),
        });
        ack?.({ ok: true });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Unable to update status." }); }
    });

    // Teacher/host control foundations (server-authorized; UI/LiveKit permission mapping continues).
    socket.on("connect:control", async (payload = {}, ack) => {
      try {
        const sessionId = safeText(payload.sessionId, 64);
        const { role } = await authorizeJoinedSession(socket, sessionId, payload);
        if (!isHostRole(role)) throw new Error("Not authorized to control participants.");
        const action = safeText(payload.action, 60);
        const allowed = new Set(["mute_all", "admit", "remove", "lower_hand", "end_session_request", "lock_chat"]);
        if (!allowed.has(action)) throw new Error("Unsupported control action.");
        const targetUserId = safeText(payload.targetUserId, 64) || null;
        nsp.to(roomChannel(sessionId)).emit("connect:control:applied", {
          sessionId,
          action,
          targetUserId,
          by: String(user._id || user.id),
          role,
          at: new Date().toISOString(),
        });
        ack?.({ ok: true });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Control action denied." }); }
    });

    // Student requests admission to the waiting room (teacher approval required).
    socket.on("connect:admission:request", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        if (role !== "STUDENT") throw new Error("Only students may request admission.");
        const session = await VirtualSession.findById(sessionId);
        if (!session) throw new Error("Session not found.");
        const request = await requestAdmission(session, socket.data.user);
        nsp.to(roomChannel(sessionId)).emit("connect:admission:requested", {
          sessionId,
          request: {
            id: String(request._id || request.id),
            userId: String(request.user),
            name: request.name,
            studentId: request.studentId,
            program: request.program,
            section: request.section,
            cameraOn: request.cameraOn,
            micOn: request.micOn,
            requestedAt: request.requestedAt,
            status: request.status,
          },
          at: new Date().toISOString(),
        });
        ack?.({ ok: true, requestId: String(request._id || request.id) });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Admission request denied." }); }
    });

    // Teacher/host approves or rejects a waiting-room admission request.
    socket.on("connect:admission:decide", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        if (!isHostRole(role)) throw new Error("Not authorized to decide admission requests.");
        const session = await VirtualSession.findById(sessionId);
        if (!session) throw new Error("Session not found.");
        const requestId = payload.requestId;
        const decision = payload.decision; // "approve" | "reject"
        if (!requestId || !decision) throw new Error("Request id and decision are required.");
        const request = await decideAdmission(session, requestId, socket.data.user, decision);
        const targetUserId = String(request.user);
        nsp.to(roomChannel(sessionId)).emit("connect:admission:decided", {
          sessionId,
          requestId: String(request._id || request.id),
          userId: targetUserId,
          decision,
          name: request.name,
          decidedAt: request.decidedAt,
          at: new Date().toISOString(),
        });
        // Direct the decision to the requesting participant.
        socket.to(roomChannel(sessionId)).emit("connect:admission:decision", {
          sessionId,
          requestId: String(request._id || request.id),
          decision,
          name: request.name,
          at: new Date().toISOString(),
        });
        ack?.({ ok: true, decision, requestId: String(request._id || request.id) });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Admission decision denied." }); }
    });

    // Teacher/host changes the admission policy (direct <-> approval).
    socket.on("connect:admission:policy", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        if (!isHostRole(role)) throw new Error("Not authorized to change the admission policy.");
        const session = await VirtualSession.findById(sessionId);
        if (!session) throw new Error("Session not found.");
        const policy = payload.policy;
        if (!["direct", "approval"].includes(policy)) throw new Error("Invalid admission policy.");
        const result = await setAdmissionPolicy(session, socket.data.user, policy);
        nsp.to(roomChannel(sessionId)).emit("connect:admission:policy-changed", {
          sessionId,
          policy: result.policy,
          by: String(socket.data.user._id || socket.data.user.id),
          at: new Date().toISOString(),
        });
        ack?.({ ok: true, policy: result.policy });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Admission policy change denied." }); }
    });

    // Teacher/host ends the session for everyone: broadcast disconnect + credential expiry.
    socket.on("connect:session:end", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        if (!isHostRole(role)) throw new Error("Not authorized to end this session.");
        const session = await VirtualSession.findById(sessionId);
        if (!session) throw new Error("Session not found.");
        const endedAlready = ["COMPLETED", "ENDED"].includes(session.status);
        if (endedAlready) {
          throw new Error("This session has already ended.");
        }
        const actualEndTime = new Date();
        session.status = "COMPLETED";
        session.endedAt = actualEndTime;
        session.actualEndTime = actualEndTime;
        if (session.startedAt && session.actualStartTime) {
          session.wasEndedEarly = session.scheduledDate && session.endTime
            ? actualEndTime.getTime() < new Date(`${session.scheduledDate}T${session.endTime}:00`).getTime()
            : false;
        }
        session.endedBy = socket.data.user._id || socket.data.user.id;
        session.terminationReason = payload?.terminationReason || "ended_by_host";
        await expireCredentials(session);
        for (const request of session.waitingRoomRequests || []) {
          if (String(request.status) === "pending") {
            request.status = "rejected";
            request.decidedAt = session.endedAt;
            request.decidedBy = socket.data.user._id || socket.data.user.id;
          }
        }
        for (const row of session.attendance || []) {
          if (!row.leftAt && row.joinedAt) {
            row.leftAt = session.endedAt;
            row.durationSeconds = Math.max(0, Math.floor((row.leftAt - row.joinedAt) / 1000));
          }
        }
        session.audit.push({ action: "SESSION_ENDED", actor: socket.data.user._id || socket.data.user.id });
        await session.save();
        await logAudit({ userId: socket.data.user._id || socket.data.user.id, action: "CONNECT_SESSION_ENDED", module: "connect", resource: "virtual_session", resourceId: String(session._id) });
        nsp.to(roomChannel(sessionId)).emit("connect:session:ended", {
          sessionId,
          endedAt: session.endedAt,
          by: String(socket.data.user._id || socket.data.user.id),
          at: new Date().toISOString(),
        });
        ack?.({ ok: true, credentialsExpired: true, waitingRoomClosed: true });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Unable to end session." }); }
    });

    // Teacher/host starts the session: broadcast so participants discover it is live without refreshing.
    socket.on("connect:session:start", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        if (!isHostRole(role)) throw new Error("Not authorized to start this session.");
        const session = await VirtualSession.findById(sessionId);
        if (!session) throw new Error("Session not found.");
        if (session.status === "LIVE") {
          throw new Error("This session is already live.");
        }
        if (["CANCELLED", "EXPIRED", "ENDED", "COMPLETED"].includes(session.status)) {
          throw new Error("This session cannot be started.");
        }
        session.status = "LIVE";
        session.startedAt = session.startedAt || new Date();
        session.audit.push({ action: "SESSION_STARTED", actor: socket.data.user._id || socket.data.user.id });
        await session.save();
        await logAudit({ userId: socket.data.user._id || socket.data.user.id, action: "CONNECT_SESSION_STARTED", module: "connect", resource: "virtual_session", resourceId: String(session._id) });
        nsp.to(roomChannel(sessionId)).emit("connect:session:started", {
          sessionId,
          startedAt: session.startedAt,
          by: String(socket.data.user._id || socket.data.user.id),
          at: new Date().toISOString(),
        });
        ack?.({ ok: true, status: "LIVE" });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Unable to start session." }); }
    });

    socket.on("connect:board:stroke", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        const stroke = payload.stroke;
        if (!stroke?.id) throw new Error("Stroke is required.");
        nsp.to(roomChannel(sessionId)).emit("connect:board:stroke", {
          sessionId,
          page: Number.isInteger(payload.page) ? payload.page : 0,
          stroke: { ...stroke, by: String(user._id || user.id), role },
          at: new Date().toISOString(),
        });
        ack?.({ ok: true });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Board update denied." }); }
    });

    socket.on("connect:board:clear", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        if (!isHostRole(role)) throw new Error("Not authorized to clear the board.");
        nsp.to(roomChannel(sessionId)).emit("connect:board:clear", {
          sessionId,
          page: Number.isInteger(payload.page) ? payload.page : null,
          by: String(user._id || user.id),
          at: new Date().toISOString(),
        });
        ack?.({ ok: true });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Board clear denied." }); }
    });

    socket.on("connect:board:page", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        if (!isHostRole(role)) throw new Error("Not authorized to manage pages.");
        nsp.to(roomChannel(sessionId)).emit("connect:board:page", {
          sessionId,
          action: payload.action,
          page: Number.isInteger(payload.page) ? payload.page : 0,
          pageCount: Number.isInteger(payload.pageCount) ? payload.pageCount : null,
          by: String(user._id || user.id),
          at: new Date().toISOString(),
        });
        ack?.({ ok: true });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Board page change denied." }); }
    });

    socket.on("connect:presentation:nav", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        if (!isHostRole(role)) throw new Error("Not authorized to control presentation.");
        nsp.to(roomChannel(sessionId)).emit("connect:presentation:nav", {
          sessionId,
          page: Number(payload.page) || 1,
          by: String(user._id || user.id),
          at: new Date().toISOString(),
        });
        ack?.({ ok: true });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Presentation control denied." }); }
    });

    socket.on("connect:reaction", async (payload = {}, ack) => {
      try {
        const { sessionId } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        const emoji = safeText(payload.emoji, 8);
        const allowed = new Set(["👍", "👏", "❤️", "🎉", "❓", "✋"]);
        if (!allowed.has(emoji)) throw new Error("Invalid reaction.");
        nsp.to(roomChannel(sessionId)).emit("connect:reaction", {
          sessionId,
          userId: String(user._id || user.id),
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Participant",
          emoji,
          at: new Date().toISOString(),
        });
        ack?.({ ok: true });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Reaction denied." }); }
    });

    socket.on("connect:board:undo", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        if (!isHostRole(role)) throw new Error("Not authorized to undo.");
        nsp.to(roomChannel(sessionId)).emit("connect:board:undo", {
          sessionId,
          page: Number.isInteger(payload.page) ? payload.page : 0,
          opId: payload.opId || null,
          by: String(user._id || user.id),
          at: new Date().toISOString(),
        });
        ack?.({ ok: true });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Undo denied." }); }
    });

    // Screen-sharing coordination (trusted signaling). Media tracks remain LiveKit; server validates role/approval/conflicts.
    socket.on("connect:screen:state", async (payload = {}, ack) => {
      try {
        const { sessionId } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        ack?.({ ok: true, ...screenShareSnapshot(sessionId) });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Unable to load screen-sharing state." }); }
    });

    socket.on("connect:screen:request", async (payload = {}, ack) => {
      try {
        const userId = String(user._id || user.id);
        if (!screenShareRateLimit(`req:${userId}:${payload.sessionId}`)) throw new Error("Please wait before sending another screen-sharing request.");
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        if (isHostRole(role)) throw new Error("Teachers can start screen sharing directly.");
        const state = getScreenShareSession(sessionId);
        if (state.presenter) throw new Error(state.presenter.role && isHostRole(state.presenter.role) ? "The teacher is already presenting." : "Another participant is already presenting. Wait for them to stop sharing.");
        for (const req of state.pending.values()) {
          if (String(req.userId) === userId) return ack?.({ ok: true, requestId: req.requestId, pending: true, ...screenShareSnapshot(sessionId) });
        }
        const requestId = `ssr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const req = { requestId, sessionId, userId, name: displayName(user), role, requestedAt: new Date().toISOString() };
        state.pending.set(requestId, req);
        nsp.to(roomChannel(sessionId)).emit("connect:screen:request", { sessionId, request: req, at: req.requestedAt });
        ack?.({ ok: true, requestId, pending: true });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Screen-sharing request denied." }); }
    });

    socket.on("connect:screen:cancel-request", async (payload = {}, ack) => {
      try {
        const userId = String(user._id || user.id);
        const { sessionId } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        const state = getScreenShareSession(sessionId);
        const requestId = safeText(payload.requestId, 80);
        let found = requestId ? state.pending.get(requestId) : null;
        if (!found) found = Array.from(state.pending.values()).find((r) => String(r.userId) === userId) || null;
        if (!found) return ack?.({ ok: true, cancelled: false });
        if (String(found.userId) !== userId && !isHostRole((socket.data.sessionRoles||{})[sessionId])) throw new Error("Not authorized to cancel this request.");
        state.pending.delete(found.requestId);
        nsp.to(roomChannel(sessionId)).emit("connect:screen:request-cancelled", { sessionId, requestId: found.requestId, userId: found.userId, at: new Date().toISOString() });
        ack?.({ ok: true, cancelled: true, requestId: found.requestId });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Unable to cancel request." }); }
    });

    socket.on("connect:screen:approve", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        if (!isHostRole(role)) throw new Error("Not authorized to approve screen sharing.");
        const state = getScreenShareSession(sessionId);
        if (state.presenter && isHostRole(state.presenter.role)) throw new Error("Stop the active teacher presentation before approving another presenter.");
        const requestId = safeText(payload.requestId, 80);
        const req = requestId ? state.pending.get(requestId) : null;
        if (!req) throw new Error("Screen-sharing request not found or already handled.");
        state.pending.delete(requestId);
        const approval = { sessionId, requestId, userId: req.userId, name: req.name, role: req.role, approvedBy: String(user._id || user.id), approvedByName: displayName(user), at: new Date().toISOString() };
        screenShareGrants.set(screenGrantKey(sessionId, req.userId), { requestId, expiresAt: Date.now() + 2 * 60 * 1000, grantedBy: String(user._id || user.id), name: req.name });
        nsp.to(roomChannel(sessionId)).emit("connect:screen:approved", approval);
        ack?.({ ok: true, approval });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Approval denied." }); }
    });

    socket.on("connect:screen:reject", async (payload = {}, ack) => {
      try {
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        if (!isHostRole(role)) throw new Error("Not authorized to reject screen sharing.");
        const state = getScreenShareSession(sessionId);
        const requestId = safeText(payload.requestId, 80);
        const req = requestId ? state.pending.get(requestId) : null;
        if (!req) throw new Error("Screen-sharing request not found or already handled.");
        state.pending.delete(requestId);
        const rejection = { sessionId, requestId, userId: req.userId, name: req.name, rejectedBy: String(user._id || user.id), rejectedByName: displayName(user), at: new Date().toISOString() };
        nsp.to(roomChannel(sessionId)).emit("connect:screen:rejected", rejection);
        ack?.({ ok: true });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Rejection denied." }); }
    });

    socket.on("connect:screen:start", async (payload = {}, ack) => {
      try {
        const userId = String(user._id || user.id);
        if (!screenShareRateLimit(`start:${userId}:${payload.sessionId}`)) throw new Error("Please wait before changing screen sharing.");
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        const state = getScreenShareSession(sessionId);
        const host = isHostRole(role);
        const name = displayName(user);
        if (state.presenter) {
          if (String(state.presenter.userId) === userId) return ack?.({ ok: true, ...screenShareSnapshot(sessionId) });
          if (host && isHostRole(state.presenter.role)) throw new Error("You are already presenting.");
          if (host) throw new Error("Another participant is presenting. Stop their presentation first.");
          throw new Error(isHostRole(state.presenter.role) ? "The teacher is already presenting." : "Another participant is already presenting.");
        }
        if (!host) {
          const gk = screenGrantKey(sessionId, userId);
          const grant = screenShareGrants.get(gk);
          if (!grant || grant.expiresAt < Date.now()) { screenShareGrants.delete(gk); throw new Error("Teacher approval is required before sharing your screen."); }
          screenShareGrants.delete(gk);
        } else {
          // Teacher priority: clear pending student requests; active non-teacher presenter already blocked above.
          state.pending.clear();
        }
        state.presenter = { userId, name, role, startedAt: new Date().toISOString() };
        const snap = screenShareSnapshot(sessionId);
        nsp.to(roomChannel(sessionId)).emit("connect:screen:changed", { ...snap, at: new Date().toISOString(), reason: host ? "teacher_started" : "student_started" });
        ack?.({ ok: true, ...snap });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Unable to start screen sharing." }); }
    });

    socket.on("connect:screen:stop", async (payload = {}, ack) => {
      try {
        const userId = String(user._id || user.id);
        const { sessionId, role } = await authorizeJoinedSession(socket, payload.sessionId, payload);
        const state = getScreenShareSession(sessionId);
        if (!state.presenter) return ack?.({ ok: true, stopped: false, ...screenShareSnapshot(sessionId) });
        const host = isHostRole(role);
        if (!host && String(state.presenter.userId) !== userId) throw new Error("Not authorized to stop this presentation.");
        state.presenter = null;
        const snap = screenShareSnapshot(sessionId);
        nsp.to(roomChannel(sessionId)).emit("connect:screen:changed", { ...snap, at: new Date().toISOString(), reason: host && String(payload.targetUserId||"") && String(payload.targetUserId)!==userId ? "stopped_by_teacher" : "stopped" });
        ack?.({ ok: true, stopped: true, ...snap });
      } catch (err) { ack?.({ ok: false, error: err?.message || "Unable to stop screen sharing." }); }
    });

    socket.on("disconnect", async () => {
      const joined = socket.data.joinedSessions ? Array.from(socket.data.joinedSessions) : [];
      for (const sessionId of joined) {
        try { await clearPresenterIfDisconnected(io, sessionId, String(user._id || user.id)); } catch {}
        socket.to(roomChannel(sessionId)).emit("connect:participant:left", {
          sessionId,
          userId: String(user._id || user.id),
          name: displayName(user),
          at: new Date().toISOString(),
          reason: "disconnect",
        });
        await emitParticipants(io, sessionId);
      }
    });
  });

  return { io, nsp };
}
