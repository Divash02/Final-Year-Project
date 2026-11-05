import { requireAuth } from "../middleware/auth.js";
import {
  AcademicCalendarDocument,
  Document,
  Enrollment,
  ExamResult,
  Folder,
  Invoice,
  Payment,
  Staff,
  StoredFile,
  Student,
  User,
} from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { route, notFound, forbidden, badRequest } from "../utils/apiError.js";
import { createUploader, runFileUpload, persistStoredFile } from "../services/fileStorage.js";
import { getUserRoles } from "../db.js";
import { logAudit } from "../db.js";
import { hasPermission } from "../permissions/catalog.js";
import { audienceMatchesStudent, getAudienceContext } from "../services/accessControl.js";

const uploader = createUploader("document", { field: "file" });

const PRIVILEGED = ["super_admin", "dean", "registrar", "college_admin"];

async function userDepartment(userId) {
  const staff = await Staff.findOne({ user: userId }).lean();
  return staff?.department || null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function linkedDocumentId(type, id) {
  const prefixes = {
    invoice: "finance-invoice",
    receipt: "finance-receipt",
    enrollment: "academic-enrollment",
    examResult: "exam-result",
    academic: "academic-document",
  };
  return `${prefixes[type]}-${String(id)}`;
}

function linkedDocumentRecord({ type, source, userId, title, description, category, fileName, fileUrl, version = 1, versions = [] }) {
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

function invoiceVersionEntries(invoice) {
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

async function findLinkedDocument(req, id) {
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

async function listLinkedDocuments(req) {
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
    const student = await (await import("../models/index.js")).Student.findById(doc.student).select("user").lean();
    if (
      student &&
      String(student.user) === userId &&
      doc.approvalStatus === "approved" &&
      !doc.archived
    ) return true;
  }
  return false;
}

function documentHtml(title, rows, { downloadName, download = false } = {}) {
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

async function serveLinkedDocument(req, res) {
  const { type, id } = req.params;
  const prefix = {
    invoice: "finance-invoice",
    receipt: "finance-receipt",
    enrollment: "academic-enrollment",
    "exam-result": "exam-result",
  }[type] || type;
  const linked = await findLinkedDocument(req, `${prefix}-${id}`);
  if (!linked) throw notFound("Document not found.");

  const download = String(req.query.download || "") === "true";
  if (type === "invoice") {
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
    const content = documentHtml(`Official fee invoice ${invoice.invoiceNumber}`, [
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
    res.set(content.headers).send(content.body);
    return;
  }
  if (type === "receipt") {
    const payment = await Payment.findById(id).populate("invoice").lean();
    const content = documentHtml(`Official payment receipt ${payment.receiptNumber}`, [
      ["Receipt number", payment.receiptNumber],
      ["Invoice number", payment.invoice?.invoiceNumber || ""],
      ["Amount", `NPR ${Number(payment.amount).toFixed(2)}`],
      ["Payment method", payment.method],
      ["Transaction reference", payment.transactionReference || payment.transactionId || ""],
      ["Status", payment.status],
      ["Paid at", new Date(payment.createdAt).toLocaleString()],
    ], { downloadName: `${payment.receiptNumber}.html`, download });
    res.set(content.headers).send(content.body);
    return;
  }
  if (type === "enrollment") {
    const userId = req.user._id || req.user.id;
    const student = await Student.findOne({ user: userId }).select("_id firstName lastName studentId").lean();
    const enrollment = await Enrollment.findOne({
      _id: id,
      student: student?._id,
      studentUser: userId,
      status: "ENROLLED",
    }).populate("course").lean();
    if (!student || !enrollment) throw notFound("Document not found.");
    const content = documentHtml("Official enrollment confirmation", [
      ["Student", `${student.firstName} ${student.lastName} (${student.studentId})`],
      ["Course", `${enrollment.course?.code || ""} — ${enrollment.course?.name || ""}`],
      ["Academic year", enrollment.academicYear],
      ["Semester", enrollment.semester],
      ["Section", enrollment.sectionCode],
      ["Status", enrollment.status],
      ["Recorded", new Date(enrollment.createdAt).toLocaleDateString()],
    ], { downloadName: `enrollment-${enrollment.course?.code || enrollment._id}.html`, download });
    res.set(content.headers).send(content.body);
    return;
  }
  if (type === "exam-result") {
    const result = await ExamResult.findOne({
      _id: id,
      student: (await Student.findOne({ user: req.user._id || req.user.id }).select("_id"))._id,
      studentUser: req.user._id || req.user.id,
      workflowStatus: "PUBLISHED",
    }).populate("exam course").lean();
    if (!result) throw notFound("Document not found.");
    const subjects = (result.subjectMarks || []).map((mark) => [
      `${mark.code} — ${mark.name}`,
      `${mark.marksObtained ?? "—"} / ${mark.totalMarks} · ${mark.grade || mark.status}`,
    ]);
    const content = documentHtml(`Official examination result — ${result.exam?.title || ""}`, [
      ["Academic year", result.exam?.academicYear || ""],
      ["Semester", result.exam?.semester || ""],
      ["Exam status", result.status],
      ["Percentage", result.percentage ?? ""],
      ["Grade", result.grade || ""],
      ["GPA", result.gpa ?? ""],
      ["Published", new Date(result.publishedAt).toLocaleString()],
      ...subjects,
    ], { downloadName: `result-${result.exam?.examCode || result._id}.html`, download });
    res.set(content.headers).send(content.body);
    return;
  }
  throw notFound("Document not found.");
}

export function registerDocumentRoutes(app) {
  app.get("/api/documents/linked/:type/:id", requireAuth, asyncHandler(serveLinkedDocument));

  app.get("/api/documents/users/search", requireAuth, asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    const filter = q ? { $or: [{ firstName: new RegExp(q, "i") }, { lastName: new RegExp(q, "i") }, { email: new RegExp(q, "i") }] } : {};
    const users = await User.find(filter).select("firstName lastName email roles").limit(20).lean();
    res.json({ users });
  }));

  app.get("/api/documents", requireAuth, asyncHandler(async (req, res) => {
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
    visible.push(...await listLinkedDocuments(req));
    res.json({ documents: visible });
  }));

  app.post("/api/documents", requireAuth, async (req, res, next) => {
    runFileUpload(req, res, uploader, async (error, file) => {
      if (error) return;
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
        const actorId = String(req.user._id || req.user.id);
        const roles = getUserRoles(req.user);
        const canManage =
          roles.some((role) => PRIVILEGED.includes(role)) ||
          hasPermission(roles, "documents.manage");
        if (String(folder.owner) !== actorId && !canManage) {
          throw forbidden("You cannot upload into that folder.");
        }
      }
      const { reference } = await persistStoredFile({ file, module: "document", relatedType: "Document", uploadedBy: req.user._id || req.user.id });
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
        versions: [{ version: 1, fileName: reference.originalName, fileUrl: `/api/files/${reference.fileId}`, file: reference, fileSize: reference.sizeBytes, uploadedBy: req.user._id || req.user.id, uploadedAt: new Date(), changeNote: body.changeNote || "Initial upload", restoredFrom: null }],
      });
      await StoredFile.updateOne({ _id: reference.fileId }, { $set: { relatedId: String(doc._id) } });
      await logAudit({ userId: req.user._id || req.user.id, action: "DOCUMENT_CREATED", module: "documents", resource: "document", resourceId: doc._id, details: `Document created: ${doc.title}` });
      res.json({ document: doc, file: reference });
    }, next);
  });

  app.get("/api/documents/:id", requireAuth, asyncHandler(async (req, res) => {
    const linked = await findLinkedDocument(req, req.params.id);
    if (linked) {
      res.json({ document: linked });
      return;
    }
    const doc = await Document.findById(req.params.id)
      .populate("user", "firstName lastName email")
      .populate("sharedWith.user", "firstName lastName email roles")
      .populate("versions.uploadedBy", "firstName lastName email")
      .lean();
    if (!doc) throw notFound("Document not found.");
    if (!(await canAccessDocument(req, doc, "view"))) throw forbidden("Access denied.");
    res.json({ document: doc });
  }));

  app.patch("/api/documents/:id", requireAuth, asyncHandler(async (req, res) => {
    const doc = await Document.findById(req.params.id);
    if (!doc) throw notFound("Document not found.");
    if (String(doc.user) !== String(req.user._id || req.user.id) && !getUserRoles(req.user).some((r) => PRIVILEGED.includes(r))) {
      throw forbidden("Access denied.");
    }
    if (req.body.folder !== undefined && req.body.folder) {
      const target = await Folder.findById(req.body.folder);
      if (!target || target.archived) throw notFound("Folder not found.");
    }
    const oldAccess = doc.accessLevel;
    const body = req.body || {};
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
    res.json({ document: doc });
  }));

  /**
   * Assign a document to a folder, move it between folders, or file it back
   * to root level (folderId null/empty). Object-level authorisation is
   * enforced on the server: the actor must own the document (or hold
   * privileged/manage rights) and must be able to file into the target
   * folder. Frontend visibility alone is never sufficient.
   */
  app.patch("/api/documents/:id/folder", requireAuth, asyncHandler(async (req, res) => {
    const doc = await Document.findById(req.params.id);
    if (!doc) throw notFound("Document not found.");

    const userId = String(req.user._id || req.user.id);
    const roles = getUserRoles(req.user);
    const isOwner = String(doc.user) === userId;
    const privileged = roles.some((r) => PRIVILEGED.includes(r));
    const manages = hasPermission(roles, "documents.manage");
    if (!isOwner && !privileged && !manages) throw forbidden("Access denied.");

    const { folderId } = req.body || {};
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
    const updated = await Document.findById(doc._id).lean();
    res.json({ document: updated });
  }));

  app.post("/api/documents/:id/share", requireAuth, asyncHandler(async (req, res) => {
    const doc = await Document.findById(req.params.id);
    if (!doc) throw notFound("Document not found.");
    if (String(doc.user) !== String(req.user._id || req.user.id) && !getUserRoles(req.user).some((r) => PRIVILEGED.includes(r))) {
      throw forbidden("Access denied.");
    }
    const { userId, permission } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId required" });
    doc.sharedWith = doc.sharedWith || [];
    const idx = doc.sharedWith.findIndex((s) => String(s.user) === String(userId));
    const entry = { user: userId, permission: permission || "view", grantedBy: req.user._id || req.user.id, grantedAt: new Date() };
    if (idx >= 0) doc.sharedWith[idx] = entry; else doc.sharedWith.push(entry);
    await doc.save();
    await doc.populate("sharedWith.user", "firstName lastName email roles");
    await logAudit({ userId: req.user._id || req.user.id, action: "DOCUMENT_SHARED", module: "documents", resource: "document", resourceId: doc._id, metadata: { userId, permission }, details: `Shared with ${userId}` });
    res.json({ document: doc });
  }));

  app.delete("/api/documents/:id/share/:userId", requireAuth, asyncHandler(async (req, res) => {
    const doc = await Document.findById(req.params.id);
    if (!doc) throw notFound("Document not found.");
    if (String(doc.user) !== String(req.user._id || req.user.id) && !getUserRoles(req.user).some((r) => PRIVILEGED.includes(r))) {
      throw forbidden("Access denied.");
    }
    doc.sharedWith = (doc.sharedWith || []).filter((s) => String(s.user) !== String(req.params.userId));
    await doc.save();
    res.json({ document: doc });
  }));

  app.post("/api/documents/:id/versions", requireAuth, async (req, res, next) => {
    runFileUpload(req, res, uploader, async (error, file) => {
      if (error) return;
      const doc = await Document.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: "Document not found." });
      if (String(doc.user) !== String(req.user._id || req.user.id) && !getUserRoles(req.user).some((r) => PRIVILEGED.includes(r))) {
        return res.status(403).json({ error: "Access denied." });
      }
      try {
        const { reference } = await persistStoredFile({ file, module: "document", relatedType: "Document", uploadedBy: req.user._id || req.user.id });
        const expectedVersion = doc.version || 1;
        const nextVersion = expectedVersion + 1;
        const entry = { version: nextVersion, fileName: reference.originalName, fileUrl: `/api/files/${reference.fileId}`, file: reference, fileSize: reference.sizeBytes, uploadedBy: req.user._id || req.user.id, uploadedAt: new Date(), changeNote: req.body?.changeNote || "", restoredFrom: null };
        const updated = await Document.findOneAndUpdate(
          { _id: req.params.id, version: expectedVersion },
          { $push: { versions: entry }, $set: { version: nextVersion, fileName: reference.originalName, fileUrl: `/api/files/${reference.fileId}`, file: reference, fileSize: reference.sizeBytes } },
          { new: true }
        );
        if (!updated) {
          return res.status(409).json({ error: "Version conflict. Please retry." });
        }
        await StoredFile.updateOne({ _id: reference.fileId }, { $set: { relatedId: String(updated._id) } });
        await logAudit({ userId: req.user._id || req.user.id, action: "DOCUMENT_VERSION_CREATED", module: "documents", resource: "document", resourceId: updated._id, metadata: { version: nextVersion }, details: `New version ${nextVersion} uploaded` });
        res.json({ document: updated });
      } catch (e) {
        res.status(500).json({ error: e.message || "Upload failed" });
      }
    }, next);
  });

  app.post("/api/documents/:id/restore/:version", requireAuth, asyncHandler(async (req, res) => {
    const doc = await Document.findById(req.params.id);
    if (!doc) throw notFound("Document not found.");
    if (String(doc.user) !== String(req.user._id || req.user.id) && !getUserRoles(req.user).some((r) => PRIVILEGED.includes(r))) {
      throw forbidden("Access denied.");
    }
    const target = doc.versions.find((v) => v.version === Number(req.params.version));
    if (!target) throw notFound("Version not found.");
    const expectedVersion = doc.version || 1;
    const nextVersion = expectedVersion + 1;
    const entry = { version: nextVersion, fileName: target.fileName, fileUrl: target.fileUrl, file: target.file, fileSize: target.fileSize, uploadedBy: req.user._id || req.user.id, uploadedAt: new Date(), changeNote: `Restored from version ${target.version}`, restoredFrom: target.version };
    const updated = await Document.findOneAndUpdate(
      { _id: req.params.id, version: expectedVersion },
      { $push: { versions: entry }, $set: { version: nextVersion, fileName: target.fileName, fileUrl: target.fileUrl, file: target.file, fileSize: target.fileSize } },
      { new: true }
    );
    if (!updated) return res.status(409).json({ error: "Version conflict. Please retry." });
    await logAudit({ userId: req.user._id || req.user.id, action: "DOCUMENT_VERSION_RESTORED", module: "documents", resource: "document", resourceId: updated._id, metadata: { restoredFrom: target.version, newVersion: nextVersion }, details: `Restored from version ${target.version}` });
    res.json({ document: updated });
  }));

  app.get("/api/documents/:id/versions", requireAuth, asyncHandler(async (req, res) => {
    const linked = await findLinkedDocument(req, req.params.id);
    if (linked) {
      res.json({ versions: linked.versions || [], current: linked.version });
      return;
    }
    const doc = await Document.findById(req.params.id)
      .populate("versions.uploadedBy", "firstName lastName email")
      .lean();
    if (!doc) throw notFound("Document not found.");
    if (!(await canAccessDocument(req, doc, "view"))) throw forbidden("Access denied.");
    res.json({ versions: doc.versions || [], current: doc.version });
  }));

  app.delete("/api/documents/:id", requireAuth, asyncHandler(async (req, res) => {
    const doc = await Document.findById(req.params.id);
    if (!doc) throw notFound("Document not found.");
    if (String(doc.user) !== String(req.user._id || req.user.id) && !getUserRoles(req.user).some((r) => PRIVILEGED.includes(r))) {
      throw forbidden("Access denied.");
    }
    doc.archived = true;
    await doc.save();
    await logAudit({ userId: req.user._id || req.user.id, action: "DOCUMENT_ARCHIVED", module: "documents", resource: "document", resourceId: doc._id, details: `Document archived` });
    res.json({ ok: true });
  }));
}