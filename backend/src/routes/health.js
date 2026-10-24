
export function registerHealthRoutes(app) {
app.get("/api/health", (_, res) => {
  res.json({
    ok: true,
    service: "CollegeOS API",
    time: new Date().toISOString(),
  });
});
}
