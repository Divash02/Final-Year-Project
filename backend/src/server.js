import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load backend/.env as supplementary config (root .env is loaded by dotenv/config above).
const backendEnvPath = path.resolve(__dirname, "../.env");
const backendEnvResult = dotenv.config({ path: backendEnvPath, override: false });

import { initializeServerState } from "./db.js";
import { disconnectDatabase, getConnectionHealth } from "./config/database.js";
import { env } from "./config/environment.js";
import { createApp } from "./app.js";
import {
  startAcademicScheduler,
  stopAcademicScheduler,
} from "./services/lms/scheduler.js";
import {
  startWorkflowScheduler,
  stopWorkflowScheduler,
} from "./services/workflowScheduler.js";
import {
  startAIJobWorker,
  stopAIJobWorker,
} from "./services/ai/aiJobService.js";
import "./services/ai/aiJobHandlers.js";
import { Server as SocketIOServer } from "socket.io";
import { initializeConnectRealtime } from "./services/connectRealtime.js";
import { initializeNotificationRealtime } from "./services/notificationRealtime.js";
import { getLiveKitStartupDiagnostics } from "./services/connectLiveKitService.js";

function logSafeLiveKitDiagnostics() {
  try {
    const diag = getLiveKitStartupDiagnostics();
    const backendEnvFound = !backendEnvResult?.error;
    // Never log secrets, full API keys, or tokens.
    console.log(
      "[Connect/LiveKit] startup diagnostics " +
        JSON.stringify({
          backendEnv: { path: backendEnvPath, loaded: backendEnvFound },
          envPresent: diag.env,
          project: diag.project,
          tokenGeneration: diag.tokenGeneration,
        }),
    );
    if (!diag.project.configured) {
      console.warn(
        "[Connect/LiveKit] not fully configured; LiveKit token issuance will fail until LIVEKIT_URL, LIVEKIT_API_KEY, and a valid LIVEKIT_API_SECRET are set for the same LiveKit project and the backend is restarted.",
      );
    }
  } catch (err) {
    console.warn("[Connect/LiveKit] startup diagnostics unavailable:", err?.message || err);
  }
}

logSafeLiveKitDiagnostics();

const PORT = Number(process.env.PORT || env.port);
fs.mkdirSync(path.resolve(__dirname, "../uploads"), { recursive: true });
await initializeServerState();

const health = getConnectionHealth();
console.log(
  `[Database] ${health.state}${health.database ? ` (${health.database})` : ""}`,
);

const app = createApp();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  path: "/socket.io",
  cors: {
    origin(origin, callback) {
      const allowed = (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!origin || !allowed.length) return callback(null, true);
      try {
        const normalized = new URL(origin).origin;
        if (allowed.some((a) => new URL(a).origin === normalized)) return callback(null, true);
      } catch {}
      return callback(new Error("Not allowed by CORS policy"));
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
});
app.set("io", io);
initializeConnectRealtime(server, io);
initializeNotificationRealtime(server, io);

server.listen(PORT, () => {
  console.log("CollegeOS backend running on http://localhost:" + PORT);
});

// Scheduled weeks, materials and quizzes are delivered by a server-side sweep.
// It is idempotent and deliberately not the only enforcement — every read
// re-derives the same state from the clock — so a missed pass can never leave a
// window open or let a student submit late.
startAcademicScheduler();
startWorkflowScheduler();
// Heavy AI work runs in the background worker, not on the request path.
startAIJobWorker();

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully...`);
  stopAcademicScheduler();
  stopWorkflowScheduler();
  await stopAIJobWorker();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase().catch((error) => {
    console.error("Error during database disconnect:", error.message);
  });
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
