import React, { useCallback, useEffect, useState } from "react";
import { faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../../ui/Alert";
import { EmptyState } from "../../ui/EmptyState";
import { Modal } from "../../ui/Modal";
import { FacultyLmsWorkspace } from "./FacultyLmsWorkspace";
import { StudentLmsWorkspace } from "./StudentLmsWorkspace";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { fetchLmsCourses } from "../../../services/lmsApi";
import type { LmsCourseIndex, LmsCourseSummary } from "../../../types/lms";

/**
 * The LMS entry point.
 *
 * One course list, two workspaces. Which workspace opens is decided by the
 * `role` the server attached to each course — the same field that authorises the
 * API calls behind them — so a user who both teaches and studies a course gets
 * the correct surface per course rather than one chosen by their job title.
 *
 * When another view (My Courses) has handed over a course id, this workspace
 * opens that course. The id is only a *selection*: the workspace still loads the
 * course through `/lms/courses` and every panel behind it re-authorises the
 * caller, so a stale or forged id can never expose a course.
 */
export const LmsWorkspace: React.FC = () => {
  const { activeCourseId } = useCollegeOS();
  const [courses, setCourses] = useState<LmsCourseIndex | null>(null);
  const [courseId, setCourseId] = useState("");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const index = await fetchLmsCourses();
      setCourses(index);
      setCourseId((current) => {
        // A handed-over course wins over the previous selection, but only if the
        // server's own course list actually contains it.
        const preferred = activeCourseId || current;
        return preferred && index.courses.some((course) => course.id === preferred)
          ? preferred
          : (index.courses[0]?.id ?? "");
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Your courses could not be loaded.",
      );
    }
  }, [activeCourseId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <section className="cos-page">
        <Alert variant="error" onDismiss={() => void load()}>
          {error}
        </Alert>
      </section>
    );
  }

  if (!courses) {
    return (
      <section className="cos-page">
        <p className="text-sm text-slate-500">Loading your courses…</p>
      </section>
    );
  }

  if (courses.courses.length === 0) {
    return (
      <section className="cos-page">
        <EmptyState
          icon={faBookOpen}
          title="No courses"
          description="You are neither teaching nor enrolled in a course this term, so there is nothing to show here yet."
        />
      </section>
    );
  }

  const selected = courses.courses.find((course) => course.id === courseId) ?? courses.courses[0];
  const openCourse = (id: string) => {
    setCourseId(id);
    setPicking(false);
  };

  const Workspace = selected.role === "STUDENT" ? StudentLmsWorkspace : FacultyLmsWorkspace;

  return (
    <>
      <Workspace
        courseId={selected.id}
        onCourseChange={() => setPicking(true)}
        key={selected.id}
      />
      <Modal
        isOpen={picking}
        onClose={() => setPicking(false)}
        title="Choose a course"
        subtitle={`${courses.courses.length} course${courses.courses.length === 1 ? "" : "s"} you can open`}
        maxWidth="md"
      >
        <ul className="space-y-1.5">
          {courses.courses.map((course) => (
            <li key={course.id}>
              <CourseChoice
                course={course}
                active={course.id === selected.id}
                onSelect={() => openCourse(course.id)}
              />
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
};

const CourseChoice: React.FC<{
  course: LmsCourseSummary;
  active: boolean;
  onSelect: () => void;
}> = ({ course, active, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm ${
      active
        ? "border-[var(--color-primary)] bg-slate-50"
        : "border-slate-200 hover:border-slate-300"
    }`}
  >
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium text-slate-900">
        {course.code} · {course.name}
      </span>
      <span className="block truncate text-xs text-slate-500">
        {course.semester ? `Semester ${course.semester}` : "No semester"}
        {course.sectionCode ? ` · Section ${course.sectionCode}` : ""}
      </span>
    </span>
    <span className="shrink-0 text-xs font-medium text-slate-500">
      {course.role === "STUDENT" ? "Study" : "Teach"}
    </span>
  </button>
);