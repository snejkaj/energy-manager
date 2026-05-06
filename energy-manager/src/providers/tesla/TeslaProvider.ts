// Requirements: TES-001, TES-002, TES-003, TES-004, TES-005, TES-006, PRV-001, PRV-003, PRV-004, ARC-006

import type { VehicleState, VehicleStateProvider } from "../VehicleStateProvider.js";
import type { TeslaTransport } from "./TeslaClient.js";
import type { TeslaVehicleDataResponse, TeslaVehicleSelection, TeslaVehiclesResponse } from "./TeslaTypes.js";

export class TeslaVehicleStateProvider implements VehicleStateProvider {
  metadata = {
    id: "tesla",
    displayName: "Tesla",
    kind: "vehicle-state" as const,
  };

  configSchema = {
    fields: [
      {
        key: "access_token",
        label: "Access token",
        type: "password" as const,
        required: true,
        description: "Tesla Fleet API access token with read-only vehicle data access.",
      },
      {
        key: "vehicle_id",
        label: "Vehicle ID or VIN",
        type: "string" as const,
        required: false,
        description: "Optional Tesla vehicle ID or VIN. First vehicle is used when omitted.",
      },
    ],
  };

  capabilities = {
    readOnly: true as const,
    supportsBatterySoc: true,
    supportsPluggedInState: true,
    supportsChargingState: true,
    supportsEstimatedRange: true,
  };

  constructor(
    private readonly transport: TeslaTransport,
    private readonly selection: TeslaVehicleSelection = {},
  ) {}

  async getVehicleState(): Promise<VehicleState | null> {
    const vehicleId = await this.resolveVehicleId();
    if (vehicleId === null) {
      return null;
    }

    const data = await this.transport.get<TeslaVehicleDataResponse>(`/api/1/vehicles/${vehicleId}/vehicle_data`);
    const chargeState = data.response.charge_state;
    if (chargeState === undefined || chargeState === null) {
      return null;
    }

    return {
      batterySocPercent: numberOrNull(chargeState.battery_level),
      pluggedIn: mapPluggedIn(chargeState),
      chargingState: chargeState.charging_state ?? null,
      estimatedRangeKm: milesToKm(numberOrNull(chargeState.est_battery_range)),
      source: "tesla",
      observedAt: new Date().toISOString(),
    };
  }

  private async resolveVehicleId(): Promise<string | null> {
    if (this.selection.vehicleId !== undefined && this.selection.vehicleId !== null && this.selection.vehicleId !== "") {
      return this.selection.vehicleId;
    }

    const data = await this.transport.get<TeslaVehiclesResponse>("/api/1/vehicles");
    const vehicle = data.response[0];
    return vehicle?.id_s ?? vehicle?.vin ?? null;
  }
}

function mapPluggedIn(chargeState: NonNullable<TeslaVehicleDataResponse["response"]["charge_state"]>): boolean | null {
  if (chargeState.charging_state !== undefined && chargeState.charging_state !== null) {
    return chargeState.charging_state !== "Disconnected";
  }

  if (chargeState.fast_charger_present !== undefined && chargeState.fast_charger_present !== null) {
    return chargeState.fast_charger_present;
  }

  if (chargeState.charge_port_latch !== undefined && chargeState.charge_port_latch !== null) {
    return chargeState.charge_port_latch !== "Unlocked";
  }

  if (chargeState.charge_port_door_open !== undefined && chargeState.charge_port_door_open !== null) {
    return chargeState.charge_port_door_open;
  }

  return null;
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function milesToKm(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1.609344 * 10) / 10;
}
