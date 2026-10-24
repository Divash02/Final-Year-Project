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
  const canCreate = permissions.has("workflow.create");
  const canManage = permissions.has("workflow.manage");

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
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Request could not be submitted.",
      );
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
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Case status could not be updated.",
      );
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={(event) => void createCase(event)}
            className="w-full max-w-lg space-y-4 border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            {draftRestored && (
              <div
                className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 flex items-center justify-between"
              >
                <span>Draft restored from previous session</span>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="text-amber-700 hover:underline"
                >
                  Discard draft
                </button>
              </div>
            )}
            <h2 className="font-semibold">Submit Request</h2>
            <label className="block text-sm">
              Type
              <input
                required
                maxLength={80}
                value={formValues.type}
                onChange={(event) => setFormField("type", event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Subject
              <input
                required
                maxLength={180}
                value={formValues.subject}
                onChange={(event) => setFormField("subject", event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Department
              <input
                value={formValues.department}
                onChange={(event) => setFormField("department", event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Priority
              <select
                value={formValues.priority}
                onChange={(event) => setFormField("priority", event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              >
                {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Description
              <textarea
                value={formValues.description}
                onChange={(event) => setFormField("description", event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelCreate}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white"
              >
                {busy ? "Submitting..." : "Submit"}
              </button>
            </div>
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
