// Requirements: TST-001, TST-002, TST-003, TST-004, TST-005, TST-006, TST-007, TST-008, TST-009, ARC-008

import { describe, expect, it } from "vitest";

import {
  calculateChargingPlan,
  ChargingTargetValidationError,
  validateChargingTarget,
} from "../../src/charging/ChargingOptimizer.js";
import type { ChargingTarget, PriceInterval } from "../../src/charging/types.js";

const baseTarget: ChargingTarget = {
  departureTime: "2026-05-05T08:00:00.000Z",
  currentSocPercent: 40,
  minSocPercent: 60,
  maxSocPercent: 80,
  batteryCapacityKwh: 50,
  chargerPowerKw: 10,
  chargingEfficiency: 1,
};

describe("calculateChargingPlan", () => {
  it("selects the cheapest intervals before departure", () => {
    // Requirements: OPT-003, OPT-004, OPT-006, OPT-007, OPT-011, TST-002
    const plan = calculateChargingPlan(
      prices([
        ["2026-05-05T05:00:00.000Z", 3],
        ["2026-05-05T06:00:00.000Z", 1],
        ["2026-05-05T07:00:00.000Z", 2],
      ]),
      baseTarget,
    );

    expect(plan.feasible).toBe(true);
    expect(plan.plannedEnergyKwh).toBe(10);
    expect(plan.estimatedCost).toBe(10);
    expect(plan.slots).toHaveLength(1);
    expect(plan.slots[0]?.startsAt).toBe("2026-05-05T06:00:00.000Z");
  });

  it("supports partial final interval use", () => {
    // Requirements: OPT-005, OPT-006, OPT-007, TST-003
    const plan = calculateChargingPlan(
      prices([
        ["2026-05-05T05:00:00.000Z", 1],
        ["2026-05-05T06:00:00.000Z", 2],
      ]),
      {
        ...baseTarget,
        currentSocPercent: 45,
        minSocPercent: 60,
      },
    );

    expect(plan.feasible).toBe(true);
    expect(plan.plannedEnergyKwh).toBe(7.5);
    expect(plan.estimatedCost).toBe(7.5);
    expect(plan.slots).toHaveLength(1);
    expect(plan.slots[0]?.durationHours).toBe(0.75);
    expect(plan.slots[0]?.endsAt).toBe("2026-05-05T05:45:00.000Z");
  });

  it("returns no charging when current state of charge already satisfies the target", () => {
    // Requirements: OPT-002, TST-004
    const plan = calculateChargingPlan(prices([["2026-05-05T05:00:00.000Z", 1]]), {
      ...baseTarget,
      currentSocPercent: 65,
    });

    expect(plan.feasible).toBe(true);
    expect(plan.slots).toHaveLength(0);
    expect(plan.plannedEnergyKwh).toBe(0);
    expect(plan.estimatedCost).toBe(0);
  });

  it("caps the planning target at maximum state of charge", () => {
    // Requirements: CHG-011, OPT-001, OPT-009, TST-005
    const plan = calculateChargingPlan(
      prices([
        ["2026-05-05T05:00:00.000Z", 1],
        ["2026-05-05T06:00:00.000Z", 1],
        ["2026-05-05T07:00:00.000Z", 1],
      ]),
      {
        ...baseTarget,
        currentSocPercent: 40,
        minSocPercent: 70,
        maxSocPercent: 70,
      },
    );

    expect(plan.feasible).toBe(true);
    expect(plan.plannedEnergyKwh).toBe(15);
    expect(plan.resultingSocPercent).toBe(70);
  });

  it("reports deficit when there is not enough time before departure", () => {
    // Requirements: OPT-010, OPT-011, TST-006
    const plan = calculateChargingPlan(prices([["2026-05-05T07:00:00.000Z", 1]]), {
      ...baseTarget,
      currentSocPercent: 20,
      minSocPercent: 60,
    });

    expect(plan.feasible).toBe(false);
    expect(plan.plannedEnergyKwh).toBe(10);
    expect(plan.deficitKwh).toBe(10);
    expect(plan.deficitSocPercent).toBe(20);
  });

  it("handles empty price input", () => {
    // Requirements: OPT-010, TST-007
    const plan = calculateChargingPlan([], baseTarget);

    expect(plan.feasible).toBe(false);
    expect(plan.slots).toHaveLength(0);
    expect(plan.deficitKwh).toBe(10);
    expect(plan.currency).toBeNull();
  });

  it("uses only the available part of a price interval when time is low", () => {
    // Requirements: OPT-003, OPT-005, OPT-010, TST-006
    const plan = calculateChargingPlan(
      [
        {
          startsAt: "2026-05-05T07:30:00.000Z",
          endsAt: "2026-05-05T08:30:00.000Z",
          total: 1,
          currency: "SEK",
        },
      ],
      {
        ...baseTarget,
        currentSocPercent: 20,
        minSocPercent: 60,
      },
    );

    expect(plan.feasible).toBe(false);
    expect(plan.slots).toHaveLength(1);
    expect(plan.slots[0]?.endsAt).toBe("2026-05-05T08:00:00.000Z");
    expect(plan.plannedEnergyKwh).toBe(5);
    expect(plan.deficitKwh).toBe(15);
  });

  it("ignores price intervals after departure", () => {
    // Requirements: OPT-003, TST-008
    const plan = calculateChargingPlan(
      prices([
        ["2026-05-05T07:00:00.000Z", 5],
        ["2026-05-05T08:00:00.000Z", 1],
      ]),
      baseTarget,
    );

    expect(plan.feasible).toBe(true);
    expect(plan.slots).toHaveLength(1);
    expect(plan.slots[0]?.startsAt).toBe("2026-05-05T07:00:00.000Z");
  });

  it("uses earlier start time as deterministic tie-breaker for equal prices", () => {
    // Requirements: OPT-012, OPT-013, TST-009
    const plan = calculateChargingPlan(
      prices([
        ["2026-05-05T07:00:00.000Z", 1],
        ["2026-05-05T06:00:00.000Z", 1],
      ]),
      baseTarget,
    );

    expect(plan.slots).toHaveLength(1);
    expect(plan.slots[0]?.startsAt).toBe("2026-05-05T06:00:00.000Z");
  });
});

describe("validateChargingTarget", () => {
  it("rejects invalid targets with a clear validation error", () => {
    // Requirements: CHG-012
    expect(() =>
      validateChargingTarget({
        ...baseTarget,
        minSocPercent: 90,
        maxSocPercent: 80,
      }),
    ).toThrow(ChargingTargetValidationError);
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
