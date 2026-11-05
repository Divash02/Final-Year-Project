import React, { useCallback, useEffect, useState } from "react";
import { apiRequest, resolveAssetUrl } from "../../../services/apiClient";
import { downloadStoredFile } from "../../../services/uploadClient";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Input, SelectField } from "../../ui/Input";
import { PageHeader } from "../../ui/PageHeader";
import { useToast } from "../../ui/ToastContainer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBriefcase,
  faBuilding,
  faCalendarDays,
  faCircleUser,
  faFileLines,
  faFloppyDisk,
  faIdBadge,
  faLock,
  faPen,
  faSpinner,
  faUser,
} from "@fortawesome/free-solid-svg-icons";

interface EmployeeAccount {
  _id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  collegeEmail?: string | null;
  phone?: string | null;
  personalEmail?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  avatarUrl?: string | null;
  roles?: string[];
  accountStatus?: string;
}

interface ContractInformation {
  startDate?: string | null;
  endDate?: string | null;
  contractType?: string | null;
  terms?: string | null;
}

interface EmployeeDocument {
  id: string;
  name: string;
  category: string;
  uploadedAt: string | null;
  fileId: string | null;
}

interface EmployeeProfileRecord {
  _id: string;
  employeeId: string;
  roleType: string;
  department: string;
  designation: string;
  employmentType: string | null;
  employmentStatus: string;
  joiningDate: string | null;
  campus?: string | null;
  qualification?: string | null;
  experience?: string | null;
  reportingManager?: EmployeeAccount | null;
  contractInfo: ContractInformation;
  documents: EmployeeDocument[];
  user: EmployeeAccount | null;
}

interface ProfileForm {
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  personalEmail: string;
  address: string;
  emergencyContact: string;
  employeeId: string;
  department: string;
  designation: string;
  roleType: string;
  employmentType: string;
  employmentStatus: string;
  joiningDate: string;
  reportingManager: string;
  contractInfo: {
    startDate: string;
    endDate: string;
    contractType: string;
    terms: string;
  };
}

interface DirectoryEmployee {
  userId: string;
  user: EmployeeAccount | null;
}

interface ProfileProps {
  employeeId: string;
  initialSection: "overview" | "employment";
  canManage: boolean;
  canManageContracts: boolean;
  onBack: () => void;
  onUpdated: () => void;
}

const PROFILE_SECTIONS = [
  { id: "overview", label: "Overview", icon: faCircleUser },
  { id: "personal", label: "Personal information", icon: faUser },
  { id: "employment", label: "Employment", icon: faBriefcase },
  { id: "documents", label: "Documents", icon: faFileLines },
  { id: "account", label: "Account", icon: faLock },
] as const;

type ProfileSection = (typeof PROFILE_SECTIONS)[number]["id"];

function fullName(user: EmployeeAccount | null | undefined): string {
  if (!user) return "Account unavailable";
  return [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

function dateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function toForm(employee: EmployeeProfileRecord): ProfileForm {
  const user = employee.user;
  return {
    firstName: user?.firstName || "",
    middleName: user?.middleName || "",
    lastName: user?.lastName || "",
    phone: user?.phone || "",
    personalEmail: user?.personalEmail || "",
    address: user?.address || "",
    emergencyContact: user?.emergencyContact || "",
    employeeId: employee.employeeId,
    department: employee.department,
    designation: employee.designation,
    roleType: employee.roleType,
    employmentType: employee.employmentType || "",
    employmentStatus: employee.employmentStatus,
    joiningDate: dateInput(employee.joiningDate),
    reportingManager: employee.reportingManager?._id || "",
    contractInfo: {
      startDate: dateInput(employee.contractInfo?.startDate),
      endDate: dateInput(employee.contractInfo?.endDate),
      contractType: employee.contractInfo?.contractType || "",
      terms: employee.contractInfo?.terms || "",
    },
  };
}

export const HREmployeeProfile: React.FC<ProfileProps> = ({
  employeeId,
  initialSection,
  canManage,
  canManageContracts,
  onBack,
  onUpdated,
}) => {
  const { showToast } = useToast();
  const [employee, setEmployee] = useState<EmployeeProfileRecord | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [managers, setManagers] = useState<DirectoryEmployee[]>([]);
  const [section, setSection] = useState<ProfileSection>(initialSection);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadEmployee = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<{ employee: EmployeeProfileRecord }>(
        `/hr/employees/${encodeURIComponent(employeeId)}`,
      );
      setEmployee(response.employee);
      setForm(toForm(response.employee));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load employee profile.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void loadEmployee();
  }, [loadEmployee]);

  useEffect(() => {
    if (!canManage) return;
    apiRequest<{ employees: DirectoryEmployee[] }>("/hr/employees?limit=100")
      .then((response) => setManagers(response.employees))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Could not load reporting-manager options.";
        setError(message);
      });
  }, [canManage]);

  const updateForm = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const saveEmployee = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!employee || !form) return;
    if (
      form.employmentStatus !== employee.employmentStatus &&
      !window.confirm(
        `Change this employee's status to "${form.employmentStatus.replaceAll("-", " ")}"?`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/hr/employees/${encodeURIComponent(employeeId)}`, {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          joiningDate: form.joiningDate || null,
          employmentType: form.employmentType || undefined,
          reportingManager: form.reportingManager || null,
          ...(canManageContracts
            ? {
                contractInfo: {
                  startDate: form.contractInfo.startDate || null,
                  endDate: form.contractInfo.endDate || null,
                  contractType: form.contractInfo.contractType || null,
                  terms: form.contractInfo.terms || null,
                },
              }
            : {}),
        }),
      });
      await loadEmployee();
      setEditing(false);
      onUpdated();
      showToast("Employee profile updated.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save employee profile.";
      setError(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="cos-page flex min-h-64 items-center justify-center">
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
          Loading employee profile...
        </p>
      </div>
    );
  }

  if (!employee || !form) {
    return (
      <div className="cos-page space-y-4">
        <Button variant="secondary" onClick={onBack}>
          <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
          Back to directory
        </Button>
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error || "Employee not found."}
        </p>
      </div>
    );
  }

  const user = employee.user;
  const managerName = fullName(employee.reportingManager);
  const profileTitle = fullName(user);

  return (
    <div className="cos-page space-y-6">
      <PageHeader
        title="Employee Profile"
        description="Employee details, employment record, documents and account information"
        icon={faCircleUser}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onBack}>
              <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
              Directory
            </Button>
            {canManage && (
              editing ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={saving}
                    onClick={() => {
                      setForm(toForm(employee));
                      setEditing(false);
                      setError("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" form="employee-profile-form" disabled={saving}>
                    <FontAwesomeIcon icon={saving ? faSpinner : faFloppyDisk} className="mr-2" />
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => {
                    setSection("personal");
                    setEditing(true);
                  }}
                >
                  <FontAwesomeIcon icon={faPen} className="mr-2" />
                  Edit profile
                </Button>
              )
            )}
          </div>
        }
      />

      {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}

      <Card>
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          {user?.avatarUrl ? (
            <img
              src={resolveAssetUrl(user.avatarUrl)}
              alt={`${profileTitle} profile`}
              className="h-20 w-20 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-500">
              <FontAwesomeIcon icon={faUser} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-xl font-semibold text-slate-900">{profileTitle}</h2>
            <p className="mt-1 break-words text-sm text-slate-600">
              {employee.employeeId} · {employee.department} · {employee.designation}
            </p>
            <p className="mt-1 break-words text-sm text-slate-500">
              {user?.collegeEmail || user?.email || "College email unavailable"}
            </p>
          </div>
          <span
            className={`self-start rounded-full px-3 py-1 text-xs font-semibold capitalize ${
              employee.employmentStatus === "active"
                ? "bg-emerald-50 text-emerald-700"
                : employee.employmentStatus === "on-leave"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-slate-100 text-slate-700"
            }`}
          >
            {employee.employmentStatus.replaceAll("-", " ")}
          </span>
        </div>
      </Card>

      <nav className="flex flex-wrap gap-2 border-b" aria-label="Employee profile sections">
        {PROFILE_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            aria-current={section === item.id ? "page" : undefined}
            className={`rounded-t-lg px-3 py-3 text-sm sm:px-4 ${
              section === item.id
                ? "border-b-2 border-primary-600 font-semibold text-primary-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FontAwesomeIcon icon={item.icon} className="mr-2" />
            {item.label}
          </button>
        ))}
      </nav>

      {editing && (
        <form id="employee-profile-form" className="contents" onSubmit={(event) => void saveEmployee(event)}>
          {section === "personal" && (
            <Card title="Personal information">
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6">
                <Input label="First name" value={form.firstName} onChange={(event) => updateForm("firstName", event.target.value)} required />
                <Input label="Middle name" value={form.middleName} onChange={(event) => updateForm("middleName", event.target.value)} />
                <Input label="Last name" value={form.lastName} onChange={(event) => updateForm("lastName", event.target.value)} required />
                <Input label="Phone" value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} />
                <Input label="Personal email" type="email" value={form.personalEmail} onChange={(event) => updateForm("personalEmail", event.target.value)} />
                <Input label="Emergency contact" value={form.emergencyContact} onChange={(event) => updateForm("emergencyContact", event.target.value)} />
                <div className="sm:col-span-2">
                  <label className="cos-label" htmlFor="employee-address">Address</label>
                  <textarea id="employee-address" className="cos-input min-h-24 w-full" value={form.address} onChange={(event) => updateForm("address", event.target.value)} />
                </div>
              </div>
            </Card>
          )}
          {section === "employment" && (
            <Card title="Employment record">
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6">
                <Input label="Employee ID" value={form.employeeId} onChange={(event) => updateForm("employeeId", event.target.value)} required />
                <Input label="Department" value={form.department} onChange={(event) => updateForm("department", event.target.value)} required />
                <Input label="Designation" value={form.designation} onChange={(event) => updateForm("designation", event.target.value)} required />
                <SelectField label="Employee category" value={form.roleType} onChange={(event) => updateForm("roleType", event.target.value)}>
                  <option value="staff">Staff</option>
                  <option value="faculty">Faculty</option>
                  <option value="teaching">Teaching</option>
                  <option value="non-teaching">Non-teaching</option>
                </SelectField>
                <SelectField label="Employment type" value={form.employmentType} onChange={(event) => updateForm("employmentType", event.target.value)}>
                  <option value="">Not recorded</option>
                  <option value="permanent">Permanent</option>
                  <option value="contract">Contract</option>
                  <option value="temporary">Temporary</option>
                  <option value="probation">Probation</option>
                  <option value="part-time">Part-time</option>
                </SelectField>
                <SelectField label="Employment status" value={form.employmentStatus} onChange={(event) => updateForm("employmentStatus", event.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on-leave">On leave</option>
                  <option value="terminated">Terminated</option>
                  <option value="retired">Retired</option>
                </SelectField>
                <Input label="Joining date" type="date" value={form.joiningDate} onChange={(event) => updateForm("joiningDate", event.target.value)} />
                <SelectField label="Reporting manager" value={form.reportingManager} onChange={(event) => updateForm("reportingManager", event.target.value)}>
                  <option value="">No manager assigned</option>
                  {managers
                    .filter((manager) => manager.userId !== employee.user?._id)
                    .map((manager) => (
                      <option key={manager.userId} value={manager.userId}>
                        {fullName(manager.user)} · {manager.user?.collegeEmail || manager.user?.email}
                      </option>
                    ))}
                </SelectField>
                {canManageContracts && (
                  <>
                    <Input label="Contract type" value={form.contractInfo.contractType} onChange={(event) => updateForm("contractInfo", { ...form.contractInfo, contractType: event.target.value })} />
                    <Input label="Contract start" type="date" value={form.contractInfo.startDate} onChange={(event) => updateForm("contractInfo", { ...form.contractInfo, startDate: event.target.value })} />
                    <Input label="Contract end" type="date" value={form.contractInfo.endDate} onChange={(event) => updateForm("contractInfo", { ...form.contractInfo, endDate: event.target.value })} />
                    <div className="sm:col-span-2">
                      <label className="cos-label" htmlFor="employee-contract-terms">Contract terms</label>
                      <textarea id="employee-contract-terms" className="cos-input min-h-24 w-full" value={form.contractInfo.terms} onChange={(event) => updateForm("contractInfo", { ...form.contractInfo, terms: event.target.value })} />
                    </div>
                  </>
                )}
                {!canManageContracts && (
                  <p className="text-sm text-slate-500 sm:col-span-2">
                    Contract changes require contract-management permission.
                  </p>
                )}
              </div>
            </Card>
          )}
          {section !== "personal" && section !== "employment" && (
            <Card title="Profile editing">
              <p className="p-6 text-sm text-slate-600">
                Select Personal information or Employment to edit those records.
              </p>
            </Card>
          )}
        </form>
      )}

      {!editing && section === "overview" && (
        <Card title="Overview" icon={faCircleUser}>
          <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
            <Info label="Employee ID" value={employee.employeeId} />
            <Info label="Department" value={employee.department} icon={faBuilding} />
            <Info label="Designation" value={employee.designation} icon={faBriefcase} />
            <Info label="Employment status" value={employee.employmentStatus.replaceAll("-", " ")} />
            <Info label="Joining date" value={formatDate(employee.joiningDate)} icon={faCalendarDays} />
            <Info label="Reporting manager" value={managerName} />
          </div>
        </Card>
      )}

      {!editing && section === "personal" && (
        <Card title="Personal information" icon={faUser}>
          <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <Info label="Full name" value={profileTitle} />
            <Info label="College email" value={user?.collegeEmail || user?.email || "Not recorded"} />
            <Info label="Phone" value={user?.phone || "Not recorded"} />
            <Info label="Personal email" value={user?.personalEmail || "Not recorded"} />
            <Info label="Address" value={user?.address || "Not recorded"} />
            <Info label="Emergency contact" value={user?.emergencyContact || "Not recorded"} />
            <Info label="Qualification" value={employee.qualification || "Not recorded"} />
            <Info label="Experience" value={employee.experience || "Not recorded"} />
          </div>
        </Card>
      )}

      {!editing && section === "employment" && (
        <Card title="Employment information" icon={faBriefcase}>
          <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
            <Info label="Employee ID" value={employee.employeeId} />
            <Info label="Department" value={employee.department} />
            <Info label="Designation" value={employee.designation} />
            <Info label="Employee category" value={employee.roleType.replaceAll("-", " ")} />
            <Info label="Employment type" value={employee.employmentType || "Not recorded"} />
            <Info label="Employment status" value={employee.employmentStatus.replaceAll("-", " ")} />
            <Info label="Joining date" value={formatDate(employee.joiningDate)} />
            <Info label="Reporting manager" value={managerName} />
            <Info label="Campus" value={employee.campus || "Not recorded"} />
            <Info label="Contract type" value={employee.contractInfo?.contractType || "Not recorded"} />
            <Info label="Contract start" value={formatDate(employee.contractInfo?.startDate)} />
            <Info label="Contract end" value={formatDate(employee.contractInfo?.endDate)} />
            <Info label="Contract terms" value={employee.contractInfo?.terms || "Not recorded"} />
          </div>
          {canManage && (
            <div className="border-t px-5 py-4 sm:px-6">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <FontAwesomeIcon icon={faPen} className="mr-2" />
                Edit employment record
              </Button>
            </div>
          )}
        </Card>
      )}

      {!editing && section === "documents" && (
        <Card title="Employee documents" icon={faFileLines}>
          {employee.documents.length === 0 ? (
            <p className="p-6 text-sm text-slate-600">
              No employee documents are attached to this profile.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {employee.documents.map((document) => (
                <li key={document.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-slate-900">{document.name}</p>
                    <p className="text-sm text-slate-500">
                      {document.category.replaceAll("_", " ")} · Uploaded {formatDate(document.uploadedAt)}
                    </p>
                  </div>
                  {document.fileId ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (!document.fileId) return;
                        void downloadStoredFile(document.fileId, document.name).catch(
                          (err: unknown) => {
                            const message =
                              err instanceof Error
                                ? err.message
                                : "Could not open this document.";
                            setError(message);
                            showToast(message, "error");
                          },
                        );
                      }}
                    >
                      Open document
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-500">Secure link unavailable</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="border-t px-5 py-4 text-sm text-slate-500 sm:px-6">
            Document uploads are not available in the existing employee-record API.
          </div>
        </Card>
      )}

      {!editing && section === "account" && (
        <Card title="CollegeOS account" icon={faLock}>
          <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <Info label="College email" value={user?.collegeEmail || user?.email || "No linked account"} />
            <Info label="Account status" value={user?.accountStatus || "Unavailable"} />
            <Info
              label="Assigned role"
              value={user?.roles?.length ? user.roles.join(", ") : "Not available for this role"}
            />
            <Info label="Linked account" value={user ? "Linked" : "Unavailable"} />
          </div>
        </Card>
      )}
    </div>
  );
};

function Info({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: typeof faIdBadge;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon && <FontAwesomeIcon icon={icon} className="mr-2" />}
        {label}
      </p>
      <p className="mt-1 break-words text-sm text-slate-900">{value}</p>
    </div>
  );
}

export default HREmployeeProfile;
