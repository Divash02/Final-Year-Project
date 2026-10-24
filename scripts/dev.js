import "dotenv/config";
import { spawn, execFileSync } from "node:child_process";
import { createServer, createConnection } from "node:net";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const processes = [];

async function availablePort(preferredPort) {
  const listen = (port) =>
    new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", (error) => {
        server.close();
        reject(error);
      });
      server.listen(port, () => {
        const address = server.address();
        const selectedPort = typeof address === "object" ? address.port : port;
        server.close((error) =>
          error ? reject(error) : resolve(selectedPort),
        );
      });
    });
  try {
    return await listen(preferredPort);
  } catch (error) {
    if (error.code !== "EADDRINUSE") throw error;
    return listen(0);
  }
}

/** Returns true if something is already accepting connections on 127.0.0.1:27017 */
function isMongoRunning() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 27017 });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

/** Starts mongod if not already running. Uses the standard Windows install path. */
async function ensureMongoDB() {
  if (await isMongoRunning()) return; // already up

  const mongodPaths = [
    "C:\\Program Files\\MongoDB\\Server\\9.0\\bin\\mongod.exe",
    "C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe",
    "C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe",
    "mongod", // in PATH
  ];

  const mongodBin = mongodPaths.find((p) => {
    try { return p === "mongod" ? !!execFileSync("where", ["mongod"], { stdio: "pipe" }) : existsSync(p); }
    catch { return false; }
  });

  if (!mongodBin) {
    console.warn("⚠  mongod not found. Start MongoDB manually before running the backend.");
    return;
  }

  const dataDir = path.join(projectRoot, ".mongodb-data");
  mkdirSync(dataDir, { recursive: true });

  console.log("Starting local MongoDB (mongod)...");
  const mongod = spawn(mongodBin, ["--dbpath", dataDir, "--port", "27017", "--bind_ip", "127.0.0.1"], {
    detached: false,
    stdio: ["ignore", "ignore", "ignore"],
  });
  processes.push(mongod);

  // Wait up to 8 seconds for it to accept connections
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isMongoRunning()) {
      console.log("MongoDB ready.");
      return;
    }
  }
  console.warn("⚠  MongoDB did not start in time — backend may fail to connect.");
}

await ensureMongoDB();

const requestedApiPort = Number(process.env.PORT || 4000);
const apiPort = await availablePort(requestedApiPort);
if (apiPort !== requestedApiPort) {
  console.log(
    `API port ${requestedApiPort} is occupied; starting this checkout on ${apiPort}.`,
  );
}
const requestedFrontendPort = Number(process.env.VITE_PORT || 3000);
const frontendPort = await availablePort(requestedFrontendPort);
if (frontendPort !== requestedFrontendPort) {
  console.log(
    `Frontend port ${requestedFrontendPort} is occupied; starting this checkout on ${frontendPort}.`,
  );
}
const apiBase = `http://localhost:${apiPort}/api`;

const NODE_OPTIONS = "--max-old-space-size=4096";

processes.push(
  spawn(process.execPath, [path.join(projectRoot, "backend/src/server.js")], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(apiPort), NODE_OPTIONS },
    stdio: "inherit",
  }),
);

processes.push(
  spawn(
    process.execPath,
    [
      path.join(projectRoot, "node_modules/vite/bin/vite.js"),
      "frontend",
      "--config",
      path.join(projectRoot, "frontend/vite.config.ts"),
      `--port=${frontendPort}`,
      "--host=0.0.0.0",
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, VITE_API_BASE_URL: apiBase, NODE_OPTIONS },
      stdio: "inherit",
    },
  ),
);

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of processes) {
    if (child.exitCode === null) child.kill();
  }
}

for (const child of processes) {
  child.on("error", (error) => {
    console.error("Failed to start CollegeOS development services:", error);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
