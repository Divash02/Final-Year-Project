import fs from "fs";
import path from "path";

const filePath = path.resolve("./frontend/src/components/modules/ExaminationWorkspaceView.tsx");
let content = fs.readFileSync(filePath, "utf8");

// 1. Add import
if (!content.includes('import { OfficialMarksheetView }')) {
  const importAnchor = 'import { FullExamRecord,';
  const importIndex = content.indexOf(importAnchor);
  if (importIndex !== -1) {
    content =
      content.substring(0, importIndex) +
      'import { OfficialMarksheetView } from "./exam/OfficialMarksheetView";\n' +
      content.substring(importIndex);
  }
}

// 2. Simplify openResults
const openResultsStart = "  const openResults = async (exam: FullExamRecord) => {";
const openResultsEnd = "  const handleSaveMarks = async () => {";
const oStart = content.indexOf(openResultsStart);
const oEnd = content.indexOf(openResultsEnd);

if (oStart !== -1 && oEnd !== -1) {
  const newOpenResults = `  const openResults = async (exam: FullExamRecord) => {
    setSelectedExam(exam);
    setResultsExamId(exam.id);
    setActiveTab("results");
  };\n\n`;
  content = content.substring(0, oStart) + newOpenResults + content.substring(oEnd);
}

// 3. Replace results tab rendering
const tabResultsMarker = '{activeTab === "results" && !showMarksheet && (';
const tabAuditMarker = '{/* TAB 9: AUDIT TRAIL (Section 30) */}';

const tStart = content.indexOf(tabResultsMarker);
const tEnd = content.indexOf(tabAuditMarker);

if (tStart !== -1 && tEnd !== -1) {
  const commentStart = content.lastIndexOf("{/* ------------------------------------------------------------- */", tStart);
  const actualStart = commentStart !== -1 ? commentStart : tStart;

  const newResultsSection = `{/* ------------------------------------------------------------- */}
      {/* TAB 8: OFFICIAL UNIVERSITY EXAMINATION MARKSHEET */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "results" && (
        resultsExamId ? (
          <OfficialMarksheetView
            examId={resultsExamId}
            onBack={() => setActiveTab("schedule")}
            userPermissions={permissions}
            onRequestReloadMaster={loadMasterData}
            showToast={toast}
            apiRequest={apiRequest}
          />
        ) : (
          <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <FontAwesomeIcon icon={faAward} className="text-2xl" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif text-lg font-bold text-slate-900">Official Examination Marksheet System</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Select an examination from the schedule or choose one from the list below to begin mark entry, live verification, and official transcript generation.
              </p>
            </div>

            {exams.length > 0 && (
              <div className="mx-auto max-w-sm pt-2">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const found = exams.find((x) => x.id === e.target.value);
                    if (found) {
                      void openResults(found);
                    }
                  }}
                  className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-800 focus:outline-none shadow-xs"
                >
                  <option value="" disabled>-- Select an Examination to Enter/View Results --</option>
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} ({ex.program} Sem {ex.semester}) · {ex.academicYear}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )
      )}

      `;

  content = content.substring(0, actualStart) + newResultsSection + content.substring(tEnd);
}

fs.writeFileSync(filePath, content, "utf8");
console.log("Successfully patched ExaminationWorkspaceView.tsx!");
