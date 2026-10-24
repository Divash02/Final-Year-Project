import React from "react";

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size of the spinner in pixels (optional) */
  size?: number;
  /** Color of the spinner (optional) */
  color?: string;
}

/**
 * Simple spinner component.
 */
export const Spinner: React.FC<SpinnerProps> = ({
  size = 24,
  color = "currentColor",
  className = "",
  ...props
}) => {
  const spinnerSize = `${size}px`;

  return (
    <div
      role="status"
      aria-label="Loading"
      className={[
        "animate-spin",
        "rounded-full",
        "border-2",
        "border-current",
        "border-t-transparent",
        `h-${size}`,
        `w-${size}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ color }}
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default Spinner;