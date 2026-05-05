// Requirements: PRE-018, PRE-019, PRE-020, PRE-021, PRE-022, PRE-023

import { describe, expect, it } from "vitest";

import { DeparturePredictionService } from "../../src/prediction/DeparturePredictionService.js";
import type { TravelEventRecord } from "../../src/db/types/persistenceTypes.js";

describe("DeparturePredictionService", () => {
  it("predicts likely departure time from recurring weekday times", () => {
    // Requirements: PRE-018, PRE-019
    const service = new DeparturePredictionService();

    const prediction = service.predict({
      now: "2026-05-05T06:00:00.000Z",
      batteryCapacityKwh: 75,
      historicalDriving: [
        event("2026-04-21T07:30:00.000Z", 40, 8),
        event("2026-04-28T07:35:00.000Z", 50, 10),
        event("2026-05-01T16:00:00.000Z", 10, 2),
      ],
      calendarEvents: [],
    });

    expect(prediction?.likelyDepartureTime).toBe("2026-05-05T07:30:00.000Z");
    expect(prediction?.predictedDistanceKm).toBe(33.333333);
    expect(prediction?.requiredSocPercent).toBe(23.888889);
    expect(prediction?.confidence).toBeGreaterThan(0.4);
  });

  it("uses explicit calendar travel before historical recurrence", () => {
    // Requirements: PRE-020
    const service = new DeparturePredictionService();

    const prediction = service.predict({
      now: "2026-05-05T06:00:00.000Z",
      batteryCapacityKwh: 75,
      historicalDriving: [
        event("2026-04-21T07:30:00.000Z", 40, 8),
        event("2026-04-28T07:30:00.000Z", 40, 8),
      ],
      calendarEvents: [
        {
          ...event("2026-05-05T09:00:00.000Z", 100, 20),
          title: "Drive to airport",
        },
      ],
    });

    expect(prediction?.likelyDepartureTime).toBe("2026-05-05T09:00:00.000Z");
  });

  it("adjusts required energy for cold and wet weather", () => {
    // Requirements: PRE-021, PRE-022
    const service = new DeparturePredictionService();

    const prediction = service.predict({
      now: "2026-05-05T06:00:00.000Z",
      batteryCapacityKwh: 75,
      historicalDriving: [
        event("2026-04-21T07:30:00.000Z", 40, 8),
        event("2026-04-28T07:30:00.000Z", 40, 8),
      ],
      calendarEvents: [],
      weatherForecasts: [
        {
          startsAt: "2026-05-05T07:00:00.000Z",
          endsAt: "2026-05-05T08:00:00.000Z",
          temperatureC: -3,
          precipitationMm: 2,
        },
      ],
    });

    expect(prediction?.predictedEnergyNeedKwh).toBe(9.408);
    expect(prediction?.requiredSocPercent).toBe(27.544);
    expect(prediction?.reason).toContain("Weather was used to adjust required charge");
  });
});

function event(startsAt: string, distanceKm: number, energyKwh: number): TravelEventRecord {
  return {
    id: startsAt,
    source: "calendar",
    externalId: null,
    title: "Drive",
    startsAt,
    endsAt: null,
    location: null,
    userTags: [],
    needsCar: true,
    tripSize: null,
    detectionSource: "keyword",
    explicitOverride: true,
    expectedDistanceKm: distanceKm,
    expectedEnergyNeedKwh: energyKwh,
    metadata: {},
    createdAt: startsAt,
    updatedAt: startsAt,
  };
}
