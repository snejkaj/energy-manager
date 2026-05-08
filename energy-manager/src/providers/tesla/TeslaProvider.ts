// Requirements: TES-001, TES-002, TES-003, TES-004, TES-005, TES-006, PRV-001, PRV-003, PRV-004, ARC-006

import type { VehicleState, VehicleStateProvider } from "../VehicleStateProvider.js";
import { logger } from "../../app/logger.js";
import type { TeslaTransport } from "./TeslaClient.js";
import type { TeslaVehicleDataResponse, TeslaVehicleSelection, TeslaVehiclesResponse } from "./TeslaTypes.js";

const TESLA_CACHE_TTL_MS = 15 * 60 * 1000;

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

  async getVehicleState(options: { forceRefresh?: boolean } = {}): Promise<VehicleState | null> {
    logger.info("Tesla", "Tesla state fetch start");
    const vehicle = await this.resolveVehicle();
    const vehicleId = vehicle?.id_s ?? vehicle?.vin ?? null;
    if (vehicleId === null) {
      logger.info("Tesla", "Tesla state fetch ended: no vehicle found");
      return null;
    }

    const cacheKey = `${this.selection.region ?? "eu"}:${vehicleId}`;
    const cachedState = teslaStateCache.get(cacheKey);
    if (!options.forceRefresh && cachedState !== undefined && Date.now() - cachedState.cachedAtMs < TESLA_CACHE_TTL_MS) {
      logger.info("Tesla", "Tesla cache hit");
      return cachedState.state;
    }

    logger.info("Tesla", "Tesla cache miss");
    logger.info("Tesla", `Selected Tesla vehicle id: ${maskVehicleId(vehicleId)}`);
    const onlineState = vehicle?.state ?? null;
    if (onlineState !== null && onlineState !== "online") {
      logger.info("Tesla", `Tesla vehicle is ${onlineState}; not waking vehicle`);
      if (cachedState !== undefined) {
        return {
          ...cachedState.state,
          vehicleOnlineState: onlineState,
          lastUpdatedAt: cachedState.state.lastUpdatedAt ?? cachedState.state.observedAt,
        };
      }

      return createUnavailableVehicleState(vehicleId, vehicle, onlineState);
    }

    const data = await this.transport.get<TeslaVehicleDataResponse>(`/vehicles/${vehicleId}/vehicle_data`);
    const chargeState = data.response.charge_state;
    if (chargeState === undefined || chargeState === null) {
      const state = createUnavailableVehicleState(vehicleId, vehicle, data.response.state ?? onlineState);
      teslaStateCache.set(cacheKey, { cachedAtMs: Date.now(), state });
      return state;
    }

    const observedAt = new Date().toISOString();
    const state: VehicleState = {
      batterySocPercent: numberOrNull(chargeState.battery_level),
      pluggedIn: mapPluggedIn(chargeState),
      chargingState: chargeState.charging_state ?? null,
      estimatedRangeKm: milesToKm(numberOrNull(chargeState.est_battery_range)),
      chargeLimitPercent: numberOrNull(chargeState.charge_limit_soc),
      chargerPowerKw: numberOrNull(chargeState.charger_power),
      chargerVoltage: numberOrNull(chargeState.charger_voltage),
      chargerActualCurrent: numberOrNull(chargeState.charger_actual_current),
      timeToFullChargeHours: numberOrNull(chargeState.time_to_full_charge),
      batteryRangeKm: milesToKm(numberOrNull(chargeState.battery_range)),
      vehicleName: data.response.display_name ?? data.response.vehicle_state?.vehicle_name ?? vehicle?.display_name ?? null,
      vehicleId,
      vehicleOnlineState: data.response.state ?? onlineState ?? "online",
      lastUpdatedAt: observedAt,
      isDemo: false,
      source: "tesla",
      observedAt,
    };
    teslaStateCache.set(cacheKey, { cachedAtMs: Date.now(), state });
    logger.info("Tesla", "Tesla state fetch end");
    return state;
  }

  async getVehicles(): Promise<TeslaVehiclesResponse["response"]> {
    logger.info("Tesla", "Tesla vehicle list fetch start");
    const data = await this.transport.get<TeslaVehiclesResponse>("/vehicles");
    logger.info("Tesla", `Tesla vehicle list fetch end: ${data.response.length} vehicle(s)`);
    return data.response;
  }

  private async resolveVehicle(): Promise<TeslaVehiclesResponse["response"][number] | null> {
    if (this.selection.vehicleId !== undefined && this.selection.vehicleId !== null && this.selection.vehicleId !== "") {
      const vehicles = await this.getVehicles();
      return vehicles.find((vehicle) => vehicle.id_s === this.selection.vehicleId || vehicle.vin === this.selection.vehicleId || String(vehicle.id) === this.selection.vehicleId) ?? {
        id_s: this.selection.vehicleId,
        state: "online",
      };
    }

    const vehicle = (await this.getVehicles())[0] ?? null;
    if (vehicle !== null) {
      logger.info("Tesla", `Selected Tesla vehicle id: ${maskVehicleId(vehicle.id_s ?? vehicle.vin ?? String(vehicle.id ?? ""))}`);
    }
    return vehicle;
  }
}

const teslaStateCache = new Map<string, { cachedAtMs: number; state: VehicleState }>();

function createUnavailableVehicleState(
  vehicleId: string,
  vehicle: TeslaVehiclesResponse["response"][number] | null,
  onlineState: string | null,
): VehicleState {
  const observedAt = new Date().toISOString();
  return {
    batterySocPercent: null,
    pluggedIn: null,
    chargingState: null,
    estimatedRangeKm: null,
    chargeLimitPercent: null,
    chargerPowerKw: null,
    chargerVoltage: null,
    chargerActualCurrent: null,
    timeToFullChargeHours: null,
    batteryRangeKm: null,
    vehicleName: vehicle?.display_name ?? null,
    vehicleId,
    vehicleOnlineState: onlineState,
    lastUpdatedAt: null,
    isDemo: false,
    source: "tesla",
    observedAt,
  };
}

function maskVehicleId(value: string): string {
  if (value.length <= 6) {
    return `${value.slice(0, 2)}...`;
  }

  return `${value.slice(0, 4)}...${value.slice(-2)}`;
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
