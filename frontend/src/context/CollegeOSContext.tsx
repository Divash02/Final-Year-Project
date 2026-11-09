import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  Tenant,
  Campus,
  Section,
  Course,
  Student,
  UserRoleType,
  Language,
  CalendarType,
  AuthUser,
} from "../types";
import { apiFetch, apiRequest, clearSessionExpiredHandler, setSessionExpiredHandler } from "../services/apiClient";
import {
  resolveRoute,
  routeToView,
  viewToRoute,
  CodingLabRoute,
} from "../lib/appRoutes";
import { sessionBus } from "../lib/sessionBus";
import {
  sessionEndMessage,
  SessionEndReason,
} from "../lib/sessionMessages";

interface CollegeOSContextType {
  // Authentication & Session
  isAuthenticated: boolean;
  isHydrating: boolean;
  currentUser: AuthUser | null;
  mustChangePassword: boolean;
  loginTransition: boolean;
  completeLoginTransition: () => void;
  login: (email: string, password: string, redirectTo?: string) => Promise<boolean>;
  logout: (reason?: SessionEndReason) => void;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<boolean>;
  intendedDestination: string | null;
  setIntendedDestination: (path: string | null) => void;
  viewToRoute: Record<string, string>;

  // Session expiry
  sessionExpiredMessage: string | null;
  remainingLoginAttempts: number | null;
  setSessionExpiredMessage: (message: string | null) => void;
  clearSessionExpiredMessage: () => void;

  // Localization & Tenancy
  language: Language;
  setLanguage: (lang: Language) => void;
  calendarType: CalendarType;
  setCalendarType: (cal: CalendarType) => void;
  currentTenant: Tenant;
  currentCampus: Campus | null;
  currentRole: UserRoleType;
  setCurrentRole: (role: UserRoleType) => void;
  activeView: string;
  setActiveView: (view: string) => void;
  /**
   * Target opened inside the Online Coding Lab (project or
   * assignment id), derived from the URL so deep links,
   * refresh and history all work.
   */
  codingLabRoute: CodingLabRoute;
  /** Navigates to a coding-lab target and records it in the URL. */
  openCodingLabTarget: (target: {
    role: "student" | "teacher";
    projectId?: string | null;
    assignmentId?: string | null;
  }) => void;
  /**
   * Course the Course Workspace should open.
   *
   * My Courses and the LMS are two views onto one course system, so a card click
   * hands the course id over here and `LmsWorkspace` opens it. It is never a
   * second source of course data — the workspace still fetches and authorises
   * the course itself.
   */
  activeCourseId: string | null;
  openCourse: (courseId: string) => void;

  /**
   * Seeds the attendance module with a specific register, so a teacher coming from
   * a class in My Timetable opens that class's register rather than whichever one is
   * currently open. A hint only: the attendance module still fetches and authorises
   * the session itself.
   */
  activeAttendanceSessionId: string | null;
  openAttendanceSession: (sessionId: string | null) => void;

  // Master Collections (fetched from the institution API)
  students: Student[];
  courses: Course[];
  sections: Section[];

  // Responsive Layout
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;

  // Active Modals
  activeReceipt: Receipt | null;
  setActiveReceipt: (payment: Receipt | null) => void;
  activePaymentModal: PaymentTarget | null;
  setActivePaymentModal: (invoice: PaymentTarget | null) => void;

  // Master data loader - fetches institution data from the real API
  loadMasterData: () => Promise<void>;
}

export type { CodingLabRoute } from "../lib/appRoutes";

const CollegeOSContext = createContext<CollegeOSContextType | null>(null);

/**
 * Single institutional workspace descriptor. The tenant record
 * itself is server-side configuration; this constant only names
 * the workspace the deployed instance serves.
 */
const INITIAL_TENANTS: Tenant[] = [
  {
    id: "tenant-1",
    slug: "institution",
    name: "Institutional Workspace",
    nameNe: "संस्थागत कार्यक्षेत्र",
    code: "INST",
    type: "UNIVERSITY",
    status: "ACTIVE",
    config: {
      defaultLanguage: "en",
      defaultCalendar: "BS",
      defaultCurrency: "NPR",
      timezone: "Asia/Kathmandu",
      academicYearStartBS: "2081-01-01",
      features: {
        admissions: true,
        onlinePayment: true,
        library: true,
        facilities: true,
        plagiarismDetection: true,
        aiAssistant: true,
      },
    },
  },
];

/**
 * Roles that were consolidated into `super_admin`. Mirrors
 * `backend/src/permissions/catalog.js` so a session issued before the
 * consolidation still resolves to the surviving role instead of an
 * unknown-role shell.
 */
const LEGACY_ROLE_ALIASES: Record<string, UserRoleType> = {
  institution_admin: "super_admin",
};

function createTabId(): string {
  try {
    return `${crypto.randomUUID()}:${Date.now()}`;
  } catch {
    return `${Math.random().toString(36).slice(2)}:${Date.now()}`;
  }
}

function normalizeRole(role?: string | null): UserRoleType {
  const candidate = String(role || "student") as UserRoleType;
  return LEGACY_ROLE_ALIASES[candidate] ?? candidate;
}

function normalizeRoleList(roles?: string[] | null): UserRoleType[] {
  const source = Array.isArray(roles) && roles.length > 0 ? roles : ["student"];
  const normalized: UserRoleType[] = [];
  for (const role of source) {
    const resolved = normalizeRole(role);
    if (!normalized.includes(resolved)) normalized.push(resolved);
  }
  return normalized;
}

/**
 * The receipt modal renders a persisted payment record returned
 * by the finance API. The gateway modal opens for an invoice the
 * caller selected. Both shapes mirror the API payloads so the
 * context never fabricates financial records.
 */
interface Receipt {
  id: string;
  tenantId: string;
  invoiceId: string;
  studentId: string;
  studentName: string;
  paymentNumber: string;
  amount: number;
  method: string;
  gatewayTransactionId?: string;
  status: string;
  confirmedAt: { bs: string; ad: string };
  receiptNumber: string;
  amountInWordsNe: string;
}

interface PaymentTarget {
  id: string;
  invoiceNumber: string;
  termName: string;
  studentName: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
}

export const CollegeOSProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const tabIdRef = useRef(createTabId());

  // Authentication & Session State (Login-First: starts unauthenticated)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [remainingLoginAttempts, setRemainingLoginAttempts] = useState<number | null>(null);
  const [isHydrating, setIsHydrating] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const [loginTransition, setLoginTransition] = useState<boolean>(false);
  const [intendedDestination, setIntendedDestination] = useState<string | null>(null);

  const [language, setLanguageState] = useState<Language>("en");
  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    setCalendarType(lang === "ne" ? "BS" : "AD");
  };
  const [calendarType, setCalendarTypeState] = useState<CalendarType>(() =>
    localStorage.getItem("collegeos_calendar") === "AD" ? "AD" : "BS",
  );
  const setCalendarType = (value: CalendarType) => {
    setCalendarTypeState(value);
    localStorage.setItem("collegeos_calendar", value);
  };
  const currentTenant = INITIAL_TENANTS[0];
  const [currentCampus] = useState<Campus | null>(null);
  const [currentRole, setCurrentRoleState] =
    useState<UserRoleType>("super_admin");
  // Initialize activeView from current URL to preserve route on refresh
  const [activeView, setActiveViewState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return resolveRoute(window.location.pathname).view;
    }
    return "dashboard";
  });
  const [codingLabRoute, setCodingLabRoute] = useState<CodingLabRoute>(
    () => {
      if (typeof window !== "undefined") {
        return resolveRoute(window.location.pathname).codingLab;
      }
      return { projectId: null, assignmentId: null };
    },
  );
  const setActiveView = (view: string) => {
    setActiveViewState(view);
    sessionStorage.setItem("collegeos_active_view", view);
    const route = viewToRoute[view];
    if (route && window.location.pathname !== route) {
      window.history.pushState({}, "", route);
    }
  };
  const openCodingLabTarget = (target: {
    role: "student" | "teacher";
    projectId?: string | null;
    assignmentId?: string | null;
  }) => {
    const base = target.role === "teacher" ? "/teacher/coding-lab" : "/student/coding-lab";
    let path = base;
    if (target.projectId) path = `${base}/projects/${target.projectId}`;
    else if (target.assignmentId) path = `${base}/assignments/${target.assignmentId}`;
    setCodingLabRoute({
      projectId: target.projectId || null,
      assignmentId: target.assignmentId || null,
    });
    setActiveViewState(target.role === "teacher" ? "teacher_coding_lab" : "student_coding_lab");
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  };

  useEffect(() => {
    const syncRoute = () => {
      const resolved = resolveRoute(window.location.pathname);
      let view = resolved.view;
      // If URL doesn't resolve to a specific route, fall back to persisted session view
      if (view === "dashboard" && window.location.pathname !== "/") {
        const persisted = sessionStorage.getItem("collegeos_active_view");
        if (persisted) view = persisted;
      }
      setActiveViewState(view);
      setCodingLabRoute(resolved.codingLab);
      sessionStorage.setItem("collegeos_active_view", view);
    };
    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  // Master data populated exclusively from the institution API.
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<Section[]>([]);

  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  /** Hands a course to the existing Course Workspace rather than opening a new one. */
  const openCourse = (courseId: string) => {
    setActiveCourseId(courseId);
    setActiveView("lms");
  };
  /**
   * Which attendance register the caller was last sent to.
   *
   * Set by My Timetable's "Take attendance" so a teacher arriving from a specific
   * class lands on that class's register rather than on whichever one happens to be
   * open. It seeds the attendance module; it does not replace it — the register, its
   * marks, its corrections and its QR flow all remain the attendance module's.
   */
  const [activeAttendanceSessionId, setActiveAttendanceSessionId] = useState<
    string | null
  >(null);
  const openAttendanceSession = (sessionId: string | null) => {
    setActiveAttendanceSessionId(sessionId);
  };
  const [activePaymentModal, setActivePaymentModal] = useState<PaymentTarget | null>(
    null,
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    const token = localStorage.getItem("collegeos_token");
    if (!token) {
      setIsHydrating(false);
      return;
    }

    let active = true;
    apiFetch("/auth/me")
      .then(async (response) => {
        if (!response.ok) throw new Error("Session expired");
        return response.json();
      })
      .then(({ user }) => {
        if (!active) return;
        const role = normalizeRole(user.activeRole || user.roles?.[0]);
        const roles = normalizeRoleList(user.roles);
        setCurrentUser({
          id: String(user.id),
          email: user.email,
          name: user.name,
          role,
          roles,
          permissions: user.permissions || [],
          tenantId: currentTenant.id,
          campusId: currentCampus?.id,
          mustChangePassword: Boolean(user.mustChangePassword),
          avatarUrl: user.avatarUrl || undefined,
        });
        setCurrentRoleState(role);
        setMustChangePassword(Boolean(user.mustChangePassword));
        setIsAuthenticated(true);
       setRemainingLoginAttempts(null);
        void loadMasterData();
      })
      .catch(() => {
        if (!active) return;
        localStorage.removeItem("collegeos_token");
        setIsAuthenticated(false);
      })
      .finally(() => {
        if (active) setIsHydrating(false);
      });
    return () => {
      active = false;
    };
  }, [currentCampus?.id, currentTenant.id]);

  // Authentication Handlers
  const login = async (
    email: string,
    pass: string,
    redirectTo?: string,
  ): Promise<boolean> => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPass = pass;

    // Ensure no stale token from a previous session is attached to the login
    // request (or lingers in storage) after a logout/re-login cycle.
    localStorage.removeItem("collegeos_token");

    let response: Response;
    try {
      response = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          password: normalizedPass,
        }),
        // The login endpoint returns 401 for wrong credentials (not session
        // expiry), so we must receive the response body — not an ApiError.
        skipSessionCheck: true,
      });
     } catch (error) {
       throw error instanceof Error ? error : new Error("Authentication error. Please try again.");
     }

     const data = await response.json().catch(() => ({}));
     if (!response.ok) {
       if (response.status === 401) {
         if (typeof data.remainingAttempts === "number") setRemainingLoginAttempts(data.remainingAttempts);
         return false;
       }
       if (response.status === 429) {
         // Locked out — 0 attempts remaining; surface the lockout message.
         setRemainingLoginAttempts(0);
         throw new Error(data.error || "Too many login attempts. Try again later.");
       }
       throw new Error(data.error || "Authentication service is unavailable.");
     }

    try {
      const userRole = normalizeRole(
        data.user?.activeRole || data.user?.roles?.[0],
      );
      const nextUser: AuthUser = {
        id: String(data.user.id),
        email: data.user.email,
        name: data.user.name,
        role: userRole,
        roles: normalizeRoleList(data.user.roles),
        permissions: (data.user.permissions || []) as string[],
        tenantId: currentTenant.id,
        campusId: currentCampus?.id,
        mustChangePassword: Boolean(data.mustChangePassword),
        avatarUrl: data.user.avatarUrl || undefined,
      };

      localStorage.setItem("collegeos_token", data.token);
      if (data.csrfToken) localStorage.setItem("collegeos_csrf_token", data.csrfToken);
      setCurrentUser(nextUser);
      setCurrentRoleState(userRole);
      setIsAuthenticated(true);
      setLoginTransition(true);
      setRemainingLoginAttempts(null);
      setMustChangePassword(Boolean(data.mustChangePassword));
      if (data.mustChangePassword) {
        window.history.replaceState({}, "", "/account/activate");
      } else if (redirectTo && routeToView[redirectTo]) {
        // Redirect to the intended destination after successful login
        window.history.replaceState({}, "", redirectTo);
        setActiveViewState(routeToView[redirectTo]);
      }
      void loadMasterData();
      return true;
    } catch {
      throw new Error(
        "The authentication server returned an invalid response.",
      );
    }
  };

  const logout = async (reason?: SessionEndReason) => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem("collegeos_token");
    if (token) {
      try {
        await apiFetch("/auth/logout", { method: "POST" });
      } catch {
        // Best-effort server revocation; local state is cleared regardless.
      }
    }
    localStorage.removeItem("collegeos_token");
    localStorage.removeItem("collegeos_csrf_token");
    setIsAuthenticated(false);
    setCurrentUser(null);
    setMustChangePassword(false);
    if (window.location.pathname === "/account/activate") {
      window.history.replaceState({}, "", "/");
    }
    sessionBus.publish({
      type: "SESSION_ENDED",
      reason: reason ?? "manual",
      timestamp: Date.now(),
      tabId: tabIdRef.current,
    });
    setSessionExpiredMessage(sessionEndMessage(reason ?? "manual"));
    window.location.replace("/login");
  };

  const completeLoginTransition = () => {
    setLoginTransition(false);
    setSessionExpiredMessage(null);
  };

  const clearSessionExpiredMessage = () => {
    setSessionExpiredMessage(null);
  };

  const signOutRef = useRef(logout);
  signOutRef.current = logout;

  // Any API response that proves the session is invalid ends the session in
  // every tab: clear credentials, broadcast to other tabs, and redirect to
  // login with a message the user can understand.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      void signOutRef.current("token-expired");
    });
    return () => clearSessionExpiredHandler();
  }, []);

  const loadMasterData = async (): Promise<void> => {
    // Master data loaded from institution API
    try {
      const [courseRes, studentRes, sectionRes] = await Promise.all([
        apiRequest<{ courses: any[] }>(`/courses`).catch(() => ({
          courses: [],
        })),
        apiRequest<{ students: any[] }>(`/students`).catch(() => ({
          students: [],
        })),
        apiRequest<{ sections: any[] }>(`/sections`).catch(() => ({
          sections: [],
        })),
      ]);
      setCourses(courseRes.courses || []);
      setStudents(
        (studentRes.students || []).map((s) => ({
          id: s.id || s._id,
          studentId: s.studentId,
          firstName: s.firstName,
          lastName: s.lastName,
          email: s.email,
          program: s.program,
          semester: s.semester,
          batch: s.batch,
          section: s.section,
          status: s.status,
        })) as unknown as Student[],
      );
      setSections(
        (sectionRes.sections || []).map((s) => ({
          id: s.id || s._id,
          name: s.name,
          code: s.code,
        })) as unknown as Section[],
      );
    } catch {
      // Master data load failure is non-fatal; modules will show empty states
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> => {
    const token = localStorage.getItem("collegeos_token");

    if (!token) {
      return false;
    }

    const response = await apiFetch("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword,
        newPassword,
        confirmPassword: newPassword,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message = data.error || "Failed to update password.";
      const err: Error & { code?: string; details?: string[] } = new Error(message);
      err.code = data.code;
      err.details = data.details;
      throw err;
    }

    const data = await response.json();
    const nextUser = data.user
      ? {
          ...currentUser,
          ...data.user,
          role: normalizeRole(data.user.activeRole || data.user.roles?.[0]),
          roles: normalizeRoleList(data.user.roles),
          tenantId: currentTenant.id,
          campusId: currentCampus?.id,
          mustChangePassword: false,
        }
      : currentUser;

    localStorage.setItem("collegeos_token", data.token);
    if (data.csrfToken) localStorage.setItem("collegeos_csrf_token", data.csrfToken);
    setCurrentUser(nextUser);
    setMustChangePassword(false);
    completeLoginTransition();
    if (window.location.pathname === "/account/activate") {
      window.history.replaceState({}, "", "/");
    }
    return true;
  };

  const setCurrentRole = (role: UserRoleType) => {
    const token = localStorage.getItem("collegeos_token");
    if (!token || !(currentUser?.roles || []).includes(role)) return;
    void apiFetch("/auth/active-role", {
      method: "POST",
      body: JSON.stringify({ role }),
    }).then(async (response) => {
      if (response.ok) {
        const result = await response.json();
        setCurrentUser((user) =>
          user
            ? { ...user, role, permissions: result.permissions || [] }
            : user,
        );
        setCurrentRoleState(role);
      }
    });
  };

  return (
    <CollegeOSContext.Provider
      value={{
        isAuthenticated,
        isHydrating,
        currentUser,
        mustChangePassword,
        loginTransition,
        completeLoginTransition,
        login,
        logout,
        loadMasterData,
        changePassword,
        language,
        setLanguage,
        calendarType,
        setCalendarType,
        currentTenant,
        currentCampus,
        currentRole,
        setCurrentRole,
        activeView,
        setActiveView,
        codingLabRoute,
        openCodingLabTarget,
        activeCourseId,
        openCourse,
        activeAttendanceSessionId,
        openAttendanceSession,
        students,
        courses,
        sections,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        activeReceipt,
        setActiveReceipt,
        activePaymentModal,
        setActivePaymentModal,
        intendedDestination,
        setIntendedDestination,
        viewToRoute,
         sessionExpiredMessage,
         setSessionExpiredMessage,
         clearSessionExpiredMessage,
         remainingLoginAttempts,
      }}
    >
      {children}
    </CollegeOSContext.Provider>
  );
};

export const useCollegeOS = () => {
  const context = useContext(CollegeOSContext);
  if (!context) {
    throw new Error("useCollegeOS must be used within a CollegeOSProvider");
  }
  return context;
};
