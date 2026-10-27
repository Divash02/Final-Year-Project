import crypto from "node:crypto";
import {
  AttendanceQRSession,
  Course,
  Student,
  Attendance,
} from "../../models/index.js";
import { badRequest, conflict, notFound } from "../../utils/apiError.js";
import { logAIActivity } from "./aiActivityService.js";

/**
 * Smart Attendance & Verification Service
 *
 * Implements Section 17 of CollegeOS Master Prompt.
 * Creates dynamic time-bounded QR attendance sessions,
 * prevents duplicate check-ins, validates expiration windows,
 * and maintains audit integrity.
 */

export async function createAttendanceQRSession({
  facultyUser,
  courseId,
  sectionCode = "A1",
  durationMinutes = 15,
  topic = "Interactive Lecture Session",
}) {
  const course = await Course.findById(courseId).lean();
  if (!course) throw new Error("Course not found.");

  const sessionCode = `QR-ATT-${course.code}-${Date.now().toString().slice(-6)}`;
  const nonce = crypto.randomBytes(6).toString("hex");
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

  const session = await AttendanceQRSession.create({
    sessionCode,
    course: course._id,
    courseCode: course.code,
    courseName: course.name,
    sectionCode,
    facultyUser: facultyUser._id || facultyUser.id,
    facultyName: `${facultyUser.firstName || ""} ${facultyUser.lastName || ""}`.trim() || "Course Faculty",
    sessionDate: new Date().toISOString().split("T")[0],
    startTime: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
    expiresAt,
    sessionNonce: nonce,
    status: "ACTIVE",
    checkIns: [],
    totalCheckIns: 0,
  });

  return session;
}

/**
 * Process a student check-in with duplicate prevention and expiration validation.
 */
export async function submitStudentQRCheckIn({
  studentUser,
  sessionCode,
  sessionNonce,
  clientIp = "127.0.0.1",
}) {
  const session = await AttendanceQRSession.findOne({ sessionCode });
  if (!session) {
    throw badRequest("Attendance QR session not found or invalid session code.");
  }

  if (session.status !== "ACTIVE" || new Date(session.expiresAt) < new Date()) {
    session.status = "EXPIRED";
    await session.save();
    throw badRequest("Attendance session has expired. Late check-in not permitted.");
  }

  if (sessionNonce && session.sessionNonce !== sessionNonce) {
    throw badRequest("Invalid session nonce. Refresh QR code.");
  }

  const student = await Student.findOne({ user: studentUser._id || studentUser.id }).lean();
  if (!student) {
    throw notFound("Student profile not found for authenticated account.");
  }

  // Duplicate Check-In Prevention
  const alreadyCheckedIn = session.checkIns.some(
    (c) => String(c.student) === String(student._id) || c.studentId === student.studentId
  );

  if (alreadyCheckedIn) {
    throw conflict(`Student ${student.studentId} has already checked in to this session.`);
  }

  // Record Check-In
  session.checkIns.push({
    student: student._id,
    studentId: student.studentId,
    studentName: `${student.firstName} ${student.lastName}`,
    timestamp: new Date(),
    ipAddress: clientIp,
    verified: true,
  });
  session.totalCheckIns = session.checkIns.length;
  await session.save();

  return {
    success: true,
    message: `Attendance verified successfully for ${student.firstName} ${student.lastName} (${student.studentId}).`,
    checkInTime: new Date(),
    totalClassCheckIns: session.totalCheckIns,
  };
}

/**
 * Conclude attendance session
 */
export async function concludeAttendanceQRSession({ sessionId, user }) {
  const session = await AttendanceQRSession.findById(sessionId);
  if (!session) throw new Error("Attendance session not found.");

  session.status = "CONCLUDED";
  await session.save();

  await logAIActivity({
    user,
    role: "faculty",
    module: "academic_ai",
    requestCategory: "SMART_ATTENDANCE_CONCLUDED",
    sourceRecords: [{ collectionName: "AttendanceQRSession", recordId: String(session._id), label: session.sessionCode, identifier: session.sessionCode }],
    recommendation: `Attendance session ${session.sessionCode} concluded with ${session.totalCheckIns} verified check-ins.`,
    executionLatencyMs: 15,
  });

  return session;
}
