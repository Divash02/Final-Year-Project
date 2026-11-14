import mongoose from "mongoose";
import { env } from "./environment.js";

/**
 * MongoDB connection lifecycle.
 *
 * This module owns the connection only: URI resolution, connect/retry,
 * health state and graceful disconnect. It imports no models, no identity or
 * role logic, and no Express request handling, so any layer can depend on it
 * without creating a cycle.
 */

const MONGODB_URI = env.mongoUri;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

let isConnected = false;

export async function connectDatabase() {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      mongoose.set("strictQuery", false);
      const conn = await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      isConnected = true;
      console.log("MongoDB connected successfully");
      return conn.connection;
    } catch (error) {
      console.error(
        `MongoDB connection failed (attempt ${attempt}/${MAX_RETRIES}):`,
        error.message,
      );
      if (attempt < MAX_RETRIES) {
        console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        console.error("MongoDB connection failed after all retries. Backend API will not function until MongoDB is available.");
        throw error;
      }
    }
  }
}

export function getDbConnection() {
  return mongoose.connection;
}

/**
 * Connection health for the `/api/health` endpoint and operational probes.
 * `readyState` follows the driver: 0 disconnected, 1 connected, 2 connecting,
 * 3 disconnecting.
 */
export function getConnectionHealth() {
  const readyState = mongoose.connection.readyState;
  const states = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  return {
    readyState,
    state: states[readyState] || "unknown",
    ok: readyState === 1,
    database: mongoose.connection.name || null,
  };
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) {
    isConnected = false;
    return;
  }
  await mongoose.connection.close();
  isConnected = false;
}

export { mongoose };