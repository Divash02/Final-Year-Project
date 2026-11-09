import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faCopy,
  faPlus,
  faRotate,
  faSearch,
  faShieldHalved,
  faTrash,
  faUserPlus,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest, ApiError } from "../../services/apiClient";
import { fetchTimetableFilters } from "../../services/adminTimetableApi";
import {
  formatDateTimeForCalendar,
  formatTimestampForCalendar,
} from "../../lib/nepaliCalendar";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useToast } from "../ui/ToastContainer";
import { MultiSelect } from "../ui/MultiSelect";

interface ProvisioningRole {
  name: string;
  label: string;
}

interface ManagedUser {
  id: number;
  email: string;
  name: string;
  department: string | null;
  programme: string | null;
  roles: string[];
  accountStatus: string;
  passwordStatus: string;
  createdAt: string;
  firstLoginAt?: string | null;
  activatedAt: string | null;
  lastLoginAt: string | null;
  lastPasswordChangedAt?: string | null;
}

interface AccountCounts {
  total: number;
  PASSIVE: number;
  ACTIVE: number;
  SUSPENDED: number;
  DISABLED: number;
  ARCHIVED: number;
  TEMPORARY: number;
  PERMANENT: number;
}

interface AccountEvent {
  action: string;
  details: string;
  created_at: string;
}

interface ProvisioningResult {
  userId: number;
  name: string;
  email: string;
  role: string;
  accountStatus: string;
  passwordStatus: string;
  credentialExpiresAt: string;
  temporaryPassword: string;
}

interface Course {
  id: string;
  code: string;
  name: string;
  department: string | null;
  program: string | null;
  semester: number | null;
  academicYear: string | null;
  courseType: string;
  credits: number | null;
  status: string;
}

interface ProgramOption {
  code: string;
  name: string;
  department?: string | null;
  totalSemesters?: number | null;
}

interface SubjectAssignment {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  department: string | null;
  program: string | null;
  semester: number | null;
  academicYear: string | null;
  courseType: string;
  credits: number | null;
}

interface ManagedUser {
  id: number;
  email: string;
  name: string;
  department: string | null;
  programme: string | null;
  roles: string[];
  accountStatus: string;
  passwordStatus: string;
  createdAt: string;
  firstLoginAt?: string | null;
  activatedAt: string | null;
  lastLoginAt: string | null;
  lastPasswordChangedAt?: string | null;
  subjectAssignments?: SubjectAssignment[];
}

const statusClass: Record<string, string> = {
  PASSIVE: "bg-amber-50 text-amber-800 border-amber-200",
  ACTIVE: "bg-emerald-50 text-emerald-800 border-emerald-200",
  SUSPENDED: "bg-orange-50 text-orange-800 border-orange-200",
  DISABLED: "bg-slate-100 text-slate-600 border-slate-200",
  ARCHIVED: "bg-slate-100 text-slate-600 border-slate-200",
};

const STAFF_ACCOUNT_ROLES = new Set([
  "campus_admin",
  "dean",
  "hod",
  "registrar",
  "exam_officer",
  "finance_officer",
  "faculty",
]);

export const UserManagementView: React.FC = () => {
  const { calendarType, language } = useCollegeOS();
  const toast = useToast();
  const success = (message: string) => toast.showToast(message, "success");
  const showError = (message: string) => toast.showToast(message, "error");
  const [roles, setRoles] = useState<ProvisioningRole[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [accountCounts, setAccountCounts] = useState<AccountCounts>({
    total: 0,
    PASSIVE: 0,
    ACTIVE: 0,
    SUSPENDED: 0,
    DISABLED: 0,
    ARCHIVED: 0,
    TEMPORARY: 0,
    PERMANENT: 0,
  });
  const [domain, setDomain] = useState("");
  const [domainDraft, setDomainDraft] = useState("");
  const [minimumPasswordLength, setMinimumPasswordLength] = useState(8);
  const [minimumPasswordLengthDraft, setMinimumPasswordLengthDraft] = useState("8");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [credentialFilter, setCredentialFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [details, setDetails] = useState<{
    user: ManagedUser;
    events: AccountEvent[];
  } | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisioned, setProvisioned] = useState<ProvisioningResult | null>(
    null,
  );
  const [showCredential, setShowCredential] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [busy, setBusy] = useState(false);

  // Delete account confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleteConfirmLoading, setDeleteConfirmLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState("");

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAcademicYear, setBulkAcademicYear] = useState("");
  const [bulkAcademicYears, setBulkAcademicYears] = useState<string[]>([]);
  const [bulkOptionsLoading, setBulkOptionsLoading] = useState(false);
  const [bulkProgram, setBulkProgram] = useState("");
  const [bulkDepartment, setBulkDepartment] = useState("");
  const [bulkBatch, setBulkBatch] = useState("");
  const [bulkSemester, setBulkSemester] = useState("");
  const [bulkSection, setBulkSection] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkRecords, setBulkRecords] = useState<any[]>([]);
  const [bulkValid, setBulkValid] = useState<any[]>([]);
  const [bulkInvalid, setBulkInvalid] = useState<any[]>([]);
  const [bulkStep, setBulkStep] = useState<"input" | "preview" | "result">("input");
  const [bulkError, setBulkError] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);

  useEffect(() => {
    if (!bulkOpen) return;
    let active = true;
    setBulkOptionsLoading(true);
    (async () => {
      try {
        const data: any = await fetchTimetableFilters();
        const f = data?.filters || {};
        if (!active) return;
        setBulkAcademicYears(Array.isArray(f.academicYears) ? f.academicYears : []);
        if (!bulkAcademicYear || !f.academicYears.includes(bulkAcademicYear)) {
          setBulkAcademicYear(f.academicYears?.[0] || "");
        }
      } catch {
        if (!active) return;
        setBulkAcademicYears([]);
      } finally {
        if (active) setBulkOptionsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [bulkOpen, bulkAcademicYear]);

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [studentId, setStudentId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [program, setProgram] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [roleChangeTarget, setRoleChangeTarget] = useState("");
  const [roleChangeReason, setRoleChangeReason] = useState("");
  const [roleChangeEmployeeId, setRoleChangeEmployeeId] = useState("");
  const [roleChangeDepartment, setRoleChangeDepartment] = useState("");
  const [roleChangeDesignation, setRoleChangeDesignation] = useState("");
  const [batch, setBatch] = useState("");
  const [semester, setSemester] = useState("");
  const [section, setSection] = useState("");
  const [campus, setCampus] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<string[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [subjectWarning, setSubjectWarning] = useState<string | null>(null);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [availableSemesters, setAvailableSemesters] = useState<number[]>([]);
  const [selectedSemesters, setSelectedSemesters] = useState<number[]>([]);
  const [semestersLoading, setSemestersLoading] = useState(false);
  const [semestersError, setSemestersError] = useState<string | null>(null);
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (roleFilter) params.set("role", roleFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (credentialFilter) params.set("credentialStatus", credentialFilter);
    const result = await apiRequest<{
      users: ManagedUser[];
      counts: AccountCounts;
    }>(`/admin/users?${params}`);
    setUsers(result.users);
    setAccountCounts(result.counts);
  }, [credentialFilter, query, roleFilter, statusFilter]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ roles: ProvisioningRole[] }>("/admin/provisioning-roles"),
      apiRequest<{
        emailDomain: string;
        minimumPasswordLength: number;
      }>("/admin/identity-settings"),
      apiRequest<{ users: ManagedUser[]; counts: AccountCounts }>(
        "/admin/users",
      ),
    ])
      .then(([roleResult, settingResult, userResult]) => {
        if (!active) return;
        setRoles(roleResult.roles);
        setRole("");
        setDomain(settingResult.emailDomain);
        setDomainDraft(settingResult.emailDomain);
        setMinimumPasswordLength(settingResult.minimumPasswordLength);
        setMinimumPasswordLengthDraft(String(settingResult.minimumPasswordLength));
        setUsers(userResult.users);
        setAccountCounts(userResult.counts);
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load account management.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      void loadUsers().catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load accounts.",
        ),
      );
    }, 180);
    return () => window.clearTimeout(timer);
  }, [departmentFilter, loadUsers, loading]);

  useEffect(() => {
    if (selected === null) {
      setDetails(null);
      setSubjectAssignments([]);
      return;
    }
    let active = true;
    apiRequest<{ user: ManagedUser; events: AccountEvent[] }>(
      `/admin/users/${selected}`,
    )
      .then((result) => {
        if (active) {
          setDetails(result);
          setRoleChangeTarget(result.user.roles[0] || "");
          setRoleChangeDepartment(result.user.department || "");
          if (result.user.subjectAssignments) {
            setSubjectAssignments(result.user.subjectAssignments.map((sa) => sa.courseId));
            const sems = [...new Set(
              result.user.subjectAssignments
                .map((sa) => sa.semester)
                .filter((s): s is number => Number.isInteger(s) && (s as number) >= 1),
            )].sort((a, b) => (a as number) - (b as number)) as number[];
            setSelectedSemesters(sems);
          } else {
            setSubjectAssignments([]);
            setSelectedSemesters([]);
          }
        }
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load account details.",
          );
      });
    return () => {
      active = false;
    };
  }, [selected]);

  // Load academic programs for faculty assignment context
  useEffect(() => {
    if (role !== "faculty") {
      setProgramOptions([]);
      return;
    }
    let active = true;
    setProgramsLoading(true);
    apiRequest<{ filters: { programs?: ProgramOption[] } }>("/courses/filters")
      .then((result) => {
        if (!active) return;
        const programs = Array.isArray(result.filters?.programs) ? result.filters.programs : [];
        setProgramOptions(programs);
        if (!program && programs.length === 1) setProgram(programs[0].code);
      })
      .catch(() => {
        if (active) setProgramOptions([]);
      })
      .finally(() => {
        if (active) setProgramsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [role, program]);

  // Load semesters when role changes to faculty (program-aware)
  useEffect(() => {
    if (role !== "faculty") {
      setAvailableSemesters([]);
      setSelectedSemesters([]);
      setCourses([]);
      setSubjectAssignments([]);
      setSubjectsError(null);
      setSemestersError(null);
      setSubjectWarning(null);
      return;
    }
    let active = true;
    setSemestersLoading(true);
    setSemestersError(null);
    const params = program ? `?program=${encodeURIComponent(program)}` : "";
    apiRequest<{ filters: { semesters: number[] } }>(`/courses/filters${params}`)
      .then((result) => {
        if (!active) return;
        const semesters = (result.filters?.semesters || [])
          .map((s) => Number(s))
          .filter((s) => Number.isInteger(s) && s >= 1)
          .sort((a, b) => a - b);
        setAvailableSemesters(semesters);
        setSelectedSemesters((prev) => prev.filter((s) => semesters.includes(s)));
      })
      .catch((err) => {
        if (!active) return;
        setAvailableSemesters([]);
        setSemestersError(err instanceof Error ? err.message : "Failed to load semesters.");
      })
      .finally(() => {
        if (active) setSemestersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [role, program]);

  const loadCoursesForSemesters = useCallback(async (semesters: number[]) => {
    if (role !== "faculty" || semesters.length === 0) {
      setCourses([]);
      setSubjectAssignments([]);
      setSubjectsError(null);
      return;
    }
    setCoursesLoading(true);
    setSubjectsError(null);
    try {
      const params = new URLSearchParams();
      params.set("scope", "curriculum");
      params.set("limit", "200");
      if (program) params.set("program", program);
      semesters.forEach((s) => params.append("semester", String(s)));
      const result = await apiRequest<{ courses: Course[] }>(`/courses?${params.toString()}`);
      const loadedCourses = (result.courses || []).filter((c) => c.status === "ACTIVE");
      setCourses(loadedCourses);
      const validCourseIds = new Set(loadedCourses.map((c) => c.id));
      setSubjectAssignments((prev) => {
        const next = prev.filter((id) => validCourseIds.has(id));
        if (next.length !== prev.length) {
          setSubjectWarning("Some selected subjects were removed because their semester is no longer selected.");
        }
        return next;
      });
    } catch (err) {
      setCourses([]);
      setSubjectsError(err instanceof Error ? err.message : "Failed to load subjects.");
    } finally {
      setCoursesLoading(false);
    }
  }, [role, program]);

  // Load courses when selected semesters/program change
  useEffect(() => {
    if (role !== "faculty") return;
    if (selectedSemesters.length === 0) {
      setCourses([]);
      setSubjectAssignments([]);
      setSubjectsError(null);
      return;
    }
    void loadCoursesForSemesters(selectedSemesters);
  }, [role, selectedSemesters, loadCoursesForSemesters]);

  const visibleUsers = useMemo(() => {
    const filter = departmentFilter.trim().toLowerCase();
    return filter
      ? users.filter((user) => user.department?.toLowerCase().includes(filter))
      : users;
  }, [departmentFilter, users]);

  const resetForm = () => {
    setFirstName("");
    setMiddleName("");
    setLastName("");
    setPersonalEmail("");
    setPhone("");
    setStudentId("");
    setEmployeeId("");
    setProgram("");
    setDepartment("");
    setDesignation("");
    setBatch("");
    setSemester("");
    setSection("");
    setCampus("");
    setSubjectAssignments([]);
    setSelectedSemesters([]);
    setCourses([]);
    setSubjectsError(null);
    setSemestersError(null);
    setSubjectWarning(null);
    setSubjectSearch("");
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setProvisioning(false);
    setBusy(true);
    setError("");

    try {
      const result = await apiRequest<ProvisioningResult>("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          firstName,
          middleName,
          lastName,
          personalEmail,
          phone,
          role,
          studentId,
          employeeId,
          program,
          department,
          designation,
          batch,
          semester: semester ? Number(semester) : null,
          section,
          campus,
          assignedSemesters: role === "faculty" ? selectedSemesters : [],
          subjectAssignments: role === "faculty" ? subjectAssignments : [],
        }),
      });
      setProvisioned(result);
      setShowCredential(false);
      setCopied(false);
      resetForm();
      await loadUsers();
    } catch (requestError) {
      const message =
        requestError instanceof ApiError && requestError.status === 409
          ? "Employee ID or institutional email may already exist. " + requestError.message
          : requestError instanceof ApiError && requestError.status === 403
            ? "You do not have permission to create this account."
            : requestError instanceof Error
              ? requestError.message
              : "Account creation failed.";
      toast.toast({ variant: "error", message, duration: 6000 });
    } finally {
      setBusy(false);
    }
  };

  const saveDomain = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    try {
      const result = await apiRequest<{
        emailDomain: string;
        minimumPasswordLength: number;
      }>("/admin/identity-settings", {
        method: "PATCH",
        body: JSON.stringify({
          emailDomain: domainDraft,
          minimumPasswordLength: Number(minimumPasswordLengthDraft),
        }),
      });
        setDomain(result.emailDomain);
        setDomainDraft(result.emailDomain);
        setMinimumPasswordLength(result.minimumPasswordLength);
        setMinimumPasswordLengthDraft(String(result.minimumPasswordLength));
      success("Identity and password policy settings updated.");
    } catch (requestError) {
      showError(
        requestError instanceof Error
          ? requestError.message
          : "Domain update failed.",
      );
    }
  };

  const copyCredential = async () => {
    if (!provisioned) return;
    try {
      await navigator.clipboard.writeText(provisioned.temporaryPassword);
      setCopied(true);
    } catch {
      showError(
        "Clipboard access is unavailable. Reveal and copy the credential manually now.",
      );
    }
  };

  const issueTemporaryCredential = async (userId: number) => {
    const reason = window.prompt(
      "Enter a reason for issuing a temporary credential:",
    );
    if (!reason) return;
    setError("");

    try {
      const result = await apiRequest<ProvisioningResult>(
        `/admin/users/${userId}/reset-password`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
      );
      const user = users.find((item) => item.id === userId);
      setProvisioned({
        ...result,
        name: user?.name || "",
        email: user?.email || "",
        role: user?.roles[0] || "",
      });
      setShowCredential(false);
      setCopied(false);
      setSelected(null);
      await loadUsers();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Credential reset failed.",
      );
    }
  };

  const updateStatus = async (
    userId: number,
    action: "SUSPEND" | "DISABLE" | "REACTIVATE",
  ) => {
    const reason = window.prompt(`Reason for ${action.toLowerCase()}:`);
    if (!reason) return;
    setError("");

    try {
      await apiRequest(`/admin/users/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ action, reason }),
      });
      success(
        action === "REACTIVATE"
          ? "Account reactivated."
          : action === "SUSPEND"
            ? "Account suspended."
            : "Account disabled.",
      );
      await loadUsers();
      if (selected === userId) {
        const result = await apiRequest<{
          user: ManagedUser;
          events: AccountEvent[];
        }>(`/admin/users/${userId}`);
        setDetails(result);
      }
    } catch (requestError) {
      showError(
        requestError instanceof Error
          ? requestError.message
          : "Account status could not be changed.",
      );
    }
  };

  const bulkDeleteAccounts = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleteLoading(true);
    setBulkDeleteError("");
    try {
      const result: any = await apiRequest("/admin/users/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const deletedCount = Array.isArray(result?.deleted) ? result.deleted.length : 0;
      const failed = Array.isArray(result?.failed) ? result.failed : [];
      if (failed.length > 0) {
        setBulkDeleteError(
          `Some accounts could not be deleted: ${failed.map((f: any) => f.error).join("; ")}`,
        );
      }
      const deletedIds = new Set((result?.deleted || []).map((d: any) => d.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id as number));
        return next;
      });
      await loadUsers();
      if (deletedCount > 0) {
        toast.toast({ message: `${deletedCount} accounts deleted successfully.`, variant: "success", duration: 7000 });
      }
      if (failed.length === 0) setBulkDeleteConfirmOpen(false);
    } catch (requestError) {
      setBulkDeleteError(
        requestError instanceof Error ? requestError.message : "Bulk delete failed.",
      );
    } finally {
      setBulkDeleteLoading(false);
    }
  };
  const deleteAccount = async (userId: number) => {
    if (!details) return;

    // Open confirmation dialog
    setDeleteConfirmEmail("");
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteAccount = async () => {
    if (selected === null || !details) return;

    // Verify the confirmation email matches
    if (deleteConfirmEmail.trim().toLowerCase() !== details.user.email.toLowerCase()) {
      setError("Email confirmation does not match. Please enter the exact institutional email.");
      return;
    }

    setDeleteConfirmLoading(true);
    setError("");


    try {
      await apiRequest(`/admin/users/${selected}`, {
        method: "DELETE",
      });

      success(`Account ${details.user.name} (${details.user.email}) permanently deleted.`);
      setDeleteConfirmOpen(false);
      setSelected(null);
      await loadUsers();
    } catch (requestError) {
      showError(
        requestError instanceof Error
          ? requestError.message
          : "Account deletion failed.",
      );
    } finally {
      setDeleteConfirmLoading(false);
    }
  };

  const changeAccountRole = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selected === null) return;
    setError("");

    try {
      await apiRequest(`/admin/users/${selected}/change-role`, {
        method: "POST",
        body: JSON.stringify({
          role: roleChangeTarget,
          reason: roleChangeReason,
          employeeId: roleChangeEmployeeId,
          department: roleChangeDepartment,
          designation: roleChangeDesignation,
        }),
      });
      success("Account role updated; existing user sessions were revoked.");
      setRoleChangeReason("");
      setRoleChangeEmployeeId("");
      setRoleChangeDesignation("");
      await loadUsers();
      const updated = await apiRequest<{
        user: ManagedUser;
        events: AccountEvent[];
      }>(`/admin/users/${selected}`);
      setDetails(updated);
      setRoleChangeTarget(updated.user.roles[0] || "");
    } catch (requestError) {
      showError(
        requestError instanceof Error
          ? requestError.message
          : "Role change failed.",
      );
    }
  };

  const selectedRole = role;

  return (
    <section className="min-h-full bg-slate-50 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <FontAwesomeIcon icon={faShieldHalved} className="text-blue-700" />{" "}
            User &amp; Account Management
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Provision identities, track activation, and issue credentials
            without exposing stored passwords.
          </p>
        </div>
        <button
          type="button"
        onClick={() => {
          setBulkOpen(true);
          setBulkAcademicYear(""); setBulkAcademicYears([]); setBulkOptionsLoading(false);
          setBulkProgram(""); setBulkDepartment(""); setBulkBatch("");
          setBulkSemester(""); setBulkSection(""); setBulkText("");
          setBulkResult(null); setBulkError("");
        }}
          className="inline-flex items-center gap-2 rounded-md border border-blue-700 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
        >
          <FontAwesomeIcon icon={faUserPlus} /> Bulk Student Creation
        </button>
        <button
          type="button"
          disabled={roles.length === 0}
          onClick={() => {
            setProvisioning(true);
            setProvisioned(null);
          }}
          className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faUserPlus} /> Create account
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-800"
        >
          {error}
        </div>
      )}

      <div className="space-y-5 p-5">
        <form
          onSubmit={saveDomain}
          className="flex flex-wrap items-end gap-3 border border-slate-200 bg-white p-4"
        >
          <div className="min-w-48 flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Institutional email domain
            </label>
            <input
              value={domainDraft}
              onChange={(event) => setDomainDraft(event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-xs"
              placeholder="college.edu.np"
            />
          </div>
            <label className="w-44 text-sm text-slate-600">
              Minimum password length
              <input
                type="number"
                min={8}
                max={72}
                required
                value={minimumPasswordLengthDraft}
                onChange={(event) => {
                  const val = event.target.value;
                  if (val === "") {
                    setMinimumPasswordLengthDraft("");
                    return;
                  }
                  // Prevent leading zeros except for just "0"
                  if (/^0[0-9]+$/.test(val)) {
                    setMinimumPasswordLengthDraft(val.replace(/^0+/, "") || "0");
                    return;
                  }
                  setMinimumPasswordLengthDraft(val);
                }}
                onBlur={() => {
                  if (minimumPasswordLengthDraft === "" || Number(minimumPasswordLengthDraft) < 8) {
                    setMinimumPasswordLengthDraft("8");
                  }
                }}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-xs"
              />
            </label>
          <p className="w-full text-sm text-slate-500">
            {domain ? (
              <>
                Generated addresses use <strong>@{domain}</strong>.{" "}
              </>
            ) : (
              <>Configured email domain is unavailable. </>
            )}
            Minimum length currently enforced:{" "}
            <strong>{minimumPasswordLength}</strong>.
          </p>
          <button
            disabled={loading || !domainDraft.trim()}
            className="rounded border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save domain
          </button>
        </form>

        <div className="grid grid-cols-2 gap-px border border-slate-200 bg-slate-200 sm:grid-cols-4">
          {(["ACTIVE", "PASSIVE", "SUSPENDED", "DISABLED"] as const).map(
            (status) => (
              <div key={status} className="bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  {status}
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {accountCounts[status]}
                </p>
              </div>
            ),
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-48 flex-1 items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-slate-400">
            <FontAwesomeIcon icon={faSearch} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or institutional email"
              className="min-w-0 flex-1 text-xs text-slate-800 outline-none"
            />
          </label>
          <input
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
            placeholder="Department"
            className="w-36 rounded border border-slate-300 bg-white px-2 py-2 text-xs"
          />
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-2 text-xs"
          >
            <option value="">All permitted roles</option>
            {roles.map((item) => (
              <option key={item.name} value={item.name}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-2 text-xs"
          >
            <option value="">All statuses</option>
            {["ACTIVE", "PASSIVE", "SUSPENDED", "DISABLED"].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          {selectedIds.size > 0 && (
            <button
              type="button"
              disabled={bulkDeleteLoading}
              onClick={() => setBulkDeleteConfirmOpen(true)}
              className="rounded border border-red-600 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {bulkDeleteLoading ? "Deleting…" : `Delete selected (${selectedIds.size})`}
            </button>
          )}
          <select
            value={credentialFilter}
            onChange={(event) => setCredentialFilter(event.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-2 text-xs"
          >
            <option value="">All credentials</option>
            <option value="TEMPORARY">Temporary</option>
            <option value="PERMANENT">Password set</option>
          </select>
        </div>

        <div className="overflow-x-auto border border-slate-200 bg-white">
          {loading ? (
            <p className="p-6 text-xs text-slate-500">
              Loading institutional accounts…
            </p>
          ) : visibleUsers.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-500">
              No institutional accounts match these filters.
            </p>
          ) : (
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all users"
                      checked={visibleUsers.length > 0 && visibleUsers.every((u) => selectedIds.has(u.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(visibleUsers.map((u) => u.id)));
                        else setSelectedIds(new Set());
                      }}
                    />
                  </th>
                  <th className="px-4 py-3">Person</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Credential</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleUsers.map((user) => (
                   <tr key={user.id} className="hover:bg-slate-50">
                     <td className="px-4 py-3">
                       <input
                         type="checkbox"
                         aria-label={`Select ${user.name}`}
                         checked={selectedIds.has(user.id)}
                         onChange={(e) => {
                           const next = new Set(selectedIds);
                           if (e.target.checked) next.add(user.id);
                           else next.delete(user.id);
                           setSelectedIds(next);
                         }}
                       />
                     </td>
                     <td className="px-4 py-3">
                       <p className="font-semibold text-slate-900">
                        {user.name}
                      </p>
                      <p className="cos-page-subtitle">
                        {user.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {user.roles.join(", ").replaceAll("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {user.department || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass[user.accountStatus] || statusClass.DISABLED}`}
                      >
                        {user.accountStatus}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">
                        {user.accountStatus === "PASSIVE"
                          ? "First-time password setup required"
                          : user.accountStatus === "ACTIVE"
                            ? "Activated by user"
                            : "Access restricted"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {user.passwordStatus === "TEMPORARY" ? (
                        <span className="text-amber-800">
                          Temporary pending
                        </span>
                      ) : (
                        <span className="text-slate-600">Password set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatTimestampForCalendar(
                        user.createdAt,
                        calendarType,
                        language,
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(user.id)}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {bulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/50 p-4">
          <section className="w-full max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xl" role="dialog" aria-modal="true">
            <h2 className="text-base font-semibold">Permanently Delete Accounts?</h2>
            <p className="text-xs text-slate-600">
              This will permanently delete {selectedIds.size} selected account(s). This action cannot simply be undone.
            </p>
            {bulkDeleteError && <p className="text-xs text-red-600">{bulkDeleteError}</p>}
            <div className="max-h-60 overflow-y-auto rounded border border-slate-200">
              <ul className="divide-y divide-slate-100 text-xs">
                {users.filter((u) => selectedIds.has(u.id)).map((u) => (
                  <li key={u.id} className="px-3 py-2">
                    <p className="font-medium">{u.name}</p>
                    <p className="text-slate-500">{u.email}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={bulkDeleteLoading} onClick={() => { setBulkDeleteConfirmOpen(false); setBulkDeleteError(""); }} className="rounded border border-slate-300 px-3 py-2 text-xs">
                Cancel
              </button>
              <button type="button" disabled={bulkDeleteLoading} onClick={() => void bulkDeleteAccounts()} className="rounded bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {bulkDeleteLoading ? "Deleting…" : "Permanently Delete"}
              </button>
            </div>
          </section>
        </div>
      )}
      {provisioning && (
        <div
          className="fixed inset-0 z-[210] overflow-y-auto bg-slate-950/40 p-4"
          role="presentation"
        >
          <form
            onSubmit={createAccount}
            className="mx-auto my-8 max-w-4xl space-y-6 rounded-2xl border border-slate-200/80 bg-white p-0 shadow-2xl"

            role="dialog"
            aria-modal="true"
            aria-labelledby="provision-title"
          >
            <div className="flex items-center justify-between gap-4 rounded-t-2xl border-b border-slate-100 bg-slate-50/80 px-6 py-5">
              <div>
                <h2 id="provision-title" className="text-xl font-semibold tracking-tight text-slate-900">
                  Create Institutional Account
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Set up an institutional account and configure its academic access.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProvisioning(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="space-y-6 px-6 py-6">

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="text-sm text-slate-600">
                  First name <span className="text-red-500">*</span>
                  <input
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                />
              </label>
                <label className="text-sm text-slate-600">
                  Middle name
                  <input
                    value={middleName}
                    onChange={(event) => setMiddleName(event.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Last name <span className="text-red-500">*</span>
                  <input
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Role <span className="text-red-500">*</span>
                  <select
                    required
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                  >
                  <option value="" disabled>
                    Select role
                  </option>
                  {roles.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                Personal email
                <input
                  type="email"
                  value={personalEmail}
                  onChange={(event) => setPersonalEmail(event.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                />
              </label>
              <label className="text-sm text-slate-600">
                Phone
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                />
              </label>
              {selectedRole === "student" ? (
                <>
                  <label className="text-sm text-slate-600">
                    Student ID *
                    <input
                      required
                      value={studentId}
                      onChange={(event) => setStudentId(event.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Programme
                    <input
                      value={program}
                      onChange={(event) => setProgram(event.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Department
                    <input
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Batch
                    <input
                      value={batch}
                      onChange={(event) => setBatch(event.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Semester
                    <input
                      type="number"
                      min="1"
                      value={semester}
                      onChange={(event) => setSemester(event.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Section
                    <input
                      value={section}
                      onChange={(event) => setSection(event.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                    />
                  </label>
                </>
              ) : selectedRole && STAFF_ACCOUNT_ROLES.has(selectedRole) ? (
                <>
                  <label className="text-sm text-slate-600">
                    Employee ID <span className="text-red-500">*</span>
                    <input
                      required
                      value={employeeId}
                      onChange={(event) => setEmployeeId(event.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Department <span className="text-red-500">*</span>
                    <input
                      required
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Designation
                    <input
                      value={designation}
                      onChange={(event) => setDesignation(event.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                    />
                  </label>
                  {selectedRole === "faculty" && (
                    <>
                      <label className="text-sm text-slate-600">
                        Programme / Curriculum Context
                        <select
                          value={program}
                          onChange={(event) => {
                            setProgram(event.target.value);
                            setSelectedSemesters([]);
                            setSubjectAssignments([]);
                            setCourses([]);
                            setSubjectsError(null);
                            setSemestersError(null);
                            setSubjectWarning(null);
                          }}
                          className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                          disabled={programsLoading}
                        >
                          <option value="">Select programme (optional if single-program setup)</option>
                          {programOptions.map((item) => (
                            <option key={item.code} value={item.code}>
                              {item.code}{item.name ? ` - ${item.name}` : ""}{item.totalSemesters ? ` (${item.totalSemesters} semesters)` : ""}
                            </option>
                          ))}
                        </select>
                        {programsLoading && <p className="mt-1 text-xs text-slate-500">Loading programmes...</p>}
                      </label>
                      <div className="text-sm text-slate-600">
                        <MultiSelect
                          options={availableSemesters.map((sem) => ({
                            id: String(sem),
                            label: `Semester ${sem}`,
                          }))}
                          value={selectedSemesters.map(String)}
                          onChange={(vals) => {
                            setSubjectWarning(null);
                            setSelectedSemesters(
                              [...new Set(vals.map(Number).filter((n) => Number.isInteger(n) && n >= 1))].sort((a, b) => a - b),
                            );
                          }}
                          placeholder={program ? "Select semester(s)...": "Select programme first or available semesters"}
                          searchable
                          label="Assigned Semester(s)"
                          required
                          disabled={semestersLoading}
                        />
                        {semestersLoading && (
                          <p className="mt-1 text-xs text-slate-500">Loading semesters...</p>
                        )}
                        {semestersError && (
                          <p className="mt-1 text-xs text-red-600">
                            {semestersError}
                            <button
                              type="button"
                              onClick={() => {
                                setSemestersError(null);
                                setSemestersLoading(true);
                                const params = program ? `?program=${encodeURIComponent(program)}` : "";
                                apiRequest<{ filters: { semesters: number[] } }>(`/courses/filters${params}`)
                                  .then((result) => {
                                    const semesters = (result.filters?.semesters || [])
                                      .map((s) => Number(s))
                                      .filter((s) => Number.isInteger(s) && s >= 1)
                                      .sort((a, b) => a - b);
                                    setAvailableSemesters(semesters);
                                    setSelectedSemesters((prev) => prev.filter((s) => semesters.includes(s)));
                                  })
                                  .catch((err) => setSemestersError(err instanceof Error ? err.message : "Failed to load semesters."))
                                  .finally(() => setSemestersLoading(false));
                              }}
                              className="ml-2 text-blue-600 hover:underline"
                            >
                              Retry
                            </button>
                          </p>
                        )}
                        {!semestersLoading && !semestersError && availableSemesters.length === 0 && (
                          <p className="mt-1 text-xs text-amber-600">
                            No valid semesters found for the selected programme/curriculum.
                          </p>
                        )}
                      </div>
                      <div className="text-sm text-slate-600">
                        <label className="mb-1 block text-sm font-medium text-slate-600">Assigned Subjects <span className="text-red-500">*</span></label>
                        <div className="rounded-lg border border-slate-200 bg-white">
                          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
                            <input
                              type="search"
                              value={subjectSearch}
                              onChange={(e) => setSubjectSearch(e.target.value)}
                              placeholder={selectedSemesters.length === 0 ? "Select semester(s) first" : "Search by subject name or course code"}
                              disabled={coursesLoading || selectedSemesters.length === 0}
                              className="min-w-[180px] flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-[#1F6B45] disabled:bg-slate-50"
                            />
                            <span className="text-[11px] text-slate-500">{subjectAssignments.length} selected</span>
                          </div>
                          {selectedSemesters.length > 0 && !coursesLoading && !subjectsError && (
                            <div className="max-h-72 overflow-y-auto p-2">
                              {[...selectedSemesters].sort((a,b)=>a-b).map((sem) => {
                                const groupCourses = courses
                                  .filter((c) => c.semester === sem)
                                  .filter((c) => {
                                    const q = subjectSearch.trim().toLowerCase();
                                    if (!q) return true;
                                    return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
                                  });
                                if (groupCourses.length === 0 && subjectSearch.trim()) return null;
                                return (
                                  <section key={sem} className="mb-3 last:mb-0">
                                    <div className="mb-2 flex items-center justify-between rounded-lg bg-[#1F6B45] px-3 py-2 text-white shadow-sm">
                                      <span className="text-sm font-semibold">Semester {sem}</span>
                                      {program && (
                                        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white">
                                          {program}
                                        </span>
                                      )}
                                    </div>
                                    {groupCourses.length === 0 ? (
                                      <p className="px-2 py-2 text-xs text-slate-500">No subjects found for this semester.</p>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {groupCourses.map((course) => {
                                          const checked = subjectAssignments.includes(course.id);
                                          return (
                                            <label key={course.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-xs transition ${checked ? "border-[#1F6B45]/40 bg-[#1F6B45]/5 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                                              <input
                                                type="checkbox"
                                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#1F6B45] focus:ring-[#1F6B45]"
                                                checked={checked}
                                                onChange={() => {
                                                  setSubjectWarning(null);
                                                  setSubjectAssignments((prev) => prev.includes(course.id) ? prev.filter((id) => id !== course.id) : [...prev, course.id]);
                                                }}
                                              />
                                              <span className="min-w-0 flex-1">
                                                <span className="block break-words font-medium leading-snug text-slate-900">{course.name}</span>
                                                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{course.code}</span>
                                                  {course.credits != null && <span className="text-[10px] text-slate-500">{course.credits} credits</span>}
                                                </span>
                                              </span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </section>
                                );
                              })}
                              {subjectSearch.trim() && courses.filter((c)=>selectedSemesters.includes(Number(c.semester)) && (c.name.toLowerCase().includes(subjectSearch.toLowerCase()) || c.code.toLowerCase().includes(subjectSearch.toLowerCase()))).length === 0 && (
                                <p className="px-2 py-3 text-center text-xs text-slate-500">No matching subjects found.</p>
                              )}
                            </div>
                          )}
                        </div>
                        {coursesLoading && (
                          <p className="mt-1 text-xs text-slate-500">Loading subjects...</p>
                        )}
                        {selectedSemesters.length === 0 && !coursesLoading && (
                          <p className="mt-1 text-xs text-slate-500">
                            Select semester(s) above to view and assign subjects.
                          </p>
                        )}
                        {courses.length === 0 && selectedSemesters.length > 0 && !coursesLoading && !subjectsError && (
                          <p className="mt-1 text-xs text-amber-600">
                            No active subjects found for the selected semester(s) and programme/curriculum.
                          </p>
                        )}
                        {subjectWarning && (
                          <p className="mt-1 text-xs text-amber-700">{subjectWarning}</p>
                        )}
                        {subjectsError && (
                          <p className="mt-1 text-xs text-red-600">
                            {subjectsError}
                            <button
                              type="button"
                              onClick={() => {
                                void loadCoursesForSemesters(selectedSemesters);
                              }}
                              className="ml-2 text-blue-600 hover:underline"
                            >
                              Retry
                            </button>
                          </p>
                        )}
                        {subjectAssignments.length > 0 && (
                          <div className="mt-2 rounded border border-slate-200 bg-slate-50/60 p-2">
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Selected subjects</p>
                            <div className="flex flex-wrap gap-1.5">
                              {subjectAssignments.map((id) => {
                                const course = courses.find((c) => c.id === id) || details?.user.subjectAssignments?.find((a) => a.courseId === id);
                                const name = course && 'name' in course ? course.name : (course as any)?.courseName || 'Selected subject';
                                const code = course && 'code' in course ? course.code : (course as any)?.courseCode || '';
                                const sem = course && 'semester' in course ? course.semester : (course as any)?.semester;
                                return (
                                  <span key={id} className="inline-flex max-w-full items-start gap-1 rounded border border-[#1F6B45]/20 bg-white px-2 py-1 text-[11px] text-slate-800" title={`${name}${code ? ` (${code})` : ''}`}>
                                    <span className="min-w-0">
                                      <span className="block font-medium leading-snug">{name}</span>
                                      <span className="text-slate-500">{code}{sem ? ` · Sem ${sem}` : ''}</span>
                                    </span>
                                    <button type="button" aria-label={`Remove ${name}`} className="mt-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setSubjectAssignments((prev) => prev.filter((x) => x !== id))}>×</button>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : null}
              <label className="text-sm text-slate-600">
                Campus
                <input
                  value={campus}
                  onChange={(event) => setCampus(event.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                />
              </label>
            </div>
            </div>
            <p className="border-t border-slate-100 px-6 pt-4 text-sm text-slate-500">
              Institutional email uses the configured name/year format at{" "}
              <strong className="text-slate-700">@{domain}</strong>. Initial status:{" "}
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">PASSIVE</span>
            </p>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">

              <button
                type="button"
                onClick={() => setProvisioning(false)}
                className="rounded border border-slate-300 px-3 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                disabled={busy || roles.length === 0}
                className="inline-flex items-center gap-2 rounded bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faPlus} />
                {busy ? "Creating…" : "Create account"}
              </button>
            </div>
          </form>
        </div>
      )}

      {provisioned && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/50 p-4">
          <section
            className="w-full max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="created-title"
          >
            <div>
              <h2 id="created-title" className="text-base font-semibold">
                Account provisioned
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Securely provide this temporary credential now. It cannot be
                recovered after closing this screen.
              </p>
            </div>
            <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-xs">
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium">{provisioned.name}</dd>
              <dt className="text-slate-500">Role</dt>
              <dd className="capitalize">
                {provisioned.role.replaceAll("_", " ")}
              </dd>
              <dt className="text-slate-500">Institutional email</dt>
              <dd className="break-all font-medium">{provisioned.email}</dd>
              <dt className="text-slate-500">Account status</dt>
              <dd>PASSIVE · Temporary password</dd>
              <dt className="text-slate-500">Credential expires</dt>
              <dd>
                {formatDateTimeForCalendar(
                  provisioned.credentialExpiresAt,
                  calendarType,
                  language,
                )}
              </dd>
            </dl>
            <div className="rounded border border-amber-300 bg-amber-50 p-3">
              <label className="mb-2 block text-sm font-semibold text-amber-950">
                Temporary password
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={
                    showCredential
                      ? provisioned.temporaryPassword
                      : "•".repeat(provisioned.temporaryPassword.length)
                  }
                  className="min-w-0 flex-1 rounded border border-amber-300 bg-white px-2 py-2 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowCredential((shown) => !shown)}
                  className="rounded border border-amber-400 px-2 text-xs"
                >
                  {showCredential ? "Hide" : "Show"}
                </button>
                <button
                  type="button"
                  onClick={() => void copyCredential()}
                  title="Copy temporary password"
                  aria-label="Copy temporary password"
                  className="grid h-9 w-9 place-items-center rounded border border-amber-400"
                >
                  <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                </button>
              </div>
              {copied && (
                <p className="mt-2 text-xs text-emerald-800">
                  Copied to clipboard.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setProvisioned(null);
                setShowCredential(false);
                setCopied(false);
              }}
              className="w-full rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
            >
              Done — close credential view
            </button>
          </section>
        </div>
      )}

      {selected !== null && (
        <div
          className="fixed inset-0 z-[210] flex justify-end bg-slate-950/40"
          role="presentation"
        >
          <aside
            className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-detail-title"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2
                  id="account-detail-title"
                  className="text-base font-semibold"
                >
                  Account details
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Credential values and hashes are never displayed here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xs text-slate-500"
              >
                Close
              </button>
            </div>
            {!details ? (
              <p className="py-8 text-xs text-slate-500">
                Loading account details…
              </p>
            ) : (
              <>
                <div className="mt-5 border-y border-slate-200 py-4">
                  <p className="font-semibold">{details.user.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {details.user.email}
                  </p>
                  <p className="mt-1 text-xs capitalize">
                    {details.user.roles.join(", ").replaceAll("_", " ")} ·{" "}
                    {details.user.department || "No department"}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <span
                      className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass[details.user.accountStatus] || statusClass.DISABLED}`}
                    >
                      {details.user.accountStatus}
                    </span>
                    <span className="rounded border border-slate-200 px-2 py-1 text-xs">
                      {details.user.passwordStatus === "TEMPORARY"
                        ? "Temporary password pending"
                        : "Password set"}
                    </span>
                  </div>
                </div>
                <dl className="grid grid-cols-[150px_1fr] gap-y-2 py-4 text-xs">
                  <dt className="text-slate-500">Created</dt>
                  <dd>
                    {formatDateTimeForCalendar(
                      details.user.createdAt,
                      calendarType,
                      language,
                    )}
                  </dd>
                  <dt className="text-slate-500">First login</dt>
                  <dd>
                    {details.user.firstLoginAt
                      ? formatDateTimeForCalendar(
                          details.user.firstLoginAt,
                          calendarType,
                          language,
                        )
                      : "Not yet"}
                  </dd>
                  <dt className="text-slate-500">Activated</dt>
                  <dd>
                    {details.user.activatedAt
                      ? formatDateTimeForCalendar(
                          details.user.activatedAt,
                          calendarType,
                          language,
                        )
                      : "Pending"}
                  </dd>
                  <dt className="text-slate-500">Last login</dt>
                  <dd>
                    {details.user.lastLoginAt
                      ? formatDateTimeForCalendar(
                          details.user.lastLoginAt,
                          calendarType,
                          language,
                        )
                      : "Not yet"}
                  </dd>
                </dl>
                {details.user.subjectAssignments &&
                details.user.subjectAssignments.length > 0 && (
                  <div className="border-y border-slate-200 py-4">
                    <h3 className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
                      Assigned Subjects
                    </h3>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {details.user.subjectAssignments.map((assignment) => (
                        <li
                          key={assignment.courseId}
                          className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                        >
                          <div className="flex items-start gap-2">
                            <FontAwesomeIcon
                              icon={faCheck}
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-medium text-slate-900">
                                {assignment.courseName}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  {assignment.courseCode}
                                </span>
                                {assignment.semester && (
                                  <span className="text-[10px] text-slate-500">
                                    Semester {assignment.semester}
                                    {assignment.program ? ` · ${assignment.program}` : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 border-y border-slate-200 py-3">
                  <button
                    type="button"
                    onClick={() => void issueTemporaryCredential(selected)}
                    className="inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-xs"
                  >
                    <FontAwesomeIcon icon={faRotate} /> Issue temporary
                    credential
                  </button>
                  {details.user.accountStatus === "ACTIVE" ||
                  details.user.accountStatus === "PASSIVE" ? (
                    <button
                      type="button"
                      onClick={() => void updateStatus(selected, "SUSPEND")}
                      className="rounded border border-orange-300 px-3 py-2 text-xs text-orange-800"
                    >
                      Suspend
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void updateStatus(selected, "REACTIVATE")}
                      className="rounded border border-emerald-300 px-3 py-2 text-xs text-emerald-800"
                    >
                      Reactivate
                    </button>
                  )}
                  {details.user.accountStatus !== "DISABLED" && (
                    <button
                      type="button"
                      onClick={() => void updateStatus(selected, "DISABLE")}
                      className="rounded border border-slate-300 px-3 py-2 text-xs"
                    >
                      Disable
                    </button>
                  )}

                  {/* Delete account button - only for super_admin */}
                  {details.user.roles.includes("super_admin") === false && (
                    <button
                      type="button"
                      onClick={() => void deleteAccount(selected)}
                      disabled={deleteConfirmLoading}
                      className="rounded border border-red-300 px-3 py-2 text-xs text-red-800 hover:bg-red-50"
                    >
                      <FontAwesomeIcon icon={faTrash} className="mr-1" />
                      Delete account
                    </button>
                  )}
                </div>
                <form
                  onSubmit={changeAccountRole}
                  className="mt-4 space-y-3 cos-page-header"
                >
                  <h3 className="text-xs font-semibold">Change account role</h3>
                  <label className="block text-sm text-slate-600">
                    Authorized role
                    <select
                      value={roleChangeTarget}
                      onChange={(event) =>
                        setRoleChangeTarget(event.target.value)
                      }
                      className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-2 text-xs"
                    >
                      {roles.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {roleChangeTarget === "faculty" && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={roleChangeEmployeeId}
                        onChange={(event) =>
                          setRoleChangeEmployeeId(event.target.value)
                        }
                        placeholder="Employee ID if adding faculty profile"
                        className="rounded border border-slate-300 px-2 py-2 text-xs"
                      />
                      <input
                        value={roleChangeDepartment}
                        onChange={(event) =>
                          setRoleChangeDepartment(event.target.value)
                        }
                        placeholder="Department"
                        className="rounded border border-slate-300 px-2 py-2 text-xs"
                      />
                      <input
                        value={roleChangeDesignation}
                        onChange={(event) =>
                          setRoleChangeDesignation(event.target.value)
                        }
                        placeholder="Designation"
                        className="rounded border border-slate-300 px-2 py-2 text-xs"
                      />
                    </div>
                  )}
                  <textarea
                    required
                    minLength={8}
                    maxLength={500}
                    value={roleChangeReason}
                    onChange={(event) =>
                      setRoleChangeReason(event.target.value)
                    }
                    placeholder="Reason for this role change"
                    className="block w-full rounded border border-slate-300 px-2 py-2 text-xs"
                  />
                  <button
                    disabled={
                      !roleChangeTarget ||
                      roleChangeTarget === details.user.roles[0]
                    }
                    className="rounded border border-blue-300 px-3 py-2 text-xs font-medium text-blue-800 disabled:opacity-40"
                  >
                    Apply role change
                  </button>
                </form>
                <h3 className="mt-5 text-xs font-semibold uppercase text-slate-500">
                  Security timeline
                </h3>
                {details.events.length === 0 ? (
                  <p className="py-4 text-xs text-slate-500">
                    No recent security activity.
                  </p>
                ) : (
                  <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4">
                    {details.events.map((event, index) => (
                      <li
                        key={`${event.action}-${event.created_at}-${index}`}
                        className="text-xs"
                      >
                        <p className="font-semibold">
                          {event.action.replaceAll("_", " ")}
                        </p>
                        <p className="mt-0.5 text-slate-500">{event.details}</p>
                        <time className="mt-1 block text-xs text-slate-400">
                          {formatDateTimeForCalendar(
                            event.created_at,
                            calendarType,
                            language,
                          )}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </aside>
        </div>
      )}

      {/* Delete Account Confirmation Dialog */}
      {deleteConfirmOpen && details && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/50 p-4">
          <section
            className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
          >
            <div>
              <h2 id="delete-confirm-title" className="text-base font-semibold text-red-800">
                Permanently Delete Account
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                This action cannot be undone. The account and all authentication
                credentials will be permanently removed from the database.
              </p>
            </div>
            <div className="border-y border-slate-200 py-4 space-y-3">
              <div>
                <p className="text-xs text-slate-500">User</p>
                <p className="font-semibold">{details.user.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Institutional email</p>
                <p className="font-semibold break-all">{details.user.email}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Role</p>
                <p className="capitalize">{details.user.roles.join(", ").replaceAll("_", " ")}</p>
              </div>
              <div className="rounded border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-950">
                  Related data handling:
                </p>
                <ul className="mt-2 text-xs text-amber-800 space-y-1 list-disc list-inside">
                  <li>Student/Staff profile will be removed</li>
                  <li>All active sessions and tokens will be invalidated</li>
                  <li>Password reset tokens will be deleted</li>
                  <li>Academic, finance, and attendance records are preserved per institutional policy</li>
                </ul>
              </div>
              <label className="block">
                <p className="mb-1 text-xs font-semibold text-slate-700">
                  Type the user's institutional email to confirm:
                </p>
                <input
                  type="email"
                  value={deleteConfirmEmail}
                  onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                  placeholder={details.user.email}
                  className="w-full rounded border border-slate-300 px-2 py-2 text-xs"
                  autoFocus
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteConfirmEmail("");
                }}
                disabled={deleteConfirmLoading}
                className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteAccount()}
                disabled={deleteConfirmLoading}
                className="inline-flex items-center gap-2 rounded bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faTrash} />
                {deleteConfirmLoading ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </section>
        </div>
      )}
      {bulkOpen && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/50 p-4">
          <section className="w-full max-w-3xl max-h-[90vh] overflow-y-auto space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">Bulk Student Creation</h2>
            <p className="text-xs text-slate-500">Select academic assignment, then paste student names (one per line).</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">Academic Year
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={bulkAcademicYear}
                  onChange={(e) => setBulkAcademicYear(e.target.value)}
                  disabled={bulkOptionsLoading}
                >
                  <option value="">Select academic year</option>
                  {bulkAcademicYears.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                {bulkOptionsLoading && <span className="text-[10px] text-slate-400 block">Loading…</span>}
              </label>
              <label className="text-xs">Program<input className="w-full rounded border border-slate-300 px-2 py-1" value={bulkProgram} onChange={(e)=>setBulkProgram(e.target.value)} placeholder="BCA" /></label>
              <label className="text-xs">Department<input className="w-full rounded border border-slate-300 px-2 py-1" value={bulkDepartment} onChange={(e)=>setBulkDepartment(e.target.value)} placeholder="Computer Science" /></label>
              <label className="text-xs">Batch<input className="w-full rounded border border-slate-300 px-2 py-1" value={bulkBatch} onChange={(e)=>setBulkBatch(e.target.value)} placeholder="2083" /></label>
              <label className="text-xs">Semester<input type="number" className="w-full rounded border border-slate-300 px-2 py-1" value={bulkSemester} onChange={(e)=>setBulkSemester(e.target.value)} min="1" max="8" /></label>
              <label className="text-xs">Section<input className="w-full rounded border border-slate-300 px-2 py-1" value={bulkSection} onChange={(e)=>setBulkSection(e.target.value.toUpperCase())} placeholder="A" /></label>
            </div>
            <label className="block text-xs font-semibold">Student Names (one name per line)
              <textarea value={bulkText} onChange={(e)=>setBulkText(e.target.value)} className="mt-1 h-48 w-full rounded border border-slate-300 p-2 text-xs" placeholder={"Aayush Sharma\nSita Rai"} />
            </label>
            {bulkError && <p className="text-xs text-red-700">{bulkError}</p>}
            {bulkResult && <p className="text-xs text-emerald-700">Created {bulkResult.created}, skipped {bulkResult.skipped}, failed {bulkResult.failed}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setBulkOpen(false)} className="rounded border border-slate-300 px-3 py-2 text-xs">Cancel</button>
              <button type="button" disabled={bulkLoading} onClick={async () => {
                setBulkError(""); setBulkLoading(true);
                try {
                  const result = await apiRequest<any>("/admin/students/bulk", { method: "POST", body: JSON.stringify({ academicYear: bulkAcademicYear, program: bulkProgram, department: bulkDepartment, batch: bulkBatch, semester: bulkSemester === "" ? undefined : Number(bulkSemester), section: bulkSection, names: bulkText }) });
                  setBulkResult(result);
                } catch (e) { setBulkError(e instanceof Error ? e.message : "Failed"); }
                finally { setBulkLoading(false); }
              }} className="rounded bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {bulkLoading ? "Creating…" : "Create Students"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export default UserManagementView;
