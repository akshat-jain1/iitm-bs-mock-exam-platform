/**
 * Utility functions for Indian Standard Time (Asia/Kolkata / UTC+05:30)
 * conversion, parsing, validation, and localized academic display.
 */

export const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Validates and converts Indian local date (YYYY-MM-DD) and time (HH:mm)
 * into a standard ISO 8601 UTC timestamp string.
 *
 * Explicitly parses with the +05:30 Indian Standard Time offset so that
 * the resulting instant stored in PostgreSQL timestamptz is exact.
 */
export function istToIso(dateStr: string, timeStr: string): string {
  const trimmedDate = dateStr.trim();
  const trimmedTime = timeStr.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }

  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(trimmedTime)) {
    throw new Error("Invalid time format. Expected HH:mm.");
  }

  const normalizedTime = trimmedTime.length === 5 ? `${trimmedTime}:00` : trimmedTime;
  const isoWithIstOffset = `${trimmedDate}T${normalizedTime}+05:30`;
  const dateObj = new Date(isoWithIstOffset);

  if (isNaN(dateObj.getTime())) {
    throw new Error("Invalid calendar date or time.");
  }

  // Ensure calendar date did not roll over (e.g. Feb 31 -> Mar 3)
  const roundTripDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateObj);

  if (roundTripDate !== trimmedDate) {
    throw new Error("Invalid calendar date specified.");
  }

  return dateObj.toISOString();
}

/**
 * Extracts Indian local date (YYYY-MM-DD) and 24-hr time (HH:mm)
 * from a PostgreSQL timestamptz / ISO string.
 * Used for prepopulating admin form inputs (<input type="date">, <input type="time">).
 */
export function isoToISTDateAndTime(isoString: string): { date: string; time: string } {
  const dateObj = new Date(isoString);
  if (isNaN(dateObj.getTime())) {
    return { date: "", time: "" };
  }

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateObj);

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dateObj);

  return { date, time };
}

/**
 * Returns YYYY-MM-DD in Asia/Kolkata for grouping classes by local date.
 */
export function getISTDateKey(isoString: string): string {
  const dateObj = new Date(isoString);
  if (isNaN(dateObj.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateObj);
}

/**
 * Formats time in Indian local time, e.g. "9:00 AM" or "10:30 PM".
 */
export function formatISTTime(isoString: string): string {
  const dateObj = new Date(isoString);
  if (isNaN(dateObj.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(dateObj);
}

/**
 * Formats a start and end time range in Indian local time, e.g. "9:00 AM – 10:30 AM".
 */
export function formatISTTimeRange(startsAtIso: string, endsAtIso: string): string {
  const startTime = formatISTTime(startsAtIso);
  const endTime = formatISTTime(endsAtIso);
  if (startTime === "—" || endTime === "—") return "—";
  return `${startTime} – ${endTime}`;
}

/**
 * Formats date in Indian local time, e.g. "Monday, 12 October 2026".
 */
export function formatISTDate(isoString: string, options?: { includeYear?: boolean }): string {
  const dateObj = new Date(isoString);
  if (isNaN(dateObj.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: options?.includeYear ?? true ? "numeric" : undefined,
  }).format(dateObj);
}

/**
 * Formats date group headings for student classes page (e.g. "Today", "Tomorrow", or formatted date).
 */
export function formatISTGroupHeading(dateKey: string, sampleIsoString: string): {
  heading: string;
  subhead?: string;
  isToday: boolean;
} {
  const now = new Date();
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const tomorrowObj = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tomorrowObj);

  const formattedFullDate = formatISTDate(sampleIsoString);

  if (dateKey === todayKey) {
    return {
      heading: "Today",
      subhead: formattedFullDate,
      isToday: true,
    };
  }

  if (dateKey === tomorrowKey) {
    return {
      heading: "Tomorrow",
      subhead: formattedFullDate,
      isToday: false,
    };
  }

  return {
    heading: formattedFullDate,
    isToday: false,
  };
}
