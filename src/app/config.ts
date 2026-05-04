// Requirements: CFG-001, CFG-002, CFG-003, CFG-004, CFG-005, CFG-006, CFG-007

export interface AppConfig {
  port: number;
  databaseUrl: string | null;
  tibberAccessToken: string | null;
  tibberHomeId: string | null;
  electricityPriceProvider: string;
  homeTelemetryProvider: string;
  chargerProvider: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: parsePort(env.PORT),
    databaseUrl: emptyToNull(env.DATABASE_URL),
    tibberAccessToken: emptyToNull(env.TIBBER_ACCESS_TOKEN),
    tibberHomeId: emptyToNull(env.TIBBER_HOME_ID),
    electricityPriceProvider: env.ELECTRICITY_PRICE_PROVIDER ?? "mock-electricity-price",
    homeTelemetryProvider: env.HOME_TELEMETRY_PROVIDER ?? "mock-home-telemetry",
    chargerProvider: env.CHARGER_PROVIDER ?? "mock-charger",
  };
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 3000;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function emptyToNull(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  return value;
}
