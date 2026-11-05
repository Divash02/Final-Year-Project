import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  faArrowLeft,
  faArrowRight,
  faCheck,
  faCheckCircle,
  faClock,
  faPlay,
  faPlus,
  faSitemap,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { apiRequest } from "../../../services/apiClient";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { useToast } from "../../ui/ToastContainer";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { PageHeader } from "../../ui/PageHeader";

type WorkflowStatus = "draft" | "published" | "paused" | "archived" | "template";
type WorkflowStep = {
  _id: string;
  id?: string;
  name: string;
  assigneeType: "role" | "user";
  role: string;
  user: string;
};
type WorkflowCondition = {
  stage: "before_start" | "before_step";
  stepId: string;
  field: string;
  operator: string;
  value: string;
  action: "skip_step" | "return" | "reject";
  message: string;
};
type WorkflowDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  department: string;
  triggerEvent: string;
  requestTypes: string[];
  applicableUserTypes: string[];
  approvalMode: "sequential" | "parallel";
  steps: WorkflowStep[];
  conditions: WorkflowCondition[];
  notifications: {
    approvers: boolean;
    requesterStatusChanges: boolean;
    pendingReminders: boolean;
    reminderHours: number;
  };
  actions: {
    approvedStatus: "APPROVED" | "COMPLETED";
    rejectedStatus: "REJECTED";
    returnedStatus: "MORE_INFO";
  };
  status: WorkflowStatus;
  isTemplate: boolean;
  executionCount: number;
  createdAt: string;
};
type WorkflowInstance = {
  id: string;
  workflow: { id: string; name: string; category: string; steps: WorkflowStep[] };
  requester: { id: string; name: string };
  request: { id: string; caseNumber: string; type: string; subject: string; status: string };
  status: "in_progress" | "completed" | "rejected" | "returned";
  currentStepIndex: number;
  currentStep: string;
  currentApprovers: string[];
  currentApproverNames: string[];
  history: Array<{
    event: string;
    stepName: string;
    message: string;
    createdAt: string;
    actor?: string;
    actorName?: string;
  }>;
  createdAt: string;
};
type InstanceStats = { running: number; completed: number; total: number };
type WorkflowOptions = {
  roles: string[];
  userTypes: string[];
  users: Array<{ id: string; name: string; email: string; roles: string[] }>;
  departments: string[];
  categories: string[];
  requestTypes: string[];
};
type Draft = Omit<WorkflowDefinition, "id" | "status" | "isTemplate" | "executionCount" | "createdAt">;

const STEPS = [
  "Basic information",
  "Approval steps",
  "Conditions and rules",
  "Notifications and actions",
  "Review, test & publish",
];
const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  category: "Administrative",
  department: "Any",
  triggerEvent: "case.created",
  requestTypes: ["*"],
  applicableUserTypes: [],
  approvalMode: "sequential",
  steps: [],
  conditions: [],
  notifications: {
    approvers: true,
    requesterStatusChanges: true,
    pendingReminders: false,
    reminderHours: 24,
  },
  actions: {
    approvedStatus: "APPROVED",
    rejectedStatus: "REJECTED",
    returnedStatus: "MORE_INFO",
  },
};

function createStep(): WorkflowStep {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return {
    _id: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    name: "",
    assigneeType: "role",
    role: "faculty",
    user: "",
  };
}

function createCondition(): WorkflowCondition {
  return {
    stage: "before_step",
    stepId: "",
    field: "request.priority",
    operator: "equals",
    value: "HIGH",
    action: "skip_step",
    message: "",
  };
}

function getBuilderStepErrors(stepIndex: number, draft: Draft, options: WorkflowOptions) {
  if (stepIndex === 0) {
    const errors: string[] = [];
    if (!draft.name.trim()) errors.push("Enter a workflow name.");
    if (!draft.category.trim()) errors.push("Choose a workflow category.");
    if (!draft.department.trim()) errors.push("Choose a department.");
    if (!draft.triggerEvent.trim()) errors.push("Choose a trigger event.");
    if (draft.requestTypes.length === 0) errors.push("Choose at least one request type.");
    return errors;
  }

  if (stepIndex === 1) {
    const errors: string[] = [];
    if (draft.steps.length === 0) errors.push("Add at least one approval step.");
    draft.steps.forEach((step, index) => {
      if (!step.name.trim()) errors.push(`Enter a name for approval step ${index + 1}.`);
      if (step.assigneeType === "role") {
        if (!options.roles.includes(step.role)) {
          errors.push(`Choose an authorized role for approval step ${index + 1}.`);
        } else if (!options.users.some((user) => user.roles.includes(step.role))) {
          errors.push(`No active approver is available for the role on approval step ${index + 1}.`);
        }
      } else if (
        step.assigneeType !== "user" ||
        !options.users.some((user) => user.id === step.user)
      ) {
        errors.push(`Choose an active authorized user for approval step ${index + 1}.`);
      }
    });
    return errors;
  }

  if (stepIndex === 2) {
    const errors: string[] = [];
    draft.conditions.forEach((condition, index) => {
      if (!/^request\.[a-zA-Z0-9_.]+$/.test(condition.field.trim())) {
        errors.push(`Condition ${index + 1} needs a request field, such as request.data.days.`);
      }
      if (
        ![
          "equals",
          "not_equals",
          "greater_than",
          "greater_or_equal",
          "less_than",
          "less_or_equal",
          "contains",
          "exists",
        ].includes(condition.operator)
      ) {
        errors.push(`Choose a valid operator for condition ${index + 1}.`);
      }
      if (condition.operator !== "exists" && !condition.value.trim()) {
        errors.push(`Condition ${index + 1} needs a value.`);
      }
      if (
        condition.stage === "before_step" &&
        !draft.steps.some((step) => step._id === condition.stepId)
      ) {
        errors.push(`Choose an existing approval step for condition ${index + 1}.`);
      }
      if (condition.stage === "before_start" && condition.action === "skip_step") {
        errors.push(`Condition ${index + 1} cannot skip a step before the workflow starts.`);
      }
      if (!["skip_step", "return", "reject"].includes(condition.action)) {
        errors.push(`Choose a valid action for condition ${index + 1}.`);
      }
    });
    return errors;
  }

  if (stepIndex === 3 && draft.notifications.pendingReminders) {
    const interval = draft.notifications.reminderHours;
    if (!Number.isInteger(interval) || interval < 1 || interval > 720) {
      return ["Set the reminder interval to a whole number between 1 and 720 hours."];
    }
  }

  return [];
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const labelClass = "block text-sm font-medium text-slate-700";

function statusStyle(status: string) {
  if (status === "published" || status === "completed" || status === "approved") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (status === "in_progress" || status === "paused") {
    return "bg-amber-100 text-amber-800";
  }
  if (status === "rejected" || status === "archived" || status === "returned") {
    return "bg-rose-100 text-rose-800";
  }
  return "bg-slate-100 text-slate-700";
}

export const WorkflowAutomationView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const toast = useToast();
  const roles = currentUser?.roles?.length ? currentUser.roles : [currentUser?.role || ""];
  const canManage = roles.some((role) =>
    ["super_admin", "campus_admin", "dean", "registrar"].includes(role),
  );
  const [activeTab, setActiveTab] = useState<"workflows" | "instances" | "templates">("workflows");
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [templates, setTemplates] = useState<WorkflowDefinition[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [instanceStats, setInstanceStats] = useState<InstanceStats>({
    running: 0,
    completed: 0,
    total: 0,
  });
  const [options, setOptions] = useState<WorkflowOptions>({
    roles: [],
    userTypes: [],
    users: [],
    departments: ["Any"],
    categories: [],
    requestTypes: ["*"],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [builderStep, setBuilderStep] = useState(0);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [testResult, setTestResult] = useState("");
  const [sampleData, setSampleData] = useState(
    '{\n  "request": {\n    "priority": "NORMAL",\n    "data": { "days": 2, "documentsComplete": true }\n  }\n}',
  );
  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [workflowResult, instanceResult, templateResult] = await Promise.all([
        apiRequest<{ workflows: WorkflowDefinition[] }>("/workflows?templates=false"),
        apiRequest<{ instances: WorkflowInstance[]; stats: InstanceStats }>("/workflow-instances?status=in_progress"),
        apiRequest<{ workflows: WorkflowDefinition[] }>("/workflows?templates=true&status=template"),
      ]);
      setWorkflows(workflowResult.workflows.filter((item) => !item.isTemplate));
      setInstances(instanceResult.instances);
      setInstanceStats(instanceResult.stats);
      setTemplates(templateResult.workflows);
    } catch (requestError) {
      toast.toast({ message: requestError instanceof Error ? requestError.message : "Could not load workflow data.", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    if (canManage) {
      apiRequest<WorkflowOptions>("/workflows/options")
        .then(setOptions)
        .catch((requestError: unknown) => {
          toast.toast({ message: requestError instanceof Error ? requestError.message : "Could not load builder options.", variant: "error" });
        });
    }
  }, [canManage, loadData]);

  const stats = useMemo(
    () => ({
      active: workflows.filter((item) => item.status === "published").length,
      running: instanceStats.running,
      completed: instanceStats.completed,
      executions: workflows.reduce((sum, item) => sum + item.executionCount, 0),
    }),
    [instanceStats, workflows],
  );

  const openNewBuilder = (workflow?: WorkflowDefinition) => {
    setEditingId(workflow?.id || null);
    setDraft(
      workflow
        ? {
            name: workflow.name,
            description: workflow.description,
            category: workflow.category,
            department: workflow.department,
            triggerEvent: workflow.triggerEvent,
            requestTypes: workflow.requestTypes,
            applicableUserTypes: workflow.applicableUserTypes,
            approvalMode: workflow.approvalMode,
            steps: workflow.steps.map((step) => ({ ...step, _id: step.id || step._id })),
            conditions: workflow.conditions.map((condition) => ({ ...condition, value: String(condition.value ?? "") })),
            notifications: { ...workflow.notifications },
            actions: { ...workflow.actions },
          }
        : {
            ...EMPTY_DRAFT,
            steps: [],
            conditions: [],
            notifications: { ...EMPTY_DRAFT.notifications },
            actions: { ...EMPTY_DRAFT.actions },
          },
    );
    setBuilderStep(0);
    setValidationErrors([]);
    setTestResult("");
    setBuilderOpen(true);
    setError("");
  };

  const updateDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setValidationErrors([]);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const navigateToBuilderStep = (targetStep: number) => {
    for (let stepIndex = 0; stepIndex < targetStep; stepIndex += 1) {
      const errors = getBuilderStepErrors(stepIndex, draft, options);
      if (errors.length > 0) {
        setBuilderStep(stepIndex);
        setValidationErrors(errors);
        return;
      }
    }
    setValidationErrors([]);
    setBuilderStep(targetStep);
  };

  const furthestAvailableStep = STEPS.findIndex((_, index) =>
    getBuilderStepErrors(index, draft, options).length > 0,
  );
  const maxNavigableStep =
    furthestAvailableStep === -1 ? STEPS.length - 1 : furthestAvailableStep;

  const updateStep = (index: number, patch: Partial<WorkflowStep>) =>
    updateDraft(
      "steps",
      draft.steps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step)),
    );

  const moveStep = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.steps.length) return;
    const next = [...draft.steps];
    [next[index], next[target]] = [next[target], next[index]];
    updateDraft("steps", next);
  };

  const updateCondition = (index: number, patch: Partial<WorkflowCondition>) =>
    updateDraft(
      "conditions",
      draft.conditions.map((condition, conditionIndex) =>
        conditionIndex === index ? { ...condition, ...patch } : condition,
      ),
    );

  const saveDraft = async (publish: boolean) => {
    setBusy(true);
    setError("");
    setValidationErrors([]);
    try {
      const workflow = editingId
        ? await apiRequest<{ workflow: WorkflowDefinition }>(`/workflows/${editingId}`, {
            method: "PUT",
            body: JSON.stringify(draft),
          })
        : await apiRequest<{ workflow: WorkflowDefinition }>("/workflows", {
            method: "POST",
            body: JSON.stringify(draft),
          });
      if (publish) {
        const validation = await apiRequest<{ valid: boolean; errors: string[] }>(
          "/workflows/validate",
          { method: "POST", body: JSON.stringify(draft) },
        );
        if (!validation.valid) {
          setValidationErrors(validation.errors);
          setBuilderStep(4);
          setBusy(false);
          return;
        }
        await apiRequest(`/workflows/${workflow.workflow.id}/publish`, { method: "POST" });
      }
      setBuilderOpen(false);
      await loadData();
    } catch (requestError) {
      toast.toast({ message: requestError instanceof Error ? requestError.message : "Workflow could not be saved.", variant: "error" });
      const errors = (requestError as { errors?: string[] })?.errors;
      if (Array.isArray(errors)) {
        setValidationErrors(errors);
        setBuilderStep(4);
      }
    } finally {
      setBusy(false);
    }
  };

  const validateAndTest = async () => {
    setBusy(true);
    setError("");
    setValidationErrors([]);
    try {
      let sampleRequest: unknown;
      try {
        sampleRequest = JSON.parse(sampleData);
      } catch {
        setValidationErrors(["Sample data must be valid JSON."]);
        return;
      }
      const result = await apiRequest<{ valid: boolean; errors: string[]; result: string; events: Array<{ step?: string; action: string }> }>(
        "/workflows/test",
        { method: "POST", body: JSON.stringify({ ...draft, sampleRequest }) },
      );
      setValidationErrors(result.errors);
      setTestResult(
        result.events
          .map((event) => `${event.step ? `${event.step}: ` : ""}${event.action.replaceAll("_", " ")}`)
          .join(" → "),
      );
    } catch (requestError) {
      toast.toast({ message: requestError instanceof Error ? requestError.message : "Workflow test failed.", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const updateWorkflowStatus = async (id: string, status: "paused" | "archived") => {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/workflows/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadData();
    } catch (requestError) {
      toast.toast({ message: requestError instanceof Error ? requestError.message : "Workflow status could not be updated.", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const saveAsTemplate = async (workflow: WorkflowDefinition) => {
    setBusy(true);
    setError("");
    try {
      if (workflow.status === "published") {
        setError("Pause a published workflow before saving it as a template.");
        return;
      }
      await apiRequest(`/workflows/${workflow.id}/template`, {
        method: "PATCH",
        body: JSON.stringify({ isTemplate: true }),
      });
      await loadData();
    } catch (requestError) {
      toast.toast({ message: requestError instanceof Error ? requestError.message : "Template could not be saved.", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const cloneTemplate = async (template: WorkflowDefinition) => {
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ workflow: WorkflowDefinition }>(
        `/workflows/${template.id}/clone`,
        { method: "POST" },
      );
      await loadData();
      openNewBuilder(result.workflow);
    } catch (requestError) {
      toast.toast({ message: requestError instanceof Error ? requestError.message : "Could not create a workflow from this template.", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const showInstance = async (instance: WorkflowInstance) => {
    setError("");
    setBusy(true);
    try {
      const result = await apiRequest<{ instance: WorkflowInstance }>(`/workflow-instances/${instance.id}`);
      setSelectedInstance(result.instance);
      setDecisionNote("");
    } catch (requestError) {
      toast.toast({ message: requestError instanceof Error ? requestError.message : "Could not open this workflow instance.", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: "approve" | "reject" | "return") => {
    if (!selectedInstance) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ instance: WorkflowInstance }>(
        `/workflow-instances/${selectedInstance.id}/decision`,
        {
          method: "POST",
          body: JSON.stringify({ decision, note: decisionNote }),
        },
      );
      setSelectedInstance(result.instance);
      await loadData();
    } catch (requestError) {
      toast.toast({ message: requestError instanceof Error ? requestError.message : "Decision could not be recorded.", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const closeBuilder = () => {
    setBuilderOpen(false);
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, steps: [], conditions: [] });
    setError("");
  };

  const renderBuilderStep = () => {
    if (builderStep === 0) {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>Workflow name<input className={inputClass} value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} maxLength={120} /></label>
          <label className={labelClass}>Category<select className={inputClass} value={draft.category} onChange={(event) => updateDraft("category", event.target.value)}>{[...new Set([...options.categories, draft.category])].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className={`${labelClass} md:col-span-2`}>Description<textarea className={inputClass} rows={3} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} maxLength={1000} /></label>
          <label className={labelClass}>Department<select className={inputClass} value={draft.department} onChange={(event) => updateDraft("department", event.target.value)}>{[...new Set([...options.departments, draft.department])].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className={labelClass}>Trigger event<select className={inputClass} value={draft.triggerEvent} onChange={(event) => updateDraft("triggerEvent", event.target.value)}><option value="case.created">Request submitted</option></select></label>
          <fieldset className="md:col-span-2">
            <legend className={labelClass}>Request types</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {options.requestTypes.map((type) => (
                <label key={type} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" checked={draft.requestTypes.includes(type)} onChange={(event) => updateDraft("requestTypes", event.target.checked ? [...draft.requestTypes.filter((value) => value !== "*"), type] : draft.requestTypes.filter((value) => value !== type))} />
                  {type === "*" ? "All request types" : type}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="md:col-span-2">
            <legend className={labelClass}>Applicable requester roles <span className="font-normal text-slate-500">(leave empty for all roles)</span></legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {options.userTypes.map((role) => (
                <label key={role} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" checked={draft.applicableUserTypes.includes(role)} onChange={(event) => updateDraft("applicableUserTypes", event.target.checked ? [...draft.applicableUserTypes, role] : draft.applicableUserTypes.filter((item) => item !== role))} />
                  {role.replaceAll("_", " ")}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      );
    }
    if (builderStep === 1) {
      return (
        <div className="space-y-5">
          <label className={labelClass}>Approval mode<select className={inputClass} value={draft.approvalMode} onChange={(event) => updateDraft("approvalMode", event.target.value as Draft["approvalMode"])}><option value="sequential">Sequential — finish each step in order</option><option value="parallel">Parallel — all assigned users at each step must approve</option></select></label>
          <div className="flex flex-wrap items-center gap-2">
            {draft.steps.map((step, index) => (
              <React.Fragment key={step._id}>
                <div className="min-w-36 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">Step {index + 1}</span>
                  <span className="mt-1 block text-sm font-medium text-slate-800">{step.name || "New approval"}</span>
                  <span className="mt-1 block text-xs text-slate-600">{step.assigneeType === "role" ? step.role.replaceAll("_", " ") : options.users.find((user) => user.id === step.user)?.name || "Select user"}</span>
                </div>
                {index < draft.steps.length - 1 && <FontAwesomeIcon icon={faArrowRight} className="text-slate-400" aria-hidden="true" />}
              </React.Fragment>
            ))}
            {draft.steps.length === 0 && <p className="text-sm text-slate-500">Add an approval step to preview the route.</p>}
          </div>
          <div className="space-y-3">
            {draft.steps.map((step, index) => (
              <div key={step._id} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
                <label className={labelClass}>Step name<input className={inputClass} value={step.name} onChange={(event) => updateStep(index, { name: event.target.value })} placeholder="Department approval" /></label>
                <label className={labelClass}>Assign to<select className={inputClass} value={step.assigneeType} onChange={(event) => updateStep(index, { assigneeType: event.target.value as WorkflowStep["assigneeType"] })}><option value="role">Authorized role</option><option value="user">Specific user</option></select></label>
                {step.assigneeType === "role" ? (
                  <label className={labelClass}>Role<select className={inputClass} value={step.role} onChange={(event) => updateStep(index, { role: event.target.value })}>{options.roles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></label>
                ) : (
                  <label className={labelClass}>Approver<select className={inputClass} value={step.user} onChange={(event) => updateStep(index, { user: event.target.value })}><option value="">Select an active user</option>{options.users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.roles.join(", ")}</option>)}</select></label>
                )}
                <div className="flex items-end gap-1">
                  <Button size="sm" variant="ghost" aria-label="Move step up" disabled={index === 0} onClick={() => moveStep(index, -1)}>↑</Button>
                  <Button size="sm" variant="ghost" aria-label="Move step down" disabled={index === draft.steps.length - 1} onClick={() => moveStep(index, 1)}>↓</Button>
                  <Button size="sm" variant="danger" aria-label="Remove step" onClick={() => updateDraft("steps", draft.steps.filter((_, itemIndex) => itemIndex !== index))}><FontAwesomeIcon icon={faTrash} /></Button>
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" icon={faPlus} onClick={() => updateDraft("steps", [...draft.steps, createStep()])}>Add approval step</Button>
        </div>
      );
    }
    if (builderStep === 2) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Rules run on the server when a request enters the workflow or reaches a selected approval step. Request data uses fields such as <code className="rounded bg-slate-100 px-1">request.priority</code> or <code className="rounded bg-slate-100 px-1">request.data.days</code>.</p>
          {draft.conditions.map((condition, index) => (
            <div key={`${index}-${condition.stepId}`} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
              <label className={labelClass}>Evaluate<select className={inputClass} value={condition.stage} onChange={(event) => { const stage = event.target.value as WorkflowCondition["stage"]; updateCondition(index, { stage, ...(stage === "before_start" && condition.action === "skip_step" ? { action: "return" as const } : {}) }); }}><option value="before_start">Before the first step</option><option value="before_step">Before an approval step</option></select></label>
              {condition.stage === "before_step" && <label className={labelClass}>Approval step<select className={inputClass} value={condition.stepId} onChange={(event) => updateCondition(index, { stepId: event.target.value })}><option value="">Choose step</option>{draft.steps.map((step, stepIndex) => <option key={step._id} value={step._id}>{stepIndex + 1}. {step.name || "Unnamed step"}</option>)}</select></label>}
              <label className={labelClass}>Request field<input className={inputClass} value={condition.field} onChange={(event) => updateCondition(index, { field: event.target.value })} placeholder="request.data.days" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>Operator<select className={inputClass} value={condition.operator} onChange={(event) => updateCondition(index, { operator: event.target.value })}>{[["equals", "equals"], ["not_equals", "does not equal"], ["greater_than", "greater than"], ["greater_or_equal", "at least"], ["less_than", "less than"], ["less_or_equal", "at most"], ["contains", "contains"], ["exists", "exists"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className={labelClass}>Value<input className={inputClass} value={condition.value} onChange={(event) => updateCondition(index, { value: event.target.value })} disabled={condition.operator === "exists"} /></label>
              </div>
              <label className={labelClass}>If matched<select className={inputClass} value={condition.action} onChange={(event) => updateCondition(index, { action: event.target.value as WorkflowCondition["action"] })}>{condition.stage === "before_step" && <option value="skip_step">Skip this step</option>}<option value="return">Return to requester</option><option value="reject">Reject and stop</option></select></label>
              <label className={labelClass}>Message<input className={inputClass} value={condition.message} onChange={(event) => updateCondition(index, { message: event.target.value })} placeholder="Optional explanation" /></label>
              <div className="md:col-span-2"><Button size="sm" variant="danger" icon={faTrash} onClick={() => updateDraft("conditions", draft.conditions.filter((_, itemIndex) => itemIndex !== index))}>Remove rule</Button></div>
            </div>
          ))}
          <Button variant="outline" icon={faPlus} onClick={() => updateDraft("conditions", [...draft.conditions, createCondition()])}>Add condition</Button>
        </div>
      );
    }
    if (builderStep === 3) {
      return (
        <div className="space-y-5">
          <div className="space-y-3">
            {([
              ["approvers", "Notify assigned approvers when a step is ready"],
              ["requesterStatusChanges", "Notify the requester when the status changes"],
              ["pendingReminders", "Send pending approval reminders"],
            ] as const).map(([key, text]) => (
              <label key={key} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 text-sm">
                <span>{text}</span>
                <input type="checkbox" checked={draft.notifications[key]} onChange={(event) => updateDraft("notifications", { ...draft.notifications, [key]: event.target.checked })} />
              </label>
            ))}
            {draft.notifications.pendingReminders && (
              <label className={labelClass}>Reminder interval (hours)<input type="number" min={1} max={720} className={inputClass} value={draft.notifications.reminderHours} onChange={(event) => updateDraft("notifications", { ...draft.notifications, reminderHours: Number(event.target.value) })} /></label>
            )}
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            Approval, rejection and return update the linked request record and append an execution-history event. Notifications are delivered through CollegeOS in-app notifications.
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className={labelClass}>After final approval<select className={inputClass} value={draft.actions.approvedStatus} onChange={(event) => updateDraft("actions", { ...draft.actions, approvedStatus: event.target.value as Draft["actions"]["approvedStatus"] })}><option value="APPROVED">Set request to approved</option><option value="COMPLETED">Set request to completed</option></select></label>
            <label className={labelClass}>After rejection<select className={inputClass} value={draft.actions.rejectedStatus} disabled><option value="REJECTED">Set request to rejected</option></select></label>
            <label className={labelClass}>After return<select className={inputClass} value={draft.actions.returnedStatus} disabled><option value="MORE_INFO">Return for more information</option></select></label>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-5">
        <Card title="Workflow summary" padding>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Name</dt><dd className="font-medium">{draft.name}</dd></div>
            <div><dt className="text-slate-500">Category</dt><dd className="font-medium">{draft.category}</dd></div>
            <div><dt className="text-slate-500">Department</dt><dd className="font-medium">{draft.department}</dd></div>
            <div><dt className="text-slate-500">Trigger</dt><dd className="font-medium">Request submitted · {draft.requestTypes.join(", ") || "No types selected"}</dd></div>
            <div><dt className="text-slate-500">Approval mode</dt><dd className="font-medium">{draft.approvalMode}</dd></div>
            <div><dt className="text-slate-500">Rules</dt><dd className="font-medium">{draft.conditions.length}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {draft.steps.map((step, index) => <div key={step._id} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><span className="font-semibold">{index + 1}.</span> {step.name || "Unnamed step"} · {step.assigneeType === "role" ? step.role : options.users.find((user) => user.id === step.user)?.name || "Unassigned"}</div>)}
          </div>
        </Card>
        <Card title="Test with sample request data">
          <label className={labelClass}>Sample data<textarea className={`${inputClass} font-mono`} rows={6} value={sampleData} onChange={(event) => setSampleData(event.target.value)} /></label>
          <Button className="mt-3" variant="outline" icon={faPlay} isLoading={busy} onClick={() => void validateAndTest()}>Validate and test</Button>
          {testResult && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Route preview: {testResult}</p>}
          {validationErrors.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-rose-700">{validationErrors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul>}
        </Card>
      </div>
    );
  };

  const renderBuilder = () => (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workflow Automation"
        title={editingId ? "Edit workflow" : "Create Workflow Builder"}
        description="Configure a reusable request workflow, then validate it before publishing."
        icon={faSitemap}
        actions={<Button variant="outline" icon={faArrowLeft} onClick={closeBuilder}>Back to workflows</Button>}
      />
      <nav aria-label="Workflow builder steps" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STEPS.map((title, index) => (
          <button key={title} type="button" disabled={index > maxNavigableStep} onClick={() => navigateToBuilderStep(index)} className={`rounded-lg border px-3 py-3 text-left text-xs sm:text-sm disabled:cursor-not-allowed disabled:opacity-50 ${builderStep === index ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-900" : "border-slate-200 bg-white text-slate-600"}`}>
            <span className="block text-xs uppercase tracking-wide">Step {index + 1}</span>{title}
          </button>
        ))}
      </nav>
      <p className="text-sm text-slate-500">
        Complete each step in order to unlock the next one. You can save a draft at any time.
      </p>
      <Card title={STEPS[builderStep]} subtitle={`Step ${builderStep + 1} of ${STEPS.length}`}>
        {renderBuilderStep()}
        {validationErrors.length > 0 && builderStep !== 4 && <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-rose-700">{validationErrors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul>}
      </Card>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" disabled={builderStep === 0} icon={faArrowLeft} onClick={() => setBuilderStep((step) => Math.max(0, step - 1))}>Previous</Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" isLoading={busy} loadingLabel="Saving..." onClick={() => void saveDraft(false)}>Save as draft</Button>
          {builderStep < STEPS.length - 1 ? (
            <Button icon={faArrowRight} onClick={() => navigateToBuilderStep(builderStep + 1)}>Continue</Button>
          ) : (
            <Button icon={faCheck} isLoading={busy} loadingLabel="Validating..." onClick={() => void saveDraft(true)}>Validate &amp; publish</Button>
          )}
        </div>
      </div>
    </div>
  );

  if (builderOpen) {
    return (
      <div className="cos-page">
        {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
        {renderBuilder()}
      </div>
    );
  }

  if (selectedInstance) {
    const canDecide =
      selectedInstance.status === "in_progress" &&
      selectedInstance.currentApprovers.includes(currentUser?.id || "");
    return (
      <div className="cos-page space-y-5">
        <PageHeader
          eyebrow="Running instance"
          title={selectedInstance.request.caseNumber || selectedInstance.workflow.name}
          description={selectedInstance.request.subject}
          icon={faPlay}
          actions={<Button variant="outline" icon={faArrowLeft} onClick={() => setSelectedInstance(null)}>Back to instances</Button>}
        />
        {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card title="Request details">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-slate-500">Workflow</dt><dd>{selectedInstance.workflow.name}</dd></div>
              <div><dt className="text-slate-500">Requester</dt><dd>{selectedInstance.requester.name}</dd></div>
              <div><dt className="text-slate-500">Type</dt><dd>{selectedInstance.request.type}</dd></div>
              <div><dt className="text-slate-500">Status</dt><dd><span className={`rounded-full px-2 py-1 text-xs ${statusStyle(selectedInstance.status)}`}>{selectedInstance.status}</span></dd></div>
              <div className="col-span-2"><dt className="text-slate-500">Current stage</dt><dd className="font-medium">{selectedInstance.currentStep || "No pending step"}</dd></div>
            </dl>
            {canDecide && <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
              <label className={labelClass}>Decision note<textarea className={inputClass} rows={2} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label>
              <div className="flex flex-wrap gap-2">
                <Button isLoading={busy} onClick={() => void decide("approve")}>Approve</Button>
                <Button variant="danger" isLoading={busy} onClick={() => void decide("reject")}>Reject</Button>
                <Button variant="outline" isLoading={busy} onClick={() => void decide("return")}>Return to requester</Button>
              </div>
            </div>}
          </Card>
          <Card title="Approval flow">
            <ol className="space-y-3">
              {selectedInstance.workflow.steps.map((step, index) => <li key={step.id || step._id} className={`rounded-lg border p-3 ${index === selectedInstance.currentStepIndex && selectedInstance.status === "in_progress" ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}><span className="mr-2 text-xs font-semibold uppercase text-slate-500">Step {index + 1}</span>{step.name}</li>)}
            </ol>
          </Card>
        </div>
        <Card title="Execution history">
          <ol className="space-y-4">
            {selectedInstance.history.map((item, index) => <li key={`${item.createdAt}-${index}`} className="flex gap-3 border-l-2 border-emerald-200 pl-4"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600" /><div><p className="text-sm font-medium capitalize">{item.event.replaceAll("_", " ")}{item.stepName ? ` · ${item.stepName}` : ""}</p><p className="text-sm text-slate-600">{item.message}</p>{item.actorName && <p className="text-xs text-slate-500">By {item.actorName}</p>}<time className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()}</time></div></li>)}
          </ol>
        </Card>
      </div>
    );
  }

  return (
    <div className="cos-page space-y-5">
      <PageHeader
        title="Workflow Automation"
        description="Configure approval routing and track live request execution."
        icon={faSitemap}
        actions={canManage ? <Button icon={faPlus} onClick={() => openNewBuilder()}>Create Workflow</Button> : undefined}
      />
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {([
          ["Published workflows", stats.active, faSitemap, "text-emerald-700"],
          ["Running instances", stats.running, faClock, "text-amber-700"],
          ["Completed instances", stats.completed, faCheckCircle, "text-emerald-700"],
          ["Total executions", stats.executions, faPlay, "text-blue-700"],
        ] as [string, number, IconDefinition, string][]).map(([label, value, icon, color]) => (
          <Card key={label}><div className="flex items-center justify-between gap-3"><div><p className="text-sm text-slate-600">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div><FontAwesomeIcon icon={icon} className={`text-xl ${color}`} /></div></Card>
        ))}
      </div>
      <div className="flex gap-2 border-b border-slate-200" role="tablist">
        {(["workflows", "instances", "templates"] as const).map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={`px-4 py-3 text-sm capitalize ${activeTab === tab ? "border-b-2 border-emerald-600 font-semibold text-emerald-800" : "text-slate-600"}`}>{tab === "instances" ? "Running Instances" : tab}</button>)}
      </div>

      {loading ? <div role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading workflow data…</div> : (
        <>
          {activeTab === "workflows" && <Card title="Workflow definitions" subtitle="Published workflows start automatically when a matching request is submitted.">
            {workflows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No workflows have been saved yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="px-3 py-3">Workflow</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Approval steps</th><th className="px-3 py-3">Executions</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead><tbody>{workflows.map((workflow) => <tr key={workflow.id} className="border-b border-slate-100"><td className="px-3 py-3"><p className="font-medium">{workflow.name}</p><p className="text-xs text-slate-500">{workflow.description}</p></td><td className="px-3 py-3">{workflow.category}</td><td className="px-3 py-3">{workflow.steps.length}</td><td className="px-3 py-3">{workflow.executionCount}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs ${statusStyle(workflow.status)}`}>{workflow.status}</span></td><td className="px-3 py-3"><div className="flex flex-wrap gap-1">{canManage && ["draft", "paused"].includes(workflow.status) && <Button size="sm" variant="ghost" onClick={() => openNewBuilder(workflow)}>Edit</Button>}{canManage && workflow.status === "draft" && <Button size="sm" variant="ghost" onClick={() => { openNewBuilder(workflow); setBuilderStep(4); }}>Configure</Button>}{canManage && workflow.status === "draft" && <Button size="sm" variant="ghost" onClick={() => void saveAsTemplate(workflow)}>Save template</Button>}{canManage && workflow.status === "published" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void updateWorkflowStatus(workflow.id, "paused")}>Pause</Button>}{canManage && workflow.status === "paused" && <Button size="sm" variant="ghost" onClick={() => openNewBuilder(workflow)}>Configure</Button>}{canManage && workflow.status !== "archived" && workflow.status !== "published" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void updateWorkflowStatus(workflow.id, "archived")}>Archive</Button>}</div></td></tr>)}</tbody></table></div>}
          </Card>}
          {activeTab === "instances" && <Card title="Running instances" subtitle="Live requests linked to workflow definitions. Open any instance to inspect its audit history.">
            {instances.filter((instance) => instance.status === "in_progress").length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No workflow instances are currently running.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[740px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="px-3 py-3">Request</th><th className="px-3 py-3">Workflow</th><th className="px-3 py-3">Requester</th><th className="px-3 py-3">Current approver</th><th className="px-3 py-3">Stage</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Started</th><th className="px-3 py-3"></th></tr></thead><tbody>{instances.filter((instance) => instance.status === "in_progress").map((instance) => <tr key={instance.id} className="border-b border-slate-100"><td className="px-3 py-3"><p className="font-medium">{instance.request.caseNumber}</p><p className="text-xs text-slate-500">{instance.request.subject}</p></td><td className="px-3 py-3">{instance.workflow.name}</td><td className="px-3 py-3">{instance.requester.name || "Requester"}</td><td className="px-3 py-3">{instance.currentApprovers.includes(currentUser?.id || "") ? "You" : instance.currentApproverNames.join(", ") || "Assigned approver"}</td><td className="px-3 py-3">{instance.currentStep || "—"}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs ${statusStyle(instance.status)}`}>{instance.status.replaceAll("_", " ")}</span></td><td className="px-3 py-3">{new Date(instance.createdAt).toLocaleDateString()}</td><td className="px-3 py-3"><Button size="sm" variant="outline" disabled={busy} onClick={() => void showInstance(instance)}>Open</Button></td></tr>)}</tbody></table></div>}
          </Card>}
          {activeTab === "templates" && <Card title="Workflow templates" subtitle="Saved templates are reusable configurations, not sample execution records.">
            {templates.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No saved workflow templates yet. Save a draft as a template to reuse it.</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{templates.map((template) => <Card key={template.id} title={template.name} subtitle={template.category}><p className="text-sm text-slate-600">{template.description || "No description"}</p><p className="mt-2 text-xs text-slate-500">{template.steps.length} approval steps · {template.requestTypes.join(", ")}</p>{canManage && <Button className="mt-4" size="sm" icon={faPlus} disabled={busy} onClick={() => void cloneTemplate(template)}>Create workflow</Button>}</Card>)}</div>}
          </Card>}
        </>
      )}
    </div>
  );
};

export default WorkflowAutomationView;
