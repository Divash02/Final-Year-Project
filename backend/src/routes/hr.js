import { requireAuth, requirePermission } from '../middleware/auth.js';
import { Employee, LeaveRequest, AuditLog } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function registerHRRoutes(app) {
  app.get('/api/hr/dashboard', requireAuth, requirePermission('hr.view'), asyncHandler(async (req, res) => {
    const totalEmployees = await Employee.countDocuments({ isActive: true });
    const inactiveEmployees = await Employee.countDocuments({ isActive: false });
    const facultyCount = await Employee.countDocuments({ roleType: { $in: ['faculty', 'teaching'] }, isActive: true });
    const staffCount = await Employee.countDocuments({ roleType: { $in: ['staff', 'non-teaching'] }, isActive: true });
    const pendingLeaves = await LeaveRequest.countDocuments({ status: 'pending' });
    res.json({ stats: { totalEmployees, activeEmployees: totalEmployees, inactiveEmployees, facultyCount, staffCount, pendingLeaves, newJoiners: 0, onLeave: 0, contractExpiring: 0, recruitmentPipeline: 0 } });
  }));

  app.get('/api/hr/employees', requireAuth, requirePermission('hr.view'), asyncHandler(async (req, res) => {
    const { department, roleType, search } = req.query;
    const filter = { isActive: true };
    if (department) filter.department = department;
    if (roleType) filter.roleType = roleType;
    let query = Employee.find(filter).populate('user', 'firstName lastName email collegeEmail phone avatarUrl roles').populate('reportingManager', 'firstName lastName email').sort({ createdAt: -1 });
    const employees = await query;
    res.json({ employees });
  }));

  app.get('/api/hr/employees/:id', requireAuth, requirePermission('hr.view'), asyncHandler(async (req, res) => {
    const employee = await Employee.findById(req.params.id).populate('user').populate('reportingManager', 'firstName lastName email');
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json({ employee });
  }));

  app.post('/api/hr/employees', requireAuth, requirePermission('hr.employee.manage'), asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body.userId || !body.employeeId || !body.department) return res.status(400).json({ error: 'Missing required fields' });
    const existing = await Employee.findOne({ $or: [{ user: body.userId }, { employeeId: body.employeeId }] });
    if (existing && String(existing.user) !== String(body.userId)) { return res.status(409).json({ error: 'Employee ID already in use' }); }
    let employee = await Employee.findOne({ user: body.userId });
    if (employee) {
      employee.employeeId = body.employeeId; employee.department = body.department;
      if (body.designation) employee.designation = body.designation;
      if (body.roleType) employee.roleType = body.roleType;
      if (body.employmentType) employee.employmentType = body.employmentType;
      if (body.employmentStatus) employee.employmentStatus = body.employmentStatus;
      if (body.joiningDate) employee.joiningDate = body.joiningDate;
      if (body.reportingManager) employee.reportingManager = body.reportingManager;
      await employee.save();
    } else {
      employee = await Employee.create({ user: body.userId, employeeId: body.employeeId, department: body.department, designation: body.designation || 'Staff', roleType: body.roleType || 'staff', employmentType: body.employmentType || 'permanent', employmentStatus: body.employmentStatus || 'active', joiningDate: body.joiningDate || new Date(), reportingManager: body.reportingManager || null });
    }
    res.json({ employee });
  }));

  app.get('/api/hr/leaves', requireAuth, requirePermission('hr.view'), asyncHandler(async (req, res) => {
    const leaves = await LeaveRequest.find().populate('employee', 'firstName lastName email').populate('approvedBy', 'firstName lastName').sort({ createdAt: -1 });
    res.json({ leaves });
  }));

  app.get('/api/staff/leaves', requireAuth, asyncHandler(async (req, res) => {
    const leaves = await LeaveRequest.find({ employee: req.user.id }).populate('approvedBy', 'firstName lastName').sort({ createdAt: -1 });
    res.json({ leaves });
  }));

  app.post('/api/hr/leaves/apply', requireAuth, asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body.leaveType || !body.startDate || !body.endDate || !body.reason) return res.status(400).json({ error: 'Missing required fields' });
    const leave = await LeaveRequest.create({ employee: req.user.id, leaveType: body.leaveType, startDate: body.startDate, endDate: body.endDate, reason: body.reason, supportingDocument: body.supportingDocument || null, status: 'pending' });
    res.json({ leave });
  }));

  app.post('/api/staff/leaves/apply', requireAuth, asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body.leaveType || !body.startDate || !body.endDate || !body.reason) return res.status(400).json({ error: 'Missing required fields' });
    const leave = await LeaveRequest.create({ employee: req.user.id, leaveType: body.leaveType, startDate: body.startDate, endDate: body.endDate, reason: body.reason, supportingDocument: body.supportingDocument || null, status: 'pending' });
    res.json({ leave });
  }));

  app.put('/api/hr/leaves/:id/action', requireAuth, requirePermission('hr.leave.manage'), asyncHandler(async (req, res) => {
    const body = req.body;
    if (!['approve', 'reject'].includes(body.action)) return res.status(400).json({ error: 'Invalid action' });
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (String(leave.employee) === String(req.user.id)) return res.status(403).json({ error: 'Cannot approve own leave' });
    if (leave.status !== 'pending') return res.status(409).json({ error: 'Leave already processed' });
    leave.status = body.action === 'approve' ? 'approved' : 'rejected';
    leave.approvedBy = req.user.id; leave.approvedAt = new Date(); leave.comments = body.comments || null;
    if (body.action === 'approve' && !leave.balanceDeducted) { leave.balanceDeducted = true; }
    await leave.save();
    res.json({ leave });
  }));
}
