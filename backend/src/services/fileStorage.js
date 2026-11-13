import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { StoredFile } from "../models/index.js";
import { logAudit } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_ROOT = path.resolve(__dirname, "../../uploads");

/**
 * Central file upload architecture.
 *
 * Every module that accepts a binary — academic calendar attachments, learning
 * materials, assignment submissions and institutional documents — goes through
 * this service. It owns the storage layout, the allow-lists, the size limits,
 * the magic-byte verification and the metadata record, so five modules cannot
 * drift into five different (and five different unsafe) upload behaviours.
 *
 * Files are written outside the web root and are only reachable through
 * `routes/files.js`, which authorises the request against the owning record
 * before streaming a single byte.
 */

/** Extensions that are never accepted, whatever a module policy says. */
export const FORBIDDEN_EXTENSIONS = new Set([
  "exe", "dll", "so", "dylib", "bin", "com", "bat", "cmd", "ps1", "psm1",
  "sh", "bash", "zsh", "msi", "scr", "vbs", "vbe", "js", "mjs", "cjs", "jar",
  "apk", "app", "py", "pl", "rb", "php", "phtml", "jsp", "asp", "aspx",
  "cgi", "htaccess", "html", "htm", "xhtml", "svg", "swf",
]);

const MB = 1024 * 1024;

export const FILE_POLICIES = {
  academic_calendar: {
    dir: "academic-calendar",
    maxBytes: 12 * MB,
    extensions: ["pdf", "png", "jpg", "jpeg", "webp"],
    mimeTypes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ],
  },
  academic_calendar_document: {
    dir: "academic-calendar-documents",
    maxBytes: 25 * MB,
    extensions: [
      "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
      "png", "jpg", "jpeg", "webp",
    ],
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/png",
      "image/jpeg",
      "image/webp",
    ],
  },
  /**
   * Course learning materials. Wider than an assignment submission because a
   * week carries everything a lecture needs: slides, notes, spreadsheets,
   * diagrams, an archive of sample data, or a recorded class. Every extension
   * below is additionally verified against the file's real content family in
   * `verifyStoredFile`, so a renamed executable is still refused.
   */
  learning_material: {
    dir: "learning-material",
    maxBytes: 50 * MB,
    extensions: [
      "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
      "png", "jpg", "jpeg", "webp", "gif",
      "zip", "txt", "md", "csv",
      "mp4", "webm", "mov", "mp3", "wav",
    ],
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "application/zip",
      "application/x-zip-compressed",
      "text/plain",
      "text/markdown",
      "text/csv",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
    ],
  },
  assignment_submission: {
    dir: "assignment-submission",
    maxBytes: 25 * MB,
    extensions: ["pdf", "doc", "docx", "ppt", "pptx"],
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  },
  document: {
    dir: "documents",
    maxBytes: 12 * MB,
    extensions: ["pdf", "doc", "docx", "png", "jpg", "jpeg"],
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
    ],
  },
  /**
   * Notice attachments. Same document families as a calendar document
   * (Office files included) because a notice may carry a flyer, a
   * syllabus or a slide deck alongside its rich text. The bytes are
   * stored outside the web root and served only through the
   * entitlement-checked `/api/files/:id` route.
   */
  notice_attachment: {
    dir: "notice-attachments",
    maxBytes: 25 * MB,
    extensions: [
      "pdf", "doc", "docx", "ppt", "pptx",
      "png", "jpg", "jpeg", "webp",
    ],
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/png",
      "image/jpeg",
      "image/webp",
    ],
  },
  /**
   * Incident evidence and supporting documents submitted by students and
   * uploaded by staff during an investigation. Stored outside the web root and
   * served only through the entitlement-checked `/api/files/:id` route.
   */
  campus_incident: {
    dir: "campus-incident",
    maxBytes: 25 * MB,
    extensions: [
      "pdf", "doc", "docx", "ppt", "pptx",
      "png", "jpg", "jpeg", "webp", "gif",
      "mp4", "webm", "mov", "mp3", "wav",
      "zip", "txt", "md", "csv",
    ],
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "application/zip",
      "application/x-zip-compressed",
      "text/plain",
      "text/markdown",
      "text/csv",
    ],
  },
};

/** MIME types that are safe to render inline in the browser. */
const INLINE_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export class UploadRejectedError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = "UploadRejectedError";
    this.status = status;
    // Safe to show the browser: the message describes the file that was
    // refused, never anything about the server or the stored records.
    this.expose = true;
  }
}

export function policyFor(policyKey, overrides = {}) {
  const policy = FILE_POLICIES[policyKey];
  if (!policy) throw new Error(`Unknown file policy: ${policyKey}`);
  return {
    ...policy,
    maxBytes: Math.min(overrides.maxBytes ?? policy.maxBytes, policy.maxBytes),
    extensions: (overrides.extensions ?? policy.extensions).map((value) =>
      String(value).trim().toLowerCase().replace(/^\./, ""),
    ),
  };
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < MB) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / MB).toFixed(1)} MB`;
}

/**
 * Reads a file header and identifies the real content family.
 *
 * Client-declared types and extensions are never trusted: a `.pdf` that is
 * really a shell script is rejected here. Office Open XML files are ZIP
 * containers, so the family is confirmed from the `word/` or `ppt/` entry
 * names inside the container rather than from the `.docx`/`.pptx` suffix.
 */
export function sniffFileFamily(buffer) {
  if (!buffer || buffer.length < 8) return "unknown";
  const header = buffer.subarray(0, Math.min(buffer.length, 128)).toString("latin1");
  const bytes = buffer.subarray(0, 4);

  if (header.startsWith("%PDF-")) return "pdf";
  if (bytes[0] === 0x89 && header.slice(1, 4) === "PNG") return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (header.startsWith("GIF8")) return "gif";
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "webp";
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WAVE") return "wav";
  if (header.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return "mp3";
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "webm";
  }
  // ISO base media containers (MP4 and QuickTime) announce themselves with an
  // `ftyp` box at offset 4. The declared brand is checked by the caller.
  if (header.slice(4, 8) === "ftyp") return "mp4";
  if (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    return "ole2";
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5)) {
    const listing = buffer.subarray(0, Math.min(buffer.length, 128 * 1024)).toString("latin1");
    if (listing.includes("word/document.xml")) return "docx";
    if (listing.includes("ppt/presentation.xml")) return "pptx";
    if (listing.includes("xl/workbook.xml")) return "xlsx";
    return "zip";
  }
  // Plain text notes, Markdown handouts and CSV data sets: printable bytes with
  // no NULs. Executables and unknown binaries are not text.
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  let hasNul = false;
  for (const value of sample) {
    if (value === 0) {
      hasNul = true;
      break;
    }
  }
  if (!hasNul) return "text";
  return "unknown";
}

/** Extensions whose expected content family is checked against the sniff result. */
const FAMILY_BY_EXTENSION = {
  pdf: ["pdf"],
  png: ["png"],
  jpg: ["jpeg"],
  jpeg: ["jpeg"],
  webp: ["webp"],
  gif: ["gif"],
  doc: ["ole2", "docx"],
  docx: ["docx"],
  ppt: ["ole2", "pptx"],
  pptx: ["pptx"],
  xls: ["ole2", "xlsx"],
  xlsx: ["xlsx"],
  zip: ["zip", "xlsx", "docx", "pptx"],
  txt: ["text"],
  md: ["text"],
  csv: ["text"],
  mp4: ["mp4"],
  mov: ["mp4"],
  webm: ["webm"],
  mp3: ["mp3"],
  wav: ["wav"],
};

/**
 * Validates an already-stored file against its policy and its real content.
 * Runs after multer has written the bytes so the header can be inspected.
 */
export async function verifyStoredFile(filePath, policy) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const stats = await handle.stat();
    const buffer = Buffer.alloc(Math.min(stats.size, 128 * 1024));
    await handle.read(buffer, 0, buffer.length, 0);
    const family = sniffFileFamily(buffer);
    const extension = path.extname(filePath).replace(/^\./, "").toLowerCase();
    const allowed = FAMILY_BY_EXTENSION[extension] || [];
    if (!allowed.includes(family)) {
      throw new UploadRejectedError(
        `The uploaded file is not a valid ${extension.toUpperCase()} document.`,
      );
    }
    return { family, verifiedSignature: true, sizeBytes: stats.size };
  } finally {
    await handle.close();
  }
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

/** Builds the multer middleware for one policy, optionally with a size override. */
export function createUploader(policyKey, { field = "file", maxBytes, multiple = false, maxFiles = 8 } = {}) {
  const policy = policyFor(policyKey, { maxBytes });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const month = new Date().toISOString().slice(0, 7);
      cb(null, ensureDirectory(path.join(UPLOAD_ROOT, policy.dir, month)));
    },
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname || "").replace(/^\./, "").toLowerCase();
      cb(null, `${policy.dir}-${randomUUID()}${extension ? `.${extension}` : ""}`);
    },
  });

  const multerInstance = multer({
    storage,
    limits: {
      fileSize: policy.maxBytes,
      files: multiple ? maxFiles : 1,
      fields: 40,
    },
    fileFilter: (req, file, cb) => {
      const originalName = file.originalname || "upload";
      const extension = path.extname(originalName).replace(/^\./, "").toLowerCase();
      const mimeType = String(file.mimetype || "").toLowerCase();

      if (!extension || !policy.extensions.includes(extension)) {
        cb(
          new UploadRejectedError(
            `Only ${policy.extensions.map((value) => value.toUpperCase()).join(", ")} files are accepted here.`,
          ),
        );
        return;
      }
      if (FORBIDDEN_EXTENSIONS.has(extension)) {
        cb(new UploadRejectedError("This file type cannot be uploaded."));
        return;
      }
      if (!policy.mimeTypes.includes(mimeType)) {
        cb(
          new UploadRejectedError(
            `Unsupported file type (${mimeType || "unknown"}). Allowed: ${policy.extensions
              .map((value) => value.toUpperCase())
              .join(", ")}.`,
          ),
        );
        return;
      }
      cb(null, true);
    },
  });

  // A single-file field for record attachments; `.array` for the
  // multi-attachment upload endpoints (notice attachments).
  const middleware = multiple
    ? multerInstance.array(field, maxFiles)
    : multerInstance.single(field);
  // Surfaced so upload failures can report the real cap instead of 0.
  middleware.fileSizeLimit = policy.maxBytes;
  middleware.fileCountLimit = multiple ? maxFiles : 1;
  return middleware;
}

/** Removes a partially written upload so a rejected request leaves no residue. */
async function discardQuietly(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch {
    /* nothing to clean up */
  }
}

/**
 * Runs the multer middleware and converts every failure mode into a safe HTTP
 * response. `handler` only runs once a validated file is present; unexpected
 * failures inside it are forwarded to the Express error middleware.
 *
 * `optionalFile` is for the routes where the binary is an extra rather than the
 * subject of the request — creating a calendar event without an attachment, for
 * example. Every other upload still has to carry a file, so a forgotten file
 * input is reported instead of silently creating an empty record.
 */
export function runFileUpload(req, res, uploader, handler, next, { optionalFile = false } = {}) {
  uploader(req, res, async (uploadError) => {
    if (uploadError) {
      await discardQuietly(req.file?.path);
      if (uploadError instanceof UploadRejectedError) {
        res.status(uploadError.status || 422).json({ error: uploadError.message });
        return;
      }
      if (uploadError.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: `The file is larger than the ${formatBytes(
            uploader.fileSizeLimit || 0,
          )} limit for this upload.`,
        });
        return;
      }
      if (uploadError.code === "LIMIT_UNEXPECTED_FILE") {
        res.status(400).json({ error: "Unexpected file field in the request." });
        return;
      }
      console.error("File upload error:", uploadError.message);
      res.status(400).json({ error: "The file could not be received." });
      return;
    }

    try {
      if (!req.file && !optionalFile) {
        res.status(400).json({ error: "A file is required for this request." });
        return;
      }
      await handler(null, req.file);
    } catch (error) {
      await discardQuietly(req.file?.path);
      if (error instanceof UploadRejectedError) {
        res.status(error.status || 422).json({ error: error.message });
        return;
      }
      if (typeof next === "function") {
        next(error);
        return;
      }
      throw error;
    }
  });
}

/**
 * Multi-file variant of `runFileUpload` for endpoints that accept
 * several attachments at once (notice attachments). Every failure
 * cleans up every partially written file so a rejected request
 * leaves no residue, and the handler receives only verified files.
 */
export function runMultiFileUpload(req, res, uploader, handler, next, { maxFiles = 8 } = {}) {
  uploader(req, res, async (uploadError) => {
    if (uploadError) {
      for (const file of req.files || []) {
        await discardQuietly(file.path);
      }
      if (uploadError instanceof UploadRejectedError) {
        res.status(uploadError.status || 422).json({ error: uploadError.message });
        return;
      }
      if (uploadError.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: `A file is larger than the ${formatBytes(
            uploader.fileSizeLimit || 0,
          )} limit for this upload.`,
        });
        return;
      }
      if (uploadError.code === "LIMIT_FILE_COUNT") {
        res.status(400).json({
          error: `No more than ${maxFiles} files may be uploaded at once.`,
        });
        return;
      }
      if (uploadError.code === "LIMIT_UNEXPECTED_FILE") {
        res.status(400).json({ error: "Unexpected file field in the request." });
        return;
      }
      console.error("File upload error:", uploadError.message);
      res.status(400).json({ error: "The files could not be received." });
      return;
    }

    const files = Array.isArray(req.files) ? req.files : [];
    try {
      await handler(null, files);
    } catch (error) {
      for (const file of files) {
        await discardQuietly(file.path);
      }
      if (error instanceof UploadRejectedError) {
        res.status(error.status || 422).json({ error: error.message });
        return;
      }
      if (typeof next === "function") {
        next(error);
        return;
      }
      throw error;
    }
  });
}

/**
 * Persists metadata for a validated upload and returns the authoritative
 * `StoredFile` document plus the compact reference embedded in domain records.
 */
export async function persistStoredFile({
  module,
  file,
  verifiedSignature,
  uploadedBy,
  relatedType,
  relatedId,
}) {
  const extension = path.extname(file.originalname || "").replace(/^\./, "").toLowerCase();
  const storedName = path.basename(file.path);
  const relativeDir = path
    .relative(UPLOAD_ROOT, path.dirname(file.path))
    .split(path.sep)
    .join("/");

  const stored = await StoredFile.create({
    module,
    originalName: file.originalname,
    storedName,
    storagePath: relativeDir ? `${relativeDir}/${storedName}` : storedName,
    mimeType: String(file.mimetype || "application/octet-stream").toLowerCase(),
    extension,
    sizeBytes: file.size,
    verifiedSignature: Boolean(verifiedSignature),
    uploadedBy: uploadedBy || null,
    relatedType: relatedType || null,
    relatedId: relatedId ? String(relatedId) : null,
  });

  return {
    stored,
    reference: {
      fileId: stored._id,
      originalName: stored.originalName,
      mimeType: stored.mimeType,
      extension: stored.extension,
      sizeBytes: stored.sizeBytes,
      uploadedBy: stored.uploadedBy,
      uploadedAt: stored.createdAt,
    },
  };
}

/** Resolves a stored path to an absolute one, refusing anything outside the root. */
export function resolveStoragePath(storagePath) {
  const target = path.resolve(UPLOAD_ROOT, storagePath || "");
  const root = path.resolve(UPLOAD_ROOT);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

/**
 * Streams a stored file with download semantics. PDFs and images are delivered
 * inline so the browser can preview them; everything else is an attachment,
 * because CollegeOS does not pretend it can render DOCX or PPTX in the browser.
 */
export function streamStoredFile(res, stored, { download = false } = {}) {
  const absolute = resolveStoragePath(stored.storagePath);
  if (!absolute || !fs.existsSync(absolute)) {
    res.status(404).json({ error: "The stored file is no longer available." });
    return;
  }

  const inline = !download && INLINE_MIME_TYPES.has(stored.mimeType);
  const safeName = String(stored.originalName || stored.storedName).replace(/["\r\n]/g, "");
  res.setHeader("Content-Type", stored.mimeType || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; img-src 'self'; object-src 'self'; frame-ancestors 'self'",
  );
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(safeName)}"`,
  );
  fs.createReadStream(absolute).pipe(res);
}

/** Soft-deletes a stored file and unlinks its bytes. */
export async function deleteStoredFile(storedFileId, actorUserId) {
  const stored = await StoredFile.findById(storedFileId);
  if (!stored || stored.status === "DELETED") return null;

  const absolute = resolveStoragePath(stored.storagePath);
  if (absolute) await discardQuietly(absolute);

  stored.status = "DELETED";
  stored.deletedAt = new Date();
  stored.deletedBy = actorUserId || null;
  await stored.save();

  await logAudit({
    userId: actorUserId,
    action: "FILE_DELETED",
    module: stored.module,
    resource: "stored_file",
    resourceId: stored._id.toString(),
    details: `Stored file removed: ${stored.originalName}.`,
    metadata: { storagePath: stored.storagePath, sizeBytes: stored.sizeBytes },
  });

  return stored;
}

/** File extension check used by assignment submission rules. */
export function isSubmissionExtensionAllowed(allowedTypes, extension) {
  const allowed = (allowedTypes && allowedTypes.length ? allowedTypes : ["pdf"]).map(
    (value) => String(value).trim().toLowerCase().replace(/^\./, ""),
  );
  return allowed.includes(String(extension || "").toLowerCase().replace(/^\./, ""));
}
