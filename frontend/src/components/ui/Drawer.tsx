import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "./IconButton";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: IconDefinition;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}

const WIDTH_CLASSES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
} as const;

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  width = "lg",
}) => {
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex">
      <button
        type="button"
        aria-label="Close drawer"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative ml-auto flex h-full w-full ${WIDTH_CLASSES[width]} flex-col bg-white shadow-[0_25px_60px_-20px_rgba(15,23,42,0.4)]`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="flex items-start gap-3 min-w-0">
            {icon && (
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                <FontAwesomeIcon icon={icon} className="text-base" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-6 text-slate-900">{title}</h2>
              {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <IconButton
            icon={faXmark}
            label="Close drawer"
            onClick={onClose}
            hideTooltip={false}
            className="-mr-1 -mt-1"
            variant="ghost"
            tooltipPlacement="left"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/50 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Drawer;
