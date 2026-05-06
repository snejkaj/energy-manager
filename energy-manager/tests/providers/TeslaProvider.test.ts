// Requirements: TES-001, TES-002, TES-003, TES-004, TES-005, TES-006, PRV-004

import { describe, expect, it } from "vitest";

import { TeslaVehicleStateProvider } from "../../src/providers/tesla/TeslaProvider.js";
import type { TeslaTransport } from "../../src/providers/tesla/TeslaClient.js";

describe("TeslaVehicleStateProvider", () => {
  it("maps read-only charge state from vehicle_data", async () => {
    const provider = new TeslaVehicleStateProvider(new FakeTeslaTransport({
      "/api/1/vehicles/vehicle-1/vehicle_data": {
        response: {
          charge_state: {
            battery_level: 64,
            charging_state: "Stopped",
            est_battery_range: 181.2,
          },
        },
      },
    }), { vehicleId: "vehicle-1" });

    await expect(provider.getVehicleState()).resolves.toMatchObject({
      batterySocPercent: 64,
      pluggedIn: true,
      chargingState: "Stopped",
      estimatedRangeKm: 291.6,
      source: "tesla",
    });
  });

  it("selects the first vehicle when no vehicle id is configured", async () => {
    const provider = new TeslaVehicleStateProvider(new FakeTeslaTransport({
      "/api/1/vehicles": {
        response: [{ id_s: "vehicle-1" }],
      },
      "/api/1/vehicles/vehicle-1/vehicle_data": {
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
      "/api/1/vehicles/vehicle-1/vehicle_data": {
        response: {},
      },
    }), { vehicleId: "vehicle-1" });

    await expect(provider.getVehicleState()).resolves.toBeNull();
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
