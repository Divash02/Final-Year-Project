import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRight,
  faCheckCircle,
  faCircleExclamation,
  faFloppyDisk,
  faListOl,
  faPenToSquare,
  faRotateRight,
  faShieldHalved,
  faUserGraduate,
  faPaperPlane,
  faExclamationTriangle,
  faClockRotateLeft,
  faTableList,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useToast } from "../ui/ToastContainer";
import {
  fetchFacultyCourses,
  fetchAssessmentCandidates,
  saveStudentAssessmentMark,
  submitAssessmentBatch,
  returnAssessmentForCorrection,
  verifyAssessmentBatch,
  finalizeAssessmentBatch,
  publishAssessmentBatch,
  fetchAssessmentAuditTrail,
  getAssessmentExportUrl,
  fetchAssessmentStructure,
  saveAssessmentStructure,
  AssessmentCandidate,
  AssessmentCourse,
  AssessmentComponent,
  CandidatesResponse,
} from "../../services/assessmentApi";
import { apiFetch } from "../../services/apiClient";

const SEMESTERS = [
  { value: 1, label: "Semester 1" },
  { value: 2, label: "Semester 2" },
  { value: 3, label: "Semester 3" },
  { value: 4, label: "Semester 4" },
  { value: 5, label: "Semester 5" },
  { value: 6, label: "Semester 6" },
  { value: 7, label: "Semester 7" },
  { value: 8, label: "Semester 8" },
];

export const FacultyAssessmentWorkspaceView: React.FC = () => {
  const { currentUser, language } = useCollegeOS();
  const { toast } = useToast();

  const roles = currentUser?.roles || [currentUser?.role] || [];
  const isOfficerOrAdmin = roles.some((r) =>
    ["super_admin", "exam_officer", "registrar", "hod", "dean"].includes(r as string)
  );

  // Filters State
  const [academicYear, setAcademicYear] = useState("2083/84");
  const [selectedSemester, setSelectedSemester] = useState(4);
  const [courses, setCourses] = useState<AssessmentCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [sectionCode, setSectionCode] = useState("A");
  const [activeComponent, setActiveComponent] = useState("Assignment");

  // Mode: "STUDENT_ENTRY" (student-by-student) or "CLASS_LIST" (table overview)
  const [viewMode, setViewMode] = useState<"STUDENT_ENTRY" | "CLASS_LIST">("STUDENT_ENTRY");
  const [listFilter, setListFilter] = useState<"ALL" | "INCOMPLETE" | "PENDING" | "FAILED">("ALL");
  const [batch, setBatch] = useState("");
  const [auditTrail, setAuditTrail] = useState<{ studentId: string; symbolNumber: string; action: string; actorName: string; role: string; timestamp: string; remarks: string }[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showStructureConfig, setShowStructureConfig] = useState(false);
  const [structureDraft, setStructureDraft] = useState<AssessmentComponent[]>([]);
  const [structureSaving, setStructureSaving] = useState(false);

  // Candidates & Assessment Data
  const [assessmentData, setAssessmentData] = useState<CandidatesResponse | null>(null);
  const [currentStudentIndex, setCurrentStudentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Form State for Active Student
  const [assignmentMarksInput, setAssignmentMarksInput] = useState<string>("");
  const [examMarksInput, setExamMarksInput] = useState<string>("");
  const [isAssignmentAbsent, setIsAssignmentAbsent] = useState(false);
  const [isExamAbsent, setIsExamAbsent] = useState(false);

  // Review / Correction Modal State
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [correctionReasonInput, setCorrectionReasonInput] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  // Autosave timer ref
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Load Assigned Courses when Academic Year or Semester changes
  const loadCourses = useCallback(async () => {
    try {
      setLoading(true);
      const list = await fetchFacultyCourses({
        academicYear,
        semester: selectedSemester,
      });
      setCourses(list);
      if (list.length > 0) {
        // Keep selected course if still in list, else select first
        const exists = list.some((c) => c.id === selectedCourseId);
        if (!exists) {
          setSelectedCourseId(list[0].id);
        }
      } else {
        setSelectedCourseId("");
        setAssessmentData(null);
      }
    } catch (err: unknown) {
      toast({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to load assigned courses",
      });
    } finally {
      setLoading(false);
    }
  }, [academicYear, selectedSemester, selectedCourseId, toast]);

  useEffect(() => {
    void loadCourses();
  }, [academicYear, selectedSemester]);

  // 2. Load Candidates & Marks when Course or Section changes
  const loadCandidates = useCallback(async () => {
    if (!selectedCourseId) return;
    try {
      setLoading(true);
      const data = await fetchAssessmentCandidates({
        courseId: selectedCourseId,
        academicYear,
        semester: selectedSemester,
        sectionCode,
      });
      setAssessmentData(data);
      // Keep student index in bounds
      if (currentStudentIndex >= data.candidates.length) {
        setCurrentStudentIndex(0);
      }
    } catch (err: unknown) {
      toast({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to load candidate marks",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCourseId, academicYear, selectedSemester, sectionCode, batch, currentStudentIndex, toast]);

  useEffect(() => {
    void loadCandidates();
  }, [selectedCourseId, sectionCode]);

  // Active student candidate
  const currentCandidate: AssessmentCandidate | undefined =
    assessmentData?.candidates[currentStudentIndex];

  // 3. Sync inputs whenever active candidate or data updates
  useEffect(() => {
    if (!currentCandidate) {
      setAssignmentMarksInput("");
      setExamMarksInput("");
      setIsAssignmentAbsent(false);
      setIsExamAbsent(false);
      setDirty(false);
      return;
    }

    const assignComp = currentCandidate.components.find(
      (c) => c.name.toLowerCase() === "assignment"
    );
    const examComp = currentCandidate.components.find(
      (c) => c.name.toLowerCase() === "examination"
    );

    setAssignmentMarksInput(
      assignComp?.marksObtained != null ? String(assignComp.marksObtained) : ""
    );
    setIsAssignmentAbsent(Boolean(assignComp?.isAbsent));

    setExamMarksInput(
      examComp?.marksObtained != null ? String(examComp.marksObtained) : ""
    );
    setIsExamAbsent(Boolean(examComp?.isAbsent));

    setDirty(false);
  }, [currentCandidate?.studentId, currentStudentIndex, assessmentData]);

  // 4. Live Calculation preview
  const liveCalculation = useMemo(() => {
    const aMarks = isAssignmentAbsent
      ? 0
      : assignmentMarksInput !== ""
      ? Number(assignmentMarksInput)
      : null;
    const eMarks = isExamAbsent
      ? 0
      : examMarksInput !== ""
      ? Number(examMarksInput)
      : null;

    const totalMax = (assessmentData?.structure.totalMaxMarks) || 200;

    if (aMarks === null || eMarks === null) {
      return {
        totalObtained: null,
        totalMax,
        percentage: null,
        grade: "—",
        gradePoint: null,
        result: "INCOMPLETE",
      };
    }

    if (isAssignmentAbsent && isExamAbsent) {
      return {
        totalObtained: 0,
        totalMax,
        percentage: 0,
        grade: "—",
        gradePoint: 0.0,
        result: "ABSENT",
      };
    }

    const totalObtained = aMarks + eMarks;
    const percentage = Math.round((totalObtained / totalMax) * 10000) / 100;

    // Subject fail if Assignment < 40 or Examination < 40
    const passMarks = 40;
    const isFailed = aMarks < passMarks || eMarks < passMarks || percentage < 40;

    let grade = "F";
    let gradePoint = 0.0;

    if (isFailed) {
      grade = "F";
      gradePoint = 0.0;
    } else if (percentage >= 90) {
      grade = "A+";
      gradePoint = 4.0;
    } else if (percentage >= 80) {
      grade = "A";
      gradePoint = 3.6;
    } else if (percentage >= 70) {
      grade = "B+";
      gradePoint = 3.2;
    } else if (percentage >= 60) {
      grade = "B";
      gradePoint = 2.8;
    } else if (percentage >= 50) {
      grade = "C+";
      gradePoint = 2.4;
    } else if (percentage >= 40) {
      grade = "C";
      gradePoint = 2.0;
    }

    return {
      totalObtained,
      totalMax,
      percentage,
      grade,
      gradePoint,
      result: isFailed ? "FAIL" : "PASS",
    };
  }, [assignmentMarksInput, examMarksInput, isAssignmentAbsent, isExamAbsent, assessmentData]);

  // 5. Save Student Mark function
  const handleSaveStudent = async (showSuccessToast = true): Promise<boolean> => {
    if (!currentCandidate || !selectedCourseId) return false;

    // Validate ranges
    const aVal = assignmentMarksInput.trim() === "" ? null : Number(assignmentMarksInput);
    const eVal = examMarksInput.trim() === "" ? null : Number(examMarksInput);

    if (aVal !== null && (isNaN(aVal) || aVal < 0 || aVal > 100)) {
      toast({ variant: "error", message: "Assignment marks must be between 0 and 100" });
      return false;
    }
    if (eVal !== null && (isNaN(eVal) || eVal < 0 || eVal > 100)) {
      toast({ variant: "error", message: "Examination marks must be between 0 and 100" });
      return false;
    }

    try {
      setSaving(true);
      const componentsPayload = [
        {
          name: "Assignment",
          marksObtained: aVal,
          isAbsent: isAssignmentAbsent,
        },
        {
          name: "Examination",
          marksObtained: eVal,
          isAbsent: isExamAbsent,
        },
      ];

      const res = await saveStudentAssessmentMark({
        studentId: currentCandidate.studentId,
        courseId: selectedCourseId,
        academicYear,
        semester: selectedSemester,
        sectionCode,
        components: componentsPayload,
      });

      setLastSavedTime(res.savedAtNepalTime);
      setDirty(false);

      // Update local candidates state in place
      if (assessmentData) {
        const nextCandidates = [...assessmentData.candidates];
        nextCandidates[currentStudentIndex] = {
          ...nextCandidates[currentStudentIndex],
          components: res.candidate.components,
          totalMarksObtained: res.candidate.totalMarksObtained,
          percentage: res.candidate.percentage,
          grade: res.candidate.grade,
          gradePoint: res.candidate.gradePoint,
          resultStatus: res.candidate.resultStatus,
          workflowStatus: res.candidate.workflowStatus,
        };

        const savedCount = nextCandidates.filter(
          (c) => c.resultStatus !== "INCOMPLETE"
        ).length;
        const incompleteCount = nextCandidates.length - savedCount;

        setAssessmentData({
          ...assessmentData,
          candidates: nextCandidates,
          summary: {
            ...assessmentData.summary,
            savedCount,
            incompleteCount,
          },
        });
      }

      if (showSuccessToast) {
        toast({
          variant: "success",
          message: `Saved marks for ${currentCandidate.fullName} (${currentCandidate.symbolNumber})`,
        });
      }
      return true;
    } catch (err: unknown) {
      toast({
        variant: "error",
        message: err instanceof Error ? err.message : "Save failed",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // 6. Autosave after 2.5 seconds of inactivity
  useEffect(() => {
    if (!dirty || !currentCandidate) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      void handleSaveStudent(false);
    }, 2500);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [dirty, assignmentMarksInput, examMarksInput, isAssignmentAbsent, isExamAbsent]);

  // 7. Save & Next Student Handler
  const handleSaveAndNext = async () => {
    const ok = await handleSaveStudent(true);
    if (ok) {
      if (assessmentData && currentStudentIndex < assessmentData.candidates.length - 1) {
        setCurrentStudentIndex((prev) => prev + 1);
      } else {
        toast({
          variant: "info",
          message: "Reached the last candidate in the class roster.",
        });
      }
    }
  };

  // 8. Submit Assessment Batch Handler
  const handleSubmitBatch = async () => {
    if (!selectedCourseId || !assessmentData) return;

    if (assessmentData.summary.incompleteCount > 0) {
      const proceed = window.confirm(
        `There are ${assessmentData.summary.incompleteCount} students with incomplete marks. Do you still wish to submit?`
      );
      if (!proceed) return;
    } else {
      const confirmSubmit = window.confirm(
        "Are you sure you want to submit all marks to the Examination Department? Ordinary editing will be locked."
      );
      if (!confirmSubmit) return;
    }

    try {
      setActionBusy(true);
      const res = await submitAssessmentBatch({
        courseId: selectedCourseId,
        academicYear,
        semester: selectedSemester,
        sectionCode,
      });
      toast({
        variant: "success",
        message: `Assessment submitted successfully (${res.transitionedCount} students).`,
      });
      await loadCandidates();
    } catch (err: unknown) {
      toast({
        variant: "error",
        message: err instanceof Error ? err.message : "Submission failed",
      });
    } finally {
      setActionBusy(false);
    }
  };

  // 9. Reviewer Return for Correction Handler
  const handleReturnForCorrection = async () => {
    if (!selectedCourseId || !correctionReasonInput.trim()) {
      toast({ variant: "error", message: "Mandatory correction reason must be provided." });
      return;
    }

    try {
      setActionBusy(true);
      await returnAssessmentForCorrection({
        courseId: selectedCourseId,
        academicYear,
        semester: selectedSemester,
        sectionCode,
        reason: correctionReasonInput.trim(),
      });
      toast({
        variant: "success",
        message: "Assessment returned to faculty for mandatory correction.",
      });
      setReturnModalOpen(false);
      setCorrectionReasonInput("");
      await loadCandidates();
    } catch (err: unknown) {
      toast({
        variant: "error",
        message: err instanceof Error ? err.message : "Return failed",
      });
    } finally {
      setActionBusy(false);
    }
  };

  // 10. Reviewer Verify / Finalize / Publish Handlers
  const handleVerify = async () => {
    if (!selectedCourseId) return;
    try {
      setActionBusy(true);
      await verifyAssessmentBatch({
        courseId: selectedCourseId,
        academicYear,
        semester: selectedSemester,
        sectionCode,
      });
      toast({ variant: "success", message: "Marks verified by Examination Department." });
      await loadCandidates();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Verification failed" });
    } finally {
      setActionBusy(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedCourseId) return;
    try {
      setActionBusy(true);
      await finalizeAssessmentBatch({
        courseId: selectedCourseId,
        academicYear,
        semester: selectedSemester,
        sectionCode,
      });
      toast({ variant: "success", message: "Results finalized by Controller of Examinations." });
      await loadCandidates();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Finalization failed" });
    } finally {
      setActionBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedCourseId) return;
    const confirmPub = window.confirm(
      "Publish official results to Student Portal and Marksheets? Students will be able to view their released marks."
    );
    if (!confirmPub) return;
    try {
      setActionBusy(true);
      await publishAssessmentBatch({
        courseId: selectedCourseId,
        academicYear,
        semester: selectedSemester,
        sectionCode,
      });
      toast({ variant: "success", message: "Official marks published to student portal and marksheets!" });
      await loadCandidates();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Publication failed" });
    } finally {
      setActionBusy(false);
    }
  };

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const totalStudents = assessmentData?.candidates.length || 0;
  const isLocked =
    currentCandidate &&
    ["SUBMITTED", "VERIFIED", "FINALIZED", "PUBLISHED"].includes(currentCandidate.workflowStatus) &&
    !isOfficerOrAdmin;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-slate-50 p-4 md:p-6 text-slate-800">
      {/* 1. Header & Title Bar */}
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
              FACULTY ASSESSMENT &amp; MARKS WORKSPACE
            </span>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              CollegeOS Authoritative Assessment Engine
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            My Assessment &amp; Marks
          </h1>
          <p className="text-xs text-slate-500">
            Enter continuous assignment and examination marks once. System computes totals, percentages, and grades authoritatively for Examination Department verification.
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode("STUDENT_ENTRY")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                viewMode === "STUDENT_ENTRY"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FontAwesomeIcon icon={faPenToSquare} />
              Student-by-Student Entry
            </button>
            <button
              type="button"
              onClick={() => setViewMode("CLASS_LIST")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                viewMode === "CLASS_LIST"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FontAwesomeIcon icon={faTableList} />
              Class Mark List ({totalStudents})
            </button>
          </div>

          <button
            type="button"
            onClick={() => void loadCandidates()}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            title="Refresh candidate marks from server"
          >
            <FontAwesomeIcon icon={faRotateRight} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* 2. Institutional Academic Filter Strip */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Academic Year */}
          <div>
            <label className="block text-xs font-medium text-slate-600">Academic Year</label>
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="2083/84">2083/84 (Current Session)</option>
              <option value="2082/83">2082/83</option>
              <option value="2081/82">2081/82</option>
            </select>
          </div>

          {/* Semester Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-600">Semester</label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {SEMESTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Course / Subject */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-600">Assigned Subject / Course</label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              disabled={courses.length === 0}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100"
            >
              {courses.length === 0 ? (
                <option value="">No courses assigned for this semester</option>
              ) : (
                courses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.code} · {c.credits} Cr · Sem {c.semester})
                            </option>
                ))
              )}
            </select>
          </div>

          {/* Section Code */}
          <div>
            <label className="block text-xs font-medium text-slate-600">Section</label>
            <select
              value={sectionCode}
              onChange={(e) => setSectionCode(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="A">Section A</option>
              <option value="B">Section B</option>
              <option value="ALL">All Sections</option>
            </select>
          </div>
        </div>

        {/* Course Assessment Component Structure Badge */}
        {selectedCourse && (
          <div className="mt-3 flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{selectedCourse.code}:</span>
              <span>{selectedCourse.name}</span>
              <span className="text-slate-400">|</span>
              <span className="font-medium text-indigo-700">
                Structure: {(assessmentData?.structure?.components || []).map((comp) => `${comp.name} (Max ${comp.maxMarks} · Pass ${comp.passMarks})`).join(' + ') || 'Default structure'} = Total {assessmentData?.structure?.totalMaxMarks || 200} Marks
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-500">
                Formula: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">% = (Obtained / 200) × 100</code>
              </span>
            </div>
          </div>
        )}
      </div>

      {showStructureConfig && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">Assessment Structure Configuration</h3><span className="text-xs text-slate-500">Admin/academic roles; backend enforces authorization.</span></div>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-2 py-2 text-left">Component</th><th className="px-2 py-2">Type</th><th className="px-2 py-2">Max</th><th className="px-2 py-2">Pass</th><th className="px-2 py-2">Weight</th></tr></thead>
            <tbody>{structureDraft.map((comp, i) => (<tr key={i} className="border-t"><td className="px-2 py-1.5"><input className="w-full rounded border border-slate-300 px-2 py-1" value={comp.name} onChange={(e)=>setStructureDraft(d=>d.map((x,j)=>j===i?{...x,name:e.target.value}:x))} /></td><td className="px-2 py-1.5"><input className="w-28 rounded border border-slate-300 px-2 py-1" value={comp.type} onChange={(e)=>setStructureDraft(d=>d.map((x,j)=>j===i?{...x,type:e.target.value}:x))} /></td><td className="px-2 py-1.5"><input type="number" className="w-20 rounded border border-slate-300 px-2 py-1" value={comp.maxMarks} onChange={(e)=>setStructureDraft(d=>d.map((x,j)=>j===i?{...x,maxMarks:Number(e.target.value)||0}:x))} /></td><td className="px-2 py-1.5"><input type="number" className="w-20 rounded border border-slate-300 px-2 py-1" value={comp.passMarks} onChange={(e)=>setStructureDraft(d=>d.map((x,j)=>j===i?{...x,passMarks:Number(e.target.value)||0}:x))} /></td><td className="px-2 py-1.5"><input type="number" className="w-20 rounded border border-slate-300 px-2 py-1" value={comp.weightage ?? 0} onChange={(e)=>setStructureDraft(d=>d.map((x,j)=>j===i?{...x,weightage:Number(e.target.value)||0}:x))} /></td></tr>))}</tbody></table></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div className="text-xs text-slate-500">Total max: {structureDraft.reduce((s,c)=>s+(Number(c.maxMarks)||0),0)} · Weights must reflect intended policy. Invalid configs rejected by backend validation/rules.</div><div className="flex gap-2"><button type="button" onClick={()=>setShowStructureConfig(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">Close</button><button type="button" disabled={structureSaving || !selectedCourseId} onClick={async()=>{ if(!selectedCourseId) return; setStructureSaving(true); try { await saveAssessmentStructure({ courseId:selectedCourseId, academicYear, semester:selectedSemester, sectionCode: sectionCode||"ALL", components: structureDraft }); toast({variant:"success", message:"Assessment structure saved."}); setShowStructureConfig(false); await loadCandidates(); } catch(e){ toast({variant:"error", message: e instanceof Error?e.message:"Failed to save structure"});} finally { setStructureSaving(false);} }} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{structureSaving?"Saving...":"Save Structure"}</button></div></div>
        </div>
      )}
      {showAudit && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Assessment Audit / Modification History</h3>
          {auditLoading ? <p className="mt-2 text-xs text-slate-500">Loading audit trail…</p> : auditTrail.length===0 ? <p className="mt-2 text-xs text-slate-500">No audit records found for this course/semester scope.</p> : (
            <div className="mt-2 max-h-64 overflow-auto"><table className="w-full text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-2 py-2 text-left">Time</th><th className="px-2 py-2 text-left">Student</th><th className="px-2 py-2 text-left">Action</th><th className="px-2 py-2 text-left">Actor</th><th className="px-2 py-2 text-left">Remarks</th></tr></thead><tbody>{auditTrail.map((a,i)=><tr key={i} className="border-t"><td className="px-2 py-1.5 whitespace-nowrap">{a.timestamp ? new Date(a.timestamp).toLocaleString() : ""}</td><td className="px-2 py-1.5 font-mono">{a.symbolNumber || a.studentId}</td><td className="px-2 py-1.5">{a.action}</td><td className="px-2 py-1.5">{a.actorName} ({a.role})</td><td className="px-2 py-1.5">{a.remarks}</td></tr>)}</tbody></table></div>
          )}
        </div>
      )}

      {/* 3. Progress and Workflow Banner */}
      {assessmentData && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {/* Counters */}
          <div className="flex items-center gap-6">
            <div>
              <span className="text-xs uppercase font-medium text-slate-500">Total Enrolled</span>
              <p className="text-xl font-bold text-slate-900">{totalStudents}</p>
            </div>
            <div className="border-l border-slate-200 pl-6">
              <span className="text-xs uppercase font-medium text-emerald-600">Saved / Complete</span>
              <p className="text-xl font-bold text-emerald-700">{assessmentData.summary.savedCount}</p>
            </div>
            <div className="border-l border-slate-200 pl-6">
              <span className="text-xs uppercase font-medium text-amber-600">Incomplete</span>
              <p className="text-xl font-bold text-amber-700">{assessmentData.summary.incompleteCount}</p>
            </div>
            <div className="border-l border-slate-200 pl-6">
              <span className="text-xs uppercase font-medium text-indigo-600">Workflow Status</span>
              <div className="mt-0.5">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    assessmentData.summary.workflowStatus === "PUBLISHED"
                      ? "bg-purple-100 text-purple-800"
                      : assessmentData.summary.workflowStatus === "FINALIZED"
                      ? "bg-blue-100 text-blue-800"
                      : assessmentData.summary.workflowStatus === "VERIFIED"
                      ? "bg-emerald-100 text-emerald-800"
                      : assessmentData.summary.workflowStatus === "RETURNED_FOR_CORRECTION"
                      ? "bg-red-100 text-red-800"
                      : assessmentData.summary.workflowStatus === "SUBMITTED"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {assessmentData.summary.workflowStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons for Faculty and Examination Officers */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Faculty Action: Submit for Review */}
            {assessmentData.summary.workflowStatus !== "SUBMITTED" &&
              assessmentData.summary.workflowStatus !== "VERIFIED" &&
              assessmentData.summary.workflowStatus !== "FINALIZED" &&
              assessmentData.summary.workflowStatus !== "PUBLISHED" && (
                <button
                  type="button"
                  onClick={() => void handleSubmitBatch()}
                  disabled={actionBusy || totalStudents === 0}
                  className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faPaperPlane} />
                  Submit Assessment for Review
                </button>
              )}

            {/* Officer Actions */}
            {isOfficerOrAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setReturnModalOpen(true)}
                  disabled={actionBusy}
                  className="flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  <FontAwesomeIcon icon={faExclamationTriangle} />
                  Return for Correction
                </button>

                <button
                  type="button"
                  onClick={() => void handleVerify()}
                  disabled={actionBusy}
                  className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <FontAwesomeIcon icon={faCheckCircle} />
                  Verify Marks
                </button>

                <button
                  type="button"
                  onClick={() => void handleFinalize()}
                  disabled={actionBusy}
                  className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Finalize Results
                </button>

                <button
                  type="button"
                  onClick={() => void handlePublish()}
                  disabled={actionBusy}
                  className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-purple-700"
                >
                  Publish Officially
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Returned for Correction Banner if applicable */}
      {currentCandidate?.workflowStatus === "RETURNED_FOR_CORRECTION" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50/80 p-4 text-red-900">
          <div className="flex items-start gap-3">
            <FontAwesomeIcon icon={faCircleExclamation} className="mt-0.5 text-red-600" />
            <div>
              <h4 className="font-bold text-red-800">Assessment Returned for Correction</h4>
              <p className="mt-0.5 text-xs text-red-700">
                <strong>Mandatory Reviewer Note:</strong> {currentCandidate.correctionReason || "Re-scrutinize marks before resubmission."}
              </p>
              <p className="mt-1 text-xs text-red-600">
                Make the required adjustments below, save, and resubmit for verification.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4. MAIN WORKSPACE CONTENT */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center p-12">
          <div className="text-center text-sm text-slate-500">
            <FontAwesomeIcon icon={faRotateRight} className="mb-2 animate-spin text-2xl text-indigo-600" />
            <p>Loading authoritative candidate and assessment records...</p>
          </div>
        </div>
      ) : totalStudents === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <FontAwesomeIcon icon={faUserGraduate} className="text-4xl text-slate-300" />
          <h3 className="mt-2 text-base font-semibold text-slate-800">No candidates found</h3>
          <p className="mt-1 text-xs text-slate-500">
            No active students enrolled in this course for {academicYear} Semester {selectedSemester} Section {sectionCode}.
          </p>
        </div>
      ) : viewMode === "STUDENT_ENTRY" && currentCandidate ? (
        /* =========================================================================
           PRIMARY VIEW: STUDENT-BY-STUDENT MARKS ENTRY (PROMPT SECTION 4)
           ========================================================================= */
        <div className="flex flex-1 flex-col gap-6 lg:flex-row">
          {/* Left / Center: Active Candidate Card */}
          <div className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            {/* Student Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-semibold text-indigo-700">
                  Candidate {currentStudentIndex + 1} of {totalStudents}
                </span>
                <h2 className="text-xl font-bold text-slate-900">{currentCandidate.fullName}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>
                    Symbol No: <strong className="font-mono text-slate-800">{currentCandidate.symbolNumber}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Student ID: <span className="font-mono">{currentCandidate.studentId}</span>
                  </span>
                  <span>•</span>
                  <span>
                    Program: <strong>{currentCandidate.program}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Semester: <strong>{currentCandidate.semester}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Section: <strong>{currentCandidate.section}</strong>
                  </span>
                </div>
              </div>

              {/* Status and Autosave Feedback */}
              <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {saving ? (
                    <span className="flex items-center gap-1 text-xs text-indigo-600">
                      <FontAwesomeIcon icon={faRotateRight} className="animate-spin" />
                      Saving...
                    </span>
                  ) : lastSavedTime ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600" title="Saved to institutional database">
                      <FontAwesomeIcon icon={faCheckCircle} />
                      Saved at {lastSavedTime.slice(11, 19)} NPT
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Not saved yet</span>
                  )}
                  {dirty && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">Unsaved edits</span>}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Workflow: <span className="font-medium text-slate-700">{currentCandidate.workflowStatus}</span>
                </div>
              </div>
            </div>

            {/* Assessment Input Section */}
            <div className="mt-6 space-y-6">
              {/* Component Tabs / Selector */}
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setActiveComponent("Assignment")}
                  className={`flex-1 rounded-md py-2 text-xs font-semibold transition ${
                    activeComponent === "Assignment"
                      ? "bg-white text-indigo-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  1. Assignment (Continuous Assessment · Max 100)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveComponent("Examination")}
                  className={`flex-1 rounded-md py-2 text-xs font-semibold transition ${
                    activeComponent === "Examination"
                      ? "bg-white text-indigo-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  2. Examination (Final Written Exam · Max 100)
                </button>
              </div>

              {/* Grid of Two Components */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* 1. Assignment Input Block */}
                <div
                  className={`rounded-xl border p-5 transition ${
                    activeComponent === "Assignment"
                      ? "border-indigo-400 bg-indigo-50/20 ring-2 ring-indigo-100"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-800">Assignment Marks</h3>
                      <p className="text-xs text-slate-500">Continuous internal assessment &amp; labs</p>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                      Max: 100 · Pass: 40
                    </span>
                  </div>

                  <div className="mt-4">
                    <label className="block text-xs font-medium text-slate-600">Marks Obtained (0 – 100)</label>
                    <div className="mt-1 flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        disabled={isLocked || isAssignmentAbsent}
                        value={assignmentMarksInput}
                        onChange={(e) => {
                          setAssignmentMarksInput(e.target.value);
                          setDirty(true);
                        }}
                        placeholder="e.g. 45"
                        className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-lg font-bold text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100"
                      />
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={isAssignmentAbsent}
                          disabled={isLocked}
                          onChange={(e) => {
                            setIsAssignmentAbsent(e.target.checked);
                            setDirty(true);
                          }}
                          className="rounded text-indigo-600"
                        />
                        Absent
                      </label>
                    </div>
                    {assignmentMarksInput !== "" && !isNaN(Number(assignmentMarksInput)) && (
                      <p className="mt-1.5 text-xs">
                        {Number(assignmentMarksInput) >= 40 ? (
                          <span className="font-semibold text-emerald-600">✓ Component Pass (≥ 40)</span>
                        ) : (
                          <span className="font-semibold text-red-600">✗ Below Pass Mark (&lt; 40)</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* 2. Examination Input Block */}
                <div
                  className={`rounded-xl border p-5 transition ${
                    activeComponent === "Examination"
                      ? "border-indigo-400 bg-indigo-50/20 ring-2 ring-indigo-100"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-800">Examination Marks</h3>
                      <p className="text-xs text-slate-500">Official semester end written theory</p>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                      Max: 100 · Pass: 40
                    </span>
                  </div>

                  <div className="mt-4">
                    <label className="block text-xs font-medium text-slate-600">Marks Obtained (0 – 100)</label>
                    <div className="mt-1 flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        disabled={isLocked || isExamAbsent}
                        value={examMarksInput}
                        onChange={(e) => {
                          setExamMarksInput(e.target.value);
                          setDirty(true);
                        }}
                        placeholder="e.g. 45"
                        className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-lg font-bold text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100"
                      />
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={isExamAbsent}
                          disabled={isLocked}
                          onChange={(e) => {
                            setIsExamAbsent(e.target.checked);
                            setDirty(true);
                          }}
                          className="rounded text-indigo-600"
                        />
                        Absent
                      </label>
                    </div>
                    {examMarksInput !== "" && !isNaN(Number(examMarksInput)) && (
                      <p className="mt-1.5 text-xs">
                        {Number(examMarksInput) >= 40 ? (
                          <span className="font-semibold text-emerald-600">✓ Component Pass (≥ 40)</span>
                        ) : (
                          <span className="font-semibold text-red-600">✗ Below Pass Mark (&lt; 40)</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation Controls Bar (As specified in Section 4) */}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentStudentIndex > 0) {
                        setCurrentStudentIndex((prev) => prev - 1);
                      }
                    }}
                    disabled={currentStudentIndex === 0}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
                  >
                    <FontAwesomeIcon icon={faArrowLeft} />
                    Previous Student
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewMode("CLASS_LIST")}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <FontAwesomeIcon icon={faListOl} />
                    Return to Student List
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveStudent(true)}
                    disabled={saving || isLocked}
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-600 bg-white px-4 py-2 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faFloppyDisk} />
                    Save Draft
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSaveAndNext()}
                    disabled={saving || isLocked}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faFloppyDisk} />
                    Save &amp; Next Student
                    <FontAwesomeIcon icon={faArrowRight} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (currentStudentIndex < totalStudents - 1) {
                        setCurrentStudentIndex((prev) => prev + 1);
                      }
                    }}
                    disabled={currentStudentIndex >= totalStudents - 1}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next Student
                    <FontAwesomeIcon icon={faArrowRight} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Rail: Live Calculation & Institutional Grade Summary */}
          <div className="w-full lg:w-80">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <FontAwesomeIcon icon={faSliders} className="text-indigo-600" />
                Live Result Calculation
              </h3>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
                  <span className="text-slate-500">Assignment:</span>
                  <strong className="font-mono text-slate-800">
                    {isAssignmentAbsent ? "ABSENT" : assignmentMarksInput !== "" ? `${assignmentMarksInput} / 100` : "—"}
                  </strong>
                </div>

                <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
                  <span className="text-slate-500">Examination:</span>
                  <strong className="font-mono text-slate-800">
                    {isExamAbsent ? "ABSENT" : examMarksInput !== "" ? `${examMarksInput} / 100` : "—"}
                  </strong>
                </div>

                <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
                  <span className="text-slate-500">Total Obtained:</span>
                  <strong className="font-mono text-sm text-slate-900">
                    {liveCalculation.totalObtained != null ? `${liveCalculation.totalObtained} / ${liveCalculation.totalMax}` : "—"}
                  </strong>
                </div>

                <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
                  <span className="text-slate-500">Percentage:</span>
                  <strong className="font-mono text-sm text-indigo-700">
                    {liveCalculation.percentage != null ? `${liveCalculation.percentage}%` : "—"}
                  </strong>
                </div>

                <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
                  <span className="text-slate-500">Letter Grade:</span>
                  <span className="rounded bg-indigo-100 px-2 py-0.5 font-bold text-indigo-900">
                    {liveCalculation.grade}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
                  <span className="text-slate-500">Grade Point (GP):</span>
                  <strong className="font-mono text-slate-800">
                    {liveCalculation.gradePoint != null ? liveCalculation.gradePoint.toFixed(1) : "—"}
                  </strong>
                </div>

                <div className="pt-2">
                  <span className="block text-xs text-slate-500">Result Status:</span>
                  <div className="mt-1">
                    <span
                      className={`inline-block w-full text-center rounded-lg py-1.5 text-xs font-bold ${
                        liveCalculation.result === "PASS"
                          ? "bg-emerald-100 text-emerald-800"
                          : liveCalculation.result === "FAIL"
                          ? "bg-red-100 text-red-800"
                          : liveCalculation.result === "ABSENT"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {liveCalculation.result}
                    </span>
                  </div>
                </div>
              </div>

              {/* Institutional Pass Requirements info box */}
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">Passing Criteria:</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5 text-slate-500">
                  <li>Minimum 40/100 in Assignment</li>
                  <li>Minimum 40/100 in Examination</li>
                  <li>Minimum 40% aggregate required to Pass</li>
                </ul>
              </div>
            </div>

            {/* Candidate Navigator Sidebar */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm max-h-64 overflow-y-auto">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Class Candidates ({totalStudents})
              </h4>
              <div className="divide-y divide-slate-100">
                {assessmentData?.candidates?.map((cand, idx) => (
                  <button
                    key={cand.studentId}
                    type="button"
                    onClick={() => setCurrentStudentIndex(idx)}
                    className={`w-full text-left py-2 px-2 flex items-center justify-between rounded text-xs transition ${
                      idx === currentStudentIndex ? "bg-indigo-50 font-bold text-indigo-900" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">
                      {idx + 1}. {cand.fullName}
                    </span>
                    <span className="font-mono text-slate-400 text-xs ml-2">{cand.symbolNumber}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* =========================================================================
           SECONDARY VIEW: CLASS MARK LIST TABLE OVERVIEW
           ========================================================================= */
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Class Mark List Register</h3>
              <p className="text-xs text-slate-500">
                      {selectedCourse?.name} <span className="text-xs font-normal text-slate-500">({selectedCourse?.code})</span> · {academicYear} Semester {selectedSemester} Section {sectionCode}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-3 border-b">S.N.</th>
                  <th className="py-2.5 px-3 border-b">Student Name</th>
                  <th className="py-2.5 px-3 border-b font-mono">Symbol No.</th>
                  <th className="py-2.5 px-3 border-b text-center">Assignment (100)</th>
                  <th className="py-2.5 px-3 border-b text-center">Examination (100)</th>
                  <th className="py-2.5 px-3 border-b text-center">Total (200)</th>
                  <th className="py-2.5 px-3 border-b text-center">%</th>
                  <th className="py-2.5 px-3 border-b text-center">Grade</th>
                  <th className="py-2.5 px-3 border-b text-center">GP</th>
                  <th className="py-2.5 px-3 border-b text-center">Result</th>
                  <th className="py-2.5 px-3 border-b text-center">Status</th>
                  <th className="py-2.5 px-3 border-b text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assessmentData?.candidates.map((cand, idx) => {
                  const assign = cand.components.find((c) => c.name.toLowerCase() === "assignment");
                  const exam = cand.components.find((c) => c.name.toLowerCase() === "examination");

                  return (
                    <tr key={cand.studentId} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-medium text-slate-500">{cand.sn}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{cand.fullName}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-700">{cand.symbolNumber}</td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {assign?.isAbsent ? <span className="text-amber-600 font-bold">ABS</span> : assign?.marksObtained ?? "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {exam?.isAbsent ? <span className="text-amber-600 font-bold">ABS</span> : exam?.marksObtained ?? "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                        {cand.totalMarksObtained != null ? cand.totalMarksObtained : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-semibold text-indigo-700">
                        {cand.percentage != null ? `${cand.percentage}%` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800">{cand.grade}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                        {cand.gradePoint != null ? cand.gradePoint.toFixed(1) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-bold ${
                            cand.resultStatus === "PASS"
                              ? "bg-emerald-100 text-emerald-800"
                              : cand.resultStatus === "FAIL"
                              ? "bg-red-100 text-red-800"
                              : cand.resultStatus === "ABSENT"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {cand.resultStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-xs text-slate-500 font-medium">
                        {cand.workflowStatus}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentStudentIndex(idx);
                            setViewMode("STUDENT_ENTRY");
                          }}
                          className="rounded bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Return for Correction Modal */}
      {returnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Return Assessment for Correction</h3>
            <p className="mt-1 text-xs text-slate-500">
              Provide a mandatory explanation for returning this assessment batch. The faculty member will be required to rectify the specified items before resubmitting.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-700">
                Mandatory Correction Reason *
              </label>
              <textarea
                rows={4}
                value={correctionReasonInput}
                onChange={(e) => setCorrectionReasonInput(e.target.value)}
                placeholder="e.g. Please re-scrutinize Assignment lab evaluation marks for candidates 2083-001 through 2083-010."
                className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-xs text-slate-800 shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturnModalOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReturnForCorrection()}
                disabled={actionBusy || !correctionReasonInput.trim()}
                className="rounded-md bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirm Return for Correction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
