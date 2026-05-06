// Requirements: PRD-002, PRD-006, WEB-001, WEB-004, WEB-005, WEB-006, WEB-007, WEB-008, WEB-009, WEB-011, WEB-012, WEB-013, WEB-014, WEB-015, WEB-016, WEB-017, WEB-018, FDB-001, FDB-002, FDB-003, ONB-001, ONB-002, ONB-003, ONB-004, UX-003, UX-004, UX-005, UX-006, UX-007, UX-101, UX-105, EMG-001, OPS-001, OPS-005, ARC-004

import { createServer, type ServerResponse } from "node:http";

import { calculateChargingPlan } from "../charging/ChargingOptimizer.js";
import { EmergencyChargingService } from "../charging/EmergencyChargingService.js";
import { estimateCompletionForTarget } from "../charging/CompletionEstimator.js";
import type { ChargingPlan, ChargingTarget, PriceInterval } from "../charging/types.js";
import { applyUserModePolicy } from "../charging/UserModePolicy.js";
import type { DecisionOutcomeRecord } from "../db/types/persistenceTypes.js";
import { analyzeOutcomes } from "../feedback/DailyFeedbackService.js";
import { MockChargerProvider } from "../providers/mock/MockChargerProvider.js";
import { MockElectricityPriceProvider } from "../providers/mock/MockElectricityPriceProvider.js";
import { ProviderRegistry } from "../providers/ProviderRegistry.js";
import { OpenMeteoWeatherProvider } from "../providers/openMeteo/OpenMeteoWeatherProvider.js";
import { TibberClient } from "../providers/tibber/TibberClient.js";
import { TibberHomeTelemetryProvider, TibberPriceProvider } from "../providers/tibber/TibberProvider.js";
import { loadConfig, type AppConfig } from "./config.js";
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
  logStartupOnboarding([...onboarding.setupWarnings, ...onboarding.setupMessages]);
  assertStartupIsReady(onboarding);

  const registry = createProviderRegistry(config);
  let emergencyOverrideActive = false;

  const server = createServer((request, response) => {
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

    if (request.method === "GET" && path === "/api/plan") {
      void createPlanResponse(config, onboarding, registry, emergencyOverrideActive)
        .then((planResponse) => writeJson(response, 200, planResponse))
        .catch((error: unknown) => writeJson(response, 500, {
          error: error instanceof Error ? error.message : "Unknown error",
        }));
      return;
    }

    if (path === "/api/emergency-charge") {
      if (request.method !== "POST") {
        writeJson(response, 405, { error: "Use POST for emergency charging." });
        return;
      }

      emergencyOverrideActive = true;
      void createPlanResponse(config, onboarding, registry, emergencyOverrideActive)
        .then((planResponse) => writeJson(response, 200, planResponse))
        .catch((error: unknown) => writeJson(response, 500, {
          error: error instanceof Error ? error.message : "Unknown error",
        }));
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderHtml());
  });

  server.listen(config.port, () => {
    console.log(`Smart EV Charging Optimizer listening on port ${config.port}`);
  });
}

// Requirements: PRV-001, PRV-002, PRV-005, WEB-009
function createProviderRegistry(config: ReturnType<typeof loadConfig>): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.registerElectricityPriceProvider(new MockElectricityPriceProvider(prices));

  if (config.chargerProvider === "mock-charger") {
    registry.registerChargerProvider(new MockChargerProvider());
  }

  if (config.tibberAccessToken !== null) {
    const tibberClient = new TibberClient(config.tibberAccessToken);
    const selection = { homeId: config.tibberHomeId };
    registry.registerElectricityPriceProvider(new TibberPriceProvider(tibberClient, selection));
    registry.registerHomeTelemetryProvider(new TibberHomeTelemetryProvider(tibberClient, selection));
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
  emergencyOverrideActive: boolean;
  plan: ChargingPlan;
}

async function createPlanResponse(
  config: AppConfig,
  onboarding: StartupOnboarding,
  registry: ProviderRegistry,
  emergencyOverrideActive: boolean,
): Promise<PlanResponse> {
  const priceProvider = registry.getElectricityPriceProvider(config.electricityPriceProvider);
  if (priceProvider === null) {
    throw new Error(`Unknown electricity price provider: ${config.electricityPriceProvider}`);
  }

  const target = createChargingTarget(config);
  const providerPrices = await priceProvider.getPrices({
    startsAt: "2026-05-05T00:00:00.000Z",
    endsAt: target.departureTime,
  });
  const modeResult = applyUserModePolicy({
    target,
    mode: config.userMode,
  });
  const normalPlan = calculateChargingPlan(providerPrices, modeResult.target);
  const emergencyPlan = emergencyOverrideActive
    ? new EmergencyChargingService().calculate({
      now: providerPrices[0]?.startsAt ?? "2026-05-05T00:00:00.000Z",
      target,
      prices: providerPrices,
    })
    : null;
  const plan = emergencyPlan === null ? normalPlan : emergencyPlan;
  const planReasons = emergencyPlan === null
    ? modeResult.reason.slice(0, 4)
    : [...emergencyPlan.reason, "planning_only_no_hardware_control"].slice(0, 4);
  const completion = emergencyPlan === null
    ? estimateCompletionForTarget(plan.slots[0]?.startsAt ?? providerPrices[0]?.startsAt ?? "2026-05-05T00:00:00.000Z", modeResult.target)
    : {
      approximate: true as const,
      estimatedCompletionTime: emergencyPlan.estimatedCompletionTime,
      estimatedCompletionTimeMin: emergencyPlan.estimatedCompletionTimeMin,
      estimatedCompletionTimeMax: emergencyPlan.estimatedCompletionTimeMax,
      remainingEnergyKwh: emergencyPlan.plannedEnergyKwh + emergencyPlan.deficitKwh,
      effectivePowerKw: target.chargerPowerKw,
      timeNeededHours: (Date.parse(emergencyPlan.estimatedCompletionTime) - Date.parse(providerPrices[0]?.startsAt ?? "2026-05-05T00:00:00.000Z")) / 3_600_000,
      reason: ["approximate_completion_estimate", "user_requested_100_percent", "planning_only_no_hardware_control"],
    };

  return {
    currentPrice: providerPrices[0] ?? price("2026-05-05T00:00:00.000Z", 0),
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
    emergencyOverrideActive,
    plan,
  };
}

function createStatusResponse(
  config: AppConfig,
  onboarding: StartupOnboarding,
  emergencyOverrideActive: boolean,
) {
  const chargerStatus = config.chargerProvider === "mock-charger" ? "Mock charger" : "Planning only";

  return {
    ok: true,
    demoMode: onboarding.demoMode,
    mode: labelMode(config.userMode),
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
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function labelMode(mode: AppConfig["userMode"]): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
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
      <p class="ready" id="ready">Car ready at ...</p>
      <p class="subtle" id="next-trip">Next trip loading</p>

      <div class="grid">
        <div class="item">
          <span class="label">Charging window</span>
          <span class="value" id="window">Loading</span>
        </div>
        <div class="item">
          <span class="label">Approx completion</span>
          <span class="value" id="completion">Loading</span>
        </div>
        <div class="item">
          <span class="label">Cost estimate</span>
          <span class="value" id="cost">Loading</span>
        </div>
        <div class="item">
          <span class="label">Mode</span>
          <span class="value" id="mode">Loading</span>
        </div>
        <div class="item">
          <span class="label">Setup</span>
          <span class="value" id="setup-mode">Loading</span>
        </div>
        <div class="item">
          <span class="label">Today</span>
          <span class="value" id="daily-ready">Loading</span>
        </div>
        <div class="item">
          <span class="label">Saved</span>
          <span class="value" id="daily-saved">Loading</span>
        </div>
      </div>

      <div class="item">
        <span class="label">Why this plan</span>
        <ol class="reasons" id="reasons"></ol>
      </div>

      <div class="item">
        <span class="label">Today's result</span>
        <ol class="reasons" id="daily-feedback"></ol>
      </div>

      <div class="item" id="setup-item">
        <span class="label">Setup notes</span>
        <ol class="reasons" id="setup-notes"></ol>
      </div>

      <p class="warning" id="warning"></p>

      <div class="actions">
        <button class="primary" type="button" id="charge-100">Charge to 100%</button>
        <div class="secondary-row">
          <button type="button">Change departure</button>
          <button type="button">Charge now</button>
          <button type="button">Change mode</button>
        </div>
      </div>
    </section>
  </main>
  <script>
    const formatTime = (value) => {
      if (!value) return "Not planned";
      return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
    };

    const friendlyReason = (reason) => {
      const text = {
        "safe mode applied": "Safe mode is on",
        "balanced mode applied": "Balanced mode is on",
        "savings mode applied": "Savings mode is on",
      }[String(reason).toLowerCase()];
      if (text) return text;
      return String(reason)
        .replace(/_/g, " ")
        .replace(/SOC/g, "charge")
        .replace(/soc/g, "charge");
    };

    fetch("/api/plan")
      .then((response) => response.json())
      .then((data) => renderPlan(data));

    document.getElementById("charge-100").addEventListener("click", () => {
      fetch("/api/emergency-charge", { method: "POST" })
        .then((response) => response.json())
        .then((data) => renderPlan(data));
    });

    function renderPlan(data) {
        document.getElementById("ready").textContent = "Car ready at " + formatTime(data.completion.estimatedCompletionTimeMax);
        document.getElementById("next-trip").textContent = "Next trip: " + formatTime(data.nextTrip.startsAt);
        document.getElementById("window").textContent =
          formatTime(data.chargingWindow.startsAt) + " - " + formatTime(data.chargingWindow.endsAt);
        document.getElementById("completion").textContent =
          "approx " + formatTime(data.completion.estimatedCompletionTime) + " (" + formatTime(data.completion.estimatedCompletionTimeMin) + "-" + formatTime(data.completion.estimatedCompletionTimeMax) + ")";
        document.getElementById("cost").textContent =
          data.plan.estimatedCost + " " + (data.plan.currency || "");
        document.getElementById("mode").textContent =
          data.userMode.mode.charAt(0).toUpperCase() + data.userMode.mode.slice(1);
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
        ]
          .slice(0, 3)
          .map((text) => "<li>" + text + "</li>")
          .join("");

        if (!data.plan.feasible) {
          const warning = document.getElementById("warning");
          warning.style.display = "block";
          warning.textContent = "The car may not reach the target in time.";
        }
      }
  </script>
</body>
</html>`;
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
    console.log(`[setup] ${message}`);
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
