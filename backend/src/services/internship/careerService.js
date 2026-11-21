import {
  CareerCategory,
  CareerRole,
  StudentCareerInterest,
  CareerExplorationActivity,
} from "../../models/index.js";
import { getStudentByUserId, logAudit } from "../../db.js";
import {
  badRequest,
  notFound,
  forbidden,
  conflict,
} from "../../utils/apiError.js";
import { createAndEmitNotification } from "../notificationService.js";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function isCoordinator(user) {
  const roles = user.roles || [];
  return roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin", "campus_admin"].includes(r),
  );
}

async function resolveStudentForUser(user) {
  const roles = user.roles || [];
  if (!roles.includes("student")) return null;
  return getStudentByUserId(user._id || user.id);
}

/* ------------------------------------------------------------------ */
/* Career Categories                                                  */
/* ------------------------------------------------------------------ */

export async function createCareerCategory(data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only coordinators can create career categories.");
  }

  const existing = await CareerCategory.findOne({
    code: String(data.code).toUpperCase().trim(),
  });
  if (existing) {
    throw conflict("A category with this code already exists.", {
      code: "DUPLICATE_CATEGORY_CODE",
    });
  }

  const category = await CareerCategory.create({
    code: String(data.code).toUpperCase().trim(),
    name: String(data.name).trim(),
    description: data.description ? String(data.description).trim() : "",
    icon: data.icon || "faLaptopCode",
    color: data.color || "indigo",
    displayOrder: Number(data.displayOrder || 0),
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "career.category.create",
    module: "career",
    resource: "CareerCategory",
    resourceId: String(category._id),
    details: `Career category "${category.name}" created`,
    metadata: { categoryId: String(category._id), categoryCode: category.code },
  });

  return { id: String(category._id), ...category.toObject() };
}

export async function updateCareerCategory(categoryId, updates, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only coordinators can update career categories.");
  }

  const category = await CareerCategory.findById(categoryId);
  if (!category) {
    throw notFound("Career category not found.");
  }

  const allowedFields = ["name", "description", "icon", "color", "displayOrder", "isActive"];
  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      changes[field] = updates[field];
    }
  }

  if (Object.keys(changes).length === 0) {
    return { id: String(category._id), ...category.toObject() };
  }

  Object.assign(category, changes);
  await category.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "career.category.update",
    module: "career",
    resource: "CareerCategory",
    resourceId: String(category._id),
    details: `Category updated: ${Object.keys(changes).join(", ")}`,
    metadata: { categoryId: String(category._id), changedFields: Object.keys(changes) },
  });

  return { id: String(category._id), ...category.toObject() };
}

export async function listCareerCategories(filter = {}, { page = 1, limit = 50 }) {
  const query = {};
  if (filter.isActive !== undefined) query.isActive = filter.isActive === true;

  const p = Math.max(1, Number(page));
  const l = Math.min(100, Math.max(1, Number(limit)));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    CareerCategory.find(query)
      .sort({ displayOrder: 1, name: 1 })
      .skip(skip)
      .limit(l)
      .lean(),
    CareerCategory.countDocuments(query),
  ]);

  return {
    items: items.map((c) => ({ id: String(c._id), ...c })),
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
  };
}

export async function getCareerCategory(categoryId) {
  const category = await CareerCategory.findById(categoryId).lean();
  if (!category) {
    throw notFound("Career category not found.");
  }
  return { id: String(category._id), ...category };
}

/* ------------------------------------------------------------------ */
/* Career Roles                                                       */
/* ------------------------------------------------------------------ */

export async function createCareerRole(data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only coordinators can create career roles.");
  }

  const existing = await CareerRole.findOne({
    code: String(data.code).toUpperCase().trim(),
  });
  if (existing) {
    throw conflict("A role with this code already exists.", {
      code: "DUPLICATE_ROLE_CODE",
    });
  }

  const category = await CareerCategory.findById(data.category);
  if (!category) {
    throw badRequest("Invalid career category.");
  }

  const role = await CareerRole.create({
    code: String(data.code).toUpperCase().trim(),
    name: String(data.name).trim(),
    category: data.category,
    description: String(data.description).trim(),
    industry: data.industry ? String(data.industry).trim() : "Information Technology",
    responsibilities: Array.isArray(data.responsibilities) ? data.responsibilities : [],
    requiredTechnicalSkills: Array.isArray(data.requiredTechnicalSkills) ? data.requiredTechnicalSkills : [],
    requiredSoftSkills: Array.isArray(data.requiredSoftSkills) ? data.requiredSoftSkills : [],
    professionalTools: Array.isArray(data.professionalTools) ? data.professionalTools : [],
    exampleProjects: Array.isArray(data.exampleProjects) ? data.exampleProjects : [],
    competencies: Array.isArray(data.competencies) ? data.competencies : [],
    assessmentCriteria: Array.isArray(data.assessmentCriteria) ? data.assessmentCriteria : [],
    portfolioEvidenceRequirements: Array.isArray(data.portfolioEvidenceRequirements)
      ? data.portfolioEvidenceRequirements
      : [],
    relatedJobTitles: Array.isArray(data.relatedJobTitles) ? data.relatedJobTitles : [],
    careerProgression: Array.isArray(data.careerProgression) ? data.careerProgression : [],
    difficulty: data.difficulty || "INTERMEDIATE",
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    isFeatured: Boolean(data.isFeatured),
    metadata: data.metadata || {},
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "career.role.create",
    module: "career",
    resource: "CareerRole",
    resourceId: String(role._id),
    details: `Career role "${role.name}" created`,
    metadata: { roleId: String(role._id), roleCode: role.code, categoryId: String(role.category) },
  });

  return { id: String(role._id), ...role.toObject() };
}

export async function updateCareerRole(roleId, updates, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only coordinators can update career roles.");
  }

  const role = await CareerRole.findById(roleId);
  if (!role) {
    throw notFound("Career role not found.");
  }

  const allowedFields = [
    "name",
    "category",
    "description",
    "industry",
    "responsibilities",
    "requiredTechnicalSkills",
    "requiredSoftSkills",
    "professionalTools",
    "exampleProjects",
    "competencies",
    "assessmentCriteria",
    "portfolioEvidenceRequirements",
    "relatedJobTitles",
    "careerProgression",
    "difficulty",
    "isActive",
    "isFeatured",
    "metadata",
  ];

  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      changes[field] = updates[field];
    }
  }

  if (Object.keys(changes).length === 0) {
    return { id: String(role._id), ...role.toObject() };
  }

  if (changes.code) {
    changes.code = String(changes.code).toUpperCase().trim();
  }

  Object.assign(role, changes);
  await role.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "career.role.update",
    module: "career",
    resource: "CareerRole",
    resourceId: String(role._id),
    details: `Role updated: ${Object.keys(changes).join(", ")}`,
    metadata: { roleId: String(role._id), changedFields: Object.keys(changes) },
  });

  return { id: String(role._id), ...role.toObject() };
}

export async function listCareerRoles(filter = {}, { page = 1, limit = 20 }) {
  const query = {};
  if (filter.category) query.category = filter.category;
  if (filter.difficulty) query.difficulty = filter.difficulty;
  if (filter.isActive !== undefined) query.isActive = filter.isActive === true;
  if (filter.isFeatured !== undefined) query.isFeatured = filter.isFeatured === true;
  if (filter.search) {
    query.$or = [
      { name: { $regex: filter.search, $options: "i" } },
      { code: { $regex: filter.search, $options: "i" } },
      { description: { $regex: filter.search, $options: "i" } },
    ];
  }

  const p = Math.max(1, Number(page));
  const l = Math.min(100, Math.max(1, Number(limit)));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    CareerRole.find(query)
      .populate("category", "name code icon color")
      .sort({ name: 1 })
      .skip(skip)
      .limit(l)
      .lean(),
    CareerRole.countDocuments(query),
  ]);

  return {
    items: items.map((r) => ({
      id: String(r._id),
      ...r,
      category: r.category
        ? { id: String(r.category._id), name: r.category.name, code: r.category.code, icon: r.category.icon, color: r.category.color }
        : null,
    })),
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
  };
}

export async function getCareerRole(roleId) {
  const role = await CareerRole.findById(roleId)
    .populate("category", "name code icon color")
    .populate("competencies", "code name category targetProficiency")
    .lean();
  if (!role) {
    throw notFound("Career role not found.");
  }
  return {
    id: String(role._id),
    ...role,
    category: role.category
      ? { id: String(role.category._id), name: role.category.name, code: role.category.code, icon: role.category.icon, color: role.category.color }
      : null,
  };
}

export async function compareCareerRoles(roleIds, { requestingUser }) {
  const roles = await CareerRole.find({ _id: { $in: roleIds } })
    .populate("category", "name code icon color")
    .lean();

  return roles.map((r) => ({
    id: String(r._id),
    ...r,
    category: r.category
      ? { id: String(r.category._id), name: r.category.name, code: r.category.code, icon: r.category.icon, color: r.category.color }
      : null,
  }));
}

/* ------------------------------------------------------------------ */
/* Student Career Interests                                           */
/* ------------------------------------------------------------------ */

export async function addCareerInterest(data, { requestingUser }) {
  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can add career interests.");
  }

  const careerRole = await CareerRole.findById(data.careerRole).lean();
  if (!careerRole) {
    throw notFound("Career role not found.");
  }

  const existing = await StudentCareerInterest.findOne({
    student: student._id,
    careerRole: data.careerRole,
  });
  if (existing) {
    throw conflict("You have already added this career interest.", {
      code: "DUPLICATE_CAREER_INTEREST",
      interestId: String(existing._id),
    });
  }

  const interest = await StudentCareerInterest.create({
    student: student._id,
    careerRole: data.careerRole,
    interestLevel: data.interestLevel || "EXPLORING",
    notes: data.notes ? String(data.notes).trim() : "",
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "career.interest.add",
    module: "career",
    resource: "StudentCareerInterest",
    resourceId: String(interest._id),
    details: `Student added career interest: ${careerRole.name}`,
    metadata: { interestId: String(interest._id), studentId: String(student._id), careerRoleId: String(careerRole._id) },
  });

  return { id: String(interest._id), ...interest.toObject() };
}

export async function updateCareerInterest(interestId, updates, { requestingUser }) {
  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can update career interests.");
  }

  const interest = await StudentCareerInterest.findOne({
    _id: interestId,
    student: student._id,
  });
  if (!interest) {
    throw notFound("Career interest not found.");
  }

  const allowedFields = ["interestLevel", "notes"];
  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      changes[field] = updates[field];
    }
  }

  if (Object.keys(changes).length === 0) {
    return { id: String(interest._id), ...interest.toObject() };
  }

  Object.assign(interest, changes);
  interest.lastExploredAt = new Date();
  await interest.save();

  return { id: String(interest._id), ...interest.toObject() };
}

export async function removeCareerInterest(interestId, { requestingUser }) {
  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can remove career interests.");
  }

  const interest = await StudentCareerInterest.findOneAndDelete({
    _id: interestId,
    student: student._id,
  });
  if (!interest) {
    throw notFound("Career interest not found.");
  }

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "career.interest.remove",
    module: "career",
    resource: "StudentCareerInterest",
    resourceId: String(interest._id),
    details: `Student removed career interest`,
    metadata: { interestId: String(interest._id), studentId: String(student._id) },
  });

  return { success: true };
}

export async function listCareerInterests({ requestingUser }) {
  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can view career interests.");
  }

  const interests = await StudentCareerInterest.find({ student: student._id })
    .populate("careerRole", "name code description difficulty category")
    .populate({
      path: "careerRole",
      populate: { path: "category", select: "name code icon color" },
    })
    .sort({ lastExploredAt: -1 })
    .lean();

  return interests.map((i) => ({
    id: String(i._id),
    ...i,
    careerRole: i.careerRole
      ? {
          id: String(i.careerRole._id),
          name: i.careerRole.name,
          code: i.careerRole.code,
          description: i.careerRole.description,
          difficulty: i.careerRole.difficulty,
          category: i.careerRole.category
            ? {
                id: String(i.careerRole.category._id),
                name: i.careerRole.category.name,
                code: i.careerRole.category.code,
                icon: i.careerRole.category.icon,
                color: i.careerRole.category.color,
              }
            : null,
        }
      : null,
  }));
}

/* ------------------------------------------------------------------ */
/* Career Exploration Activity Tracking                               */
/* ------------------------------------------------------------------ */

export async function recordExplorationActivity(data, { requestingUser }) {
  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can record exploration activity.");
  }

  const careerRole = await CareerRole.findById(data.careerRole).lean();
  if (!careerRole) {
    throw notFound("Career role not found.");
  }

  const activity = await CareerExplorationActivity.create({
    student: student._id,
    careerRole: data.careerRole,
    activityType: data.activityType,
    metadata: data.metadata || {},
  });

  await StudentCareerInterest.findOneAndUpdate(
    { student: student._id, careerRole: data.careerRole },
    { lastExploredAt: new Date() },
    { upsert: false }
  );

  return { id: String(activity._id), ...activity.toObject() };
}

export async function getExplorationHistory({ requestingUser, careerRoleId, limit = 50 }) {
  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can view exploration history.");
  }

  const query = { student: student._id };
  if (careerRoleId) query.careerRole = careerRoleId;

  const activities = await CareerExplorationActivity.find(query)
    .populate("careerRole", "name code")
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, Number(limit))))
    .lean();

  return activities.map((a) => ({
    id: String(a._id),
    ...a,
    careerRole: a.careerRole
      ? { id: String(a.careerRole._id), name: a.careerRole.name, code: a.careerRole.code }
      : null,
  }));
}

/* ------------------------------------------------------------------ */
/* Career Exploration Dashboard Data                                  */
/* ------------------------------------------------------------------ */

export async function getCareerExplorerDashboard({ requestingUser }) {
  const student = await resolveStudentForUser(requestingUser);
  const isStudent = !!student;

  const [categories, featuredRoles, totalRoles] = await Promise.all([
    CareerCategory.find({ isActive: true }).sort({ displayOrder: 1 }).lean(),
    CareerRole.find({ isActive: true, isFeatured: true })
      .populate("category", "name code icon color")
      .limit(6)
      .lean(),
    CareerRole.countDocuments({ isActive: true }),
  ]);

  let myInterests = [];
  let recentActivity = [];

  if (isStudent) {
    myInterests = await StudentCareerInterest.find({ student: student._id })
      .populate("careerRole", "name code difficulty category")
      .populate({ path: "careerRole", populate: { path: "category", select: "name code icon color" } })
      .sort({ lastExploredAt: -1 })
      .limit(10)
      .lean();

    recentActivity = await CareerExplorationActivity.find({ student: student._id })
      .populate("careerRole", "name code")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
  }

  return {
    categories: categories.map((c) => ({ id: String(c._id), ...c })),
    featuredRoles: featuredRoles.map((r) => ({
      id: String(r._id),
      ...r,
      category: r.category
        ? { id: String(r.category._id), name: r.category.name, code: r.category.code, icon: r.category.icon, color: r.category.color }
        : null,
    })),
    totalRoles,
    myInterests: myInterests.map((i) => ({
      id: String(i._id),
      ...i,
      careerRole: i.careerRole
        ? {
            id: String(i.careerRole._id),
            name: i.careerRole.name,
            code: i.careerRole.code,
            difficulty: i.careerRole.difficulty,
            category: i.careerRole.category
              ? {
                  id: String(i.careerRole.category._id),
                  name: i.careerRole.category.name,
                  code: i.careerRole.category.code,
                  icon: i.careerRole.category.icon,
                  color: i.careerRole.category.color,
                }
              : null,
          }
        : null,
    })),
    recentActivity: recentActivity.map((a) => ({
      id: String(a._id),
      ...a,
      careerRole: a.careerRole
        ? { id: String(a.careerRole._id), name: a.careerRole.name, code: a.careerRole.code }
        : null,
    })),
  };
}