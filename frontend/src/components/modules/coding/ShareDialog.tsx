import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShareNodes,
  faLink,
  faEye,
  faCopy,
  faTrash,
  faClock,
  faUserGraduate,
  faBookOpen,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { apiRequest } from "../../../services/apiClient";
import type {
  CodingProject,
  CodingShare,
  LabCourse,
  SharePermission,
  ShareType,
} from "./codingTypes";
import {
  createShare,
  fetchShares,
  revokeShare,
} from "./codingApi";

interface EnrolledStudent {
  id: string;
  userId: string;
  studentId: string;
  name: string;
  program: string | null;
  sectionCode: string | null;
}

export interface ShareDialogProps {
  project: CodingProject | null;
  courses: LabCourse[];
  toast: (message: string, tone?: "success" | "error") => void;
  onChanged: () => void;
}

/**
 * Teacher sharing dialog. Shares are scoped to the
 * teacher's authorised courses and sections; the backend
 * re-validates every target against teaching assignments.
 */
export const ShareDialog: React.FC<ShareDialogProps> = ({
  project,
  courses,
  toast,
  onChanged,
}) => {
  const [shareType, setShareType] = useState<ShareType>("COURSE");
  const [courseId, setCourseId] = useState("");
  const [sectionCode, setSectionCode] = useState("");
  const [permission, setPermission] = useState<SharePermission>("VIEW");
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [shares, setShares] = useState<CodingShare[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectId = project?.id || null;

  useEffect(() => {
    setShares([]);
    setError(null);
    if (!projectId) return;
    fetchShares(projectId)
      .then((result) => setShares(result.shares))
      .catch(() => setShares([]));
  }, [projectId]);

  // Enrolled students of the chosen course, loaded from the
  // teacher's own teaching scope.
  useEffect(() => {
    setStudents([]);
    setSelectedStudents([]);
    if (!courseId) return;
    apiRequest<{ students: EnrolledStudent[] }>(
      `/coding/courses/${courseId}/students`,
    )
      .then((result) => setStudents(result.students || []))
      .catch(() => setStudents([]));
  }, [courseId]);

  const course = useMemo(
    () => courses.find((entry) => entry.courseId === courseId) || null,
    [courses, courseId],
  );

  const sections = useMemo(() => {
    if (!courseId) return [];
    const list = [
      ...new Set(
        students
          .filter((student) => student.sectionCode)
          .map((student) => student.sectionCode || ""),
      ),
    ];
    return list.sort();
  }, [courseId, students]);

  const share = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      await createShare(projectId, {
        shareType,
        courseId: courseId || undefined,
        sectionCode: shareType === "SECTION" ? sectionCode || undefined : undefined,
        permission,
        expiresInDays: expiresInDays === "" ? undefined : Number(expiresInDays),
        studentIds:
          shareType === "STUDENTS" ? selectedStudents : undefined,
      });
      const result = await fetchShares(projectId);
      setShares(result.shares);
      setSelectedStudents([]);
      toast("Project shared with students.", "success");
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sharing failed.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (share: CodingShare) => {
    if (!projectId) return;
    setBusy(true);
    try {
      await revokeShare(share.id);
      setShares((previous) =>
        previous.map((entry) =>
          entry.id === share.id
            ? { ...entry, revokedAt: new Date().toISOString() }
            : entry,
        ),
      );
      toast("Sharing revoked.", "success");
      onChanged();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not revoke sharing.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const shareLink = projectId
    ? `${window.location.origin}/student/coding-lab/projects/${projectId}`
    : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      toast("Share link copied. Students sign in to open it.", "success");
    } catch {
      toast("Copy failed — select the link manually.", "error");
    }
  };

  return (
    <Modal
      isOpen={project !== null}
      onClose={onChanged}
      title={`Share “${project?.title || ""}”`}
      subtitle="Students sign in and open the project from their Coding Lab. Sharing never bypasses authentication."
      maxWidth="lg"
    >
      <div className="space-y-5">
        {/* Mode */}
        <fieldset>
          <legend className="cos-label">Sharing mode</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-3">
            <label
              className={`cursor-pointer rounded-lg border p-3 ${
                permission === "VIEW"
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="sharePermission"
                className="sr-only"
                checked={permission === "VIEW"}
                onChange={() => setPermission("VIEW")}
              />
              <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <FontAwesomeIcon icon={faEye} className="text-emerald-600" aria-hidden="true" />
                View only
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Students inspect the code but cannot change the original.
              </span>
            </label>
            <label
              className={`cursor-pointer rounded-lg border p-3 ${
                permission === "COPY"
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="sharePermission"
                className="sr-only"
                checked={permission === "COPY"}
                onChange={() => setPermission("COPY")}
              />
              <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <FontAwesomeIcon icon={faCopy} className="text-emerald-600" aria-hidden="true" />
                Open as copy
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Students duplicate the project into their own workspace.
              </span>
            </label>
          </div>
          <p className="cos-helper">
            Students keep their own copies even if you update the
            original starter project.
          </p>
        </fieldset>

        {/* Audience */}
        <fieldset>
          <legend className="cos-label">Audience</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Share with">
            {([
              { value: "COURSE", label: "Whole course", icon: faBookOpen },
              { value: "SECTION", label: "Section", icon: faUserGraduate },
              { value: "STUDENTS", label: "Selected students", icon: faShareNodes },
            ] as const).map(({ value, label, icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={shareType === value}
                onClick={() => setShareType(value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  shareType === value
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <FontAwesomeIcon icon={icon} className="text-[10px]" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="cos-label">Course</span>
              <select
                className="cos-input mt-1 cursor-pointer pr-9"
                value={courseId}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setSectionCode("");
                  setSelectedStudents([]);
                }}
              >
                <option value="">Choose a course…</option>
                {courses.map((entry) => (
                  <option key={entry.courseId} value={entry.courseId}>
                    {entry.code} — {entry.name}
                  </option>
                ))}
              </select>
            </label>

            {shareType === "SECTION" && (
              <label className="block">
                <span className="cos-label">Section</span>
                <select
                  className="cos-input mt-1 cursor-pointer pr-9"
                  value={sectionCode}
                  onChange={(event) => setSectionCode(event.target.value)}
                >
                  <option value="">All sections</option>
                  {sections.map((section) => (
                    <option key={section} value={section}>
                      Section {section}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {shareType !== "STUDENTS" && (
              <label className="block">
                <span className="cos-label">Link expiry (days, optional)</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="cos-input mt-1"
                  placeholder="No expiry"
                  value={expiresInDays}
                  onChange={(event) =>
                    setExpiresInDays(
                      event.target.value === ""
                        ? ""
                        : Number(event.target.value),
                    )
                  }
                />
              </label>
            )}
          </div>

          {shareType === "STUDENTS" && (
            <div className="mt-3">
              <span className="cos-label">Students in {course?.code || "the course"}</span>
              {students.length === 0 ? (
                <p className="cos-helper">
                  No enrolled students found for this course. Select a
                  course first.
                </p>
              ) : (
                <ul className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
                  {students.map((student) => (
                    <li key={student.userId}>
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600"
                          checked={selectedStudents.includes(student.userId)}
                          onChange={(event) => {
                            setSelectedStudents((previous) =>
                              event.target.checked
                                ? [...previous, student.userId]
                                : previous.filter((id) => id !== student.userId),
                            );
                          }}
                        />
                        <span className="font-medium">{student.name}</span>
                        <span className="text-slate-400">
                          {student.studentId}
                          {student.sectionCode ? ` · ${student.sectionCode}` : ""}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        {/* Active shares */}
        {shares.length > 0 && (
          <div>
            <span className="cos-label">Active shares</span>
            <ul className="mt-1.5 space-y-1.5">
              {shares.map((share) => (
                <li
                  key={share.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 text-slate-700">
                    <strong>
                      {share.shareType === "COURSE"
                        ? "Whole course"
                        : share.shareType === "SECTION"
                          ? `Section ${share.sectionCode || "all"}`
                          : `${share.studentIds.length} student${share.studentIds.length === 1 ? "" : "s"}`}
                    </strong>
                    <span className="ml-2 text-slate-400">
                      {share.permission === "COPY" ? "open as copy" : "view only"}
                    </span>
                    {share.expiresAt && (
                      <span className="ml-2 inline-flex items-center gap-1 text-slate-400">
                        <FontAwesomeIcon icon={faClock} className="text-[9px]" aria-hidden="true" />
                        expires{" "}
                        {new Date(share.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                    {share.revokedAt && (
                      <span className="ml-2 font-medium text-red-500">
                        revoked
                      </span>
                    )}
                  </span>
                  {!share.revokedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={faTrash}
                      aria-label="Revoke share"
                      onClick={() => void revoke(share)}
                      disabled={busy}
                      className="text-slate-400 hover:text-red-600"
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Share link */}
        {projectId && (
          <div className="rounded-lg bg-slate-50 p-3">
            <span className="cos-label">Share link</span>
            <p className="cos-helper">
              The link opens the signed-in student's Coding Lab — it
              never grants access by itself.
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600">
                {shareLink}
              </code>
              <Button variant="secondary" size="sm" icon={faLink} onClick={() => void copyLink()}>
                Copy
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2.5 border-t border-slate-200 bg-slate-50 px-6 py-4 -mx-6 -mb-5">
        <Button variant="secondary" onClick={onChanged}>
          Done
        </Button>
        <Button
          variant="primary"
          icon={faShareNodes}
          isLoading={busy}
          onClick={() => void share()}
          disabled={!courseId || (shareType === "STUDENTS" && selectedStudents.length === 0)}
        >
          Share project
        </Button>
      </div>
    </Modal>
  );
};

export default ShareDialog;
