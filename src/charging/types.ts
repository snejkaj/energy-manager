// Requirements: CHG-001, CHG-002, CHG-003, CHG-004, CHG-005, CHG-006, CHG-007, CHG-008, CHG-009, CHG-010, OPT-011, ARC-005

export type IsoDateTime = string;

export interface PriceInterval {
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  total: number;
  currency: string;
}

export interface ChargingTarget {
  departureTime: IsoDateTime;
  currentSocPercent: number;
  minSocPercent: number;
  maxSocPercent: number;
  batteryCapacityKwh: number;
  chargerPowerKw: number;
  chargingEfficiency: number;
}

export interface HomeTelemetry {
  consumptionKw?: number;
  productionKw?: number;
}

export interface ChargingSlot {
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  durationHours: number;
  energyKwh: number;
  price: number;
  estimatedCost: number;
}

export interface ChargingPlan {
  feasible: boolean;
  slots: ChargingSlot[];
  plannedEnergyKwh: number;
  estimatedCost: number;
  resultingSocPercent: number;
  deficitKwh: number;
  deficitSocPercent: number;
  currency: string | null;
}
