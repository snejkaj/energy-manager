# Traceability Matrix

## Purpose

This matrix maps requirements to planned or implemented code areas.

Status values are defined in [requirements-traceability.md](requirements-traceability.md).

## Product and Configuration

| Requirement | Code Area | Tests | Status |
| --- | --- | --- | --- |
| `PRD-001` | `package.json`, `tsconfig.json`, `src/app/server.ts` | project scripts | planned |
| `PRD-000` | product design, onboarding, defaults | UX review | planned |
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
| `ONB-001` | `src/app/onboarding.ts`, `src/app/server.ts`, `.env.example`, `config.yaml`, `run.sh`, `README.md` | `tests/app/onboarding.test.ts` | implemented |
| `ONB-002` | `src/app/onboarding.ts`, `.env.example`, `config.yaml`, `README.md` | `tests/app/onboarding.test.ts` | implemented |
| `ONB-003` | `src/app/onboarding.ts`, `src/app/server.ts`, `.env.example`, `config.yaml`, `README.md` | `tests/app/onboarding.test.ts` | implemented |
| `ONB-004` | `README.md`, `run.sh`, `config.yaml`, `.env.example` | documentation review | implemented |
| `AUTH-001` | `src/app/server.ts` | UI smoke review | implemented |
| `AUTH-002` | `src/app/server.ts` | UI smoke review | implemented |
| `AUTH-003` | `src/app/auth/ProviderAuthService.ts` | `tests/app/ProviderAuthService.test.ts` | implemented |
| `AUTH-004` | `src/app/auth/ProviderAuthService.ts`, `src/app/server.ts` | `tests/app/ProviderAuthService.test.ts` | implemented |
| `AUTH-005` | `src/app/auth/ProviderAuthService.ts` | `tests/app/ProviderAuthService.test.ts` | implemented |
| `AUTH-006` | `src/app/auth/ProviderAuthService.ts` | unit tests/review | implemented |
| `AUTH-007` | `src/app/auth/ProviderAuthService.ts`, `src/app/server.ts` | `tests/app/ProviderAuthService.test.ts` | implemented |
| `AUTH-008` | `src/app/onboarding.ts`, `src/app/server.ts` | onboarding/API tests | implemented |

## Core Product Principles

| Requirement | Code Area | Tests | Status |
| --- | --- | --- | --- |
| `UX-001` | UI flows, defaults, onboarding | UX review | planned |
| `UX-002` | `src/app/config.ts`, UI defaults | UX/config tests | planned |
| `UX-003` | UI copy, plan explanation service | UI tests/review | planned |
| `SAF-001` | optimizer mode handling, target validation | optimizer tests | planned |
| `SAF-002` | optimizer mode handling | optimizer tests | planned |
| `MOD-001` | user mode configuration and UI | config/UI tests | planned |
| `MOD-002` | user mode UI copy and validation | UI tests/review | planned |
| `MOD-003` | `src/charging/UserModePolicy.ts`, `config.yaml` | `tests/charging/UserModePolicy.test.ts` | implemented |
| `MOD-004` | `migrations/006_user_preferences.sql`, `src/app/config.ts` | config/repository tests | implemented |
| `MOD-005` | `src/charging/UserModePolicy.ts`, `src/app/server.ts` | `tests/charging/UserModePolicy.test.ts` | implemented |
| `MOD-006` | `src/charging/UserModePolicy.ts` | `tests/charging/UserModePolicy.test.ts` | implemented |
| `MOD-007` | `src/charging/UserModePolicy.ts` | `tests/charging/UserModePolicy.test.ts` | implemented |
| `MOD-008` | `src/charging/UserModePolicy.ts` | `tests/charging/UserModePolicy.test.ts` | implemented |
| `UX-004` | planning API, UI plan display | route/UI tests | planned |
| `UX-005` | plan explanation service, UI plan display | route/UI tests | planned |
| `UX-006` | UI layout and CSS | responsive UI tests | planned |
| `UX-007` | mobile UI layout | responsive UI tests | planned |

## Decision Transparency, Emergency, and Prediction

| Requirement | Code Area | Tests | Status |
| --- | --- | --- | --- |
| `UX-101` | plan explanation service | unit/UI tests | planned |
| `UX-102` | optimizer result reasons, plan explanation service | unit/UI tests | planned |
| `UX-103` | plan explanation service | unit/UI tests | planned |
| `UX-104` | planning API response types | route tests | planned |
| `UX-105` | UI detail levels | UI tests/review | planned |
| `FDB-001` | `src/feedback/DailyFeedbackService.ts`, `src/app/server.ts`, `src/db/repositories/DecisionRepository.ts` | `tests/feedback/DailyFeedbackService.test.ts` | implemented |
| `FDB-002` | `src/feedback/DailyFeedbackService.ts`, `src/app/server.ts` | `tests/feedback/DailyFeedbackService.test.ts` | implemented |
| `FDB-003` | `src/feedback/DailyFeedbackService.ts`, `src/app/server.ts`, `src/db/repositories/DecisionRepository.ts` | `tests/feedback/DailyFeedbackService.test.ts` | implemented |
| `FDB-004` | `src/feedback/DailyFeedbackService.ts` | `tests/feedback/DailyFeedbackService.test.ts` | implemented |
| `FDB-005` | `src/feedback/DailyFeedbackService.ts` | `tests/feedback/DailyFeedbackService.test.ts` | implemented |
| `FDB-006` | `src/feedback/DailyFeedbackService.ts` | `tests/feedback/DailyFeedbackService.test.ts` | implemented |
| `FDB-007` | `src/feedback/DailyFeedbackService.ts` | `tests/feedback/DailyFeedbackService.test.ts` | implemented |
| `EMG-001` | emergency override service, UI controls | service/UI tests | planned |
| `EMG-002` | emergency override planning mode | optimizer/service tests | planned |
| `EMG-003` | emergency override validation | optimizer/service tests | planned |
| `EMG-004` | completion time estimator, UI display | unit/UI tests | planned |
| `EMG-005` | responsive UI override control | responsive UI tests | planned |
| `EMG-006` | emergency override state model and UI | service/UI tests | planned |
| `EMG-007` | `src/charging/EmergencyChargingService.ts` | `tests/charging/EmergencyChargingService.test.ts` | implemented |
| `EMG-008` | `src/charging/EmergencyChargingService.ts` | `tests/charging/EmergencyChargingService.test.ts` | implemented |
| `EMG-009` | `src/charging/EmergencyChargingService.ts` | `tests/charging/EmergencyChargingService.test.ts` | implemented |
| `EMG-010` | `src/charging/EmergencyChargingService.ts` | `tests/charging/EmergencyChargingService.test.ts` | implemented |
| `EMG-011` | `src/charging/EmergencyChargingService.ts`, `src/db/repositories/DecisionRepository.ts` | `tests/charging/EmergencyChargingService.test.ts` | implemented |
| `PRE-001` | travel prediction provider/input model | unit tests | planned |
| `PRE-002` | mode validation and prediction guardrails | unit tests | planned |
| `PRE-003` | solar forecast provider/input model | unit tests | planned |
| `PRE-004` | optimizer guardrails for forecast inputs | optimizer tests | planned |
| `PRE-005` | plan explanation service | unit/UI tests | planned |
| `PRE-006` | planning service optional prediction handling | service tests | planned |
| `PRE-007` | `src/providers/openMeteo/OpenMeteoWeatherProvider.ts` | provider tests | implemented |
| `PRE-008` | `src/prediction/SolarPredictionService.ts` | `tests/prediction/SolarPredictionService.test.ts` | implemented |
| `PRE-009` | `src/prediction/SolarPredictionService.ts` | `tests/prediction/SolarPredictionService.test.ts` | implemented |
| `PRE-010` | `src/app/services/SolarPredictionImportService.ts`, `src/db/repositories/ForecastRepository.ts` | service/repository tests | implemented |
| `PRE-011` | `src/app/services/SolarPredictionImportService.ts` | service tests | implemented |
| `PRE-012` | `src/travel/TravelTagging.ts`, `src/travel/TravelEventService.ts` | `tests/travel/TravelTagging.test.ts`, `tests/travel/TravelEventService.test.ts` | implemented |
| `PRE-013` | `src/travel/TravelTagging.ts`, `src/travel/TravelEventService.ts` | `tests/travel/TravelTagging.test.ts` | implemented |
| `PRE-014` | `src/travel/TravelTagging.ts`, `src/travel/TravelEventService.ts` | `tests/travel/TravelTagging.test.ts` | implemented |
| `PRE-015` | `migrations/004_travel_event_system.sql`, `src/travel/travelTypes.ts` | travel tests | implemented |
| `PRE-016` | `src/travel/TravelEventService.ts` | `tests/travel/TravelEventService.test.ts` | implemented |
| `PRE-017` | `migrations/004_travel_event_system.sql`, `src/travel/TravelEventService.ts` | `tests/travel/TravelEventService.test.ts` | implemented |
| `PRE-018` | `src/prediction/DeparturePredictionService.ts`, `migrations/005_trip_prediction_required_soc.sql` | `tests/prediction/DeparturePredictionService.test.ts` | implemented |
| `PRE-019` | `src/prediction/DeparturePredictionService.ts` | `tests/prediction/DeparturePredictionService.test.ts` | implemented |
| `PRE-020` | `src/prediction/DeparturePredictionService.ts` | `tests/prediction/DeparturePredictionService.test.ts` | implemented |
| `PRE-021` | `src/prediction/DeparturePredictionService.ts` | `tests/prediction/DeparturePredictionService.test.ts` | implemented |
| `PRE-022` | `src/prediction/DeparturePredictionService.ts` | `tests/prediction/DeparturePredictionService.test.ts` | implemented |
| `PRE-023` | `src/prediction/DeparturePredictionService.ts` | `tests/prediction/DeparturePredictionService.test.ts` | implemented |
| `PRE-024` | `src/app/services/DeparturePredictionImportService.ts`, `src/db/repositories/TravelRepository.ts` | prediction tests/review | implemented |

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
| `TIB-009` | `src/app/services/TibberImportService.ts`, `src/db/repositories/PriceRepository.ts` | provider/repository tests | implemented |
| `TIB-010` | `src/app/services/TibberImportService.ts`, `src/db/repositories/HomePowerReadingRepository.ts` | provider/repository tests | implemented |
| `TIB-011` | `src/providers/tibber/TibberProvider.ts`, `src/app/services/TibberImportService.ts` | provider tests | implemented |
| `DB-001` | `migrations`, `src/db/schema.ts` | migration verification | planned |
| `DB-002` | `migrations`, `src/db/schema.ts` | repository tests | planned |
| `DB-003` | `migrations`, `src/db/schema.ts` | repository tests | planned |
| `DB-004` | `src/db/repositories/PriceRepository.ts` | repository tests | planned |
| `DB-005` | `migrations`, `src/db/schema.ts` | migration verification | planned |
| `DB-006` | `migrations` | migration verification | planned |
| `DB-007` | `src/db/repositories/PriceRepository.ts` | repository tests | planned |
| `DB-008` | `src/db/repositories/PriceRepository.ts` | repository tests | planned |
| `DB-009` | `migrations/001_initial_schema.sql`, `src/db/repositories/ForecastRepository.ts` | repository tests | implemented |
| `DB-010` | `migrations/001_initial_schema.sql`, `src/db/repositories/ForecastRepository.ts` | repository tests | implemented |
| `DB-011` | `migrations/001_initial_schema.sql`, `src/db/repositories/TravelRepository.ts` | repository tests | implemented |
| `DB-012` | `migrations/001_initial_schema.sql`, `src/db/repositories/TravelRepository.ts` | repository tests | implemented |
| `DB-013` | `migrations/001_initial_schema.sql`, `src/db/repositories/ChargingPlanRepository.ts` | repository tests | implemented |
| `DB-014` | `migrations/001_initial_schema.sql`, `src/db/repositories/DecisionRepository.ts` | repository tests | implemented |
| `DB-015` | `migrations/001_initial_schema.sql`, `src/db/repositories/DecisionRepository.ts` | repository tests | implemented |
| `DB-016` | `migrations/001_initial_schema.sql`, `src/db/repositories/UserModeRepository.ts` | repository tests | implemented |
| `DB-017` | `migrations/001_initial_schema.sql`, `migrations/007_completion_estimate_range.sql`, `src/db/repositories/ChargingPlanRepository.ts`, `src/db/repositories/DecisionRepository.ts` | repository tests | implemented |
| `DB-018` | `migrations/001_initial_schema.sql`, `src/db/repositories/DecisionRepository.ts`, `src/db/repositories/TravelRepository.ts`, `src/db/repositories/ForecastRepository.ts` | repository tests | implemented |
| `DB-019` | `migrations/001_initial_schema.sql`, repository timestamp fields | repository tests/review | implemented |
| `DB-020` | `migrations/002_tibber_price_intervals_and_home_power_readings.sql`, `src/db/repositories/PriceRepository.ts` | repository tests | implemented |
| `DB-021` | `migrations/002_tibber_price_intervals_and_home_power_readings.sql`, `src/db/repositories/HomePowerReadingRepository.ts` | repository tests | implemented |
| `DB-022` | `migrations/006_user_preferences.sql`, `src/db/repositories/UserModeRepository.ts` | repository tests | implemented |

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
| `PRV-010` | `src/providers/WeatherForecastProvider.ts`, `src/providers/openMeteo/OpenMeteoWeatherProvider.ts` | provider tests | implemented |
| `PRV-011` | `src/providers/VehicleStateProvider.ts`, `src/providers/tesla/TeslaProvider.ts` | `tests/providers/TeslaProvider.test.ts` | implemented |
| `TES-001` | `src/providers/tesla/TeslaProvider.ts`, `src/app/server.ts` | `tests/providers/TeslaProvider.test.ts` | implemented |
| `TES-002` | `src/providers/tesla/TeslaProvider.ts`, `src/app/server.ts` | `tests/providers/TeslaProvider.test.ts` | implemented |
| `TES-003` | `src/providers/tesla/TeslaProvider.ts`, `src/app/server.ts` | `tests/providers/TeslaProvider.test.ts` | implemented |
| `TES-004` | `src/providers/tesla/TeslaProvider.ts`, `src/app/server.ts` | `tests/providers/TeslaProvider.test.ts` | implemented |
| `TES-005` | `src/providers/tesla/TeslaProvider.ts`, no vehicle command integration | review | implemented |
| `TES-006` | `src/app/onboarding.ts`, `src/app/server.ts` | onboarding/provider tests | implemented |

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
| `CHG-013` | `src/charging/CompletionEstimator.ts` | `tests/charging/CompletionEstimator.test.ts` | implemented |
| `CHG-014` | `src/charging/CompletionEstimator.ts` | `tests/charging/CompletionEstimator.test.ts` | implemented |
| `CHG-015` | `src/charging/CompletionEstimator.ts` | `tests/charging/CompletionEstimator.test.ts` | implemented |
| `CHG-016` | `src/charging/CompletionEstimator.ts` | `tests/charging/CompletionEstimator.test.ts` | implemented |
| `CHG-017` | `src/charging/CompletionEstimator.ts`, UI/API response models | `tests/charging/CompletionEstimator.test.ts` | implemented |
| `CHG-101` | `src/charging/ChargerController.ts` | `tests/charging/MockChargerController.test.ts` | implemented |
| `CHG-102` | `src/charging/ChargerController.ts` | `tests/charging/MockChargerController.test.ts` | implemented |
| `CHG-103` | `src/charging/MockChargerController.ts` | `tests/charging/MockChargerController.test.ts` | implemented |
| `CHG-104` | `src/charging/MockChargerController.ts` | `tests/charging/MockChargerController.test.ts` | implemented |
| `CHG-105` | absence of production controller | review | implemented |
| `CHG-106` | `src/charging/ChargerController.ts`, `src/charging/MockChargerController.ts` | `tests/charging/MockChargerController.test.ts` | implemented |
| `CHG-107` | `src/charging/MockChargerController.ts` | `tests/charging/MockChargerController.test.ts` | implemented |

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
| `WEB-011` | `src/app/server.ts` | UI review | implemented |
| `WEB-012` | `src/app/server.ts` | UI review | implemented |
| `WEB-013` | `src/app/server.ts` | UI review | implemented |
| `WEB-014` | `src/app/server.ts` | UI review | implemented |
| `WEB-015` | `src/app/server.ts` | UI review | implemented |
| `WEB-016` | `src/app/server.ts` | UI review | implemented |
| `WEB-017` | `src/app/server.ts` | UI review | implemented |
| `WEB-018` | `src/app/server.ts` | UI review | implemented |
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
| `DOC-001` | `README.md` | review | implemented |
| `DOC-002` | `README.md` | review | implemented |
| `DOC-003` | `README.md`, `docs/requirements.md` | review | implemented |
| `DOC-004` | `README.md` | review | implemented |

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
