import React, { useEffect, useId, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "../../ui/IconButton";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Actions pinned to the drawer footer. */
  footer?: React.ReactNode;
  /** Panel width. */
  width?: "sm" | "md" | "lg" | "xl";
  /** Side the drawer slides in from. */
  side?: "right" | "left";
  className?: string;
}

const WIDTH_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
} as const;

/**
 * Side drawer for contextual work (upload, template picker,
 * question bank, composer details).
 *
 * Accessible: Escape closes, focus is trapped while open and
 * restored on close, and the panel is labelled. On mobile the
 * drawer becomes a full-screen sheet rather than a shrunk panel.
 */
export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
  side = "right",
  className = "",
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const focusTimer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(
          'input:not([type="hidden"]), textarea, select, button',
        )
        ?.focus();
    }, 0);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = "";
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const slideIn =
    side === "right"
      ? "translate-x-0"
      : "translate-x-0";

  return (
    <div className="fixed inset-0 z-[140]" role="presentation">
      <button
        type="button"
        aria-label="Close drawer"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-950/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          "absolute top-16 bottom-0 flex w-full flex-col border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950",
          WIDTH_CLASSES[width],
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          slideIn,
          className,
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            {subtitle && (
              <p className="cos-page-subtitle">{subtitle}</p>
            )}
          </div>
          <IconButton
            icon={faXmark}
            label="Close drawer"
            onClick={onClose}
            hideTooltip
            className="-mr-1.5 -mt-1"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-4">
          {children}
        </div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Drawer;
