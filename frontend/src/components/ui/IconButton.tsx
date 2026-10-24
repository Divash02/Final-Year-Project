import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Tooltip, type TooltipProps } from "./Tooltip";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconDefinition;
  label: string;
  variant?: "ghost" | "secondary" | "danger" | "primary";
  size?: "sm" | "md";
  tooltipPlacement?: TooltipProps["placement"];
  hideTooltip?: boolean;
}

const ICON_BUTTON_VARIANTS = {
  ghost: "cos-icon-btn",
  secondary: "cos-btn cos-btn-secondary h-[2.75rem] w-[2.75rem] p-0",
  primary: "cos-btn cos-btn-primary h-[2.75rem] w-[2.75rem] p-0",
  danger: "cos-icon-btn bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white border border-[var(--color-danger)]/30",
} as const;

const ICON_BUTTON_SIZES = {
  sm: "h-9 w-9",
  md: "",
} as const;

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  variant = "ghost",
  size = "md",
  tooltipPlacement = "right",
  hideTooltip = false,
  className = "",
  type = "button",
  ...props
}) => {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={[
        ICON_BUTTON_VARIANTS[variant],
        ICON_BUTTON_SIZES[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <FontAwesomeIcon
        icon={icon}
        className="text-base"
        aria-hidden="true"
      />
    </button>
  );

  if (hideTooltip) return button;
  return (
    <Tooltip label={label} placement={tooltipPlacement}>
      {button}
    </Tooltip>
  );
};

export default IconButton;
