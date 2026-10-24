import React, { useCallback, useEffect, useState } from "react";
import { faBookOpen, faPlus, faTrash, faCopy, faPen } from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { Table } from "../../ui/Table";
import { Spinner } from "../../ui/Spinner";
import { Alert } from "../../ui/Alert";
import { EmptyState } from "../../ui/EmptyState";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import {
  fetchLmsCourses,
  fetchCourseOverview,
  fetchCourseWeeks,
  fetchCourseQuizzes,
  duplicateQuiz,
  archiveQuiz,
} from "../../../services/lmsApi";
import type {
  LmsCourseIndex,
  LmsCourseOverview,
  LmsQuizList,
  LmsQuizSummary,
  LmsWeek,
} from "../../../types/lms";
import { QuizBuilder } from "../../lms/quizzes/QuizBuilder";

// Local type definitions since these are not exported from types/lms

export const QuizManagementWorkspace: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const [courses, setCourses] = useState<LmsCourseIndex | null>(null);
  const [quizzes, setQuizzes] = useState<Array<LmsQuizSummary & { courseName: string; courseCode: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQuizBuilder, setShowQuizBuilder] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [quizToDelete, setQuizToDelete] = useState<string | null>(null);
  const [quizToEdit, setQuizToEdit] = useState<(LmsQuizSummary & { courseName: string; courseCode: string }) | null>(null);
  const [quizToDuplicate, setQuizToDuplicate] = useState<string | null>(null); // For tracking which quiz is being duplicated
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseOverviews, setCourseOverviews] = useState<Record<string, LmsCourseOverview>>({});
  const [weeks, setWeeks] = useState<LmsWeek[]>([]);
  const [weeksLoading, setWeeksLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!currentUser) {
      setError("User not authenticated");
      setLoading(false);
      return;
    }

    // Check if the user has the global permission to manage quizzes
    const hasPermission = currentUser.permissions?.includes("lms.quiz.manage");
    if (!hasPermission) {
      setError("You do not have permission to manage quizzes");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Get the list of courses
      const courseIndex = await fetchLmsCourses();
      setCourses(courseIndex);

      // Fetch overviews for all courses to get access info and week data
      const courseOverviewsPromises = courseIndex.courses.map((course) => 
        fetchCourseOverview(course.id)
      );
      const courseOverviewsArray = await Promise.all(courseOverviewsPromises);
      
      // Build courseOverviews object for easy lookup
      const courseOverviewsObj: Record<string, LmsCourseOverview> = {};
      courseIndex.courses.forEach((course, index) => {
        courseOverviewsObj[course.id] = courseOverviewsArray[index];
      });
      setCourseOverviews(courseOverviewsObj);

      // Initialize selected course if not set and we have courses
      if (!selectedCourseId && courseIndex.courses.length > 0) {
        // If user has quiz manage permission, default to first course (institutional access)
        // Otherwise, default to first course they can manage
        if (currentUser && currentUser.permissions?.includes("lms.quiz.manage")) {
          setSelectedCourseId(courseIndex.courses[0].id);
        } else {
          // Find first course the user can manage
          const firstManageable = courseOverviewsArray.find(
            (overview) => overview.access.canManage
          )?.course ?? courseIndex.courses[0];
          setSelectedCourseId(firstManageable.id);
        }
      }

      // Fetch weeks for selected course
      if (selectedCourseId) {
        setWeeksLoading(true);
        try {
          const weeksData = await fetchCourseWeeks(selectedCourseId);
          setWeeks(weeksData.weeks);
        } catch (err) {
          console.error(`Failed to fetch weeks for course ${selectedCourseId}:`, err);
        } finally {
          setWeeksLoading(false);
        }
      }

      // Step 2: Filter courses where the user can manage (or can see all if they have quiz manage permission)
      const manageableCourses = courseOverviewsArray
        .map((overview, index) => ({
          course: courseIndex.courses[index],
          access: overview.access,
        }))
        .filter(({ access }) => 
          // If user has quiz manage permission, they can see all courses
          (currentUser && currentUser.permissions?.includes("lms.quiz.manage")) ||
          // Otherwise, only show courses they can manage
          access.canManage
        );

      // Step 3: For each manageable course, fetch the quizzes
      const quizPromises = manageableCourses.map(async ({ course }) => {
        try {
          const quizList = await fetchCourseQuizzes(course.id);
          return quizList.quizzes.map((quiz) => ({
            ...quiz,
            courseName: course.name,
            courseCode: course.code,
          }));
        } catch (err) {
          console.error(`Failed to fetch quizzes for course ${course.id}:`, err);
          return [];
        }
      });

      const quizLists = await Promise.all(quizPromises);
      const flattenedQuizzes = quizLists.flat();

      setQuizzes(flattenedQuizzes);
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

   // Fetch weeks when selected course changes
   useEffect(() => {
     if (selectedCourseId) {
       setWeeksLoading(true);
       fetchCourseWeeks(selectedCourseId)
         .then((weeksData) => {
           setWeeks(weeksData.weeks);
         })
         .catch((err) => {
           console.error(`Failed to fetch weeks for course ${selectedCourseId}:`, err);
         })
         .finally(() => {
           setWeeksLoading(false);
         });
     } else {
       setWeeks([]);
     }
   }, [selectedCourseId]);

   const handleCreateQuiz = async (courseId?: string) => {
      // If a courseId is provided, select it and open the builder
      if (courseId) {
        setSelectedCourseId(courseId);
      }
      setShowQuizBuilder(true);
    };

    const handleEditQuiz = async (quizId: string) => {
      // Find the quiz in our list to get the full details
      const quizToEdit = quizzes.find(q => q.id === quizId);
      if (!quizToEdit) {
        setError("Quiz not found");
        return;
      }
      
      // Set the selected course to the quiz's course and open the builder
      setSelectedCourseId(quizToEdit.courseCode ? 
        courses?.courses.find(c => c.code === quizToEdit.courseCode)?.id ?? "" : 
        "");
      
      setQuizToEdit(quizToEdit);
      setShowQuizBuilder(true);
    };

    const handleDuplicateQuiz = async (quizId: string) => {
      setQuizToDuplicate(quizId);
      
      try {
        const duplicatedQuizResponse = await duplicateQuiz(quizId);
        // Refresh the quiz list to show the duplicated quiz
        void loadData();
        // In a real implementation, we'd show a success toast/notification
        console.log("Quiz duplicated successfully:", duplicatedQuizResponse);
      } catch (err) {
        console.error("Failed to duplicate quiz:", err);
        setError("Failed to duplicate quiz. Please try again.");
      } finally {
        setQuizToDuplicate(null);
      }
    };

  const handleDeleteQuiz = async (quizId: string) => {
    setQuizToDelete(quizId);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!quizToDelete) return;
    try {
      await archiveQuiz(quizToDelete);
      // Remove the quiz from the list
      setQuizzes(quizzes.filter((q) => q.id !== quizToDelete));
      setShowDeleteModal(false);
      setQuizToDelete(null);
    } catch (err) {
      console.error("Failed to delete quiz:", err);
      setError("Failed to delete quiz. Please try again.");
    }
  };

  if (error) {
    return (
      <div className="cos-page">
        <Alert variant="error" onDismiss={() => void loadData()}>
          {error}
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="cos-page">
        <div className="flex min-h-screen items-center justify-center">
          <Spinner />
          <p className="ml-2">Loading quiz management data...</p>
        </div>
      </div>
    );
  }

  if (!courses) {
    return <div className="cos-page">No courses found.</div>;
  }

  return (
    <>
      <div className="cos-page">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-xl font-bold">Quiz Management</h1>
          <div className="flex space-x-2">
             <Button
               size="sm"
               icon={faPlus}
               onClick={() => handleCreateQuiz(undefined)}
               disabled={!(courses?.courses
                 ?.filter((course) =>
                   // If user has quiz manage permission, they can access all courses
                   (currentUser && currentUser.permissions?.includes("lms.quiz.manage")) ||
                   // Otherwise, only show courses the user can manage
                   courseOverviews[course.id]?.access?.canManage
                 )
                 .length > 0)}
             >
               New Quiz
             </Button>
          </div>
        </div>

        {quizzes.length === 0 ? (
          <EmptyState
            icon={faBookOpen}
            title="No quizzes found"
            description="You don't have any quizzes in the courses you manage."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className="text-left">Quiz Title</th>
                <th className="text-left">Course</th>
                <th className="text-left">Status</th>
                <th className="text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {quizzes.map((quiz) => (
                <tr key={quiz.id}>
                  <td>{quiz.title}</td>
                  <td>
                    {quiz.courseCode} - {quiz.courseName}
                  </td>
                  <td>
                    {/* We can map the quiz.availability to a badge */}
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        quiz.availability === "OPEN"
                          ? "bg-green-100 text-green-800"
                          : quiz.availability === "SCHEDULED"
                            ? "bg-yellow-100 text-yellow-800"
                            : quiz.availability === "CLOSED"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {quiz.availability}
                    </span>
                  </td>
                  <td className="flex space-x-2">
                    <Button
                      size="sm"
                      icon={faPen}
                      onClick={() => handleEditQuiz(quiz.id)}
                      disabled={saving || loading || quizToDuplicate === quiz.id}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      icon={faCopy}
                      onClick={() => handleDuplicateQuiz(quiz.id)}
                      disabled={saving || loading || quizToDuplicate === quiz.id}
                    >
                      Duplicate
                    </Button>
                    <Button
                      size="sm"
                      icon={faTrash}
                      variant="ghost"
                      onClick={() => handleDeleteQuiz(quiz.id)}
                      disabled={saving || loading || quizToDuplicate === quiz.id}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {/* Quiz Builder */}
      {selectedCourseId && (
        <QuizBuilder
          courseId={selectedCourseId}
          quizId={quizToEdit?.id ?? undefined}
          onClose={() => {
            setShowQuizBuilder(false);
            setQuizToEdit(null);
          }}
          onPublished={(quiz) => {
            setShowQuizBuilder(false);
            setQuizToEdit(null);
            void loadData();
          }}
        />
      )}

      {/* Delete Quiz Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setQuizToDelete(null);
        }}
        title="Delete Quiz"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p>
            Are you sure you want to delete this quiz? This action cannot be
            undone.
          </p>
          <div className="flex justify-end space-x-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowDeleteModal(false);
                setQuizToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={handleConfirmDelete}
              isLoading={Boolean(quizToDelete && saving)}
            >
              Delete Quiz
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};