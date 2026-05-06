# Provider Specification

## Purpose

The application must be easy to extend beyond Tibber and Zaptec.

External systems must be implemented as providers behind stable interfaces. Domain logic, optimization, persistence, and UI code must depend on provider interfaces, not on vendor-specific APIs.

## Provider Types

The initial provider types are:

| Provider Type | Interface | Purpose |
| --- | --- | --- |
| Electricity price | `ElectricityPriceProvider` | Fetches price intervals from Tibber, Nord Pool, local files, Home Assistant sensors, or another price source. |
| Home telemetry | `HomeTelemetryProvider` | Fetches current consumption and production from Tibber, Home Assistant entities, MQTT, or another meter source. |
| Weather forecast | `WeatherForecastProvider` | Fetches hourly weather and solar radiation forecasts from Open-Meteo or another weather source. |
| Charger | `ChargerProvider` | Creates a `ChargerController` for Zaptec, Easee, Wallbox, mock chargers, or other charger systems. |
| Vehicle state | `VehicleStateProvider` | Fetches read-only vehicle state such as SOC, plugged-in state, charging state, and estimated range. |

## Contract Rules

- Provider implementations must map external API responses into internal domain types.
- External API response types must not leak into `src/charging`.
- The optimizer must only receive `PriceInterval`, `ChargingTarget`, and optional `HomeTelemetry`.
- Provider configuration must be described through `ProviderConfigSchema`.
- Provider IDs must be stable and unique.
- Provider implementations must be registered through `ProviderRegistry`.
- Adding a provider should not require changes to `ChargingOptimizer`.
- Weather and solar prediction providers must remain optional inputs to charging decisions.
- Vehicle state providers must be read-only unless a later requirement explicitly adds control.

## Electricity Price Provider

Implement `src/providers/ElectricityPriceProvider.ts`.

Required behavior:

- return prices as `PriceInterval[]`
- use ISO timestamps
- use total price per kWh
- include currency
- map provider-specific price fields internally

Example implementation shape:

```ts
export class ExamplePriceProvider implements ElectricityPriceProvider {
  metadata = {
    id: "example-price",
    displayName: "Example Price Provider",
    kind: "electricity-price" as const,
  };

  configSchema = {
    fields: [
      {
        key: "api_key",
        label: "API key",
        type: "password" as const,
        required: true,
      },
    ],
  };

  capabilities = {
    supportsHistoricalPrices: true,
    supportsFuturePrices: true,
  };

  async getPrices(query: PriceQuery): Promise<PriceInterval[]> {
    // Fetch external API data and map it to PriceInterval[].
    return [];
  }
}
```

## Home Telemetry Provider

Implement `src/providers/HomeTelemetryProvider.ts`.

Required behavior:

- return `HomeTelemetry | null`
- use kW for consumption and production
- return `null` when telemetry is unavailable instead of blocking planning

## Weather Forecast Provider

Implement `src/providers/WeatherForecastProvider.ts`.

Required behavior:

- return hourly `WeatherForecastInterval[]`
- use ISO timestamps
- use UTC at boundaries
- include cloud cover and solar radiation values when available
- return an empty array when no forecast data is available

The first implementation is `OpenMeteoWeatherProvider`.

## Charger Provider

Implement `src/providers/ChargerProvider.ts`.

Required behavior:

- create a `ChargerController`
- expose capabilities such as start/stop support, power limit support, and SOC readout support
- avoid vendor-specific types outside the provider implementation

The initial version must keep production charger control disabled until real control is explicitly added as a later requirement.

## Vehicle State Provider

Implement `src/providers/VehicleStateProvider.ts`.

Required behavior:

- return `VehicleState | null`
- include SOC, plugged-in state, charging state, and estimated range when available
- handle missing auth or unavailable vehicles gracefully
- never call charger or vehicle command endpoints
- avoid vendor-specific types outside the provider implementation

## Suggested Folder Layout

```text
src/providers/
  ElectricityPriceProvider.ts
  HomeTelemetryProvider.ts
  WeatherForecastProvider.ts
  ChargerProvider.ts
  VehicleStateProvider.ts
  ProviderRegistry.ts
  providerTypes.ts
  mock/
  openMeteo/
  tibber/
  tesla/
  zaptec/
  homeAssistant/
  nordPool/
```

## Adding a New Provider

1. Create a folder under `src/providers/<provider-id>/`.
2. Implement the relevant provider interface.
3. Map external API responses to internal domain types.
4. Add tests for mapping and configuration validation.
5. Register the provider in application composition.
6. Add provider-specific configuration options if needed.
7. Update [traceability-matrix.md](../traceability-matrix.md).

## Requirement References

Provider implementations should include these requirement references where applicable:

- `PRV-001`: provider architecture
- `PRV-002`: electricity price providers
- `PRV-003`: home telemetry and charger providers
- `PRV-004`: external-to-internal mapping
- `PRV-005`: provider registry
- `PRV-006`: provider configuration schema
- vendor-specific requirements such as `TIB-*`
