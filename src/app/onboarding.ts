// Requirements: CFG-002, CFG-003, CFG-006, CHG-105, ONB-001, ONB-002, ONB-003, ONB-004

import type { AppConfig } from "./config.js";

export interface StartupOnboarding {
  blockingErrors: string[];
  setupMessages: string[];
  setupWarnings: string[];
  demoMode: boolean;
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
  const setupWarnings: string[] = [];
  const demoMode = config.databaseUrl === null;
  const planningOnlyMode = config.chargerProvider === null || config.chargerProvider === "planning-only";

  if (demoMode) {
    setupWarnings.push(
      "Demo mode - no data is saved. Set DATABASE_URL to enable PostgreSQL storage.",
    );
  }

  if (config.tibberAccessToken === null) {
    setupMessages.push(
      "Tibber is not connected yet. Add TIBBER_ACCESS_TOKEN to fetch real electricity prices; mock prices are used for setup.",
    );
  }

  if (config.teslaAccessToken === null) {
    setupMessages.push(
      "Tesla is not connected yet. Add TESLA_ACCESS_TOKEN to show live battery level and plugged-in state.",
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
    setupWarnings,
    demoMode,
    planningOnlyMode,
  };
}

export function assertStartupIsReady(onboarding: StartupOnboarding): void {
  if (onboarding.blockingErrors.length > 0) {
    throw new StartupConfigurationError(onboarding.blockingErrors);
  }
}
