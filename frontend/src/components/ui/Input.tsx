import React, { useId } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";

export interface FormFieldProps {
  label?: string;
  /** Receives the ids and aria wiring to spread onto the control. */
  children: (control: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => React.ReactNode;
  helperText?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Visually hides the label while keeping it available to screen readers. */
  hideLabel?: boolean;
}

/**
 * Label + control + helper/error, spaced consistently across every CollegeOS
 * form. Status is communicated with text and an icon, never colour alone.
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  children,
  helperText,
  error,
  required = false,
  className = "",
  hideLabel = false,
}) => {
  const fieldId = useId();
  const helperId = `${fieldId}-helper`;
  const errorId = `${fieldId}-error`;
  const describedBy =
    [error ? errorId : null, helperText ? helperId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={className}>
      <label
        htmlFor={fieldId}
        className={`cos-label ${hideLabel ? "sr-only" : ""}`}
      >
        {label}
        {required && (
          <span className="ml-1 text-[var(--color-danger)]" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id: fieldId, describedBy, invalid: Boolean(error) })}
      {error && (
        <p id={errorId} className="cos-error flex items-center gap-1.5" role="alert">
          <FontAwesomeIcon icon={faCircleExclamation} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {!error && helperText && (
        <p id={helperId} className="cos-helper">
          {helperText}
        </p>
      )}
    </div>
  );
};

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  leftIcon?: IconDefinition;
  icon?: IconDefinition;
  /** Rendered inside the field on the trailing edge (e.g. password toggle). */
  trailing?: React.ReactNode;
  helperText?: string;
  error?: string;
  hideLabel?: boolean;
  wrapperClassName?: string;
}

/**
 * Text input with the CollegeOS control styling: 44px minimum height, 12px
 * radius, optional leading Font Awesome icon, and trailing affordances.
 */
export const Input: React.FC<InputProps> = ({
  label = "",
  icon,
  leftIcon,
  trailing,
  helperText,
  error,
  hideLabel = false,
  required = false,
  wrapperClassName = "",
  className = "",
  ...props
}) => (
  <FormField
    label={label}
    helperText={helperText}
    error={error}
    required={required}
    hideLabel={hideLabel}
    className={wrapperClassName}
  >
    {({ id, describedBy, invalid }) => (
      <div className="relative">
        {(icon || leftIcon) && (
          <FontAwesomeIcon
            icon={(icon || leftIcon)!}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-slate-400"
            aria-hidden="true"
          />
        )}
        <input
          id={id}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={[
            "cos-input",
            icon ? "pl-11" : "",
            trailing ? "pr-11" : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />
        {trailing && (
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
            {trailing}
          </div>
        )}
      </div>
    )}
  </FormField>
);

export interface SelectFieldProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  helperText?: string;
  error?: string;
  hideLabel?: boolean;
  wrapperClassName?: string;
  children: React.ReactNode;
}

/** Native select styled to match `Input`. */
export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  helperText,
  error,
  hideLabel = false,
  required = false,
  wrapperClassName = "",
  className = "",
  children,
  ...props
}) => (
  <FormField
    label={label}
    helperText={helperText}
    error={error}
    required={required}
    hideLabel={hideLabel}
    className={wrapperClassName}
  >
    {({ id, describedBy, invalid }) => (
      <select
        id={id}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={`cos-input cursor-pointer pr-9 ${className}`}
        {...props}
      >
        {children}
      </select>
    )}
  </FormField>
);

export default Input;
