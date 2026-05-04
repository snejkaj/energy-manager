# Smart EV Charging Optimization - Requirements

## Purpose

This document is the source of truth for product, system, and engineering requirements.

Every code section must be traceable to at least one requirement ID from this document. Traceability rules are defined in [requirements-traceability.md](requirements-traceability.md).

## Requirement ID Format

Requirement IDs use this format:

```text
<AREA>-<NUMBER>
```

Areas:

- `PRD`: product scope and product behavior
- `CFG`: configuration
- `TIB`: Tibber integration
- `PRV`: provider extension interfaces
- `DB`: persistence and migrations
- `TEL`: home telemetry
- `CHG`: charging target and charger abstraction
- `OPT`: charging optimization
- `WEB`: web UI and API
- `TST`: testing
- `OPS`: operations, security, and runtime behavior
- `ARC`: architecture and code organization
- `HA`: Home Assistant app packaging and runtime integration
- `DOC`: documentation and README maintenance

## Product Scope

| ID | Requirement |
| --- | --- |
| `PRD-001` | The application must be a TypeScript/Node.js application for smart EV charging optimization. |
| `PRD-002` | The first version must plan and visualize EV charging only. |
| `PRD-003` | The first version must not control a real charger. |
| `PRD-004` | The application must optimize charging from electricity prices, a charging target, and optional home telemetry. |
| `PRD-005` | The initial product must support one home and one EV charging target. |
| `PRD-006` | The system must be usable locally by a developer without access to a real charger. |

## Configuration Requirements

| ID | Requirement |
| --- | --- |
| `CFG-001` | Runtime configuration must be read from environment variables. |
| `CFG-002` | The application must support `DATABASE_URL`. |
| `CFG-003` | The application must support `TIBBER_ACCESS_TOKEN`. |
| `CFG-004` | The application must support `TIBBER_HOME_ID` when a specific Tibber home must be selected. |
| `CFG-005` | The application must support `PORT` for the HTTP server. |
| `CFG-006` | Missing required configuration must produce a clear startup or operation error. |
| `CFG-007` | Secrets must not be committed to the repository. |
| `CFG-008` | The repository must provide an example environment file without real secrets. |

## Tibber Price Requirements

| ID | Requirement |
| --- | --- |
| `TIB-001` | The application must fetch electricity prices from the Tibber GraphQL API. |
| `TIB-002` | The Tibber integration must authenticate with a bearer token. |
| `TIB-003` | The price import must fetch hourly price intervals. |
| `TIB-004` | The price import must fetch enough future price intervals to plan charging before the configured departure time when Tibber provides them. |
| `TIB-005` | The Tibber API mapping must convert external price data into internal price records. |
| `TIB-006` | The Tibber client must keep GraphQL transport concerns separate from price mapping logic. |
| `TIB-007` | Tibber API errors must be surfaced as actionable application errors. |
| `TIB-008` | The application must tolerate missing optional Tibber fields when they are not needed for optimization. |

## Provider Extension Requirements

| ID | Requirement |
| --- | --- |
| `PRV-001` | External electricity suppliers, home telemetry sources, and charger vendors must integrate through provider interfaces. |
| `PRV-002` | Electricity price providers must implement a common `ElectricityPriceProvider` interface. |
| `PRV-003` | Home telemetry and charger integrations must implement common provider interfaces. |
| `PRV-004` | Provider implementations must map vendor-specific API responses to internal domain types before data reaches optimization logic. |
| `PRV-005` | The application must include a provider registry for selecting and listing available providers. |
| `PRV-006` | Providers must expose configuration schema metadata so provider-specific settings can be added without changing domain logic. |
| `PRV-007` | Adding a new electricity supplier must not require changes to `ChargingOptimizer`. |
| `PRV-008` | Adding a new charger vendor must not require changes to `ChargingOptimizer`. |
| `PRV-009` | Provider documentation must describe how to add a new provider implementation. |

## Persistence Requirements

| ID | Requirement |
| --- | --- |
| `DB-001` | The application must store hourly electricity prices in PostgreSQL. |
| `DB-002` | Each stored price interval must include start time, end time, total price, currency, source, source fetch timestamp, creation timestamp, and update timestamp. |
| `DB-003` | Stored price intervals should include Tibber price level when supplied. |
| `DB-004` | Re-importing the same price interval must be idempotent. |
| `DB-005` | Price interval uniqueness must be enforced by source, start time, and end time. |
| `DB-006` | Database schema changes must be tracked through migrations. |
| `DB-007` | Persistence code must expose repository methods rather than leaking raw database access into domain or UI code. |
| `DB-008` | Price reads used by planning must be ordered and filtered by time range. |

## Home Telemetry Requirements

| ID | Requirement |
| --- | --- |
| `TEL-001` | The application should fetch current home consumption when Tibber provides it. |
| `TEL-002` | The application should fetch current home production when Tibber provides it. |
| `TEL-003` | Missing telemetry must not block price import. |
| `TEL-004` | Missing telemetry must not block charging planning. |
| `TEL-005` | Telemetry must be modeled as optional input to planning. |
| `TEL-006` | Telemetry values must use explicit units. |

## Charging Target Requirements

| ID | Requirement |
| --- | --- |
| `CHG-001` | The application must support a desired departure time. |
| `CHG-002` | The application must support current state of charge. |
| `CHG-003` | The application must support minimum target state of charge. |
| `CHG-004` | The application must support maximum allowed state of charge. |
| `CHG-005` | The application must support battery capacity. |
| `CHG-006` | The application must support charger power. |
| `CHG-007` | The application must support charging efficiency. |
| `CHG-008` | State of charge values must be represented internally as percentages from `0` to `100`. |
| `CHG-009` | Energy values must be represented internally as kWh. |
| `CHG-010` | Power values must be represented internally as kW. |
| `CHG-011` | The target state of charge used for planning must not exceed the configured maximum state of charge. |
| `CHG-012` | Invalid charging targets must be rejected with clear validation errors. |

## Charger Controller Requirements

| ID | Requirement |
| --- | --- |
| `CHG-101` | The codebase must define a `ChargerController` interface. |
| `CHG-102` | The `ChargerController` interface must represent future charger operations without binding the application to a real charger vendor. |
| `CHG-103` | The codebase must include a mock `ChargerController` implementation. |
| `CHG-104` | The mock charger implementation must be usable in tests and local development. |
| `CHG-105` | No production charger integration may be implemented in the initial version. |

## Optimization Requirements

| ID | Requirement |
| --- | --- |
| `OPT-001` | The optimizer must calculate the energy required to reach the minimum target state of charge. |
| `OPT-002` | The optimizer must return no charging slots when the current state of charge already satisfies the target. |
| `OPT-003` | The optimizer must only consider price intervals that start before the desired departure time. |
| `OPT-004` | The optimizer must select the cheapest available charging intervals before departure. |
| `OPT-005` | The optimizer must support partial use of the final selected interval when the remaining energy need is less than a full interval can deliver. |
| `OPT-006` | The optimizer must calculate planned energy in kWh. |
| `OPT-007` | The optimizer must calculate estimated cost from selected interval prices. |
| `OPT-008` | The optimizer must calculate estimated state of charge after planned charging. |
| `OPT-009` | The optimizer must not plan charging beyond the configured maximum state of charge. |
| `OPT-010` | If the target cannot be reached before departure, the optimizer must return a clear deficit in kWh and percentage points. |
| `OPT-011` | The optimizer result must include selected slots, total planned energy, estimated cost, resulting state of charge, and feasibility status. |
| `OPT-012` | The optimizer must be deterministic for the same input. |
| `OPT-013` | Ties between intervals with the same price must be resolved by earlier start time first. |
| `OPT-014` | The optimizer must not depend on Tibber, PostgreSQL, HTTP, or UI code. |

## Web UI and API Requirements

| ID | Requirement |
| --- | --- |
| `WEB-001` | The application must expose a simple web UI. |
| `WEB-002` | The UI must show the current electricity price. |
| `WEB-003` | The UI must show a graph of known hourly prices. |
| `WEB-004` | The UI must show the planned charging window or selected charging slots. |
| `WEB-005` | The UI must show estimated charging cost. |
| `WEB-006` | The UI must clearly show when the plan cannot reach the target before departure. |
| `WEB-007` | The UI may use mock planning inputs in the initial version as long as backend interfaces are real. |
| `WEB-008` | The server must expose an API endpoint that returns current planning data for the UI. |
| `WEB-009` | Web route handlers must delegate business behavior to application services or domain modules. |
| `WEB-010` | UI code must not contain charger optimization business rules. |

## Testing Requirements

| ID | Requirement |
| --- | --- |
| `TST-001` | The project must include automated tests for charging-window calculation. |
| `TST-002` | Tests must cover selecting the cheapest intervals before departure. |
| `TST-003` | Tests must cover partial final interval use. |
| `TST-004` | Tests must cover no charging when current state of charge already satisfies the target. |
| `TST-005` | Tests must cover maximum state of charge capping. |
| `TST-006` | Tests must cover infeasible plans and reported deficits. |
| `TST-007` | Tests must cover empty price input. |
| `TST-008` | Tests must cover ignoring price intervals after departure. |
| `TST-009` | Tests must cover deterministic tie-breaking for equal prices. |
| `TST-010` | Tests must be runnable from a single package script. |

## Operations, Security, and Reliability Requirements

| ID | Requirement |
| --- | --- |
| `OPS-001` | The app must log startup and operational errors with enough context for local debugging. |
| `OPS-002` | Logs must not expose Tibber access tokens or database passwords. |
| `OPS-003` | The app must fail clearly when PostgreSQL is unavailable for features that require persistence. |
| `OPS-004` | The app must fail clearly when Tibber is unavailable for features that require fresh Tibber data. |
| `OPS-005` | The application must remain able to render a UI using stored or mock data when live charger control is absent. |
| `OPS-006` | Time handling must use explicit time zones or ISO timestamps at system boundaries. |
| `OPS-007` | Internal date comparisons must be based on instants, not localized display strings. |

## Home Assistant App Requirements

| ID | Requirement |
| --- | --- |
| `HA-001` | The final product must be packaged as a Home Assistant app, formerly known as an add-on. |
| `HA-002` | The Home Assistant app must provide `config.yaml` metadata. |
| `HA-003` | The Home Assistant app must provide a Dockerfile. |
| `HA-004` | The Home Assistant app must provide a startup script. |
| `HA-005` | Home Assistant user options must be mapped into Node.js environment variables at startup. |
| `HA-006` | The Home Assistant app must expose the web UI through ingress. |
| `HA-007` | The Home Assistant app must not require privileged host access for the initial version. |
| `HA-008` | The Home Assistant app may use the Home Assistant Core API through the Supervisor proxy when future Home Assistant state integration is needed. |

## Documentation Requirements

| ID | Requirement |
| --- | --- |
| `DOC-001` | The repository must include a `README.md` that is easy to read and describes the Home Assistant add-on. |
| `DOC-002` | The README must explain the add-on purpose, current status, provider-based design, configuration, development commands, and requirement traceability. |
| `DOC-003` | When updating user-facing behavior, setup, configuration, provider model, or project status, the README must be updated in the same change. |
| `DOC-004` | README content must prefer short sections, plain language, and practical explanations over implementation detail. |

## Architecture Requirements

| ID | Requirement |
| --- | --- |
| `ARC-001` | Domain logic must be isolated from API routes and UI code. |
| `ARC-002` | Domain logic must be isolated from Tibber integration code. |
| `ARC-003` | Domain logic must be isolated from PostgreSQL persistence code. |
| `ARC-004` | Application composition must happen in a dedicated app entrypoint. |
| `ARC-005` | Shared domain types must be defined in the charging module. |
| `ARC-006` | External API response types must not leak into optimizer inputs. |
| `ARC-007` | Code files must include requirement references using the convention in [requirements-traceability.md](requirements-traceability.md). |
| `ARC-008` | Tests must include requirement references for the behavior they verify. |

## Explicitly Out of Scope

| ID | Requirement |
| --- | --- |
| `PRD-101` | The initial version must not implement real charger control. |
| `PRD-102` | The initial version must not implement user authentication. |
| `PRD-103` | The initial version must not implement multi-home support. |
| `PRD-104` | The initial version must not implement multi-vehicle support. |
| `PRD-105` | The initial version must not implement battery degradation modeling. |
| `PRD-106` | The initial version must not implement grid tariff optimization beyond prices available from Tibber. |
| `PRD-107` | The initial version must not implement solar forecasting unless this is added as a later requirement. |

## Open Questions

| ID | Question | Default for Initial Version |
| --- | --- | --- |
| `Q-001` | Should the UI be server-rendered or a separate frontend app? | Server-rendered UI with lightweight client JavaScript. |
| `Q-002` | Which Node.js web framework should be used? | Fastify. |
| `Q-003` | Which database access approach should be used? | Drizzle ORM with SQL migrations. |
| `Q-004` | Should departure time be configured globally or per plan? | Per plan. |
| `Q-005` | Should Tibber live measurement data be stored historically? | No, use as current optional signal only. |
| `Q-006` | Should extra grid fees be configured separately? | No, use Tibber total price for initial version. |
