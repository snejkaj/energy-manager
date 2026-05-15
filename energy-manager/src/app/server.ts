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
import { getTeslaOAuthFleetLastError, recordTeslaOAuthEvent } from "../providers/tesla/TeslaDiagnostics.js";
import { TeslaVehicleStateProvider } from "../providers/tesla/TeslaProvider.js";
import { TibberGraphQLClient } from "../providers/tibber/TibberClient.js";
import { TibberHomeTelemetryProvider, TibberPriceProvider } from "../providers/tibber/TibberProvider.js";
import type { TibberHomeSelectionInfo } from "../providers/tibber/TibberTypes.js";
import type { VehicleState } from "../providers/VehicleStateProvider.js";
import { RuleBasedSupportExplainer, type SupportAdvice, type SupportDiagnostics } from "../support/SupportExplainer.js";
import {
  ProviderAuthService,
  type AuthProviderId,
  type AuthStartResult,
  type ProviderOAuthDiagnostics,
} from "./auth/ProviderAuthService.js";
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
const appVersion = readAppVersion();

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
  const supportExplainer = new RuleBasedSupportExplainer();
  let emergencyOverrideActive = false;
  let lastApiError: SupportEvent | null = null;
  let lastOAuthError: SupportEvent | null = null;
  const lastBuildConfigWarning = createLastBuildConfigWarning(config, onboarding);
  let lastTeslaCallbackResult: TeslaCallbackResult = {
    callbackHit: false,
    tokenExchangeSuccess: false,
    vehicleFetchAttempted: false,
    message: "No Tesla callback received yet.",
    recordedAt: null,
  };

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

    if (request.method === "GET" && path === "/api/version") {
      writeJson(response, 200, {
        name: "Energy Manager",
        version: appVersion,
      });
      return;
    }

    if (request.method === "GET" && path === "/api/support/diagnostics") {
      writeJson(response, 200, createSupportDiagnostics(request, config, onboarding, authService, {
        lastApiError,
        lastOAuthError,
        lastBuildConfigWarning,
      }));
      return;
    }

    if (request.method === "POST" && path === "/api/support/explain") {
      const diagnostics = createSupportDiagnostics(request, config, onboarding, authService, {
        lastApiError,
        lastOAuthError,
        lastBuildConfigWarning,
      });
      const advice = supportExplainer.explain(diagnostics);
      writeJson(response, 200, {
        advice,
        report: createSupportReport(diagnostics, advice),
      });
      return;
    }

    if (request.method === "GET" && path === "/api/connections") {
      void getTeslaStateResponse(config, authService, false)
        .then((teslaStatus) =>
          writeJson(response, 200, {
            demoMode: onboarding.demoMode,
            warning: onboarding.demoMode ? "Demo mode uses temporary in-memory tokens only." : null,
            connections: authService.getConnectionStatuses(),
            teslaStatus,
          }),
        )
        .catch((error: unknown) => {
          lastApiError = createSupportEvent(errorMessage(error));
          writeJson(response, 200, {
            demoMode: onboarding.demoMode,
            warning: onboarding.demoMode ? "Demo mode uses temporary in-memory tokens only." : null,
            connections: authService.getConnectionStatuses(),
            teslaStatus: createTeslaErrorResponse(config, error, authService),
          });
        });
      return;
    }

    if (request.method === "GET" && path === "/api/tesla/vehicles") {
      void getTeslaVehiclesResponse(config, authService)
        .then((payload) => writeJson(response, 200, payload))
        .catch((error: unknown) => writeJson(response, 200, createTeslaErrorResponse(config, error, authService)));
      return;
    }

    if (request.method === "GET" && (path === "/api/tesla/state" || path === "/api/tesla/status")) {
      void getTeslaStateResponse(config, authService, false)
        .then((payload) => writeJson(response, 200, payload))
        .catch((error: unknown) => writeJson(response, 200, createTeslaErrorResponse(config, error, authService)));
      return;
    }

    if (request.method === "POST" && path === "/api/tesla/refresh") {
      void getTeslaStateResponse(config, authService, true)
        .then((payload) => writeJson(response, 200, payload))
        .catch((error: unknown) => writeJson(response, 200, createTeslaErrorResponse(config, error, authService)));
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
      writeJson(response, 200, createConfigDiagnostics(config, request));
      return;
    }

    if (request.method === "GET" && path === "/debug/tesla") {
      const callbackInfo = createTeslaCallbackInfo(request, config);
      const diagnostics = authService.getOAuthDiagnostics("tesla", callbackInfo.callbackUrl);
      const authStart = authService.startAuth("tesla", callbackInfo.callbackUrl);
      logTeslaAuthStart(authStart);
      writeTeslaStartDebugHtml(response, diagnostics, authStart, callbackInfo, createBackHref(path));
      return;
    }

    if (request.method === "GET" && path === "/debug/tesla/manual-token-helper") {
      writeTeslaManualTokenHelperHtml(response, config, createTeslaCallbackInfo(request, config).callbackUrl, null, null);
      return;
    }

    if (request.method === "POST" && path === "/debug/tesla/manual-token-helper") {
      void readRequestBody(request)
        .then(async (body) => {
          if (!config.devMode) {
            writeTeslaManualTokenHelperHtml(response, config, createTeslaCallbackInfo(request, config).callbackUrl, null, "Manual token helper is disabled. Set DEV_MODE=true to use it.");
            return;
          }
          const code = new URLSearchParams(body).get("authorization_code")?.trim() ?? "";
          if (code === "") {
            writeTeslaManualTokenHelperHtml(response, config, createTeslaCallbackInfo(request, config).callbackUrl, null, "Authorization code is required.");
            return;
          }
          const tokenResult = await authService.exchangeLatestPendingTeslaCode(code);
          writeTeslaManualTokenHelperHtml(response, config, createTeslaCallbackInfo(request, config).callbackUrl, tokenResult, null);
        })
        .catch((error: unknown) => {
          writeTeslaManualTokenHelperHtml(
            response,
            config,
            createTeslaCallbackInfo(request, config).callbackUrl,
            null,
            error instanceof Error ? error.message : "Token exchange failed.",
          );
        });
      return;
    }

    if (request.method === "GET" && path === "/debug/tesla/authorization-url") {
      const callbackInfo = createTeslaCallbackInfo(request, config);
      const authStart = authService.startAuth("tesla", callbackInfo.callbackUrl);
      logTeslaAuthStart(authStart);
      const validation = validateTeslaAuthorizationUrl(authStart.authorizationUrl);
      const variants = createTeslaAuthorizationUrlVariants(authStart.authorizationUrl);
      writeJson(response, 200, {
        valid: validation.valid,
        authorizationUrl: authStart.authorizationUrl,
        missing: validation.missing,
        redirectUri: authStart.redirectUri,
        detectedIngressUrl: callbackInfo.ingressBaseUrl,
        generatedCallbackUrl: callbackInfo.callbackUrl,
        scopes: authStart.scopes,
        variants: variants.map((variant) => ({
          id: variant.id,
          label: variant.label,
          authorizationUrl: variant.authorizationUrl,
          decodedParameters: variant.decodedParameters,
          valid: variant.validation.valid,
          missing: variant.validation.missing,
        })),
      });
      return;
    }

    if (request.method === "GET" && path === "/debug/tesla/callback-info") {
      const callbackInfo = createTeslaCallbackInfo(request, config);
      writeJson(response, 200, {
        detectedIngressUrl: callbackInfo.ingressBaseUrl,
        generatedCallbackUrl: callbackInfo.callbackUrl,
        selectedReason: callbackInfo.selectedReason,
        httpsEnabled: callbackInfo.httpsEnabled,
        publiclyReachable: callbackInfo.publiclyReachable,
        oauthStatePending: authService.hasPendingState("tesla"),
        lastCallbackResult: lastTeslaCallbackResult,
        tokenExchangeSuccess: lastTeslaCallbackResult.tokenExchangeSuccess,
      });
      return;
    }

    if (request.method === "GET" && path === "/debug/tesla/callback-selection") {
      const callbackInfo = createTeslaCallbackInfo(request, config);
      writeJson(response, 200, {
        selectedCallbackUrl: callbackInfo.callbackUrl,
        selectedReason: callbackInfo.selectedReason,
        availableCandidates: callbackInfo.candidates,
        https: callbackInfo.httpsEnabled,
        ingressDetected: callbackInfo.ingressDetected,
        nabuCasaDetected: callbackInfo.nabuCasaDetected,
        ingressCallbackSupported: callbackInfo.ingressCallbackSupported,
        publicCallbackUrlConfigured: callbackInfo.publicCallbackConfigured,
        publiclyReachable: callbackInfo.publiclyReachable,
        warnings: callbackInfo.warnings,
      });
      return;
    }

    if (request.method === "GET" && path === "/debug/tesla/oauth-last-error") {
      writeJson(response, 200, {
        ...getTeslaOAuthFleetLastError(),
        oauthStatus: createTeslaOAuthStatus(),
      });
      return;
    }

    if (request.method === "GET" && path === "/debug/tesla/oauth-status") {
      writeJson(response, 200, createTeslaOAuthStatus());
      return;
    }

    if (request.method === "POST" && path === "/debug/tesla/oauth-variant-click") {
      readRequestBody(request)
        .then((body) => {
          const variant = parseLoggedVariant(body);
          logger.info("TeslaAuth", `OAuth variant clicked=${variant}`);
          writeJson(response, 200, { ok: true });
        })
        .catch((error: unknown) => {
          logger.error("TeslaAuth", `OAuth variant click log failed: ${error instanceof Error ? error.message : "Unknown error"}`);
          writeJson(response, 200, { ok: false });
        });
      return;
    }

    if (request.method === "GET" && path === "/debug/html") {
      writeText(response, 200, renderHtml());
      return;
    }

    if (request.method === "POST" && (path === "/api/auth/tibber/start" || path === "/api/auth/tesla/start")) {
      const provider = getProviderFromPath(path);
      const authStart = provider === "tesla"
        ? authService.startAuth(provider, createTeslaCallbackInfo(request, config).callbackUrl)
        : authService.startAuth(provider);
      if (provider === "tesla") {
        logTeslaAuthStart(authStart);
      }
      writeJson(response, 200, authStart);
      return;
    }

    if (request.method === "GET" && path === "/api/auth/tesla/start") {
      const authStart = authService.startAuth("tesla", createTeslaCallbackInfo(request, config).callbackUrl);
      logTeslaAuthStart(authStart);
      writeJson(response, 200, authStart);
      return;
    }

    if (request.method === "GET" && path === "/auth/tesla/start-debug") {
      const callbackInfo = createTeslaCallbackInfo(request, config);
      const diagnostics = authService.getOAuthDiagnostics("tesla", callbackInfo.callbackUrl);
      const authStart = authService.startAuth("tesla", callbackInfo.callbackUrl);
      logTeslaAuthStart(authStart);
      writeTeslaStartDebugHtml(response, diagnostics, authStart, callbackInfo, createBackHref(path));
      return;
    }

    if (request.method === "GET" && (path === "/api/auth/tibber/callback" || path === "/api/auth/tesla/callback")) {
      logger.info("Auth", `${labelProvider(getProviderFromPath(path))} callback hit=yes`);
      if (path === "/api/auth/tesla/callback") {
        recordTeslaOAuthEvent({
          step: "callback_received",
          redirectUriUsed: createTeslaCallbackInfo(request, config).callbackUrl,
          region: config.teslaRegion,
        });
      }
      if (path === "/api/auth/tesla/callback") {
        lastTeslaCallbackResult = {
          callbackHit: true,
          tokenExchangeSuccess: false,
          vehicleFetchAttempted: false,
          message: "Tesla callback received.",
          recordedAt: new Date().toISOString(),
        };
      }
      const url = new URL(request.url ?? "/", "http://localhost");
      const oauthError = url.searchParams.get("error");
      if (oauthError !== null) {
        const description = url.searchParams.get("error_description") ?? oauthError;
        const message = description.toLowerCase().includes("redirect")
          ? "Tesla login failed. Check that the generated add-on callback URL exactly matches the redirect URI in Tesla Developer Console."
          : description;
        lastOAuthError = createSupportEvent(message);
        writeAuthResultHtml(response, 400, "Tesla connection failed", [
          `Error code: ${oauthError}`,
          `Description: ${message}`,
          `Redirect URI used: ${createTeslaCallbackInfo(request, config).callbackUrl ?? "not available"}`,
        ], createBackHref(path), createTeslaDebugHref(path));
        lastTeslaCallbackResult = {
          callbackHit: true,
          tokenExchangeSuccess: false,
          vehicleFetchAttempted: false,
          message: `Tesla callback error: ${oauthError}`,
          recordedAt: new Date().toISOString(),
        };
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (code === null || state === null) {
        lastOAuthError = createSupportEvent("Missing OAuth code or state.");
        writeAuthResultHtml(response, 400, "Tesla connection failed", [
          "Missing OAuth code or state.",
          `Redirect URI used: ${createTeslaCallbackInfo(request, config).callbackUrl ?? "not available"}`,
        ], createBackHref(path), createTeslaDebugHref(path));
        lastTeslaCallbackResult = {
          callbackHit: true,
          tokenExchangeSuccess: false,
          vehicleFetchAttempted: false,
          message: "Missing OAuth code or state.",
          recordedAt: new Date().toISOString(),
        };
        return;
      }

      const provider = getProviderFromPath(path);
      let vehicleFetchAttempted = false;
      let vehicleFetchError: string | null = null;
      void authService
        .handleCallback(provider, code, state)
        .then(async () => {
          if (provider === "tesla") {
            vehicleFetchAttempted = true;
            await getTeslaStateResponse(config, authService, true).catch((error: unknown) => {
              vehicleFetchError = error instanceof Error ? error.message : "Unknown error";
              logger.error("Tesla", `Tesla state fetch after OAuth failed: ${vehicleFetchError}`);
            });
            lastTeslaCallbackResult = {
              callbackHit: true,
              tokenExchangeSuccess: true,
              vehicleFetchAttempted,
              message: vehicleFetchError === null ? "Tesla connected." : `Tesla connected; vehicle fetch failed: ${vehicleFetchError}`,
              recordedAt: new Date().toISOString(),
            };
          }
          writeAuthResultHtml(response, 200, `${labelProvider(provider)} connected`, [
            provider === "tesla" ? `Vehicle fetch attempted: ${vehicleFetchAttempted ? "yes" : "no"}` : "Connection completed.",
            ...(vehicleFetchError === null ? [] : [`Tesla API error: ${vehicleFetchError}`]),
            ...(provider === "tesla" ? [`Last Tesla OAuth/Fleet step: ${formatTeslaLastErrorSummary()}`] : []),
            "Return to the add-on to see the latest status.",
          ], createBackHref(path), provider === "tesla" ? createTeslaDebugHref(path) : null);
        })
        .catch((error: unknown) => {
          lastOAuthError = createSupportEvent(errorMessage(error));
          if (provider === "tesla") {
            lastTeslaCallbackResult = {
              callbackHit: true,
              tokenExchangeSuccess: false,
              vehicleFetchAttempted: false,
              message: error instanceof Error ? error.message : "Connection failed.",
              recordedAt: new Date().toISOString(),
            };
          }
          writeAuthResultHtml(response, 400, `${labelProvider(provider)} connection failed`, [
            `Error: ${error instanceof Error ? error.message : "Connection failed."}`,
            `Redirect URI used: ${provider === "tesla" ? createTeslaCallbackInfo(request, config).callbackUrl ?? "not available" : config.tibberOAuthRedirectUri ?? "not configured"}`,
            ...(provider === "tesla" ? [`Last Tesla OAuth/Fleet step: ${formatTeslaLastErrorSummary()}`] : []),
          ], createBackHref(path), provider === "tesla" ? createTeslaDebugHref(path) : null);
        });
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
        .catch((error: unknown) => {
          lastApiError = createSupportEvent(errorMessage(error));
          writeJson(response, 500, {
            error: errorMessage(error),
          });
        });
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
        .catch((error: unknown) => {
          lastApiError = createSupportEvent(errorMessage(error));
          writeJson(response, 500, {
            error: errorMessage(error),
          });
        });
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

  const teslaOAuthToken = authService?.getAccessToken("tesla") ?? null;
  if (teslaOAuthToken !== null) {
    registry.registerVehicleStateProvider(
      new TeslaVehicleStateProvider(new TeslaClient(teslaOAuthToken, config.teslaRegion), {
        vehicleId: config.teslaVehicleId,
        region: config.teslaRegion,
      }),
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
  tesla: ReturnType<typeof createTeslaStatusFromState>;
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
    onboarding: createOnboardingResponse(onboarding, vehicleState),
    status: createStatusResponse(config, onboarding, emergencyOverrideActive),
    vehicleState,
    tesla: vehicleState === null
      ? createTeslaDemoStatus("Tesla is not connected. Demo vehicle data is used for planning.")
      : createTeslaStatusFromState(true, vehicleState, null),
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
    vehicleState: createDemoVehicleState(),
    tesla: createTeslaDemoStatus(null),
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

function createDemoVehicleState(): VehicleState {
  return {
    batterySocPercent: 42,
    pluggedIn: true,
    chargingState: "Stopped",
    estimatedRangeKm: 238,
    chargeLimitPercent: 80,
    chargerPowerKw: 0,
    chargerVoltage: 0,
    chargerActualCurrent: 0,
    timeToFullChargeHours: 0,
    batteryRangeKm: 238,
    vehicleName: "Demo vehicle",
    vehicleId: "demo-vehicle",
    vehicleOnlineState: "demo",
    lastUpdatedAt: "2026-05-05T00:00:00.000Z",
    isDemo: true,
    source: "demo",
    observedAt: "2026-05-05T00:00:00.000Z",
  };
}

async function getVehicleState(
  config: AppConfig,
  registry: ProviderRegistry,
  warnings: string[],
): Promise<VehicleState | null> {
  const provider =
    registry.getVehicleStateProvider(config.vehicleStateProvider)
    ?? registry.getVehicleStateProvider("tesla");
  if (provider === null) {
    warnings.push("Tesla is not connected. Demo vehicle data is used for planning.");
    return null;
  }

  try {
    return await provider.getVehicleState();
  } catch (error) {
    warnings.push(`Tesla data could not be loaded: ${error instanceof Error ? error.message : "Unknown error"}`);
    return null;
  }
}

async function getTeslaVehiclesResponse(config: AppConfig, authService: ProviderAuthService) {
  const provider = createTeslaVehicleProvider(config, authService);
  if (provider === null) {
    return {
      connected: false,
      usingDemoData: true,
      warning: "Tesla is not connected. Click Connect Tesla to sign in.",
      vehicles: [],
    };
  }

  const vehicles = await provider.getVehicles();
  return {
    connected: true,
    usingDemoData: false,
    warning: authService.isUsingTemporaryTeslaAccessToken() ? "Using temporary Tesla access token" : null,
    vehicles: vehicles.map((vehicle) => ({
      vehicleId: vehicle.id_s ?? vehicle.vin ?? String(vehicle.id ?? ""),
      vehicleName: vehicle.display_name ?? null,
      vehicleOnlineState: vehicle.state ?? null,
    })),
  };
}

async function getTeslaStateResponse(config: AppConfig, authService: ProviderAuthService, forceRefresh: boolean) {
  const provider = createTeslaVehicleProvider(config, authService);
  if (provider === null) {
    return createTeslaDemoStatus("Tesla is not connected. Click Connect Tesla to sign in.");
  }

  const state = await provider.getVehicleState({ forceRefresh });
  if (state === null) {
    return createTeslaDemoStatus("Tesla data is unavailable - using demo vehicle data");
  }

  return createTeslaStatusFromState(
    true,
    state,
    authService.isUsingTemporaryTeslaAccessToken() ? "Using temporary Tesla access token" : null,
  );
}

function createTeslaVehicleProvider(config: AppConfig, authService: ProviderAuthService): TeslaVehicleStateProvider | null {
  const accessToken = authService.getAccessToken("tesla");
  if (accessToken === null) {
    return null;
  }

  return new TeslaVehicleStateProvider(new TeslaClient(accessToken, config.teslaRegion), {
    vehicleId: config.teslaVehicleId,
    region: config.teslaRegion,
  });
}

function createTeslaErrorResponse(_config: AppConfig, error: unknown, authService?: ProviderAuthService) {
  logger.error("Tesla", `Tesla data could not be loaded: ${error instanceof Error ? error.message : "Unknown error"}`);
  const hasToken = authService?.getAccessToken("tesla") !== null;
  return createTeslaDemoStatus(
    !hasToken
      ? "Tesla is not connected. Click Connect Tesla to sign in."
      : `Tesla data could not be loaded: ${error instanceof Error ? error.message : "Unknown error"}`,
  );
}

function createTeslaDemoStatus(warning: string | null) {
  return createTeslaStatusFromState(false, createDemoVehicleState(), warning);
}

function createTeslaStatusFromState(connected: boolean, state: VehicleState, warning: string | null) {
  const usingDemoData = !connected || state.isDemo;
  const asleepWarning =
    connected
    && !state.isDemo
    && state.vehicleOnlineState !== null
    && state.vehicleOnlineState !== undefined
    && state.vehicleOnlineState !== "online"
      ? "Vehicle asleep - using last known state"
      : null;

  return {
    connected,
    usingDemoData,
    warning: warning ?? asleepWarning,
    vehicleState: state,
    vehicleName: state.vehicleName ?? null,
    vehicleId: state.vehicleId ?? null,
    batterySocPercent: state.batterySocPercent,
    pluggedIn: state.pluggedIn,
    chargingState: state.chargingState,
    chargeLimitPercent: state.chargeLimitPercent ?? null,
    chargerPowerKw: state.chargerPowerKw ?? null,
    chargerVoltage: state.chargerVoltage ?? null,
    chargerActualCurrent: state.chargerActualCurrent ?? null,
    timeToFullChargeHours: state.timeToFullChargeHours ?? null,
    batteryRangeKm: state.batteryRangeKm ?? state.estimatedRangeKm,
    vehicleOnlineState: state.isDemo ? "Demo mode" : state.vehicleOnlineState ?? null,
    onlineState: state.isDemo ? "Demo mode" : state.vehicleOnlineState ?? null,
    lastUpdatedAt: state.lastUpdatedAt ?? state.observedAt,
  };
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

function createOnboardingResponse(onboarding: StartupOnboarding, vehicleState: VehicleState | null = null) {
  const hideDisconnectedTeslaNote = vehicleState !== null && !vehicleState.isDemo && vehicleState.source === "tesla";
  return {
    demoMode: onboarding.demoMode,
    planningOnlyMode: onboarding.planningOnlyMode,
    setupMessages: hideDisconnectedTeslaNote
      ? onboarding.setupMessages.filter((message) => !message.startsWith("Tesla is not connected."))
      : onboarding.setupMessages,
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
  if (statusCode === 401) {
    writeDebugIngress401Html(response);
    return;
  }
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

function writeDebugIngress401Html(response: ServerResponse): void {
  response.statusCode = 401;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Debug endpoint unavailable</title>
  </head>
  <body>
    <p>Debug endpoint is only available through Home Assistant Ingress. Open Tesla OAuth debug from the add-on UI.</p>
  </body>
</html>`);
}

function writeText(response: ServerResponse, statusCode: number, body: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end(body);
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseLoggedVariant(body: string): string {
  try {
    const parsed = JSON.parse(body) as { variant?: unknown };
    return typeof parsed.variant === "string" && parsed.variant.length > 0 ? parsed.variant : "unknown";
  } catch {
    return "unknown";
  }
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
  logger.info("Version", `Energy Manager ${appVersion}`);
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

function readAppVersion(): string {
  const candidates = [
    join(process.cwd(), "package.json"),
    join(currentDir, "../../package.json"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as { version?: unknown };
      if (typeof parsed.version === "string" && parsed.version.length > 0) {
        return parsed.version;
      }
    } catch {
      continue;
    }
  }

  return "unknown";
}

function logIntegrationSetupStatus(config: AppConfig): void {
  const weatherConfigured = config.weatherLatitude !== null && config.weatherLongitude !== null;
  const solarConfigured = config.solarPanelTiltDegrees !== null && config.solarPanelAzimuthDegrees !== null;
  const chargerStatus = config.chargerProvider === "mock-charger" ? "mock-charger" : "planning-only";

  logger.info("Setup", `Tibber: ${config.tibberAccessToken !== null ? "configured" : "missing"}`);
  logger.info("Setup", `Tesla OAuth: ${config.teslaOAuthClientId !== null && config.teslaOAuthClientSecret !== null ? "configured" : "missing"}`);
  logger.info("Setup", `Weather: ${weatherConfigured ? "configured" : "missing"}`);
  logger.info("Setup", `Solar: ${solarConfigured ? "configured" : "missing"}`);
  logger.info("Setup", `Charger: ${chargerStatus}`);
  logger.info("TeslaConfig", `external_base_url detected=${config.externalBaseUrl !== null ? "yes" : "no"}`);
  logger.info("TeslaConfig", `external_base_url preview=${config.externalBaseUrl === null ? "not configured" : maskUrlPreview(config.externalBaseUrl)}`);
  logger.info("TeslaConfig", `tesla_public_callback_url detected=${config.teslaPublicCallbackUrl !== null ? "yes" : "no"}`);
  logger.info("TeslaConfig", `tesla_public_callback_url preview=${config.teslaPublicCallbackUrl === null ? "not configured" : maskUrlPreview(config.teslaPublicCallbackUrl)}`);
  logger.info("TeslaConfig", `temporary access token configured=${config.teslaAccessToken !== null ? "yes" : "no"}`);
  logger.info("TeslaConfig", `dev mode=${config.devMode ? "yes" : "no"}`);
}

function createConfigDiagnostics(config: AppConfig, request: IncomingMessage) {
  const teslaOAuthConfigured =
    config.teslaOAuthClientId !== null
    && config.teslaOAuthClientSecret !== null
    && config.teslaPublicCallbackUrl !== null;
  const callbackInfo = createTeslaCallbackInfo(request, config);

  return {
    tibberAccessTokenConfigured: config.tibberAccessToken !== null,
    tibberAccessTokenLength: config.tibberAccessToken?.length ?? 0,
    tibberHomeIdConfigured: config.tibberHomeId !== null,
    teslaOAuthConfigured,
    teslaClientIdConfigured: config.teslaOAuthClientId !== null,
    teslaClientIdLength: config.teslaOAuthClientId?.length ?? 0,
    teslaClientSecretConfigured: config.teslaOAuthClientSecret !== null,
    teslaClientSecretLength: config.teslaOAuthClientSecret?.length ?? 0,
    teslaRegion: config.teslaRegion,
    teslaTemporaryAccessTokenConfigured: config.teslaAccessToken !== null,
    devMode: config.devMode,
    teslaPublicCallbackUrlConfigured: config.teslaPublicCallbackUrl !== null,
    teslaPublicCallbackUrl: config.teslaPublicCallbackUrl === null ? null : maskUrl(config.teslaPublicCallbackUrl),
    externalBaseUrlConfigured: config.externalBaseUrl !== null,
    externalBaseUrl: config.externalBaseUrl === null ? null : maskUrl(config.externalBaseUrl),
    externalBaseUrlPreview: config.externalBaseUrl === null ? null : maskUrlPreview(config.externalBaseUrl),
    oauthEnabled: teslaOAuthConfigured,
    ingressInfo: {
      selectedCallbackUrl: callbackInfo.callbackUrl === null ? null : maskUrl(callbackInfo.callbackUrl),
      selectedReason: callbackInfo.selectedReason,
      httpsEnabled: callbackInfo.httpsEnabled,
      publiclyReachable: callbackInfo.publiclyReachable,
      ingressDetected: callbackInfo.ingressDetected,
      nabuCasaDetected: callbackInfo.nabuCasaDetected,
      ingressCallbackSupported: callbackInfo.ingressCallbackSupported,
      publicCallbackConfigured: callbackInfo.publicCallbackConfigured,
      warnings: callbackInfo.warnings,
    },
  };
}

function formatTeslaLastErrorSummary(): string {
  const lastError = getTeslaOAuthFleetLastError();
  if (lastError.lastStep === null) {
    return "No Tesla OAuth or Fleet API step recorded yet.";
  }

  return [
    `step=${lastError.lastStep}`,
    `status=${lastError.httpStatus ?? "unknown"}`,
    `error=${lastError.safeError ?? "none"}`,
  ].join(", ");
}

function createTeslaOAuthStatus() {
  const status = getTeslaOAuthFleetLastError();
  return {
    lastStep: status.lastStep,
    lastHttpStatus: status.httpStatus,
    lastSafeError: status.safeError,
    redirectUriUsed: status.redirectUriUsed,
    tokenEndpoint: status.tokenEndpoint,
    fleetApiBaseUrl: status.fleetApiBaseUrl,
    scopesRequested: status.scopesRequested,
    tokenExchangeSucceeded: status.tokenExchangeSuccess,
    vehiclesFetchSucceeded: status.vehiclesFetchSuccess,
    vehicleDataFetchSucceeded: status.vehicleDataFetchSuccess,
    lastCallbackAt: status.lastCallbackAt,
    lastTokenExchangeAt: status.lastTokenExchangeAt,
    lastFleetFetchAt: status.lastFleetFetchAt,
  };
}

interface SupportEvent {
  message: string;
  recordedAt: string;
}

interface SupportRuntimeState {
  lastApiError: SupportEvent | null;
  lastOAuthError: SupportEvent | null;
  lastBuildConfigWarning: string | null;
}

function createSupportDiagnostics(
  request: IncomingMessage,
  config: AppConfig,
  onboarding: StartupOnboarding,
  authService: ProviderAuthService,
  runtime: SupportRuntimeState,
): SupportDiagnostics {
  const callbackInfo = createTeslaCallbackInfo(request, config);
  const tibberStatus = authService.getConnectionStatus("tibber");
  const teslaStatus = authService.getConnectionStatus("tesla");
  const teslaLastError = getTeslaOAuthFleetLastError();
  return {
    appVersion,
    addonVersion: appVersion,
    providerStatus: {
      electricityPriceProvider: config.electricityPriceProvider,
      homeTelemetryProvider: config.homeTelemetryProvider,
      vehicleStateProvider: config.vehicleStateProvider,
      weatherForecastProvider: config.weatherForecastProvider,
      chargerProvider: config.chargerProvider ?? "planning-only",
    },
    tibberConnected: tibberStatus.connected,
    teslaOAuthConfigured: teslaStatus.oauthConfigured,
    teslaConnected: teslaStatus.connected,
    lastApiError: formatSupportEvent(runtime.lastApiError),
    lastOAuthError: formatSupportEvent(runtime.lastOAuthError) ?? teslaLastError.safeError,
    lastBuildConfigWarning: runtime.lastBuildConfigWarning,
    currentFallbackMode: {
      demoMode: onboarding.demoMode,
      planningOnlyMode: onboarding.planningOnlyMode,
      description: describeFallbackMode(onboarding),
    },
    homeAssistant: {
      detectedIngressUrl: maskUrl(callbackInfo.ingressBaseUrl),
      generatedTeslaCallbackUrl: callbackInfo.callbackUrl === null ? "No HTTPS callback URL selected" : maskUrl(callbackInfo.callbackUrl),
      currentRequestUrl: maskUrl(createRequestUrl(request)),
    },
    setupNotes: [...onboarding.setupWarnings, ...onboarding.setupMessages].map(maskSensitiveText),
  };
}

function createSupportReport(diagnostics: SupportDiagnostics, advice: SupportAdvice): string {
  const payload = {
    generatedAt: new Date().toISOString(),
    diagnostics,
    advice,
  };
  return maskSensitiveText(JSON.stringify(payload, null, 2));
}

function createLastBuildConfigWarning(config: AppConfig, onboarding: StartupOnboarding): string | null {
  return [
    ...config.setupNotes,
    ...onboarding.setupWarnings,
    ...onboarding.setupMessages,
  ].at(-1) ?? null;
}

function createSupportEvent(message: string): SupportEvent {
  return {
    message: maskSensitiveText(message),
    recordedAt: new Date().toISOString(),
  };
}

function formatSupportEvent(event: SupportEvent | null): string | null {
  return event === null ? null : `${event.message} at ${event.recordedAt}`;
}

function describeFallbackMode(onboarding: StartupOnboarding): string {
  if (onboarding.demoMode && onboarding.planningOnlyMode) {
    return "Demo mode with planning-only charger control.";
  }

  if (onboarding.demoMode) {
    return "Demo mode - no data is saved.";
  }

  if (onboarding.planningOnlyMode) {
    return "Planning-only charger control.";
  }

  return "Configured mode.";
}

function createRequestUrl(request: IncomingMessage): string {
  const host = firstHeader(request, "x-forwarded-host") ?? firstHeader(request, "host") ?? "localhost:3000";
  const proto = firstHeader(request, "x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}${request.url ?? "/"}`;
}

function maskUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    const path = url.pathname.replace(/\/api\/hassio_ingress\/[^/]+/, "/api/hassio_ingress/[masked]");
    return `${url.protocol}//${maskHost(url.hostname)}${url.port === "" ? "" : `:${url.port}`}${path}`;
  } catch {
    return maskSensitiveText(value);
  }
}

function maskUrlPreview(value: string): string {
  try {
    const url = new URL(value);
    const hostParts = url.hostname.split(".");
    const firstPart = hostParts[0] ?? "";
    const maskedFirstPart = firstPart.length <= 4 ? firstPart : `${firstPart.slice(0, 4)}...`;
    const host = hostParts.length <= 1 ? maskedFirstPart : [maskedFirstPart, ...hostParts.slice(1)].join(".");
    return `${url.protocol}//${host}`;
  } catch {
    return "[invalid url]";
  }
}

function maskHost(host: string): string {
  if (host === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return host;
  }

  const parts = host.split(".");
  if (parts.length <= 2) {
    return "[masked-host]";
  }

  return `[masked].${parts.slice(-2).join(".")}`;
}

function maskSensitiveText(value: string): string {
  return value
    .replace(/(access[_-]?token["']?\s*[:=]\s*["']?)[^"',\s]+/gi, "$1[masked]")
    .replace(/(accessToken["']?\s*[:=]\s*["']?)[^"',\s]+/g, "$1[masked]")
    .replace(/(refresh[_-]?token["']?\s*[:=]\s*["']?)[^"',\s]+/gi, "$1[masked]")
    .replace(/(refreshToken["']?\s*[:=]\s*["']?)[^"',\s]+/g, "$1[masked]")
    .replace(/(client[_-]?secret["']?\s*[:=]\s*["']?)[^"',\s]+/gi, "$1[masked]")
    .replace(/(clientSecret["']?\s*[:=]\s*["']?)[^"',\s]+/g, "$1[masked]")
    .replace(/(authorization[_-]?code["']?\s*[:=]\s*["']?)[^"',\s]+/gi, "$1[masked]")
    .replace(/(code["']?\s*[:=]\s*["']?)[A-Za-z0-9._~/-]{12,}/gi, "$1[masked]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~/-]+/gi, "$1[masked]");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
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

function writeAuthResultHtml(
  response: ServerResponse,
  statusCode: number,
  title: string,
  messages: string[],
  backHref: string,
  teslaDebugHref: string | null = null,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/html; charset=utf-8");
  const items = messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("");
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: system-ui, sans-serif; line-height: 1.4; margin: 2rem; }
      a { color: #0f766e; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <ul>${items}</ul>
    ${teslaDebugHref === null ? "" : `<p><a href="${escapeHtml(teslaDebugHref)}">Open Tesla OAuth debug</a></p>`}
    <p><a href="${escapeHtml(backHref)}">Back to Energy Manager</a></p>
  </body>
</html>`);
}

function writeTeslaManualTokenHelperHtml(
  response: ServerResponse,
  config: AppConfig,
  redirectUri: string | null,
  tokenResult: { accessToken: string; refreshToken: string | null; expiresIn: number | null } | null,
  error: string | null,
): void {
  response.statusCode = config.devMode ? 200 : 403;
  response.setHeader("content-type", "text/html; charset=utf-8");
  const resultHtml = tokenResult === null
    ? ""
    : `<section>
      <h2>Token exchange result</h2>
      <p><strong>Do not share this token.</strong></p>
      <label for="access-token">Access token</label>
      <textarea id="access-token" rows="6" readonly>${escapeHtml(tokenResult.accessToken)}</textarea>
      <p><button type="button" data-copy-target="access-token">Copy access token</button></p>
      <p>expires_in: ${tokenResult.expiresIn === null ? "not provided" : tokenResult.expiresIn}</p>
      ${tokenResult.refreshToken === null ? "" : `<button type="button" id="show-refresh-token">Show refresh token</button>
      <div id="refresh-token-wrap" hidden>
        <label for="refresh-token">Refresh token</label>
        <textarea id="refresh-token" rows="6" readonly>${escapeHtml(tokenResult.refreshToken)}</textarea>
        <p><button type="button" data-copy-target="refresh-token">Copy refresh token</button></p>
      </div>`}
    </section>`;
  const errorHtml = error === null ? "" : `<p role="alert" style="color:#b91c1c">${escapeHtml(error)}</p>`;
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tesla manual token helper</title>
    <style>
      body { font-family: system-ui, sans-serif; line-height: 1.4; margin: 2rem; }
      textarea, input { box-sizing: border-box; width: 100%; max-width: 720px; }
      textarea { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
      button { cursor: pointer; padding: 0.65rem 0.9rem; }
      dt { font-weight: 700; margin-top: 0.75rem; }
      dd { margin-left: 0; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <h1>Tesla manual token helper</h1>
    <p><strong>Development only.</strong> Do not share this token.</p>
    <dl>
      <dt>DEV_MODE enabled</dt><dd>${config.devMode ? "yes" : "no"}</dd>
      <dt>Client ID configured</dt><dd>${config.teslaOAuthClientId === null ? "no" : "yes"}</dd>
      <dt>Redirect URI</dt><dd>${escapeHtml(redirectUri ?? "not configured")}</dd>
    </dl>
    ${config.devMode ? `<form method="post">
      <label for="authorization-code">Authorization code</label>
      <input id="authorization-code" name="authorization_code" autocomplete="off" required />
      <p><button type="submit">Exchange code</button></p>
    </form>` : "<p>Manual token exchange is disabled unless DEV_MODE=true.</p>"}
    ${errorHtml}
    ${config.devMode ? resultHtml : ""}
    <p><a href="../../auth/tesla/start-debug">Back to Tesla OAuth debug</a></p>
    <script>
      async function copyFromTextarea(textareaId, button) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;
        await navigator.clipboard.writeText(textarea.value);
        button.textContent = "Copied";
      }
      document.querySelectorAll("[data-copy-target]").forEach((button) => {
        button.addEventListener("click", () => copyFromTextarea(button.getAttribute("data-copy-target"), button));
      });
      document.getElementById("show-refresh-token")?.addEventListener("click", (event) => {
        document.getElementById("refresh-token-wrap").hidden = false;
        event.currentTarget.hidden = true;
      });
    </script>
  </body>
</html>`);
}

interface TeslaCallbackInfo {
  ingressBaseUrl: string;
  callbackUrl: string | null;
  selectedReason: string;
  httpsEnabled: boolean;
  publiclyReachable: boolean;
  ingressDetected: boolean;
  nabuCasaDetected: boolean;
  ingressCallbackSupported: boolean;
  publicCallbackConfigured: boolean;
  warnings: string[];
  candidates: TeslaCallbackCandidate[];
}

interface TeslaCallbackCandidate {
  source:
    | "tesla_public_callback_url"
    | "external_base_url"
    | "nabu_casa_url"
    | "home_assistant_external_url"
    | "ingress_https_url"
    | "development_local_callback";
  baseUrl: string;
  callbackUrl: string;
  reason: string;
  https: boolean;
  publiclyReachable: boolean;
  ingressDetected: boolean;
  nabuCasaDetected: boolean;
  warnings: string[];
  selected: boolean;
}

interface TeslaCallbackResult {
  callbackHit: boolean;
  tokenExchangeSuccess: boolean;
  vehicleFetchAttempted: boolean;
  message: string;
  recordedAt: string | null;
}

function createTeslaCallbackInfo(request: IncomingMessage, config?: AppConfig): TeslaCallbackInfo {
  const selection = selectTeslaCallback(request, config);
  const ingressBaseUrl = selection.selected?.baseUrl ?? selection.candidates[0]?.baseUrl ?? detectLocalFallbackBaseUrl(request);
  return {
    ingressBaseUrl,
    callbackUrl: selection.selected?.callbackUrl ?? null,
    selectedReason: selection.selected?.reason ?? "No public Tesla callback URL was configured.",
    httpsEnabled: selection.selected?.https ?? false,
    publiclyReachable: selection.selected?.publiclyReachable ?? false,
    ingressDetected: selection.candidates.some((candidate) => candidate.ingressDetected),
    nabuCasaDetected: selection.candidates.some((candidate) => candidate.nabuCasaDetected),
    ingressCallbackSupported: false,
    publicCallbackConfigured: config?.teslaPublicCallbackUrl !== null && config?.teslaPublicCallbackUrl !== undefined,
    warnings: selection.warnings,
    candidates: selection.candidates.map((candidate) => ({
      ...candidate,
      selected: selection.selected?.callbackUrl === candidate.callbackUrl,
    })),
  };
}

function selectTeslaCallback(
  request: IncomingMessage,
  config: AppConfig | undefined,
): { selected: TeslaCallbackCandidate | null; candidates: TeslaCallbackCandidate[]; warnings: string[] } {
  const candidates = createTeslaCallbackCandidates(request, config);
  const selected = candidates.find((candidate) => isSelectableTeslaCallbackCandidate(candidate, config)) ?? null;
  const warnings = [
    "Tesla callbacks cannot use Home Assistant Ingress because Tesla returns without HA session headers.",
    ...(selected === null ? ["Tesla OAuth requires a public callback URL, for example through Nabu Casa ingress alternative, reverse proxy, or cloud relay."] : []),
    ...(selected !== null && !selected.publiclyReachable ? ["Selected callback may not be publicly reachable."] : []),
    ...(selected?.callbackUrl.includes("/api/hassio_ingress/") === true ? ["Selected redirect URI contains /api/hassio_ingress and will fail behind Home Assistant Ingress."] : []),
    ...(selected !== null ? selected.warnings : []),
  ];
  return { selected, candidates, warnings };
}

function isSelectableTeslaCallbackCandidate(candidate: TeslaCallbackCandidate, config: AppConfig | undefined): boolean {
  if (candidate.source === "tesla_public_callback_url") {
    return candidate.https && !candidate.ingressDetected && candidate.publiclyReachable;
  }

  if (candidate.source === "development_local_callback") {
    return process.env.NODE_ENV === "development" && config?.teslaAllowInsecureCallback === true;
  }

  return false;
}

function createTeslaCallbackCandidates(request: IncomingMessage, config: AppConfig | undefined): TeslaCallbackCandidate[] {
  const candidates: TeslaCallbackCandidate[] = [];
  const addCandidate = (
    source: TeslaCallbackCandidate["source"],
    callbackUrl: string | null,
    reason: string,
    extraWarnings: string[] = [],
  ): void => {
    const normalized = normalizeCallbackUrl(callbackUrl);
    if (normalized === null || candidates.some((candidate) => candidate.callbackUrl === normalized)) {
      return;
    }

    candidates.push(createTeslaCallbackCandidate(source, normalized, reason, extraWarnings));
  };

  addCandidate(
    "tesla_public_callback_url",
    config?.teslaPublicCallbackUrl ?? null,
    "Dedicated public Tesla callback URL configured.",
  );

  const externalBaseUrl = config?.externalBaseUrl ?? null;
  const nabuCasaUrl = config?.nabuCasaUrl ?? null;
  const externalBaseWarnings = externalBaseUrl !== null && nabuCasaUrl !== null
    ? ["Both external_base_url and nabu_casa_url are set. Using external_base_url."]
    : [];
  addCandidate(
    "external_base_url",
    callbackFromBaseUrl(applyIngressPath(externalBaseUrl, request)),
    "Manual external_base_url configured for UI/diagnostics only; it is not used for Tesla OAuth callbacks.",
    ["Ingress callbacks are not supported for Tesla OAuth.", ...externalBaseWarnings],
  );
  if (externalBaseUrl === null && nabuCasaUrl !== null) {
    addCandidate(
      "nabu_casa_url",
      callbackFromBaseUrl(applyIngressPath(nabuCasaUrl, request)),
      "Deprecated nabu_casa_url configured for UI/diagnostics only.",
      ["nabu_casa_url is deprecated. Use external_base_url instead.", "Ingress callbacks are not supported for Tesla OAuth."],
    );
  }

  const externalUrl = config?.homeAssistantExternalUrl ?? null;
  if (isNabuCasaUrl(externalUrl)) {
    addCandidate("home_assistant_external_url", callbackFromBaseUrl(externalUrl), "Home Assistant external URL is a Nabu Casa URL. It is diagnostic only for Tesla OAuth.");
  } else {
    addCandidate("home_assistant_external_url", callbackFromBaseUrl(externalUrl), "Home Assistant external URL configured. It is diagnostic only for Tesla OAuth.");
  }

  addCandidate("ingress_https_url", callbackFromBaseUrl(detectIngressBaseUrl(request, true)), "HTTPS Home Assistant ingress URL detected from request headers. It is not usable as a Tesla OAuth callback.");
  if (process.env.NODE_ENV === "development") {
    addCandidate("development_local_callback", "http://localhost:3000/api/auth/tesla/callback", "Local development callback. Use only with NODE_ENV=development.");
  }
  return candidates;
}

function createTeslaCallbackCandidate(
  source: TeslaCallbackCandidate["source"],
  callbackUrl: string,
  reason: string,
  extraWarnings: string[] = [],
): TeslaCallbackCandidate {
  const url = new URL(callbackUrl);
  const urlWarnings = createCallbackWarnings(url);
  const warnings = [...extraWarnings, ...urlWarnings];
  return {
    source,
    baseUrl: `${url.origin}${url.pathname.replace(/\/api\/auth\/tesla\/callback\/?$/, "")}`.replace(/\/+$/, ""),
    callbackUrl,
    reason,
    https: url.protocol === "https:",
    publiclyReachable: url.protocol === "https:" && urlWarnings.length === 0,
    ingressDetected: url.pathname.includes("/api/hassio_ingress/"),
    nabuCasaDetected: isNabuCasaUrl(callbackUrl),
    warnings,
    selected: false,
  };
}

function callbackFromBaseUrl(baseUrl: string | null): string | null {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized === null ? null : `${normalized}/api/auth/tesla/callback`;
}

function normalizeCallbackUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }

  try {
    const url = new URL(value.trim());
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

function detectIngressBaseUrl(request: IncomingMessage, httpsOnly: boolean): string | null {
  const referer = firstHeader(request, "referer");
  const refererBase = extractIngressBaseFromUrl(referer);
  if (refererBase !== null && (!httpsOnly || refererBase.startsWith("https://"))) {
    return refererBase;
  }

  const forwardedPrefix = firstHeader(request, "x-ingress-path")
    ?? firstHeader(request, "x-forwarded-prefix")
    ?? firstHeader(request, "x-external-prefix")
    ?? "";
  const forwardedHost = firstHeader(request, "x-forwarded-host") ?? firstHeader(request, "host") ?? "localhost:3000";
  const forwardedProto = firstHeader(request, "x-forwarded-proto") ?? (forwardedHost.includes("localhost") ? "http" : "https");
  const baseUrl = `${forwardedProto}://${forwardedHost}${normalizeUrlPath(forwardedPrefix)}`.replace(/\/+$/, "");
  return !httpsOnly || baseUrl.startsWith("https://") ? baseUrl : null;
}

function detectLocalFallbackBaseUrl(request: IncomingMessage): string {
  return detectIngressBaseUrl(request, false) ?? "http://localhost:3000";
}

function extractIngressBaseFromUrl(value: string | null): string | null {
  if (value === null || value.trim() === "") {
    return null;
  }

  try {
    const url = new URL(value);
    const ingressMatch = /^(.*\/api\/hassio_ingress\/[^/]+)/.exec(url.pathname);
    if (ingressMatch?.[1] !== undefined) {
      return `${url.origin}${ingressMatch[1]}`.replace(/\/+$/, "");
    }

    return `${url.origin}${url.pathname.replace(/\/(?:auth|api)\/.*$/, "").replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

function applyIngressPath(externalBaseUrl: string | null, request: IncomingMessage): string | null {
  const normalizedExternalBaseUrl = normalizeBaseUrl(externalBaseUrl);
  if (normalizedExternalBaseUrl === null) {
    return null;
  }

  if (normalizedExternalBaseUrl.includes("/api/hassio_ingress/")) {
    return normalizedExternalBaseUrl;
  }

  const ingressPath = detectIngressPath(request);
  return ingressPath === null ? normalizedExternalBaseUrl : `${normalizedExternalBaseUrl}${ingressPath}`;
}

function detectIngressPath(request: IncomingMessage): string | null {
  const refererBase = extractIngressBaseFromUrl(firstHeader(request, "referer"));
  if (refererBase !== null) {
    try {
      const refererUrl = new URL(refererBase);
      const ingressMatch = /^(\/api\/hassio_ingress\/[^/]+)/.exec(refererUrl.pathname);
      if (ingressMatch?.[1] !== undefined) {
        return ingressMatch[1];
      }
    } catch {
      return null;
    }
  }

  const forwardedPrefix = firstHeader(request, "x-ingress-path")
    ?? firstHeader(request, "x-forwarded-prefix")
    ?? firstHeader(request, "x-external-prefix");
  if (forwardedPrefix !== null && forwardedPrefix.includes("/api/hassio_ingress/")) {
    const match = /^(.*?\/api\/hassio_ingress\/[^/]+)/.exec(normalizeUrlPath(forwardedPrefix));
    return match?.[1] ?? null;
  }

  const requestPathMatch = /^(\/api\/hassio_ingress\/[^/]+)/.exec(new URL(request.url ?? "/", "http://localhost").pathname);
  return requestPathMatch?.[1] ?? null;
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }

  try {
    const url = new URL(value.trim());
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function createCallbackWarnings(url: URL): string[] {
  return [
    url.protocol !== "https:" ? "Callback URL uses http://. Tesla OAuth requires HTTPS unless developer override is enabled." : null,
    isLocalHost(url.hostname) ? "Callback URL uses localhost." : null,
    isPrivateIp(url.hostname) ? "Callback URL uses a local/private IP address." : null,
    url.hostname.endsWith(".local") ? "Callback URL uses a .local hostname." : null,
    url.pathname.includes("/api/hassio_ingress/") ? "Callback URL contains /api/hassio_ingress and will fail because Tesla returns without Home Assistant session headers." : null,
  ].filter((warning): warning is string => warning !== null);
}

function isNabuCasaUrl(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  try {
    return new URL(value).hostname.endsWith(".ui.nabu.casa");
  } catch {
    return false;
  }
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isPrivateIp(hostname: string): boolean {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4 === null) {
    return false;
  }

  const first = Number(ipv4[1]);
  const second = Number(ipv4[2]);
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254);
}

function normalizeUrlPath(value: string): string {
  if (value.trim() === "" || value === "/") {
    return "";
  }

  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

function firstHeader(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function writeTeslaStartDebugHtml(
  response: ServerResponse,
  diagnostics: ProviderOAuthDiagnostics,
  authStart: AuthStartResult,
  callbackInfo: TeslaCallbackInfo,
  backHref: string,
): void {
  response.statusCode = 200;
  response.setHeader("content-type", "text/html; charset=utf-8");
  const validation = validateTeslaAuthorizationUrl(authStart.authorizationUrl);
  const missing = diagnostics.missingConfig.length === 0
    ? "<li>None</li>"
    : diagnostics.missingConfig.map((message) => `<li>${escapeHtml(message)}</li>`).join("");
  const validationErrors = validation.missing.length === 0
    ? "<li>None</li>"
    : validation.missing.map((message) => `<li>${escapeHtml(message)}</li>`).join("");
  const callbackWarnings = callbackInfo.warnings.length === 0
    ? "<li>None</li>"
    : callbackInfo.warnings.map((message) => `<li>${escapeHtml(message)}</li>`).join("");
  const callbackCandidates = callbackInfo.candidates
    .map((candidate) => `<li>${candidate.selected ? "<strong>Selected:</strong> " : ""}${escapeHtml(candidate.source)} - ${escapeHtml(candidate.callbackUrl)} (${candidate.reason}; HTTPS: ${candidate.https ? "yes" : "no"}; public: ${candidate.publiclyReachable ? "yes" : "no"})${candidate.warnings.length === 0 ? "" : ` Warnings: ${escapeHtml(candidate.warnings.join(" "))}`}</li>`)
    .join("");
  const variants = createTeslaAuthorizationUrlVariants(authStart.authorizationUrl);
  const variantCards = variants.length === 0
    ? "<p>No variants available because no authorization URL was generated.</p>"
    : variants.map(renderTeslaAuthorizationVariant).join("");
  const oauthStatus = createTeslaOAuthStatus();
  const oauthStatusRows = [
    ["lastStep", oauthStatus.lastStep ?? "none"],
    ["lastHttpStatus", oauthStatus.lastHttpStatus === null ? "none" : String(oauthStatus.lastHttpStatus)],
    ["lastSafeError", oauthStatus.lastSafeError ?? "none"],
    ["redirectUriUsed", oauthStatus.redirectUriUsed ?? "none"],
    ["tokenEndpoint", oauthStatus.tokenEndpoint],
    ["fleetApiBaseUrl", oauthStatus.fleetApiBaseUrl],
    ["scopesRequested", oauthStatus.scopesRequested.join(" ")],
    ["tokenExchangeSucceeded", formatNullableBoolean(oauthStatus.tokenExchangeSucceeded)],
    ["vehiclesFetchSucceeded", formatNullableBoolean(oauthStatus.vehiclesFetchSucceeded)],
    ["vehicleDataFetchSucceeded", formatNullableBoolean(oauthStatus.vehicleDataFetchSucceeded)],
    ["lastCallbackAt", oauthStatus.lastCallbackAt ?? "none"],
    ["lastTokenExchangeAt", oauthStatus.lastTokenExchangeAt ?? "none"],
    ["lastFleetFetchAt", oauthStatus.lastFleetFetchAt ?? "none"],
  ].map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("");
  const escapedAuthorizationUrl = authStart.authorizationUrl === null ? "" : escapeHtml(authStart.authorizationUrl);
  const authUrlControls = authStart.authorizationUrl === null
    ? "<p>No authorization URL generated.</p>"
    : `<label for="authorization-url">Generated authorization URL</label>
    <textarea id="authorization-url" rows="8" readonly>${escapedAuthorizationUrl}</textarea>
    <p><button type="button" id="copy-authorization-url">Copy authorization URL</button></p>
    <p><a id="open-authorization-url" href="${escapedAuthorizationUrl}">Open Tesla login</a></p>
    <dl>
      <dt>Raw link href</dt><dd>${escapedAuthorizationUrl}</dd>
    </dl>`;
  logger.info("TeslaAuth", `generated authorizationUrl value=${authStart.authorizationUrl ?? "not generated"}`);
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tesla OAuth debug</title>
    <style>
      body { font-family: system-ui, sans-serif; line-height: 1.4; margin: 2rem; }
      dt { font-weight: 700; margin-top: 0.75rem; }
      dd { margin-left: 0; overflow-wrap: anywhere; }
      textarea { box-sizing: border-box; font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; max-width: 100%; width: 100%; }
      button { cursor: pointer; padding: 0.65rem 0.9rem; }
      .variant { border: 1px solid #d1d5db; border-radius: 8px; margin: 1rem 0; padding: 1rem; }
      .variant h3 { margin-top: 0; }
      .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0.75rem 0; }
      a { color: #0f766e; }
    </style>
  </head>
  <body>
    <h1>Tesla OAuth debug</h1>
    <dl>
      <dt>OAuth configured</dt><dd>${diagnostics.configured ? "yes" : "no"}</dd>
      <dt>Client ID configured</dt><dd>${diagnostics.clientIdConfigured ? "yes" : "no"}</dd>
      <dt>Client secret configured</dt><dd>${diagnostics.clientSecretConfigured ? "yes" : "no"}</dd>
      <dt>Public callback URL configured</dt><dd>${callbackInfo.publicCallbackConfigured ? "yes" : "no"}</dd>
      <dt>Ingress callback supported</dt><dd>${callbackInfo.ingressCallbackSupported ? "yes" : "no"}</dd>
      <dt>external_base_url configured</dt><dd>${callbackInfo.candidates.some((candidate) => candidate.source === "external_base_url") ? "yes" : "no"}</dd>
      <dt>External URL field used</dt><dd>${escapeHtml(callbackSourceLabel(callbackInfo.candidates.find((candidate) => candidate.selected)?.source ?? null))}</dd>
      <dt>Selected callback URL</dt><dd>${escapeHtml(callbackInfo.callbackUrl ?? "No HTTPS callback URL selected")}</dd>
      <dt>Why selected</dt><dd>${escapeHtml(callbackInfo.selectedReason)}</dd>
      <dt>HTTPS enabled</dt><dd>${callbackInfo.httpsEnabled ? "yes" : "no"}</dd>
      <dt>Publicly reachable</dt><dd>${callbackInfo.publiclyReachable ? "yes" : "no"}</dd>
      <dt>Nabu Casa detected</dt><dd>${callbackInfo.nabuCasaDetected ? "yes" : "no"}</dd>
      <dt>Ingress detected</dt><dd>${callbackInfo.ingressDetected ? "yes" : "no"}</dd>
      <dt>Detected ingress URL</dt><dd>${escapeHtml(callbackInfo.ingressBaseUrl)}</dd>
      <dt>EXACT redirect URI for Tesla Developer Console</dt><dd>${escapeHtml(callbackInfo.callbackUrl ?? "No HTTPS callback URL selected")}</dd>
      <dt>Authorization URL redirect_uri matches generated callback</dt><dd>${authStart.redirectUri === callbackInfo.callbackUrl ? "yes" : "no"}</dd>
      <dt>Scopes</dt><dd>${escapeHtml(diagnostics.scopes.join(" "))}</dd>
      <dt>Authorization URL generated</dt><dd>${authStart.authorizationUrl === null ? "no" : "yes"}</dd>
      <dt>State generated</dt><dd>${authStart.stateGenerated ? "yes" : "no"}</dd>
      <dt>Authorization URL valid</dt><dd>${validation.valid ? "yes" : "no"}</dd>
    </dl>
    <h2>Important callback note</h2>
    <p>Tesla callbacks cannot use Home Assistant Ingress because Tesla returns without HA session headers.</p>
    <p>Use a public callback URL instead, for example through a reverse proxy or cloud relay. Set <code>tesla_public_callback_url</code> to the exact callback URL registered in Tesla Developer Console.</p>
    <h2>Missing config</h2>
    <ul>${missing}</ul>
    <h2>Callback warnings</h2>
    <ul>${callbackWarnings}</ul>
    <h2>Callback candidates</h2>
    <ul>${callbackCandidates || "<li>None</li>"}</ul>
    <h2>Latest OAuth/Fleet status</h2>
    <p>This is embedded here so normal debugging does not depend on a separate JSON endpoint.</p>
    <p><button type="button" onclick="window.location.reload()">Refresh diagnostics</button></p>
    <dl>${oauthStatusRows}</dl>
    <h2>Direct diagnostics</h2>
    <div class="actions">
      <a href="../../debug/tesla/oauth-status">Open OAuth status JSON</a>
      <a href="../../debug/tesla/callback-selection">Open callback diagnostics</a>
      <a href="../../debug/config">Open config diagnostics</a>
      <a href="../../debug/tesla/manual-token-helper">Open manual token helper</a>
    </div>
    <dl>
      <dt>OAuth status path</dt><dd>/debug/tesla/oauth-status</dd>
      <dt>Callback diagnostics path</dt><dd>/debug/tesla/callback-selection</dd>
      <dt>Config diagnostics path</dt><dd>/debug/config</dd>
    </dl>
    <label for="tesla-callback-url">Copy this redirect URI into Tesla Developer Console</label>
    <textarea id="tesla-callback-url" rows="3" readonly>${escapeHtml(callbackInfo.callbackUrl ?? "")}</textarea>
    <p><button type="button" data-copy-target="tesla-callback-url">Copy redirect URI</button></p>
    <h2>Authorization URL validation</h2>
    <ul>${validationErrors}</ul>
    ${authUrlControls}
    <h2>Tesla login variants</h2>
    ${variantCards}
    <p><a href="${escapeHtml(backHref)}">Back to Energy Manager</a></p>
    <script>
      async function copyFromTextarea(textareaId, button) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;
        try {
          await navigator.clipboard.writeText(textarea.value);
          button.textContent = "Copied";
        } catch (_error) {
          textarea.select();
          document.execCommand("copy");
          button.textContent = "Copied";
        }
      }

      function logVariantClick(variant) {
        console.log("[TeslaOAuthDebug] variant clicked", variant);
        const payload = JSON.stringify({ variant });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("../../debug/tesla/oauth-variant-click", new Blob([payload], { type: "application/json" }));
          return;
        }
        fetch("../../debug/tesla/oauth-variant-click", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => undefined);
      }

      document.querySelectorAll("[data-copy-target]").forEach((button) => {
        button.addEventListener("click", () => copyFromTextarea(button.getAttribute("data-copy-target"), button));
      });

      document.querySelectorAll("[data-oauth-variant]").forEach((link) => {
        link.addEventListener("click", () => logVariantClick(link.getAttribute("data-oauth-variant")));
      });
    </script>
  </body>
</html>`);
}

function renderTeslaAuthorizationVariant(variant: TeslaAuthorizationUrlVariant): string {
  const escapedUrl = escapeHtml(variant.authorizationUrl);
  const parameterRows = Object.entries(variant.decodedParameters)
    .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
  const validationRows = variant.validation.missing.length === 0
    ? "<li>None</li>"
    : variant.validation.missing.map((message) => `<li>${escapeHtml(message)}</li>`).join("");
  return `<section class="variant">
    <h3>${escapeHtml(variant.label)}</h3>
    <p>Valid: ${variant.validation.valid ? "yes" : "no"}</p>
    <label for="authorization-url-${escapeHtml(variant.id)}">Authorization URL</label>
    <textarea id="authorization-url-${escapeHtml(variant.id)}" rows="7" readonly>${escapedUrl}</textarea>
    <div class="actions">
      <button type="button" data-copy-target="authorization-url-${escapeHtml(variant.id)}">Copy ${escapeHtml(variant.id)}</button>
      <a href="${escapedUrl}" data-oauth-variant="${escapeHtml(variant.id)}">Open Tesla login ${escapeHtml(variant.id)}</a>
    </div>
    <dl>
      <dt>Raw link href</dt><dd>${escapedUrl}</dd>
    </dl>
    <h4>Decoded parameters</h4>
    <dl>${parameterRows}</dl>
    <h4>Validation issues</h4>
    <ul>${validationRows}</ul>
  </section>`;
}

function callbackSourceLabel(source: TeslaCallbackCandidate["source"] | null): string {
  switch (source) {
    case "tesla_public_callback_url":
      return "tesla_public_callback_url";
    case "external_base_url":
      return "external_base_url (diagnostics only)";
    case "nabu_casa_url":
      return "nabu_casa_url (deprecated fallback)";
    case "home_assistant_external_url":
      return "Home Assistant external URL";
    case "ingress_https_url":
      return "HTTPS ingress URL (not supported for callbacks)";
    case "development_local_callback":
      return "Local development callback";
    case null:
      return "None";
  }
}

interface TeslaAuthorizationUrlVariant {
  id: string;
  label: string;
  authorizationUrl: string;
  decodedParameters: Record<string, string>;
  validation: ReturnType<typeof validateTeslaAuthorizationUrl>;
}

function createTeslaAuthorizationUrlVariants(authorizationUrl: string | null): TeslaAuthorizationUrlVariant[] {
  if (authorizationUrl === null) {
    return [];
  }

  const baseUrl = new URL(authorizationUrl);
  baseUrl.searchParams.delete("audience");
  baseUrl.searchParams.delete("prompt");

  return [
    createTeslaAuthorizationUrlVariant("A", "Variant A - minimal", baseUrl),
    createTeslaAuthorizationUrlVariant("B", "Variant B - with audience", baseUrl, {
      audience: "https://fleet-api.prd.eu.vn.cloud.tesla.com",
    }),
    createTeslaAuthorizationUrlVariant("C", "Variant C - with prompt", baseUrl, {
      prompt: "login consent",
    }),
    createTeslaAuthorizationUrlVariant("D", "Variant D - with audience and prompt", baseUrl, {
      audience: "https://fleet-api.prd.eu.vn.cloud.tesla.com",
      prompt: "login consent",
    }),
  ];
}

function createTeslaAuthorizationUrlVariant(
  id: string,
  label: string,
  baseUrl: URL,
  extraParameters: Record<string, string> = {},
): TeslaAuthorizationUrlVariant {
  const url = new URL(baseUrl.toString());
  for (const [key, value] of Object.entries(extraParameters)) {
    url.searchParams.set(key, value);
  }

  const authorizationUrl = url.toString();
  return {
    id,
    label,
    authorizationUrl,
    decodedParameters: Object.fromEntries(url.searchParams.entries()),
    validation: validateTeslaAuthorizationUrl(authorizationUrl),
  };
}

function logTeslaAuthStart(authStart: AuthStartResult): void {
  logger.info("TeslaAuth", `/api/auth/tesla/start called`);
  logger.info("TeslaAuth", `OAuth configured=${authStart.configured}`);
  logger.info("TeslaAuth", `generated authorizationUrl=${authStart.authorizationUrl === null ? "no" : "yes"}`);
  logger.info("TeslaAuth", `redirect_uri used=${authStart.redirectUri ?? "not configured"}`);
  logger.info("TeslaAuth", `scopes used=${authStart.scopes.join(" ")}`);
  logger.info("TeslaAuth", `state generated=${authStart.stateGenerated ? "yes" : "no"}`);
}

function validateTeslaAuthorizationUrl(authorizationUrl: string | null): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (authorizationUrl === null) {
    return { valid: false, missing: ["Authorization URL was not generated."] };
  }

  let url: URL;
  try {
    url = new URL(authorizationUrl);
  } catch {
    return { valid: false, missing: ["Authorization URL is not a valid URL."] };
  }

  if (url.origin !== "https://auth.tesla.com") {
    missing.push("Authorization URL host must be https://auth.tesla.com.");
  }
  if (url.pathname !== "/oauth2/v3/authorize") {
    missing.push("Authorization URL path must be /oauth2/v3/authorize.");
  }

  for (const parameter of ["client_id", "redirect_uri", "scope", "state", "code_challenge"] as const) {
    if ((url.searchParams.get(parameter) ?? "") === "") {
      missing.push(`Missing ${parameter}.`);
    }
  }

  if (url.searchParams.get("response_type") !== "code") {
    missing.push("response_type must be code.");
  }
  if (url.searchParams.get("code_challenge_method") !== "S256") {
    missing.push("code_challenge_method must be S256.");
  }

  return { valid: missing.length === 0, missing };
}

function createBackHref(path: string): string {
  if (path.startsWith("/api/auth/")) {
    return "../../../";
  }

  if (path.startsWith("/auth/")) {
    return "../../";
  }

  return "./";
}

function createTeslaDebugHref(path: string): string {
  if (path.startsWith("/api/auth/")) {
    return "../../../auth/tesla/start-debug";
  }

  if (path.startsWith("/auth/")) {
    return path.startsWith("/auth/tesla/") ? "./start-debug" : "./tesla/start-debug";
  }

  return "./auth/tesla/start-debug";
}

function formatNullableBoolean(value: boolean | null): string {
  if (value === null) {
    return "unknown";
  }

  return value ? "yes" : "no";
}

function getProviderFromPath(path: string): AuthProviderId {
  return path.includes("/tesla/") ? "tesla" : "tibber";
}

function labelProvider(provider: AuthProviderId): string {
  return provider === "tibber" ? "Tibber" : "Tesla";
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

    .support-result {
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
      margin: 12px 0;
    }

    .support-result dt {
      color: var(--muted);
      font-size: 13px;
    }

    .support-result dd {
      margin: 0 0 8px;
      overflow-wrap: anywhere;
      font-weight: 650;
    }

    textarea {
      width: 100%;
      max-width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      color: var(--text);
      background: var(--surface);
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
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
          <dt>Tesla redirect URI</dt>
          <dd id="diag-tesla-redirect-uri">Not configured</dd>
          <dt>Tesla OAuth configured</dt>
          <dd id="diag-tesla-oauth-configured">Unknown</dd>
          <dt>Tesla debug route available</dt>
          <dd id="diag-tesla-debug-route">Unknown</dd>
          <dt>Last Tesla OAuth error</dt>
          <dd id="diag-tesla-oauth-error">None</dd>
          <dt>OAuth token exchange</dt>
          <dd id="diag-tesla-token-exchange">Unknown</dd>
          <dt>Vehicles fetch</dt>
          <dd id="diag-tesla-vehicles-fetch">Unknown</dd>
          <dt>Vehicle data fetch</dt>
          <dd id="diag-tesla-vehicle-data-fetch">Unknown</dd>
          <dt>Last Tesla HTTP status</dt>
          <dd id="diag-tesla-http-status">Unknown</dd>
        </dl>
        <p><a id="tesla-oauth-debug-link" href="./auth/tesla/start-debug">Open Tesla OAuth debug</a></p>
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

      <div class="item connect" id="support-section">
        <span class="label">Support</span>
        <p class="subtle" id="support-summary">Run a safe setup check without sharing secrets.</p>
        <div class="connect-row">
          <button type="button" id="diagnose-setup">Diagnose setup</button>
          <button type="button" id="copy-support-report">Copy support report</button>
        </div>
        <dl class="support-result">
          <dt>Detected issue</dt>
          <dd id="support-detected-issue">Not checked yet</dd>
          <dt>Likely cause</dt>
          <dd id="support-likely-cause">Not checked yet</dd>
          <dt>Next action</dt>
          <dd id="support-next-action">Not checked yet</dd>
        </dl>
        <label class="label" for="support-report">Support report</label>
        <textarea id="support-report" rows="8" readonly>No support report generated yet.</textarea>
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
            <p class="subtle" id="tesla-summary">Using demo vehicle data</p>
            <p class="subtle" id="tesla-vehicle-name">Vehicle: Demo vehicle</p>
            <p class="subtle" id="tesla-battery">Battery: Demo 42%</p>
            <p class="subtle" id="tesla-plugged-in">Plugged in: yes</p>
            <p class="subtle" id="tesla-charging-state">Charging: Stopped</p>
            <p class="subtle" id="tesla-charge-limit">Charge limit: 80%</p>
            <p class="subtle" id="tesla-charger-power">Charging power: 0 kW</p>
            <p class="subtle" id="tesla-time-to-full">Time to full: 0 h</p>
            <p class="subtle" id="tesla-online-state">Vehicle state: Demo mode</p>
            <p class="subtle" id="tesla-last-update">Last update: demo</p>
            <div class="connect-row">
              <button type="button" id="connect-tesla">Connect Tesla</button>
              <a href="./auth/tesla/start-debug">Open Tesla OAuth debug</a>
              <button type="button" id="disconnect-tesla">Disconnect Tesla</button>
              <button type="button" id="refresh-tesla">Refresh Tesla</button>
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
      <div>Energy Manager ${escapeHtml(appVersion)}</div>
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
