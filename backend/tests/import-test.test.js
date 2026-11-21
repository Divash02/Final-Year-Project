import test from "node:test";
import assert from "node:assert/strict";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/collegeos_internship_api_test";
process.env.JWT_SECRET = "test-secret";
process.env.INSTITUTION_EMAIL_DOMAIN = "collegeos.test";
process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD = "Bootstrap@123";

test("import test", async () => {
  try {
    await import("../src/config/environment.js");
    console.error("OK: environment");
  } catch (e) {
    console.error("FAIL: environment:", e.message);
  }
  
  try {
    await import("../src/middleware/requestContext.js");
    console.error("OK: requestContext");
  } catch (e) {
    console.error("FAIL: requestContext:", e.message);
  }
  
  try {
    await import("../src/middleware/securityHeaders.js");
    console.error("OK: securityHeaders");
  } catch (e) {
    console.error("FAIL: securityHeaders:", e.message);
  }
  
  try {
    await import("../src/middleware/rateLimit.js");
    console.error("OK: rateLimit");
  } catch (e) {
    console.error("FAIL: rateLimit:", e.message);
  }
  
  try {
    await import("../src/utils/apiError.js");
    console.error("OK: apiError");
  } catch (e) {
    console.error("FAIL: apiError:", e.message);
  }
  
  try {
    await import("../src/utils/logger.js");
    console.error("OK: logger");
  } catch (e) {
    console.error("FAIL: logger:", e.message);
  }
  
  try {
    await import("../src/utils/token.js");
    console.error("OK: token");
  } catch (e) {
    console.error("FAIL: token:", e.message);
  }
  
  try {
    await import("../src/models/index.js");
    console.error("OK: models");
  } catch (e) {
    console.error("FAIL: models:", e.message);
  }
  
  try {
    await import("./routes/index.js");
    console.error("OK: routes");
  } catch (e) {
    console.error("FAIL: routes:", e.message);
  }
});
