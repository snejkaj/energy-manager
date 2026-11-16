// Requirements: CHG-001, CHG-012, SAF-001, ARC-001

import type { IsoDateTime } from "./types.js";

const CLOCK_TIME_PATTERN = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

export function isValidClockTime(value: string): boolean {
  return CLOCK_TIME_PATTERN.test(value);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the next occurrence of a local wall-clock time ("HH:MM") in the given
 * IANA time zone, strictly after `now`. Pure: depends only on its arguments.
 */
export function resolveNextDeparture(clockTime: string, now: IsoDateTime, timeZone: string): IsoDateTime {
  const match = CLOCK_TIME_PATTERN.exec(clockTime);
  if (match === null) {
    throw new Error(`Departure time must use HH:MM, got "${clockTime}".`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    throw new Error("now must be a valid ISO timestamp.");
  }

  const today = localDateParts(nowMs, timeZone);
  for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
    const candidateMs = zonedTimeToUtcMs(today.year, today.month, today.day + dayOffset, hours, minutes, timeZone);
    if (candidateMs > nowMs) {
      return new Date(candidateMs).toISOString();
    }
  }

  throw new Error("Could not resolve next departure time.");
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localDateParts(utcMs: number, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }

  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const local = localDateParts(utcMs, timeZone);
  const localAsUtcMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return localAsUtcMs - Math.floor(utcMs / 1000) * 1000;
}

function zonedTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string,
): number {
  const wallClockAsUtcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  // Two passes handle DST transitions: the offset at the guess may differ from the offset at the result.
  let utcMs = wallClockAsUtcMs - timeZoneOffsetMs(wallClockAsUtcMs, timeZone);
  utcMs = wallClockAsUtcMs - timeZoneOffsetMs(utcMs, timeZone);
  return utcMs;
}
