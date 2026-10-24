import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Font Awesome icon. Only pass an icon when it carries meaning. */
  icon?: IconDefinition;
  iconPosition?: "left" | "right";
  isLoading?: boolean;
  /** Announced while `isLoading` is true. */
  loadingLabel?: string;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "cos-btn-primary",
  secondary: "cos-btn-secondary",
  ghost: "cos-btn-ghost",
  danger: "cos-btn-danger",
  link: "cos-btn-link",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[2.25rem] px-3 text-xs",
  md: "",
  lg: "min-h-[2.75rem] px-5 text-base",
};

const ICON_CLASSES: Record<ButtonSize, string> = {
  sm: "text-[0.8125em]",
  md: "text-sm",
  lg: "text-base",
};

/**
 * Primary institutional action button. Font Awesome only — no decorative icons.
 */
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