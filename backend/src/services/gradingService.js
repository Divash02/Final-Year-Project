import { InstitutionSetting } from "../models/index.js";
import { logAudit } from "../db.js";

export const DEFAULT_GRADING_SCALE = [
  { grade: "A+", minimum: 90, maximum: 100, gradePoint: 4.0, pass: true },
  { grade: "A", minimum: 75, maximum: 89.999, gradePoint: 3.6, pass: true },
  { grade: "B+", minimum: 65, maximum: 74.999, gradePoint: 3.2, pass: true },
  { grade: "B", minimum: 55, maximum: 64.999, gradePoint: 2.8, pass: true },
  { grade: "C+", minimum: 50, maximum: 54.999, gradePoint: 2.4, pass: true },
  { grade: "C", minimum: 40, maximum: 49.999, gradePoint: 2.0, pass: true },
  { grade: "F", minimum: 0, maximum: 39.999, gradePoint: 0.0, pass: false },
];

export const DEFAULT_PASS_PERCENT = 40;

let _cachedScale = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Normalizes a single grading band to the canonical shape:
 * { grade, minimum, maximum, gradePoint, pass }.
 * Legacy bands persisted with minPercentage/maxPercentage are supported.
 */
function normalizeBand(band) {
  if (!band || typeof band !== "object") return null;

  const minimum = Number(band.minimum ?? band.minPercentage);
  const maximum = Number(band.maximum ?? band.maxPercentage);
  if (Number.isNaN(minimum) || Number.isNaN(maximum)) return null;

  const gradePoint =
    band.gradePoint != null && !Number.isNaN(Number(band.gradePoint))
      ? Number(band.gradePoint)
      : 0;

  return {
    grade: band.grade || "F",
    minimum,
    maximum,
    gradePoint,
    pass:
      band.pass != null ? Boolean(band.pass) : minimum >= DEFAULT_PASS_PERCENT,
    // Legacy aliases kept for consumers that still read min/maxPercentage.
    minPercentage: minimum,
    maxPercentage: maximum,
  };
}

/**
 * Normalizes a grading scale, preserving band order and falling back to the
 * default scale when the payload is empty or unusable.
 */
export function normalizeGradingScale(raw) {
  if (!Array.isArray(raw)) return normalizeGradingScale(DEFAULT_GRADING_SCALE);
  const bands = raw.map(normalizeBand).filter(Boolean);
  return bands.length > 0 ? bands : normalizeGradingScale(DEFAULT_GRADING_SCALE);
}

/**
 * Synchronous accessor for the active grading scale.
 * Returns the cached (institution configured) scale when available,
 * otherwise the default scale. Use loadGradingScale() when a fresh
 * database read is required.
 */
export function getGradingScale() {
  return _cachedScale || normalizeGradingScale(DEFAULT_GRADING_SCALE);
}

export async function loadGradingScale() {
  const now = Date.now();
  if (_cachedScale && now - _cachedAt < CACHE_TTL_MS) {
    return _cachedScale;
  }

  const setting = await InstitutionSetting.findOne({
    settingKey: "grading.scale",
  });

  let scale = normalizeGradingScale(DEFAULT_GRADING_SCALE);
  if (setting && setting.settingValue) {
    try {
      const parsed = JSON.parse(setting.settingValue);
      if (Array.isArray(parsed) && parsed.length > 0) {
        scale = normalizeGradingScale(parsed);
      }
    } catch {
      // Malformed JSON - keep default
    }
  }

  _cachedScale = scale;
  _cachedAt = now;
  return scale;
}

export async function saveGradingScale(scale, userId) {
  _cachedScale = null;

  const normalized = normalizeGradingScale(scale);
  const json = JSON.stringify(normalized);
  const existing = await InstitutionSetting.findOne({
    settingKey: "grading.scale",
  });

  if (existing) {
    existing.settingValue = json;
    existing.updatedByUser = userId || null;
    await existing.save();
  } else {
    await InstitutionSetting.create({
      settingKey: "grading.scale",
      settingValue: json,
      updatedByUser: userId || null,
    });
  }

  await logAudit({
    userId: userId || null,
    action: "GRADING_SCALE_UPDATED",
    module: "institution",
    resource: "InstitutionSetting",
    resourceId: "grading.scale",
    details: `Grading scale updated with ${normalized.length} bands.`,
  });

  return normalized;
}

export function calculatePercentage(marksObtained, totalMarks) {
  if (!totalMarks || totalMarks <= 0) return 0;
  const pct = (Number(marksObtained) / Number(totalMarks)) * 100;
  return Math.min(100, Math.max(0, pct));
}

export async function calculateGrade(percentage, totalMarks) {
  const scale = await loadGradingScale();
  const pct = totalMarks
    ? calculatePercentage(percentage, totalMarks)
    : Number(percentage);

  const band =
    scale.find((b) => pct >= b.minimum && pct <= b.maximum) ||
    scale[scale.length - 1];

  return {
    letter: band.grade,
    point: band.gradePoint,
    pass: band.pass,
    percentage: pct,
  };
}

export function isPassing(marksObtained, totalMarks, passMarks) {
  const passThreshold = passMarks != null ? passMarks : DEFAULT_PASS_PERCENT;
  return Number(marksObtained) >= passThreshold;
}

export function calculateWeightedGPA(resultItems) {
  const valid = resultItems.filter(
    (r) =>
      r.gradePoint != null &&
      r.credits != null &&
      r.credits > 0 &&
      !Number.isNaN(Number(r.gradePoint)) &&
      !Number.isNaN(Number(r.credits))
  );

  if (valid.length === 0) return 0;

  const totalPoints = valid.reduce(
    (sum, r) => sum + Number(r.gradePoint) * Number(r.credits),
    0
  );
  const totalCredits = valid.reduce((sum, r) => sum + Number(r.credits), 0);

  if (totalCredits === 0) return 0;
  return totalPoints / totalCredits;
}

export function validateMarks(marksObtained, maxMarks) {
  const num = Number(marksObtained);

  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return { valid: false, error: "Marks must be a valid number." };
  }

  if (num < 0) {
    return { valid: false, error: "Marks cannot be negative." };
  }

  if (maxMarks != null && num > maxMarks) {
    return {
      valid: false,
      error: `Marks cannot exceed the maximum of ${maxMarks}.`,
    };
  }

  return { valid: true, error: null };
}

export async function calculateAuthoritativeMarksheetRow({
  subjects,
  marksMap = {},
  isAbsentCandidate = false,
}) {
  const scale = await loadGradingScale();
  let hasIncomplete = false;
  let hasAbsent = isAbsentCandidate;
  let hasSubjectFailure = false;
  let totalObtained = 0;
  let totalPossible = 0;
  const evaluatedSubjects = [];

  for (const subject of subjects) {
    const rawVal = marksMap[subject.code] ?? marksMap[subject._id] ?? null;
    const maxMark = Number(subject.totalMarks || 100);
    const passMark = Number(subject.passMarks || 40);
    totalPossible += maxMark;

    if (
      isAbsentCandidate ||
      rawVal === "AB" ||
      rawVal === "ABS" ||
      rawVal === "ABSENT" ||
      rawVal === -1
    ) {
      hasAbsent = true;
      evaluatedSubjects.push({
        course: subject.course || null,
        code: subject.code,
        name: subject.name,
        marksObtained: null,
        totalMarks: maxMark,
        passMarks: passMark,
        credits: subject.credits || 3,
        isAbsent: true,
        status: "ABSENT",
        grade: "ABS",
        gradePoint: null,
      });
      continue;
    }

    if (
      rawVal === null ||
      rawVal === undefined ||
      rawVal === "" ||
      rawVal === "-" ||
      rawVal === "—"
    ) {
      hasIncomplete = true;
      evaluatedSubjects.push({
        course: subject.course || null,
        code: subject.code,
        name: subject.name,
        marksObtained: null,
        totalMarks: maxMark,
        passMarks: passMark,
        credits: subject.credits || 3,
        isAbsent: false,
        status: "INCOMPLETE",
        grade: "—",
        gradePoint: null,
      });
      continue;
    }

    const marksNum = Number(rawVal);
    if (Number.isNaN(marksNum) || marksNum < 0 || marksNum > maxMark) {
      return {
        valid: false,
        error: `Invalid mark "${rawVal}" for ${subject.code}. Must be 0-${maxMark}.`,
      };
    }

    const isPass = marksNum >= passMark;
    if (!isPass) {
      hasSubjectFailure = true;
    }

    totalObtained += marksNum;
    const subjPct = calculatePercentage(marksNum, maxMark);
    const band =
      scale.find((b) => subjPct >= b.minimum && subjPct <= b.maximum) ||
      scale[scale.length - 1];

    evaluatedSubjects.push({
      course: subject.course || null,
      code: subject.code,
      name: subject.name,
      marksObtained: marksNum,
      totalMarks: maxMark,
      passMarks: passMark,
      credits: subject.credits || 3,
      isAbsent: false,
      status: isPass ? "PASS" : "FAIL",
      grade: band.grade,
      gradePoint: band.gradePoint,
    });
  }

  if (hasIncomplete) {
    return {
      valid: true,
      isIncomplete: true,
      isAbsent: false,
      totalMarksObtained: null,
      totalMarksPossible: totalPossible,
      percentage: null,
      grade: "—",
      gradePoint: null,
      status: "INCOMPLETE",
      subjectMarks: evaluatedSubjects,
    };
  }

  if (hasAbsent) {
    return {
      valid: true,
      isIncomplete: false,
      isAbsent: true,
      totalMarksObtained: null,
      totalMarksPossible: totalPossible,
      percentage: null,
      grade: "ABS",
      gradePoint: null,
      status: "ABSENT",
      subjectMarks: evaluatedSubjects,
    };
  }

  const overallPercentage = Number(
    calculatePercentage(totalObtained, totalPossible).toFixed(2)
  );

  let overallGrade = "F";
  let overallGradePoint = 0.0;
  let overallStatus = "PASSED";

  if (hasSubjectFailure) {
    overallStatus = "FAILED";
    overallGrade = "F";
    overallGradePoint = 0.0;
  } else {
    const band =
      scale.find(
        (b) => overallPercentage >= b.minimum && overallPercentage <= b.maximum
      ) || scale[scale.length - 1];
    overallGrade = band.grade;
    overallGradePoint = band.gradePoint;
    overallStatus = "PASSED";
  }

  return {
    valid: true,
    isIncomplete: false,
    isAbsent: false,
    totalMarksObtained: totalObtained,
    totalMarksPossible: totalPossible,
    percentage: overallPercentage,
    grade: overallGrade,
    gradePoint: overallGradePoint,
    status: overallStatus,
    subjectMarks: evaluatedSubjects,
  };
}
