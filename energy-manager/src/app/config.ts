// Requirements: CFG-001, CFG-002, CFG-003, CFG-004, CFG-005, CFG-006, CFG-007, ONB-001, ONB-003

export interface AppConfig {
  port: number;
  databaseUrl: string | null;
  tibberAccessToken: string | null;
  tibberHomeId: string | null;
  teslaVehicleId: string | null;
  teslaRegion: "eu" | "us" | "na";
  tibberOAuthClientId: string | null;
  tibberOAuthClientSecret: string | null;
  tibberOAuthRedirectUri: string | null;
  teslaOAuthClientId: string | null;
  teslaOAuthClientSecret: string | null;
  tokenEncryptionKey: string | null;
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
  setupNotes: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const setupNotes: string[] = [];

  return {
    port: parsePort(env.PORT),
    databaseUrl: emptyToNull(env.DATABASE_URL),
    tibberAccessToken: emptyToNull(trimEnv(env.TIBBER_ACCESS_TOKEN)),
    tibberHomeId: emptyToNull(env.TIBBER_HOME_ID),
    teslaVehicleId: emptyToNull(trimEnv(env.TESLA_VEHICLE_ID)),
    teslaRegion: parseTeslaRegion(env.TESLA_REGION, setupNotes),
    tibberOAuthClientId: emptyToNull(env.TIBBER_OAUTH_CLIENT_ID),
    tibberOAuthClientSecret: emptyToNull(env.TIBBER_OAUTH_CLIENT_SECRET),
    tibberOAuthRedirectUri: emptyToNull(env.TIBBER_OAUTH_REDIRECT_URI),
    teslaOAuthClientId: emptyToNull(trimEnv(env.TESLA_CLIENT_ID)),
    teslaOAuthClientSecret: emptyToNull(trimEnv(env.TESLA_CLIENT_SECRET)),
    tokenEncryptionKey: emptyToNull(env.TOKEN_ENCRYPTION_KEY),
    electricityPriceProvider: emptyToNull(env.ELECTRICITY_PRICE_PROVIDER) ?? defaultElectricityPriceProvider(env),
    homeTelemetryProvider: emptyToNull(env.HOME_TELEMETRY_PROVIDER) ?? defaultHomeTelemetryProvider(env),
    chargerProvider: emptyToNull(env.CHARGER_PROVIDER) ?? "planning-only",
    vehicleStateProvider: emptyToNull(env.VEHICLE_STATE_PROVIDER) ?? defaultVehicleStateProvider(env),
    weatherForecastProvider: emptyToNull(env.WEATHER_FORECAST_PROVIDER) ?? defaultWeatherForecastProvider(env),
    userMode: parseUserMode(env.USER_MODE, setupNotes),
    socBufferPercent: parseNumberWithDefault(env.SOC_BUFFER_PERCENT, 15, "SOC buffer", setupNotes),
    startEarlyMinutes: parseNumberWithDefault(env.START_EARLY_MINUTES, 90, "start early minutes", setupNotes),
    allowUnderchargeRisk: parseBoolean(env.ALLOW_UNDERCHARGE_RISK, false, "allow undercharge risk", setupNotes),
    weatherLatitude: parseOptionalNumber(env.WEATHER_LATITUDE, "weather latitude", setupNotes),
    weatherLongitude: parseOptionalNumber(env.WEATHER_LONGITUDE, "weather longitude", setupNotes),
    solarPanelTiltDegrees: parseOptionalNumber(env.SOLAR_PANEL_TILT_DEGREES, "solar panel tilt", setupNotes),
    solarPanelAzimuthDegrees: parseOptionalNumber(env.SOLAR_PANEL_AZIMUTH_DEGREES, "solar panel azimuth", setupNotes),
    departureTime: parseDepartureTime(env.DEPARTURE_TIME, setupNotes),
    minimumSocPercent: parseNumberWithDefault(env.MINIMUM_SOC_PERCENT, 65, "minimum SOC", setupNotes),
    maximumSocPercent: parseNumberWithDefault(env.MAXIMUM_SOC_PERCENT, 80, "maximum SOC", setupNotes),
    batteryCapacityKwh: parseNumberWithDefault(env.BATTERY_CAPACITY_KWH, 75, "battery capacity", setupNotes),
    chargerPowerKw: parseNumberWithDefault(env.CHARGER_POWER_KW, 11, "charger power", setupNotes),
    chargingEfficiency: parseNumberWithDefault(env.CHARGING_EFFICIENCY, 0.9, "charging efficiency", setupNotes),
    setupNotes,
  };
}

function parseUserMode(value: string | undefined, setupNotes: string[]): AppConfig["userMode"] {
  if (value === undefined || value.trim() === "") {
    return "safe";
  }

  if (value === "safe" || value === "balanced" || value === "savings") {
    return value;
  }

  setupNotes.push("Charging strategy was not recognized. Safe mode is used.");
  return "safe";
}

function parseTeslaRegion(value: string | undefined, setupNotes: string[]): AppConfig["teslaRegion"] {
  const region = value === undefined || value.trim() === "" ? "eu" : value.trim().toLowerCase();
  if (region === "eu" || region === "us" || region === "na") {
    return region;
  }

  setupNotes.push("Tesla region was not recognized. EU is used.");
  return "eu";
}

function defaultElectricityPriceProvider(env: NodeJS.ProcessEnv): string {
  return emptyToNull(env.TIBBER_ACCESS_TOKEN) === null ? "mock-electricity-price" : "tibber";
}

function defaultHomeTelemetryProvider(env: NodeJS.ProcessEnv): string {
  return emptyToNull(env.TIBBER_ACCESS_TOKEN) === null ? "mock-home-telemetry" : "tibber-live-measurement";
}

function defaultVehicleStateProvider(_env: NodeJS.ProcessEnv): string {
  return "mock-vehicle-state";
}

function defaultWeatherForecastProvider(env: NodeJS.ProcessEnv): string {
  return parseOptionalNumberQuietly(env.WEATHER_LATITUDE) === null || parseOptionalNumberQuietly(env.WEATHER_LONGITUDE) === null
    ? "mock-weather-forecast"
    : "open-meteo";
}

function parseOptionalNumberQuietly(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "" || value.trim() === "null") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseNumberWithDefault(
  value: string | undefined,
  defaultValue: number,
  label: string,
  setupNotes: string[],
): number {
  if (value === undefined || value.trim() === "" || value.trim() === "null") {
    return defaultValue;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    setupNotes.push(`${label} is not a valid number. The default value is used.`);
    return defaultValue;
  }

  return numberValue;
}

function parseBoolean(value: string | undefined, defaultValue: boolean, label: string, setupNotes: string[]): boolean {
  if (value === undefined || value.trim() === "" || value.trim() === "null") {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  setupNotes.push(`${label} is not valid. The default value is used.`);
  return defaultValue;
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

function trimEnv(value: string | undefined): string | undefined {
  return value === undefined ? undefined : value.trim();
}

function parseOptionalNumber(value: string | undefined, label: string, setupNotes: string[]): number | null {
  if (value === undefined || value.trim() === "" || value.trim() === "null") {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    setupNotes.push(`${label} is not a valid number. This setting is disabled.`);
    return null;
  }

  return numberValue;
}

function parseDepartureTime(value: string | undefined, setupNotes: string[]): string {
  const time = value === undefined || value.trim() === "" || value.trim() === "null" ? "08:00" : value.trim();
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
    setupNotes.push("Departure time is not valid. 08:00 is used.");
    return parseDepartureTime("08:00", []);
  }

  const [hours, minutes] = time.split(":").map(Number);
  const departure = new Date();
  departure.setUTCHours(hours ?? 8, minutes ?? 0, 0, 0);
  if (departure.getTime() <= Date.now()) {
    departure.setUTCDate(departure.getUTCDate() + 1);
  }
  return departure.toISOString();
}
