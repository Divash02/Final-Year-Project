import fs from "node:fs";
import path from "node:path";
import { resolveStoragePath } from "./fileStorage.js";

/**
 * Document structure detection.
 *
 * The teaching-progress problem is only solvable if the system knows how long a
 * document is: a teacher can only record "slides 1 to 12" of twenty if twenty is
 * knowable. This service reads that structure out of the stored bytes themselves,
 * never out of a filename or a uploader's claim.
 *
 * Two real formats are detected:
 *  - PDF: the page tree. Counted from `/Type /Page` objects, cross-checked against
 *    an `/Count` entry in the page tree when one is present.
 *  - OOXML presentations (PPTX): a ZIP container whose `ppt/slides/` entries are
 *    the slides. Counted by walking the central directory, so a hundred-megabyte
 *    deck is never inflated into memory.
 *
 * Everything else reports `null`. A number the system cannot establish is left
 * absent rather than guessed, and the teacher records positions manually.
 */

const MAX_HEADER_BYTES = 1024 * 1024;

/**
 * Reads the structural facts of a stored file.
 *
 * @returns {Promise<{
 *   pageCount: number|null,
 *   slideCount: number|null,
 *   unitCount: number|null,
 *   unitLabel: "slide"|"page"|"section",
 *   detectedBy: string|null
 * }>}
 */
export async function detectDocumentStructure(stored) {
  const empty = {
    pageCount: null,
    slideCount: null,
    unitCount: null,
    unitLabel: "section",
    detectedBy: null,
  };
  if (!stored?.storagePath) return empty;

  const absolute = resolveStoragePath(stored.storagePath);
  if (!absolute || !fs.existsSync(absolute)) return empty;

  const extension = String(
    stored.extension || path.extname(absolute).replace(/^\./, ""),
  ).toLowerCase();

  try {
    if (extension === "pdf") {
      const pageCount = await countPdfPages(absolute);
      return pageCount
        ? {
            pageCount,
            slideCount: null,
            unitCount: pageCount,
            unitLabel: "page",
            detectedBy: "pdf-page-tree",
          }
        : empty;
    }

    if (extension === "pptx" || extension === "docx" || extension === "xlsx") {
      const entries = await listZipEntryNames(absolute);
      if (!entries.length) return empty;

      if (extension === "pptx") {
        const slideCount = entries.filter((name) =>
          /^ppt\/slides\/slide\d+\.xml$/.test(name),
        ).length;
        return slideCount
          ? {
              pageCount: null,
              slideCount,
              unitCount: slideCount,
              unitLabel: "slide",
              detectedBy: "pptx-slide-parts",
            }
          : empty;
      }
    }
  } catch {
    // A file we cannot read structurally is not an error: the teacher simply
    // records positions by hand, which the model supports without a count.
  }

  return empty;
}

/**
 * Counts the pages in a PDF.
 *
 * Page objects are matched on `/Type /Page` while explicitly rejecting
 * `/Type /Pages`, which is the page-tree root and would otherwise be counted as a
 * page. An encrypted PDF has no readable structure, so it reports nothing rather
 * than a number it cannot justify.
 */
async function countPdfPages(absolutePath) {
  const stats = await fs.promises.stat(absolutePath);
  if (stats.size === 0) return null;

  const header = Buffer.alloc(Math.min(stats.size, MAX_HEADER_BYTES));
  const handle = await fs.promises.open(absolutePath, "r");
  let headerText;
  try {
    await handle.read(header, 0, header.length, 0);
    headerText = header.toString("latin1");
  } finally {
    await handle.close();
  }

  if (!headerText.startsWith("%PDF-")) return null;
  // `/Encrypt` in the trailer means object streams may be compressed, so a text
  // scan would undercount. Refusing is the honest answer.
  if (/\/Encrypt[\s<]/.test(headerText)) return null;

  const pageMatches = headerText.match(/\/Type\s*\/Page[^s]/g);
  if (pageMatches && pageMatches.length) return pageMatches.length;

  // Some producers compress the object streams and expose the length only as the
  // page-tree `/Count`. Reading the tail is the last cheap thing worth trying.
  const tailSize = Math.min(stats.size, MAX_HEADER_BYTES);
  const tail = Buffer.alloc(tailSize);
  const tailHandle = await fs.promises.open(absolutePath, "r");
  try {
    await tailHandle.read(tail, 0, tailSize, Math.max(0, stats.size - tailSize));
  } finally {
    await tailHandle.close();
  }

  const countMatches = tail.toString("latin1").match(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g);
  if (!countMatches) return null;
  const counts = countMatches
    .map((entry) => Number(/\/Count\s+(\d+)/.exec(entry)?.[1] || 0))
    .filter((value) => value > 0);
  return counts.length ? Math.max(...counts) : null;
}

/**
 * Lists the entry names inside a ZIP container.
 *
 * Only the central directory is parsed, so an OOXML package is inspected without
 * decompressing a single part. End-of-central-directory records are scanned
 * backwards because the file may carry a trailing comment.
 */
async function listZipEntryNames(absolutePath) {
  const stats = await fs.promises.stat(absolutePath);
  if (stats.size < 22) return [];

  const tailSize = Math.min(stats.size, 66 * 1024);
  const tail = Buffer.alloc(tailSize);
  const handle = await fs.promises.open(absolutePath, "r");
  try {
    await handle.read(tail, 0, tailSize, Math.max(0, stats.size - tailSize));
  } finally {
    await handle.close();
  }

  let eocdOffset = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) return [];

  const entryCount = tail.readUInt16LE(eocdOffset + 10);
  const directorySize = tail.readUInt32LE(eocdOffset + 12);
  const directoryOffset = tail.readUInt32LE(eocdOffset + 16);
  if (!entryCount || !directorySize) return [];

  // ZIP64 containers store the real values in the ZIP64 locator; reading those
  // would require mapping offsets that may live outside the tail buffer. Report
  // nothing rather than a partial count.
  if (entryCount === 0xffff || directorySize === 0xffffffff) return [];

  const directory = Buffer.alloc(directorySize);
  const directoryHandle = await fs.promises.open(absolutePath, "r");
  try {
    await directoryHandle.read(directory, 0, directorySize, directoryOffset);
  } finally {
    await directoryHandle.close();
  }

  const names = [];
  let cursor = 0;
  while (cursor + 46 <= directory.length) {
    if (directory.readUInt32LE(cursor) !== 0x02014b50) break;
    const nameLength = directory.readUInt16LE(cursor + 28);
    const extraLength = directory.readUInt16LE(cursor + 30);
    const commentLength = directory.readUInt16LE(cursor + 32);
    const nameStart = cursor + 46;
    if (nameStart + nameLength > directory.length) break;
    names.push(directory.toString("utf8", nameStart, nameStart + nameLength));
    cursor = nameStart + nameLength + extraLength + commentLength;
  }
  return names;
}