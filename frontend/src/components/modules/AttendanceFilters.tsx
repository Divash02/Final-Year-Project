import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay } from "@fortawesome/free-solid-svg-icons";
import type { AttendanceContext, ContextCourse } from "../../services/attendanceApi";

interface AttendanceFiltersProps {
  context: AttendanceContext | null;
  isInstitutionScope: boolean;
  academicYear: string;
  batch: string;
  courseId: string;
  classType: string;
  selectedSections: string[];
  classDate: string;
  startTime: string;
  endTime: string;
  busy: boolean;
  activeSession: boolean;
  filtersIncomplete: boolean;
  onAcademicYearChange: (value: string) => void;
  onBatchChange: (value: string) => void;
  onCourseChange: (value: string) => void;
  onClassTypeChange: (value: string) => void;
  onSectionToggle: (code: string) => void;
  onDateChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onStartSession: () => void;
}

/**
 * Session setup.
 *
 * Every value is derived from the caller's real teaching
 * assignments and the live academic catalogue. The workspace
 * pre-populates the single assigned course, so a teacher with
 * one assignment opens a register without touching a control.
 */
const AttendanceFilters: React.FC<AttendanceFiltersProps> = ({
  context,
  isInstitutionScope,
  academicYear,
  batch,
  courseId,
  classType,
  selectedSections,
  classDate,
  startTime,
  endTime,
  busy,
  activeSession,
  filtersIncomplete,
  onAcademicYearChange,
  onBatchChange,
  onCourseChange,
  onClassTypeChange,
  onSectionToggle,
  onDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onStartSession,
}) => {
  const availableCourses = context?.courses ?? [];
  const selectedCourse = availableCourses.find(
    (course: ContextCourse) => course.id === courseId,
  );

  const availableSections = React.useMemo(() => {
    if (!context) return [];
    if (!isInstitutionScope) return context.sections;
    if (selectedCourse && selectedCourse.sectionCodes.length > 0) {
      return selectedCourse.sectionCodes;
    }
    return context.allSections;
  }, [context, isInstitutionScope, selectedCourse]);

  const availableBatches = context?.batches ?? [];
  const availableYears = context?.academicYears ?? [];
  const hasAssignedCourses =
    isInstitutionScope || availableCourses.length > 0;

  if (!hasAssignedCourses) {
    return (
      <section className="cos-card min-w-0">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="cos-section-title">Session setup</h2>
          <p className="mt-1 text-sm text-slate-500">
            Record attendance against an assigned course and section.
          </p>
        </div>
        <p className="px-5 py-6 text-sm text-slate-500">
          No assigned course/session is available. Contact the academic
          administrator if this is unexpected.
        </p>
      </section>
    );
  }

  return (
    <section className="cos-card min-w-0" aria-label="Session setup">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <h2 className="cos-section-title">Session setup</h2>
          <p className="mt-1 text-sm text-slate-500">
            Attendance is recorded against an assigned course and section.
          </p>
        </div>
        {!isInstitutionScope && (
          <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            {availableCourses.length} assigned course
            {availableCourses.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="cos-label min-w-0" htmlFor="att-course">
            Course
            <select
              id="att-course"
              value={courseId}
              onChange={(event) => onCourseChange(event.target.value)}
              className="cos-input cursor-pointer"
            >
              <option value="">Select a course</option>
              {availableCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} · {course.name}
                </option>
              ))}
            </select>
          </label>

          <label className="cos-label min-w-0" htmlFor="att-class-type">
            Class type
            <select
              id="att-class-type"
              value={classType}
              onChange={(event) => onClassTypeChange(event.target.value)}
              className="cos-input cursor-pointer"
            >
              {context?.classTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="cos-label min-w-0" htmlFor="att-date">
            Class date
            <input
              id="att-date"
              type="date"
              value={classDate}
              onChange={(event) => onDateChange(event.target.value)}
              className="cos-input"
            />
          </label>

          {availableYears.length > 1 && (
            <label className="cos-label min-w-0" htmlFor="att-year">
              Academic year
              <select
                id="att-year"
                value={academicYear}
                onChange={(event) => onAcademicYearChange(event.target.value)}
                className="cos-input cursor-pointer"
              >
                <option value="">All years</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          )}

          {availableBatches.length > 1 && (
            <label className="cos-label min-w-0" htmlFor="att-batch">
              Batch
              <select
                id="att-batch"
                value={batch}
                onChange={(event) => onBatchChange(event.target.value)}
                className="cos-input cursor-pointer"
              >
                <option value="">All batches</option>
                {availableBatches.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="cos-label min-w-0" htmlFor="att-start">
            Start time
            <input
              id="att-start"
              type="time"
              value={startTime}
              onChange={(event) => onStartTimeChange(event.target.value)}
              className="cos-input"
            />
          </label>

          <label className="cos-label min-w-0" htmlFor="att-end">
            End time
            <input
              id="att-end"
              type="time"
              value={endTime}
              onChange={(event) => onEndTimeChange(event.target.value)}
              className="cos-input"
            />
          </label>

          <div className="flex min-w-0 items-end">
            <button
              type="button"
              onClick={onStartSession}
              disabled={busy || filtersIncomplete || activeSession}
              className="cos-btn cos-btn-primary w-full"
            >
              <FontAwesomeIcon icon={faPlay} aria-hidden="true" />
              {activeSession ? "Session open" : "Open session"}
            </button>
          </div>
        </div>

        <fieldset className="border-t border-slate-100 pt-4">
          <legend className="cos-label mb-2">
            Sections
            <span className="ml-2 font-normal text-slate-400">
              Select one or more
            </span>
          </legend>
          {availableSections.length === 0 ? (
            <p className="text-sm text-slate-500">
              No sections are available for this selection.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableSections.map((code) => {
                const checked = selectedSections.includes(code);
                return (
                  <label
                    key={code}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                      checked
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onSectionToggle(code)}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    {code}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      </div>
    </section>
  );
};

export default AttendanceFilters;
