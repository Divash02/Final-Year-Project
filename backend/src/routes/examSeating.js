import { Room } from "../models/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { logAudit } from "../db.js";
import {
  EXAM_VENUES,
  seedExamVenues,
  listVenueStructure,
} from "../services/examVenueService.js";
import {
  generateSeatingPlan,
  regenerateSeatingPlan,
  resetSeatingPlanToAlphabetical,
  shuffleSeatingPlan,
  changeSeatingRoom,
  publishSeatingPlan,
  scheduleSeatingPublication,
  cancelSeatingPlan,
  runScheduledSeatingPublication,
  getStudentSeating,
  listMySeating,
  getSeatingPlanDetail,
  listSeatingPlans,
  previewEligibleStudents,
  findSeatingConflicts,
} from "../services/examSeatingService.js";
import {
  calculateExamDuration,
  buildKathmanduDateTime,
} from "../services/nepaliDateHelper.js";

/**
 * Exam venue & automatic seating management routes.
 *
 * Venue management reuses the institutional room registry
 * (exam.manageRooms). Seating plan operations are restricted to
 * the Exam Officer role and above (exam.manageSeating). Students
 * can only ever read their own published seating assignment.
 */
export function registerExamSeatingRoutes(app) {
  /* ------------------------- Venues ------------------------- */

  /**
   * GET /api/exams/venues
   * Lists the venue registry grouped by block/floor. Seeds the
   * standard institutional venues on first access so the registry
   * is always populated, without ever duplicating or overwriting.
   */
  app.get(
    "/api/exams/venues",
    requireAuth,
    requirePermission(["exam.view", "exams.view", "exam.manageRooms"]),
    async (req, res) => {
      try {
        // Seed the venue registry when its flagship room is absent.
        // seedExamVenues itself is idempotent, so this never
        // duplicates or overwrites existing venue records.
        const hasVenueRegistry = await Room.findOne({
          building: "Block A",
          roomNumber: "Kinabalu",
        });
        if (!hasVenueRegistry) {
          await seedExamVenues();
        }
        const venues = await listVenueStructure();
        const blocks = [...new Set(venues.map((v) => v.block))].sort();
        const structure = blocks.map((block) => ({
          block,
          floors: [...new Set(venues.filter((v) => v.block === block).map((v) => v.floor))]
            .filter(Boolean)
            .sort()
            .map((floor) => ({
              floor,
              rooms: venues.filter((v) => v.block === block && v.floor === floor),
            })),
        }));
        res.json({ venues, structure, seed: EXAM_VENUES });
      } catch (err) {
        console.error("Load exam venues error:", err);
        res.status(500).json({ error: "Failed to load examination venues." });
      }
    }
  );

  /**
   * POST /api/exams/venues/seed
   * Explicitly (re)runs the idempotent venue seeding process.
   */
  app.post(
    "/api/exams/venues/seed",
    requireAuth,
    requirePermission(["exam.manageRooms"]),
    async (req, res) => {
      try {
        await seedExamVenues({ actorUserId: req.user._id });
        const venues = await listVenueStructure();
        res.json({
          success: true,
          message: "Venue registry synchronized. Missing venues added; existing venue records preserved.",
          venues,
        });
      } catch (err) {
        console.error("Seed exam venues error:", err);
        res.status(500).json({ error: "Failed to seed examination venues." });
      }
    }
  );

  /**
   * POST /api/exams/venues
   * Registers a new examination venue.
   */
  app.post(
    "/api/exams/venues",
    requireAuth,
    requirePermission(["exam.manageRooms"]),
    async (req, res) => {
      try {
        const {
          block,
          building,
          floor,
          roomName,
          roomNumber,
          name,
          capacity,
          isActive = true,
          facilities = [],
        } = req.body || {};

        const venueBlock = String(block || building || "").trim();
        const venueRoom = String(roomName || roomNumber || "").trim();
        const cap = Number(capacity);
        if (!venueBlock) {
          return res.status(400).json({ error: "Venue block / building is required." });
        }
        if (!venueRoom) {
          return res.status(400).json({ error: "Venue room name is required." });
        }
        if (!Number.isFinite(cap) || cap <= 0) {
          return res.status(400).json({ error: "A valid positive seat capacity is required." });
        }

        const existing = await Room.findOne({
          building: venueBlock,
          roomNumber: venueRoom,
          campus: "Main Campus",
        });
        if (existing) {
          return res.status(409).json({
            error: `Venue "${venueBlock} · ${venueRoom}" already exists. Update it instead of creating a duplicate.`,
            code: "VENUE_EXISTS",
          });
        }

        const displayName = name || `${venueBlock} · ${venueRoom}`;
        const room = await Room.create({
          building: venueBlock,
          block: venueBlock,
          floor: String(floor || "").trim(),
          roomNumber: venueRoom,
          name: displayName,
          capacity: cap,
          campus: "Main Campus",
          facilities: Array.isArray(facilities) ? facilities : [],
          isActive: Boolean(isActive),
        });

        await logAudit({
          userId: req.user._id,
          action: "EXAM_VENUE_CREATED",
          module: "examinations",
          resource: "exam_venue",
          resourceId: room._id.toString(),
          newValue: { block: venueBlock, floor: room.floor, roomName: venueRoom, capacity: cap, isActive: room.isActive },
          details: `Examination venue created: ${displayName} (${cap} seats).`,
        });

        res.status(201).json({
          success: true,
          venue: {
            id: room._id.toString(),
            _id: room._id.toString(),
            block: room.block,
            building: room.building,
            floor: room.floor,
            roomName: room.roomNumber,
            roomNumber: room.roomNumber,
            name: room.name,
            capacity: room.capacity,
            isActive: room.isActive,
            facilities: room.facilities,
          },
        });
      } catch (err) {
        console.error("Create exam venue error:", err);
        res.status(400).json({ error: err.message || "Failed to create examination venue." });
      }
    }
  );

  /**
   * PATCH /api/exams/venues/:id
   * Updates capacity / active status of a venue.
   */
  app.patch(
    "/api/exams/venues/:id",
    requireAuth,
    requirePermission(["exam.manageRooms"]),
    async (req, res) => {
      try {
        const room = await Room.findById(req.params.id);
        if (!room) {
          return res.status(404).json({ error: "Venue not found." });
        }

        const previous = {
          capacity: room.capacity,
          isActive: room.isActive,
          name: room.name,
          floor: room.floor,
        };

        if (req.body.capacity !== undefined) {
          const cap = Number(req.body.capacity);
          if (!Number.isFinite(cap) || cap <= 0) {
            return res.status(400).json({ error: "A valid positive seat capacity is required." });
          }
          room.capacity = cap;
        }
        if (req.body.isActive !== undefined) {
          room.isActive = Boolean(req.body.isActive);
        }
        if (req.body.name !== undefined) {
          room.name = String(req.body.name).trim() || room.name;
        }
        if (req.body.floor !== undefined) {
          room.floor = String(req.body.floor).trim();
        }

        await room.save();

        await logAudit({
          userId: req.user._id,
          action: "EXAM_VENUE_UPDATED",
          module: "examinations",
          resource: "exam_venue",
          resourceId: room._id.toString(),
          oldValue: previous,
          newValue: { capacity: room.capacity, isActive: room.isActive, name: room.name, floor: room.floor },
          details: `Examination venue updated: ${room.name}.`,
        });

        res.json({
          success: true,
          venue: {
            id: room._id.toString(),
            _id: room._id.toString(),
            block: room.block || room.building,
            building: room.building,
            floor: room.floor,
            roomName: room.roomNumber,
            roomNumber: room.roomNumber,
            name: room.name,
            capacity: room.capacity,
            isActive: room.isActive,
            facilities: room.facilities,
          },
        });
      } catch (err) {
        console.error("Update exam venue error:", err);
        res.status(400).json({ error: err.message || "Failed to update examination venue." });
      }
    }
  );

  /* ---------------------- Eligible students ---------------------- */

  /**
   * GET /api/exams/seating/eligible
   * Resolves the real eligible student set for a semester/scope
   * as one continuous alphabetical list.
   */
  app.get(
    "/api/exams/seating/eligible",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        const {
          program = "BCA",
          semester = 1,
          courseId,
          candidateScope = "SEMESTER_WIDE",
          sectionCode = "ALL",
          batch = "2025",
        } = req.query || {};

        const preview = await previewEligibleStudents({
          program,
          semester,
          courseId,
          candidateScope,
          sectionCode,
          batch,
        });
        res.json(preview);
      } catch (err) {
        console.error("Eligible students preview error:", err);
        res.status(500).json({ error: "Failed to resolve eligible students." });
      }
    }
  );

  /* ---------------------- Seating plan CRUD ---------------------- */

  /**
   * GET /api/exams/seating
   * Lists seating plans for the Exam Department.
   */
  app.get(
    "/api/exams/seating",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        const { status, semester, examId } = req.query || {};
        const plans = await listSeatingPlans({ status, semester, examId });
        res.json({ plans });
      } catch (err) {
        console.error("List seating plans error:", err);
        res.status(500).json({ error: "Failed to load seating plans." });
      }
    }
  );

  /**
   * POST /api/exams/seating
   * Creates a seating plan and generates the automatic
   * alphabetical allocation.
   */
  app.post(
    "/api/exams/seating",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        const payload = req.body || {};
        const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
        if (rooms.length === 0) {
          return res.status(400).json({ error: "At least one examination room must be selected." });
        }

        const { plan, stats, exam } = await generateSeatingPlan(
          {
            examId: payload.examId || null,
            title: payload.title || payload.name,
            examType: payload.examType,
            academicYear: payload.academicYear,
            program: payload.program,
            semester: payload.semester,
            courseId: payload.courseId,
            examDate: payload.examDate,
            startTime: payload.startTime,
            endTime: payload.endTime,
            candidateScope: payload.candidateScope,
            sectionCode: payload.sectionCode,
            batch: payload.batch,
            rooms,
            seatsPerBench: payload.seatsPerBench,
          },
          req.user
        );

        res.status(201).json({
          success: true,
          message:
            stats.requiredAdditionalCapacity > 0
              ? `Seating plan generated with insufficient capacity: ${stats.requiredAdditionalCapacity} additional seat(s) required before publication.`
              : "Automatic alphabetical seating plan generated.",
          planId: plan._id.toString(),
          examId: exam._id.toString(),
          plan: {
            id: plan._id.toString(),
            _id: plan._id.toString(),
            status: plan.status,
            examCode: plan.examCode,
            title: plan.title,
          },
          stats,
        });
      } catch (err) {
        console.error("Generate seating plan error:", err);
        res.status(400).json({ error: err.message || "Failed to generate seating plan." });
      }
    }
  );

  /**
   * GET /api/exams/seating/:planId
   * Full plan detail with per-room seating charts.
   */
  app.get(
    "/api/exams/seating/:planId",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        const detail = await getSeatingPlanDetail(req.params.planId);
        res.json(detail);
      } catch (err) {
        console.error("Load seating plan error:", err);
        res.status(400).json({ error: err.message || "Failed to load seating plan." });
      }
    }
  );

  /**
   * POST /api/exams/seating/:planId/conflicts
   * Checks room availability for the plan's schedule.
   */
  app.post(
    "/api/exams/seating/:planId/conflicts",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        const detail = await getSeatingPlanDetail(req.params.planId);
        const plan = detail.plan;
        const startDateTime = buildKathmanduDateTime(plan.examDate, plan.startTime);
        const endDateTime = buildKathmanduDateTime(plan.examDate, plan.endTime);
        const conflicts = await findSeatingConflicts({
          planId: plan.id,
          examId: plan.exam,
          rooms: detail.roomSummaries.map((r) => ({ name: r.name })),
          startDateTime,
          endDateTime,
        });
        res.json({ conflicts, clear: conflicts.length === 0 });
      } catch (err) {
        console.error("Seating conflict check error:", err);
        res.status(400).json({ error: err.message || "Failed to check room conflicts." });
      }
    }
  );

  /* ---------------------- Plan mutations ---------------------- */

  app.post(
    "/api/exams/seating/:planId/generate",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        const { plan } = await regenerateSeatingPlan(req.params.planId, {}, req.user);
        res.json({ success: true, message: "Alphabetical seating plan (re)generated.", planId: plan._id.toString() });
      } catch (err) {
        console.error("Generate seating error:", err);
        res.status(400).json({ error: err.message || "Failed to generate seating plan." });
      }
    }
  );

  app.post(
    "/api/exams/seating/:planId/reset",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        const { plan } = await resetSeatingPlanToAlphabetical(req.params.planId, {}, req.user);
        res.json({ success: true, message: "Seating plan restored to alphabetical allocation.", planId: plan._id.toString() });
      } catch (err) {
        console.error("Reset seating error:", err);
        res.status(400).json({ error: err.message || "Failed to reset seating plan." });
      }
    }
  );

  app.post(
    "/api/exams/seating/:planId/shuffle",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        const { plan, shuffleSeed } = await shuffleSeatingPlan(
          req.params.planId,
          { seed: req.body?.seed },
          req.user
        );
        res.json({
          success: true,
          message: "Seating plan shuffled. The same eligible student set is preserved.",
          planId: plan._id.toString(),
          shuffleSeed,
        });
      } catch (err) {
        console.error("Shuffle seating error:", err);
        res.status(400).json({ error: err.message || "Failed to shuffle seating plan." });
      }
    }
  );

  app.post(
    "/api/exams/seating/:planId/regenerate",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        // Regenerate with a fresh shuffle seed; the caller previews
        // the result and may republish deliberately.
        const { plan } = await regenerateSeatingPlan(
          req.params.planId,
          { shuffle: true, revisionReason: req.body?.revisionReason },
          req.user
        );
        res.json({
          success: true,
          message: "Seating plan regenerated with a new arrangement.",
          planId: plan._id.toString(),
        });
      } catch (err) {
        console.error("Regenerate seating error:", err);
        res.status(400).json({ error: err.message || "Failed to regenerate seating plan." });
      }
    }
  );

  app.post(
    "/api/exams/seating/:planId/room-change",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        const { fromRoom, toRoom, studentIds, revisionReason } = req.body || {};
        if (!fromRoom || !toRoom) {
          return res.status(400).json({ error: "Source and target rooms are required." });
        }
        const { plan, movedCount } = await changeSeatingRoom(
          req.params.planId,
          { fromRoom, toRoom, studentIds, revisionReason },
          req.user
        );
        res.json({
          success: true,
          message: `Moved ${movedCount} student(s) to "${toRoom}".`,
          planId: plan._id.toString(),
          movedCount,
        });
      } catch (err) {
        console.error("Room change error:", err);
        res.status(400).json({ error: err.message || "Failed to change rooms." });
      }
    }
  );

  /* ---------------------- Publication ---------------------- */

  app.post(
    "/api/exams/seating/:planId/publish",
    requireAuth,
    requirePermission(["exam.manageSeating", "exam.publish"]),
    async (req, res) => {
      try {
        const { plan, alreadyPublished } = await publishSeatingPlan(req.params.planId, req.user);
        res.json({
          success: true,
          message: alreadyPublished
            ? "Seating plan was already published."
            : "Seating plan published. Students can now view their own seats.",
          planId: plan._id.toString(),
          status: plan.status,
          publishedAt: plan.publishedAt,
          alreadyPublished,
        });
      } catch (err) {
        console.error("Publish seating plan error:", err);
        const status = err.code === "SEATING_VALIDATION_FAILED" ? 422 : 400;
        res.status(status).json({ error: err.message || "Failed to publish seating plan.", details: err.details || null });
      }
    }
  );

  app.post(
    "/api/exams/seating/:planId/schedule",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        const { publishAt, timezone } = req.body || {};
        if (!publishAt) {
          return res.status(400).json({ error: "A publication date and time is required." });
        }
        const { plan } = await scheduleSeatingPublication(
          req.params.planId,
          { publishAt, timezone },
          req.user
        );
        res.json({
          success: true,
          message: `Publication scheduled for ${plan.scheduledPublishAt.toISOString()} (${plan.scheduledPublishTimezone}). The server scheduler will publish it automatically.`,
          planId: plan._id.toString(),
          status: plan.status,
          scheduledPublishAt: plan.scheduledPublishAt,
          scheduledPublishTimezone: plan.scheduledPublishTimezone,
        });
      } catch (err) {
        console.error("Schedule seating publication error:", err);
        res.status(400).json({ error: err.message || "Failed to schedule publication." });
      }
    }
  );

  app.post(
    "/api/exams/seating/:planId/cancel",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        const { reason } = req.body || {};
        const { plan, alreadyCancelled } = await cancelSeatingPlan(req.params.planId, { reason }, req.user);
        res.json({
          success: true,
          message: alreadyCancelled ? "Seating plan was already cancelled." : "Seating plan cancelled.",
          planId: plan._id.toString(),
          status: plan.status,
        });
      } catch (err) {
        console.error("Cancel seating plan error:", err);
        res.status(400).json({ error: err.message || "Failed to cancel seating plan." });
      }
    }
  );

  /* -------------------- Scheduled publication sweep -------------------- */

  /**
   * POST /api/exams/seating/run-scheduled-publication
   * Operator/force trigger for the scheduled publication sweep.
   * The automatic sweep also runs inside the academic scheduler.
   */
  app.post(
    "/api/exams/seating/run-scheduled-publication",
    requireAuth,
    requirePermission(["exam.manageSeating"]),
    async (req, res) => {
      try {
        const results = await runScheduledSeatingPublication(new Date());
        res.json({ success: true, results });
      } catch (err) {
        console.error("Scheduled seating publication sweep error:", err);
        res.status(500).json({ error: "Failed to run scheduled publication sweep." });
      }
    }
  );

  /* -------------------- Student-owned seating views -------------------- */

  /**
   * GET /api/student/exams/:examId/my-seating
   * The requesting student's own seat for a published exam.
   * Ownership is derived from the session user, never from the
   * request body or path parameters beyond the exam id.
   */
  app.get(
    "/api/student/exams/:examId/my-seating",
    requireAuth,
    requirePermission(["exam.seating.view.own", "exam.manageSeating"]),
    async (req, res) => {
      try {
        const currentUserId = req.user._id || req.user.id;
        const roles = (req.user.roles || []);
        const isStudentOnly = roles.includes("student") && !roles.some((r) =>
          ["exam_officer", "super_admin", "registrar", "dean", "hod", "campus_admin"].includes(r)
        );

        const seating = await getStudentSeating(req.params.examId, currentUserId);

        if (!seating) {
          return res.status(404).json({
            error: "No published seating assignment is available for you for this examination.",
            code: "SEATING_NOT_FOUND",
          });
        }

        res.json({ seating });
      } catch (err) {
        console.error("Student seating error:", err);
        res.status(500).json({ error: "Failed to load your seating assignment." });
      }
    }
  );

  /**
   * GET /api/student/exams/my-seating
   * Every published seating assignment belonging to the
   * requesting student.
   */
  app.get(
    "/api/student/exams/my-seating",
    requireAuth,
    requirePermission(["exam.seating.view.own", "exam.manageSeating"]),
    async (req, res) => {
      try {
        const currentUserId = req.user._id || req.user.id;
        const seating = await listMySeating(currentUserId);
        res.json({ seating });
      } catch (err) {
        console.error("Student seating list error:", err);
        res.status(500).json({ error: "Failed to load your seating assignments." });
      }
    }
  );
}
