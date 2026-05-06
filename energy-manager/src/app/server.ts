// Requirements: PRD-002, PRD-006, WEB-001, WEB-004, WEB-005, WEB-006, WEB-007, WEB-008, WEB-009, WEB-011, WEB-012, WEB-013, WEB-014, WEB-015, WEB-016, WEB-017, WEB-018, FDB-001, FDB-002, FDB-003, ONB-001, ONB-002, ONB-003, ONB-004, UX-003, UX-004, UX-005, UX-006, UX-007, UX-101, UX-105, EMG-001, OPS-001, OPS-005, ARC-004

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { calculateChargingPlan } from "../charging/ChargingOptimizer.js";
import { EmergencyChargingService } from "../charging/EmergencyChargingService.js";
import { estimateCompletionForTarget } from "../charging/CompletionEstimator.js";
import type { ChargingPlan, ChargingTarget, HomeTelemetry, PriceInterval } from "../charging/types.js";
import { applyUserModePolicy } from "../charging/UserModePolicy.js";
import type { DecisionOutcomeRecord } from "../db/types/persistenceTypes.js";
import { analyzeOutcomes } from "../feedback/DailyFeedbackService.js";
import { MockChargerProvider } from "../providers/mock/MockChargerProvider.js";
import { MockElectricityPriceProvider } from "../providers/mock/MockElectricityPriceProvider.js";
import { ProviderRegistry } from "../providers/ProviderRegistry.js";
import { OpenMeteoWeatherProvider } from "../providers/openMeteo/OpenMeteoWeatherProvider.js";
import { TeslaClient } from "../providers/tesla/TeslaClient.js";
import { TeslaVehicleStateProvider } from "../providers/tesla/TeslaProvider.js";
import { TibberGraphQLClient } from "../providers/tibber/TibberClient.js";
import { TibberHomeTelemetryProvider, TibberPriceProvider } from "../providers/tibber/TibberProvider.js";
import type { TibberHomeSelectionInfo } from "../providers/tibber/TibberTypes.js";
import type { VehicleState } from "../providers/VehicleStateProvider.js";
import { ProviderAuthService, type AuthProviderId } from "./auth/ProviderAuthService.js";
import { loadConfig, type AppConfig } from "./config.js";
import { logger } from "./logger.js";
import { assertStartupIsReady, createStartupOnboarding, type StartupOnboarding } from "./onboarding.js";

const prices: PriceInterval[] = [
  price("2026-05-05T00:00:00.000Z", 1.54),
  price("2026-05-05T01:00:00.000Z", 1.21),
  price("2026-05-05T02:00:00.000Z", 0.94),
  price("2026-05-05T03:00:00.000Z", 0.88),
  price("2026-05-05T04:00:00.000Z", 1.05),
  price("2026-05-05T05:00:00.000Z", 1.44),
  price("2026-05-05T06:00:00.000Z", 2.1),
  price("2026-05-05T07:00:00.000Z", 2.42),
];

const demoReasons = ["Cheap electricity", "Typical weekday trip", "Solar expected tomorrow"] as const;

const currentDir = dirname(fileURLToPath(import.meta.url));
const staticDirectories = [join(currentDir, "../../public"), join(process.cwd(), "public")] as const;

const dailyOutcomes: DecisionOutcomeRecord[] = [
  {
    id: "demo-outcome",
    decisionLogId: "demo-decision",
    chargingPlanId: "demo-plan",
    outcome: "success",
    cause: "completed",
    estimatedCompletionTime: "2026-05-05T07:20:00.000Z",
    estimatedCompletionTimeMin: "2026-05-05T07:10:00.000Z",
    estimatedCompletionTimeMax: "2026-05-05T07:35:00.000Z",
    actualCompletionTime: "2026-05-05T07:22:00.000Z",
    completionDeltaSeconds: 120,
    estimatedSocPercent: 70,
    actualSocPercent: 70,
    estimatedCost: 44.5,
    actualCost: 32.2,
    trainingLabel: "ready",
    featuresSnapshot: {},
    outcomeMetadata: {},
    recordedAt: "2026-05-05T08:00:00.000Z",
  },
];

export function startServer(): void {
  const config = loadConfig();
  const onboarding = createStartupOnboarding(config);
  logStartupDiagnostics(config);
  logIntegrationSetupStatus(config);
  logStartupOnboarding([...onboarding.setupWarnings, ...onboarding.setupMessages]);
  assertStartupIsReady(onboarding);

  const authService = new ProviderAuthService(config);
  let emergencyOverrideActive = false;

  const server = createServer((request, response) => {
    startRequestLogging(request, response);
    const path = new URL(request.url ?? "/", "http://localhost").pathname;

    if (request.method === "GET" && path === "/health") {
      writeJson(response, 200, {
        ok: true,
        demoMode: onboarding.demoMode,
        planningOnlyMode: onboarding.planningOnlyMode,
      });
      return;
    }

    if (request.method === "GET" && path === "/api/status") {
      writeJson(response, 200, createStatusResponse(config, onboarding, emergencyOverrideActive));
      return;
    }

    if (request.method === "GET" && path === "/api/connections") {
      writeJson(response, 200, {
        demoMode: onboarding.demoMode,
        warning: onboarding.demoMode ? "Demo mode uses temporary in-memory tokens only." : null,
        connections: authService.getConnectionStatuses(),
      });
      return;
    }

    if (request.method === "GET" && path === "/app.js") {
      const url = new URL(request.url ?? "/", "http://localhost");
      logAppJsRequest(request, response, url);
      writeStaticAsset(response, "app.js", "application/javascript");
      return;
    }

    if (request.method === "GET" && path === "/debug/static") {
      writeJson(response, 200, createStaticDiagnostics());
      return;
    }

    if (request.method === "GET" && path === "/debug/app-js") {
      writeJson(response, 200, createAppJsDiagnostics());
      return;
    }

    if (request.method === "GET" && path === "/debug/config") {
      writeJson(response, 200, createConfigDiagnostics(config));
      return;
    }

    if (request.method === "GET" && path === "/debug/html") {
      writeText(response, 200, renderHtml());
      return;
    }

    if (request.method === "POST" && (path === "/api/auth/tibber/start" || path === "/api/auth/tesla/start")) {
      writeJson(response, 200, authService.startAuth(getProviderFromPath(path)));
      return;
    }

    if (request.method === "GET" && (path === "/api/auth/tibber/callback" || path === "/api/auth/tesla/callback")) {
      const url = new URL(request.url ?? "/", "http://localhost");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (code === null || state === null) {
        writeHtml(response, 400, "Connection failed. Missing OAuth code or state.");
        return;
      }

      void authService
        .handleCallback(getProviderFromPath(path), code, state)
        .then(() => writeHtml(response, 200, "Connected. You can close this window and return to the add-on."))
        .catch((error: unknown) =>
          writeHtml(response, 400, error instanceof Error ? error.message : "Connection failed."),
        );
      return;
    }

    if (
      request.method === "POST" &&
      (path === "/api/auth/tibber/disconnect" || path === "/api/auth/tesla/disconnect")
    ) {
      writeJson(response, 200, authService.disconnect(getProviderFromPath(path)));
      return;
    }

    if (request.method === "GET" && path === "/api/plan") {
      logger.info("HTTP", "GET /api/plan requested");
      void createPlanResponse(config, onboarding, createProviderRegistry(config, authService), emergencyOverrideActive)
        .then((planResponse) => writeJson(response, 200, planResponse))
        .catch((error: unknown) =>
          writeJson(response, 500, {
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        );
      return;
    }

    if (path === "/api/emergency-charge") {
      if (request.method !== "POST") {
        writeJson(response, 405, { error: "Use POST for emergency charging." });
        return;
      }

      emergencyOverrideActive = true;
      void createPlanResponse(config, onboarding, createProviderRegistry(config, authService), emergencyOverrideActive)
        .then((planResponse) => writeJson(response, 200, planResponse))
        .catch((error: unknown) =>
          writeJson(response, 500, {
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        );
      return;
    }

    logger.info("Server", `HTML catch-all handled ${request.method ?? "UNKNOWN"} ${path}`);
    logger.info("Server", "Rendering main HTML with app.js script tag");
    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(renderHtml());
  });

  server.listen(config.port, () => {
    logger.info("Server", `Smart EV Charging Optimizer listening on port ${config.port}`);
  });
}

// Requirements: PRV-001, PRV-002, PRV-005, WEB-009
function createProviderRegistry(
  config: ReturnType<typeof loadConfig>,
  authService?: ProviderAuthService,
): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.registerElectricityPriceProvider(new MockElectricityPriceProvider(prices));

  if (config.chargerProvider === "mock-charger") {
    registry.registerChargerProvider(new MockChargerProvider());
  }

  const tibberAccessToken = authService?.getAccessToken("tibber") ?? config.tibberAccessToken;
  if (tibberAccessToken !== null) {
    const tibberClient = new TibberGraphQLClient(tibberAccessToken);
    const selection = { homeId: config.tibberHomeId };
    registry.registerElectricityPriceProvider(new TibberPriceProvider(tibberClient, selection));
    registry.registerHomeTelemetryProvider(new TibberHomeTelemetryProvider(tibberClient, selection));
  }

  const teslaAccessToken = authService?.getAccessToken("tesla") ?? config.teslaAccessToken;
  if (teslaAccessToken !== null) {
    registry.registerVehicleStateProvider(
      new TeslaVehicleStateProvider(new TeslaClient(teslaAccessToken), { vehicleId: config.teslaVehicleId }),
    );
  }

  if (config.weatherLatitude !== null && config.weatherLongitude !== null) {
    registry.registerWeatherForecastProvider(
      new OpenMeteoWeatherProvider({
        latitude: config.weatherLatitude,
        longitude: config.weatherLongitude,
        panelTiltDegrees: config.solarPanelTiltDegrees,
        panelAzimuthDegrees: config.solarPanelAzimuthDegrees,
      }),
    );
  }

  return registry;
}

interface PlanResponse {
  currentPrice: PriceInterval;
  prices: PriceInterval[];
  userMode: ReturnType<typeof applyUserModePolicy>["policy"];
  planReasons: string[];
  nextTrip: {
    title: string;
    startsAt: string;
  };
  chargingWindow: {
    startsAt: string | null;
    endsAt: string | null;
  };
  completion: ReturnType<typeof estimateCompletionForTarget>;
  dailyFeedback: ReturnType<typeof analyzeOutcomes>;
  onboarding: ReturnType<typeof createOnboardingResponse>;
  status: ReturnType<typeof createStatusResponse>;
  vehicleState: VehicleState | null;
  pricingContext: PricingContext;
  tibber: TibberStatus;
  providerWarnings: string[];
  emergencyOverrideActive: boolean;
  plan: ChargingPlan;
}

interface PricingContext {
  currentPrice: number | null;
  currency: string | null;
  source: string;
  description: string;
}

interface TibberStatus {
  connected: boolean;
  status: string;
  lastSuccessfulFetch: string | null;
  multipleHomesFound: boolean;
  selectedHomeName: string | null;
  availableHomeNames: string[];
  manualSelectionConfigured: boolean;
}

async function createPlanResponse(
  config: AppConfig,
  onboarding: StartupOnboarding,
  registry: ProviderRegistry,
  emergencyOverrideActive: boolean,
): Promise<PlanResponse> {
  const priceProvider = registry.getElectricityPriceProvider(config.electricityPriceProvider);
  if (priceProvider === null) {
    return createDemoPlanResponse(config, onboarding, emergencyOverrideActive);
  }

  if (config.tibberAccessToken === null) {
    return createDemoPlanResponse(config, onboarding, emergencyOverrideActive);
  }

  const target = createChargingTarget(config);
  const providerWarnings: string[] = [];
  const vehicleState = await getVehicleState(config, registry, providerWarnings);
  const homeTelemetry = await getHomeTelemetry(config, registry, providerWarnings);
  const priceQuery = createPriceQuery(target);
  let providerPrices: PriceInterval[];
  try {
    providerPrices = await priceProvider.getPrices(priceQuery);
  } catch (error) {
    logger.error("Tibber", `Tibber price data could not be loaded: ${error instanceof Error ? error.message : "Unknown error"}`);
    const demoResponse = createDemoPlanResponse(config, onboarding, emergencyOverrideActive);
    return {
      ...demoResponse,
      providerWarnings: [
        `Tibber price data could not be loaded: ${error instanceof Error ? error.message : "Unknown error"}`,
        ...demoResponse.providerWarnings,
      ],
    };
  }
  if (providerPrices.length === 0) {
    providerWarnings.push("Tibber returned no upcoming price intervals; demo prices are shown.");
    const demoResponse = createDemoPlanResponse(config, onboarding, emergencyOverrideActive);
    return {
      ...demoResponse,
      providerWarnings,
    };
  }
  const currentPrice = await getCurrentPrice(priceProvider, providerPrices, providerWarnings);
  const liveTarget = applyVehicleStateToTarget(target, vehicleState);
  const modeResult = applyUserModePolicy({
    target: liveTarget,
    mode: config.userMode,
  });
  const normalPlan = calculateChargingPlan(providerPrices, modeResult.target);
  const emergencyPlan = emergencyOverrideActive
    ? new EmergencyChargingService().calculate({
        now: providerPrices[0]?.startsAt ?? "2026-05-05T00:00:00.000Z",
        target: liveTarget,
        prices: providerPrices,
      })
    : null;
  const plan = emergencyPlan === null ? normalPlan : emergencyPlan;
  const planReasons =
    emergencyPlan === null
      ? modeResult.reason.slice(0, 4)
      : [...emergencyPlan.reason, "planning_only_no_hardware_control"].slice(0, 4);
  const completion =
    emergencyPlan === null
      ? estimateCompletionForTarget(
          plan.slots[0]?.startsAt ?? providerPrices[0]?.startsAt ?? "2026-05-05T00:00:00.000Z",
          modeResult.target,
          undefined,
          homeTelemetry,
        )
      : {
          approximate: true as const,
          estimatedCompletionTime: emergencyPlan.estimatedCompletionTime,
          estimatedCompletionTimeMin: emergencyPlan.estimatedCompletionTimeMin,
          estimatedCompletionTimeMax: emergencyPlan.estimatedCompletionTimeMax,
          remainingEnergyKwh: emergencyPlan.plannedEnergyKwh + emergencyPlan.deficitKwh,
          effectivePowerKw: liveTarget.chargerPowerKw,
          timeNeededHours:
            (Date.parse(emergencyPlan.estimatedCompletionTime) -
              Date.parse(providerPrices[0]?.startsAt ?? "2026-05-05T00:00:00.000Z")) /
            3_600_000,
          reason: [
            "approximate_completion_estimate",
            "user_requested_100_percent",
            "planning_only_no_hardware_control",
          ],
        };

  return {
    currentPrice: currentPrice ?? providerPrices[0] ?? price("2026-05-05T00:00:00.000Z", 0),
    prices: providerPrices,
    userMode: modeResult.policy,
    planReasons,
    nextTrip: {
      title: "Next drive",
      startsAt: target.departureTime,
    },
    chargingWindow: {
      startsAt: plan.slots[0]?.startsAt ?? null,
      endsAt: plan.slots.at(-1)?.endsAt ?? null,
    },
    completion,
    dailyFeedback: analyzeOutcomes(dailyOutcomes),
    onboarding: createOnboardingResponse(onboarding),
    status: createStatusResponse(config, onboarding, emergencyOverrideActive),
    vehicleState,
    pricingContext: createPricingContext(currentPrice, priceProvider.metadata.displayName),
    tibber: createTibberStatus(
      config,
      currentPrice === null ? providerPrices[0] ?? null : currentPrice,
      getTibberHomeSelectionInfo(priceProvider),
    ),
    providerWarnings,
    emergencyOverrideActive,
    plan,
  };
}

function createDemoPlanResponse(
  config: AppConfig,
  onboarding: StartupOnboarding,
  emergencyOverrideActive: boolean,
): PlanResponse {
  const modeResult = applyUserModePolicy({
    target: createChargingTarget(config),
    mode: config.userMode,
  });
  const plan = emergencyOverrideActive ? createDemoEmergencyPlan() : createDemoChargingPlan();
  const completion = emergencyOverrideActive ? createDemoEmergencyCompletion() : createDemoCompletion();

  return {
    currentPrice: price("2026-05-05T03:00:00.000Z", 0.88),
    prices,
    userMode: modeResult.policy,
    planReasons: emergencyOverrideActive
      ? ["Charge to 100% requested", "Safety override", "Planning only - no hardware control"]
      : [...demoReasons],
    nextTrip: {
      title: "Typical weekday trip",
      startsAt: "2026-05-05T07:00:00.000Z",
    },
    chargingWindow: {
      startsAt: plan.slots[0]?.startsAt ?? null,
      endsAt: plan.slots.at(-1)?.endsAt ?? null,
    },
    completion,
    dailyFeedback: analyzeOutcomes(dailyOutcomes),
    onboarding: createOnboardingResponse(onboarding),
    status: createStatusResponse(config, onboarding, emergencyOverrideActive),
    vehicleState: {
      batterySocPercent: 42,
      pluggedIn: true,
      chargingState: "Stopped",
      estimatedRangeKm: 238,
      source: "demo",
      observedAt: "2026-05-05T00:00:00.000Z",
    },
    pricingContext: {
      currentPrice: 0.88,
      currency: "SEK",
      source: "Demo prices",
      description: "Electricity is cheap overnight.",
    },
    tibber: createTibberStatus(config, null, null),
    providerWarnings: ["Demo mode is using realistic sample car and price data."],
    emergencyOverrideActive,
    plan,
  };
}

async function getVehicleState(
  config: AppConfig,
  registry: ProviderRegistry,
  warnings: string[],
): Promise<VehicleState | null> {
  if (config.teslaAccessToken === null) {
    warnings.push("Tesla is disconnected. Live battery level is not available.");
    return null;
  }

  const provider = registry.getVehicleStateProvider(config.vehicleStateProvider);
  if (provider === null) {
    warnings.push(`Vehicle provider is unavailable: ${config.vehicleStateProvider}.`);
    return null;
  }

  try {
    return await provider.getVehicleState();
  } catch (error) {
    warnings.push(`Tesla data could not be loaded: ${error instanceof Error ? error.message : "Unknown error"}`);
    return null;
  }
}

async function getHomeTelemetry(
  config: AppConfig,
  registry: ProviderRegistry,
  warnings: string[],
): Promise<HomeTelemetry | null> {
  const provider = registry.getHomeTelemetryProvider(config.homeTelemetryProvider);
  if (provider === null) {
    return null;
  }

  try {
    return await provider.getCurrentTelemetry();
  } catch (error) {
    warnings.push(
      `Home consumption data could not be loaded: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return null;
  }
}

async function getCurrentPrice(
  provider: NonNullable<ReturnType<ProviderRegistry["getElectricityPriceProvider"]>>,
  providerPrices: PriceInterval[],
  warnings: string[],
): Promise<PriceInterval | null> {
  try {
    return provider.getCurrentPrice === undefined ? (providerPrices[0] ?? null) : await provider.getCurrentPrice();
  } catch (error) {
    warnings.push(
      `Current electricity price could not be loaded: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return providerPrices[0] ?? null;
  }
}

function applyVehicleStateToTarget(target: ChargingTarget, vehicleState: VehicleState | null): ChargingTarget {
  if (vehicleState?.batterySocPercent === null || vehicleState?.batterySocPercent === undefined) {
    return target;
  }

  return {
    ...target,
    currentSocPercent: vehicleState.batterySocPercent,
  };
}

function createPricingContext(currentPrice: PriceInterval | null, source: string): PricingContext {
  if (currentPrice === null) {
    return {
      currentPrice: null,
      currency: null,
      source,
      description: "Live electricity price is not available.",
    };
  }

  return {
    currentPrice: currentPrice.total,
    currency: currentPrice.currency,
    source,
    description: `Current electricity price is ${currentPrice.total} ${currentPrice.currency}/kWh.`,
  };
}

function createTibberStatus(
  config: AppConfig,
  currentPrice: PriceInterval | null,
  homeSelectionInfo: TibberHomeSelectionInfo | null,
): TibberStatus {
  if (config.tibberAccessToken === null) {
    return {
      connected: false,
      status: "Tibber token not configured",
      lastSuccessfulFetch: null,
      multipleHomesFound: false,
      selectedHomeName: null,
      availableHomeNames: [],
      manualSelectionConfigured: false,
    };
  }

  const multipleHomesStatus =
    homeSelectionInfo?.multipleHomesFound === true && !homeSelectionInfo.manualSelectionConfigured
      ? "Multiple Tibber homes found"
      : null;

  return {
    connected: currentPrice !== null,
    status:
      multipleHomesStatus ??
      (currentPrice === null ? "Tibber connected, waiting for price data" : "Tibber connected"),
    lastSuccessfulFetch: currentPrice === null ? null : new Date().toISOString(),
    multipleHomesFound: homeSelectionInfo?.multipleHomesFound ?? false,
    selectedHomeName: homeSelectionInfo?.selectedHomeName ?? null,
    availableHomeNames: homeSelectionInfo?.availableHomeNames ?? [],
    manualSelectionConfigured: homeSelectionInfo?.manualSelectionConfigured ?? false,
  };
}

function getTibberHomeSelectionInfo(
  provider: NonNullable<ReturnType<ProviderRegistry["getElectricityPriceProvider"]>>,
): TibberHomeSelectionInfo | null {
  return provider instanceof TibberPriceProvider ? provider.getLastHomeSelectionInfo() : null;
}

function createPriceQuery(target: ChargingTarget): { startsAt: string; endsAt: string } {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return {
    startsAt: now.toISOString(),
    endsAt: target.departureTime,
  };
}

function createDemoChargingPlan(): ChargingPlan {
  return {
    feasible: true,
    slots: [
      {
        startsAt: "2026-05-05T01:20:00.000Z",
        endsAt: "2026-05-05T04:10:00.000Z",
        durationHours: 2.833333,
        energyKwh: 28.05,
        price: 0.91,
        estimatedCost: 25.53,
      },
    ],
    plannedEnergyKwh: 28.05,
    estimatedCost: 25.53,
    resultingSocPercent: 80,
    deficitKwh: 0,
    deficitSocPercent: 0,
    currency: "SEK",
  };
}

function createDemoEmergencyPlan(): ChargingPlan {
  return {
    feasible: true,
    slots: [
      {
        startsAt: "2026-05-05T00:10:00.000Z",
        endsAt: "2026-05-05T05:35:00.000Z",
        durationHours: 5.416667,
        energyKwh: 53.63,
        price: 1.08,
        estimatedCost: 57.92,
      },
    ],
    plannedEnergyKwh: 53.63,
    estimatedCost: 57.92,
    resultingSocPercent: 100,
    deficitKwh: 0,
    deficitSocPercent: 0,
    currency: "SEK",
  };
}

function createDemoCompletion(): ReturnType<typeof estimateCompletionForTarget> {
  return {
    approximate: true,
    estimatedCompletionTime: "2026-05-05T06:30:00.000Z",
    estimatedCompletionTimeMin: "2026-05-05T06:10:00.000Z",
    estimatedCompletionTimeMax: "2026-05-05T07:00:00.000Z",
    remainingEnergyKwh: 28.05,
    effectivePowerKw: 11,
    timeNeededHours: 2.55,
    reason: ["cheap_electricity", "typical_weekday_trip", "solar_expected_tomorrow"],
  };
}

function createDemoEmergencyCompletion(): ReturnType<typeof estimateCompletionForTarget> {
  return {
    approximate: true,
    estimatedCompletionTime: "2026-05-05T06:45:00.000Z",
    estimatedCompletionTimeMin: "2026-05-05T06:25:00.000Z",
    estimatedCompletionTimeMax: "2026-05-05T07:00:00.000Z",
    remainingEnergyKwh: 53.63,
    effectivePowerKw: 11,
    timeNeededHours: 4.875,
    reason: ["user_requested_100_percent", "safety_override", "planning_only_no_hardware_control"],
  };
}

function createStatusResponse(config: AppConfig, onboarding: StartupOnboarding, emergencyOverrideActive: boolean) {
  const chargerStatus = onboarding.demoMode
    ? "Demo mode"
    : config.chargerProvider === "mock-charger"
      ? "Mock charger"
      : "Planning only";

  return {
    ok: true,
    demoMode: onboarding.demoMode,
    priority: strategyLabel(config.userMode),
    chargerProvider: config.chargerProvider ?? "planning-only",
    chargerStatus,
    planningOnlyMode: onboarding.planningOnlyMode,
    emergencyOverrideActive,
    setupWarnings: onboarding.setupWarnings,
    setupMessages: onboarding.setupMessages,
  };
}

function createOnboardingResponse(onboarding: StartupOnboarding) {
  return {
    demoMode: onboarding.demoMode,
    planningOnlyMode: onboarding.planningOnlyMode,
    setupMessages: onboarding.setupMessages,
    setupWarnings: onboarding.setupWarnings,
  };
}

function createChargingTarget(config: AppConfig): ChargingTarget {
  return {
    departureTime: config.departureTime,
    currentSocPercent: 42,
    minSocPercent: config.minimumSocPercent,
    maxSocPercent: config.maximumSocPercent,
    batteryCapacityKwh: config.batteryCapacityKwh,
    chargerPowerKw: config.chargerPowerKw,
    chargingEfficiency: config.chargingEfficiency,
  };
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

function writeText(response: ServerResponse, statusCode: number, body: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end(body);
}

interface StaticDiagnostics {
  cwd: string;
  staticDir: string;
  staticDirExists: boolean;
  files: string[];
  appJsExists: boolean;
  appJsPath: string;
  appJsSizeBytes: number | null;
}

function startRequestLogging(request: IncomingMessage, response: ServerResponse): void {
  const startedAt = Date.now();
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  response.on("finish", () => {
    const contentType = response.getHeader("content-type");
    const normalizedContentType = Array.isArray(contentType) ? contentType.join(",") : String(contentType ?? "none");
    logger.info(
      "HTTP",
      `${request.method ?? "UNKNOWN"} ${path} -> ${response.statusCode} ${normalizedContentType} ${Date.now() - startedAt}ms`,
    );
  });
}

function createStaticDiagnostics(): StaticDiagnostics {
  const staticDir = resolveStaticDirectory();
  const appJsPath = join(staticDir, "app.js");
  const staticDirExists = existsSync(staticDir);
  const appJsExists = existsSync(appJsPath);
  return {
    cwd: process.cwd(),
    staticDir,
    staticDirExists,
    files: listStaticFiles(staticDir),
    appJsExists,
    appJsPath,
    appJsSizeBytes: appJsExists ? statSync(appJsPath).size : null,
  };
}

function createAppJsDiagnostics(): StaticDiagnostics & { first500Characters: string | null } {
  const diagnostics = createStaticDiagnostics();
  return {
    ...diagnostics,
    first500Characters: diagnostics.appJsExists ? readFileSync(diagnostics.appJsPath, "utf8").slice(0, 500) : null,
  };
}

function logStartupDiagnostics(config: AppConfig): void {
  const diagnostics = createStaticDiagnostics();
  logger.info("Server", `NODE_ENV=${process.env.NODE_ENV ?? "not set"}`);
  logger.info("Server", `PORT=${config.port}`);
  logger.info("Server", `working directory=${diagnostics.cwd}`);
  logger.info("Static", `resolved static directory path=${diagnostics.staticDir}`);
  logger.info("Static", `static directory exists=${diagnostics.staticDirExists}`);
  logger.info("Static", `files inside static directory=${diagnostics.files.join(", ") || "none"}`);
  logger.info("Static", `app.js exists=${diagnostics.appJsExists}`);
  logger.info("Static", `app.js absolute path=${diagnostics.appJsPath}`);
  if (!diagnostics.appJsExists) {
    logger.error("Static", "app.js missing from served static directory");
  }
}

function logIntegrationSetupStatus(config: AppConfig): void {
  const weatherConfigured = config.weatherLatitude !== null && config.weatherLongitude !== null;
  const solarConfigured = config.solarPanelTiltDegrees !== null && config.solarPanelAzimuthDegrees !== null;
  const chargerStatus = config.chargerProvider === "mock-charger" ? "mock-charger" : "planning-only";

  logger.info("Setup", `Tibber: ${config.tibberAccessToken !== null ? "configured" : "missing"}`);
  logger.info("Setup", `Tesla: ${config.teslaAccessToken !== null ? "configured" : "missing"}`);
  logger.info("Setup", `Weather: ${weatherConfigured ? "configured" : "missing"}`);
  logger.info("Setup", `Solar: ${solarConfigured ? "configured" : "missing"}`);
  logger.info("Setup", `Charger: ${chargerStatus}`);
}

function createConfigDiagnostics(config: AppConfig) {
  return {
    tibberAccessTokenConfigured: config.tibberAccessToken !== null,
    tibberAccessTokenLength: config.tibberAccessToken?.length ?? 0,
    tibberHomeIdConfigured: config.tibberHomeId !== null,
  };
}

function resolveStaticDirectory(): string {
  return staticDirectories.find((staticDirectory) => existsSync(staticDirectory)) ?? staticDirectories[0];
}

function listStaticFiles(staticDirectory: string): string[] {
  if (!existsSync(staticDirectory)) {
    return [];
  }

  return readdirSync(staticDirectory).sort();
}

function logAppJsRequest(request: IncomingMessage, response: ServerResponse, url: URL): void {
  response.on("finish", () => {
    const contentType = response.getHeader("content-type");
    const normalizedContentType = Array.isArray(contentType) ? contentType.join(",") : String(contentType ?? "none");
    logger.info(
      "Static",
      `app.js request url=${request.url ?? "/app.js"} query=${url.search || "none"} content-type=${normalizedContentType} status=${response.statusCode}`,
    );
  });
}

function writeStaticAsset(response: ServerResponse, fileName: string, contentType: string): void {
  const staticDirectory = resolveStaticDirectory();
  const filePath = join(staticDirectory, fileName);
  logger.info("Static", `serving ${fileName} from ${filePath}`);
  if (existsSync(filePath)) {
    response.statusCode = 200;
    response.setHeader("cache-control", "no-store, no-cache, must-revalidate");
    response.setHeader("content-type", contentType);
    response.end(readFileSync(filePath));
    return;
  }

  logger.error("Static", `${fileName} missing from served static directory`);
  response.statusCode = 404;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end(`${fileName} not found`);
}

function writeHtml(response: ServerResponse, statusCode: number, message: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<!doctype html><html lang="en"><body><p>${escapeHtml(message)}</p></body></html>`);
}

function getProviderFromPath(path: string): AuthProviderId {
  return path.includes("/tesla/") ? "tesla" : "tibber";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function strategyLabel(mode: AppConfig["userMode"]): string {
  switch (mode) {
    case "safe":
      return "Always ready";
    case "balanced":
      return "Balanced";
    case "savings":
      return "Lowest cost";
  }
}

function renderHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Smart EV Charging Optimizer</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f4;
      --text: #1d2522;
      --muted: #5f6d66;
      --line: #d8ded8;
      --primary: #0f6b4f;
      --primary-dark: #0a4b38;
      --surface: #ffffff;
      --warn: #8a4b00;
      --demo: #fff7df;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.4;
    }

    main {
      width: min(100%, 720px);
      margin: 0 auto;
      padding: 18px;
    }

    header {
      padding: 8px 0 16px;
    }

    h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 650;
      color: var(--muted);
    }

    .hero {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 20px;
    }

    .ready {
      margin: 0 0 8px;
      font-size: 34px;
      line-height: 1.08;
      font-weight: 760;
      letter-spacing: 0;
    }

    .subtle {
      color: var(--muted);
      font-size: 15px;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      margin: 16px 0;
    }

    .item {
      border-top: 1px solid var(--line);
      padding-top: 12px;
    }

    .label {
      display: block;
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 4px;
    }

    .value {
      font-size: 18px;
      font-weight: 680;
    }

    .reasons {
      margin: 8px 0 0;
      padding-left: 20px;
    }

    .reasons li {
      margin: 6px 0;
      color: var(--muted);
    }

    .reasons li::marker {
      content: "✔ ";
      color: var(--primary);
      font-weight: 760;
    }

    .actions {
      display: grid;
      gap: 10px;
      margin-top: 18px;
    }

    button {
      min-height: 46px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-weight: 680;
      cursor: pointer;
    }

    .primary {
      background: var(--primary);
      border-color: var(--primary);
      color: white;
    }

    .primary:active { background: var(--primary-dark); }

    .secondary-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .warning {
      display: none;
      margin-top: 12px;
      color: var(--warn);
      font-weight: 650;
    }

    .demo {
      display: none;
      background: var(--demo);
      border: 1px solid #e3c878;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      color: #5b4200;
      font-weight: 680;
    }

    .ui-error {
      display: none;
      margin: 12px 0 0;
      border: 1px solid #f2b8b5;
      background: #fceeee;
      border-radius: 8px;
      padding: 10px 12px;
      color: #8c1d18;
      font-weight: 680;
    }

    .boot-diagnostics {
      margin-top: 14px;
      border: 1px dashed #9ab0c5;
      border-radius: 8px;
      padding: 12px;
      background: #f4f9fd;
    }

    .boot-diagnostics dl {
      display: grid;
      grid-template-columns: minmax(120px, 1fr) 2fr;
      gap: 6px 10px;
      margin: 8px 0 0;
      font-size: 13px;
    }

    .boot-diagnostics dt {
      color: var(--muted);
    }

    .boot-diagnostics dd {
      margin: 0;
      overflow-wrap: anywhere;
      font-weight: 650;
    }

    dialog {
      width: min(calc(100% - 32px), 420px);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      color: var(--text);
    }

    dialog::backdrop {
      background: rgb(0 0 0 / 0.28);
    }

    .dialog-title {
      margin: 0 0 12px;
      font-size: 20px;
      font-weight: 760;
    }

    .strategy-list {
      display: grid;
      gap: 10px;
      margin: 0 0 14px;
    }

    .connect {
      margin-top: 14px;
    }

    .connect-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin-top: 10px;
    }

    .toast {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 16px;
      max-width: 520px;
      margin: 0 auto;
      background: var(--text);
      color: white;
      border-radius: 8px;
      padding: 12px 14px;
      font-weight: 680;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 150ms ease, transform 150ms ease;
      pointer-events: none;
    }

    .toast.visible {
      opacity: 1;
      transform: translateY(0);
    }

    footer {
      color: var(--muted);
      font-size: 12px;
      padding: 14px 0 0;
    }

    @media (min-width: 620px) {
      main { padding: 28px; }
      .ready { font-size: 42px; }
      .grid { grid-template-columns: 1fr 1fr; }
      .secondary-row { grid-template-columns: repeat(3, 1fr); }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>EV charging</h1>
    </header>

    <section class="hero" aria-live="polite">
      <div class="demo" id="demo-mode">Demo mode - no data is saved</div>
      <div class="ui-error" id="ui-error" role="alert"></div>
      <div id="ui-fatal-error" style="display:none;color:red"></div>
      <div class="boot-diagnostics" id="boot-diagnostics">
        <span class="label">UI diagnostics</span>
        <dl>
          <dt>Script status</dt>
          <dd id="diag-script-status">UI script not loaded</dd>
          <dt>Buttons found</dt>
          <dd id="diag-buttons-found">0</dd>
          <dt>Handlers attached</dt>
          <dd id="diag-handlers-attached">0</dd>
          <dt>Last UI event</dt>
          <dd id="diag-last-event">None</dd>
          <dt>Last UI error</dt>
          <dd id="diag-last-error">None</dd>
          <dt>Current URL</dt>
          <dd id="diag-current-url">Unknown</dd>
          <dt>Base URI</dt>
          <dd id="diag-base-uri">Unknown</dd>
          <dt>App script URL</dt>
          <dd id="diag-app-js-url">Unknown</dd>
        </dl>
      </div>
      <p class="ready" id="ready">Ready by 07:00</p>
      <p class="subtle" id="next-trip">Typical weekday trip at 07:00</p>

      <div class="grid">
        <div class="item">
          <span class="label">Charging window</span>
          <span class="value" id="window">01:20 - 04:10</span>
        </div>
        <div class="item">
          <span class="label">Approx completion</span>
          <span class="value" id="completion">approx 06:30</span>
        </div>
        <div class="item">
          <span class="label">Cost estimate</span>
          <span class="value" id="cost">25.53 SEK</span>
        </div>
        <div class="item">
          <span class="label">Battery</span>
          <span class="value" id="battery">42%</span>
        </div>
        <div class="item">
          <span class="label">Electricity</span>
          <span class="value" id="electricity">0.88 SEK/kWh</span>
        </div>
        <div class="item">
          <span class="label">Priority</span>
          <span class="value" id="priority">Always ready</span>
        </div>
        <div class="item">
          <span class="label">Setup</span>
          <span class="value" id="setup-mode">Demo mode</span>
        </div>
        <div class="item">
          <span class="label">Today</span>
          <span class="value" id="daily-ready">Car was ready</span>
        </div>
        <div class="item">
          <span class="label">Saved</span>
          <span class="value" id="daily-saved">12.3 SEK</span>
        </div>
      </div>

      <div class="item">
        <span class="label">Why this plan</span>
        <ol class="reasons" id="reasons">
          <li>Cheap electricity</li>
          <li>Typical weekday trip</li>
          <li>Solar expected tomorrow</li>
        </ol>
      </div>

      <div class="item">
        <span class="label">Today's result</span>
        <ol class="reasons" id="daily-feedback">
          <li>The car was ready when needed.</li>
          <li>Charging cost less than the comparison plan by 12.3.</li>
        </ol>
      </div>

      <div class="item" id="setup-item">
        <span class="label">Setup notes</span>
        <ol class="reasons" id="setup-notes">
          <li>Demo mode - no data is saved.</li>
          <li>Planning only mode is active.</li>
        </ol>
      </div>

      <div class="item connect">
        <span class="label">Connect providers</span>
        <div class="grid">
          <div>
          <span class="label">Tibber</span>
          <span class="value" id="tibber-status">Not connected</span>
          <p class="subtle" id="tibber-last-fetch">Last successful fetch: never</p>
          <p class="subtle" id="tibber-summary">Uses demo prices until connected.</p>
            <div class="connect-row">
              <button type="button" id="connect-tibber">Connect Tibber</button>
              <button type="button" id="disconnect-tibber">Disconnect Tibber</button>
            </div>
          </div>
          <div>
            <span class="label">Tesla</span>
            <span class="value" id="tesla-status">Not connected</span>
            <p class="subtle" id="tesla-summary">Uses demo car data until connected.</p>
            <div class="connect-row">
              <button type="button" id="connect-tesla">Connect Tesla</button>
              <button type="button" id="disconnect-tesla">Disconnect Tesla</button>
            </div>
          </div>
        </div>
      </div>

      <p class="warning" id="warning"></p>

      <div class="actions">
        <button class="primary" type="button" id="charge-100">Charge to 100%</button>
        <div class="secondary-row">
          <button type="button" id="change-departure">Change departure</button>
          <button type="button" id="charge-now">Charge now</button>
          <button type="button" id="change-strategy">Change strategy</button>
          <button type="button" id="debug-test-button">Debug test</button>
        </div>
      </div>
    </section>

    <dialog id="strategy-dialog">
      <h2 class="dialog-title">Charging strategy</h2>
      <div class="strategy-list">
        <button type="button" data-strategy="safe">Always ready</button>
        <button type="button" data-strategy="balanced">Balanced</button>
        <button type="button" data-strategy="savings">Lowest cost</button>
      </div>
      <button type="button" id="close-strategy">Close</button>
    </dialog>

    <footer>
      <div id="ui-script-status">UI script not loaded</div>
    </footer>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <script>
    console.log("[UI BOOT] inline script running");
    const status = document.getElementById("ui-script-status");
    if (status) status.textContent = "Inline script loaded";
  </script>
  <script>
window.addEventListener("error", function (event) {
  console.log("[GLOBAL ERROR]", event.message, event.filename, event.lineno, event.colno);
  const el = document.getElementById("diag-last-error");
  if (el) el.textContent = event.message + " at " + event.filename + ":" + event.lineno;
});
</script>
  <script src="./app.js"></script>
</body>
</html>`;
}

function renderAppJs(): string {
  return `
  document.addEventListener("DOMContentLoaded", () => {
    console.log("UI script loaded");
    const scriptStatus = document.getElementById("ui-script-status");
    if (scriptStatus) {
      scriptStatus.textContent = "UI script loaded";
    }
    showToast("UI script loaded");

    const formatTime = (value) => {
      if (!value) return "Not planned";
      return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
    };

    const friendlyReason = (reason) => {
      const text = {
        "safe mode applied": "Safe mode is on",
        "balanced mode applied": "Balanced mode is on",
        "savings mode applied": "Savings mode is on",
        "cheap electricity": "Cheap electricity",
        "typical weekday trip": "Typical weekday trip",
        "solar expected tomorrow": "Solar expected tomorrow",
        "charge to 100% requested": "Charge to 100% requested",
        "safety override": "Safety override",
        "planning only - no hardware control": "Planning only - no hardware control",
      }[String(reason).toLowerCase()];
      if (text) return text;
      return String(reason)
        .replace(/_/g, " ")
        .replace(/SOC/g, "charge")
        .replace(/soc/g, "charge");
    };

    fetchJson("/api/plan")
      .then((response) => response.json())
      .then((data) => renderPlan(data))
      .catch((error) => showFetchError("Initial plan load failed", error));

    bindButton("charge-100", "Charge to 100%", () => {
      showToast("Updating plan to 100%...");
      return fetchJson("/api/emergency-charge", { method: "POST" })
        .then((response) => response.json())
        .then((data) => {
          renderPlan(data);
          showToast("Plan updated: Charge to 100%");
        })
        .catch((error) => showFetchError("Could not update emergency plan", error));
    });

    bindButton("charge-now", "Charge now", () => {
      showToast("Charge now is a planning-only preview for now.");
    });

    bindButton("change-departure", "Change departure", () => {
      showToast("Departure changes are coming soon.");
    });

    bindButton("connect-tibber", "Connect Tibber", () => startProviderAuth("tibber"));
    bindButton("connect-tesla", "Connect Tesla", () => startProviderAuth("tesla"));
    bindButton("disconnect-tibber", "Disconnect Tibber", () => disconnectProvider("tibber"));
    bindButton("disconnect-tesla", "Disconnect Tesla", () => disconnectProvider("tesla"));

    const strategyDialog = document.getElementById("strategy-dialog");
    bindButton("change-strategy", "Change strategy", () => {
      if (strategyDialog && typeof strategyDialog.showModal === "function") {
        strategyDialog.showModal();
        return;
      }
      showToast("Charging strategy options are available soon.");
    });
    bindButton("close-strategy", "Close strategy dialog", () => {
      if (strategyDialog && typeof strategyDialog.close === "function") {
        strategyDialog.close();
      }
    });
    document.querySelectorAll("[data-strategy]").forEach((button) => {
      button.addEventListener("click", () => {
        const label = button.textContent || "strategy";
        console.log("Button clicked:", label);
        showToast(label + " selected. Strategy changes are coming soon.");
        if (strategyDialog && typeof strategyDialog.close === "function") {
          strategyDialog.close();
        }
      });
    });

    function renderPlan(data) {
        document.getElementById("ready").textContent = "Ready by " + formatTime(data.completion.estimatedCompletionTimeMax);
        document.getElementById("next-trip").textContent = "Next trip: " + formatTime(data.nextTrip.startsAt);
        document.getElementById("window").textContent =
          formatTime(data.chargingWindow.startsAt) + " - " + formatTime(data.chargingWindow.endsAt);
        document.getElementById("completion").textContent =
          "approx " + formatTime(data.completion.estimatedCompletionTime) + " (" + formatTime(data.completion.estimatedCompletionTimeMin) + "-" + formatTime(data.completion.estimatedCompletionTimeMax) + ")";
        document.getElementById("cost").textContent =
          data.plan.estimatedCost + " " + (data.plan.currency || "");
        document.getElementById("battery").textContent =
          data.vehicleState && data.vehicleState.batterySocPercent !== null
            ? data.vehicleState.batterySocPercent + "%"
            : "Not connected";
        document.getElementById("electricity").textContent =
          data.pricingContext.currentPrice !== null
            ? data.pricingContext.currentPrice + " " + data.pricingContext.currency + "/kWh"
            : "Not connected";
        document.getElementById("priority").textContent =
          strategyName(data.userMode.mode);
        document.getElementById("setup-mode").textContent =
          data.status.chargerStatus;
        document.getElementById("demo-mode").style.display =
          data.onboarding.demoMode ? "block" : "none";
        document.getElementById("daily-ready").textContent =
          data.dailyFeedback.wasCarReady ? "Car was ready" : "Car was not ready";
        document.getElementById("daily-saved").textContent =
          data.dailyFeedback.moneySaved + " " + (data.plan.currency || "");
        document.getElementById("reasons").innerHTML = data.planReasons
          .slice(0, 4)
          .map((reason) => "<li>" + friendlyReason(reason) + "</li>")
          .join("");
        document.getElementById("daily-feedback").innerHTML = [
          ...data.dailyFeedback.reason,
          ...data.dailyFeedback.failures.map((failure) => failure.reason),
          ...data.dailyFeedback.suggestions.map((suggestion) => ({
            increase_buffer: "Add a larger safety buffer",
            start_earlier: "Start charging earlier",
          }[suggestion] || suggestion.replace(/_/g, " ")),
        ]
          .slice(0, 4)
          .map((text) => "<li>" + text + "</li>")
          .join("");
        document.getElementById("setup-notes").innerHTML = [
          ...data.onboarding.setupWarnings,
          ...data.onboarding.setupMessages,
          ...data.providerWarnings,
        ]
          .slice(0, 4)
          .map((text) => "<li>" + text + "</li>")
          .join("");

        if (!data.plan.feasible) {
          const warning = document.getElementById("warning");
          warning.style.display = "block";
          warning.textContent = "The car may not reach the target in time.";
        }
        refreshConnections();
      }

    function strategyName(mode) {
      return {
        safe: "Always ready",
        balanced: "Balanced",
        savings: "Lowest cost",
      }[mode] || "Always ready";
    }

    function refreshConnections() {
      return fetchJson("/api/connections")
        .then((response) => response.json())
        .then((data) => {
          renderConnection(data.connections.find((connection) => connection.provider === "tibber"), "tibber");
          renderConnection(data.connections.find((connection) => connection.provider === "tesla"), "tesla");
        })
        .catch((error) => showFetchError("Could not refresh provider connections", error));
    }

    function renderConnection(connection, provider) {
      if (!connection) return;
      document.getElementById(provider + "-status").textContent = connection.connected ? "Connected" : "Not connected";
      document.getElementById(provider + "-summary").textContent = connection.summary || connection.warning || "Not connected";
    }

    function startProviderAuth(provider) {
      showToast("Opening " + providerName(provider) + " connection...");
      return fetchJson("/api/auth/" + provider + "/start", { method: "POST" })
        .then((response) => response.json())
        .then((data) => {
          if (data.authorizationUrl) {
            showToast("Redirecting to " + providerName(provider) + " login...");
            window.location.href = data.authorizationUrl;
            return;
          }
          showToast(providerName(provider) + " login is not implemented yet");
        })
        .catch((error) => showFetchError(providerName(provider) + " login failed", error));
    }

    function disconnectProvider(provider) {
      showToast("Disconnecting " + providerName(provider) + "...");
      return fetchJson("/api/auth/" + provider + "/disconnect", { method: "POST" })
        .then(() => refreshConnections())
        .then(() => showToast(providerName(provider) + " disconnected"))
        .catch((error) => showFetchError(providerName(provider) + " disconnect failed", error));
    }

    function bindButton(id, label, handler) {
      const button = document.getElementById(id);
      if (!button) {
        console.error("Button not found:", id);
        return;
      }
      button.addEventListener("click", (event) => {
        event.preventDefault();
        console.log("Button clicked:", label);
        try {
          const result = handler();
          if (result && typeof result.catch === "function") {
            result.catch((error) => showFetchError(label + " failed", error));
          }
        } catch (error) {
          console.error(label + " failed", error);
          showToast(label + " failed");
        }
      });
    }

    function apiUrl(path) {
      return "./" + String(path).replace(/^\\/+/, "");
    }

    function fetchJson(url, options) {
      const resolvedUrl = apiUrl(url);
      console.log("Fetch:", options && options.method ? options.method : "GET", resolvedUrl);
      return fetch(resolvedUrl, options).then((response) => {
        if (!response.ok) {
          throw new Error(resolvedUrl + " failed with HTTP " + response.status);
        }
        return response;
      });
    }

    function showFetchError(message, error) {
      console.error(message, error);
      showToast(message);
    }

    function providerName(provider) {
      return provider === "tibber" ? "Tibber" : "Tesla";
    }

    let toastTimer;
    function showToast(message) {
      const toast = document.getElementById("toast");
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add("visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
    }

    refreshConnections();
  });
  `;
}

function price(startsAt: string, total: number): PriceInterval {
  return {
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
    total,
    currency: "SEK",
  };
}

function logStartupOnboarding(messages: string[]): void {
  for (const message of messages) {
    logger.info("Setup", message);
  }
}

try {
  startServer();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
