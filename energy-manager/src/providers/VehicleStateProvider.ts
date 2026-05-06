// Requirements: PRV-001, PRV-003, PRV-004, TES-001, TES-002, TES-003, TES-004, TES-005, TES-006, ARC-006

import type { Provider } from "./providerTypes.js";

export interface VehicleStateProviderCapabilities {
  readOnly: true;
  supportsBatterySoc: boolean;
  supportsPluggedInState: boolean;
  supportsChargingState: boolean;
  supportsEstimatedRange: boolean;
}

export interface VehicleState {
  batterySocPercent: number | null;
  pluggedIn: boolean | null;
  chargingState: string | null;
  estimatedRangeKm: number | null;
  vehicleName?: string | null;
  vehicleId?: string | null;
  vehicleOnlineState?: string | null;
  lastUpdatedAt?: string | null;
  source: string;
  observedAt: string;
}

export interface VehicleStateProvider extends Provider<VehicleStateProviderCapabilities> {
  getVehicleState(options?: { forceRefresh?: boolean }): Promise<VehicleState | null>;
}
