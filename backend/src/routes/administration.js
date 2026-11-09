import {
  hashPassword,
  revokeUserSessions,
  getUserRoles,
  logAudit,
  recordInstitutionEvent,
  invalidatePasswordResetTokens,
} from "../db.js";
import {
  User,
  Student,
  Staff,
  Course,
  Section,
  Enrollment,
  Program,
  InstitutionSetting,
  AuditLog,
  PasswordResetToken,
  Session,
  FacultySubjectAssignment,
} from "../models/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getMinimumPasswordLength,
  PASSWORD_MIN_LENGTH,
} from "../services/passwordPolicy.js";
import { generateInstitutionalEmail } from "../services/institutionalEmail.js";
import { createTemporaryPassword } from "../utils/temporaryPassword.js";
import {
  provisionStudentAccount,
  provisionStaffProfile,
} from "../services/studentProvisioning.js";
import {
  DEFAULT_PROGRAM,
  DEFAULT_SECTION,
  DEFAULT_ACADEMIC_YEAR,
  requireValidProgram,
  requireValidSection,
  requireValidAcademicYear,
} from "../config/academic.js";

const STAFF_PROFILE_ROLES = new Set([
  "campus_admin",
  "dean",
  "hod",
  "registrar",
  "exam_officer",
  "finance_officer",
]);

export function registerAdministrationRoutes(app) {

  // Provisioning roles endpoint
  app.get("/api/admin/provisioning-roles", requireAuth, (req, res) => {
    const roles = getUserRoles(req.user);
    const isAdmin = roles.some((r) => ["super_admin"].includes(r));
    const isRegistrar = roles.includes("registrar");

    let allowed = [];
    if (isAdmin) {
      allowed = [
        { name: "student", label: "Student Portal" },
        { name: "faculty", label: "Faculty / Instructor" },
        { name: "hod", label: "Department Head (HoD)" },
        { name: "registrar", label: "Registrar" },
        { name: "exam_officer", label: "Exam Officer" },
        { name: "finance_officer", label: "Finance Officer" },
        { name: "campus_admin", label: "Campus Admin" },
        { name: "dean", label: "Dean" },
      ];
    } else if (isRegistrar) {
      allowed = [{ name: "student", label: "Student Portal" }];
    }

    res.json({ roles: allowed });
  });

  // Identity settings
  app.get(
    "/api/admin/identity-settings",
    requireAuth,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const domainSetting = await InstitutionSetting.findOne({ settingKey: "email_domain" });
        const minimumPasswordLength = await getMinimumPasswordLength();
        res.json({
          emailDomain: domainSetting?.settingValue || "techspire.edu.np",
          minimumPasswordLength,
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to load identity settings." });
      }
    }
  );

  app.patch(
    "/api/admin/identity-settings",
    requireAuth,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const emailDomain = String(req.body?.emailDomain || "").trim().toLowerCase();
        const minimumPasswordLength = Number(req.body?.minimumPasswordLength);

        if (
          !/^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
            emailDomain
          )
        ) {
          return res.status(400).json({ error: "Enter a valid institutional email domain." });
        }
        if (
          !Number.isInteger(minimumPasswordLength) ||
          minimumPasswordLength < PASSWORD_MIN_LENGTH ||
          minimumPasswordLength > 72
        ) {
          return res
            .status(400)
            .json({ error: `Minimum password length must be between ${PASSWORD_MIN_LENGTH} and 72.` });
        }

        await InstitutionSetting.findOneAndUpdate(
          { settingKey: "email_domain" },
          { settingValue: emailDomain, updatedByUser: req.user._id || req.user.id },
          { upsert: true }
        );

        await InstitutionSetting.findOneAndUpdate(
          { settingKey: "minimum_password_length" },
          { settingValue: String(minimumPasswordLength), updatedByUser: req.user._id || req.user.id },
          { upsert: true }
        );

        await logAudit({
          userId: req.user._id || req.user.id,
          action: "IDENTITY_SETTINGS_UPDATED",
          module: "administration",
          details: `Institutional email domain updated to ${emailDomain}, minimum password length to ${minimumPasswordLength}.`,
        });

        res.json({ emailDomain, minimumPasswordLength });
      } catch (err) {
        res.status(500).json({ error: "Failed to update identity settings." });
      }
    }
  );

  // List users
  app.get("/api/admin/users", requireAuth, async (req, res) => {
    try {
      const query = String(req.query.q || "").trim();
      const roleFilter = String(req.query.role || "");
      const statusFilter = String(req.query.status || "");
      const credentialStatusFilter = String(req.query.credentialStatus || "");

      const filter = { isActive: true };

      if (query) {
        const regex = new RegExp(query, "i");
        filter.$or = [
          { email: regex },
          { collegeEmail: regex },
          { firstName: regex },
          { lastName: regex },
        ];
      }

      if (roleFilter) {
        filter.roles = roleFilter;
      }

      if (statusFilter) {
        filter.accountStatus = statusFilter;
      }

      if (credentialStatusFilter) {
        filter.passwordStatus = credentialStatusFilter;
      }

      const users = await User.find(filter).sort({ createdAt: -1 }).limit(500);

      // Populate student/staff info
      const studentMap = new Map();
      const staffMap = new Map();

      const userIds = users.map((u) => u._id);
      const [students, staffs] = await Promise.all([
        Student.find({ user: { $in: userIds } }),
        Staff.find({ user: { $in: userIds } }),
      ]);

      students.forEach((s) => studentMap.set(s.user.toString(), s));
      staffs.forEach((st) => staffMap.set(st.user.toString(), st));

      const formatted = users.map((u) => {
        const uid = u._id.toString();
        const st = studentMap.get(uid);
        const sf = staffMap.get(uid);

        return {
          id: uid,
          email: u.email,
          collegeEmail: u.collegeEmail || u.email,
          name: [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" "),
          phone: u.phone,
          personalEmail: u.personalEmail,
          department: st?.department || sf?.department || "General",
          programme: st?.program || sf?.designation || "General",
          roles: u.roles || ["student"],
          accountStatus: u.accountStatus,
          passwordStatus: u.passwordStatus,
          mustChangePassword: Boolean(u.mustChangePassword),
          createdAt: u.createdAt,
          firstLoginAt: u.firstLoginAt,
          activatedAt: u.activatedAt,
          lastLoginAt: u.lastLoginAt,
          lastPasswordChangedAt: u.lastPasswordChangedAt,
        };
      });

      const counts = {
        total: await User.countDocuments({ isActive: true }),
        PASSIVE: await User.countDocuments({ accountStatus: "PASSIVE", isActive: true }),
        ACTIVE: await User.countDocuments({ accountStatus: "ACTIVE", isActive: true }),
        SUSPENDED: await User.countDocuments({ accountStatus: "SUSPENDED" }),
        DISABLED: await User.countDocuments({ accountStatus: "DISABLED" }),
        ARCHIVED: await User.countDocuments({ accountStatus: "ARCHIVED" }),
        TEMPORARY: await User.countDocuments({ passwordStatus: "TEMPORARY", isActive: true }),
        PERMANENT: await User.countDocuments({ passwordStatus: "PERMANENT", isActive: true }),
      };

      res.json({ users: formatted, counts });
    } catch (err) {
      console.error("List users error:", err);
      res.status(500).json({ error: "Failed to load users directory." });
    }
  });

  // Get user details
  app.get("/api/admin/users/:id", requireAuth, async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: "Account not found." });

      const [student, staff, events, subjectAssignments] = await Promise.all([
        Student.findOne({ user: user._id }),
        Staff.findOne({ user: user._id }),
        AuditLog.find({
          $or: [{ user: user._id }, { resourceId: user._id.toString() }],
        })
          .sort({ createdAt: -1 })
          .limit(50),
        FacultySubjectAssignment.find({ facultyUser: user._id, isActive: true })
          .populate("course", "code name department program semester academicYear courseType")
          .lean(),
      ]);

      const formattedAssignments = subjectAssignments
        .filter((sa) => sa.course)
        .map((sa) => ({
          id: String(sa._id),
          courseId: String(sa.course._id),
          courseCode: sa.course.code,
          courseName: sa.course.name,
          department: sa.course.department,
          program: sa.course.program,
          semester: sa.course.semester,
          academicYear: sa.course.academicYear,
          courseType: sa.course.courseType,
        }));

      res.json({
        user: {
          id: user._id.toString(),
          email: user.email,
          collegeEmail: user.collegeEmail || user.email,
          name: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" "),
          phone: user.phone,
          personalEmail: user.personalEmail,
          department: student?.department || staff?.department || null,
          programme: student?.program || staff?.designation || null,
          accountStatus: user.accountStatus,
          passwordStatus: user.passwordStatus,
          mustChangePassword: Boolean(user.mustChangePassword),
          roles: user.roles || ["student"],
          createdAt: user.createdAt,
          firstLoginAt: user.firstLoginAt,
          activatedAt: user.activatedAt,
          lastLoginAt: user.lastLoginAt,
          lastPasswordChangedAt: user.lastPasswordChangedAt,
          subjectAssignments: formattedAssignments,
        },
        events,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to retrieve user details." });
    }
  });

  // Create institutional user / student
  // Requirements 11 & 12: admin creates the account with a temporary credential
  // that must be changed on first login.
  app.post("/api/admin/users", requireAuth, async (req, res, next) => {
    try {
      const actorRoles = getUserRoles(req.user);
      const isAuthorized = actorRoles.some((r) =>
        ["super_admin", "registrar"].includes(r)
      );
      if (!isAuthorized) {
        return res.status(403).json({ error: "You do not have permission to create institutional accounts." });
      }

      const {
        firstName,
        middleName,
        lastName,
        phone,
        personalEmail,
        role = "student",
        studentId,
        employeeId,
        program = "BScIT",
        department = "Computer Science",
        designation,
        batch = "2025",
        semester = 1,
        section = "A25",
        campus = "Main Campus",
        subjectAssignments = [],
        assignedSemesters = [],
      } = req.body || {};

      const first = String(firstName || "").trim();
      const last = String(lastName || "").trim();

      if (!first || !last) {
        return res.status(400).json({ error: "First and last name are required." });
      }

      if (role === "student" && !String(studentId || "").trim()) {
        return res.status(400).json({ error: "Student ID is required for student accounts." });
      }
      if ((role === "faculty" || STAFF_PROFILE_ROLES.has(role)) && !String(employeeId || "").trim()) {
        return res.status(400).json({ error: "Employee ID is required for staff and faculty accounts." });
      }

      const normalizedProgram = role === "student"
        ? requireValidProgram(program, "program")
        : String(program || DEFAULT_PROGRAM).trim().toUpperCase();
      const normalizedSection = role === "student"
        ? requireValidSection(section, "section")
        : String(section || DEFAULT_SECTION).trim().toUpperCase() || DEFAULT_SECTION;
      const departmentValue = String(department || "").trim() || "General";

      // Student provisioning (account + student identity + section + enrolment)
      // is shared with admission enrolment so both entry points create exactly
      // the same institutional record.
      if (role === "student") {
        const provisioned = await provisionStudentAccount({
          firstName: first,
          lastName: last,
          middleName,
          phone,
          personalEmail,
          studentId,
          program: normalizedProgram,
          department,
          batch,
          semester,
          section: normalizedSection,
          campus,
          createdBy: req.user._id || req.user.id,
        });

        await logAudit({
          userId: req.user._id || req.user.id,
          action: "ACCOUNT_CREATED",
          module: "administration",
          resource: "user",
          resourceId: provisioned.user._id.toString(),
          details: `Passive student account provisioned: ${provisioned.email}.`,
        });
        await logAudit({
          userId: req.user._id || req.user.id,
          action: "TEMPORARY_CREDENTIAL_ISSUED",
          module: "administration",
          resource: "user",
          resourceId: provisioned.user._id.toString(),
          details: "Temporary credential issued; plaintext is not retained.",
        });

        res.status(201).json({
          success: true,
          userId: provisioned.user._id.toString(),
          studentId: provisioned.student.studentId,
          name: `${first} ${last}`.trim(),
          email: provisioned.email,
          collegeEmail: provisioned.email,
          role,
          accountStatus: "PASSIVE",
          passwordStatus: "TEMPORARY",
          mustChangePassword: true,
          credentialExpiresAt: provisioned.credentialExpiresAt.toISOString(),
          temporaryPassword: provisioned.temporaryPassword,
        });
        return;
      }

      const email = await generateInstitutionalEmail(first, last, batch);
      const existingUser = await User.findOne({ $or: [{ email }, { collegeEmail: email }] }).select("_id");
      if (existingUser) {
        return res.status(409).json({ error: "An account with this generated institutional email already exists." });
      }
      if (role === "faculty" || STAFF_PROFILE_ROLES.has(role)) {
        const existingStaff = await Staff.findOne({ employeeId: String(employeeId).trim() }).select("_id");
        if (existingStaff) {
          return res.status(409).json({ error: `Employee ID ${String(employeeId).trim()} is already in use.` });
        }
      }
      const minLength = await getMinimumPasswordLength();
      const temporaryPassword = createTemporaryPassword(minLength);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      const newUser = await User.create({
        email,
        collegeEmail: email,
        passwordHash: hashPassword(temporaryPassword),
        firstName: first,
        middleName: String(middleName || "").trim() || null,
        lastName: last,
        phone: String(phone || "").trim() || null,
        personalEmail: String(personalEmail || "").trim() || null,
        roles: [role],
        activeRole: role,
        mustChangePassword: true,
        credentialExpiresAt: expiresAt,
        accountStatus: "PASSIVE",
        passwordStatus: "TEMPORARY",
        isActive: true,
        createdBy: req.user._id || req.user.id,
      });

      if (role === "faculty" || STAFF_PROFILE_ROLES.has(role)) {
        await provisionStaffProfile({
          userId: newUser._id,
          employeeId,
          role,
          department: departmentValue,
          designation,
          campus,
        });
      }

      // Create faculty subject assignments if provided
      if (role === "faculty") {
        const requestedSemesters = Array.isArray(assignedSemesters)
          ? [...new Set(assignedSemesters.map((s) => Number(s)).filter((s) => Number.isInteger(s) && s >= 1 && s <= 20))]
          : [];
        const validCourseIds = Array.isArray(subjectAssignments)
          ? [...new Set(subjectAssignments.map((id) => String(id).trim()).filter(Boolean))]
          : [];

        if (requestedSemesters.length === 0 && validCourseIds.length > 0) {
          return res.status(400).json({ error: "Select at least one assigned semester before assigning subjects." });
        }

        if (validCourseIds.length > 0) {
          const courses = await Course.find({ _id: { $in: validCourseIds }, status: "ACTIVE" })
            .select("_id code name semester program department")
            .lean();
          const foundById = new Map(courses.map((c) => [c._id.toString(), c]));
          const invalidCourseIds = validCourseIds.filter((id) => !foundById.has(id));
          if (invalidCourseIds.length > 0) {
            return res.status(400).json({
              error: `Invalid or inactive course IDs: ${invalidCourseIds.join(", ")}. Only active courses can be assigned.`,
            });
          }

          const normalizedProgram = String(program || "").trim().toUpperCase();
          const knownProgram = normalizedProgram
            ? await Program.findOne({ code: normalizedProgram }).select("code totalSemesters").lean()
            : null;
          if (knownProgram?.totalSemesters && requestedSemesters.some((s) => s > Number(knownProgram.totalSemesters))) {
            return res.status(400).json({
              error: `One or more selected semesters exceed ${knownProgram.code}'s ${knownProgram.totalSemesters}-semester structure.`,
            });
          }

          const mismatch = validCourseIds
            .map((id) => foundById.get(id))
            .filter(Boolean)
            .find((course) => {
              if (!requestedSemesters.includes(Number(course.semester))) return true;
              if (normalizedProgram && course.program && String(course.program).toUpperCase() !== normalizedProgram) return true;
              return false;
            });
          if (mismatch) {
            return res.status(400).json({
              error: `Subject ${mismatch.code} - ${mismatch.name} is not valid for the selected program/curriculum and assigned semester(s).`,
            });
          }

          const assignmentsToCreate = validCourseIds.map((courseId) => ({
            facultyUser: newUser._id,
            course: courseId,
            assignedBy: req.user._id || req.user.id,
            isActive: true,
          }));

          await FacultySubjectAssignment.insertMany(assignmentsToCreate, { ordered: false });
        }
      }

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "ACCOUNT_CREATED",
        module: "administration",
        resource: "user",
        resourceId: newUser._id.toString(),
        details: `Passive ${role} account provisioned: ${email}.`,
      });

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TEMPORARY_CREDENTIAL_ISSUED",
        module: "administration",
        resource: "user",
        resourceId: newUser._id.toString(),
        details: "Temporary credential issued; plaintext is not retained.",
      });

      res.status(201).json({
        success: true,
        userId: newUser._id.toString(),
        studentId: null,
        name: [first, middleName, last].filter(Boolean).join(" "),
        email,
        collegeEmail: email,
        role,
        accountStatus: "PASSIVE",
        passwordStatus: "TEMPORARY",
        mustChangePassword: true,
        credentialExpiresAt: expiresAt.toISOString(),
        temporaryPassword,
      });
    } catch (err) {
      next(err);
    }
  });

  // Re-issue temporary password / reset credentials
  app.post("/api/admin/users/:id/reset-password", requireAuth, async (req, res) => {
    try {
      const actorRoles = getUserRoles(req.user);
      const isAuthorized = actorRoles.some((r) =>
        ["super_admin", "registrar"].includes(r)
      );
      if (!isAuthorized) {
        return res.status(403).json({ error: "Access denied." });
      }

      const reason = String(req.body?.reason || "").trim();
      if (reason.length < 4) {
        return res.status(400).json({ error: "A reset reason is required." });
      }

      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: "Account not found." });

      const minLength = await getMinimumPasswordLength();
      const temporaryPassword = createTemporaryPassword(minLength);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      user.passwordHash = hashPassword(temporaryPassword);
      user.mustChangePassword = true;
      user.credentialExpiresAt = expiresAt;
      user.passwordStatus = "TEMPORARY";
      user.accountStatus = "PASSIVE";
      user.activatedAt = null;
      await user.save();

      await revokeUserSessions(user._id);

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TEMPORARY_CREDENTIAL_REISSUED",
        module: "administration",
        resource: "user",
        resourceId: user._id.toString(),
        details: `Temporary credential reissued. Reason: ${reason}`,
      });

      res.json({
        success: true,
        userId: user._id.toString(),
        accountStatus: "PASSIVE",
        passwordStatus: "TEMPORARY",
        mustChangePassword: true,
        credentialExpiresAt: expiresAt.toISOString(),
        temporaryPassword,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to reset credentials." });
    }
  });

  // Suspend / Disable / Reactivate user
  app.patch(
    "/api/admin/users/:id/status",
    requireAuth,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const { action, reason = "Administrative update" } = req.body || {};
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "Account not found." });

        let nextStatus = "ACTIVE";
        let isActive = true;

        if (action === "SUSPEND") {
          nextStatus = "SUSPENDED";
          isActive = false;
        } else if (action === "DISABLE") {
          nextStatus = "DISABLED";
          isActive = false;
        } else if (action === "REACTIVATE") {
          nextStatus = user.mustChangePassword ? "PASSIVE" : "ACTIVE";
          isActive = true;
        } else {
          return res.status(400).json({ error: "Unsupported account action." });
        }

        user.accountStatus = nextStatus;
        user.isActive = isActive;
        await user.save();

        if (action !== "REACTIVATE") {
          await revokeUserSessions(user._id);
        }

        await logAudit({
          userId: req.user._id || req.user.id,
          action: `ACCOUNT_${action}ED`,
          module: "administration",
          resource: "user",
          resourceId: user._id.toString(),
          details: `Account transitioned to ${nextStatus}. Reason: ${reason}`,
        });

        res.json({ success: true, accountStatus: nextStatus });
      } catch (err) {
        res.status(500).json({ error: "Failed to update account status." });
      }
    }
  );

  // Permanently delete a user account (super_admin only)
  app.delete(
    "/api/admin/users/:id",
    requireAuth,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const targetUserId = req.params.id;
        const actorUserId = req.user._id || req.user.id;

        // Prevent self-deletion
        if (String(targetUserId) === String(actorUserId)) {
          return res.status(403).json({
            error: "You cannot delete your own account through this endpoint.",
          });
        }

        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
          return res.status(404).json({ error: "Account not found." });
        }

        // Prevent deletion of the last active super_admin
        const targetRoles = getUserRoles(targetUser);
        if (targetRoles.includes("super_admin")) {
          const superAdminCount = await User.countDocuments({
            roles: "super_admin",
            isActive: true,
            accountStatus: { $ne: "DISABLED" },
          });
          if (superAdminCount <= 1) {
            return res.status(403).json({
              error: "Cannot delete the last active Super Admin account.",
            });
          }
        }

        // Store user details for audit log before deletion
        const deletedUserEmail = targetUser.email;
        const deletedUserName = [
          targetUser.firstName,
          targetUser.middleName,
          targetUser.lastName,
        ]
          .filter(Boolean)
          .join(" ");
        const deletedUserRoles = targetUser.roles || ["student"];

        // Check for related Student or Staff profiles
        const [studentProfile, staffProfile] = await Promise.all([
          Student.findOne({ user: targetUserId }),
          Staff.findOne({ user: targetUserId }),
        ]);

        // Delete operations without transaction (for standalone MongoDB)
        // 1. Delete the User document
        await User.findByIdAndDelete(targetUserId);

        // 2. Delete associated Student profile if exists
        if (studentProfile) {
          await Student.findByIdAndDelete(studentProfile._id);
        }

        // 3. Delete associated Staff profile if exists
        if (staffProfile) {
          await Staff.findByIdAndDelete(staffProfile._id);
        }

        // 4. Revoke all active sessions (invalidate tokens)
        await Session.deleteMany({ user: targetUserId });

        // 5. Invalidate password reset tokens
        await PasswordResetToken.deleteMany({ user: targetUserId });

        // Audit log the deletion
        await logAudit({
          userId: actorUserId,
          action: "ACCOUNT_DELETED",
          module: "administration",
          resource: "user",
          resourceId: targetUserId,
          details: `Permanently deleted account: ${deletedUserName} (${deletedUserEmail}). Roles: ${deletedUserRoles.join(", ")}. Student profile: ${studentProfile ? "removed" : "none"}. Staff profile: ${staffProfile ? "removed" : "none"}. Sessions and credentials invalidated.`,
        });

        res.json({
          success: true,
          message: "Account permanently deleted.",
          deletedUser: {
            id: targetUserId,
            email: deletedUserEmail,
            name: deletedUserName,
            roles: deletedUserRoles,
          },
        });
      } catch (err) {
        console.error("Account deletion error:", err);
        res.status(500).json({ error: "Failed to delete account." });
      }
    }
  );

  // Bulk permanently delete user accounts (super_admin only)
  app.post(
    "/api/admin/users/bulk-delete",
    requireAuth,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const actorUserId = req.user._id || req.user.id;
        const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
        if (ids.length === 0) {
          return res.status(400).json({ error: "No account identifiers provided." });
        }

        const results = { deleted: [], failed: [] };
        for (const id of ids) {
          try {
            if (String(id) === String(actorUserId)) {
              results.failed.push({ id, error: "Cannot delete your own account." });
              continue;
            }
            const targetUser = await User.findById(id);
            if (!targetUser) {
              results.failed.push({ id, error: "Account not found." });
              continue;
            }
            const targetRoles = getUserRoles(targetUser);
            if (targetRoles.includes("super_admin")) {
              const superAdminCount = await User.countDocuments({
                roles: "super_admin",
                isActive: true,
                accountStatus: { $ne: "DISABLED" },
              });
              if (superAdminCount <= 1) {
                results.failed.push({ id, error: "Cannot delete the last active Super Admin account." });
                continue;
              }
            }

            const deletedUserEmail = targetUser.email;
            const deletedUserName = [targetUser.firstName, targetUser.middleName, targetUser.lastName]
              .filter(Boolean)
              .join(" ");
            const deletedUserRoles = targetUser.roles || ["student"];

            const [studentProfile, staffProfile] = await Promise.all([
              Student.findOne({ user: id }),
              Staff.findOne({ user: id }),
            ]);

            await User.findByIdAndDelete(id);
            if (studentProfile) await Student.findByIdAndDelete(studentProfile._id);
            if (staffProfile) await Staff.findByIdAndDelete(staffProfile._id);
            await Session.deleteMany({ user: id });
            await PasswordResetToken.deleteMany({ user: id });

            await logAudit({
              userId: actorUserId,
              action: "ACCOUNT_DELETED",
              module: "administration",
              resource: "user",
              resourceId: id,
              details: `Permanently deleted account: ${deletedUserName} (${deletedUserEmail}). Roles: ${deletedUserRoles.join(", ")}.`,
            });

            results.deleted.push({ id, email: deletedUserEmail, name: deletedUserName, roles: deletedUserRoles });
          } catch (err) {
            results.failed.push({ id, error: err.message || "Failed to delete account." });
          }
        }

        res.json({
          success: results.failed.length === 0,
          message: `${results.deleted.length} account(s) permanently deleted.`,
          deleted: results.deleted,
          failed: results.failed,
        });
      } catch (err) {
        console.error("Bulk account deletion error:", err);
        res.status(500).json({ error: "Failed to delete accounts." });
      }
    }
  );

  // Dedicated student creation route for convenience
  app.post(
    "/api/users/student",
    requireAuth,
    requireRole(["super_admin", "registrar"]),
    async (req, res) => {
      // Delegate to /api/admin/users with role: 'student'
      req.body.role = "student";
      const {
        firstName,
        lastName,
        phone,
        studentId,
        program = "BScIT",
        department = "Computer Science",
        batch = "2025",
        section = "A25",
        semester = 1,
        campus = "Main Campus",
      } = req.body || {};

      if (!firstName || !lastName || !studentId) {
        return res.status(400).json({ error: "Student name and student ID are required." });
      }

      const normalizedProgram = requireValidProgram(program, "program");
      const normalizedSection = requireValidSection(section, "section");

      try {
        const existingStudent = await Student.findOne({ studentId: String(studentId).trim() });
        if (existingStudent) {
          return res.status(409).json({ error: `Student ID ${studentId} is already in use.` });
        }

        const email = await generateInstitutionalEmail(firstName, lastName, batch);
        const minLength = await getMinimumPasswordLength();
        const temporaryPassword = createTemporaryPassword(minLength);
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

        const newUser = await User.create({
          email,
          collegeEmail: email,
          passwordHash: hashPassword(temporaryPassword),
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          phone: String(phone || "").trim() || null,
          roles: ["student"],
          activeRole: "student",
          mustChangePassword: true,
          credentialExpiresAt: expiresAt,
          accountStatus: "PASSIVE",
          passwordStatus: "TEMPORARY",
          isActive: true,
          createdBy: req.user._id || req.user.id,
        });

        const normalizedSection = String(section || "A25").trim().toUpperCase();
        const semNum = Number(semester) || 1;

        const student = await Student.create({
          user: newUser._id,
          studentId: String(studentId).trim(),
          rollNumber: String(studentId).trim(),
          enrollmentId: `ENR-${String(studentId).trim()}`,
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          email,
          collegeEmail: email,
          phone: String(phone || "").trim() || null,
          program: normalizedProgram,
          programCode: normalizedProgram,
          department: department || "Computer Science",
          batch: batch || "2025",
          section: normalizedSection,
          semester: semNum,
          campus: campus || "Main Campus",
          status: "ACTIVE",
          attendancePercentage: 100,
        });

        // Ensure section exists
        await Section.findOneAndUpdate(
          { code: normalizedSection, program: normalizedProgram, semester: semNum },
          { code: normalizedSection, program: normalizedProgram, semester: semNum, batch: batch || "2025" },
          { upsert: true }
        );

        // Auto enroll
        const semesterCourses = await Course.find({ semester: semNum });
        for (const c of semesterCourses) {
          await Enrollment.findOneAndUpdate(
            { student: student._id, course: c._id, sectionCode: normalizedSection, semester: semNum },
            {
              student: student._id,
              studentUser: newUser._id,
              course: c._id,
              sectionCode: normalizedSection,
              semester: semNum,
              status: "ENROLLED",
            },
            { upsert: true }
          );
        }

        await logAudit({
          userId: req.user._id || req.user.id,
          action: "STUDENT_PROVISIONED",
          module: "administration",
          resource: "student",
          resourceId: student._id.toString(),
          details: `Student account provisioned: ${email} (ID: ${studentId}).`,
        });

        res.status(201).json({
          success: true,
          userId: newUser._id.toString(),
          studentId: student.studentId,
          email,
          collegeEmail: email,
          name: `${firstName} ${lastName}`.trim(),
          temporaryPassword,
          mustChangePassword: true,
          credentialExpiresAt: expiresAt.toISOString(),
        });
      } catch (err) {
        console.error("Student provision error:", err);
        res.status(500).json({ error: "Failed to provision student account." });
      }
    }
  );

  // Bulk student creation (form-based: academic assignment + names)
  app.post("/api/admin/students/bulk", requireAuth, async (req, res) => {
    try {
      const actorRoles = getUserRoles(req.user);
      const isAuthorized = actorRoles.some((r) => ["super_admin", "registrar"].includes(r));
      if (!isAuthorized) {
        return res.status(403).json({ error: "You are not authorized to provision accounts." });
      }
      const body = req.body || {};
      const academicYear = requireValidAcademicYear(body.academicYear, "academicYear");
      const program = requireValidProgram(body.program, "program");
      const department = String(body.department || "Computer Science").trim();
      const batch = String(body.batch || "2025").trim();
      const semester = Number(body.semester) || 1;
      const section = requireValidSection(body.section, "section");
      const campus = String(body.campus || "Main Campus").trim();
      const namesRaw = Array.isArray(body.names) ? body.names : String(body.names || "").split(/\n/);
      const names = namesRaw.map((n) => String(n).trim()).filter(Boolean);

      if (names.length === 0) {
        return res.status(400).json({ error: "No student names provided." });
      }
      if (!batch) {
        return res.status(400).json({ error: "Batch is required." });
      }

      // Duplicate names within list
      const seen = new Set();
      const dupIndices = new Set();
      names.forEach((n, i) => {
        const key = n.toLowerCase();
        if (seen.has(key)) dupIndices.add(i);
        seen.add(key);
      });

      const results = [];
      let created = 0;
      let failed = 0;
      let skipped = 0;

      // Determine starting sequence for student IDs
      const prefix = `${program}${batch}`;
      const existingIds = await Student.find({ studentId: new RegExp("^" + prefix) }).select("studentId").lean();
      let seq = existingIds.length;
      for (let i = 0; i < names.length; i++) {
        const fullName = names[i];
        if (dupIndices.has(i)) {
          failed++;
          results.push({ row: i + 1, status: "FAILED", error: "Duplicate name in submitted list", name: fullName });
          continue;
        }
        // split name
        const parts = fullName.split(/\s+/);
        const firstName = parts[0] || fullName;
        const lastName = parts.slice(1).join(" ") || parts[0] || fullName;
        seq += 1;
        const studentId = `${prefix}${String(seq).padStart(4, "0")}`;
        try {
          const existing = await Student.findOne({ studentId }).select("_id");
          if (existing) {
            skipped++;
            results.push({ row: i + 1, status: "SKIPPED", error: "Student ID already exists", studentId, name: fullName });
            continue;
          }
          const provisioned = await provisionStudentAccount({
            firstName,
            lastName,
            middleName: null,
            phone: null,
            personalEmail: null,
            studentId,
            program,
            department,
            batch,
            semester,
            section,
            campus,
            academicYear,
            createdBy: req.user._id || req.user.id,
          });
          await logAudit({ userId: req.user._id || req.user.id, action: "ACCOUNT_CREATED", module: "administration", resource: "user", resourceId: provisioned.user._id.toString(), details: "Bulk: provisioned student account." });
          created++;
          results.push({ row: i + 1, status: "CREATED", studentId, name: fullName, email: provisioned.email });
        } catch (err) {
          failed++;
          results.push({ row: i + 1, status: "FAILED", error: err.message || "Provisioning failed", name: fullName });
        }
      }
      await logAudit({ userId: req.user._id || req.user.id, action: "BULK_STUDENT_CREATION", module: "administration", resource: "user", details: `Bulk student creation: ${created} created, ${skipped} skipped, ${failed} failed. Program ${program} Batch ${batch} Section ${section}.` });
      res.status(200).json({ success: true, totalSubmitted: names.length, created, skipped, failed, results });
    } catch (err) {
      console.error("Bulk student creation error:", err);
      if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
        return res.status(err.status).json({ error: err.message, details: err.details });
      }
      res.status(500).json({ error: "Failed to perform bulk student creation." });
    }
  });

  // Get faculty subject assignments
  app.get(
    "/api/admin/users/:id/subject-assignments",
    requireAuth,
    requireRole(["super_admin", "registrar", "dean", "hod"]),
    async (req, res) => {
      try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "Account not found." });

        if (!user.roles.includes("faculty")) {
          return res.status(400).json({ error: "Subject assignments are only applicable to faculty accounts." });
        }

        const assignments = await FacultySubjectAssignment.find({ facultyUser: user._id, isActive: true })
          .populate("course", "code name department program semester academicYear courseType credits")
          .lean();

        const formatted = assignments
          .filter((sa) => sa.course)
          .map((sa) => ({
            id: String(sa._id),
            courseId: String(sa.course._id),
            courseCode: sa.course.code,
            courseName: sa.course.name,
            department: sa.course.department,
            program: sa.course.program,
            semester: sa.course.semester,
            academicYear: sa.course.academicYear,
            courseType: sa.course.courseType,
            credits: sa.course.credits,
          }));

        res.json({ assignments: formatted });
      } catch (err) {
        res.status(500).json({ error: "Failed to retrieve subject assignments." });
      }
    }
  );

  // Update faculty subject assignments (replace all)
  app.post(
    "/api/admin/users/:id/subject-assignments",
    requireAuth,
    requireRole(["super_admin", "registrar", "dean", "hod"]),
    async (req, res) => {
      try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "Account not found." });

        if (!user.roles.includes("faculty")) {
          return res.status(400).json({ error: "Subject assignments are only applicable to faculty accounts." });
        }

        const { courseIds, assignedSemesters = [], program: programHint = null } = req.body || {};
        if (!Array.isArray(courseIds)) {
          return res.status(400).json({ error: "courseIds must be an array." });
        }

        const validCourseIds = [...new Set(courseIds.map((id) => String(id).trim()).filter(Boolean))];
        const requestedSemesters = Array.isArray(assignedSemesters)
          ? [...new Set(assignedSemesters.map((s) => Number(s)).filter((s) => Number.isInteger(s) && s >= 1 && s <= 20))]
          : [];

        if (requestedSemesters.length === 0 && validCourseIds.length > 0) {
          return res.status(400).json({ error: "Select at least one assigned semester before assigning subjects." });
        }

        // Verify all courses exist and are active, and belong to selected semesters/program context.
        let courses = [];
        if (validCourseIds.length > 0) {
          courses = await Course.find({ _id: { $in: validCourseIds }, status: "ACTIVE" })
            .select("_id code name semester program department")
            .lean();
        }
        const foundById = new Map(courses.map((c) => [c._id.toString(), c]));
        const invalidCourseIds = validCourseIds.filter((id) => !foundById.has(id));
        if (invalidCourseIds.length > 0) {
          return res.status(400).json({
            error: `Invalid or inactive course IDs: ${invalidCourseIds.join(", ")}. Only active courses can be assigned.`,
          });
        }

        const staffProfile = await Staff.findOne({ user: user._id }).select("department designation").lean();
        const normalizedProgram = String(programHint || "").trim().toUpperCase() || null;
        const knownProgram = normalizedProgram
          ? await Program.findOne({ code: normalizedProgram }).select("code totalSemesters").lean()
          : null;
        if (knownProgram?.totalSemesters && requestedSemesters.some((s) => s > Number(knownProgram.totalSemesters))) {
          return res.status(400).json({
            error: `One or more selected semesters exceed ${knownProgram.code}'s ${knownProgram.totalSemesters}-semester structure.`,
          });
        }

        const mismatch = validCourseIds
          .map((id) => foundById.get(id))
          .filter(Boolean)
          .find((course) => {
            if (!requestedSemesters.includes(Number(course.semester))) return true;
            if (normalizedProgram && course.program && String(course.program).toUpperCase() !== normalizedProgram) return true;
            return false;
          });
        if (mismatch) {
          return res.status(400).json({
            error: `Subject ${mismatch.code} - ${mismatch.name} is not valid for the selected program/curriculum and assigned semester(s).`,
          });
        }

        const assignmentsToCreate = validCourseIds.map((courseId) => ({
          facultyUser: user._id,
          course: courseId,
          assignedBy: req.user._id || req.user.id,
          isActive: true,
        }));

        // Replace all assignments: deactivate existing, create new
        await FacultySubjectAssignment.updateMany(
          { facultyUser: user._id, isActive: true },
          { $set: { isActive: false } }
        );

        if (assignmentsToCreate.length > 0) {
          await FacultySubjectAssignment.insertMany(assignmentsToCreate, { ordered: false });
        }

        await logAudit({
          userId: req.user._id || req.user.id,
          action: "FACULTY_SUBJECT_ASSIGNMENTS_UPDATED",
          module: "administration",
          resource: "faculty_subject_assignment",
          resourceId: user._id.toString(),
          details: `Subject assignments updated for faculty ${user.email}: ${assignmentsToCreate.length} subject(s) assigned.${staffProfile?.department ? ` Dept: ${staffProfile.department}.` : ""}`,
        });

        const newAssignments = await FacultySubjectAssignment.find({ facultyUser: user._id, isActive: true })
          .populate("course", "code name department program semester academicYear courseType credits")
          .lean();

        const formatted = newAssignments
          .filter((sa) => sa.course)
          .map((sa) => ({
            id: String(sa._id),
            courseId: String(sa.course._id),
            courseCode: sa.course.code,
            courseName: sa.course.name,
            department: sa.course.department,
            program: sa.course.program,
            semester: sa.course.semester,
            academicYear: sa.course.academicYear,
            courseType: sa.course.courseType,
            credits: sa.course.credits,
          }));

        res.json({ assignments: formatted });
      } catch (err) {
        res.status(500).json({ error: "Failed to update subject assignments." });
      }
    }
  );

  // Delete a single faculty subject assignment
  app.delete(
    "/api/admin/users/:id/subject-assignments/:assignmentId",
    requireAuth,
    requireRole(["super_admin", "registrar", "dean", "hod"]),
    async (req, res) => {
      try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "Account not found." });

        if (!user.roles.includes("faculty")) {
          return res.status(400).json({ error: "Subject assignments are only applicable to faculty accounts." });
        }

        const assignment = await FacultySubjectAssignment.findOne({
          _id: req.params.assignmentId,
          facultyUser: user._id,
          isActive: true,
        });

        if (!assignment) {
          return res.status(404).json({ error: "Subject assignment not found." });
        }

        assignment.isActive = false;
        await assignment.save();

        await logAudit({
          userId: req.user._id || req.user.id,
          action: "FACULTY_SUBJECT_ASSIGNMENT_REMOVED",
          module: "administration",
          resource: "faculty_subject_assignment",
          resourceId: assignment._id.toString(),
          details: `Subject assignment removed for faculty ${user.email}.`,
        });

        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "Failed to remove subject assignment." });
      }
    }
  );

  /**
   * Administrative session management. Super administrators can inspect and
   * revoke any account's sessions. Revocation takes effect immediately: the
   * next authenticated request from any tab using the revoked token is
   * rejected with a SESSION_REVOKED code.
   */
  app.get(
    "/api/admin/users/:userId/sessions",
    requireAuth,
    requireRole(["super_admin"]),
    async (req, res) => {
      try {
        const now = new Date();
        const sessions = await Session.find({ user: req.params.userId })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();
        // Reuse the auth route's public shaping by importing locally to avoid
        // a circular route dependency.
        const { sessionToPublic } = await import("./auth.js");
        res.json({
          sessions: sessions.map((session) =>
            sessionToPublic(session, null, now),
          ),
        });
      } catch (err) {
        res.status(500).json({ error: "Unable to load account sessions." });
      }
    }
  );

  app.delete(
    "/api/admin/users/:userId/sessions/:sessionId",
    requireAuth,
    requireRole(["super_admin"]),
    async (req, res) => {
      if (!/^[a-f\d]{24}$/i.test(req.params.sessionId)) {
        return res.status(400).json({ error: "Invalid session identifier." });
      }
      try {
        const session = await Session.findOneAndUpdate(
          {
            _id: req.params.sessionId,
            user: req.params.userId,
            revokedAt: null,
          },
          { $set: { revokedAt: new Date() } },
        );
        if (!session) {
          return res.status(404).json({ error: "Session not found." });
        }
        await logAudit({
          userId: req.user._id || req.user.id,
          action: "ADMIN_SESSION_REVOKED",
          module: "administration",
          resource: "session",
          resourceId: session._id.toString(),
          details: `Super admin revoked a session for user ${req.params.userId}.`,
        });
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "Unable to revoke this session." });
      }
    }
  );
}
