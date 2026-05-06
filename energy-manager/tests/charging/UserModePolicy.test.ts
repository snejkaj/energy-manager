// Requirements: SAF-001, SAF-002, MOD-001, MOD-002

import { describe, expect, it } from "vitest";

import { applyUserModePolicy, getUserModePolicy } from "../../src/charging/UserModePolicy.js";
import type { ChargingTarget } from "../../src/charging/types.js";

const target: ChargingTarget = {
  departureTime: "2026-05-05T08:00:00.000Z",
  currentSocPercent: 30,
  minSocPercent: 60,
  maxSocPercent: 90,
  batteryCapacityKwh: 75,
  chargerPowerKw: 11,
  chargingEfficiency: 0.9,
};

describe("UserModePolicy", () => {
  it("uses SAFE as readiness-first mode with large buffer and early deadline", () => {
    // Requirements: SAF-001, SAF-002
    const result = applyUserModePolicy({
      target,
      mode: "safe",
      predictedRequiredSocPercent: 65,
    });

    expect(result.target.minSocPercent).toBe(80);
    expect(result.target.departureTime).toBe("2026-05-05T06:30:00.000Z");
    expect(result.policy.allowUnderchargeRisk).toBe(false);
  });

  it("uses BALANCED with smaller safety buffer and moderate early deadline", () => {
    // Requirements: MOD-001
    const result = applyUserModePolicy({
      target,
      mode: "balanced",
      predictedRequiredSocPercent: 65,
    });

    expect(result.target.minSocPercent).toBe(72);
    expect(result.target.departureTime).toBe("2026-05-05T07:30:00.000Z");
    expect(result.policy.allowUnderchargeRisk).toBe(false);
  });

  it("uses SAVINGS with no added buffer and allows undercharge risk", () => {
    // Requirements: MOD-001, MOD-002
    const result = applyUserModePolicy({
      target,
      mode: "savings",
      predictedRequiredSocPercent: 65,
    });

    expect(result.target.minSocPercent).toBe(60);
    expect(result.target.departureTime).toBe("2026-05-05T08:00:00.000Z");
    expect(result.policy.allowUnderchargeRisk).toBe(true);
  });

  it("falls back to configured minimum SOC when prediction data is missing", () => {
    // Requirements: PRE-006, MOD-005, SAF-001
    const result = applyUserModePolicy({
      target,
      mode: "safe",
      predictedRequiredSocPercent: null,
    });

    expect(result.target.minSocPercent).toBe(75);
    expect(result.reason).toContain("safe mode applied");
  });

  it("does not secretly raise target SOC in savings mode from prediction data", () => {
    // Requirements: PRE-002, MOD-008
    const result = applyUserModePolicy({
      target,
      mode: "savings",
      predictedRequiredSocPercent: 85,
    });

    expect(result.target.minSocPercent).toBe(60);
    expect(result.policy.allowUnderchargeRisk).toBe(true);
  });

  it("caps mode-adjusted SOC at maximum SOC", () => {
    // Requirements: CHG-004, SAF-001
    const result = applyUserModePolicy({
      target,
      mode: "safe",
      predictedRequiredSocPercent: 85,
    });

    expect(result.target.minSocPercent).toBe(90);
  });

  it("exposes default policies for all modes", () => {
    // Requirements: MOD-001
    expect(getUserModePolicy("safe").socBufferPercent).toBeGreaterThan(getUserModePolicy("balanced").socBufferPercent);
    expect(getUserModePolicy("balanced").socBufferPercent).toBeGreaterThan(getUserModePolicy("savings").socBufferPercent);
  });
});
