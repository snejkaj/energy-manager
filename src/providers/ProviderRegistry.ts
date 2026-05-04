// Requirements: PRV-001, PRV-005, PRV-006, ARC-001, ARC-006

import type { ChargerProvider } from "./ChargerProvider.js";
import type { ElectricityPriceProvider } from "./ElectricityPriceProvider.js";
import type { HomeTelemetryProvider } from "./HomeTelemetryProvider.js";
import type { ProviderKind } from "./providerTypes.js";

export interface RegisteredProviders {
  electricityPriceProviders: ElectricityPriceProvider[];
  homeTelemetryProviders: HomeTelemetryProvider[];
  chargerProviders: ChargerProvider[];
}

export class ProviderRegistry {
  private readonly electricityPriceProviders = new Map<string, ElectricityPriceProvider>();
  private readonly homeTelemetryProviders = new Map<string, HomeTelemetryProvider>();
  private readonly chargerProviders = new Map<string, ChargerProvider>();

  registerElectricityPriceProvider(provider: ElectricityPriceProvider): void {
    this.assertKind(provider.metadata.kind, "electricity-price");
    this.electricityPriceProviders.set(provider.metadata.id, provider);
  }

  registerHomeTelemetryProvider(provider: HomeTelemetryProvider): void {
    this.assertKind(provider.metadata.kind, "home-telemetry");
    this.homeTelemetryProviders.set(provider.metadata.id, provider);
  }

  registerChargerProvider(provider: ChargerProvider): void {
    this.assertKind(provider.metadata.kind, "charger");
    this.chargerProviders.set(provider.metadata.id, provider);
  }

  getElectricityPriceProvider(id: string): ElectricityPriceProvider | null {
    return this.electricityPriceProviders.get(id) ?? null;
  }

  getHomeTelemetryProvider(id: string): HomeTelemetryProvider | null {
    return this.homeTelemetryProviders.get(id) ?? null;
  }

  getChargerProvider(id: string): ChargerProvider | null {
    return this.chargerProviders.get(id) ?? null;
  }

  list(): RegisteredProviders {
    return {
      electricityPriceProviders: [...this.electricityPriceProviders.values()],
      homeTelemetryProviders: [...this.homeTelemetryProviders.values()],
      chargerProviders: [...this.chargerProviders.values()],
    };
  }

  private assertKind(actual: ProviderKind, expected: ProviderKind): void {
    if (actual !== expected) {
      throw new Error(`Provider kind mismatch. Expected ${expected}, got ${actual}.`);
    }
  }
}
