import assert from "node:assert/strict";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/collegeos_internship_api_test";
process.env.JWT_SECRET = "test-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";

let baseUrl;

async function main() {
  const { connectDatabase } = await import("../src/config/database.js");
  await connectDatabase();
  await mongoose.connection.dropDatabase();
  
  const { initializeServerState } = await import("../src/db.js");
  await initializeServerState();
  
  const { createApp } = await import("../src/app.js");
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log("baseUrl:", baseUrl);
  
  try {
    const res = await fetch(baseUrl + "/api/internship/opportunities");
    console.log("status:", res.status);
    const text = await res.text();
    console.log("body:", text);
    assert.equal(res.status, 401);
    console.log("PASS");
  } catch (err) {
    console.error("FAIL:", err.message);
  }
  
  server.close();
  await mongoose.disconnect();
}

import mongoose from "mongoose";
main().catch(e => console.error("Main error:", e));
