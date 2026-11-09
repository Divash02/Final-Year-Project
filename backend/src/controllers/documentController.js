/**
 * Document controller.
 *
 * Handles HTTP request/response concerns for document endpoints: parsing
 * body/query/params, invoking document service business logic, and sending
 * structured responses. No MongoDB models are imported here — all data
 * access goes through services/documentService.js.
 */

import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, notFound, forbidden } from "../utils/apiError.js";
import {
  createUploader,
  runFileUpload,
} from "../services/fileStorage.js";
import * as documentService from "../services/documentService.js";

const uploader = createUploader("document", { field: "file" });

/**
 * GET /api/documents/linked/:type/:id — serve a linked document (HTML).
 */
export const serveLinkedDocument = asyncHandler(async (req, res) => {
  const { type, id } = req.params;
  const linked = await documentService.findLinkedDocument(req, `${type}-${id}`);
  if (!linked) throw notFound("Document not found.");

  const download = String(req.query.download || "") === "true";

  if (type === "invoice") {
    const content = await documentService.renderInvoiceLinked(req, id, download);
    res.set(content.headers).send(content.body);
    return;
  }
  if (type === "receipt") {
    const content = await documentService.renderReceiptLinked(req, id, download);
    res.set(content.headers).send(content.body);
    return;
  }
  if (type === "enrollment") {
    const content = await documentService.renderEnrollmentLinked(req, id, download);
    res.set(content.headers).send(content.body);
    return;
  }
  if (type === "exam-result") {
    const content = await documentService.renderExamResultLinked(req, id, download);
    res.set(content.headers).send(content.body);
    return;
  }
  throw notFound("Document not found.");
});

/**
 * GET /api/documents/users/search — search users for sharing.
 */
export const searchUsers = asyncHandler(async (req, res) => {
  const users = await documentService.searchUsersRecord(req);
  res.json({ users });
});

/**
 * GET /api/documents — list documents (owned + shared + linked).
 */
export const listDocuments = asyncHandler(async (req, res) => {
  const documents = await documentService.listOwnedDocuments(req);
  res.json({ documents });
});

/**
 * POST /api/documents — create a document with file upload.
 */
export const createDocument = async (req, res, next) => {
  runFileUpload(req, res, uploader, async (error, file) => {
    if (error) return;
    const { document, file: reference } = await documentService.createDocumentRecord(req, file);
    res.json({ document, file: reference });
  }, next);
};

/**
 * GET /api/documents/:id — get a single document.
 */
export const getDocument = asyncHandler(async (req, res) => {
  const result = await documentService.findDocumentById(req, req.params.id);
  if (result.kind === "missing") throw notFound("Document not found.");
  if (result.kind === "forbidden") throw forbidden("Access denied.");
  res.json({ document: result.document });
});

/**
 * PATCH /api/documents/:id — update document metadata.
 */
export const updateDocument = asyncHandler(async (req, res) => {
  const doc = await documentService.updateDocumentRecord(req, req.params.id, req.body || {});
  res.json({ document: doc });
});

/**
 * PATCH /api/documents/:id/folder — change document folder.
 */
export const changeFolder = asyncHandler(async (req, res) => {
  const updated = await documentService.changeFolderRecord(req, req.params.id, req.body?.folderId);
  res.json({ document: updated });
});

/**
 * POST /api/documents/:id/share — share a document with a user.
 */
export const shareDocument = asyncHandler(async (req, res) => {
  const doc = await documentService.shareDocumentRecord(req, req.params.id, {
    userId: req.body?.userId,
    permission: req.body?.permission,
  });
  res.json({ document: doc });
});

/**
 * DELETE /api/documents/:id/share/:userId — unshare a document.
 */
export const unshareDocument = asyncHandler(async (req, res) => {
  const doc = await documentService.unshareDocumentRecord(req, req.params.id, req.params.userId);
  res.json({ document: doc });
});

/**
 * POST /api/documents/:id/versions — upload a new version.
 */
export const createVersion = async (req, res, next) => {
  runFileUpload(req, res, uploader, async (error, file) => {
    if (error) return;
    try {
      const updated = await documentService.createVersionRecord(req, req.params.id, file, req.body?.changeNote);
      res.json({ document: updated });
    } catch (e) {
      res.status(500).json({ error: e.message || "Upload failed" });
    }
  }, next);
};

/**
 * POST /api/documents/:id/restore/:version — restore a previous version.
 */
export const restoreVersion = asyncHandler(async (req, res) => {
  const updated = await documentService.restoreVersionRecord(req, req.params.id, req.params.version);
  res.json({ document: updated });
});

/**
 * GET /api/documents/:id/versions — list document versions.
 */
export const listVersions = asyncHandler(async (req, res) => {
  const { versions, current } = await documentService.listVersionsRecord(req, req.params.id);
  res.json({ versions, current });
});

/**
 * DELETE /api/documents/:id — archive a document.
 */
export const archiveDocument = asyncHandler(async (req, res) => {
  const result = await documentService.archiveDocumentRecord(req, req.params.id);
  res.json(result);
});
