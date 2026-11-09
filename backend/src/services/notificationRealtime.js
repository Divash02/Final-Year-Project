import { Server as SocketIOServer } from "socket.io";
import { verifyToken, classifySession, getUserById, getUserRoles, touchSession } from "../db.js";
import { getSessionPolicy } from "../config/sessionSecurity.js";

function parseAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeOrigin(origin) {
  if (!origin) return null;
  try {
    return new URL(origin).origin;
  } catch {
    return origin;
  }
}

function originAllowed(origin) {
  if (!origin) return true;
  const allowed = parseAllowedOrigins();
  if (!allowed.length) return true;
  const normalized = normalizeOrigin(origin);
  return allowed.some((a) => normalizeOrigin(a) === normalized);
}

async function authenticateSocket(socket) {
  const authToken = socket.handshake?.auth?.token;
  const header = socket.handshake?.headers?.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = typeof authToken === "string" && authToken ? authToken : bearer;
  if (!token) throw new Error("Authentication required.");

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new Error("Invalid or expired session.");
  }
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
  await touchSession(
    session._id,
    { userAgent: socket.handshake?.headers?.["user-agent"], ipAddress: socket.handshake?.address },
    session,
  );
  return { user };
}

let notificationNamespace = null;

export function initializeNotificationRealtime(server, existingIo = null) {
  const io =
    existingIo ||
    new SocketIOServer(server, {
      cors: {
        origin(origin, callback) {
          if (originAllowed(origin)) return callback(null, true);
          return callback(new Error("Not allowed by CORS policy"));
        },
        credentials: true,
        methods: ["GET", "POST"],
      },
    });

  const nsp = io.of("/notifications");
  notificationNamespace = nsp;

  nsp.use(async (socket, next) => {
    try {
      const auth = await authenticateSocket(socket);
      socket.data.user = auth.user;
      next();
    } catch (err) {
      next(err);
    }
  });

  nsp.on("connection", (socket) => {
    const userId = String(socket.data.user?._id || socket.data.user?.id || "");
    if (userId) socket.join(`user:${userId}`);
    socket.on("disconnect", () => {});
  });

  return { io, nsp };
}

export function emitNotificationToUser(userId, payload) {
  if (!notificationNamespace || !userId) return;
  notificationNamespace.to(`user:${String(userId)}`).emit("notification:new", payload);
}

export function emitUnreadCountToUser(userId, unreadCount) {
  if (!notificationNamespace || !userId) return;
  notificationNamespace.to(`user:${String(userId)}`).emit("notification:unread", { unreadCount });
}
