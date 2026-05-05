// Requirements: PRE-003, PRE-004, PRE-006, DB-010

import { describe, expect, it } from "vitest";

import { SolarPredictionService } from "../../src/prediction/SolarPredictionService.js";
import type { HomePowerReadingRecord } from "../../src/db/repositories/HomePowerReadingRepository.js";

describe("SolarPredictionService", () => {
  it("predicts hourly solar energy from weather and historical production", () => {
    // Requirements: PRE-003, DB-010
    const service = new SolarPredictionService();

    const predictions = service.predictHourly({
      predictedAt: "2026-05-05T08:00:00.000Z",
      weatherForecasts: [
        {
          startsAt: "2026-05-05T10:00:00.000Z",
          endsAt: "2026-05-05T11:00:00.000Z",
          cloudCoverPercent: 20,
          shortwaveRadiationWm2: 800,
        },
      ],
      historicalProduction: [
        reading("2026-05-04T10:00:00.000Z", 5),
        reading("2026-05-04T11:00:00.000Z", 4),
      ],
    });

    expect(predictions).toHaveLength(1);
    expect(predictions[0]?.predictedProductionKwh).toBe(3.6);
    expect(predictions[0]?.reason).toContain("Predicted from weather solar radiation");
  });

  it("returns no predictions when historical production is missing", () => {
    // Requirements: PRE-006
    const service = new SolarPredictionService();

    const predictions = service.predictHourly({
      predictedAt: "2026-05-05T08:00:00.000Z",
      weatherForecasts: [
        {
          startsAt: "2026-05-05T10:00:00.000Z",
          endsAt: "2026-05-05T11:00:00.000Z",
          shortwaveRadiationWm2: 800,
        },
      ],
      historicalProduction: [],
    });

    expect(predictions).toEqual([]);
  });
});

function reading(measuredAt: string, productionKw: number): HomePowerReadingRecord {
  return {
    id: measuredAt,
    providerId: "test",
    sourceHomeId: "home",
    measuredAt,
    consumptionKw: null,
    productionKw,
    rawPayload: {},
    sourceFetchedAt: measuredAt,
    createdAt: measuredAt,
  };
}
