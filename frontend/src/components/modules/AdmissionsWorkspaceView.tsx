import React, { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useToast } from "../../components/ui/ToastContainer";
import { EmptyState } from "../ui/EmptyState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faPlus,
  faUserPlus,
} from "@fortawesome/free-solid-svg-icons";

interface AdmissionApplication {
  id: string;
  applicantName: string;
  email: string;
  phone: string | null;
  programme: string;
  status: string;
  decisionReason: string | null;
  createdAt: string;
}

export const AdmissionsWorkspaceView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [applicantName, setApplicantName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [programme, setProgramme] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const permissions = new Set(currentUser?.permissions || []);
  const canCreate = permissions.has("admissions.application.create");
  const canDecide = permissions.has("admissions.application.decide");

  const loadApplications = async () => {
    const parameters = new URLSearchParams();
    if (query.trim()) parameters.set("q", query.trim());
    if (status) parameters.set("status", status);
    const result = await apiRequest<{ applications: AdmissionApplication[] }>(
      `/admissions/applications?${parameters}`,
    );
    setApplications(result.applications);
  };

  useEffect(() => {
    let active = true;
    apiRequest<{ applications: AdmissionApplication[] }>(
      "/admissions/applications",
    )
      .then((result) => {
        if (active) setApplications(result.applications);
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load applications.",
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
      void loadApplications().catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not refresh applications.",
        ),
      );
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loading, query, status]);

  const visibleApplications = useMemo(() => applications, [applications]);

  const createApplication = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/admissions/applications", {
        method: "POST",
        body: JSON.stringify({ applicantName, email, phone, programme }),
      });
      setApplicantName("");
      setEmail("");
      setPhone("");
      setProgramme("");
      setShowCreate(false);
      await loadApplications();
      setNotice("Application recorded.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Application could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  };

  const decide = async (
    application: AdmissionApplication,
    nextStatus: string,
  ) => {
    const reason = window.prompt(
      `Reason for changing status to ${nextStatus}:`,
    );
    if (!reason || reason.trim().length < 8) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/admissions/applications/${application.id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, reason: reason.trim() }),
      });
      await loadApplications();
      setNotice("Admission decision updated and audited.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Decision could not be saved.",
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
            Administration
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <FontAwesomeIcon icon={faUserPlus} /> Admissions
          </h1>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white"
          >
            <FontAwesomeIcon icon={faPlus} /> Record Application
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

      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-2 rounded border border-slate-300 px-2 py-1.5 text-slate-500">
          <FontAwesomeIcon icon={faMagnifyingGlass} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search applicant or programme"
            className="min-w-56 text-sm text-slate-800 outline-none"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {["SUBMITTED", "VERIFIED", "OFFERED", "REJECTED", "ENROLLED"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Loading admission applications...
        </p>
      ) : visibleApplications.length === 0 ? (
        <EmptyState
          icon={faUserPlus}
          title="No admission applications"
          description="No application records match the selected search and status."
        />
      ) : (
        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Applicant</th>
                <th className="px-3 py-3">Contact</th>
                <th className="px-3 py-3">Programme</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Submitted</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleApplications.map((application) => (
                <tr key={application.id}>
                  <td className="px-3 py-3 font-medium">
                    {application.applicantName}
                  </td>
                  <td className="px-3 py-3">
                    {application.email}
                    <div className="text-xs text-slate-500">
                      {application.phone || "No phone provided"}
                    </div>
                  </td>
                  <td className="px-3 py-3">{application.programme}</td>
                  <td className="px-3 py-3">{application.status}</td>
                  <td className="px-3 py-3">
                    {new Date(application.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3">
                    {canDecide &&
                      application.status !== "REJECTED" &&
                      application.status !== "ENROLLED" && (
                        <select
                          aria-label={`Update ${application.applicantName} application`}
                          disabled={busy}
                          value=""
                          onChange={(event) => {
                            if (event.target.value)
                              void decide(application, event.target.value);
                          }}
                          className="rounded border border-slate-300 px-2 py-1 text-xs"
                        >
                          <option value="" disabled>
                            Change status
                          </option>
                          {["VERIFIED", "OFFERED", "REJECTED", "ENROLLED"].map(
                            (value) => (
                              <option key={value}>{value}</option>
                            ),
                          )}
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
            onSubmit={(event) => void createApplication(event)}
            className="w-full max-w-lg space-y-4 border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex justify-between">
              <h2 className="font-semibold">Record Admission Application</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <label className="block text-sm">
              Applicant name
              <input
                required
                maxLength={180}
                value={applicantName}
                onChange={(event) => setApplicantName(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Email
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Phone
              <input
                maxLength={32}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Programme
              <input
                required
                maxLength={120}
                value={programme}
                onChange={(event) => setProgramme(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Saving..." : "Record Application"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};


