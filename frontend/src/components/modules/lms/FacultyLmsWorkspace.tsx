import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  faArrowRotateRight,
  faBookOpen,
  faBullhorn,
  faChartLine,
  faClipboardList,
  faFolderOpen,
  faFilePen,
  faGraduationCap,
  faListCheck,
  faPaperPlane,
  faPlus,
  faThumbtack,
  faTriangleExclamation,
  faUpload,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { EmptyState } from "../../ui/EmptyState";
import { Modal } from "../../ui/Modal";
import { CardSkeleton } from "../../ui/Skeleton";
import { QuizGradingPanel } from "./QuizGradingPanel";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import {
  addQuizQuestion,
  addWeekObjectives,
  createAnnouncement,
  createCourseAssignment,
  createQuiz,
  createWeek,
  duplicateQuiz as apiDuplicateQuiz,
  fetchAnnouncements,
  fetchAttemptRoster,
  fetchCourseAssignments,
  fetchCourseOverview,
  fetchCourseProgress,
  fetchCourseQuizzes,
  fetchCourseWeeks,
  fetchEngagement,
  fetchMaterialTeachingProgress,
  fetchMyClassSessions,
  fetchQuiz,
  fetchRiskSignals,
  fetchWeek,
  fetchCourseTeachingHistory,
  recordTeachingProgress,
  formatDeadline,
  formatMark,
  formatPercentage,
  isTeacherQuizDetail,
  publishWeek,
  releaseQuizResults,
  removeObjective,
  scheduleWeek,
  setMaterialStatus,
  setQuizStatus,
  updateMaterial,
  uploadWeekMaterial,
} from "../../../services/lmsApi";
import type {
  LmsAnnouncement,
  LmsClassSession,
  LmsCourseAssignment,
  LmsCourseOverview,
  LmsCourseTeachingHistory,
  LmsEngagement,
  LmsMaterial,
  LmsMaterialTeachingProgress,
  LmsMaterialType,
  LmsProgressResponse,
  LmsQuestionDraft,
  LmsQuizDetail,
  LmsQuizForTeacher,
  LmsQuizList,
  LmsRiskSignals,
  LmsTeachingUnitLabel,
  LmsWeek,
  LmsWeekDetail,
  LmsWeekTeachingPosition,
} from "../../../types/lms";

type FacultyTab =
  | "planner"
  | "materials"
  | "assignments"
  | "announcements"
  | "analytics";

const TABS: { id: FacultyTab; label: string; icon: typeof faBookOpen }[] = [
  { id: "planner", label: "Planner", icon: faBookOpen },
  { id: "materials", label: "Materials", icon: faFolderOpen },
  { id: "announcements", label: "Announcements", icon: faBullhorn },
  { id: "analytics", label: "Analytics", icon: faChartLine },
];

/**
 * What the server decided this caller may do to this course.
 *
 * Every tab reads its authority from here rather than from the caller's job title
 * or a role check of its own. `canManage` is the server's course-scope answer —
 * "you teach it, or you administer the curriculum" — and `sections` is the set
 * of cohorts the caller may address. Both are the same values the API enforces,
 * so a control shown here is one the server will actually honour.
 */
interface CourseAccess {
  canManage: boolean;
  role: string;
  sections: string[];
  semester: number | null;
}

/**
 * The faculty LMS workspace.
 *
 * This is the teacher's side of one course: the week spine, what hangs off each
 * week, and the read models that make the plan usable. It never decides an
 * academic rule — every availability, deadline, pass mark and release decision
 * in this view was computed by the server against its clock, and the view renders
 * those answers verbatim.
 *
 * Authorisation is loaded once, with the course, and handed to every tab. That is
 * deliberate: a tab cannot be opened on an optimistic guess and then fail, and
 * there is no second place where a permission is decided.
 */
export const FacultyLmsWorkspace: React.FC<{
  courseId: string;
  onCourseChange?: (courseId: string) => void;
}> = ({ courseId, onCourseChange }) => {
  const { currentUser } = useCollegeOS();
  const [tab, setTab] = useState<FacultyTab>("planner");
  const [overview, setOverview] = useState<LmsCourseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchCourseOverview(courseId);
      setOverview(result);
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "This course workspace could not be opened.",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The tabs still render while the overview reloads, so the header can update in
   * place instead of the whole workspace disappearing. A tab with no scope yet
   * simply has nothing it is allowed to offer.
   */
  const access: CourseAccess = {
    canManage: overview?.access.canManage ?? false,
    role: overview?.access.role ?? "none",
    sections: overview?.scope.sectionCodes ?? [],
    semester: overview?.scope.semester ?? null,
  };

   /**
    * A capability the account holds institution-wide, independent of this course.
    *
    * Read from the session because it is a coarse RBAC grant; the object-level
    * half — *which* course, *which* section — is `access` above. Both must hold
    * before an authoring control appears, and both are re-checked by the server.
    */
   const holds = useCallback(
     (permission: string) => Boolean(currentUser?.permissions?.includes(permission)),
     [currentUser],
   );
   const canViewLms = holds("lms.view");
   const canManageLms = holds("lms.quiz.manage");

  if (error && !overview) {
    return (
      <section className="cos-page">
        <header className="cos-page-header">
          <div className="min-w-0">
            <p className="cos-eyebrow">Faculty LMS</p>
            <h1 className="cos-page-title">Course workspace</h1>
          </div>
        </header>
        <EmptyState
          icon={faTriangleExclamation}
          title="This course could not be opened"
          description={`${error} Nothing has been substituted for it — retry once the connection is restored.`}
          actionLabel="Retry"
          actionIcon={faArrowRotateRight}
          onAction={() => void load()}
        />
      </section>
    );
  }

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div className="min-w-0">
          <p className="cos-eyebrow">Faculty LMS</p>
          <h1 className="cos-page-title truncate">
            {overview ? `${overview.course.code} · ${overview.course.name}` : "Loading course…"}
          </h1>
          {overview && (
            <p className="cos-page-subtitle">
              {overview.scope.sectionCodes.length
                ? `Sections ${overview.scope.sectionCodes.join(", ")}`
                : "All sections"}
              {" · "}
              {overview.publishedWeekCount} of {overview.weekCount} weeks published
              {" · "}
              {overview.draftWeekCount} in draft
            </p>
          )}
        </div>
        {onCourseChange && (
          <Button variant="secondary" onClick={() => onCourseChange(courseId)}>
            Change course
          </Button>
        )}
      </header>

      {error && (
        <Alert variant="warning" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {/*
        A viewer who is not on the teaching team is not an error, so it is stated
        plainly rather than dressed up as one. The read-only tabs still work.
      */}
      {overview && !access.canManage && (
        <Alert variant="info" detail={`Course scope: ${access.role}`}>
          You are not on the teaching team for this course, so planning and authoring
          are read-only here.
        </Alert>
      )}

      {notice && (
        <Alert variant="success" onDismiss={() => setNotice("")}>
          {notice}
        </Alert>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="LMS sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? "page" : undefined}
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium ${
              tab === entry.id
                ? "border-[var(--color-primary)] text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <FontAwesomeIcon icon={entry.icon} className="h-4 w-4" aria-hidden="true" />
            {entry.label}
          </button>
        ))}
      </nav>

      {loading && !overview ? (
        <div className="space-y-4" aria-busy="true">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <>
          {tab === "planner" && (
            <PlannerTab
              courseId={courseId}
              access={access}
              onNotice={setNotice}
              onError={setError}
            />
          )}
          {tab === "materials" && (
            <MaterialsTab
              courseId={courseId}
              access={access}
              onNotice={setNotice}
              onError={setError}
            />
          )}
        {tab === "assignments" && (
            <AssignmentsTab
              courseId={courseId}
              access={access}
              holds={holds}
              onNotice={setNotice}
              onError={setError}
            />
          )}
          {tab === "announcements" && (
            <AnnouncementsTab
              courseId={courseId}
              access={access}
              onNotice={setNotice}
              onError={setError}
            />
          )}
          {tab === "analytics" && (
            <AnalyticsTab courseId={courseId} onError={setError} />
          )}
        </>
      )}
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Planner                                                             */
/* ------------------------------------------------------------------ */

const PlannerTab: React.FC<{
  courseId: string;
  access: CourseAccess;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ courseId, access, onNotice, onError }) => {
  const [weeks, setWeeks] = useState<LmsWeek[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LmsWeekDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const loadWeeks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchCourseWeeks(courseId);
      setWeeks(result.weeks);
      setLoadFailed(false);
      setSelectedId((current) =>
        current && result.weeks.some((week) => week.id === current)
          ? current
          : (result.weeks[0]?.id ?? null),
      );
    } catch (requestError) {
      // A failed load is reported as a failure, never as an empty course plan —
      // "no weeks" and "could not load" are different facts for a teacher.
      setLoadFailed(true);
      onError(
        requestError instanceof Error ? requestError.message : "The course plan could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, onError]);

  useEffect(() => {
    void loadWeeks();
  }, [loadWeeks]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetail(null);
    fetchWeek(selectedId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((requestError: unknown) => {
        if (active) {
          onError(
            requestError instanceof Error ? requestError.message : "This week could not be opened.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [selectedId, onError]);

  const refresh = async () => {
    await loadWeeks();
    if (selectedId) {
      try {
        setDetail(await fetchWeek(selectedId));
      } catch {
        setDetail(null);
      }
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <Card
        title="Course plan"
        icon={faBookOpen}
        headerAction={
          access.canManage ? (
            <Button size="sm" icon={faPlus} onClick={() => setShowCreate(true)}>
              Week
            </Button>
          ) : undefined
        }
      >
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((row) => (
              <CardSkeleton key={row} />
            ))}
          </div>
        ) : loadFailed ? (
          <EmptyState
            icon={faTriangleExclamation}
            title="The plan could not be loaded"
            description="The server did not return the course plan. Nothing has been shown in its place."
            actionLabel="Retry"
            actionIcon={faArrowRotateRight}
            onAction={() => void loadWeeks()}
          />
        ) : weeks.length === 0 ? (
          <EmptyState
            icon={faBookOpen}
            title="No weeks yet"
            description={
              access.canManage
                ? "Add the first week to start building the course plan."
                : "The teaching team has not published a course plan yet."
            }
            actionLabel={access.canManage ? "Add a week" : undefined}
            onAction={access.canManage ? () => setShowCreate(true) : undefined}
          />
        ) : (
          <ol className="space-y-1.5">
            {weeks.map((week) => (
              <li key={week.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(week.id)}
                  aria-current={selectedId === week.id ? "true" : undefined}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    selectedId === week.id
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Week {week.weekNumber}
                    </span>
                    <WeekStateBadge state={week.state} />
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
                    {week.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {week.materialCount ?? 0} material(s) · {week.assignmentCount ?? 0}{" "}
                    assignment(s) · {week.quizCount ?? 0} quiz(es)
                    {week.nextDeadline
                      ? ` · ${week.nextDeadline.kind.toLowerCase()} ${formatDeadline(week.nextDeadline.at)}`
                      : ""}
                  </p>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="space-y-4">
        {detail ? (
          <WeekDetail
            detail={detail}
            access={access}
            onRefresh={refresh}
            onNotice={onNotice}
            onError={onError}
          />
        ) : loading || loadFailed ? (
          <CardSkeleton />
        ) : (
          <Card>
            <EmptyState
              icon={faBookOpen}
              title="Select a week"
              description="Choose a week from the course plan to see its objectives, materials, assessments and announcements."
            />
          </Card>
        )}
      </div>

      <CreateWeekModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={async (title) => {
          setShowCreate(false);
          await loadWeeks();
          onNotice(`Week "${title}" created as a draft. Publish it when you are ready.`);
        }}
        onError={onError}
        createWeek={createWeek}
        courseId={courseId}
      />
    </div>
  );
};

const WeekStateBadge: React.FC<{ state: LmsWeek["state"] }> = ({ state }) => {
  if (state === "PUBLISHED") return <Badge variant="success">Published</Badge>;
  if (state === "SCHEDULED") return <Badge variant="info">Scheduled</Badge>;
  if (state === "ARCHIVED") return <Badge variant="neutral">Archived</Badge>;
  return <Badge variant="warning">Draft</Badge>;
};

const WeekDetail: React.FC<{
  detail: LmsWeekDetail;
  access: CourseAccess;
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ detail, access, onRefresh, onNotice, onError }) => {
  const { week } = detail;
  const [busy, setBusy] = useState(false);
  const [objectiveText, setObjectiveText] = useState("");
  const canManage = access.canManage;

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      await onRefresh();
      onNotice(success);
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card
        title={`Week ${week.weekNumber}: ${week.title}`}
        icon={faBookOpen}
        subtitle={week.expectedOutcome || week.teachingPlan || undefined}
        headerAction={
          <div className="flex flex-wrap items-center gap-2">
            <WeekStateBadge state={week.state} />
            {canManage && week.status !== "ARCHIVED" && (
              <>
                {week.state === "DRAFT" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={faPaperPlane}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => publishWeek(week.id),
                        `Week ${week.weekNumber} published to students.`,
                      )
                    }
                  >
                    Publish
                  </Button>
                )}
                {(week.state === "DRAFT" || week.state === "SCHEDULED") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      const when = window.prompt(
                        "Release this week at (ISO date and time). Leave blank to publish now.",
                        new Date(Date.now() + 86400000).toISOString(),
                      );
                      if (when === null) return;
                      void run(
                        () => scheduleWeek(week.id, when || new Date().toISOString()),
                        when
                          ? `Week ${week.weekNumber} scheduled for ${new Date(when).toLocaleString()}.`
                          : `Week ${week.weekNumber} published.`,
                      );
                    }}
                  >
                    Schedule
                  </Button>
                )}
              </>
            )}
          </div>
        }
      >
        {week.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
            {week.description}
          </p>
        ) : (
          <p className="text-sm text-slate-500">No description recorded for this week.</p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Fact label="Study time" value={week.studyTimeMinutes ? `${week.studyTimeMinutes} min` : "—"} />
          <Fact label="Objectives" value={String(week.objectives.length)} />
          <Fact label="Quiz marks" value={String(week.totalQuizMarks ?? 0)} />
          <Fact label="Release" value={week.releaseAt ? new Date(week.releaseAt).toLocaleString() : "Immediate"} />
        </dl>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Learning objectives" icon={faListCheck}>
          {week.objectives.length === 0 ? (
            <p className="text-sm text-slate-500">No objectives recorded for this week.</p>
          ) : (
            <ul className="space-y-2">
              {week.objectives.map((objective) => (
                <li key={objective.id} className="flex items-start justify-between gap-3">
                  <span className="text-sm text-slate-700">
                    {objective.code ? (
                      <span className="mr-1.5 font-mono text-xs text-slate-500">
                        {objective.code}
                      </span>
                    ) : null}
                    {objective.text}
                    {objective.cognitiveLevel && (
                      <span className="ml-2 text-xs text-slate-400">
                        {objective.cognitiveLevel.toLowerCase()}
                      </span>
                    )}
                  </span>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => removeObjective(objective.id),
                          "Objective removed.",
                        )
                      }
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <div className="mt-4 flex gap-2">
              <input
                value={objectiveText}
                onChange={(event) => setObjectiveText(event.target.value)}
                maxLength={180}
                placeholder="What should students learn this week?"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <Button
                icon={faPlus}
                disabled={busy || objectiveText.trim().length < 3}
                onClick={() => {
                  const text = objectiveText.trim();
                  void run(
                    () => addWeekObjectives(week.id, [text]),
                    "Objective added.",
                  ).then(() => setObjectiveText(""));
                }}
              >
                Add
              </Button>
            </div>
          )}
        </Card>

        <Card title="Assessments in this week" icon={faClipboardList}>
          {week.quizzes.length === 0 && week.assignments.length === 0 ? (
            <p className="text-sm text-slate-500">
              No assessments are attached to this week yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {week.quizzes.map((quiz) => (
                <li key={quiz.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    {quiz.title}
                  </span>
                  <Badge variant={availabilityVariant(quiz.availability)}>
                    {quiz.availability.toLowerCase()}
                  </Badge>
                </li>
              ))}
              {week.assignments.map((assignment) => (
                <li key={assignment.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    {assignment.title}
                  </span>
                  <Badge variant={assignment.isPastDue ? "danger" : "neutral"}>
                    due {formatDeadline(assignment.dueAt)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {canManage && week.teachingProgress && week.teachingProgress.length > 0 && (
        <Card
          title="Where the teaching stopped"
          icon={faGraduationCap}
          subtitle="The last position you declared for each material in this week. Recording a session in Materials is what changes this."
        >
          <ul className="space-y-2.5">
            {week.teachingProgress.map((position) => {
              const summary = describeTeachingPosition(
                position,
                position.unitLabel,
                position.totalUnits,
              );
              return (
                <li key={position.materialId} className="border-l-2 border-slate-200 pl-3">
                  <p className="text-sm font-medium text-slate-900">
                    {position.materialTitle || "Untitled material"}
                    <span className="ml-1.5 text-xs font-normal text-slate-400">
                      v{position.materialVersion}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">{summary.taught}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{summary.next}</p>
                  {position.sessionName || position.sectionCode ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[position.sessionName, position.sectionCode && `section ${position.sectionCode}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {week.announcements.length > 0 && (
        <Card title="Week announcements" icon={faBullhorn}>
          <ul className="space-y-3">
            {week.announcements.map((announcement) => (
              <li key={announcement.id} className="border-l-2 border-slate-200 pl-3">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  {announcement.pinned && (
                    <FontAwesomeIcon
                      icon={faThumbtack}
                      className="text-xs text-[var(--color-primary)]"
                      aria-label="Pinned"
                    />
                  )}
                  {announcement.title}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">
                  {announcement.body}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
};

const Fact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
  </div>
);

const CreateWeekModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreated: (title: string) => Promise<void>;
  onError: (message: string) => void;
  createWeek: typeof import("../../../services/lmsApi").createWeek;
  courseId: string;
}> = ({ isOpen, onClose, onCreated, onError, createWeek: create, courseId }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [releaseAt, setReleaseAt] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await create(courseId, {
        title,
        description: description || undefined,
        releaseAt: releaseAt ? new Date(releaseAt).toISOString() : undefined,
      });
      setTitle("");
      setDescription("");
      setReleaseAt("");
      await onCreated(title);
    } catch (requestError) {
      onError(
        requestError instanceof Error ? requestError.message : "The week could not be created.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add a week"
      subtitle="Weeks are created as drafts. Publish or schedule one when you are ready."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="lms-week-form" isLoading={saving} loadingLabel="Creating">
            Create week
          </Button>
        </>
      }
    >
      <form id="lms-week-form" onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          Week title
          <input
            required
            maxLength={180}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Description
          <textarea
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Release at (optional)
          <input
            type="datetime-local"
            value={releaseAt}
            onChange={(event) => setReleaseAt(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </form>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * The document formats the faculty workspace accepts.
 *
 * These are the teaching document families — slides and lecture notes — and the
 * list is deliberately short rather than "everything the server permits". A deck
 * and a handout are countable documents, which is what makes a teaching position
 * meaningful; a video or a zip has no unit to mark against. Other kinds still
 * belong to the Learning Materials module.
 *
 * The server accepts a wider set and verifies every file against its real content
 * family (`FILE_POLICIES.learning_material`), so this list is a narrower promise
 * rather than the security boundary — renaming an executable to `.ppt` is still
 * refused on upload.
 */
const MATERIAL_UPLOAD_EXTENSIONS = ["pdf", "ppt", "pptx", "doc", "docx"] as const;

/** How each accepted format is filed, and what one countable unit is called in it. */
const MATERIAL_FORMAT_BY_EXTENSION: Record<
  (typeof MATERIAL_UPLOAD_EXTENSIONS)[number],
  { materialType: LmsMaterialType; unitLabel: "page" | "slide" | "section"; label: string }
> = {
  pdf: { materialType: "DOCUMENT", unitLabel: "page", label: "PDF" },
  ppt: { materialType: "SLIDES", unitLabel: "slide", label: "PowerPoint (PPT)" },
  pptx: { materialType: "SLIDES", unitLabel: "slide", label: "PowerPoint (PPTX)" },
  doc: { materialType: "DOCUMENT", unitLabel: "page", label: "Word (DOC)" },
  docx: { materialType: "DOCUMENT", unitLabel: "page", label: "Word (DOCX)" },
};

function describeMaterialFormat(fileName: string | null | undefined) {
  const extension = String(fileName || "").split(".").pop()?.toLowerCase() || "";
  return MATERIAL_FORMAT_BY_EXTENSION[
    extension as (typeof MATERIAL_UPLOAD_EXTENSIONS)[number]
  ];
}

/**
 * A material's teaching position, in the words a teacher would use.
 *
 * "Last taught: Slides 1–12 · Next: continue from Slide 13" — the range that was
 * actually covered, and the place to resume. Both come from the teacher's own
 * declarations; neither is inferred from the file having been opened.
 */
function describeTeachingPosition(
  position: LmsWeekTeachingPosition | null | undefined,
  unitLabel: LmsTeachingUnitLabel,
  totalUnits: number | null,
) {
  const unit = unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1);
  if (!position) {
    return {
      taught: "Not recorded yet",
      next:
        totalUnits && totalUnits > 0
          ? `Start at ${unit} 1`
          : "Record a session to set where to resume",
      percentage: null as number | null,
    };
  }
  const covered =
    position.fromUnit === position.toUnit
      ? `${unit} ${position.fromUnit}`
      : `${unit}s ${position.fromUnit}–${position.toUnit}`;
  return {
    taught: `Taught through ${covered}`,
    next: position.nextStartUnit
      ? `Continue from ${unit} ${position.nextStartUnit}`
      : totalUnits && position.toUnit >= totalUnits
        ? "Reached the end of the document"
        : "Set the next starting point",
    percentage:
      totalUnits && totalUnits > 0
        ? Math.min(100, Math.round((position.toUnit / totalUnits) * 1000) / 10)
        : null,
  };
}

/**
 * Materials for the course, organised by academic week.
 *
 * Each week is its own group with its own materials and its own upload, because
 * that is how a deck is actually used: Week 3's slides are taught in Week 3, and a
 * teacher looking for "where did I stop" wants the position next to the week it
 * belongs to.
 */
const MaterialsTab: React.FC<{
  courseId: string;
  access: CourseAccess;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ courseId, access, onNotice, onError }) => {
  const [weeks, setWeeks] = useState<LmsWeek[]>([]);
  const [details, setDetails] = useState<Record<string, LmsWeekDetail>>({});
  const [sessions, setSessions] = useState<LmsClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [uploadWeekId, setUploadWeekId] = useState<string | null>(null);
  const [recordFor, setRecordFor] = useState<{
    material: LmsMaterial;
    position: LmsWeekTeachingPosition | null;
    unitLabel: LmsTeachingUnitLabel;
    totalUnits: number | null;
  } | null>(null);
  const [history, setHistory] = useState<LmsCourseTeachingHistory | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const result = await fetchCourseTeachingHistory(courseId, { limit: 40 });
      setHistory(result);
      setHistoryFailed(false);
    } catch {
      // Reported in its own card; the materials list above is unaffected.
      setHistoryFailed(true);
    }
  }, [courseId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const weekList = await fetchCourseWeeks(courseId);
      setWeeks(weekList.weeks);
      setLoadFailed(false);

      // Only weeks that hold something need their detail fetched; an empty week has
      // no materials to show and nothing to teach progress against.
      const populated = weekList.weeks.filter((week) => (week.materialCount ?? 0) > 0);
      const loaded = await Promise.allSettled(populated.map((week) => fetchWeek(week.id)));
      const pairs: Record<string, LmsWeekDetail> = {};
      loaded.forEach((result, index) => {
        if (result.status === "fulfilled") pairs[populated[index].id] = result.value;
      });
      setDetails(pairs);

      // Weeks that could not be read are reported once, here, rather than appearing
      // as a silent gap in the middle of the list.
      const failures = loaded.filter((result) => result.status === "rejected").length;
      if (failures) {
        onError(
          failures === loaded.length && loaded.length > 0
            ? "This course's weeks could not be loaded. Nothing has been shown in their place."
            : `${failures} of ${loaded.length} weeks could not be loaded; the rest are shown below.`,
        );
      }
    } catch (requestError) {
      setLoadFailed(true);
      onError(
        requestError instanceof Error ? requestError.message : "Materials could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  // Class sessions and the course-wide history are supporting context: neither
  // blocks the materials list, and each reports its own failure.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await fetchMyClassSessions(courseId);
        if (active) setSessions(result.timetable);
      } catch {
        if (active) setSessions([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (loadFailed && !weeks.length) {
    return (
      <EmptyState
        icon={faTriangleExclamation}
        title="Materials could not be loaded"
        description="The server did not return this course's weeks. Nothing has been shown in its place."
        actionLabel="Retry"
        actionIcon={faArrowRotateRight}
        onAction={() => void load()}
      />
    );
  }

  if (!weeks.length) {
    return (
      <EmptyState
        icon={faFolderOpen}
        title="No weeks to attach materials to"
        description="Materials belong to a week of the course plan. Create the first week in the planner, then upload the deck or notes for it here."
      />
    );
  }

  const weeksWithMaterials = weeks.filter((week) => (week.materialCount ?? 0) > 0);

  return (
    <div className="space-y-4">
      {access.canManage && weeks.length > 0 && (
        <Card
          title="Upload a teaching document"
          icon={faUpload}
          subtitle="Accepted formats: PDF, PPT, PPTX, DOC, DOCX. Each file is checked against its real content before it is stored."
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-56 flex-1 text-sm">
              Week
              <select
                value={uploadWeekId || weeks[0].id}
                onChange={(event) => setUploadWeekId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {weeks.map((week) => (
                  <option key={week.id} value={week.id}>
                    Week {week.weekNumber} · {week.title}
                  </option>
                ))}
              </select>
            </label>
            <Button icon={faUpload} onClick={() => setUploadWeekId(uploadWeekId || weeks[0].id)}>
              Upload
            </Button>
          </div>
        </Card>
      )}

      {weeksWithMaterials.length === 0 ? (
        <Card title="Materials" icon={faFolderOpen}>
          <EmptyState
            icon={faFolderOpen}
            title="No materials in any week yet"
            description={
              access.canManage
                ? "Upload the deck or notes for the week you are about to teach."
                : "The teaching team has not attached any materials yet."
            }
          />
        </Card>
      ) : (
        weeksWithMaterials.map((week) => (
          <WeekMaterialsGroup
            key={week.id}
            week={week}
            detail={details[week.id] || null}
            access={access}
            onUpload={() => setUploadWeekId(week.id)}
            onRecord={(material, position, unitLabel, totalUnits) =>
              setRecordFor({ material, position, unitLabel, totalUnits })
            }
            onNotice={onNotice}
            onError={onError}
          />
        ))
      )}

      <CourseTeachingHistoryCard
        history={history}
        failed={historyFailed}
        onRetry={() => void loadHistory()}
      />

      {uploadWeekId && (
        <UploadMaterialModal
          isOpen
          weekId={uploadWeekId}
          weekLabel={
            (() => {
              const week = weeks.find((row) => row.id === uploadWeekId);
              return week ? `Week ${week.weekNumber} · ${week.title}` : "";
            })()
          }
          access={access}
          onClose={() => setUploadWeekId(null)}
          onUploaded={async (title) => {
            setUploadWeekId(null);
            await load();
            await loadHistory();
            onNotice(
              `"${title}" uploaded. It stays invisible to students until you release it.`,
            );
          }}
          onError={onError}
        />
      )}

      {recordFor && (
        <RecordTeachingModal
          material={recordFor.material}
          position={recordFor.position}
          unitLabel={recordFor.unitLabel}
          totalUnits={recordFor.totalUnits}
          sessions={sessions}
          onClose={() => setRecordFor(null)}
          onRecorded={async (next, unit) => {
            await load();
            await loadHistory();
            setRecordFor(null);
            onNotice(
              next
                ? `Recorded. The next class continues from ${unit} ${next}.`
                : "Teaching session recorded.",
            );
          }}
          onError={onError}
        />
      )}
    </div>
  );
};

/** One week of the course plan and the materials attached to it. */
const WeekMaterialsGroup: React.FC<{
  week: LmsWeek;
  detail: LmsWeekDetail | null;
  access: CourseAccess;
  onUpload: () => void;
  onRecord: (
    material: LmsMaterial,
    position: LmsWeekTeachingPosition | null,
    unitLabel: LmsTeachingUnitLabel,
    totalUnits: number | null,
  ) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ week, detail, access, onUpload, onRecord, onNotice, onError }) => {
  const [busyId, setBusyId] = useState<string | null>("");

  const materials = detail?.week.materials ?? [];
  const positions = new Map(
    (detail?.week.teachingProgress ?? []).map((row) => [row.materialId, row]),
  );

  const changeState = async (
    material: LmsMaterial,
    status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "HIDDEN" | "ARCHIVED",
  ) => {
    setBusyId(material.id);
    try {
      /**
       * Releasing now has to clear the release instant as well as the state.
       *
       * The server resolves a material's effective state from both fields, and a
       * future `releaseAt` outranks the stored status — so setting PUBLISHED on a
       * scheduled material leaves it reported as SCHEDULED, still invisible, until
       * the instant arrives. The teacher would have clicked Release and seen no
       * change. Clearing the time first is what "release now" has to mean.
       */
      if (status === "PUBLISHED" && material.releaseAt) {
        await updateMaterial(material.id, { releaseAt: null });
      }
      await setMaterialStatus(material.id, status);
      onNotice(
        status === "PUBLISHED"
          ? `"${material.title}" released to students.`
          : status === "ARCHIVED"
            ? `"${material.title}" archived. Students keep their existing copy.`
            : `"${material.title}" set to ${status.toLowerCase()}.`,
      );
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The material's visibility could not be changed.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const scheduleRelease = async (material: LmsMaterial) => {
    const when = window.prompt(
      `Release "${material.title}" at (ISO date and time).`,
      material.releaseAt || new Date(Date.now() + 86400000).toISOString(),
    );
    if (when === null) return;
    const at = new Date(when);
    if (!when || Number.isNaN(at.getTime())) {
      onError("A scheduled release needs a valid date and time.");
      return;
    }
    setBusyId(material.id);
    try {
      // The status route accepts only a state and rejects SCHEDULED without a time,
      // so the release instant is written first.
      await updateMaterial(material.id, { releaseAt: at.toISOString() });
      await setMaterialStatus(material.id, "SCHEDULED");
      onNotice(`"${material.title}" will be released ${at.toLocaleString()}.`);
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The release could not be scheduled.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card
      title={`Week ${week.weekNumber} · ${week.title}`}
      icon={faFolderOpen}
      subtitle={
        week.description || `${week.materialCount ?? 0} material(s) in this week`
      }
      headerAction={
        access.canManage ? (
          <Button size="sm" icon={faPlus} onClick={onUpload}>
            Upload
          </Button>
        ) : undefined
      }
    >
      {!detail ? (
        <div className="space-y-2" aria-busy="true">
          <CardSkeleton />
        </div>
      ) : materials.length === 0 ? (
        <EmptyState
          icon={faFolderOpen}
          title="No materials in this week"
          description={
            access.canManage
              ? "Upload the deck or notes you will teach from this week."
              : "The teaching team has not attached any materials to this week."
          }
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {materials.map((material) => (
            <MaterialRow
              key={material.id}
              material={material}
              position={positions.get(material.id) || null}
              canManage={access.canManage}
              busy={busyId === material.id}
              onRecord={() =>
                onRecord(
                  material,
                  positions.get(material.id) || null,
                  material.documentMeta?.unitLabel || "slide",
                  material.documentMeta?.unitCount ?? null,
                )
              }
              onPublish={() => changeState(material, "PUBLISHED")}
              onHide={() => changeState(material, "HIDDEN")}
              onArchive={() => changeState(material, "ARCHIVED")}
              onSchedule={() => scheduleRelease(material)}
              onError={onError}
            />
          ))}
        </ul>
      )}
    </Card>
  );
};

/** One material: what it is, where the teaching stopped, and what can be done to it. */
const MaterialRow: React.FC<{
  material: LmsMaterial;
  position: LmsWeekTeachingPosition | null;
  canManage: boolean;
  busy: boolean;
  onRecord: () => void;
  onPublish: () => Promise<void>;
  onHide: () => Promise<void>;
  onArchive: () => Promise<void>;
  onSchedule: () => Promise<void>;
  onError: (message: string) => void;
}> = ({
  material,
  position,
  canManage,
  busy,
  onRecord,
  onPublish,
  onHide,
  onArchive,
  onSchedule,
  onError,
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const [detail, setDetail] = useState<LmsMaterialTeachingProgress | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);

  const unitLabel: LmsTeachingUnitLabel = material.documentMeta?.unitLabel || "slide";
  const totalUnits = material.documentMeta?.unitCount ?? null;
  const format = describeMaterialFormat(material.fileName || material.title);
  const summary = describeTeachingPosition(position, unitLabel, totalUnits);

  useEffect(() => {
    if (!showHistory || detail || detailLoading) return;
    let active = true;
    setDetailLoading(true);
    fetchMaterialTeachingProgress(material.id)
      .then((result) => {
        if (!active) return;
        setDetail(result);
        setDetailFailed(false);
      })
      .catch((requestError) => {
        if (!active) return;
        setDetailFailed(true);
        onError(
          requestError instanceof Error
            ? requestError.message
            : "The teaching history could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showHistory, detail, detailLoading, material.id, onError]);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
            <span className="truncate">{material.title}</span>
            <Badge variant={materialStateVariant(material)}>
              {(material.state || material.status).toLowerCase()}
            </Badge>
            {(material.version ?? 1) > 1 && (
              <Badge variant="neutral">v{material.version}</Badge>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {format?.label || material.materialType.replace(/_/g, " ").toLowerCase()}
            {material.file?.sizeLabel ? ` · ${material.file.sizeLabel}` : ""}
            {totalUnits ? ` · ${totalUnits} ${unitLabel}s` : ""}
            {material.sectionCodes.length
              ? ` · sections ${material.sectionCodes.join(", ")}`
              : " · whole course"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canManage && (
            <>
              <Button size="sm" icon={faClipboardList} onClick={onRecord}>
                Record session
              </Button>
              {material.status !== "PUBLISHED" && (
                <Button size="sm" disabled={busy} onClick={() => void onPublish()}>
                  Release
                </Button>
              )}
              {material.status === "PUBLISHED" && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onHide()}>
                  Hide
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onSchedule()}>
                Schedule
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onArchive()}>
                Archive
              </Button>
            </>
          )}
        </div>
      </div>

      {/*
        The teaching position is stated as the teacher's own declaration, and the
        document length is the server's reading of the file. When the length is
        unknown no bar is drawn: a progress figure against a guess would look
        authoritative while being unfounded.
      */}
      <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-700">{summary.taught}</span>
          <span className="text-slate-600">{summary.next}</span>
        </div>
        {summary.percentage !== null ? (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[var(--color-primary)]"
              style={{ width: `${summary.percentage}%` }}
              role="progressbar"
              aria-valuenow={summary.percentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Taught through ${summary.percentage} percent of the document`}
            />
          </div>
        ) : totalUnits === null && material.file ? (
          <p className="mt-1 text-xs text-slate-500">
            The length of this file could not be read, so the total and the range are
            recorded by hand — no progress figure is inferred.
          </p>
        ) : null}
        {position?.topic && (
          <p className="mt-1 text-xs text-slate-600">Topic: {position.topic}</p>
        )}
        {position && (
          <p className="mt-0.5 text-xs text-slate-500">
            Recorded {position.taughtOn}
            {position.sessionName ? ` · ${position.sessionName}` : ""}
            {position.sectionCode ? ` · section ${position.sectionCode}` : ""}
          </p>
        )}
        {canManage && (
          <button
            type="button"
            onClick={() => setShowHistory((current) => !current)}
            className="mt-1 text-xs font-medium text-[var(--color-primary)] underline-offset-2 hover:underline"
            aria-expanded={showHistory}
          >
            {showHistory ? "Hide session history" : "Session history"}
          </button>
        )}
      </div>

      {showHistory && canManage && (
        <div className="mt-2">
          {detailLoading ? (
            <div className="space-y-2" aria-busy="true">
              <CardSkeleton />
            </div>
          ) : detailFailed ? (
            <p className="text-xs text-slate-500">
              The session history could not be loaded. The position above is unaffected.
            </p>
          ) : detail && detail.records.length > 0 ? (
            <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
              {detail.records.map((record) => {
                const covered =
                  record.fromUnit === record.toUnit
                    ? `${record.unitLabel} ${record.fromUnit}`
                    : `${record.unitLabel}s ${record.fromUnit}–${record.toUnit}`;
                return (
                  <li key={record.id} className="text-xs">
                    <p className="font-medium text-slate-800">
                      {covered} · {record.taughtOn}
                      {record.sessionName ? ` · ${record.sessionName}` : ""}
                      {record.sectionCode ? ` · ${record.sectionCode}` : ""}
                    </p>
                    {record.topic && <p className="text-slate-600">Topic: {record.topic}</p>}
                    {record.notes && (
                      <p className="whitespace-pre-wrap text-slate-600">{record.notes}</p>
                    )}
                    {record.nextStartUnit && (
                      <p className="text-slate-500">
                        Next: {record.unitLabel} {record.nextStartUnit}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : detail ? (
            <p className="text-xs text-slate-500">
              No teaching session has been recorded for this material yet. Opening or
              downloading it does not count — only a recorded session does.
            </p>
          ) : null}
        </div>
      )}
    </li>
  );
};

/**
 * Record what one class actually covered.
 *
 * The form starts where the last one stopped, which is the whole point: a teacher
 * who taught slides 1–12 opens the next session and starts at 13 without
 * reconstructing anything. The class session is optional but preferred — picking one
 * carries the course, section, date, time window and attendance register across, so
 * the class is described once.
 */
const RecordTeachingModal: React.FC<{
  material: LmsMaterial;
  position: LmsWeekTeachingPosition | null;
  unitLabel: LmsTeachingUnitLabel;
  totalUnits: number | null;
  sessions: LmsClassSession[];
  onClose: () => void;
  onRecorded: (next: number | null, unitLabel: string) => Promise<void>;
  onError: (message: string) => void;
}> = ({
  material,
  position,
  unitLabel,
  totalUnits,
  sessions,
  onClose,
  onRecorded,
  onError,
}) => {
  const suggestedFrom = position?.nextStartUnit ?? 1;
  const [sessionId, setSessionId] = useState("");
  const [fromUnit, setFromUnit] = useState(String(suggestedFrom));
  const [toUnit, setToUnit] = useState("");
  const [declaredTotal, setDeclaredTotal] = useState(totalUnits ? String(totalUnits) : "");
  const [taughtOn, setTaughtOn] = useState("");
  const [topic, setTopic] = useState(position?.topic || "");
  const [notes, setNotes] = useState("");
  const [nextStart, setNextStart] = useState("");
  const [saving, setSaving] = useState(false);

  const unit = unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1);

  // Sessions for this course only, newest first, so the class a teacher just taught
  // is the first thing offered.
  const courseSessions = useMemo(
    () =>
      [...sessions]
        .filter((session) => session.courseId === material.courseId)
        .sort((left, right) =>
          String(right.date || "").localeCompare(String(left.date || "")),
        ),
    [sessions, material.courseId],
  );

  useEffect(() => {
    setSessionId("");
    setFromUnit(String(suggestedFrom));
    setToUnit("");
    setDeclaredTotal(totalUnits ? String(totalUnits) : "");
    setTaughtOn("");
    setTopic(position?.topic || "");
    setNotes("");
    setNextStart("");
  }, [material.id, suggestedFrom, totalUnits, position?.topic]);

  const applySession = (id: string) => {
    setSessionId(id);
    const session = courseSessions.find((row) => row.id === id);
    if (!session?.date) return;
    // The class supplies its own date server-side; showing it here makes it clear
    // which class the record will be filed against.
    setTaughtOn(session.date);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const from = Number(fromUnit);
    const to = Number(toUnit);
    if (!Number.isInteger(from) || from < 1) {
      onError(`Enter the ${unitLabel} this class started from.`);
      return;
    }
    if (!Number.isInteger(to) || to < 1) {
      onError(`Enter the ${unitLabel} this class finished on.`);
      return;
    }
    if (to < from) {
      onError(`The ending ${unitLabel} cannot be before the starting one.`);
      return;
    }
    const effectiveTotal = declaredTotal.trim() ? Number(declaredTotal) : totalUnits;
    if (effectiveTotal && (from > effectiveTotal || to > effectiveTotal)) {
      onError(`This document has ${effectiveTotal} ${unitLabel}s.`);
      return;
    }

    setSaving(true);
    try {
      await recordTeachingProgress(material.id, {
        fromUnit: from,
        toUnit: to,
        // Only sent when the server could not read the length itself; otherwise the
        // file's own count is used, so the two cannot disagree.
        ...(declaredTotal.trim() && !totalUnits ? { totalUnits: Number(declaredTotal) } : {}),
        unitLabel,
        nextStartUnit: nextStart.trim() ? Number(nextStart) : null,
        taughtOn: taughtOn.trim() || undefined,
        topic: topic.trim() || undefined,
        notes: notes.trim() || undefined,
        timetableSessionId: sessionId || null,
        weekId: material.weekId,
      });
      const next = nextStart.trim()
        ? Number(nextStart)
        : effectiveTotal && to < effectiveTotal
          ? to + 1
          : null;
      await onRecorded(next, unitLabel);
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The teaching session could not be recorded.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Record what was taught"
      subtitle={`${material.title}${totalUnits ? ` · ${totalUnits} ${unitLabel}s` : ""}`}
      maxWidth="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="lms-teaching-form"
            isLoading={saving}
            loadingLabel="Recording"
          >
            Record session
          </Button>
        </>
      }
    >
      <form id="lms-teaching-form" onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          Class session (optional)
          <select
            value={sessionId}
            onChange={(event) => applySession(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Not linked to a scheduled class</option>
            {courseSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {[
                  session.date || session.scheduledDay,
                  session.startTime ? `${session.startTime}–${session.endTime || ""}` : null,
                  session.sessionType,
                  session.sectionCode,
                  session.room,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </option>
            ))}
          </select>
        </label>
        {courseSessions.length === 0 && (
          <p className="text-xs text-slate-500">
            No timetable sessions are recorded for you on this course, so this class
            cannot be linked. The range, topic and date are still recorded.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            {`From ${unitLabel}`}
            <input
              required
              type="number"
              min={1}
              value={fromUnit}
              onChange={(event) => setFromUnit(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            {`To ${unitLabel}`}
            <input
              required
              type="number"
              min={1}
              value={toUnit}
              onChange={(event) => setToUnit(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            {`Total ${unitLabel}s in the document`}
            <input
              type="number"
              min={1}
              value={declaredTotal}
              readOnly={Boolean(totalUnits)}
              onChange={(event) => setDeclaredTotal(event.target.value)}
              placeholder={totalUnits ? String(totalUnits) : "Not known"}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 read-only:bg-slate-50"
            />
          </label>
          <label className="block text-sm">
            {`Next class starts at ${unitLabel}`}
            <input
              type="number"
              min={1}
              value={nextStart}
              onChange={(event) => setNextStart(event.target.value)}
              placeholder={nextStartPlaceholder(toUnit, totalUnits, unitLabel)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <label className="block text-sm">
          Teaching date
          <input
            type="date"
            value={taughtOn}
            onChange={(event) => setTaughtOn(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          Topic covered
          <input
            maxLength={500}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="What this class actually covered"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          Notes for the next class
          <textarea
            rows={3}
            maxLength={4000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <p className="text-xs text-slate-500">
          Recording a session is the only thing that advances a material's teaching
          position. Opening or downloading the file does not.
        </p>
      </form>
    </Modal>
  );
};

/** The position the next class would reach by default, shown as a field placeholder. */
function nextStartPlaceholder(
  toUnit: string,
  totalUnits: number | null,
  unitLabel: string,
) {
  const to = Number(toUnit);
  if (!Number.isInteger(to) || to < 1) return `Defaults to the next ${unitLabel}`;
  if (totalUnits && to < totalUnits) return String(to + 1);
  return "End of the document";
}

/** Every recorded teaching session in the course, newest first. */
const CourseTeachingHistoryCard: React.FC<{
  history: LmsCourseTeachingHistory | null;
  failed: boolean;
  onRetry: () => void;
}> = ({ history, failed, onRetry }) => {
  if (failed) {
    return (
      <Card title="Teaching history" icon={faGraduationCap}>
        <EmptyState
          icon={faTriangleExclamation}
          title="The teaching history could not be loaded"
          description="The recorded sessions for this course were unavailable. Materials above are unaffected."
          actionLabel="Retry"
          actionIcon={faArrowRotateRight}
          onAction={onRetry}
        />
      </Card>
    );
  }

  if (!history) {
    return (
      <div aria-busy="true">
        <CardSkeleton />
      </div>
    );
  }

  return (
    <Card
      title="Teaching history"
      icon={faGraduationCap}
      subtitle="Every recorded session in this course. These are teacher declarations, not tracked activity."
    >
      {history.records.length === 0 ? (
        <EmptyState
          icon={faGraduationCap}
          title="No teaching session recorded yet"
          description="Record a session against a material above and it appears here as a history of what was covered."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Material</th>
                <th className="px-2 py-2">Covered</th>
                <th className="px-2 py-2">Next</th>
                <th className="px-2 py-2">Class</th>
                <th className="px-2 py-2">Recorded by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.records.map((record) => (
                <tr key={record.id}>
                  <td className="px-2 py-2.5 text-slate-600">{record.taughtOn}</td>
                  <td className="px-2 py-2.5 font-medium text-slate-900">
                    {record.materialTitle || "—"}
                    {record.weekNumber !== null && (
                      <span className="ml-1.5 text-xs font-normal text-slate-400">
                        week {record.weekNumber}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-slate-600">
                    {record.fromUnit === record.toUnit
                      ? `${record.unitLabel} ${record.fromUnit}`
                      : `${record.unitLabel}s ${record.fromUnit}–${record.toUnit}`}
                    {record.totalUnits ? ` of ${record.totalUnits}` : ""}
                  </td>
                  <td className="px-2 py-2.5 text-slate-600">
                    {record.nextStartUnit ? `${record.unitLabel} ${record.nextStartUnit}` : "—"}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-slate-600">
                    {record.sessionName || "—"}
                    {record.sectionCode ? ` · ${record.sectionCode}` : ""}
                  </td>
                  <td className="px-2 py-2.5 text-slate-600">{record.facultyName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

/**
 * A material's effective visibility.
 *
 * `state` is the server's own verdict — it accounts for a release time that has
 * not arrived yet — so it is rendered rather than recomputed here.
 */
function materialStateVariant(
  material: LmsMaterial,
): "success" | "warning" | "neutral" | "info" {
  const state = material.state || material.status;
  if (state === "PUBLISHED") return "success";
  if (state === "SCHEDULED") return "info";
  if (state === "ARCHIVED" || state === "HIDDEN") return "neutral";
  return "warning";
}

/**
 * Upload a teaching document into a week.
 *
 * The cohort is not chosen here. When a teacher teaches specific sections, the
 * server targets exactly those — a payload that named a different section would
 * be rejected, not quietly honoured — so the form states the audience rather than
 * offering a control that cannot mean anything else.
 */
const UploadMaterialModal: React.FC<{
  isOpen: boolean;
  weekId: string;
  weekLabel: string;
  access: CourseAccess;
  onClose: () => void;
  onUploaded: (title: string) => Promise<void>;
  onError: (message: string) => void;
}> = ({ isOpen, weekId, weekLabel, access, onClose, onUploaded, onError }) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("");
  const [releaseAt, setReleaseAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setTitle("");
    setDescription("");
    setTopic("");
    setReleaseAt("");
  }, [isOpen]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      onError("Choose a file to upload.");
      return;
    }
    // The extension is checked here so the teacher is told immediately rather than
    // after a round trip. The server still verifies the file's real content, so this
    // is a courtesy, not the boundary.
    const format = describeMaterialFormat(file.name);
    if (!format) {
      onError(
        `This workspace accepts ${MATERIAL_UPLOAD_EXTENSIONS.map((extension) =>
          extension.toUpperCase(),
        ).join(", ")} files.`,
      );
      return;
    }

    setSaving(true);
    try {
      await uploadWeekMaterial(weekId, {
        file,
        // A file with no readable name still needs a title; fall back to the
        // filename rather than refusing the upload over a cosmetic field.
        title: title.trim() || file.name,
        description: description.trim() || undefined,
        topic: topic.trim() || undefined,
        materialType: format.materialType,
        releaseAt: releaseAt ? new Date(releaseAt).toISOString() : undefined,
        sectionCodes: access.sections.length ? access.sections : undefined,
        status: "DRAFT",
      });
      await onUploaded(title.trim() || file.name);
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The material could not be uploaded.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upload a teaching document"
      subtitle={weekLabel}
      maxWidth="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="lms-material-form" isLoading={saving} loadingLabel="Uploading">
            Upload
          </Button>
        </>
      }
    >
      <form id="lms-material-form" onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          File
          <input
            required
            type="file"
            accept={MATERIAL_UPLOAD_EXTENSIONS.map((extension) => `.${extension}`).join(",")}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="mt-1 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-xs text-slate-500">
          PDF, PPT, PPTX, DOC or DOCX. A PDF and a PPTX are read for their real page and
          slide count; the older PPT and DOC formats carry no reliable count, so the
          total is entered when the first session is recorded.
        </p>
        <label className="block text-sm">
          Title
          <input
            maxLength={180}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Defaults to the file name"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Topic
          <input
            maxLength={160}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="What part of the week this supports"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Description
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Release at (optional)
          <input
            type="datetime-local"
            value={releaseAt}
            onChange={(event) => setReleaseAt(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <p className="text-xs text-slate-500">
          Reaches{" "}
          {access.sections.length
            ? `sections ${access.sections.join(", ")}`
            : "the whole course"}{" "}
          — the cohort is taken from your teaching assignment, not chosen here. Uploaded
          as a draft, so students see nothing until you release it.
        </p>
      </form>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Assignments                                                         */
/* ------------------------------------------------------------------ */

/**
 * Assignments for the course, plus the submission picture behind them.
 *
 * Two questions are kept apart on purpose: "what has been set" (the assignment
 * list, from the assignments module) and "who has handed it in" (submission
 * progress). Neither is derived from the other, so a missing submission is shown
 * as a gap rather than quietly scored as zero.
 */
const AssignmentsTab: React.FC<{
  courseId: string;
  access: CourseAccess;
  holds: (permission: string) => boolean;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ courseId, access, holds, onNotice, onError }) => {
  const [assignments, setAssignments] = useState<LmsCourseAssignment[]>([]);
  const [progress, setProgress] = useState<LmsProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [listFailed, setListFailed] = useState(false);
  const [progressFailed, setProgressFailed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const canCreate = access.canManage && holds("assignments.create");

  const load = useCallback(async () => {
    setLoading(true);
    const [listResult, progressResult] = await Promise.allSettled([
      fetchCourseAssignments(courseId, { limit: 50 }),
      fetchCourseProgress(courseId),
    ]);

    if (listResult.status === "fulfilled") {
      setAssignments(listResult.value.assignments);
      setListFailed(false);
    } else {
      // A failed read is reported as a failure. Falling through to the empty
      // state here would tell a teacher their course has no assignments.
      setListFailed(true);
      onError(
        listResult.reason instanceof Error
          ? listResult.reason.message
          : "The assignment list could not be loaded.",
      );
    }

    if (progressResult.status === "fulfilled") {
      setProgress(progressResult.value);
      setProgressFailed(false);
    } else {
      setProgress(null);
      setProgressFailed(true);
    }

    setLoading(false);
  }, [courseId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...assignments].sort((left, right) => {
        // Undated work sorts last instead of pretending to be due first.
        if (!left.dueAt) return 1;
        if (!right.dueAt) return -1;
        return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
      }),
    [assignments],
  );

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        title="Assignments"
        icon={faFilePen}
        subtitle="Everything set in this course, with the submissions recorded against each one."
        headerAction={
          canCreate ? (
            <Button size="sm" icon={faPlus} onClick={() => setShowCreate(true)}>
              Assignment
            </Button>
          ) : undefined
        }
      >
        {listFailed ? (
          <EmptyState
            icon={faTriangleExclamation}
            title="Assignments could not be loaded"
            description="The server did not return this course's assignments. Nothing has been shown in its place."
            actionLabel="Retry"
            actionIcon={faArrowRotateRight}
            onAction={() => void load()}
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={faFilePen}
            title="No assignments in this course"
            description={
              canCreate
                ? "Set the first assignment to open the submission window for your sections."
                : "The teaching team has not set any assignments for this course."
            }
            actionLabel={canCreate ? "Set an assignment" : undefined}
            onAction={canCreate ? () => setShowCreate(true) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Assignment</th>
                  <th className="px-2 py-2">Audience</th>
                  <th className="px-2 py-2">Marks</th>
                  <th className="px-2 py-2">Due</th>
                  <th className="px-2 py-2">Submissions</th>
                  <th className="px-2 py-2">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((assignment) => {
                  const stats = assignment.stats;
                  const overdue =
                    assignment.dueAt &&
                    new Date(assignment.dueAt).getTime() < Date.now() &&
                    assignment.status === "OPEN";
                  return (
                    <tr key={assignment.id}>
                      <td className="px-2 py-2.5">
                        <p className="font-medium text-slate-900">{assignment.title}</p>
                        <p className="text-xs text-slate-500">
                          {assignment.assignmentType.replace(/_/g, " ").toLowerCase()}
                          {assignment.opensAt
                            ? ` · opens ${new Date(assignment.opensAt).toLocaleString()}`
                            : ""}
                        </p>
                      </td>
                      <td className="px-2 py-2.5 text-slate-600">{assignment.audienceLabel}</td>
                      <td className="px-2 py-2.5 text-slate-600">
                        {assignment.maxMarks ?? "—"}
                      </td>
                      <td className="px-2 py-2.5 text-slate-600">
                        {assignment.dueAt ? (
                          <>
                            {new Date(assignment.dueAt).toLocaleString()}
                            {overdue && (
                              <Badge variant="warning" className="ml-2">
                                Past due
                              </Badge>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-slate-600">
                        {!stats ? (
                          <span className="text-slate-400">Not counted</span>
                        ) : (
                          <>
                            {stats.submitted} / {stats.submissions}
                            {stats.late > 0 && (
                              <Badge variant="warning" className="ml-2">
                                {stats.late} late
                              </Badge>
                            )}
                            {stats.graded < stats.submitted && (
                              <Badge variant="info" className="ml-2">
                                {stats.submitted - stats.graded} to grade
                              </Badge>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <Badge
                          variant={
                            assignment.status === "OPEN"
                              ? "success"
                              : assignment.status === "CLOSED"
                                ? "neutral"
                                : assignment.status === "ARCHIVED"
                                  ? "neutral"
                                  : "warning"
                          }
                        >
                          {assignment.status.toLowerCase()}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/*
        Submission progress is optional context, not the same fact as the list
        above, so a failure here is reported in place and does not blank the tab.
      */}
      {progressFailed ? (
        <Card title="Submission progress" icon={faListCheck}>
          <EmptyState
            icon={faTriangleExclamation}
            title="Progress could not be loaded"
            description="The per-student submission counts were unavailable. The assignment list above is unaffected."
            actionLabel="Retry"
            actionIcon={faArrowRotateRight}
            onAction={() => void load()}
          />
        </Card>
      ) : progress && progress.students.length > 0 ? (
        <Card
          title="Submission progress"
          icon={faListCheck}
          subtitle="Counted from real submissions. A missing submission is a gap, not a zero."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Student</th>
                  <th className="px-2 py-2">Section</th>
                  <th className="px-2 py-2">Submitted</th>
                  <th className="px-2 py-2">Late</th>
                  <th className="px-2 py-2">Quiz average</th>
                  <th className="px-2 py-2">Marks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {progress.students.map((student) => (
                  <tr key={student.id}>
                    <td className="px-2 py-2.5 font-medium text-slate-900">
                      {student.name}
                      {student.studentId && (
                        <span className="ml-1.5 font-mono text-xs text-slate-400">
                          {student.studentId}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-slate-600">{student.section || "—"}</td>
                    <td className="px-2 py-2.5 text-slate-600">
                      {student.assignmentsSubmitted} / {student.assignmentsTotal}
                    </td>
                    <td className="px-2 py-2.5 text-slate-600">{student.lateSubmissions}</td>
                    <td className="px-2 py-2.5 text-slate-600">
                      {formatPercentage(student.averageQuizScore)}
                    </td>
                    <td className="px-2 py-2.5">
                      {/*
                        The mark is reported as the recorded total. Whether that is a
                        pass is a course decision owned by the grading policy, so no
                        threshold is invented in the browser — a red/green verdict on a
                        bare number here would be an academic rule with no source.
                      */}
                      {student.percentage === null ? (
                        <span className="text-slate-400">Not assessed</span>
                      ) : (
                        <span>
                          {formatMark(
                            student.obtainedMarks,
                            student.totalMarks || null,
                          )}{" "}
                          ({student.percentage}%)
                        </span>
                      )}
                      {student.pendingGrades > 0 && (
                        <Badge variant="warning" className="ml-2">
                          {student.pendingGrades} pending
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <CreateAssignmentModal
        isOpen={showCreate}
        courseId={courseId}
        access={access}
        onClose={() => setShowCreate(false)}
        onCreated={async (title) => {
          setShowCreate(false);
          await load();
          onNotice(`"${title}" set for ${access.sections.length ? `sections ${access.sections.join(", ")}` : "the whole course"}.`);
        }}
        onError={onError}
      />
    </div>
  );
};

/**
 * Set an assignment.
 *
 * The cohort is the teacher's own scope rather than a free choice: a teacher who
 * teaches sections A1 and A2 cannot address A3 from here, because the server
 * re-checks the course and section against their teaching assignment and would
 * reject the request. The form states the audience so the outcome is never a
 * surprise, and does not offer a control that could only ever fail.
 */
const CreateAssignmentModal: React.FC<{
  isOpen: boolean;
  courseId: string;
  access: CourseAccess;
  onClose: () => void;
  onCreated: (title: string) => Promise<void>;
  onError: (message: string) => void;
}> = ({ isOpen, courseId, access, onClose, onCreated, onError }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [assignmentType, setAssignmentType] = useState("ESSAY");
  const [maxMarks, setMaxMarks] = useState("100");
  const [dueAt, setDueAt] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setDescription("");
    setInstructions("");
    setAssignmentType("ESSAY");
    setMaxMarks("100");
    setDueAt("");
    setOpensAt("");
  }, [isOpen]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const due = dueAt ? new Date(dueAt) : null;
    if (!due || Number.isNaN(due.getTime())) {
      onError("An assignment needs a valid due date.");
      return;
    }
    const opens = opensAt ? new Date(opensAt) : null;
    if (opens && Number.isNaN(opens.getTime())) {
      onError("The open date is not a valid date and time.");
      return;
    }
    if (opens && due.getTime() < opens.getTime()) {
      onError("The due date must be on or after the open date.");
      return;
    }

    setSaving(true);
    try {
      await createCourseAssignment({
        title: title.trim(),
        courseId,
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        assignmentType,
        maxMarks: maxMarks.trim() ? Number(maxMarks) : undefined,
        dueAt: due.toISOString(),
        opensAt: opens ? opens.toISOString() : undefined,
        sectionCodes: access.sections.length ? access.sections : undefined,
        semester: access.semester ?? undefined,
      });
      await onCreated(title.trim());
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The assignment could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Set an assignment"
      subtitle="Students see it as soon as it is saved, if the open date has passed."
      maxWidth="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="lms-assignment-form" isLoading={saving} loadingLabel="Saving">
            Save assignment
          </Button>
        </>
      }
    >
      <form id="lms-assignment-form" onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          Title
          <input
            required
            maxLength={180}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Type
            <select
              value={assignmentType}
              onChange={(event) => setAssignmentType(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {[
                "ESSAY",
                "PROJECT",
                "REPORT",
                "PRESENTATION",
                "PRACTICAL",
                "PROBLEM_SET",
                "OTHER",
              ].map((value) => (
                <option key={value} value={value}>
                  {value.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Maximum marks
            <input
              type="number"
              min={0}
              max={1000}
              value={maxMarks}
              onChange={(event) => setMaxMarks(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Opens at (optional)
            <input
              type="datetime-local"
              value={opensAt}
              onChange={(event) => setOpensAt(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Due at
            <input
              required
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <label className="block text-sm">
          Description
          <textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Instructions
          <textarea
            rows={3}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <p className="text-xs text-slate-500">
          Reaches{" "}
          {access.sections.length
            ? `sections ${access.sections.join(", ")}`
            : "the whole course"}
          {access.semester ? ` · semester ${access.semester}` : ""} — the audience comes
          from your teaching assignment, not from this form.
        </p>
      </form>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Quizzes                                                             */
/* ------------------------------------------------------------------ */

/**
 * Quiz authoring for one course.
 *
 * Authoring is not gated on "being on the course team" as a browser-side
 * assumption. The quiz list already returns the caller's own access verdict from
 * the server — `access.canManage`, resolved from their teaching assignment for
 * this course and semester — so that verdict decides what is offered. A teacher
 * assigned to a section of this course therefore authors normally, and someone
 * with no teaching claim sees the same quizzes read-only instead of being told
 * they are not on the team.
 */
const QuizzesTab: React.FC<{
  courseId: string;
  access: CourseAccess;
  holds: (permission: string) => boolean;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ courseId, access, holds, onNotice, onError }) => {
  const [quizzes, setQuizzes] = useState<LmsQuizList<LmsQuizForTeacher> | null>(null);
  const [weeks, setWeeks] = useState<LmsWeek[]>([]);
  const [detail, setDetail] = useState<LmsQuizDetail | null>(null);
  const [roster, setRoster] = useState<
    Awaited<ReturnType<typeof fetchAttemptRoster>> | null
  >(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  /**
   * Whether this view may author, and why not when it may not.
   *
   * Both conditions have to hold: the server must have said this caller can
   * manage the course's quizzes, and the session must carry the authoring
   * permission. Neither is guessed — the first comes from the list response, the
   * second from the signed-in user's permissions — and neither is trusted as the
   * only check, since the server re-validates course, section and semester on
   * every write regardless of what this flag says.
   */
   const canManageLms = holds("lms.quiz.manage");
   const mayAuthor =
     Boolean(quizzes?.access.canManage) && canManageLms;

   const blockedReason = !quizzes
     ? null
     : !quizzes.access.canManage
       ? `Your access to this course is "${access.role}", which is read-only for quizzes${
           quizzes.access.sections.length
             ? ` (sections ${quizzes.access.sections.join(", ")})`
             : ""
         }.`
       : !canManageLms
         ? "Your role does not carry the quiz authoring permission, so quizzes are read-only here."
         : null;

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [quizResult, weekResult] = await Promise.all([
        // The authoring surface reads the teacher payload; `access` on the
        // response is the server's own verdict for this caller.
        fetchCourseQuizzes<LmsQuizForTeacher>(courseId),
        fetchCourseWeeks(courseId),
      ]);
      setQuizzes(quizResult);
      setWeeks(weekResult.weeks);
      setLoadFailed(false);
    } catch (requestError) {
      setLoadFailed(true);
      onError(requestError instanceof Error ? requestError.message : "Quizzes could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [courseId, onError]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openQuiz = async (quizId: string) => {
    setBusyId(quizId);
    try {
      const result = await fetchQuiz(quizId);
      if (!isTeacherQuizDetail(result)) {
        onError("This quiz is not in your teaching scope.");
        return;
      }
      setDetail(result);
      setRoster(await fetchAttemptRoster(quizId));
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "This quiz could not be opened.");
    } finally {
      setBusyId(null);
    }
  };

  const changeStatus = async (quizId: string, status: "SCHEDULED" | "OPEN" | "CLOSED") => {
    setBusyId(quizId);
    try {
      const result = await setQuizStatus(quizId, status);
      await loadList();
      setDetail((current) =>
        current && current.quiz.id === quizId
          ? { ...current, quiz: { ...current.quiz, ...result.quiz } }
          : current,
      );
      onNotice(
        result.event === "OPENED" || result.event === "CLOSED"
          ? `Quiz ${result.event === "OPENED" ? "opened" : "closed"} by the server clock.`
          : `Quiz set to ${status.toLowerCase()}.`,
      );
    } catch (requestError) {
      onError(
        requestError instanceof Error ? requestError.message : "The quiz state could not be changed.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const duplicateQuiz = async (quizId: string) => {
    setBusyId(quizId);
    try {
      const result = await apiDuplicateQuiz(quizId);
      await loadList();
      await openQuiz(result.quiz.id);
      onNotice(`Quiz duplicated as "${result.quiz.title}".`);
    } catch (requestError) {
      onError(
        requestError instanceof Error ? requestError.message : "Failed to duplicate quiz.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {blockedReason && (
        <Alert variant="info" detail="Authoring is re-checked by the server on every write.">
          {blockedReason}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card
          title="Quizzes"
          icon={faClipboardList}
   headerAction={
     canManageLms ? (
       <Button
         size="sm"
         icon={faPlus}
         onClick={() => setShowCreate(true)}
         disabled={!weeks.length}
       >
         Quiz
       </Button>
     ) : undefined
   }
        >
          {loading ? (
            <div className="space-y-2" aria-busy="true">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : loadFailed || !quizzes ? (
            <EmptyState
              icon={faTriangleExclamation}
              title="Quizzes could not be loaded"
              description="The server did not return this course's quizzes. Nothing has been shown in its place."
              actionLabel="Retry"
              actionIcon={faArrowRotateRight}
              onAction={() => void loadList()}
            />
          ) : quizzes.quizzes.length === 0 ? (
            <EmptyState
              icon={faClipboardList}
              title="No quizzes yet"
              description={
                mayAuthor
                  ? "Create a quiz and add questions to it before scheduling."
                  : "The teaching team has not set any quizzes for this course."
              }
              actionLabel={mayAuthor ? "Create a quiz" : undefined}
              onAction={mayAuthor ? () => setShowCreate(true) : undefined}
            />
          ) : (
            <ul className="space-y-2">
              {quizzes.quizzes.map((quiz) => (
                <li key={quiz.id}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                        {quiz.title}
                      </span>
                      <Badge variant={availabilityVariant(quiz.availability)}>
                        {quiz.availability.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {quiz.maxMarks} marks · {quiz.durationMinutes ?? "—"} min ·{" "}
                      {quiz.attemptsAllowed} attempt(s)
                      {quiz.pendingManualGradeCount
                        ? ` · ${quiz.pendingManualGradeCount} to mark`
                        : ""}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void openQuiz(quiz.id)}
                        className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => void duplicateQuiz(quiz.id)}
                        className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50"
                      >
                        Duplicate
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          {detail ? (
            <QuizStudio
              detail={detail}
              roster={roster}
              mayAuthor={mayAuthor}
              busy={busyId === detail.quiz.id}
              onStatus={changeStatus}
              onOpenRoster={async () =>
                setRoster(await fetchAttemptRoster(detail.quiz.id))
              }
              onMark={setMarkingId}
              onRelease={async () => {
                await releaseQuizResults(detail.quiz.id);
                await openQuiz(detail.quiz.id);
                onNotice("Results released to the cohort.");
              }}
              onError={onError}
            />
          ) : loading || loadFailed ? (
            <CardSkeleton />
          ) : (
            <Card>
              <EmptyState
                icon={faClipboardList}
                title="Select a quiz"
                description="Open a quiz to author it, control its schedule, and mark the attempts that have come in."
              />
            </Card>
          )}
        </div>
      </div>

      <CreateQuizModal
        isOpen={showCreate}
        weeks={weeks}
        onClose={() => setShowCreate(false)}
        onCreated={async (created) => {
          setShowCreate(false);
          await loadList();
          await openQuiz(created.quiz.id);
          onNotice(`Draft quiz "${created.quiz.title}" created.`);
        }}
        onError={onError}
        courseId={courseId}
        access={access}
      />

      {markingId && (
        <QuizGradingPanel
          attemptId={markingId}
          attemptLabel={detail?.quiz.title || "Quiz"}
          onClose={() => setMarkingId(null)}
        />
      )}
    </div>
  );
};

const QuizStudio: React.FC<{
  detail: LmsQuizDetail;
  roster: Awaited<ReturnType<typeof fetchAttemptRoster>> | null;
  /** Authoring controls are shown only when the server granted manage access. */
  mayAuthor: boolean;
  busy: boolean;
  onStatus: (quizId: string, status: "SCHEDULED" | "OPEN" | "CLOSED") => Promise<void>;
  onOpenRoster: () => Promise<void>;
  onMark: (attemptId: string) => void;
  onRelease: () => Promise<void>;
  onError: (message: string) => void;
}> = ({
  detail,
  roster,
  mayAuthor,
  busy,
  onStatus,
  onOpenRoster,
  onMark,
  onRelease,
  onError,
}) => {
   const { quiz, questions, totals } = detail;
   const [question, setQuestion] = useState<QuestionAuthoringState>({
     type: "MULTIPLE_CHOICE",
     marks: 5,
     options: [
       { text: "" },
       { text: "" },
     ],
     correctAnswer: ["option_1"],
   });
   const [adding, setAdding] = useState(false);
   const [showShortAnswer, setShowShortAnswer] = useState(false);
   const [writtenText, setWrittenText] = useState("");
   const [writtenMarks, setWrittenMarks] = useState("5");

   // A quiz can only be rewritten while the server still considers it a draft, so
   // both the lifecycle state and this caller's access have to allow it.
   const editable = mayAuthor && quiz.availability === "DRAFT" && !quiz.archivedAt;

  const addChoice = async () => {
    const options = (question.options || []).filter((option) => option.text.trim());
    if (options.length < 2 || !question.text?.trim()) {
      onError("A choice question needs a text and at least two options.");
      return;
    }
    setAdding(true);
    try {
      await addQuizQuestion(quiz.id, {
        ...question,
        options,
        // The key is expressed against the ids the server allocates, so the
        // options are sent in order and the first is keyed as the default.
        correctAnswer: [question.correctAnswer?.[0] || "option_1"],
      });
      setQuestion({
        type: "MULTIPLE_CHOICE",
        marks: 5,
        options: [{ text: "" }, { text: "" }],
        correctAnswer: ["option_1"],
      });
    } catch (requestError) {
      onError(
        requestError instanceof Error ? requestError.message : "The question could not be added.",
      );
    } finally {
      setAdding(false);
    }
  };

  const addWritten = async () => {
    if (writtenText.trim().length < 3) {
      onError("Enter the question text.");
      return;
    }
    setAdding(true);
    try {
      await addQuizQuestion(quiz.id, {
        type: "SHORT_ANSWER",
        text: writtenText,
        marks: Number(writtenMarks) || 5,
      });
      setWrittenText("");
      setShowShortAnswer(false);
    } catch (requestError) {
      onError(
        requestError instanceof Error ? requestError.message : "The question could not be added.",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <Card
        title={quiz.title}
        icon={faClipboardList}
        subtitle={`${totals.questionCount} question(s) · ${totals.questionMarks} of ${quiz.maxMarks} marks · ${totals.manualGradingCount} written`}
        headerAction={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={availabilityVariant(quiz.availability)}>
              {quiz.availability.toLowerCase()}
            </Badge>
            {editable && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void onStatus(quiz.id, "SCHEDULED")}
                >
                  Schedule
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void onStatus(quiz.id, "OPEN")}
                >
                  Open now
                </Button>
              </>
            )}
            {mayAuthor && quiz.availability === "OPEN" && (
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => void onStatus(quiz.id, "CLOSED")}
              >
                Close now
              </Button>
            )}
            {mayAuthor && quiz.resultReleasePolicy === "MANUAL" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onRelease()}>
                Release results
              </Button>
            )}
          </div>
        }
      >
        {quiz.description && (
          <p className="whitespace-pre-wrap text-sm text-slate-600">{quiz.description}</p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Fact label="Opens" value={quiz.openAt ? new Date(quiz.openAt).toLocaleString() : "—"} />
          <Fact label="Closes" value={quiz.closeAt ? new Date(quiz.closeAt).toLocaleString() : "—"} />
          <Fact label="Pass mark" value={String(quiz.passingMarks)} />
          <Fact label="Results" value={quiz.resultReleasePolicy.replace(/_/g, " ").toLowerCase()} />
        </dl>
        {totals.questionMarks !== quiz.maxMarks && (
          <Alert variant="warning" className="mt-4">
            This paper carries {totals.questionMarks} mark(s) but the quiz is set to{" "}
            {quiz.maxMarks}. The quiz cannot be scheduled or opened until they agree.
          </Alert>
        )}
      </Card>

      <Card title="The paper" icon={faListCheck}>
        {questions.length === 0 ? (
          <EmptyState
            icon={faListCheck}
            title="No questions yet"
            description="Add a question before this quiz can be scheduled or opened."
          />
        ) : (
          <ol className="space-y-3">
            {questions.map((item, index) => (
              <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {index + 1}. {item.text}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.type.replace(/_/g, " ").toLowerCase()} · {item.marks} mark(s) ·{" "}
                      {item.difficulty.toLowerCase()}
                    </p>
                    {item.options.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {item.options.map((option) => {
                          const key = item.correctAnswer.map(String);
                          const correct =
                            item.type === "MULTIPLE_SELECT"
                              ? key.includes(option.id)
                              : key[0] === option.id;
                          return (
                            <li key={option.id} className="flex items-center gap-2 text-xs">
                              <span
                                className={
                                  correct ? "font-semibold text-emerald-700" : "text-slate-600"
                                }
                              >
                                {option.text}
                              </span>
                              {correct && <Badge variant="success">key</Badge>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  {item.requiresManualGrading && <Badge variant="primary">written</Badge>}
                </div>
              </li>
            ))}
          </ol>
        )}

        {editable && (
          <div className="mt-5 space-y-4 border-t border-slate-200 pt-4">
            {!showShortAnswer ? (
              <div className="space-y-3">
                <label className="block text-sm">
                  Question text
                  <input
                    value={question.text || ""}
                    maxLength={8000}
                    onChange={(event) =>
                      setQuestion((current) => ({ ...current, text: event.target.value }))
                    }
                    placeholder="What do you want to ask?"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Marks
                    <input
                      type="number"
                      min={0}
                      value={question.marks ?? 5}
                      onChange={(event) =>
                        setQuestion((current) => ({
                          ...current,
                          marks: Number(event.target.value),
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    Correct option
                    <select
                      value={String(question.correctAnswer?.[0] || "option_1")}
                      onChange={(event) =>
                        setQuestion((current) => ({
                          ...current,
                          correctAnswer: [event.target.value],
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    >
                      {(question.options || []).map((option, index) => (
                        <option key={index} value={`option_${index + 1}`}>
                          Option {index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="space-y-2">
                  {(question.options || []).map((option, index) => (
                    <input
                      key={index}
                      value={option.text}
                      maxLength={2000}
                      onChange={(event) =>
                        setQuestion((current) => {
                          const options = [...(current.options || [])];
                          options[index] = { text: event.target.value };
                          return { ...current, options };
                        })
                      }
                      placeholder={`Option ${index + 1}`}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    icon={faPlus}
                    isLoading={adding}
                    onClick={() => void addChoice()}
                  >
                    Add question
                  </Button>
                  <Button variant="ghost" onClick={() => setShowShortAnswer(true)}>
                    Add written answer
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm">
                  Written question
                  <input
                    value={writtenText}
                    maxLength={8000}
                    onChange={(event) => setWrittenText(event.target.value)}
                    placeholder="Ask for a short or long answer"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block max-w-[10rem] text-sm">
                  Marks
                  <input
                    type="number"
                    min={0}
                    value={writtenMarks}
                    onChange={(event) => setWrittenMarks(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <p className="text-xs text-slate-500">
                  Written answers are queued for you to mark. They are never scored by the
                  server.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button icon={faPlus} isLoading={adding} onClick={() => void addWritten()}>
                    Add question
                  </Button>
                  <Button variant="ghost" onClick={() => setShowShortAnswer(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Attempts"
        icon={faGraduationCap}
        subtitle={
          roster
            ? `${roster.summary.submitted} submitted · ${roster.summary.pendingManual} waiting to be marked · ${roster.summary.graded} fully graded`
            : undefined
        }
        headerAction={
          <Button size="sm" variant="ghost" onClick={() => void onOpenRoster()}>
            Refresh
          </Button>
        }
      >
        {!roster ? (
          <p className="text-sm text-slate-500">Loading attempts…</p>
        ) : roster.attempts.length === 0 ? (
          <EmptyState
            icon={faGraduationCap}
            title="No attempts yet"
            description="Attempts appear here as students sit the quiz."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Student</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Mark</th>
                  <th className="px-2 py-2">Submitted</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roster.attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td className="px-2 py-2.5 font-medium text-slate-900">
                      {attempt.name || attempt.studentId}
                      {attempt.section && (
                        <span className="ml-1.5 text-xs text-slate-400">{attempt.section}</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <AttemptStatusBadge status={attempt.status} pending={attempt.pendingManualCount} />
                    </td>
                    <td className="px-2 py-2.5">
                      {attempt.inProgress ? (
                        <span className="text-slate-400">In progress</span>
                      ) : (
                        <span
                          className={
                            attempt.awardedMarks === null || attempt.awardedMarks === undefined
                              ? "text-slate-400"
                              : attempt.passed
                                ? "text-emerald-700"
                                : "text-red-700"
                          }
                        >
                          {formatMark(attempt.awardedMarks, attempt.maxMarks)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-slate-600">
                      {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : "—"}
                      {attempt.autoSubmitted && (
                        <Badge variant="warning" className="ml-2">
                          auto
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {mayAuthor && !attempt.inProgress && (
                        <Button size="sm" variant="secondary" onClick={() => onMark(attempt.id)}>
                          {attempt.pendingManualCount > 0 ? "Mark" : "Review"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
};

const CreateQuizModal: React.FC<{
  isOpen: boolean;
  weeks: LmsWeek[];
  onClose: () => void;
  onCreated: (created: LmsQuizDetail) => Promise<void>;
  onError: (message: string) => void;
  courseId: string;
  access: CourseAccess;
}> = ({ isOpen, weeks, onClose, onCreated, onError, courseId, access }) => {
const [form, setForm] = useState({
    weekId: "",
    title: "",
    maxMarks: "10",
    passingMarks: "4",
    durationMinutes: "20",
    attemptsAllowed: "1",
    openAt: "",
    closeAt: "",
    resultReleasePolicy: "AFTER_GRADING" as LmsQuizDraftPolicy,
    randomizeQuestions: false,
    randomizeOptions: false,
    allowBackNavigation: true,
    allowReviewBeforeSubmit: true,
    allowReopenExpired: true,
    navigationMethod: "FREE" as LmsNavigationMethod,
    multipleSelectGrading: "EXACT" as LmsMultipleSelectGrading,
    blankAnswerCaseSensitive: false,
    showCorrectAnswers: false,
});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && weeks.length && !form.weekId) {
      setForm((current) => ({ ...current, weekId: weeks[0].id }));
    }
  }, [isOpen, weeks, form.weekId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await createQuiz(courseId, {
        weekId: form.weekId,
        title: form.title,
        maxMarks: Number(form.maxMarks),
        passingMarks: Number(form.passingMarks),
        durationMinutes: Number(form.durationMinutes),
        attemptsAllowed: Number(form.attemptsAllowed),
        openAt: new Date(form.openAt).toISOString(),
        closeAt: new Date(form.closeAt).toISOString(),
        resultReleasePolicy: form.resultReleasePolicy,
        randomizeQuestions: form.randomizeQuestions,
        randomizeOptions: form.randomizeOptions,
        allowBackNavigation: form.allowBackNavigation,
        allowReviewBeforeSubmit: form.allowReviewBeforeSubmit,
        allowReopenExpired: form.allowReopenExpired,
        navigationMethod: form.navigationMethod,
        multipleSelectGrading: form.multipleSelectGrading,
        blankAnswerCaseSensitive: form.blankAnswerCaseSensitive,
        showCorrectAnswers: form.showCorrectAnswers,
        // The cohort is this teacher's own scope. The server resolves the same
        // scope independently and rejects the request if it names a section the
        // caller does not teach, so this narrows the request rather than
        // widening it.
        sectionCodes: access.sections.length ? access.sections : undefined,
        semester: access.semester ?? undefined,
      });
      setForm((current) => ({ ...current, title: "" }));
      await onCreated(created);
    } catch (requestError) {
      onError(
        requestError instanceof Error ? requestError.message : "The quiz could not be created.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create a quiz"
      subtitle="Created as a draft. Nothing reaches students until you schedule or open it."
      maxWidth="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="lms-quiz-form" isLoading={saving} loadingLabel="Creating">
            Create draft
          </Button>
        </>
      }
    >
      <form id="lms-quiz-form" onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          Week
          <select
            required
            value={form.weekId}
            onChange={(event) => setForm({ ...form, weekId: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            {weeks.map((week) => (
              <option key={week.id} value={week.id}>
                Week {week.weekNumber} · {week.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Title
          <input
            required
            maxLength={180}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-sm">
            Max marks
            <input
              required
              type="number"
              min={0}
              value={form.maxMarks}
              onChange={(event) => setForm({ ...form, maxMarks: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Pass mark
            <input
              type="number"
              min={0}
              value={form.passingMarks}
              onChange={(event) => setForm({ ...form, passingMarks: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Minutes
            <input
              required
              type="number"
              min={1}
              max={600}
              value={form.durationMinutes}
              onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Attempts
            <input
              type="number"
              min={1}
              max={20}
              value={form.attemptsAllowed}
              onChange={(event) => setForm({ ...form, attemptsAllowed: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Opens at
            <input
              required
              type="datetime-local"
              value={form.openAt}
              onChange={(event) => setForm({ ...form, openAt: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Closes at
            <input
              required
              type="datetime-local"
              value={form.closeAt}
              onChange={(event) => setForm({ ...form, closeAt: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm flex items-center">
            Randomize questions
            <input
              type="checkbox"
              checked={form.randomizeQuestions}
              onChange={(event) => setForm({ ...form, randomizeQuestions: event.target.checked })}
              className="ml-2 h-4 w-4 text-[var(--color-primary,#1d4ed8)] focus:ring-[var(--color-primary,#1d4ed8)] border-gray-300 rounded"
            />
          </label>
          <label className="text-sm flex items-center">
            Randomize options
            <input
              type="checkbox"
              checked={form.randomizeOptions}
              onChange={(event) => setForm({ ...form, randomizeOptions: event.target.checked })}
              className="ml-2 h-4 w-4 text-[var(--color-primary,#1d4ed8)] focus:ring-[var(--color-primary,#1d4ed8)] border-gray-300 rounded"
            />
          </label>
          <label className="text-sm flex items-center">
            Allow back navigation
            <input
              type="checkbox"
              checked={form.allowBackNavigation}
              onChange={(event) => setForm({ ...form, allowBackNavigation: event.target.checked })}
              className="ml-2 h-4 w-4 text-[var(--color-primary,#1d4ed8)] focus:ring-[var(--color-primary,#1d4ed8)] border-gray-300 rounded"
            />
          </label>
          <label className="text-sm flex items-center">
            Allow review before submit
            <input
              type="checkbox"
              checked={form.allowReviewBeforeSubmit}
              onChange={(event) => setForm({ ...form, allowReviewBeforeSubmit: event.target.checked })}
              className="ml-2 h-4 w-4 text-[var(--color-primary,#1d4ed8)] focus:ring-[var(--color-primary,#1d4ed8)] border-gray-300 rounded"
            />
          </label>
          <label className="text-sm flex items-center">
            Allow reopen expired attempts
            <input
              type="checkbox"
              checked={form.allowReopenExpired}
              onChange={(event) => setForm({ ...form, allowReopenExpired: event.target.checked })}
              className="ml-2 h-4 w-4 text-[var(--color-primary,#1d4ed8)] focus:ring-[var(--color-primary,#1d4ed8)] border-gray-300 rounded"
            />
          </label>
          <label className="text-sm">
            Navigation method
            <select
              value={form.navigationMethod}
              onChange={(event) =>
                setForm({
                  ...form,
                  navigationMethod: event.target.value as LmsNavigationMethod,
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="FREE">Free navigation</option>
              <option value="SEQUENTIAL">Sequential navigation</option>
            </select>
          </label>
          <label className="text-sm">
            Multiple-select grading
            <select
              value={form.multipleSelectGrading}
              onChange={(event) =>
                setForm({
                  ...form,
                  multipleSelectGrading: event.target.value as LmsMultipleSelectGrading,
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="EXACT">Exact match</option>
              <option value="PARTIAL_CREDIT">Partial credit</option>
            </select>
          </label>
          <label className="text-sm flex items-center">
            Case-sensitive blanks
            <input
              type="checkbox"
              checked={form.blankAnswerCaseSensitive}
              onChange={(event) => setForm({ ...form, blankAnswerCaseSensitive: event.target.checked })}
              className="ml-2 h-4 w-4 text-[var(--color-primary,#1d4ed8)] focus:ring-[var(--color-primary,#1d4ed8)] border-gray-300 rounded"
            />
          </label>
          <label className="text-sm flex items-center">
            Show correct answers
            <input
              type="checkbox"
              checked={form.showCorrectAnswers}
              onChange={(event) => setForm({ ...form, showCorrectAnswers: event.target.checked })}
              className="ml-2 h-4 w-4 text-[var(--color-primary,#1d4ed8)] focus:ring-[var(--color-primary,#1d4ed8)] border-gray-300 rounded"
            />
          </label>
        </div>
        <label className="block text-sm">
          When results are released
          <select
            value={form.resultReleasePolicy}
            onChange={(event) =>
              setForm({ ...form, resultReleasePolicy: event.target.value as LmsQuizDraftPolicy })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="AFTER_GRADING">Once everything is marked</option>
            <option value="IMMEDIATELY">As soon as the attempt is submitted</option>
            <option value="AFTER_CLOSE">When the quiz closes</option>
            <option value="MANUAL">When the teacher releases them</option>
          </select>
        </label>
        <p className="text-xs text-slate-500">
          The closing time is enforced by the server. An attempt left running when it passes is
          submitted automatically with whatever had been saved.
        </p>
        <p className="text-xs text-slate-500">
          Reaches{" "}
          {access.sections.length
            ? `sections ${access.sections.join(", ")}`
            : "the whole course"}
          {access.semester ? ` · semester ${access.semester}` : ""}.
        </p>
      </form>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

const AnnouncementsTab: React.FC<{
  courseId: string;
  access: CourseAccess;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}> = ({ courseId, access, onNotice, onError }) => {
  const [items, setItems] = useState<LmsAnnouncement[]>([]);
  const [serverCanManage, setServerCanManage] = useState(false);
  const [weeks, setWeeks] = useState<LmsWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    body: "",
    weekId: "",
    pinned: false,
    alsoSendMail: false,
    publishAt: "",
  });

  // The list response carries the server's own verdict for this caller; the
  // course overview's verdict is the cross-check. Both agreeing means the form is
  // shown, and the POST is authorised server-side regardless.
  const mayPost = serverCanManage && access.canManage;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [announcementResult, weekResult] = await Promise.all([
        fetchAnnouncements(courseId),
        fetchCourseWeeks(courseId),
      ]);
      setItems(announcementResult.announcements);
      setServerCanManage(announcementResult.canManage);
      setWeeks(weekResult.weeks);
      setLoadFailed(false);
    } catch (requestError) {
      setLoadFailed(true);
      onError(
        requestError instanceof Error ? requestError.message : "Announcements could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await createAnnouncement(courseId, {
        title: form.title,
        body: form.body,
        weekId: form.weekId || undefined,
        pinned: form.pinned,
        alsoSendMail: form.alsoSendMail,
        publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : undefined,
      });
      setForm({ title: "", body: "", weekId: "", pinned: false, alsoSendMail: false, publishAt: "" });
      await load();
      onNotice(
        form.publishAt
          ? `Announcement scheduled for ${new Date(form.publishAt).toLocaleString()}.`
          : `Announcement published to ${result.announcement.recipients} student(s).`,
      );
    } catch (requestError) {
      onError(
        requestError instanceof Error ? requestError.message : "The announcement could not be posted.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <Card title="Announcements" icon={faBullhorn}>
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : loadFailed ? (
          <EmptyState
            icon={faTriangleExclamation}
            title="Announcements could not be loaded"
            description="The server did not return this course's announcements. Nothing has been shown in its place."
            actionLabel="Retry"
            actionIcon={faArrowRotateRight}
            onAction={() => void load()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={faBullhorn}
            title="Nothing posted yet"
            description={
              mayPost
                ? "Announcements you publish appear here and reach the cohort immediately."
                : "The teaching team has posted nothing for this course yet."
            }
          />
        ) : (
          <ul className="space-y-4">
            {items.map((announcement) => (
              <li key={announcement.id} className="border-l-2 border-slate-200 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    {announcement.pinned && (
                      <FontAwesomeIcon
                        icon={faThumbtack}
                        className="text-xs text-[var(--color-primary)]"
                        aria-label="Pinned"
                      />
                    )}
                    {announcement.title}
                  </p>
                  {announcement.pinned && <Badge variant="primary">Pinned</Badge>}
                  {announcement.scheduled ? (
                    <Badge variant="info">
                      scheduled {new Date(announcement.publishAt || "").toLocaleString()}
                    </Badge>
                  ) : (
                    <Badge variant="success">published</Badge>
                  )}
                  {announcement.mailSentAt && (
                    <Badge variant="neutral">
                      mailed {announcement.mailRecipientCount} student(s)
                    </Badge>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                  {announcement.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Post an announcement" icon={faBullhorn}>
        {!mayPost ? (
          <EmptyState
            icon={faBullhorn}
            title="Read-only"
            description="Posting is limited to the teaching team for this course. The server checks the course, section and semester on every post regardless of what this view shows."
          />
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm">
              Title
              <input
                required
                maxLength={180}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Message
              <textarea
                required
                rows={5}
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Attach to week (optional)
              <select
                value={form.weekId}
                onChange={(event) => setForm({ ...form, weekId: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">Whole course</option>
                {weeks.map((week) => (
                  <option key={week.id} value={week.id}>
                    Week {week.weekNumber} · {week.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Publish at (optional)
              <input
                type="datetime-local"
                value={form.publishAt}
                onChange={(event) => setForm({ ...form, publishAt: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(event) => setForm({ ...form, pinned: event.target.checked })}
              />
              Pin to the top
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.alsoSendMail}
                onChange={(event) => setForm({ ...form, alsoSendMail: event.target.checked })}
              />
              Also send College Mail
            </label>
            <Button type="submit" fullWidth isLoading={saving} loadingLabel="Posting">
              Post announcement
            </Button>
            <p className="text-xs text-slate-500">
              Reaches{" "}
              {access.sections.length
                ? `sections ${access.sections.join(", ")}`
                : "the whole course"}
              , counted from real enrolments when it posts.
            </p>
          </form>
        )}
      </Card>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

const AnalyticsTab: React.FC<{ courseId: string; onError: (message: string) => void }> = ({
  courseId,
  onError,
}) => {
  const [engagement, setEngagement] = useState<LmsEngagement | null>(null);
  const [risks, setRisks] = useState<LmsRiskSignals | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [engagementResult, riskResult] = await Promise.all([
        fetchEngagement(courseId),
        fetchRiskSignals(courseId),
      ]);
      setEngagement(engagementResult);
      setRisks(riskResult);
      setLoadFailed(false);
    } catch (requestError) {
      // Engagement and risk signals are two separate reads; the failure is
      // reported as a failure rather than rendered as zeroes, which would look
      // like a quiet, unengaged course.
      setLoadFailed(true);
      onError(
        requestError instanceof Error
          ? requestError.message
          : "This course's activity could not be read.",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (loadFailed || !engagement) {
    return (
      <Card>
        <EmptyState
          icon={faTriangleExclamation}
          title="Activity could not be read"
          description="The recorded activity for this course was unavailable. No figures have been shown in its place."
          actionLabel="Retry"
          actionIcon={faArrowRotateRight}
          onAction={() => void load()}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Roster"
          value={String(engagement.rosterSize)}
          detail={`${engagement.activeStudents} active`}
        />
        <Metric
          label="Weeks published"
          value={`${engagement.weeks.published} / ${engagement.weeks.total}`}
          detail={`${engagement.materialsPublished} material(s) released`}
        />
        <Metric
          label="Quiz participation"
          value={formatPercentage(engagement.quizzes.participationRate)}
          detail={`${engagement.quizzes.attempts} attempt(s) across ${engagement.quizzes.total} quiz(es)`}
        />
        <Metric
          label="Assignment submission"
          value={formatPercentage(engagement.assignments.submissionRate)}
          detail={`${engagement.assignments.late} late · ${engagement.assignments.missing} missing`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Quiz states"
          value={`${engagement.quizzes.open} open`}
          detail={`${engagement.quizzes.scheduled} scheduled · ${engagement.quizzes.closed} closed`}
        />
        <Metric
          label="Waiting to be marked"
          value={String(engagement.quizzes.pendingGrading)}
          detail="Written answers across all quizzes"
        />
        <Metric
          label="Average quiz score"
          value={formatPercentage(engagement.quizzes.averageScore)}
          detail="From graded attempts only"
        />
        <Metric
          label="Grade records"
          value={`${engagement.grades.recorded}`}
          detail={`${engagement.grades.pending} not yet marked · ${formatPercentage(engagement.grades.averagePercentage)} average`}
        />
      </div>

      <Card
        title="Signals worth a look"
        icon={faTriangleExclamation}
        subtitle="Observations from real activity. They change nothing on their own — they are prompts to review."
      >
        {!risks || risks.signals.length === 0 ? (
          <p className="text-sm text-slate-500">
            No signals. Nothing in the recorded activity suggests a need for review.
          </p>
        ) : (
          <ul className="space-y-4">
            {risks.signals.map((signal) => (
              <li
                key={signal.key}
                className="rounded-lg border border-slate-200 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      signal.severity === "high"
                        ? "danger"
                        : signal.severity === "medium"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {signal.severity}
                  </Badge>
                  <p className="text-sm font-medium text-slate-900">{signal.message}</p>
                </div>
                <p className="mt-1 text-sm text-slate-600">{signal.interpretation}</p>
                {signal.students.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    {signal.students
                      .map((student) => {
                        const detail =
                          student.percentage !== null && student.percentage !== undefined
                            ? ` (${student.percentage}%)`
                            : "";
                        return `${student.name || student.studentId || "Student"}${detail}`;
                      })
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string; detail?: string }> = ({
  label,
  value,
  detail,
}) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
  </div>
);

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function availabilityVariant(
  availability: string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  if (availability === "OPEN") return "success";
  if (availability === "SCHEDULED" || availability === "DRAFT") return "info";
  return "neutral";
}

const AttemptStatusBadge: React.FC<{ status: string; pending: number }> = ({
  status,
  pending,
}) => {
  if (status === "IN_PROGRESS") return <Badge variant="info">In progress</Badge>;
  if (status === "AUTO_SUBMITTED") return <Badge variant="warning">Auto-submitted</Badge>;
  if (status === "SUBMITTED") return <Badge variant="warning">Awaiting marking</Badge>;
  if (pending > 0) return <Badge variant="warning">{pending} to mark</Badge>;
  return <Badge variant="success">Graded</Badge>;
};

/**
 * The in-progress question being authored.
 *
 * The draft sent to the server accepts `correctAnswer: unknown` because a
 * free-text key is a string and a choice key is a list of option ids. While the
 * form is open the key really is a list of ids, so the editor holds that precise
 * shape and narrows once on submit.
 */
interface QuestionAuthoringState extends Omit<LmsQuestionDraft, "correctAnswer"> {
  correctAnswer?: string[];
}

type LmsQuestionType = LmsQuestionDraft["type"];
type LmsQuizDraftPolicy =
  | "IMMEDIATELY"
  | "AFTER_CLOSE"
  | "AFTER_GRADING"
  | "MANUAL";

type LmsNavigationMethod = "FREE" | "SEQUENTIAL";
type LmsMultipleSelectGrading = "EXACT" | "PARTIAL_CREDIT";

