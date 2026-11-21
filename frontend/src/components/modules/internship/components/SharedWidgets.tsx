import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faTimes,
  faBuilding,
  faMapMarkerAlt,
  faClock,
  faMoneyBillWave,
  faUserGraduate,
  faArrowRight,
  faChevronLeft,
  faChevronRight,
  faCalendarAlt,
  faFolderOpen,
  faExclamationCircle,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";

// ----------------------------------------------------------------------
// Status Badges
// ----------------------------------------------------------------------

export const StatusBadge: React.FC<{ status: string; type?: "status" | "priority" | "mode" }> = ({
  status,
  type = "status",
}) => {
  const getBadgeStyle = () => {
    switch (status) {
      case "OPEN":
      case "APPROVED":
      case "VERIFIED":
      case "ACTIVE":
      case "ACTIVE_PLACEMENT":
      case "DONE":
      case "COMPLETED":
      case "PRESENT":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";

      case "SUBMITTED":
      case "IN_PROGRESS":
      case "SHORTLISTED":
      case "INTERVIEW_SCHEDULED":
      case "INVESTIGATING":
        return "bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800";

      case "UNDER_REVIEW":
      case "PENDING":
      case "PENDING_APPROVAL":
      case "TODO":
      case "BACKLOG":
      case "HALF_DAY":
      case "LATE":
        return "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800";

      case "OFFER_EXTENDED":
      case "IN_REVIEW":
        return "bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800";

      case "REJECTED":
      case "TERMINATED":
      case "BLOCKED":
      case "ABSENT":
      case "SEV1_CRITICAL":
      case "URGENT":
      case "HIGH":
        return "bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-800";

      default:
        return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700";
    }
  };

  const formatText = (txt: string) => {
    return txt.replace(/_/g, " ");
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getBadgeStyle()}`}
    >
      {formatText(status)}
    </span>
  );
};

// ----------------------------------------------------------------------
// Metric / KPI Card
// ----------------------------------------------------------------------

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  trend?: string;
  trendPositive?: boolean;
  color?: "emerald" | "blue" | "indigo" | "amber" | "rose";
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendPositive = true,
  color = "emerald",
}) => {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <h4 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{value}</h4>
          {subtitle && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm ${colorMap[color]}`}>
          <FontAwesomeIcon icon={icon} />
        </div>
      </div>
      {trend && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] flex items-center space-x-1">
          <span className={`font-semibold ${trendPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {trend}
          </span>
          <span className="text-slate-400">vs previous cohort</span>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// Pagination & Table Controls
// ----------------------------------------------------------------------

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}) => {
  const startIdx = (currentPage - 1) * itemsPerPage + 1;
  const endIdx = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
      <div>
        Showing <span className="font-semibold text-slate-900 dark:text-white">{totalItems > 0 ? startIdx : 0}</span> to{" "}
        <span className="font-semibold text-slate-900 dark:text-white">{endIdx}</span> of{" "}
        <span className="font-semibold text-slate-900 dark:text-white">{totalItems}</span> results
      </div>
      <div className="flex items-center space-x-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="mr-1" /> Prev
        </button>
        <span className="px-2 font-medium">
          Page {currentPage} of {Math.max(1, totalPages)}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Next <FontAwesomeIcon icon={faChevronRight} className="ml-1" />
        </button>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// Empty State View
// ----------------------------------------------------------------------

interface EmptyStateViewProps {
  icon: any;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyStateView: React.FC<EmptyStateViewProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl my-4">
      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center text-lg mb-3">
        <FontAwesomeIcon icon={icon} />
      </div>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// Interactive Drawer Wrapper
// ----------------------------------------------------------------------

interface DrawerWrapperProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const DrawerWrapper: React.FC<DrawerWrapperProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// Reusable Modal Component
// ----------------------------------------------------------------------

interface ModalWrapperProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const ModalWrapper: React.FC<ModalWrapperProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faTimes} className="text-xs" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};
