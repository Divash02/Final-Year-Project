import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { writeFileSync } from "node:fs";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/collegeos_internship_api_test";
process.env.JWT_SECRET = "test-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";

let baseUrl, server;

test("single unauthenticated test", async () => {
  const log = [];
  const write = (msg) => log.push(msg);
  
  try {
    const { connectDatabase } = await import("../src/config/database.js");
    await connectDatabase();
    await mongoose.connection.dropDatabase();
    write("DB connected");
    
    const { initializeServerState } = await import("../src/db.js");
    await initializeServerState();
    write("Server state initialized");
    
    const { createApp } = await import("../src/app.js");
    server = createApp().listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    write("Server at " + baseUrl);
    
    const res = await fetch(baseUrl + "/api/internship/opportunities");
    write("STATUS: " + res.status);
    const text = await res.text();
    write("BODY: " + text);
    
    assert.equal(res.status, 401);
    write("ASSERTION PASSED");
  } catch (err) {
    write("ERROR: " + err.message);
    write("STACK: " + err.stack);
  }
  
  try {
    server.close();
    await mongoose.disconnect();
    write("CLEANUP DONE");
  } catch (e) {
    write("CLEANUP ERROR: " + e.message);
  }
  
  writeFileSync("C:\\Users\\USER\\Documents\\collegeos-—-multi-tenant-education-operating-system\\backend\\test-output.txt", log.join("\n"));
});
