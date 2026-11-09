import {
  Exam,
  Course,
  Student,
  User,
  Staff,
  Enrollment,
  CourseTeachingAssignment,
  Notice,
  Notification,
  Mail,
  Room,
} from "../models/index.js";
import { logAudit } from "../db.js";
import {
  convertToNepaliDate,
  calculateExamDuration,
  buildKathmanduDateTime,
  calculateExamCountdown,
} from "./nepaliDateHelper.js";

/**
 * Resolves candidate audience based on candidateScope and real institutional records
 */
export async function resolveCandidateAudience({
  program = "BScIT",
  semester = 1,
  courseId,
  candidateScope = "COURSE_SPECIFIC",
  sectionCode = "ALL",
  batch = "2025",
}) {
  const semNum = Number(semester);
  let students = [];

  if (candidateScope === "COURSE_SPECIFIC" && courseId) {
    // 1. Check Course Enrollment table
    const enrollments = await Enrollment.find({
      course: courseId,
      semester: semNum,
      status: "ENROLLED",
    }).populate("student studentUser");

    if (enrollments.length > 0) {
      students = enrollments
        .map((e) => e.student)
        .filter(Boolean)
        .filter((s) => {
          if (sectionCode && sectionCode !== "ALL" && s.section !== sectionCode) {
            return false;
          }
          return s.status === "ACTIVE";
        });
    }
  }

  // Fallback to active students matching academic program & semester
  if (students.length === 0) {
    const filter = {
      semester: semNum,
      status: "ACTIVE",
    };
    if (program && program !== "ALL") {
      filter.$or = [{ program }, { programCode: program }];
    }
    if (sectionCode && sectionCode !== "ALL") {
      filter.section = sectionCode;
    }
    if (batch && batch !== "ALL") {
      filter.batch = batch;
    }

    students = await Student.find(filter).populate("user");
  }

  // Calculate section breakdown and eligibility
  const sectionBreakdown = {};
  const candidateList = students.map((st) => {
    const sec = st.section || "A";
    sectionBreakdown[sec] = (sectionBreakdown[sec] || 0) + 1;

    const attPct = typeof st.attendancePercentage === "number" ? st.attendancePercentage : 85;
    const isEligible = attPct >= 75;

    const userObj = st.user?._id ? st.user : null;
    const userId = userObj ? userObj._id : st.user;

    return {
      student: st._id,
      studentUser: userId,
      studentId: st.studentId,
      rollNumber: st.rollNumber || st.studentId,
      fullName: [st.firstName, st.lastName].filter(Boolean).join(" "),
      email: st.collegeEmail || st.email || (userObj ? userObj.email : ""),
      program: st.program || program,
      semester: st.semester || semNum,
      section: sec,
      attendancePercentage: attPct,
      isEligible,
      eligibilityReason: isEligible
        ? "Satisfies attendance & academic prerequisite"
        : `Attendance (${attPct}%) below mandatory institutional threshold (75%)`,
    };
  });

  return {
    candidateCount: candidateList.length,
    candidates: candidateList,
    sectionBreakdown,
  };
}

/**
 * Resolves faculty teaching the specific course
 */
export async function resolveAssignedFaculty({ courseId }) {
  if (!courseId) return [];
  const assignments = await CourseTeachingAssignment.find({ course: courseId }).populate(
    "facultyUser"
  );
  const facultyMap = new Map();

  for (const asg of assignments) {
    if (asg.facultyUser) {
      const u = asg.facultyUser;
      const uid = u._id.toString();
      if (!facultyMap.has(uid)) {
        facultyMap.set(uid, {
          id: uid,
          _id: uid,
          name: [u.firstName, u.lastName].filter(Boolean).join(" "),
          email: u.collegeEmail || u.email,
          sectionCode: asg.sectionCode,
        });
      }
    }
  }

  // If no specific teaching assignments found, find faculty in the course's department
  if (facultyMap.size === 0) {
    const course = await Course.findById(courseId);
    if (course?.department) {
      const deptStaff = await Staff.find({
        department: course.department,
        roleType: "faculty",
        isActive: true,
      }).populate("user");

      for (const s of deptStaff) {
        if (s.user) {
          const u = s.user;
          const uid = u._id.toString();
          if (!facultyMap.has(uid)) {
            facultyMap.set(uid, {
              id: uid,
              _id: uid,
              name: [u.firstName, u.lastName].filter(Boolean).join(" "),
              email: u.collegeEmail || u.email,
              designation: s.designation,
            });
          }
        }
      }
    }
  }

  return Array.from(facultyMap.values());
}

/**
 * Validates room capacity and checks for overlapping exam room bookings
 */
export async function validateRoomCapacityAndConflicts({
  examId = null,
  rooms = [],
  startDateTime,
  endDateTime,
  candidateCount = 0,
}) {
  if (!rooms || rooms.length === 0) {
    throw new Error("At least one examination room / venue must be specified.");
  }

  let totalCapacity = 0;
  const roomNames = [];

  for (const r of rooms) {
    const cap = Number(r.capacity || 40);
    totalCapacity += cap;
    roomNames.push(r.name || `${r.building} · Room ${r.roomNumber}`);
  }

  if (candidateCount > 0 && totalCapacity < candidateCount) {
    throw new Error(
      `Insufficient room capacity: Selected rooms have total capacity of ${totalCapacity}, but ${candidateCount} candidates are scheduled. Please add more rooms or adjust candidate scope.`
    );
  }

  if (!startDateTime || !endDateTime) {
    return { totalCapacity, roomNames };
  }

  // Check for room conflict against PUBLISHED, SCHEDULED, RESCHEDULED, IN_PROGRESS exams
  const overlappingExams = await Exam.find({
    _id: { $ne: examId },
    status: { $in: ["SCHEDULED", "PUBLISHED", "RESCHEDULED", "IN_PROGRESS"] },
    startDateTime: { $lt: new Date(endDateTime) },
    endDateTime: { $gt: new Date(startDateTime) },
  }).populate("course");

  for (const other of overlappingExams) {
    const otherRooms = (other.rooms || []).map(
      (r) => r.name || `${r.building} · Room ${r.roomNumber}`
    );
    if (otherRooms.length === 0 && other.room) {
      otherRooms.push(other.room);
    }

    const conflicting = roomNames.filter((rn) => otherRooms.includes(rn));
    if (conflicting.length > 0) {
      throw new Error(
        `Room conflict detected: Room(s) "${conflicting.join(", ")}" already booked for exam "${other.title}" (${other.course?.code || "Exam"}) from ${other.startTime} to ${other.endTime} on ${other.examDate}.`
      );
    }
  }

  return { totalCapacity, roomNames };
}

/**
 * Validates invigilator assignments for scheduling conflicts
 */
export async function validateInvigilatorConflicts({
  examId = null,
  invigilators = [],
  startDateTime,
  endDateTime,
}) {
  if (!invigilators || invigilators.length === 0 || !startDateTime || !endDateTime) {
    return;
  }

  const userIds = invigilators.map((i) => i.user?.toString()).filter(Boolean);
  if (userIds.length === 0) return;

  const overlappingExams = await Exam.find({
    _id: { $ne: examId },
    status: { $in: ["SCHEDULED", "PUBLISHED", "RESCHEDULED", "IN_PROGRESS"] },
    startDateTime: { $lt: new Date(endDateTime) },
    endDateTime: { $gt: new Date(startDateTime) },
    "invigilators.user": { $in: userIds },
  });

  if (overlappingExams.length > 0) {
    const conflict = overlappingExams[0];
    throw new Error(
      `Invigilator conflict: One or more assigned invigilators are already assigned to exam "${conflict.title}" during the same time (${conflict.startTime} - ${conflict.endTime}).`
    );
  }
}

/**
 * Idempotently creates in-app notification
 */
export async function createIdempotentNotification({
  userId,
  title,
  message,
  category = "exam",
  priority = "normal",
  actionUrl = "/examination",
  examId = null,
  idempotencyKey,
  metadata = null,
}) {
  if (!userId) return null;

  try {
    const existing = await Notification.findOne({ idempotencyKey });
    if (existing) {
      return existing; // idempotent: do not duplicate
    }

    return await Notification.create({
      user: userId,
      title,
      message,
      category,
      priority,
      actionUrl,
      examId,
      idempotencyKey,
      metadata,
    });
  } catch (err) {
    // If unique key collision occurred, silently return existing
    if (err.code === 11000) {
      return await Notification.findOne({ idempotencyKey });
    }
    console.error("Notification creation error:", err.message);
    return null;
  }
}

/**
 * Generates an institutional College Mail message
 */
export async function sendInstitutionalExamMail({
  senderUser,
  recipients = [],
  subject,
  body,
}) {
  if (!recipients || recipients.length === 0) return null;

  try {
    const senderEmail = senderUser?.collegeEmail || senderUser?.email || "exam.department@techspire.edu.np";
    const senderName = "Examination Department";
    const currentUserId = senderUser?._id || senderUser?.id;

    const recipientEmails = recipients
      .map((r) => r.email || r.collegeEmail)
      .filter(Boolean);

    const userStates = [];
    if (currentUserId) {
      userStates.push({
        user: currentUserId,
        folder: "sent",
        isRead: true,
        isStarred: false,
        isDeleted: false,
      });
    }

    const recipientUserIds = [];
    for (const r of recipients) {
      const uid = r.user || r._id || r.userId;
      if (uid) {
        recipientUserIds.push(uid);
        userStates.push({
          user: uid,
          folder: "inbox",
          isRead: false,
          isStarred: false,
          isDeleted: false,
        });
      }
    }

    return await Mail.create({
      sender: currentUserId || null,
      senderEmail,
      senderName,
      recipientEmails,
      recipients: recipientUserIds,
      subject,
      body,
      isDraft: false,
      userStates,
    });
  } catch (err) {
    console.error("Institutional mail error:", err.message);
    return null;
  }
}

/**
 * Complete, atomic publish workflow
 */
export async function publishExamination({ examId, actorUser, ipAddress = null }) {
  const exam = await Exam.findById(examId).populate("course");
  if (!exam) {
    throw new Error("Examination record not found.");
  }

  if (exam.status === "CANCELLED") {
    throw new Error("Cannot publish a cancelled examination.");
  }

  // 1. Recalculate duration & timestamps to ensure validity
  const durationInfo = calculateExamDuration(exam.examDate, exam.startTime, exam.endTime);
  exam.startDateTime = durationInfo.startDateTime;
  exam.endDateTime = durationInfo.endDateTime;
  exam.durationMinutes = durationInfo.durationMinutes;
  exam.durationHours = durationInfo.durationHours;

  // 2. Resolve Nepali Date
  const nepaliDateObj = convertToNepaliDate(exam.examDate);
  exam.nepaliDate = nepaliDateObj.formatted;

  // 3. Resolve Candidate Audience
  const { candidates, candidateCount, sectionBreakdown } = await resolveCandidateAudience({
    program: exam.program,
    semester: exam.semester,
    courseId: exam.course?._id,
    candidateScope: exam.candidateScope,
    sectionCode: exam.sectionCode,
    batch: exam.batch,
  });

  exam.candidateCount = candidateCount;
  exam.candidateSnapshot = candidates;

  // 4. Validate Room Capacity & Conflicts
  const primaryRoom = exam.rooms && exam.rooms.length > 0
    ? exam.rooms.map((r) => r.name || `${r.building} · Room ${r.roomNumber}`).join(", ")
    : exam.room || "Block A · Room 204";
  exam.room = primaryRoom;

  await validateRoomCapacityAndConflicts({
    examId: exam._id,
    rooms: exam.rooms.length > 0 ? exam.rooms : [{ name: primaryRoom, capacity: 60 }],
    startDateTime: exam.startDateTime,
    endDateTime: exam.endDateTime,
    candidateCount,
  });

  // 5. Validate Invigilators
  await validateInvigilatorConflicts({
    examId: exam._id,
    invigilators: exam.invigilators,
    startDateTime: exam.startDateTime,
    endDateTime: exam.endDateTime,
  });

  // 6. Resolve course faculty
  const facultyMembers = await resolveAssignedFaculty({ courseId: exam.course?._id });
  exam.assignedFaculty = facultyMembers.map((f) => f.id);

  // 7. Update Exam Status
  const previousStatus = exam.status;
  exam.status = "PUBLISHED";
  exam.publishedAt = new Date();
  exam.publishedBy = actorUser._id;

  // 8. Create Official Notice referencing examId
  const noticeTitle = `Official Examination Notice: ${exam.title}`;
  const noticeBody = `Official Examination Notice:
Examination: ${exam.title}
Course: ${exam.course?.code} - ${exam.course?.name}
Program & Semester: ${exam.program} (Semester ${exam.semester})
Date (Gregorian): ${exam.examDate}
Date (Nepali): ${exam.nepaliDate}
Time: ${exam.startTime} – ${exam.endTime} (${durationInfo.durationLabel})
Venue / Rooms: ${primaryRoom}
Eligible Candidates: ${candidateCount} students
Instructions: ${exam.instructions || "Please report to the exam hall 15 minutes before the start time with your student ID card."}

Published by Examination Office on ${new Date().toLocaleDateString("en-US", { timeZone: "Asia/Kathmandu", dateStyle: "long" })}.`;

  const notice = await Notice.create({
    title: noticeTitle,
    content: noticeBody,
    category: "EXAMINATION",
    priority: "HIGH",
    authorUser: actorUser._id,
    targetRoles: ["student", "faculty", "exam_officer", "registrar", "hod"],
    examId: exam._id,
    publishedAt: new Date(),
  });
  exam.noticeId = notice._id;

  await exam.save();

  // 9. Generate Idempotent Notifications
  // A. Candidates
  for (const cand of candidates) {
    if (!cand.studentUser) continue;
    const key = `exam_pub_${exam._id}_${cand.studentUser}`;
    await createIdempotentNotification({
      userId: cand.studentUser,
      title: `New Examination Scheduled: ${exam.course?.name || exam.title}`,
      message: `${exam.title} scheduled on ${exam.examDate} (${exam.nepaliDate}) from ${exam.startTime} to ${exam.endTime} at ${primaryRoom}.`,
      category: "exam",
      priority: "high",
      actionUrl: "/examination",
      examId: exam._id,
      idempotencyKey: key,
    });
  }

  // B. Assigned Faculty
  for (const fac of facultyMembers) {
    const key = `exam_pub_fac_${exam._id}_${fac.id}`;
    await createIdempotentNotification({
      userId: fac.id,
      title: "Examination Scheduled for Your Course",
      message: `Your assigned course ${exam.course?.code} (${exam.course?.name}) has an examination on ${exam.examDate} (${exam.nepaliDate}), ${exam.startTime} - ${exam.endTime} at ${primaryRoom}. Candidates: ${candidateCount}.`,
      category: "exam",
      priority: "normal",
      actionUrl: "/examination",
      examId: exam._id,
      idempotencyKey: key,
    });
  }

  // C. Invigilators
  for (const inv of exam.invigilators || []) {
    if (!inv.user) continue;
    const key = `exam_pub_inv_${exam._id}_${inv.user}`;
    await createIdempotentNotification({
      userId: inv.user,
      title: "Examination Duty Assigned",
      message: `You are assigned as Invigilator for ${exam.title} (${exam.course?.code}) on ${exam.examDate} (${exam.nepaliDate}), ${exam.startTime} – ${exam.endTime} at ${inv.room || primaryRoom}.`,
      category: "exam",
      priority: "high",
      actionUrl: "/examination",
      examId: exam._id,
      idempotencyKey: key,
    });
  }

  // 10. Send Official College Mail
  const mailRecipients = [
    ...candidates.map((c) => ({ email: c.email, user: c.studentUser })),
    ...facultyMembers.map((f) => ({ email: f.email, user: f.id })),
  ];
  await sendInstitutionalExamMail({
    senderUser: actorUser,
    recipients: mailRecipients,
    subject: `Official Examination Schedule: ${exam.title}`,
    body: noticeBody,
  });

  // 11. Audit Logging
  await logAudit({
    userId: actorUser._id,
    action: "EXAM_PUBLISHED",
    module: "examinations",
    resource: "exam",
    resourceId: exam._id.toString(),
    oldValue: { status: previousStatus },
    newValue: {
      status: "PUBLISHED",
      candidateCount,
      publishedAt: exam.publishedAt,
      rooms: primaryRoom,
    },
    details: `Official examination published: ${exam.title}. Notified ${candidates.length} candidates, ${facultyMembers.length} faculty, and ${(exam.invigilators || []).length} invigilators.`,
  });

  return exam;
}

/**
 * Reschedule Examination Workflow
 */
export async function rescheduleExamination({
  examId,
  newExamDate,
  newStartTime,
  newEndTime,
  newRoom,
  reason = "Operational schedule adjustment",
  actorUser,
  ipAddress = null,
}) {
  const exam = await Exam.findById(examId).populate("course");
  if (!exam) throw new Error("Examination record not found.");

  if (exam.status === "CANCELLED") {
    throw new Error("Cannot reschedule a cancelled examination.");
  }

  const durationInfo = calculateExamDuration(newExamDate, newStartTime, newEndTime);
  const newNepaliDateObj = convertToNepaliDate(newExamDate);

  const prevSnapshot = {
    examDate: exam.examDate,
    nepaliDate: exam.nepaliDate,
    startTime: exam.startTime,
    endTime: exam.endTime,
    room: exam.room,
    reason: String(reason).trim(),
    rescheduledAt: new Date(),
    rescheduledBy: actorUser._id,
  };

  // Validate conflict for new time & room
  await validateRoomCapacityAndConflicts({
    examId: exam._id,
    rooms: [{ name: newRoom || exam.room, capacity: 60 }],
    startDateTime: durationInfo.startDateTime,
    endDateTime: durationInfo.endDateTime,
    candidateCount: exam.candidateCount,
  });

  exam.rescheduledFrom = prevSnapshot;
  exam.examDate = newExamDate;
  exam.nepaliDate = newNepaliDateObj.formatted;
  exam.startTime = newStartTime;
  exam.endTime = newEndTime;
  exam.durationMinutes = durationInfo.durationMinutes;
  exam.durationHours = durationInfo.durationHours;
  exam.startDateTime = durationInfo.startDateTime;
  exam.endDateTime = durationInfo.endDateTime;
  if (newRoom) exam.room = newRoom;
  exam.status = "RESCHEDULED";

  await exam.save();

  // Update linked notice if exists
  if (exam.noticeId) {
    await Notice.findByIdAndUpdate(exam.noticeId, {
      title: `[RESCHEDULED] Official Examination Notice: ${exam.title}`,
      content: `NOTICE OF RESCHEDULED EXAMINATION:
The schedule for "${exam.title}" (${exam.course?.code} - ${exam.course?.name}) has been revised.

NEW SCHEDULE:
Date (Gregorian): ${exam.examDate}
Date (Nepali): ${exam.nepaliDate}
Time: ${exam.startTime} – ${exam.endTime} (${durationInfo.durationLabel})
Venue / Room: ${exam.room}
Reason: ${reason}

PREVIOUS SCHEDULE:
Date: ${prevSnapshot.examDate} (${prevSnapshot.nepaliDate})
Time: ${prevSnapshot.startTime} – ${prevSnapshot.endTime}
Room: ${prevSnapshot.room}

Please check your dashboard for live countdown and instructions.`,
      priority: "URGENT",
      publishedAt: new Date(),
    });
  }

  // Idempotently notify affected candidates, faculty, and invigilators
  const timeKey = Date.now();
  for (const cand of exam.candidateSnapshot || []) {
    if (!cand.studentUser) continue;
    await createIdempotentNotification({
      userId: cand.studentUser,
      title: `EXAMINATION RESCHEDULED: ${exam.title}`,
      message: `Your exam for ${exam.course?.name} has been moved to ${exam.examDate} (${exam.nepaliDate}) from ${exam.startTime} to ${exam.endTime} at ${exam.room}. Reason: ${reason}.`,
      category: "exam",
      priority: "urgent",
      actionUrl: "/examination",
      examId: exam._id,
      idempotencyKey: `exam_resched_${exam._id}_${cand.studentUser}_${timeKey}`,
    });
  }

  for (const facId of exam.assignedFaculty || []) {
    await createIdempotentNotification({
      userId: facId,
      title: `Course Exam Rescheduled: ${exam.course?.code}`,
      message: `${exam.title} has been rescheduled to ${exam.examDate} (${exam.nepaliDate}), ${exam.startTime} - ${exam.endTime} at ${exam.room}.`,
      category: "exam",
      priority: "high",
      actionUrl: "/examination",
      examId: exam._id,
      idempotencyKey: `exam_resched_fac_${exam._id}_${facId}_${timeKey}`,
    });
  }

  for (const inv of exam.invigilators || []) {
    if (!inv.user) continue;
    await createIdempotentNotification({
      userId: inv.user,
      title: `Invigilation Duty Rescheduled: ${exam.title}`,
      message: `Your invigilation duty is updated to ${exam.examDate} (${exam.nepaliDate}), ${exam.startTime} - ${exam.endTime} at ${exam.room}.`,
      category: "exam",
      priority: "urgent",
      actionUrl: "/examination",
      examId: exam._id,
      idempotencyKey: `exam_resched_inv_${exam._id}_${inv.user}_${timeKey}`,
    });
  }

  await logAudit({
    userId: actorUser._id,
    action: "EXAM_RESCHEDULED",
    module: "examinations",
    resource: "exam",
    resourceId: exam._id.toString(),
    oldValue: prevSnapshot,
    newValue: {
      examDate: exam.examDate,
      nepaliDate: exam.nepaliDate,
      startTime: exam.startTime,
      endTime: exam.endTime,
      room: exam.room,
    },
    details: `Examination rescheduled: ${exam.title}. Reason: ${reason}.`,
  });

  return exam;
}

/**
 * Cancel Examination Workflow
 */
export async function cancelExamination({
  examId,
  reason = "Administrative cancellation",
  actorUser,
  ipAddress = null,
}) {
  const exam = await Exam.findById(examId).populate("course");
  if (!exam) throw new Error("Examination record not found.");

  const prevStatus = exam.status;
  exam.status = "CANCELLED";
  exam.cancellationReason = reason;
  exam.cancelledAt = new Date();
  exam.cancelledBy = actorUser._id;

  await exam.save();

  // Update linked notice
  if (exam.noticeId) {
    await Notice.findByIdAndUpdate(exam.noticeId, {
      title: `[CANCELLED] ${exam.title}`,
      content: `IMPORTANT NOTICE:
The examination "${exam.title}" (${exam.course?.code} - ${exam.course?.name}) previously scheduled for ${exam.examDate} (${exam.nepaliDate}) has been OFFICIALLY CANCELLED.

Reason for Cancellation: ${reason}
A new schedule will be announced in due course by the Examination Department.`,
      priority: "URGENT",
      publishedAt: new Date(),
    });
  }

  // Notify affected candidates, faculty, and invigilators
  const timeKey = Date.now();
  for (const cand of exam.candidateSnapshot || []) {
    if (!cand.studentUser) continue;
    await createIdempotentNotification({
      userId: cand.studentUser,
      title: `EXAMINATION CANCELLED: ${exam.title}`,
      message: `The examination for ${exam.course?.name} scheduled on ${exam.examDate} has been cancelled. Reason: ${reason}.`,
      category: "exam",
      priority: "urgent",
      actionUrl: "/examination",
      examId: exam._id,
      idempotencyKey: `exam_cancel_${exam._id}_${cand.studentUser}_${timeKey}`,
    });
  }

  for (const facId of exam.assignedFaculty || []) {
    await createIdempotentNotification({
      userId: facId,
      title: `Course Exam Cancelled: ${exam.course?.code}`,
      message: `${exam.title} scheduled on ${exam.examDate} has been cancelled.`,
      category: "exam",
      priority: "high",
      actionUrl: "/examination",
      examId: exam._id,
      idempotencyKey: `exam_cancel_fac_${exam._id}_${facId}_${timeKey}`,
    });
  }

  for (const inv of exam.invigilators || []) {
    if (!inv.user) continue;
    await createIdempotentNotification({
      userId: inv.user,
      title: `Invigilation Duty Cancelled: ${exam.title}`,
      message: `Your invigilation duty on ${exam.examDate} for ${exam.title} is cancelled.`,
      category: "exam",
      priority: "high",
      actionUrl: "/examination",
      examId: exam._id,
      idempotencyKey: `exam_cancel_inv_${exam._id}_${inv.user}_${timeKey}`,
    });
  }

  await logAudit({
    userId: actorUser._id,
    action: "EXAM_CANCELLED",
    module: "examinations",
    resource: "exam",
    resourceId: exam._id.toString(),
    oldValue: { status: prevStatus },
    newValue: { status: "CANCELLED", reason },
    details: `Examination cancelled: ${exam.title}. Reason: ${reason}.`,
  });

  return exam;
}
