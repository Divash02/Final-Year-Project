import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  faBookOpen,
  faPlus,
  faTrash,
  faCopy,
  faPen,
  faSearch,
  faRotateRight,
  faSlidersH,
  faClock,
  faCheckCircle,
  faAward,
  faUsers,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { Table } from "../../ui/Table";
import { Spinner } from "../../ui/Spinner";
import { Alert } from "../../ui/Alert";
import { EmptyState } from "../../ui/EmptyState";
import { Badge } from "../../ui/Badge";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import {
  fetchLmsCourses,
  fetchCourseOverview,
  fetchCourseQuizzes,
  duplicateQuiz,
  archiveQuiz,
} from "../../../services/lmsApi";
import type {
  LmsCourseIndex,
  LmsCourseOverview,
  LmsQuizSummary,
} from "../../../types/lms";
import { QuizBuilder } from "../../lms/quizzes/QuizBuilder";
import { CreateQuizModal } from "../../lms/quizzes/CreateQuizModal";

export const QuizManagementWorkspace: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const [courses, setCourses] = useState<LmsCourseIndex | null>(null);
  const [quizzes, setQuizzes] = useState<
    Array<
      LmsQuizSummary & {
        courseName: string;
        courseCode: string;
        courseId: string;
      }
    >
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Builder & Modal States
  const [activeBuilderQuiz, setActiveBuilderQuiz] = useState<{
    quizId?: string;
    courseId: string;
  } | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [quizToDelete, setQuizToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [quizToDuplicate, setQuizToDuplicate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"title" | "date" | "marks" | "attempts">(
    "date",
  );

  const loadData = useCallback(async () => {
    if (!currentUser) {
      setError("User not authenticated");
      setLoading(false);
      return;
    }

    const hasPermission = currentUser.permissions?.includes("lms.quiz.manage");
    if (!hasPermission) {
      setError("You do not have permission to manage quizzes");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const courseIndex = await fetchLmsCourses();
      setCourses(courseIndex);

      const courseOverviewsPromises = courseIndex.courses.map((course) =>
        fetchCourseOverview(course.id),
      );
      const courseOverviewsArray = await Promise.all(courseOverviewsPromises);

      const manageableCourses = courseIndex.courses.filter((course, index) => {
        if (currentUser.permissions?.includes("lms.quiz.manage")) return true;
        return courseOverviewsArray[index]?.access?.canManage;
      });

      const quizPromises = manageableCourses.map(async (course) => {
        try {
          const quizList = await fetchCourseQuizzes(course.id);
          return (quizList.quizzes || []).map((quiz) => ({
            ...quiz,
            courseName: course.name,
            courseCode: course.code,
            courseId: course.id,
          }));
        } catch (err) {
          console.error(
            `Failed to fetch quizzes for course ${course.id}:`,
            err,
          );
          return [];
        }
      });

      const quizLists = await Promise.all(quizPromises);
      setQuizzes(quizLists.flat());
    } catch (err) {
      console.error("Failed to load quiz management data:", err);
      setError("Failed to load quiz data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleDuplicateQuiz = async (quizId: string) => {
    setQuizToDuplicate(quizId);
    try {
      await duplicateQuiz(quizId);
      setNotice("Quiz duplicated successfully.");
      void loadData();
    } catch (err) {
      console.error("Failed to duplicate quiz:", err);
      setError("Failed to duplicate quiz. Please try again.");
    } finally {
      setQuizToDuplicate(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!quizToDelete) return;
    setSaving(true);
    try {
      await archiveQuiz(quizToDelete.id);
      setQuizzes((prev) => prev.filter((q) => q.id !== quizToDelete.id));
      setDeleteModalOpen(false);
      setQuizToDelete(null);
      setNotice("Quiz successfully archived.");
    } catch (err) {
      console.error("Failed to delete quiz:", err);
      setError("Failed to delete quiz. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Filter & Sort
  const filteredQuizzes = useMemo(() => {
    return quizzes
      .filter((quiz) => {
        if (courseFilter !== "ALL" && quiz.courseId !== courseFilter)
          return false;
        if (statusFilter !== "ALL") {
          const s = quiz.availability || "DRAFT";
          if (statusFilter === "DRAFT" && s !== "DRAFT") return false;
          if (statusFilter === "SCHEDULED" && s !== "SCHEDULED") return false;
          if (statusFilter === "OPEN" && s !== "OPEN") return false;
          if (statusFilter === "CLOSED" && s !== "CLOSED") return false;
        }
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          quiz.title.toLowerCase().includes(q) ||
          quiz.courseName.toLowerCase().includes(q) ||
          quiz.courseCode.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === "title") return a.title.localeCompare(b.title);
        if (sortBy === "marks") return (b.maxMarks || 0) - (a.maxMarks || 0);
        if (sortBy === "attempts")
          return (b.attemptsUsed || 0) - (a.attemptsUsed || 0);
        // Default: date / id
        return b.id.localeCompare(a.id);
      });
  }, [quizzes, courseFilter, statusFilter, search, sortBy]);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = quizzes.length;
    const active = quizzes.filter((q) => q.availability === "OPEN").length;
    const scheduled = quizzes.filter(
      (q) => q.availability === "SCHEDULED",
    ).length;
    const drafts = quizzes.filter(
      (q) => !q.availability || q.availability === "DRAFT",
    ).length;
    return { total, active, scheduled, drafts };
  }, [quizzes]);

  // If QuizBuilder is opened, render it full screen / page mode
  if (activeBuilderQuiz) {
    return (
      <QuizBuilder
        courseId={activeBuilderQuiz.courseId}
        quizId={activeBuilderQuiz.quizId}
        onClose={() => {
          setActiveBuilderQuiz(null);
          void loadData();
        }}
        onPublished={() => {
          setActiveBuilderQuiz(null);
          void loadData();
        }}
      />
    );
  }

  if (loading && quizzes.length === 0) {
    return (
      <div className="cos-page">
        <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-3">
          <Spinner />
          <p className="text-xs text-slate-500">
            Loading assessments and question banks...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="cos-page space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Quizzes
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create, manage, preview, and publish assessments for your courses.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={faRotateRight}
            onClick={() => void loadData()}
            isLoading={loading}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={faPlus}
            onClick={() => setCreateModalOpen(true)}
            disabled={!courses?.courses?.length}
          >
            + Create Quiz
          </Button>
        </div>
      </div>

      {notice && (
        <Alert variant="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Aggregate metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">
            Total Assessments
          </span>
          <div className="text-xl font-bold text-slate-900">
            {stats.total}
          </div>
          <span className="text-[11px] text-slate-600">
            Across enrolled courses
          </span>
        </div>

        <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3.5 shadow-xs">
          <span className="text-[10px] uppercase font-bold tracking-wider text-teal-800 block mb-0.5">
            Active &amp; Open
          </span>
          <div className="text-xl font-bold text-teal-900">
            {stats.active}
          </div>
          <span className="text-[11px] text-teal-800">
            Available to students
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">
            Scheduled
          </span>
          <div className="text-xl font-bold text-slate-900">
            {stats.scheduled}
          </div>
          <span className="text-[11px] text-slate-600">
            Waiting for start window
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">
            Draft Papers
          </span>
          <div className="text-xl font-bold text-slate-900">
            {stats.drafts}
          </div>
          <span className="text-[11px] text-slate-600">In authoring</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="relative w-full sm:w-72">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quizzes by title or course..."
            className="w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="ALL">All Courses</option>
            {courses?.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="OPEN">Published / Open</option>
            <option value="CLOSED">Closed</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="date">Sort: Recent First</option>
            <option value="title">Sort: Title (A-Z)</option>
            <option value="marks">Sort: Marks (High-Low)</option>
            <option value="attempts">Sort: Attempts</option>
          </select>
        </div>
      </div>

      {/* Quiz Table */}
      {filteredQuizzes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
          <FontAwesomeIcon
            icon={faBookOpen}
            className="text-4xl text-slate-300 dark:text-slate-600"
          />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            No Assessments Found
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {search || statusFilter !== "ALL" || courseFilter !== "ALL"
              ? "No assessments match the current filters. Try resetting search filters."
              : "Create assessments, questions, and psychometric tests for your assigned cohorts."}
          </p>
          <div className="pt-2">
            <Button
              size="sm"
              variant="primary"
              icon={faPlus}
              onClick={() => setCreateModalOpen(true)}
            >
              + Create Assessment
            </Button>
          </div>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th className="text-left">Quiz Title</th>
              <th className="text-left">Course</th>
              <th className="text-left">Questions</th>
              <th className="text-left">Total Marks</th>
              <th className="text-left">Time Limit</th>
              <th className="text-left">Status</th>
              <th className="text-left">Availability</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredQuizzes.map((quiz) => {
              const status = quiz.availability || "DRAFT";
              return (
                <tr
                  key={quiz.id}
                  className="hover:bg-slate-50 transition"
                >
                  <td className="font-semibold text-slate-900">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveBuilderQuiz({
                          quizId: quiz.id,
                          courseId: quiz.courseId,
                        })
                      }
                      className="text-left font-bold text-slate-900 hover:text-teal-700 transition"
                    >
                      {quiz.title}
                    </button>
                  </td>
                  <td className="text-xs text-slate-700">
                    <span className="font-bold text-slate-900">
                      {quiz.courseCode}
                    </span>{" "}
                    — {quiz.courseName}
                  </td>
                  <td className="text-xs font-semibold text-slate-800">
                    {quiz.questionCount ?? 0}
                  </td>
                  <td className="text-xs font-bold text-slate-900">
                    {quiz.maxMarks} marks
                  </td>
                  <td className="text-xs text-slate-600">
                    {quiz.durationMinutes ? `${quiz.durationMinutes}m` : "None"}
                  </td>
                  <td>
                    <Badge
                      variant={
                        status === "OPEN"
                          ? "success"
                          : status === "SCHEDULED"
                            ? "info"
                            : status === "CLOSED"
                              ? "warning"
                              : "neutral"
                      }
                      size="sm"
                    >
                      {status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="text-xs text-slate-500">
                    {quiz.availableUntil
                      ? `Closes ${new Date(quiz.availableUntil).toLocaleDateString()}`
                      : quiz.availableFrom
                        ? `Opens ${new Date(quiz.availableFrom).toLocaleDateString()}`
                        : "Draft"}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={faPen}
                        onClick={() =>
                          setActiveBuilderQuiz({
                            quizId: quiz.id,
                            courseId: quiz.courseId,
                          })
                        }
                        title="Edit Assessment"
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={faCopy}
                        onClick={() => handleDuplicateQuiz(quiz.id)}
                        disabled={quizToDuplicate === quiz.id}
                        title="Duplicate Assessment"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={faTrash}
                        onClick={() => {
                          setQuizToDelete({ id: quiz.id, title: quiz.title });
                          setDeleteModalOpen(true);
                        }}
                        title="Archive Assessment"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {/* Dedicated Create Quiz Modal */}
      {createModalOpen && courses && (
        <CreateQuizModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          courses={courses.courses}
          defaultCourseId={courses.courses[0]?.id}
          onQuizCreated={(quizId, courseId) => {
            setActiveBuilderQuiz({ quizId, courseId });
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Delete / Archive Confirmation Modal */}
      {deleteModalOpen && quizToDelete && (
        <Modal
          isOpen={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setQuizToDelete(null);
          }}
          title="Archive Assessment"
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to archive{" "}
              <strong>"{quizToDelete.title}"</strong>? Historical candidate
              attempt scores remain securely preserved in institutional academic
              records.
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setQuizToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={handleConfirmDelete}
                isLoading={saving}
                loadingLabel="Archiving..."
              >
                Archive Assessment
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default QuizManagementWorkspace;
