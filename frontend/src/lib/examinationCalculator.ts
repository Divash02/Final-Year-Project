/**
 * CollegeOS Centralized Examination Calculation Service
 *
 * Provides authoritative live marksheet calculations for the examination department.
 * Mirrors the backend grading service logic precisely.
 */

export interface GradeBand {
  grade: string;
  minimum: number;
  maximum: number;
  gradePoint: number;
  pass: boolean;
}

export interface ExamSubject {
  code: string;
  name: string;
  totalMarks?: number;
  passMarks?: number;
  credits?: number;
}

export interface StudentMarksheetRow {
  id: string;
  sn: number;
  student_id: string;
  student_name: string;
  roll_number: string;
  symbol_number: string;
  section: string;
  program?: string;
  semester?: number;
  subject_marks: Record<string, number | string | null>;
  subject_status?: Record<string, "PASS" | "FAIL" | "ABSENT" | "INCOMPLETE">;
  is_absent: boolean;
  is_incomplete: boolean;
  total_marks: number | null;
  total_possible: number;
  percentage: number | null;
  grade: string;
  grade_point: number | null;
  status: "PASSED" | "FAILED" | "INCOMPLETE" | "ABSENT" | "PENDING";
  workflow_status: string;
  remarks?: string;
}

export interface ExamSummary {
  totalStudents: number;
  totalSubjects: number;
  totalPossibleMarks: number;
  completed: number;
  incomplete: number;
  passed: number;
  failed: number;
  absent: number;
  averagePercentage: number;
}

export const DEFAULT_GRADING_SCALE: GradeBand[] = [
  { grade: "A+", minimum: 90, maximum: 100, gradePoint: 4.0, pass: true },
  { grade: "A", minimum: 75, maximum: 89.999, gradePoint: 3.6, pass: true },
  { grade: "B+", minimum: 65, maximum: 74.999, gradePoint: 3.2, pass: true },
  { grade: "B", minimum: 55, maximum: 64.999, gradePoint: 2.8, pass: true },
  { grade: "C+", minimum: 50, maximum: 54.999, gradePoint: 2.4, pass: true },
  { grade: "C", minimum: 40, maximum: 49.999, gradePoint: 2.0, pass: true },
  { grade: "F", minimum: 0, maximum: 39.999, gradePoint: 0.0, pass: false },
];

/**
 * Calculates a single student row with complete institutional checks.
 */
export function calculateStudentRow(
  subjects: ExamSubject[],
  subjectMarks: Record<string, number | string | null | undefined>,
  isAbsentCandidate = false,
  scale: GradeBand[] = DEFAULT_GRADING_SCALE
): {
  is_incomplete: boolean;
  is_absent: boolean;
  subject_status: Record<string, "PASS" | "FAIL" | "ABSENT" | "INCOMPLETE">;
  total_marks: number | null;
  total_possible: number;
  percentage: number | null;
  grade: string;
  grade_point: number | null;
  status: "PASSED" | "FAILED" | "INCOMPLETE" | "ABSENT" | "PENDING";
} {
  let hasIncomplete = false;
  let hasAbsent = isAbsentCandidate;
  let hasSubjectFailure = false;
  let totalObtained = 0;
  let totalPossible = 0;
  const subjectStatus: Record<string, "PASS" | "FAIL" | "ABSENT" | "INCOMPLETE"> = {};

  for (const subject of subjects) {
    const maxMark = Number(subject.totalMarks || 100);
    const passMark = Number(subject.passMarks || 40);
    totalPossible += maxMark;

    const rawVal = subjectMarks[subject.code];

    // Absent check
    if (
      isAbsentCandidate ||
      rawVal === "AB" ||
      rawVal === "ABS" ||
      rawVal === "ABSENT" ||
      rawVal === "ab" ||
      rawVal === "abs" ||
      rawVal === -1
    ) {
      hasAbsent = true;
      subjectStatus[subject.code] = "ABSENT";
      continue;
    }

    // Blank / Incomplete check
    if (
      rawVal === null ||
      rawVal === undefined ||
      rawVal === "" ||
      rawVal === "-" ||
      rawVal === "—"
    ) {
      hasIncomplete = true;
      subjectStatus[subject.code] = "INCOMPLETE";
      continue;
    }

    const marksNum = Number(rawVal);
    if (Number.isNaN(marksNum) || marksNum < 0 || marksNum > maxMark) {
      // Invalid input marks
      hasIncomplete = true;
      subjectStatus[subject.code] = "INCOMPLETE";
      continue;
    }

    const isPass = marksNum >= passMark;
    if (!isPass) {
      hasSubjectFailure = true;
      subjectStatus[subject.code] = "FAIL";
    } else {
      subjectStatus[subject.code] = "PASS";
    }

    totalObtained += marksNum;
  }

  // Section 14: Incomplete Student
  if (hasIncomplete) {
    return {
      is_incomplete: true,
      is_absent: false,
      subject_status: subjectStatus,
      total_marks: null,
      total_possible: totalPossible,
      percentage: null,
      grade: "—",
      grade_point: null,
      status: "INCOMPLETE",
    };
  }

  // Section 15: Absent Student
  if (hasAbsent) {
    return {
      is_incomplete: false,
      is_absent: true,
      subject_status: subjectStatus,
      total_marks: null,
      total_possible: totalPossible,
      percentage: null,
      grade: "ABS",
      grade_point: null,
      status: "ABSENT",
    };
  }

  // Live calculation of Percentage (Section 9, 32)
  const pct = totalPossible > 0 ? (totalObtained / totalPossible) * 100 : 0;
  const percentage = Number(pct.toFixed(2));

  let grade = "F";
  let gradePoint = 0.0;
  let status: "PASSED" | "FAILED" = "PASSED";

  if (hasSubjectFailure) {
    // Failed in one or more subjects
    status = "FAILED";
    grade = "F";
    gradePoint = 0.0;
  } else {
    status = "PASSED";
    const band =
      scale.find((b) => pct >= b.minimum && pct <= b.maximum) ||
      scale[scale.length - 1];
    grade = band.grade;
    gradePoint = band.gradePoint;
  }

  return {
    is_incomplete: false,
    is_absent: false,
    subject_status: subjectStatus,
    total_marks: totalObtained,
    total_possible: totalPossible,
    percentage,
    grade,
    grade_point: gradePoint,
    status,
  };
}

/**
 * Calculates overall live examination summary.
 */
export function calculateExaminationSummary(
  rows: StudentMarksheetRow[],
  subjects: ExamSubject[]
): ExamSummary {
  const totalStudents = rows.length;
  const totalSubjects = subjects.length;
  const totalPossibleMarks = subjects.reduce(
    (sum, s) => sum + (Number(s.totalMarks) || 100),
    0
  );

  let completed = 0;
  let incomplete = 0;
  let absent = 0;
  let passed = 0;
  let failed = 0;
  const percentages: number[] = [];

  for (const r of rows) {
    if (r.is_absent || r.status === "ABSENT") {
      absent++;
    } else if (r.is_incomplete || r.status === "INCOMPLETE") {
      incomplete++;
    } else if (r.total_marks != null) {
      completed++;
      if (r.status === "PASSED") passed++;
      else if (r.status === "FAILED") failed++;

      if (r.percentage != null) {
        percentages.push(r.percentage);
      }
    } else {
      incomplete++;
    }
  }

  const averagePercentage =
    percentages.length > 0
      ? Number(
          (
            percentages.reduce((a, b) => a + b, 0) / percentages.length
          ).toFixed(2)
        )
      : 0.0;

  return {
    totalStudents,
    totalSubjects,
    totalPossibleMarks,
    completed,
    incomplete,
    passed,
    failed,
    absent,
    averagePercentage,
  };
}

/**
 * Parses tab/newline separated paste data into coordinates.
 */
export function parsePastedMarksMatrix(
  pastedText: string,
  startRowIdx: number,
  startSubjIdx: number,
  studentRows: StudentMarksheetRow[],
  subjects: ExamSubject[]
): {
  updatedRows: StudentMarksheetRow[];
  modifiedCount: number;
} {
  const lines = pastedText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.length > 0);

  if (lines.length === 0) return { updatedRows: studentRows, modifiedCount: 0 };

  const updatedRows = [...studentRows];
  let modifiedCount = 0;

  for (let r = 0; r < lines.length; r++) {
    const rowIdx = startRowIdx + r;
    if (rowIdx >= updatedRows.length) break;

    const values = lines[r].split("\t");
    const currentRow = { ...updatedRows[rowIdx] };
    const newSubjectMarks = { ...currentRow.subject_marks };

    for (let c = 0; c < values.length; c++) {
      const subjIdx = startSubjIdx + c;
      if (subjIdx >= subjects.length) break;

      const subject = subjects[subjIdx];
      const trimmed = values[c].trim();

      if (trimmed === "") {
        newSubjectMarks[subject.code] = null;
      } else if (
        trimmed.toUpperCase() === "AB" ||
        trimmed.toUpperCase() === "ABS" ||
        trimmed.toUpperCase() === "ABSENT"
      ) {
        newSubjectMarks[subject.code] = "AB";
      } else {
        const num = Number(trimmed);
        if (!Number.isNaN(num) && num >= 0 && num <= (subject.totalMarks || 100)) {
          newSubjectMarks[subject.code] = num;
        }
      }
      modifiedCount++;
    }

    currentRow.subject_marks = newSubjectMarks;
    const calc = calculateStudentRow(subjects, newSubjectMarks, currentRow.is_absent);
    Object.assign(currentRow, calc);
    updatedRows[rowIdx] = currentRow;
  }

  return { updatedRows, modifiedCount };
}
