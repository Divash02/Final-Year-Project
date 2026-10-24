import React from "react";

interface SkeletonProps {
  className?: string;
}

/** Loading placeholder. Announced once by the surrounding region, not per block. */
export const Skeleton: React.FC<SkeletonProps> = ({ className = "" }) => (
  <div
    className={`animate-pulse rounded-md bg-slate-200/80 ${className}`}
    aria-hidden="true"
  />
);

export const TableSkeleton: React.FC<{
  rows?: number;
  cols?: number;
}> = ({ rows = 5, cols = 4 }) => (
  <div
    className="cos-card overflow-hidden"
    role="status"
    aria-label="Loading table data"
  >
    <div className="flex gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3.5">
      {Array.from({ length: cols }).map((_, index) => (
        <Skeleton key={index} className="h-3 flex-1" />
      ))}
    </div>
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4 px-5 py-4">
          {Array.from({ length: cols }).map((__, cell) => (
            <Skeleton key={cell} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const CardSkeleton: React.FC = () => (
  <div
    className="cos-card space-y-3 p-5"
    role="status"
    aria-label="Loading card data"
  >
    <Skeleton className="h-3 w-1/3" />
    <Skeleton className="h-6 w-1/2" />
    <Skeleton className="h-3 w-2/3" />
  </div>
);