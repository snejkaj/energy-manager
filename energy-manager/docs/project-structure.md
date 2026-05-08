# Project Structure

This project should be organized around separable domain logic, integrations, persistence, and presentation.

Requirements are tracked in [requirements.md](requirements.md). Code-to-requirement traceability is defined in [requirements-traceability.md](requirements-traceability.md), and planned implementation coverage is tracked in [traceability-matrix.md](traceability-matrix.md).

## Recommended Stack

- Runtime: Node.js
- Language: TypeScript
- Test runner: Vitest
- Web framework: Fastify
- Database: PostgreSQL
- Database access: Drizzle ORM with SQL migrations
- Frontend: server-rendered HTML first, with lightweight client-side JavaScript for the price graph

This keeps the first version small while still leaving room for a richer frontend later.

## Directory Layout

```text
.
  docs/
    requirements.md
    requirements-traceability.md
    traceability-matrix.md
    project-structure.md
  src/
    app/
      config.ts
      onboarding.ts
      server.ts
    charging/
      ChargerController.ts
      ChargingOptimizer.ts
      CompletionEstimator.ts
      EmergencyChargingService.ts
      MockChargerController.ts
      UserModePolicy.ts
      types.ts
    providers/
      ChargerProvider.ts
      ElectricityPriceProvider.ts
      HomeTelemetryProvider.ts
      ProviderRegistry.ts
      VehicleStateProvider.ts
      WeatherForecastProvider.ts
      providerTypes.ts
      mock/
      openMeteo/
      tibber/
      tesla/
      zaptec/
    db/
      DatabaseClient.ts
      PgDatabaseClient.ts
      client.ts
      schema.ts
      repositories/
        ChargingPlanRepository.ts
        DecisionRepository.ts
        ForecastRepository.ts
        HomePowerReadingRepository.ts
        PriceRepository.ts
        TravelRepository.ts
        UserModeRepository.ts
      types/
        persistenceTypes.ts
    prediction/
      DeparturePredictionService.ts
      SolarPredictionService.ts
    feedback/
      DailyFeedbackService.ts
    travel/
      AiTravelInferenceProvider.ts
      TravelEventService.ts
      TravelTagging.ts
      travelTypes.ts
    web/
      routes.ts
      public/
        app.css
        app.js
  tests/
    charging/
      ChargingOptimizer.test.ts
  migrations/
  package.json
  tsconfig.json
  vitest.config.ts
```

## Module Responsibilities

### `src/charging`

Owns core EV charging behavior. This should not depend on Tibber, PostgreSQL, or HTTP.

- `ChargingOptimizer.ts`: calculates cheapest charging slots.
- `CompletionEstimator.ts`: estimates approximate completion time and min/max range from SOC, power, home load, and limits.
- `EmergencyChargingService.ts`: calculates fastest safe "Charge to 100%" plans and decision reasons.
- `ChargerController.ts`: interface for future charger control with start, stop, and current-limit operations.
- `MockChargerController.ts`: local/test implementation with no real hardware integration.
- `UserModePolicy.ts`: adjusts SOC target, buffer, and readiness deadline for safe, balanced, and savings modes.
- `types.ts`: shared charging-domain types.

### `src/providers`

Owns vendor extension points. Tibber, Zaptec, Home Assistant sensors, Nord Pool, MQTT, and other integrations should be implemented as providers here.

- `ElectricityPriceProvider.ts`: common interface for electricity price sources.
- `HomeTelemetryProvider.ts`: common interface for current consumption and production sources.
- `ChargerProvider.ts`: common interface for charger vendors.
- `VehicleStateProvider.ts`: common read-only interface for vehicle SOC, plugged-in state, charging state, and range.
- `WeatherForecastProvider.ts`: common interface for weather forecast providers.
- `ProviderRegistry.ts`: registration and lookup for available providers.
- `providerTypes.ts`: shared provider metadata and configuration schema types.
- `openMeteo/OpenMeteoWeatherProvider.ts`: Open-Meteo weather forecast provider.
- `tibber/TibberClient.ts`: Tibber GraphQL transport and authentication.
- `tibber/TibberProvider.ts`: provider implementations for Tibber price and live telemetry.
- `tibber/TibberQueries.ts`: GraphQL queries used by the Tibber provider.
- `tibber/TibberTypes.ts`: Tibber-specific response types that must not leak into domain logic.
- `tesla/TeslaClient.ts`: Tesla Fleet API read-only HTTP client.
- `tesla/TeslaProvider.ts`: Tesla vehicle state provider for SOC, plugged-in state, charging state, and range.

### `src/db`

Owns persistence.

- `client.ts`: database connection setup.
- `DatabaseClient.ts`: small database abstraction used by repositories.
- `PgDatabaseClient.ts`: PostgreSQL adapter for the database abstraction.
- `schema.ts`: database table definitions.
- `repositories/PriceRepository.ts`: idempotent reads and writes for price intervals.
- `repositories/HomePowerReadingRepository.ts`: idempotent writes and latest reads for consumption/production telemetry.
- `repositories/ForecastRepository.ts`: weather forecasts and solar predictions.
- `repositories/TravelRepository.ts`: calendar/user travel events and AI travel predictions.
- `repositories/ChargingPlanRepository.ts`: charging plans and estimated/actual completion times.
- `repositories/DecisionRepository.ts`: decision reasoning and outcomes for transparency and future ML training.
- `repositories/UserModeRepository.ts`: safe, balanced, and savings modes.
- `user_preferences`: stores selected mode and current mode policy settings.

### `src/web`

Owns HTTP routes and UI assets.

- `routes.ts`: web and API routes.
- `public/app.js`: client-side graph rendering.
- `public/app.css`: UI styling.

### `src/app`

Owns composition.

- `config.ts`: environment variable parsing.
- `onboarding.ts`: startup checks and setup guidance for database, Tibber, and planning-only mode.
- `server.ts`: starts the app and wires services together.
- `services/WeatherForecastImportService.ts`: imports weather forecasts into persistence.
- `services/SolarPredictionImportService.ts`: optional solar prediction import from weather and historical production.
- `services/DeparturePredictionImportService.ts`: stores departure prediction results for future decision use and ML training.

### `src/prediction`

Owns optional prediction behavior that can inform decisions without blocking core charging.

- `SolarPredictionService.ts`: predicts kWh per hour from weather forecast and historical solar production.
- `DeparturePredictionService.ts`: predicts likely departure time, required SOC, and confidence from heuristics.

### `src/feedback`

Owns daily outcome analysis for simple user feedback and future tuning.

- `DailyFeedbackService.ts`: implements `analyzeOutcomes()` for readiness, savings, failures, late charging, wrong prediction, and suggestions.

### `src/travel`

Owns travel signals that can influence future charging targets.

- `TravelTagging.ts`: detects explicit travel input from emoji, keywords, and manual tags.
- `TravelEventService.ts`: stores explicit travel events and optional AI-inferred travel predictions.
- `AiTravelInferenceProvider.ts`: interface for optional AI travel inference.
- `travelTypes.ts`: travel input and inference types.

## Environment Variables

```text
DATABASE_URL=postgres://user:password@localhost:5432/energy_manager
TIBBER_ACCESS_TOKEN=
TIBBER_HOME_ID=
TESLA_CLIENT_ID=
TESLA_CLIENT_SECRET=
TESLA_REDIRECT_URI=
TESLA_VEHICLE_ID=
CHARGER_PROVIDER=planning-only
VEHICLE_STATE_PROVIDER=tesla
PORT=3000
```

## Initial Data Model

### `price_intervals`

```text
id
provider_id
source_home_id
starts_at
ends_at
total
currency
price_level
raw_payload
source_fetched_at
created_at
updated_at
```

Unique key: `(provider_id, source_home_id, starts_at, ends_at)`.

### `home_power_readings`

```text
id
provider_id
source_home_id
measured_at
consumption_kw
production_kw
raw_payload
source_fetched_at
created_at
```

Unique key: `(provider_id, source_home_id, measured_at)`.

## Testing Strategy

Start with focused unit tests for `ChargingOptimizer`.

Important cases:

- selects cheapest slots before departure
- supports partial final slot
- returns zero charging when current SOC already meets target
- caps charging at maximum SOC
- reports deficit when there is not enough time before departure
- handles empty price input
- ignores price slots after departure

Integration tests for Tibber and PostgreSQL can wait until the domain behavior is stable.
