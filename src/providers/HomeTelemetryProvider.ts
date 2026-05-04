// Requirements: PRV-001, PRV-003, PRV-004, TEL-005, TEL-006, ARC-006

import type { HomeTelemetry } from "../charging/types.js";
import type { Provider } from "./providerTypes.js";

export interface HomeTelemetryProviderCapabilities {
  supportsCurrentConsumption: boolean;
  supportsCurrentProduction: boolean;
}

export interface HomeTelemetryProvider
  extends Provider<HomeTelemetryProviderCapabilities> {
  getCurrentTelemetry(): Promise<HomeTelemetry | null>;
}
