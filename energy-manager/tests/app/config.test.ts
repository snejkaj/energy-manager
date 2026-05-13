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
    expect(config.vehicleStateProvider).toBe("mock-vehicle-state");
    expect(config.weatherForecastProvider).toBe("mock-weather-forecast");
    expect(config.teslaRegion).toBe("eu");
  });

  it("uses live weather provider only when enough config exists", () => {
    const config = loadConfig({
      WEATHER_LATITUDE: "59.33",
      WEATHER_LONGITUDE: "18.06",
    });

    expect(config.weatherForecastProvider).toBe("open-meteo");
  });

  it("does not throw when optional numeric settings are invalid", () => {
    const config = loadConfig({
      WEATHER_LATITUDE: "not-a-number",
      SOLAR_PANEL_TILT_DEGREES: "not-a-number",
      CHARGER_POWER_KW: "not-a-number",
      DEPARTURE_TIME: "not-a-time",
    });

    expect(config.weatherLatitude).toBeNull();
    expect(config.solarPanelTiltDegrees).toBeNull();
    expect(config.chargerPowerKw).toBe(11);
    expect(config.setupNotes).toEqual(expect.arrayContaining([
      "weather latitude is not a valid number. This setting is disabled.",
      "solar panel tilt is not a valid number. This setting is disabled.",
      "charger power is not a valid number. The default value is used.",
      "Departure time is not valid. 08:00 is used.",
    ]));
  });

  it("accepts Tesla US region and defaults unknown regions to EU", () => {
    expect(loadConfig({ TESLA_REGION: "us" }).teslaRegion).toBe("us");

    const config = loadConfig({ TESLA_REGION: "moon" });
    expect(config.teslaRegion).toBe("eu");
    expect(config.setupNotes).toContain("Tesla region was not recognized. EU is used.");
  });

  it("accepts Tesla OAuth client environment names", () => {
    const config = loadConfig({
      TESLA_CLIENT_ID: " client-id ",
      TESLA_CLIENT_SECRET: " secret ",
    });

    expect(config.teslaOAuthClientId).toBe("client-id");
    expect(config.teslaOAuthClientSecret).toBe("secret");
  });

  it("does not use legacy Tesla OAuth environment aliases", () => {
    const config = loadConfig({
      TESLA_OAUTH_CLIENT_ID: "legacy-client-id",
      TESLA_OAUTH_CLIENT_SECRET: "legacy-secret",
      TESLA_OAUTH_REDIRECT_URI: "https://example.test/legacy",
    });

    expect(config.teslaOAuthClientId).toBeNull();
    expect(config.teslaOAuthClientSecret).toBeNull();
  });
});
