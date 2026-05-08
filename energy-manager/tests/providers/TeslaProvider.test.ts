// Requirements: TES-001, TES-002, TES-003, TES-004, TES-005, TES-006, PRV-004

import { describe, expect, it } from "vitest";

import { TeslaVehicleStateProvider } from "../../src/providers/tesla/TeslaProvider.js";
import type { TeslaTransport } from "../../src/providers/tesla/TeslaClient.js";

describe("TeslaVehicleStateProvider", () => {
  it("maps read-only charge state from vehicle_data", async () => {
    const provider = new TeslaVehicleStateProvider(new FakeTeslaTransport({
      "/vehicles": {
        response: [{ id_s: "vehicle-2", display_name: "Model Y", state: "online" }],
      },
      "/vehicles/vehicle-2/vehicle_data": {
        response: {
          id_s: "vehicle-2",
          display_name: "Model Y",
          state: "online",
          charge_state: {
            battery_level: 64,
            charging_state: "Stopped",
            charge_limit_soc: 80,
            charger_power: 7,
            charger_voltage: 230,
            charger_actual_current: 32,
            time_to_full_charge: 1.25,
            battery_range: 180,
            est_battery_range: 181.2,
          },
        },
      },
    }), { vehicleId: "vehicle-2" });

    await expect(provider.getVehicleState()).resolves.toMatchObject({
      batterySocPercent: 64,
      pluggedIn: true,
      chargingState: "Stopped",
      estimatedRangeKm: 291.6,
      source: "tesla",
      vehicleName: "Model Y",
      vehicleId: "vehicle-2",
      vehicleOnlineState: "online",
      chargeLimitPercent: 80,
      chargerPowerKw: 7,
      chargerVoltage: 230,
      chargerActualCurrent: 32,
      timeToFullChargeHours: 1.25,
      batteryRangeKm: 289.7,
    });
  });

  it("selects the first vehicle when no vehicle id is configured", async () => {
    const provider = new TeslaVehicleStateProvider(new FakeTeslaTransport({
      "/vehicles": {
        response: [{ id_s: "vehicle-3", state: "online" }],
      },
      "/vehicles/vehicle-3/vehicle_data": {
        response: {
          charge_state: {
            battery_level: 80,
            charging_state: "Disconnected",
          },
        },
      },
    }));

    const state = await provider.getVehicleState();

    expect(state?.batterySocPercent).toBe(80);
    expect(state?.pluggedIn).toBe(false);
  });

  it("returns null when charge state is missing", async () => {
    const provider = new TeslaVehicleStateProvider(new FakeTeslaTransport({
      "/vehicles": {
        response: [{ id_s: "vehicle-4", state: "online" }],
      },
      "/vehicles/vehicle-4/vehicle_data": {
        response: {},
      },
    }), { vehicleId: "vehicle-4" });

    await expect(provider.getVehicleState()).resolves.toMatchObject({
      vehicleId: "vehicle-4",
      batterySocPercent: null,
    });
  });

  it("does not wake sleeping vehicles and returns last known state when cached", async () => {
    const provider = new TeslaVehicleStateProvider(new FakeTeslaTransport({
      "/vehicles": {
        response: [{ id_s: "vehicle-5", state: "online" }],
      },
      "/vehicles/vehicle-5/vehicle_data": {
        response: {
          id_s: "vehicle-5",
          state: "online",
          charge_state: {
            battery_level: 71,
            charging_state: "Disconnected",
          },
        },
      },
    }));

    await expect(provider.getVehicleState()).resolves.toMatchObject({ batterySocPercent: 71 });

    const sleepingProvider = new TeslaVehicleStateProvider(new FakeTeslaTransport({
      "/vehicles": {
        response: [{ id_s: "vehicle-5", state: "asleep" }],
      },
    }));

    await expect(sleepingProvider.getVehicleState({ forceRefresh: true })).resolves.toMatchObject({
      batterySocPercent: 71,
      vehicleOnlineState: "asleep",
    });
  });
});

class FakeTeslaTransport implements TeslaTransport {
  constructor(private readonly responses: Record<string, unknown>) {}

  async get<TData>(path: string): Promise<TData> {
    const response = this.responses[path];
    if (response === undefined) {
      throw new Error(`Unexpected Tesla path: ${path}`);
    }

    return response as TData;
  }
}
