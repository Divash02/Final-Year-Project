import React from "react";

export interface ListPaneProps {
  /** Accessible name for the collection region. */
  label: string;
  /** Optional heading above the toolbar (e.g. "Folders"). */
  heading?: string;
  /** Search / filter / sort controls. */
  toolbar?: React.ReactNode;
  /** Selectable collection rows. */
  children: React.ReactNode;
  /** Footer slot, e.g. counts or sync status. */
  footer?: React.ReactNode;
}

/**
 * 320px collection pane used for folders, conversations, requests, calendars and
 * notifications. Rendering stays readable at every breakpoint.
 */
export const ListPane: React.FC<ListPaneProps> = ({
  label,
  heading,
  toolbar,
  children,
  footer,
}) => (
  <section
    aria-label={label}
    className="flex h-full max-h-[70vh] min-h-0 flex-col bg-white lg:max-h-none"
  >
    {heading && (
      <h2 className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {heading}
      </h2>
    )}

    {toolbar && (
      <div className="border-b border-slate-200 px-3 py-3">{toolbar}</div>
    )}

    <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

    {footer && (
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
        {footer}
      </div>
    )}
  </section>
);

export default ListPane;