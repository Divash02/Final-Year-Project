import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  faBookOpen,
  faBullhorn,
  faChartLine,
  faClipboardList,
  faFilePen,
  faGraduationCap,
  faListCheck,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { EmptyState } from "../../ui/EmptyState";
import { QuizAttemptRunner } from "./QuizAttemptRunner";
import {
  fetchAnnouncements,
  fetchAttemptResult,
  fetchCourseOverview,
  fetchCourseProgress,
  fetchCourseQuizzes,
  fetchCourseWeeks,
  fetchGradebook,
  fetchLmsCourses,
  fetchWeek,
  formatDeadline,
  formatMark,
  formatPercentage,
} from "../../../services/lmsApi";
import type {
  LmsAnnouncementList,
  LmsCourseIndex,
  LmsCourseOverview,
  LmsCourseSummary,
  LmsGradebook,
  LmsProgressResponse,
  LmsQuizList,
  LmsStudentResult,
  LmsWeek,
  LmsWeekDetail,
} from "../../../types/lms";

type StudentTab = "overview" | "quizzes" | "grades" | "announcements";

const TABS: { id: StudentTab; label: string; icon: typeof faBookOpen }[] = [
  { id: "overview", label: "Course", icon: faBookOpen },
  { id: "quizzes", label: "Quizzes", icon: faClipboardList },
  { id: "grades", label: "My grades", icon: faGraduationCap },
  { id: "announcements", label: "Announcements", icon: faBullhorn },
];

/**
 * The student LMS workspace.
 *
 * The student's side of one course. It is deliberately a reader: it shows what the
 * server said is available, what it said is due, and what it has released. There
 * is no countdown, no pass/fail judgement and no percentage computed here — those
 * are all answers the server gives, and the only thing this view decides is what
 * to say about an answer the server withheld.
 */
export const StudentLmsWorkspace: React.FC<{
  courseId: string;
  onCourseChange?: (courseId: string) => void;
}> = ({ courseId, onCourseChange }) => {
  const [tab, setTab] = useState<StudentTab>("overview");
  const [error, setError] = useState("");

  if (!courseId) {
    return (
      <section className="cos-page">
        <EmptyState
          icon={faBookOpen}
          title="No course selected"
          description="Choose one of your courses to see its weeks, quizzes and results."
        />
      </section>
    );
  }

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div className="min-w-0">
          <p className="cos-eyebrow">Learning</p>
          <h1 className="cos-page-title">My courses</h1>
          <p className="cos-page-subtitle">
            Deadlines and results shown here are the ones the server has recorded.
          </p>
        </div>
        {onCourseChange && (
          <Button variant="secondary" onClick={() => onCourseChange(courseId)}>
            Change course
          </Button>
        )}
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Course sections">
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

      {tab === "overview" && (
        <StudentCourseTab courseId={courseId} onGoToQuizzes={() => setTab("quizzes")} />
      )}
      {tab === "quizzes" && <StudentQuizzesTab courseId={courseId} onError={setError} />}
      {tab === "grades" && <StudentGradesTab courseId={courseId} />}
      {tab === "announcements" && <StudentAnnouncementsTab courseId={courseId} />}

      {error && (
        <div className="mt-4">
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Course spine                                                        */
/* ------------------------------------------------------------------ */

const StudentCourseTab: React.FC<{ courseId: string; onGoToQuizzes: () => void }> = ({
  courseId,
  onGoToQuizzes,
}) => {
  const [overview, setOverview] = useState<LmsCourseOverview | null>(null);
  const [weeks, setWeeks] = useState<LmsWeek[]>([]);
  const [details, setDetails] = useState<Record<string, LmsWeekDetail>>({});
  /**
   * The server's clock, as reported by the course overview.
   *
   * Every "in 3 days" on this page is measured from here rather than from
   * `Date.now()`, so a view rendered on a device with a skewed clock still
   * agrees with the deadlines the server is actually enforcing.
   */
  const serverNow = useMemo(() => {
    const reported = overview?.serverTime;
    const parsed = reported ? new Date(reported).getTime() : Number.NaN;
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }, [overview]);

  useEffect(() => {
    let active = true;
    setOverview(null);
    setDetails({});
    void (async () => {
      try {
        const [overviewResult, weekResult] = await Promise.all([
          fetchCourseOverview(courseId),
          fetchCourseWeeks(courseId),
        ]);
        if (!active) return;
        setOverview(overviewResult);
        setWeeks(weekResult.weeks);
        const loaded = await Promise.all(
          weekResult.weeks.map(
            async (week): Promise<readonly [string, LmsWeekDetail] | null> => {
              try {
                return [week.id, await fetchWeek(week.id)];
              } catch {
                // A week the student may not open should not hide the others.
                return null;
              }
            },
          ),
        );
        if (!active) return;
        const pairs = loaded.filter(
          (entry): entry is readonly [string, LmsWeekDetail] => Boolean(entry),
        );
        setDetails(Object.fromEntries(pairs));
      } catch {
        // The empty state is the honest response to a load that did not complete.
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId]);

  return (
    <div className="space-y-4">
      {overview && (
        <Card
          title={overview.course.name}
          subtitle={`${overview.course.code}${
            overview.scope.sectionCodes.length
              ? ` · Section ${overview.scope.sectionCodes.join(", ")}`
              : ""
          }`}
          icon={faBookOpen}
        >
          <p className="text-sm text-slate-600">
            {overview.publishedWeekCount} of {overview.weekCount} weeks published.
          </p>
        </Card>
      )}

      {weeks.length === 0 ? (
        <EmptyState
          icon={faBookOpen}
          title="No weeks yet"
          description="Your teacher has not published any weeks for this course."
        />
      ) : (
        weeks.map((week) => {
          const detail = details[week.id];
          const isOpen = week.state !== "DRAFT" && week.state !== "SCHEDULED";
          return (
            <Card
              key={week.id}
              title={`Week ${week.weekNumber}: ${week.title}`}
              subtitle={
                isOpen
                  ? [
                      week.materialCount ? `${week.materialCount} materials` : null,
                      week.quizCount ? `${week.quizCount} quizzes` : null,
                      week.assignmentCount ? `${week.assignmentCount} assignments` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || week.description || undefined
                  : `Opens ${formatDeadline(week.releaseAt, serverNow)}`
              }
              icon={faBookOpen}
              bodyClassName="space-y-4"
            >
              {!isOpen ? (
                <p className="text-sm text-slate-500">
                  This week is not open yet. The server has not released it, so nothing here can
                  be read or downloaded.
                </p>
              ) : (
                <>
                  {detail && detail.week.objectives.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Learning outcomes</h3>
                      <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm text-slate-600">
                        {detail.week.objectives.map((objective) => (
                          <li key={objective.id}>{objective.text}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {detail && detail.week.materials.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Materials</h3>
                      <ul className="mt-1.5 space-y-1.5 text-sm">
                        {detail.week.materials.map((material) => (
                          <li key={material.id} className="flex items-center justify-between gap-3">
                            <span className="min-w-0 flex-1 truncate text-slate-700">
                              {material.title}
                            </span>
                            {material.state && material.state !== "PUBLISHED" ? (
                              <Badge variant="neutral">{material.state.toLowerCase()}</Badge>
                            ) : material.downloadUrl ? (
                              <a
                                href={material.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 text-xs font-medium text-[var(--color-primary)] hover:underline"
                              >
                                Open
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {detail && detail.week.assignments.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Assignments</h3>
                      <ul className="mt-1.5 space-y-1.5 text-sm">
                        {detail.week.assignments.map((assignment) => {
                          // `isPastDue` and `submissionWindowState` are the server's
                          // verdicts. They are rendered, never recomputed here, because
                          // a locally derived deadline would disagree with the one that
                          // actually governs the submission.
                          const late = assignment.isPastDue;
                          const notYet = assignment.opensIn === "FUTURE";
                          return (
                            <li
                              key={assignment.id}
                              className="flex flex-wrap items-center justify-between gap-3"
                            >
                              <span className="min-w-0 flex-1 truncate text-slate-700">
                                {assignment.title}
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                <span className="text-xs text-slate-500">
                                  {assignment.maxMarks} marks ·{" "}
                                  {assignment.dueAt
                                    ? `due ${formatDeadline(assignment.dueAt, serverNow)}`
                                    : "no due date"}
                                </span>
                                {notYet ? (
                                  <Badge variant="info">Opens soon</Badge>
                                ) : late ? (
                                  <Badge variant="danger">Past due</Badge>
                                ) : assignment.submissionWindowState === "CLOSED" ? (
                                  <Badge variant="neutral">Closed</Badge>
                                ) : (
                                  <Badge variant="success">Open</Badge>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {detail && detail.week.quizzes.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Quizzes</h3>
                      <ul className="mt-1.5 space-y-1.5 text-sm text-slate-700">
                        {detail.week.quizzes.map((quiz) => (
                          <li key={quiz.id} className="flex items-center justify-between gap-3">
                            <span className="min-w-0 flex-1 truncate">{quiz.title}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              {quiz.maxMarks} marks
                              <Badge variant={quiz.availability === "OPEN" ? "success" : "neutral"}>
                                {quiz.availability.toLowerCase()}
                              </Badge>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-3"
                        onClick={onGoToQuizzes}
                      >
                        Go to quizzes
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Quizzes                                                             */
/* ------------------------------------------------------------------ */

const StudentQuizzesTab: React.FC<{ courseId: string; onError: (message: string) => void }> = ({
  courseId,
  onError,
}) => {
  const [quizzes, setQuizzes] = useState<LmsQuizList | null>(null);
  const [sitting, setSitting] = useState<{ id: string; title: string } | null>(null);
  const [result, setResult] = useState<LmsStudentResult | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setQuizzes(await fetchCourseQuizzes(courseId));
    } catch (requestError) {
      onError(
        requestError instanceof Error ? requestError.message : "Quizzes could not be loaded.",
      );
    }
  }, [courseId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const openResult = async (attemptId: string) => {
    setBusyId(attemptId);
    try {
      setResult(await fetchAttemptResult(attemptId));
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "That result could not be opened.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (sitting) {
    return (
      <QuizAttemptRunner
        quizId={sitting.id}
        quizTitle={sitting.title}
        onClose={() => {
          setSitting(null);
          void load();
        }}
        onFinished={(finished) => {
          setResult(finished);
          void load();
        }}
      />
    );
  }

  if (result) {
    return (
      <div className="space-y-4">
        <Alert
          variant={result.released ? "success" : "info"}
          detail={result.reason || undefined}
          onDismiss={() => setResult(null)}
        >
          {result.released
            ? `${result.title}: ${formatMark(result.attempt.awardedMarks, result.maxMarks)} (${formatPercentage(result.attempt.percentage)}).`
            : `${result.title} is marked, but the result has not been released yet.`}
        </Alert>
        <Button variant="secondary" onClick={() => setResult(null)}>
          Back to quizzes
        </Button>
      </div>
    );
  }

  if (!quizzes) {
    return <p className="text-sm text-slate-500">Loading quizzes…</p>;
  }

  if (quizzes.quizzes.length === 0) {
    return (
      <EmptyState
        icon={faClipboardList}
        title="No quizzes"
        description="There is no quiz published for your section yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      {quizzes.quizzes.map((quiz) => {
        const now = new Date(quizzes.serverTime).getTime();
        const canStart =
          quiz.availability === "OPEN" && (quiz.attemptsUsed ?? 0) < quiz.attemptsAllowed;
        return (
          <Card
            key={quiz.id}
            title={quiz.title}
            subtitle={quiz.instructions || undefined}
            icon={faClipboardList}
            headerAction={
              <Badge
                variant={
                  quiz.availability === "OPEN"
                    ? "success"
                    : quiz.availability === "SCHEDULED"
                      ? "info"
                      : "neutral"
                }
              >
                {quiz.availability.toLowerCase()}
              </Badge>
            }
          >
            {quiz.description && (
              <p className="text-sm leading-relaxed text-slate-600">{quiz.description}</p>
            )}

            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Marks</dt>
                <dd className="font-medium text-slate-900">{quiz.maxMarks}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Time limit</dt>
                <dd className="font-medium text-slate-900">
                  {quiz.durationMinutes ? `${quiz.durationMinutes} min` : "None"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Attempts</dt>
                <dd className="font-medium text-slate-900">
                  {quiz.attemptsUsed ?? 0} of {quiz.attemptsAllowed} used
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  {quiz.availableUntil ? "Closes" : "Opens"}
                </dt>
                <dd className="font-medium text-slate-900">
                  {formatDeadline(
                    quiz.availableUntil || quiz.availableFrom,
                    now,
                  )}
                </dd>
              </div>
            </dl>

            {quiz.availabilityReason && (
              <p className="mt-3 text-xs text-slate-500">{quiz.availabilityReason}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                disabled={!canStart}
                isLoading={busyId === quiz.id}
                onClick={() => setSitting({ id: quiz.id, title: quiz.title })}
              >
                {quiz.hasLiveAttempt
                  ? "Resume attempt"
                  : (quiz.attemptsUsed ?? 0) > 0
                    ? "Start another attempt"
                    : "Start quiz"}
              </Button>
              {quiz.availability !== "OPEN" && (
                <span className="text-xs text-slate-500">
                  The server has this quiz as {quiz.availability.toLowerCase()}.
                </span>
              )}
            </div>

            {quiz.attempts && quiz.attempts.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <h3 className="text-sm font-semibold text-slate-900">Your attempts</h3>
                <ul className="mt-1.5 space-y-1.5 text-sm">
                  {quiz.attempts.map((attempt) => (
                    <li
                      key={attempt.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2 text-slate-700">
                        Attempt {attempt.attemptNumber}
                        {attempt.autoSubmitted && <Badge variant="warning">Auto-submitted</Badge>}
                        {attempt.inProgress && <Badge variant="info">In progress</Badge>}
                      </span>
                      <span className="flex items-center gap-3">
                        {/* A withheld mark is absent, not zero, so this renders the
                            server's own verdict rather than an inferred one. */}
                        <span className="text-slate-700">
                          {attempt.awardedMarks === undefined
                            ? "Not released"
                            : formatMark(attempt.awardedMarks, attempt.maxMarks)}
                        </span>
                        {attempt.status !== "IN_PROGRESS" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            isLoading={busyId === attempt.id}
                            onClick={() => void openResult(attempt.id)}
                          >
                            View
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Grades                                                              */
/* ------------------------------------------------------------------ */

const StudentGradesTab: React.FC<{ courseId: string }> = ({ courseId }) => {
  const [gradebook, setGradebook] = useState<LmsGradebook | null>(null);
  const [progress, setProgress] = useState<LmsProgressResponse | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [grades, progressResult] = await Promise.all([
          fetchGradebook(courseId),
          fetchCourseProgress(courseId),
        ]);
        if (!active) return;
        setGradebook(grades);
        setProgress(progressResult);
      } catch {
        // Empty state below.
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId]);

  // The server returns only this student's own row to a student, so `students[0]`
  // is the whole gradebook — there is no cohort to leak here and none is rendered.
  const me = gradebook?.students?.[0];
  const summary = progress?.students?.[0];

  if (!gradebook) {
    return <p className="text-sm text-slate-500">Loading your grades…</p>;
  }

  if (!me || me.rows.length === 0) {
    return (
      <EmptyState
        icon={faGraduationCap}
        title="Nothing graded yet"
        description="Your results appear here once your teacher records them and the release policy allows it."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card title="Overall" icon={faChartLine}>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Marks</p>
            <p className="text-2xl font-semibold text-slate-900">
              {formatMark(summary?.obtainedMarks, summary?.totalMarks)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Percentage</p>
            <p className="text-2xl font-semibold text-slate-900">
              {formatPercentage(summary?.percentage ?? me.percentage)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Awaiting marking</p>
            <p className="text-2xl font-semibold text-slate-900">
              {summary?.pendingGrades ?? me.pendingCount}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Quiz attempts</p>
            <p className="text-2xl font-semibold text-slate-900">
              {summary?.quizAttempts ?? 0}
            </p>
          </div>
        </div>
      </Card>

      <Card title="Assessments" icon={faListCheck} padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Assessment</th>
                <th className="px-4 py-2.5">Marks</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Feedback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {me.rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-slate-900">{row.title}</span>
                    {row.weekNumber !== null && (
                      <span className="ml-1.5 text-xs text-slate-400">Week {row.weekNumber}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {/* `null` means no mark has been released; it is never shown as 0. */}
                    {row.marksObtained === null
                      ? "—"
                      : `${row.marksObtained} / ${row.maxMarks}`}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={
                        row.marksObtained === null ? "warning" : row.isLate ? "warning" : "success"
                      }
                    >
                      {row.marksObtained === null
                        ? row.status.toLowerCase()
                        : row.isLate
                          ? "graded late"
                          : row.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{row.feedback || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {summary && summary.lateSubmissions > 0 && (
        <Alert variant="info">
          {summary.lateSubmissions} of your submissions were recorded as late.
        </Alert>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

const StudentAnnouncementsTab: React.FC<{ courseId: string }> = ({ courseId }) => {
  const [announcements, setAnnouncements] = useState<LmsAnnouncementList | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (active) setAnnouncements(await fetchAnnouncements(courseId));
      } catch {
        // Empty state below.
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId]);

  const items = useMemo(() => announcements?.announcements ?? [], [announcements]);

  if (!announcements) {
    return <p className="text-sm text-slate-500">Loading announcements…</p>;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={faBullhorn}
        title="No announcements"
        description="Your teacher has not posted anything for this course."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((announcement) => (
        <Card
          key={announcement.id}
          title={announcement.title}
          subtitle={
            announcement.publishedAt || announcement.publishAt
              ? new Date(
                  (announcement.publishedAt || announcement.publishAt) as string,
                ).toLocaleString()
              : undefined
          }
          icon={announcement.pinned ? faBullhorn : faFilePen}
          headerAction={announcement.pinned ? <Badge variant="info">Pinned</Badge> : undefined}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {announcement.body}
          </p>
        </Card>
      ))}
    </div>
  );
};