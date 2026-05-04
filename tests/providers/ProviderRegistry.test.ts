// Requirements: PRV-001, PRV-005, PRV-006, ARC-006

import { describe, expect, it } from "vitest";

import { ProviderRegistry } from "../../src/providers/ProviderRegistry.js";
import { MockChargerProvider } from "../../src/providers/mock/MockChargerProvider.js";
import { MockElectricityPriceProvider } from "../../src/providers/mock/MockElectricityPriceProvider.js";
import { MockHomeTelemetryProvider } from "../../src/providers/mock/MockHomeTelemetryProvider.js";

describe("ProviderRegistry", () => {
  it("registers providers by provider type", () => {
    // Requirements: PRV-001, PRV-005
    const registry = new ProviderRegistry();
    const priceProvider = new MockElectricityPriceProvider([]);
    const telemetryProvider = new MockHomeTelemetryProvider();
    const chargerProvider = new MockChargerProvider();

    registry.registerElectricityPriceProvider(priceProvider);
    registry.registerHomeTelemetryProvider(telemetryProvider);
    registry.registerChargerProvider(chargerProvider);

    expect(registry.getElectricityPriceProvider(priceProvider.metadata.id)).toBe(priceProvider);
    expect(registry.getHomeTelemetryProvider(telemetryProvider.metadata.id)).toBe(telemetryProvider);
    expect(registry.getChargerProvider(chargerProvider.metadata.id)).toBe(chargerProvider);
  });

  it("exposes registered providers for configuration discovery", () => {
    // Requirements: PRV-005, PRV-006
    const registry = new ProviderRegistry();
    registry.registerElectricityPriceProvider(new MockElectricityPriceProvider([]));

    expect(registry.list().electricityPriceProviders).toHaveLength(1);
    expect(registry.list().homeTelemetryProviders).toHaveLength(0);
    expect(registry.list().chargerProviders).toHaveLength(0);
  });
});
