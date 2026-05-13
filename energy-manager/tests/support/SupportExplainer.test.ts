import { describe, expect, it } from "vitest";

import { RuleBasedSupportExplainer, type SupportDiagnostics } from "../../src/support/SupportExplainer.js";

describe("RuleBasedSupportExplainer", () => {
  it("explains missing Tibber setup before lower priority demo hints", () => {
    const advice = new RuleBasedSupportExplainer().explain(createDiagnostics({
      tibberConnected: false,
      teslaOAuthConfigured: false,
      teslaConnected: false,
    }));

    expect(advice.detectedIssue).toBe("Tibber token is missing");
    expect(advice.nextAction).toContain("tibber_access_token");
  });

  it("explains Tesla OAuth configured without a stored connection", () => {
    const advice = new RuleBasedSupportExplainer().explain(createDiagnostics({
      tibberConnected: true,
      teslaOAuthConfigured: true,
      teslaConnected: false,
    }));

    expect(advice.detectedIssue).toBe("Tesla OAuth is configured, but no refresh token exists yet");
    expect(advice.nextAction).toContain("Connect Tesla");
  });

  it("prioritizes callback mismatch errors", () => {
    const advice = new RuleBasedSupportExplainer().explain(createDiagnostics({
      tibberConnected: true,
      teslaOAuthConfigured: true,
      teslaConnected: false,
      lastOAuthError: "Tesla login failed because redirect URI did not match",
    }));

    expect(advice.detectedIssue).toBe("Tesla callback URL may not match Developer Console");
  });
});

function createDiagnostics(overrides: Partial<SupportDiagnostics>): SupportDiagnostics {
  return {
    appVersion: "0.4.0",
    addonVersion: "0.4.0",
    providerStatus: {
      electricityPriceProvider: "mock-electricity-price",
      homeTelemetryProvider: "mock-home-telemetry",
      vehicleStateProvider: "mock-vehicle-state",
      weatherForecastProvider: "mock-weather-forecast",
      chargerProvider: "planning-only",
    },
    tibberConnected: true,
    teslaOAuthConfigured: true,
    teslaConnected: true,
    lastApiError: null,
    lastOAuthError: null,
    lastBuildConfigWarning: null,
    currentFallbackMode: {
      demoMode: true,
      planningOnlyMode: true,
      description: "Demo mode with planning-only charger control.",
    },
    homeAssistant: {
      detectedIngressUrl: "https://[masked].nabu.casa/api/hassio_ingress/[masked]",
      generatedTeslaCallbackUrl: "https://[masked].nabu.casa/api/hassio_ingress/[masked]/api/auth/tesla/callback",
      currentRequestUrl: "https://[masked].nabu.casa/api/hassio_ingress/[masked]/api/support/diagnostics",
    },
    setupNotes: [],
    ...overrides,
  };
}
