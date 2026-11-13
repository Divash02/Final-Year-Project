import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import * as QRCode from "qrcode";
import { ApiError, resolveAssetUrl } from "../../services/apiClient";
import {
  type AttendanceContext,
  type AttendanceSessionView,
  type CorrectionEntry,
  type QrCredential,
  type RosterStudent,
  type SessionDetailResponse,
  type SessionSummary,
  type SaveRegisterResponse,
  type CorrectionResponse,
  type MyAttendanceRecord,
  fetchAttendanceContext,
  fetchSessions,
  fetchSessionDetail,
  fetchMyAttendance,
  createAttendanceSession,
  saveRegisterApi,
  correctAttendance,
  requestQrToken,
  checkInWithQr,
} from "../../services/attendanceApi";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useToast } from "../../components/ui/ToastContainer";
import { EmptyState } from "../ui/EmptyState";
import { Alert } from "../ui/Alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookOpen,
  faCalendarDays,
  faChevronDown,
  faClock,
  faFloppyDisk,
  faGraduationCap,
  faHistory,
  faPenToSquare,
  faPlay,
  faQrcode,
  faRotate,
  faSearch,
  faTriangleExclamation,
  faUserCheck,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import AttendanceFilters from "./AttendanceFilters";
import StudentAttendanceCard from "./StudentAttendanceCard";
import StudentDetailDrawer from "./StudentDetailDrawer";
import {
  MARKS,
  MARK_STYLES,
  MARK_TO_STATUS,
  STATUS_TO_MARK,
  type Mark,
} from "./attendanceConstants";

function Avatar({ student, size = "md" }: { student: RosterStudent; size?: "md" | "sm" }) {
  const src = resolveAssetUrl(student.avatarUrl);
  const initials = `${student.firstName?.[0] || ""}${student.lastName?.[0] || ""}`.toUpperCase();
  const frame = size === "md" ? "h-12 w-12 text-sm" : "h-9 w-9 text-xs";

  return (
    <div
      className={`flex ${frame} shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-[var(--color-primary-soft)] font-bold text-[var(--color-primary-strong)]`}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden="true">{initials || "?"}</span>
      )}
    </div>
  );
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatClock(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date
    .toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    .toUpperCase();
}

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function errorMessage(requestError: unknown, fallback: string) {
  if (requestError instanceof ApiError && requestError.status >= 500) {
    return fallback;
  }
  return requestError instanceof Error ? requestError.message : fallback;
}

export const AttendanceWorkspaceView: React.FC = () => {
  const { currentRole, currentUser, activeAttendanceSessionId } = useCollegeOS();
  const { toast } = useToast();

  const permissions = useMemo(
    () => new Set(currentUser?.permissions || []),
    [currentUser?.permissions],
  );
  const isStudent = currentRole === "student";
  const canStartSession = permissions.has("attendance.session.create");
  const canMark = permissions.has("attendance.manual_mark");
  const canCorrect = permissions.has("attendance.edit");
  const canViewQr = permissions.has("attendance.session.create");

  const [context, setContext] = useState<AttendanceContext | null>(null);
  const [sessions, setSessions] = useState<AttendanceSessionView[]>([]);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [previousMarks, setPreviousMarks] = useState<Record<string, Mark>>({});
  const [previousRemarks, setPreviousRemarks] = useState<Record<string, string>>({});
  const [activeSession, setActiveSession] = useState<AttendanceSessionView | null>(null);
  const [myAttendance, setMyAttendance] = useState<MyAttendanceRecord[]>([]);

  const [academicYear, setAcademicYear] = useState("");
  const [batch, setBatch] = useState("");
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [courseId, setCourseId] = useState("");
  const [classType, setClassType] = useState("Lecture");
  const [classDate, setClassDate] = useState(today());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [selectedStudent, setSelectedStudent] = useState<RosterStudent | null>(null);
  const [detailStudent, setDetailStudent] = useState<RosterStudent | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<Mark>("P");
  const [correctionReason, setCorrectionReason] = useState("");

  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [qrCredential, setQrCredential] = useState<QrCredential | null>(null);
  const [qrImage, setQrImage] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const [undoStack, setUndoStack] = useState<
    Array<{ studentId: string; mark: Mark | undefined }>
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "id" | "status">("name");
  const [showBulkConfirm, setShowBulkConfirm] = useState<Mark | null>(null);
  const [markAllOpen, setMarkAllOpen] = useState(false);
  const markAllMenuRef = useRef<HTMLDivElement>(null);
  const [showSetup, setShowSetup] = useState(false);

  const isInstitutionScope = context?.mode === "institution";

  const loadSessions = useCallback(async () => {
    const result = await fetchSessions();
    setSessions(result.sessions);
    return result.sessions;
  }, []);

  const loadContext = useCallback(async () => {
    const result = await fetchAttendanceContext();
    setContext(result);
    return result;
  }, []);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    setRosterLoading(true);
    try {
      const result: SessionDetailResponse = await fetchSessionDetail(sessionId);
      setActiveSession(result.session);
      setRoster(result.students);
      const nextMarks: Record<string, Mark> = {};
      const nextRemarks: Record<string, string> = {};
      result.students.forEach((student) => {
        if (student.status && STATUS_TO_MARK[student.status]) {
          nextMarks[student.studentMongoId] = STATUS_TO_MARK[student.status];
        }
        nextRemarks[student.studentMongoId] = student.remarks || "";
      });
      setMarks(nextMarks);
      setRemarks(nextRemarks);
      setPreviousMarks(nextMarks);
      setPreviousRemarks(nextRemarks);
      setUndoStack([]);
      return result;
    } finally {
      setRosterLoading(false);
    }
  }, []);

  const adoptSession = useCallback(
    async (session: AttendanceSessionView) => {
      setCourseId(session.courseId);
      setClassType(session.classType);
      setClassDate(today());
      setStartTime(session.startTime || "");
      setEndTime(session.endTime || "");
      setSelectedSections(session.sectionCodes);
      if (session.academicYear) setAcademicYear(session.academicYear);
      if (session.batches.length > 0) setBatch(session.batches[0]);
      setShowSetup(false);
      await loadSessionDetail(session.id);
    },
    [loadSessionDetail],
  );

  /**
   * Latest register state, so event handlers can read the
   * previous mark without side effects inside state updaters.
   */
  const marksRef = useRef<Record<string, Mark>>({});
  marksRef.current = marks;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [, sessionList] = await Promise.all([loadContext(), loadSessions()]);
        if (!active) return;
        if (isStudent) {
          const own = await fetchMyAttendance();
          if (active) setMyAttendance(own.attendance);
          return;
        }
        /**
         * The register is never loaded implicitly. The teacher
         * first sees the session setup, pre-seeded with the most
         * relevant context — the session handed over by My
         * Timetable, the live open register, or the most recent
         * session — so confirming the context and opening the
         * register is a single deliberate click. The roster is
         * only fetched once the teacher opens the session.
         */
        if (activeSession) return;
        const handed = activeAttendanceSessionId
          ? sessionList.find((session) => session.id === activeAttendanceSessionId)
          : undefined;
        const seed =
          handed ||
          sessionList.find((session) => session.status === "OPEN") ||
          sessionList[0];
        if (seed) {
          setCourseId(seed.courseId);
          setClassType(seed.classType);
          setClassDate(today());
          setStartTime(seed.startTime || "");
          setEndTime(seed.endTime || "");
          setSelectedSections(seed.sectionCodes);
          if (seed.academicYear) setAcademicYear(seed.academicYear);
          if (seed.batches.length > 0) setBatch(seed.batches[0]);
        }
        setShowSetup(true);
      } catch (requestError: unknown) {
        if (active) setError(errorMessage(requestError, "Could not load attendance data."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, canStartSession, activeSession]);

  useEffect(() => {
    if (isStudent || !context || activeSession || context.mode === "institution") return;
    if (context.courses.length !== 1) return;
    const course = context.courses[0];
    setCourseId(course.id);
    setSelectedSections(course.sectionCodes);
  }, [context, isStudent, activeSession]);

  const hasUnsavedChanges = useMemo(() => {
    const marksChanged = roster.some(
      (student) => marks[student.studentMongoId] !== previousMarks[student.studentMongoId],
    );
    const remarksChanged = roster.some(
      (student) =>
        (remarks[student.studentMongoId] || "") !==
        (previousRemarks[student.studentMongoId] || ""),
    );
    return marksChanged || remarksChanged;
  }, [roster, marks, remarks, previousMarks, previousRemarks]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!markAllOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (markAllMenuRef.current && !markAllMenuRef.current.contains(event.target as Node)) {
        setMarkAllOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMarkAllOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [markAllOpen]);

  const availableCourses = context?.courses ?? [];
  const selectedCourse = availableCourses.find((course) => course.id === courseId);

  const availableSections = useMemo(() => {
    if (!context) return [];
    if (!isInstitutionScope) return context.sections;
    if (selectedCourse && selectedCourse.sectionCodes.length > 0) {
      return selectedCourse.sectionCodes;
    }
    return context.allSections;
  }, [context, isInstitutionScope, selectedCourse]);

  const setMark = useCallback((studentMongoId: string, mark: Mark) => {
    const previous = marksRef.current[studentMongoId];
    if (previous !== mark) {
      setUndoStack((stack) => [
        ...stack,
        { studentId: studentMongoId, mark: previous },
      ]);
    }
    setMarks((current) => ({ ...current, [studentMongoId]: mark }));
  }, []);

  const setRemark = useCallback((studentMongoId: string, remark: string) => {
    setRemarks((current) => ({ ...current, [studentMongoId]: remark }));
  }, []);

  const clearMark = useCallback((studentMongoId: string) => {
    const previous = marksRef.current[studentMongoId];
    if (previous) {
      setUndoStack((stack) => [...stack, { studentId: studentMongoId, mark: previous }]);
    }
    setMarks((current) => {
      if (!current[studentMongoId]) return current;
      const next = { ...current };
      delete next[studentMongoId];
      return next;
    });
  }, []);

  const setAll = useCallback(
    (mark: Mark) => {
      setMarks(() => {
        const next: Record<string, Mark> = {};
        roster.forEach((student) => {
          next[student.studentMongoId] = mark;
        });
        return next;
      });
    },
    [roster],
  );

  const toggleSection = useCallback((code: string) => {
    setSelectedSections((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setMarks((current) => {
      if (!last.mark) {
        if (!current[last.studentId]) return current;
        const next = { ...current };
        delete next[last.studentId];
        return next;
      }
      return { ...current, [last.studentId]: last.mark };
    });
    setUndoStack((stack) => stack.slice(0, -1));
  }, [undoStack]);

  const startSession = async () => {
    if (!courseId || selectedSections.length === 0) {
      setError("Select a course and at least one section before opening a session.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await createAttendanceSession({
        courseId,
        sectionCodes: selectedSections,
        academicYear: academicYear || undefined,
        batch: batch || undefined,
        semester: selectedCourse?.semester,
        classType: classType || undefined,
          date: today(),
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        topic: "",
      });
      await loadSessionDetail(result.sessionId);
      await loadSessions();
      setShowSetup(false);
      setNotice(
        result.alreadyOpen
          ? `Open session for ${result.session.courseCode} · ${result.session.sectionCodes.join(" + ")} loaded.`
          : `Session open for ${result.session.courseCode} · ${result.session.sectionCodes.join(" + ")}.`,
      );
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, "Could not open the attendance session."));
    } finally {
      setBusy(false);
    }
  };

  const saveRegister = async () => {
    if (!activeSession) return;
    setBusy(true);
    setSaveState("saving");
    setError("");
    try {
      const payload = roster.map((student) => ({
        studentId: student.studentMongoId,
        status: marks[student.studentMongoId]
          ? MARK_TO_STATUS[marks[student.studentMongoId]]
          : "Unmarked",
        remarks: remarks[student.studentMongoId] || "",
      }));
      const result = await saveRegisterApi(activeSession.id, payload);
      const savedMessage =
        `${result.savedCount} attendance mark(s) saved${
          result.clearedCount > 0 ? `, ${result.clearedCount} cleared` : ""
        } for ${activeSession.courseCode}.`;
      
      // Check if session was automatically closed by backend
      if (result.sessionClosed) {
        setNotice(`${savedMessage} Session closed automatically.`);
        setSaveState("saved");
        await loadSessions();
        // Redirect to landing page by clearing active session and showing setup
        setActiveSession(null);
        setShowSetup(true);
        setRoster([]);
        setMarks({});
        setRemarks({});
        setPreviousMarks({});
        setPreviousRemarks({});
        setUndoStack([]);
        setQrCredential(null);
        setShowQr(false);
        window.setTimeout(() => setSaveState("idle"), 3000);
      } else {
        setNotice(savedMessage);
        setSaveState("saved");
        await Promise.all([loadSessionDetail(activeSession.id), loadSessions()]);
        window.setTimeout(() => setSaveState("idle"), 3000);
      }
    } catch (requestError: unknown) {
      setError(
        errorMessage(requestError, "Unable to save attendance. Please try again."),
      );
      setSaveState("error");
    } finally {
      setBusy(false);
    }
  };

  const submitCorrection = async () => {
    if (!selectedStudent?.recordId) return;
    if (correctionReason.trim().length < 8) {
      setError("A correction reason of at least 8 characters is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await correctAttendance(
        selectedStudent.recordId,
        MARK_TO_STATUS[correctionStatus],
        correctionReason.trim(),
      );
      setNotice(
        `Attendance corrected for ${selectedStudent.name}. The change has been recorded in the audit trail.`,
      );
      setSelectedStudent(null);
      setCorrectionReason("");
      if (activeSession) {
        await Promise.all([loadSessionDetail(activeSession.id), loadSessions()]);
      }
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, "Could not record the correction."));
    } finally {
      setBusy(false);
    }
  };

  const requestQr = async () => {
    if (!activeSession) return;
    setBusy(true);
    setError("");
    try {
      const credential = await requestQrToken(activeSession.id);
      setQrCredential(credential);
      setShowQr(true);
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, "Could not issue an attendance code."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!qrCredential) {
      setQrImage("");
      setSecondsLeft(0);
      return;
    }
    void QRCode.toDataURL(qrCredential.qrToken, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: "M",
    }).then((dataUrl) => setQrImage(dataUrl));
    const tick = () =>
      setSecondsLeft(
        Math.max(
          0,
          Math.ceil((Date.parse(qrCredential.qrExpiresAt) - Date.now()) / 1000),
        ),
      );
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [qrCredential]);

  useEffect(() => {
    if (!showQr || secondsLeft > 0 || busy || !activeSession) return;
    setBusy(true);
    void requestQrToken(activeSession.id)
      .then(setQrCredential)
      .catch(() => setShowQr(false))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQr, secondsLeft, activeSession]);

  useEffect(() => {
    if (!scannerOpen) return;
    const scanner = new Html5Qrcode("attendance-qr-reader", {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false,
    });
    scannerRef.current = scanner;
    void scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedToken) => {
          setScannerOpen(false);
          void checkInWithQr(decodedToken)
            .then(() => {
              setNotice("Check-in recorded.");
              void fetchMyAttendance().then((own) => setMyAttendance(own.attendance));
            })
            .catch((requestError: unknown) =>
              setError(errorMessage(requestError, "Attendance check-in was rejected.")),
            );
        },
        () => undefined,
      )
      .catch(() => {
        toast({
          variant: "error",
          message: "Could not start the camera. Check browser permission and try again.",
          duration: 5000,
        });
        setScannerOpen(false);
      });
    return () => {
      if (scanner.isScanning) void scanner.stop().catch(() => undefined);
      scannerRef.current = null;
    };
  }, [scannerOpen]);

  const hasTeachingAssignments =
    isInstitutionScope || (context?.courses.length ?? 0) > 0;

  const filtersIncomplete = !courseId || selectedSections.length === 0;

  const markedCount = roster.filter((student) => marks[student.studentMongoId]).length;

  const liveSummary = useMemo(() => {
    const summary: SessionSummary = { Present: 0, Absent: 0, Late: 0, Bunk: 0, Excused: 0, Unmarked: 0 };
    roster.forEach((student) => {
      const mark = marks[student.studentMongoId];
      if (mark) {
        summary[MARK_TO_STATUS[mark] as keyof SessionSummary] += 1;
      } else {
        summary.Unmarked += 1;
      }
    });
    return summary;
  }, [roster, marks]);

  const filteredRoster = useMemo(() => {
    let list = [...roster];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (student) =>
          student.name.toLowerCase().includes(q) ||
          student.studentId.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((student) => {
        const mark = marks[student.studentMongoId];
        if (!mark) return statusFilter === "unmarked";
        return MARK_TO_STATUS[mark] === statusFilter;
      });
    }
    list.sort((a, b) => {
      const markA = marks[a.studentMongoId];
      const markB = marks[b.studentMongoId];
      const statusA = markA ? MARK_TO_STATUS[markA] : "Unmarked";
      const statusB = markB ? MARK_TO_STATUS[markB] : "Unmarked";
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "id":
          return a.studentId.localeCompare(b.studentId);
        case "status":
          return statusA.localeCompare(statusB);
        default:
          return 0;
      }
    });
    return list;
  }, [roster, searchQuery, statusFilter, sortBy, marks]);

  const handleCardMark = useCallback(
    (studentMongoId: string, mark: Mark) => setMark(studentMongoId, mark),
    [setMark],
  );

  const handleCardClear = useCallback(
    (studentMongoId: string) => clearMark(studentMongoId),
    [clearMark],
  );

  const handleCardRemark = useCallback(
    (studentMongoId: string, remark: string) => setRemark(studentMongoId, remark),
    [setRemark],
  );

  const handleBulkConfirm = useCallback(async () => {
    if (!showBulkConfirm) return;
    setAll(showBulkConfirm);
    setShowBulkConfirm(null);
  }, [showBulkConfirm, setAll]);

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div className="min-w-0">
          <p className="cos-eyebrow">Academic</p>
          <h1 className="cos-page-title">Attendance</h1>
          <p className="cos-page-subtitle">
            {isStudent
              ? "Your attendance record, read from the register your teachers submit."
              : "Take, review and manage attendance for scheduled academic sessions."}
          </p>
        </div>
        {activeSession &&
          activeSession.status === "OPEN" &&
          canViewQr && (
          <div className="flex flex-wrap gap-2">
            {canViewQr && (
              <button
                type="button"
                onClick={() => void requestQr()}
                disabled={busy}
                className="cos-btn cos-btn-secondary"
              >
                <FontAwesomeIcon icon={faQrcode} aria-hidden="true" />
                Attendance code
              </button>
            )}
          </div>
        )}
      </header>

      {error && (
        <Alert variant="error" autoDismissMs={7000} onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}
      {notice && <Alert variant="success" autoDismissMs={4000} onDismiss={() => setNotice("")}>{notice}</Alert>}

      {isStudent && (
        <section className="cos-card min-w-0 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]">
              <FontAwesomeIcon icon={faUserCheck} className="text-sm" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="cos-section-title">My Attendance History</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Recorded by your teacher. Contact the academic office to request a correction.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="px-5 py-6 text-sm text-slate-500">Loading your attendance…</p>
          ) : myAttendance.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={faCalendarDays}
                title="No attendance records yet"
                description="Once your teachers record attendance for the courses you are enrolled in, each session will appear here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {myAttendance.map((record) => {
                const mark = STATUS_TO_MARK[record.status];
                return (
                  <li
                    key={record.id}
                    className="flex min-w-0 flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {record.courseCode} · {record.courseName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(record.date)} · Section {record.section} · {record.classType}
                      </p>
                    </div>
                    {mark && (
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${MARK_STYLES[mark].idle}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${MARK_STYLES[mark].dot}`} aria-hidden="true" />
                        {record.status}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!isStudent && canStartSession && !loading && (showSetup || !activeSession) && (
        <AttendanceFilters
          context={context}
          isInstitutionScope={isInstitutionScope}
          academicYear={academicYear}
          batch={batch}
          courseId={courseId}
          classType={classType}
          selectedSections={selectedSections}
          classDate={classDate}
          startTime={startTime}
          endTime={endTime}
          busy={busy}
          activeSession={!!activeSession}
          filtersIncomplete={filtersIncomplete}
          onAcademicYearChange={setAcademicYear}
          onBatchChange={setBatch}
          onCourseChange={(value) => {
            setCourseId(value);
            setSelectedSections([]);
          }}
          onClassTypeChange={setClassType}
          onSectionToggle={toggleSection}
          onDateChange={setClassDate}
          onStartTimeChange={setStartTime}
          onEndTimeChange={setEndTime}
          onStartSession={() => void startSession()}
        />
      )}

      {!isStudent && !loading && !activeSession && (
        <section className="cos-card min-w-0" aria-label="No session opened">
          <div className="p-5">
            <EmptyState
              icon={faUsers}
              title="No session opened"
              description="Select or open an attendance session to load students."
            />
          </div>
        </section>
      )}

      {!isStudent && !loading && activeSession && (
        <section className="cos-card cos-rise min-w-0 overflow-hidden" aria-label="Attendance register">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <p className="cos-eyebrow">
                {activeSession.status === "OPEN" ? "Session open" : "Session closed"}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                {activeSession.courseCode} · {activeSession.courseName}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Section {activeSession.sectionCodes.join(" + ") || "—"} · {activeSession.classType}
                {activeSession.academicYear ? ` · ${activeSession.academicYear}` : ""}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <FontAwesomeIcon icon={faCalendarDays} className="text-[0.625rem]" aria-hidden="true" />
                {formatDate(activeSession.date)}
                {(activeSession.startTime || activeSession.endTime) && (
                  <>
                    <FontAwesomeIcon icon={faClock} className="ml-1 text-[0.625rem]" aria-hidden="true" />
                    {formatClock(activeSession.startTime) || "--:--"} –{" "}
                    {formatClock(activeSession.endTime) || "--:--"}
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <div
                role="status"
                aria-label="Attendance summary"
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5"
              >
                <span className="inline-flex items-center rounded-md bg-[var(--color-primary)] px-2.5 py-1 text-xs font-semibold text-white">
                  {markedCount} of {roster.length}
                </span>
                <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
                {MARKS.map((mark, index) => (
                  <React.Fragment key={mark.code}>
                    {index > 0 && <span className="h-4 w-px bg-slate-200" aria-hidden="true" />}
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className={`h-2 w-2 rounded-full ${MARK_STYLES[mark.code].dot}`} aria-hidden="true" />
                      <span className="font-semibold text-slate-700">
                        {liveSummary[MARK_TO_STATUS[mark.code] as keyof SessionSummary]}
                      </span>
                      <span className="text-slate-500">{mark.full}</span>
                    </span>
                  </React.Fragment>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowSetup(true)}
                disabled={busy}
                className="cos-btn cos-btn-secondary h-9 min-h-9 px-3 text-sm"
              >
                <FontAwesomeIcon icon={faPlay} aria-hidden="true" />
                New session
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <FontAwesomeIcon
                icon={faSearch}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Search students..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Search students"
                className="cos-input h-9 min-h-9 pl-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by status"
              className="cos-input h-9 min-h-9 w-auto cursor-pointer"
            >
              <option value="all">All statuses</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Late">Late</option>
              <option value="Bunk">Bunk</option>
              <option value="unmarked">Unmarked</option>
            </select>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
              aria-label="Sort roster"
              className="cos-input h-9 min-h-9 w-auto cursor-pointer"
            >
              <option value="name">Sort: Name</option>
              <option value="id">Sort: Student ID</option>
              <option value="status">Sort: Status</option>
            </select>
            <div className="relative" ref={markAllMenuRef}>
              <button
                type="button"
                onClick={() => setMarkAllOpen((previous) => !previous)}
                disabled={!canMark || roster.length === 0}
                className="cos-btn cos-btn-secondary h-9 min-h-9 px-3 text-sm"
                aria-haspopup="menu"
                aria-expanded={markAllOpen}
              >
                Mark all
                <FontAwesomeIcon icon={faChevronDown} className="text-[0.625rem]" aria-hidden="true" />
              </button>
              {markAllOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-1 w-44 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                >
                  {MARKS.map((mark) => (
                    <button
                      key={mark.code}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowBulkConfirm(mark.code);
                        setMarkAllOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-50"
                    >
                      <span className={`h-2 w-2 rounded-full ${MARK_STYLES[mark.code].dot}`} aria-hidden="true" />
                      All {mark.full}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {undoStack.length > 0 && (
              <button
                type="button"
                onClick={handleUndo}
                className="cos-btn cos-btn-secondary h-9 min-h-9 px-3 text-sm"
              >
                Undo
              </button>
            )}
          </div>

          {rosterLoading ? (
            <p className="px-5 py-6 text-sm text-slate-500">Loading enrolled students…</p>
          ) : roster.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={faUsers}
                title="No students on this register"
                description="There are currently no students enrolled in this course and section for the selected session."
              />
            </div>
          ) : (
            <ul className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredRoster.map((student) => (
                <StudentAttendanceCard
                  key={student.studentMongoId}
                  student={student}
                  mark={marks[student.studentMongoId]}
                  remark={remarks[student.studentMongoId] || ""}
                  onMark={handleCardMark}
                  onClear={handleCardClear}
                  onRemarkChange={handleCardRemark}
                  onCorrect={setSelectedStudent}
                  onViewStudent={setDetailStudent}
                  canMark={canMark && activeSession.status === "OPEN"}
                  canCorrect={canCorrect}
                />
              ))}
              {filteredRoster.length === 0 && (
                <li className="col-span-full">
                  <EmptyState
                    icon={faUsers}
                    title="No matching students"
                    description="Try adjusting your search or filter."
                  />
                </li>
              )}
            </ul>
          )}

          {activeSession.status === "OPEN" && canMark && roster.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <p className="text-xs text-slate-500">
                  {roster.length - markedCount} remaining.
                </p>
                {hasUnsavedChanges && (
                  <span className="text-xs font-medium text-[var(--color-warning)]">
                    Unsaved changes
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {hasUnsavedChanges && undoStack.length > 0 && (
                  <button type="button" onClick={handleUndo} className="cos-btn cos-btn-secondary">
                    Undo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void saveRegister()}
                  disabled={busy || markedCount === 0 || saveState === "saving"}
                  className="cos-btn cos-btn-primary"
                >
                  <FontAwesomeIcon icon={faFloppyDisk} aria-hidden="true" />
                  {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save attendance"}
                </button>
                {saveState === "error" && (
                  <button
                    type="button"
                    onClick={() => void saveRegister()}
                    className="cos-btn cos-btn-primary"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {!isStudent && !loading && (
        <section className="cos-card min-w-0 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]">
              <FontAwesomeIcon icon={faHistory} className="text-sm" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="cos-section-title">Attendance History</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {isInstitutionScope ? "Sessions across the institution." : "Your recorded sessions."}
              </p>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={faCalendarDays}
                title="No attendance session created yet"
                description="Select an assigned course and section to start recording attendance."
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sessions.map((session) => (
                <li key={session.id} className="min-w-0 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => void adoptSession(session)}
                    className="flex w-full min-w-0 flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {session.courseCode} · {session.courseName}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[0.6875rem] font-semibold ${
                            session.status === "OPEN"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {session.status}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-medium text-slate-600">
                          {session.classType}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(session.date)} · Section{" "}
                        {session.sectionCodes.join(" + ") || "—"}
                        {session.startTime && session.endTime
                          ? ` · ${formatClock(session.startTime)} – ${formatClock(session.endTime)}`
                          : ""}
                      </p>
                      {session.topic && (
                        <p className="mt-1 truncate text-xs italic text-slate-600">{session.topic}</p>
                      )}
                    </div>

                    {session.summary && (
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        {MARKS.map((mark) => {
                          const value =
                            session.summary?.[MARK_TO_STATUS[mark.code] as keyof SessionSummary] ?? 0;
                          if (value === 0) return null;
                          return (
                            <span
                              key={mark.code}
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[0.6875rem] font-semibold ${MARK_STYLES[mark.code].idle}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${MARK_STYLES[mark.code].dot}`} aria-hidden="true" />
                              {value} {mark.full}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!isStudent && !hasTeachingAssignments && !isInstitutionScope && (
        <EmptyState
          icon={faGraduationCap}
          title="No Teaching Assignments"
          description="You currently have no courses or sections assigned to you. Contact the academic administrator if this is unexpected."
        />
      )}

      {canCorrect && selectedStudent && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close correction"
            onClick={() => {
              setSelectedStudent(null);
              setCorrectionReason("");
            }}
            className="absolute inset-0 cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="correction-title"
            className="cos-rise relative w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar student={selectedStudent} />
                <div className="min-w-0">
                  <h2 id="correction-title" className="text-base font-semibold text-slate-900">
                    Correct attendance
                  </h2>
                  <p className="truncate text-xs text-slate-500">
                    {selectedStudent.name} · {selectedStudent.studentId} · Sec {selectedStudent.section}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedStudent(null)}
                className="cos-icon-btn h-9 w-9 shrink-0"
              >
                <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
              </button>
            </div>

            {selectedStudent.status && (
              <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Currently recorded as{" "}
                <span className="font-semibold text-slate-900">{selectedStudent.status}</span>
              </p>
            )}

            <fieldset className="mt-4">
              <legend className="cos-label">Corrected status</legend>
              <div className="grid grid-cols-4 gap-2">
                {MARKS.map((mark) => (
                  <button
                    key={mark.code}
                    type="button"
                    aria-pressed={correctionStatus === mark.code}
                    onClick={() => setCorrectionStatus(mark.code)}
                    className={`flex flex-col items-center gap-0.5 rounded-md border py-2 text-xs font-bold transition ${
                      correctionStatus === mark.code
                        ? MARK_STYLES[mark.code].active
                        : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                    }`}
                  >
                    {mark.code}
                    <span className="text-[0.625rem] font-semibold uppercase tracking-wide">
                      {mark.full}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="cos-label mt-4" htmlFor="correction-reason">
              Reason for correction <span className="text-red-600">*</span>
            </label>
            <textarea
              id="correction-reason"
              rows={3}
              value={correctionReason}
              onChange={(event) => setCorrectionReason(event.target.value)}
              placeholder="e.g. Student submitted an approved correction request"
              className="cos-input resize-y"
            />
            <p className="cos-helper">
              Recorded permanently in the attendance audit trail with your name and
              the time of the change.
            </p>

            {selectedStudent.corrections && selectedStudent.corrections.length > 0 && (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Previous corrections
                </p>
                <ul className="mt-2 space-y-1.5">
                  {selectedStudent.corrections.map((entry: CorrectionEntry, index: number) => (
                    <li key={`${entry.changedAt}-${index}`} className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {entry.from || "Unmarked"} → {entry.to}
                      </span>{" "}
                      by {entry.changedByName || "staff"} ·{" "}
                      {new Date(entry.changedAt).toLocaleString()}
                      {entry.reason && (
                        <span className="block text-slate-500">“{entry.reason}”</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="cos-btn cos-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitCorrection()}
                disabled={busy || correctionReason.trim().length < 8}
                className="cos-btn cos-btn-primary"
              >
                <FontAwesomeIcon icon={faPenToSquare} aria-hidden="true" />
                Save correction
              </button>
            </div>
          </div>
        </div>
      )}

      <StudentDetailDrawer
        student={detailStudent}
        sessionId={activeSession?.id ?? null}
        onClose={() => setDetailStudent(null)}
      />

      {showBulkConfirm && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="cos-rise relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 className="text-base font-semibold text-slate-900">
              Mark all {roster.length} students as {MARK_TO_STATUS[showBulkConfirm]}?
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              This will overwrite any existing marks for the current roster.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowBulkConfirm(null)}
                className="cos-btn cos-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkConfirm()}
                className="cos-btn cos-btn-primary"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {canViewQr && showQr && qrCredential && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close attendance code"
            onClick={() => setShowQr(false)}
            className="absolute inset-0 cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-qr-title"
            className="cos-rise relative w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 text-center shadow-xl"
          >
            <div className="flex items-start justify-between text-left">
              <div className="min-w-0">
                <h2 id="attendance-qr-title" className="text-base font-semibold text-slate-900">
                  Attendance code
                </h2>
                <p className="text-xs text-slate-500">Refreshes every 30 seconds</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowQr(false)}
                className="cos-icon-btn h-9 w-9 shrink-0"
              >
                <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
              </button>
            </div>
            <div className="my-4 flex justify-center">
              {qrImage ? (
                <img
                  src={qrImage}
                  alt="Short-lived attendance check-in code"
                  className="h-56 w-56"
                />
              ) : (
                <p className="py-20 text-sm text-slate-500">Preparing code…</p>
              )}
            </div>
            <p className="flex items-center justify-center gap-2 text-sm text-slate-600">
              <FontAwesomeIcon icon={faClock} aria-hidden="true" />
              Expires in {secondsLeft}s
              <FontAwesomeIcon icon={faRotate} aria-hidden="true" />
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Check-in confirms your authenticated account and an active
              enrolment. It does not independently prove physical presence.
            </p>
          </div>
        </div>
      )}

      {isStudent && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="cos-btn cos-btn-secondary"
          >
            <FontAwesomeIcon icon={faQrcode} aria-hidden="true" />
            Scan attendance code
          </button>
        </div>
      )}

      {scannerOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-scan-title"
            className="w-full max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <h2 id="attendance-scan-title" className="text-base font-semibold text-slate-900">
                Scan attendance code
              </h2>
              <button
                type="button"
                aria-label="Close scanner"
                onClick={() => setScannerOpen(false)}
                className="cos-icon-btn h-9 w-9"
              >
                <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
              </button>
            </div>
            <div id="attendance-qr-reader" className="w-full overflow-hidden" />
            <p className="text-xs text-slate-500">
              Camera access is used only while this scanner is open.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

export default AttendanceWorkspaceView;
