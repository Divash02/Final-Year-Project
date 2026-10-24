import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeServerState } from "./db.js";
import { createApp } from "./app.js";
import {
  startAcademicScheduler,
  stopAcademicScheduler,
} from "./services/lms/scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
fs.mkdirSync(path.resolve(__dirname, "../uploads"), { recursive: true });
initializeServerState();

const app = createApp();
const server = app.listen(PORT, () => {
  console.log("CollegeOS backend running on http://localhost:" + PORT);
});

// Scheduled weeks, materials and quizzes are delivered by a server-side sweep.
// It is idempotent and deliberately not the only enforcement — every read
// re-derives the same state from the clock — so a missed pass can never leave a
// window open or let a student submit late.
startAcademicScheduler();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopAcademicScheduler();
    server.close(() => process.exit(0));
  });
}
