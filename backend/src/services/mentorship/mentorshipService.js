import {
  MentorshipAssignment,
  MentoringSession,
  FacultyObservation,
  Student,
  User,
  Competency,
} from "../../models/index.js";
import {
  getUserById,
  getStudentByUserId,
  getUserRoles,
  authorizeUser,
  logAudit,
} from "../../db.js";
import {
  badRequest,
  notFound,
  forbidden,
  conflict,
} from "../../utils/apiError.js";
import { createAndEmitNotification } from "../notificationService.js";

const INSTITUTION_ID = "techspire";

function normalizeId(value) {
  if (!value) return null;
  return String(value);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

async function resolveStudentForUser(user) {
  const roles = getUserRoles(user);
  if (roles.includes("student")) {
    const student = await getStudentByUserId(user._id || user.id);
    if (!student) {
      throw notFound("Student profile not found for the current user.");
    }
    return student;
  }
  return null;
}

function isFacultyUser(user) {
  return authorizeUser(user, ["faculty"]);
}

function isAdminOrCoordinator(user) {
  return authorizeUser(user, ["super_admin", "dean", "hod", "program_coordinator", "registrar"]);
}

/**
 * Scope filter: faculty see only their assigned students; admin/coordinator
 * see all. Never trusts caller-supplied student IDs.
 */
async function buildStudentAccessFilter(user, studentId) {
  const roles = getUserRoles(user);
  const isAdmin = isAdminOrCoordinator(user);

  if (isAdmin) {
    if (studentId) {
      const student = await Student.findById(studentId).lean();
      if (!student) throw notFound("Student not found.");
      return { student };
    }
    return { all: true };
  }

  if (roles.includes("faculty")) {
    const assignments = await MentorshipAssignment.find({
      faculty: user._id || user.id,
      status: "ACTIVE",
    }).select("student").lean();
    const allowedStudentIds = assignments.map((a) => String(a.student));
    if (studentId) {
      if (!allowedStudentIds.includes(String(studentId))) {
        throw forbidden("You may only access students assigned to you.");
      }
      const student = await Student.findById(studentId).lean();
      if (!student) throw notFound("Student not found.");
      return { student };
    }
    return { studentIds: allowedStudentIds };
  }

  if (roles.includes("student")) {
    const student = await resolveStudentForUser(user);
    if (!student) throw notFound("Student profile not found.");
    if (studentId && String(student._id) !== String(studentId)) {
      throw forbidden("Students may only access their own records.");
    }
    return { student };
  }

  throw forbidden("Insufficient role to access mentoring records.");
}

/* ------------------------------------------------------------------ */
/* Mentorship Assignments                                             */
/* ------------------------------------------------------------------ */

export async function listAssignments({ user, query }) {
  const { studentIds, all, student } = await buildStudentAccessFilter(user, query.student);
  const filter = {};
  if (all) {
    if (query.student) filter.student = query.student;
    if (query.faculty) filter.faculty = query.faculty;
    if (query.status) filter.status = query.status;
    if (query.careerPath) filter.careerPath = query.careerPath;
  } else if (studentIds) {
    filter.student = { $in: studentIds };
    if (query.faculty) filter.faculty = query.faculty;
    if (query.status) filter.status = query.status;
    if (query.careerPath) filter.careerPath = query.careerPath;
  } else if (student) {
    filter.student = student._id;
  }

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    MentorshipAssignment.find(filter)
      .populate("faculty", "firstName middleName lastName email roles")
      .populate("student", "studentId firstName lastName program batch semester status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MentorshipAssignment.countDocuments(filter),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getAssignment({ user, assignmentId }) {
  const assignment = await MentorshipAssignment.findById(assignmentId)
    .populate("faculty", "firstName middleName lastName email roles")
    .populate("student", "studentId firstName lastName program batch semester status")
    .lean();
  if (!assignment) throw notFound("Mentorship assignment not found.");

  await buildStudentAccessFilter(user, String(assignment.student));
  return assignment;
}

export async function createAssignment({ user, body }) {
  if (!isFacultyUser(user) && !isAdminOrCoordinator(user)) {
    throw forbidden("Only faculty or academic administrators may create mentorship assignments.");
  }

  const { studentId, program, batch, semester, careerPath, notes } = body || {};
  if (!studentId) throw badRequest("studentId is required.");

  const student = await Student.findById(studentId);
  if (!student) throw notFound("Student not found.");

  // Faculty may only assign students within their scope; admin/coordinator may
  // assign any student.
  if (isFacultyUser(user) && !isAdminOrCoordinator(user)) {
    const existing = await MentorshipAssignment.findOne({
      faculty: user._id || user.id,
      student: studentId,
      status: "ACTIVE",
    });
    if (existing) throw conflict("An active mentorship assignment already exists for this student.");
  }

  const assignment = await MentorshipAssignment.create({
    institutionId: INSTITUTION_ID,
    faculty: isFacultyUser(user) ? (user._id || user.id) : body.faculty || (user._id || user.id),
    student: studentId,
    program: program || null,
    batch: batch || null,
    semester: semester ? Number(semester) : null,
    careerPath: careerPath || null,
    notes: notes || "",
    assignedBy: user._id || user.id,
  });

  await logAudit({
    userId: user._id || user.id,
    action: "MENTORSHIP_ASSIGNMENT_CREATED",
    module: "mentorship",
    resource: "MentorshipAssignment",
    resourceId: String(assignment._id),
    newValue: { student: studentId, careerPath },
  });

  const studentUser = await getUserById(student.user);
  if (studentUser) {
    await createAndEmitNotification({
      user: String(studentUser._id),
      sender: String(user._id || user.id),
      senderType: "user",
      title: "Mentoring Assignment",
      message: `A faculty mentor has been assigned to you.`,
      category: "mentorship",
      priority: "normal",
      actionUrl: `/internships/mentoring`,
      relatedEntityType: "MentorshipAssignment",
      relatedEntityId: assignment._id,
    });
  }

  return assignment;
}

export async function updateAssignment({ user, assignmentId, body }) {
  const assignment = await MentorshipAssignment.findById(assignmentId);
  if (!assignment) throw notFound("Mentorship assignment not found.");

  await buildStudentAccessFilter(user, String(assignment.student));

  const isAdmin = isAdminOrCoordinator(user);
  const isOwnFaculty = String(assignment.faculty) === String(user._id || user.id);
  if (!isAdmin && !isOwnFaculty) {
    throw forbidden("You may only manage your own mentorship assignments.");
  }

  const oldValue = {
    status: assignment.status,
    careerPath: assignment.careerPath,
    notes: assignment.notes,
  };

  if (body.status !== undefined) assignment.status = body.status;
  if (body.program !== undefined) assignment.program = body.program;
  if (body.batch !== undefined) assignment.batch = body.batch;
  if (body.semester !== undefined) assignment.semester = body.semester ? Number(body.semester) : null;
  if (body.careerPath !== undefined) assignment.careerPath = body.careerPath;
  if (body.notes !== undefined) assignment.notes = body.notes;
  if (body.endedAt !== undefined) assignment.endedAt = body.endedAt ? new Date(body.endedAt) : null;

  await assignment.save();

  await logAudit({
    userId: user._id || user.id,
    action: "MENTORSHIP_ASSIGNMENT_UPDATED",
    module: "mentorship",
    resource: "MentorshipAssignment",
    resourceId: String(assignment._id),
    oldValue,
    newValue: {
      status: assignment.status,
      careerPath: assignment.careerPath,
      notes: assignment.notes,
    },
  });

  return assignment;
}

/* ------------------------------------------------------------------ */
/* Mentoring Sessions                                                 */
/* ------------------------------------------------------------------ */

export async function listSessions({ user, query }) {
  const { studentIds, all, student } = await buildStudentAccessFilter(user, query.student);
  const filter = {};
  if (all) {
    if (query.student) filter.student = query.student;
    if (query.faculty) filter.faculty = query.faculty;
    if (query.status) filter.status = query.status;
  } else if (studentIds) {
    filter.student = { $in: studentIds };
    if (query.faculty) filter.faculty = query.faculty;
    if (query.status) filter.status = query.status;
  } else if (student) {
    filter.student = student._id;
  }

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    MentoringSession.find(filter)
      .populate("faculty", "firstName middleName lastName email")
      .populate("student", "studentId firstName lastName")
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MentoringSession.countDocuments(filter),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function createSession({ user, body }) {
  if (!isFacultyUser(user) && !isAdminOrCoordinator(user)) {
    throw forbidden("Only faculty or academic administrators may schedule mentoring sessions.");
  }

  const { assignmentId, studentId, title, description, scheduledAt, durationMinutes, mode, meetingLink, agenda, studentRequested } = body || {};
  if (!title) throw badRequest("title is required.");
  if (!scheduledAt) throw badRequest("scheduledAt is required.");

  let student = null;
  if (studentId) {
    student = await Student.findById(studentId);
    if (!student) throw notFound("Student not found.");
    await buildStudentAccessFilter(user, studentId);
  } else if (assignmentId) {
    const assignment = await MentorshipAssignment.findById(assignmentId);
    if (!assignment) throw notFound("Mentorship assignment not found.");
    await buildStudentAccessFilter(user, String(assignment.student));
    student = await Student.findById(assignment.student);
  } else {
    throw badRequest("studentId or assignmentId is required.");
  }

  const session = await MentoringSession.create({
    assignment: assignmentId || null,
    faculty: user._id || user.id,
    student: student._id,
    title,
    description: description || "",
    scheduledAt: new Date(scheduledAt),
    durationMinutes: durationMinutes ? Number(durationMinutes) : 60,
    mode: mode || "VIDEO_CALL",
    meetingLink: meetingLink || null,
    agenda: agenda || "",
    studentRequested: Boolean(studentRequested),
  });

  await logAudit({
    userId: user._id || user.id,
    action: "MENTORING_SESSION_CREATED",
    module: "mentorship",
    resource: "MentoringSession",
    resourceId: String(session._id),
    newValue: { student: String(student._id), title, scheduledAt: session.scheduledAt },
  });

  const studentUser = await getUserById(student.user);
  if (studentUser) {
    await createAndEmitNotification({
      user: String(studentUser._id),
      sender: String(user._id || user.id),
      senderType: "user",
      title: "Mentoring Session Scheduled",
      message: `A mentoring session "${title}" has been scheduled.`,
      category: "mentorship",
      priority: "normal",
      actionUrl: `/internships/mentoring`,
      relatedEntityType: "MentoringSession",
      relatedEntityId: session._id,
    });
  }

  return session;
}

export async function updateSession({ user, sessionId, body }) {
  const session = await MentoringSession.findById(sessionId);
  if (!session) throw notFound("Mentoring session not found.");

  await buildStudentAccessFilter(user, String(session.student));

  const isAdmin = isAdminOrCoordinator(user);
  const isOwnFaculty = String(session.faculty) === String(user._id || user.id);
  if (!isAdmin && !isOwnFaculty) {
    throw forbidden("You may only manage your own mentoring sessions.");
  }

  const oldValue = {
    status: session.status,
    outcomes: session.outcomes,
    agenda: session.agenda,
  };

  if (body.title !== undefined) session.title = body.title;
  if (body.description !== undefined) session.description = body.description;
  if (body.scheduledAt !== undefined) session.scheduledAt = new Date(body.scheduledAt);
  if (body.durationMinutes !== undefined) session.durationMinutes = Number(body.durationMinutes);
  if (body.mode !== undefined) session.mode = body.mode;
  if (body.meetingLink !== undefined) session.meetingLink = body.meetingLink;
  if (body.agenda !== undefined) session.agenda = body.agenda;
  if (body.outcomes !== undefined) session.outcomes = body.outcomes;
  if (body.status !== undefined) session.status = body.status;
  if (body.followUpActions !== undefined) session.followUpActions = body.followUpActions;

  await session.save();

  await logAudit({
    userId: user._id || user.id,
    action: "MENTORING_SESSION_UPDATED",
    module: "mentorship",
    resource: "MentoringSession",
    resourceId: String(session._id),
    oldValue,
    newValue: { status: session.status, outcomes: session.outcomes },
  });

  return session;
}

/* ------------------------------------------------------------------ */
/* Faculty Observations                                               */
/* ------------------------------------------------------------------ */

export async function listObservations({ user, query }) {
  const { studentIds, all, student } = await buildStudentAccessFilter(user, query.student);
  const filter = {};
  if (all) {
    if (query.student) filter.student = query.student;
    if (query.faculty) filter.faculty = query.faculty;
    if (query.observationType) filter.observationType = query.observationType;
    if (query.careerPath) filter.careerPath = query.careerPath;
    // Non-admin users never see private observations of others.
    if (!isAdminOrCoordinator(user) && !isFacultyUser(user)) {
      filter.visibleToStudent = true;
      filter.isPrivate = false;
    } else if (isFacultyUser(user) && !isAdminOrCoordinator(user)) {
      // Faculty see their own observations plus non-private ones on their students.
      filter.$or = [
        { faculty: user._id || user.id },
        { isPrivate: false, visibleToStudent: true, student: { $in: studentIds } },
      ];
    }
  } else if (studentIds) {
    filter.student = { $in: studentIds };
    if (query.faculty) filter.faculty = query.faculty;
    if (query.observationType) filter.observationType = query.observationType;
    if (query.careerPath) filter.careerPath = query.careerPath;
    if (!isAdminOrCoordinator(user) && !isFacultyUser(user)) {
      filter.visibleToStudent = true;
      filter.isPrivate = false;
    } else if (isFacultyUser(user) && !isAdminOrCoordinator(user)) {
      filter.$or = [
        { faculty: user._id || user.id },
        { isPrivate: false, visibleToStudent: true, student: { $in: studentIds } },
      ];
    }
  } else if (student) {
    filter.student = student._id;
    if (!isAdminOrCoordinator(user) && !isFacultyUser(user)) {
      filter.visibleToStudent = true;
      filter.isPrivate = false;
    } else if (isFacultyUser(user) && !isAdminOrCoordinator(user)) {
      filter.$or = [
        { faculty: user._id || user.id },
        { isPrivate: false, visibleToStudent: true, student: student._id },
      ];
    }
  }

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    FacultyObservation.find(filter)
      .populate("faculty", "firstName middleName lastName email")
      .populate("student", "studentId firstName lastName")
      .populate("competency", "code name category")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FacultyObservation.countDocuments(filter),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function createObservation({ user, body }) {
  if (!isFacultyUser(user) && !isAdminOrCoordinator(user)) {
    throw forbidden("Only faculty or academic administrators may record observations.");
  }

  const { studentId, assignmentId, sessionId, observationType, title, description, competency, competencyLevel, careerPath, isPrivate, visibleToStudent } = body || {};
  if (!studentId) throw badRequest("studentId is required.");
  if (!title) throw badRequest("title is required.");
  if (!description) throw badRequest("description is required.");

  const student = await Student.findById(studentId);
  if (!student) throw notFound("Student not found.");
  await buildStudentAccessFilter(user, studentId);

  let competencyDoc = null;
  if (competency) {
    competencyDoc = await Competency.findById(competency);
    if (!competencyDoc) throw notFound("Competency not found.");
  }

  const observation = await FacultyObservation.create({
    faculty: user._id || user.id,
    student: student._id,
    assignment: assignmentId || null,
    session: sessionId || null,
    observationType: observationType || "GENERAL",
    title,
    description,
    competency: competency || null,
    competencyLevel: competencyLevel ? Number(competencyLevel) : null,
    careerPath: careerPath || null,
    isPrivate: isPrivate !== undefined ? Boolean(isPrivate) : true,
    visibleToStudent: visibleToStudent !== undefined ? Boolean(visibleToStudent) : false,
  });

  await logAudit({
    userId: user._id || user.id,
    action: "FACULTY_OBSERVATION_CREATED",
    module: "mentorship",
    resource: "FacultyObservation",
    resourceId: String(observation._id),
    newValue: { student: studentId, observationType: observation.observationType, title },
  });

  return observation;
}

export async function getMentoringDashboard({ user, query }) {
  const roles = getUserRoles(user);
  const isAdmin = isAdminOrCoordinator(user);

  let studentFilter = {};
  if (!isAdmin) {
    if (roles.includes("faculty")) {
      const assignments = await MentorshipAssignment.find({
        faculty: user._id || user.id,
        status: "ACTIVE",
      }).select("student").lean();
      studentFilter.student = { $in: assignments.map((a) => String(a.student)) };
    } else if (roles.includes("student")) {
      const student = await resolveStudentForUser(user);
      if (!student) throw notFound("Student profile not found.");
      studentFilter.student = student._id;
    } else {
      throw forbidden("Insufficient role for mentoring dashboard.");
    }
  }

  const [assignments, sessions, observations] = await Promise.all([
    MentorshipAssignment.find({ ...studentFilter, status: "ACTIVE" })
      .populate("student", "studentId firstName lastName program batch semester status")
      .limit(50)
      .lean(),
    MentoringSession.find({ ...studentFilter })
      .sort({ scheduledAt: -1 })
      .limit(50)
      .lean(),
    FacultyObservation.find({ ...studentFilter })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const pendingMeetings = sessions.filter((s) => s.status === "SCHEDULED").length;
  const activeMentees = assignments.length;

  return {
    activeMentees,
    pendingMeetings,
    totalObservations: observations.length,
    recentSessions: sessions.slice(0, 10),
    recentObservations: observations.slice(0, 10),
    assignments,
  };
}
