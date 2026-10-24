import { Room } from "../models/index.js";
import { logAudit } from "../db.js";

/**
 * Exam venue & seating management.
 *
 * The institution's examination venue master data is defined here as a
 * single source of truth. Seeding is idempotent: rooms are matched on the
 * Room collection's unique key (building + roomNumber + campus) and only
 * missing records are inserted. Existing venues — including any capacity or
 * status an operator has customised — are never overwritten.
 */

export const EXAM_VENUES = [
  // Block A
  { block: "Block A", floor: "Ground Floor", roomName: "Kinabalu", capacity: 60 },
  { block: "Block A", floor: "Ground Floor", roomName: "Putrajaya", capacity: 40 },
  { block: "Block A", floor: "Ground Floor", roomName: "Bera", capacity: 40 },
  // Block B — Floor 1
  { block: "Block B", floor: "Floor 1", roomName: "Everest", capacity: 60 },
  { block: "Block B", floor: "Floor 1", roomName: "Annapurna", capacity: 60 },
  { block: "Block B", floor: "Floor 1", roomName: "Macchapuchre", capacity: 60 },
  // Block B — Floor 2
  { block: "Block B", floor: "Floor 2", roomName: "Badimalika", capacity: 60 },
  { block: "Block B", floor: "Floor 2", roomName: "Suklaphata", capacity: 60 },
  { block: "Block B", floor: "Floor 2", roomName: "Khaptad", capacity: 60 },
  // Block C — Top Floor
  { block: "Block C", floor: "Top Floor", roomName: "Sagarmatha", capacity: 60 },
  { block: "Block C", floor: "Top Floor", roomName: "Saipal", capacity: 60 },
  // Block C — First Floor
  { block: "Block C", floor: "First Floor", roomName: "Rara", capacity: 40 },
  { block: "Block C", floor: "First Floor", roomName: "Phewa", capacity: 40 },
  { block: "Block C", floor: "First Floor", roomName: "Tilicho", capacity: 40 },
  { block: "Block C", floor: "First Floor", roomName: "Algospace", capacity: 40 },
  // Block C — Second Floor
  { block: "Block C", floor: "Second Floor", roomName: "Manaslu", capacity: 60 },
  { block: "Block C", floor: "Second Floor", roomName: "Makalu", capacity: 60 },
];

export function venueDisplayName(venue) {
  return `${venue.block} · ${venue.roomName}`;
}

/**
 * Idempotently seeds the institutional examination venues.
 *
 * Each venue is upserted on its natural key with `$setOnInsert`, so a
 * restart can never duplicate a room and can never silently overwrite an
 * existing room's capacity, active status, or facilities.
 *
 * Returns the persisted rooms.
 */
export async function seedExamVenues({ actorUserId = null } = {}) {
  let inserted = 0;
  for (const venue of EXAM_VENUES) {
    const name = venueDisplayName(venue);
    // Upsert on the Room collection's natural unique key. `$setOnInsert`
    // guarantees an existing venue is never overwritten, so a repeat run
    // is always safe and never duplicates.
    const result = await Room.updateOne(
      {
        building: venue.block,
        roomNumber: venue.roomName,
        campus: "Main Campus",
      },
      {
        $setOnInsert: {
          building: venue.block,
          block: venue.block,
          floor: venue.floor,
          roomNumber: venue.roomName,
          name,
          capacity: venue.capacity,
          campus: "Main Campus",
          facilities: ["CCTV", "Exam Hall"],
          isActive: true,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    if (result.upsertedId) inserted += 1;
  }

  if (inserted > 0 && actorUserId) {
    await logAudit({
      userId: actorUserId,
      action: "EXAM_VENUES_SEEDED",
      module: "examinations",
      resource: "exam_venue",
      resourceId: null,
      newValue: { seeded: inserted },
      details: `Seeded ${inserted} examination venue(s) into the venue registry.`,
    });
  }

  return Room.find({}).sort({ block: 1, floor: 1, roomNumber: 1 });
}

/**
 * Lists all venues grouped by block and floor for the venue manager UI.
 */
export async function listVenueStructure({ includeInactive = true } = {}) {
  const filter = includeInactive ? {} : { isActive: true };
  const rooms = await Room.find(filter).sort({ block: 1, floor: 1, roomNumber: 1 });
  return rooms.map((r) => ({
    id: r._id.toString(),
    _id: r._id.toString(),
    block: r.block || r.building,
    building: r.building,
    floor: r.floor || "",
    roomName: r.roomNumber,
    roomNumber: r.roomNumber,
    name: r.name || `${r.building} · ${r.roomNumber}`,
    capacity: r.capacity,
    isActive: r.isActive,
    facilities: r.facilities || [],
  }));
}
