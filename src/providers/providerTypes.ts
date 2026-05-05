// Requirements: PRV-001, PRV-002, PRV-003, PRV-004, PRV-005, PRV-006, ARC-006

export type ProviderKind = "electricity-price" | "home-telemetry" | "charger" | "weather-forecast";

export interface ProviderMetadata {
  id: string;
  displayName: string;
  kind: ProviderKind;
}

export interface ProviderConfigSchema {
  fields: ProviderConfigField[];
}

export type ProviderConfigFieldType = "string" | "password" | "number" | "boolean";

export interface ProviderConfigField {
  key: string;
  label: string;
  type: ProviderConfigFieldType;
  required: boolean;
  description?: string;
}

export type ProviderConfig = Record<string, string | number | boolean | null | undefined>;

export interface Provider<TCapabilities = unknown> {
  metadata: ProviderMetadata;
  configSchema: ProviderConfigSchema;
  capabilities: TCapabilities;
}

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}
