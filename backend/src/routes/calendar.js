import {
  AcademicCalendarEvent,
  ACADEMIC_EVENT_TYPES,
  AcademicCalendarDocument,
  ACADEMIC_DOCUMENT_CATEGORIES,
  ACADEMIC_DOCUMENT_LIFECYCLE,
  normalizeAudienceInput,
  describeAudience,
  isEmptySpecificTarget,
  Program,
  Section,
  StoredFile,
} from "../models/index.js";
import { logAudit } from "../db.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { route, notFound, validationError } from "../utils/apiError.js";
import {
  requireString,
  optionalString,
  requireEnum,
  optionalEnum,
  toInt,
  requireIsoDate,
  optionalTime,
  requireObjectId,
  readPagination,
} from "../utils/validate.js";
import {
  getAudienceContext,
  audienceMatchesStudent,
  buildAudienceVisibilityQuery,
} from "../services/accessControl.js";
import {
  createUploader,
  runFileUpload,
  verifyStoredFile,
  persistStoredFile,
  deleteStoredFile,
  streamStoredFile,
  FILE_POLICIES,
} from "../services/fileStorage.js";

const uploader = createUploader("academic_calendar", { field: "attachment" });
const documentUploader = createUploader("academic_calendar_document", { field: "file" });

/**
 * Academic Calendar.
 *
 * A real calendar record set, not an event list: administrators create dated
 * academic events, attach an image or PDF notice, and target each event at all
 * students or at a specific programme/batch/semester/section cohort. The
 * audience decision is made here and in `services/accessControl.js`, so an
 * event for BCA 2025 Semester 4 A1+A2 is unreachable for a Semester 2 student
 * even when the event id is requested directly.
 */
export function registerAcademicCalendarRoutes(app) {
  app.get(
    "/api/academic-calendar/events",
    requireAuth,
    route(async (req, res) => {
      const context = await getAudienceContext(req.user);
      const filter = buildAudienceVisibilityQuery(context);

      const from = optionalString(req.query.from, "From date", { max: 10 });
      const to = optionalString(req.query.to, "To date", { max: 10 });
      const eventType = optionalEnum(req.query.type, "Event type", ACADEMIC_EVENT_TYPES, {
        upper: true,
      });
      const academicYear = optionalString(req.query.academicYear, "Academic year", { max: 20 });
      const semester = req.query.semester ? toInt(req.query.semester, "Semester", { min: 1, max: 12 }) : null;
      const section = optionalString(req.query.section, "Section", { max: 10 });
      const includeCancelled = String(req.query.includeCancelled || "") === "true";

      if (from) requireIsoDate(from, "From date");
      if (to) requireIsoDate(to, "To date");
      if (from && to && from > to) {
        throw validationError("The start of the range must be on or before its end.", [
          { field: "from", message: "Reverse the date range." },
        ]);
      }

      if (from) filter.startDate = { ...(filter.startDate || {}), $gte: from };
      if (to) filter.endDate = { ...(filter.endDate || {}), $lte: to };
      if (eventType) filter.eventType = eventType;
      if (academicYear) filter.academicYear = academicYear;
      if (semester) filter.semester = semester;
      if (!includeCancelled) filter.status = { $ne: "CANCELLED" };

      if (section) {
        filter.$and = [
          ...(filter.$and || []),
          {
            $or: [
              { section: section.toUpperCase() },
              { "audience.target.sectionCodes": section.toUpperCase() },
              { "audience.target.allSections": true },
              { "audience.target.sectionCodes": { $size: 0 } },
              { "audience.target.sectionCodes": { $exists: false } },
              { audience: { $exists: false } },
            ],
          },
        ];
      }

      const search = optionalString(req.query.q, "Search", { max: 120 });
      if (search) {
        const pattern = new RegExp(escapeRegExp(search), "i");
        filter.$and = [
          ...(filter.$and || []),
          { $or: [{ title: pattern }, { description: pattern }] },
        ];
      }

      const events = await AcademicCalendarEvent.find(filter)
        .sort({ startDate: 1, startTime: 1 })
        .limit(500)
        .lean();

      res.json({ events: events.map(serialiseEvent) });
    }),
  );

  app.get(
    "/api/academic-calendar/events/:id",
    requireAuth,
    route(async (req, res) => {
      const context = await getAudienceContext(req.user);
      const event = await AcademicCalendarEvent.findById(
        requireObjectId(req.params.id, "Calendar event"),
      ).lean();
      if (!event) throw notFound("Calendar event not found.");
      if (!audienceMatchesStudent(event.audience, context)) {
        // 404 rather than 403: an unauthorised student should not be able to
        // confirm that the event exists at all.
        throw notFound("Calendar event not found.");
      }
      res.json({ event: serialiseEvent(event) });
    }),
  );

  /** Cohort and type options for the event form, from real records. */
  app.get(
    "/api/academic-calendar/filters",
    requireAuth,
    route(async (req, res) => {
      const [programs, sections, events] = await Promise.all([
        Program.find().select("code name department").sort({ code: 1 }).lean(),
        Section.find().select("code program semester batch").sort({ code: 1 }).lean(),
        AcademicCalendarEvent.distinct("academicYear"),
      ]);
      res.json({
        filters: {
          eventTypes: ACADEMIC_EVENT_TYPES,
          academicYears: events.filter(Boolean).sort().reverse(),
          programCodes: programs.map((row) => row.code),
          batchYears: Array.from(
            new Set(sections.map((row) => row.batch).filter(Boolean)),
          ).sort(),
          semesters: Array.from(
            new Set(sections.map((row) => row.semester).filter(Boolean)),
          ).sort((a, b) => a - b),
          sectionCodes: Array.from(new Set(sections.map((row) => row.code))).sort(),
          programs: programs.map((row) => ({
            code: row.code,
            name: row.name,
            department: row.department,
          })),
        },
      });
    }),
  );

  app.post(
    "/api/academic-calendar/events",
    requireAuth,
    requirePermission("calendar.manage"),
    (req, res, next) => {
      runFileUpload(
        req,
        res,
        uploader,
        async (uploadError, file) => {
          try {
            const body = req.body || {};
            const startDate = requireIsoDate(body.startDate, "Start date");
            const endDate = requireIsoDate(body.endDate || body.startDate, "End date");
            if (endDate < startDate) {
              throw validationError("The end date cannot be before the start date.", [
                { field: "endDate", message: "Choose an end date on or after the start." },
              ]);
            }
            const startTime = optionalTime(body.startTime, "Start time");
            const endTime = optionalTime(body.endTime, "End time");
            if (startTime && endTime && endTime <= startTime) {
              throw validationError("The end time must be after the start time.", [
                { field: "endTime", message: "Choose a later end time." },
              ]);
            }

            const audience = readAudience(body);

            const event = await AcademicCalendarEvent.create({
              title: requireString(body.title, "Title", { max: 180 }),
              description: optionalString(body.description, "Description", { max: 4000 }) || "",
              eventType: requireEnum(body.eventType || "OTHER", "Event type", ACADEMIC_EVENT_TYPES, {
                upper: true,
              }),
              startDate,
              endDate,
              startTime,
              endTime,
              allDay: !(startTime && endTime),
              academicYear: requireString(body.academicYear, "Academic year", { max: 20 }),
              semester: body.semester ? toInt(body.semester, "Semester", { min: 1, max: 12 }) : null,
              batch: optionalString(body.batch, "Batch", { max: 20 }),
              section: optionalString(body.section, "Section", { max: 10 })?.toUpperCase() || null,
              audience,
              status: requireEnum(body.status || "PUBLISHED", "Status", ["PUBLISHED", "DRAFT"], {
                upper: true,
              }),
              createdBy: req.user._id || req.user.id,
            });

            // The event exists first so the stored file can be bound to it; the
            // attachment is therefore a real database reference, not a name.
            if (file) {
              const verified = await verifyStoredFile(file.path, FILE_POLICIES.academic_calendar);
              const persisted = await persistStoredFile({
                module: "academic_calendar",
                file,
                verifiedSignature: verified.verifiedSignature,
                uploadedBy: req.user._id || req.user.id,
                relatedType: "calendar_event",
                relatedId: event._id.toString(),
              });
              event.attachment = persisted.reference;
              await event.save();
            }

            await logAudit({
              userId: req.user._id || req.user.id,
              action: file
                ? "CALENDAR_EVENT_CREATED_WITH_ATTACHMENT"
                : "CALENDAR_EVENT_CREATED",
              module: "academic_calendar",
              resource: "calendar_event",
              resourceId: event._id.toString(),
              newValue: {
                title: event.title,
                eventType: event.eventType,
                startDate: event.startDate,
                endDate: event.endDate,
                audience: describeAudience(event.audience),
                attachment: event.attachment?.originalName || null,
              },
              details: `Academic calendar event "${event.title}" created for ${describeAudience(event.audience)}.`,
            });

            res.status(201).json({ event: serialiseEvent(event.toObject()) });
          } catch (error) {
            next(error);
          }
        },
        next,
        // An event is a real record without a notice attached to it; the
        // attachment can be uploaded (or replaced) afterwards.
        { optionalFile: true },
      );
    },
  );

  app.patch(
    "/api/academic-calendar/events/:id",
    requireAuth,
    requirePermission("calendar.manage"),
    route(async (req, res) => {
      const event = await AcademicCalendarEvent.findById(
        requireObjectId(req.params.id, "Calendar event"),
      );
      if (!event) throw notFound("Calendar event not found.");

      const body = req.body || {};
      const before = {
        title: event.title,
        eventType: event.eventType,
        startDate: event.startDate,
        endDate: event.endDate,
        audience: describeAudience(event.audience),
        status: event.status,
      };

      if (body.title !== undefined) event.title = requireString(body.title, "Title", { max: 180 });
      if (body.description !== undefined) {
        event.description = optionalString(body.description, "Description", { max: 4000 }) || "";
      }
      if (body.eventType !== undefined) {
        event.eventType = requireEnum(body.eventType, "Event type", ACADEMIC_EVENT_TYPES, { upper: true });
      }
      if (body.startDate !== undefined) event.startDate = requireIsoDate(body.startDate, "Start date");
      if (body.endDate !== undefined) event.endDate = requireIsoDate(body.endDate, "End date");
      if (body.startTime !== undefined) event.startTime = optionalTime(body.startTime, "Start time");
      if (body.endTime !== undefined) event.endTime = optionalTime(body.endTime, "End time");
      if (body.academicYear !== undefined) {
        event.academicYear = requireString(body.academicYear, "Academic year", { max: 20 });
      }
      if (body.semester !== undefined && body.semester !== null && body.semester !== "") {
        event.semester = toInt(body.semester, "Semester", { min: 1, max: 12 });
      }
      if (body.batch !== undefined) event.batch = optionalString(body.batch, "Batch", { max: 20 });
      if (body.section !== undefined) {
        event.section = optionalString(body.section, "Section", { max: 10 })?.toUpperCase() || null;
      }
      if (body.status !== undefined) {
        event.status = requireEnum(body.status, "Status", ["PUBLISHED", "DRAFT", "CANCELLED"], {
          upper: true,
        });
        if (body.status === "CANCELLED") {
          event.cancelledAt = new Date();
          event.cancelledBy = req.user._id || req.user.id;
        }
      }
      if (body.audience !== undefined || body.targetType !== undefined) {
        event.audience = readAudience({ ...body, audience: body.audience });
        event.batch = event.audience.target.batchYears?.[0] ?? event.batch;
        event.section = event.audience.target.sectionCodes?.[0] ?? event.section;
      }
      if (event.endDate < event.startDate) {
        throw validationError("The end date cannot be before the start date.", [
          { field: "endDate", message: "Choose an end date on or after the start." },
        ]);
      }
      event.allDay = !(event.startTime && event.endTime);
      event.updatedBy = req.user._id || req.user.id;
      await event.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CALENDAR_EVENT_UPDATED",
        module: "academic_calendar",
        resource: "calendar_event",
        resourceId: event._id.toString(),
        oldValue: before,
        newValue: {
          title: event.title,
          eventType: event.eventType,
          startDate: event.startDate,
          endDate: event.endDate,
          audience: describeAudience(event.audience),
          status: event.status,
        },
        details: `Academic calendar event "${event.title}" updated.`,
      });

      res.json({ event: serialiseEvent(event.toObject()) });
    }),
  );

  /** Replace the notice attached to an event (schedule image, exam PDF, ...). */
  app.post(
    "/api/academic-calendar/events/:id/attachment",
    requireAuth,
    requirePermission("calendar.manage"),
    (req, res, next) => {
      runFileUpload(
        req,
        res,
        uploader,
        async (uploadError, file) => {
          try {
            const event = await AcademicCalendarEvent.findById(
              requireObjectId(req.params.id, "Calendar event"),
            );
            if (!event) throw notFound("Calendar event not found.");

            const verified = await verifyStoredFile(file.path, FILE_POLICIES.academic_calendar);
            const previous = event.attachment?.fileId || null;
            const persisted = await persistStoredFile({
              module: "academic_calendar",
              file,
              verifiedSignature: verified.verifiedSignature,
              uploadedBy: req.user._id || req.user.id,
              relatedType: "calendar_event",
              relatedId: event._id.toString(),
            });

            event.attachment = persisted.reference;
            event.updatedBy = req.user._id || req.user.id;
            await event.save();

            if (previous) await deleteStoredFile(previous, req.user._id || req.user.id);

            await logAudit({
              userId: req.user._id || req.user.id,
              action: "CALENDAR_EVENT_ATTACHMENT_REPLACED",
              module: "academic_calendar",
              resource: "calendar_event",
              resourceId: event._id.toString(),
              newValue: {
                file: event.attachment.originalName,
                sizeBytes: event.attachment.sizeBytes,
              },
              details: `Attachment replaced on "${event.title}".`,
            });

            res.json({ event: serialiseEvent(event.toObject()) });
          } catch (error) {
            next(error);
          }
        },
        next,
      );
    },
  );

  app.delete(
    "/api/academic-calendar/events/:id/attachment",
    requireAuth,
    requirePermission("calendar.manage"),
    route(async (req, res) => {
      const event = await AcademicCalendarEvent.findById(
        requireObjectId(req.params.id, "Calendar event"),
      );
      if (!event) throw notFound("Calendar event not found.");
      if (!event.attachment) throw notFound("This event has no attachment.");

      const removed = event.attachment;
      event.attachment = null;
      event.updatedBy = req.user._id || req.user.id;
      await event.save();
      await deleteStoredFile(removed.fileId, req.user._id || req.user.id);

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CALENDAR_EVENT_ATTACHMENT_REMOVED",
        module: "academic_calendar",
        resource: "calendar_event",
        resourceId: event._id.toString(),
        oldValue: { file: removed.originalName },
        details: `Attachment removed from "${event.title}".`,
      });

      res.json({ event: serialiseEvent(event.toObject()) });
    }),
  );

  /**
   * Cancels an event rather than deleting it: an institutional calendar is an
   * audited record, so a cancelled semester start stays visible in history.
   */
  app.delete(
    "/api/academic-calendar/events/:id",
    requireAuth,
    requirePermission("calendar.manage"),
    route(async (req, res) => {
      const event = await AcademicCalendarEvent.findById(
        requireObjectId(req.params.id, "Calendar event"),
      );
      if (!event) throw notFound("Calendar event not found.");

      event.status = "CANCELLED";
      event.cancelledAt = new Date();
      event.cancelledBy = req.user._id || req.user.id;
      event.cancellationReason =
        optionalString(req.body?.reason, "Cancellation reason", { max: 500 }) || null;
      event.updatedBy = req.user._id || req.user.id;
      await event.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CALENDAR_EVENT_CANCELLED",
        module: "academic_calendar",
        resource: "calendar_event",
        resourceId: event._id.toString(),
        oldValue: { status: "PUBLISHED" },
        newValue: { status: "CANCELLED", reason: event.cancellationReason },
        details: `Academic calendar event "${event.title}" cancelled.`,
      });

      res.json({ success: true, event: serialiseEvent(event.toObject()) });
    }),
  );

  app.post(
    "/api/academic-calendar/events/:id/restore",
    requireAuth,
    requirePermission("calendar.manage"),
    route(async (req, res) => {
      const event = await AcademicCalendarEvent.findById(
        requireObjectId(req.params.id, "Calendar event"),
      );
      if (!event) throw notFound("Calendar event not found.");
      event.status = "PUBLISHED";
      event.cancelledAt = null;
      event.cancelledBy = null;
      event.cancellationReason = null;
      event.updatedBy = req.user._id || req.user.id;
      await event.save();
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CALENDAR_EVENT_RESTORED",
        module: "academic_calendar",
        resource: "calendar_event",
        resourceId: event._id.toString(),
        details: `Academic calendar event "${event.title}" restored.`,
      });
      res.json({ success: true, event: serialiseEvent(event.toObject()) });
    }),
  );

  /**
   * Academic Calendar Document Management.
   *
   * Official academic calendar documents: academic plans, exam schedules,
   * holiday calendars, semester calendars, etc. Each document follows an audited
   * lifecycle — DRAFT → UNDER_REVIEW → APPROVED → PUBLISHED → ARCHIVED — and is
   * addressed to an audience derived from the institution, academic year,
   * semester, program, batch and section dimensions.
   *
   * Students may only read documents that are PUBLISHED and within their cohort;
   * every administrative mutation is gated on `calendar.manage`, which no student
   * role holds.
   */

  app.get("/api/academic-calendar/documents", requireAuth, route(async (req, res) => {
    const context = await getAudienceContext(req.user);
    const filter = buildAudienceVisibilityQuery(context);

    if (!context.isStaff) {
      filter.lifecycleState = "PUBLISHED";
    }

    const category = optionalEnum(
      req.query.category, "Category", ACADEMIC_DOCUMENT_CATEGORIES, { upper: true },
    );
    const academicYear = optionalString(req.query.academicYear, "Academic year", { max: 20 });
    const semester = req.query.semester
      ? toInt(req.query.semester, "Semester", { min: 1, max: 12 })
      : null;
    const search = optionalString(req.query.q, "Search", { max: 120 });
    const { limit, page, skip } = readPagination(req.query, { defaultLimit: 25 });

    if (context.isStaff) {
      const lifecycle = optionalEnum(
        req.query.lifecycle, "Lifecycle state", ACADEMIC_DOCUMENT_LIFECYCLE, { upper: true },
      );
      if (lifecycle) filter.lifecycleState = lifecycle;
      else if (String(req.query.includeArchived || "") !== "true") {
        filter.lifecycleState = { $ne: "ARCHIVED" };
      }
    }

    if (category) filter.category = category;
    if (academicYear) filter.academicYear = academicYear;
    if (semester) filter.semester = semester;
    if (search) {
      const pattern = new RegExp(escapeRegExp(search), "i");
      filter.$and = [
        ...(filter.$and || []),
        { $or: [{ title: pattern }, { description: pattern }] },
      ];
    }

    const [documents, total] = await Promise.all([
      AcademicCalendarDocument.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AcademicCalendarDocument.countDocuments(filter),
    ]);

    res.json({
      documents: documents.map(serialiseDocument),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  }));

  app.get("/api/academic-calendar/documents/:id", requireAuth, route(async (req, res) => {
    const context = await getAudienceContext(req.user);
    const document = await AcademicCalendarDocument.findById(
      requireObjectId(req.params.id, "Academic calendar document"),
    ).lean();
    if (!document) throw notFound("Academic calendar document not found.");

    if (!documentIsVisibleToStudent(document, context)) {
      // 404, not 403: a student must not confirm whether a non-published
      // document exists.
      throw notFound("Academic calendar document not found.");
    }

    res.json({ document: serialiseDocument(document), canManage: context.isStaff });
  }));

  app.get("/api/academic-calendar/documents/:id/download", requireAuth, route(async (req, res) => {
    const context = await getAudienceContext(req.user);
    const document = await AcademicCalendarDocument.findById(
      requireObjectId(req.params.id, "Academic calendar document"),
    ).lean();
    if (!document) throw notFound("Academic calendar document not found.");

    if (!documentIsVisibleToStudent(document, context)) {
      throw notFound("Academic calendar document not found.");
    }

    const stored = await StoredFile.findOne({
      _id: document.file?.fileId,
      status: "STORED",
    }).lean();
    if (!stored) throw notFound("The document file is no longer available.");

    await StoredFile.updateOne({ _id: stored._id }, { $inc: { downloadCount: 1 } });
    const download = String(req.query.download || "") === "true";
    streamStoredFile(res, stored, { download });
  }));

  app.get("/api/academic-calendar/documents/:id/versions", requireAuth, route(async (req, res) => {
    const context = await getAudienceContext(req.user);
    const versions = await collectVersionHistory(
      requireObjectId(req.params.id, "Academic calendar document"),
    );
    if (!versions.length) throw notFound("Academic calendar document not found.");

    let visible = versions;
    if (!context.isStaff) {
      visible = versions.filter(
        (doc) => doc.lifecycleState === "PUBLISHED" && documentIsVisibleToStudent(doc, context),
      );
    }

    res.json({ versions: visible.map(serialiseDocument) });
  }));

  app.post(
    "/api/academic-calendar/documents",
    requireAuth,
    requirePermission("calendar.manage"),
    (req, res, next) => {
      runFileUpload(
        req,
        res,
        documentUploader,
        async (uploadError, file) => {
          try {
            if (uploadError) throw uploadError;

            const body = req.body || {};
            const audience = readAudience(body);
            const academicYear = requireString(body.academicYear, "Academic year", { max: 20 });
            const effectiveFrom = optionalString(body.effectiveFrom, "Effective from", { max: 10 });
            if (effectiveFrom) requireIsoDate(effectiveFrom, "Effective from");
            const effectiveTo = optionalString(body.effectiveTo, "Effective to", { max: 10 });
            if (effectiveTo) requireIsoDate(effectiveTo, "Effective to");
            if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
              throw validationError(
                "The effective-to date cannot be before the effective-from date.",
                [{ field: "effectiveTo", message: "Choose a later end date." }],
              );
            }

            // Instantiate first so _id is available for the stored-file reference;
            // the required `file` field is populated before save, preserving validation.
            const document = new AcademicCalendarDocument({
              title: requireString(body.title, "Title", { max: 200 }),
              description: optionalString(body.description, "Description", { max: 4000 }) || "",
              category: requireEnum(
                body.category || "OTHER_OFFICIAL_ACADEMIC_DOCUMENT",
                "Category",
                ACADEMIC_DOCUMENT_CATEGORIES,
                { upper: true },
              ),
              academicYear,
              semester: body.semester ? toInt(body.semester, "Semester", { min: 1, max: 12 }) : null,
              audience,
              effectiveFrom,
              effectiveTo,
              lifecycleState: "DRAFT",
              createdBy: req.user._id || req.user.id,
            });

            const verified = await verifyStoredFile(
              file.path,
              FILE_POLICIES.academic_calendar_document,
            );
            const persisted = await persistStoredFile({
              module: "academic_calendar_document",
              file,
              verifiedSignature: verified.verifiedSignature,
              uploadedBy: req.user._id || req.user.id,
              relatedType: "calendar_document",
              relatedId: document._id.toString(),
            });
            document.file = persisted.reference;
            await document.save();

            await logAudit({
              userId: req.user._id || req.user.id,
              action: "CALENDAR_DOCUMENT_CREATED",
              module: "academic_calendar",
              resource: "calendar_document",
              resourceId: document._id.toString(),
              newValue: {
                title: document.title,
                category: document.category,
                academicYear: document.academicYear,
                audience: describeAudience(document.audience),
              },
              details: `Academic calendar document "${document.title}" created.`,
            });

            res.status(201).json({ document: serialiseDocument(document.toObject()) });
          } catch (error) {
            next(error);
          }
        },
        next,
        { optionalFile: false },
      );
    },
  );

  app.patch(
    "/api/academic-calendar/documents/:id",
    requireAuth,
    requirePermission("calendar.manage"),
    route(async (req, res) => {
      const document = await AcademicCalendarDocument.findById(
        requireObjectId(req.params.id, "Academic calendar document"),
      );
      if (!document) throw notFound("Academic calendar document not found.");

      const body = req.body || {};

      // Non-draft documents are versioned: a change creates a new DRAFT rather
      // than overwriting an approved, published or archived record.
      if (document.lifecycleState !== "DRAFT" && document.lifecycleState !== "UNDER_REVIEW") {
        const versioned = new AcademicCalendarDocument({
          title: body.title !== undefined
            ? requireString(body.title, "Title", { max: 200 })
            : document.title,
          description: body.description !== undefined
            ? optionalString(body.description, "Description", { max: 4000 }) || ""
            : document.description,
          category: body.category !== undefined
            ? requireEnum(body.category, "Category", ACADEMIC_DOCUMENT_CATEGORIES, { upper: true })
            : document.category,
          academicYear: body.academicYear !== undefined
            ? requireString(body.academicYear, "Academic year", { max: 20 })
            : document.academicYear,
          semester: body.semester !== undefined
            ? body.semester
              ? toInt(body.semester, "Semester", { min: 1, max: 12 })
              : null
            : document.semester,
          audience: body.audience !== undefined || body.targetType !== undefined
            ? readAudience({ ...body, audience: body.audience })
            : document.audience,
          file: document.file ? document.file.toObject() : document.file,
          version: document.version + 1,
          previousVersionId: document._id,
          versionReason: optionalString(body.versionReason, "Version reason", { max: 500 }),
          lifecycleState: "DRAFT",
          effectiveFrom: body.effectiveFrom !== undefined
            ? optionalString(body.effectiveFrom, "Effective from", { max: 10 })
            : document.effectiveFrom,
          effectiveTo: body.effectiveTo !== undefined
            ? optionalString(body.effectiveTo, "Effective to", { max: 10 })
            : document.effectiveTo,
          createdBy: document.createdBy,
          updatedBy: req.user._id || req.user.id,
        });
        const saved = await versioned.save();

        await logAudit({
          userId: req.user._id || req.user.id,
          action: "CALENDAR_DOCUMENT_VERSIONED",
          module: "academic_calendar",
          resource: "calendar_document",
          resourceId: saved._id.toString(),
          oldValue: { version: document.version, lifecycleState: document.lifecycleState },
          newValue: {
            version: saved.version,
            lifecycleState: saved.lifecycleState,
            previousVersionId: String(document._id),
          },
          details: `New version ${saved.version} of "${saved.title}" created from version ${document.version}.`,
        });

        res.status(201).json({
          document: serialiseDocument(saved.toObject()),
          newVersion: true,
        });
        return;
      }

      const before = {
        title: document.title,
        category: document.category,
        academicYear: document.academicYear,
        lifecycleState: document.lifecycleState,
        audience: describeAudience(document.audience),
      };

      if (body.title !== undefined) document.title = requireString(body.title, "Title", { max: 200 });
      if (body.description !== undefined) {
        document.description = optionalString(body.description, "Description", { max: 4000 }) || "";
      }
      if (body.category !== undefined) {
        document.category = requireEnum(body.category, "Category", ACADEMIC_DOCUMENT_CATEGORIES, { upper: true });
      }
      if (body.academicYear !== undefined) {
        document.academicYear = requireString(body.academicYear, "Academic year", { max: 20 });
      }
      if (body.semester !== undefined) {
        document.semester = body.semester ? toInt(body.semester, "Semester", { min: 1, max: 12 }) : null;
      }
      if (body.audience !== undefined || body.targetType !== undefined) {
        document.audience = readAudience({ ...body, audience: body.audience });
      }
      if (body.effectiveFrom !== undefined) {
        const val = optionalString(body.effectiveFrom, "Effective from", { max: 10 });
        if (val) requireIsoDate(val, "Effective from");
        document.effectiveFrom = val;
      }
      if (body.effectiveTo !== undefined) {
        const val = optionalString(body.effectiveTo, "Effective to", { max: 10 });
        if (val) requireIsoDate(val, "Effective to");
        document.effectiveTo = val;
      }
      if (
        document.effectiveFrom && document.effectiveTo && document.effectiveFrom > document.effectiveTo
      ) {
        throw validationError("The effective-to date cannot be before the effective-from date.", [
          { field: "effectiveTo", message: "Choose a later end date." },
        ]);
      }
      document.updatedBy = req.user._id || req.user.id;
      await document.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CALENDAR_DOCUMENT_UPDATED",
        module: "academic_calendar",
        resource: "calendar_document",
        resourceId: document._id.toString(),
        oldValue: before,
        newValue: {
          title: document.title,
          category: document.category,
          academicYear: document.academicYear,
          lifecycleState: document.lifecycleState,
          audience: describeAudience(document.audience),
        },
        details: `Academic calendar document "${document.title}" updated.`,
      });

      res.json({ document: serialiseDocument(document.toObject()) });
    }),
  );

  app.post(
    "/api/academic-calendar/documents/:id/file",
    requireAuth,
    requirePermission("calendar.manage"),
    (req, res, next) => {
      runFileUpload(
        req,
        res,
        documentUploader,
        async (uploadError, file) => {
          try {
            if (uploadError) throw uploadError;

            const document = await AcademicCalendarDocument.findById(
              requireObjectId(req.params.id, "Academic calendar document"),
            );
            if (!document) throw notFound("Academic calendar document not found.");

            const verified = await verifyStoredFile(
              file.path,
              FILE_POLICIES.academic_calendar_document,
            );
            const persisted = await persistStoredFile({
              module: "academic_calendar_document",
              file,
              verifiedSignature: verified.verifiedSignature,
              uploadedBy: req.user._id || req.user.id,
              relatedType: "calendar_document",
              relatedId: document._id.toString(),
            });

            const previous = document.file?.fileId || null;

            if (document.lifecycleState !== "DRAFT" && document.lifecycleState !== "UNDER_REVIEW") {
              const versionReason = optionalString(
                req.body?.versionReason,
                "Version reason",
                { max: 500 },
              );
              const versioned = new AcademicCalendarDocument({
                title: document.title,
                description: document.description,
                category: document.category,
                academicYear: document.academicYear,
                semester: document.semester,
                audience: document.audience,
                file: persisted.reference,
                version: document.version + 1,
                previousVersionId: document._id,
                versionReason,
                lifecycleState: "DRAFT",
                effectiveFrom: document.effectiveFrom,
                effectiveTo: document.effectiveTo,
                createdBy: document.createdBy,
                updatedBy: req.user._id || req.user.id,
              });
              const saved = await versioned.save();

              await logAudit({
                userId: req.user._id || req.user.id,
                action: "CALENDAR_DOCUMENT_FILE_REPLACED",
                module: "academic_calendar",
                resource: "calendar_document",
                resourceId: saved._id.toString(),
                newValue: {
                  version: saved.version,
                  file: saved.file.originalName,
                  sizeBytes: saved.file.sizeBytes,
                },
                details: `File replaced; version ${saved.version} of "${saved.title}" created.`,
              });

              res.status(201).json({
                document: serialiseDocument(saved.toObject()),
                newVersion: true,
              });
            } else {
              document.file = persisted.reference;
              document.updatedBy = req.user._id || req.user.id;
              await document.save();
              if (previous) await deleteStoredFile(previous, req.user._id || req.user.id);

              await logAudit({
                userId: req.user._id || req.user.id,
                action: "CALENDAR_DOCUMENT_FILE_REPLACED",
                module: "academic_calendar",
                resource: "calendar_document",
                resourceId: document._id.toString(),
                oldValue: { file: previous ? "previous file" : null },
                newValue: {
                  file: document.file.originalName,
                  sizeBytes: document.file.sizeBytes,
                },
                details: `File replaced on "${document.title}".`,
              });

              res.json({ document: serialiseDocument(document.toObject()) });
            }
          } catch (error) {
            next(error);
          }
        },
        next,
      );
    },
  );

  /** Submit a document for review (DRAFT → UNDER_REVIEW). */
  app.post(
    "/api/academic-calendar/documents/:id/submit",
    requireAuth,
    requirePermission("calendar.manage"),
    route(async (req, res) => {
      const document = await AcademicCalendarDocument.findById(
        requireObjectId(req.params.id, "Academic calendar document"),
      );
      if (!document) throw notFound("Academic calendar document not found.");
      if (document.lifecycleState !== "DRAFT" && document.lifecycleState !== "UNDER_REVIEW") {
        throw validationError("Only a draft or under-review document can be submitted.", [
          { field: "lifecycleState", message: `Current state is ${document.lifecycleState}.` },
        ]);
      }

      const before = document.lifecycleState;
      document.lifecycleState = "UNDER_REVIEW";
      document.updatedBy = req.user._id || req.user.id;
      await document.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CALENDAR_DOCUMENT_SUBMITTED",
        module: "academic_calendar",
        resource: "calendar_document",
        resourceId: document._id.toString(),
        oldValue: { lifecycleState: before },
        newValue: { lifecycleState: document.lifecycleState },
        details: `Document "${document.title}" submitted for review.`,
      });

      res.json({ success: true, document: serialiseDocument(document.toObject()) });
    }),
  );

  /** Approve a submitted document (UNDER_REVIEW → APPROVED). */
  app.post(
    "/api/academic-calendar/documents/:id/approve",
    requireAuth,
    requirePermission("calendar.manage"),
    route(async (req, res) => {
      const document = await AcademicCalendarDocument.findById(
        requireObjectId(req.params.id, "Academic calendar document"),
      );
      if (!document) throw notFound("Academic calendar document not found.");
      if (document.lifecycleState !== "UNDER_REVIEW") {
        throw validationError("Only a document under review can be approved.", [
          {
            field: "lifecycleState",
            message: `Current state is ${document.lifecycleState}; approval requires review first.`,
          },
        ]);
      }

      const before = { lifecycleState: document.lifecycleState };
      document.lifecycleState = "APPROVED";
      document.approvedAt = new Date();
      document.approvedBy = req.user._id || req.user.id;
      document.updatedBy = req.user._id || req.user.id;
      await document.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CALENDAR_DOCUMENT_APPROVED",
        module: "academic_calendar",
        resource: "calendar_document",
        resourceId: document._id.toString(),
        oldValue: before,
        newValue: { lifecycleState: document.lifecycleState },
        details: `Document "${document.title}" approved.`,
      });

      res.json({ success: true, document: serialiseDocument(document.toObject()) });
    }),
  );

  /** Publish an approved document (→ PUBLISHED). */
  app.post(
    "/api/academic-calendar/documents/:id/publish",
    requireAuth,
    requirePermission("calendar.manage"),
    route(async (req, res) => {
      const document = await AcademicCalendarDocument.findById(
        requireObjectId(req.params.id, "Academic calendar document"),
      );
      if (!document) throw notFound("Academic calendar document not found.");
      if (document.lifecycleState === "ARCHIVED") {
        throw validationError("An archived document cannot be published. Restore it first.", [
          { field: "lifecycleState", message: "State is ARCHIVED." },
        ]);
      }

      const before = { lifecycleState: document.lifecycleState };
      document.lifecycleState = "PUBLISHED";
      document.publishedAt = new Date();
      document.publishedBy = req.user._id || req.user.id;
      document.updatedBy = req.user._id || req.user.id;
      await document.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CALENDAR_DOCUMENT_PUBLISHED",
        module: "academic_calendar",
        resource: "calendar_document",
        resourceId: document._id.toString(),
        oldValue: before,
        newValue: { lifecycleState: document.lifecycleState },
        details: `Document "${document.title}" published.`,
      });

      res.json({ success: true, document: serialiseDocument(document.toObject()) });
    }),
  );

  /** Archive a published document (→ ARCHIVED), removing it from student view. */
  app.post(
    "/api/academic-calendar/documents/:id/archive",
    requireAuth,
    requirePermission("calendar.manage"),
    route(async (req, res) => {
      const document = await AcademicCalendarDocument.findById(
        requireObjectId(req.params.id, "Academic calendar document"),
      );
      if (!document) throw notFound("Academic calendar document not found.");
      if (document.lifecycleState === "ARCHIVED") {
        throw validationError("This document is already archived.", [
          { field: "lifecycleState", message: "State is already ARCHIVED." },
        ]);
      }

      const before = { lifecycleState: document.lifecycleState };
      document.lifecycleState = "ARCHIVED";
      document.archivedAt = new Date();
      document.archivedBy = req.user._id || req.user.id;
      document.updatedBy = req.user._id || req.user.id;
      await document.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CALENDAR_DOCUMENT_ARCHIVED",
        module: "academic_calendar",
        resource: "calendar_document",
        resourceId: document._id.toString(),
        oldValue: before,
        newValue: { lifecycleState: document.lifecycleState },
        details: `Document "${document.title}" archived.`,
      });

      res.json({ success: true, document: serialiseDocument(document.toObject()) });
    }),
  );

  /** Restore an archived document to published status. */
  app.post(
    "/api/academic-calendar/documents/:id/restore",
    requireAuth,
    requirePermission("calendar.manage"),
    route(async (req, res) => {
      const document = await AcademicCalendarDocument.findById(
        requireObjectId(req.params.id, "Academic calendar document"),
      );
      if (!document) throw notFound("Academic calendar document not found.");
      if (document.lifecycleState !== "ARCHIVED") {
        throw validationError("Only an archived document can be restored.", [
          { field: "lifecycleState", message: `Current state is ${document.lifecycleState}.` },
        ]);
      }

      const before = { lifecycleState: document.lifecycleState };
      document.lifecycleState = "PUBLISHED";
      document.archivedAt = null;
      document.archivedBy = null;
      document.updatedBy = req.user._id || req.user.id;
      await document.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CALENDAR_DOCUMENT_RESTORED",
        module: "academic_calendar",
        resource: "calendar_document",
        resourceId: document._id.toString(),
        oldValue: before,
        newValue: { lifecycleState: document.lifecycleState },
        details: `Document "${document.title}" restored from archive.`,
      });

      res.json({ success: true, document: serialiseDocument(document.toObject()) });
    }),
  );
}

function readAudience(body) {
  const source = body.audience && typeof body.audience === "object" ? body.audience : body;
  const audience = normalizeAudienceInput(source);
  if (audience.targetType === "SPECIFIC" && isEmptySpecificTarget(audience.target)) {
    throw validationError(
      "Choose who this event is for: all students, staff only, or a specific programme, batch, semester and section.",
      [{ field: "audience", message: "Select an audience." }],
    );
  }
  return audience;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serialiseEvent(event) {
  const attachment = event.attachment
    ? {
        fileId: String(event.attachment.fileId),
        originalName: event.attachment.originalName,
        mimeType: event.attachment.mimeType,
        extension: event.attachment.extension,
        sizeBytes: event.attachment.sizeBytes,
        uploadedAt: event.attachment.uploadedAt || null,
        isImage: String(event.attachment.mimeType || "").startsWith("image/"),
        isPdf: event.attachment.mimeType === "application/pdf",
      }
    : null;

  return {
    id: String(event._id),
    _id: String(event._id),
    title: event.title,
    description: event.description || "",
    eventType: event.eventType,
    startDate: event.startDate,
    endDate: event.endDate,
    startTime: event.startTime || null,
    endTime: event.endTime || null,
    allDay: Boolean(event.allDay),
    academicYear: event.academicYear,
    semester: event.semester ?? null,
    batch: event.batch || null,
    section: event.section || null,
    targetType: event.audience?.targetType || "ALL",
    audienceLabel: describeAudience(event.audience),
    audience: event.audience || { targetType: "ALL", target: {} },
    attachment,
    status: event.status,
    cancellationReason: event.cancellationReason || null,
    createdAt: event.createdAt || null,
    updatedAt: event.updatedAt || null,
  };
}

function serialiseDocument(doc) {
  const file = doc.file
    ? {
        fileId: String(doc.file.fileId),
        originalName: doc.file.originalName,
        mimeType: doc.file.mimeType,
        extension: doc.file.extension,
        sizeBytes: doc.file.sizeBytes,
        uploadedAt: doc.file.uploadedAt || null,
        isPdf: doc.file.mimeType === "application/pdf",
        isImage: String(doc.file.mimeType || "").startsWith("image/"),
      }
    : null;

  return {
    id: String(doc._id),
    _id: String(doc._id),
    title: doc.title,
    description: doc.description || "",
    category: doc.category,
    academicYear: doc.academicYear,
    semester: doc.semester ?? null,
    audience: doc.audience || { targetType: "ALL", target: {} },
    targetType: doc.audience?.targetType || "ALL",
    audienceLabel: describeAudience(doc.audience),
    file,
    version: doc.version || 1,
    previousVersionId: doc.previousVersionId ? String(doc.previousVersionId) : null,
    versionReason: doc.versionReason || null,
    lifecycleState: doc.lifecycleState,
    effectiveFrom: doc.effectiveFrom || null,
    effectiveTo: doc.effectiveTo || null,
    publishedAt: doc.publishedAt || null,
    publishedBy: doc.publishedBy ? String(doc.publishedBy) : null,
    approvedAt: doc.approvedAt || null,
    approvedBy: doc.approvedBy ? String(doc.approvedBy) : null,
    archivedAt: doc.archivedAt || null,
    archivedBy: doc.archivedBy ? String(doc.archivedBy) : null,
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

/**
 * Whether a document record should be visible to a non-staff user.
 *
 * Students only see documents that are PUBLISHED and addressed to their cohort;
 * staff see everything because `requirePermission` already guards the
 * administrative routes.
 */
function documentIsVisibleToStudent(doc, context) {
  if (context.isStaff) return true;
  if (!doc || doc.lifecycleState !== "PUBLISHED") return false;
  return audienceMatchesStudent(doc.audience, context);
}

/**
 * Collects every version in a document's version chain.
 *
 * Versions link via `previousVersionId`, forming a tree. The chain is walked
 * backward to the root and then forward via BFS to gather all descendants, so
 * even branched revisions are returned. Results are sorted by `version`
 * ascending (oldest first).
 */
async function collectVersionHistory(docId) {
  const doc = await AcademicCalendarDocument.findById(docId).lean();
  if (!doc) return [];

  let root = doc;
  while (root.previousVersionId) {
    const parent = await AcademicCalendarDocument.findById(root.previousVersionId).lean();
    if (!parent) break;
    root = parent;
  }

  const versions = [root];
  const seen = new Set([String(root._id)]);
  const queue = [root];

  while (queue.length > 0 && versions.length < 100) {
    const current = queue.shift();
    const children = await AcademicCalendarDocument.find({
      previousVersionId: current._id,
    }).lean();
    for (const child of children) {
      const childId = String(child._id);
      if (seen.has(childId)) continue;
      seen.add(childId);
      versions.push(child);
      queue.push(child);
    }
  }

  return versions.sort((a, b) => (a.version || 1) - (b.version || 1));
}

export { serialiseEvent, serialiseDocument };
