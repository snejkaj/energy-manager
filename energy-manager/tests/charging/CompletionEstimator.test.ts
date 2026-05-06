// Requirements: CHG-013, CHG-014, CHG-015, CHG-016, CHG-017

import { describe, expect, it } from "vitest";

import { estimateCompletionTime } from "../../src/charging/CompletionEstimator.js";

describe("estimateCompletionTime", () => {
  it("estimates approximate completion time from remaining energy and effective power", () => {
    // Requirements: CHG-013, CHG-017
    const estimate = estimateCompletionTime({
      now: "2026-05-05T08:00:00.000Z",
      targetSocPercent: 80,
      currentSocPercent: 50,
      batteryCapacityKwh: 60,
      chargerPowerKw: 9,
    });

    expect(estimate.approximate).toBe(true);
    expect(estimate.remainingEnergyKwh).toBe(18);
    expect(estimate.effectivePowerKw).toBe(9);
    expect(estimate.estimatedCompletionTime).toBe("2026-05-05T10:00:00.000Z");
    expect(estimate.estimatedCompletionTimeMin).toBe("2026-05-05T09:42:00.000Z");
    expect(estimate.estimatedCompletionTimeMax).toBe("2026-05-05T10:18:00.000Z");
  });

  it("uses the lower of charger power and available power", () => {
    // Requirements: CHG-014
    const estimate = estimateCompletionTime({
      now: "2026-05-05T08:00:00.000Z",
      targetSocPercent: 80,
      currentSocPercent: 50,
      batteryCapacityKwh: 60,
      chargerPowerKw: 11,
      availablePowerKw: 6,
    });

    expect(estimate.effectivePowerKw).toBe(6);
    expect(estimate.estimatedCompletionTime).toBe("2026-05-05T11:00:00.000Z");
  });

  it("adjusts available power for home load and production", () => {
    // Requirements: CHG-015, CHG-016
    const estimate = estimateCompletionTime({
      now: "2026-05-05T08:00:00.000Z",
      targetSocPercent: 80,
      currentSocPercent: 50,
      batteryCapacityKwh: 60,
      chargerPowerKw: 11,
      availablePowerKw: 10,
      homeTelemetry: {
        consumptionKw: 4,
        productionKw: 1,
      },
    });

    expect(estimate.effectivePowerKw).toBe(7);
    expect(estimate.reason).toContain("home_load_adjustment_applied");
  });

  it("falls back to charger power when optional power and telemetry data is missing", () => {
    // Requirements: CHG-013, TEL-004, TEL-005
    const estimate = estimateCompletionTime({
      now: "2026-05-05T08:00:00.000Z",
      targetSocPercent: 80,
      currentSocPercent: 50,
      batteryCapacityKwh: 60,
      chargerPowerKw: 11,
      availablePowerKw: null,
      homeTelemetry: null,
    });

    expect(estimate.effectivePowerKw).toBe(11);
    expect(estimate.reason).not.toContain("home_load_adjustment_applied");
    expect(estimate.reason).not.toContain("available_power_limit_applied");
  });

  it("fails clearly when high home load leaves no effective charging power", () => {
    // Requirements: CHG-014, CHG-015, CHG-016
    expect(() =>
      estimateCompletionTime({
        now: "2026-05-05T08:00:00.000Z",
        targetSocPercent: 80,
        currentSocPercent: 50,
        batteryCapacityKwh: 60,
        chargerPowerKw: 11,
        availablePowerKw: 5,
        homeTelemetry: {
          consumptionKw: 8,
          productionKw: 0,
        },
      }),
    ).toThrow("Cannot estimate completion time when effective power is zero.");
  });
});
