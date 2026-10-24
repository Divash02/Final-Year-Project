/**
 * CollegeOS notification policy — single source of truth for auto-dismiss
 * durations and which messages must stay visible.
 *
 * Two tiers:
 *  - `toastDurations` — floating toasts that auto-dismiss.
 *  - `PERSISTENT` — messages that must NOT auto-dismiss (modals, form-level
 *    errors, unsaved-changes, auth, destructive confirmations).
 */

/** Default auto-dismiss durations (milliseconds). */
export const TOAST_DURATIONS = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 7000,
  camera: 5000,
} as const;

export type ToastVariant = "success" | "info" | "warning" | "error";

/** Resolve the default duration for a toast variant. */
export function defaultDuration(
  variant: ToastVariant,
  override?: number | null,
): number {
  if (override !== undefined && override !== null) return override;
  return TOAST_DURATIONS[variant];
}

/**
 * Messages that must remain visible until the user acts or the underlying
 * problem is resolved. These are NOT toasts — they are inline banners,
 * modals, or form-level errors.
 */
export const PERSISTENT = {
  /** Form-level validation errors stay until corrected or revalidated. */
  formValidation: true,
  /** Destructive-action confirmations require explicit confirmation. */
  destructiveConfirm: true,
  /** Unsaved-changes dialogs must not auto-close. */
  unsavedChanges: true,
  /** Authentication / session-expiry flows follow their own logic. */
  authSession: true,
  /** Critical data-loss or security warnings require acknowledgement. */
  criticalWarning: true,
  /** Loading indicators remain only while the operation runs. */
  loading: true,
} as const;

/** Returns true when a message is safe to auto-dismiss. */
export function isAutoDismissible(kind: keyof typeof PERSISTENT): boolean {
  return !PERSISTENT[kind];
}