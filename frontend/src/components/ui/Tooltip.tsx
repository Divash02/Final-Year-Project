import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface TooltipProps {
  label: string;
  children: React.ReactElement;
  placement?: "top" | "bottom" | "left" | "right";
  offset?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  label,
  children,
  placement = "right",
  offset = 8,
}) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const tooltipId = useId();
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  const updatePosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const margin = offset;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let top = 0;
    let left = 0;
    let finalPlacement = placement;

    switch (finalPlacement) {
      case "top":
        top = triggerRect.top - tooltipRect.height - margin;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        if (top < margin) finalPlacement = "bottom";
        break;
      case "bottom":
        top = triggerRect.bottom + margin;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        if (top + tooltipRect.height > viewportHeight - margin) finalPlacement = "top";
        break;
      case "left":
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.left - tooltipRect.width - margin;
        if (left < margin) finalPlacement = "right";
        break;
      case "right":
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.right + margin;
        if (left + tooltipRect.width > viewportWidth - margin) finalPlacement = "left";
        break;
    }

    switch (finalPlacement) {
      case "top":
        top = triggerRect.top - tooltipRect.height - margin;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
      case "bottom":
        top = triggerRect.bottom + margin;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
      case "left":
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.left - tooltipRect.width - margin;
        break;
      case "right":
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.right + margin;
        break;
    }

    left = Math.max(margin, Math.min(viewportWidth - tooltipRect.width - margin, left));
    top = Math.max(margin, Math.min(viewportHeight - tooltipRect.height - margin, top));

    setPosition({ top, left });
  };

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        updatePosition();
      }, 0);
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [visible, placement]);

  const showTooltip = () => setVisible(true);
  const hideTooltip = () => {
    setVisible(false);
    setPosition(null);
  };

  const tooltipElement = (
    <span
      ref={tooltipRef}
      role="tooltip"
      id={tooltipId}
      style={
        position
          ? {
              position: "fixed",
              top: position.top,
              left: position.left,
              zIndex: 20000,
            }
          : {
              position: "fixed",
              visibility: "hidden",
              top: -1000,
              left: -1000,
              zIndex: 20000,
            }
      }
      className={[
        "pointer-events-none absolute whitespace-nowrap rounded-lg px-2.5 py-1",
        "bg-slate-900 text-xs font-medium text-white shadow-lg",
        "opacity-0 transition-opacity duration-150",
        visible && position ? "opacity-100" : "",
      ].join(" ")}
    >
      {label}
    </span>
  );

  return (
    <>
      <span
        ref={triggerRef}
        className="relative inline-flex"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {React.cloneElement(children, {
          "aria-describedby": visible ? tooltipId : undefined,
        } as React.Attributes)}
      </span>
      {visible && createPortal(tooltipElement, document.body)}
    </>
  );
};

export default Tooltip;
