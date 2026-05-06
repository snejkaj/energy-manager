// Requirements: CFG-001, TIB-001

import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/app/config.js";

describe("loadConfig", () => {
  it("uses Tibber as default price provider when a personal access token is configured", () => {
    const config = loadConfig({
      TIBBER_ACCESS_TOKEN: "token",
    });

    expect(config.electricityPriceProvider).toBe("tibber");
    expect(config.homeTelemetryProvider).toBe("tibber-live-measurement");
  });

  it("uses mock providers when Tibber token is missing", () => {
    const config = loadConfig({});

    expect(config.electricityPriceProvider).toBe("mock-electricity-price");
    expect(config.homeTelemetryProvider).toBe("mock-home-telemetry");
  });

  it("uses safe defaults when optional Home Assistant values are empty", () => {
    const config = loadConfig({
      ELECTRICITY_PRICE_PROVIDER: "",
      HOME_TELEMETRY_PROVIDER: "",
      CHARGER_PROVIDER: "",
      VEHICLE_STATE_PROVIDER: "",
      WEATHER_FORECAST_PROVIDER: "",
      USER_MODE: "",
      SOC_BUFFER_PERCENT: "",
      START_EARLY_MINUTES: "",
      ALLOW_UNDERCHARGE_RISK: "",
      WEATHER_LATITUDE: "null",
      WEATHER_LONGITUDE: "null",
      SOLAR_PANEL_TILT_DEGREES: "null",
      SOLAR_PANEL_AZIMUTH_DEGREES: "null",
      DATABASE_URL: "",
      DEPARTURE_TIME: "",
      MINIMUM_SOC_PERCENT: "",
      MAXIMUM_SOC_PERCENT: "",
      BATTERY_CAPACITY_KWH: "",
      CHARGER_POWER_KW: "",
      CHARGING_EFFICIENCY: "",
    });

    expect(config.databaseUrl).toBeNull();
    expect(config.chargerProvider).toBe("planning-only");
    expect(config.userMode).toBe("safe");
    expect(config.weatherLatitude).toBeNull();
    expect(config.weatherLongitude).toBeNull();
    expect(config.solarPanelTiltDegrees).toBeNull();
    expect(config.solarPanelAzimuthDegrees).toBeNull();
    expect(config.electricityPriceProvider).toBe("mock-electricity-price");
    expect(config.homeTelemetryProvider).toBe("mock-home-telemetry");
  });
});
