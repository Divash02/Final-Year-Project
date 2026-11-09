import mongoose from "mongoose";

/**
 * Reusable audience targeting.
 *
 * Every record that is published to a subset of the institution (academic
 * calendar events, learning materials, assignments, notices, documents) stores
 * the same `audience` shape. Authorisation is then decided in one place
 * (`services/accessControl.js`) instead of being re-implemented per module, so
 * a calendar event and a learning material can never drift apart in how they
 * treat "BSc IT · 2025 · Semester 4 · A25".
 */
export const AUDIENCE_TARGET_TYPES = ["ALL", "STAFF", "SPECIFIC"];

/**
 * `SPECIFIC` target dimensions.
 *
 * Semantics: every dimension that carries values is an AND constraint; the
 * values inside one dimension are an OR set. An empty dimension imposes no
 * constraint. `allSections` is the explicit "every section of the selected
 * cohort" switch, so a record can say "BSc IT 2025 Semester 4, all sections"
 * without listing section codes.
 */
const AcademicTargetSchema = new mongoose.Schema(
  {
    allSections: { type: Boolean, default: true },
    programCodes: [{ type: String, uppercase: true, trim: true }],
    batchYears: [{ type: String, trim: true }],
    semesters: [{ type: Number }],
    sectionCodes: [{ type: String, uppercase: true, trim: true }],
    userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    roleIds: [{ type: String, trim: true }],
  },
  { _id: false },
);

const AudienceSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      enum: AUDIENCE_TARGET_TYPES,
      default: "ALL",
      index: true,
    },
    target: { type: AcademicTargetSchema, default: () => ({}) },
  },
  { _id: false },
);

export { AudienceSchema };

const asStringArray = (value) => {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim()
      ? value.split(",")
      : [];
  return Array.from(
    new Set(
      source
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean),
    ),
  );
};

const asNumberArray = (value) => {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim()
      ? value.split(",")
      : [];
  return Array.from(
    new Set(
      source
        .map((entry) => Number(String(entry ?? "").trim()))
        .filter((entry) => Number.isFinite(entry)),
    ),
  );
};

/**
 * Normalises an audience value that arrived from a request body into the exact
 * shape persisted on the document. Unknown target types collapse to `ALL` so a
 * malformed request can never silently widen access to a subset audience.
 */
export function normalizeAudienceInput(input) {
  const raw = input && typeof input === "object" ? input : {};
  const targetType = AUDIENCE_TARGET_TYPES.includes(raw.targetType)
    ? raw.targetType
    : "ALL";
  const rawTarget = raw.target && typeof raw.target === "object" ? raw.target : raw;

  if (targetType !== "SPECIFIC") {
    return { targetType, target: {} };
  }

  const sectionCodes = asStringArray(rawTarget.sectionCodes).map((code) =>
    code.toUpperCase(),
  );

  return {
    targetType,
    target: {
      allSections:
        sectionCodes.length === 0
          ? true
          : Boolean(rawTarget.allSections ?? false),
      programCodes: asStringArray(rawTarget.programCodes).map((code) =>
        code.toUpperCase(),
      ),
      batchYears: asStringArray(rawTarget.batchYears),
      semesters: asNumberArray(rawTarget.semesters),
      sectionCodes,
      userIds: asStringArray(rawTarget.userIds).filter((id) =>
        mongoose.Types.ObjectId.isValid(id),
      ),
      roleIds: asStringArray(rawTarget.roleIds),
    },
  };
}

/** True when a `SPECIFIC` audience carries no dimension at all. */
export function isEmptySpecificTarget(target) {
  if (!target) return true;
  const hasUsers = (target.userIds || []).length > 0;
  const hasRoles = (target.roleIds || []).length > 0;
  const hasCohort =
    (target.programCodes || []).length > 0 ||
    (target.batchYears || []).length > 0 ||
    (target.semesters || []).length > 0 ||
    (target.sectionCodes || []).length > 0;
  return !(hasUsers || hasRoles || hasCohort);
}

/** Human-readable summary used in audit trails and the UI target chip. */
export function describeAudience(audience) {
  if (!audience) return "Everyone";
  if (audience.targetType === "ALL") return "All students";
  if (audience.targetType === "STAFF") return "Staff only";
  const target = audience.target || {};
  const parts = [];
  if ((target.programCodes || []).length) {
    parts.push(`Programme ${target.programCodes.join(", ")}`);
  }
  if ((target.batchYears || []).length) {
    parts.push(`Batch ${target.batchYears.join(", ")}`);
  }
  if ((target.semesters || []).length) {
    parts.push(`Semester ${target.semesters.join(", ")}`);
  }
  if ((target.sectionCodes || []).length) {
    parts.push(`Sections ${target.sectionCodes.join(", ")}`);
  } else if (target.allSections !== false) {
    parts.push("All sections");
  }
  return parts.length ? parts.join(" · ") : "All students";
}

export const AudienceModelSchema = AudienceSchema;
