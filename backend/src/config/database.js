import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/collegeos";

let isConnected = false;

export async function connectDatabase() {
  if (isConnected) {
    return mongoose.connection;
  }

  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 3000;

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

export { mongoose };
