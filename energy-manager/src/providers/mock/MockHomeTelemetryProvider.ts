// Requirements: PRV-001, PRV-003, PRV-004, TEL-003, TEL-004

import type { HomeTelemetry } from "../../charging/types.js";
import type { HomeTelemetryProvider } from "../HomeTelemetryProvider.js";

export class MockHomeTelemetryProvider implements HomeTelemetryProvider {
  metadata = {
    id: "mock-home-telemetry",
    displayName: "Mock home telemetry",
    kind: "home-telemetry" as const,
  };

  configSchema = {
    fields: [],
  };

  capabilities = {
    supportsCurrentConsumption: true,
    supportsCurrentProduction: true,
  };

  constructor(private readonly telemetry: HomeTelemetry | null = null) {}

  async getCurrentTelemetry(): Promise<HomeTelemetry | null> {
    return this.telemetry === null ? null : { ...this.telemetry };
  }
}
