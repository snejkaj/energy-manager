// Requirements: EMG-001, EMG-002, EMG-003, EMG-004, EMG-006, DB-014

import { describe, expect, it } from "vitest";

import {
  createEmergencyDecisionLogInput,
  EmergencyChargingService,
} from "../../src/charging/EmergencyChargingService.js";
import type { ChargingTarget, PriceInterval } from "../../src/charging/types.js";

const target: ChargingTarget = {
  departureTime: "2026-05-05T10:00:00.000Z",
  currentSocPercent: 50,
  minSocPercent: 70,
  maxSocPercent: 90,
  batteryCapacityKwh: 40,
  chargerPowerKw: 10,
  chargingEfficiency: 1,
};

describe("EmergencyChargingService", () => {
  it("calculates fastest safe plan to 100 percent and cost impact vs optimal plan", () => {
    // Requirements: EMG-001, EMG-002, EMG-003, EMG-004
    const service = new EmergencyChargingService();
    const plan = service.calculate({
      now: "2026-05-05T06:00:00.000Z",
      target,
      prices: prices([
        ["2026-05-05T06:00:00.000Z", 4],
        ["2026-05-05T07:00:00.000Z", 4],
        ["2026-05-05T08:00:00.000Z", 1],
        ["2026-05-05T09:00:00.000Z", 1],
      ]),
    });

    expect(plan.targetSocPercent).toBe(100);
    expect(plan.startTime).toBe("2026-05-05T06:00:00.000Z");
    expect(plan.estimatedCompletionTime).toBe("2026-05-05T08:00:00.000Z");
    expect(plan.approximateCompletion).toBe(true);
    expect(plan.estimatedCost).toBe(80);
    expect(plan.optimalEstimatedCost).toBe(20);
    expect(plan.costImpactVsOptimal).toBe(60);
    expect(plan.reason).toEqual(["user_requested_100_percent", "safety_override"]);
  });

  it("warns and suggests immediate start when time is insufficient", () => {
    // Requirements: EMG-004, EMG-006
    const service = new EmergencyChargingService();
    const plan = service.calculate({
      now: "2026-05-05T09:00:00.000Z",
      target,
      prices: prices([["2026-05-05T09:00:00.000Z", 1]]),
    });

    expect(plan.feasible).toBe(false);
    expect(plan.warning).toBe("Not enough time to reach 100% before departure.");
    expect(plan.suggestedAction).toBe("Start charging immediately.");
    expect(plan.estimatedCompletionTime).toBe("2026-05-05T11:00:00.000Z");
  });

  it("keeps emergency override explainable when price data is missing", () => {
    // Requirements: EMG-001, EMG-008, EMG-010, EMG-011, TEL-004
    const service = new EmergencyChargingService();
    const plan = service.calculate({
      now: "2026-05-05T09:00:00.000Z",
      target,
      prices: [],
    });

    expect(plan.feasible).toBe(false);
    expect(plan.slots).toEqual([]);
    expect(plan.currency).toBeNull();
    expect(plan.warning).toBe("Not enough time to reach 100% before departure.");
    expect(plan.suggestedAction).toBe("Start charging immediately.");
    expect(plan.reason).toEqual(["user_requested_100_percent", "safety_override"]);
  });

  it("starts from now when the current interval already began", () => {
    // Requirements: EMG-008, EMG-010
    const service = new EmergencyChargingService();
    const plan = service.calculate({
      now: "2026-05-05T09:15:00.000Z",
      target,
      prices: [
        {
          startsAt: "2026-05-05T09:00:00.000Z",
          endsAt: "2026-05-05T10:00:00.000Z",
          total: 1,
          currency: "SEK",
        },
      ],
    });

    expect(plan.startTime).toBe("2026-05-05T09:15:00.000Z");
    expect(plan.slots[0]?.startsAt).toBe("2026-05-05T09:15:00.000Z");
    expect(plan.feasible).toBe(false);
  });

  it("creates decision log input with required emergency reasons", () => {
    // Requirements: DB-014
    const service = new EmergencyChargingService();
    const plan = service.calculate({
      now: "2026-05-05T06:00:00.000Z",
      target,
      prices: prices([["2026-05-05T06:00:00.000Z", 1], ["2026-05-05T07:00:00.000Z", 1]]),
    });

    expect(createEmergencyDecisionLogInput(plan)).toMatchObject({
      decisionType: "emergency_charging",
      selectedAction: "Charge to 100%",
      reason: ["user_requested_100_percent", "safety_override"],
    });
  });
});

function prices(entries: Array<[startsAt: string, total: number]>): PriceInterval[] {
  return entries.map(([startsAt, total]) => ({
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
    total,
    currency: "SEK",
  }));
}
