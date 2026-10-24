import React from "react";

export type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "error"
  | "info"
  | "primary"
  | "neutral"
  | "accent";

export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  /** Hides the leading dot for dense contexts. */
  hideDot?: boolean;
}

const DOT_CLASSES: Record<BadgeVariant, string> = {
  success: "bg-emerald-600",
  warning: "bg-amber-500",
  danger: "bg-red-600",
  error: "bg-red-600",
  info: "bg-blue-600",
  primary: "bg-[var(--color-primary)]",
  accent: "bg-orange-500",
  neutral: "bg-slate-400",
};

const TEXT_CLASSES: Record<BadgeVariant, string> = {
  success: "text-emerald-800",
  warning: "text-amber-800",
  danger: "text-red-800",
  error: "text-red-800",
  info: "text-blue-800",
  primary: "text-[var(--color-primary-strong)]",
  accent: "text-orange-800",
  neutral: "text-slate-700",
};

const FRAME_CLASSES: Record<BadgeVariant, string> = {
  success: "border-emerald-200 bg-emerald-50",
  warning: "border-amber-200 bg-amber-50",
  danger: "border-red-200 bg-red-50",
  error: "border-red-200 bg-red-50",
  info: "border-blue-200 bg-blue-50",
  primary: "border-teal-200 bg-[var(--color-primary-soft)]",
  accent: "border-orange-200 bg-orange-50",
  neutral: "border-slate-200 bg-slate-100",
};

/**
 * Status tag. Status is never communicated by colour alone: every badge pairs a
 * coloured indicator with readable text.
 */
export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "neutral",
  size = "sm",
  className = "",
  hideDot = false,
}) => {
  const sizeClasses =
    size === "sm"
      ? "gap-1.5 px-2 py-0.5 text-xs"
      : "gap-2 px-2.5 py-1 text-sm";

  return (
    <span
      className={[
        "inline-flex items-center rounded-md border font-medium leading-tight",
        FRAME_CLASSES[variant],
        TEXT_CLASSES[variant],
        sizeClasses,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!hideDot && (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[variant]}`}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </span>
  );
};

export default Badge;