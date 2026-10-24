import { useCallback, useEffect, useRef, useState } from "react";

interface UseUnsavedChangesOptions {
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Callback when user confirms leaving */
  onConfirmLeave?: () => void;
  /** Callback when user cancels leaving */
  onCancelLeave?: () => void;
  /** Custom warning message */
  message?: string;
}

export function useUnsavedChangesWarning({
  isDirty,
  onConfirmLeave,
  onCancelLeave,
}: UseUnsavedChangesOptions) {
  const [showWarning, setShowWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const blockerRef = useRef(false);

  // Browser beforeunload handler
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Block React Router navigation (if using a router with blockers)
  // This is a generic approach - specific router integration would be needed
  const blockNavigation = useCallback((navigate: () => void) => {
    if (isDirty && !blockerRef.current) {
      blockerRef.current = true;
      setPendingNavigation(() => navigate);
      setShowWarning(true);
      return false; // Block navigation
    }
    return true; // Allow navigation
  }, [isDirty]);

  const confirmLeave = useCallback(() => {
    setShowWarning(false);
    blockerRef.current = false;
    if (pendingNavigation) {
      pendingNavigation();
      onConfirmLeave?.();
    }
    setPendingNavigation(null);
  }, [pendingNavigation, onConfirmLeave]);

  const cancelLeave = useCallback(() => {
    setShowWarning(false);
    blockerRef.current = false;
    onCancelLeave?.();
    setPendingNavigation(null);
  }, [onCancelLeave]);

  return {
    showWarning,
    confirmLeave,
    cancelLeave,
    blockNavigation,
  };
}

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  message?: string;
}

export function UnsavedChangesDialog({
  isOpen,
  onConfirm,
  onCancel,
  message = "You have unsaved changes. Are you sure you want to leave?",
}: UnsavedChangesDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 id="unsaved-changes-title" className="text-lg font-semibold text-slate-900">
          Unsaved Changes
        </h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Stay
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 transition"
          >
            Leave Anyway
          </button>
        </div>
      </div>
    </div>
  );
}