import React, { useEffect, useState, useMemo, useCallback } from "react";
import { apiRequest } from "../../services/apiClient";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useToast } from "../../components/ui/ToastContainer";
import { EmptyState } from "../ui/EmptyState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faFileLines,
  faPlus,
  faUsers,
  faBuilding,
  faUserTie,
  faClock,
  faCircleCheck,
  faTriangleExclamation,
  faArrowsRotate,
  faBan,
  faSearch,
  faEye,
  faCheck,
  faListCheck,
  faClipboardList,
  faSquareCheck,
  faAward,
  faBullhorn,
  faArrowLeft,
  faGaugeHigh,
  faClockRotateLeft,
  faPencil,
  faPaperPlane,
  faExclamationTriangle,
  faChevronRight,
  faChevronLeft,
  faSpinner,
  faCheckCircle,
  faBell,
  faXmark,
  faInfoCircle,
  faLayerGroup,
  faGraduationCap,
  faUserCheck,
  faCalendarCheck,
  faHourglass,
  faChartBar,
  faStar,
  faChair,
} from "@fortawesome/free-solid-svg-icons";
import {
  FullExamRecord,
  ExamRoomAssignment,
  ExamInvigilatorAssignment,
  CandidateSnapshotItem,
  ExamCountdown,
} from "../../types";
import { getNepaliDateFromAD } from "../../lib/nepaliCalendar";
import { ExamSeatingWorkspace } from "./exam/ExamSeatingWorkspace";
import { OfficialMarksheetView } from "./exam/OfficialMarksheetView";

interface CourseOption {
  id: string;
  code: string;
  name: string;
  department?: string;
  credits?: number;
  semester?: number;
}

interface RoomOption {
  _id?: string;
  id?: string;
  name: string;
  building: string;
  roomNumber: string;
  capacity: number;
}

interface InvigilatorOption {
  userId: string;
  name: string;
  email: string;
  designation?: string;
  department?: string;
}

interface DashboardSummaryData {
  totalExams: number;
  publishedExams: number;
  todayExams: number;
  tomorrowExams: number;
  thisWeekExams: number;
  totalCandidates: number;
  pendingRoomAssignments: number;
  pendingInvigilatorAssignments: number;
  pendingResultsExams: number;
  verifiedResultsExams: number;
  publishedResultsExams: number;
}

interface AuditItem {
  id: string;
  action: string;
  details: string;
  actor: string;
  timestamp: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
}

export const ExaminationWorkspaceView: React.FC = () => {
  const { currentUser, language, setActiveView } = useCollegeOS();
  const { toast } = useToast();
  const permissions = new Set(currentUser?.permissions || []);
  const isExamOfficer = (currentUser?.roles || [currentUser?.role]).some((r) =>
    ["exam_officer", "super_admin", "registrar"].includes(r as string)
  );
  const isStudentOrFaculty = (currentUser?.roles || [currentUser?.role]).some((r) =>
    ["student", "faculty"].includes(r as string)
  );

  const canCreate = permissions.has("exam.create") || permissions.has("exams.create");
  const canEdit = permissions.has("exam.edit") || permissions.has("exams.update");
  const canPublish = permissions.has("exam.publish") || permissions.has("exams.create");
  const canReschedule = permissions.has("exam.reschedule") || permissions.has("exams.update");
  const canCancel = permissions.has("exam.cancel") || permissions.has("exams.update");
  const canManageResults = permissions.has("exam.manageResults") || permissions.has("exams.results.modify");
  const canVerifyResults = permissions.has("exam.verifyResults") || permissions.has("exams.results.modify");
  const canPublishResults = permissions.has("exam.publishResults") || permissions.has("exams.results.publish");
  const canSubmitResults = permissions.has("exam.results.submit");
  const canFinalizeResults = permissions.has("exam.results.finalize");
  const canRevokeResults = permissions.has("exam.results.revoke");
  const canCorrectResults = permissions.has("exam.results.correct");
  const canViewMarksheet = permissions.has("exam.results.marksheet");

  // Navigation tab
  type ExamTab =
    | "dashboard"
    | "schedule"
    | "create"
    | "calendar"
    | "candidates"
    | "rooms"
    | "invigilators"
    | "results"
    | "audit"
    | "seating";

  // Exam officers start on dashboard; students/faculty on schedule
  const [activeTab, setActiveTab] = useState<ExamTab>(isStudentOrFaculty ? "schedule" : "dashboard");
  useEffect(() => {
    if (activeTab === "rooms" && !isExamOfficer) {
      setActiveTab("schedule");
    }
  }, [activeTab, isExamOfficer]);

  // Editing state
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, unknown>>({});

  // Master Data State
  const [exams, setExams] = useState<FullExamRecord[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [availableRooms, setAvailableRooms] = useState<RoomOption[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<RoomOption | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [venueToDelete, setVenueToDelete] = useState<RoomOption | null>(null);
  const [editCapacity, setEditCapacity] = useState("");
  const [editName, setEditName] = useState("");
  const [editBuilding, setEditBuilding] = useState("");
  const [editRoomNumber, setEditRoomNumber] = useState("");
  const [editFacilities, setEditFacilities] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [availableInvigilators, setAvailableInvigilators] = useState<InvigilatorOption[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummaryData | null>(null);
  const [recentActivities, setRecentActivities] = useState<AuditItem[]>([]);

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProgram, setFilterProgram] = useState("ALL");
  const [filterSemester, setFilterSemester] = useState("ALL");
  const [filterCourse, setFilterCourse] = useState("ALL");
  const [filterType, setFilterType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  // Loading & Feedback
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Detailed Modal / Drawer Selection
  const [selectedExam, setSelectedExam] = useState<FullExamRecord | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [candidatesDrawerOpen, setCandidatesDrawerOpen] = useState(false);
  const [selectedExamCandidates, setSelectedExamCandidates] = useState<CandidateSnapshotItem[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  // Reschedule Modal State
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleStartTime, setRescheduleStartTime] = useState("10:00");
  const [rescheduleEndTime, setRescheduleEndTime] = useState("12:00");
  const [rescheduleRoom, setRescheduleRoom] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");

  // Cancel Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Results Management State
  const [examResults, setExamResults] = useState<
    {
      id: string;
      student_id: string;
      student_name: string;
      roll_number: string;
      section: string;
      program: string;
      semester: number;
      batch: string;
      course_code: string;
      course_name: string;
      marks: number;
      percentage: number | null;
      grade: string;
      grade_point: number | null;
      gpa: number | null;
      status: string;
      workflow_status: string;
      remarks: string;
      submitted_at: string | null;
      verified_at: string | null;
      finalized_at: string | null;
      published_at: string | null;
    }[]
  >([]);
  const [resultsExamInfo, setResultsExamInfo] = useState<{
    title: string;
    totalMarks: number;
    passMarks: number;
    course_code?: string;
    course_name?: string;
    resultsStatus?: string;
  } | null>(null);
  const [showMarksheet, setShowMarksheet] = useState(false);
  const [marksheetData, setMarksheetData] = useState<any>(null);
  const [selectedStudentResult, setSelectedStudentResult] = useState<any>(null);
  const [resultsExamId, setResultsExamId] = useState<string>("");

  // Audit Logs State
  const [examAuditLogs, setExamAuditLogs] = useState<AuditItem[]>([]);

  // -------------------------------------------------------------
  // Form State for "Create Examination"
  // -------------------------------------------------------------
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"MID_TERM" | "FINAL" | "PRACTICAL" | "UNIT_TEST" | "SUPPLEMENTARY">("FINAL");
  const [formAcademicYear, setFormAcademicYear] = useState("2083/84");
  const [formProgram, setFormProgram] = useState("BCA");
  const [formSemester, setFormSemester] = useState("4");
  const [formCourseId, setFormCourseId] = useState("");
  const [formExamDate, setFormExamDate] = useState("2026-10-15");
  const [formStartTime, setFormStartTime] = useState("10:00");
  const [formEndTime, setFormEndTime] = useState("12:00");
  const [formCandidateScope, setFormCandidateScope] = useState<"COURSE_SPECIFIC" | "SEMESTER_WIDE" | "PROGRAM_WIDE" | "SECTION_SPECIFIC" | "BATCH_SPECIFIC">("COURSE_SPECIFIC");
  const [formSection, setFormSection] = useState("ALL");
  const [formBatch, setFormBatch] = useState("2025");
  const [formInstructions, setFormInstructions] = useState("Students must present valid institutional ID card and arrive 15 minutes before exam commencement.");
  const [selectedRooms, setSelectedRooms] = useState<RoomOption[]>([]);
  const [selectedInvigilatorIds, setSelectedInvigilatorIds] = useState<string[]>([]);
  const [formStep, setFormStep] = useState<1 | 2 | 3 | 4>(1); // 1: Details & Scope, 2: Rooms & Invigilators, 3: Audience Preview, 4: Review & Publish

  // Live Auto-calculated Fields
  const formNepaliDate = useMemo(() => {
    return getNepaliDateFromAD(formExamDate) || "29 Ashwin 2083";
  }, [formExamDate]);

  const formDuration = useMemo(() => {
    try {
      const [sh, sm] = formStartTime.split(":").map(Number);
      const [eh, em] = formEndTime.split(":").map(Number);
      const diffMins = eh * 60 + em - (sh * 60 + sm);
      if (diffMins <= 0) return { label: "Invalid duration", hours: 0, valid: false };
      const hrs = diffMins / 60;
      return {
        label: hrs === 1 ? "1 hour" : Number.isInteger(hrs) ? `${hrs} hours` : `${Math.floor(hrs)}h ${diffMins % 60}m`,
        hours: hrs,
        valid: true,
      };
    } catch {
      return { label: "2 hours", hours: 2, valid: true };
    }
  }, [formStartTime, formEndTime]);

  // Real Audience Preview from API
  const [audiencePreview, setAudiencePreview] = useState<{
    candidateCount: number;
    candidates: CandidateSnapshotItem[];
    sectionBreakdown: Record<string, number>;
    assignedFaculty: { id: string; name: string; email: string }[];
  } | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  // -------------------------------------------------------------
  // Data Loading Effects
  // -------------------------------------------------------------
  const loadMasterData = async () => {
    setLoading(true);
    try {
      const [examData, courseData, roomData, invigData, summaryData] = await Promise.all([
        apiRequest<{ exams: FullExamRecord[] }>("/exams"),
        apiRequest<{ courses: CourseOption[] }>("/courses").catch(() => ({ courses: [] })),
        apiRequest<{ rooms: RoomOption[] }>("/exams/rooms").catch(() => ({ rooms: [] })),
        apiRequest<{ invigilators: InvigilatorOption[] }>("/exams/invigilators/available").catch(() => ({ invigilators: [] })),
        apiRequest<{ summary: DashboardSummaryData; recentActivity: AuditItem[] }>("/exams/dashboard-summary").catch(() => null),
      ]);

      setExams(examData.exams || []);
      setCourses(courseData.courses || []);
      setAvailableRooms(roomData.rooms || []);
      setAvailableInvigilators(invigData.invigilators || []);

      if (courseData.courses?.length > 0 && !formCourseId) {
        setFormCourseId(courseData.courses[0].id || courseData.courses[0].code);
      }

      if (roomData.rooms?.length > 0 && selectedRooms.length === 0) {
        setSelectedRooms([roomData.rooms[0]]);
      }

      if (summaryData) {
        setDashboardSummary(summaryData.summary);
        setRecentActivities(summaryData.recentActivity || []);
      }
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to load examination records." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMasterData();
  }, []);

  // Fetch real audience preview when entering Step 3
  const fetchAudiencePreview = async () => {
    setAudienceLoading(true);
    try {
      const params = new URLSearchParams({
        program: formProgram,
        semester: String(formSemester),
        courseId: formCourseId,
        candidateScope: formCandidateScope,
        sectionCode: formSection,
        batch: formBatch,
      });

      const res = await apiRequest<{
        candidateCount: number;
        candidates: CandidateSnapshotItem[];
        sectionBreakdown: Record<string, number>;
        assignedFaculty: { id: string; name: string; email: string }[];
      }>(`/exams/audience/preview?${params.toString()}`);

      setAudiencePreview(res);
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Could not preview audience." });
    } finally {
      setAudienceLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Filtered Examinations for Schedule Table
  // -------------------------------------------------------------
  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      if (filterProgram !== "ALL" && exam.program !== filterProgram) return false;
      if (filterSemester !== "ALL" && String(exam.semester) !== filterSemester) return false;
      if (filterCourse !== "ALL" && (exam.course_code !== filterCourse && exam.course_id !== filterCourse)) return false;
      if (filterType !== "ALL" && exam.examType !== filterType) return false;
      if (filterStatus !== "ALL" && exam.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = exam.title.toLowerCase().includes(q);
        const matchesCode = (exam.examCode || "").toLowerCase().includes(q);
        const matchesCourse = (exam.course_name || "").toLowerCase().includes(q) || (exam.course_code || "").toLowerCase().includes(q);
        const matchesRoom = (exam.room || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesCode && !matchesCourse && !matchesRoom) return false;
      }
      return true;
    });
  }, [exams, filterProgram, filterSemester, filterCourse, filterType, filterStatus, searchQuery]);

  // -------------------------------------------------------------
  // Actions: Create, Save Draft, Publish, Reschedule, Cancel
  // -------------------------------------------------------------
  const handleSaveExam = async (publishImmediately: boolean) => {
    setBusy(true);

    try {
      if (!formDuration.valid) {
        throw new Error("End time must be after start time.");
      }

      const invigilatorPayload = selectedInvigilatorIds.map((id) => {
        const inv = availableInvigilators.find((i) => i.userId === id);
        return {
          user: id,
          name: inv?.name || "Staff",
          email: inv?.email || "",
          role: "Invigilator",
          room: selectedRooms[0]?.name || "Exam Room",
        };
      });

      const res = await apiRequest<{ success: boolean; examId: string; message?: string }>("/exams", {
        method: "POST",
        body: JSON.stringify({
          title: formName || `${formCourseId} Final Examination`,
          examType: formType,
          academicYear: formAcademicYear,
          program: formProgram,
          semester: Number(formSemester),
          courseId: formCourseId,
          examDate: formExamDate,
          startTime: formStartTime,
          endTime: formEndTime,
          rooms: selectedRooms.map((r) => ({
            name: r.name,
            building: r.building,
            roomNumber: r.roomNumber,
            capacity: r.capacity,
          })),
          candidateScope: formCandidateScope,
          sectionCode: formSection,
          batch: formBatch,
          instructions: formInstructions,
          invigilators: invigilatorPayload,
          isDraft: !publishImmediately,
        }),
      });

      if (publishImmediately && res.examId) {
        await apiRequest(`/exams/${res.examId}/publish`, { method: "POST" });
        toast({ variant: "success", message: "Official examination published! Notifications, College Mail, and Notice created." });
      } else {
        toast({ variant: "success", message: "Examination draft saved successfully." });
      }

      await loadMasterData();
      setActiveTab("schedule");
      // Reset form
      setFormStep(1);
      setFormName("");
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to save examination." });
    } finally {
      setBusy(false);
    }
  };

  const handlePublishExistingExam = async (examId: string) => {
    if (!window.confirm("Are you sure you want to publish this examination? This will generate official notices, student alerts, and invigilator duties.")) {
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/exams/${examId}/publish`, { method: "POST" });
      toast({ variant: "success", message: "Examination published across CollegeOS." });
      await loadMasterData();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Publish failed." });
    } finally {
      setBusy(false);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam) return;
    setBusy(true);
    try {
      await apiRequest(`/exams/${selectedExam.id}/reschedule`, {
        method: "POST",
        body: JSON.stringify({
          newExamDate: rescheduleDate,
          newStartTime: rescheduleStartTime,
          newEndTime: rescheduleEndTime,
          newRoom: rescheduleRoom || selectedExam.room,
          reason: rescheduleReason,
        }),
      });
      setRescheduleModalOpen(false);
      toast({ variant: "success", message: `Examination "${selectedExam.title}" rescheduled. All affected parties notified.` });
      await loadMasterData();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to reschedule examination." });
    } finally {
      setBusy(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam) return;
    setBusy(true);
    try {
      await apiRequest(`/exams/${selectedExam.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason }),
      });
      setCancelModalOpen(false);
      toast({ variant: "success", message: `Examination "${selectedExam.title}" officially cancelled.` });
      await loadMasterData();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to cancel examination." });
    } finally {
      setBusy(false);
    }
  };

  // View Candidates Drawer
  const openCandidates = async (exam: FullExamRecord) => {
    setSelectedExam(exam);
    setCandidatesDrawerOpen(true);
    setCandidatesLoading(true);
    try {
      const res = await apiRequest<{ candidates: CandidateSnapshotItem[]; candidateCount: number }>(
        `/exams/${exam.id}/candidates`
      );
      setSelectedExamCandidates(res.candidates || []);
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to load candidates." });
    } finally {
      setCandidatesLoading(false);
    }
  };

  // View Results & Enter Marks
  const openResults = async (exam: FullExamRecord) => {
    setSelectedExam(exam);
    setResultsExamId(exam.id);
    setActiveTab("results");
  };

  const handleSaveMarks = async () => {
    if (!resultsExamId) return;
    setBusy(true);
    try {
      const payload = examResults.map((r) => ({
        studentId: r.student_id,
        marks: Number(r.marks || 0),
        remarks: r.remarks || "",
      }));
      const res = await apiRequest<{ success: boolean; savedCount: number; errors: string[] }>(
        `/exams/${resultsExamId}/results`,
        {
          method: "POST",
          body: JSON.stringify({ marks: payload }),
        }
      );
      toast({ variant: "success", message: "Marks saved for ${res.savedCount || 0} candidate(s)." });
      await loadMasterData();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Could not save marks." });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitResults = async () => {
    if (!resultsExamId) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; submitted: number; message: string }>(
        `/exams/${resultsExamId}/results/submit`,
        { method: "POST" }
      );
      toast({ variant: "success", message: res.message || "Results submitted for verification." });
      await openResults(selectedExam as FullExamRecord);
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Could not submit results." });
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyResults = async () => {
    if (!resultsExamId) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; verified: number; message: string }>(
        `/exams/${resultsExamId}/results/verify`,
        { method: "POST" }
      );
      toast({ variant: "success", message: res.message || "Results verified." });
      await openResults(selectedExam as FullExamRecord);
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Verification failed." });
    } finally {
      setBusy(false);
    }
  };

  const handleFinalizeResults = async () => {
    if (!resultsExamId) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; finalized: number; message: string }>(
        `/exams/${resultsExamId}/results/finalize`,
        { method: "POST" }
      );
      toast({ variant: "success", message: res.message || "Results finalized." });
      await openResults(selectedExam as FullExamRecord);
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Finalization failed." });
    } finally {
      setBusy(false);
    }
  };

  const handlePublishResults = async () => {
    if (!resultsExamId) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; published: number; message: string }>(
        `/exams/${resultsExamId}/results/publish`,
        { method: "POST" }
      );
      toast({ variant: "success", message: res.message || "Results published to students." });
      await openResults(selectedExam as FullExamRecord);
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Results publication failed." });
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeResults = async () => {
    if (!resultsExamId) return;
    const reason = prompt("Reason for revoking publication:", "Correction required") || "";
    if (!reason) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; revoked: number; message: string }>(
        `/exams/${resultsExamId}/results/revoke`,
        {
          method: "POST",
          body: JSON.stringify({ remarks: reason }),
        }
      );
      toast({ variant: "success", message: res.message || "Results revoked for correction." });
      await openResults(selectedExam as FullExamRecord);
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Could not revoke results." });
    } finally {
      setBusy(false);
    }
  };

  const handleViewMarksheet = async (studentId?: string) => {
    if (!resultsExamId) return;
    setShowMarksheet(true);
    setBusy(true);
    try {
      const url = studentId
        ? `/exams/${resultsExamId}/results/marksheet?studentId=${encodeURIComponent(studentId)}`
        : `/exams/${resultsExamId}/results/marksheet`;
      const res = await apiRequest<any>(url);
      setMarksheetData(res);
      setSelectedStudentResult(null);
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Could not load marksheet." });
    } finally {
      setBusy(false);
    }
  };

  const handleViewStudentResult = async (studentId: string) => {
    setBusy(true);
    try {
      const res = await apiRequest<{ result: any; gpa: string }>(
        `/exams/${resultsExamId}/results/marksheet?studentId=${encodeURIComponent(studentId)}`
      );
      setSelectedStudentResult(res);
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Could not load student result." });
    } finally {
      setBusy(false);
    }
  };

  // View Audit Trail
  // View Audit Trail
  const openAudit = async (exam: FullExamRecord) => {
    setSelectedExam(exam);
    setActiveTab("audit");
    setBusy(true);
    try {
      const res = await apiRequest<{ audit: AuditItem[] }>(`/exams/${exam.id}/audit`);
      setExamAuditLogs(res.audit || []);
    } catch {
      toast({ variant: "error", message: "Could not load exam audit records." });
    } finally {
      setBusy(false);
    }
  };

  // Countdown Badge Helper
  const renderCountdownBadge = (countdown?: ExamCountdown) => {
    if (!countdown) return null;
    const bgMap: Record<string, string> = {
      urgent: "bg-red-50 text-red-700 border-red-200 animate-pulse font-bold",
      important: "bg-amber-50 text-amber-700 border-amber-200 font-semibold",
      warning: "bg-orange-50 text-orange-700 border-orange-200 font-medium",
      reminder: "bg-blue-50 text-blue-700 border-blue-200",
      upcoming: "bg-emerald-50 text-emerald-700 border-emerald-200",
      neutral: "bg-slate-50 text-slate-700 border-slate-200",
      danger: "bg-red-100 text-red-800 border-red-300 font-bold",
    };
    const badgeStyle = bgMap[countdown.badgeClass] || bgMap.neutral;

    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${badgeStyle}`}>
        {countdown.badgeClass === "urgent" || countdown.badgeClass === "danger" ? (
          <FontAwesomeIcon icon={faTriangleExclamation} className="text-xs" />
        ) : (
          <FontAwesomeIcon icon={faClock} className="text-xs" />
        )}
        <span>{countdown.label}</span>
      </span>
    );
  };

  // -------------------------------------------------------------
  // Render Main Layout
  // -------------------------------------------------------------
  return (
    <div className="cos-page">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-[var(--color-primary)]/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              Institutional Operations
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-medium text-slate-500">Nepal Timezone (Asia/Kathmandu)</span>
          </div>
          <h1 className="mt-1.5 flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900">
            <FontAwesomeIcon icon={faFileLines} className="text-[var(--color-primary)]" />
            Official Examination Management System
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Single connected workflow for creating, auditing, scheduling, and publishing institutional examinations.
          </p>
        </div>

        {canCreate && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab("create");
                setFormStep(1);
              }}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
            >
              <FontAwesomeIcon icon={faPlus} /> Create Examination
            </button>
          </div>
        )}
      </header>

      {/* Tab Navigation */}
<nav aria-label="Examination tabs" className="flex flex-wrap gap-1 border-b border-slate-200 pb-1">
        {[
          { id: "schedule", label: "Exam Schedule", icon: faClipboardList },
          { id: "dashboard", label: "Operations Dashboard", icon: faGaugeHigh },
          { id: "calendar", label: "Exam Calendar", icon: faCalendarDays },
          { id: "candidates", label: "Candidate Directory", icon: faUsers },
          ...(isExamOfficer
            ? [{ id: "rooms", label: "Venues & Rooms", icon: faBuilding }]
            : []),
          { id: "invigilators", label: "Invigilators", icon: faUserTie },
          { id: "results", label: "Attendance & Results", icon: faAward },
          { id: "audit", label: "Audit Trail", icon: faClockRotateLeft },
          { id: "seating", label: "Seating Plan", icon: faChair },
].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as ExamTab)}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] ring-1 ring-inset ring-[var(--color-primary)]/20 font-semibold"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <FontAwesomeIcon icon={tab.icon} className="text-xs" />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: OPERATIONS DASHBOARD (Section 33) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
                <span>Today's Exams</span>
                <FontAwesomeIcon icon={faClock} className="text-blue-500" />
              </div>
               <p className="mt-2 text-2xl font-bold text-slate-900">{dashboardSummary?.todayExams ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">Scheduled on today's calendar</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
                <span>This Week</span>
                <FontAwesomeIcon icon={faCalendarDays} className="text-emerald-500" />
              </div>
               <p className="mt-2 text-2xl font-bold text-slate-900">{dashboardSummary?.thisWeekExams ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">Upcoming in next 7 days</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
                <span>Total Candidates</span>
                <FontAwesomeIcon icon={faUsers} className="text-purple-500" />
              </div>
               <p className="mt-2 text-2xl font-bold text-slate-900">{dashboardSummary?.totalCandidates ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">Total resolved candidate seats</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
                <span>Pending Results</span>
                <FontAwesomeIcon icon={faAward} className="text-amber-500" />
              </div>
              <p className="mt-2 text-3xl font-bold text-amber-700">{dashboardSummary?.pendingResultsExams ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">Exams requiring evaluation</p>
            </div>
          </div>

          {/* Quick Action Bar & Alerts */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-5">
            <h3 className="font-semibold text-blue-900">Quick Examination Actions</h3>
            <p className="text-xs text-blue-700">Official shortcuts for operational examination management:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("create");
                  setFormStep(1);
                }}
                className="cursor-pointer rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs"
              >
                + Schedule New Exam
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("rooms")}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Inspect Venue Capacities
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("invigilators")}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Assign Invigilators
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("calendar")}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                View Dual Calendar (AD/BS)
              </button>
            </div>
          </div>

          {/* Recent Examination Activity */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h3 className="font-semibold text-slate-900">Recent Examination Activity</h3>
            {recentActivities.filter((act) => {
              const action = (act.action || '').toUpperCase();
              if (action.includes('SEATING_PLAN_CANCELLED') || action.includes('SEATING_PLAN_RESET')) return false;
              if (action.includes('RESULTS_VERIFIED') || action.includes('RESULTS_SUBMITTED')) return false;
              if (action.includes('RESULT_MARKS_CHANGED')) return false;
              return true;
            }).length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No recent examination audit activity recorded.</p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100 text-sm">
                {recentActivities
                  .filter((act) => {
                    const action = (act.action || '').toUpperCase();
                    if (action.includes('SEATING_PLAN_CANCELLED') || action.includes('SEATING_PLAN_RESET')) return false;
                    if (action.includes('RESULTS_VERIFIED') || action.includes('RESULTS_SUBMITTED')) return false;
                    if (action.includes('RESULT_MARKS_CHANGED')) return false;
                    return true;
                  })
                  .map((act) => (
                  <div key={act.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-slate-800">{act.action}</span>
                      <p className="text-xs text-slate-500">{act.details}</p>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <span>{act.actor}</span>
                      <p>{new Date(act.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: EXAM SCHEDULE (Section 31) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "schedule" && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="relative min-w-[220px] flex-1">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-3 text-slate-400 text-xs" />
              <input
                type="text"
                placeholder="Search examination, course code, room..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>

            <select
              aria-label="Filter by Program"
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
            >
              <option value="ALL">All Programs</option>
              <option value="BCA">BCA</option>
              <option value="BSc.CSIT">BSc.CSIT</option>
              <option value="BBA">BBA</option>
            </select>

            <select
              aria-label="Filter by Semester"
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
            >
              <option value="ALL">All Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={String(s)}>Semester {s}</option>
              ))}
            </select>

            <select
              aria-label="Filter by Status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
            >
              <option value="ALL">All Statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="DRAFT">Draft</option>
              <option value="RESCHEDULED">Rescheduled</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setFilterProgram("ALL");
                setFilterSemester("ALL");
                setFilterCourse("ALL");
                setFilterType("ALL");
                setFilterStatus("ALL");
              }}
              className="cursor-pointer rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>

          {/* Schedule Table */}
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading authoritative examination schedule...</div>
          ) : filteredExams.length === 0 ? (
            <EmptyState
              icon={faCalendarDays}
              title="No examinations found"
              description="No examination records match your filter criteria or have been scheduled yet."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Examination &amp; Course</th>
                    <th className="px-4 py-3">Program / Sem</th>
                    <th className="px-4 py-3">English &amp; Nepali Date</th>
                    <th className="px-4 py-3">Time &amp; Venue</th>
                    <th className="px-4 py-3 text-center">Candidates</th>
                    <th className="px-4 py-3">Status &amp; Countdown</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExams.map((exam) => (
                    <tr key={exam.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{exam.title}</div>
                        <div className="text-xs text-slate-500">
                          <span className="font-mono font-medium text-[var(--color-primary)]">{exam.course_code}</span>
                          {" · "}{exam.course_name}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {exam.program} · Sem {exam.semester}
                        </span>
                        {exam.section_code && exam.section_code !== "ALL" && (
                          <div className="text-sm text-slate-400 mt-0.5">Sec: {exam.section_code}</div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{exam.examDate}</div>
                        <div className="text-xs text-slate-500">{exam.nepaliDate}</div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{exam.startTime} – {exam.endTime}</div>
                        <div className="text-xs text-slate-500 truncate max-w-[160px]">{exam.room}</div>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => void openCandidates(exam)}
                          className="cursor-pointer inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                        >
                          <FontAwesomeIcon icon={faUsers} className="text-xs" />
                          <span>{exam.candidateCount}</span>
                        </button>
                      </td>

                      <td className="px-4 py-3">
                        {renderCountdownBadge(exam.countdown)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Publish button if DRAFT */}
                          {canPublish && (exam.status === "DRAFT" || exam.status === "SCHEDULED") && (
                            <button
                              type="button"
                              onClick={() => void handlePublishExistingExam(exam.id)}
                              className="cursor-pointer rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                              title="Publish Examination officially to students"
                            >
                              Publish
                            </button>
                          )}

                          {/* Reschedule Button */}
                          {canReschedule && exam.status !== "CANCELLED" && exam.status !== "COMPLETED" && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedExam(exam);
                                setRescheduleDate(exam.examDate);
                                setRescheduleStartTime(exam.startTime);
                                setRescheduleEndTime(exam.endTime);
                                setRescheduleRoom(exam.room);
                                setRescheduleReason("");
                                setRescheduleModalOpen(true);
                              }}
                              className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              title="Reschedule Exam Date/Time"
                            >
                              <FontAwesomeIcon icon={faArrowsRotate} />
                            </button>
                          )}

                          {/* Cancel Button */}
                          {canCancel && exam.status !== "CANCELLED" && exam.status !== "COMPLETED" && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedExam(exam);
                                setCancelReason("");
                                setCancelModalOpen(true);
                              }}
                              className="cursor-pointer rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                              title="Cancel Examination"
                            >
                              <FontAwesomeIcon icon={faBan} />
                            </button>
                          )}

                          {/* Results / Marks Button */}
                          {canManageResults && (
                            <button
                              type="button"
                              onClick={() => void openResults(exam)}
                              className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              title="Enter / View Results"
                            >
                              <FontAwesomeIcon icon={faAward} />
                            </button>
                          )}

                          {/* Audit Button */}
                          <button
                            type="button"
                            onClick={() => void openAudit(exam)}
                            className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            title="Audit Log"
                          >
                            <FontAwesomeIcon icon={faClockRotateLeft} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: CREATE EXAMINATION WORKFLOW (Sections 4 - 16) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "create" && (
        <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          {/* Progress Indicator */}
          <div className="cos-page-header">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Create Official Examination</h2>
                <p className="text-xs text-slate-500">Step {formStep} of 4: Structured Institutional Examination Workflow</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <span className={`px-2 py-1 rounded ${formStep >= 1 ? "bg-[var(--color-primary)] text-white" : "bg-slate-100 text-slate-400"}`}>1. Details</span>
                <span>→</span>
                <span className={`px-2 py-1 rounded ${formStep >= 2 ? "bg-[var(--color-primary)] text-white" : "bg-slate-100 text-slate-400"}`}>2. Venues &amp; Staff</span>
                <span>→</span>
                <span className={`px-2 py-1 rounded ${formStep >= 3 ? "bg-[var(--color-primary)] text-white" : "bg-slate-100 text-slate-400"}`}>3. Audience Preview</span>
                <span>→</span>
                <span className={`px-2 py-1 rounded ${formStep >= 4 ? "bg-[var(--color-primary)] text-white" : "bg-slate-100 text-slate-400"}`}>4. Review &amp; Publish</span>
              </div>
            </div>
          </div>

          {/* STEP 1: Examination Details & Scope */}
          {formStep === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Exam Name / Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Semester 4 Final Examination"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Exam Type *
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    <option value="FINAL">Final Examination</option>
                    <option value="MID_TERM">Mid-Term Examination</option>
                    <option value="PRACTICAL">Practical Assessment</option>
                    <option value="UNIT_TEST">Unit Test</option>
                    <option value="SUPPLEMENTARY">Supplementary / Back Paper</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Academic Year *</label>
                  <input
                    type="text"
                    value={formAcademicYear}
                    onChange={(e) => setFormAcademicYear(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Program *</label>
                  <select
                    value={formProgram}
                    onChange={(e) => setFormProgram(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                  >
                    <option value="BCA">BCA (Bachelor of Computer Application)</option>
                    <option value="BSc.CSIT">BSc.CSIT (Computer Science &amp; IT)</option>
                    <option value="BBA">BBA (Business Administration)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Semester *</label>
                  <select
                    value={formSemester}
                    onChange={(e) => setFormSemester(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={String(s)}>Semester {s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Course / Subject *</label>
                <select
                  value={formCourseId}
                  onChange={(e) => setFormCourseId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                >
                  {courses.map((c) => (
                    <option key={c.id || c.code} value={c.id || c.code}>
                      {c.code} · {c.name} ({c.credits || 3} Credits)
                    </option>
                  ))}
                </select>
              </div>

              {/* Date & Time with Dynamic Nepali Date & Duration */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Schedule &amp; Dual Calendar Calculation</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">English Date (Gregorian) *</label>
                    <input
                      type="date"
                      required
                      value={formExamDate}
                      onChange={(e) => setFormExamDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Nepali Date (Bikram Sambat)</label>
                    <input
                      type="text"
                      readOnly
                      value={formNepaliDate}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 p-2 text-sm font-medium text-slate-700 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Start Time *</label>
                    <input
                      type="time"
                      required
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600">End Time *</label>
                    <input
                      type="time"
                      required
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-600">Computed Duration:</span>
                  <span className={`font-bold ${formDuration.valid ? "text-[var(--color-primary)]" : "text-red-600"}`}>
                    {formDuration.label}
                  </span>
                  <span className="text-slate-400">· Timezone: Asia/Kathmandu (UTC+5:45)</span>
                </div>
              </div>

              {/* Candidate Scope */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Candidate Scope *</label>
                  <select
                    value={formCandidateScope}
                    onChange={(e) => setFormCandidateScope(e.target.value as any)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                  >
                    <option value="COURSE_SPECIFIC">Course-specific (Only actively enrolled)</option>
                    <option value="SEMESTER_WIDE">Semester-wide (All semester students)</option>
                    <option value="PROGRAM_WIDE">Program-wide (All program cohorts)</option>
                    <option value="SECTION_SPECIFIC">Section-specific</option>
                    <option value="BATCH_SPECIFIC">Batch-specific</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Section</label>
                  <input
                    type="text"
                    value={formSection}
                    onChange={(e) => setFormSection(e.target.value.toUpperCase())}
                    placeholder="ALL or A1, A2"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Batch Cohort</label>
                  <input
                    type="text"
                    value={formBatch}
                    onChange={(e) => setFormBatch(e.target.value)}
                    placeholder="2025"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Instructions / Notes</label>
                <textarea
                  rows={2}
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab("schedule")}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!formDuration.valid}
                  onClick={() => {
                    if (!formName.trim()) {
                      setFormName(`Semester ${formSemester} ${formType} Examination`);
                    }
                    setFormStep(2);
                  }}
                  className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white shadow-xs disabled:opacity-50"
                >
                  Next: Assign Venues &amp; Staff →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Venue / Rooms & Invigilators */}
          {formStep === 2 && (
            <div className="space-y-6">
              {/* Rooms Selection */}
              <div>
                <h3 className="font-semibold text-slate-900">Select Exam Room / Venues</h3>
                <p className="text-xs text-slate-500">Supports multi-room assignment with capacity validation:</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {availableRooms.map((room) => {
                    const isSelected = selectedRooms.some((r) => r.name === room.name);
                    return (
                      <div
                        key={room.name}
                        onClick={() => {
                          if (isSelected) {
                            if (selectedRooms.length > 1) {
                              setSelectedRooms(selectedRooms.filter((r) => r.name !== room.name));
                            }
                          } else {
                            setSelectedRooms([...selectedRooms, room]);
                          }
                        }}
                        className={`cursor-pointer rounded-xl border p-3.5 transition ${
                          isSelected
                            ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] ring-1 ring-[var(--color-primary)]"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">{room.name}</span>
                          <span className="rounded bg-white px-2 py-0.5 text-xs font-mono font-medium text-slate-600 shadow-2xs">
                            Cap: {room.capacity}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {room.building} · Room {room.roomNumber}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs font-medium text-slate-600">
                  Total Allocated Capacity:{" "}
                  <span className="font-bold text-[var(--color-primary)]">
                    {selectedRooms.reduce((acc, r) => acc + r.capacity, 0)} seats
                  </span>
                </div>
              </div>

              {/* Invigilators Selection */}
              <div>
                <h3 className="font-semibold text-slate-900">Assign Examination Invigilators</h3>
                <p className="text-xs text-slate-500">Selected faculty/staff will receive official duty notifications:</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {availableInvigilators.map((inv) => {
                    const isAssigned = selectedInvigilatorIds.includes(inv.userId);
                    return (
                      <div
                        key={inv.userId}
                        onClick={() => {
                          if (isAssigned) {
                            setSelectedInvigilatorIds(selectedInvigilatorIds.filter((id) => id !== inv.userId));
                          } else {
                            setSelectedInvigilatorIds([...selectedInvigilatorIds, inv.userId]);
                          }
                        }}
                        className={`cursor-pointer rounded-xl border p-3.5 transition ${
                          isAssigned
                            ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] ring-1 ring-[var(--color-primary)]"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">{inv.name}</span>
                          {isAssigned && <FontAwesomeIcon icon={faCheck} className="text-xs text-[var(--color-primary)]" />}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 truncate">{inv.email}</div>
                        <div className="text-sm text-slate-400">{inv.designation || "Faculty"} · {inv.department}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setFormStep(1)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  ← Back to Details
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void fetchAudiencePreview();
                    setFormStep(3);
                  }}
                  className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white shadow-xs"
                >
                  Next: Preview Real Audience →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Real Database Audience Preview (Section 10) */}
          {formStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-slate-900">Audience Calculation &amp; Preview</h3>
                <p className="text-xs text-slate-500">Live query against institutional student &amp; enrollment records:</p>
              </div>

              {audienceLoading ? (
                <div className="py-12 text-center text-sm text-slate-500">Resolving candidate audience from database...</div>
              ) : audiencePreview ? (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                      <span className="text-xs font-semibold uppercase text-blue-800">Total Eligible Candidates</span>
                      <p className="mt-1 text-3xl font-bold text-blue-950">{audiencePreview.candidateCount}</p>
                      <p className="mt-1 text-xs text-blue-700">Enrolled and active students</p>
                    </div>

                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                      <span className="text-xs font-semibold uppercase text-emerald-800">Assigned Course Faculty</span>
                      <p className="mt-1 text-3xl font-bold text-emerald-950">{audiencePreview.assignedFaculty?.length || 0}</p>
                      <p className="mt-1 text-xs text-emerald-700">Instructors for this course</p>
                    </div>

                    <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
                      <span className="text-xs font-semibold uppercase text-purple-800">Selected Invigilators</span>
                      <p className="mt-1 text-3xl font-bold text-purple-950">{selectedInvigilatorIds.length}</p>
                      <p className="mt-1 text-xs text-purple-700">Assigned duty invigilators</p>
                    </div>
                  </div>

                  {/* Section Breakdown */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Section Distribution</h4>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {Object.entries(audiencePreview.sectionBreakdown || {}).map(([sec, count]) => (
                        <div key={sec} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs">
                          Section {sec}: <span className="font-bold text-[var(--color-primary)]">{count} candidates</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Registered candidate roster */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Registered Candidate Roster</h4>
                    <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="p-2">Student ID</th>
                            <th className="p-2">Full Name</th>
                            <th className="p-2">Section</th>
                            <th className="p-2">Attendance %</th>
                            <th className="p-2">Eligibility</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {audiencePreview.candidates.slice(0, 15).map((cand) => (
                            <tr key={cand.studentId}>
                              <td className="p-2 font-mono">{cand.studentId}</td>
                              <td className="p-2 font-medium">{cand.fullName}</td>
                              <td className="p-2">{cand.section}</td>
                              <td className="p-2">{cand.attendancePercentage}%</td>
                              <td className="p-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cand.isEligible ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                                  {cand.isEligible ? "ELIGIBLE" : "DEFICIT"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setFormStep(2)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  ← Back to Venues
                </button>
                <button
                  type="button"
                  onClick={() => setFormStep(4)}
                  className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white shadow-xs"
                >
                  Next: Review &amp; Confirmation →
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Review & Publish Confirmation (Section 15) */}
          {formStep === 4 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <span className="rounded bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-bold text-[var(--color-primary)] uppercase">
                      Official Review
                    </span>
                    <h3 className="mt-1 text-xl font-bold text-slate-900">{formName}</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500">Academic Year</span>
                    <p className="font-semibold text-slate-800">{formAcademicYear}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                  <div>
                    <span className="text-slate-500">Program &amp; Semester:</span>
                    <p className="font-bold text-slate-800 mt-0.5">{formProgram} · Semester {formSemester}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Course / Subject:</span>
                    <p className="font-bold text-slate-800 mt-0.5">
                      {courses.find((c) => c.id === formCourseId || c.code === formCourseId)?.name || formCourseId}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">English Date:</span>
                    <p className="font-bold text-slate-800 mt-0.5">{formExamDate}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Nepali Date:</span>
                    <p className="font-bold text-slate-800 mt-0.5">{formNepaliDate}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Time &amp; Duration:</span>
                    <p className="font-bold text-slate-800 mt-0.5">{formStartTime} – {formEndTime} ({formDuration.label})</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Allocated Venues:</span>
                    <p className="font-bold text-slate-800 mt-0.5">{selectedRooms.map((r) => r.name).join(", ")}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Candidate Scope:</span>
                    <p className="font-bold text-slate-800 mt-0.5">{formCandidateScope.replace("_", " ")}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Total Recipients:</span>
                    <p className="font-bold text-[var(--color-primary)] mt-0.5">
                      {audiencePreview?.candidateCount || 0} students + {selectedInvigilatorIds.length} invigilators
                    </p>
                  </div>
                </div>

                {/* Automation Banner */}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faCircleCheck} />
                    <span>Automated Operations upon Publishing:</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-emerald-800">
                    <li>Creates official Notice Center entry referencing this authoritative examination record.</li>
                    <li>Generates real-time in-app alerts and notifications to enrolled students, course faculty, and invigilators.</li>
                    <li>Sends official announcement message via College Mail from Examination Department.</li>
                    <li>Schedules automated reminders (7 days, 3 days, 1 day, and 2 hours before examination).</li>
                    <li>Saves immutable candidate snapshot for institutional audit integrity.</li>
                  </ul>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setFormStep(3)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  ← Back to Preview
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveExam(false)}
                    className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                  >
                    Save as Draft
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveExam(true)}
                    className="cursor-pointer rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                  >
                    {busy ? "Publishing Examination..." : "Publish Official Examination"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: INTERACTIVE EXAM CALENDAR (Section 32) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "calendar" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-slate-900">Interactive Institutional Examination Calendar</h3>
              <p className="text-xs text-slate-500">Live examination schedules rendered directly from database records:</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Legend:</span>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Published
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Scheduled
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {exams.map((ex) => (
              <div key={ex.id} className="rounded-xl border border-slate-200 p-4 hover:border-[var(--color-primary)] transition">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--color-primary)]">{ex.course_code}</span>
                  <span className="text-slate-500">{ex.examDate}</span>
                </div>
                <h4 className="mt-1 font-bold text-slate-900 text-sm truncate">{ex.title}</h4>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  <div>Nepali Date: <span className="font-medium text-slate-800">{ex.nepaliDate}</span></div>
                  <div>Time: <span className="font-medium text-slate-800">{ex.startTime} – {ex.endTime}</span></div>
                  <div>Venue: <span className="font-medium text-slate-800">{ex.room}</span></div>
                  <div>Candidates: <span className="font-semibold text-slate-900">{ex.candidateCount}</span></div>
                </div>
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
                  {renderCountdownBadge(ex.countdown)}
                  <button
                    type="button"
                    onClick={() => void openCandidates(ex)}
                    className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                  >
                    View Candidates →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 5: CANDIDATES DIRECTORY */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "candidates" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-slate-900">Examination Candidates &amp; Eligibility Directory</h3>
              <p className="text-xs text-slate-500">Live roster of eligible candidates across academic programs:</p>
            </div>
            <div className="text-xs font-medium text-slate-600">
              Total Recorded Candidates: {exams.reduce((acc, e) => acc + (e.candidateCount || 0), 0)}
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {exams.map((ex) => (
              <div key={ex.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{ex.title} ({ex.course_code})</div>
                  <div className="text-xs text-slate-500">
                    {ex.program} · Semester {ex.semester} · {ex.examDate} ({ex.nepaliDate})
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-700">{ex.candidateCount} Candidates</span>
                  <button
                    type="button"
                    onClick={() => void openCandidates(ex)}
                    className="cursor-pointer rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    View Roster
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 6: ROOMS & CAPACITY (Section 13) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "rooms" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-slate-900">Institutional Examination Rooms &amp; Venues</h3>
              <p className="text-xs text-slate-500">Available physical venues with capacity management &amp; conflict tracking:</p>
            </div>
             <span className="text-xs font-semibold text-slate-600">
               Total Venues: {availableRooms.length}
             </span>
             <button
               onClick={() => { setIsAddMode(true); setSelectedVenue(null); setEditName(""); setEditCapacity(""); setEditBuilding(""); setEditRoomNumber(""); setEditFacilities(""); setEditDescription(""); setIsEditModalOpen(true); }}
               className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
             >
               + Add Venue
             </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableRooms.map((rm) => (
              <div key={rm._id || rm.name} className="rounded-xl border border-slate-200 p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{rm.name}</span>
                  <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    Capacity: {rm.capacity}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{rm.building} · Room {rm.roomNumber}</div>
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>Facilities: CCTV, AC</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setSelectedVenue(rm); setEditName(rm.name); setEditCapacity(String(rm.capacity)); setEditBuilding(rm.building); setEditRoomNumber(rm.roomNumber); setEditFacilities(""); setEditDescription(""); setIsEditModalOpen(true); }}
                      className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { setVenueToDelete(rm); setIsDeleteModalOpen(true); }}
                      className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {isDeleteModalOpen && venueToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
                <h4 className="font-bold text-slate-900 mb-3">Delete Venue</h4>
                <p className="text-sm text-slate-600 mb-4">Are you sure you want to delete {venueToDelete.name}?</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setIsDeleteModalOpen(false)} className="rounded bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">Cancel</button>
                  <button
                    onClick={async () => {
                      await apiRequest(`/exams/rooms/${venueToDelete._id || venueToDelete.id}`, { method: "DELETE" });
                      setIsDeleteModalOpen(false);
                      loadMasterData();
                    }}
                    className="rounded bg-rose-600 px-3 py-1 text-xs font-semibold text-white"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
           )}
           {isEditModalOpen && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                   <h4 className="font-bold text-slate-900">{isAddMode ? "Add Venue & Room" : "Edit Venue & Room Details"}</h4>
                  <button onClick={() => setIsEditModalOpen(false)} className="text-slate-500 hover:text-slate-800">✕</button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-600">Venue / Room Name</label>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Capacity</label>
                    <input type="number" value={editCapacity} onChange={(e) => setEditCapacity(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Location / Block</label>
                    <input value={editBuilding} onChange={(e) => setEditBuilding(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Room Number</label>
                    <input value={editRoomNumber} onChange={(e) => setEditRoomNumber(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Facilities (comma separated)</label>
                    <input value={editFacilities} onChange={(e) => setEditFacilities(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" placeholder="CCTV, AC" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Description</label>
                    <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" rows={3} />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setIsEditModalOpen(false)} className="rounded bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">Cancel</button>
                  <button
                    onClick={async () => {
                      const payload = {
                        name: editName,
                        capacity: Number(editCapacity),
                        building: editBuilding,
                        roomNumber: editRoomNumber,
                        facilities: editFacilities.split(",").map((s) => s.trim()).filter(Boolean),
                        description: editDescription,
                      };
                      if (isAddMode) {
                        await apiRequest("/exams/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                      } else {
                        await apiRequest(`/exams/rooms/${selectedVenue?._id || selectedVenue?.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                      }
                      setIsAddMode(false);
                      setIsEditModalOpen(false);
                      loadMasterData();
                    }}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* ------------------------------------------------------------- */}
      {activeTab === "invigilators" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-slate-900">Examination Invigilators Directory</h3>
              <p className="text-xs text-slate-500">Institutional faculty and staff assigned to examination invigilation:</p>
            </div>
            <span className="text-xs font-semibold text-slate-600">
              {availableInvigilators.length} Staff Available
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {availableInvigilators.map((inv) => (
              <div key={inv.userId} className="rounded-xl border border-slate-200 p-3.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">{inv.name}</span>
                  <span className="text-xs font-medium text-slate-500">{inv.designation || "Faculty"}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{inv.email}</div>
                <div className="mt-2 text-sm text-slate-400">Department: {inv.department || "Academic"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 8: ATTENDANCE & RESULTS EVALUATION */}
      {/* ------------------------------------------------------------- */}
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

      {/* TAB 9: AUDIT TRAIL (Section 30) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "audit" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="font-bold text-slate-900">Examination Audit Log &amp; Governance History</h3>
            <p className="text-xs text-slate-500">Immutable trace of examination creation, scheduling, room changes, and result publishing:</p>
          </div>

          {examAuditLogs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No audit records for this exam yet.</p>
          ) : (
            <div className="space-y-3">
              {examAuditLogs.map((log) => (
                <div key={log.id} className="rounded-xl border border-slate-200 p-3.5 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 font-mono text-xs">{log.action}</span>
                    <span className="text-xs text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-slate-600 text-xs">{log.details}</p>
                  <div className="text-sm text-slate-400">Actor: {log.actor}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 10: SEATING PLAN (Exam venues, allocation & publication) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "seating" && <ExamSeatingWorkspace />}

      {/* ------------------------------------------------------------- */}
      {/* CANDIDATES ROSTER DRAWER (Section 10) */}
      {/* ------------------------------------------------------------- */}
      {candidatesDrawerOpen && selectedExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Candidate Audience Snapshot</h3>
                <p className="text-xs text-slate-500">{selectedExam.title} · {selectedExam.course_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setCandidatesDrawerOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            {candidatesLoading ? (
              <div className="py-12 text-center text-sm text-slate-500">Loading candidate snapshot...</div>
            ) : selectedExamCandidates.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No candidates recorded for this exam.</p>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>Total Candidates: {selectedExamCandidates.length}</span>
                  <span>Mandatory Attendance: 75%</span>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="p-2">Roll Number</th>
                      <th className="p-2">Full Name</th>
                      <th className="p-2">Section</th>
                      <th className="p-2">Attendance</th>
                      <th className="p-2">Eligibility Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedExamCandidates.map((cand) => (
                      <tr key={cand.studentId}>
                        <td className="p-2 font-mono font-medium">{cand.rollNumber || cand.studentId}</td>
                        <td className="p-2 font-medium text-slate-800">{cand.fullName}</td>
                        <td className="p-2">{cand.section}</td>
                        <td className="p-2 font-mono">{cand.attendancePercentage}%</td>
                        <td className="p-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cand.isEligible ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                            {cand.isEligible ? "ELIGIBLE" : "DEFICIT"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCandidatesDrawerOpen(false)}
                className="cursor-pointer rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900"
              >
                Close Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* RESCHEDULE MODAL (Section 28) */}
      {/* ------------------------------------------------------------- */}
      {rescheduleModalOpen && selectedExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form
            onSubmit={(e) => void handleRescheduleSubmit(e)}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Reschedule Examination</h3>
                <p className="text-xs text-slate-500">{selectedExam.title}</p>
              </div>
              <button type="button" onClick={() => setRescheduleModalOpen(false)} className="text-lg font-bold">×</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700">New English Date (AD) *</label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
                <span className="text-sm text-slate-500 mt-0.5 block">
                  Nepali Date: {getNepaliDateFromAD(rescheduleDate) || "—"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700">New Start Time *</label>
                  <input
                    type="time"
                    required
                    value={rescheduleStartTime}
                    onChange={(e) => setRescheduleStartTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">New End Time *</label>
                  <input
                    type="time"
                    required
                    value={rescheduleEndTime}
                    onChange={(e) => setRescheduleEndTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">New Venue / Room</label>
                <input
                  type="text"
                  value={rescheduleRoom}
                  onChange={(e) => setRescheduleRoom(e.target.value)}
                  placeholder="e.g. Block A · Room 205"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Reason for Rescheduling *</label>
                <textarea
                  required
                  rows={2}
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="Official institutional reason for revised schedule..."
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setRescheduleModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white shadow-xs"
              >
                {busy ? "Updating Schedule..." : "Confirm Schedule Revision"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* CANCEL MODAL (Section 29) */}
      {/* ------------------------------------------------------------- */}
      {cancelModalOpen && selectedExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form
            onSubmit={(e) => void handleCancelSubmit(e)}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-red-900 text-lg">Cancel Examination</h3>
              <button type="button" onClick={() => setCancelModalOpen(false)} className="text-lg font-bold">×</button>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to cancel <strong>{selectedExam.title}</strong>? Historical record will be preserved and all candidates will be notified.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Official Cancellation Reason *</label>
              <textarea
                required
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Institutional rationale for cancellation..."
                className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Keep Exam
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700"
              >
                {busy ? "Cancelling..." : "Confirm Official Cancellation"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

