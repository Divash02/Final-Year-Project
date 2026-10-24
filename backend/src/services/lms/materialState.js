import { MATERIAL_STATUSES } from "../../models/LearningMaterial.js";
import { validationError } from "../../utils/apiError.js";

/**
 * Material publishing state.
 *
 * A material's stored `status` is the teacher's decision; what a student
 * experiences also depends on `releaseAt`. Both are resolved here so the list
 * query, the single-record lookup and the file-download entitlement all agree.
 *
 * A scheduled material is a real state, not a UI convention: the sweep in
 * `services/lms/scheduler.js` promotes `SCHEDULED` to `PUBLISHED` at the release
 * instant and notifies the cohort, and any read before that moment derives
 * `SCHEDULED` regardless of the stored value, so a missed sweep can never leak
 * unreleased material to a student.
 */

export function resolveMaterialState(material, now = new Date()) {
  const status = material?.status || "PUBLISHED";
  if (status === "ARCHIVED" || status === "HIDDEN") return status;
  if (status === "DRAFT") return "DRAFT";

  if (status === "SCHEDULED") {
    if (material.releaseAt && new Date(material.releaseAt) > now) return "SCHEDULED";
    return "PUBLISHED";
  }

  // A published material may still carry a future release instant (the teacher
  // scheduled it and then changed the state), so the release instant is always
  // honoured before anything becomes visible.
  if (material.releaseAt && new Date(material.releaseAt) > now) return "SCHEDULED";
  return "PUBLISHED";
}

/** True when a member of the target cohort may open the material now. */
export function isMaterialVisibleToStudents(material, now = new Date()) {
  return resolveMaterialState(material, now) === "PUBLISHED";
}

/**
 * Mongo clauses restricting a material query to what the caller may read.
 *
 * Staff managing the course see every state (they need to review drafts);
 * students only ever see published, released material.
 */
export function buildMaterialVisibilityFilter({
  isCourseManager = false,
  now = new Date(),
} = {}) {
  if (isCourseManager) return {};
  return {
    $and: [
      { status: { $ne: "ARCHIVED" } },
      {
        $or: [
          {
            status: "PUBLISHED",
            $or: [{ releaseAt: null }, { releaseAt: { $lte: now } }, { releaseAt: { $exists: false } }],
          },
          { status: "SCHEDULED", releaseAt: { $lte: now } },
        ],
      },
    ],
  };
}

/** Student-facing state summary used by the weekly material list. */
export function materialStateSummary(material, now = new Date()) {
  const state = resolveMaterialState(material, now);
  return {
    state,
    visible: state === "PUBLISHED",
    releaseAt:
      state === "SCHEDULED" ? material.releaseAt || null : material.releaseAt || null,
    canDownload: state === "PUBLISHED" && material.allowDownload !== false,
  };
}

export function assertValidMaterialStatus(status) {
  if (!MATERIAL_STATUSES.includes(status)) {
    throw validationError(
      `Material visibility must be one of: ${MATERIAL_STATUSES.join(", ")}.`,
      [{ field: "status", message: "Choose a valid visibility state." }],
    );
  }
  return status;
}