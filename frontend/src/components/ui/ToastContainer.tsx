import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { Toast, type ToastItem } from "./Toast";

export interface ToastApi {
  showToast: (message: string, variant?: "success" | "info" | "warning" | "error") => void;
  toast: (options: {
    variant?: "success" | "info" | "warning" | "error";
    message: string;
    detail?: string;
    duration?: number | null;
    action?: { label: string; onClick: () => void };
    id?: string;
  }) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  update: (id: string, options: Partial<Omit<ToastItem, "id" | "createdAt">>) => void;
}

const DEFAULT_DURATIONS: Record<string, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 7000,
};

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be rendered inside a <ToastProvider>");
  }
  return ctx;
}

function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ToastProviderProps {
  children: React.ReactNode;
  position?:
    | "top-right"
    | "top-left"
    | "bottom-right"
    | "bottom-left"
    | "top-center"
    | "bottom-center";
  maxToasts?: number;
}

/**
 * Global toast provider. Renders a fixed portal of floating notifications.
 * Timers are scoped per toast id; dismissing or replacing one never affects
 * the others. Replacing a toast (same id) resets its timer to the new duration.
 */
export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  position = "bottom-right",
  maxToasts = 5,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const hoverRef = useRef(false);
  const timersRef = useRef<Map<string, number>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const scheduleDismiss = useCallback(
    (item: ToastItem) => {
      clearTimer(item.id);
      if (item.duration === null || item.duration === undefined) return;
      const timer = window.setTimeout(() => {
        timersRef.current.delete(item.id);
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, item.duration);
      timersRef.current.set(item.id, timer);
    },
    [clearTimer],
  );

  const api = useMemo<ToastApi>(() => {
    const showToast = (message: string, variant: "success" | "info" | "warning" | "error" = "info") => { toast({ message, variant }); };
    const toast: ToastApi["toast"] = (options) => {
      const id = options.id ?? generateId();
      const variant = options.variant ?? "info";
      const duration =
        options.duration ?? DEFAULT_DURATIONS[variant] ?? 5000;
      const item: ToastItem = {
        id,
        variant,
        message: options.message,
        detail: options.detail,
        duration,
        action: options.action,
        createdAt: Date.now(),
      };
      setToasts((prev) => {
        const existing = prev.find((t) => t.id === id);
        if (existing) {
          clearTimer(id);
          return prev.map((t) => (t.id === id ? item : t));
        }
        const next = [item, ...prev];
        return next.slice(0, maxToasts);
      });
      scheduleDismiss(item);
      return id;
    };

    const dismiss: ToastApi["dismiss"] = (id) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const dismissAll: ToastApi["dismissAll"] = () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
      setToasts([]);
    };

    const update: ToastApi["update"] = (id, options) => {
      setToasts((prev) => {
        const existing = prev.find((t) => t.id === id);
        if (!existing) return prev;
        const updated: ToastItem = { ...existing, ...options };
        clearTimer(id);
        scheduleDismiss(updated);
        return prev.map((t) => (t.id === id ? updated : t));
      });
    };

    return { showToast, toast, dismiss, dismissAll, update };
  }, [clearTimer, scheduleDismiss, maxToasts]);

  const handleMouseEnter = () => {
    hoverRef.current = true;
    // Pause every pending timer. Keys are toast ids, so clear by id.
    toasts.forEach((t) => clearTimer(t.id));
  };
  const handleMouseLeave = () => {
    hoverRef.current = false;
    // Re-arm every toast's timer. Hovering restarts the countdown, which is
    // the standard accessible behaviour for non-blocking toasts.
    toasts.forEach((t) => scheduleDismiss(t));
  };

  const containerClass = [
    "cos-toast-container",
    `cos-toast-container-${position}`,
  ].join(" ");

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <div
          className={containerClass}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {toasts.map((t) => (
            <Toast
              key={t.id}
              toast={t}
              onDismiss={api.dismiss}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export default ToastProvider;