import NepaliDateModule from "nepali-date-converter";
import { BSADDate, CalendarType, Language } from "../types";

const NepaliDateClass =
  (
    NepaliDateModule as unknown as {
      default?: typeof NepaliDateModule;
    }
  ).default || NepaliDateModule;
const NEPAL_TIME_ZONE = "Asia/Kathmandu";

export function getNepaliDateFromAD(adDateString: string): string {
  if (!adDateString) return "";
  try {
    const d = new Date(adDateString);
    if (isNaN(d.getTime())) return "";
    const nepali = new NepaliDateClass(d);
    const day = nepali.getDate();
    const month = nepali.getMonth();
    const year = nepali.getYear();
    const monthName = NEPALI_MONTHS_EN[month] || `Month-${month + 1}`;
    return `${day} ${monthName} ${year}`;
  } catch {
    return "";
  }
}

export const NEPALI_MONTHS_NE = [
  "बैशाख",
  "जेठ",
  "असार",
  "साउन",
  "भदौ",
  "असोज",
  "कात्तिक",
  "मंसीर",
  "पुष",
  "माघ",
  "फागुन",
  "चैत",
];

export const NEPALI_MONTHS_EN = [
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

export const NEPALI_DAYS_NE = [
  "आइतबार",
  "सोमबार",
  "मंगलबार",
  "बुधबार",
  "बिहीबार",
  "शुक्रबार",
  "शनिबार",
];

export const NEPALI_DAYS_EN = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const NEPALI_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];

export function toNepaliDigits(input: string | number): string {
  const str = input.toString();
  return str.replace(/[0-9]/g, (digit) => NEPALI_DIGITS[parseInt(digit, 10)]);
}

// Format currency in NPR South Asian format (e.g., रू १,२३,४५६ or NPR 1,23,456)
export function formatNPR(amount: number, lang: Language = "en"): string {
  const absAmount = Math.abs(amount);
  const parts = absAmount.toFixed(2).split(".");
  let integerPart = parts[0];
  const decimalPart = parts[1];

  // South Asian grouping: rightmost 3, then groups of 2
  if (integerPart.length > 3) {
    const lastThree = integerPart.substring(integerPart.length - 3);
    const rest = integerPart.substring(0, integerPart.length - 3);
    const groupedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    integerPart = groupedRest + "," + lastThree;
  }

  const formattedNumber = `${integerPart}.${decimalPart}`;
  const sign = amount < 0 ? "-" : "";

  if (lang === "ne") {
    return `${sign}रू ${toNepaliDigits(formattedNumber)}`;
  }
  return `${sign}NPR ${formattedNumber}`;
}

// Convert numbers to Nepali words for receipts (e.g., 50000 -> "पचास हजार रुपैयाँ मात्र")
export function numberToNepaliWords(num: number): string {
  if (num === 0) return "शून्य रुपैयाँ मात्र";

  const ones = [
    "",
    "एक",
    "दुई",
    "तीन",
    "चार",
    "पाँच",
    "छ",
    "सात",
    "आठ",
    "नौ",
    "दश",
    "एघार",
    "बाह्र",
    "तेह्र",
    "चौध",
    "पन्ध्र",
    "सोह्र",
    "सत्र",
    "अठार",
    "उन्नाइस",
    "बीस",
    "एक्काइस",
    "बाइस",
    "तेईस",
    "चौबीस",
    "पच्चीस",
    "छब्बीस",
    "सत्ताइस",
    "अठ्ठाइस",
    "उनन्तिस",
    "तीस",
    "एकत्तिस",
    "बत्तिस",
    "तेत्तिस",
    "चौँतिस",
    "पैँतिस",
    "छत्तीस",
    "सैँतिस",
    "अठतीस",
    "उनन्चालीस",
    "चालीस",
    "एकचालीस",
    "बयालीस",
    "त्रियालीस",
    "चवालीस",
    "पैँतालीस",
    "छयालीस",
    "सत्तालीस",
    "अठचालीस",
    "उनन्चास",
    "पचास",
    "एकाउन्न",
    "बाउन्न",
    "त्रिपन्न",
    "चउन्न",
    "पचपन्न",
    "छपन्न",
    "सन्ताउन्न",
    "अन्ठाउन्न",
    "उनन्साठ्ठी",
    "साठी",
    "एकसट्ठी",
    "बासट्ठी",
    "त्रिसट्ठी",
    "चौंसट्ठी",
    "पैंसट्ठी",
    "छयसट्ठी",
    "सतसट्ठी",
    "अठसट्ठी",
    "उनन्सत्तरी",
    "सत्तरी",
    "एकहत्तर",
    "बहत्तर",
    "त्रिहत्तर",
    "चौहत्तर",
    "पचहत्तर",
    "छयहत्तर",
    "सतहत्तर",
    "अठहत्तर",
    "उनासी",
    "असी",
    "एकासी",
    "बयासी",
    "त्रियासी",
    "चौरासी",
    "पचासी",
    "छयासी",
    "सतासी",
    "अठासी",
    "उनान्नब्बे",
    "नब्बे",
    "एकान्नब्बे",
    "बयानब्बे",
    "त्रियान्नब्बे",
    "चौरान्नब्बे",
    "पन्चान्नब्बे",
    "छयान्नब्बे",
    "सन्तान्नब्बे",
    "अन्ठान्नब्बे",
    "उनान्सय",
  ];

  let n = Math.floor(num);
  let words = "";

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = Math.floor(n / 100);
  const remaining = n % 100;

  if (crore > 0) {
    words += (ones[crore] || crore) + " करोड ";
  }
  if (lakh > 0) {
    words += (ones[lakh] || lakh) + " लाख ";
  }
  if (thousand > 0) {
    words += (ones[thousand] || thousand) + " हजार ";
  }
  if (hundred > 0) {
    words += (ones[hundred] || hundred) + " सय ";
  }
  if (remaining > 0) {
    words += (ones[remaining] || remaining) + " ";
  }

  return words.trim() + " रुपैयाँ मात्र";
}

// Convert BS string "2081-02-15" to readable format based on language
export function formatBSDate(bsString: string, lang: Language = "en"): string {
  if (!bsString) return "";
  const parts = bsString.split("-");
  if (parts.length !== 3) return bsString;

  const year = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIdx) ||
    monthIdx < 0 ||
    monthIdx > 11 ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 32
  ) {
    return bsString;
  }

  const nepaliDate = new NepaliDateClass(year, monthIdx, day);
  return lang === "ne"
    ? nepaliDate.format("YYYY MMMM DD", "np")
    : `${nepaliDate.format("DD MMMM YYYY", "en")} BS`;
}

export function getNepalDateTime(date = new Date()) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NEPAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const getPart = (type: string) =>
    Number(dateParts.find((part) => part.type === type)?.value);
  const localDate = new Date(
    getPart("year"),
    getPart("month") - 1,
    getPart("day"),
    12,
  );
  const bsDate = NepaliDateClass.fromAD(localDate);
  const adFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: NEPAL_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: NEPAL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const time = timeFormatter.format(date);

  return {
    ad: adFormatter.format(date),
    bs: bsDate.format("YYYY MMMM DD", "np"),
    iso: date.toISOString(),
    time,
    timeNe: toNepaliDigits(time),
  };
}

export function formatDateForCalendar(
  date: BSADDate,
  calendarType: CalendarType,
  lang: Language = "en",
): string {
  if (calendarType === "BS") return formatBSDate(date.bs, "ne");
  return new Intl.DateTimeFormat(lang === "ne" ? "ne-NP" : "en-US", {
    timeZone: NEPAL_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date.ad));
}

export function formatTimestampForCalendar(
  value: string | Date,
  calendarType: CalendarType,
  lang: Language = "en",
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (calendarType === "AD") {
    return new Intl.DateTimeFormat(lang === "ne" ? "ne-NP" : "en-US", {
      timeZone: NEPAL_TIME_ZONE,
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  }

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NEPAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const getPart = (type: string) =>
    Number(dateParts.find((part) => part.type === type)?.value);
  const localDate = new Date(
    getPart("year"),
    getPart("month") - 1,
    getPart("day"),
    12,
  );
  return NepaliDateClass.fromAD(localDate).format("YYYY MMMM DD", "np");
}

export function formatDateTimeForCalendar(
  value: string | Date,
  calendarType: CalendarType,
  lang: Language = "en",
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dateLabel = formatTimestampForCalendar(date, calendarType, lang);
  const timeLabel = new Intl.DateTimeFormat(
    calendarType === "BS" ? "ne-NP-u-nu-deva" : "en-GB",
    {
      timeZone: NEPAL_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    },
  ).format(date);
  return `${dateLabel} ${timeLabel}`;
}

// Dual calendar display component helper
export function formatDualDate(
  date: BSADDate,
  lang: Language = "en",
  primary: "BS" | "AD" = "BS",
): string {
  const bsFormatted = formatBSDate(date.bs, lang);
  const adDate = new Date(date.ad);
  const adFormatted = adDate.toLocaleDateString(
    lang === "ne" ? "ne-NP" : "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: NEPAL_TIME_ZONE,
    },
  );

  if (primary === "BS") {
    return `${bsFormatted} (${adFormatted} AD)`;
  }
  return `${adFormatted} (${bsFormatted})`;
}

// Major Nepal Public & Academic Holidays
export interface NepalHoliday {
  name: string;
  nameNe: string;
  dateBS: string;
  type: "national" | "festival" | "academic_break";
  days: number;
}

export const NEPAL_HOLIDAYS_2081: NepalHoliday[] = [
  {
    name: "Nepali New Year (Baisakh 1)",
    nameNe: "नयाँ वर्ष (बैशाख १)",
    dateBS: "2081-01-01",
    type: "national",
    days: 1,
  },
  {
    name: "Buddha Jayanti",
    nameNe: "बुद्ध जयन्ती / उभौली पर्व",
    dateBS: "2081-02-10",
    type: "national",
    days: 1,
  },
  {
    name: "Constitution Day",
    nameNe: "संविधान दिवस",
    dateBS: "2081-06-03",
    type: "national",
    days: 1,
  },
  {
    name: "Dashain Festival Vacation",
    nameNe: "बडा दशैं बिदा",
    dateBS: "2081-06-24",
    type: "festival",
    days: 10,
  },
  {
    name: "Tihar & Chhath Holidays",
    nameNe: "तिहार तथा छठ बिदा",
    dateBS: "2081-07-15",
    type: "festival",
    days: 6,
  },
  {
    name: "Prithvi Jayanti / National Unity Day",
    nameNe: "पृथ्वी जयन्ती",
    dateBS: "2081-09-27",
    type: "national",
    days: 1,
  },
  {
    name: "Martyrs Day",
    nameNe: "शहीद दिवस",
    dateBS: "2081-10-16",
    type: "national",
    days: 1,
  },
  {
    name: "Maha Shivaratri",
    nameNe: "महाशिवरात्रि",
    dateBS: "2081-11-14",
    type: "festival",
    days: 1,
  },
  {
    name: "Fagu Purnima (Holi)",
    nameNe: "फागु पूर्णिमा (होली)",
    dateBS: "2081-11-29",
    type: "festival",
    days: 1,
  },
  {
    name: "Semester End Break",
    nameNe: "सेमेस्टर अन्त्य बिदा",
    dateBS: "2081-12-15",
    type: "academic_break",
    days: 7,
  },
];
