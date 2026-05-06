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
});
