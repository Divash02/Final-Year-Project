import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faVideo,
  faUsers,
  faRotate,
  faPlus,
  faCalendarDays,
  faCircleDot,
  faCircleCheck,
  faTriangleExclamation,
  faServer,
  faMagnifyingGlass,
  faChalkboardUser,
  faHandshake,
  faCopy,
  faCheck,
  faArrowRight,
  faKey,
  faShieldHalved,
  faPlay,
  faStop,
  faDoorOpen,
  faEye,
  faEyeSlash,
} from "@fortawesome/free-solid-svg-icons";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { Button } from "../../ui/Button";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { Modal } from "../../ui/Modal";
import { Input, SelectField } from "../../ui/Input";
import { Table } from "../../ui/Table";
import { EmptyState } from "../../ui/EmptyState";
import { ConnectRoomClient } from "./ConnectRoomClient";
import { ConnectClassCard } from "./ConnectClassCard";
import {
  listConnectSessions,
  createConnectClass,
  createConnectMeeting,
  resolveConnectClassTarget,
  listConnectStaff,
  searchConnectCourses,
  resolveConnectCourseIdentity,
  resolveConnectCourseOfferings,
  listConnectCourseSections,
  listConnectCourseTeachers,
  regenerateConnectCredentials,
  getConnectConfig,
  joinConnectSession,
  startConnectSession,
  endConnectSession,
  getConnectCredentials,
} from "../../../services/connectApi";
import { formatDateTime12h, formatScheduleTime12h } from "../../../lib/institutionTime";

type Session = any;
type ConnectTab = "classes" | "meetings";

function formatSchedule(s: Session) {
  const date = s.scheduledDate || "";
  const start = formatScheduleTime12h(s.startTime);
  const end = formatScheduleTime12h(s.endTime);
  const time = start && end ? `${start}–${end}` : start || end || "";
  return [date, time].filter(Boolean).join(" · ") || "Schedule not set";
}

function statusVariant(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "LIVE" || status === "IN_PROGRESS") return "success";
  if (status === "SCHEDULED") return "info";
  if (status === "COMPLETED" || status === "ENDED") return "neutral";
  if (status === "CANCELLED" || status === "EXPIRED") return "danger";
  return "warning";
}

function targetSummary(t: any): string {
  if (!t || typeof t !== "object") return "—";
  const parts = [
    Array.isArray(t.programCodes) && t.programCodes[0] ? t.programCodes.join(", ") : null,
    Array.isArray(t.academicYears) && t.academicYears[0] ? t.academicYears.join(", ") : null,
    Array.isArray(t.semesters) && t.semesters[0] ? `Sem ${t.semesters.join(", ")}` : null,
    Array.isArray(t.batches) && t.batches[0] ? t.batches.join(", ") : null,
    Array.isArray(t.sectionCodes) && t.sectionCodes[0] ? `Sec ${t.sectionCodes.join(", ")}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "—";
}

async function writeClipboardText(text: string) {
  try { await navigator.clipboard.writeText(text); } catch {}
}

const MetricCard: React.FC<{ label: string; value: number; icon: any; tone?: string; bgTone?: string }> = ({ label, value, icon, tone = "text-slate-700", bgTone = "bg-slate-100" }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      </div>
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${bgTone} ${tone}`}>
        <FontAwesomeIcon icon={icon} aria-hidden="true" />
      </span>
    </div>
  </div>
);

export const ConnectWorkspaceView: React.FC = () => {
  const { currentUser, setActiveView } = useCollegeOS() as any;
  const perms = new Set<string>(currentUser?.permissions || []);
  const roles = (currentUser?.roles || []) as string[];
  const isStudent = roles.length > 0 && roles.every((r) => r === "student");
  const isAdmin = perms.has("connect.admin") || perms.has("accounts.manage");
  const canViewClasses = perms.has("connect.class.view") || perms.has("connect.view");
  const canManageMeetings = perms.has("connect.meeting.view") || perms.has("connect.meeting.create") || perms.has("connect.meeting.manage");
  // CRITICAL: Institutional Meetings must be completely invisible to students (UI defense in depth; backend is authoritative).
  const canSeeMeetings = !isStudent && canManageMeetings;
  const canCreateClass = perms.has("connect.class.create");
  const canCreateMeeting = !isStudent && perms.has("connect.meeting.create");

  const [tab, setTab] = useState<ConnectTab>("classes");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [activeRoom, setActiveRoom] = useState<{ sessionId: string; credential?: { sessionId16?: string; password?: string } | null } | null>(null);
  const [joinPrompt, setJoinPrompt] = useState<Session | null>(null);
  const [joinCredId, setJoinCredId] = useState("");
  const [joinCredPassword, setJoinCredPassword] = useState("");
  const [showJoinPassword, setShowJoinPassword] = useState(false);
  const [joining, setJoining] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Create class modal (course-driven)
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [classStep, setClassStep] = useState(1);
  const [classAttemptStep, setClassAttemptStep] = useState(0);
  const [classTitle, setClassTitle] = useState("");
  const [classDescription, setClassDescription] = useState("");
  const [classDate, setClassDate] = useState("");
  const [classStart, setClassStart] = useState("");
  const [classEnd, setClassEnd] = useState("");
  // Step 1 — course identity (real curriculum)
  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [courseSuggestions, setCourseSuggestions] = useState<any[]>([]);
  const [courseSearchLoading, setCourseSearchLoading] = useState(false);
  const [courseIdentity, setCourseIdentity] = useState<any>(null); // validated name+code identity
  const [courseIdentityError, setCourseIdentityError] = useState<string | null>(null);
  // Step 2 — offering/section/teacher (auto-derived from course; server-validated)
  const [offerings, setOfferings] = useState<any[]>([]);
  const [offeringsLoading, setOfferingsLoading] = useState(false);
  const [offeringsError, setOfferingsError] = useState<string | null>(null);
  const [selectedOfferingKey, setSelectedOfferingKey] = useState("");
  const [program, setProgram] = useState("");
  const [semester, setSemester] = useState("");
  const [sectionCode, setSectionCode] = useState("");
  const [allSections, setAllSections] = useState(false);
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [courseId, setCourseId] = useState("");
  const [assignedTeacherId, setAssignedTeacherId] = useState("");
  const [sections, setSections] = useState<any[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teachersError, setTeachersError] = useState<string | null>(null);
  const [resolvePreview, setResolvePreview] = useState<any>(null);
  const [resolving, setResolving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [creatingClass, setCreatingClass] = useState(false);
  const [issued, setIssued] = useState<any>(null);
  const [showIssued, setShowIssued] = useState(false);

  // Admin credential management modal
  const [credModalSession, setCredModalSession] = useState<Session | null>(null);
  const [credModalCredentials, setCredModalCredentials] = useState<any>(null);
  const [credModalLoading, setCredModalLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyResetRef = useRef<number | null>(null);

  const copyText = useCallback(async (text: string, key: string) => {
    if (!text) return;
    await writeClipboardText(text);
    setCopiedKey(key);
    if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
    copyResetRef.current = window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
      copyResetRef.current = null;
    }, 1500);
  }, []);

  useEffect(() => () => {
    if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
  }, []);

  // Meeting modal
  const [showCreateMeeting, setShowCreateMeeting] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDescription, setMeetingDescription] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingStart, setMeetingStart] = useState("");
  const [meetingEnd, setMeetingEnd] = useState("");
  const [staffQuery, setStaffQuery] = useState("");
  const [staffOptions, setStaffOptions] = useState<any[]>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>([]);
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: any = await listConnectSessions();
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load Connect sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); (async () => { try { setConfig(await getConnectConfig()); } catch { setConfig(null); } })(); }, [load]);

  useEffect(() => {
    if (!canCreateMeeting) return;
    const t = setTimeout(async () => {
      try { const data: any = await listConnectStaff(staffQuery); setStaffOptions(Array.isArray(data?.users) ? data.users : []); }
      catch { setStaffOptions([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [staffQuery, canCreateMeeting]);

  useEffect(() => { if (!canSeeMeetings && tab === "meetings") setTab("classes"); }, [canSeeMeetings, tab]);

  // Step 1: search curriculum courses as admin types (real records; debounced).
  useEffect(() => {
    if (!showCreateClass) return;
    const q = (courseSearch || courseCode || courseName).trim();
    if (q.length < 2) { setCourseSuggestions([]); return; }
    let active = true;
    const t = setTimeout(async () => {
      setCourseSearchLoading(true);
      try {
        const data: any = await searchConnectCourses({ q, courseName: courseName || undefined, courseCode: courseCode || undefined, limit: 30 });
        if (active) setCourseSuggestions(Array.isArray(data?.courses) ? data.courses : []);
      } catch { if (active) setCourseSuggestions([]); }
      finally { if (active) setCourseSearchLoading(false); }
    }, 220);
    return () => { active = false; clearTimeout(t); };
  }, [showCreateClass, courseSearch, courseName, courseCode]);

  function applyCourseSuggestion(c: any) {
    setCourseName(c?.courseName || c?.name || "");
    setCourseCode(c?.courseCode || c?.code || "");
    setCourseSearch("");
    setCourseSuggestions([]);
    setCourseIdentity(null);
    setCourseIdentityError(null);
    clearStep2();
  }

  function clearStep2() {
    setOfferings([]); setSelectedOfferingKey(""); setCourseId("");
    setProgram(""); setSemester(""); setAcademicYear(""); setBatch(""); setSectionCode(""); setAllSections(false);
    setSections([]); setTeachers([]); setAssignedTeacherId("");
    setOfferingsError(null); setSectionsError(null); setTeachersError(null); setResolvePreview(null);
  }

  async function validateCourseIdentity(): Promise<boolean> {
    setCourseIdentityError(null);
    try {
      const data: any = await resolveConnectCourseIdentity({ courseName, courseCode });
      setCourseIdentity(data);
      return !!data?.valid;
    } catch (e: any) {
      setCourseIdentity(null);
      setCourseIdentityError(e?.message || "Course name/code is not valid.");
      return false;
    }
  }

  // Step 2: resolve valid academic offerings once identity/course is chosen.
  useEffect(() => {
    if (!showCreateClass || !courseId) { setOfferings([]); return; }
    let active = true;
    setOfferingsLoading(true); setOfferingsError(null);
    (async () => {
      try {
        const data: any = await resolveConnectCourseOfferings({ courseId, courseName, courseCode });
        if (!active) return;
        const offs = Array.isArray(data?.offerings) ? data.offerings : [];
        setOfferings(offs);
        if (offs.length === 1) selectOffering(offs[0]);
      } catch (e: any) { if (active) { setOfferings([]); setOfferingsError(e?.message || "Could not resolve academic offerings for this subject."); } }
      finally { if (active) setOfferingsLoading(false); }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreateClass, courseId]);

  function offeringKey(o: any) { return [o.courseId, o.programCode || o.program || "", o.academicYear || "", o.semester ?? ""].join("|"); }

  function selectOffering(o: any) {
    setSelectedOfferingKey(offeringKey(o));
    setCourseId(String(o.courseId));
    setProgram(String(o.program || o.programCode || ""));
    setAcademicYear(String(o.academicYear || ""));
    setSemester(o.semester != null ? String(o.semester) : "");
    setBatch(o.batch ? String(o.batch) : "");
    setSectionCode(""); setAllSections(false); setAssignedTeacherId("");
    setTeachers([]); setSections([]); setResolvePreview(null); setTeachersError(null); setSectionsError(null);
  }

  // Load valid sections for selected offering.
  useEffect(() => {
    if (!showCreateClass || !courseId || !academicYear || !semester) { setSections([]); return; }
    let active = true; setSectionsLoading(true); setSectionsError(null);
    (async () => {
      try {
        const data: any = await listConnectCourseSections({ courseId, program, academicYear, semester, batch });
        if (active) setSections(Array.isArray(data?.sections) ? data.sections : []);
      } catch (e: any) { if (active) { setSections([]); setSectionsError(e?.message || "Could not load sections for this offering."); } }
      finally { if (active) setSectionsLoading(false); }
    })();
    return () => { active = false; };
  }, [showCreateClass, courseId, program, academicYear, semester, batch]);

  // Load assigned teachers for course+offering+section (real allocation).
  useEffect(() => {
    if (!showCreateClass || !courseId) { setTeachers([]); return; }
    setAssignedTeacherId(""); setTeachersError(null);
    let active = true; setTeachersLoading(true);
    (async () => {
      try {
        const params: any = { program, semester, academicYear, batch };
        if (!allSections && sectionCode) params.section = sectionCode;
        const data: any = await listConnectCourseTeachers(courseId, params);
        if (active) setTeachers(Array.isArray(data?.teachers) ? data.teachers : []);
      } catch (e: any) { if (active) { setTeachers([]); setTeachersError(e?.message || "Could not load assigned teachers for this subject."); } }
      finally { if (active) setTeachersLoading(false); }
    })();
    return () => { active = false; };
  }, [showCreateClass, courseId, program, semester, academicYear, batch, sectionCode, allSections]);

  const classTarget = useMemo(() => ({
    programCodes: program ? [program.trim().toUpperCase()] : [],
    semesters: semester ? [Number(semester)] : [],
    sectionCodes: allSections ? [] : (sectionCode ? [sectionCode.trim().toUpperCase()] : []),
    batches: batch ? [batch.trim()] : [],
    academicYears: academicYear ? [academicYear.trim()] : [],
    ...(courseId ? { course: courseId } : {}),
  }), [program, semester, sectionCode, allSections, batch, academicYear, courseId]);

  const selectedOffering = useMemo(() => offerings.find((o) => offeringKey(o) === selectedOfferingKey) || (offerings.length === 1 ? offerings[0] : null), [offerings, selectedOfferingKey]);
  const selectedCourse = useMemo(() => selectedOffering ? { id: selectedOffering.courseId, code: selectedOffering.courseCode, name: selectedOffering.courseName } : (courseId ? { id: courseId, code: courseCode, name: courseName } : null), [selectedOffering, courseId, courseCode, courseName]);
  const selectedTeacher = useMemo(() => teachers.find((t) => String(t.id) === String(assignedTeacherId)) || null, [teachers, assignedTeacherId]);

  const classes = useMemo(() => sessions.filter((s) => s.sessionType === "ONLINE_CLASS"), [sessions]);
  // Never render meeting metadata for students, even defensively.
  const meetings = useMemo(() => (canSeeMeetings ? sessions.filter((s) => s.sessionType === "ONLINE_MEETING") : []), [sessions, canSeeMeetings]);

  const statusSortOrder = useMemo(() => {
    const order: Record<string, number> = { LIVE: 0, SCHEDULED: 1, COMPLETED: 2, CANCELLED: 3, EXPIRED: 4 };
    return (a: Session, b: Session): number => {
      const sa = studentFacingStatus(a.status);
      const sb = studentFacingStatus(b.status);
      const pa = order[sa] ?? 99;
      const pb = order[sb] ?? 99;
      if (pa !== pb) return pa - pb;
      const da = a.scheduledDate ? new Date(`${a.scheduledDate}T${a.startTime || "00:00"}:00`).getTime() : 0;
      const db = b.scheduledDate ? new Date(`${b.scheduledDate}T${b.startTime || "00:00"}:00`).getTime() : 0;
      if (sa === "COMPLETED" || sa === "CANCELLED" || sa === "EXPIRED") {
        const daEnd = a.scheduledDate ? new Date(`${a.scheduledDate}T${a.endTime || "00:00"}:00`).getTime() : 0;
        const dbEnd = b.scheduledDate ? new Date(`${b.scheduledDate}T${b.endTime || "00:00"}:00`).getTime() : 0;
        return dbEnd - daEnd; // most recent finished first
      }
      return da - db; // earliest first for LIVE and SCHEDULED
    };
  }, []);

  const studentFacingStatus = useMemo(() => (status: string): string => {
    return status === "ENDED" ? "COMPLETED" : status;
  }, []);

  const filtered = useMemo(() => {
    const list = tab === "classes" ? classes : meetings;
    const q = search.trim().toLowerCase();
    const filteredList = list.filter((s) => {
      const sfStatus = studentFacingStatus(String(s.status));
      if (statusFilter && sfStatus !== statusFilter) return false;
      if (!q) return true;
      return [s.title, s.description, s.scheduledDate, targetSummary(s.classTarget)].some((v) => String(v || "").toLowerCase().includes(q));
    });
    return filteredList.sort(statusSortOrder);
  }, [tab, classes, meetings, search, statusFilter, statusSortOrder, studentFacingStatus]);

  const metrics = useMemo(() => {
    const list = tab === "classes" ? classes : meetings;
    return {
      upcoming: list.filter((s) => s.status === "SCHEDULED").length,
      live: list.filter((s) => s.status === "LIVE" || s.status === "IN_PROGRESS").length,
      completed: list.filter((s) => s.status === "COMPLETED" || s.status === "ENDED").length,
      attention: list.filter((s) => ["CANCELLED", "EXPIRED"].includes(s.status)).length,
    };
  }, [tab, classes, meetings]);

  const statusFilters = useMemo(
    () => [
      { value: "", label: "All" },
      { value: "LIVE", label: "Live" },
      { value: "SCHEDULED", label: "Upcoming" },
      { value: "COMPLETED", label: "Completed" },
      { value: "CANCELLED", label: "Cancelled" },
      { value: "EXPIRED", label: "Expired" },
    ],
    [],
  );

  const statusCounts = useMemo(() => {
    const list = tab === "classes" ? classes : meetings;
    const counts: Record<string, number> = { ALL: list.length };
    for (const c of list) {
      // Student-facing unification: historical ENDED records count as COMPLETED.
      const k = String(c.status === "ENDED" ? "COMPLETED" : c.status);
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }, [tab, classes, meetings]);

  async function onResolveClass(page = 1) {
    setResolving(true); setError(null);
    try {
      const data = await resolveConnectClassTarget({ ...classTarget, courseId: courseId || undefined, allSections, page, limit: 50 });
      setResolvePreview(data);
      setPreviewPage(page);
      setShowPreview(true);
    } catch (e: any) { setResolvePreview(null); setError(e?.message || "Could not resolve the selected academic group."); }
    finally { setResolving(false); }
  }

  function resetCreateClass() {
    setClassStep(1); setClassAttemptStep(0); setClassTitle(""); setClassDescription(""); setClassDate(""); setClassStart(""); setClassEnd("");
    setCourseName(""); setCourseCode(""); setCourseSearch(""); setCourseSuggestions([]); setCourseIdentity(null); setCourseIdentityError(null);
    clearStep2();
  }

  const classStep1Valid = classTitle.trim().length > 0 && courseName.trim().length > 0 && courseCode.trim().length > 0;
  // Course-driven: offering-derived program/year/semester + valid course + assigned teacher required.
  // Section is required when sections exist; explicit "All Sections" is allowed.
  const offeringReady = program.trim().length > 0 && semester.trim().length > 0 && academicYear.trim().length > 0 && courseId.trim().length > 0;
  const sectionReady = allSections || sections.length === 0 || sectionCode.trim().length > 0;
  const classStep2Valid = offeringReady && sectionReady && assignedTeacherId.trim().length > 0;
  const classStep3Valid = classDate.trim().length > 0 && classStart.trim().length > 0 && classEnd.trim().length > 0 && classEnd > classStart;
  const classStep3TimeOrderError = !!(classStart && classEnd && classEnd <= classStart);

  function canContinueClassStep(step: number) {
    if (step === 1) return classStep1Valid;
    if (step === 2) return classStep2Valid;
    if (step === 3) return classStep3Valid;
    return true;
  }

  async function onContinueClassStep() {
    if (!canContinueClassStep(classStep)) { setClassAttemptStep(classStep); return; }
    if (classStep === 1) {
      const ok = await validateCourseIdentity();
      if (!ok) { setClassAttemptStep(1); return; }
      // resolve offerings for validated identity
      try {
        setOfferingsLoading(true); setOfferingsError(null);
        const data: any = await resolveConnectCourseOfferings({ courseName, courseCode });
        const offs = Array.isArray(data?.offerings) ? data.offerings : [];
        setOfferings(offs);
        if (!offs.length) { setOfferingsError("No valid academic offering was found for this subject. Check curriculum/enrollment records."); setClassAttemptStep(1); return; }
        // if single offering, auto-select and derive audience; if multiple, require explicit selection in Step 2
        if (offs.length === 1) selectOffering(offs[0]); else { setSelectedOfferingKey(""); setCourseId(""); clearStep2(); setOfferings(offs); }
      } catch (e: any) {
        setOfferingsError(e?.message || "Could not resolve academic offerings for this subject.");
        setClassAttemptStep(1); return;
      } finally { setOfferingsLoading(false); }
    }
    if (classStep === 2 && offerings.length > 1 && !selectedOfferingKey) { setClassAttemptStep(2); return; }
    setClassAttemptStep(0);
    setClassStep((s) => Math.min(4, s + 1));
  }

  async function onCreateClass() {
    setCreatingClass(true); setError(null);
    try {
      const data: any = await createConnectClass({
        title: classTitle,
        description: classDescription,
        scheduledDate: classDate,
        startTime: classStart,
        endTime: classEnd,
        courseId,
        courseName,
        courseCode,
        assignedTeacherId,
        allSections,
        classTarget,
      });
      setIssued({ type: "ONLINE_CLASS", title: classTitle, ...data?.issuedCredentials });
      setShowIssued(true); setShowCreateClass(false); resetCreateClass(); await load(); setTab("classes");
    } catch (e: any) { setError(e?.message || "Failed to create online class."); }
    finally { setCreatingClass(false); }
  }

  async function onCreateMeeting(e: React.FormEvent) {
    e.preventDefault(); if (!canCreateMeeting) return;
    setCreatingMeeting(true); setError(null);
    try {
      const data: any = await createConnectMeeting({ title: meetingTitle, description: meetingDescription, scheduledDate: meetingDate, startTime: meetingStart, endTime: meetingEnd, invitedUserIds: selectedInvitees });
      setIssued({ type: "ONLINE_MEETING", title: meetingTitle, ...data?.issuedCredentials });
      setShowIssued(true); setShowCreateMeeting(false); setMeetingTitle(""); setMeetingDescription(""); setSelectedInvitees([]); await load(); setTab("meetings");
    } catch (e: any) { setError(e?.message || "Failed to create meeting."); }
    finally { setCreatingMeeting(false); }
  }

  async function onLifecycle(id: string, action: "start" | "end") {
    setError(null);
    try { if (action === "start") await startConnectSession(id); else await endConnectSession(id); await load(); }
    catch (e: any) { setError(e?.message || `Failed to ${action} session.`); }
  }

  function openJoinPrompt(session: Session) { setError(null); setJoinCredId(""); setJoinCredPassword(""); setShowJoinPassword(false); setJoinPrompt(session); }

  async function onJoin(session: Session) {
    setJoining(true); setError(null);
    try {
      const payload: any = {};
      if (joinCredId.trim() || joinCredPassword.trim()) {
        payload.sessionCredentialId = joinCredId.trim();
        payload.sessionCredentialPassword = joinCredPassword.trim();
      }
      await joinConnectSession(session.id, payload);
      setActiveRoom({ sessionId: session.id, credential: { sessionId16: joinCredId.trim() || undefined, password: joinCredPassword.trim() || undefined } });
      setJoinPrompt(null); await load();
    } catch (e: any) { setError(e?.message || "Failed to join session."); }
    finally { setJoining(false); }
  }

  async function openCredentialModal(session: Session) {
    if (!isAdmin) return;
    if (!session || !session.id) { setError("Cannot open credentials: session id is missing."); return; }
    setError(null);
    setCredModalSession(session);
    setCredModalCredentials(null);
    setCredModalLoading(true);
    try {
      const data: any = await getConnectCredentials(session.id);
      setCredModalCredentials(data?.credentials || null);
    } catch (e: any) {
      setError(e?.message || "Failed to load credentials.");
    } finally {
      setCredModalLoading(false);
    }
  }

  const canStartEnd = !isStudent && (perms.has("connect.class.manage") || perms.has("connect.meeting.manage") || perms.has("connect.admin"));

  const requiresJoinCredential = () => isStudent && Boolean(joinPrompt) && joinPrompt.sessionType === "ONLINE_CLASS";

  return (
    <div className="min-h-full bg-slate-50/60">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B1F33] text-white shadow-sm">
                <FontAwesomeIcon icon={faChalkboardUser} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Communication &amp; Engagement</p>
                <h1 className="text-lg font-semibold tracking-tight text-slate-900">Techspire Meet</h1>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Virtual classrooms and institutional meetings, connected to your academic community.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" icon={faRotate} onClick={load} isLoading={loading}>Refresh</Button>
            {tab === "classes" && canCreateClass && <Button size="sm" icon={faPlus} onClick={() => { resetCreateClass(); setShowCreateClass(true); }}>Create online class</Button>}
            {tab === "meetings" && canCreateMeeting && <Button size="sm" icon={faPlus} onClick={() => setShowCreateMeeting(true)}>Create meeting</Button>}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex flex-wrap items-center gap-1 border-b border-transparent">
          <button type="button" onClick={() => setTab("classes")} disabled={!canViewClasses}
            className={`inline-flex items-center gap-2 rounded-t-lg border px-4 py-2 text-sm font-medium transition ${tab === "classes" ? "border-slate-200 border-b-white bg-white text-[#0B1F33] -mb-px" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            <FontAwesomeIcon icon={faVideo} className="text-xs" aria-hidden="true" /> Online Classes
          </button>
          {canSeeMeetings && (
            <button type="button" onClick={() => setTab("meetings")}
              className={`inline-flex items-center gap-2 rounded-t-lg border px-4 py-2 text-sm font-medium transition ${tab === "meetings" ? "border-slate-200 border-b-white bg-white text-[#0B1F33] -mb-px" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
              <FontAwesomeIcon icon={faHandshake} className="text-xs" aria-hidden="true" /> Institutional Meetings
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-6">
        {/* Compact infrastructure status (not dominant) */}
        {config && !config?.livekit?.configured && (
          <div className="flex flex-wrap items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-900">
            <FontAwesomeIcon icon={faServer} className="mt-0.5 text-amber-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <span className="font-medium">Live video infrastructure is not configured.</span>{" "}
              Class scheduling and participant authorization are available, but live audio, video, and screen sharing require LiveKit.
              {isAdmin ? (
                <span>
                  {" "}Set server-side <code>LIVEKIT_URL</code> (LiveKit Cloud <code>wss://...</code> supported; Docker not required), <code>LIVEKIT_API_KEY</code>, <code>LIVEKIT_API_SECRET</code>, then restart the backend. Keys stay on the server only.
                  {Array.isArray(config?.livekit?.missing) && config.livekit.missing.length ? <> Missing: <code>{config.livekit.missing.join(", ")}</code>.</> : null}
                </span>
              ) : " Please contact an administrator."}
            </div>
          </div>
        )}
        {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

        {/* Active room */}
        {activeRoom && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Live session</h2>
              <span className="text-xs text-slate-500">Authorized connection only — no simulated audio/video.</span>
            </div>
            <ConnectRoomClient sessionId={activeRoom.sessionId} credential={activeRoom.credential} onClose={() => { setActiveRoom(null); load().catch(() => {}); }} />
          </div>
        )}

        {/* Metrics */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label={tab === "classes" ? "Upcoming classes" : "Upcoming meetings"} value={metrics.upcoming} icon={faCalendarDays} tone="text-[#0B1F33]" bgTone="bg-[#E8EDF2]" />
          <MetricCard label="Live now" value={metrics.live} icon={faCircleDot} tone="text-emerald-700" bgTone="bg-emerald-50" />
          <MetricCard label="Completed" value={metrics.completed} icon={faCircleCheck} tone="text-slate-700" bgTone="bg-slate-100" />
          <MetricCard label="Needs attention" value={metrics.attention} icon={faTriangleExclamation} tone={metrics.attention ? "text-amber-700" : "text-slate-700"} bgTone={metrics.attention ? "bg-amber-50" : "bg-slate-100"} />
        </div>

        {/* Session management */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
            {/* Header row: title + description */}
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-slate-900">
                {tab === "classes" ? "Online Classes" : "Institutional Meetings"}
              </h2>
              {tab === "classes" && (
                <p className="mt-1 text-sm text-slate-600">
                  View your scheduled classes, join live sessions, and access previous class sessions.
                </p>
              )}
            </div>

            {/* Toolbar row: filters + search */}
            <div className="mt-4 sm:mt-3 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="min-w-0 flex flex-wrap gap-1" role="navigation" aria-label="Filter by status">
                {statusFilters.map((f) => {
                  const selected = statusFilter === f.value;
                  const count = statusCounts[f.value] ?? 0;
                  const base = "relative shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition";
                  const pillClass = selected
                    ? `${base} border-[#0B1F33] bg-[#0B1F33] text-white`
                    : f.value === "LIVE"
                      ? `${base} border-emerald-200 text-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200`
                      : `${base} border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F33]/20`;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setStatusFilter(f.value)}
                      aria-pressed={selected}
                      className={`${pillClass} whitespace-nowrap`}
                    >
                      {f.label}
                      <span className="ml-1 text-[10px] opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>
              <div className="relative w-full sm:w-96 lg:w-112">
                <FontAwesomeIcon
                  icon={faMagnifyingGlass}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"
                  aria-hidden="true"
                />
                <input
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm"
                  placeholder="Search sessions"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {loading && <div className="px-4 py-8 text-center text-sm text-slate-500">Loading sessions…</div>}

          {!loading && filtered.length === 0 && (
            <div className="p-4">
              <EmptyState
                icon={tab === "classes" ? faVideo : faUsers}
                title={tab === "classes" ? "No online classes available" : "No institutional meetings available"}
                description={
                  tab === "classes"
                    ? (isStudent
                      ? "No online classes have been scheduled for your academic group."
                      : canCreateClass
                        ? "Your virtual classroom is ready. Create an online class, choose the academic audience, and preview resolved participants before issuing credentials."
                        : "No assigned or visible online classes are available yet.")
                    : "Meetings you host or are invited to will appear here. Meetings are staff-only and never visible to students."
                }
                actionLabel={tab === "classes" && canCreateClass ? "Create online class" : tab === "meetings" && canCreateMeeting ? "Create meeting" : undefined}
                onAction={tab === "classes" && canCreateClass ? () => { resetCreateClass(); setShowCreateClass(true); } : tab === "meetings" && canCreateMeeting ? () => setShowCreateMeeting(true) : undefined}
                actionIcon={faPlus}
              />
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="p-4 sm:p-6">
              {tab === "classes" ? (
                <div className="grid grid-cols-1 gap-4">
                  {filtered.map((s) => (
                      <ConnectClassCard
                        key={s.id}
                        session={s}
                        isStudent={isStudent}
                        isAdmin={isAdmin}
                        canStartEnd={canStartEnd}
                        onJoin={(session) => { window.history.pushState({}, "", `/online-classes/${session.id}/join`); setActiveView("online_class_join"); }}
                        onStart={(id) => onLifecycle(id, "start")}
                        onEnd={(id) => onLifecycle(id, "end")}
                        onViewCredentials={openCredentialModal}
                      />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Session</th>
                        <th className="px-4 py-3">Schedule</th>
                        <th className="px-4 py-3">Invited</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((s) => {
                        const isClass = s.sessionType === "ONLINE_CLASS";
                        return (
                          <tr key={s.id} className="align-top">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{s.title}</div>
                              {isClass && (s.courseCode || s.courseName) && (
                                <div className="mt-0.5 text-xs text-slate-700">{s.courseCode ? `${s.courseCode} — ${s.courseName || ""}` : s.courseName}</div>
                              )}
                              {isClass && (s.assignedTeacherName || s.host) && (
                                <div className="mt-0.5 text-xs text-slate-500">Host: {s.assignedTeacherName || "Assigned teacher"}</div>
                              )}
                              {s.description && <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{s.description}</div>}
                              <div className="mt-1 text-xs text-slate-500">{isClass ? "Online class" : "Institutional meeting"}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatSchedule(s)}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {isClass ? (
                                <div>
                                  <div className="text-xs">{targetSummary(s.classTarget)}</div>
                                  <div className="mt-0.5 text-xs text-slate-500">Resolved: {s.participantCount ?? 0}</div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-600">{s.invitedCount ?? 0} invited staff</span>
                              )}
                            </td>
                            <td className="px-4 py-3"><Badge variant={statusVariant(s.status)} size="sm">{s.status}</Badge></td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap justify-end gap-1.5">
                                    {(isClass || !isStudent) && <Button size="xs" variant="secondary" icon={faDoorOpen} onClick={() => openJoinPrompt(s)}>Join</Button>}
                                    {canStartEnd && s.status !== "LIVE" && s.status !== "COMPLETED" && s.status !== "ENDED" && <Button size="xs" variant="ghost" icon={faPlay} onClick={() => onLifecycle(s.id, "start")}>Start</Button>}
                                    {canStartEnd && s.status !== "ENDED" && s.status !== "COMPLETED" && <Button size="xs" variant="ghost" icon={faStop} onClick={() => onLifecycle(s.id, "end")}>End</Button>}
                                  </div>
                                </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Join prompt */}
      <Modal isOpen={!!joinPrompt} onClose={() => setJoinPrompt(null)} title={joinPrompt ? `Join ${joinPrompt.sessionType === "ONLINE_CLASS" ? "Online Class" : "Institutional Meeting"}` : "Join Meeting"} subtitle={joinPrompt?.title} maxWidth="md"
        footer={<><Button variant="secondary" onClick={() => setJoinPrompt(null)}>Cancel</Button><Button onClick={() => joinPrompt && onJoin(joinPrompt)} disabled={joining || (requiresJoinCredential() && (!joinCredId.trim() || !joinCredPassword.trim()))} isLoading={joining}>Join Meeting</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{joinPrompt?.sessionType === "ONLINE_CLASS"
            ? "Enter the class session credentials provided by your institution. Access is authorized only for your academic group."
            : "Enter the meeting credentials provided by the meeting organizer. Access is authorized only for invited participants."}
          </p>
          {requiresJoinCredential() && <p className="text-xs text-slate-500"><span className="font-medium text-red-600">*</span> Required</p>}
          <Input label="Meeting ID" required={requiresJoinCredential()} value={joinCredId} onChange={(e) => setJoinCredId(e.target.value)} placeholder="e.g. 1234567890123456" leftIcon={faKey} />
          <Input label="Meeting Password" type={showJoinPassword ? "text" : "password"} required={requiresJoinCredential()} value={joinCredPassword} onChange={(e) => setJoinCredPassword(e.target.value)} placeholder="Meeting password" trailing={<Button variant="ghost" size="xs" onClick={() => setShowJoinPassword(!showJoinPassword)}><FontAwesomeIcon icon={showJoinPassword ? faEyeSlash : faEye} /></Button>} />
          {!requiresJoinCredential() && <p className="text-xs text-slate-500">Optional — join with your authenticated CollegeOS identity if you are the host, teacher, or an invited participant. Credentials are validated server-side when provided.</p>}
        </div>
      </Modal>

      {/* Credentials (shown once) */}
      <Modal isOpen={showIssued && !!issued} onClose={() => setShowIssued(false)} title="Session credentials" subtitle={issued?.title || "Shown once — copy now"} icon={faShieldHalved} maxWidth="lg"
        footer={<Button onClick={() => setShowIssued(false)}>Done</Button>}>
        <div className="space-y-3 text-sm">
          <Alert variant="warning">Passwords are stored as hashes and are not shown again. Share credentials only with authorized participants through approved channels.</Alert>
          {issued?.student && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 font-medium text-slate-900">Student credential</div>
              <div className="flex flex-wrap items-center gap-2"><span className="text-slate-600">Session ID:</span><code className="rounded bg-white px-2 py-0.5">{issued.student.sessionId16}</code><Button size="xs" variant="ghost" icon={copiedKey === "issued-student-session" ? faCheck : faCopy} onClick={() => copyText(issued.student.sessionId16, "issued-student-session")}>{copiedKey === "issued-student-session" ? "Copied" : "Copy"}</Button></div>
              <div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-slate-600">Password:</span><code className="rounded bg-white px-2 py-0.5">{issued.student.password}</code><Button size="xs" variant="ghost" icon={copiedKey === "issued-student-password" ? faCheck : faCopy} onClick={() => copyText(issued.student.password, "issued-student-password")}>{copiedKey === "issued-student-password" ? "Copied" : "Copy"}</Button></div>
            </div>
          )}
          {issued?.teacher && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 font-medium text-slate-900">Teacher credential</div>
              <div className="flex flex-wrap items-center gap-2"><span className="text-slate-600">Session ID:</span><code className="rounded bg-white px-2 py-0.5">{issued.teacher.sessionId16}</code><Button size="xs" variant="ghost" icon={copiedKey === "issued-teacher-session" ? faCheck : faCopy} onClick={() => copyText(issued.teacher.sessionId16, "issued-teacher-session")}>{copiedKey === "issued-teacher-session" ? "Copied" : "Copy"}</Button></div>
              <div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-slate-600">Password:</span><code className="rounded bg-white px-2 py-0.5">{issued.teacher.password}</code><Button size="xs" variant="ghost" icon={copiedKey === "issued-teacher-password" ? faCheck : faCopy} onClick={() => copyText(issued.teacher.password, "issued-teacher-password")}>{copiedKey === "issued-teacher-password" ? "Copied" : "Copy"}</Button></div>
            </div>
          )}
          {issued?.meeting && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 font-medium text-slate-900">Meeting credential</div>
              <div className="flex flex-wrap items-center gap-2"><span className="text-slate-600">Session ID:</span><code className="rounded bg-white px-2 py-0.5">{issued.meeting.sessionId16}</code><Button size="xs" variant="ghost" icon={copiedKey === "issued-meeting-session" ? faCheck : faCopy} onClick={() => copyText(issued.meeting.sessionId16, "issued-meeting-session")}>{copiedKey === "issued-meeting-session" ? "Copied" : "Copy"}</Button></div>
              <div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-slate-600">Password:</span><code className="rounded bg-white px-2 py-0.5">{issued.meeting.password}</code><Button size="xs" variant="ghost" icon={copiedKey === "issued-meeting-password" ? faCheck : faCopy} onClick={() => copyText(issued.meeting.password, "issued-meeting-password")}>{copiedKey === "issued-meeting-password" ? "Copied" : "Copy"}</Button></div>
            </div>
          )}
        </div>
      </Modal>

      {/* Admin credential management (persistent, server-authorized) */}
      <Modal
        isOpen={!!credModalSession && isAdmin}
        onClose={() => { setCredModalSession(null); setCredModalCredentials(null); }}
        title="Classroom Access Credentials"
        subtitle={credModalSession ? `Session: ${credModalSession.title || credModalSession.name || "Online Class"}` : ""}
        icon={faShieldHalved}
        maxWidth="lg"
        footer={<Button variant="secondary" onClick={() => { setCredModalSession(null); setCredModalCredentials(null); }}>Close</Button>}>
        <div className="space-y-4 text-sm">
          <Alert variant="warning">Credentials are encrypted at rest and decrypted server-side for administrators only. Share with authorized participants through approved channels.</Alert>

          {credModalLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-slate-500">Loading credentials…</div>
          )}
          {!credModalLoading && credModalSession && credModalCredentials ? (
            <div className="space-y-4">
              {/* Teacher Credentials */}
              {credModalCredentials.teacher && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FontAwesomeIcon icon={faShieldHalved} className="text-[#0B1F33]" />
                    <span className="font-medium text-slate-900">Teacher Credential</span>
                    <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                      {credModalCredentials.teacher.active ? "Active" : "Revoked"}
                    </span>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2 text-xs">
                    <div><span className="text-slate-500">Teacher / Host</span><div className="text-slate-700">{credModalSession.assignedTeacherName || "Assigned teacher"}</div></div>
                    <div><span className="text-slate-500">Session ID / Meeting ID</span><div className="flex items-center gap-2"><code className="rounded bg-white px-2 py-0.5 break-all">{credModalCredentials.teacher.sessionId16}</code><Button size="xs" variant="ghost" icon={copiedKey === "modal-teacher-session" ? faCheck : faCopy} onClick={() => copyText(credModalCredentials.teacher.sessionId16, "modal-teacher-session")}>{copiedKey === "modal-teacher-session" ? "Copied" : "Copy"}</Button></div></div>
                    <div className="sm:col-span-2"><span className="text-slate-500">Password</span><div className="flex items-center gap-2"><code className="rounded bg-white px-2 py-0.5 break-all">{credModalCredentials.teacher.password || "—"}</code><Button size="xs" variant="ghost" icon={copiedKey === "modal-teacher-password" ? faCheck : faCopy} onClick={() => copyText(credModalCredentials.teacher.password || "", "modal-teacher-password")} disabled={!credModalCredentials.teacher.password}>{copiedKey === "modal-teacher-password" ? "Copied" : "Copy"}</Button></div></div>
                    <div><span className="text-slate-500">Issued at</span><div className="text-slate-700">{formatDateTime12h(credModalCredentials.teacher.issuedAt)}</div></div>
                    <div><span className="text-slate-500">Status</span><div className={`text-slate-700 ${credModalCredentials.teacher.active ? "text-emerald-700" : "text-rose-700"}`}>{credModalCredentials.teacher.active ? "Active" : "Revoked"}</div></div>
                  </div>
                </div>
              )}

              {/* Student Credentials */}
              {credModalCredentials.student && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FontAwesomeIcon icon={faUsers} className="text-[#0B1F33]" />
                    <span className="font-medium text-slate-900">Student Credential</span>
                    <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                      {credModalCredentials.student.active ? "Active" : "Revoked"}
                    </span>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2 text-xs">
                    <div><span className="text-slate-500">Academic group</span><div className="text-slate-700">{targetSummary(credModalSession.classTarget)}</div></div>
                    <div><span className="text-slate-500">Session ID / Meeting ID</span><div className="flex items-center gap-2"><code className="rounded bg-white px-2 py-0.5 break-all">{credModalCredentials.student.sessionId16}</code><Button size="xs" variant="ghost" icon={copiedKey === "modal-student-session" ? faCheck : faCopy} onClick={() => copyText(credModalCredentials.student.sessionId16, "modal-student-session")}>{copiedKey === "modal-student-session" ? "Copied" : "Copy"}</Button></div></div>
                    <div className="sm:col-span-2"><span className="text-slate-500">Password</span><div className="flex items-center gap-2"><code className="rounded bg-white px-2 py-0.5 break-all">{credModalCredentials.student.password || "—"}</code><Button size="xs" variant="ghost" icon={copiedKey === "modal-student-password" ? faCheck : faCopy} onClick={() => copyText(credModalCredentials.student.password || "", "modal-student-password")} disabled={!credModalCredentials.student.password}>{copiedKey === "modal-student-password" ? "Copied" : "Copy"}</Button></div></div>
                    <div><span className="text-slate-500">Issued at</span><div className="text-slate-700">{formatDateTime12h(credModalCredentials.student.issuedAt)}</div></div>
                    <div><span className="text-slate-500">Status</span><div className={`text-slate-700 ${credModalCredentials.student.active ? "text-emerald-700" : "text-rose-700"}`}>{credModalCredentials.student.active ? "Active" : "Revoked"}</div></div>
                  </div>
                </div>
              )}

              {!credModalCredentials.teacher && !credModalCredentials.student && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
                  <p className="text-sm text-slate-500">No credentials have been generated for this session.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Create class (guided) */}
      <Modal isOpen={showCreateClass} onClose={() => setShowCreateClass(false)} title="Create online class" subtitle={`Step ${classStep} of 4 — ${["Course & class info", "Audience & teacher", "Schedule", "Review"][classStep - 1]}`} icon={faVideo} maxWidth="3xl"
        footer={<div className="flex w-full items-center justify-between gap-2"><Button variant="ghost" onClick={() => setShowCreateClass(false)}>Cancel</Button><div className="flex items-center gap-2">{classStep > 1 && <Button variant="secondary" onClick={() => { setClassAttemptStep(0); setClassStep((s) => s - 1); }}>Back</Button>}{classStep < 4 ? <Button onClick={onContinueClassStep} disabled={!canContinueClassStep(classStep) || offeringsLoading}>Continue <FontAwesomeIcon icon={faArrowRight} className="ml-1 text-xs" /></Button> : <Button onClick={onCreateClass} isLoading={creatingClass} disabled={!classStep1Valid || !classStep2Valid || !classStep3Valid}>Create class</Button>}</div></div>}>
        <p className="mb-3 text-xs text-slate-500"><span className="font-medium text-red-600">*</span> Required fields must be completed before continuing. Course and audience are resolved from real curriculum, allocation, and enrollment records.</p>
        {courseIdentityError && <Alert variant="error" onDismiss={() => setCourseIdentityError(null)}>{courseIdentityError}</Alert>}
        {classAttemptStep === classStep && !canContinueClassStep(classStep) && (
          <Alert variant="error" className="mb-3">Complete all required fields (<span className="text-red-600">*</span>) for this step before continuing.</Alert>
        )}
        {classStep === 1 && (
          <div className="grid gap-3">
            <Input label="Class title" required value={classTitle} onChange={(e) => setClassTitle(e.target.value)} placeholder="e.g. Database Systems — Unit 3" error={classAttemptStep === 1 && !classTitle.trim() ? "Class title is required." : undefined} />
            <Input label="Description" helperText="Optional" value={classDescription} onChange={(e) => setClassDescription(e.target.value)} placeholder="Instructions or agenda" />
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <p className="mb-2 text-sm font-medium text-slate-800">Course / Subject (required)</p>
              <p className="mb-3 text-xs text-slate-500">Search and select an existing curriculum subject. Course Name and Course Code must identify the same valid subject; invalid combinations are rejected server-side.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Course Name / Subject Name" required value={courseName} onChange={(e) => { setCourseName(e.target.value); setCourseSearch(e.target.value); setCourseIdentity(null); setCourseIdentityError(null); if (courseId) { setCourseId(""); clearStep2(); } }} placeholder="e.g. Database Management Systems" error={classAttemptStep === 1 && !courseName.trim() ? "Course/Subject Name is required." : undefined} />
                <Input label="Course Code" required value={courseCode} onChange={(e) => { setCourseCode(e.target.value); setCourseSearch(e.target.value); setCourseIdentity(null); setCourseIdentityError(null); if (courseId) { setCourseId(""); clearStep2(); } }} placeholder="e.g. CS301" error={classAttemptStep === 1 && !courseCode.trim() ? "Course Code is required." : undefined} />
              </div>
              <div className="mt-2">
                {courseSearchLoading && <div className="text-xs text-slate-500">Searching curriculum subjects…</div>}
                {!courseSearchLoading && courseSuggestions.length > 0 && (
                  <div className="max-h-40 overflow-auto rounded-md border border-slate-200 bg-white">
                    {courseSuggestions.map((c) => (
                      <button key={c.courseId} type="button" className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50" onClick={() => applyCourseSuggestion(c)}>
                        <span className="font-medium text-slate-900">{c.courseCode}</span> <span className="text-slate-700">— {c.courseName}</span>
                        <span className="block text-xs text-slate-500">{[c.programCode || c.program, c.academicYear, c.semester != null ? `Sem ${c.semester}` : null].filter(Boolean).join(" · ")}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {courseIdentity?.valid && <p className="mt-2 text-xs text-emerald-700">Validated: <strong>{courseIdentity.courseCode}</strong> — {courseIdentity.courseName}</p>}
            </div>
          </div>
        )}
        {classStep === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Academic details are derived from the selected course&apos;s real offering/allocation records. Choose section and assigned teacher; students are resolved server-side from enrollment.</p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-medium text-slate-900">Subject: {courseCode} — {courseName}</div>
              {offeringsLoading && <div className="mt-1 text-xs text-slate-500">Resolving academic offerings…</div>}
              {offeringsError && <div className="mt-2"><Alert variant="error">{offeringsError}</Alert></div>}
              {!offeringsLoading && offerings.length > 1 && !selectedOfferingKey && (
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700">Multiple valid offerings found <span className="text-red-600">*</span> — choose the correct one</label>
                  <select className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" value={selectedOfferingKey} onChange={(e) => { const o = offerings.find((x) => offeringKey(x) === e.target.value); if (o) selectOffering(o); }}>
                    <option value="">Select academic offering</option>
                    {offerings.map((o) => <option key={offeringKey(o)} value={offeringKey(o)}>{[o.programCode || o.program, o.academicYear, o.semester != null ? `Sem ${o.semester}` : null, o.sectionCount ? `${o.sectionCount} section(s)` : null].filter(Boolean).join(" · ")}</option>)}
                  </select>
                  {classAttemptStep === 2 && !selectedOfferingKey && <p className="mt-1 text-xs text-red-600">Select the academic offering.</p>}
                </div>
              )}
            </div>
            {offeringReady && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div><span className="text-xs font-medium text-slate-500">Program (from offering)</span><div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{program || "—"}</div></div>
                <div><span className="text-xs font-medium text-slate-500">Academic Year (from offering)</span><div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{academicYear || "—"}</div></div>
                <div><span className="text-xs font-medium text-slate-500">Semester (from offering)</span><div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{semester || "—"}</div></div>
                <div><span className="text-xs font-medium text-slate-500">Batch (from offering)</span><div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{batch || "—"}</div></div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Section <span className="text-red-600">*</span></label>
                  <div className="flex flex-wrap items-center gap-3">
                    <select className="h-9 min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:opacity-60" value={allSections ? "__ALL__" : sectionCode} onChange={(e) => { const v = e.target.value; if (v === "__ALL__") { setAllSections(true); setSectionCode(""); } else { setAllSections(false); setSectionCode(v); } setAssignedTeacherId(""); setTeachers([]); setResolvePreview(null); }} disabled={sectionsLoading}>
                      <option value="">{sectionsLoading ? "Loading sections…" : "Select section"}</option>
                      <option value="__ALL__">All Sections (explicit)</option>
                      {sections.map((s) => <option key={s.code} value={s.code}>{s.code}{s.enrollmentCount ? ` · ${s.enrollmentCount} enrolled` : ""}</option>)}
                    </select>
                    {allSections && <span className="text-xs text-amber-700">All sections selected (explicit). Only sections with valid enrollment/allocation are included.</span>}
                  </div>
                  {sectionsError && <p className="mt-1 text-xs text-red-600">{sectionsError}</p>}
                  {!sectionsLoading && sections.length === 0 && !sectionsError && <p className="mt-1 text-xs text-amber-700">No section/enrollment records found for this offering. You may choose All Sections only if server enrollment exists.</p>}
                  {classAttemptStep === 2 && !sectionReady && <p className="mt-1 text-xs text-red-600">Select a section or explicitly choose All Sections.</p>}
                </div>
                <SelectField label="Assigned Teacher / Class Host" required value={assignedTeacherId} onChange={(e) => { setAssignedTeacherId(e.target.value); setResolvePreview(null); }} wrapperClassName="sm:col-span-2" error={classAttemptStep === 2 && !assignedTeacherId ? "Assigned teacher / class host is required." : undefined} disabled={!courseId || teachersLoading}>
                  <option value="">{!courseId ? "Select offering first" : teachersLoading ? "Loading assigned teachers…" : "Select assigned teacher / class host"}</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.email ? ` (${t.email})` : ""}</option>)}
                </SelectField>
              </div>
            )}
            {teachersError && <Alert variant="error">{teachersError}</Alert>}
            {!teachersLoading && courseId && offeringReady && teachers.length === 0 && !teachersError && (
              <Alert variant="warning">This subject/section needs a valid teacher allocation before a class can be created. Assign a teacher in Course Teaching Assignments for the selected course, academic year, semester, and section.</Alert>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" icon={faUsers} onClick={() => onResolveClass(1)} isLoading={resolving} disabled={!classStep2Valid}>Preview participants</Button>
              {!classStep2Valid && <span className="text-xs text-slate-500">Complete required offering, section, and assigned teacher to preview participants.</span>}
              {resolvePreview && classStep2Valid && <span className="text-sm text-slate-700"><strong>{resolvePreview.count}</strong> eligible active student{resolvePreview.count === 1 ? "" : "s"} matched (server-resolved)</span>}
            </div>
          </div>
        )}
        {classStep === 3 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Session date" type="date" required value={classDate} onChange={(e) => setClassDate(e.target.value)} error={classAttemptStep === 3 && !classDate ? "Session date is required." : undefined} />
            <div className="hidden sm:block" />
            <Input label="Start time" type="time" required value={classStart} onChange={(e) => setClassStart(e.target.value)} error={classAttemptStep === 3 && !classStart ? "Start time is required." : undefined} />
            <Input label="End time" type="time" required value={classEnd} onChange={(e) => setClassEnd(e.target.value)} error={(classAttemptStep === 3 && !classEnd) ? "End time is required." : classStep3TimeOrderError ? "End time must be after start time." : undefined} />
            <p className="text-xs text-slate-500 sm:col-span-2">Schedule is required. End time must be after start time. Backend authorization and session rules remain authoritative.</p>
          </div>
        )}
        {classStep === 4 && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="text-slate-500">Title</span><div className="font-medium text-slate-900">{classTitle || "—"}</div></div>
                <div><span className="text-slate-500">Schedule</span><div className="font-medium text-slate-900">{[classDate, classStart && classEnd ? `${classStart}–${classEnd}` : classStart].filter(Boolean).join(" · ") || "Not set"}</div></div>
                <div className="sm:col-span-2"><span className="text-slate-500">Course / Subject</span><div className="font-medium text-slate-900">{selectedCourse ? `${selectedCourse.code ? `${selectedCourse.code} — ` : ""}${selectedCourse.name}` : (courseName && courseCode ? `${courseCode} — ${courseName}` : "—")}</div></div>
                <div><span className="text-slate-500">Program / Year</span><div className="font-medium text-slate-900">{[program, academicYear].filter(Boolean).join(" · ") || "—"}</div></div>
                <div><span className="text-slate-500">Semester / Section</span><div className="font-medium text-slate-900">{[semester ? `Sem ${semester}` : null, allSections ? "All Sections" : (sectionCode || "—")].filter(Boolean).join(" · ")}</div></div>
                <div className="sm:col-span-2"><span className="text-slate-500">Assigned Teacher / Class Host</span><div className="font-medium text-slate-900">{selectedTeacher ? `${selectedTeacher.name}${selectedTeacher.email ? ` (${selectedTeacher.email})` : ""}` : "—"}</div></div>
                <div className="sm:col-span-2"><span className="text-slate-500">Academic audience</span><div className="font-medium text-slate-900">{targetSummary(classTarget)}{allSections ? " · All Sections (explicit)" : ""}</div></div>
                <div><span className="text-slate-500">Resolved participants</span><div className="font-medium text-slate-900">{resolvePreview ? `${resolvePreview.count} (server preview)` : "Preview recommended"}</div></div>
              </div>
            </div>
            <Alert variant="info">On creation, session credentials (16-digit numeric Session ID + alphabetic password) are issued once. The selected assigned teacher is the class host and receives a targeted in-app notification and institutional email (no account passwords). Backend authorization remains authoritative.</Alert>
          </div>
        )}
      </Modal>

      {/* Participant preview */}
      <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="Participant preview" subtitle={`${resolvePreview?.count ?? 0} eligible active student(s) — resolved from institutional records`} icon={faUsers} maxWidth="4xl"
        footer={<div className="flex w-full items-center justify-between gap-2"><div className="text-xs text-slate-500">Page {resolvePreview?.page ?? 1} of {resolvePreview?.totalPages ?? 1}</div><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => onResolveClass(Math.max(1, (previewPage || 1) - 1))} disabled={resolving || (resolvePreview?.page ?? 1) <= 1}>Previous</Button><Button variant="secondary" size="sm" onClick={() => onResolveClass(Math.min(resolvePreview?.totalPages || 1, (previewPage || 1) + 1))} disabled={resolving || (resolvePreview?.page ?? 1) >= (resolvePreview?.totalPages ?? 1)}>Next</Button><Button onClick={() => setShowPreview(false)}>Close</Button></div></div>}>
        <Alert variant="info" className="mb-3">Preview is resolved server-side from real enrollment/allocation data for the selected course, offering, and section. The client never authorizes class access.</Alert>
        <Table
          columns={[
            { key: "name", header: "Student" },
            { key: "email", header: "Email", render: (r: any) => r.email || "—" },
            { key: "enrollmentId", header: "Enrollment/Student ID", render: (r: any) => r.enrollmentId || r.studentId || "—" },
            { key: "section", header: "Section", render: (r: any) => r.section || (allSections ? "All" : "—") },
            { key: "program", header: "Program", render: (r: any) => r.program || "—" },
            { key: "semester", header: "Sem", render: (r: any) => r.semester ?? "—" },
          ]}
          data={Array.isArray(resolvePreview?.students) ? resolvePreview.students : []}
          emptyMessage="No eligible active students matched the selected course, offering, and section. Verify enrollment records, section selection, and student active status."
        />
      </Modal>

      {/* Create meeting (staff-only) */}
      {canSeeMeetings && (
        <Modal isOpen={showCreateMeeting} onClose={() => setShowCreateMeeting(false)} title="Create institutional meeting" subtitle="Staff-only. Students are never selectable, invited, or exposed to meeting metadata." icon={faHandshake} maxWidth="3xl"
          footer={<><Button variant="secondary" onClick={() => setShowCreateMeeting(false)}>Cancel</Button><Button onClick={onCreateMeeting as any} disabled={!meetingTitle.trim() || !selectedInvitees.length} isLoading={creatingMeeting}>Create meeting</Button></>}>
          <form onSubmit={onCreateMeeting} className="grid gap-3 sm:grid-cols-2">
            <Input label="Meeting title" required value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} wrapperClassName="sm:col-span-2" />
            <Input label="Description (optional)" value={meetingDescription} onChange={(e) => setMeetingDescription(e.target.value)} wrapperClassName="sm:col-span-2" />
            <Input label="Date" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Start" type="time" value={meetingStart} onChange={(e) => setMeetingStart(e.target.value)} />
              <Input label="End" type="time" value={meetingEnd} onChange={(e) => setMeetingEnd(e.target.value)} />
            </div>
            <Input label="Search authorized staff" value={staffQuery} onChange={(e) => setStaffQuery(e.target.value)} placeholder="Name or email" wrapperClassName="sm:col-span-2" />
            <div className="max-h-44 overflow-auto rounded-lg border border-slate-200 p-2 sm:col-span-2">
              {staffOptions.length ? staffOptions.map((u) => {
                const checked = selectedInvitees.includes(u.id);
                return (
                  <label key={u.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={checked} onChange={(e) => setSelectedInvitees((prev) => e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id))} />
                    <span className="min-w-0 flex-1 truncate">{u.name || u.email}</span>
                    <span className="truncate text-xs text-slate-500">{u.email}</span>
                  </label>
                );
              }) : <div className="px-1 py-2 text-sm text-slate-500">Search to find authorized staff invitees.</div>}
            </div>
            <p className="text-xs text-slate-500 sm:col-span-2">Only authorized staff can be invited. Server-side validation rejects students and unauthorized users.</p>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default ConnectWorkspaceView;
