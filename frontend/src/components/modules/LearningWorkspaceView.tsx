import React, { useEffect, useMemo, useState } from "react";
import {
  faBookOpen,
  faFilter,
  faMagnifyingGlass,
  faPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { CardSkeleton } from "../ui/Skeleton";
import { Alert } from "../ui/Alert";
import { CourseCard } from "./CourseCard";
import { apiRequest } from "../../services/apiClient";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { AddCourseDialog } from "../academics/AddCourseDialog";

interface CourseRecord {
  id: number;
  code: string;
  name: string;
  department: string | null;
  credits: number;
  semester?: number | null;
  academicYear?: string | null;
  program?: string | null;
  courseType?: string;
}

const SEMESTERS = Array.from({ length: 6 }, (_, i) => ({
  number: i + 1,
  label: "Semester " + (i + 1),
  level: Math.ceil((i + 1) / 2),
}));

export const LearningWorkspaceView: React.FC = () => {
  const { currentUser, openCourse } = useCollegeOS();
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedSemester, setSelectedSemester] = useState<number | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);

  const permissions = new Set(currentUser?.permissions || []);
  const canCreateCourse = permissions.has("courses.create");

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const result = await apiRequest<{ courses: CourseRecord[] }>("/courses");
      setCourses(result.courses || []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load courses."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredCourses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return courses.filter((course) => {
      const matchesQuery = !needle
        ? true
        : [course.code, course.name, course.department || "", course.program || ""]
            .join(" ")
            .toLowerCase()
            .includes(needle);
      const matchesSemester =
        selectedSemester === null || course.semester === selectedSemester;
      const matchesLevel =
        selectedLevel === null || (course.semester && Math.ceil(course.semester / 2) === selectedLevel);
      return matchesQuery && matchesSemester && matchesLevel;
    });
  }, [courses, query, selectedSemester, selectedLevel]);

  const totalCourses = courses.length;
  const totalSemesters = Array.from(new Set(courses.map((c) => c.semester).filter(Boolean))).length;
  const totalLevels = Array.from(new Set(courses.map((c) => (c.semester ? Math.ceil(c.semester / 2) : null)).filter(Boolean))).length;
  const totalCredits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);

  const activeFilterCount =
    (selectedSemester ? 1 : 0) + (selectedLevel ? 1 : 0) + (query.trim() ? 1 : 0);

  const resetFilters = () => {
    setQuery("");
    setSelectedSemester(null);
    setSelectedLevel(null);
  };

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div className="min-w-0">
          <p className="cos-eyebrow">ACADEMIC WORKSPACE</p>
          <h1 className="cos-page-title">Courses &amp; Learning</h1>
          <p className="cos-page-subtitle">
            Explore your academic catalogue, discover course content, and manage semester-based learning.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateCourse && (
            <Button icon={faPlus} onClick={() => setShowCourseForm(true)}>
              Add Course
            </Button>
          )}
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

      <div className="cos-card flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-2xl">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by course name, code, or subject..."
              aria-label="Search courses"
              className="cos-input pl-10"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedSemester ?? ""}
              onChange={(e) => setSelectedSemester(e.target.value ? Number(e.target.value) : null)}
              className="cos-input w-auto text-sm"
              aria-label="Filter by semester"
            >
              <option value="">All Semesters</option>
              {SEMESTERS.map((s) => (
                <option key={s.number} value={s.number}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={selectedLevel ?? ""}
              onChange={(e) => setSelectedLevel(e.target.value ? Number(e.target.value) : null)}
              className="cos-input w-auto text-sm"
              aria-label="Filter by academic level"
            >
              <option value="">All Levels</option>
              <option value="1">Level 1 (Year 1)</option>
              <option value="2">Level 2 (Year 2)</option>
              <option value="3">Level 3 (Year 3)</option>
            </select>
            {activeFilterCount > 0 && (
              <Button variant="secondary" icon={faXmark} onClick={resetFilters}>
                Clear filters ({activeFilterCount})
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : filteredCourses.length === 0 ? (
        <EmptyState
          icon={faBookOpen}
          title="No courses found"
          description={
            activeFilterCount > 0
              ? "No courses match your filter criteria. Try adjusting your search or filters."
              : "No courses are currently available in the catalogue."
          }
          actionLabel={activeFilterCount > 0 ? "Clear Filters" : undefined}
          onAction={activeFilterCount > 0 ? resetFilters : undefined}
        />
      ) : (
        <>
          {Array.from(
            filteredCourses.reduce((map, course) => {
              const key = course.semester ?? null;
              if (!map.has(key)) map.set(key, []);
              map.get(key)!.push(course);
              return map;
            }, new Map<number | null, CourseRecord[]>())
          )
            .sort(([a], [b]) => {
              if (a === null) return 1;
              if (b === null) return -1;
              return a - b;
            })
            .map(([key, list]) => (
              <div key={key ?? "none"} className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  {key === null ? "Unassigned Semester" : `Semester ${key}`}
                </h2>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      onView={(c) => openCourse(String(c.id))}
                    />
                  ))}
                </div>
              </div>
            ))}
        </>
      )}

      <AddCourseDialog
        isOpen={showCourseForm}
        onClose={() => setShowCourseForm(false)}
        onSuccess={async () => {
          setShowCourseForm(false);
          await loadData();
        }}
      />
    </section>
  );
};
