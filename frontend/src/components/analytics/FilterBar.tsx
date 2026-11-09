import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFilter,
  faRotateRight,
  faFileArrowDown,
  faCalendarAlt,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../ui/Button";

export interface AnalyticsFilterState {
  academicYear: string;
  semester: string;
  department: string;
  program: string;
  startDate: string;
  endDate: string;
}

export interface FilterBarProps {
  filters: AnalyticsFilterState;
  onFilterChange: (filters: AnalyticsFilterState) => void;
  onApply: () => void;
  onReset: () => void;
  onExport: (format: "csv" | "print") => void;
  isLoading?: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onFilterChange,
  onApply,
  onReset,
  onExport,
  isLoading = false,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleChange = (field: keyof AnalyticsFilterState, value: string) => {
    onFilterChange({
      ...filters,
      [field]: value,
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Main Filters Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mr-1">
            <FontAwesomeIcon icon={faFilter} className="text-teal-700" />
            <span>Filters:</span>
          </div>

          {/* Academic Year */}
          <select
            value={filters.academicYear}
            onChange={(e) => handleChange("academicYear", e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          >
            <option value="ALL">Academic Year: All</option>
            <option value="2083/84">AY 2083/84</option>
            <option value="2082/83">AY 2082/83</option>
            <option value="2081/82">AY 2081/82</option>
          </select>

          {/* Department */}
          <select
            value={filters.department}
            onChange={(e) => handleChange("department", e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          >
            <option value="ALL">All Departments</option>
            <option value="Computer Science">Computer Science</option>
            <option value="Management">Management</option>
            <option value="Business Administration">Business</option>
            <option value="Information Technology">Information Tech</option>
          </select>

          {/* Program */}
          <select
            value={filters.program}
            onChange={(e) => handleChange("program", e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          >
            <option value="ALL">All Programs</option>
            <option value="BScIT">BScIT</option>
          </select>

          {/* Semester */}
          <select
            value={filters.semester}
            onChange={(e) => handleChange("semester", e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          >
            <option value="ALL">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s.toString()}>
                Semester {s}
              </option>
            ))}
          </select>

          {/* Date range toggle / inputs */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleChange("startDate", e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              title="Start Date"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleChange("endDate", e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              title="End Date"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="primary"
            onClick={onApply}
            isLoading={isLoading}
          >
            Apply Filters
          </Button>

          <Button
            size="sm"
            variant="ghost"
            icon={faRotateRight}
            onClick={onReset}
            title="Reset Filters"
          >
            Reset
          </Button>

          <div className="h-4 w-px bg-slate-200" />

          <Button
            size="sm"
            variant="secondary"
            icon={faFileArrowDown}
            onClick={() => onExport("csv")}
            title="Export CSV"
          >
            Export
          </Button>
        </div>
      </div>
    </div>
  );
};
