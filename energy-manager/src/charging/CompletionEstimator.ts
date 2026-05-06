// Requirements: CHG-013, CHG-014, CHG-015, CHG-016, CHG-017, EMG-004, UX-101, ARC-001

import type { ChargingTarget, HomeTelemetry, IsoDateTime } from "./types.js";

export interface CompletionEstimateInput {
  now: IsoDateTime;
  targetSocPercent: number;
  currentSocPercent: number;
  batteryCapacityKwh: number;
  chargerPowerKw: number;
  availablePowerKw?: number | null;
  homeTelemetry?: HomeTelemetry | null;
  reservedHomeLoadKw?: number | null;
}

export interface CompletionEstimate {
  approximate: true;
  estimatedCompletionTime: IsoDateTime;
  estimatedCompletionTimeMin: IsoDateTime;
  estimatedCompletionTimeMax: IsoDateTime;
  remainingEnergyKwh: number;
  effectivePowerKw: number;
  timeNeededHours: number;
  reason: string[];
}

export function estimateCompletionTime(input: CompletionEstimateInput): CompletionEstimate {
  const remainingEnergyKwh = calculateRemainingEnergyKwh(
    input.targetSocPercent,
    input.currentSocPercent,
    input.batteryCapacityKwh,
  );
  const effectivePowerKw = calculateEffectivePowerKw(input);
  const timeNeededHours = effectivePowerKw <= 0 ? Number.POSITIVE_INFINITY : remainingEnergyKwh / effectivePowerKw;
  const completionTimeMs = Date.parse(input.now) + timeNeededHours * 3_600_000;
  const rangeMs = Math.max(15 * 60_000, timeNeededHours * 0.15 * 3_600_000);

  return {
    approximate: true,
    estimatedCompletionTime: toIso(completionTimeMs),
    estimatedCompletionTimeMin: toIso(completionTimeMs - rangeMs),
    estimatedCompletionTimeMax: toIso(completionTimeMs + rangeMs),
    remainingEnergyKwh: round(remainingEnergyKwh),
    effectivePowerKw: round(effectivePowerKw),
    timeNeededHours: round(timeNeededHours),
    reason: buildReasons(input, effectivePowerKw),
  };
}

export function estimateCompletionForTarget(
  now: IsoDateTime,
  target: ChargingTarget,
  availablePowerKw?: number | null,
  homeTelemetry?: HomeTelemetry | null,
): CompletionEstimate {
  return estimateCompletionTime({
    now,
    targetSocPercent: target.minSocPercent,
    currentSocPercent: target.currentSocPercent,
    batteryCapacityKwh: target.batteryCapacityKwh,
    chargerPowerKw: target.chargerPowerKw,
    availablePowerKw,
    homeTelemetry,
  });
}

function calculateRemainingEnergyKwh(
  targetSocPercent: number,
  currentSocPercent: number,
  batteryCapacityKwh: number,
): number {
  return Math.max(0, ((targetSocPercent - currentSocPercent) / 100) * batteryCapacityKwh);
}

function calculateEffectivePowerKw(input: CompletionEstimateInput): number {
  const loadAdjustedAvailablePower = input.availablePowerKw === null || input.availablePowerKw === undefined
    ? input.chargerPowerKw
    : Math.max(0, input.availablePowerKw - (input.reservedHomeLoadKw ?? 0));
  const productionOffsetKw = input.homeTelemetry?.productionKw ?? 0;
  const consumptionLoadKw = input.homeTelemetry?.consumptionKw ?? 0;
  const homeLoadAdjustmentKw = Math.max(0, consumptionLoadKw - productionOffsetKw);
  const availableAfterHomeLoad = input.availablePowerKw === null || input.availablePowerKw === undefined
    ? input.chargerPowerKw
    : Math.max(0, loadAdjustedAvailablePower - homeLoadAdjustmentKw);

  return Math.min(input.chargerPowerKw, availableAfterHomeLoad);
}

function buildReasons(input: CompletionEstimateInput, effectivePowerKw: number): string[] {
  const reasons = ["approximate_completion_estimate"];
  reasons.push("remaining_energy_based_on_target_soc");
  if (input.availablePowerKw !== undefined && input.availablePowerKw !== null) {
    reasons.push("available_power_limit_applied");
  }
  if (input.homeTelemetry !== undefined && input.homeTelemetry !== null) {
    reasons.push("home_load_adjustment_applied");
  }
  if (effectivePowerKw < input.chargerPowerKw) {
    reasons.push("effective_power_below_charger_power");
  }
  return reasons;
}

function toIso(valueMs: number): IsoDateTime {
  if (!Number.isFinite(valueMs)) {
    throw new Error("Cannot estimate completion time when effective power is zero.");
  }

  return new Date(valueMs).toISOString();
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
