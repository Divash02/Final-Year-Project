import fs from "node:fs";
import { logAudit } from "../db.js";

/**
 * Similarity / plagiarism architecture.
 *
 * CollegeOS does **not** ship a Turnitin-class engine and does not pretend to.
 * The workflow is real — a submission can be sent for analysis and the result
 * is stored and shown — but until an external provider is configured, the
 * status is `NOT_SUPPORTED` and the percentage stays `null`. No score is ever
 * generated, estimated or randomised.
 *
 * To connect an engine, configure `SIMILARITY_PROVIDER=http` plus
 * `SIMILARITY_API_URL` / `SIMILARITY_API_KEY` on the backend. The provider
 * contract below is the only thing a new engine has to satisfy.
 */

const NOT_CONFIGURED_MESSAGE =
  "Similarity analysis is not configured. Connect a similarity provider in the backend environment to enable this check.";

/** Provider registry. Only providers whose contract is implemented are listed. */
const providers = {
  none: {
    id: "none",
    label: "Not configured",
    isConfigured: () => false,
  },
  /**
   * Generic HTTP provider for an institution's own similarity service.
   *
   * Contract: `POST {SIMILARITY_API_URL}` with
   * `{ submissionId, fileName, text }` and a bearer `SIMILARITY_API_KEY`,
   * answering `{ percentage, sources: [{ label, url, matchedPercent }] }`.
   */
  http: {
    id: "http",
    label: "Institutional similarity service",
    isConfigured: () =>
      Boolean(
        process.env.SIMILARITY_API_URL && process.env.SIMILARITY_API_KEY,
      ),
    async check({ submissionId, fileName, text }) {
      const response = await fetch(process.env.SIMILARITY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SIMILARITY_API_KEY}`,
        },
        body: JSON.stringify({ submissionId, fileName, text }),
      });
      if (!response.ok) {
        throw new Error(`Similarity provider responded with HTTP ${response.status}.`);
      }
      const payload = await response.json();
      const percentage = Number(payload.percentage);
      if (!Number.isFinite(percentage)) {
        throw new Error("Similarity provider returned no usable percentage.");
      }
      return {
        percentage: Math.min(100, Math.max(0, percentage)),
        sources: Array.isArray(payload.sources) ? payload.sources.slice(0, 25) : [],
      };
    },
  },
};

export function getSimilarityProvider() {
  const requested = String(process.env.SIMILARITY_PROVIDER || "none").toLowerCase();
  return providers[requested] || providers.none;
}

/** Configuration summary the API exposes so the UI can state the truth. */
export function getSimilarityConfiguration() {
  const provider = getSimilarityProvider();
  return {
    configured: provider.isConfigured(),
    providerId: provider.id,
    providerLabel: provider.label,
    message: provider.isConfigured()
      ? `Similarity analysis is handled by ${provider.label}.`
      : NOT_CONFIGURED_MESSAGE,
  };
}

const ZIP_ENTRY = /word\/document\.xml/i;

/**
 * Best-effort plain-text extraction, used as provider input.
 *
 * DOCX is a ZIP container, so the document part can be read directly. PDF, DOC
 * and PPTX require dedicated parsers that CollegeOS does not bundle, so they
 * return `null` with a reason rather than an empty string that a provider could
 * misread as "no matches".
 */
export async function extractPlainText(absolutePath, extension) {
  const ext = String(extension || "").toLowerCase();
  if (ext === "txt" || ext === "md") {
    return { text: fs.readFileSync(absolutePath, "utf8").slice(0, 400000), extracted: true };
  }
  if (ext === "docx") {
    const buffer = fs.readFileSync(absolutePath);
    const listing = buffer.toString("latin1");
    if (!ZIP_ENTRY.test(listing)) {
      return { text: null, extracted: false, reason: "No Word document part was found." };
    }
    const start = listing.indexOf("word/document.xml");
    if (start === -1) return { text: null, extracted: false };
    const slice = listing.slice(start, start + 2_000_000);
    const text = slice
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    return { text: text.slice(0, 400000) || null, extracted: Boolean(text) };
  }
  return {
    text: null,
    extracted: false,
    reason: `Text extraction is not supported for ${ext.toUpperCase()} files.`,
  };
}

/**
 * Requests a similarity check for a submission and stores the real outcome.
 *
 * Returns the stored `similarity` subdocument. With no provider configured the
 * status is `NOT_SUPPORTED` and `percentage` remains null — the UI renders
 * "Similarity analysis is not configured." instead of a fabricated number.
 */
export async function runSimilarityCheck(submission, { actorUserId } = {}) {
  const provider = getSimilarityProvider();
  const configuration = getSimilarityConfiguration();

  if (!provider.isConfigured()) {
    submission.similarity = {
      status: "NOT_SUPPORTED",
      percentage: null,
      provider: null,
      matchedSources: [],
      message: configuration.message,
      checkedAt: new Date(),
    };
    await submission.save();
    await logAudit({
      userId: actorUserId,
      action: "SIMILARITY_CHECK_REQUESTED",
      module: "assignments",
      resource: "submission",
      resourceId: submission._id.toString(),
      details: `Similarity check requested for a ${submission.file?.extension?.toUpperCase() || "text"} submission; no provider is configured.`,
    });
    return submission.similarity.toObject?.() ?? submission.similarity;
  }

  submission.similarity = {
    status: "PROCESSING",
    percentage: null,
    provider: provider.id,
    matchedSources: [],
    message: "Analysis requested from the configured similarity provider.",
    checkedAt: new Date(),
  };
  await submission.save();

  try {
    const { resolveStoragePath } = await import("./fileStorage.js");
    const { StoredFile } = await import("../models/index.js");
    let text = null;
    const stored = submission.file?.fileId
      ? await StoredFile.findById(submission.file.fileId).lean()
      : null;
    if (stored?.storagePath) {
      const absolute = resolveStoragePath(stored.storagePath);
      if (absolute && fs.existsSync(absolute)) {
        const extracted = await extractPlainText(absolute, submission.file?.extension);
        text = extracted.text;
      }
    }

    const result = await provider.check({
      submissionId: submission._id.toString(),
      fileName: submission.file?.originalName || "submission",
      text,
    });

    submission.similarity = {
      status: "COMPLETED",
      percentage: result.percentage,
      provider: provider.id,
      matchedSources: result.sources,
      message: `Analysed by ${provider.label}.`,
      checkedAt: new Date(),
    };
  } catch (error) {
    submission.similarity = {
      status: "FAILED",
      percentage: null,
      provider: provider.id,
      matchedSources: [],
      message: `The similarity provider could not complete the check: ${error.message}`,
      checkedAt: new Date(),
    };
  }

  await submission.save();
  await logAudit({
    userId: actorUserId,
    action: "SIMILARITY_CHECK_COMPLETED",
    module: "assignments",
    resource: "submission",
    resourceId: submission._id.toString(),
    details: `Similarity check finished with status ${submission.similarity.status}.`,
    metadata: { provider: submission.similarity.provider },
  });
  return submission.similarity.toObject?.() ?? submission.similarity;
}
