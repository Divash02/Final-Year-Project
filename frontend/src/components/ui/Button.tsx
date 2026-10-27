import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link" | "outline";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconDefinition;
  iconPosition?: "left" | "right";
  isLoading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "cos-btn-primary",
  secondary: "cos-btn-secondary",
  ghost: "cos-btn-ghost",
  danger: "cos-btn-danger",
  link: "cos-btn-link",
  outline: "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "min-h-[2rem] px-2.5 text-xs",
  sm: "min-h-[2.25rem] px-3 text-xs",
  md: "min-h-[2.5rem] px-3.5 text-sm",
  lg: "min-h-[2.75rem] px-5 text-sm",
};

const ICON_CLASSES: Record<ButtonSize, string> = {
  xs: "text-[0.75em]",
  sm: "text-[0.8125em]",
  md: "text-sm",
  lg: "text-base",
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  isLoading = false,
  loadingLabel,
  fullWidth = false,
  className = "",
  disabled,
  type = "button",
  ...props
}) => {
  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className={[
        "cos-btn",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {isLoading ? (
        <span
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        icon &&
        iconPosition === "left" && (
          <FontAwesomeIcon icon={icon} className={ICON_CLASSES[size]} aria-hidden="true" />
        )
      )}
      <span>{isLoading && loadingLabel ? loadingLabel : children}</span>
      {!isLoading && icon && iconPosition === "right" && (
        <FontAwesomeIcon icon={icon} className={ICON_CLASSES[size]} aria-hidden="true" />
      )}
    </button>
  );
};

export default Button;