import NepaliDateModule from "nepali-date-converter";

const NepaliDateClass =
  (NepaliDateModule && NepaliDateModule.default) || NepaliDateModule;

export const TIMEZONE = "Asia/Kathmandu";

export const NEPALI_MONTHS = [
  "Baisakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
];

/**
 * Converts a Gregorian date string ("YYYY-MM-DD" or ISO) to Nepali Date
 * e.g., "2026-10-15" -> { bsDate: "2083-06-29", formatted: "29 Ashwin 2083", year: 2083, month: 6, day: 29 }
 */
export function convertToNepaliDate(adDateString) {
  if (!adDateString) return { bsDate: "", formatted: "" };
  try {
    const parsed = new Date(adDateString);
    if (isNaN(parsed.getTime())) return { bsDate: "", formatted: "" };

    const nepaliDate = new NepaliDateClass(parsed);
    const year = nepaliDate.getYear();
    const month = nepaliDate.getMonth(); // 0-indexed
    const day = nepaliDate.getDate();

    const monthName = NEPALI_MONTHS[month] || `Month-${month + 1}`;
    const formatted = `${day} ${monthName} ${year}`;
    const bsDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    return {
      bsDate,
      formatted,
      year,
      month: month + 1,
      monthName,
      day,
    };
  } catch (err) {
    console.error("Nepali date conversion error:", err.message);
    return { bsDate: "", formatted: "" };
  }
}

/**
 * Builds canonical UTC Date objects for start and end times in Asia/Kathmandu (UTC+05:45)
 */
export function buildKathmanduDateTime(dateStr, timeStr) {
  // dateStr: "YYYY-MM-DD", timeStr: "HH:MM"
  if (!dateStr || !timeStr) return null;
  // Kathmandu is UTC+05:45
  const isoString = `${dateStr.trim()}T${timeStr.trim()}:00+05:45`;
  const d = new Date(isoString);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Validates start and end time and computes duration in hours and minutes
 */
export function calculateExamDuration(dateStr, startTime, endTime) {
  const startDateTime = buildKathmanduDateTime(dateStr, startTime);
  const endDateTime = buildKathmanduDateTime(dateStr, endTime);

  if (!startDateTime || !endDateTime) {
    throw new Error("Invalid exam date or time format. Expected YYYY-MM-DD and HH:MM.");
  }

  const diffMs = endDateTime.getTime() - startDateTime.getTime();
  if (diffMs <= 0) {
    throw new Error("Exam end time must be strictly after the start time.");
  }

  const durationMinutes = Math.round(diffMs / (60 * 1000));
  const durationHours = parseFloat((durationMinutes / 60).toFixed(2));

  if (durationMinutes < 15) {
    throw new Error("Exam duration must be at least 15 minutes.");
  }

  if (durationMinutes > 480) {
    throw new Error("Exam duration cannot exceed 8 hours.");
  }

  return {
    startDateTime,
    endDateTime,
    durationMinutes,
    durationHours,
    durationLabel:
      durationHours === 1
        ? "1 hour"
        : Number.isInteger(durationHours)
        ? `${durationHours} hours`
        : `${Math.floor(durationHours)}h ${durationMinutes % 60}m`,
  };
}

/**
 * Centralized Exam Countdown Engine
 * Calculates human-readable status and urgency badge based on institutional thresholds:
 * > 14 days: Upcoming
 * 14-8 days: Reminder
 * 7-3 days: Warning
 * 48-24 hours: Important
 * < 24 hours: Urgent ("STARTS IN 2 HOURS", "EXAM TODAY")
 * During exam: In Progress
 * After exam: Completed
 */
export function calculateExamCountdown(startDateTime, endDateTime, status = "PUBLISHED", now = new Date()) {
  if (status === "CANCELLED") {
    return {
      state: "CANCELLED",
      label: "CANCELLED",
      subLabel: "Examination has been officially cancelled",
      badgeClass: "danger",
      isPast: true,
      isInProgress: false,
    };
  }

  if (status === "DRAFT") {
    return {
      state: "DRAFT",
      label: "DRAFT",
      subLabel: "Not published to students",
      badgeClass: "neutral",
      isPast: false,
      isInProgress: false,
    };
  }

  const start = new Date(startDateTime).getTime();
  const end = new Date(endDateTime).getTime();
  const current = new Date(now).getTime();

  if (isNaN(start) || isNaN(end)) {
    return {
      state: "SCHEDULED",
      label: "SCHEDULED",
      subLabel: "Date pending",
      badgeClass: "neutral",
      isPast: false,
      isInProgress: false,
    };
  }

  if (current > end) {
    return {
      state: "COMPLETED",
      label: "COMPLETED",
      subLabel: "Examination concluded",
      badgeClass: "neutral",
      isPast: true,
      isInProgress: false,
    };
  }

  if (current >= start && current <= end) {
    return {
      state: "IN_PROGRESS",
      label: "IN PROGRESS",
      subLabel: "Examination currently ongoing",
      badgeClass: "urgent",
      isPast: false,
      isInProgress: true,
    };
  }

  const diffMs = start - current;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 24) {
    if (diffHours <= 2) {
      const mins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
      return {
        state: "URGENT",
        label: mins <= 60 ? `STARTS IN ${mins} MINS` : "STARTS IN 2 HOURS",
        subLabel: "Exam begins shortly today",
        badgeClass: "urgent",
        isPast: false,
        isInProgress: false,
      };
    }
    return {
      state: "URGENT",
      label: "EXAM TODAY",
      subLabel: `Starts in ${diffHours} hours`,
      badgeClass: "urgent",
      isPast: false,
      isInProgress: false,
    };
  }

  if (diffHours < 48) {
    return {
      state: "IMPORTANT",
      label: "EXAM TOMORROW",
      subLabel: `Scheduled for tomorrow at ${new Date(start).toLocaleTimeString("en-US", { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit" })}`,
      badgeClass: "important",
      isPast: false,
      isInProgress: false,
    };
  }

  if (diffDays <= 7) {
    return {
      state: "WARNING",
      label: `EXAM IN ${diffDays} DAYS`,
      subLabel: `Final preparations required (${diffDays} days remaining)`,
      badgeClass: "warning",
      isPast: false,
      isInProgress: false,
    };
  }

  if (diffDays <= 14) {
    return {
      state: "REMINDER",
      label: `EXAM IN ${diffDays} DAYS`,
      subLabel: `Upcoming examination in ${diffDays} days`,
      badgeClass: "reminder",
      isPast: false,
      isInProgress: false,
    };
  }

  return {
    state: "UPCOMING",
    label: `EXAM IN ${diffDays} DAYS`,
    subLabel: `Scheduled exam (${diffDays} days away)`,
    badgeClass: "upcoming",
    isPast: false,
    isInProgress: false,
  };
}
