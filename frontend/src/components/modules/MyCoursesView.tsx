import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  faArrowRight,
  faArrowRotateRight,
  faBookOpen,
  faCalendarCheck,
  faClockRotateLeft,
  faFilter,
  faHourglassHalf,
  faLayerGroup,
  faMagnifyingGlass,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { CardSkeleton } from "../ui/Skeleton";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { fetchMyCourses, formatDeadline } from "../../services/lmsApi";
import type {
  MyCourseCard,
  MyCoursesResponse,
} from "../../types/lms";

/**
 * My Courses.
 *
 * The student's academic home: the courses they are genuinely attached to, split
 * into In Progress, Past and Upcoming. Every card on this page is built server-side
 * from `Enrollment` rows belonging to the signed-in student — there is no client
 * fabrication of sample data.
 */

type Bucket = "inProgress" | "past" | "future";

const TABS: { id: Bucket; label: string; icon: typeof faBookOpen }[] = [
  { id: "inProgress", label: "In Progress", icon: faBookOpen },
  { id: "past", label: "Past", icon: faClockRotateLeft },
  { id: "future", label: "Upcoming", icon: faCalendarCheck },
];

const EMPTY_COPY: Record<Bucket, { title: string; description: string }> = {
  inProgress: {
    title: "No courses in progress",
    description:
      "You are not enrolled in any course for the current semester. Courses appear here once the academic office enrols you.",
  },
  past: {
    title: "No past courses",
    description:
      "You have no completed course records yet. Your study history is built from your real enrolments.",
  },
  future: {
    title: "No upcoming courses",
    description:
      "You have no upcoming registration on record. Nothing is shown here until the academic office registers you for a later semester.",
  },
};

const SEMESTERS = Array.from({ length: 6 }, (_, i) => ({
  number: i + 1,
  label: "Semester " + (i + 1),
  level: Math.ceil((i + 1) / 2),
}));

export const MyCoursesView: React.FC = () => {
  const { openCourse, currentUser } = useCollegeOS();
  const [data, setData] = useState<MyCoursesResponse | null>(null);
  const [tab, setTab] = useState<Bucket>("inProgress");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedSemester, setSelectedSemester] = useState<number | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchMyCourses());
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Your courses could not be loaded.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = data ? data.courses[tab] : [];
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = cards;
    if (needle) {
      list = list.filter((card) =>
        [card.code, card.name, card.department || "", card.program || ""]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }
    list = list.filter((card) => {
      if (selectedSemester === null) return true;
      return card.semester === selectedSemester;
    });
    list = list.filter((card) => {
      if (selectedLevel === null) return true;
      if (card.semester === null || card.semester === undefined) return false;
      return Math.ceil(card.semester / 2) === selectedLevel;
    });
    return list;
  }, [cards, query, selectedSemester, selectedLevel]);

  const activeFilterCount =
    (selectedSemester ? 1 : 0) +
    (selectedLevel ? 1 : 0) +
    (query.trim() ? 1 : 0);

  const resetFilters = () => {
    setQuery("");
    setSelectedSemester(null);
    setSelectedLevel(null);
  };

  const totalCourses = useMemo(() => {
    if (!data) return 0;
    return (
      data.courses.inProgress.length +
      data.courses.past.length +
      data.courses.future.length
    );
  }, [data]);

  const totalSemesters = useMemo(() => {
    if (!data) return 0;
    const set = new Set<number>();
    [...data.courses.inProgress, ...data.courses.past, ...data.courses.future].forEach(
      (c) => {
        if (c.semester !== null && c.semester !== undefined) set.add(c.semester);
      },
    );
    return set.size;
  }, [data]);

  const totalLevels = useMemo(() => {
    if (!data) return 0;
    const set = new Set<number>();
    [...data.courses.inProgress, ...data.courses.past, ...data.courses.future].forEach(
      (c) => {
        if (c.semester !== null && c.semester !== undefined) {
          set.add(Math.ceil(c.semester / 2));
        }
      },
    );
    return set.size;
  }, [data]);

  const totalCredits = useMemo(() => {
    if (!data) return 0;
    return [...data.courses.inProgress, ...data.courses.past, ...data.courses.future].reduce(
      (sum, c) => sum + (c.credits || 0),
      0,
    );
  }, [data]);

  const period = data?.period;
  const periodLabel = period
    ? [
        period.academicYear ? `Academic year ${period.academicYear}` : null,
        period.semester ? `Semester ${period.semester}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div className="min-w-0">
          <p className="cos-eyebrow">ACADEMIC WORKSPACE</p>
          <h1 className="cos-page-title">Courses &amp; Learning</h1>
          <p className="cos-page-subtitle">
            {periodLabel
              ? `${periodLabel} — shown for ${currentUser?.name || "your account"}.`
              : "Explore your academic catalogue, discover course content, and manage semester-based learning."}
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="cos-card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Courses</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalCourses}</p>
        </div>
        <div className="cos-card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Semesters</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalSemesters}</p>
        </div>
        <div className="cos-card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Academic Levels</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalLevels}</p>
        </div>
        <div className="cos-card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Credits</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalCredits}</p>
        </div>
      </div>

{/*
        The period is institutional configuration, not a browser guess. When the
        academic office has not published it, the server says so and the page
        repeats that instead of implying a semester it inferred.
      */}
      {period?.note && (
        <Alert
          variant="warning"
          detail={period.basis === "RECORDS" ? "Derived from your records" : undefined}
        >
          {period.note}
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <nav className="flex gap-4" aria-label="Course period">
          {TABS.map((entry) => {
            const count = data?.counts[entry.id] ?? 0;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                aria-current={tab === entry.id ? "page" : undefined}
                className={`inline-flex items-center gap-2 border-b-2 px-2 py-3 text-sm font-medium ${
                  tab === entry.id
                    ? "border-[var(--color-primary)] text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <FontAwesomeIcon icon={entry.icon} className="h-4 w-4" aria-hidden="true" />
                {entry.label}
                {data && (
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {error ? (
        <EmptyState
          icon={faTriangleExclamation}
          title="Your courses could not be loaded"
          description={`${error} Nothing has been substituted for your course list — retry once the connection is restored.`}
          actionLabel="Retry"
          actionIcon={faArrowRotateRight}
          onAction={() => void load()}
        />
      ) : !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={query.trim() || selectedSemester || selectedLevel ? faLayerGroup : TABS.find((entry) => entry.id === tab)!.icon}
          title={query.trim() || selectedSemester || selectedLevel ? "No matching courses" : EMPTY_COPY[tab].title}
          description={
            query.trim() || selectedSemester || selectedLevel
              ? "No course in this list matches your filter criteria. Try adjusting your search or filters."
              : EMPTY_COPY[tab].description
          }
          actionLabel={query.trim() || selectedSemester || selectedLevel ? "Clear Filters" : undefined}
          onAction={query.trim() || selectedSemester || selectedLevel ? resetFilters : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((card) => (
            <CourseCard
              key={`${card.courseId}:${card.semester}:${card.academicYear}`}
              card={card}
              serverTime={data.serverTime}
              onOpen={() => openCourse(card.courseId)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Course card                                                         */
/* ------------------------------------------------------------------ */

const CourseCard: React.FC<{
  card: MyCourseCard;
  serverTime: string;
  onOpen: () => void;
}> = ({ card, serverTime, onOpen }) => {
  const now = new Date(serverTime).getTime();
  const { metrics } = card;

  const subtitle = [
    card.semester !== null ? `Semester ${card.semester}` : "Semester not recorded",
    card.academicYear || null,
    card.sectionCodes.length ? `Section ${card.sectionCodes.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="cos-card flex flex-col">
      <div className="cos-card-body flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {card.code}
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-slate-900">
              {card.name}
            </h2>
          </div>
          {card.credits !== null && (
            <Badge variant="neutral" hideDot>
              {card.credits} credits
            </Badge>
          )}
        </div>

        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}

        {/* A course with no recorded semester is never presented as current. */}
        {card.period.undated && (
          <Alert variant="warning">This course has no recorded semester.</Alert>
        )}

        {card.relation !== "OVERSIGHT" && card.faculty.length > 0 && (
          <p className="text-xs text-slate-600">
            {card.faculty.map((person) => person.name).join(", ")}
          </p>
        )}

        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Metric
            label="Assignments"
            value={
              metrics.assignments.available
                ? `${metrics.assignments.submitted} of ${metrics.assignments.total} submitted`
                : null
            }
          />
          <Metric
            label="Quizzes"
            value={
              metrics.quizzes.available
                ? `${metrics.quizzes.attempted} of ${metrics.quizzes.total} attempted`
                : null
            }
          />
          <Metric
            label="Attendance"
            value={
              metrics.attendance.recorded && metrics.attendance.percentage !== null
                ? `${metrics.attendance.percentage}%`
                : null
            }
          />
          <Metric
            label="Progress"
            value={
              metrics.progress.available && metrics.progress.percentage !== null
                ? `${metrics.progress.percentage}%`
                : null
            }
          />
        </dl>

        {metrics.upcomingDeadline && (
          <p className="flex items-center gap-2 text-xs text-slate-600">
            <FontAwesomeIcon
              icon={faHourglassHalf}
              className="text-slate-400"
              aria-hidden="true"
            />
            <span>
              {metrics.upcomingDeadline.kind === "ASSIGNMENT" ? "Assignment" : "Quiz"}{" "}
              {formatDeadline(metrics.upcomingDeadline.at, now)}
            </span>
          </p>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] bg-slate-50 px-5 py-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={relationVariant(card)}>{relationLabel(card)}</Badge>
          {card.enrollmentStatus === "DROPPED" && (
            <Badge variant="danger">Dropped</Badge>
          )}
          {card.enrollmentStatus === "COMPLETED" && (
            <Badge variant="success">Completed</Badge>
          )}
        </div>
        {/* Opens the existing Course Workspace — this page introduces no second
            course system and no course content of its own. */}
        <Button size="sm" variant="secondary" icon={faArrowRight} onClick={onOpen}>
          Open
        </Button>
      </footer>
    </article>
  );
};

/**
 * One labelled figure.
 *
 * `null` renders as an explicit "not recorded" rather than `0` or `—`, so an
 * institution that retained nothing is never shown a fabricated value.
 */
const Metric: React.FC<{ label: string; value: string | null }> = ({
  label,
  value,
}) => (
  <div>
    <dt className="text-slate-500">{label}</dt>
    <dd className="mt-0.5 font-medium text-slate-900">
      {value === null ? (
        <span className="font-normal text-slate-400">Not recorded</span>
      ) : (
        value
      )}
    </dd>
  </div>
);

function relationLabel(card: MyCourseCard): string {
  switch (card.relation) {
    case "ENROLLED":
      return "Enrolled";
    case "TEACHING":
      return "Teaching";
    case "ENROLLED_AND_TEACHING":
      return "Enrolled and teaching";
    case "OVERSIGHT":
      return "Oversight";
    default:
      return "Course";
  }
}

function relationVariant(
  card: MyCourseCard,
): "primary" | "info" | "neutral" | "warning" {
  switch (card.relation) {
    case "ENROLLED":
    case "ENROLLED_AND_TEACHING":
      return "primary";
    case "TEACHING":
      return "info";
    case "OVERSIGHT":
      return "warning";
    default:
      return "neutral";
  }
}