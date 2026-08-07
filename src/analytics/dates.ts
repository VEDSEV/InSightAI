import { createAnalyticsError } from "./errors.ts";
import type {
  AnalyticsResult,
  ComparisonDefinition,
  ComparisonPeriodResolution,
  DateInterval,
  IsoDate,
} from "./types.ts";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

type DateParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || year < 1 || year > 9_999) {
    throw new RangeError("Year must be an integer from 1 through 9999.");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Month must be an integer from 1 through 12.");
  }

  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function readDateParts(value: string): DateParts | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) {
    return null;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

function formatDateParts(parts: DateParts): IsoDate {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}` as IsoDate;
}

function requireDateParts(value: IsoDate): DateParts {
  const parts = readDateParts(value);
  if (!parts) {
    throw new RangeError(`Invalid ISO civil date: ${value}`);
  }
  return parts;
}

function utcTimestamp(value: IsoDate): number {
  const parts = requireDateParts(value);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  return date.getTime();
}

function isoDateFromTimestamp(timestamp: number): IsoDate {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Date calculation is outside the supported range.");
  }
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9_999) {
    throw new RangeError("Date calculation is outside the supported civil-date range.");
  }
  return formatDateParts({
    year,
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function isIsoDate(value: string): value is IsoDate {
  return readDateParts(value) !== null;
}

export function isoDate(value: string): IsoDate {
  if (!isIsoDate(value)) {
    throw new RangeError(`${value} is not a valid YYYY-MM-DD civil date.`);
  }
  return value;
}

export function parseIsoDate(input: string, field = "date"): AnalyticsResult<IsoDate> {
  if (!isIsoDate(input)) {
    return {
      status: "error",
      errors: [
        createAnalyticsError({
          code: "invalid_date",
          stage: "row_validation",
          message: `${field} must be a valid YYYY-MM-DD civil date.`,
          field,
          value: input,
        }),
      ],
    };
  }
  return { status: "ok", value: input, warnings: [] };
}

export function compareIsoDates(left: IsoDate, right: IsoDate): -1 | 0 | 1 {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function addDays(value: IsoDate, amount: number): IsoDate {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError("Day offset must be a safe integer.");
  }
  return isoDateFromTimestamp(utcTimestamp(value) + amount * MILLISECONDS_PER_DAY);
}

export function daysBetween(start: IsoDate, end: IsoDate): number {
  return (utcTimestamp(end) - utcTimestamp(start)) / MILLISECONDS_PER_DAY;
}

export function inclusiveDayCount(interval: DateInterval): number {
  const difference = daysBetween(interval.start, interval.end);
  if (difference < 0) {
    throw new RangeError("Date interval start must not be after its end.");
  }
  return difference + 1;
}

export function createDateInterval(start: string, end: string): AnalyticsResult<DateInterval> {
  const parsedStart = parseIsoDate(start, "start");
  const parsedEnd = parseIsoDate(end, "end");
  const errors = [
    ...(parsedStart.status === "error" ? parsedStart.errors : []),
    ...(parsedEnd.status === "error" ? parsedEnd.errors : []),
  ];
  if (errors.length > 0) {
    return { status: "error", errors };
  }

  if (parsedStart.status !== "ok" || parsedEnd.status !== "ok") {
    throw new Error("Unreachable date parsing state.");
  }
  if (compareIsoDates(parsedStart.value, parsedEnd.value) > 0) {
    return {
      status: "error",
      errors: [
        createAnalyticsError({
          code: "invalid_date_range",
          stage: "filtering",
          message: "Date interval start must not be after its end.",
          field: "period",
          value: `${start}/${end}`,
        }),
      ],
    };
  }

  return {
    status: "ok",
    value: Object.freeze({ start: parsedStart.value, end: parsedEnd.value, boundary: "inclusive" }),
    warnings: [],
  };
}

export function dateInterval(start: IsoDate, end: IsoDate): DateInterval {
  if (compareIsoDates(start, end) > 0) {
    throw new RangeError("Date interval start must not be after its end.");
  }
  return Object.freeze({ start, end, boundary: "inclusive" });
}

export function intervalContains(outer: DateInterval, inner: DateInterval): boolean {
  return outer.start <= inner.start && outer.end >= inner.end;
}

export function dateIsWithin(value: IsoDate, interval: DateInterval): boolean {
  return value >= interval.start && value <= interval.end;
}

export function startOfMonth(value: IsoDate): IsoDate {
  const parts = requireDateParts(value);
  return formatDateParts({ ...parts, day: 1 });
}

export function endOfMonth(value: IsoDate): IsoDate {
  const parts = requireDateParts(value);
  return formatDateParts({ ...parts, day: daysInMonth(parts.year, parts.month) });
}

export function shiftMonthsClamped(value: IsoDate, amount: number): IsoDate {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError("Month offset must be a safe integer.");
  }
  const parts = requireDateParts(value);
  const zeroBased = parts.year * 12 + (parts.month - 1) + amount;
  const year = Math.floor(zeroBased / 12);
  const month = (((zeroBased % 12) + 12) % 12) + 1;
  if (year < 1 || year > 9_999) {
    throw new RangeError("Month shift is outside the supported date range.");
  }
  return formatDateParts({
    year,
    month,
    day: Math.min(parts.day, daysInMonth(year, month)),
  });
}

export function shiftYearsClamped(value: IsoDate, amount: number): IsoDate {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError("Year offset must be a safe integer.");
  }
  const parts = requireDateParts(value);
  const year = parts.year + amount;
  if (year < 1 || year > 9_999) {
    throw new RangeError("Year shift is outside the supported date range.");
  }
  return formatDateParts({
    year,
    month: parts.month,
    day: Math.min(parts.day, daysInMonth(year, parts.month)),
  });
}

export function quarterNumber(value: IsoDate): 1 | 2 | 3 | 4 {
  const month = requireDateParts(value).month;
  return (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
}

export function startOfQuarter(value: IsoDate): IsoDate {
  const parts = requireDateParts(value);
  const month = (quarterNumber(value) - 1) * 3 + 1;
  return formatDateParts({ year: parts.year, month, day: 1 });
}

export function endOfQuarter(value: IsoDate): IsoDate {
  return endOfMonth(shiftMonthsClamped(startOfQuarter(value), 2));
}

export function startOfIsoWeek(value: IsoDate): IsoDate {
  const day = new Date(utcTimestamp(value)).getUTCDay();
  const offsetFromMonday = (day + 6) % 7;
  return addDays(value, -offsetFromMonday);
}

export function endOfIsoWeek(value: IsoDate): IsoDate {
  return addDays(startOfIsoWeek(value), 6);
}

export function enumerateDates(interval: DateInterval): readonly IsoDate[] {
  const dates: IsoDate[] = [];
  const count = inclusiveDayCount(interval);
  for (let index = 0; index < count; index += 1) {
    dates.push(addDays(interval.start, index));
  }
  return Object.freeze(dates);
}

function isCompleteCalendarMonth(interval: DateInterval): boolean {
  return (
    interval.start === startOfMonth(interval.start) && interval.end === endOfMonth(interval.start)
  );
}

function isCompleteCalendarQuarter(interval: DateInterval): boolean {
  return (
    interval.start === startOfQuarter(interval.start) &&
    interval.end === endOfQuarter(interval.start)
  );
}

function invalidComparison(
  currentPeriod: DateInterval,
  definition: ComparisonDefinition,
  message: string,
): ComparisonPeriodResolution {
  return Object.freeze({
    status: "non_computable",
    definition,
    currentPeriod,
    reason: "invalid_filter",
    message,
  });
}

export function resolveComparisonPeriod(
  currentPeriod: DateInterval,
  definition: ComparisonDefinition,
): ComparisonPeriodResolution {
  if (compareIsoDates(currentPeriod.start, currentPeriod.end) > 0) {
    return invalidComparison(currentPeriod, definition, "Current period start is after its end.");
  }

  let comparisonPeriod: DateInterval;
  switch (definition.kind) {
    case "previous_equal_length": {
      const dayCount = inclusiveDayCount(currentPeriod);
      comparisonPeriod = dateInterval(
        addDays(currentPeriod.start, -dayCount),
        addDays(currentPeriod.start, -1),
      );
      break;
    }
    case "previous_calendar_month": {
      if (!isCompleteCalendarMonth(currentPeriod)) {
        return invalidComparison(
          currentPeriod,
          definition,
          "Previous-calendar-month comparison requires one complete aligned current month.",
        );
      }
      const previousMonth = shiftMonthsClamped(currentPeriod.start, -1);
      comparisonPeriod = dateInterval(startOfMonth(previousMonth), endOfMonth(previousMonth));
      break;
    }
    case "previous_calendar_quarter": {
      if (!isCompleteCalendarQuarter(currentPeriod)) {
        return invalidComparison(
          currentPeriod,
          definition,
          "Previous-calendar-quarter comparison requires one complete aligned current quarter.",
        );
      }
      const previousQuarter = shiftMonthsClamped(currentPeriod.start, -3);
      comparisonPeriod = dateInterval(
        startOfQuarter(previousQuarter),
        endOfQuarter(previousQuarter),
      );
      break;
    }
    case "previous_year":
      comparisonPeriod = dateInterval(
        shiftYearsClamped(currentPeriod.start, -1),
        shiftYearsClamped(currentPeriod.end, -1),
      );
      break;
  }

  return Object.freeze({
    status: "ok",
    definition,
    currentPeriod,
    comparisonPeriod,
  });
}
