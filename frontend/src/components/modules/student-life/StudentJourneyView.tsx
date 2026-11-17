import React, { useCallback, useEffect, useState } from "react";
import { useToast } from "../../../components/ui/ToastContainer";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { apiRequest } from "../../../services/apiClient";
import {
  faGraduationCap,
  faClock,
  faFileAlt,
  faPlus,
  faEye,
  faTimes,
  faSearch,
  faCheckCircle,
  faCircleNotch,
  faCircle,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface StudentOption {
  id: string;
  studentId: string;
  fullName?: string;
  firstName?: string | null;
  lastName?: string | null;
  program?: string | null;
  semester?: number | null;
  academicYear?: string | null;
  batch?: string | null;
  section?: string | null;
}

interface StudentSummary {
  id: string;
  studentId: string;
  fullName: string;
  program: string;
  semester: number;
  department: string;
  status: string;
}

interface JourneyWorkflowInstance {
  id: string;
  status: string;
  currentStep: number;
}

interface JourneyCase {
  id: string;
  caseNumber: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  workflowInstance: JourneyWorkflowInstance | null;
}

interface JourneyStage {
  key: string;
  label: string;
  order: number;
  department: string;
  icon: string;
  status: "COMPLETED" | "IN_PROGRESS" | "REJECTED" | "PENDING";
  completed: boolean;
  inProgress: boolean;
  rejected: boolean;
  currentCase: JourneyCase | null;
  nextAction: { label: string; url: string } | null;
  estimatedProcessingDays: number;
  requiredDocuments: string[];
  history: Array<{
    id: string;
    caseNumber: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
    steps: Array<Record<string, unknown>>;
  }>;
}

interface JourneySummary {
  totalStages: number;
  completedCount: number;
  inProgressCount: number;
  pendingCount: number;
  progressPercentage: number;
}

interface TimelineResponse {
  student: StudentSummary;
  timeline: JourneyStage[];
  summary: JourneySummary;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  department: string;
  steps: Array<{
    stepOrder: number;
    name: string;
    description: string;
    responsibleRole: string;
    slaHours: number;
    formFields: Array<{ fieldName: string; fieldType: string; label: string; required: boolean; options?: string[] }>;
  }>;
  isActive: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-emerald-100 text-emerald-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  REJECTED: "bg-red-100 text-red-800",
  PENDING: "bg-gray-100 text-gray-700",
  NOT_STARTED: "bg-gray-100 text-gray-700",
};

const STATUS_ICONS: Record<string, any> = {
  COMPLETED: faCheckCircle,
  IN_PROGRESS: faCircleNotch,
  REJECTED: faXmark,
  PENDING: faCircle,
  NOT_STARTED: faCircle,
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : "—";

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

export const StudentJourneyView: React.FC = () => {
  const { currentUser, students: masterStudents } = useCollegeOS();
  const { toast } = useToast();
  const isStudent = currentUser?.role === "student";

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [draftFilters, setDraftFilters] = useState({
    academicYear: "",
    batch: "",
    section: "",
    semester: "",
  });
  const [filters, setFilters] = useState({
    academicYear: "",
    batch: "",
    section: "",
    semester: "",
  });
  const [journey, setJourney] = useState<TimelineResponse | null>(null);
  const [stages, setStages] = useState<JourneyStage[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"timeline" | "stages" | "workflows">("timeline");
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState<JourneyStage | null>(null);
  const [initiating, setInitiating] = useState<WorkflowTemplate | null>(null);
  const [workflowForm, setWorkflowForm] = useState({ subject: "", description: "" });
  const [submitting, setSubmitting] = useState(false);

  const loadStudents = useCallback(async () => {
    if (isStudent) return;
    try {
      // The selector offers every student, so ask for the widest page the API allows.
      const res = await apiRequest<{ students: StudentOption[] }>("/students?limit=200");
      const list = (res.students || []).map((student) => ({
        id: student.id,
        studentId: student.studentId,
        fullName:
          student.fullName ||
          [student.firstName, student.lastName].filter(Boolean).join(" ") ||
          student.studentId,
        program: student.program || "",
        semester: student.semester ?? null,
        academicYear: student.academicYear || "",
        batch: student.batch || "",
        section: student.section || "",
      }));
      setStudents(list);
    } catch {
      const fallback = (masterStudents || []).map((s) => ({
        id: s.id,
        studentId: s.studentId,
        fullName: `${s.firstName} ${s.lastName}`,
        program: s.programCode,
        semester: s.currentSemester,
        academicYear: "",
        batch: "",
        section: "",
      }));
      setStudents(fallback);
    }
  }, [isStudent, masterStudents]);

  const filterOptions = React.useMemo(() => {
    const unique = (values: Array<string | number | null | undefined>) =>
      Array.from(
        new Set(
          values
            .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
            .map((value) => String(value)),
        ),
      ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return {
      academicYear: unique(students.map((student) => student.academicYear)),
      batch: unique(students.map((student) => student.batch)),
      section: unique(students.map((student) => student.section)),
      semester: unique(students.map((student) => student.semester)).sort(
        (a, b) => Number(a) - Number(b),
      ),
    };
  }, [students]);

  const filteredStudents = React.useMemo(
    () =>
      students.filter((student) => {
        if (filters.academicYear && String(student.academicYear || "") !== filters.academicYear) {
          return false;
        }
        if (filters.batch && String(student.batch || "") !== filters.batch) return false;
        if (filters.section && String(student.section || "") !== filters.section) return false;
        if (filters.semester && String(student.semester ?? "") !== filters.semester) return false;
        return true;
      }),
    [students, filters],
  );

  // Keep the selection inside the filtered set so the timeline always matches
  // the visible filter bar.
  React.useEffect(() => {
    if (isStudent) return;
    if (filteredStudents.length === 0) {
      setSelectedStudentId("");
      return;
    }
    if (!filteredStudents.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId(filteredStudents[0].id);
    }
  }, [filteredStudents, selectedStudentId, isStudent]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await apiRequest<{ templates: WorkflowTemplate[] }>(
        "/student-journey/workflow-templates",
      );
      setTemplates(res.templates || []);
    } catch {
      toast.error("Failed to load workflow templates");
    }
  }, [toast]);

  const loadJourney = useCallback(async () => {
    // Staff/administrators must choose a student first: the endpoints are
    // scoped to one student and reject the request without an id.
    if (!isStudent && !selectedStudentId) {
      setJourney(null);
      setStages([]);
      return;
    }

    setLoading(true);
    const suffix = isStudent ? "" : `?studentId=${encodeURIComponent(selectedStudentId)}`;
    try {
      const [timelineRes, stagesRes] = await Promise.all([
        apiRequest<TimelineResponse>(`/student-journey/timeline${suffix}`),
        apiRequest<{ stages: JourneyStage[] }>(`/student-journey/stages${suffix}`),
      ]);
      setJourney(timelineRes);
      setStages(stagesRes.stages || []);
    } catch (err) {
      setJourney(null);
      setStages([]);
      toast.error(err instanceof Error ? err.message : "Failed to load student journey");
    } finally {
      setLoading(false);
    }
  }, [isStudent, selectedStudentId, toast]);

  useEffect(() => {
    if (!isStudent) loadStudents();
  }, [isStudent, loadStudents]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadJourney();
  }, [loadJourney]);

  const handleInitiate = async () => {
    if (!initiating) return;
    if (!workflowForm.subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (!isStudent && !selectedStudentId) {
      toast.error("Select a student first");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest("/student-journey/initiate-workflow", {
        method: "POST",
        body: JSON.stringify({
          templateId: initiating.id,
          studentId: isStudent ? undefined : selectedStudentId,
          subject: workflowForm.subject.trim(),
          description: workflowForm.description.trim(),
        }),
      });
      toast.success("Workflow initiated successfully");
      setInitiating(null);
      setWorkflowForm({ subject: "", description: "" });
      await loadJourney();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to initiate workflow");
    } finally {
      setSubmitting(false);
    }
  };

  const visibleStages = (journey?.timeline || stages).filter((stage) => {
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return (
      stage.label.toLowerCase().includes(needle) ||
      stage.department.toLowerCase().includes(needle) ||
      (stage.currentCase?.subject || "").toLowerCase().includes(needle) ||
      (stage.currentCase?.caseNumber || "").toLowerCase().includes(needle)
    );
  });

  const summary = journey?.summary;
  const student = journey?.student;

  const searchField = (
    <div className="relative">
      <FontAwesomeIcon
        icon={faSearch}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
      />
      <input
        type="text"
        placeholder="Search stages, departments or case numbers…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-gray-900 placeholder:text-gray-400 focus:border-[var(--color-primary)] focus:outline-none"
      />
    </div>
  );

  const filterSelect = (
    key: keyof typeof draftFilters,
    label: string,
    options: string[],
  ) => (
    <div className="flex min-w-[9rem] flex-1 flex-col gap-1">
      <label className="text-xs font-medium uppercase tracking-wide text-gray-500" htmlFor={`journey-filter-${key}`}>
        {label}
      </label>
      <select
        id={`journey-filter-${key}`}
        value={draftFilters[key]}
        onChange={(event) =>
          setDraftFilters((current) => ({ ...current, [key]: event.target.value }))
        }
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[var(--color-primary)] focus:outline-none"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );

  const hasDraftChanges =
    draftFilters.academicYear !== filters.academicYear ||
    draftFilters.batch !== filters.batch ||
    draftFilters.section !== filters.section ||
    draftFilters.semester !== filters.semester;

  const filterBar = !isStudent && (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        {filterSelect("academicYear", "Year", filterOptions.academicYear)}
        {filterSelect("batch", "Batch", filterOptions.batch)}
        {filterSelect("section", "Section", filterOptions.section)}
        {filterSelect("semester", "Current Semester", filterOptions.semester)}
        <button
          onClick={() => setFilters(draftFilters)}
          className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-8 py-2 text-sm text-white hover:bg-[var(--color-primary-strong)] focus:outline-none disabled:opacity-50"
          disabled={!hasDraftChanges}
        >
          Apply
        </button>
        <button
          onClick={() => {
            const cleared = { academicYear: "", batch: "", section: "", semester: "" };
            setDraftFilters(cleared);
            setFilters(cleared);
          }}
          className="rounded-lg border border-gray-300 px-8 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:border-[var(--color-primary)] focus:outline-none"
        >
          Clear
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Showing {filteredStudents.length} of {students.length} students
      </p>
    </div>
  );

  const studentPicker = !isStudent && (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="text-sm font-medium text-gray-700" htmlFor="journey-student">
        Student <span className="text-[var(--color-primary)]">*</span>
      </label>
      {filteredStudents.length === 1 ? (
        // One match: show the student outright instead of a one-option dropdown.
        <div
          id="journey-student"
          className="flex w-full flex-wrap items-center gap-x-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm sm:max-w-md"
        >
          <span className="font-medium text-gray-900">{filteredStudents[0].fullName}</span>
          <span className="text-gray-500">
            · {filteredStudents[0].studentId}
            {filteredStudents[0].program ? ` · ${filteredStudents[0].program}` : ""}
          </span>
        </div>
      ) : (
        <select
          id="journey-student"
          value={selectedStudentId}
          onChange={(event) => setSelectedStudentId(event.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[var(--color-primary)] focus:outline-none sm:max-w-md"
        >
          {filteredStudents.length === 0 && <option value="">No matching students</option>}
          {filteredStudents.map((option) => (
            <option key={option.id} value={option.id}>
              {option.fullName} · {option.studentId}
              {option.program ? ` · ${option.program}` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const needsStudent = !isStudent && !selectedStudentId;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Student Lifecycle &amp; Case Management</h1>
        <p className="mt-1 text-gray-500">
          Track journey stages, case progress and workflow templates for a student
        </p>
      </div>

      {filterBar}

      {studentPicker}

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {[
            { id: "timeline", label: "Timeline", icon: faClock },
            { id: "stages", label: "Student Stages", icon: faGraduationCap },
            { id: "workflows", label: "Workflow Templates", icon: faFileAlt },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              <FontAwesomeIcon icon={tab.icon} size="sm" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {needsStudent && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Select a student to load their journey.
        </div>
      )}

      {!needsStudent && loading && (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      )}

      {!needsStudent && !loading && activeTab === "timeline" && (
        <div className="space-y-4">
          {student && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">{student.fullName}</h2>
                  <p className="text-sm text-gray-500">
                    {student.studentId} · {student.program} · Semester {student.semester}
                    {student.department ? ` · ${student.department}` : ""}
                  </p>
                </div>
                {summary && (
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {summary.progressPercentage}% complete
                    </p>
                    <p className="text-xs text-gray-500">
                      {summary.completedCount} completed · {summary.inProgressCount} in progress ·{" "}
                      {summary.pendingCount} pending
                    </p>
                  </div>
                )}
              </div>
              {summary && (
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${summary.progressPercentage}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-4">{searchField}</div>

          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            {visibleStages.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No journey stages found</div>
            ) : (
              visibleStages.map((stage) => (
                <div key={stage.key} className="flex gap-4 p-4">
                  <div className="flex-shrink-0">
                    <FontAwesomeIcon
                      icon={STATUS_ICONS[stage.status] || faCircle}
                      className={
                        stage.status === "COMPLETED"
                          ? "text-emerald-600"
                          : stage.status === "IN_PROGRESS"
                            ? "text-blue-600"
                            : stage.status === "REJECTED"
                              ? "text-red-600"
                              : "text-gray-400"
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-gray-400">Step {stage.order}</span>
                      <h4 className="font-medium text-gray-900">{stage.label}</h4>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[stage.status] || STATUS_STYLES.PENDING
                        }`}
                      >
                        {stage.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{stage.department}</p>
                    {stage.currentCase ? (
                      <p className="mt-1 text-sm text-gray-700">
                        {stage.currentCase.caseNumber} · {stage.currentCase.subject} ·{" "}
                        {stage.currentCase.status}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-gray-500">No case submitted yet</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                      <span>Updated {formatDate(stage.currentCase?.updatedAt)}</span>
                      <span>Est. {stage.estimatedProcessingDays} day(s)</span>
                      {stage.history.length > 0 && <span>{stage.history.length} case(s)</span>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <button
                      onClick={() => setSelectedStage(stage)}
                      className="rounded p-2 text-gray-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                      title="View stage details"
                    >
                      <FontAwesomeIcon icon={faEye} size="sm" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {!needsStudent && !loading && activeTab === "stages" && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-4">{searchField}</div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["Stage", "Department", "Status", "Current Case", "Next Action", "Updated"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleStages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No student stages found
                    </td>
                  </tr>
                ) : (
                  visibleStages.map((stage) => (
                    <tr key={stage.key} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <FontAwesomeIcon
                            icon={STATUS_ICONS[stage.status] || faCircle}
                            className="text-emerald-600"
                          />
                          <span className="font-medium text-gray-900">{stage.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{stage.department}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2 py-1 text-sm font-medium ${
                            STATUS_STYLES[stage.status] || STATUS_STYLES.PENDING
                          }`}
                        >
                          {stage.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {stage.currentCase ? (
                          <div>
                            <p className="font-medium">{stage.currentCase.caseNumber}</p>
                            <p className="text-gray-500">{stage.currentCase.subject}</p>
                          </div>
                        ) : (
                          <span className="italic text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {stage.nextAction ? (
                          <a
                            href={stage.nextAction.url}
                            className="text-emerald-600 hover:underline"
                          >
                            {stage.nextAction.label}
                          </a>
                        ) : (
                          <span className="italic text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {formatDate(stage.currentCase?.updatedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!needsStudent && activeTab === "workflows" && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-4">
            <h3 className="text-lg font-semibold text-gray-900">Available Workflow Templates</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {templates.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No workflow templates found</div>
            ) : (
              templates.map((template) => (
                <div key={template.id} className="p-4 hover:bg-gray-50">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="font-medium text-gray-900">{template.name}</h4>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            template.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {template.isActive ? "Active" : "Inactive"}
                        </span>
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                          {template.category}
                        </span>
                        {template.department && (
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                            {template.department}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{template.description}</p>
                      <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                        <span>{template.steps.length} steps</span>
                        <span>
                          Est. {template.steps.reduce((sum, step) => sum + (step.slaHours || 0), 0)}{" "}
                          hours total
                        </span>
                      </div>
                    </div>
                    {template.isActive && !needsStudent && (
                      <button
                        onClick={() => {
                          setInitiating(template);
                          setWorkflowForm({ subject: "", description: "" });
                        }}
                        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700"
                      >
                        <FontAwesomeIcon icon={faPlus} size="sm" />
                        Initiate Workflow
                      </button>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-gray-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                    {template.steps.map((step, index) => (
                      <div key={`${template.id}-${index}`} className="rounded-lg bg-gray-50 p-3 text-sm">
                        <div className="font-medium text-gray-900">
                          Step {step.stepOrder}: {step.name}
                        </div>
                        <div className="text-xs text-gray-500">{step.responsibleRole}</div>
                        <div className="mt-1 text-xs text-gray-400">{step.slaHours}h SLA</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {selectedStage && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setSelectedStage(null)}
            />
            <div className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900">{selectedStage.label}</h3>
                <button
                  onClick={() => setSelectedStage(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FontAwesomeIcon icon={faTimes} size="lg" />
                </button>
              </div>
              <div className="max-h-[70vh] space-y-6 overflow-y-auto p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full px-4 py-2 text-lg font-medium ${
                      STATUS_STYLES[selectedStage.status] || STATUS_STYLES.PENDING
                    }`}
                  >
                    {selectedStage.status}
                  </span>
                  <span className="text-sm text-gray-500">
                    {selectedStage.department} · Est. {selectedStage.estimatedProcessingDays} day(s)
                  </span>
                </div>

                {selectedStage.currentCase && (
                  <div className="rounded-lg bg-gray-50 p-4">
                    <h4 className="font-medium text-gray-900">Current Case</h4>
                    <p className="mt-1 text-sm text-gray-700">
                      {selectedStage.currentCase.caseNumber} · {selectedStage.currentCase.subject}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      Status {selectedStage.currentCase.status} · Priority{" "}
                      {selectedStage.currentCase.priority} · Created{" "}
                      {formatDateTime(selectedStage.currentCase.createdAt)}
                    </p>
                  </div>
                )}

                {selectedStage.requiredDocuments.length > 0 && (
                  <div>
                    <h4 className="mb-3 font-medium text-gray-900">Required Documents</h4>
                    <ul className="space-y-1 text-sm text-gray-700">
                      {selectedStage.requiredDocuments.map((document) => (
                        <li key={document} className="flex items-center gap-2">
                          <FontAwesomeIcon icon={faFileAlt} size="sm" className="text-gray-400" />
                          {document}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h4 className="mb-3 font-medium text-gray-900">Case History</h4>
                  {selectedStage.history.length === 0 ? (
                    <p className="py-4 text-center text-gray-500">No cases recorded for this stage</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedStage.history.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-start gap-3 rounded-lg bg-gray-50 p-3"
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
                            <FontAwesomeIcon
                              icon={faFileAlt}
                              size="sm"
                              className="text-emerald-600"
                            />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium">
                              {entry.caseNumber} · {entry.status}
                            </div>
                            <div className="text-sm text-gray-500">
                              Created {formatDateTime(entry.createdAt)}
                              {entry.resolvedAt && ` · Resolved ${formatDateTime(entry.resolvedAt)}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {initiating && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => (submitting ? undefined : setInitiating(null))}
            />
            <div className="relative w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Initiate: {initiating.name}
                </h3>
                <button
                  onClick={() => setInitiating(null)}
                  className="text-gray-400 hover:text-gray-600"
                  disabled={submitting}
                >
                  <FontAwesomeIcon icon={faTimes} size="lg" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="workflow-subject">
                    Subject
                  </label>
                  <input
                    id="workflow-subject"
                    value={workflowForm.subject}
                    onChange={(event) =>
                      setWorkflowForm((form) => ({ ...form, subject: event.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-[var(--color-primary)] focus:outline-none"
                    placeholder="Short description of the request"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="workflow-description">
                    Description
                  </label>
                  <textarea
                    id="workflow-description"
                    value={workflowForm.description}
                    onChange={(event) =>
                      setWorkflowForm((form) => ({ ...form, description: event.target.value }))
                    }
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-[var(--color-primary)] focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setInitiating(null)}
                  disabled={submitting}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInitiate}
                  disabled={submitting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentJourneyView;