// Requirements: PRV-001, PRV-003, PRV-004, CHG-101, CHG-102, ARC-006

import type { ChargerController } from "../charging/ChargerController.js";
import type { Provider } from "./providerTypes.js";

export interface ChargerProviderCapabilities {
  supportsStartStop: boolean;
  supportsPowerLimit: boolean;
  supportsSocReadout: boolean;
}

export interface ChargerProvider extends Provider<ChargerProviderCapabilities> {
  createController(): Promise<ChargerController>;
}
