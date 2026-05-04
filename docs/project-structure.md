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
      server.ts
    charging/
      ChargerController.ts
      ChargingOptimizer.ts
      MockChargerController.ts
      types.ts
    providers/
      ChargerProvider.ts
      ElectricityPriceProvider.ts
      HomeTelemetryProvider.ts
      ProviderRegistry.ts
      providerTypes.ts
      mock/
      tibber/
      zaptec/
    db/
      client.ts
      schema.ts
      repositories/
        PriceRepository.ts
    tibber/
      TibberClient.ts
      TibberPriceService.ts
      TibberTelemetryService.ts
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
- `ChargerController.ts`: interface for future charger control.
- `MockChargerController.ts`: local/test implementation.
- `types.ts`: shared charging-domain types.

### `src/providers`

Owns vendor extension points. Tibber, Zaptec, Home Assistant sensors, Nord Pool, MQTT, and other integrations should be implemented as providers here.

- `ElectricityPriceProvider.ts`: common interface for electricity price sources.
- `HomeTelemetryProvider.ts`: common interface for current consumption and production sources.
- `ChargerProvider.ts`: common interface for charger vendors.
- `ProviderRegistry.ts`: registration and lookup for available providers.
- `providerTypes.ts`: shared provider metadata and configuration schema types.

### `src/tibber`

Owns Tibber API integration.

- `TibberClient.ts`: GraphQL transport and authentication.
- `TibberPriceService.ts`: maps Tibber price responses into internal price records.
- `TibberTelemetryService.ts`: maps current consumption/production where available.

### `src/db`

Owns persistence.

- `client.ts`: database connection setup.
- `schema.ts`: database table definitions.
- `repositories/PriceRepository.ts`: idempotent reads and writes for price intervals.

### `src/web`

Owns HTTP routes and UI assets.

- `routes.ts`: web and API routes.
- `public/app.js`: client-side graph rendering.
- `public/app.css`: UI styling.

### `src/app`

Owns composition.

- `config.ts`: environment variable parsing.
- `server.ts`: starts the app and wires services together.

## Environment Variables

```text
DATABASE_URL=postgres://user:password@localhost:5432/energy_manager
TIBBER_ACCESS_TOKEN=
TIBBER_HOME_ID=
PORT=3000
```

## Initial Data Model

### `electricity_prices`

```text
id
starts_at
ends_at
total
currency
price_level
source
source_fetched_at
created_at
updated_at
```

Unique key: `(source, starts_at, ends_at)`.

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
