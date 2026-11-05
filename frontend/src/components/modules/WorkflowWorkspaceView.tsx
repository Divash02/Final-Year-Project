import React, { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useToast } from "../../components/ui/ToastContainer";
import { EmptyState } from "../ui/EmptyState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faInbox,
  faMagnifyingGlass,
  faPlus,
  faRotateLeft,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { useFormDraft } from "../../hooks/useFormDraft";
import { UnsavedChangesDialog } from "../../hooks/useUnsavedChanges";

interface CaseRecord {
  id: number;
  type: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  department: string | null;
  requester_user_id: number;
  assigned_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export const WorkflowWorkspaceView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  // Form draft persistence for the create request form
  const initialFormValues = {
    type: "GENERAL",
    subject: "",
    description: "",
    department: "Registrar",
    priority: "NORMAL",
  };
  const isStudent = (currentUser?.role || "").toLowerCase() === "student";
  const {
    values: formValues,
    setField: setFormField,
    setFields: setFormFields,
    reset: resetForm,
    isDirty,
    draftRestored,
    discardDraft,
    clearDraft,
  } = useFormDraft({
    formKey: "student-request",
    initialValues: initialFormValues,
    debounceMs: 1000,
    onDraftCleared: () => {},
  });

  const permissions = new Set(currentUser?.permissions || []);
  const role = (currentUser?.role || "").toLowerCase();
  const isStudentRole = role === "student";
  const canCreate = isStudentRole && (permissions.has("workflow.create") || permissions.has("request.create") || true);
  const canManage = !isStudentRole && (permissions.has("workflow.manage") || role === "admin" || role === "super_admin" || role === "staff" || true);

  const loadCases = async () => {
    const result = await apiRequest<{ cases: CaseRecord[] }>("/cases");
    setCases(result.cases);
  };

  useEffect(() => {
    let active = true;
    apiRequest<{ cases: CaseRecord[] }>("/cases")
      .then((result) => {
        if (active) setCases(result.cases);
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load cases.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleCases = useMemo(
    () =>
      cases.filter((item) =>
        `${item.subject} ${item.type} ${item.department || ""} ${item.status}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [cases, query],
  );

  const createCase = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/cases", {
        method: "POST",
        body: JSON.stringify({
          type: formValues.type,
          subject: formValues.subject,
          description: formValues.description,
          department: formValues.department,
          priority: formValues.priority,
        }),
      });
      setShowCreate(false);
      clearDraft(); // Clear draft after successful submission
      await loadCases();
      setNotice("Request submitted and recorded.");
    } catch (requestError) {
      toast({
        message:
          requestError instanceof Error
            ? requestError.message
            : "Request could not be submitted.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCancelCreate = () => {
    if (isDirty) {
      setLeaveDialogOpen(true);
    } else {
      setShowCreate(false);
      resetForm();
    }
  };

  const confirmLeaveCreate = () => {
    setLeaveDialogOpen(false);
    setShowCreate(false);
    discardDraft(); // Clear draft and reset form
  };

  const cancelLeaveCreate = () => {
    setLeaveDialogOpen(false);
  };

  const updateCase = async (item: CaseRecord, status: string) => {
    const note = window.prompt(`Reason or resolution note for ${status}:`);
    if (!note || note.trim().length < 8) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/cases/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: note.trim() }),
      });
      await loadCases();
      setNotice("Case status updated and audited.");
    } catch (requestError) {
      toast({
        message:
          requestError instanceof Error
            ? requestError.message
            : "Case status could not be updated.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div>
          <p className="cos-eyebrow">
            Services
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <FontAwesomeIcon icon={faInbox} /> Requests &amp; Cases
          </h1>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white"
          >
            <FontAwesomeIcon icon={faPlus} /> Submit Request
          </button>
        )}
      </header>
      {error && (
        <p
          role="alert"
          className="border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      <label className="flex max-w-xl items-center gap-2 rounded border border-slate-300 px-2 py-1.5 text-slate-500">
        <FontAwesomeIcon icon={faMagnifyingGlass} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search requests and cases"
          className="w-full text-sm text-slate-800 outline-none"
        />
      </label>
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Loading cases...
        </p>
      ) : visibleCases.length === 0 ? (
        <EmptyState
          icon={faInbox}
          title="No requests or cases"
          description="No matching case records are available."
        />
      ) : (
        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Case</th>
                <th className="px-3 py-3">Department</th>
                <th className="px-3 py-3">Priority</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Updated</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleCases.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-3">
                    <div className="font-medium">{item.subject}</div>
                    <div className="text-xs text-slate-500">
                      {item.type} · #{item.id}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {item.department || "Unassigned"}
                  </td>
                  <td className="px-3 py-3">{item.priority}</td>
                  <td className="px-3 py-3">{item.status}</td>
                  <td className="px-3 py-3">
                    {new Date(item.updated_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-3">
                    {canManage &&
                      ![
                        "APPROVED",
                        "REJECTED",
                        "COMPLETED",
                        "CANCELLED",
                      ].includes(item.status) && (
                        <select
                          disabled={busy}
                          aria-label={`Update case ${item.id}`}
                          value=""
                          onChange={(event) => {
                            if (event.target.value)
                              void updateCase(item, event.target.value);
                          }}
                          className="rounded border border-slate-300 px-2 py-1 text-xs"
                        >
                          <option value="" disabled>
                            Update status
                          </option>
                          {[
                            "RECEIVED",
                            "ASSIGNED",
                            "UNDER_REVIEW",
                            "MORE_INFORMATION_REQUIRED",
                            "APPROVED",
                            "REJECTED",
                            "ESCALATED",
                            "COMPLETED",
                            "CANCELLED",
                          ].map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-slate-950/60 backdrop-blur-sm p-2 sm:p-4 md:p-6 overflow-x-hidden overflow-y-auto">
          <form
            onSubmit={(event) => void createCase(event)}
            className="w-full max-w-[900px] my-4 sm:my-6 md:my-8 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] md:max-h-[calc(100vh-4rem)] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-request-title"
          >
            {draftRestored && (
              <div className="mx-6 mt-6 mb-0 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 flex items-center justify-between">
                <span>Draft restored from previous session</span>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="text-amber-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
                >
                  Discard draft
                </button>
              </div>
            )}
            <header className="relative px-6 sm:px-8 pt-6 sm:pt-7 pb-5 sm:pb-6">
              <button
                type="button"
                onClick={handleCancelCreate}
                className="absolute right-4 sm:right-6 top-4 sm:top-6 inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 transition-colors"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <div className="pr-12">
                <h2 id="submit-request-title" className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">Submit a Request</h2>
                <p className="mt-1 text-sm text-slate-600">Provide the details below and we'll route your request to the appropriate department.</p>
              </div>
              <div className="mt-5 sm:mt-6 h-px bg-slate-200" />
            </header>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 sm:px-8 py-5 sm:py-6">
              <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-6 lg:gap-8">
                <aside className="rounded-xl bg-slate-50/80 border border-slate-200/70 p-5 h-fit">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-sm">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M3 4.5C3 3.67157 3.67157 3 4.5 3H7.5L9 4.5H13.5C14.3284 4.5 15 5.17157 15 6V13.5C15 14.3284 14.3284 15 13.5 15H4.5C3.67157 15 3 14.3284 3 13.5V4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Submit a Request</p>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">Use this form to request help, documents, corrections, support, or other institutional services.</p>
                    </div>
                  </div>
                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">How it works</p>
                    <ol className="mt-2 space-y-1.5 text-xs text-slate-600">
                      <li>1. Submit your request</li>
                      <li>2. Staff review it</li>
                      <li>3. Request is processed</li>
                      <li>4. You receive an update</li>
                    </ol>
                  </div>
                  <div className="mt-5 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold text-slate-900">Expected Response</p>
                    <p className="mt-1 text-sm font-medium text-slate-700">1–3 business days</p>
                  </div>
                </aside>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-900 mb-1.5">
                      Request Type
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M9.75 2.25H4.5C4.10218 2.25 3.72064 2.40804 3.43934 2.68934C3.15804 2.97064 3 3.35218 3 3.75V14.25C3 14.6478 3.15804 15.0294 3.43934 15.3107C3.72064 15.592 4.10218 15.75 4.5 15.75H13.5C13.8978 15.75 14.2794 15.592 14.5607 15.3107C14.842 15.0294 15 14.6478 15 14.25V7.5L9.75 2.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M9.75 2.25V7.5H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                      <select
                        required
                        value={formValues.type}
                        onChange={(event) => setFormField("type", event.target.value)}
                        className="block w-full rounded-lg border border-slate-300 bg-white pl-10 pr-9 py-2.5 text-sm text-slate-900 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:border-[var(--color-primary)]"
                      >
                        <option value="GENERAL">GENERAL</option>
                        <option value="ACADEMIC">ACADEMIC</option>
                        <option value="FINANCE">FINANCE</option>
                        <option value="DOCUMENT">DOCUMENT</option>
                        <option value="FACILITY">FACILITY</option>
                        <option value="IT">IT</option>
                        <option value="OTHER">OTHER</option>
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 mb-1.5">
                      Subject
                    </label>
                    <input
                      required
                      maxLength={180}
                      value={formValues.subject}
                      onChange={(event) => setFormField("subject", event.target.value)}
                      className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:border-[var(--color-primary)]"
                      placeholder="Briefly describe your request"
                    />
                  </div>
                  {isStudentRole && (
                    <div>
                      <label className="block text-sm font-medium text-slate-900 mb-1.5">
                        Department
                      </label>
                      <select
                        value={formValues.department}
                        onChange={(event) => setFormField("department", event.target.value)}
                        className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:border-[var(--color-primary)]"
                      >
                        <option value="Registrar">Registrar</option>
                        <option value="Academic">Academic</option>
                        <option value="Finance">Finance</option>
                        <option value="Examination">Examination</option>
                        <option value="IT">IT</option>
                        <option value="Student Affairs">Student Affairs</option>
                        <option value="Library">Library</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-900 mb-1.5">
                      Priority
                    </label>
                    <select
                      value={formValues.priority}
                      onChange={(event) => setFormField("priority", event.target.value)}
                      className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:border-[var(--color-primary)]"
                    >
                      {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-slate-900">
                        Description
                      </label>
                      <span className="text-xs text-slate-500">{(formValues.description || "").length} / 2000</span>
                    </div>
                    <textarea
                      maxLength={2000}
                      value={formValues.description}
                      onChange={(event) => setFormField("description", event.target.value)}
                      className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:border-[var(--color-primary)] resize-y min-h-[140px]"
                      placeholder="Provide the details needed to process your request..."
                    />
                  </div>
                </div>
              </div>
            </div>
            <footer className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 sm:px-8 py-4 sm:py-5 border-t border-slate-200 bg-slate-50/50">
              <p className="text-xs text-slate-500">All fields marked are required.</p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelCreate}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 transition-colors"
                >
                  {busy ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Submitting...
                    </>
                  ) : (
                    "Submit Request"
                  )}
                </button>
              </div>
            </footer>
          </form>
        </div>
      )}
      {leaveDialogOpen && (
        <UnsavedChangesDialog
          isOpen={leaveDialogOpen}
          onConfirm={confirmLeaveCreate}
          onCancel={cancelLeaveCreate}
          message="You have unsaved changes in this request form. Are you sure you want to discard them?"
        />
      )}
    </section>
  );
};
