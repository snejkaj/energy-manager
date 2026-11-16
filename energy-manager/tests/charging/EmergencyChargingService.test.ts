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
    expect(plan.slots).toHaveLength(1);
    expect(plan.slots[0]).toMatchObject({
      startsAt: "2026-05-05T09:00:00.000Z",
      endsAt: "2026-05-05T11:00:00.000Z",
      energyKwh: 20,
      priceKnown: false,
    });
    expect(plan.plannedEnergyKwh).toBe(20);
    expect(plan.resultingSocPercent).toBe(100);
    expect(plan.priceDataIncomplete).toBe(true);
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

  it("keeps charging past departure until 100 percent is reached", () => {
    // Requirements: EMG-001, EMG-004, EMG-006
    const service = new EmergencyChargingService();
    const plan = service.calculate({
      now: "2026-05-05T09:30:00.000Z",
      target,
      prices: prices([["2026-05-05T09:00:00.000Z", 2]]),
    });

    expect(plan.slots.map((slot) => [slot.startsAt, slot.endsAt, slot.priceKnown ?? true])).toEqual([
      ["2026-05-05T09:30:00.000Z", "2026-05-05T10:00:00.000Z", true],
      ["2026-05-05T10:00:00.000Z", "2026-05-05T11:30:00.000Z", false],
    ]);
    expect(plan.plannedEnergyKwh).toBe(20);
    expect(plan.resultingSocPercent).toBe(100);
    expect(plan.estimatedCost).toBe(10);
    expect(plan.deficitKwh).toBe(15);
    expect(plan.feasible).toBe(false);
    expect(plan.estimatedCompletionTime).toBe("2026-05-05T11:30:00.000Z");
  });

  it("charges through gaps in price data without waiting", () => {
    // Requirements: EMG-001, EMG-008
    const service = new EmergencyChargingService();
    const plan = service.calculate({
      now: "2026-05-05T06:00:00.000Z",
      target,
      prices: prices([["2026-05-05T07:00:00.000Z", 3]]),
    });

    expect(plan.slots.map((slot) => [slot.startsAt, slot.endsAt, slot.priceKnown ?? true])).toEqual([
      ["2026-05-05T06:00:00.000Z", "2026-05-05T07:00:00.000Z", false],
      ["2026-05-05T07:00:00.000Z", "2026-05-05T08:00:00.000Z", true],
    ]);
    expect(plan.feasible).toBe(true);
    expect(plan.priceDataIncomplete).toBe(true);
    expect(plan.estimatedCost).toBe(30);
  });

  it("uses charging efficiency for both plan and completion estimate", () => {
    // Requirements: EMG-004, CHG-013
    const service = new EmergencyChargingService();
    const plan = service.calculate({
      now: "2026-05-05T06:00:00.000Z",
      target: { ...target, chargingEfficiency: 0.5 },
      prices: [],
    });

    expect(plan.slots.at(-1)?.endsAt).toBe("2026-05-05T10:00:00.000Z");
    expect(plan.estimatedCompletionTime).toBe("2026-05-05T10:00:00.000Z");
  });

  it("returns an empty, feasible plan when the battery is already full", () => {
    // Requirements: EMG-001
    const service = new EmergencyChargingService();
    const plan = service.calculate({
      now: "2026-05-05T06:00:00.000Z",
      target: { ...target, currentSocPercent: 100 },
      prices: [],
    });

    expect(plan.slots).toEqual([]);
    expect(plan.feasible).toBe(true);
    expect(plan.priceDataIncomplete).toBe(false);
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
