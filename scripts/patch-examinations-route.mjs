import fs from "fs";

let code = fs.readFileSync("backend/src/routes/examinations.js", "utf8");

// 1. Add StudentAssessmentMark to imports if not present
if (!code.includes("StudentAssessmentMark")) {
  code = code.replace(/InstitutionSetting,(\r?\n)/, "InstitutionSetting,$1  StudentAssessmentMark,$1");
}

// 2. Add StudentAssessmentMark fallback loading in GET /api/exams/:id/results
const targetCand = "const formatted = candidates.map((c, idx) => {";
if (code.includes(targetCand) && !code.includes("assessmentMarksByStudent")) {
  const insertCode = `
        const assessmentMarks = await StudentAssessmentMark.find({
          academicYear: exam.academicYear,
          semester: exam.semester,
        });
        const assessmentMarksByStudent = new Map();
        for (const am of assessmentMarks) {
          const key = am.student.toString();
          if (!assessmentMarksByStudent.has(key)) assessmentMarksByStudent.set(key, {});
          assessmentMarksByStudent.get(key)[am.courseCode] = am;
        }

        `;
  code = code.replace(targetCand, insertCode + targetCand);
}

// 3. In the subjects loop fallback, check assessmentMarksByStudent
const fallbackPattern = /for\s*\(\s*const\s+s\s+of\s+subjects\s*\)\s*\{\s*subjectMarksObj\[s\.code\]\s*=\s*null;\s*subjectStatusObj\[s\.code\]\s*=\s*["']INCOMPLETE["'];\s*\}/;

const replacementLogic = `for (const s of subjects) {
              const am = assessmentMarksByStudent?.get(candIdStr)?.[s.code];
              if (am && am.totalMarksObtained != null) {
                subjectMarksObj[s.code] = am.totalMarksObtained;
                subjectStatusObj[s.code] = am.resultStatus === "PASS" ? "PASS" : "FAIL";
              } else {
                subjectMarksObj[s.code] = null;
                subjectStatusObj[s.code] = "INCOMPLETE";
              }
            }`;

if (fallbackPattern.test(code)) {
  code = code.replace(fallbackPattern, replacementLogic);
}

fs.writeFileSync("backend/src/routes/examinations.js", code, "utf8");
console.log("Successfully patched examinations.js with StudentAssessmentMark lookup");
