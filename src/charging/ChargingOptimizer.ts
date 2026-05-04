// Requirements: OPT-001, OPT-002, OPT-003, OPT-004, OPT-005, OPT-006, OPT-007, OPT-008, OPT-009, OPT-010, OPT-011, OPT-012, OPT-013, OPT-014, ARC-001, ARC-002, ARC-003

import type { ChargingPlan, ChargingSlot, ChargingTarget, PriceInterval } from "./types.js";

const EPSILON = 0.000001;

export class ChargingTargetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChargingTargetValidationError";
  }
}

export function calculateChargingPlan(
  prices: PriceInterval[],
  target: ChargingTarget,
): ChargingPlan {
  validateChargingTarget(target);

  const cappedTargetSocPercent = Math.min(target.minSocPercent, target.maxSocPercent);
  const requiredSocPercent = Math.max(0, cappedTargetSocPercent - target.currentSocPercent);
  const requiredEnergyKwh = (requiredSocPercent / 100) * target.batteryCapacityKwh;
  const currency = prices[0]?.currency ?? null;

  if (requiredEnergyKwh <= EPSILON) {
    return createPlan([], 0, 0, target.currentSocPercent, 0, 0, currency, true);
  }

  const departureTime = Date.parse(target.departureTime);
  const usableIntervals = prices
    .filter((price) => Date.parse(price.startsAt) < departureTime)
    .map((price) => ({
      ...price,
      startsAtMs: Date.parse(price.startsAt),
      endsAtMs: Math.min(Date.parse(price.endsAt), departureTime),
    }))
    .filter((price) => price.endsAtMs > price.startsAtMs)
    .sort((a, b) => {
      if (a.total !== b.total) {
        return a.total - b.total;
      }
      return a.startsAtMs - b.startsAtMs;
    });

  const slots: ChargingSlot[] = [];
  let remainingEnergyKwh = requiredEnergyKwh;

  for (const interval of usableIntervals) {
    if (remainingEnergyKwh <= EPSILON) {
      break;
    }

    const availableDurationHours = (interval.endsAtMs - interval.startsAtMs) / 3_600_000;
    const deliverableEnergyKwh =
      availableDurationHours * target.chargerPowerKw * target.chargingEfficiency;
    const energyKwh = Math.min(remainingEnergyKwh, deliverableEnergyKwh);
    const durationHours = energyKwh / (target.chargerPowerKw * target.chargingEfficiency);
    const estimatedCost = energyKwh * interval.total;

    slots.push({
      startsAt: interval.startsAt,
      endsAt: new Date(interval.startsAtMs + durationHours * 3_600_000).toISOString(),
      durationHours,
      energyKwh,
      price: interval.total,
      estimatedCost,
    });

    remainingEnergyKwh -= energyKwh;
  }

  slots.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  const plannedEnergyKwh = sum(slots.map((slot) => slot.energyKwh));
  const estimatedCost = sum(slots.map((slot) => slot.estimatedCost));
  const resultingSocPercent =
    target.currentSocPercent + (plannedEnergyKwh / target.batteryCapacityKwh) * 100;
  const deficitKwh = Math.max(0, requiredEnergyKwh - plannedEnergyKwh);
  const deficitSocPercent = (deficitKwh / target.batteryCapacityKwh) * 100;

  return createPlan(
    slots,
    plannedEnergyKwh,
    estimatedCost,
    resultingSocPercent,
    deficitKwh,
    deficitSocPercent,
    currency,
    deficitKwh <= EPSILON,
  );
}

// Requirements: CHG-012
export function validateChargingTarget(target: ChargingTarget): void {
  if (!Number.isFinite(Date.parse(target.departureTime))) {
    throw new ChargingTargetValidationError("departureTime must be a valid ISO timestamp.");
  }

  assertPercent("currentSocPercent", target.currentSocPercent);
  assertPercent("minSocPercent", target.minSocPercent);
  assertPercent("maxSocPercent", target.maxSocPercent);

  if (target.minSocPercent > target.maxSocPercent) {
    throw new ChargingTargetValidationError("minSocPercent must be less than or equal to maxSocPercent.");
  }

  if (target.batteryCapacityKwh <= 0) {
    throw new ChargingTargetValidationError("batteryCapacityKwh must be greater than 0.");
  }

  if (target.chargerPowerKw <= 0) {
    throw new ChargingTargetValidationError("chargerPowerKw must be greater than 0.");
  }

  if (target.chargingEfficiency <= 0 || target.chargingEfficiency > 1) {
    throw new ChargingTargetValidationError("chargingEfficiency must be greater than 0 and no more than 1.");
  }
}

function assertPercent(name: string, value: number): void {
  if (value < 0 || value > 100) {
    throw new ChargingTargetValidationError(`${name} must be between 0 and 100.`);
  }
}

function createPlan(
  slots: ChargingSlot[],
  plannedEnergyKwh: number,
  estimatedCost: number,
  resultingSocPercent: number,
  deficitKwh: number,
  deficitSocPercent: number,
  currency: string | null,
  feasible: boolean,
): ChargingPlan {
  return {
    feasible,
    slots,
    plannedEnergyKwh: round(plannedEnergyKwh),
    estimatedCost: round(estimatedCost),
    resultingSocPercent: round(resultingSocPercent),
    deficitKwh: round(deficitKwh),
    deficitSocPercent: round(deficitSocPercent),
    currency,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
