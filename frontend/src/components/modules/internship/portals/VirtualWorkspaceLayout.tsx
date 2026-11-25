import React from "react";

export const VirtualWorkspaceLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="space-y-6">{children}</div>
);

export const VirtualWorkspaceHeader: React.FC<{
  title: string;
  description?: string;
  breadcrumbs?: { label: string }[];
}> = ({ title, description, breadcrumbs }) => (
  <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
    {breadcrumbs && breadcrumbs.length > 0 && (
      <div className="text-xs text-slate-500 mb-1">
        {breadcrumbs.map((b, i) => (
          <span key={i}>{i > 0 ? " / " : ""}{b.label}</span>
        ))}
      </div>
    )}
    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
    {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>}
  </div>
);

export const VirtualWorkspaceCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 ${className || ""}`}>{children}</div>
);

export const VirtualWorkspaceSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">{title}</h3>
    {children}
  </div>
);
