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
  reason: Array<(typeof EMERGENCY_REASONS)[number]>;
}

export class EmergencyChargingService {
  calculate(input: EmergencyChargingInput): EmergencyChargingPlan {
    validateChargingTarget(input.target);

    const emergencyTarget = createEmergencyTarget(input.target);
    const fastestPlan = calculateFastestPlan(input.now, input.prices, emergencyTarget);
    const optimalPlan = calculateChargingPlan(input.prices, emergencyTarget);
    const completionEstimate = estimateCompletionForTarget(input.now, emergencyTarget);
    const startTime = fastestPlan.slots[0]?.startsAt ?? input.now;
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

function calculateFastestPlan(
  now: string,
  prices: PriceInterval[],
  target: ChargingTarget,
): ChargingPlan {
  const nowMs = Date.parse(now);
  const departureMs = Date.parse(target.departureTime);
  const currentOrFuturePrices = prices
    .filter((price) => Date.parse(price.endsAt) > nowMs && Date.parse(price.startsAt) < departureMs)
    .map((price) => ({
      ...price,
      startsAt: new Date(Math.max(Date.parse(price.startsAt), nowMs)).toISOString(),
      endsAt: new Date(Math.min(Date.parse(price.endsAt), departureMs)).toISOString(),
    }))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  return calculateChronologicalPlan(currentOrFuturePrices, target);
}

function calculateChronologicalPlan(prices: PriceInterval[], target: ChargingTarget): ChargingPlan {
  const requiredSocPercent = Math.max(0, target.minSocPercent - target.currentSocPercent);
  const requiredEnergyKwh = (requiredSocPercent / 100) * target.batteryCapacityKwh;
  const currency = prices[0]?.currency ?? null;
  const slots: ChargingSlot[] = [];
  let remainingEnergyKwh = requiredEnergyKwh;

  for (const price of prices) {
    if (remainingEnergyKwh <= 0) {
      break;
    }

    const durationHoursAvailable = (Date.parse(price.endsAt) - Date.parse(price.startsAt)) / 3_600_000;
    const deliverableEnergyKwh = durationHoursAvailable * target.chargerPowerKw * target.chargingEfficiency;
    const energyKwh = Math.min(remainingEnergyKwh, deliverableEnergyKwh);
    const durationHours = energyKwh / (target.chargerPowerKw * target.chargingEfficiency);

    slots.push({
      startsAt: price.startsAt,
      endsAt: new Date(Date.parse(price.startsAt) + durationHours * 3_600_000).toISOString(),
      durationHours: round(durationHours),
      energyKwh: round(energyKwh),
      price: price.total,
      estimatedCost: round(energyKwh * price.total),
    });

    remainingEnergyKwh -= energyKwh;
  }

  const plannedEnergyKwh = sum(slots.map((slot) => slot.energyKwh));
  const estimatedCost = sum(slots.map((slot) => slot.estimatedCost));
  const deficitKwh = Math.max(0, requiredEnergyKwh - plannedEnergyKwh);
  const resultingSocPercent = target.currentSocPercent + (plannedEnergyKwh / target.batteryCapacityKwh) * 100;

  return {
    feasible: deficitKwh <= 0.000001,
    slots,
    plannedEnergyKwh: round(plannedEnergyKwh),
    estimatedCost: round(estimatedCost),
    resultingSocPercent: round(resultingSocPercent),
    deficitKwh: round(deficitKwh),
    deficitSocPercent: round((deficitKwh / target.batteryCapacityKwh) * 100),
    currency,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
