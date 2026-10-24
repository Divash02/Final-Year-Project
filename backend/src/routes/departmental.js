import { requireAuth, requirePermission } from "../middleware/auth.js";

/**
 * Departmental route registration.
 *
 * Every domain that owns its write routes (finance, admissions, examinations)
 * registers them directly in its own route module with full authorisation,
 * validation, audit and persistence. This file therefore no longer re-registers
 * those paths: doing so would shadow the real handlers with 501 stubs and
 * silently break every finance, admissions and examinations write operation.
 *
 * Kept as a module so future genuinely-unimplemented departmental write
 * workflows have a single place to declare themselves, with the same
 * requireAuth + requirePermission shape.
 */
export function registerDepartmentalRoutes(app) {
  // Intentionally empty: the departmental write surfaces that exist today are
  // implemented and registered by their owning route modules.
  void app;
}