import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faChevronRight,
  faClock,
  faUser,
  faCircle,
  faEye,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { Table } from "../ui/Table";
import type { UserActivityTableResponse } from "../../services/analyticsApi";

interface UserActivityTableProps {
  data: UserActivityTableResponse;
  loading?: boolean;
  filters: {
    startDate: string;
    endDate: string;
    department: string;
    role: string;
    academicYear: string;
    userId: string;
    activeOnly: boolean;
  };
  onFilterChange: (filters: typeof filters) => void;
  onApply: () => void;
  onReset: () => void;
  onUserClick: (userId: string) => void;
}

export const UserActivityTable: React.FC<UserActivityTableProps> = ({
  data,
  loading,
  filters,
  onFilterChange,
  onApply,
  onReset,
  onUserClick,
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "lastActive", direction: "desc" });
  const [selectedUser, setSelectedUser] = useState<typeof data.users[0] | null>(null);

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedUsers = [...data.users].sort((a, b) => {
    const aVal = a[sortConfig.key as keyof typeof a];
    const bVal = b[sortConfig.key as keyof typeof b];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    const comparison = String(aVal).localeCompare(String(bVal));
    return sortConfig.direction === "asc" ? comparison : -comparison;
  });

  const getStatusBadge = (status: string, isActiveNow: boolean) => {
    if (isActiveNow) return <Badge variant="success" size="sm"><FontAwesomeIcon icon={faCircle} className="mr-1" /> Active Now</Badge>;
    switch (status) {
      case "ACTIVE": return <Badge variant="success" size="sm">Active</Badge>;
      case "SUSPENDED": return <Badge variant="warning" size="sm">Suspended</Badge>;
      case "DISABLED": return <Badge variant="danger" size="sm">Disabled</Badge>;
      case "ARCHIVED": return <Badge variant="neutral" size="sm">Archived</Badge>;
      default: return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-sm" />
            <input
              type="text"
              placeholder="Search users by name, email, role..."
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 w-64"
              onChange={(e) => onFilterChange({ ...filters, userId: e.target.value })}
            />
            <select
              value={filters.role}
              onChange={(e) => onFilterChange({ ...filters, role: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              <option value="ALL">All Roles</option>
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
              <option value="hod">HOD</option>
              <option value="registrar">Registrar</option>
              <option value="exam_officer">Exam Officer</option>
              <option value="finance_officer">Finance Officer</option>
              <option value="campus_admin">Campus Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <select
              value={filters.department}
              onChange={(e) => onFilterChange({ ...filters, department: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              <option value="ALL">All Departments</option>
              <option value="Computer Science">Computer Science</option>
              <option value="Management">Management</option>
              <option value="Business Administration">Business</option>
              <option value="Information Technology">Information Tech</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={filters.activeOnly}
                onChange={(e) => onFilterChange({ ...filters, activeOnly: e.target.checked })}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Active Only
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={onApply} isLoading={loading}>
              Apply
            </Button>
            <Button size="sm" variant="ghost" onClick={onReset}>
              Reset
            </Button>
          </div>
        </div>
      </div>

      {loading && !data.users.length && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent mx-auto" />
          <p className="text-sm text-slate-500 mt-2">Loading user activity...</p>
        </div>
      )}

      {!loading && data.users.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <FontAwesomeIcon icon={faUser} className="text-4xl text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500 mt-2">No users found matching the current filters.</p>
        </div>
      )}

      {!loading && data.users.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <Table>
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left p-3 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-700"
                  onClick={() => handleSort("userName")}>
                  User <FontAwesomeIcon icon={sortConfig.key === "userName" ? (sortConfig.direction === "asc" ? faChevronUp : faChevronDown) : faChevronRight} className="ml-1 text-xs" />
                </th>
                <th className="text-left p-3 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-700"
                  onClick={() => handleSort("role")}>
                  Role <FontAwesomeIcon icon={sortConfig.key === "role" ? (sortConfig.direction === "asc" ? faChevronUp : faChevronDown) : faChevronRight} className="ml-1 text-xs" />
                </th>
                <th className="text-left p-3 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-700"
                  onClick={() => handleSort("department")}>
                  Department
                </th>
                <th className="text-left p-3 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-700"
                  onClick={() => handleSort("lastLogin")}>
                  Last Login <FontAwesomeIcon icon={sortConfig.key === "lastLogin" ? (sortConfig.direction === "asc" ? faChevronUp : faChevronDown) : faChevronRight} className="ml-1 text-xs" />
                </th>
                <th className="text-left p-3 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-700"
                  onClick={() => handleSort("lastActive")}>
                  Last Active <FontAwesomeIcon icon={sortConfig.key === "lastActive" ? (sortConfig.direction === "asc" ? faChevronUp : faChevronDown) : faChevronRight} className="ml-1 text-xs" />
                </th>
                <th className="text-left p-3 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-700"
                  onClick={() => handleSort("totalSessions")}>
                  Sessions <FontAwesomeIcon icon={sortConfig.key === "totalSessions" ? (sortConfig.direction === "asc" ? faChevronUp : faChevronDown) : faChevronRight} className="ml-1 text-xs" />
                </th>
                <th className="text-left p-3 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-700"
                  onClick={() => handleSort("totalTimeSpent")}>
                  Total Time <FontAwesomeIcon icon={sortConfig.key === "totalTimeSpent" ? (sortConfig.direction === "asc" ? faChevronUp : faChevronDown) : faChevronRight} className="ml-1 text-xs" />
                </th>
                <th className="text-left p-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Top Module
                </th>
                <th className="text-left p-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Status
                </th>
                <th className="text-right p-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => (
                <tr
                  key={user.userId}
                  onClick={() => onUserClick(user.userId)}
                  className="hover:bg-slate-50 cursor-pointer transition border-t border-slate-100"
                >
                  <td className="p-3 text-sm font-medium text-slate-900">
                    <div className="font-semibold">{user.userName}</div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                  </td>
                  <td className="p-3 text-sm text-slate-700">
                    <Badge variant="neutral" size="sm">{user.role.replace("_", " ")}</Badge>
                  </td>
                  <td className="p-3 text-sm text-slate-700">{user.department || "N/A"}</td>
                  <td className="p-3 text-sm text-slate-600 font-mono">{formatDate(user.lastLogin)}</td>
                  <td className="p-3 text-sm text-slate-600 font-mono">{formatDate(user.lastActive)}</td>
                  <td className="p-3 text-sm font-mono text-slate-900">{user.totalSessions.toLocaleString()}</td>
                  <td className="p-3 text-sm font-mono text-slate-900">{formatDuration(user.totalTimeSpent)}</td>
                  <td className="p-3 text-sm text-slate-700 truncate max-w-[150px]">{user.mostVisitedModule}</td>
                  <td className="p-3">{getStatusBadge(user.accountStatus, user.isActiveNow)}</td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); onUserClick(user.userId); }}
                    >
                      <FontAwesomeIcon icon={faEye} className="mr-1" />
                      View Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          <div className="flex items-center justify-between border-t border-slate-200 p-3 bg-slate-50/50">
            <span className="text-xs text-slate-600">
              Showing {data.users.length} of {data.pagination.total} users
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={data.pagination.page <= 1}
                onClick={() => onFilterChange({ ...filters, page: Math.max(1, data.pagination.page - 1) })}
              >
                Previous
              </Button>
              <span className="text-xs text-slate-600">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={data.pagination.page >= data.pagination.totalPages}
                onClick={() => onFilterChange({ ...filters, page: data.pagination.page + 1 })}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedUser && (
        <Modal
          isOpen={!!selectedUser}
          onClose={() => setSelectedUser(null)}
          title={`${selectedUser.userName} - Activity Details`}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Individual user activity detail view would be implemented here.</p>
            <p className="text-xs text-slate-500">User ID: {selectedUser.userId}</p>
            <Button variant="primary" onClick={() => setSelectedUser(null)}>Close</Button>
          </div>
        </Modal>
      )}
    </div>
  );
};