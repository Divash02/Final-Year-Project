import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFloppyDisk,
  faEye,
  faPrint,
  faPaperPlane,
  faCheckDouble,
  faLock,
  faRotateLeft,
  faCircleCheck,
  faClock,
  faTriangleExclamation,
  faFileLines,
  faPenToSquare,
  faSpinner,
  faSearch,
  faArrowLeft,
} from "@fortawesome/free-solid-svg-icons";
import {
  ExamSubject,
  StudentMarksheetRow,
  ExamSummary,
  calculateStudentRow,
  calculateExaminationSummary,
  parsePastedMarksMatrix,
  DEFAULT_GRADING_SCALE,
  GradeBand,
} from "../../../lib/examinationCalculator";

export interface OfficialMarksheetViewProps {
  examId: string;
  onBack?: () => void;
  userPermissions?: Set<string>;
  onRequestReloadMaster?: () => Promise<void>;
  showToast: (opts: { variant: "success" | "error" | "info" | "warning"; message: string }) => void;
  apiRequest: <T>(url: string, options?: RequestInit) => Promise<T>;
}

export const OfficialMarksheetView: React.FC<OfficialMarksheetViewProps> = ({
  examId,
  onBack,
  userPermissions = new Set(),
  onRequestReloadMaster,
  showToast,
  apiRequest,
}) => {
  // View mode: ENTRY (View A) vs PREVIEW (View B: Official Document / Print Preview)
  const [viewMode, setViewMode] = useState<"ENTRY" | "PREVIEW">("ENTRY");

  // Loading & busy state
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [actionBusy, setActionBusy] = useState<boolean>(false);

  // Marksheet core dataset
  const [examMeta, setExamMeta] = useState<any>(null);
  const [institution, setInstitution] = useState<any>({
    name: "TECHSPIRE COLLEGE",
    department: "OFFICIAL EXAMINATION DEPARTMENT",
    affiliation: "Affiliated to University · Office of the Controller of Examinations",
    address: "Kathmandu, Nepal",
    phone: "+977-1-4782000",
    email: "exam@techspire.edu.np",
    logoUrl: "/images/techspirecollege.png",
    watermarkUrl: "/images/techspirecollege.png",
  });
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [studentRows, setStudentRows] = useState<StudentMarksheetRow[]>([]);
  const [gradingScale, setGradingScale] = useState<GradeBand[]>(DEFAULT_GRADING_SCALE);

  // Dirty tracking & last saved
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Workflow status
  const [workflowStatus, setWorkflowStatus] = useState<string>("DRAFT");

  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Confirmation modal state for sensitive actions (Publish, Revoke)
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    type: "PUBLISH" | "REVOKE" | "SUBMIT" | "VERIFY" | "FINALIZE" | null;
    remarks?: string;
  }>({ open: false, type: null });

  // Grid ref for keyboard navigation
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Permissions
  const canManage = userPermissions.has("exam.manageResults") || userPermissions.has("exams.results.modify");
  const canSubmit = userPermissions.has("exam.results.submit");
  const canVerify = userPermissions.has("exam.verifyResults") || userPermissions.has("exams.results.modify") || userPermissions.has("grade.verify");
  const canFinalize = userPermissions.has("exam.results.finalize");
  const canPublish = userPermissions.has("exam.publishResults") || userPermissions.has("exams.results.publish");
  const canRevoke = userPermissions.has("exam.results.revoke");

  // Determine if editing is allowed based on workflow state
  const isEditingLocked =
    workflowStatus === "FINALIZED" ||
    workflowStatus === "PUBLISHED" ||
    workflowStatus === "SUBMITTED" ||
    workflowStatus === "UNDER_VERIFICATION" ||
    workflowStatus === "VERIFIED";

  // Load results and subjects from backend
  const loadResults = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{
        exam: any;
        institution: any;
        results: any[];
        summary: any;
      }>(`/exams/${examId}/results`);

      if (data.exam) {
        setExamMeta(data.exam);
        setWorkflowStatus(data.exam.workflowStatus || data.exam.resultsStatus || "DRAFT");
        if (data.exam.subjects && data.exam.subjects.length > 0) {
          setSubjects(data.exam.subjects);
        }
      }
      if (data.institution) {
        setInstitution(data.institution);
      }

      // Convert results into StudentMarksheetRow
      const rows: StudentMarksheetRow[] = (data.results || []).map((r, idx) => ({
        id: r.id || `row_${idx}`,
        sn: r.sn || idx + 1,
        student_id: r.student_id,
        student_name: r.student_name,
        roll_number: r.roll_number || r.student_id,
        symbol_number: r.symbol_number || r.roll_number || r.student_id,
        section: r.section || "A",
        program: r.program,
        semester: r.semester,
        subject_marks: r.subject_marks || {},
        subject_status: r.subject_status || {},
        is_absent: r.is_absent || false,
        is_incomplete: r.is_incomplete ?? true,
        total_marks: r.total_marks,
        total_possible: r.total_possible || (data.exam?.totalMarks || 100),
        percentage: r.percentage,
        grade: r.grade || "—",
        grade_point: r.grade_point,
        status: r.status || "INCOMPLETE",
        workflow_status: r.workflow_status || "DRAFT",
        remarks: r.remarks || "",
      }));

      setStudentRows(rows);
      setIsDirty(false);
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

      // Fetch grading scale in parallel
      try {
        const scaleData = await apiRequest<{ scale: GradeBand[] }>("/exams/grading-scale");
        if (scaleData.scale && scaleData.scale.length > 0) {
          setGradingScale(scaleData.scale);
        }
      } catch {
        // Fallback to default scale
      }
    } catch (err: unknown) {
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to load examination marksheet.",
      });
    } finally {
      setLoading(false);
    }
  }, [examId, apiRequest, showToast]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  // Live Summary Calculation
  const liveSummary: ExamSummary = useMemo(() => {
    return calculateExaminationSummary(studentRows, subjects);
  }, [studentRows, subjects]);

  // Filtered rows for search
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return studentRows;
    const q = searchQuery.toLowerCase().trim();
    return studentRows.filter(
      (r) =>
        r.student_name.toLowerCase().includes(q) ||
        r.student_id.toLowerCase().includes(q) ||
        r.symbol_number.toLowerCase().includes(q)
    );
  }, [studentRows, searchQuery]);

  // Cell key helper
  const getCellKey = (rowIndex: number, subjIndex: number) => `cell_${rowIndex}_${subjIndex}`;

  // In-cell Change Handler with live instant recalculation
  const handleMarkChange = (
    rowIndex: number,
    subjectCode: string,
    rawVal: string
  ) => {
    if (isEditingLocked) return;

    setStudentRows((prev) => {
      const copy = [...prev];
      const target = { ...copy[rowIndex] };
      const newSubjectMarks = { ...target.subject_marks };

      if (rawVal === "" || rawVal === "-" || rawVal === "—") {
        newSubjectMarks[subjectCode] = null;
      } else if (
        rawVal.toUpperCase() === "AB" ||
        rawVal.toUpperCase() === "ABS" ||
        rawVal.toUpperCase() === "A"
      ) {
        newSubjectMarks[subjectCode] = "AB";
      } else {
        const num = Number(rawVal);
        const subj = subjects.find((s) => s.code === subjectCode);
        const max = subj?.totalMarks || 100;
        if (!Number.isNaN(num)) {
          if (num > max) {
            showToast({
              variant: "warning",
              message: `Mark cannot exceed maximum ${max} for ${subjectCode}.`,
            });
            return prev;
          }
          if (num < 0) {
            showToast({
              variant: "warning",
              message: "Mark cannot be negative.",
            });
            return prev;
          }
          newSubjectMarks[subjectCode] = num;
        } else {
          return prev;
        }
      }

      target.subject_marks = newSubjectMarks;
      // Live Instant Recalculation
      const calc = calculateStudentRow(subjects, newSubjectMarks, target.is_absent, gradingScale);
      target.is_incomplete = calc.is_incomplete;
      target.is_absent = calc.is_absent;
      target.subject_status = calc.subject_status;
      target.total_marks = calc.total_marks;
      target.total_possible = calc.total_possible;
      target.percentage = calc.percentage;
      target.grade = calc.grade;
      target.grade_point = calc.grade_point;
      target.status = calc.status;

      copy[rowIndex] = target;
      return copy;
    });

    setIsDirty(true);
  };

  // Keyboard navigation
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    subjIndex: number
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Move down to next student for the same subject (standard university marksheet workflow)
      const nextKey = getCellKey(rowIndex + 1, subjIndex);
      const nextEl = inputRefs.current.get(nextKey);
      if (nextEl) {
        nextEl.focus();
        nextEl.select();
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextKey = getCellKey(rowIndex + 1, subjIndex);
      const nextEl = inputRefs.current.get(nextKey);
      if (nextEl) {
        nextEl.focus();
        nextEl.select();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rowIndex > 0) {
        const prevKey = getCellKey(rowIndex - 1, subjIndex);
        const prevEl = inputRefs.current.get(prevKey);
        if (prevEl) {
          prevEl.focus();
          prevEl.select();
        }
      }
    } else if (e.key === "ArrowRight") {
      const input = e.currentTarget;
      if (input.selectionStart === input.value.length) {
        const nextSubjKey = getCellKey(rowIndex, subjIndex + 1);
        const nextSubjEl = inputRefs.current.get(nextSubjKey);
        if (nextSubjEl) {
          e.preventDefault();
          nextSubjEl.focus();
          nextSubjEl.select();
        }
      }
    } else if (e.key === "ArrowLeft") {
      const input = e.currentTarget;
      if (input.selectionStart === 0 && subjIndex > 0) {
        const prevSubjKey = getCellKey(rowIndex, subjIndex - 1);
        const prevSubjEl = inputRefs.current.get(prevSubjKey);
        if (prevSubjEl) {
          e.preventDefault();
          prevSubjEl.focus();
          prevSubjEl.select();
        }
      }
    }
  };

  // Multi-cell matrix pasting from Excel / Google Sheets
  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startRowIdx: number,
    startSubjIdx: number
  ) => {
    if (isEditingLocked) return;

    const pastedText = e.clipboardData.getData("text");
    if (!pastedText || (!pastedText.includes("\t") && !pastedText.includes("\n"))) {
      // Single value paste - let default input handle
      return;
    }

    e.preventDefault();
    const result = parsePastedMarksMatrix(
      pastedText,
      startRowIdx,
      startSubjIdx,
      studentRows,
      subjects
    );

    setStudentRows(result.updatedRows);
    setIsDirty(true);
    showToast({
      variant: "success",
      message: `Pasted marks across ${result.modifiedCount} cell(s). Live calculations updated.`,
    });
  };

  // Save Draft Action
  const handleSaveDraft = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = studentRows.map((r) => ({
        studentId: r.student_id,
        subjectMarks: r.subject_marks,
        isAbsent: r.is_absent,
        remarks: r.remarks || "",
      }));

      const res = await apiRequest<{
        success: boolean;
        savedCount: number;
        errors: string[];
      }>(`/exams/${examId}/results`, {
        method: "POST",
        body: JSON.stringify({ marks: payload }),
      });

      if (res.errors && res.errors.length > 0) {
        showToast({
          variant: "warning",
          message: `Saved ${res.savedCount} candidates with ${res.errors.length} warnings.`,
        });
      } else {
        showToast({
          variant: "success",
          message: `Statement of Marks draft saved for ${res.savedCount} candidate(s).`,
        });
      }

      setIsDirty(false);
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      if (onRequestReloadMaster) await onRequestReloadMaster();
    } catch (err: unknown) {
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to persist draft marks.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Workflow actions
  const handleSubmitForVerification = async () => {
    if (isDirty) {
      await handleSaveDraft();
    }
    setActionBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/exams/${examId}/results/submit`,
        { method: "POST" }
      );
      showToast({ variant: "success", message: res.message || "Results submitted for verification." });
      setWorkflowStatus("SUBMITTED");
      await loadResults();
      if (onRequestReloadMaster) await onRequestReloadMaster();
    } catch (err: unknown) {
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to submit results.",
      });
    } finally {
      setActionBusy(false);
      setConfirmModal({ open: false, type: null });
    }
  };

  const handleVerify = async () => {
    setActionBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/exams/${examId}/results/verify`,
        { method: "POST", body: JSON.stringify({ remarks: confirmModal.remarks || "Results verified." }) }
      );
      showToast({ variant: "success", message: res.message || "Results verified." });
      setWorkflowStatus("VERIFIED");
      await loadResults();
      if (onRequestReloadMaster) await onRequestReloadMaster();
    } catch (err: unknown) {
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to verify results.",
      });
    } finally {
      setActionBusy(false);
      setConfirmModal({ open: false, type: null });
    }
  };

  const handleFinalize = async () => {
    setActionBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/exams/${examId}/results/finalize`,
        { method: "POST" }
      );
      showToast({ variant: "success", message: res.message || "Results finalized and locked." });
      setWorkflowStatus("FINALIZED");
      await loadResults();
      if (onRequestReloadMaster) await onRequestReloadMaster();
    } catch (err: unknown) {
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to finalize results.",
      });
    } finally {
      setActionBusy(false);
      setConfirmModal({ open: false, type: null });
    }
  };

  const handlePublish = async () => {
    setActionBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/exams/${examId}/results/publish`,
        { method: "POST" }
      );
      showToast({ variant: "success", message: res.message || "Results officially published to students." });
      setWorkflowStatus("PUBLISHED");
      await loadResults();
      if (onRequestReloadMaster) await onRequestReloadMaster();
    } catch (err: unknown) {
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to publish results.",
      });
    } finally {
      setActionBusy(false);
      setConfirmModal({ open: false, type: null });
    }
  };

  const handleRevoke = async () => {
    setActionBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/exams/${examId}/results/revoke`,
        { method: "POST", body: JSON.stringify({ remarks: confirmModal.remarks || "Results revoked for correction." }) }
      );
      showToast({ variant: "warning", message: res.message || "Results revoked for correction." });
      setWorkflowStatus("CORRECTION_REQUIRED");
      await loadResults();
      if (onRequestReloadMaster) await onRequestReloadMaster();
    } catch (err: unknown) {
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to revoke results.",
      });
    } finally {
      setActionBusy(false);
      setConfirmModal({ open: false, type: null });
    }
  };

  // Print document
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 text-slate-500">
        <FontAwesomeIcon icon={faSpinner} className="fa-spin text-3xl text-slate-400" />
        <p className="text-sm font-medium tracking-wide">Loading official examination roster &amp; marksheet...</p>
      </div>
    );
  }

  return (
    <div className="marksheet-wrapper space-y-5">
      {/* Print-specific style overrides */}
      <style>{`
        @media print {
          body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 11pt !important;
            color: #000 !important;
          }
          nav, aside, header, .no-print, .marksheet-action-bar, .marksheet-controls {
            display: none !important;
          }
          .marksheet-document-container {
            border: 2px solid #000 !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 12mm !important;
            width: 100% !important;
            max-width: 100% !important;
            page-break-after: avoid;
          }
          .marksheet-watermark {
            opacity: 0.055 !important;
            display: block !important;
          }
          table {
            page-break-inside: auto;
            width: 100% !important;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
          .sticky {
            position: static !important;
          }
        }
      `}</style>

      {/* TOP WORKSPACE NAVIGATION & ACTION BAR */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-5 py-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              <span>Back to Schedule</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">View Mode:</span>
            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("ENTRY")}
                className={`cursor-pointer rounded-md px-3 py-1 text-xs font-bold transition-all ${
                  viewMode === "ENTRY"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FontAwesomeIcon icon={faPenToSquare} className="mr-1.5" />
                Mark Entry Marksheet
              </button>
              <button
                type="button"
                onClick={() => setViewMode("PREVIEW")}
                className={`cursor-pointer rounded-md px-3 py-1 text-xs font-bold transition-all ${
                  viewMode === "PREVIEW"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FontAwesomeIcon icon={faEye} className="mr-1.5" />
                Official Marksheet / Print Preview
              </button>
            </div>
          </div>
        </div>

        {/* STATUS & ACTIONS */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1 text-xs">
            {isDirty ? (
              <span className="flex items-center gap-1.5 font-bold text-amber-600">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                UNSAVED CHANGES
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-bold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                SAVED
              </span>
            )}
            {lastSavedAt && (
              <span className="text-slate-400 font-mono text-[11px]">({lastSavedAt})</span>
            )}
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-slate-700 uppercase tracking-wider">
              {workflowStatus}
            </span>
          </div>

          {/* Action Buttons based on workflow status */}
          {viewMode === "ENTRY" && !isEditingLocked && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveDraft()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-xs"
            >
              <FontAwesomeIcon icon={faFloppyDisk} />
              <span>{saving ? "Saving..." : "Save Draft"}</span>
            </button>
          )}

          {/* Workflow Transitions */}
          {(workflowStatus === "DRAFT" || workflowStatus === "REVISED" || workflowStatus === "CORRECTION_REQUIRED") && (
            <>
              {canSubmit && (
                <button
                  type="button"
                  disabled={actionBusy || saving}
                  onClick={() => setConfirmModal({ open: true, type: "SUBMIT" })}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100 transition-colors"
                >
                  <FontAwesomeIcon icon={faPaperPlane} />
                  <span>Submit for Verification</span>
                </button>
              )}
            </>
          )}

          {(workflowStatus === "SUBMITTED" || workflowStatus === "UNDER_VERIFICATION") && (
            <>
              {canVerify && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => setConfirmModal({ open: true, type: "VERIFY" })}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors"
                >
                  <FontAwesomeIcon icon={faCheckDouble} />
                  <span>Verify Results</span>
                </button>
              )}
            </>
          )}

          {workflowStatus === "VERIFIED" && (
            <>
              {canFinalize && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => setConfirmModal({ open: true, type: "FINALIZE" })}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-900 hover:bg-purple-100 transition-colors"
                >
                  <FontAwesomeIcon icon={faLock} />
                  <span>Finalize Results</span>
                </button>
              )}
            </>
          )}

          {workflowStatus === "FINALIZED" && (
            <>
              {canPublish && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => setConfirmModal({ open: true, type: "PUBLISH" })}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-xs"
                >
                  <FontAwesomeIcon icon={faCircleCheck} />
                  <span>Publish to Students</span>
                </button>
              )}
            </>
          )}

          {workflowStatus === "PUBLISHED" && (
            <>
              {canRevoke && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => setConfirmModal({ open: true, type: "REVOKE" })}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 transition-colors"
                >
                  <FontAwesomeIcon icon={faRotateLeft} />
                  <span>Revoke &amp; Correct</span>
                </button>
              )}
            </>
          )}

          {/* Print Button */}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <FontAwesomeIcon icon={faPrint} />
            <span>Print Marksheet</span>
          </button>
        </div>
      </div>

      {/* SEARCH & BULK INSTRUCTIONS BAR (ENTRY MODE ONLY) */}
      {viewMode === "ENTRY" && (
        <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faSearch} className="text-slate-400" />
            <input
              type="text"
              placeholder="Search by student name or symbol number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="cursor-pointer text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
            <span className="text-slate-400">
              Showing {filteredRows.length} of {studentRows.length} candidates
            </span>
          </div>

          <div className="flex items-center gap-4 text-slate-500">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600">Enter</kbd>
              <span>Next candidate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600">Tab</kbd>
              <span>Next subject</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600">Ctrl+V</kbd>
              <span>Paste from Excel</span>
            </span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* THE OFFICIAL UNIVERSITY MARKSHEET CONTAINER */}
      {/* ========================================================================= */}
      <div className="marksheet-document-container relative overflow-hidden rounded-xl border-2 border-slate-800 bg-white p-7 shadow-md sm:p-10">
        {/* Subtle Institutional Inner Border Frame */}
        <div className="pointer-events-none absolute inset-2.5 rounded-lg border border-slate-300/80" />

        {/* ======================================================================= */}
        {/* WATERMARK: Large, Centered, Very Low Opacity Behind Content */}
        {/* ======================================================================= */}
        <div className="pointer-events-none select-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
          <img
            src={institution.watermarkUrl || "/images/techspirecollege.png"}
            alt="Institutional Watermark"
            className="marksheet-watermark w-[520px] max-w-[75%] opacity-[0.045] grayscale contrast-125 transition-opacity"
            onError={(e) => {
              // Fallback if image fails to load
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        {/* CONTENT (z-10 relative to remain above watermark) */}
        <div className="relative z-10 space-y-6">
          {/* ===================================================================== */}
          {/* 3. OFFICIAL HEADER */}
          {/* ===================================================================== */}
          <div className="text-center">
            {/* College Logo */}
            <div className="mb-2 flex justify-center">
              <img
                src={institution.logoUrl || "/images/techspirecollege.png"}
                alt={institution.name}
                className="h-16 w-auto object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>

            {/* Institution Name */}
            <h1 className="text-xl font-black uppercase tracking-widest text-slate-900 sm:text-2xl font-serif">
              {institution.name}
            </h1>

            {/* Examination Department */}
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 sm:text-sm">
              {institution.department}
            </h2>

            {/* Sub-header / Affiliation */}
            <p className="mt-0.5 text-[11px] text-slate-500 font-medium">
              {institution.affiliation} · {institution.address}
            </p>

            {/* Document Title: STATEMENT OF MARKS */}
            <div className="my-4 inline-block border-y-2 border-slate-900 px-8 py-1.5">
              <h3 className="text-base font-extrabold uppercase tracking-widest text-slate-950 sm:text-lg font-serif">
                STATEMENT OF MARKS
              </h3>
            </div>

            {/* Examination Metadata Grid */}
            <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-800">
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-6 text-left sm:grid-cols-4">
                <div>
                  <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px] block">
                    Examination
                  </span>
                  <span className="font-bold text-slate-900">
                    {examMeta?.title || "Semester Final Examination"}
                  </span>
                </div>
                <div>
                  <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px] block">
                    Program / Semester
                  </span>
                  <span className="font-bold text-slate-900">
                    {examMeta?.program || "BScIT"} · Semester {examMeta?.semester || "IV"} · Sec {examMeta?.sectionCode || "A"}
                  </span>
                </div>
                <div>
                  <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px] block">
                    Academic Year
                  </span>
                  <span className="font-bold text-slate-900">
                    {examMeta?.academicYear || "2083/84"}
                  </span>
                </div>
                <div>
                  <span className="font-semibold uppercase tracking-wider text-slate-500 text-[10px] block">
                    Examination Year
                  </span>
                  <span className="font-bold text-slate-900">
                    {examMeta?.examinationYear || "2083 BS"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* 6. MARKS TABLE CONTAINER (HORIZONTAL SCROLL CONTAINED) */}
          {/* ===================================================================== */}
          <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-xs max-h-[620px] overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              {/* STICKY HEADER */}
              <thead className="sticky top-0 z-30 bg-slate-100 text-[11px] font-bold uppercase text-slate-800 shadow-xs">
                <tr className="border-b border-slate-300">
                  {/* Sticky Identity Columns */}
                  <th className="sticky left-0 z-40 bg-slate-100 px-3 py-2.5 text-center font-bold border-r border-slate-300 w-12">
                    S.N.
                  </th>
                  <th className="sticky left-12 z-40 bg-slate-100 px-3 py-2.5 font-bold border-r border-slate-300 min-w-[190px]">
                    Student Name
                  </th>
                  <th className="sticky left-[238px] z-40 bg-slate-100 px-3 py-2.5 font-bold border-r border-slate-300 min-w-[110px]">
                    Symbol No.
                  </th>

                  {/* Subject Columns (Real Course Code & Name) */}
                  {subjects.map((subj, sIdx) => (
                    <th
                      key={subj.code}
                      className="px-3 py-2 text-center border-r border-slate-300 min-w-[105px] max-w-[130px] bg-slate-100"
                    >
                      <div className="font-mono font-bold text-slate-900 text-xs">{subj.code}</div>
                      <div className="truncate text-[10px] text-slate-600 font-medium leading-tight" title={subj.name}>
                        {subj.name}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono">
                        Max: {subj.totalMarks || 100} · Pass: {subj.passMarks || 40}
                      </div>
                    </th>
                  ))}

                  {/* Calculated Overall Columns */}
                  <th className="px-3 py-2.5 text-center font-bold border-r border-slate-300 min-w-[70px] bg-slate-50">
                    Total
                  </th>
                  <th className="px-3 py-2.5 text-center font-bold border-r border-slate-300 min-w-[65px] bg-slate-50">
                    %
                  </th>
                  <th className="px-3 py-2.5 text-center font-bold border-r border-slate-300 min-w-[60px] bg-slate-50">
                    Grade
                  </th>
                  <th className="px-3 py-2.5 text-center font-bold border-r border-slate-300 min-w-[55px] bg-slate-50">
                    GP
                  </th>
                  <th className="px-3 py-2.5 text-center font-bold min-w-[95px] bg-slate-50">
                    Result
                  </th>
                </tr>
              </thead>

              {/* TABLE BODY */}
              <tbody className="divide-y divide-slate-200">
                {filteredRows.map((row, rIdx) => {
                  const isFail = row.status === "FAILED";
                  const isIncomplete = row.status === "INCOMPLETE";
                  const isAbsent = row.status === "ABSENT";
                  const isPass = row.status === "PASSED";

                  return (
                    <tr
                      key={row.student_id || row.id}
                      className={`hover:bg-amber-50/30 transition-colors ${
                        rIdx % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                      }`}
                    >
                      {/* S.N. Sticky */}
                      <td className="sticky left-0 z-20 bg-inherit px-3 py-2 text-center font-mono text-slate-500 border-r border-slate-200 font-medium">
                        {String(row.sn).padStart(2, "0")}
                      </td>

                      {/* Student Name Sticky */}
                      <td className="sticky left-12 z-20 bg-inherit px-3 py-2 font-semibold text-slate-900 border-r border-slate-200 uppercase tracking-tight">
                        {row.student_name}
                      </td>

                      {/* Symbol Number Sticky */}
                      <td className="sticky left-[238px] z-20 bg-inherit px-3 py-2 font-mono text-slate-700 border-r border-slate-200">
                        {row.symbol_number}
                      </td>

                      {/* Subject Mark Cells */}
                      {subjects.map((subj, sIdx) => {
                        const markVal = row.subject_marks[subj.code];
                        const subjStatus = row.subject_status ? row.subject_status[subj.code] : undefined;
                        const cellKey = getCellKey(rIdx, sIdx);
                        const isSubjFail = subjStatus === "FAIL";

                        return (
                          <td
                            key={subj.code}
                            className={`p-1.5 text-center border-r border-slate-200 ${
                              isSubjFail ? "bg-rose-50/40" : ""
                            }`}
                          >
                            {viewMode === "ENTRY" && !isEditingLocked ? (
                              <input
                                ref={(el) => {
                                  if (el) inputRefs.current.set(cellKey, el);
                                  else inputRefs.current.delete(cellKey);
                                }}
                                type="text"
                                inputMode="numeric"
                                value={markVal === null || markVal === undefined ? "" : String(markVal)}
                                onChange={(e) => handleMarkChange(rIdx, subj.code, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, rIdx, sIdx)}
                                onPaste={(e) => handlePaste(e, rIdx, sIdx)}
                                className={`w-full rounded border px-2 py-1 text-center font-mono text-xs font-semibold transition-all ${
                                  isSubjFail
                                    ? "border-rose-400 bg-rose-50 text-rose-900 focus:border-rose-600 focus:ring-1 focus:ring-rose-500"
                                    : "border-slate-300 bg-white text-slate-900 hover:border-slate-400 focus:border-slate-900 focus:bg-amber-50/50 focus:ring-1 focus:ring-slate-900"
                                }`}
                                placeholder="—"
                              />
                            ) : (
                              <span
                                className={`font-mono text-xs font-semibold ${
                                  isSubjFail
                                    ? "text-rose-700 font-bold"
                                    : markVal === null || markVal === undefined
                                    ? "text-slate-300"
                                    : "text-slate-800"
                                }`}
                              >
                                {markVal === null || markVal === undefined ? "—" : markVal}
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Calculated Total */}
                      <td className="px-3 py-2 text-center font-mono font-bold text-slate-900 border-r border-slate-200 bg-slate-50/50">
                        {row.total_marks !== null && row.total_marks !== undefined ? row.total_marks : "—"}
                      </td>

                      {/* Calculated Percentage */}
                      <td className="px-3 py-2 text-center font-mono font-medium text-slate-800 border-r border-slate-200 bg-slate-50/50">
                        {row.percentage !== null && row.percentage !== undefined ? `${row.percentage.toFixed(2)}%` : "—"}
                      </td>

                      {/* Calculated Grade */}
                      <td className="px-3 py-2 text-center font-serif font-bold text-slate-900 border-r border-slate-200 bg-slate-50/50 text-sm">
                        {row.grade || "—"}
                      </td>

                      {/* Calculated Grade Point */}
                      <td className="px-3 py-2 text-center font-mono font-medium text-slate-700 border-r border-slate-200 bg-slate-50/50">
                        {row.grade_point !== null && row.grade_point !== undefined ? row.grade_point.toFixed(2) : "—"}
                      </td>

                      {/* Overall Result Status Badge */}
                      <td className="px-3 py-2 text-center bg-slate-50/50">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                            isPass
                              ? "border border-emerald-300 bg-emerald-50 text-emerald-800"
                              : isFail
                              ? "border border-rose-300 bg-rose-50 text-rose-800"
                              : isAbsent
                              ? "border border-slate-300 bg-slate-100 text-slate-600"
                              : "border border-amber-300 bg-amber-50 text-amber-800"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ===================================================================== */}
          {/* 21. EXAMINATION RESULT SUMMARY */}
          {/* ===================================================================== */}
          <div className="rounded-lg border border-slate-300 bg-slate-50 p-4">
            <div className="mb-2.5 flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-serif">
                Examination Result Summary
              </h4>
              <span className="text-[11px] font-medium text-slate-500">
                Official Institutional Statistics
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 md:grid-cols-8">
              <div className="rounded border border-slate-200 bg-white p-2 text-center">
                <span className="text-[10px] uppercase text-slate-500 block font-medium">Students</span>
                <span className="font-mono text-base font-bold text-slate-900">{liveSummary.totalStudents}</span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2 text-center">
                <span className="text-[10px] uppercase text-slate-500 block font-medium">Subjects</span>
                <span className="font-mono text-base font-bold text-slate-900">{liveSummary.totalSubjects}</span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2 text-center">
                <span className="text-[10px] uppercase text-slate-500 block font-medium">Full Marks</span>
                <span className="font-mono text-base font-bold text-slate-900">{liveSummary.totalPossibleMarks}</span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2 text-center">
                <span className="text-[10px] uppercase text-slate-500 block font-medium">Completed</span>
                <span className="font-mono text-base font-bold text-slate-900">{liveSummary.completed}</span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2 text-center">
                <span className="text-[10px] uppercase text-slate-500 block font-medium">Incomplete</span>
                <span className="font-mono text-base font-bold text-amber-700">{liveSummary.incomplete}</span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2 text-center">
                <span className="text-[10px] uppercase text-slate-500 block font-medium">Passed</span>
                <span className="font-mono text-base font-bold text-emerald-700">{liveSummary.passed}</span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2 text-center">
                <span className="text-[10px] uppercase text-slate-500 block font-medium">Failed</span>
                <span className="font-mono text-base font-bold text-rose-700">{liveSummary.failed}</span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2 text-center">
                <span className="text-[10px] uppercase text-slate-500 block font-medium">Average %</span>
                <span className="font-mono text-base font-bold text-slate-900">
                  {liveSummary.averagePercentage.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* 27. SIGNATURES & OFFICIAL SEALS (VIEW B / PRINT VIEW) */}
          {/* ===================================================================== */}
          <div className="mt-8 pt-6 border-t border-slate-300">
            <div className="grid grid-cols-1 gap-8 text-center sm:grid-cols-3">
              {/* Prepared By */}
              <div className="space-y-2">
                <div className="h-10 border-b border-dashed border-slate-400 mx-auto w-48" />
                <p className="font-bold text-xs uppercase tracking-wider text-slate-800">Prepared By</p>
                <p className="text-[10px] text-slate-500">Examination Officer / Tabulator</p>
                <p className="text-[9px] text-slate-400 font-mono">Date: ________________</p>
              </div>

              {/* Verified By */}
              <div className="space-y-2">
                <div className="h-10 border-b border-dashed border-slate-400 mx-auto w-48" />
                <p className="font-bold text-xs uppercase tracking-wider text-slate-800">Verified By</p>
                <p className="text-[10px] text-slate-500">Authorized Scrutinizer / Dean</p>
                <p className="text-[9px] text-slate-400 font-mono">Date: ________________</p>
              </div>

              {/* Controller of Examinations & Seal */}
              <div className="space-y-2">
                <div className="relative mx-auto w-48">
                  <div className="h-10 border-b border-dashed border-slate-400" />
                  {/* Subtle Stamp/Seal Placeholder */}
                  <div className="absolute -top-3 right-0 rounded-full border border-slate-400/60 p-2 text-[8px] font-bold text-slate-400 uppercase tracking-tighter leading-tight w-16 h-16 flex items-center justify-center text-center rotate-[-12deg] pointer-events-none select-none">
                    OFFICIAL SEAL
                  </div>
                </div>
                <p className="font-bold text-xs uppercase tracking-wider text-slate-800">
                  Controller of Examinations
                </p>
                <p className="text-[10px] text-slate-500">Official Examination Department</p>
                <p className="text-[9px] text-slate-400 font-mono">Date: ________________</p>
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* 26. OFFICIAL MARKSHEET FOOTER */}
          {/* ===================================================================== */}
          <div className="mt-6 flex flex-wrap items-center justify-between border-t border-slate-200 pt-3 text-[10px] text-slate-400">
            <div>
              <span>This is a computer-generated statement of marks issued by CollegeOS Examination Management System.</span>
            </div>
            <div className="font-mono">
              Generated: {new Date().toLocaleDateString()} · Page 1 of 1
            </div>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL FOR SENSITIVE WORKFLOW ACTIONS */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 no-print">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 font-serif">
              {confirmModal.type === "PUBLISH" && "Publish Official Examination Results"}
              {confirmModal.type === "SUBMIT" && "Submit Results for Verification"}
              {confirmModal.type === "VERIFY" && "Verify Official Results"}
              {confirmModal.type === "FINALIZE" && "Finalize & Authoritatively Lock Results"}
              {confirmModal.type === "REVOKE" && "Revoke Published Results for Correction"}
            </h3>

            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              {confirmModal.type === "PUBLISH" &&
                "Are you sure you want to officially publish these results? Once published, candidate students can view their individual statement of marks."}
              {confirmModal.type === "SUBMIT" &&
                "Submit all candidate marks for review and verification by the examination scrutinizer?"}
              {confirmModal.type === "VERIFY" &&
                "Confirm that all subject marks and candidate results have been scrutinized and verified."}
              {confirmModal.type === "FINALIZE" &&
                "Finalizing will perform authoritative backend recalculation and lock the results from standard edits."}
              {confirmModal.type === "REVOKE" &&
                "Revoking results moves the records to CORRECTION_REQUIRED. An audit history entry will record the justification."}
            </p>

            {(confirmModal.type === "REVOKE" || confirmModal.type === "VERIFY") && (
              <div className="mt-3">
                <label className="text-[11px] font-bold uppercase text-slate-500 block mb-1">
                  Official Remarks / Justification
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded border border-slate-300 p-2 text-xs focus:border-slate-800 focus:outline-none"
                  placeholder="Enter remarks..."
                  value={confirmModal.remarks || ""}
                  onChange={(e) => setConfirmModal((prev) => ({ ...prev, remarks: e.target.value }))}
                />
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setConfirmModal({ open: false, type: null })}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => {
                  if (confirmModal.type === "PUBLISH") void handlePublish();
                  else if (confirmModal.type === "SUBMIT") void handleSubmitForVerification();
                  else if (confirmModal.type === "VERIFY") void handleVerify();
                  else if (confirmModal.type === "FINALIZE") void handleFinalize();
                  else if (confirmModal.type === "REVOKE") void handleRevoke();
                }}
                className={`cursor-pointer rounded-lg px-4 py-1.5 text-xs font-bold text-white transition-colors ${
                  confirmModal.type === "REVOKE"
                    ? "bg-rose-700 hover:bg-rose-800"
                    : confirmModal.type === "PUBLISH"
                    ? "bg-emerald-700 hover:bg-emerald-800"
                    : "bg-slate-900 hover:bg-slate-800"
                }`}
              >
                {actionBusy ? "Processing..." : "Confirm & Proceed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
