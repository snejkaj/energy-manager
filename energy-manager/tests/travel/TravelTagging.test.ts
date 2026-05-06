// Requirements: PRE-012, PRE-013, PRE-014, PRE-015

import { describe, expect, it } from "vitest";

import { detectExplicitTravelFromCalendar, detectExplicitTravelFromUserTag } from "../../src/travel/TravelTagging.js";

describe("TravelTagging", () => {
  it("detects car emoji in calendar events", () => {
    // Requirements: PRE-012
    expect(
      detectExplicitTravelFromCalendar({
        title: "Airport 🚗",
        startsAt: "2026-05-05T10:00:00.000Z",
      }),
    ).toMatchObject({
      needsCar: true,
      detectionSource: "emoji",
    });
  });

  it("detects car and drive keywords", () => {
    // Requirements: PRE-013
    expect(
      detectExplicitTravelFromCalendar({
        title: "Drive to customer",
        startsAt: "2026-05-05T10:00:00.000Z",
      }),
    ).toMatchObject({
      needsCar: true,
      detectionSource: "keyword",
      tags: ["drive"],
    });
  });

  it("keeps manual Needs car toggle explicit", () => {
    // Requirements: PRE-014
    expect(
      detectExplicitTravelFromUserTag({
        title: "Manual trip",
        startsAt: "2026-05-05T10:00:00.000Z",
        needsCar: true,
        tripSize: "long",
      }),
    ).toMatchObject({
      needsCar: true,
      detectionSource: "manual_toggle",
      tripSize: "long",
    });
  });
});
