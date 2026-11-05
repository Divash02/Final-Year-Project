import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, resolveAssetUrl } from "../../../services/apiClient";
import { HREmployeeProfile } from "./HREmployeeProfile";
import { PageHeader } from "../../ui/PageHeader";
import { Card } from "../../ui/Card";
import { Button } from "../../ui/Button";
import { Table } from "../../ui/Table";
import { Modal } from "../../ui/Modal";
import { Input, SelectField } from "../../ui/Input";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarMinus,
  faChartLine,
  faFilterCircleXmark,
  faPlus,
  faSearch,
  faUser,
  faUserTie,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { useToast } from "../../ui/ToastContainer";
import { useCollegeOS } from "../../../context/CollegeOSContext";

interface EmployeeUser {
  _id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  collegeEmail?: string | null;
  avatarUrl?: string | null;
  accountStatus?: string;
}

interface EmployeeDirectoryRecord {
  _id: string;
  userId: string;
  user: EmployeeUser | null;
  employeeId: string;
  roleType: string;
  department: string;
  designation: string;
  employmentType: string | null;
  employmentStatus: string;
  joiningDate: string | null;
  recordType: "employee" | "staff";
}

interface EmployeeDirectoryResponse {
  employees: EmployeeDirectoryRecord[];
  total: number;
  page: number;
  limit: number;
  filters: {
    departments: string[];
    designations: string[];
    employmentTypes: string[];
    employmentStatuses: string[];
  };
}

interface EmployeeStats {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  facultyCount: number;
  staffCount: number;
  pendingLeaves: number;
}

interface LinkableUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  accountStatus: string;
}

interface EmployeeFilters {
  department: string;
  designation: string;
  employmentType: string;
  employmentStatus: string;
}

interface OnboardForm {
  userId: string;
  employeeId: string;
  department: string;
  designation: string;
  roleType: string;
  employmentType: string;
  joiningDate: string;
}

const EMPTY_FILTERS: EmployeeFilters = {
  department: "",
  designation: "",
  employmentType: "",
  employmentStatus: "",
};
const EMPTY_ONBOARD_FORM: OnboardForm = {
  userId: "",
  employeeId: "",
  department: "",
  designation: "",
  roleType: "staff",
  employmentType: "permanent",
  joiningDate: "",
};
const PAGE_SIZE = 25;

function employeeName(user: EmployeeUser | null): string {
  if (!user) return "Account unavailable";
  return [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ");
}

function displayDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export const HRDashboardView: React.FC = () => {
  const { showToast } = useToast();
  const { currentUser } = useCollegeOS();
  const canManageEmployees =
    currentUser?.permissions?.includes("hr.employee.manage") ?? false;
  const canManageContracts =
    currentUser?.permissions?.includes("hr.contracts.manage") ?? false;
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [employees, setEmployees] = useState<EmployeeDirectoryRecord[]>([]);
  const [directoryTotal, setDirectoryTotal] = useState(0);
  const [directory, setDirectory] = useState<EmployeeDirectoryResponse["filters"]>({
    departments: [],
    designations: [],
    employmentTypes: [],
    employmentStatuses: [],
  });
  const [loading, setLoading] = useState(true);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [view, setView] = useState<"dashboard" | "directory" | "profile">("dashboard");
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [profileSection, setProfileSection] = useState<"overview" | "employment">("overview");
  const [showOnboard, setShowOnboard] = useState(false);
  const [onboardForm, setOnboardForm] = useState<OnboardForm>(EMPTY_ONBOARD_FORM);
  const [onboardSearch, setOnboardSearch] = useState("");
  const [linkableUsers, setLinkableUsers] = useState<LinkableUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [onboardError, setOnboardError] = useState("");
  const [savingOnboard, setSavingOnboard] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<EmployeeFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const queryString = useMemo(() => {
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (search.trim()) query.set("search", search.trim());
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, value);
    }
    return query.toString();
  }, [filters, page, search]);

  const refreshDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<{ stats: EmployeeStats }>("/hr/dashboard");
      setStats(response.stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load HR dashboard.";
      setError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard, refreshVersion]);

  useEffect(() => {
    let active = true;
    setDirectoryLoading(true);
    setDirectoryError("");
    apiRequest<EmployeeDirectoryResponse>(`/hr/employees?${queryString}`)
      .then((response) => {
        if (!active) return;
        setEmployees(response.employees);
        setDirectoryTotal(response.total);
        setDirectory(response.filters);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Could not load employee records.";
        setDirectoryError(message);
      })
      .finally(() => {
        if (active) setDirectoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [queryString, refreshVersion]);

  useEffect(() => {
    if (!showOnboard) return;
    let active = true;
    setUsersLoading(true);
    apiRequest<{ users: LinkableUser[] }>(
      `/hr/users?search=${encodeURIComponent(onboardSearch.trim())}`,
    )
      .then((response) => {
        if (active) setLinkableUsers(response.users);
      })
      .catch((err: unknown) => {
        if (active) {
          setOnboardError(
            err instanceof Error ? err.message : "Could not find existing employee accounts.",
          );
        }
      })
      .finally(() => {
        if (active) setUsersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onboardSearch, showOnboard]);

  const openProfile = (employeeId: string, section: "overview" | "employment") => {
    setSelectedEmployee(employeeId);
    setProfileSection(section);
    setView("profile");
  };

  const updateFilter = (key: keyof EmployeeFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const closeOnboarding = () => {
    setShowOnboard(false);
    setOnboardForm(EMPTY_ONBOARD_FORM);
    setOnboardSearch("");
    setOnboardError("");
  };

  const handleOnboard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onboardForm.userId) {
      setOnboardError("Choose an existing CollegeOS employee account.");
      return;
    }
    setSavingOnboard(true);
    setOnboardError("");
    try {
      await apiRequest<{ employee: { _id: string } }>("/hr/employees", {
        method: "POST",
        body: JSON.stringify({
          ...onboardForm,
          joiningDate: onboardForm.joiningDate || undefined,
        }),
      });
      showToast("Employee linked to the directory.", "success");
      closeOnboarding();
      setRefreshVersion((version) => version + 1);
      setView("directory");
      setPage(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not onboard this employee.";
      setOnboardError(message);
      showToast(message, "error");
    } finally {
      setSavingOnboard(false);
    }
  };

  const changeDirectoryView = (nextView: "dashboard" | "directory") => {
    setView(nextView);
    if (nextView === "directory") setPage(1);
  };

  if (view === "profile" && selectedEmployee) {
    return (
      <HREmployeeProfile
        employeeId={selectedEmployee}
        initialSection={profileSection}
        canManage={canManageEmployees}
        canManageContracts={canManageContracts}
        onBack={() => {
          setView("directory");
          setSelectedEmployee(null);
          setRefreshVersion((version) => version + 1);
        }}
        onUpdated={() => setRefreshVersion((version) => version + 1)}
      />
    );
  }

  const columns = [
    {
      key: "employee",
      header: "Employee",
      render: (employee: EmployeeDirectoryRecord) => (
        <div className="flex min-w-48 items-center gap-3">
          {employee.user?.avatarUrl ? (
            <img
              src={resolveAssetUrl(employee.user.avatarUrl)}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <FontAwesomeIcon icon={faUser} />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{employeeName(employee.user)}</p>
            <p className="truncate text-xs text-slate-500">
              {employee.user?.collegeEmail || employee.user?.email || "Email unavailable"}
            </p>
          </div>
        </div>
      ),
    },
    { key: "employeeId", header: "Employee ID" },
    { key: "department", header: "Department" },
    { key: "designation", header: "Designation" },
    {
      key: "employmentType",
      header: "Employment",
      render: (employee: EmployeeDirectoryRecord) => (
        <span className="capitalize">{employee.employmentType || "Not recorded"}</span>
      ),
    },
    {
      key: "joiningDate",
      header: "Joined",
      render: (employee: EmployeeDirectoryRecord) => displayDate(employee.joiningDate),
    },
    {
      key: "employmentStatus",
      header: "Status",
      render: (employee: EmployeeDirectoryRecord) => (
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
            employee.employmentStatus === "active"
              ? "bg-emerald-50 text-emerald-700"
              : employee.employmentStatus === "on-leave"
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-700"
          }`}
        >
          {employee.employmentStatus.replaceAll("-", " ")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (employee: EmployeeDirectoryRecord) => (
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={() => openProfile(employee._id, "overview")}>
            Profile
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openProfile(employee._id, "employment")}>
            Records
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="cos-page space-y-6">
      <PageHeader
        title="HR & Staff Management"
        description="Employee directory, profiles, employment records and leave management"
        icon={faUsers}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant={view === "dashboard" ? "primary" : "secondary"}
              onClick={() => changeDirectoryView("dashboard")}
            >
              <FontAwesomeIcon icon={faChartLine} className="mr-2" />
              Dashboard
            </Button>
            <Button
              variant={view === "directory" ? "primary" : "secondary"}
              onClick={() => changeDirectoryView("directory")}
            >
              <FontAwesomeIcon icon={faUsers} className="mr-2" />
              Directory
            </Button>
            {canManageEmployees && (
              <Button
                onClick={() => {
                  setOnboardError("");
                  setShowOnboard(true);
                }}
              >
                <FontAwesomeIcon icon={faPlus} className="mr-2" />
                Onboard Employee
              </Button>
            )}
          </div>
        }
      />

      {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
      {directoryError && (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{directoryError}</p>
      )}

      {view === "dashboard" && (
        <>
          <div className="cos-grid-4">
            <Card>
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-slate-600">Total Employees</p>
                  <p className="mt-1 text-2xl font-semibold">{loading ? "—" : stats?.totalEmployees ?? 0}</p>
                </div>
                <FontAwesomeIcon icon={faUsers} className="text-xl text-primary-600" />
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-slate-600">Faculty</p>
                  <p className="mt-1 text-2xl font-semibold">{loading ? "—" : stats?.facultyCount ?? 0}</p>
                </div>
                <FontAwesomeIcon icon={faUserTie} className="text-xl text-emerald-600" />
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-slate-600">Staff</p>
                  <p className="mt-1 text-2xl font-semibold">{loading ? "—" : stats?.staffCount ?? 0}</p>
                </div>
                <FontAwesomeIcon icon={faUser} className="text-xl text-blue-600" />
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-slate-600">Pending Leave</p>
                  <p className="mt-1 text-2xl font-semibold text-amber-600">{loading ? "—" : stats?.pendingLeaves ?? 0}</p>
                </div>
                <FontAwesomeIcon icon={faCalendarMinus} className="text-xl text-amber-600" />
              </div>
            </Card>
          </div>
          <Card
            title="Employee Directory"
            icon={faUsers}
            headerAction={
              <Button variant="ghost" onClick={() => changeDirectoryView("directory")}>
                View Directory
              </Button>
            }
          >
            <Table
              columns={columns}
              data={employees.slice(0, 5)}
              loading={directoryLoading}
              emptyMessage="No employee records are linked to staff accounts yet."
            />
          </Card>
        </>
      )}

      {view === "directory" && (
        <Card title="Employee Directory" icon={faUsers}>
          <div className="space-y-4 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Input
                label="Search employees"
                placeholder="Name, ID or email"
                value={search}
                leftIcon={faSearch}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
              <SelectField
                label="Department"
                value={filters.department}
                onChange={(event) => updateFilter("department", event.target.value)}
              >
                <option value="">All departments</option>
                {directory.departments.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </SelectField>
              <SelectField
                label="Designation"
                value={filters.designation}
                onChange={(event) => updateFilter("designation", event.target.value)}
              >
                <option value="">All designations</option>
                {directory.designations.map((designation) => (
                  <option key={designation} value={designation}>{designation}</option>
                ))}
              </SelectField>
              <SelectField
                label="Employment type"
                value={filters.employmentType}
                onChange={(event) => updateFilter("employmentType", event.target.value)}
              >
                <option value="">All employment types</option>
                {directory.employmentTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
                {directory.employmentTypes.length === 0 && (
                  <option value="permanent">Permanent</option>
                )}
              </SelectField>
              <SelectField
                label="Employment status"
                value={filters.employmentStatus}
                onChange={(event) => updateFilter("employmentStatus", event.target.value)}
              >
                <option value="">All statuses</option>
                {directory.employmentStatuses.map((status) => (
                  <option key={status} value={status}>{status.replaceAll("-", " ")}</option>
                ))}
              </SelectField>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                {directoryLoading ? "Loading employee records..." : `${directoryTotal} employees`}
              </p>
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                <FontAwesomeIcon icon={faFilterCircleXmark} className="mr-2" />
                Clear filters
              </Button>
            </div>
            <Table
              columns={columns}
              data={employees}
              loading={directoryLoading}
              emptyMessage="No employees match your search and filters."
            />
            {directoryTotal > PAGE_SIZE && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, directoryTotal)} of {directoryTotal}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page <= 1 || directoryLoading}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <span className="self-center text-sm text-slate-600">
                    Page {page} of {Math.max(1, Math.ceil(directoryTotal / PAGE_SIZE))}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page >= Math.ceil(directoryTotal / PAGE_SIZE) || directoryLoading}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Modal isOpen={showOnboard} onClose={closeOnboarding} title="Link Existing Employee Account">
        <form className="space-y-4" onSubmit={(event) => void handleOnboard(event)}>
          <p className="text-sm text-slate-600">
            Select an existing CollegeOS staff or faculty account. Employee onboarding does not create a duplicate user account.
          </p>
          <Input
            label="Find an existing account"
            placeholder="Search by name or college email"
            value={onboardSearch}
            onChange={(event) => {
              setOnboardSearch(event.target.value);
              setOnboardError("");
            }}
          />
          <SelectField
            label="Employee account"
            value={onboardForm.userId}
            onChange={(event) => setOnboardForm((current) => ({ ...current, userId: event.target.value }))}
            required
          >
            <option value="">{usersLoading ? "Loading accounts..." : "Select an existing account"}</option>
            {linkableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {user.email} ({user.roles.join(", ")})
              </option>
            ))}
          </SelectField>
          {!usersLoading && linkableUsers.length === 0 && (
            <p className="text-sm text-slate-500">
              No unlinked staff accounts matched. Provision a staff or faculty account first.
            </p>
          )}
          <Input
            label="Employee ID"
            value={onboardForm.employeeId}
            onChange={(event) => setOnboardForm((current) => ({ ...current, employeeId: event.target.value }))}
            required
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Department"
              value={onboardForm.department}
              onChange={(event) => setOnboardForm((current) => ({ ...current, department: event.target.value }))}
              required
            />
            <Input
              label="Designation"
              value={onboardForm.designation}
              onChange={(event) => setOnboardForm((current) => ({ ...current, designation: event.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField
              label="Employee category"
              value={onboardForm.roleType}
              onChange={(event) => setOnboardForm((current) => ({ ...current, roleType: event.target.value }))}
            >
              <option value="staff">Staff</option>
              <option value="faculty">Faculty</option>
              <option value="teaching">Teaching</option>
              <option value="non-teaching">Non-teaching</option>
            </SelectField>
            <SelectField
              label="Employment type"
              value={onboardForm.employmentType}
              onChange={(event) => setOnboardForm((current) => ({ ...current, employmentType: event.target.value }))}
            >
              <option value="permanent">Permanent</option>
              <option value="contract">Contract</option>
              <option value="probation">Probation</option>
              <option value="temporary">Temporary</option>
              <option value="part-time">Part-time</option>
            </SelectField>
          </div>
          <Input
            label="Joining date"
            type="date"
            value={onboardForm.joiningDate}
            onChange={(event) => setOnboardForm((current) => ({ ...current, joiningDate: event.target.value }))}
          />
          {onboardError && <p className="text-sm text-red-700" role="alert">{onboardError}</p>}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="secondary" onClick={closeOnboarding} disabled={savingOnboard}>
              Cancel
            </Button>
            <Button type="submit" disabled={savingOnboard || usersLoading || linkableUsers.length === 0}>
              {savingOnboard ? "Linking..." : "Link Employee"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default HRDashboardView;
