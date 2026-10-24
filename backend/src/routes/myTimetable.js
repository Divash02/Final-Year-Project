import { Timetable } from "../models/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { route, notFound, validationError } from "../utils/apiError.js";
import { optionalEnum, optionalString, requireObjectId } from "../utils/validate.js";
import { hasPermission } from "../permissions/catalog.js";
import { getUserRoles } from "../db.js";
import {
  buildMyTimetable,
  institutionDate,
  reportTimetableConflict,
} from "../services/myTimetable.js";

/**
 * My Timetable.
 *
 * The personal schedule: today's classes, the week, the month, the conflicts
 * present in the published timetable and the changes made to it. It reads the same
 * `Timetable` documents the academic office publishes and the conflict engine
 * already validates, so this surface can never disagree with the official record.
 *
 * Resolution is per caller. A teacher sees the sessions they deliver; a student
 * sees the sessions their own cohort is scheduled into, matched from their real
 * enrolment. Nobody can widen their own scope with a query parameter.
 */
export function registerMyTimetableRoutes(app) {
  app.get(
    "/api/my-timetable",
    requireAuth,
    requirePermission("timetable.view"),
    route(async (req, res) => {
      const view = optionalEnum(req.query.view, "View", ["today", "day", "week", "month"]) || "today";
      const anchor =
        optionalString(req.query.anchor, "Anchor date", { max: 10 }) ||
        (await institutionDate());

      res.json(await buildMyTimetable(req.user, { view, anchor }));
    }),
  );

  /**
   * Timetable change history for the caller's own schedule.
   *
   * Returned separately so a teacher can review what moved without waiting for a
   * calendar to render, and so the history is readable on a phone where the week
   * grid is a chronological list.
   */
  app.get(
    "/api/my-timetable/changes",
    requireAuth,
    requirePermission("timetable.view"),
    route(async (req, res) => {
      const timetable = await buildMyTimetable(req.user, { view: "week" });
      res.json({
        changes: timetable.changes,
        count: timetable.changes.length,
        timezone: timetable.timezone,
      });
    }),
  );

  /**
   * Reports a timetable conflict to the academic office.
   *
   * Deliberately a report and not a fix. Resolving a clash moves a real class for
   * real students, so that stays with the roles that hold `timetable.manage`; a
   * teacher's authority here is to make the clash visible and say what happened.
   */
  app.post(
    "/api/my-timetable/conflicts/report",
    requireAuth,
    requirePermission("timetable.view"),
    route(async (req, res) => {
      const body = req.body || {};
      const sessionId = requireObjectId(body.sessionId, "Class session");
      const otherSessionId = body.otherSessionId
        ? requireObjectId(body.otherSessionId, "Conflicting class")
        : null;
      const note = optionalString(body.note, "Note", { max: 1000 }) || "";

      const session = await Timetable.findById(sessionId).select("facultyUser");
      if (!session) throw notFound("Class session not found.");

      const isOwner = String(session.facultyUser) === String(req.user._id || req.user.id);
      if (!isOwner && !hasPermission(getUserRoles(req.user), "timetable.manage")) {
        throw validationError(
          "You can only report a conflict on a class assigned to you.",
          [{ field: "sessionId", message: "Choose one of your own classes." }],
        );
      }

      const result = await reportTimetableConflict(req.user, {
        sessionId,
        otherSessionId,
        note,
      });

      res.json({
        success: true,
        recipients: result.recipients,
        message:
          result.recipients > 0
            ? `Reported to ${result.recipients} academic administrator(s) who can resolve timetable assignments.`
            : "No academic administrator currently holds timetable resolution rights.",
      });
    }),
  );
}