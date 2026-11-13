// Requirements: CHG-001, CHG-012, SAF-001

import { describe, expect, it } from "vitest";

import { isValidClockTime, isValidTimeZone, resolveNextDeparture } from "../../src/charging/Departure.js";

describe("resolveNextDeparture", () => {
  it("interprets the clock time in local Swedish winter time (UTC+1)", () => {
    expect(resolveNextDeparture("08:00", "2026-11-12T03:00:00.000Z", "Europe/Stockholm")).toBe(
      "2026-11-12T07:00:00.000Z",
    );
  });

  it("interprets the clock time in local Swedish summer time (UTC+2)", () => {
    expect(resolveNextDeparture("08:00", "2026-06-10T03:00:00.000Z", "Europe/Stockholm")).toBe(
      "2026-06-10T06:00:00.000Z",
    );
  });

  it("rolls over to tomorrow once today's departure has passed", () => {
    expect(resolveNextDeparture("08:00", "2026-11-12T07:00:00.000Z", "Europe/Stockholm")).toBe(
      "2026-11-13T07:00:00.000Z",
    );
    expect(resolveNextDeparture("08:00", "2026-11-12T12:00:00.000Z", "Europe/Stockholm")).toBe(
      "2026-11-13T07:00:00.000Z",
    );
  });

  it("handles a departure on the day DST starts", () => {
    // 2026-03-29: clocks go from 02:00 to 03:00 in Stockholm.
    expect(resolveNextDeparture("08:00", "2026-03-28T20:00:00.000Z", "Europe/Stockholm")).toBe(
      "2026-03-29T06:00:00.000Z",
    );
  });

  it("handles a departure on the day DST ends", () => {
    // 2026-10-25: clocks go from 03:00 back to 02:00 in Stockholm.
    expect(resolveNextDeparture("08:00", "2026-10-24T20:00:00.000Z", "Europe/Stockholm")).toBe(
      "2026-10-25T07:00:00.000Z",
    );
  });

  it("works across the local midnight boundary", () => {
    // 23:30 UTC on Nov 11 is 00:30 local on Nov 12.
    expect(resolveNextDeparture("06:15", "2026-11-11T23:30:00.000Z", "Europe/Stockholm")).toBe(
      "2026-11-12T05:15:00.000Z",
    );
  });

  it("supports UTC", () => {
    expect(resolveNextDeparture("08:00", "2026-11-12T03:00:00.000Z", "UTC")).toBe("2026-11-12T08:00:00.000Z");
  });

  it("rejects invalid clock times", () => {
    expect(() => resolveNextDeparture("8:00", "2026-11-12T03:00:00.000Z", "UTC")).toThrow();
    expect(isValidClockTime("24:00")).toBe(false);
    expect(isValidClockTime("07:45")).toBe(true);
  });

  it("validates time zones", () => {
    expect(isValidTimeZone("Europe/Stockholm")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });
});
