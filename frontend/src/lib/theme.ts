/**
 * CollegeOS design tokens.
 *
 * Mirrors the CSS custom properties in `index.css`. Use these values in
 * TypeScript (inline styles, canvas/SVG geometry, calendar math) and never
 * hardcode colours or sizes in components.
 */

export const THEME = {
  colors: {
    background: "#F1F5F9",
    surface: "#F8FAFC",
    surfaceStrong: "#FFFFFF",
    surfaceMuted: "#F8FAFC",

    border: "#E2E8F0",
    borderStrong: "#CBD5E1",

    textPrimary: "#0F172A",
    textSecondary: "#334155",
    textMuted: "#64748B",

    primary: "#0F766E",
    primaryStrong: "#115E59",
    primarySoft: "#DFF7F4",
    primaryHover: "#0D9488",

    accent: "#EA580C",
    accentSoft: "#FFEDD5",

    secondary: "#1D4ED8",
    secondarySoft: "#E8F0FF",
    success: "#15803D",
    successSoft: "#DCFCE7",
    warning: "#B45309",
    warningSoft: "#FEF3C7",
    danger: "#B91C1C",
    dangerSoft: "#FEE2E2",
    info: "#1D4ED8",
    infoSoft: "#DBEAFE",
    neutral: "#475569",
    neutralSoft: "#E2E8F0",

    sidebar: "#FFFFFF",
    sidebarSoft: "#F6F7F5",
    sidebarBorder: "#E4E7E3",
    sidebarText: "#1F2937",
    sidebarTextMuted: "#6B7280",
    selected: "#0F766E",

    hover: "#F1F5F9",
    active: "#E2E8F0",
    focusRing: "rgba(15, 118, 110, 0.45)",

    shadowSoft: "rgba(15, 23, 42, 0.08)",
    shadowCard: "0 1px 2px rgba(15, 23, 42, 0.05)",
    shadowRaised: "0 8px 24px -12px rgba(15, 23, 42, 0.24)",
  },
  typography: {
    fontFamily:
      '"Inter var", "Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, "Noto Sans Devanagari", "Nirmala UI", sans-serif',
    /** Root font size in index.css; every rem-based size derives from it. */
    rootFontSizePx: 17,
    fontSize: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
    },
    fontWeight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.55,
      relaxed: 1.75,
    },
    letterSpacing: {
      tight: "-0.011em",
      tightHeading: "-0.015em",
      wide: "0.06em",
    },
  },
  spacing: {
    page: "2rem",
    section: "1.75rem",
    card: "1.375rem",
    form: "1.125rem",
    table: "0.875rem",
    sidebar: "1rem",
    nav: "0.375rem",
    modal: "1.5rem",
  },
  radius: {
    control: "0.625rem",
    card: "0.75rem",
    panel: "1rem",
    hero: "1.5rem",
  },
  layout: {
    /** 240px */
    sidebarWidth: 240,
    /** 320px */
    listPaneWidth: 320,
    /** 48px */
    rightRailWidth: 48,
    navItemHeight: 42,
    controlHeight: 44,
  },
} as const;

/** Event categories shared by the week calendar and the exam timetable. */
export const CALENDAR_EVENT_TYPES = [
  "lecture",
  "lab",
  "tutorial",
  "exam",
  "meeting",
  "office_hour",
  "assignment",
  "administrative",
  "holiday",
] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const CALENDAR_EVENT_TYPE_STYLES: Record<
  CalendarEventType,
  { background: string; border: string; text: string }
> = {
  lecture: {
    background: "rgba(15, 118, 110, 0.10)",
    border: "#0F766E",
    text: "#115E59",
  },
  lab: {
    background: "rgba(29, 78, 216, 0.10)",
    border: "#1D4ED8",
    text: "#1E40AF",
  },
  tutorial: {
    background: "rgba(5, 150, 105, 0.10)",
    border: "#059669",
    text: "#065F46",
  },
  exam: {
    background: "rgba(185, 28, 28, 0.10)",
    border: "#B91C1C",
    text: "#991B1B",
  },
  meeting: {
    background: "rgba(180, 83, 9, 0.10)",
    border: "#B45309",
    text: "#92400E",
  },
  office_hour: {
    background: "rgba(234, 88, 12, 0.10)",
    border: "#EA580C",
    text: "#9A3412",
  },
  assignment: {
    background: "rgba(124, 58, 237, 0.10)",
    border: "#7C3AED",
    text: "#5B21B6",
  },
  administrative: {
    background: "rgba(71, 85, 105, 0.10)",
    border: "#475569",
    text: "#334155",
  },
  holiday: {
    background: "rgba(220, 38, 38, 0.08)",
    border: "#DC2626",
    text: "#7F1D1D",
  },
};

export const CALENDAR_EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  lecture: "Lecture",
  lab: "Lab",
  tutorial: "Tutorial",
  exam: "Exam",
  meeting: "Meeting",
  office_hour: "Office Hour",
  assignment: "Assignment",
  administrative: "Administrative",
  holiday: "Holiday",
};