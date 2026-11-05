import mongoose from "mongoose";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  Document,
  Employee,
  LeaveRequest,
  Staff,
  User,
} from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getUserRoles, logAudit } from "../db.js";
import { hasPermission } from "../permissions/catalog.js";

const EMPLOYEE_ROLES = [
  "faculty",
  "campus_admin",
  "dean",
  "hod",
  "program_coordinator",
  "registrar",
  "exam_officer",
  "finance_officer",
];
const DIRECTORY_USER_FIELDS =
  "firstName middleName lastName email collegeEmail avatarUrl accountStatus";
const PROFILE_USER_FIELDS =
  `${DIRECTORY_USER_FIELDS} phone personalEmail address emergencyContact roles isActive`;
const PAGE_SIZE_MAX = 100;
const EMPLOYMENT_TYPES = new Set([
  "permanent",
  "contract",
  "temporary",
  "probation",
  "part-time",
]);
const EMPLOYMENT_STATUSES = new Set([
  "active",
  "inactive",
  "on-leave",
  "terminated",
  "retired",
]);
const ROLE_TYPES = new Set(["faculty", "staff", "teaching", "non-teaching"]);

function referenceId(value) {
  if (!value) return null;
  return String(value._id || value);
}

function employeeUserId(record) {
  return referenceId(record.user);
}

function directoryRecord(record, source) {
  const legacyStaff = source === "staff";
  const user = record.user || null;
  return {
    _id: String(record._id),
    recordType: source,
    userId: employeeUserId(record),
    user,
    employeeId: record.employeeId,
    roleType: record.roleType || (legacyStaff ? "staff" : "staff"),
    department: record.department || "",
    designation: record.designation || "",
    employmentType: legacyStaff ? null : record.employmentType || null,
    employmentStatus: legacyStaff
      ? record.isActive === false
        ? "inactive"
        : "active"
      : record.employmentStatus || (record.isActive === false ? "inactive" : "active"),
    joiningDate: legacyStaff ? null : record.joiningDate || null,
    reportingManager: legacyStaff ? null : record.reportingManager || null,
    campus: record.campus || null,
    createdAt: record.createdAt || null,
  };
}

async function loadDirectoryRecords() {
  const [employees, staff] = await Promise.all([
    Employee.find()
      .populate("user", DIRECTORY_USER_FIELDS)
      .populate("reportingManager", "firstName lastName email collegeEmail")
      .lean(),
    Staff.find()
      .populate("user", DIRECTORY_USER_FIELDS)
      .lean(),
  ]);
  const records = new Map();
  for (const employee of employees) {
    records.set(employeeUserId(employee) || String(employee._id), {
      ...directoryRecord(employee, "employee"),
    });
  }
  for (const staffRecord of staff) {
    const userId = employeeUserId(staffRecord) || String(staffRecord._id);
    if (!records.has(userId)) {
      records.set(userId, directoryRecord(staffRecord, "staff"));
    }
  }
  return [...records.values()];
}

function normalizeEmployeeId(value) {
  return String(value || "").trim().toUpperCase();
}

function employeeIdPattern(value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}

async function syncStaffProfile(employee) {
  const staff = await Staff.findOne({ user: employee.user });
  if (!staff) return;
  staff.employeeId = employee.employeeId;
  staff.department = employee.department;
  staff.designation = employee.designation;
  staff.roleType = ["faculty", "teaching"].includes(employee.roleType)
    ? "faculty"
    : "staff";
  staff.campus = employee.campus || staff.campus;
  staff.isActive = !["inactive", "terminated", "retired"].includes(
    employee.employmentStatus,
  );
  await staff.save();
}

function validateEmployeeFields(body, { partial = false } = {}) {
  const required = ["employeeId", "department"];
  if (!partial && required.some((key) => !String(body[key] || "").trim())) {
    return "Employee ID and department are required.";
  }
  if (body.employmentType !== undefined && !EMPLOYMENT_TYPES.has(body.employmentType)) {
    return "Select a valid employment type.";
  }
  if (
    body.employmentStatus !== undefined &&
    !EMPLOYMENT_STATUSES.has(body.employmentStatus)
  ) {
    return "Select a valid employment status.";
  }
  if (body.roleType !== undefined && !ROLE_TYPES.has(body.roleType)) {
    return "Select a valid employee role type.";
  }
  if (
    body.joiningDate !== undefined &&
    body.joiningDate !== null &&
    Number.isNaN(Date.parse(body.joiningDate))
  ) {
    return "Enter a valid joining date.";
  }
  if (
    body.reportingManager &&
    !mongoose.isValidObjectId(body.reportingManager)
  ) {
    return "Select a valid reporting manager.";
  }
  return null;
}

export function registerHRRoutes(app) {
  app.get(
    "/api/hr/dashboard",
    requireAuth,
    requirePermission("hr.view"),
    asyncHandler(async (req, res) => {
      const [employees, pendingLeaves] = await Promise.all([
        loadDirectoryRecords(),
        LeaveRequest.countDocuments({ status: "pending" }),
      ]);
      const activeEmployees = employees.filter(
        (employee) => employee.employmentStatus === "active",
      );
      res.json({
        stats: {
          totalEmployees: employees.length,
          activeEmployees: activeEmployees.length,
          inactiveEmployees: employees.length - activeEmployees.length,
          facultyCount: activeEmployees.filter((employee) =>
            ["faculty", "teaching"].includes(employee.roleType),
          ).length,
          staffCount: activeEmployees.filter((employee) =>
            ["staff", "non-teaching"].includes(employee.roleType),
          ).length,
          pendingLeaves,
          onLeave: employees.filter(
            (employee) => employee.employmentStatus === "on-leave",
          ).length,
        },
      });
    }),
  );

  app.get(
    "/api/hr/employees",
    requireAuth,
    requirePermission("hr.view"),
    asyncHandler(async (req, res) => {
      const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
      const limit = Math.min(
        PAGE_SIZE_MAX,
        Math.max(1, Number.parseInt(String(req.query.limit || "25"), 10) || 25),
      );
      const department = String(req.query.department || "").trim();
      const designation = String(req.query.designation || "").trim();
      const employmentType = String(req.query.employmentType || "").trim();
      const employmentStatus = String(req.query.employmentStatus || "").trim();
      const search = String(req.query.search || "").trim().toLocaleLowerCase();
      const allEmployees = await loadDirectoryRecords();
      const departments = [...new Set(allEmployees.map((row) => row.department).filter(Boolean))].sort();
      const designations = [...new Set(allEmployees.map((row) => row.designation).filter(Boolean))].sort();
      const employmentTypes = [...new Set(allEmployees.map((row) => row.employmentType).filter(Boolean))].sort();
      const employmentStatuses = [...new Set(allEmployees.map((row) => row.employmentStatus).filter(Boolean))].sort();

      const filtered = allEmployees
        .filter((employee) => !department || employee.department === department)
        .filter((employee) => !designation || employee.designation === designation)
        .filter((employee) => !employmentType || employee.employmentType === employmentType)
        .filter((employee) => !employmentStatus || employee.employmentStatus === employmentStatus)
        .filter((employee) => {
          if (!search) return true;
          const user = employee.user || {};
          const fullName = [
            user.firstName,
            user.middleName,
            user.lastName,
          ]
            .filter(Boolean)
            .join(" ");
          return [
            fullName,
            employee.employeeId,
            user.email,
            user.collegeEmail,
          ].some((value) => String(value || "").toLocaleLowerCase().includes(search));
        })
        .sort((left, right) => {
          const leftName = `${left.user?.firstName || ""} ${left.user?.lastName || ""}`;
          const rightName = `${right.user?.firstName || ""} ${right.user?.lastName || ""}`;
          return leftName.localeCompare(rightName);
        });
      const skip = (page - 1) * limit;
      res.json({
        employees: filtered.slice(skip, skip + limit),
        total: filtered.length,
        page,
        limit,
        filters: { departments, designations, employmentTypes, employmentStatuses },
      });
    }),
  );

  app.get(
    "/api/hr/users",
    requireAuth,
    requirePermission("hr.employee.manage"),
    asyncHandler(async (req, res) => {
      const search = String(req.query.search || "").trim();
      const filter = {
        roles: { $in: EMPLOYEE_ROLES },
        isActive: true,
        accountStatus: { $nin: ["SUSPENDED", "DISABLED", "ARCHIVED"] },
      };
      if (search) {
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const query = new RegExp(escapedSearch, "i");
        filter.$or = [
          { firstName: query },
          { middleName: query },
          { lastName: query },
          { email: query },
          { collegeEmail: query },
        ];
      }
      const assigned = await Employee.distinct("user");
      const users = await User.find({
        ...filter,
        _id: { $nin: assigned },
      })
        .select("_id firstName middleName lastName email collegeEmail roles accountStatus")
        .sort({ firstName: 1, lastName: 1 })
        .limit(20)
        .lean();
      res.json({
        users: users.map((user) => ({
          id: String(user._id),
          name: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" "),
          email: user.collegeEmail || user.email,
          roles: user.roles,
          accountStatus: user.accountStatus,
        })),
      });
    }),
  );

  app.get(
    "/api/hr/employees/:id",
    requireAuth,
    requirePermission("hr.view"),
    asyncHandler(async (req, res) => {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ error: "Invalid employee identifier." });
      }
      let employee = await Employee.findById(req.params.id)
        .populate("user", PROFILE_USER_FIELDS)
        .populate("reportingManager", "firstName middleName lastName email collegeEmail")
        .lean();
      let legacyStaff = null;
      if (!employee) {
        legacyStaff = await Staff.findById(req.params.id)
          .populate("user", PROFILE_USER_FIELDS)
          .lean();
        if (legacyStaff) {
          employee = await Employee.findOne({ user: legacyStaff.user?._id })
            .populate("user", PROFILE_USER_FIELDS)
            .populate("reportingManager", "firstName middleName lastName email collegeEmail")
            .lean();
        }
      }
      if (!employee && !legacyStaff) {
        return res.status(404).json({ error: "Employee not found." });
      }

      const source = employee || legacyStaff;
      const userId = employeeUserId(source);
      const [documents, embeddedDocuments] = await Promise.all([
        userId
          ? Document.find({ user: userId })
              .select("title category fileName fileUrl fileSize createdAt")
              .sort({ createdAt: -1 })
              .lean()
          : Promise.resolve([]),
        Promise.resolve(employee?.documents || []),
      ]);
      const formattedDocuments = [
        ...documents.map((document) => {
          const fileId = document.fileUrl?.match(
            /^\/api\/files\/([a-f\d]{24})(?:\?.*)?$/i,
          )?.[1] || null;
          return {
            id: String(document._id),
            name: document.title || document.fileName,
            category: document.category || "GENERAL",
            uploadedAt: document.createdAt,
            fileId,
          };
        }),
        ...embeddedDocuments.map((document) => {
          const fileId = document.url?.match(
            /^\/api\/files\/([a-f\d]{24})(?:\?.*)?$/i,
          )?.[1] || null;
          return {
            id: String(document._id),
            name: document.name || "Employee document",
            category: document.type || "GENERAL",
            uploadedAt: document.uploadedAt || null,
            fileId,
          };
        }),
      ];

      res.json({
        employee: {
          ...(employee || {
            ...legacyStaff,
            employmentType: null,
            employmentStatus: legacyStaff.isActive === false ? "inactive" : "active",
            joiningDate: null,
            reportingManager: null,
            contractInfo: {},
          }),
          user: source.user
            ? {
                ...source.user,
                roles: hasPermission(getUserRoles(req.user), "hr.employee.manage")
                  ? source.user.roles
                  : undefined,
              }
            : null,
          recordType: employee ? "employee" : "staff",
          documents: formattedDocuments,
        },
      });
    }),
  );

  app.post(
    "/api/hr/employees",
    requireAuth,
    requirePermission("hr.employee.manage"),
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      if (
        body.contractInfo !== undefined &&
        !hasPermission(getUserRoles(req.user), "hr.contracts.manage")
      ) {
        return res.status(403).json({ error: "Access denied. Contract management permission is required." });
      }
      if (!mongoose.isValidObjectId(body.userId)) {
        return res.status(400).json({ error: "Select a valid existing employee account." });
      }
      const validationMessage = validateEmployeeFields(body);
      if (validationMessage) return res.status(400).json({ error: validationMessage });

      const user = await User.findById(body.userId).select(PROFILE_USER_FIELDS);
      if (!user) return res.status(404).json({ error: "The linked user account was not found." });
      if (!user.roles?.some((role) => EMPLOYEE_ROLES.includes(role))) {
        return res.status(400).json({ error: "Only an existing staff or faculty account can be linked." });
      }

      const employeeId = normalizeEmployeeId(body.employeeId);
      const employeeIdMatch = employeeIdPattern(employeeId);
      const [employeeConflict, staffConflict, manager] = await Promise.all([
        Employee.findOne({ employeeId: employeeIdMatch, user: { $ne: user._id } }),
        Staff.findOne({ employeeId: employeeIdMatch, user: { $ne: user._id } }),
        body.reportingManager
          ? User.findOne({
              _id: body.reportingManager,
              roles: { $in: EMPLOYEE_ROLES },
            }).select("_id")
          : Promise.resolve(null),
      ]);
      if (employeeConflict || staffConflict) {
        return res.status(409).json({ error: "Employee ID already in use." });
      }
      if (body.reportingManager && !manager) {
        return res.status(400).json({ error: "The reporting manager account was not found." });
      }

      let employee = await Employee.findOne({ user: user._id });
      const creating = !employee;
      const update = {
        employeeId,
        department: String(body.department).trim(),
        designation: String(body.designation || "Staff").trim(),
        roleType: body.roleType || "staff",
        employmentType: body.employmentType || "permanent",
        employmentStatus: body.employmentStatus || "active",
        joiningDate: body.joiningDate || new Date(),
        reportingManager: body.reportingManager || null,
        contractInfo: body.contractInfo || {},
      };
      if (employee) {
        Object.assign(employee, update);
        await employee.save();
      } else {
        employee = await Employee.create({ user: user._id, ...update });
      }
      await syncStaffProfile(employee);
      await logAudit({
        userId: req.user._id || req.user.id,
        action: creating ? "HR_EMPLOYEE_LINKED" : "HR_EMPLOYEE_UPDATED",
        module: "hr",
        resource: "employee",
        resourceId: employee._id,
        details: creating
          ? `Employee record linked to account ${user.collegeEmail || user.email}.`
          : `Employee record updated for ${user.collegeEmail || user.email}.`,
        metadata: { employeeId, department: update.department },
      });
      res.status(creating ? 201 : 200).json({ employee });
    }),
  );

  app.put(
    "/api/hr/employees/:id",
    requireAuth,
    requirePermission("hr.employee.manage"),
    asyncHandler(async (req, res) => {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ error: "Invalid employee identifier." });
      }
      const body = req.body || {};
      if (
        body.contractInfo !== undefined &&
        !hasPermission(getUserRoles(req.user), "hr.contracts.manage")
      ) {
        return res.status(403).json({ error: "Access denied. Contract management permission is required." });
      }
      const validationMessage = validateEmployeeFields(body, { partial: true });
      if (validationMessage) return res.status(400).json({ error: validationMessage });

      let employee = await Employee.findById(req.params.id);
      if (!employee) {
        const staff = await Staff.findById(req.params.id);
        if (!staff) return res.status(404).json({ error: "Employee not found." });
        employee = await Employee.findOne({ user: staff.user });
        if (!employee) {
          employee = await Employee.create({
            user: staff.user,
            employeeId: staff.employeeId,
            department: staff.department,
            designation: staff.designation,
            roleType: staff.roleType,
            employmentType: null,
            employmentStatus: staff.isActive === false ? "inactive" : "active",
            joiningDate: null,
            campus: staff.campus,
          });
        }
      }

      const oldEmployment = {
        employeeId: employee.employeeId,
        department: employee.department,
        designation: employee.designation,
        employmentStatus: employee.employmentStatus,
      };
      const update = {};
      if (body.employeeId !== undefined) update.employeeId = normalizeEmployeeId(body.employeeId);
      if (body.department !== undefined) update.department = String(body.department).trim();
      if (body.designation !== undefined) update.designation = String(body.designation).trim();
      if (body.roleType !== undefined) update.roleType = body.roleType;
      if (body.employmentType !== undefined) update.employmentType = body.employmentType;
      if (body.employmentStatus !== undefined) update.employmentStatus = body.employmentStatus;
      if (body.joiningDate !== undefined) update.joiningDate = body.joiningDate || null;
      if (body.reportingManager !== undefined) update.reportingManager = body.reportingManager || null;
      if (body.contractInfo !== undefined) {
        update.contractInfo = {
          startDate: body.contractInfo?.startDate || null,
          endDate: body.contractInfo?.endDate || null,
          contractType: body.contractInfo?.contractType || null,
          terms: body.contractInfo?.terms || null,
        };
      }
      if (
        update.employeeId &&
        await Employee.exists({
          employeeId: employeeIdPattern(update.employeeId),
          _id: { $ne: employee._id },
        })
      ) {
        return res.status(409).json({ error: "Employee ID already in use." });
      }
      if (
        update.employeeId &&
        await Staff.exists({
          employeeId: employeeIdPattern(update.employeeId),
          user: { $ne: employee.user },
        })
      ) {
        return res.status(409).json({ error: "Employee ID already in use." });
      }
      if (body.reportingManager) {
        const manager = await User.exists({
          _id: body.reportingManager,
          roles: { $in: EMPLOYEE_ROLES },
        });
        if (!manager) {
          return res.status(400).json({ error: "The reporting manager account was not found." });
        }
      }

      const personalFields = [
        "firstName",
        "middleName",
        "lastName",
        "phone",
        "personalEmail",
        "address",
        "emergencyContact",
      ];
      const userUpdate = {};
      for (const field of personalFields) {
        if (body[field] !== undefined) userUpdate[field] = body[field];
      }
      if (userUpdate.firstName !== undefined) {
        userUpdate.firstName = String(userUpdate.firstName).trim();
      }
      if (userUpdate.middleName !== undefined) {
        userUpdate.middleName = String(userUpdate.middleName).trim() || null;
      }
      if (userUpdate.lastName !== undefined) {
        userUpdate.lastName = String(userUpdate.lastName).trim();
      }
      if (userUpdate.personalEmail !== undefined) {
        const personalEmail = String(userUpdate.personalEmail || "").trim().toLowerCase();
        if (personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) {
          return res.status(400).json({ error: "Enter a valid personal email address." });
        }
        userUpdate.personalEmail = personalEmail || null;
      }
      for (const field of ["phone", "address", "emergencyContact"]) {
        if (userUpdate[field] !== undefined) {
          userUpdate[field] = String(userUpdate[field] || "").trim() || null;
        }
      }
      if (userUpdate.firstName !== undefined && !userUpdate.firstName) {
        return res.status(400).json({ error: "First name cannot be empty." });
      }
      if (userUpdate.lastName !== undefined && !userUpdate.lastName) {
        return res.status(400).json({ error: "Last name cannot be empty." });
      }
      Object.assign(employee, update);
      await employee.validate();
      if (Object.keys(userUpdate).length) {
        await User.findByIdAndUpdate(employee.user, userUpdate, {
          runValidators: true,
        });
      }
      await employee.save();
      await syncStaffProfile(employee);
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "HR_EMPLOYEE_PROFILE_UPDATED",
        module: "hr",
        resource: "employee",
        resourceId: employee._id,
        oldValue: oldEmployment,
        newValue: {
          employeeId: employee.employeeId,
          department: employee.department,
          designation: employee.designation,
          employmentStatus: employee.employmentStatus,
        },
        details: "Employee profile updated by an authorised HR manager.",
      });
      res.json({ employee });
    }),
  );

  app.get(
    "/api/hr/leaves",
    requireAuth,
    requirePermission("hr.view"),
    asyncHandler(async (req, res) => {
      const leaves = await LeaveRequest.find()
        .populate("employee", "firstName lastName email")
        .populate("approvedBy", "firstName lastName")
        .sort({ createdAt: -1 });
      res.json({ leaves });
    }),
  );

  app.get(
    "/api/staff/leaves",
    requireAuth,
    asyncHandler(async (req, res) => {
      const leaves = await LeaveRequest.find({
        employee: req.user._id || req.user.id,
      })
        .populate("approvedBy", "firstName lastName")
        .sort({ createdAt: -1 });
      res.json({ leaves });
    }),
  );

  app.post(
    "/api/hr/leaves/apply",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      if (!body.leaveType || !body.startDate || !body.endDate || !body.reason) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const leave = await LeaveRequest.create({
        employee: req.user._id || req.user.id,
        leaveType: body.leaveType,
        startDate: body.startDate,
        endDate: body.endDate,
        reason: body.reason,
        supportingDocument: body.supportingDocument || null,
        status: "pending",
      });
      res.json({ leave });
    }),
  );

  app.post(
    "/api/staff/leaves/apply",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      if (!body.leaveType || !body.startDate || !body.endDate || !body.reason) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const leave = await LeaveRequest.create({
        employee: req.user._id || req.user.id,
        leaveType: body.leaveType,
        startDate: body.startDate,
        endDate: body.endDate,
        reason: body.reason,
        supportingDocument: body.supportingDocument || null,
        status: "pending",
      });
      res.json({ leave });
    }),
  );

  app.put(
    "/api/hr/leaves/:id/action",
    requireAuth,
    requirePermission("hr.leave.manage"),
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      if (!["approve", "reject"].includes(body.action)) {
        return res.status(400).json({ error: "Invalid action" });
      }
      const leave = await LeaveRequest.findById(req.params.id);
      if (!leave) return res.status(404).json({ error: "Leave request not found" });
      if (String(leave.employee) === String(req.user._id || req.user.id)) {
        return res.status(403).json({ error: "Cannot approve own leave" });
      }
      if (leave.status !== "pending") {
        return res.status(409).json({ error: "Leave already processed" });
      }
      leave.status = body.action === "approve" ? "approved" : "rejected";
      leave.approvedBy = req.user._id || req.user.id;
      leave.approvedAt = new Date();
      leave.comments = body.comments || null;
      if (body.action === "approve" && !leave.balanceDeducted) {
        leave.balanceDeducted = true;
      }
      await leave.save();
      res.json({ leave });
    }),
  );
}
