// Requirements: CFG-001, CFG-002, CFG-003, CFG-004, CFG-005, CFG-006, CFG-007, ONB-001, ONB-003

export interface AppConfig {
  port: number;
  databaseUrl: string | null;
  tibberAccessToken: string | null;
  tibberHomeId: string | null;
  teslaAccessToken: string | null;
  teslaVehicleId: string | null;
  electricityPriceProvider: string;
  homeTelemetryProvider: string;
  chargerProvider: string | null;
  vehicleStateProvider: string;
  weatherForecastProvider: string;
  userMode: "safe" | "balanced" | "savings";
  socBufferPercent: number;
  startEarlyMinutes: number;
  allowUnderchargeRisk: boolean;
  weatherLatitude: number | null;
  weatherLongitude: number | null;
  solarPanelTiltDegrees: number | null;
  solarPanelAzimuthDegrees: number | null;
  departureTime: string;
  minimumSocPercent: number;
  maximumSocPercent: number;
  batteryCapacityKwh: number;
  chargerPowerKw: number;
  chargingEfficiency: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: parsePort(env.PORT),
    databaseUrl: emptyToNull(env.DATABASE_URL),
    tibberAccessToken: emptyToNull(env.TIBBER_ACCESS_TOKEN),
    tibberHomeId: emptyToNull(env.TIBBER_HOME_ID),
    teslaAccessToken: emptyToNull(env.TESLA_ACCESS_TOKEN),
    teslaVehicleId: emptyToNull(env.TESLA_VEHICLE_ID),
    electricityPriceProvider: emptyToNull(env.ELECTRICITY_PRICE_PROVIDER) ?? "mock-electricity-price",
    homeTelemetryProvider: emptyToNull(env.HOME_TELEMETRY_PROVIDER) ?? "mock-home-telemetry",
    chargerProvider: emptyToNull(env.CHARGER_PROVIDER) ?? "planning-only",
    vehicleStateProvider: emptyToNull(env.VEHICLE_STATE_PROVIDER) ?? "tesla",
    weatherForecastProvider: emptyToNull(env.WEATHER_FORECAST_PROVIDER) ?? "open-meteo",
    userMode: parseUserMode(env.USER_MODE),
    socBufferPercent: parseNumberWithDefault(env.SOC_BUFFER_PERCENT, 15),
    startEarlyMinutes: parseNumberWithDefault(env.START_EARLY_MINUTES, 90),
    allowUnderchargeRisk: parseBoolean(env.ALLOW_UNDERCHARGE_RISK, false),
    weatherLatitude: parseOptionalNumber(env.WEATHER_LATITUDE),
    weatherLongitude: parseOptionalNumber(env.WEATHER_LONGITUDE),
    solarPanelTiltDegrees: parseOptionalNumber(env.SOLAR_PANEL_TILT_DEGREES),
    solarPanelAzimuthDegrees: parseOptionalNumber(env.SOLAR_PANEL_AZIMUTH_DEGREES),
    departureTime: parseDepartureTime(env.DEPARTURE_TIME),
    minimumSocPercent: parseNumberWithDefault(env.MINIMUM_SOC_PERCENT, 65),
    maximumSocPercent: parseNumberWithDefault(env.MAXIMUM_SOC_PERCENT, 80),
    batteryCapacityKwh: parseNumberWithDefault(env.BATTERY_CAPACITY_KWH, 75),
    chargerPowerKw: parseNumberWithDefault(env.CHARGER_POWER_KW, 11),
    chargingEfficiency: parseNumberWithDefault(env.CHARGING_EFFICIENCY, 0.9),
  };
}

function parseUserMode(value: string | undefined): AppConfig["userMode"] {
  if (value === undefined || value.trim() === "") {
    return "safe";
  }

  if (value === "safe" || value === "balanced" || value === "savings") {
    return value;
  }

  throw new Error("USER_MODE must be safe, balanced, or savings.");
}

function parseNumberWithDefault(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === "" || value.trim() === "null") {
    return defaultValue;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`Expected numeric environment value, got ${value}.`);
  }

  return numberValue;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "" || value.trim() === "null") {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`Expected boolean environment value, got ${value}.`);
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "" || value.trim() === "null") {
    return 3000;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function emptyToNull(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "" || value.trim() === "null") {
    return null;
  }

  return value;
}

function parseOptionalNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`Expected numeric environment value, got ${value}.`);
  }

  return numberValue;
}

function parseDepartureTime(value: string | undefined): string {
  const time = value === undefined || value.trim() === "" || value.trim() === "null" ? "08:00" : value.trim();
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
    throw new Error("DEPARTURE_TIME must use HH:mm format.");
  }

  return `2026-05-05T${time}:00.000Z`;
}
