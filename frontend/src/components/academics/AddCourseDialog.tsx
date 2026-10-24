import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FormField, SelectField } from "../ui/Input";
import { apiRequest } from "../../services/apiClient";
import { useToast } from "../ui/ToastContainer";

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
}

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
}) => {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<string[]>([]);
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<CourseFormData>({
    code: "",
    name: "",
    department: "",
    program: "",
    credits: "3",
    semester: "1",
    academicYear: "",
    courseType: "CORE",
    description: "",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void loadFilters();
      setErrors({});
    }
  }, [isOpen]);

  const loadFilters = async () => {
    try {
      const response = await apiRequest<FiltersResponse>("/courses/filters");
      const deptList = response.filters.departmentsList || [];
      const progList = response.filters.programCodes || [];
      const years = response.filters.academicYears || [];
      setDepartments(deptList);
      setPrograms(progList);
      setAcademicYears(years);
      if (years.length > 0) {
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
      await apiRequest("/courses", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast({
        variant: "success",
        message: "Course created successfully",
        detail: `${payload.code} · ${payload.name}`
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "Course could not be saved.";
      toast({
        variant: "error",
        message: "Unable to create course",
        detail: msg,
      });
      setErrors((prev) => ({ ...prev, submit: msg }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add New Course"
      subtitle="Create a course and add it to your academic catalogue."
      maxWidth="md"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={submitting} loadingLabel="Saving..." type="submit">
            Save Course
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField label="Course Code *" error={errors.code} helperText="Use the official academic course code.">
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              className={`cos-input ${invalid ? "border-red-300" : ""}`}
              placeholder="e.g., CS101 or BCA108"
              maxLength={32}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              autoFocus
            />
          )}
        </FormField>

        <FormField label="Course Name *" error={errors.name} helperText="Enter the official course title used in the academic catalogue.">
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`cos-input ${invalid ? "border-red-300" : ""}`}
              placeholder="e.g., Advanced Data Structures"
              maxLength={180}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </FormField>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SelectField label="Department *" error={errors.department} required>
            <option value="">Select department</option>
            {departments.map((dept) => (
              <option key={dept.code || dept.name} value={dept.name}>
                {dept.name}
              </option>
            ))}
          </SelectField>

          <FormField label="Credits *" error={errors.credits} helperText="Credit hours">
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

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          <FontAwesomeIcon icon={faBookOpen} />
          {showAdvanced ? "Hide additional details" : "+ Add additional details"}
        </button>

        {showAdvanced && (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectField label="Course Type">
                {COURSE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Semester">
                {SEMESTERS.map((sem) => (
                  <option key={sem} value={sem}>
                    Semester {sem}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectField label="Academic Year">
                <option value="">Select year</option>
                {academicYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Program">
                <option value="">Select program</option>
                {programs.map((prog) => (
                  <option key={prog} value={prog}>
                    {prog}
                  </option>
                ))}
              </SelectField>
            </div>

            <FormField label="Description">
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="cos-input min-h-[80px] resize-y"
                  placeholder="Optional course description..."
                  maxLength={4000}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>
          </div>
        )}
      </form>
    </Modal>
  );
};


