import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../../services/apiClient";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { useToast } from "../../ui/ToastContainer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuilding,
  faChair,
  faUsers,
  faCalendarDays,
  faCheckCircle,
  faExclamationTriangle,
  faInfoCircle,
  faPlus,
  faSearch,
  faShuffle,
  faRightLeft,
  faRotateLeft,
  faPaperPlane,
  faCalendarPlus,
  faBan,
  faChevronDown,
  faChevronRight,
  faClock,
  faLayerGroup,
  faListCheck,
  faCircleCheck,
  faTriangleExclamation,
  faSpinner,
  faXmark,
  faSeedling,
} from "@fortawesome/free-solid-svg-icons";
import type {
  ExamVenue,
  ExamVenueStructure,
  SeatingPlanDetail,
  SeatingPlanListItem,
  SeatingPlanStats,
  StudentSeatingAssignment,
  FullExamRecord,
} from "../../../types";

interface EligibleCandidatePreview {
  eligibleCount: number;
  candidateCount: number;
  sectionBreakdown: Record<string, number>;
  candidates: {
    studentId: string;
    rollNumber: string;
    fullName: string;
    program: string;
    semester: number;
    section: string;
    attendancePercentage: number;
    isEligible: boolean;
    eligibilityReason: string;
  }[];
}

interface VenueRoomPayload {
  room: string;
  building: string;
  block: string;
  floor: string;
  roomNumber: string;
  name: string;
  capacity: number;
}

const SEMESTERS = [1, 2, 3, 4, 5, 6];
const TIMEZONES = [
  "Asia/Kathmandu",
  "UTC",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
];

export const ExamSeatingWorkspace: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();
  const permissions = new Set(currentUser?.permissions || []);
  const roles = (currentUser?.roles || [currentUser?.role]) as string[];
  const canManageSeating = permissions.has("exam.manageSeating");
  const isStudent = roles.includes("student") && !canManageSeating;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Venues
  const [venueStructures, setVenueStructures] = useState<ExamVenueStructure[]>([]);
  const [venues, setVenues] = useState<ExamVenue[]>([]);

  // Exams (for linking a seating plan to an existing examination)
  const [exams, setExams] = useState<FullExamRecord[]>([]);

  // Plans
  const [plans, setPlans] = useState<SeatingPlanListItem[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SeatingPlanDetail | null>(null);

  // Builder form
  const [formMode, setFormMode] = useState<"new" | "existing">("existing");
  const [formExamId, setFormExamId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState("FINAL");
  const [formAcademicYear, setFormAcademicYear] = useState("2083/84");
  const [formProgram, setFormProgram] = useState("BScIT");
  const [formSemester, setFormSemester] = useState("2");
  const [formExamDate, setFormExamDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("10:00");
  const [formEndTime, setFormEndTime] = useState("12:00");
  const [formScope, setFormScope] = useState("SEMESTER_WIDE");
  const [formSection, setFormSection] = useState("ALL");
  const [formBatch, setFormBatch] = useState("2025");
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);

  // Eligible preview
  const [eligiblePreview, setEligiblePreview] = useState<EligibleCandidatePreview | null>(null);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [builderStats, setBuilderStats] = useState<SeatingPlanStats | null>(null);

  // Venue creation
  const [venueModalOpen, setVenueModalOpen] = useState(false);
  const [venueForm, setVenueForm] = useState({ block: "", floor: "", roomName: "", capacity: 40 });

  // Room change dialog
  const [roomChangeOpen, setRoomChangeOpen] = useState(false);
  const [roomChangeFrom, setRoomChangeFrom] = useState("");
  const [roomChangeTo, setRoomChangeTo] = useState("");
  const [roomChangeStudentIds, setRoomChangeStudentIds] = useState("");
  const [revisionReason, setRevisionReason] = useState("");

  // Schedule publish dialog
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [scheduleTimezone, setScheduleTimezone] = useState("Asia/Kathmandu");

  // Student seating
  const [mySeating, setMySeating] = useState<StudentSeatingAssignment[]>([]);

  const loadVenues = useCallback(async () => {
    const res = await apiRequest<{ venues: ExamVenue[]; structure: ExamVenueStructure[] }>("/exams/venues");
    setVenues(res.venues || []);
    setVenueStructures(res.structure || []);
  }, []);

  const loadPlans = useCallback(async () => {
    const res = await apiRequest<{ plans: SeatingPlanListItem[] }>("/exams/seating");
    setPlans(res.plans || []);
  }, []);

  const loadExams = useCallback(async () => {
    const res = await apiRequest<{ exams: FullExamRecord[] }>("/exams").catch(() => ({ exams: [] as FullExamRecord[] }));
    setExams(res.exams || []);
  }, []);

  const loadMySeating = useCallback(async () => {
    const res = await apiRequest<{ seating: StudentSeatingAssignment[] }>("/student/exams/my-seating").catch(() => ({ seating: [] as StudentSeatingAssignment[] }));
    setMySeating(res.seating || []);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await Promise.all([
          loadVenues(),
          loadPlans(),
          loadExams(),
          isStudent ? loadMySeating() : Promise.resolve(),
        ]);
      } catch (err: unknown) {
        toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to load seating workspace." });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadVenues, loadPlans, loadExams, loadMySeating, isStudent, toast]);

  // Default exam date: tomorrow
  useEffect(() => {
    if (!formExamDate) {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      setFormExamDate(tomorrow);
    }
  }, [formExamDate]);

  const activeVenueRooms = useMemo(
    () => venues.filter((v) => v.isActive),
    [venues]
  );

  const selectedRooms = useMemo(
    () =>
      activeVenueRooms.filter((v) => selectedRoomIds.includes(v.id)),
    [activeVenueRooms, selectedRoomIds]
  );

  const totalSelectedCapacity = useMemo(
    () => selectedRooms.reduce((sum, r) => sum + r.capacity, 0),
    [selectedRooms]
  );

  // Eligible student preview (one continuous alphabetical list)
  const fetchEligiblePreview = async () => {
    setEligibleLoading(true);
    try {
      const params = new URLSearchParams({
        program: formProgram,
        semester: formSemester,
        candidateScope: formScope,
        sectionCode: formSection,
        batch: formBatch,
      });
      if (formMode === "new" || !formExamId) {
        const res = await apiRequest<EligibleCandidatePreview>(
          `/exams/seating/eligible?${params.toString()}`
        );
        setEligiblePreview(res);
      } else {
        const exam = exams.find((e) => e.id === formExamId);
        const res = await apiRequest<EligibleCandidatePreview>(
          `/exams/seating/eligible?${new URLSearchParams({
            program: exam?.program || formProgram,
            semester: String(exam?.semester || formSemester),
            candidateScope: exam?.candidateScope || formScope,
            sectionCode: exam?.section_code || formSection,
            batch: exam?.batch || formBatch,
          }).toString()}`
        );
        setEligiblePreview(res);
      }
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Could not resolve eligible students." });
    } finally {
      setEligibleLoading(false);
    }
  };

  // Compute builder stats client-side for the preview panel
  useEffect(() => {
    if (!eligiblePreview) {
      setBuilderStats(null);
      return;
    }
    setBuilderStats({
      eligibleCount: eligiblePreview.eligibleCount,
      totalCapacity: totalSelectedCapacity,
      allocatedCount: Math.min(eligiblePreview.eligibleCount, totalSelectedCapacity),
      unallocatedCount: Math.max(0, eligiblePreview.eligibleCount - totalSelectedCapacity),
      remainingSeats: Math.max(0, totalSelectedCapacity - eligiblePreview.eligibleCount),
      requiredAdditionalCapacity: Math.max(0, eligiblePreview.eligibleCount - totalSelectedCapacity),
      conflicts: [],
      sectionBreakdown: eligiblePreview.sectionBreakdown,
    });
  }, [eligiblePreview, totalSelectedCapacity]);

  const handleGeneratePlan = async () => {
    setBusy(true);
    try {
      if (selectedRooms.length === 0) {
        throw new Error("Select at least one examination room.");
      }
      if (formMode === "new" && !formTitle.trim()) {
        throw new Error("Examination name is required.");
      }
      const payload: Record<string, unknown> = {
        title: formTitle,
        examType: formType,
        academicYear: formAcademicYear,
        program: formProgram,
        semester: Number(formSemester),
        examDate: formExamDate,
        startTime: formStartTime,
        endTime: formEndTime,
        candidateScope: formScope,
        sectionCode: formSection,
        batch: formBatch,
        rooms: selectedRooms.map<VenueRoomPayload>((r) => ({
          room: r.id,
          building: r.building,
          block: r.block,
          floor: r.floor,
          roomNumber: r.roomNumber,
          name: r.name,
          capacity: r.capacity,
        })),
      };
      if (formMode === "existing" && formExamId) {
        payload.examId = formExamId;
      }
      const res = await apiRequest<{ planId: string; examId: string; stats: SeatingPlanStats; message?: string }>(
        "/exams/seating",
        { method: "POST", body: JSON.stringify(payload) }
      );
      if (res.stats?.requiredAdditionalCapacity > 0) {
        toast({
          variant: "error",
          message: `Plan generated with insufficient capacity: ${res.stats.requiredAdditionalCapacity} additional seat(s) required before publication.`,
        });
      } else {
        toast({ variant: "success", message: "Automatic alphabetical seating plan generated." });
      }
      await loadPlans();
      await openPlan(res.planId);
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to generate seating plan." });
    } finally {
      setBusy(false);
    }
  };

  const openPlan = async (planId: string) => {
    setBusy(true);
    try {
      const detail = await apiRequest<SeatingPlanDetail>(`/exams/seating/${planId}`);
      setSelectedPlan(detail);
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to load seating plan." });
    } finally {
      setBusy(false);
    }
  };

  const runPlanAction = async (path: string, method = "POST", body?: Record<string, unknown>, successMessage?: string) => {
    setBusy(true);
    try {
      const res = await apiRequest<{ message?: string; movedCount?: number; shuffleSeed?: number; status?: string }>(
        path,
        { method, body: body ? JSON.stringify(body) : undefined }
      );
      toast({ variant: "success", message: successMessage || res.message || "Action completed." });
      if (selectedPlan) await openPlan(selectedPlan.plan.id);
      await loadPlans();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Action failed." });
    } finally {
      setBusy(false);
    }
  };

  const handleShuffle = () => {
    if (!selectedPlan) return;
    if (selectedPlan.plan.status === "PUBLISHED" && !window.confirm("This plan is published. Shuffling creates an authorized revision that requires republishing. Continue?")) {
      return;
    }
    if (selectedPlan.plan.status === "PUBLISHED") {
      if (!revisionReason.trim()) {
        toast({ variant: "error", message: "A revision reason is required to modify a published plan." });
        setRoomChangeOpen(false);
        return;
      }
    }
    void runPlanAction(`/exams/seating/${selectedPlan.plan.id}/shuffle`, "POST",
      selectedPlan.plan.status === "PUBLISHED" ? { revisionReason: revisionReason.trim() } : undefined,
      "Seating shuffled. The same eligible student set is preserved.");
  };

  const handleReset = () => {
    if (!selectedPlan) return;
    if (selectedPlan.plan.status === "PUBLISHED" && !window.confirm("Restore the original alphabetical allocation? This creates an authorized revision that requires republishing.")) {
      return;
    }
    void runPlanAction(`/exams/seating/${selectedPlan.plan.id}/reset`, "POST",
      selectedPlan.plan.status === "PUBLISHED" ? { revisionReason: revisionReason.trim() || "Restored to alphabetical order" } : undefined,
      "Seating plan restored to alphabetical allocation.");
  };

  const handleRegenerate = () => {
    if (!selectedPlan) return;
    if (!window.confirm("Regenerate a new arrangement and preview it before republishing?")) return;
    void runPlanAction(`/exams/seating/${selectedPlan.plan.id}/regenerate`, "POST", {}, "Plan regenerated with a new arrangement.");
  };

  const handleRoomChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    if (!roomChangeFrom || !roomChangeTo) {
      toast({ variant: "error", message: "Select both source and target rooms." });
      return;
    }
    const studentIds = roomChangeStudentIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await runPlanAction(`/exams/seating/${selectedPlan.plan.id}/room-change`, "POST", {
      fromRoom: roomChangeFrom,
      toRoom: roomChangeTo,
      studentIds: studentIds.length > 0 ? studentIds : null,
      revisionReason: selectedPlan.plan.status === "PUBLISHED" ? revisionReason.trim() : null,
    });
    setRoomChangeOpen(false);
    setRoomChangeFrom("");
    setRoomChangeTo("");
    setRoomChangeStudentIds("");
  };

  const handlePublish = async () => {
    if (!selectedPlan) return;
    if (!window.confirm("Publish this seating plan? Students will immediately be able to view their own seat. This cannot be changed silently.")) {
      return;
    }
    await runPlanAction(`/exams/seating/${selectedPlan.plan.id}/publish`, "POST", undefined, "Seating plan published. Students can now view their own seats.");
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    if (!scheduleDateTime) {
      toast({ variant: "error", message: "Select a publication date and time." });
      return;
    }
    const publishAt = new Date(scheduleDateTime).toISOString();
    if (Number.isNaN(Date.parse(publishAt))) {
      toast({ variant: "error", message: "Invalid publication date." });
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{ message?: string; scheduledPublishAt: string; scheduledPublishTimezone: string }>(
        `/exams/seating/${selectedPlan.plan.id}/schedule`,
        { method: "POST", body: JSON.stringify({ publishAt, timezone: scheduleTimezone }) }
      );
      toast({
        variant: "success",
        message: `Publication scheduled for ${new Date(res.scheduledPublishAt).toLocaleString()} (${res.scheduledPublishTimezone}). The server scheduler publishes it automatically.`,
      });
      setScheduleOpen(false);
      if (selectedPlan) await openPlan(selectedPlan.plan.id);
      await loadPlans();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to schedule publication." });
    } finally {
      setBusy(false);
    }
  };

  const handleCancelPlan = async () => {
    if (!selectedPlan) return;
    const reason = window.prompt("Official reason for cancelling this seating plan:");
    if (reason === null) return;
    await runPlanAction(`/exams/seating/${selectedPlan.plan.id}/cancel`, "POST", { reason: reason || "Cancelled by Examination Department" }, "Seating plan cancelled.");
  };

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest("/exams/venues", {
        method: "POST",
        body: JSON.stringify({
          block: venueForm.block,
          floor: venueForm.floor,
          roomName: venueForm.roomName,
          capacity: Number(venueForm.capacity),
        }),
      });
      toast({ variant: "success", message: "Venue registered." });
      setVenueModalOpen(false);
      setVenueForm({ block: "", floor: "", roomName: "", capacity: 40 });
      await loadVenues();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to create venue." });
    } finally {
      setBusy(false);
    }
  };

  const toggleVenueActive = async (venue: ExamVenue) => {
    setBusy(true);
    try {
      await apiRequest(`/exams/venues/${venue.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !venue.isActive }),
      });
      toast({ variant: "success", message: venue.isActive ? "Venue deactivated." : "Venue reactivated." });
      await loadVenues();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to update venue." });
    } finally {
      setBusy(false);
    }
  };

  const updateVenueCapacity = async (venue: ExamVenue, capacity: number) => {
    setBusy(true);
    try {
      await apiRequest(`/exams/venues/${venue.id}`, {
        method: "PATCH",
        body: JSON.stringify({ capacity }),
      });
      toast({ variant: "success", message: "Venue capacity updated." });
      await loadVenues();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to update venue." });
    } finally {
      setBusy(false);
    }
  };

  const handleSeedVenues = async () => {
    setBusy(true);
    try {
      await apiRequest("/exams/venues/seed", { method: "POST" });
      toast({ variant: "success", message: "Venue registry synchronized — missing venues added, existing records preserved." });
      await loadVenues();
    } catch (err: unknown) {
      toast({ variant: "error", message: err instanceof Error ? err.message : "Failed to seed venues." });
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DRAFT: "bg-slate-100 text-slate-700",
      GENERATED: "bg-blue-100 text-blue-800",
      SCHEDULED: "bg-amber-100 text-amber-800",
      PUBLISHED: "bg-emerald-100 text-emerald-800",
      CANCELLED: "bg-red-100 text-red-800",
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles[status] || "bg-slate-100 text-slate-700"}`}>
        {status}
      </span>
    );
  };

  /* ------------------------- Student view ------------------------- */

  if (isStudent) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-slate-900">My Examination Seating</h3>
              <p className="text-xs text-slate-500">
                Your assigned room, bench and seat for every published examination.
              </p>
            </div>
            <FontAwesomeIcon icon={faChair} className="text-xl text-[var(--color-primary)]" />
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-400">
              <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Loading your seating assignments…
            </p>
          ) : mySeating.length === 0 ? (
            <div className="py-10 text-center">
              <FontAwesomeIcon icon={faInfoCircle} className="text-3xl text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                No published seating plan is available for you yet.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                The Examination Department publishes seating plans before each examination.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {mySeating.map((item) => (
                <div
                  key={`${item.planId}-${item.examId}`}
                  className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{item.examTitle}</p>
                      <p className="text-xs text-slate-500">
                        {item.examCode} · {item.program} · Semester {item.semester} · {item.academicYear}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                      Published
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                      <p className="font-semibold text-slate-500">Date</p>
                      <p className="mt-0.5 font-semibold text-slate-900">{item.examDate}</p>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                      <p className="font-semibold text-slate-500">Start Time</p>
                      <p className="mt-0.5 font-semibold text-slate-900">{item.startTime}</p>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                      <p className="font-semibold text-slate-500">Block / Floor</p>
                      <p className="mt-0.5 font-semibold text-slate-900">
                        {item.block} · {item.floor}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                      <p className="font-semibold text-slate-500">Room</p>
                      <p className="mt-0.5 font-semibold text-slate-900">{item.room}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--color-primary)] px-3 py-2 text-white">
                    <span className="text-xs font-semibold">
                      {item.fullName} · {item.studentId} · Section {item.section}
                    </span>
                    <span className="rounded bg-white/20 px-2 py-0.5 text-xs font-bold">
                      Bench {item.benchNumber} · Seat {item.seatNumber}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!canManageSeating) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        <FontAwesomeIcon icon={faChair} className="text-3xl text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-700">Examination Seating Management</p>
        <p className="mt-1 text-xs text-slate-500">
          Venue and seating management is restricted to the Examination Department (Exam Officer role and above).
        </p>
      </div>
    );
  }

  /* -------------------- Exam Officer management UI -------------------- */

  return (
    <div className="space-y-4">
      {/* Venue & Seating Management */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="font-bold text-slate-900">Venue &amp; Seating Management</h3>
            <p className="text-xs text-slate-500">
              Institutional examination venues grouped by block and floor.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSeedVenues()}
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <FontAwesomeIcon icon={faSeedling} className="mr-1.5" /> Sync Venue Registry
            </button>
            <button
              type="button"
              onClick={() => setVenueModalOpen(true)}
              className="cursor-pointer rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs"
            >
              <FontAwesomeIcon icon={faPlus} className="mr-1.5" /> Register Venue
            </button>
          </div>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">
            <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Loading venues…
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {venueStructures.map((block) => (
              <div key={block.block} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{block.block}</p>
                <div className="mt-2 space-y-2">
                  {block.floors.map((floorGroup) => (
                    <div key={floorGroup.floor}>
                      <p className="text-[11px] font-semibold text-slate-500">{floorGroup.floor}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {floorGroup.rooms.map((venue) => (
                          <div
                            key={venue.id}
                            className={`rounded-lg border bg-white p-2.5 shadow-xs ${venue.isActive ? "border-slate-200" : "border-slate-100 opacity-60"}`}
                            style={{ minWidth: "170px" }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-bold text-slate-800">{venue.roomName}</p>
                              <span className={`h-2 w-2 rounded-full ${venue.isActive ? "bg-emerald-500" : "bg-slate-300"}`} title={venue.isActive ? "Active" : "Inactive"} />
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-500">{venue.capacity} seats</p>
                            <div className="mt-1.5 flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                defaultValue={venue.capacity}
                                onBlur={(e) => {
                                  const cap = Number(e.target.value);
                                  if (Number.isFinite(cap) && cap > 0 && cap !== venue.capacity) {
                                    void updateVenueCapacity(venue, cap);
                                  }
                                }}
                                className="w-16 rounded border border-slate-200 px-1 py-0.5 text-[11px]"
                                title="Seat capacity"
                              />
                              <button
                                type="button"
                                onClick={() => void toggleVenueActive(venue)}
                                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${venue.isActive ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                              >
                                {venue.isActive ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Seating Plan Builder */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="border-b border-slate-200 pb-3">
          <h3 className="font-bold text-slate-900">Automatic Seating Plan Builder</h3>
          <p className="text-xs text-slate-500">
            Generate an alphabetical seating allocation across all sections of a semester.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormMode("existing")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${formMode === "existing" ? "bg-[var(--color-primary)] text-white" : "border border-slate-300 bg-white text-slate-700"}`}
              >
                Link Existing Examination
              </button>
              <button
                type="button"
                onClick={() => setFormMode("new")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${formMode === "new" ? "bg-[var(--color-primary)] text-white" : "border border-slate-300 bg-white text-slate-700"}`}
              >
                New Examination
              </button>
            </div>

            {formMode === "existing" ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700">Examination</label>
                <select
                  value={formExamId}
                  onChange={(e) => {
                    setFormExamId(e.target.value);
                    const exam = exams.find((x) => x.id === e.target.value);
                    if (exam) {
                      setFormProgram(exam.program);
                      setFormSemester(String(exam.semester));
                      setFormExamDate(exam.examDate);
                      setFormStartTime(exam.startTime);
                      setFormEndTime(exam.endTime);
                      setFormScope(exam.candidateScope);
                      setFormSection(exam.section_code || "ALL");
                      setFormBatch(exam.batch || "2025");
                      setFormTitle(exam.title);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                >
                  <option value="">Select an examination…</option>
                  {exams
                    .filter((e) => e.status !== "CANCELLED" && e.status !== "COMPLETED")
                    .map((exam) => (
                      <option key={exam.id} value={exam.id}>
                        {exam.title} — {exam.examDate} {exam.startTime} ({exam.program} Sem {exam.semester})
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">Examination Name *</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. BScIT Semester 4 Final Examination"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Type</label>
                  <select value={formType} onChange={(e) => setFormType(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm">
                    <option value="FINAL">Final</option>
                    <option value="MID_TERM">Mid-Term</option>
                    <option value="PRACTICAL">Practical</option>
                    <option value="UNIT_TEST">Unit Test</option>
                    <option value="SUPPLEMENTARY">Supplementary</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Academic Year</label>
                  <input type="text" value={formAcademicYear} onChange={(e) => setFormAcademicYear(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Program</label>
                  <input type="text" value={formProgram} onChange={(e) => setFormProgram(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Semester</label>
                  <select value={formSemester} onChange={(e) => setFormSemester(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm">
                    {SEMESTERS.map((s) => (
                      <option key={s} value={s}>Semester {["I", "II", "III", "IV", "V", "VI"][s - 1]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Exam Date *</label>
                  <input type="date" value={formExamDate} onChange={(e) => setFormExamDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Start Time *</label>
                  <input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">End Time *</label>
                  <input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Candidate Scope</label>
                  <select value={formScope} onChange={(e) => setFormScope(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm">
                    <option value="SEMESTER_WIDE">Semester Wide (all sections)</option>
                    <option value="COURSE_SPECIFIC">Course Specific</option>
                    <option value="PROGRAM_WIDE">Program Wide</option>
                    <option value="SECTION_SPECIFIC">Section Specific</option>
                    <option value="BATCH_SPECIFIC">Batch Specific</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Section</label>
                  <input type="text" value={formSection} onChange={(e) => setFormSection(e.target.value)} placeholder="ALL" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Batch</label>
                  <input type="text" value={formBatch} onChange={(e) => setFormBatch(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
                </div>
              </div>
            )}

            {/* Room selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Examination Rooms (in allocation order) *
              </label>
              <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {activeVenueRooms.map((venue) => {
                  const checked = selectedRoomIds.includes(venue.id);
                  const order = checked ? selectedRoomIds.indexOf(venue.id) + 1 : null;
                  return (
                    <label key={venue.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedRoomIds((prev) =>
                            checked ? prev.filter((id) => id !== venue.id) : [...prev, venue.id]
                          )
                        }
                      />
                      <span className="font-semibold text-slate-800">{venue.name}</span>
                      <span className="text-slate-400">({venue.floor})</span>
                      <span className="ml-auto text-slate-500">{venue.capacity} seats</span>
                      {order !== null && (
                        <span className="rounded bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-bold text-white">#{order}</span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Students are allocated in room order — the alphabetical sequence continues across room boundaries.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void fetchEligiblePreview()}
                disabled={eligibleLoading}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faUsers} className="mr-1.5" />
                {eligibleLoading ? "Resolving…" : "Resolve Eligible Students"}
              </button>
              <button
                type="button"
                onClick={() => void handleGeneratePlan()}
                disabled={busy || selectedRooms.length === 0}
                className="cursor-pointer rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faListCheck} className="mr-1.5" />
                {busy ? "Generating…" : "Generate Plan"}
              </button>
            </div>
          </div>

          {/* Preview stats panel */}
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Capacity &amp; Eligibility Preview</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-white p-2 border border-slate-200">
                  <p className="text-lg font-bold text-slate-900">{builderStats?.eligibleCount ?? eligiblePreview?.eligibleCount ?? "—"}</p>
                  <p className="text-[10px] text-slate-500">Eligible Students</p>
                </div>
                <div className="rounded-lg bg-white p-2 border border-slate-200">
                  <p className="text-lg font-bold text-slate-900">{selectedRooms.length > 0 ? totalSelectedCapacity : "—"}</p>
                  <p className="text-[10px] text-slate-500">Selected Seats</p>
                </div>
                <div className="rounded-lg bg-white p-2 border border-slate-200">
                  <p className="text-lg font-bold text-slate-900">{builderStats ? builderStats.allocatedCount : "—"}</p>
                  <p className="text-[10px] text-slate-500">Allocated</p>
                </div>
                <div className="rounded-lg bg-white p-2 border border-slate-200">
                  <p className={`text-lg font-bold ${builderStats && builderStats.requiredAdditionalCapacity > 0 ? "text-red-600" : "text-slate-900"}`}>
                    {builderStats ? builderStats.requiredAdditionalCapacity : "—"}
                  </p>
                  <p className="text-[10px] text-slate-500">Extra Seats Needed</p>
                </div>
              </div>
              {builderStats && builderStats.requiredAdditionalCapacity > 0 && (
                <p className="mt-2 rounded-lg bg-red-50 p-2 text-[11px] font-medium text-red-700">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1" />
                  Capacity is insufficient by {builderStats.requiredAdditionalCapacity} seat(s). Publication will be blocked.
                </p>
              )}
              {builderStats && builderStats.sectionBreakdown && Object.keys(builderStats.sectionBreakdown).length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold text-slate-500">Section breakdown (one continuous list):</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(builderStats.sectionBreakdown).map(([section, count]) => (
                      <span key={section} className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                        {section}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {eligiblePreview && (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Alphabetical Preview ({eligiblePreview.eligibleCount})
                </p>
                <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {eligiblePreview.candidates.slice(0, 50).map((c, i) => (
                    <div key={c.studentId} className="flex items-center gap-2 py-1 text-xs">
                      <span className="w-6 text-right text-slate-400">{i + 1}.</span>
                      <span className="font-medium text-slate-800">{c.fullName}</span>
                      <span className="text-slate-400">{c.studentId}</span>
                      <span className="ml-auto rounded bg-slate-100 px-1 text-[10px] text-slate-500">{c.section}</span>
                    </div>
                  ))}
                  {eligiblePreview.candidates.length > 50 && (
                    <p className="py-1 text-center text-[10px] text-slate-400">
                      …and {eligiblePreview.candidates.length - 50} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Plan list */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="border-b border-slate-200 pb-3">
          <h3 className="font-bold text-slate-900">Seating Plans</h3>
          <p className="text-xs text-slate-500">All generated seating allocations.</p>
        </div>
        {plans.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No seating plans generated yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Examination</th>
                  <th className="py-2 pr-3">Program / Sem</th>
                  <th className="py-2 pr-3">Date / Time</th>
                  <th className="py-2 pr-3">Eligible</th>
                  <th className="py-2 pr-3">Allocated</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-3 font-medium text-slate-800">{plan.title}</td>
                    <td className="py-2 pr-3 text-slate-600">{plan.program} · Sem {plan.semester}</td>
                    <td className="py-2 pr-3 text-slate-600">{plan.examDate} {plan.startTime}</td>
                    <td className="py-2 pr-3 text-slate-600">{plan.totalEligibleStudents}</td>
                    <td className="py-2 pr-3">
                      <span className={plan.requiredAdditionalCapacity > 0 ? "font-bold text-red-600" : "text-slate-600"}>
                        {plan.totalAllocatedSeats}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{statusBadge(plan.status)}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void openPlan(plan.id)}
                        className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Open Plan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Plan detail */}
      {selectedPlan && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between border-b border-slate-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900">{selectedPlan.plan.title}</h3>
                {statusBadge(selectedPlan.plan.status)}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {selectedPlan.plan.program} · Semester {selectedPlan.plan.semester} · {selectedPlan.plan.examDate} ·{" "}
                {selectedPlan.plan.startTime}–{selectedPlan.plan.endTime} · {selectedPlan.plan.candidateScope}
                {selectedPlan.plan.shuffleSeed !== null && ` · shuffled (seed ${selectedPlan.plan.shuffleSeed})`}
                {selectedPlan.plan.scheduledPublishAt && (
                  <> · scheduled for {new Date(selectedPlan.plan.scheduledPublishAt).toLocaleString()} ({selectedPlan.plan.scheduledPublishTimezone})</>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleShuffle()}
                disabled={busy}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faShuffle} className="mr-1.5" /> Shuffle Seating
              </button>
              <button
                type="button"
                onClick={() => void handleRegenerate()}
                disabled={busy}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faRotateLeft} className="mr-1.5" /> Regenerate
              </button>
              <button
                type="button"
                onClick={() => void handleReset()}
                disabled={busy}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faRightLeft} className="mr-1.5" /> Reset to Alphabetical
              </button>
              <button
                type="button"
                onClick={() => {
                  setRoomChangeFrom(selectedPlan.roomSummaries[0]?.name || "");
                  setRoomChangeTo(selectedPlan.roomSummaries[1]?.name || selectedPlan.roomSummaries[0]?.name || "");
                  setRoomChangeOpen(true);
                }}
                disabled={busy}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faRightLeft} className="mr-1.5" /> Change Room
              </button>
              {selectedPlan.plan.status !== "PUBLISHED" && selectedPlan.plan.status !== "CANCELLED" && (
                <>
                  <button
                    type="button"
                    onClick={() => void handlePublish()}
                    disabled={busy || selectedPlan.totals.requiredAdditionalCapacity > 0}
                    className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                    title={selectedPlan.totals.requiredAdditionalCapacity > 0 ? "Resolve insufficient capacity before publishing" : "Publish now"}
                  >
                    <FontAwesomeIcon icon={faPaperPlane} className="mr-1.5" /> Publish Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleOpen(true)}
                    disabled={busy}
                    className="cursor-pointer rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faCalendarPlus} className="mr-1.5" /> Schedule Publish
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCancelPlan()}
                    disabled={busy}
                    className="cursor-pointer rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faBan} className="mr-1.5" /> Cancel Plan
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-xl font-bold text-slate-900">{selectedPlan.totals.eligibleCount}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Eligible</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-xl font-bold text-slate-900">{selectedPlan.totals.totalCapacity}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Room Capacity</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-xl font-bold text-emerald-700">{selectedPlan.totals.allocatedCount}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Allocated</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-xl font-bold text-amber-600">{selectedPlan.totals.unallocatedCount}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Unallocated</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-xl font-bold text-slate-900">{selectedPlan.totals.remainingSeats}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Remaining Seats</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className={`text-xl font-bold ${selectedPlan.totals.requiredAdditionalCapacity > 0 ? "text-red-600" : "text-slate-900"}`}>
                {selectedPlan.totals.requiredAdditionalCapacity}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Extra Seats Needed</p>
            </div>
          </div>

          {selectedPlan.totals.requiredAdditionalCapacity > 0 && (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700">
              <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1.5" />
              Publication is blocked: {selectedPlan.totals.requiredAdditionalCapacity} additional seat(s) are required.
              Add more rooms or reduce the candidate scope. No student is silently excluded.
            </p>
          )}

          {selectedPlan.plan.status === "PUBLISHED" && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <label className="block text-xs font-semibold text-slate-700">Revision reason (required to modify a published plan)</label>
              <input
                type="text"
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                placeholder="Authorized reason for revising this published plan…"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              />
            </div>
          )}

          {/* Room seating charts */}
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {selectedPlan.roomSummaries.map((room) => (
              <div key={room.name} className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-2">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{room.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {room.assignedCount}/{room.capacity} seats · {room.benchCount} benches · {room.remainingSeats} free
                    </p>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-1.5">Student</th>
                        <th className="px-2 py-1.5">ID</th>
                        <th className="px-2 py-1.5">Sem</th>
                        <th className="px-2 py-1.5">Sec</th>
                        <th className="px-2 py-1.5">Bench</th>
                        <th className="px-3 py-1.5">Seat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {room.seatAssignments.map((a) => (
                        <tr key={`${a.studentId}-${a.benchNumber}-${a.seatNumber}`} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 font-medium text-slate-800">{a.fullName}</td>
                          <td className="px-2 py-1.5 text-slate-500">{a.studentId}</td>
                          <td className="px-2 py-1.5 text-slate-500">{a.semester}</td>
                          <td className="px-2 py-1.5 text-slate-500">{a.section}</td>
                          <td className="px-2 py-1.5 text-slate-700">{a.benchNumber}</td>
                          <td className="px-3 py-1.5">
                            <span className="rounded bg-[var(--color-primary-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary-strong)]">
                              Seat {a.seatNumber}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {room.seatAssignments.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-3 text-center text-slate-400">
                            No students allocated to this room.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Venue creation modal */}
      {venueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={(e) => void handleCreateVenue(e)}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900">Register Examination Venue</h3>
              <button type="button" onClick={() => setVenueModalOpen(false)} className="text-lg font-bold">×</button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Block / Building *</label>
              <input
                type="text"
                required
                value={venueForm.block}
                onChange={(e) => setVenueForm({ ...venueForm, block: e.target.value })}
                placeholder="e.g. Block A"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Floor</label>
              <input
                type="text"
                value={venueForm.floor}
                onChange={(e) => setVenueForm({ ...venueForm, floor: e.target.value })}
                placeholder="e.g. First Floor"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Room Name *</label>
              <input
                type="text"
                required
                value={venueForm.roomName}
                onChange={(e) => setVenueForm({ ...venueForm, roomName: e.target.value })}
                placeholder="e.g. Kinabalu"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Seat Capacity *</label>
              <input
                type="number"
                required
                min={1}
                value={venueForm.capacity}
                onChange={(e) => setVenueForm({ ...venueForm, capacity: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button type="button" onClick={() => setVenueModalOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white shadow-xs">
                {busy ? "Saving…" : "Register Venue"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Room change modal */}
      {roomChangeOpen && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={(e) => void handleRoomChange(e)}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900">Change Student Room</h3>
              <button type="button" onClick={() => setRoomChangeOpen(false)} className="text-lg font-bold">×</button>
            </div>
            <p className="text-xs text-slate-500">
              Move students from one room to another. Capacity is enforced and each student keeps exactly one seat.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Source Room *</label>
              <select value={roomChangeFrom} onChange={(e) => setRoomChangeFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm">
                {selectedPlan.roomSummaries.map((r) => (
                  <option key={r.name} value={r.name}>{r.name} ({r.assignedCount}/{r.capacity})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Target Room *</label>
              <select value={roomChangeTo} onChange={(e) => setRoomChangeTo(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm">
                {selectedPlan.roomSummaries.map((r) => (
                  <option key={r.name} value={r.name}>{r.name} ({r.assignedCount}/{r.capacity} used, {r.remainingSeats} free)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Student IDs (optional, comma-separated)</label>
              <input
                type="text"
                value={roomChangeStudentIds}
                onChange={(e) => setRoomChangeStudentIds(e.target.value)}
                placeholder="Leave empty to move every student in the source room"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              />
            </div>
            {selectedPlan.plan.status === "PUBLISHED" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700">Revision Reason * (published plan)</label>
                <input
                  type="text"
                  required
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button type="button" onClick={() => setRoomChangeOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white shadow-xs">
                {busy ? "Moving…" : "Confirm Room Change"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Schedule publish modal */}
      {scheduleOpen && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={(e) => void handleSchedule(e)}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900">Schedule Publication</h3>
              <button type="button" onClick={() => setScheduleOpen(false)} className="text-lg font-bold">×</button>
            </div>
            <p className="text-xs text-slate-500">
              The server publishes this seating plan automatically at the scheduled time — no browser or open page is required.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Publication Date &amp; Time *</label>
              <input
                type="datetime-local"
                required
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Institution Timezone</label>
              <select value={scheduleTimezone} onChange={(e) => setScheduleTimezone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm">
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button type="button" onClick={() => setScheduleOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs">
                {busy ? "Scheduling…" : "Confirm Schedule"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
