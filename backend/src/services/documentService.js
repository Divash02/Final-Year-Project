/**
 * Document service layer.
 *
 * Pure business logic for documents: access control, linked document
 * resolution, HTML rendering helpers. No HTTP concerns (no req/res
 * handling beyond what the caller passes in). Routes and controllers
 * delegate here; MongoDB models are imported directly as the data
 * access boundary for this module.
 */

import {
  AcademicCalendarDocument,
  Document,
  Enrollment,
  ExamResult,
  Folder,
  Invoice,
  Payment,
  StoredFile,
  Student,
  User,
} from "../models/index.js";
import { getUserRoles, logAudit } from "../db.js";
import { hasPermission } from "../permissions/catalog.js";
import { audienceMatchesStudent, getAudienceContext } from "../services/accessControl.js";
import { badRequest, forbidden, notFound, conflict } from "../utils/apiError.js";
import { persistStoredFile } from "../services/fileStorage.js";

const PRIVILEGED = ["super_admin", "dean", "registrar", "college_admin"];

export function userDepartment(userId) {
  // Staff model is lazily imported to avoid a circular dependency at module load.
  return import("../models/index.js").then(({ Staff }) =>
    Staff.findOne({ user: userId }).lean().then((staff) => staff?.department || null)
  );
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function linkedDocumentId(type, id) {
  const prefixes = {
    invoice: "finance-invoice",
    receipt: "finance-receipt",
    enrollment: "academic-enrollment",
    examResult: "exam-result",
    academic: "academic-document",
  };
  return `${prefixes[type]}-${String(id)}`;
}

export function linkedDocumentRecord({ type, source, userId, title, description, category, fileName, fileUrl, version = 1, versions = [] }) {
  const sourceId = String(source._id);
  return {
    _id: linkedDocumentId(type, sourceId),
    sourceType: type,
    sourceId,
    title,
    description: description || "",
    user: userId,
    student: null,
    category,
    documentType: type,
    folder: "",
    department: type === "examResult" ? "Examination" : ["academic", "enrollment"].includes(type) ? "Academic" : "Finance",
    academicYear: source.academicYear || source.exam?.academicYear || "",
    tags: [],
    accessLevel: "restricted",
    approvalStatus: "approved",
    archived: false,
    version,
    fileName,
    fileUrl,
    fileSize: source.file?.sizeBytes || 0,
    createdAt: source.createdAt || new Date(),
    updatedAt: source.updatedAt || source.publishedAt || source.issuedAt || source.createdAt || new Date(),
    versions,
    linkedSource: { type, id: sourceId, status: source.status || source.workflowStatus || source.lifecycleState || "PUBLISHED" },
  };
}

export function invoiceVersionEntries(invoice) {
  return [
    ...(invoice.revisions || []).map((revision) => ({
      version: revision.version,
      fileName: `${invoice.invoiceNumber}-v${revision.version}.html`,
      fileUrl: `/api/documents/linked/invoice/${invoice._id}?version=${revision.version}`,
      fileSize: 0,
      uploadedBy: revision.changedBy,
      uploadedAt: revision.changedAt,
      changeNote: revision.changeNote,
      restoredFrom: null,
    })),
    {
      version: invoice.version || 1,
      fileName: `${invoice.invoiceNumber}.html`,
      fileUrl: `/api/documents/linked/invoice/${invoice._id}`,
      fileSize: 0,
      uploadedBy: invoice.issuedBy,
      uploadedAt: invoice.issuedAt || invoice.createdAt,
      changeNote: invoice.version > 1 ? "Current amended invoice" : "Officially issued invoice",
      restoredFrom: null,
    },
  ].sort((a, b) => a.version - b.version);
}

export function documentHtml(title, rows, { downloadName, download = false } = {}) {
  const contents = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  return {
    body: `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:16px Arial,sans-serif;max-width:760px;margin:40px auto;color:#172033}h1{font-size:24px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #dbe2ea}th{width:34%;color:#475569}</style><h1>${escapeHtml(title)}</h1><table>${contents}</table></html>`,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${downloadName}"`,
    },
  };
}

export async function findLinkedDocument(req, id) {
  const match = /^(finance-invoice|finance-receipt|academic-enrollment|exam-result|academic-document)-([a-f\d]{24})$/i.exec(String(id));
  if (!match) return null;
  const [, prefix, sourceId] = match;
  const userId = String(req.user._id || req.user.id);
  const student = await Student.findOne({ user: userId }).select("_id");
  if (prefix === "finance-invoice" && student) {
    const invoice = await Invoice.findOne({ _id: sourceId, student: student._id }).lean();
    if (!invoice || invoice.status === "DRAFT") return null;
    return linkedDocumentRecord({
      type: "invoice",
      source: invoice,
      userId,
      title: `Invoice ${invoice.invoiceNumber}`,
      description: `${invoice.title}${invoice.description ? ` — ${invoice.description}` : ""} · ${invoice.status}`,
      category: "FINANCE",
      fileName: `${invoice.invoiceNumber}.html`,
      fileUrl: `/api/documents/linked/invoice/${invoice._id}`,
      version: invoice.version || 1,
      versions: invoiceVersionEntries(invoice),
    });
  }
  if (prefix === "finance-receipt" && student) {
    const payment = await Payment.findOne({
      _id: sourceId,
      student: student._id,
      status: { $in: ["SUCCESS", "REFUNDED"] },
    }).populate("invoice").lean();
    if (!payment) return null;
    return linkedDocumentRecord({
      type: "receipt",
      source: payment,
      userId,
      title: `Payment receipt ${payment.receiptNumber}`,
      description: `Payment for invoice ${payment.invoice?.invoiceNumber || ""} · ${payment.status}`,
      category: "FEE_RECEIPT",
      fileName: `${payment.receiptNumber}.html`,
      fileUrl: `/api/documents/linked/receipt/${payment._id}`,
    });
  }
  if (prefix === "academic-enrollment" && student) {
    const enrollment = await Enrollment.findOne({
      _id: sourceId,
      student: student._id,
      studentUser: userId,
      status: "ENROLLED",
    }).populate("course").lean();
    if (!enrollment) return null;
    return linkedDocumentRecord({
      type: "enrollment",
      source: enrollment,
      userId,
      title: `Enrollment confirmation — ${enrollment.course?.code || "Course"}`,
      description: `${enrollment.course?.name || ""} · ${enrollment.academicYear} Semester ${enrollment.semester} · ${enrollment.status}`,
      category: "ACADEMIC",
      fileName: `enrollment-${enrollment.course?.code || enrollment._id}.html`,
      fileUrl: `/api/documents/linked/enrollment/${enrollment._id}`,
    });
  }
  if (prefix === "exam-result" && student) {
    const result = await ExamResult.findOne({
      _id: sourceId,
      student: student._id,
      studentUser: userId,
      workflowStatus: "PUBLISHED",
    }).populate("exam course").lean();
    if (!result) return null;
    return linkedDocumentRecord({
      type: "examResult",
      source: result,
      userId,
      title: `Official result — ${result.exam?.title || "Examination"}`,
      description: `${result.exam?.academicYear || ""} ${result.exam?.program || ""} Semester ${result.exam?.semester || ""}`.trim(),
      category: "EXAMINATION",
      fileName: `result-${result.exam?.examCode || result._id}.html`,
      fileUrl: `/api/documents/linked/exam-result/${result._id}`,
    });
  }
  if (prefix === "academic-document" && student) {
    const doc = await AcademicCalendarDocument.findOne({
      _id: sourceId,
      lifecycleState: "PUBLISHED",
    }).lean();
    const context = await getAudienceContext(req.user);
    if (!doc || !audienceMatchesStudent(doc.audience, context) || !doc.file?.fileId) return null;
    return linkedDocumentRecord({
      type: "academic",
      source: doc,
      userId,
      title: doc.title,
      description: doc.description,
      category: "ACADEMIC",
      fileName: doc.file.originalName,
      fileUrl: `/api/files/${doc.file.fileId}`,
      version: doc.version || 1,
    });
  }
  return null;
}

export async function listLinkedDocuments(req) {
  if (req.query.archived === "true") return [];
  const userId = String(req.user._id || req.user.id);
  const student = await Student.findOne({ user: userId }).select("_id");
  if (!student) return [];

  const [invoices, payments, enrollments, results, academicDocuments] = await Promise.all([
    Invoice.find({ student: student._id, status: { $ne: "DRAFT" } }).sort({ createdAt: -1 }).lean(),
    Payment.find({ student: student._id, status: { $in: ["SUCCESS", "REFUNDED"] } }).populate("invoice").sort({ createdAt: -1 }).lean(),
    Enrollment.find({ student: student._id, studentUser: userId, status: "ENROLLED" }).populate("course").sort({ academicYear: -1, semester: 1 }).lean(),
    ExamResult.find({ student: student._id, studentUser: userId, workflowStatus: "PUBLISHED" }).populate("exam course").sort({ publishedAt: -1 }).lean(),
    AcademicCalendarDocument.find({ lifecycleState: "PUBLISHED" }).sort({ publishedAt: -1 }).limit(200).lean(),
  ]);
  const context = await getAudienceContext(req.user);
  return [
    ...invoices.map((invoice) => linkedDocumentRecord({
      type: "invoice",
      source: invoice,
      userId,
      title: `Invoice ${invoice.invoiceNumber}`,
      description: `${invoice.title}${invoice.description ? ` — ${invoice.description}` : ""} · ${invoice.status}`,
      category: "FINANCE",
      fileName: `${invoice.invoiceNumber}.html`,
      fileUrl: `/api/documents/linked/invoice/${invoice._id}`,
      version: invoice.version || 1,
      versions: invoiceVersionEntries(invoice),
    })),
    ...payments.map((payment) => linkedDocumentRecord({
      type: "receipt",
      source: payment,
      userId,
      title: `Payment receipt ${payment.receiptNumber}`,
      description: `Payment for invoice ${payment.invoice?.invoiceNumber || ""} · ${payment.status}`,
      category: "FEE_RECEIPT",
      fileName: `${payment.receiptNumber}.html`,
      fileUrl: `/api/documents/linked/receipt/${payment._id}`,
    })),
    ...enrollments.map((enrollment) => linkedDocumentRecord({
      type: "enrollment",
      source: enrollment,
      userId,
      title: `Enrollment confirmation — ${enrollment.course?.code || "Course"}`,
      description: `${enrollment.course?.name || ""} · ${enrollment.academicYear} Semester ${enrollment.semester} · ${enrollment.status}`,
      category: "ACADEMIC",
      fileName: `enrollment-${enrollment.course?.code || enrollment._id}.html`,
      fileUrl: `/api/documents/linked/enrollment/${enrollment._id}`,
    })),
    ...results.map((result) => linkedDocumentRecord({
      type: "examResult",
      source: result,
      userId,
      title: `Official result — ${result.exam?.title || "Examination"}`,
      description: `${result.exam?.academicYear || ""} ${result.exam?.program || ""} Semester ${result.exam?.semester || ""}`.trim(),
      category: "EXAMINATION",
      fileName: `result-${result.exam?.examCode || result._id}.html`,
      fileUrl: `/api/documents/linked/exam-result/${result._id}`,
    })),
    ...academicDocuments
      .filter((document) => document.file?.fileId && audienceMatchesStudent(document.audience, context))
      .map((document) => linkedDocumentRecord({
        type: "academic",
        source: document,
        userId,
        title: document.title,
        description: document.description,
        category: "ACADEMIC",
        fileName: document.file.originalName,
        fileUrl: `/api/files/${document.file.fileId}`,
        version: document.version || 1,
      })),
  ];
}

export async function canAccessDocument(req, doc, action = "view") {
  if (!doc) return false;
  const userId = String(req.user._id || req.user.id);
  const roles = getUserRoles(req.user);
  if (String(doc.user?._id || doc.user) === userId) return true;
  if (roles.some((r) => PRIVILEGED.includes(r))) return true;
  if (hasPermission(roles, "documents.manage")) return true;
  const shared = (doc.sharedWith || []).find((s) => String(s.user) === userId || String(s.user?._id) === userId);
  if (shared) {
    if (action === "download" && shared.permission === "view") return false;
    return true;
  }
  if (doc.accessLevel === "public" && hasPermission(roles, "documents.view")) return true;
  if (doc.accessLevel === "department") {
    const dept = await userDepartment(userId);
    if (dept && dept === doc.department) return true;
  }
  if (doc.student) {
    const StudentModel = (await import("../models/index.js")).Student;
    const student = await StudentModel.findById(doc.student).select("user").lean();
    if (
      student &&
      String(student.user) === userId &&
      doc.approvalStatus === "approved" &&
      !doc.archived
    ) return true;
  }
  return false;
}

/* ========================================================================
 * Data access layer — all MongoDB model access happens here so controllers
 * never import models directly.
 * ======================================================================== */

const PRIVILEGED_ROLES = ["super_admin", "dean", "registrar", "college_admin"];
const PUBLISH_ROLES = ["super_admin", "registrar", "dean"];
const SHARE_ROLES = ["super_admin", "dean", "registrar", "college_admin"];

export async function listOwnedDocuments(req) {
  const all = await Document.find({ archived: req.query.archived === "true" })
    .populate("user", "firstName lastName email")
    .populate("sharedWith.user", "firstName lastName email roles")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  const visible = [];
  for (const d of all) {
    if (await canAccessDocument(req, d, "view")) visible.push(d);
  }
  visible.push(...(await listLinkedDocuments(req)));
  return visible;
}

export async function createDocumentRecord(req, file) {
  const body = req.body || {};
  if (!body.title) throw badRequest("title is required");
  let studentRecord = null;
  if (body.studentId) {
    if (!hasPermission(getUserRoles(req.user), "documents.publish")) {
      throw forbidden("You are not authorized to publish a document for a student.");
    }
    studentRecord = await Student.findOne({ studentId: String(body.studentId) }).select("_id");
    if (!studentRecord && /^[0-9a-fA-F]{24}$/.test(String(body.studentId))) {
      studentRecord = await Student.findById(body.studentId).select("_id");
    }
    if (!studentRecord) throw notFound("Student not found.");
  }
  const approvalStatus = String(body.approvalStatus || "approved");
  if (!["draft", "pending", "approved"].includes(approvalStatus)) {
    throw badRequest("Document approval status is invalid.");
  }
  if (body.folder) {
    const folder = await Folder.findById(body.folder).lean();
    if (!folder || folder.archived) {
      throw notFound("Folder not found.");
    }
    const roles = getUserRoles(req.user);
    const canManage =
      roles.some((role) => PRIVILEGED_ROLES.includes(role)) ||
      roles.some((r) => PUBLISH_ROLES.includes(r));
    if (String(folder.owner) !== String(req.user._id || req.user.id) && !canManage) {
      throw forbidden("You cannot upload into that folder.");
    }
  }
  const { reference } = await persistStoredFile({
    file,
    module: "document",
    relatedType: "Document",
    uploadedBy: req.user._id || req.user.id,
  });
  const doc = await Document.create({
    title: body.title,
    user: req.user._id || req.user.id,
    student: studentRecord?._id || null,
    category: body.category || "GENERAL",
    folder: body.folder || "",
    department: body.department || "",
    academicYear: body.academicYear || "",
    documentType: body.documentType || "GENERAL",
    tags: body.tags ? String(body.tags).split(",").map((t) => t.trim()).filter(Boolean) : [],
    accessLevel: body.accessLevel || "department",
    description: body.description || "",
    approvalStatus,
    fileName: reference.originalName,
    fileUrl: `/api/files/${reference.fileId}`,
    file: reference,
    fileSize: reference.sizeBytes,
    archived: false,
    sharedWith: [],
    version: 1,
    versions: [{
      version: 1,
      fileName: reference.originalName,
      fileUrl: `/api/files/${reference.fileId}`,
      file: reference,
      fileSize: reference.sizeBytes,
      uploadedBy: req.user._id || req.user.id,
      uploadedAt: new Date(),
      changeNote: body.changeNote || "Initial upload",
      restoredFrom: null,
    }],
  });
  await StoredFile.updateOne({ _id: reference.fileId }, { $set: { relatedId: String(doc._id) } });
  return { document: doc, file: reference };
}

export async function findDocumentById(req, id) {
  const linked = await findLinkedDocument(req, id);
  if (linked) return { kind: "linked", document: linked };
  const doc = await Document.findById(id)
    .populate("user", "firstName lastName email")
    .populate("sharedWith.user", "firstName lastName email roles")
    .populate("versions.uploadedBy", "firstName lastName email")
    .lean();
  if (!doc) return { kind: "missing" };
  if (!(await canAccessDocument(req, doc, "view"))) return { kind: "forbidden" };
  return { kind: "document", document: doc };
}

export async function updateDocumentRecord(req, id, body) {
  const doc = await Document.findById(id);
  if (!doc) throw notFound("Document not found.");
  if (String(doc.user) !== String(req.user._id || req.user.id) && !getUserRoles(req.user).some((r) => PRIVILEGED_ROLES.includes(r))) {
    throw forbidden("Access denied.");
  }
  if (body.folder !== undefined && body.folder) {
    const target = await Folder.findById(body.folder);
    if (!target || target.archived) throw notFound("Folder not found.");
  }
  const oldAccess = doc.accessLevel;
  if (
    body.approvalStatus !== undefined &&
    !hasPermission(getUserRoles(req.user), "documents.publish")
  ) {
    throw forbidden("You are not authorized to change document approval status.");
  }
  ["title","category","folder","department","academicYear","documentType","tags","accessLevel","description","archived","approvalStatus"].forEach((k) => {
    if (body[k] !== undefined) doc[k] = body[k];
  });
  if (Array.isArray(body.sharedWith)) {
    doc.sharedWith = body.sharedWith.map((s) => ({ user: s.user, permission: s.permission || "view", grantedBy: req.user._id || req.user.id, grantedAt: new Date() }));
  }
  await doc.save();
  if (body.accessLevel && body.accessLevel !== oldAccess) {
    await logAudit({ userId: req.user._id || req.user.id, action: "DOCUMENT_ACCESS_LEVEL_CHANGED", module: "documents", resource: "document", resourceId: doc._id, oldValue: oldAccess, newValue: body.accessLevel, details: "Access level changed" });
  }
  return doc;
}

export async function changeFolderRecord(req, id, folderId) {
  const doc = await Document.findById(id);
  if (!doc) throw notFound("Document not found.");

  const userId = String(req.user._id || req.user.id);
  const roles = getUserRoles(req.user);
  const isOwner = String(doc.user) === userId;
  const privileged = roles.some((r) => PRIVILEGED_ROLES.includes(r));
  const manages = roles.some((r) => PUBLISH_ROLES.includes(r));
  if (!isOwner && !privileged && !manages) throw forbidden("Access denied.");

  let targetFolder = null;
  if (folderId !== undefined && folderId !== null && folderId !== "") {
    targetFolder = await Folder.findById(folderId);
    if (!targetFolder || targetFolder.archived) throw notFound("Folder not found.");
    const folderOwner = String(targetFolder.owner) === userId;
    if (!folderOwner && !privileged && !manages) throw forbidden("You cannot file documents in that folder.");
  }

  const previousFolderId = String(doc.folder || "");
  doc.folder = targetFolder ? targetFolder._id : "";
  await doc.save();
  await logAudit({
    userId,
    action: "DOCUMENT_FOLDER_CHANGED",
    module: "documents",
    resource: "document",
    resourceId: doc._id,
    metadata: { previousFolderId: previousFolderId || null, newFolderId: targetFolder ? String(targetFolder._id) : null },
    details: targetFolder ? `Document filed into folder "${targetFolder.name}"` : "Document moved to root level",
  });
  return Document.findById(doc._id).lean();
}

export async function shareDocumentRecord(req, id, { userId, permission }) {
  const doc = await Document.findById(id);
  if (!doc) throw notFound("Document not found.");
  if (String(doc.user) !== String(req.user._id || req.user.id) && !getUserRoles(req.user).some((r) => SHARE_ROLES.includes(r))) {
    throw forbidden("Access denied.");
  }
  if (!userId) throw badRequest("userId required");
  doc.sharedWith = doc.sharedWith || [];
  const idx = doc.sharedWith.findIndex((s) => String(s.user) === String(userId));
  const entry = { user: userId, permission: permission || "view", grantedBy: req.user._id || req.user.id, grantedAt: new Date() };
  if (idx >= 0) doc.sharedWith[idx] = entry; else doc.sharedWith.push(entry);
  await doc.save();
  await doc.populate("sharedWith.user", "firstName lastName email roles");
  await logAudit({ userId: req.user._id || req.user.id, action: "DOCUMENT_SHARED", module: "documents", resource: "document", resourceId: doc._id, metadata: { userId, permission }, details: `Shared with ${userId}` });
  return doc;
}

export async function unshareDocumentRecord(req, id, userId) {
  const doc = await Document.findById(id);
  if (!doc) throw notFound("Document not found.");
  if (String(doc.user) !== String(req.user._id || req.user.id) && !getUserRoles(req.user).some((r) => SHARE_ROLES.includes(r))) {
    throw forbidden("Access denied.");
  }
  doc.sharedWith = (doc.sharedWith || []).filter((s) => String(s.user) !== String(userId));
  await doc.save();
  return doc;
}

export async function createVersionRecord(req, id, file, changeNote) {
  const doc = await Document.findById(id);
  if (!doc) throw notFound("Document not found.");
  if (String(doc.user) !== String(req.user._id || req.user.id) && !getUserRoles(req.user).some((r) => PRIVILEGED_ROLES.includes(r))) {
    throw forbidden("Access denied.");
  }
  const { reference } = await persistStoredFile({ file, module: "document", relatedType: "Document", uploadedBy: req.user._id || req.user.id });
  const expectedVersion = doc.version || 1;
  const nextVersion = expectedVersion + 1;
  const entry = {
    version: nextVersion,
    fileName: reference.originalName,
    fileUrl: `/api/files/${reference.fileId}`,
    file: reference,
    fileSize: reference.sizeBytes,
    uploadedBy: req.user._id || req.user.id,
    uploadedAt: new Date(),
    changeNote: changeNote || "",
    restoredFrom: null,
  };
  const updated = await Document.findOneAndUpdate(
    { _id: id, version: expectedVersion },
    { $push: { versions: entry }, $set: { version: nextVersion, fileName: reference.originalName, fileUrl: `/api/files/${reference.fileId}`, file: reference, fileSize: reference.sizeBytes } },
    { returnDocument: "after" }
  );
  if (!updated) throw conflict("Version conflict. Please retry.");
  await StoredFile.updateOne({ _id: reference.fileId }, { $set: { relatedId: String(updated._id) } });
  await logAudit({ userId: req.user._id || req.user.id, action: "DOCUMENT_VERSION_CREATED", module: "documents", resource: "document", resourceId: updated._id, metadata: { version: nextVersion }, details: `New version ${nextVersion} uploaded` });
  return updated;
}

export async function restoreVersionRecord(req, id, version) {
  const doc = await Document.findById(id);
  if (!doc) throw notFound("Document not found.");
  if (String(doc.user) !== String(req.user._id || req.user.id) && !getUserRoles(req.user).some((r) => PRIVILEGED_ROLES.includes(r))) {
    throw forbidden("Access denied.");
  }
  const target = doc.versions.find((v) => v.version === Number(version));
  if (!target) throw notFound("Version not found.");
  const expectedVersion = doc.version || 1;
  const nextVersion = expectedVersion + 1;
  const entry = {
    version: nextVersion,
    fileName: target.fileName,
    fileUrl: target.fileUrl,
    file: target.file,
    fileSize: target.fileSize,
    uploadedBy: req.user._id || req.user.id,
    uploadedAt: new Date(),
    changeNote: `Restored from version ${target.version}`,
    restoredFrom: target.version,
  };
  const updated = await Document.findOneAndUpdate(
    { _id: id, version: expectedVersion },
    { $push: { versions: entry }, $set: { version: nextVersion, fileName: target.fileName, fileUrl: target.fileUrl, file: target.file, fileSize: target.fileSize } },
    { returnDocument: "after" }
  );
  if (!updated) throw conflict("Version conflict. Please retry.");
  await logAudit({ userId: req.user._id || req.user.id, action: "DOCUMENT_VERSION_RESTORED", module: "documents", resource: "document", resourceId: updated._id, metadata: { restoredFrom: target.version, newVersion: nextVersion }, details: `Restored from version ${target.version}` });
  return updated;
}

export async function listVersionsRecord(req, id) {
  const linked = await findLinkedDocument(req, id);
  if (linked) return { versions: linked.versions || [], current: linked.version };
  const doc = await Document.findById(id)
    .populate("versions.uploadedBy", "firstName lastName email")
    .lean();
  if (!doc) throw notFound("Document not found.");
  if (!(await canAccessDocument(req, doc, "view"))) throw forbidden("Access denied.");
  return { versions: doc.versions || [], current: doc.version };
}

export async function archiveDocumentRecord(req, id) {
  const doc = await Document.findById(id);
  if (!doc) throw notFound("Document not found.");
  if (String(doc.user) !== String(req.user._id || req.user.id) && !getUserRoles(req.user).some((r) => PRIVILEGED_ROLES.includes(r))) {
    throw forbidden("Access denied.");
  }
  doc.archived = true;
  await doc.save();
  await logAudit({ userId: req.user._id || req.user.id, action: "DOCUMENT_ARCHIVED", module: "documents", resource: "document", resourceId: doc._id, details: `Document archived` });
  return { ok: true };
}

export async function searchUsersRecord(req) {
  const q = String(req.query.q || "").trim();
  const filter = q ? { $or: [{ firstName: new RegExp(q, "i") }, { lastName: new RegExp(q, "i") }, { email: new RegExp(q, "i") }] } : {};
  return User.find(filter).select("firstName lastName email roles").limit(20).lean();
}

/* ========================================================================
 * Linked document HTML rendering — fetches source data and builds the
 * full HTML response (headers + body) for each linked document type.
 * ======================================================================== */

export async function renderInvoiceLinked(req, id, download) {
  const invoice = await Invoice.findById(id).lean();
  const invoiceStudent = await Student.findById(invoice.student)
    .select("firstName lastName studentId")
    .lean();
  if (!invoiceStudent) throw notFound("Document not found.");
  const requestedVersion = Number(req.query.version || invoice.version || 1);
  const revision = requestedVersion === (invoice.version || 1)
    ? invoice
    : invoice.revisions?.find((item) => item.version === requestedVersion);
  if (!revision) throw notFound("Invoice version not found.");
  return documentHtml(`Official fee invoice ${invoice.invoiceNumber}`, [
    ["Invoice number", invoice.invoiceNumber],
    ["Student", `${invoiceStudent.firstName} ${invoiceStudent.lastName} (${invoiceStudent.studentId})`],
    ["Description", revision.title],
    ["Details", revision.description],
    ["Category", revision.category],
    ["Amount", `NPR ${Number(revision.totalAmount).toFixed(2)}`],
    ["Due date", revision.dueDate],
    ["Status", invoice.status],
    ["Version", requestedVersion],
    ["Issued", new Date(invoice.issuedAt || invoice.createdAt).toLocaleDateString()],
  ], { downloadName: `${invoice.invoiceNumber}-v${requestedVersion}.html`, download });
}

export async function renderReceiptLinked(req, id, download) {
  const payment = await Payment.findById(id).populate("invoice").lean();
  return documentHtml(`Official payment receipt ${payment.receiptNumber}`, [
    ["Receipt number", payment.receiptNumber],
    ["Invoice number", payment.invoice?.invoiceNumber || ""],
    ["Amount", `NPR ${Number(payment.amount).toFixed(2)}`],
    ["Payment method", payment.method],
    ["Transaction reference", payment.transactionReference || payment.transactionId || ""],
    ["Status", payment.status],
    ["Paid at", new Date(payment.createdAt).toLocaleString()],
  ], { downloadName: `${payment.receiptNumber}.html`, download });
}

export async function renderEnrollmentLinked(req, id, download) {
  const userId = req.user._id || req.user.id;
  const student = await Student.findOne({ user: userId }).select("_id firstName lastName studentId").lean();
  const enrollment = await Enrollment.findOne({
    _id: id,
    student: student?._id,
    studentUser: userId,
    status: "ENROLLED",
  }).populate("course").lean();
  if (!student || !enrollment) throw notFound("Document not found.");
  return documentHtml("Official enrollment confirmation", [
    ["Student", `${student.firstName} ${student.lastName} (${student.studentId})`],
    ["Course", `${enrollment.course?.code || ""} — ${enrollment.course?.name || ""}`],
    ["Academic year", enrollment.academicYear],
    ["Semester", enrollment.semester],
    ["Section", enrollment.sectionCode],
    ["Status", enrollment.status],
    ["Recorded", new Date(enrollment.createdAt).toLocaleDateString()],
  ], { downloadName: `enrollment-${enrollment.course?.code || enrollment._id}.html`, download });
}

export async function renderExamResultLinked(req, id, download) {
  const student = await Student.findOne({ user: req.user._id || req.user.id }).select("_id").lean();
  const result = await ExamResult.findOne({
    _id: id,
    student: student._id,
    studentUser: req.user._id || req.user.id,
    workflowStatus: "PUBLISHED",
  }).populate("exam course").lean();
  if (!result) throw notFound("Document not found.");
  const subjects = (result.subjectMarks || []).map((mark) => [
    `${mark.code} — ${mark.name}`,
    `${mark.marksObtained ?? "—"} / ${mark.totalMarks} · ${mark.grade || mark.status}`,
  ]);
  return documentHtml(`Official examination result — ${result.exam?.title || ""}`, [
    ["Academic year", result.exam?.academicYear || ""],
    ["Semester", result.exam?.semester || ""],
    ["Exam status", result.status],
    ["Percentage", result.percentage ?? ""],
    ["Grade", result.grade || ""],
    ["GPA", result.gpa ?? ""],
    ["Published", new Date(result.publishedAt).toLocaleString()],
    ...subjects,
  ], { downloadName: `result-${result.exam?.examCode || result._id}.html`, download });
}


