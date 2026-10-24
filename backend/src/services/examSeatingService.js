import {
  Exam,
  ExamSeatingPlan,
  Course,
  Student,
  Room,
} from "../models/index.js";
import { logAudit } from "../db.js";
import {
  resolveCandidateAudience,
  validateRoomCapacityAndConflicts,
  createIdempotentNotification,
} from "./examWorkflowService.js";
import {
  buildKathmanduDateTime,
  calculateExamDuration,
  convertToNepaliDate,
} from "./nepaliDateHelper.js";

/**
 * Examination seating management.
 *
 * Core invariants enforced here:
 *  - every eligible student in the selected semester is sorted into ONE
 *    continuous alphabetical list (case-insensitive name, studentId as
 *    stable tie-breaker) — never per section;
 *  - allocation walks that list sequentially across the selected rooms in
 *    the order chosen by the Exam Officer, continuing across room
 *    boundaries without restarting;
 *  - two-seat benches pair consecutive students (Seat 1 / Seat 2), so a
 *    60-seat room yields 30 benches unless a layout says otherwise;
 *  - no student is assigned twice and no eligible student is omitted;
 *  - publication is blocked until capacity covers every eligible student;
 *  - every mutation is audited with actor, timestamp and change summary;
 *  - scheduled publication is executed server-side and is idempotent.
 */

const SEATS_PER_BENCH = 2;

/* ------------------------------------------------------------------ */
/* Allocation primitives                                               */
/* ------------------------------------------------------------------ */

/**
 * Sorts candidates into one continuous alphabetical list.
 * Case-insensitive official name A–Z, studentId as stable tie-breaker.
 */
export function sortCandidatesAlphabetically(candidates) {
  return [...candidates].sort((a, b) => {
    const nameA = String(a.fullName || "").trim().toLowerCase();
    const nameB = String(b.fullName || "").trim().toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    const idA = String(a.studentId || "").trim();
    const idB = String(b.studentId || "").trim();
    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
  });
}

/**
 * Allocates a sorted candidate list sequentially across rooms.
 * The sequence continues across room boundaries without restarting.
 */
export function allocateSeatsSequentially(
  sortedCandidates,
  rooms,
  seatsPerBench = SEATS_PER_BENCH
) {
  const roomAllocations = rooms.map((r) => ({
    room: r.room || r._id || r.id || null,
    building: r.building || "Block A",
    block: r.block || r.building || "Block A",
    floor: r.floor || "",
    roomNumber: r.roomNumber || r.roomName || "",
    name: r.name || `${r.building || "Block A"} · ${r.roomNumber || r.roomName || ""}`,
    capacity: Number(r.capacity || 40),
    benchCount: 0,
    assignedCount: 0,
    seatAssignments: [],
  }));

  let index = 0;
  for (const roomAlloc of roomAllocations) {
    const maxSeats = roomAlloc.capacity;
    while (roomAlloc.seatAssignments.length < maxSeats && index < sortedCandidates.length) {
      const candidate = sortedCandidates[index];
      const seatInRoom = roomAlloc.seatAssignments.length + 1;
      roomAlloc.seatAssignments.push({
        student: candidate.student,
        studentUser: candidate.studentUser,
        studentId: candidate.studentId,
        rollNumber: candidate.rollNumber || candidate.studentId,
        fullName: candidate.fullName,
        program: candidate.program,
        semester: candidate.semester,
        section: candidate.section,
        room: roomAlloc.room,
        building: roomAlloc.building,
        roomNumber: roomAlloc.roomNumber,
        name: roomAlloc.name,
        capacity: roomAlloc.capacity,
        benchNumber: Math.ceil(seatInRoom / seatsPerBench),
        seatNumber: ((seatInRoom - 1) % seatsPerBench) + 1,
        isEligible: candidate.isEligible !== false,
        eligibilityReason: candidate.eligibilityReason || "Eligible for Examination",
      });
      index += 1;
    }
    roomAlloc.assignedCount = roomAlloc.seatAssignments.length;
    roomAlloc.benchCount = Math.ceil(roomAlloc.assignedCount / seatsPerBench);
  }

  return {
    roomAllocations,
    allocatedCount: index,
    unallocated: sortedCandidates.slice(index),
  };
}

/** Deterministic PRNG so a shuffle is reproducible from its seed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle driven by a deterministic seed. */
export function shuffleCandidates(candidates, seed) {
  const arr = [...candidates];
  const rand = mulberry32(Number.isFinite(seed) ? seed : 1);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Recomputes bench/seat numbers for one room after a mutation. */
export function renumberRoomAllocation(roomAlloc, seatsPerBench = SEATS_PER_BENCH) {
  (roomAlloc.seatAssignments || []).forEach((assignment, i) => {
    const seatInRoom = i + 1;
    assignment.benchNumber = Math.ceil(seatInRoom / seatsPerBench);
    assignment.seatNumber = ((seatInRoom - 1) % seatsPerBench) + 1;
  });
  roomAlloc.assignedCount = (roomAlloc.seatAssignments || []).length;
  roomAlloc.benchCount = Math.ceil(roomAlloc.assignedCount / seatsPerBench);
  return roomAlloc;
}

/* ------------------------------------------------------------------ */
/* Eligibility resolution                                              */
/* ------------------------------------------------------------------ */

/**
 * Resolves the eligible candidate set for a semester/scope using the
 * institution's existing enrollment and eligibility rules.
 */
export async function resolveEligibleCandidates({
  program = "BCA",
  semester = 1,
  courseId = null,
  candidateScope = "SEMESTER_WIDE",
  sectionCode = "ALL",
  batch = "2025",
}) {
  const { candidates, candidateCount, sectionBreakdown } = await resolveCandidateAudience({
    program,
    semester: Number(semester),
    courseId,
    candidateScope,
    sectionCode,
    batch,
  });

  const eligibleCandidates = candidates.filter((c) => c.isEligible !== false);
  return {
    allCandidates: candidates,
    eligibleCandidates,
    eligibleCount: eligibleCandidates.length,
    candidateCount,
    sectionBreakdown,
  };
}

/* ------------------------------------------------------------------ */
/* Room availability & conflict detection                              */
/* ------------------------------------------------------------------ */

/**
 * Finds scheduling conflicts for rooms over an interval, against both
 * scheduled examinations and other published/scheduled seating plans.
 * Returns a list of conflict descriptors (empty when clear).
 */
export async function findSeatingConflicts({
  planId = null,
  examId = null,
  rooms = [],
  startDateTime,
  endDateTime,
}) {
  if (!startDateTime || !endDateTime) return [];

  const start = new Date(startDateTime);
  const end = new Date(endDateTime);
  const roomNames = rooms.map((r) => r.name).filter(Boolean);
  const conflicts = [];

  const examFilter = {
    status: { $in: ["SCHEDULED", "PUBLISHED", "RESCHEDULED", "IN_PROGRESS"] },
    startDateTime: { $lt: end },
    endDateTime: { $gt: start },
  };
  if (examId) examFilter._id = { $ne: examId };
  const overlappingExams = await Exam.find(examFilter);
  for (const other of overlappingExams) {
    const otherRooms = (other.rooms || []).map((r) => r.name).filter(Boolean);
    if (otherRooms.length === 0 && other.room) otherRooms.push(other.room);
    const hit = roomNames.filter((n) => otherRooms.includes(n));
    if (hit.length > 0) {
      conflicts.push({
        source: "examination",
        referenceId: other._id.toString(),
        title: other.title,
        rooms: hit,
        examDate: other.examDate,
        startTime: other.startTime,
        endTime: other.endTime,
      });
    }
  }

  const planFilter = {
    status: { $in: ["SCHEDULED", "PUBLISHED"] },
  };
  if (planId) planFilter._id = { $ne: planId };
  const otherPlans = await ExamSeatingPlan.find(planFilter);
  for (const other of otherPlans) {
    const otherStart = buildKathmanduDateTime(other.examDate, other.startTime);
    const otherEnd = buildKathmanduDateTime(other.examDate, other.endTime);
    if (!otherStart || !otherEnd) continue;
    if (otherStart >= end || otherEnd <= start) continue;
    const otherRooms = (other.roomAllocations || []).map((r) => r.name).filter(Boolean);
    const hit = roomNames.filter((n) => otherRooms.includes(n));
    if (hit.length > 0) {
      conflicts.push({
        source: "seatingPlan",
        referenceId: other._id.toString(),
        title: other.title,
        rooms: hit,
        examDate: other.examDate,
        startTime: other.startTime,
        endTime: other.endTime,
      });
    }
  }

  return conflicts;
}

/* ------------------------------------------------------------------ */
/* Plan validation                                                     */
/* ------------------------------------------------------------------ */

export function validatePlanForPublication(plan) {
  const errors = [];
  const roomAllocations = plan.roomAllocations || [];
  const totalCapacity = roomAllocations.reduce((sum, r) => sum + Number(r.capacity || 0), 0);
  const allocated = roomAllocations.reduce((sum, r) => sum + (r.seatAssignments || []).length, 0);
  const eligible = plan.totalEligibleStudents || 0;

  if (eligible > 0 && allocated < eligible) {
    errors.push(
      `Insufficient seating: ${eligible} eligible students but only ${allocated} seats allocated. ` +
        `${eligible - allocated} additional seat(s) required before publication.`
    );
  }
  if (eligible > 0 && totalCapacity < eligible) {
    errors.push(
      `Selected rooms provide ${totalCapacity} seats for ${eligible} eligible students; ` +
        `${eligible - totalCapacity} additional seat(s) are required.`
    );
  }

  const seen = new Set();
  for (const roomAlloc of roomAllocations) {
    for (const assignment of roomAlloc.seatAssignments || []) {
      const key = String(assignment.studentUser || assignment.student);
      if (seen.has(key)) {
        errors.push(
          `Duplicate assignment: student ${assignment.studentId} (${assignment.fullName}) appears more than once.`
        );
      }
      seen.add(key);
    }
    if ((roomAlloc.seatAssignments || []).length > Number(roomAlloc.capacity || 0)) {
      errors.push(
        `Room "${roomAlloc.name}" has ${roomAlloc.seatAssignments.length} assignments against a capacity of ${roomAlloc.capacity}.`
      );
    }
  }

  if (errors.length > 0) {
    const error = new Error(errors.join(" "));
    error.code = "SEATING_VALIDATION_FAILED";
    error.details = errors;
    throw error;
  }

  return { totalCapacity, allocated, eligible };
}

/**
 * Guards mutations: cancelled plans are frozen, completed examinations
 * are historical, and published plans may only change through an
 * authorized, reasoned revision workflow.
 */
async function assertMutable(plan, { revisionReason = null } = {}) {
  if (plan.status === "CANCELLED") {
    throw new Error("Cannot modify a cancelled seating plan.");
  }

  const linkedExam = plan.exam ? await Exam.findById(plan.exam) : null;
  if (linkedExam && linkedExam.status === "COMPLETED") {
    throw new Error("Cannot modify seating for a completed examination.");
  }

  if (plan.status === "PUBLISHED") {
    if (!revisionReason || String(revisionReason).trim().length < 5) {
      throw new Error(
        "This seating plan is published. An authorized revision reason (at least 5 characters) is required to change it; the plan will then require republishing."
      );
    }
  }
}

/** A published plan that is mutated enters revision (GENERATED) state. */
function applyRevisionTransition(plan, revisionReason) {
  if (plan.status === "PUBLISHED") {
    plan.status = "GENERATED";
    plan.publishedAt = null;
    plan.revisionReason = String(revisionReason).trim();
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Plan creation & generation                                          */
/* ------------------------------------------------------------------ */

async function resolvePlanCourse({ courseId, program, semester }) {
  if (courseId) {
    const course = await Course.findById(courseId);
    if (course) return course;
  }
  const fallback = await Course.findOne({ program, semester: Number(semester) });
  if (fallback) return fallback;
  const any = await Course.findOne();
  if (!any) throw new Error("A valid academic course is required to build a seating plan.");
  return any;
}

/**
 * Creates (or recreates) the alphabetical seating plan for an exam.
 * When `examId` is supplied the plan inherits the examination's
 * schedule and candidate scope; otherwise an examination record is
 * created in DRAFT status from the submitted form metadata.
 */
export async function generateSeatingPlan(
  {
    examId = null,
    title,
    examType = "FINAL",
    academicYear = "2083/84",
    program = "BCA",
    semester = 1,
    courseId = null,
    examDate,
    startTime,
    endTime,
    candidateScope = "SEMESTER_WIDE",
    sectionCode = "ALL",
    batch = "2025",
    rooms = [],
    seatsPerBench = SEATS_PER_BENCH,
    revisionReason = null,
  },
  actorUser
) {
  const semNum = Number(semester);
  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new Error("At least one examination room must be selected.");
  }
  if (!examDate || !startTime || !endTime) {
    throw new Error("Exam date, start time and end time are required.");
  }

  // Validate the time window up front (throws on invalid ranges).
  const durationInfo = calculateExamDuration(examDate, startTime, endTime);

  let exam = null;
  if (examId) {
    exam = await Exam.findById(examId);
    if (!exam) throw new Error("Linked examination not found.");
  } else {
    const course = await resolvePlanCourse({ courseId, program, semester: semNum });
    const examTitle = String(title || `${course.code} ${examType} Examination`).trim();
    const nepali = convertToNepaliDate(examDate);
    exam = await Exam.create({
      title: examTitle,
      examType,
      academicYear,
      program,
      semester: semNum,
      course: course._id,
      candidateScope,
      sectionCode: String(sectionCode || "ALL").toUpperCase(),
      batch,
      examDate,
      nepaliDate: nepali.formatted,
      startTime,
      endTime,
      durationMinutes: durationInfo.durationMinutes,
      durationHours: durationInfo.durationHours,
      startDateTime: durationInfo.startDateTime,
      endDateTime: durationInfo.endDateTime,
      room: rooms.map((r) => r.name).join(", "),
      rooms: rooms.map((r) => ({
        room: r.room || r._id || r.id || null,
        building: r.building || "Block A",
        roomNumber: r.roomNumber || r.roomName || "",
        name: r.name,
        capacity: Number(r.capacity || 40),
      })),
      instructions: "",
      status: "DRAFT",
      resultsStatus: "DRAFT",
      publishedBy: actorUser?._id,
    });
  }

  const course = await resolvePlanCourse({
    courseId: exam.course?.toString(),
    program: exam.program,
    semester: exam.semester,
  });

  // Resolve the eligible candidate set from institutional records.
  const { eligibleCandidates, eligibleCount, sectionBreakdown } = await resolveEligibleCandidates({
    program: exam.program,
    semester: exam.semester,
    courseId: exam.course?.toString(),
    candidateScope: exam.candidateScope,
    sectionCode: exam.sectionCode,
    batch: exam.batch,
  });

  // ONE continuous alphabetical list across all sections.
  const sorted = sortCandidatesAlphabetically(eligibleCandidates);
  const { roomAllocations, allocatedCount, unallocated } = allocateSeatsSequentially(
    sorted,
    rooms,
    seatsPerBench
  );

  const totalCapacity = roomAllocations.reduce((sum, r) => sum + r.capacity, 0);
  const conflicts = await findSeatingConflicts({
    examId: exam._id,
    rooms,
    startDateTime: durationInfo.startDateTime,
    endDateTime: durationInfo.endDateTime,
  });

  // One plan per examination (enforced by a unique index): an
  // existing plan for this exam is refreshed in place rather
  // than duplicated.
  const existingPlan = await ExamSeatingPlan.findOne({ exam: exam._id });
  let plan;
  const now = new Date();

  if (existingPlan) {
    const originalStatus = existingPlan.status;
    await assertMutable(existingPlan, { revisionReason });
    const wasRevision = applyRevisionTransition(existingPlan, revisionReason);
    existingPlan.roomAllocations = roomAllocations;
    existingPlan.title = exam.title;
    existingPlan.academicYear = exam.academicYear;
    existingPlan.program = exam.program;
    existingPlan.semester = exam.semester;
    existingPlan.course = course._id;
    existingPlan.candidateScope = exam.candidateScope;
    existingPlan.sectionCode = exam.sectionCode;
    existingPlan.batch = exam.batch;
    existingPlan.examDate = exam.examDate;
    existingPlan.startTime = exam.startTime;
    existingPlan.endTime = exam.endTime;
    existingPlan.durationMinutes = durationInfo.durationMinutes;
    existingPlan.totalEligibleStudents = eligibleCount;
    existingPlan.totalAllocatedSeats = allocatedCount;
    existingPlan.totalUnallocatedStudents = unallocated.length;
    existingPlan.requiredAdditionalCapacity = Math.max(0, eligibleCount - totalCapacity);
    existingPlan.generatedAt = now;
    existingPlan.generatedBy = actorUser?._id;
    existingPlan.shuffleSeed = null;
    // A scheduled plan keeps its publication schedule when it
    // is regenerated; the sweep publishes the refreshed data.
    existingPlan.status =
      originalStatus === "SCHEDULED" ? "SCHEDULED" : "GENERATED";
    await existingPlan.save();
    plan = existingPlan;

    await logAudit({
      userId: actorUser?._id,
      action: "SEATING_PLAN_GENERATED",
      module: "examinations",
      resource: "exam_seating_plan",
      resourceId: plan._id.toString(),
      newValue: {
        title: plan.title,
        semester: plan.semester,
        eligibleCount,
        allocatedCount,
        unallocatedCount: unallocated.length,
        totalCapacity,
        rooms: rooms.map((r) => r.name),
      },
      details: `Alphabetical seating plan regenerated for "${exam.title}" (${exam.program} Semester ${exam.semester}): ${eligibleCount} eligible students, ${allocatedCount} allocated across ${rooms.length} room(s), ${unallocated.length} unallocated.${wasRevision ? " Authorized revision of a published plan." : ""}`,
    });

    return {
      plan,
      stats: {
        eligibleCount,
        totalCapacity,
        allocatedCount,
        unallocatedCount: unallocated.length,
        remainingSeats: Math.max(0, totalCapacity - allocatedCount),
        requiredAdditionalCapacity: Math.max(0, eligibleCount - totalCapacity),
        conflicts,
        sectionBreakdown,
      },
      exam,
    };
  }

  plan = await ExamSeatingPlan.create({
    exam: exam._id,
    examCode: exam.examCode,
    title: exam.title,
    academicYear: exam.academicYear,
    program: exam.program,
    semester: exam.semester,
    course: course._id,
    candidateScope: exam.candidateScope,
    sectionCode: exam.sectionCode,
    batch: exam.batch,
    examDate: exam.examDate,
    startTime: exam.startTime,
    endTime: exam.endTime,
    durationMinutes: durationInfo.durationMinutes,
    status: "GENERATED",
    roomAllocations,
    totalEligibleStudents: eligibleCount,
    totalAllocatedSeats: allocatedCount,
    totalUnallocatedStudents: unallocated.length,
    requiredAdditionalCapacity: Math.max(0, eligibleCount - totalCapacity),
    generatedAt: now,
    generatedBy: actorUser?._id,
    shuffleSeed: null,
  });

  await logAudit({
    userId: actorUser?._id,
    action: "SEATING_PLAN_GENERATED",
    module: "examinations",
    resource: "exam_seating_plan",
    resourceId: plan._id.toString(),
    newValue: {
      title: plan.title,
      semester: plan.semester,
      eligibleCount,
      allocatedCount,
      unallocatedCount: unallocated.length,
      totalCapacity,
      rooms: rooms.map((r) => r.name),
    },
    details: `Alphabetical seating plan generated for "${exam.title}" (${exam.program} Semester ${exam.semester}): ${eligibleCount} eligible students, ${allocatedCount} allocated across ${rooms.length} room(s), ${unallocated.length} unallocated.`,
  });

  return {
    plan,
    stats: {
      eligibleCount,
      totalCapacity,
      allocatedCount,
      unallocatedCount: unallocated.length,
      remainingSeats: Math.max(0, totalCapacity - allocatedCount),
      requiredAdditionalCapacity: Math.max(0, eligibleCount - totalCapacity),
      conflicts,
      sectionBreakdown,
    },
    exam,
  };
}

/* ------------------------------------------------------------------ */
/* Plan mutations                                                      */
/* ------------------------------------------------------------------ */

async function loadPlan(planId) {
  const plan = await ExamSeatingPlan.findById(planId);
  if (!plan) throw new Error("Seating plan not found.");
  return plan;
}

/** Regenerates the plan from the current eligible set (alphabetical by default). */
export async function regenerateSeatingPlan(
  planId,
  { shuffle = false, revisionReason = null },
  actorUser
) {
  const plan = await loadPlan(planId);
  const originalStatus = plan.status;
  await assertMutable(plan, { revisionReason });

  const previousState = {
    status: plan.status,
    totalAllocatedSeats: plan.totalAllocatedSeats,
    roomSummary: (plan.roomAllocations || []).map((r) => ({
      name: r.name,
      assignedCount: r.assignedCount,
    })),
  };

  const { eligibleCandidates, eligibleCount } = await resolveEligibleCandidates({
    program: plan.program,
    semester: plan.semester,
    courseId: plan.course?.toString(),
    candidateScope: plan.candidateScope,
    sectionCode: plan.sectionCode,
    batch: plan.batch,
  });

  let ordered = sortCandidatesAlphabetically(eligibleCandidates);
  let seed = null;
  if (shuffle) {
    seed = Math.floor(Math.random() * 1e9);
    ordered = shuffleCandidates(ordered, seed);
  }

  const { roomAllocations, allocatedCount, unallocated } = allocateSeatsSequentially(ordered, plan.roomAllocations);
  const totalCapacity = roomAllocations.reduce((sum, r) => sum + r.capacity, 0);

  const wasRevision = applyRevisionTransition(plan, revisionReason);
  plan.roomAllocations = roomAllocations;
  plan.totalEligibleStudents = eligibleCount;
  plan.totalAllocatedSeats = allocatedCount;
  plan.totalUnallocatedStudents = unallocated.length;
  plan.requiredAdditionalCapacity = Math.max(0, eligibleCount - totalCapacity);
  plan.generatedAt = new Date();
  plan.generatedBy = actorUser?._id;
  plan.shuffleSeed = seed;
  plan.status = originalStatus === "SCHEDULED" ? "SCHEDULED" : "GENERATED";
  await plan.save();

  await logAudit({
    userId: actorUser?._id,
    action: shuffle ? "SEATING_PLAN_REGENERATED" : "SEATING_PLAN_RESET",
    module: "examinations",
    resource: "exam_seating_plan",
    resourceId: plan._id.toString(),
    oldValue: previousState,
    newValue: {
      status: plan.status,
      allocatedCount,
      unallocatedCount: unallocated.length,
      shuffleSeed: seed,
    },
    details: `Seating plan for "${plan.title}" ${shuffle ? "regenerated" : "reset to alphabetical order"}${wasRevision ? " (authorized revision of a published plan)" : ""}.`,
  });

  return { plan };
}

/** Restores the original alphabetical allocation. */
export async function resetSeatingPlanToAlphabetical(planId, { revisionReason = null }, actorUser) {
  return regenerateSeatingPlan(planId, { shuffle: false, revisionReason }, actorUser);
}

/** Shuffles the eligible set with a fresh deterministic seed. */
export async function shuffleSeatingPlan(planId, { seed = null, revisionReason = null }, actorUser) {
  const plan = await loadPlan(planId);
  const originalStatus = plan.status;
  await assertMutable(plan, { revisionReason });

  const previousState = {
    status: plan.status,
    shuffleSeed: plan.shuffleSeed,
    totalAllocatedSeats: plan.totalAllocatedSeats,
  };

  const { eligibleCandidates, eligibleCount } = await resolveEligibleCandidates({
    program: plan.program,
    semester: plan.semester,
    courseId: plan.course?.toString(),
    candidateScope: plan.candidateScope,
    sectionCode: plan.sectionCode,
    batch: plan.batch,
  });

  const sorted = sortCandidatesAlphabetically(eligibleCandidates);
  const shuffleSeed = Number.isFinite(seed) ? Number(seed) : Math.floor(Math.random() * 1e9);
  const shuffled = shuffleCandidates(sorted, shuffleSeed);
  const { roomAllocations, allocatedCount, unallocated } = allocateSeatsSequentially(shuffled, plan.roomAllocations);
  const totalCapacity = roomAllocations.reduce((sum, r) => sum + r.capacity, 0);

  const wasRevision = applyRevisionTransition(plan, revisionReason);
  plan.roomAllocations = roomAllocations;
  plan.totalEligibleStudents = eligibleCount;
  plan.totalAllocatedSeats = allocatedCount;
  plan.totalUnallocatedStudents = unallocated.length;
  plan.requiredAdditionalCapacity = Math.max(0, eligibleCount - totalCapacity);
  plan.lastShuffledAt = new Date();
  plan.lastShuffledBy = actorUser?._id;
  plan.shuffleSeed = shuffleSeed;
  plan.status = originalStatus === "SCHEDULED" ? "SCHEDULED" : "GENERATED";
  await plan.save();

  await logAudit({
    userId: actorUser?._id,
    action: "SEATING_PLAN_SHUFFLED",
    module: "examinations",
    resource: "exam_seating_plan",
    resourceId: plan._id.toString(),
    oldValue: previousState,
    newValue: { status: plan.status, shuffleSeed, allocatedCount },
    details: `Seating plan for "${plan.title}" shuffled (seed ${shuffleSeed}; same ${eligibleCount}-student eligible set preserved)${wasRevision ? " as an authorized revision" : ""}.`,
  });

  return { plan, shuffleSeed };
}

/**
 * Moves students from one room to another. Capacity is enforced and
 * assignment uniqueness is preserved. Bench numbering is recomputed for
 * both affected rooms so numbering stays contiguous.
 */
export async function changeSeatingRoom(
  planId,
  { fromRoom, toRoom, studentIds = null, revisionReason = null },
  actorUser
) {
  const plan = await loadPlan(planId);
  await assertMutable(plan, { revisionReason });

  // A room is identified by its registry id, display name
  // or room number — whichever the caller supplied.
  const findRoomAllocation = (identifier) => {
    const id = String(identifier || "").trim();
    return (plan.roomAllocations || []).find((r) =>
      [String(r.room || ""), String(r.name || ""), String(r.roomNumber || "")].includes(id)
    );
  };

  const source = findRoomAllocation(fromRoom);
  const target = findRoomAllocation(toRoom);
  if (!source) throw new Error(`Source room "${fromRoom}" is not part of this seating plan.`);
  if (!target) throw new Error(`Target room "${toRoom}" is not part of this seating plan.`);
  if (String(source.name) === String(target.name) && String(source.roomNumber) === String(target.roomNumber)) {
    throw new Error("Source and target rooms must be different.");
  }

  const sourceAssignments = source.seatAssignments || [];
  const moving = studentIds && studentIds.length > 0
    ? sourceAssignments.filter((a) => studentIds.includes(String(a.studentId)))
    : sourceAssignments;
  if (moving.length === 0) {
    throw new Error("No matching students found in the source room to move.");
  }

  const targetAssigned = (target.seatAssignments || []).length;
  const targetRemaining = Number(target.capacity || 0) - targetAssigned;
  if (moving.length > targetRemaining) {
    throw new Error(
      `Insufficient capacity in "${target.name}": ${targetRemaining} seat(s) free, ${moving.length} student(s) to move. ` +
        `${moving.length - targetRemaining} additional seat(s) required.`
    );
  }

  const movingKeys = new Set(moving.map((a) => String(a.studentUser || a.student)));
  source.seatAssignments = sourceAssignments.filter(
    (a) => !movingKeys.has(String(a.studentUser || a.student))
  );
  target.seatAssignments = [...(target.seatAssignments || []), ...moving];

  renumberRoomAllocation(source);
  renumberRoomAllocation(target);

  const wasRevision = applyRevisionTransition(plan, revisionReason);
  plan.updatedAt = new Date();
  await plan.save();

  await logAudit({
    userId: actorUser?._id,
    action: "SEATING_ROOM_CHANGED",
    module: "examinations",
    resource: "exam_seating_plan",
    resourceId: plan._id.toString(),
    oldValue: {
      fromRoom: source.name,
      toRoom: target.name,
      movedCount: moving.length,
    },
    newValue: {
      sourceAssigned: source.assignedCount,
      targetAssigned: target.assignedCount,
    },
    details: `Moved ${moving.length} student(s) from "${source.name}" to "${target.name}" in seating plan for "${plan.title}"${wasRevision ? " (authorized revision)" : ""}.`,
  });

  return { plan, movedCount: moving.length };
}

/* ------------------------------------------------------------------ */
/* Publication                                                       */
/* ------------------------------------------------------------------ */

/**
 * Publishes a seating plan after validating capacity, duplicates and
 * room availability. Idempotent: an already-published plan is returned
 * unchanged. A published plan that was revised (status GENERATED after
 * publication) requires the revision reason already recorded on it.
 */
export async function publishSeatingPlan(planId, actorUser, { scheduled = false } = {}) {
  const plan = await loadPlan(planId);

  if (plan.status === "PUBLISHED") {
    return { plan, alreadyPublished: true };
  }
  if (plan.status === "CANCELLED") {
    throw new Error("Cannot publish a cancelled seating plan.");
  }

  // Hard validation before any state change.
  const { totalCapacity, allocated, eligible } = validatePlanForPublication(plan);

  const startDateTime = buildKathmanduDateTime(plan.examDate, plan.startTime);
  const endDateTime = buildKathmanduDateTime(plan.examDate, plan.endTime);
  const conflicts = await findSeatingConflicts({
    planId: plan._id,
    examId: plan.exam,
    rooms: plan.roomAllocations,
    startDateTime,
    endDateTime,
  });
  if (conflicts.length > 0) {
    const summary = conflicts
      .map((c) => `"${c.rooms.join(", ")}" conflicts with ${c.source} "${c.title}" (${c.examDate} ${c.startTime}–${c.endTime})`)
      .join("; ");
    throw new Error(`Room availability conflict: ${summary}. Resolve the conflict before publishing.`);
  }

  // Atomic transition: only one worker can flip SCHEDULED/GENERATED →
  // PUBLISHED, so retries and restarts cannot double-publish.
  const claimed = await ExamSeatingPlan.findOneAndUpdate(
    {
      _id: plan._id,
      status: { $in: ["GENERATED", "SCHEDULED", "DRAFT"] },
    },
    {
      $set: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedBy: actorUser?._id || null,
      },
    },
    { returnDocument: 'after' }
  );

  if (!claimed) {
    // Another process already transitioned this plan.
    const current = await loadPlan(planId);
    return { plan: current, alreadyPublished: current.status === "PUBLISHED" };
  }

  // Notify every seated student (idempotent per plan + student).
  for (const roomAlloc of claimed.roomAllocations || []) {
    for (const assignment of roomAlloc.seatAssignments || []) {
      if (!assignment.studentUser) continue;
      await createIdempotentNotification({
        userId: assignment.studentUser,
        title: `Exam Seating Published: ${claimed.title}`,
        message: `${claimed.title} on ${claimed.examDate} at ${claimed.startTime}: ${roomAlloc.name}, Bench ${assignment.benchNumber}, Seat ${assignment.seatNumber}.`,
        category: "exam",
        priority: "high",
        actionUrl: "/examination",
        examId: claimed.exam,
        idempotencyKey: `seating_pub_${claimed._id.toString()}_${String(assignment.studentUser)}`,
      });
    }
  }

  await logAudit({
    userId: actorUser?._id,
    action: scheduled ? "SEATING_PLAN_PUBLISHED_SCHEDULED" : "SEATING_PLAN_PUBLISHED",
    module: "examinations",
    resource: "exam_seating_plan",
    resourceId: claimed._id.toString(),
    oldValue: { status: plan.status },
    newValue: {
      status: "PUBLISHED",
      publishedAt: claimed.publishedAt,
      eligible,
      allocated,
      totalCapacity,
    },
    details: `Seating plan for "${claimed.title}" published (${allocated} students across ${totalCapacity} seats${scheduled ? " via scheduled publication" : ""}).`,
  });

  return { plan: claimed, alreadyPublished: false };
}

/**
 * Schedules a future publication. The publication itself is executed
 * by the server-side academic scheduler sweep, never by the browser.
 */
export async function scheduleSeatingPublication(
  planId,
  { publishAt, timezone = "Asia/Kathmandu", revisionReason = null },
  actorUser
) {
  const plan = await loadPlan(planId);
  await assertMutable(plan, { revisionReason });

  const when = new Date(publishAt);
  if (!when || isNaN(when.getTime())) {
    throw new Error("A valid publication date and time is required.");
  }
  if (when.getTime() <= Date.now()) {
    throw new Error("Scheduled publication time must be in the future.");
  }

  plan.status = "SCHEDULED";
  plan.scheduledPublishAt = when;
  plan.scheduledPublishTimezone = timezone || "Asia/Kathmandu";
  await plan.save();

  await logAudit({
    userId: actorUser?._id,
    action: "SEATING_PLAN_PUBLICATION_SCHEDULED",
    module: "examinations",
    resource: "exam_seating_plan",
    resourceId: plan._id.toString(),
    oldValue: { status: "GENERATED" },
    newValue: {
      status: "SCHEDULED",
      scheduledPublishAt: when,
      timezone: plan.scheduledPublishTimezone,
    },
    details: `Seating plan for "${plan.title}" scheduled for publication at ${when.toISOString()} (${plan.scheduledPublishTimezone}).`,
  });

  return { plan };
}

/**
 * Cancels a seating plan (publication schedule or draft). Seated
 * assignments are preserved for audit; the plan is no longer
 * publishable or visible to students.
 */
export async function cancelSeatingPlan(planId, { reason = "Cancelled by Examination Department" }, actorUser) {
  const plan = await loadPlan(planId);
  if (plan.status === "PUBLISHED") {
    throw new Error("A published seating plan cannot be cancelled; revoke or revise it through the revision workflow instead.");
  }
  if (plan.status === "CANCELLED") {
    return { plan, alreadyCancelled: true };
  }

  const previousStatus = plan.status;
  plan.status = "CANCELLED";
  plan.cancelledAt = new Date();
  plan.cancelledBy = actorUser?._id;
  plan.cancellationReason = String(reason || "Cancelled by Examination Department");
  plan.scheduledPublishAt = null;
  await plan.save();

  await logAudit({
    userId: actorUser?._id,
    action: "SEATING_PLAN_CANCELLED",
    module: "examinations",
    resource: "exam_seating_plan",
    resourceId: plan._id.toString(),
    oldValue: { status: previousStatus },
    newValue: { status: "CANCELLED", reason: plan.cancellationReason },
    details: `Seating plan for "${plan.title}" cancelled. Reason: ${plan.cancellationReason}.`,
  });

  return { plan };
}

/**
 * Server-side sweep step: publishes every seating plan whose scheduled
 * publication time has passed. Each plan is claimed with an atomic
 * conditional update, so a retry or restart can never publish twice.
 * Failures are recorded for administrative review and remain retryable.
 */
export async function runScheduledSeatingPublication(now = new Date()) {
  const due = await ExamSeatingPlan.find({
    status: "SCHEDULED",
    scheduledPublishAt: { $lte: now },
  }).limit(200);

  const results = [];
  for (const plan of due) {
    try {
      const { alreadyPublished } = await publishSeatingPlan(plan._id, null, { scheduled: true });
      results.push({ planId: plan._id.toString(), status: alreadyPublished ? "ALREADY_PUBLISHED" : "PUBLISHED" });
    } catch (error) {
      await logAudit({
        userId: null,
        action: "SEATING_PLAN_SCHEDULED_PUBLISH_FAILED",
        module: "examinations",
        resource: "exam_seating_plan",
        resourceId: plan._id.toString(),
        newValue: { scheduledPublishAt: plan.scheduledPublishAt },
        details: `Scheduled publication failed for seating plan "${plan.title}": ${error.message}`,
      });
      results.push({ planId: plan._id.toString(), status: "FAILED", error: error.message });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Student-facing seating (ownership enforced)                         */
/* ------------------------------------------------------------------ */

function flattenAssignments(plan) {
  return (plan.roomAllocations || []).flatMap((roomAlloc) =>
    (roomAlloc.seatAssignments || []).map((a) => ({
      ...a.toObject ? a.toObject() : a,
      roomName: roomAlloc.name,
      roomId: roomAlloc.room ? String(roomAlloc.room) : null,
      building: roomAlloc.building,
      floor: roomAlloc.floor || null,
    }))
  );
}

/**
 * Returns the requesting student's own seating assignment for a
 * published plan. Ownership is derived from the session user — a
 * student can never read another student's seat.
 */
export async function getStudentSeating(examId, studentUserId) {
  const student = await Student.findOne({ user: studentUserId });
  if (!student) return null;

  const plan = await ExamSeatingPlan.findOne({
    exam: examId,
    status: "PUBLISHED",
  });
  if (!plan) return null;

  const assignment = flattenAssignments(plan).find(
    (a) =>
      String(a.studentUser) === String(studentUserId) ||
      String(a.student) === String(student._id)
  );
  if (!assignment) return null;

  return {
    examId: plan.exam.toString(),
    examTitle: plan.title,
    examCode: plan.examCode,
    examDate: plan.examDate,
    startTime: plan.startTime,
    endTime: plan.endTime,
    academicYear: plan.academicYear,
    program: plan.program,
    semester: plan.semester,
    studentId: assignment.studentId,
    fullName: assignment.fullName,
    section: assignment.section,
    block: assignment.building,
    floor: assignment.floor,
    room: assignment.roomName,
    roomNumber: assignment.roomNumber,
    benchNumber: assignment.benchNumber,
    seatNumber: assignment.seatNumber,
    publishedAt: plan.publishedAt,
  };
}

/**
 * Lists every published seating assignment belonging to the requesting
 * student (used by the student's "My Exam Seating" panel).
 */
export async function listMySeating(studentUserId) {
  const student = await Student.findOne({ user: studentUserId });
  if (!student) return [];

  const plans = await ExamSeatingPlan.find({ status: "PUBLISHED" })
    .sort({ examDate: 1, startTime: 1 });

  const mine = [];
  for (const plan of plans) {
    const assignment = flattenAssignments(plan).find(
      (a) =>
        String(a.studentUser) === String(studentUserId) ||
        String(a.student) === String(student._id)
    );
    if (!assignment) continue;
    mine.push({
      planId: plan._id.toString(),
      examId: plan.exam.toString(),
      examTitle: plan.title,
      examCode: plan.examCode,
      examDate: plan.examDate,
      startTime: plan.startTime,
      endTime: plan.endTime,
      academicYear: plan.academicYear,
      program: plan.program,
      semester: plan.semester,
      studentId: assignment.studentId,
      rollNumber: assignment.rollNumber,
      fullName: assignment.fullName,
      section: assignment.section,
      block: assignment.building,
      floor: assignment.floor,
      room: assignment.roomName,
      roomNumber: assignment.roomNumber,
      benchNumber: assignment.benchNumber,
      seatNumber: assignment.seatNumber,
      publishedAt: plan.publishedAt,
    });
  }
  return mine;
}

/**
 * Full plan detail for authorized staff, including per-room summaries
 * and the audit trail stored on the plan.
 */
export async function getSeatingPlanDetail(planId) {
  const plan = await loadPlan(planId);
  const roomSummaries = (plan.roomAllocations || []).map((r) => ({
    room: r.room ? String(r.room) : null,
    name: r.name,
    building: r.building,
    roomNumber: r.roomNumber,
    capacity: r.capacity,
    benchCount: r.benchCount,
    assignedCount: r.assignedCount,
    remainingSeats: Math.max(0, r.capacity - r.assignedCount),
    seatAssignments: (r.seatAssignments || []).map((a) => ({
      studentId: a.studentId,
      rollNumber: a.rollNumber,
      fullName: a.fullName,
      program: a.program,
      semester: a.semester,
      section: a.section,
      benchNumber: a.benchNumber,
      seatNumber: a.seatNumber,
      isEligible: a.isEligible,
      eligibilityReason: a.eligibilityReason,
    })),
  }));

  return {
    plan: {
      id: plan._id.toString(),
      _id: plan._id.toString(),
      exam: plan.exam ? plan.exam.toString() : null,
      examCode: plan.examCode,
      title: plan.title,
      academicYear: plan.academicYear,
      program: plan.program,
      semester: plan.semester,
      course: plan.course ? plan.course.toString() : null,
      candidateScope: plan.candidateScope,
      sectionCode: plan.sectionCode,
      batch: plan.batch,
      examDate: plan.examDate,
      startTime: plan.startTime,
      endTime: plan.endTime,
      durationMinutes: plan.durationMinutes,
      status: plan.status,
      totalEligibleStudents: plan.totalEligibleStudents,
      totalAllocatedSeats: plan.totalAllocatedSeats,
      totalUnallocatedStudents: plan.totalUnallocatedStudents,
      requiredAdditionalCapacity: plan.requiredAdditionalCapacity,
      generatedAt: plan.generatedAt,
      generatedBy: plan.generatedBy,
      publishedAt: plan.publishedAt,
      publishedBy: plan.publishedBy,
      scheduledPublishAt: plan.scheduledPublishAt,
      scheduledPublishTimezone: plan.scheduledPublishTimezone,
      cancelledAt: plan.cancelledAt,
      cancelledBy: plan.cancelledBy,
      cancellationReason: plan.cancellationReason,
      shuffleSeed: plan.shuffleSeed,
      lastShuffledAt: plan.lastShuffledAt,
      revisionReason: plan.revisionReason,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    },
    roomSummaries,
    totals: {
      eligibleCount: plan.totalEligibleStudents,
      totalCapacity: (plan.roomAllocations || []).reduce((s, r) => s + r.capacity, 0),
      allocatedCount: plan.totalAllocatedSeats,
      unallocatedCount: plan.totalUnallocatedStudents,
      remainingSeats: Math.max(
        0,
        (plan.roomAllocations || []).reduce((s, r) => s + r.capacity, 0) - plan.totalAllocatedSeats
      ),
      requiredAdditionalCapacity: plan.requiredAdditionalCapacity,
    },
  };
}

/** Lists seating plans for the Exam Department overview. */
export async function listSeatingPlans({ status = null, semester = null, examId = null } = {}) {
  const filter = {};
  if (status && status !== "ALL") filter.status = status;
  if (semester && semester !== "ALL") filter.semester = Number(semester);
  if (examId) filter.exam = examId;
  const plans = await ExamSeatingPlan.find(filter)
    .sort({ examDate: 1, startTime: 1 })
    .limit(200);
  return plans.map((p) => ({
    id: p._id.toString(),
    _id: p._id.toString(),
    exam: p.exam ? p.exam.toString() : null,
    examCode: p.examCode,
    title: p.title,
    program: p.program,
    semester: p.semester,
    examDate: p.examDate,
    startTime: p.startTime,
    endTime: p.endTime,
    status: p.status,
    totalEligibleStudents: p.totalEligibleStudents,
    totalAllocatedSeats: p.totalAllocatedSeats,
    totalUnallocatedStudents: p.totalUnallocatedStudents,
    requiredAdditionalCapacity: p.requiredAdditionalCapacity,
    roomCount: (p.roomAllocations || []).length,
    publishedAt: p.publishedAt,
    scheduledPublishAt: p.scheduledPublishAt,
    scheduledPublishTimezone: p.scheduledPublishTimezone,
    generatedAt: p.generatedAt,
  }));
}

/**
 * Preview for the eligible-student panel: the resolved eligible set
 * (one continuous alphabetical list) plus section breakdown.
 */
export async function previewEligibleStudents({
  program = "BCA",
  semester = 1,
  courseId = null,
  candidateScope = "SEMESTER_WIDE",
  sectionCode = "ALL",
  batch = "2025",
}) {
  const { eligibleCandidates, eligibleCount, sectionBreakdown, candidateCount } =
    await resolveEligibleCandidates({
      program,
      semester: Number(semester),
      courseId,
      candidateScope,
      sectionCode,
      batch,
    });

  const sorted = sortCandidatesAlphabetically(eligibleCandidates);
  return {
    eligibleCount,
    candidateCount,
    sectionBreakdown,
    candidates: sorted.map((c) => ({
      studentId: c.studentId,
      rollNumber: c.rollNumber || c.studentId,
      fullName: c.fullName,
      program: c.program,
      semester: c.semester,
      section: c.section,
      attendancePercentage: c.attendancePercentage,
      isEligible: c.isEligible !== false,
      eligibilityReason: c.eligibilityReason,
    })),
  };
}
