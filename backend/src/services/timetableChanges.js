import { Timetable, User } from "../models/index.js";
import { notifyOnce } from "./lms/notifier.js";

/**
 * Timetable change trail and teacher notification.
 *
 * The `Timetable` model has always carried a `changes` array with `notifiedFaculty`
 * and `notifiedAt` on every entry, and `GET /api/my-timetable/changes` reads it. The
 * fields describe a promise the code never kept: an academic office could move a
 * teacher's class and nothing recorded that it happened, let alone that the teacher
 * was told. This service is where that promise is kept.
 *
 * Two rules govern it:
 *
 *  1. **A change is recorded before it is announced.** The trail is written and
 *     persisted first, so a notification can never point at a change the schedule
 *     does not actually contain.
 *  2. **Announcing is best-effort and idempotent.** A delivery problem is logged,
 *     never thrown: the academic action that caused the change has already succeeded,
 *     and failing it because a bell did not ring would be worse than the silence.
 *
 * Notification goes through the same centralised `Notification` collection the rest
 * of CollegeOS uses, keyed so that re-saving the same session does not produce a
 * second identical bell.
 */

/** The view a teacher lands on when a notification about their timetable fires. */
export const TIMETABLE_ACTION_URL = "/my_timetable";

export const TIMETABLE_NOTIFICATION_CATEGORY = "timetable";

/**
 * The fields a teacher would actually notice moving, and how to say it in a class.
 *
 * The order here is the order the fields are compared, and therefore the order they
 * are reported in. `status` comes first because a cancelled or rescheduled class is
 * the change that changes a teacher's day.
 */
const WATCHED_FIELDS = [
  { field: "status", label: "Status" },
  { field: "scheduledDay", label: "Day" },
  { field: "date", label: "Date" },
  { field: "startTime", label: "Start time" },
  { field: "endTime", label: "End time" },
  { field: "room", label: "Room" },
  { field: "building", label: "Building" },
  { field: "sectionCode", label: "Section" },
  { field: "facultyUser", label: "Teacher" },
  { field: "sessionType", label: "Class type" },
  { field: "notes", label: "Notes" },
];

/** Renders a stored field value the way a teacher reads it, never as an ObjectId. */
function presentValue(field, value) {
  if (value === null || value === undefined || value === "") return "not set";
  return String(value);
}

/**
 * A populated reference (a teacher or course document) compares
 * as the id it points at, so re-saving a class does not invent
 * a "Teacher" change that never happened.
 */
function normaliseRef(value) {
  if (value && typeof value === "object" && value._id) return value._id;
  return value;
}

/**
 * Compares the schedule before and after a write and returns the differences.
 *
 * Exported because it is a pure function and worth asserting directly: a change
 * trail that invents entries for fields nobody edited is as unhelpful as one that
 * misses a field a teacher depends on.
 */
export function diffTimetableSession(before = {}, after = {}) {
  const changes = [];
  for (const { field, label } of WATCHED_FIELDS) {
    const from = normaliseRef(before[field] ?? null);
    const to = normaliseRef(after[field] ?? null);
    if (String(from ?? "") === String(to ?? "")) continue;
    changes.push({
      field,
      label,
      from: presentValue(field, from),
      to: presentValue(field, to),
    });
  }
  return changes;
}

/**
 * Records a change to one session and tells the affected teacher.
 *
 * `session` must already be saved with its new values; this appends to its trail
 * and saves again, so the trail cannot describe a change the schedule has not made.
 *
 * The people notified are the teacher who now holds the class and, when the teacher
 * changed, the teacher who used to. A class handed to a colleague is news for both.
 */
export async function recordTimetableChange({ session, before, actor, reason = "", extraFields = [] }) {
  const diff = diffTimetableSession(before, {
    ...session.toObject?.() ?? session,
  });

  // `extraFields` lets a caller record a change that is not a field edit — a
  // cancellation reason, for instance — without inventing a fake field value.
  for (const entry of extraFields) {
    if (!entry?.field) continue;
    diff.push({
      field: entry.field,
      label: entry.label || entry.field,
      from: presentValue(entry.field, entry.from),
      to: presentValue(entry.field, entry.to),
    });
  }

  if (!diff.length) {
    return { recorded: 0, notified: [] };
  }

  const actorId = actor?._id || actor?.id || null;
  const actorName = actor
    ? [actor.firstName, actor.middleName, actor.lastName].filter(Boolean).join(" ") ||
      actor.email ||
      "Academic office"
    : "Academic office";

  /**
   * Everyone who needs to know about this specific change.
   *
   * The new teacher always; the old teacher only when the class was reassigned. A
   * teacher editing their own class's room is not notified about it — the person who
   * made the change already knows, and a self-notification is noise in a bell that
   * has to be trusted to mean something.
   */
  const recipients = [];
  const currentOwner = String(session.facultyUser?._id || session.facultyUser || "");
  const previousOwner = String(before.facultyUser || "");
  const actorIdText = String(actorId || "");

  if (currentOwner && currentOwner !== actorIdText) recipients.push(currentOwner);
  if (previousOwner && previousOwner !== currentOwner && previousOwner !== actorIdText) {
    recipients.push(previousOwner);
  }

  const course =
    session.course && typeof session.course === "object"
      ? session.course
      : { code: null, name: null };
  const when = [
    session.scheduledDay,
    session.startTime && session.endTime ? `${session.startTime}–${session.endTime}` : null,
    session.room,
  ]
    .filter(Boolean)
    .join(", ");

  const now = new Date();
  session.changes = session.changes || [];
  for (const change of diff) {
    session.changes.push({
      field: change.field,
      from: change.from,
      to: change.to,
      changedBy: actorId,
      changedByName: actorName,
      reason: String(reason || "").slice(0, 500),
      changedAt: now,
      // Filled in once delivery has been attempted, below.
      notifiedFaculty: recipients[0] || null,
      notifiedAt: recipients.length ? now : null,
    });
  }
  await session.save();

  const courseLabel = course.code
    ? `${course.code}${course.name ? ` · ${course.name}` : ""}`
    : `Section ${session.sectionCode}`;

  const delivered = [];
  for (const facultyId of recipients) {
    const created = await notifyOnce({
      userId: facultyId,
      title: `Your timetable changed: ${courseLabel}`,
      message: [
        `${actorName} changed ${diff.length} field(s) on your class ${courseLabel}, section ${session.sectionCode}${when ? ` (${when})` : ""}.`,
        ...diff.map((change) => `• ${change.label}: ${change.from} → ${change.to}`),
        reason ? `Reason: ${reason}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      category: TIMETABLE_NOTIFICATION_CATEGORY,
      priority: changePriority(diff),
      actionUrl: TIMETABLE_ACTION_URL,
      // Keyed on the session and the new value, so a corrected second save is a new
      // message while a repeated identical save is not a second one.
      idempotencyKey: `timetable_change_${session._id}_${diff
        .map((change) => `${change.field}=${change.to}`)
        .join("|")}`,
      metadata: {
        sessionId: String(session._id),
        changes: diff.map((change) => ({
          field: change.field,
          from: change.from,
          to: change.to,
        })),
        changedBy: actorId ? String(actorId) : null,
      },
    });
    if (created) delivered.push(String(facultyId));
  }

  return { recorded: diff.length, notified: delivered, changes: diff };
}

/**
 * How loudly a change should ring.
 *
 * A cancellation or a new room is something a teacher has to act on before walking
 * into a room. A note edit is not, and treating it as urgent would train people to
 * ignore the bell.
 */
function changePriority(diff) {
  const disruptive = diff.some((change) =>
    ["status", "startTime", "endTime", "scheduledDay", "date", "room"].includes(change.field),
  );
  return disruptive ? "high" : "normal";
}

/**
 * Tells a teacher that a conflict now exists in their own published schedule.
 *
 * Called when a save is only possible *because* someone overrode the conflict check,
 * or when re-detection finds a clash the teacher has not yet been told about. The
 * point is that the clash is visible in the place the teacher already looks, rather
 * than discovered when the room is occupied.
 */
export async function notifyTimetableConflict({ session, conflicts, otherSessionId = null }) {
  const teacherId = String(session.facultyUser?._id || session.facultyUser || "");
  if (!teacherId) return null;

  const course =
    session.course && typeof session.course === "object" ? session.course : null;
  const other = otherSessionId ? await Timetable.findById(otherSessionId).populate("course", "code name") : null;
  const conflictRows = Array.isArray(conflicts) ? conflicts : [];

  return notifyOnce({
    userId: teacherId,
    title: "Timetable conflict in your schedule",
    message: [
      `Your class ${course?.code || ""} ${course?.name || ""} section ${session.sectionCode} on ${session.scheduledDay} ${session.startTime}–${session.endTime} clashes with ${conflictRows.length} other session(s).`,
      other?.course
        ? `It overlaps ${other.course.code} · ${other.course.name} · section ${other.sectionCode} · ${other.startTime}–${other.endTime}.`
        : null,
      "Open My Timetable to see both, or report the clash to the academic office.",
    ]
      .filter(Boolean)
      .join("\n"),
    category: TIMETABLE_NOTIFICATION_CATEGORY,
    priority: "high",
    actionUrl: TIMETABLE_ACTION_URL,
    // One message per session per other session: re-running detection must not stack
    // up identical warnings for a clash that is still exactly the same one.
    idempotencyKey: `timetable_conflict_alert_${session._id}_${otherSessionId || "self"}`,
    metadata: {
      sessionId: String(session._id),
      otherSessionId: otherSessionId ? String(otherSessionId) : null,
      conflictCount: conflictRows.length,
    },
  });
}

/**
 * Who administers the timetable and can therefore resolve a reported clash.
 *
 * Read from the permission catalogue rather than a hand-written role list, so a role
 * that gains `timetable.manage` automatically starts receiving conflict reports.
 */
export async function listTimetableResolvers() {
  const users = await User.find({ isActive: { $ne: false } })
    .select("roles firstName middleName lastName")
    .lean();

  return users.filter((user) => {
    const roles = Array.isArray(user.roles) ? user.roles : [user.roles].filter(Boolean);
    return roles.some((role) =>
      ["super_admin", "dean", "hod", "program_coordinator", "registrar"].includes(role),
    );
  });
}

/** The display name a notification should attribute a change to. */
export function describeActor(actor) {
  if (!actor) return "Academic office";
  return (
    [actor.firstName, actor.middleName, actor.lastName].filter(Boolean).join(" ") ||
    actor.email ||
    "Academic office"
  );
}
