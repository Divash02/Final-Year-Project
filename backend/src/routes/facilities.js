import { randomUUID } from "node:crypto";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { AuditLog, Building, FacilityAsset, FacilityLab, FacilityMaintenanceRequest, FacilityReservation, TransportRoute, TransportVehicle } from "../models/index.js";
import { Room } from "../models/index.js";
import { badRequest, conflict, notFound } from "../utils/apiError.js";

const ROOM_STATUSES = ["Available", "Occupied", "Reserved", "Maintenance", "Unavailable", "Ready"];

function parseTimeToMinutes(value) {
  if (!value || typeof value !== "string") return 0;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return -1;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isOverlapping(startMinutesA, endMinutesA, startMinutesB, endMinutesB) {
  return startMinutesA < endMinutesB && endMinutesA > startMinutesB;
}

async function acquireRoomBookingLock(roomId) {
  const token = randomUUID();
  const staleBefore = new Date(Date.now() - 30000);
  const room = await Room.findOneAndUpdate(
    {
      _id: roomId,
      $or: [
        { bookingLockId: null },
        { bookingLockId: { $exists: false } },
        { bookingLockAt: { $lt: staleBefore } },
      ],
    },
    { $set: { bookingLockId: token, bookingLockAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!room) throw conflict("Room booking is being processed. Please retry shortly.");
  return token;
}

async function releaseRoomBookingLock(roomId, token) {
  await Room.updateOne(
    { _id: roomId, bookingLockId: token },
    { $unset: { bookingLockId: 1, bookingLockAt: 1 } },
  );
}

async function auditFacilityBooking(req, action, reservation, oldStatus = null) {
  await AuditLog.create({
    user: req.user._id || req.user.id,
    action,
    module: "facilities",
    resource: "FacilityReservation",
    resourceId: String(reservation._id),
    details: `Facility booking ${action.toLowerCase()} by ${req.user.email || "user"}.`,
    oldValue: oldStatus ? { status: oldStatus } : null,
    newValue: { status: reservation.status, roomId: String(reservation.roomId), date: reservation.date, startTime: reservation.startTime, endTime: reservation.endTime },
    ipAddress: req.ip,
  });
}

export function registerFacilitiesRoutes(app) {
  app.get(
    "/api/facilities/dashboard",
    requireAuth,
    requirePermission("facilities.view"),
    asyncHandler(async (_req, res) => {
      const [
        totalBuildings,
        totalRooms,
        availableRooms,
        occupiedRooms,
        activeLabs,
        pendingReservations,
        pendingMaintenance,
        openWorkOrders,
        totalRegisteredAssets,
        assetsUnderMaintenance,
        activeVehicles,
        recentMaintenance,
        upcomingReservations,
        recentAssetActivities,
      ] = await Promise.all([
        Building.countDocuments(),
        Room.countDocuments(),
        Room.countDocuments({ status: { $in: ["Available", "Ready"] } }),
        Room.countDocuments({ status: "Occupied" }),
        FacilityLab.countDocuments({ status: "Active" }),
        FacilityReservation.countDocuments({ status: "Pending" }),
        FacilityMaintenanceRequest.countDocuments({ status: { $in: ["Reported", "Submitted", "Under Review", "Assigned", "In Progress"] } }),
        FacilityMaintenanceRequest.countDocuments({ status: { $in: ["Reported", "Submitted", "Under Review", "Assigned", "In Progress"] } }),
        FacilityAsset.countDocuments(),
        FacilityAsset.countDocuments({ status: "Under Maintenance" }),
        TransportVehicle.countDocuments({ status: "Active" }),
        FacilityMaintenanceRequest.find().sort({ createdAt: -1 }).limit(5).lean(),
        FacilityReservation.find({ status: "Approved" }).sort({ date: 1, startMinutes: 1 }).limit(5).lean(),
        FacilityAsset.find().sort({ updatedAt: -1 }).limit(5).lean(),
      ]);

      const dashboard = {
        metrics: {
          totalBuildings,
          totalRooms,
          availableRooms,
          occupiedRooms,
          activeLabs,
          pendingReservations,
          pendingMaintenance,
          openWorkOrders,
          totalRegisteredAssets: totalRegisteredAssets,
          assetsUnderMaintenance,
          activeVehicles,
        },
        recentMaintenance,
        upcomingReservations,
        recentAssetActivities,
      };

      res.json(dashboard);
    }),
  );

  app.get(
    "/api/facilities/buildings",
    requireAuth,
    requirePermission("facilities.view"),
    asyncHandler(async (_req, res) => {
      const buildings = await Building.find().sort({ createdAt: -1 }).lean();
      const enriched = await Promise.all(
        buildings.map(async (building) => {
          const roomCount = await Room.countDocuments({ buildingId: building._id });
          return { ...building, roomCount };
        }),
      );
      res.json({ buildings: enriched });
    }),
  );

  app.post(
    "/api/facilities/buildings",
    requireAuth,
    requirePermission("facilities.manage"),
    asyncHandler(async (req, res) => {
      const { name, code, campus, floors, description, status, details } = req.body || {};
      if (!name || !code) {
        return res.status(400).json({ error: "Building name and code are required." });
      }

      const building = await Building.create({
        name,
        code: String(code).trim().toUpperCase(),
        campus: campus || "Main Campus",
        floors: Number(floors) || 1,
        description: description || "",
        status: status || "Active",
        details: details || description || "",
      });

      res.status(201).json({ building });
    }),
  );

  app.put(
    "/api/facilities/buildings/:id",
    requireAuth,
    requirePermission("facilities.manage"),
    asyncHandler(async (req, res) => {
      const building = await Building.findById(req.params.id);
      if (!building) {
        return res.status(404).json({ error: "Building not found." });
      }

      Object.assign(building, req.body);
      await building.save();
      res.json({ building });
    }),
  );

  app.get(
    "/api/facilities/rooms",
    requireAuth,
    requirePermission("facilities.view"),
    asyncHandler(async (_req, res) => {
      const rooms = await Room.find().sort({ createdAt: -1 }).populate("buildingId", "name code campus").lean();
      res.json({ rooms });
    }),
  );

  app.post(
    "/api/facilities/rooms",
    requireAuth,
    requirePermission("facilities.manage"),
    asyncHandler(async (req, res) => {
      const {
        buildingId,
        roomNumber,
        name,
        floor,
        roomType,
        capacity,
        facilities,
        status,
        description,
        openingTime,
        closingTime,
      } = req.body || {};

      if (!buildingId || !roomNumber) {
        return res.status(400).json({ error: "Building and room number are required." });
      }
      if (status !== undefined && !ROOM_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Invalid room status." });
      }

      const building = await Building.findById(buildingId);
      if (!building) {
        return res.status(404).json({ error: "Building not found." });
      }

      const room = await Room.create({
        buildingId,
        building: building.name,
        block: building.code,
        floor: floor || "Ground",
        roomNumber: String(roomNumber).trim(),
        name: name || `Room ${roomNumber}`,
        capacity: Number(capacity) || 0,
        campus: building.campus,
        facilities: Array.isArray(facilities) ? facilities : [],
        roomType: roomType || "Classroom",
        status: status || "Available",
        isAvailable: ["Available", "Ready"].includes(status || "Available"),
        description: description || "",
        code: String(roomNumber).trim(),
        openingTime: openingTime || "08:00",
        closingTime: closingTime || "18:00",
        isActive: true,
      });

      res.status(201).json({ room });
    }),
  );

  app.patch(
    "/api/facilities/rooms/:id/status",
    requireAuth,
    requirePermission("facilities.manage"),
    asyncHandler(async (req, res) => {
      const { status } = req.body || {};
      if (!ROOM_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Invalid room status." });
      }

      const room = await Room.findById(req.params.id);
      if (!room) {
        return res.status(404).json({ error: "Room not found." });
      }

      room.status = status;
      room.isAvailable = ["Available", "Ready"].includes(status);
      await room.save();
      res.json({ room });
    }),
  );

  app.get(
    "/api/facilities/labs",
    requireAuth,
    requirePermission("facilities.view"),
    asyncHandler(async (_req, res) => {
      const labs = await FacilityLab.find().populate("buildingId", "name code campus").populate("roomId", "name roomNumber").sort({ createdAt: -1 }).lean();
      res.json({ labs });
    }),
  );

  app.post(
    "/api/facilities/labs",
    requireAuth,
    requirePermission("facilities.manage"),
    asyncHandler(async (req, res) => {
      const { name, code, buildingId, roomId, department, laboratoryType, capacity, supervisor, status, facilities, notes } = req.body || {};
      if (!name || !code || !buildingId) {
        return res.status(400).json({ error: "Lab name, code and building are required." });
      }

      const lab = await FacilityLab.create({
        name,
        code: String(code).trim().toUpperCase(),
        buildingId,
        roomId: roomId || null,
        department: department || "",
        laboratoryType: laboratoryType || "Other",
        capacity: Number(capacity) || 0,
        supervisor: supervisor || "",
        status: status || "Active",
        facilities: Array.isArray(facilities) ? facilities : [],
        notes: notes || "",
      });

      res.status(201).json({ lab });
    }),
  );

  app.get(
    "/api/facilities/reservations",
    requireAuth,
    requirePermission("facilities.view"),
    asyncHandler(async (req, res) => {
      const elevated = (req.user.roles || [req.user.activeRole]).some((role) => ["super_admin", "campus_admin", "dean", "hod", "registrar"].includes(role));
      const filter = elevated ? {} : { requestedBy: req.user._id || req.user.id };
      if (req.query.status) filter.status = req.query.status;
      if (req.query.roomId) filter.roomId = req.query.roomId;
      const reservations = await FacilityReservation.find(filter).populate("roomId", "name roomNumber building code").populate("buildingId", "name campus").populate("requestedBy", "firstName lastName email").sort({ date: 1, startMinutes: 1 }).lean();
      res.json({ reservations });
    }),
  );

  app.post(
    "/api/facilities/reservations",
    requireAuth,
    requirePermission("facilities.request"),
    asyncHandler(async (req, res) => {
      const { roomId, date, startTime, endTime, purpose, department, expectedParticipants, requiredEquipment, bookingType, supportingDocument } = req.body || {};
      if (!roomId || !date || !startTime || !endTime) {
        throw badRequest("Room, date and time window are required.");
      }

      const room = await Room.findById(roomId).lean();
      if (!room) throw notFound("Room not found.");
      if (room.isActive === false || room.status === "Maintenance" || room.status === "Unavailable") throw conflict("Room is unavailable for reservation.");

      const startMinutes = parseTimeToMinutes(startTime);
      const endMinutes = parseTimeToMinutes(endTime);
      const defaultOpen = parseTimeToMinutes(room.openingTime || "08:00");
      const defaultClose = parseTimeToMinutes(room.closingTime || "18:00");

      if (startMinutes < 0 || endMinutes < 0 || startMinutes < defaultOpen || endMinutes > defaultClose || startMinutes >= endMinutes) {
        throw badRequest("Reservation must use valid times within the room's configured operating hours.");
      }
      const participants = Number(expectedParticipants || 1);
      if (!Number.isInteger(participants) || participants < 1) throw badRequest("Expected participants must be a positive whole number.");
      if (room.capacity > 0 && participants > room.capacity) throw conflict("Expected participants exceed this room's capacity.");
      const selectedDate = new Date(`${String(date).slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(selectedDate.getTime()) || selectedDate.toISOString().slice(0, 10) !== String(date).slice(0, 10) || selectedDate < new Date(new Date().toISOString().slice(0, 10))) {
        throw badRequest("Booking date must be a valid date that is not in the past.");
      }

      const lockToken = await acquireRoomBookingLock(roomId);
      try {
        const sameDayStart = selectedDate;
        const sameDayEnd = new Date(selectedDate.getTime() + 86400000);
        const conflicts = await FacilityReservation.find({
          roomId,
          date: { $gte: sameDayStart, $lt: sameDayEnd },
          status: { $in: ["Pending", "Approved"] },
          startMinutes: { $lt: endMinutes },
          endMinutes: { $gt: startMinutes },
        }).select("_id").limit(1).lean();
        if (conflicts.length) throw conflict("This room already has a pending or approved reservation for the requested time.");
        const activeMaintenance = await FacilityMaintenanceRequest.exists({
          roomId,
          status: { $in: ["Reported", "Submitted", "Under Review", "Assigned", "In Progress"] },
        });
        if (activeMaintenance) throw conflict("This room has an active maintenance closure.");

        const reservation = await FacilityReservation.create({
          roomId,
          buildingId: room.buildingId || null,
          requestedBy: req.user._id || req.user.id,
          requesterName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim(),
          date: selectedDate,
          startTime,
          endTime,
          startMinutes,
          endMinutes,
          purpose: String(purpose || "").trim(),
          department: String(department || "").trim(),
          expectedParticipants: participants,
          requiredEquipment: Array.isArray(requiredEquipment) ? requiredEquipment.map(String) : [],
          bookingType: String(bookingType || "Internal Event").trim(),
          supportingDocument: String(supportingDocument || "").trim(),
          status: "Pending",
          notes: "",
          history: [{ action: "Submitted", note: "Reservation requested", actor: req.user.email || "System" }],
        });
        await auditFacilityBooking(req, "SUBMITTED", reservation);
        res.status(201).json({ reservation });
      } finally {
        await releaseRoomBookingLock(roomId, lockToken);
      }
    }),
  );

  app.patch(
    "/api/facilities/reservations/:id/status",
    requireAuth,
    requirePermission("facilities.manage"),
    asyncHandler(async (req, res) => {
      const { status } = req.body || {};
      if (!["Approved", "Rejected", "Cancelled", "Completed"].includes(status)) throw badRequest("Invalid reservation status transition.");
      const reservation = await FacilityReservation.findById(req.params.id);
      if (!reservation) throw notFound("Reservation not found.");
      const oldStatus = reservation.status;
      const transitions = {
        Pending: ["Approved", "Rejected", "Cancelled"],
        Approved: ["Cancelled", "Completed"],
      };
      if (!transitions[oldStatus]?.includes(status)) throw conflict(`Cannot change booking status from ${oldStatus} to ${status}.`);

      const lockToken = await acquireRoomBookingLock(reservation.roomId);
      try {
        if (status === "Approved") {
          const room = await Room.findById(reservation.roomId).lean();
          if (!room || room.status === "Maintenance" || room.status === "Unavailable" || room.isActive === false) throw conflict("Room is not available for approval.");
          if (room.capacity > 0 && reservation.expectedParticipants > room.capacity) throw conflict("Booking participants exceed the room capacity.");
          const activeMaintenance = await FacilityMaintenanceRequest.exists({
            roomId: reservation.roomId,
            status: { $in: ["Reported", "Submitted", "Under Review", "Assigned", "In Progress"] },
          });
          if (activeMaintenance) throw conflict("Room has an active maintenance closure.");
          const overlap = await FacilityReservation.exists({
            _id: { $ne: reservation._id },
            roomId: reservation.roomId,
            date: { $gte: new Date(new Date(reservation.date).toISOString().slice(0, 10)), $lt: new Date(new Date(reservation.date).toISOString().slice(0, 10) + "T00:00:00.000Z").getTime() + 86400000 },
            status: "Approved",
            startMinutes: { $lt: reservation.endMinutes },
            endMinutes: { $gt: reservation.startMinutes },
          });
          if (overlap) throw conflict("Another approved booking overlaps this reservation.");
        }
        reservation.status = status;
        reservation.history.push({
          action: status,
          note: String(req.body.reason || req.body.notes || "").trim(),
          actor: req.user.email || "System",
        });
        await reservation.save();
        await auditFacilityBooking(req, status.toUpperCase(), reservation, oldStatus);
        res.json({ reservation });
      } finally {
        await releaseRoomBookingLock(reservation.roomId, lockToken);
      }
    }),
  );

  app.get(
    "/api/facilities/maintenance",
    requireAuth,
    requirePermission("facilities.view"),
    asyncHandler(async (_req, res) => {
      const maintenance = await FacilityMaintenanceRequest.find().populate("buildingId", "name code").populate("roomId", "name roomNumber").sort({ createdAt: -1 }).lean();
      res.json({ maintenance });
    }),
  );

  app.post(
    "/api/facilities/maintenance",
    requireAuth,
    requirePermission("facilities.manage"),
    asyncHandler(async (req, res) => {
      const { title, description, buildingId, roomId, category, priority, requester } = req.body || {};
      if (!title || !description) {
        return res.status(400).json({ error: "Title and description are required." });
      }

      const maintenance = await FacilityMaintenanceRequest.create({
        title,
        description,
        buildingId: buildingId || null,
        roomId: roomId || null,
        category: category || "Other",
        priority: priority || "Medium",
        requester: requester || req.user._id || req.user.id,
        status: "Submitted",
        reportedDate: new Date(),
        history: [{ action: "Submitted", note: "Maintenance request created", actor: req.user.email || "System" }],
      });

      if (roomId) {
        const room = await Room.findById(roomId);
        if (room) {
          room.status = "Maintenance";
          room.isAvailable = false;
          await room.save();
        }
      }

      res.status(201).json({ maintenance });
    }),
  );

  app.patch(
    "/api/facilities/maintenance/:id",
    requireAuth,
    requirePermission("facilities.manage"),
    asyncHandler(async (req, res) => {
      const { status, assignedTechnician, notes, workPerformed, completionDetails } = req.body || {};
      const maintenance = await FacilityMaintenanceRequest.findById(req.params.id);
      if (!maintenance) {
        return res.status(404).json({ error: "Maintenance request not found." });
      }

      if (status) maintenance.status = status;
      if (assignedTechnician) maintenance.assignedTechnician = assignedTechnician;
      if (notes) maintenance.notes = notes;
      if (workPerformed) maintenance.workPerformed = workPerformed;
      if (completionDetails) maintenance.completionDetails = completionDetails;

      maintenance.history.push({ action: status || "Updated", note: notes || "Maintenance workflow updated", actor: req.user.email || "System" });
      await maintenance.save();
      res.json({ maintenance });
    }),
  );

  app.get(
    "/api/facilities/assets",
    requireAuth,
    requirePermission("facilities.view"),
    asyncHandler(async (_req, res) => {
      const assets = await FacilityAsset.find().sort({ createdAt: -1 }).lean();
      res.json({ assets });
    }),
  );

  app.post(
    "/api/facilities/assets",
    requireAuth,
    requirePermission("facilities.manage"),
    asyncHandler(async (req, res) => {
      const { name, tag, category, description, serialNumber, status, condition, department, buildingId, roomId, quantity, minimumStockLevel, purchaseCost } = req.body || {};
      if (!name || !tag) {
        return res.status(400).json({ error: "Asset name and tag are required." });
      }

      const asset = await FacilityAsset.create({
        name,
        tag: String(tag).trim().toUpperCase(),
        category: category || "Other",
        description: description || "",
        serialNumber: serialNumber || "",
        status: status || "Registered",
        condition: condition || "Good",
        department: department || "",
        buildingId: buildingId || null,
        roomId: roomId || null,
        quantity: Number(quantity) || 1,
        availableQuantity: Number(quantity) || 1,
        minimumStockLevel: Number(minimumStockLevel) || 0,
        purchaseCost: purchaseCost ?? null,
      });

      res.status(201).json({ asset });
    }),
  );

  app.get(
    "/api/facilities/transport",
    requireAuth,
    requirePermission("facilities.view"),
    asyncHandler(async (_req, res) => {
      const [vehicles, routes] = await Promise.all([
        TransportVehicle.find().sort({ createdAt: -1 }).lean(),
        TransportRoute.find().sort({ createdAt: -1 }).lean(),
      ]);
      res.json({ vehicles, routes });
    }),
  );

  app.post(
    "/api/facilities/transport/vehicles",
    requireAuth,
    requirePermission("facilities.manage"),
    asyncHandler(async (req, res) => {
      const { registrationNumber, vehicleType, makeModel, capacity, status, assignedDriver, maintenanceStatus } = req.body || {};
      if (!registrationNumber) {
        return res.status(400).json({ error: "Registration number is required." });
      }

      const vehicle = await TransportVehicle.create({
        registrationNumber: String(registrationNumber).trim().toUpperCase(),
        vehicleType: vehicleType || "Bus",
        makeModel: makeModel || "",
        capacity: Number(capacity) || 0,
        status: status || "Active",
        assignedDriver: assignedDriver || "",
        maintenanceStatus: maintenanceStatus || "Healthy",
      });

      res.status(201).json({ vehicle });
    }),
  );

  app.post(
    "/api/facilities/transport/routes",
    requireAuth,
    requirePermission("facilities.manage"),
    asyncHandler(async (req, res) => {
      const { name, code, startPoint, destination, stops, estimatedSchedule, assignedDriver, status } = req.body || {};
      if (!name || !code || !startPoint || !destination) {
        return res.status(400).json({ error: "Route name, code, start and destination are required." });
      }

      const route = await TransportRoute.create({
        name,
        code: String(code).trim().toUpperCase(),
        startPoint,
        destination,
        stops: Array.isArray(stops) ? stops : [],
        estimatedSchedule: estimatedSchedule || "",
        assignedDriver: assignedDriver || "",
        status: status || "Planned",
      });

      res.status(201).json({ route });
    }),
  );
}
