// Requirements: PRV-001, PRV-003, PRV-004, CHG-103, CHG-104

import { MockChargerController } from "../../charging/MockChargerController.js";
import type { ChargerController } from "../../charging/ChargerController.js";
import type { ChargerProvider } from "../ChargerProvider.js";

export class MockChargerProvider implements ChargerProvider {
  metadata = {
    id: "mock-charger",
    displayName: "Mock charger",
    kind: "charger" as const,
  };

  configSchema = {
    fields: [],
  };

  capabilities = {
    supportsStartStop: true,
    supportsPowerLimit: false,
    supportsSocReadout: false,
  };

  async createController(): Promise<ChargerController> {
    return new MockChargerController();
  }
}
