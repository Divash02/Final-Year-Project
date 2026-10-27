import { getUserRoles, logAudit } from "../db.js";
import {
  Exam,
  ExamResult,
  Course,
  CourseTeachingAssignment,
  Student,
  User,
  Staff,
  AuditLog,
  Room,
  InstitutionSetting,
  StudentAssessmentMark,
} from "../models/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  convertToNepaliDate,
  calculateExamDuration,
  calculateExamCountdown,
  buildKathmanduDateTime,
} from "../services/nepaliDateHelper.js";
import {
  resolveCandidateAudience,
  resolveAssignedFaculty,
  validateRoomCapacityAndConflicts,
  validateInvigilatorConflicts,
  publishExamination,
  rescheduleExamination,
  cancelExamination,
} from "../services/examWorkflowService.js";
import {
  calculateGrade,
  calculatePercentage,
  isPassing,
  calculateWeightedGPA,
  validateMarks,
  loadGradingScale,
  calculateAuthoritativeMarksheetRow,
  DEFAULT_GRADING_SCALE,
} from "../services/gradingService.js";

export function registerExaminationRoutes(app) {
  /**
   * 1. Get List of Examinations (Scoped by Role & Permissions)
   */
  app.get(
    "/api/exams",
    requireAuth,
    requirePermission(["exam.view", "exams.view"]),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const currentUserId = req.user._id || req.user.id;
        const {
          status,
          courseId,
          program,
          semester,
          academicYear,
          search,
          examType,
          startDate,
          endDate,
        } = req.query || {};

        let filter = {};

        // Student Scope: only sees published or rescheduled exams where they are eligible candidates
        if (roles.includes("student") && !roles.some((r) => ["super_admin", "exam_officer", "registrar"].includes(r))) {
          const studentRecord = await Student.findOne({ user: currentUserId });
          if (!studentRecord) {
            return res.json({ exams: [] });
          }

          filter = {
            status: { $in: ["PUBLISHED", "RESCHEDULED", "IN_PROGRESS", "COMPLETED"] },
            $or: [
              { "candidateSnapshot.studentUser": currentUserId },
              { "candidateSnapshot.student": studentRecord._id },
              {
                candidateScope: "SEMESTER_WIDE",
                program: studentRecord.program,
                semester: studentRecord.semester,
              },
              {
                candidateScope: "PROGRAM_WIDE",
                program: studentRecord.program,
              },
            ],
          };
        }
        // Faculty Scope: only sees exams for courses they teach or where they are invigilator
        else if (
          roles.includes("faculty") &&
          !roles.some((r) => ["super_admin", "exam_officer", "registrar", "hod", "dean"].includes(r))
        ) {
          filter = {
            $or: [
              { assignedFaculty: currentUserId },
              { "invigilators.user": currentUserId },
            ],
          };
        }

        // Apply query filters
        if (status && status !== "ALL") {
          filter.status = status;
        }
        if (courseId && courseId !== "ALL") {
          filter.course = courseId;
        }
        if (program && program !== "ALL") {
          filter.program = program;
        }
        if (semester && semester !== "ALL") {
          filter.semester = Number(semester);
        }
        if (academicYear && academicYear !== "ALL") {
          filter.academicYear = academicYear;
        }
        if (examType && examType !== "ALL") {
          filter.examType = examType;
        }
        if (startDate || endDate) {
          filter.examDate = {};
          if (startDate) filter.examDate.$gte = startDate;
          if (endDate) filter.examDate.$lte = endDate;
        }
        if (search) {
          const sRegex = new RegExp(search.trim(), "i");
          filter.$or = [
            { title: sRegex },
            { examCode: sRegex },
            { room: sRegex },
          ];
        }

        const exams = await Exam.find(filter)
          .populate("course assignedFaculty publishedBy noticeId")
          .sort({ examDate: 1, startTime: 1 });

        const now = new Date();
        const formatted = exams.map((x) => {
          const countdown = calculateExamCountdown(
            x.startDateTime || `${x.examDate}T${x.startTime}:00+05:45`,
            x.endDateTime || `${x.examDate}T${x.endTime}:00+05:45`,
            x.status,
            now
          );

          // Determine faculty role for display
          let userRoleInExam = "Viewer";
          if (roles.includes("student")) {
            userRoleInExam = "Candidate";
          } else {
            const isAssignedFaculty = (x.assignedFaculty || []).some(
              (f) => f._id?.toString() === currentUserId.toString()
            );
            const isInvigilator = (x.invigilators || []).some(
              (inv) => inv.user?.toString() === currentUserId.toString()
            );
            if (isAssignedFaculty && isInvigilator) userRoleInExam = "Course Faculty & Invigilator";
            else if (isAssignedFaculty) userRoleInExam = "Course Faculty";
            else if (isInvigilator) userRoleInExam = "Invigilator";
          }

          return {
            id: x._id.toString(),
            _id: x._id.toString(),
            examCode: x.examCode || `EXAM-${x._id.toString().slice(-6).toUpperCase()}`,
            name: x.title,
            title: x.title,
            examType: x.examType,
            academicYear: x.academicYear,
            program: x.program,
            course_id: x.course?._id?.toString(),
            course_code: x.course?.code || "CS101",
            course_name: x.course?.name || "Subject",
            section_code: x.sectionCode,
            batch: x.batch,
            semester: x.semester,
            examDate: x.examDate,
            nepaliDate: x.nepaliDate || convertToNepaliDate(x.examDate).formatted,
            startTime: x.startTime,
            endTime: x.endTime,
            scheduled_at: `${x.examDate} ${x.startTime}`,
            durationMinutes: x.durationMinutes,
            durationHours: x.durationHours,
            room: x.room,
            rooms: x.rooms || [],
            candidateScope: x.candidateScope,
            candidateCount: x.candidateCount || (x.candidateSnapshot || []).length,
            invigilators: x.invigilators || [],
            status: x.status,
            results_status: x.resultsStatus,
            resultsStatus: x.resultsStatus,
            instructions: x.instructions,
            publishedAt: x.publishedAt,
            noticeId: x.noticeId?._id?.toString() || (x.noticeId ? x.noticeId.toString() : null),
            rescheduledFrom: x.rescheduledFrom,
            cancellationReason: x.cancellationReason,
            countdown,
            userRoleInExam,
          };
        });

        res.json({ exams: formatted });
      } catch (err) {
        console.error("Load exams error:", err);
        res.status(500).json({ error: "Failed to load examination records." });
      }
    }
  );

  /**
   * 2. Student Dashboard Upcoming Examinations Widget API
   */
  app.get("/api/student/exams/upcoming", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      const student = await Student.findOne({ user: currentUserId });
      if (!student) {
        return res.json({ exams: [] });
      }

      const exams = await Exam.find({
        status: { $in: ["PUBLISHED", "RESCHEDULED", "IN_PROGRESS"] },
        $or: [
          { "candidateSnapshot.studentUser": currentUserId },
          { "candidateSnapshot.student": student._id },
          { candidateScope: "SEMESTER_WIDE", program: student.program, semester: student.semester },
          { candidateScope: "PROGRAM_WIDE", program: student.program },
        ],
      })
        .populate("course")
        .sort({ startDateTime: 1, examDate: 1 });

      const now = new Date();
      const formatted = exams.map((x) => {
        const countdown = calculateExamCountdown(
          x.startDateTime || `${x.examDate}T${x.startTime}:00+05:45`,
          x.endDateTime || `${x.examDate}T${x.endTime}:00+05:45`,
          x.status,
          now
        );
        return {
          id: x._id.toString(),
          title: x.title,
          courseCode: x.course?.code || "CS101",
          courseName: x.course?.name || "Subject",
          program: x.program,
          semester: x.semester,
          examDate: x.examDate,
          nepaliDate: x.nepaliDate || convertToNepaliDate(x.examDate).formatted,
          startTime: x.startTime,
          endTime: x.endTime,
          room: x.room,
          instructions: x.instructions,
          status: x.status,
          countdown,
        };
      });

      res.json({ exams: formatted });
    } catch (err) {
      console.error("Student upcoming exams error:", err);
      res.status(500).json({ error: "Failed to load student exams." });
    }
  });

  /**
   * 3. Faculty Dashboard Upcoming Examinations Widget API
   */
  app.get("/api/faculty/exams/upcoming", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      const exams = await Exam.find({
        status: { $in: ["PUBLISHED", "RESCHEDULED", "IN_PROGRESS"] },
        $or: [
          { assignedFaculty: currentUserId },
          { "invigilators.user": currentUserId },
        ],
      })
        .populate("course")
        .sort({ startDateTime: 1, examDate: 1 });

      const now = new Date();
      const formatted = exams.map((x) => {
        const isAssigned = (x.assignedFaculty || []).some(
          (id) => id.toString() === currentUserId.toString()
        );
        const invigEntry = (x.invigilators || []).find(
          (inv) => inv.user?.toString() === currentUserId.toString()
        );

        let facultyRole = "Observer";
        if (isAssigned && invigEntry) facultyRole = "Course Faculty & Invigilator";
        else if (isAssigned) facultyRole = "Course Faculty";
        else if (invigEntry) facultyRole = "Invigilator";

        const countdown = calculateExamCountdown(
          x.startDateTime || `${x.examDate}T${x.startTime}:00+05:45`,
          x.endDateTime || `${x.examDate}T${x.endTime}:00+05:45`,
          x.status,
          now
        );

        return {
          id: x._id.toString(),
          title: x.title,
          courseCode: x.course?.code || "CS101",
          courseName: x.course?.name || "Subject",
          program: x.program,
          semester: x.semester,
          examDate: x.examDate,
          nepaliDate: x.nepaliDate || convertToNepaliDate(x.examDate).formatted,
          startTime: x.startTime,
          endTime: x.endTime,
          room: invigEntry?.room || x.room,
          candidateCount: x.candidateCount || (x.candidateSnapshot || []).length,
          facultyRole,
          status: x.status,
          countdown,
        };
      });

      res.json({ exams: formatted });
    } catch (err) {
      console.error("Faculty upcoming exams error:", err);
      res.status(500).json({ error: "Failed to load faculty exams." });
    }
  });

  /**
   * 4. Exam Officer Dashboard Operational Summary API
   */
  app.get(
    "/api/exams/dashboard-summary",
    requireAuth,
    requirePermission(["exam.view", "exams.view"]),
    async (req, res) => {
      try {
        const todayStr = new Date().toISOString().split("T")[0];
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split("T")[0];

        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split("T")[0];

        const [
          totalExams,
          publishedExams,
          todayExams,
          tomorrowExams,
          thisWeekExams,
          allActiveExams,
          pendingResultsExams,
          verifiedResultsExams,
          publishedResultsExams,
          recentActivity,
        ] = await Promise.all([
          Exam.countDocuments(),
          Exam.countDocuments({ status: "PUBLISHED" }),
          Exam.countDocuments({ examDate: todayStr, status: { $ne: "CANCELLED" } }),
          Exam.countDocuments({ examDate: tomorrowStr, status: { $ne: "CANCELLED" } }),
          Exam.countDocuments({
            examDate: { $gte: todayStr, $lte: nextWeekStr },
            status: { $ne: "CANCELLED" },
          }),
          Exam.find({ status: { $in: ["SCHEDULED", "PUBLISHED", "RESCHEDULED"] } }),
          Exam.countDocuments({ resultsStatus: "DRAFT", status: { $in: ["PUBLISHED", "COMPLETED"] } }),
          Exam.countDocuments({ resultsStatus: "VERIFIED" }),
          Exam.countDocuments({ resultsStatus: "PUBLISHED" }),
          AuditLog.find({ module: "examinations" })
            .populate("user", "firstName lastName email")
            .sort({ createdAt: -1 })
            .limit(10),
        ]);

        let totalCandidates = 0;
        let pendingRoomAssignments = 0;
        let pendingInvigilatorAssignments = 0;

        for (const ex of allActiveExams) {
          totalCandidates += ex.candidateCount || 0;
          if (!ex.rooms || ex.rooms.length === 0) {
            pendingRoomAssignments += 1;
          }
          if (!ex.invigilators || ex.invigilators.length === 0) {
            pendingInvigilatorAssignments += 1;
          }
        }

        res.json({
          summary: {
            totalExams,
            publishedExams,
            todayExams,
            tomorrowExams,
            thisWeekExams,
            totalCandidates,
            pendingRoomAssignments,
            pendingInvigilatorAssignments,
            pendingResultsExams,
            verifiedResultsExams,
            publishedResultsExams,
          },
          recentActivity: recentActivity.map((a) => ({
            id: a._id.toString(),
            action: a.action,
            details: a.details,
            actor: a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : "System",
            timestamp: a.timestamp || a.createdAt,
          })),
        });
      } catch (err) {
        console.error("Exam dashboard summary error:", err);
        res.status(500).json({ error: "Failed to load examination summary." });
      }
    }
  );

  /**
   * 5. Interactive Exam Calendar API
   */
  app.get(
    "/api/exams/calendar",
    requireAuth,
    requirePermission(["exam.view", "exams.view"]),
    async (req, res) => {
      try {
        const exams = await Exam.find({ status: { $ne: "CANCELLED" } })
          .populate("course")
          .sort({ examDate: 1, startTime: 1 });

        const calendarEvents = exams.map((x) => ({
          id: x._id.toString(),
          title: x.title,
          courseCode: x.course?.code || "CS101",
          courseName: x.course?.name || "Subject",
          program: x.program,
          semester: x.semester,
          examDate: x.examDate,
          nepaliDate: x.nepaliDate || convertToNepaliDate(x.examDate).formatted,
          startTime: x.startTime,
          endTime: x.endTime,
          room: x.room,
          status: x.status,
          candidateCount: x.candidateCount,
        }));

        res.json({ events: calendarEvents });
      } catch (err) {
        res.status(500).json({ error: "Failed to load calendar events." });
      }
    }
  );

  /**
   * 6. Real Audience Preview API (No static dummy data)
   */
  app.get(
    "/api/exams/audience/preview",
    requireAuth,
    requirePermission(["exam.create", "exams.create"]),
    async (req, res) => {
      try {
        const {
          program = "BCA",
          semester = 1,
          courseId,
          candidateScope = "COURSE_SPECIFIC",
          sectionCode = "ALL",
          batch = "2025",
        } = req.query || {};

        const { candidateCount, candidates, sectionBreakdown } =
          await resolveCandidateAudience({
            program,
            semester: Number(semester),
            courseId,
            candidateScope,
            sectionCode,
            batch,
          });

        const assignedFaculty = await resolveAssignedFaculty({ courseId });

        res.json({
          candidateCount,
          candidates,
          sectionBreakdown,
          assignedFaculty,
        });
      } catch (err) {
        console.error("Audience preview error:", err);
        res.status(500).json({ error: "Failed to preview candidate audience." });
      }
    }
  );

  /**
   * 7. Available Exam Rooms & Venues API
   */
  app.get(
    "/api/exams/rooms",
    requireAuth,
    requirePermission(["exam.view", "exams.view", "exam.manageRooms"]),
    async (req, res) => {
      try {
        let rooms = await Room.find({ isActive: true }).sort({ building: 1, roomNumber: 1 });
        if (rooms.length === 0) {
          // Seed standard institutional rooms if empty
          await Room.create([
            { building: "Block A", roomNumber: "204", name: "Block A · Room 204", capacity: 60, facilities: ["CCTV", "AC"] },
            { building: "Block A", roomNumber: "205", name: "Block A · Room 205", capacity: 60, facilities: ["CCTV", "AC"] },
            { building: "Block A", roomNumber: "206", name: "Block A · Room 206", capacity: 50, facilities: ["CCTV"] },
            { building: "Block B", roomNumber: "102", name: "Block B · Room 102", capacity: 40, facilities: ["Projector"] },
            { building: "Main Hall", roomNumber: "Exam Hall 1", name: "Main Campus · Exam Hall 1", capacity: 120, facilities: ["CCTV", "Sound System"] },
          ]);
          rooms = await Room.find({ isActive: true }).sort({ building: 1, roomNumber: 1 });
        }

        res.json({ rooms });
      } catch (err) {
        res.status(500).json({ error: "Failed to load exam rooms." });
      }
    }
  );

  /**
   * 8. Available Invigilators API
   */
  app.get(
    "/api/exams/invigilators/available",
    requireAuth,
    requirePermission(["exam.create", "exams.create", "exam.manageInvigilators"]),
    async (req, res) => {
      try {
        const staffMembers = await Staff.find({ isActive: true }).populate("user");
        const invigilators = [];

        for (const st of staffMembers) {
          if (st.user && st.user.isActive) {
            invigilators.push({
              userId: st.user._id.toString(),
              name: [st.user.firstName, st.user.lastName].filter(Boolean).join(" "),
              email: st.user.collegeEmail || st.user.email,
              designation: st.designation || (st.roleType === "faculty" ? "Faculty" : "Staff"),
              department: st.department,
            });
          }
        }

        // If staff is small, also fetch any users with faculty or staff role
        if (invigilators.length < 3) {
          const facultyUsers = await User.find({
            roles: { $in: ["faculty", "exam_officer", "campus_admin"] },
            isActive: true,
          }).limit(20);

          for (const u of facultyUsers) {
            if (!invigilators.some((i) => i.userId === u._id.toString())) {
              invigilators.push({
                userId: u._id.toString(),
                name: [u.firstName, u.lastName].filter(Boolean).join(" "),
                email: u.collegeEmail || u.email,
                designation: "Faculty / Staff",
                department: "Academic",
              });
            }
          }
        }

        res.json({ invigilators });
      } catch (err) {
        res.status(500).json({ error: "Failed to load invigilators." });
      }
    }
  );

  /**
   * 14b. Institutional Grading Scale API
   */
  app.get(
    "/api/exams/grading-scale",
    requireAuth,
    async (req, res) => {
      try {
        const scale = await loadGradingScale();
        res.json({ scale });
      } catch (err) {
        res.status(500).json({ error: "Failed to load grading scale." });
      }
    }
  );

  /**
   * 14c. Institution Official Profile API
   */
  app.get(
    "/api/exams/institution-profile",
    requireAuth,
    async (req, res) => {
      try {
        const profile = await getInstitutionProfile();
        res.json(profile);
      } catch (err) {
        res.status(500).json({ error: "Failed to load institution profile." });
      }
    }
  );

  

  /**
   * 9. Get Single Examination Details
   */
  app.get(
    "/api/exams/:id",
    requireAuth,
    requirePermission(["exam.view", "exams.view"]),
    async (req, res) => {
      try {
        const exam = await Exam.findById(req.params.id).populate(
          "course assignedFaculty publishedBy noticeId"
        );
        if (!exam) return res.status(404).json({ error: "Examination not found." });

        const now = new Date();
        const countdown = calculateExamCountdown(
          exam.startDateTime || `${exam.examDate}T${exam.startTime}:00+05:45`,
          exam.endDateTime || `${exam.examDate}T${exam.endTime}:00+05:45`,
          exam.status,
          now
        );

        const auditTrail = await AuditLog.find({
          module: "examinations",
          resourceId: exam._id.toString(),
        })
          .populate("user", "firstName lastName email")
          .sort({ createdAt: -1 });

        res.json({
          exam: {
            ...exam.toObject(),
            id: exam._id.toString(),
            countdown,
            auditTrail: auditTrail.map((a) => ({
              id: a._id.toString(),
              action: a.action,
              details: a.details,
              actor: a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : "System",
              timestamp: a.timestamp || a.createdAt,
              oldValue: a.oldValue,
              newValue: a.newValue,
            })),
          },
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to load exam details." });
      }
    }
  );

  /**
   * 10. Create Examination (Draft or Scheduled)
   */
  app.post(
    "/api/exams",
    requireAuth,
    requirePermission(["exam.create", "exams.create"]),
    async (req, res) => {
      try {
        const {
          name,
          title,
          examType = "FINAL",
          academicYear = "2083/84",
          program = "BCA",
          semester = 1,
          courseId,
          examDate,
          startTime = "10:00",
          endTime = "12:00",
          room,
          rooms = [],
          candidateScope = "COURSE_SPECIFIC",
          sectionCode = "ALL",
          batch = "2025",
          instructions = "",
          invigilators = [],
          isDraft = false,
        } = req.body || {};

        const examTitle = String(title || name || "").trim();
        if (!examTitle) {
          return res.status(400).json({ error: "Examination name / title is required." });
        }

        if (!examDate) {
          return res.status(400).json({ error: "Examination date is required." });
        }

        let course = null;
        if (courseId) {
          course = await Course.findById(courseId);
        }
        if (!course) {
          course = await Course.findOne();
        }
        if (!course) {
          return res.status(400).json({ error: "A valid academic course is required." });
        }

        // Validate time & duration (Asia/Kathmandu)
        const durationInfo = calculateExamDuration(examDate, startTime, endTime);

        // Convert Gregorian date to Nepali Bikram Sambat Date
        const nepaliDateObj = convertToNepaliDate(examDate);

        // Determine rooms and primary room label
        let roomList = Array.isArray(rooms) && rooms.length > 0 ? rooms : [];
        if (roomList.length === 0 && room) {
          roomList = [{ name: room, capacity: 60, roomNumber: room, building: "Block A" }];
        } else if (roomList.length === 0) {
          roomList = [{ name: "Block A · Room 204", capacity: 60, roomNumber: "204", building: "Block A" }];
        }
        const primaryRoom = roomList.map((r) => r.name || `${r.building} · Room ${r.roomNumber}`).join(", ");

        // Preview candidate audience
        const { candidateCount, candidates } = await resolveCandidateAudience({
          program,
          semester: Number(semester),
          courseId: course._id,
          candidateScope,
          sectionCode,
          batch,
        });

        // Validate room capacity and conflicts (unless draft)
        if (!isDraft) {
          await validateRoomCapacityAndConflicts({
            rooms: roomList,
            startDateTime: durationInfo.startDateTime,
            endDateTime: durationInfo.endDateTime,
            candidateCount,
          });

          await validateInvigilatorConflicts({
            invigilators,
            startDateTime: durationInfo.startDateTime,
            endDateTime: durationInfo.endDateTime,
          });
        }

        // Resolve assigned course faculty
        const assignedFaculty = await resolveAssignedFaculty({ courseId: course._id });

        const examCode = `EXAM-${new Date().getFullYear()}-${course.code}-${examType.slice(0, 3).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        const exam = await Exam.create({
          title: examTitle,
          examCode,
          examType,
          academicYear,
          program,
          semester: Number(semester),
          course: course._id,
          candidateScope,
          sectionCode: String(sectionCode).toUpperCase().trim(),
          batch,
          instructions,
          examDate,
          nepaliDate: nepaliDateObj.formatted,
          startTime,
          endTime,
          durationMinutes: durationInfo.durationMinutes,
          durationHours: durationInfo.durationHours,
          startDateTime: durationInfo.startDateTime,
          endDateTime: durationInfo.endDateTime,
          room: primaryRoom,
          rooms: roomList,
          assignedFaculty: assignedFaculty.map((f) => f.id),
          invigilators: Array.isArray(invigilators) ? invigilators : [],
          candidateCount,
          candidateSnapshot: candidates,
          status: isDraft ? "DRAFT" : "SCHEDULED",
          resultsStatus: "DRAFT",
          publishedBy: req.user._id,
        });

        await logAudit({
          userId: req.user._id || req.user.id,
          action: isDraft ? "EXAM_DRAFT_CREATED" : "EXAM_CREATED",
          module: "examinations",
          resource: "exam",
          resourceId: exam._id.toString(),
          newValue: {
            title: exam.title,
            course: course.code,
            examDate: exam.examDate,
            nepaliDate: exam.nepaliDate,
            startTime: exam.startTime,
            endTime: exam.endTime,
            room: exam.room,
            candidateCount,
          },
          details: `Examination created (${isDraft ? "Draft" : "Scheduled"}): ${examTitle} for ${course.code}.`,
        });

        res.status(201).json({
          success: true,
          examId: exam._id.toString(),
          exam: {
            id: exam._id.toString(),
            title: exam.title,
            examCode: exam.examCode,
            examDate: exam.examDate,
            nepaliDate: exam.nepaliDate,
            startTime: exam.startTime,
            endTime: exam.endTime,
            durationLabel: durationInfo.durationLabel,
            room: exam.room,
            candidateCount,
            status: exam.status,
          },
        });
      } catch (err) {
        console.error("Create exam error:", err);
        res.status(400).json({ error: err.message || "Failed to create examination." });
      }
    }
  );

  /**
   * 11. Publish Examination (Explicit Publish Confirmation Action)
   */
  app.post(
    "/api/exams/:id/publish",
    requireAuth,
    requirePermission(["exam.publish", "exams.create"]),
    async (req, res) => {
      try {
        const actorUser = req.user;
        const exam = await publishExamination({
          examId: req.params.id,
          actorUser,
          ipAddress: req.ip,
        });

        res.json({
          success: true,
          message: `Examination "${exam.title}" has been published across CollegeOS. Notifications and official notice have been generated.`,
          examId: exam._id.toString(),
          candidateCount: exam.candidateCount,
          status: exam.status,
          publishedAt: exam.publishedAt,
        });
      } catch (err) {
        console.error("Publish exam error:", err);
        res.status(400).json({ error: err.message || "Failed to publish examination." });
      }
    }
  );

  /**
   * 12. Reschedule Examination
   */
  app.post(
    "/api/exams/:id/reschedule",
    requireAuth,
    requirePermission(["exam.reschedule", "exams.update"]),
    async (req, res) => {
      try {
        const { newExamDate, newStartTime, newEndTime, newRoom, reason } = req.body || {};
        if (!newExamDate || !newStartTime || !newEndTime) {
          return res.status(400).json({ error: "New exam date, start time, and end time are required." });
        }

        const actorUser = req.user;
        const exam = await rescheduleExamination({
          examId: req.params.id,
          newExamDate,
          newStartTime,
          newEndTime,
          newRoom,
          reason,
          actorUser,
          ipAddress: req.ip,
        });

        res.json({
          success: true,
          message: `Examination "${exam.title}" has been rescheduled to ${exam.examDate} (${exam.nepaliDate}). Notice and notifications have been propagated.`,
          examId: exam._id.toString(),
          status: exam.status,
          examDate: exam.examDate,
          nepaliDate: exam.nepaliDate,
          startTime: exam.startTime,
          endTime: exam.endTime,
          room: exam.room,
        });
      } catch (err) {
        console.error("Reschedule exam error:", err);
        res.status(400).json({ error: err.message || "Failed to reschedule examination." });
      }
    }
  );

  /**
   * 13. Cancel Examination
   */
  app.post(
    "/api/exams/:id/cancel",
    requireAuth,
    requirePermission(["exam.cancel", "exams.update"]),
    async (req, res) => {
      try {
        const { reason } = req.body || {};
        if (!reason || String(reason).trim().length < 5) {
          return res.status(400).json({ error: "A valid reason for examination cancellation is required." });
        }

        const actorUser = req.user;
        const exam = await cancelExamination({
          examId: req.params.id,
          reason: String(reason).trim(),
          actorUser,
          ipAddress: req.ip,
        });

        res.json({
          success: true,
          message: `Examination "${exam.title}" has been cancelled. Affected students and faculty have been notified.`,
          examId: exam._id.toString(),
          status: exam.status,
          cancellationReason: exam.cancellationReason,
        });
      } catch (err) {
        console.error("Cancel exam error:", err);
        res.status(400).json({ error: err.message || "Failed to cancel examination." });
      }
    }
  );

  /**
   * 14. Get Exam Candidates Snapshot & Eligibility
   */
  app.get(
    "/api/exams/:id/candidates",
    requireAuth,
    requirePermission(["exam.view", "exams.view", "exam.manageCandidates"]),
    async (req, res) => {
      try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ error: "Examination not found." });

        if (exam.candidateSnapshot && exam.candidateSnapshot.length > 0) {
          return res.json({
            candidates: exam.candidateSnapshot,
            candidateCount: exam.candidateSnapshot.length,
            isSnapshot: true,
          });
        }

        // If not snapshotted yet, resolve dynamically
        const { candidates, candidateCount, sectionBreakdown } =
          await resolveCandidateAudience({
            program: exam.program,
            semester: exam.semester,
            courseId: exam.course,
            candidateScope: exam.candidateScope,
            sectionCode: exam.sectionCode,
            batch: exam.batch,
          });

        res.json({
          candidates,
          candidateCount,
          sectionBreakdown,
          isSnapshot: false,
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to load examination candidates." });
      }
    }
  );


  // =========================================================================
  // INSTITUTIONAL MARKSHEET & RESULTS CALCULATION ENGINE
  // =========================================================================

  async function resolveExamSubjects(exam) {
    if (exam.subjects && exam.subjects.length > 0) {
      const resolved = [];
      for (const s of exam.subjects) {
        let code = s.code;
        let name = s.name;
        let credits = s.credits;
        if ((!code || !name) && s.course) {
          const cDoc = await Course.findById(s.course);
          if (cDoc) {
            code = code || cDoc.code;
            name = name || cDoc.name;
            credits = credits || cDoc.credits;
          }
        }
        resolved.push({
          course: s.course || null,
          code: code || exam.examCode || "ASSESS",
          name: name || exam.title || "Subject Assessment",
          totalMarks: s.totalMarks || exam.totalMarks || 100,
          passMarks: s.passMarks || exam.passMarks || 40,
          credits: credits || 3,
        });
      }
      return resolved;
    }
    if (exam.course) {
      const courseDoc = exam.course._id ? exam.course : await Course.findById(exam.course);
      const code = courseDoc?.code || courseDoc?.courseCode || exam.examCode || "CS101";
      const name = courseDoc?.name || courseDoc?.title || exam.title || "Subject Assessment";
      const credits = courseDoc?.credits || 3;
      return [
        {
          course: courseDoc?._id || exam.course,
          code,
          name,
          totalMarks: exam.totalMarks || 100,
          passMarks: exam.passMarks || 40,
          credits,
        },
      ];
    }
    return [
      {
        course: null,
        code: exam.examCode || "ASSESS",
        name: exam.title || "Subject Assessment",
        totalMarks: exam.totalMarks || 100,
        passMarks: exam.passMarks || 40,
        credits: 3,
      },
    ];
  }

  async function getInstitutionProfile() {
    const nameSetting = await InstitutionSetting.findOne({ settingKey: "institution.name" });
    const deptSetting = await InstitutionSetting.findOne({ settingKey: "examination.department" });
    const addressSetting = await InstitutionSetting.findOne({ settingKey: "institution.address" });
    const phoneSetting = await InstitutionSetting.findOne({ settingKey: "institution.phone" });
    const emailSetting = await InstitutionSetting.findOne({ settingKey: "institution.email" });
    const logoSetting = await InstitutionSetting.findOne({ settingKey: "institution.logo" });

    return {
      name: nameSetting?.settingValue || "TECHSPIRE COLLEGE",
      department: deptSetting?.settingValue || "OFFICIAL EXAMINATION DEPARTMENT",
      affiliation: "Affiliated to University · Office of the Controller of Examinations",
      address: addressSetting?.settingValue || "Kathmandu, Nepal",
      phone: phoneSetting?.settingValue || "+977-1-4782000",
      email: emailSetting?.settingValue || "exam@techspire.edu.np",
      logoUrl: logoSetting?.settingValue || "/images/techspirecollege.png",
      watermarkUrl: "/images/techspirecollege.png",
    };
  }

  /**
   * 15. Get Results & Enrolled Marks (Role-scoped, IDOR-protected)
   *
   * Students see only their own published results.
   * Faculty see results for students in courses they teach.
   * Exam officers see all results for the exam.
   */
  app.get(
    "/api/exams/:id/results",
    requireAuth,
    requirePermission(["exam.view", "exams.view", "exam.manageResults", "exams.results.modify", "exam.results.view.own"]),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const exam = await Exam.findById(req.params.id)
          .populate("course")
          .populate("assignedFaculty", "firstName lastName");
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const isStaff = !roles.includes("student");
        let filter = { exam: exam._id };

        if (roles.includes("student") && !isStaff) {
          const studentRecord = await Student.findOne({ user: req.user._id });
          if (!studentRecord) return res.json({ results: [], exam: null });
          filter.student = studentRecord._id;
          filter.workflowStatus = "PUBLISHED";
        } else if (isFacultyScoped(roles)) {
          const ta = await CourseTeachingAssignment.findOne({
            facultyUser: req.user._id,
            course: exam.course ? exam.course._id : exam.course,
          });
          if (!ta) {
            return res.status(403).json({ error: "Not authorized to view results for this course." });
          }
        }

        const subjects = await resolveExamSubjects(exam);
        const institution = await getInstitutionProfile();

        const existingResults = await ExamResult.find(filter)
          .populate("student studentUser course")
          .sort({ "student.studentId": 1 });

        const resultMap = new Map();
        for (const r of existingResults) {
          const sKey = r.student?._id ? r.student._id.toString() : r.student?.toString();
          if (sKey) resultMap.set(sKey, r);
          if (r.student?.studentId) resultMap.set(r.student.studentId, r);
        }

        // Candidates roster: either candidateSnapshot or enrolled students
        let candidates = exam.candidateSnapshot || [];
        if (candidates.length === 0) {
          const studentQuery = {};
          if (exam.program && exam.program !== "ALL") studentQuery.program = exam.program;
          if (exam.semester) studentQuery.semester = exam.semester;
          if (exam.sectionCode && exam.sectionCode !== "ALL") studentQuery.section = exam.sectionCode;
          const foundStudents = await Student.find(studentQuery).populate("user").sort({ studentId: 1 });
          candidates = foundStudents.map((s) => ({
            student: s._id,
            studentUser: s.user?._id || s.user,
            studentId: s.studentId,
            rollNumber: s.rollNumber || s.studentId,
            fullName: s.fullName || `${s.firstName} ${s.lastName}`.trim(),
            program: s.program || exam.program,
            semester: s.semester || exam.semester,
            section: s.section || "A",
            attendancePercentage: 100,
            isEligible: true,
          }));
        }

        // If candidate is a student querying, only return their row
        if (roles.includes("student") && !isStaff) {
          const studentRec = await Student.findOne({ user: req.user._id });
          if (studentRec) {
            candidates = candidates.filter(
              (c) =>
                c.student?.toString() === studentRec._id.toString() ||
                c.studentId === studentRec.studentId
            );
          }
        }

        
        const assessmentMarks = await StudentAssessmentMark.find({
          academicYear: exam.academicYear,
          semester: exam.semester,
        });
        const assessmentMarksByStudent = new Map();
        for (const am of assessmentMarks) {
          const key = am.student.toString();
          if (!assessmentMarksByStudent.has(key)) assessmentMarksByStudent.set(key, {});
          assessmentMarksByStudent.get(key)[am.courseCode] = am;
        }

        const formatted = candidates.map((c, idx) => {
          const candIdStr = c.student ? c.student.toString() : "";
          const existing = resultMap.get(candIdStr) || resultMap.get(c.studentId);

          const subjectMarksObj = {};
          const subjectStatusObj = {};

          if (existing && existing.subjectMarks && existing.subjectMarks.length > 0) {
            for (const sm of existing.subjectMarks) {
              subjectMarksObj[sm.code] = sm.marksObtained;
              subjectStatusObj[sm.code] = sm.status;
            }
          } else if (existing && existing.marksObtained != null && subjects.length === 1) {
            subjectMarksObj[subjects[0].code] = existing.marksObtained;
            subjectStatusObj[subjects[0].code] = existing.status === "PASSED" ? "PASS" : "FAIL";
          } else {
            for (const s of subjects) {
              const am = assessmentMarksByStudent?.get(candIdStr)?.[s.code];
              if (am && am.totalMarksObtained != null) {
                subjectMarksObj[s.code] = am.totalMarksObtained;
                subjectStatusObj[s.code] = am.resultStatus === "PASS" ? "PASS" : "FAIL";
              } else {
                subjectMarksObj[s.code] = null;
                subjectStatusObj[s.code] = "INCOMPLETE";
              }
            }
          }

          const hasMissing = subjects.some(
            (s) =>
              subjectMarksObj[s.code] === null ||
              subjectMarksObj[s.code] === undefined ||
              subjectMarksObj[s.code] === "" ||
              subjectMarksObj[s.code] === "—"
          );

          return {
            id: existing ? existing._id.toString() : `temp_${c.studentId || idx}`,
            student_ref_id: c.student ? c.student.toString() : null,
            sn: idx + 1,
            student_id: c.studentId,
            student_name: c.fullName,
            roll_number: c.rollNumber || c.studentId,
            symbol_number: c.rollNumber || c.studentId,
            section: c.section || exam.sectionCode || "A",
            program: c.program || exam.program,
            semester: c.semester || exam.semester,
            batch: exam.batch || "",
            subject_marks: subjectMarksObj,
            subject_status: subjectStatusObj,
            is_absent: existing ? existing.isAbsent : false,
            is_incomplete: existing ? existing.isIncomplete : hasMissing,
            total_marks: existing && existing.marksObtained != null ? existing.marksObtained : null,
            total_possible: existing ? existing.totalMarksPossible : subjects.reduce((sum, s) => sum + (s.totalMarks || 100), 0),
            percentage: existing ? existing.percentage : null,
            grade: existing ? existing.grade : (hasMissing ? "—" : ""),
            grade_point: existing ? existing.gradePoint : null,
            status: existing ? (existing.status || "INCOMPLETE") : (hasMissing ? "INCOMPLETE" : "PENDING"),
            workflow_status: existing ? existing.workflowStatus : "DRAFT",
            remarks: existing ? (existing.remarks || "") : "",
            submitted_at: existing ? existing.submittedAt : null,
            verified_at: existing ? existing.verifiedAt : null,
            finalized_at: existing ? existing.finalizedAt : null,
            published_at: existing ? existing.publishedAt : null,
          };
        });

        // Summary calculations
        const totalStudents = formatted.length;
        const completed = formatted.filter((r) => !r.is_incomplete && !r.is_absent && r.total_marks != null).length;
        const incomplete = formatted.filter((r) => r.is_incomplete || r.status === "INCOMPLETE").length;
        const absent = formatted.filter((r) => r.is_absent || r.status === "ABSENT").length;
        const passed = formatted.filter((r) => r.status === "PASSED" || r.status === "PASS").length;
        const failed = formatted.filter((r) => r.status === "FAILED" || r.status === "FAIL").length;
        const completedPercentages = formatted.filter((r) => r.percentage != null).map((r) => r.percentage);
        const avgPercentage =
          completedPercentages.length > 0
            ? (completedPercentages.reduce((a, b) => a + b, 0) / completedPercentages.length).toFixed(2)
            : "0.00";

        let workflowStatus = exam.resultsStatus || "DRAFT";
        if (formatted.length > 0 && formatted.every((r) => r.workflow_status === "PUBLISHED")) {
          workflowStatus = "PUBLISHED";
        } else if (formatted.length > 0 && formatted.every((r) => r.workflow_status === "FINALIZED")) {
          workflowStatus = "FINALIZED";
        } else if (formatted.length > 0 && formatted.every((r) => r.workflow_status === "VERIFIED")) {
          workflowStatus = "VERIFIED";
        } else if (formatted.length > 0 && formatted.some((r) => r.workflow_status === "SUBMITTED")) {
          workflowStatus = "SUBMITTED";
        }

        res.json({
          exam: {
            id: exam._id.toString(),
            title: exam.title,
            code: exam.examCode,
            examType: exam.examType,
            program: exam.program,
            semester: exam.semester,
            sectionCode: exam.sectionCode,
            academicYear: exam.academicYear,
            examinationYear: exam.academicYear ? exam.academicYear.split("/")[0] : "2083",
            nepaliDate: exam.nepaliDate,
            examDate: exam.examDate,
            totalMarks: subjects.reduce((sum, s) => sum + (s.totalMarks || 100), 0),
            passMarks: subjects.reduce((sum, s) => sum + (s.passMarks || 40), 0),
            resultsStatus: exam.resultsStatus,
            workflowStatus,
            subjects,
          },
          institution,
          results: formatted,
          summary: {
            totalStudents,
            totalSubjects: subjects.length,
            totalPossibleMarks: subjects.reduce((sum, s) => sum + (s.totalMarks || 100), 0),
            completed,
            incomplete,
            passed,
            failed,
            absent,
            averagePercentage: Number(avgPercentage),
          },
        });
      } catch (err) {
        console.error("Failed to load results:", err);
        res.status(500).json({ error: "Failed to load exam results." });
      }
    }
  );

  /**
   * Helper: is the user a faculty member scoped below exam officer level?
   */
  function isFacultyScoped(roles) {
    return (
      roles.includes("faculty") &&
      !roles.some((r) => ["super_admin", "exam_officer", "registrar", "hod", "dean"].includes(r))
    );
  }

  /**
   * 15b. Student views own published result
   */
  app.get(
    "/api/student/exams/:examId/my-result",
    requireAuth,
    requirePermission(["exam.results.view.own"]),
    async (req, res) => {
      try {
        const exam = await Exam.findById(req.params.examId).populate("course");
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const studentRecord = await Student.findOne({ user: req.user._id });
        if (!studentRecord) return res.status(404).json({ error: "Student record not found." });

        const result = await ExamResult.findOne({
          exam: exam._id,
          student: studentRecord._id,
          workflowStatus: "PUBLISHED",
        }).populate("student studentUser course");

        if (!result) {
          return res.status(404).json({ error: "Result not available." });
        }

        const subjects = await resolveExamSubjects(exam);
        const institution = await getInstitutionProfile();

        const subjectMarksObj = {};
        const subjectStatusObj = {};
        if (result.subjectMarks && result.subjectMarks.length > 0) {
          for (const sm of result.subjectMarks) {
            subjectMarksObj[sm.code] = sm.marksObtained;
            subjectStatusObj[sm.code] = sm.status;
          }
        } else if (result.marksObtained != null && subjects.length === 1) {
          subjectMarksObj[subjects[0].code] = result.marksObtained;
          subjectStatusObj[subjects[0].code] = result.status === "PASSED" ? "PASS" : "FAIL";
        }

        res.json({
          result: {
            id: result._id.toString(),
            student_id: result.student?.studentId,
            student_name: result.student ? result.student.fullName || `${result.student.firstName} ${result.student.lastName}`.trim() : "Student",
            roll_number: result.student?.rollNumber || result.student?.studentId,
            symbol_number: result.student?.rollNumber || result.student?.studentId,
            enrollment_id: result.student?.enrollmentId,
            program: result.student?.program || exam.program,
            semester: result.student?.semester || exam.semester,
            batch: result.student?.batch || exam.batch,
            section: result.student?.section || "A",
            full_marks: result.totalMarksPossible || exam.totalMarks,
            pass_marks: exam.passMarks,
            obtained_marks: result.marksObtained,
            percentage: result.percentage,
            grade: result.grade,
            grade_point: result.gradePoint,
            status: result.status,
            workflow_status: result.workflowStatus,
            remarks: result.remarks,
            exam_title: exam.title,
            exam_code: exam.examCode,
            academic_year: exam.academicYear,
            subject_marks: subjectMarksObj,
            subject_status: subjectStatusObj,
            subjectMarks: result.subjectMarks || [],
            published_at: result.publishedAt,
          },
          subjects,
          institution,
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to load result." });
      }
    }
  );

  /**
   * 16. Enter / Modify Results (Save Draft)
   *
   * Authoritatively evaluates candidate marks against institutional grading scale.
   */
  app.post(
    "/api/exams/:id/results",
    requireAuth,
    requirePermission(["exam.manageResults", "exams.results.modify"]),
    async (req, res) => {
      try {
        const { marks = [] } = req.body || {};
        const exam = await Exam.findById(req.params.id).populate("course");
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const roles = getUserRoles(req.user);
        const facultyScoped = isFacultyScoped(roles);

        let teachingAssignment = null;
        if (facultyScoped) {
          teachingAssignment = await CourseTeachingAssignment.findOne({
            facultyUser: req.user._id,
            course: exam.course ? exam.course._id : exam.course,
          });
          if (!teachingAssignment) {
            return res.status(403).json({ error: "Not authorized to enter results for this course." });
          }
        }

        const subjects = await resolveExamSubjects(exam);
        let savedCount = 0;
        const errors = [];

        for (const item of marks) {
          const studentLookupId = item.studentId || item.student_id;
          let student = studentLookupId
            ? await Student.findOne({ studentId: studentLookupId })
            : null;

          if (!student && studentLookupId && studentLookupId.match(/^[0-9a-fA-F]{24}$/)) {
            student = await Student.findById(studentLookupId);
          }
          if (!student && item.student_ref_id) {
            student = await Student.findById(item.student_ref_id);
          }
          if (!student) {
            errors.push(`Student not found: ${studentLookupId}`);
            continue;
          }

          if (facultyScoped && teachingAssignment) {
            if (student.section !== teachingAssignment.sectionCode) {
              continue;
            }
          }

          const marksMap = item.subjectMarks || item.subject_marks || {};
          if (item.marks !== undefined && Object.keys(marksMap).length === 0 && subjects.length === 1) {
            marksMap[subjects[0].code] = item.marks;
          }

          const calc = await calculateAuthoritativeMarksheetRow({
            subjects,
            marksMap,
            isAbsentCandidate: item.isAbsent || item.is_absent || false,
          });

          if (!calc.valid) {
            errors.push(`Student ${student.studentId}: ${calc.error}`);
            continue;
          }

          const existing = await ExamResult.findOne({
            exam: exam._id,
            student: student._id,
          });

          const oldWorkflowStatus = existing ? existing.workflowStatus : "DRAFT";

          if (oldWorkflowStatus === "FINALIZED" || oldWorkflowStatus === "PUBLISHED") {
            if (!roles.some((r) => ["exam_officer", "registrar", "super_admin"].includes(r))) {
              errors.push(`Student ${student.studentId}: result is finalized and cannot be edited.`);
              continue;
            }
          }

          const targetWorkflowStatus =
            oldWorkflowStatus === "CORRECTION_REQUIRED" ? "REVISED" : oldWorkflowStatus === "REVISED" ? "REVISED" : "DRAFT";

          const updated = await ExamResult.findOneAndUpdate(
            { exam: exam._id, student: student._id },
            {
              $set: {
                exam: exam._id,
                student: student._id,
                studentUser: student.user,
                course: exam.course ? (exam.course._id || exam.course) : null,
                marksObtained: calc.totalMarksObtained != null ? calc.totalMarksObtained : 0,
                totalMarksPossible: calc.totalMarksPossible,
                percentage: calc.percentage,
                grade: calc.grade,
                gradePoint: calc.gradePoint,
                gpa: calc.gradePoint,
                status: calc.status === "PASSED" ? "PASSED" : calc.status === "FAILED" ? "FAILED" : calc.status === "ABSENT" ? "ABSENT" : "INCOMPLETE",
                isAbsent: calc.isAbsent,
                isIncomplete: calc.isIncomplete,
                subjectMarks: calc.subjectMarks,
                remarks: item.remarks || "",
                workflowStatus: targetWorkflowStatus,
              },
            },
            { upsert: true, returnDocument: 'after' }
          );

          await logAudit({
            userId: req.user._id,
            action: "RESULT_MARKS_CHANGED",
            module: "examinations",
            resource: "exam_result",
            resourceId: updated._id.toString(),
            oldValue: existing ? { marks: existing.marksObtained, grade: existing.grade, status: existing.status } : null,
            newValue: { marks: calc.totalMarksObtained, grade: calc.grade, status: calc.status },
            details: `Marks ${existing ? "updated" : "entered"} for student ${student.studentId} (${student.fullName || student.firstName}) in ${exam.title}.`,
          });

          savedCount++;
        }

        res.json({ success: true, savedCount, errors });
      } catch (err) {
        console.error("Failed to save exam results:", err);
        res.status(500).json({ error: "Failed to save exam results." });
      }
    }
  );

  /**
   * 16b. Submit Results for Verification
   *
   * Transitions results from DRAFT / REVISED to SUBMITTED.
   */
  app.post(
    "/api/exams/:id/results/submit",
    requireAuth,
    requirePermission(["exam.results.submit"]),
    async (req, res) => {
      try {
        const exam = await Exam.findById(req.params.id).populate("course");
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const roles = getUserRoles(req.user);
        const facultyScoped = isFacultyScoped(roles);

        if (facultyScoped) {
          const ta = await CourseTeachingAssignment.findOne({
            facultyUser: req.user._id,
            course: exam.course ? exam.course._id : exam.course,
          });
          if (!ta) {
            return res.status(403).json({ error: "Not authorized to submit results for this course." });
          }
        }

        const result = await ExamResult.updateMany(
          {
            exam: exam._id,
            workflowStatus: { $in: ["DRAFT", "REVISED"] },
          },
          {
            $set: { workflowStatus: "SUBMITTED", submittedAt: new Date() },
          }
        );

        exam.resultsStatus = "UNDER_EVALUATION";
        await exam.save();

        await logAudit({
          userId: req.user._id,
          action: "RESULTS_SUBMITTED",
          module: "examinations",
          resource: "exam",
          resourceId: exam._id.toString(),
          details: `Results submitted for verification: ${result.modifiedCount} record(s).`,
        });

        res.json({
          success: true,
          submitted: result.modifiedCount,
          message: "Results submitted for verification.",
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to submit results." });
      }
    }
  );

  /**
   * 17. Verify Exam Results
   *
   * Transitions results from SUBMITTED to VERIFIED.
   */
  app.post(
    "/api/exams/:id/results/verify",
    requireAuth,
    requirePermission(["exam.verifyResults", "exams.results.modify", "grade.verify"]),
    async (req, res) => {
      try {
        const { remarks = "Results verified by authorized examination scrutinizer." } = req.body || {};
        const exam = await Exam.findById(req.params.id).populate("course");
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const update = await ExamResult.updateMany(
          { exam: exam._id, workflowStatus: { $in: ["SUBMITTED", "UNDER_VERIFICATION", "DRAFT"] } },
          {
            $set: {
              workflowStatus: "VERIFIED",
              verifiedBy: req.user._id,
              verifiedAt: new Date(),
            },
          }
        );

        if (update.modifiedCount > 0) {
          exam.resultsStatus = "VERIFIED";
          exam.examOfficer = req.user._id;
          await exam.save();
        }

        await logAudit({
          userId: req.user._id,
          action: "RESULTS_VERIFIED",
          module: "examinations",
          resource: "exam",
          resourceId: exam._id.toString(),
          details: `Results verified for ${exam.title}: ${update.modifiedCount} record(s). Remarks: ${remarks}`,
        });

        res.json({
          success: true,
          verified: update.modifiedCount,
          message: "Exam results verified.",
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to verify results." });
      }
    }
  );

  /**
   * 17b. Finalize Results
   *
   * Transitions VERIFIED -> FINALIZED. Authoritatively locks results.
   */
  app.post(
    "/api/exams/:id/results/finalize",
    requireAuth,
    requirePermission(["exam.results.finalize"]),
    async (req, res) => {
      try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const subjects = await resolveExamSubjects(exam);
        const results = await ExamResult.find({
          exam: exam._id,
          workflowStatus: { $in: ["SUBMITTED", "UNDER_VERIFICATION", "VERIFIED", "DRAFT"] },
        });

        for (const r of results) {
          const marksMap = {};
          if (r.subjectMarks && r.subjectMarks.length > 0) {
            for (const sm of r.subjectMarks) marksMap[sm.code] = sm.marksObtained;
          } else if (r.marksObtained != null && subjects.length === 1) {
            marksMap[subjects[0].code] = r.marksObtained;
          }
          const calc = await calculateAuthoritativeMarksheetRow({
            subjects,
            marksMap,
            isAbsentCandidate: r.isAbsent,
          });
          if (calc.valid) {
            r.marksObtained = calc.totalMarksObtained != null ? calc.totalMarksObtained : 0;
            r.totalMarksPossible = calc.totalMarksPossible;
            r.percentage = calc.percentage;
            r.grade = calc.grade;
            r.gradePoint = calc.gradePoint;
            r.gpa = calc.gradePoint;
            r.status = calc.status === "PASSED" ? "PASSED" : calc.status === "FAILED" ? "FAILED" : calc.status === "ABSENT" ? "ABSENT" : "INCOMPLETE";
            r.isAbsent = calc.isAbsent;
            r.isIncomplete = calc.isIncomplete;
            r.subjectMarks = calc.subjectMarks;
          }
          r.workflowStatus = "FINALIZED";
          r.finalizedBy = req.user._id;
          r.finalizedAt = new Date();
          await r.save();
        }

        exam.resultsStatus = "VERIFIED";
        await exam.save();

        await logAudit({
          userId: req.user._id,
          action: "RESULTS_FINALIZED",
          module: "examinations",
          resource: "exam",
          resourceId: exam._id.toString(),
          details: `Results finalized and locked for ${exam.title}. ${results.length} record(s) set to FINALIZED.`,
        });

        res.json({
          success: true,
          finalized: results.length,
          message: "Results finalized and locked.",
        });
      } catch (err) {
        console.error("Failed to finalize results:", err);
        res.status(500).json({ error: "Failed to finalize results." });
      }
    }
  );

  /**
   * 18. Publish Results to Students
   *
   * Transitions FINALIZED -> PUBLISHED. Makes results available to candidates.
   */
  app.post(
    "/api/exams/:id/results/publish",
    requireAuth,
    requirePermission(["exam.publishResults", "exams.results.publish"]),
    async (req, res) => {
      try {
        const exam = await Exam.findById(req.params.id).populate("course");
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const toPublish = await ExamResult.find({
          exam: exam._id,
          workflowStatus: { $in: ["FINALIZED", "VERIFIED"] },
        }).populate("studentUser");

        const update = await ExamResult.updateMany(
          { exam: exam._id, workflowStatus: { $in: ["FINALIZED", "VERIFIED"] } },
          {
            $set: {
              workflowStatus: "PUBLISHED",
              publishedBy: req.user._id,
              publishedAt: new Date(),
            },
          }
        );

        exam.resultsStatus = "PUBLISHED";
        exam.publishedAt = exam.publishedAt || new Date();
        exam.publishedBy = req.user._id;
        await exam.save();

        const { Notification } = await import("../models/index.js");
        for (const resItem of toPublish) {
          if (resItem.studentUser) {
            await Notification.create({
              user: resItem.studentUser._id,
              title: `Official Statement of Marks Published: ${exam.title}`,
              message: `Your official examination marksheet for ${exam.title} (${exam.program} Sem ${exam.semester}) is now published.`,
              category: "exam",
              priority: "high",
              actionUrl: "/examination",
              examId: exam._id,
            });
          }
        }

        await logAudit({
          userId: req.user._id,
          action: "EXAM_RESULTS_PUBLISHED",
          module: "examinations",
          resource: "exam",
          resourceId: exam._id.toString(),
          details: `Published official exam marksheets for ${exam.title} to ${toPublish.length} students.`,
        });

        res.json({
          success: true,
          published: update.modifiedCount,
          message: "Exam results published to students.",
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to publish exam results." });
      }
    }
  );

  /**
   * 18b. Revoke Publication
   *
   * Transitions PUBLISHED -> CORRECTION_REQUIRED with audit trace.
   */
  app.post(
    "/api/exams/:id/results/revoke",
    requireAuth,
    requirePermission(["exam.results.revoke"]),
    async (req, res) => {
      try {
        const { remarks = "Results revoked for correction." } = req.body || {};
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const update = await ExamResult.updateMany(
          { exam: exam._id, workflowStatus: "PUBLISHED" },
          {
            $set: { workflowStatus: "CORRECTION_REQUIRED" },
            $push: {
              workflowHistory: {
                status: "CORRECTION_REQUIRED",
                actor: req.user._id,
                role: "exam_officer",
                remarks,
                timestamp: new Date(),
              },
            },
          }
        );

        exam.resultsStatus = "UNDER_EVALUATION";
        await exam.save();

        await logAudit({
          userId: req.user._id,
          action: "RESULTS_REVOKED",
          module: "examinations",
          resource: "exam",
          resourceId: exam._id.toString(),
          details: `Results revoked for correction: ${update.modifiedCount} record(s). Reason: ${remarks}`,
        });

        res.json({
          success: true,
          revoked: update.modifiedCount,
          message: "Results revoked for correction.",
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to revoke results." });
      }
    }
  );

  /**
   * 18c. Correct a Result (after revocation)
   */
  app.post(
    "/api/exams/:id/results/:studentId/correct",
    requireAuth,
    requirePermission(["exam.results.correct"]),
    async (req, res) => {
      try {
        const { marks, subjectMarks, remarks = "Result corrected by examination controller." } = req.body || {};
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        let student = await Student.findOne({ studentId: req.params.studentId });
        if (!student && req.params.studentId.match(/^[0-9a-fA-F]{24}$/)) {
          student = await Student.findById(req.params.studentId);
        }
        if (!student) return res.status(404).json({ error: "Student not found." });

        const result = await ExamResult.findOne({
          exam: exam._id,
          student: student._id,
        });

        if (!result) {
          return res.status(404).json({ error: "Result not found." });
        }

        if (result.workflowStatus !== "CORRECTION_REQUIRED" && result.workflowStatus !== "REVISED") {
          return res.status(400).json({ error: `Result must be in CORRECTION_REQUIRED state, currently ${result.workflowStatus}` });
        }

        const subjects = await resolveExamSubjects(exam);
        const marksMap = subjectMarks || {};
        if (marks !== undefined && Object.keys(marksMap).length === 0 && subjects.length === 1) {
          marksMap[subjects[0].code] = marks;
        }

        const calc = await calculateAuthoritativeMarksheetRow({
          subjects,
          marksMap,
          isAbsentCandidate: req.body.isAbsent || false,
        });

        if (!calc.valid) {
          return res.status(400).json({ error: calc.error });
        }

        const oldValue = {
          marks: result.marksObtained,
          grade: result.grade,
          gradePoint: result.gradePoint,
          status: result.status,
          workflowStatus: result.workflowStatus,
        };

        result.marksObtained = calc.totalMarksObtained != null ? calc.totalMarksObtained : 0;
        result.totalMarksPossible = calc.totalMarksPossible;
        result.percentage = calc.percentage;
        result.grade = calc.grade;
        result.gradePoint = calc.gradePoint;
        result.status = calc.status;
        result.subjectMarks = calc.subjectMarks;
        result.workflowStatus = "REVISED";
        result.verifiedBy = null;
        result.finalizedBy = null;
        result.publishedBy = null;

        result.workflowHistory.push({
          status: "REVISED",
          actor: req.user._id,
          role: "exam_officer",
          remarks,
          oldValue,
          newValue: { marks: calc.totalMarksObtained, grade: calc.grade, status: calc.status },
          timestamp: new Date(),
        });

        await result.save();

        await logAudit({
          userId: req.user._id,
          action: "RESULT_CORRECTED",
          module: "examinations",
          resource: "exam_result",
          resourceId: result._id.toString(),
          oldValue,
          newValue: { marks: calc.totalMarksObtained, grade: calc.grade, status: calc.status },
          details: `Result corrected for student ${student.studentId} in ${exam.title}.`,
        });

        res.json({ success: true, message: "Result corrected.", workflowStatus: "REVISED" });
      } catch (err) {
        res.status(500).json({ error: "Failed to correct result." });
      }
    }
  );

  /**
   * 19. Get Official Marksheet Document Data (View B & Review View)
   */
  app.get(
    "/api/exams/:id/results/marksheet",
    requireAuth,
    requirePermission(["exam.results.marksheet", "exam.view"]),
    async (req, res) => {
      try {
        const { studentId } = req.query || {};
        const exam = await Exam.findById(req.params.id)
          .populate("course")
          .populate("assignedFaculty", "firstName lastName");

        if (!exam) return res.status(404).json({ error: "Exam not found." });

        const subjects = await resolveExamSubjects(exam);
        const institution = await getInstitutionProfile();

        let filter = { exam: exam._id };
        if (studentId) {
          let student = await Student.findOne({ studentId });
          if (!student && studentId.match(/^[0-9a-fA-F]{24}$/)) {
            student = await Student.findById(studentId);
          }
          if (!student) return res.status(404).json({ error: "Student not found." });
          filter.student = student._id;
        }

        const results = await ExamResult.find(filter)
          .populate("student studentUser course")
          .sort({ "student.studentId": 1 });

        const marksheetItems = results.map((r, idx) => {
          const subjectMarksObj = {};
          const subjectStatusObj = {};

          if (r.subjectMarks && r.subjectMarks.length > 0) {
            for (const sm of r.subjectMarks) {
              subjectMarksObj[sm.code] = sm.marksObtained;
              subjectStatusObj[sm.code] = sm.status;
            }
          } else if (r.marksObtained != null && subjects.length === 1) {
            subjectMarksObj[subjects[0].code] = r.marksObtained;
            subjectStatusObj[subjects[0].code] = r.status === "PASSED" ? "PASS" : "FAIL";
          }

          return {
            sn: idx + 1,
            result_id: r._id.toString(),
            student_id: r.student?.studentId,
            student_name: r.student ? r.student.fullName || `${r.student.firstName} ${r.student.lastName}`.trim() : "Student",
            roll_number: r.student?.rollNumber || r.student?.studentId,
            symbol_number: r.student?.rollNumber || r.student?.studentId,
            enrollment_id: r.student?.enrollmentId,
            section: r.student?.section || exam.sectionCode || "A",
            program: r.student?.program || exam.program,
            semester: r.student?.semester || exam.semester,
            batch: r.student?.batch || exam.batch,
            subject_marks: subjectMarksObj,
            subject_status: subjectStatusObj,
            subjectMarks: r.subjectMarks || [],
            is_absent: r.isAbsent,
            is_incomplete: r.isIncomplete,
            total_marks: r.marksObtained,
            total_possible: r.totalMarksPossible || subjects.reduce((sum, s) => sum + (s.totalMarks || 100), 0),
            percentage: r.percentage,
            grade: r.grade,
            grade_point: r.gradePoint,
            status: r.status,
            workflow_status: r.workflowStatus,
            remarks: r.remarks,
            submitted_at: r.submittedAt,
            verified_at: r.verifiedAt,
            finalized_at: r.finalizedAt,
            published_at: r.publishedAt,
          };
        });

        const totalStudents = marksheetItems.length;
        const completed = marksheetItems.filter((r) => !r.is_incomplete && !r.is_absent && r.total_marks != null).length;
        const incomplete = marksheetItems.filter((r) => r.is_incomplete || r.status === "INCOMPLETE").length;
        const absent = marksheetItems.filter((r) => r.is_absent || r.status === "ABSENT").length;
        const passed = marksheetItems.filter((r) => r.status === "PASSED" || r.status === "PASS").length;
        const failed = marksheetItems.filter((r) => r.status === "FAILED" || r.status === "FAIL").length;
        const completedPercentages = marksheetItems.filter((r) => r.percentage != null).map((r) => r.percentage);
        const avgPercentage =
          completedPercentages.length > 0
            ? (completedPercentages.reduce((a, b) => a + b, 0) / completedPercentages.length).toFixed(2)
            : "0.00";

        res.json({
          exam: {
            title: exam.title,
            exam_code: exam.examCode,
            exam_type: exam.examType,
            academic_year: exam.academicYear,
            examination_year: exam.academicYear ? exam.academicYear.split("/")[0] : "2083",
            program: exam.program,
            semester: exam.semester,
            section_code: exam.sectionCode,
            batch: exam.batch,
            total_marks: subjects.reduce((sum, s) => sum + (s.totalMarks || 100), 0),
            pass_marks: subjects.reduce((sum, s) => sum + (s.passMarks || 40), 0),
            results_status: exam.resultsStatus,
            published_at: exam.publishedAt,
            assigned_faculty: exam.assignedFaculty?.map((f) => `${f.firstName} ${f.lastName}`.trim()),
          },
          institution,
          subjects,
          results: marksheetItems,
          summary: {
            totalStudents,
            totalSubjects: subjects.length,
            totalPossibleMarks: subjects.reduce((sum, s) => sum + (s.totalMarks || 100), 0),
            completed,
            incomplete,
            passed,
            failed,
            absent,
            averagePercentage: Number(avgPercentage),
          },
          signatures: {
            preparedBy: {
              title: "Prepared By",
              designation: "Examination Officer",
              name: "Examination Control Division",
              date: new Date().toISOString().split("T")[0],
            },
            verifiedBy: {
              title: "Verified By",
              designation: "Authorized Scrutinizer",
              name: "Department of Examination",
              date: new Date().toISOString().split("T")[0],
            },
            controller: {
              title: "Controller / Examination Officer",
              designation: "Controller of Examinations",
              name: "Official Examination Department",
              date: new Date().toISOString().split("T")[0],
            },
            sealText: "OFFICIAL EXAMINATION SEAL",
          },
          footer: {
            disclaimer: "This is a computer-generated statement of marks issued by CollegeOS Examination Management System.",
            generatedDate: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.error("Failed to load marksheet data:", err);
        res.status(500).json({ error: "Failed to load marksheet data." });
      }
    }
  );

  /**
   * 20. Exam Audit History API
   */
  app.get(
    "/api/exams/:id/audit",
    requireAuth,
    requirePermission(["exam.viewAudit", "audit.view"]),
    async (req, res) => {
      try {
        const rows = await AuditLog.find({
          module: "examinations",
          resourceId: req.params.id,
        })
          .populate("user", "firstName lastName email")
          .sort({ createdAt: -1 });

        res.json({
          audit: rows.map((a) => ({
            id: a._id.toString(),
            action: a.action,
            details: a.details,
            actor: a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : "System",
            timestamp: a.timestamp || a.createdAt,
            oldValue: a.oldValue,
            newValue: a.newValue,
          })),
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to load audit history." });
      }
    }
  );

  /**
   * 20b. Individual Result Audit History
   */
  app.get(
    "/api/exams/:id/results/:studentId/audit",
    requireAuth,
    requirePermission(["exam.viewAudit", "audit.view"]),
    async (req, res) => {
      try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ error: "Exam not found." });

        let student = await Student.findOne({ studentId: req.params.studentId });
        if (!student && req.params.studentId.match(/^[0-9a-fA-F]{24}$/)) {
          student = await Student.findById(req.params.studentId);
        }
        if (!student) return res.status(404).json({ error: "Student not found." });

        const rows = await AuditLog.find({
          module: "examinations",
          resourceId: exam._id.toString(),
          resource: "exam_result",
        })
          .populate("user", "firstName lastName email")
          .sort({ createdAt: -1 });

        // Filter to this student's audit entries
        const relevant = rows.filter((row) => {
          const details = row.details || "";
          const studentId = student.studentId || "";
          return details.includes(studentId) || (row.newValue && JSON.stringify(row.newValue).includes(String(student._id)));
        });

        res.json({
          audit: relevant.map((a) => ({
            id: a._id.toString(),
            action: a.action,
            details: a.details,
            actor: a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : "System",
            timestamp: a.timestamp || a.createdAt,
            oldValue: a.oldValue,
            newValue: a.newValue,
          })),
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to load result audit history." });
      }
    }
  );
}
