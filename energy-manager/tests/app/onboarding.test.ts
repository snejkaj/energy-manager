// Requirements: ONB-001, ONB-002, ONB-003, ONB-004, CFG-006, CHG-105

import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/app/config.js";
import {
  assertStartupIsReady,
  createStartupOnboarding,
  StartupConfigurationError,
} from "../../src/app/onboarding.js";

describe("startup onboarding", () => {
  it("shows setup guidance when Tibber token is missing", () => {
    // Requirements: ONB-001
    const onboarding = createStartupOnboarding(loadConfig({
      DATABASE_URL: "postgres://user:password@localhost:5432/energy_manager",
      CHARGER_PROVIDER: "mock-charger",
    }));

    expect(onboarding.setupMessages).toContain(
      "Tibber token not configured. Add TIBBER_ACCESS_TOKEN to fetch real electricity prices; demo prices are used for setup.",
    );
    expect(onboarding.blockingErrors).toEqual([]);
  });

  it("uses demo mode when database config is missing", () => {
    // Requirements: ONB-002, CFG-006
    const onboarding = createStartupOnboarding(loadConfig({
      TIBBER_ACCESS_TOKEN: "token",
      CHARGER_PROVIDER: "mock-charger",
    }));

    expect(onboarding.demoMode).toBe(true);
    expect(onboarding.setupWarnings).toEqual([
      "Demo mode - no data is saved. Set DATABASE_URL to enable PostgreSQL storage.",
    ]);
    expect(() => assertStartupIsReady(onboarding)).not.toThrow(StartupConfigurationError);
  });

  it("uses planning only mode when no charger provider is configured", () => {
    // Requirements: ONB-003, CHG-105
    const onboarding = createStartupOnboarding(loadConfig({
      DATABASE_URL: "postgres://user:password@localhost:5432/energy_manager",
      TIBBER_ACCESS_TOKEN: "token",
      CHARGER_PROVIDER: "",
    }));

    expect(onboarding.planningOnlyMode).toBe(true);
    expect(onboarding.setupMessages).toContain(
      "Planning only mode is active. No charger hardware will be controlled until a charger provider is configured.",
    );
  });

  it("explains when temporary Tesla development data is active", () => {
    const onboarding = createStartupOnboarding(loadConfig({
      TESLA_DEV_ACCESS_TOKEN: "temporary-token",
    }));

    expect(onboarding.setupMessages).toContain(
      "Using temporary Tesla development token for read-only vehicle data.",
    );
    expect(onboarding.setupMessages).not.toContain(
      "Tesla is not connected. Demo vehicle data is used for planning.",
    );
  });
});
