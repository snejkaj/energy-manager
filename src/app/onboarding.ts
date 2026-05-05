// Requirements: CFG-002, CFG-003, CFG-006, CHG-105, ONB-001, ONB-002, ONB-003, ONB-004

import type { AppConfig } from "./config.js";

export interface StartupOnboarding {
  blockingErrors: string[];
  setupMessages: string[];
  planningOnlyMode: boolean;
}

export class StartupConfigurationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join("\n"));
    this.name = "StartupConfigurationError";
  }
}

export function createStartupOnboarding(config: AppConfig): StartupOnboarding {
  const blockingErrors: string[] = [];
  const setupMessages: string[] = [];
  const planningOnlyMode = config.chargerProvider === null || config.chargerProvider === "planning-only";

  if (config.databaseUrl === null) {
    blockingErrors.push(
      "Database is not configured. Set DATABASE_URL to a PostgreSQL connection string before starting the add-on.",
    );
  }

  if (config.tibberAccessToken === null) {
    setupMessages.push(
      "Tibber is not connected yet. Add TIBBER_ACCESS_TOKEN to fetch real electricity prices; mock prices are used for setup.",
    );
  }

  if (planningOnlyMode) {
    setupMessages.push(
      "Planning only mode is active. No charger hardware will be controlled until a charger provider is configured.",
    );
  }

  return {
    blockingErrors,
    setupMessages,
    planningOnlyMode,
  };
}

export function assertStartupIsReady(onboarding: StartupOnboarding): void {
  if (onboarding.blockingErrors.length > 0) {
    throw new StartupConfigurationError(onboarding.blockingErrors);
  }
}
