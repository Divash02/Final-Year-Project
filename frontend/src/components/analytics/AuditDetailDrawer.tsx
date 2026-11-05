import React from "react";
import { Drawer } from "../ui/Drawer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClockRotateLeft,
  faUser,
  faServer,
  faShieldHalved,
  faLayerGroup,
  faCodeBranch,
  faNetworkWired,
  faCheckCircle,
  faExclamationCircle,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../ui/Button";

export interface AuditLogItem {
  id: string;
  action: string;
  module: string;
  resource?: string;
  resourceId?: string;
  details?: string;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
  user?: {
    id?: string;
    name: string;
    email: string;
    roles?: string[];
  } | null;
}

interface AuditDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  log: AuditLogItem | null;
}

export const AuditDetailDrawer: React.FC<AuditDetailDrawerProps> = ({
  isOpen,
  onClose,
  log,
}) => {
  if (!log) return null;

  const isFailed = /FAIL|ERROR|BLOCK|DENIED|REJECT/i.test(log.action);
  const formattedDate = new Date(log.createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Audit & Forensic Event Record"
      subtitle={`Event ID: ${log.id}`}
      icon={faClockRotateLeft}
      width="lg"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Status & Action Banner */}
        <div
          className={`flex items-start justify-between gap-4 p-4 rounded-xl border ${
            isFailed
              ? "border-rose-200 bg-rose-50/60"
              : "border-teal-200 bg-teal-50/60"
          }`}
        >
          <div className="space-y-1">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                isFailed
                  ? "bg-rose-100 text-rose-800"
                  : "bg-teal-100 text-teal-800"
              }`}
            >
              <FontAwesomeIcon
                icon={isFailed ? faExclamationCircle : faCheckCircle}
                className="text-[10px]"
              />
              {isFailed ? "Failed / Blocked Event" : "Verified Action"}
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              {log.action}
            </h3>
            {log.details && (
              <p className="text-xs text-slate-700 leading-relaxed">
                {log.details}
              </p>
            )}
          </div>

          <div className="text-right shrink-0">
            <span className="text-[11px] font-mono text-slate-500 block">
              {formattedDate}
            </span>
            <span className="text-[10px] text-slate-400">
              Recorded Server Time
            </span>
          </div>
        </div>

        {/* Actor and Source Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 p-3.5 space-y-2 bg-slate-50/50">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <FontAwesomeIcon icon={faUser} className="text-teal-700" />
              <span>Actor &amp; Authentication</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Name:</span>
                <span className="font-semibold text-slate-800">
                  {log.user?.name || "System"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email:</span>
                <span className="font-mono text-slate-800">
                  {log.user?.email || "internal@collegeos"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Roles:</span>
                <span className="font-semibold text-teal-700">
                  {log.user?.roles?.join(", ") || "system"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3.5 space-y-2 bg-slate-50/50">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <FontAwesomeIcon icon={faServer} className="text-teal-700" />
              <span>Target &amp; Network</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Module:</span>
                <span className="font-mono uppercase font-bold text-slate-800">
                  {log.module}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Resource:</span>
                <span className="font-medium text-slate-800">
                  {log.resource || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Client IP:</span>
                <span className="font-mono text-slate-800">
                  {log.ipAddress || "127.0.0.1"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Resource Identifier */}
        {log.resourceId && (
          <div className="rounded-lg border border-slate-200 p-3 bg-white text-xs flex items-center justify-between">
            <span className="text-slate-500 font-medium">
              Resource ID Reference:
            </span>
            <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
              {log.resourceId}
            </span>
          </div>
        )}

        {/* State Changes Diff (oldValue vs newValue) */}
        {(log.oldValue != null || log.newValue != null) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <FontAwesomeIcon icon={faCodeBranch} className="text-teal-700" />
              <span>State Transition (Change Summary)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                  Previous Value
                </span>
                <pre className="font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all overflow-x-auto max-h-48">
                  {typeof log.oldValue === "object"
                    ? JSON.stringify(log.oldValue, null, 2)
                    : String(log.oldValue ?? "None")}
                </pre>
              </div>

              <div className="rounded-lg border border-teal-200 bg-teal-50/30 p-3">
                <span className="text-[10px] font-bold uppercase text-teal-800 block mb-1">
                  New Value
                </span>
                <pre className="font-mono text-[11px] text-teal-950 whitespace-pre-wrap break-all overflow-x-auto max-h-48">
                  {typeof log.newValue === "object"
                    ? JSON.stringify(log.newValue, null, 2)
                    : String(log.newValue ?? "None")}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Metadata */}
        {log.metadata && Object.keys(log.metadata).length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <FontAwesomeIcon icon={faNetworkWired} className="text-teal-700" />
              <span>Request Context &amp; Metadata</span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-900 p-3 text-slate-100 font-mono text-[11px] overflow-x-auto max-h-48">
              <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
};
