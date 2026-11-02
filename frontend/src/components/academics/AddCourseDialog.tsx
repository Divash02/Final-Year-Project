import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookOpen, faSpinner, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FormField, SelectField } from "../ui/Input";
import { FormSection } from "../ui/FormSection";
import { apiRequest } from "../../services/apiClient";
import { useToast } from "../ui/ToastContainer";
import { ConfirmDialog } from "../lms/shared/ConfirmDialog";

interface Department {
  code: string;
  name: string;
}

interface FiltersResponse {
  filters: {
    departmentsList?: Department[];
    academicYears?: string[];
    programCodes?: string[];
  };
}

interface AddCourseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  course?: {
    id: string | number;
    code: string;
    name: string;
    department: string | null;
    program?: string | null;
    credits: number | null;
    semester?: number | null;
    academicYear?: string | null;
    courseType?: string | null;
    description?: string | null;
  };
}

const DEFAULT_FORM_DATA: CourseFormData = {
  code: "",
  name: "",
  department: "",
  program: "",
  credits: "3",
  semester: "1",
  academicYear: "",
  courseType: "CORE",
  description: "",
};

export interface CourseFormData {
  code: string;
  name: string;
  department: string;
  program: string;
  credits: string;
  semester: string;
  academicYear: string;
  courseType: string;
  description: string;
}

const COURSE_TYPES = ["CORE", "ELECTIVE", "LAB", "PROJECT", "INTERNSHIP"];
const SEMESTERS = Array.from({ length: 8 }, (_, i) => String(i + 1));

export const AddCourseDialog: React.FC<AddCourseDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
  course,
}) => {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<string[]>([]);
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<CourseFormData>(DEFAULT_FORM_DATA);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setMode(course ? "edit" : "add");
    void loadFilters();
    if (course) {
      setFormData(DEFAULT_FORM_DATA);
      void loadCourse(course.id);
    }
  }, [isOpen, course]);

  const loadCourse = async (id: string | number) => {
    try {
      setFetching(true);
      const response = await apiRequest<{ course: AddCourseDialogProps["course"] }>(
        `/courses/${id}`,
      );
      const c = response.course;
      if (!c) return;
      setFormData({
        code: c.code || "",
        name: c.name || "",
        department: c.department || "",
        program: c.program || "",
        credits: String(c.credits ?? 3),
        semester: String(c.semester ?? 1),
        academicYear: c.academicYear || "",
        courseType: c.courseType || "CORE",
        description: c.description || "",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unable to load course.";
      toast({ variant: "error", message: "Unable to load course", detail: msg });
      setErrors((prev) => ({ ...prev, submit: msg }));
    } finally {
      setFetching(false);
    }
  };

  const loadFilters = async () => {
    try {
      const response = await apiRequest<FiltersResponse>("/courses/filters");
      const deptList = response.filters.departmentsList || [];
      const progList = response.filters.programCodes || [];
      const years = response.filters.academicYears || [];
      setDepartments(deptList);
      setPrograms(progList);
      setAcademicYears(years);
      if (years.length > 0 && !course) {
        setFormData((prev) => ({ ...prev, academicYear: prev.academicYear || years[0] }));
      }
    } catch (e) {
      // ignore
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.code.trim()) {
      newErrors.code = "Course code is required";
    }
    if (!formData.name.trim()) {
      newErrors.name = "Course name is required";
    }
    if (!formData.department.trim()) {
      newErrors.department = "Department is required";
    }
    const creditsNum = Number(formData.credits);
    if (
      !formData.credits ||
      isNaN(creditsNum) ||
      creditsNum < 0 ||
      creditsNum > 60 ||
      !Number.isInteger(creditsNum)
    ) {
      newErrors.credits = "Credits must be a whole number between 0 and 60";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const payload: any = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        department: formData.department.trim(),
        credits: Number(formData.credits),
      };
      if (formData.semester) payload.semester = Number(formData.semester);
      if (formData.academicYear) payload.academicYear = formData.academicYear;
      if (formData.program) payload.program = formData.program;
      if (formData.courseType) payload.courseType = formData.courseType;
      if (formData.description.trim()) payload.description = formData.description.trim();
      if (mode === "edit" && course) {
        await apiRequest(`/courses/${course.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast({
          variant: "success",
          message: "Course updated successfully",
          detail: `${payload.code} · ${payload.name}`
        });
      } else {
        await apiRequest("/courses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({
          variant: "success",
          message: "Course created successfully",
          detail: `${payload.code} · ${payload.name}`
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "Course could not be saved.";
      toast({
        variant: "error",
        message: mode === "edit" ? "Unable to update course" : "Unable to create course",
        detail: msg,
      });
      setErrors((prev) => ({ ...prev, submit: msg }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting && !fetching && !deleting) {
      onClose();
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!course) return;
    setDeleting(true);
    try {
      await apiRequest(`/courses/${course.id}?mode=purge`, {
        method: "DELETE",
      });
      toast({
        variant: "success",
        message: "Course deleted",
        detail: `${course.code} · ${course.name}`,
      });
      setShowDeleteConfirm(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.status === 409) {
        // Purge refused due to dependent records: archive instead so references stay valid.
        try {
          await apiRequest(`/courses/${course.id}`, { method: "DELETE" });
          toast({
            variant: "success",
            message: "Course archived",
            detail: `${course.code} · ${course.name} — kept for existing records.`,
          });
          setShowDeleteConfirm(false);
          onSuccess();
          onClose();
          return;
        } catch (archiveErr: any) {
          const archiveMsg = archiveErr instanceof Error ? archiveErr.message : "Course could not be archived.";
          toast({
            variant: "error",
            message: "Unable to archive course",
            detail: archiveMsg,
          });
          setShowDeleteConfirm(false);
          return;
        }
      }
      const msg = err instanceof Error ? err.message : "Course could not be deleted.";
      toast({
        variant: "error",
        message: "Unable to delete course",
        detail: msg,
      });
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={mode === "edit" ? "Edit Course" : "Add Course"}
      subtitle={
        mode === "edit"
          ? "Update the course details below."
          : "Add a new course to the academic catalogue."
      }
      icon={faBookOpen}
      maxWidth="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:justify-end">
          {mode === "edit" && (
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={submitting || fetching || deleting}
            >
              Delete Course
            </Button>
          )}
          <Button variant="secondary" onClick={handleClose} disabled={submitting || fetching || deleting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={submitting} loadingLabel={mode === "edit" ? "Updating..." : "Adding..."} type="submit">
            {mode === "edit" ? "Edit Course" : "Add Course"}
          </Button>
        </div>
      }
    >
    {mode === "edit" && fetching ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-12">
          <FontAwesomeIcon icon={faSpinner} spin className="text-slate-500" />
          <p className="text-sm text-slate-600">Loading course...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <FormSection title="Course Information" description="Use the official academic details.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Course Code" error={errors.code} required helperText="Use the official academic course code.">
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className={`cos-input ${invalid ? "border-red-300" : ""}`}
                  placeholder="e.g., BCA101"
                  maxLength={32}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  autoFocus
                />
              )}
            </FormField>

            <FormField label="Credits" error={errors.credits} required helperText="Credit hours">
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  type="number"
                  value={formData.credits}
                  onChange={(e) => setFormData({ ...formData, credits: e.target.value })}
                  className={`cos-input ${invalid ? "border-red-300" : ""}`}
                  min="0"
                  max="60"
                  step="1"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </FormField>
          </div>

          <FormField label="Course Name" error={errors.name} required helperText="Enter the official course title used in the academic catalogue.">
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`cos-input ${invalid ? "border-red-300" : ""}`}
                placeholder="e.g., Introduction to Databases"
                maxLength={180}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </FormField>
        </FormSection>

        <FormSection title="Academic Placement" description="Assign this course to the correct department and program.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              label="Department"
              error={errors.department}
              required
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
            >
              <option value="">Select department</option>
              {departments.map((dept) => (
                <option key={dept.code || dept.name} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Program"
              value={formData.program}
              onChange={(e) => setFormData({ ...formData, program: e.target.value })}
            >
              <option value="">Select program</option>
              {programs.map((prog) => (
                <option key={prog} value={prog}>
                  {prog}
                </option>
              ))}
            </SelectField>
          </div>
        </FormSection>

        <FormSection title="Course Structure" description="Define type, semester, and academic year.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SelectField
              label="Course Type"
              value={formData.courseType}
              onChange={(e) => setFormData({ ...formData, courseType: e.target.value })}
            >
              {COURSE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Semester"
              value={formData.semester}
              onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
            >
              {SEMESTERS.map((sem) => (
                <option key={sem} value={sem}>
                  Semester {sem}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Academic Year"
              value={formData.academicYear}
              onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
            >
              <option value="">Select year</option>
              {academicYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </SelectField>
          </div>
        </FormSection>

        <FormSection title="Additional Details" description="Optional information for the course catalogue.">
          <FormField label="Description">
            {({ id, describedBy }) => (
              <textarea
                id={id}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="cos-input min-h-[100px] resize-y"
                placeholder="Add a brief description of objectives, outcomes, or syllabus overview..."
                maxLength={4000}
                aria-describedby={describedBy}
              />
            )}
          </FormField>
        </FormSection>
        </form>
      )}
    </Modal>
    <ConfirmDialog
      isOpen={showDeleteConfirm}
      onClose={() => setShowDeleteConfirm(false)}
      title="Delete Course"
      confirmLabel="Delete"
      message="This will permanently remove the course from the database. This action cannot be undone."
      subject={mode === "edit" && course ? `${course.code} · ${course.name}` : undefined}
      busy={deleting}
      severity="danger"
      onConfirm={handleDeleteConfirm}
    />
    </>
  );
};


