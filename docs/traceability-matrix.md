# Traceability Matrix

## Purpose

This matrix maps requirements to planned or implemented code areas.

Status values are defined in [requirements-traceability.md](requirements-traceability.md).

## Product and Configuration

| Requirement | Code Area | Tests | Status |
| --- | --- | --- | --- |
| `PRD-001` | `package.json`, `tsconfig.json`, `src/app/server.ts` | project scripts | planned |
| `PRD-002` | `src/charging`, `src/web` | optimizer and route tests | planned |
| `PRD-003` | `src/charging/MockChargerController.ts` | charger mock tests | planned |
| `PRD-004` | `src/charging/ChargingOptimizer.ts` | optimizer tests | planned |
| `PRD-005` | `src/app/config.ts`, `src/web/routes.ts` | config tests | planned |
| `PRD-006` | `src/charging/MockChargerController.ts`, mock data fixtures | local smoke test | planned |
| `CFG-001` | `src/app/config.ts` | config tests | planned |
| `CFG-002` | `src/app/config.ts`, `src/db/client.ts` | config tests | planned |
| `CFG-003` | `src/app/config.ts`, `src/tibber/TibberClient.ts` | config tests | planned |
| `CFG-004` | `src/app/config.ts`, `src/tibber` | config tests | planned |
| `CFG-005` | `src/app/config.ts`, `src/app/server.ts` | config tests | planned |
| `CFG-006` | `src/app/config.ts` | config tests | planned |
| `CFG-007` | `.gitignore`, `.env.example`, docs | review | planned |
| `CFG-008` | `.env.example` | review | planned |

## Tibber and Persistence

| Requirement | Code Area | Tests | Status |
| --- | --- | --- | --- |
| `TIB-001` | `src/tibber/TibberClient.ts` | Tibber client mock tests | planned |
| `TIB-002` | `src/tibber/TibberClient.ts` | Tibber client mock tests | planned |
| `TIB-003` | `src/tibber/TibberPriceService.ts` | price mapping tests | planned |
| `TIB-004` | `src/tibber/TibberPriceService.ts` | price service tests | planned |
| `TIB-005` | `src/tibber/TibberPriceService.ts` | price mapping tests | planned |
| `TIB-006` | `src/tibber/TibberClient.ts`, `src/tibber/TibberPriceService.ts` | unit tests | planned |
| `TIB-007` | `src/tibber/TibberClient.ts` | error tests | planned |
| `TIB-008` | `src/tibber/TibberPriceService.ts` | mapping tests | planned |
| `DB-001` | `migrations`, `src/db/schema.ts` | migration verification | planned |
| `DB-002` | `migrations`, `src/db/schema.ts` | repository tests | planned |
| `DB-003` | `migrations`, `src/db/schema.ts` | repository tests | planned |
| `DB-004` | `src/db/repositories/PriceRepository.ts` | repository tests | planned |
| `DB-005` | `migrations`, `src/db/schema.ts` | migration verification | planned |
| `DB-006` | `migrations` | migration verification | planned |
| `DB-007` | `src/db/repositories/PriceRepository.ts` | repository tests | planned |
| `DB-008` | `src/db/repositories/PriceRepository.ts` | repository tests | planned |

## Provider Extensibility

| Requirement | Code Area | Tests | Status |
| --- | --- | --- | --- |
| `PRV-001` | `src/providers`, `docs/providers/provider-specification.md` | provider tests | implemented |
| `PRV-002` | `src/providers/ElectricityPriceProvider.ts` | provider tests | implemented |
| `PRV-003` | `src/providers/HomeTelemetryProvider.ts`, `src/providers/ChargerProvider.ts` | provider tests | implemented |
| `PRV-004` | `src/providers/providerTypes.ts`, provider implementations | mapping tests | implemented |
| `PRV-005` | `src/providers/ProviderRegistry.ts` | `tests/providers/ProviderRegistry.test.ts` | implemented |
| `PRV-006` | `src/providers/providerTypes.ts` | `tests/providers/ProviderRegistry.test.ts` | implemented |
| `PRV-007` | `src/providers/ElectricityPriceProvider.ts`, `src/charging/ChargingOptimizer.ts` | review | implemented |
| `PRV-008` | `src/providers/ChargerProvider.ts`, `src/charging/ChargingOptimizer.ts` | review | implemented |
| `PRV-009` | `docs/providers/provider-specification.md` | review | implemented |

## Telemetry and Charging

| Requirement | Code Area | Tests | Status |
| --- | --- | --- | --- |
| `TEL-001` | `src/tibber/TibberTelemetryService.ts` | telemetry mapping tests | planned |
| `TEL-002` | `src/tibber/TibberTelemetryService.ts` | telemetry mapping tests | planned |
| `TEL-003` | `src/tibber/TibberTelemetryService.ts`, app services | integration/service tests | planned |
| `TEL-004` | `src/charging/ChargingOptimizer.ts` | optimizer tests | planned |
| `TEL-005` | `src/charging/types.ts` | type-level review | planned |
| `TEL-006` | `src/charging/types.ts`, telemetry types | type-level review | planned |
| `CHG-001` | `src/charging/types.ts` | validation tests | planned |
| `CHG-002` | `src/charging/types.ts` | validation tests | planned |
| `CHG-003` | `src/charging/types.ts` | validation tests | planned |
| `CHG-004` | `src/charging/types.ts` | validation tests | planned |
| `CHG-005` | `src/charging/types.ts` | validation tests | planned |
| `CHG-006` | `src/charging/types.ts` | validation tests | planned |
| `CHG-007` | `src/charging/types.ts` | validation tests | planned |
| `CHG-008` | `src/charging/types.ts` | validation tests | planned |
| `CHG-009` | `src/charging/types.ts` | type-level review | planned |
| `CHG-010` | `src/charging/types.ts` | type-level review | planned |
| `CHG-011` | `src/charging/ChargingOptimizer.ts` | optimizer tests | planned |
| `CHG-012` | `src/charging` validation module | validation tests | planned |
| `CHG-101` | `src/charging/ChargerController.ts` | charger tests | planned |
| `CHG-102` | `src/charging/ChargerController.ts` | review | planned |
| `CHG-103` | `src/charging/MockChargerController.ts` | charger tests | planned |
| `CHG-104` | `src/charging/MockChargerController.ts` | charger tests | planned |
| `CHG-105` | absence of production controller | review | planned |

## Optimization

| Requirement | Code Area | Tests | Status |
| --- | --- | --- | --- |
| `OPT-001` | `src/charging/ChargingOptimizer.ts` | `tests/charging/ChargingOptimizer.test.ts` | planned |
| `OPT-002` | `src/charging/ChargingOptimizer.ts` | `tests/charging/ChargingOptimizer.test.ts` | planned |
| `OPT-003` | `src/charging/ChargingOptimizer.ts` | `tests/charging/ChargingOptimizer.test.ts` | planned |
| `OPT-004` | `src/charging/ChargingOptimizer.ts` | `tests/charging/ChargingOptimizer.test.ts` | planned |
| `OPT-005` | `src/charging/ChargingOptimizer.ts` | `tests/charging/ChargingOptimizer.test.ts` | planned |
| `OPT-006` | `src/charging/ChargingOptimizer.ts` | `tests/charging/ChargingOptimizer.test.ts` | planned |
| `OPT-007` | `src/charging/ChargingOptimizer.ts` | `tests/charging/ChargingOptimizer.test.ts` | planned |
| `OPT-008` | `src/charging/ChargingOptimizer.ts` | `tests/charging/ChargingOptimizer.test.ts` | planned |
| `OPT-009` | `src/charging/ChargingOptimizer.ts` | `tests/charging/ChargingOptimizer.test.ts` | planned |
| `OPT-010` | `src/charging/ChargingOptimizer.ts` | `tests/charging/ChargingOptimizer.test.ts` | planned |
| `OPT-011` | `src/charging/types.ts`, `src/charging/ChargingOptimizer.ts` | optimizer tests | planned |
| `OPT-012` | `src/charging/ChargingOptimizer.ts` | optimizer tests | planned |
| `OPT-013` | `src/charging/ChargingOptimizer.ts` | optimizer tests | planned |
| `OPT-014` | `src/charging/ChargingOptimizer.ts` | review | planned |

## Web, Tests, Operations, Architecture

| Requirement | Code Area | Tests | Status |
| --- | --- | --- | --- |
| `WEB-001` | `src/web/routes.ts`, `src/web/public` | route smoke test | planned |
| `WEB-002` | `src/web/routes.ts`, UI template | route/UI test | planned |
| `WEB-003` | `src/web/public/app.js` | route/UI test | planned |
| `WEB-004` | `src/web/routes.ts`, UI template | route/UI test | planned |
| `WEB-005` | `src/web/routes.ts`, UI template | route/UI test | planned |
| `WEB-006` | `src/web/routes.ts`, UI template | route/UI test | planned |
| `WEB-007` | `src/web/routes.ts`, fixtures | smoke test | planned |
| `WEB-008` | `src/web/routes.ts` | route test | planned |
| `WEB-009` | `src/web/routes.ts`, app services | review | planned |
| `WEB-010` | `src/web/public/app.js`, UI template | review | planned |
| `TST-001` | `tests/charging/ChargingOptimizer.test.ts` | test script | planned |
| `TST-002` | `tests/charging/ChargingOptimizer.test.ts` | test script | planned |
| `TST-003` | `tests/charging/ChargingOptimizer.test.ts` | test script | planned |
| `TST-004` | `tests/charging/ChargingOptimizer.test.ts` | test script | planned |
| `TST-005` | `tests/charging/ChargingOptimizer.test.ts` | test script | planned |
| `TST-006` | `tests/charging/ChargingOptimizer.test.ts` | test script | planned |
| `TST-007` | `tests/charging/ChargingOptimizer.test.ts` | test script | planned |
| `TST-008` | `tests/charging/ChargingOptimizer.test.ts` | test script | planned |
| `TST-009` | `tests/charging/ChargingOptimizer.test.ts` | test script | planned |
| `TST-010` | `package.json` | local verification | planned |
| `OPS-001` | `src/app/server.ts`, logging helper | smoke test | planned |
| `OPS-002` | logging helper, config errors | unit tests/review | planned |
| `OPS-003` | `src/db/client.ts`, app services | integration test/manual | planned |
| `OPS-004` | `src/tibber/TibberClient.ts` | mock test/manual | planned |
| `OPS-005` | `src/web/routes.ts`, mock services | smoke test | planned |
| `OPS-006` | `src/charging/types.ts`, API boundaries | unit tests/review | planned |
| `OPS-007` | `src/charging/ChargingOptimizer.ts` | optimizer tests | planned |
| `ARC-001` | `src/charging`, `src/web` | review | planned |
| `ARC-002` | `src/charging`, `src/tibber` | review | planned |
| `ARC-003` | `src/charging`, `src/db` | review | planned |
| `ARC-004` | `src/app/server.ts` | review | planned |
| `ARC-005` | `src/charging/types.ts` | review | planned |
| `ARC-006` | `src/tibber` mapping layer | unit tests/review | planned |
| `ARC-007` | all source files | review | planned |
| `ARC-008` | all test files | review | planned |
| `HA-001` | `config.yaml`, `docs/home-assistant/addon-decision.md` | review | implemented |
| `HA-002` | `config.yaml`, `translations/en.yaml` | review | implemented |
| `HA-003` | `Dockerfile` | review | implemented |
| `HA-004` | `run.sh` | review | implemented |
| `HA-005` | `run.sh` | review | implemented |
| `HA-006` | `config.yaml` | review | implemented |
| `HA-007` | `config.yaml` | review | implemented |
| `HA-008` | `config.yaml` | future integration tests | planned |

## Out-of-Scope Requirements

| Requirement | Code Area | Tests | Status |
| --- | --- | --- | --- |
| `PRD-101` | no production charger implementation | review | out-of-scope |
| `PRD-102` | no auth module | review | out-of-scope |
| `PRD-103` | single-home assumptions | review | out-of-scope |
| `PRD-104` | single-vehicle assumptions | review | out-of-scope |
| `PRD-105` | no degradation model | review | out-of-scope |
| `PRD-106` | Tibber total price only | review | out-of-scope |
| `PRD-107` | no forecast module | review | out-of-scope |
