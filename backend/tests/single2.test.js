import test from "node:test";
import assert from "node:assert/strict";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/collegeos_internship_api_test";
process.env.JWT_SECRET = "test-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";

test("minimal test", async () => {
  const { connectDatabase } = await import("../src/config/database.js");
  await connectDatabase();
  
  const mongoose = await import("mongoose");
  await mongoose.default.connection.dropDatabase();
  
  const { initializeServerState } = await import("../src/db.js");
  await initializeServerState();
  
  const { createApp } = await import("../src/app.js");
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  
  const res = await fetch(baseUrl + "/api/internship/opportunities");
  assert.equal(res.status, 401);
  
  server.close();
  await mongoose.default.disconnect();
});
