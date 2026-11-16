// Requirements: EMG-001, EMG-002, EMG-003, EMG-004, EMG-006, EMG-007, EMG-008, EMG-009, EMG-010, EMG-011, UX-101, UX-102, DB-014, ARC-001

import { calculateChargingPlan, validateChargingTarget } from "./ChargingOptimizer.js";
import { estimateCompletionForTarget } from "./CompletionEstimator.js";
import type { ChargingPlan, ChargingSlot, ChargingTarget, PriceInterval } from "./types.js";

const EMERGENCY_REASONS = ["user_requested_100_percent", "safety_override"] as const;

export interface EmergencyChargingInput {
  now: string;
  prices: PriceInterval[];
  target: ChargingTarget;
}

export interface EmergencyChargingPlan {
  action: "Charge to 100%";
  targetSocPercent: 100;
  startTime: string;
  estimatedCompletionTime: string;
  estimatedCompletionTimeMin: string;
  estimatedCompletionTimeMax: string;
  approximateCompletion: true;
  feasible: boolean;
  warning: string | null;
  suggestedAction: string | null;
  slots: ChargingSlot[];
  plannedEnergyKwh: number;
  estimatedCost: number;
  optimalEstimatedCost: number;
  costImpactVsOptimal: number;
  resultingSocPercent: number;
  deficitKwh: number;
  deficitSocPercent: number;
  currency: string | null;
  /** True when some charging time has no price data; estimatedCost then excludes that time. */
  priceDataIncomplete: boolean;
  reason: Array<(typeof EMERGENCY_REASONS)[number]>;
}

export class EmergencyChargingService {
  calculate(input: EmergencyChargingInput): EmergencyChargingPlan {
    validateChargingTarget(input.target);

    const emergencyTarget = createEmergencyTarget(input.target);
    const fastestPlan = calculateFastestPlan(input.now, input.prices, emergencyTarget);
    const optimalPlan = calculateChargingPlan(input.prices, emergencyTarget);
    // Use effective power (incl. efficiency) so the estimate matches the plan's slots.
    const completionEstimate = estimateCompletionForTarget(input.now, {
      ...emergencyTarget,
      chargerPowerKw: emergencyTarget.chargerPowerKw * emergencyTarget.chargingEfficiency,
    });
    const startTime = input.now;
    const priceDataIncomplete = fastestPlan.slots.some((slot) => slot.priceKnown === false);
    const warning = fastestPlan.feasible
      ? null
      : "Not enough time to reach 100% before departure.";

    return {
      action: "Charge to 100%",
      targetSocPercent: 100,
      startTime,
      estimatedCompletionTime: completionEstimate.estimatedCompletionTime,
      estimatedCompletionTimeMin: completionEstimate.estimatedCompletionTimeMin,
      estimatedCompletionTimeMax: completionEstimate.estimatedCompletionTimeMax,
      approximateCompletion: true,
      feasible: fastestPlan.feasible,
      warning,
      suggestedAction: fastestPlan.feasible ? null : "Start charging immediately.",
      slots: fastestPlan.slots,
      plannedEnergyKwh: fastestPlan.plannedEnergyKwh,
      estimatedCost: fastestPlan.estimatedCost,
      optimalEstimatedCost: optimalPlan.estimatedCost,
      costImpactVsOptimal: round(fastestPlan.estimatedCost - optimalPlan.estimatedCost),
      resultingSocPercent: fastestPlan.resultingSocPercent,
      deficitKwh: fastestPlan.deficitKwh,
      deficitSocPercent: fastestPlan.deficitSocPercent,
      currency: fastestPlan.currency,
      priceDataIncomplete,
      reason: [...EMERGENCY_REASONS],
    };
  }
}

export function createEmergencyDecisionLogInput(plan: EmergencyChargingPlan) {
  return {
    decisionType: "emergency_charging",
    selectedAction: plan.action,
    userMode: "safe" as const,
    reason: [...plan.reason],
    explanation: "User requested immediate charging to 100%. Safety override bypassed price optimization.",
    selectedPlanSnapshot: plan,
  };
}

function createEmergencyTarget(target: ChargingTarget): ChargingTarget {
  return {
    ...target,
    minSocPercent: 100,
    maxSocPercent: 100,
  };
}

/**
 * "Charge to 100%" charges continuously from `now` until the battery is full.
 * It never waits for prices and never stops at departure: price data only
 * annotates cost. Segments without price data are priced as unknown (cost 0,
 * flagged by `priceKnown: false`) so the plan is always available.
 */
function calculateFastestPlan(
  now: string,
  prices: PriceInterval[],
  target: ChargingTarget,
): ChargingPlan {
  const nowMs = Date.parse(now);
  const departureMs = Date.parse(target.departureTime);
  const effectivePowerKw = target.chargerPowerKw * target.chargingEfficiency;
  const requiredSocPercent = Math.max(0, target.minSocPercent - target.currentSocPercent);
  const requiredEnergyKwh = (requiredSocPercent / 100) * target.batteryCapacityKwh;
  const endMs = nowMs + (requiredEnergyKwh / effectivePowerKw) * 3_600_000;
  const sortedPrices = prices
    .filter((price) => Date.parse(price.endsAt) > nowMs && Date.parse(price.startsAt) < endMs)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const currency = sortedPrices[0]?.currency ?? prices[0]?.currency ?? null;

  const slots: ChargingSlot[] = [];
  let cursorMs = nowMs;
  for (const price of sortedPrices) {
    if (cursorMs >= endMs) {
      break;
    }
    const priceStartMs = Math.max(Date.parse(price.startsAt), cursorMs);
    const priceEndMs = Math.min(Date.parse(price.endsAt), endMs);
    if (priceEndMs <= cursorMs) {
      continue;
    }
    if (priceStartMs > cursorMs) {
      slots.push(createSlot(cursorMs, priceStartMs, effectivePowerKw, null));
    }
    slots.push(createSlot(priceStartMs, priceEndMs, effectivePowerKw, price.total));
    cursorMs = priceEndMs;
  }
  if (cursorMs < endMs) {
    slots.push(createSlot(cursorMs, endMs, effectivePowerKw, null));
  }

  const plannedEnergyKwh = requiredEnergyKwh;
  const estimatedCost = sum(slots.map((slot) => slot.estimatedCost));
  const energyBeforeDepartureKwh = Math.min(
    requiredEnergyKwh,
    Math.max(0, ((departureMs - nowMs) / 3_600_000) * effectivePowerKw),
  );
  const deficitKwh = Math.max(0, requiredEnergyKwh - energyBeforeDepartureKwh);

  return {
    feasible: deficitKwh <= 0.000001,
    slots,
    plannedEnergyKwh: round(plannedEnergyKwh),
    estimatedCost: round(estimatedCost),
    resultingSocPercent: round(target.currentSocPercent + (plannedEnergyKwh / target.batteryCapacityKwh) * 100),
    deficitKwh: round(deficitKwh),
    deficitSocPercent: round((deficitKwh / target.batteryCapacityKwh) * 100),
    currency,
  };
}

function createSlot(startMs: number, endMs: number, effectivePowerKw: number, price: number | null): ChargingSlot {
  const durationHours = (endMs - startMs) / 3_600_000;
  const energyKwh = durationHours * effectivePowerKw;
  const slot: ChargingSlot = {
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    durationHours: round(durationHours),
    energyKwh: round(energyKwh),
    price: price ?? 0,
    estimatedCost: price === null ? 0 : round(energyKwh * price),
  };
  if (price === null) {
    slot.priceKnown = false;
  }
  return slot;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
