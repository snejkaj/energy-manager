// Requirements: PRD-002, PRD-006, WEB-001, WEB-002, WEB-003, WEB-004, WEB-005, WEB-006, WEB-007, WEB-008, WEB-009, OPS-001, OPS-005, ARC-004

import { createServer } from "node:http";

import { calculateChargingPlan } from "../charging/ChargingOptimizer.js";
import type { ChargingTarget, PriceInterval } from "../charging/types.js";
import { MockElectricityPriceProvider } from "../providers/mock/MockElectricityPriceProvider.js";
import { ProviderRegistry } from "../providers/ProviderRegistry.js";
import { loadConfig } from "./config.js";

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

const target: ChargingTarget = {
  departureTime: "2026-05-05T08:00:00.000Z",
  currentSocPercent: 42,
  minSocPercent: 65,
  maxSocPercent: 80,
  batteryCapacityKwh: 75,
  chargerPowerKw: 11,
  chargingEfficiency: 0.9,
};

export function startServer(): void {
  const config = loadConfig();
  const registry = createProviderRegistry();

  const server = createServer((request, response) => {
    if (request.url === "/api/plan") {
      const priceProvider = registry.getElectricityPriceProvider(config.electricityPriceProvider);
      if (priceProvider === null) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: `Unknown electricity price provider: ${config.electricityPriceProvider}` }));
        return;
      }

      priceProvider
        .getPrices({
          startsAt: "2026-05-05T00:00:00.000Z",
          endsAt: target.departureTime,
        })
        .then((providerPrices) => {
          const plan = calculateChargingPlan(providerPrices, target);
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ currentPrice: providerPrices[0], prices: providerPrices, plan }));
        })
        .catch((error: unknown) => {
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }));
        });
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
function createProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.registerElectricityPriceProvider(new MockElectricityPriceProvider(prices));
  return registry;
}

function renderHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Smart EV Charging Optimizer</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #17202a; }
    main { max-width: 920px; margin: 0 auto; }
    section { border-top: 1px solid #d9dee3; padding: 1rem 0; }
    .metric { font-size: 2rem; font-weight: 650; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.5rem; border-bottom: 1px solid #e5e9ed; text-align: left; }
  </style>
</head>
<body>
  <main>
    <h1>Smart EV Charging Optimizer</h1>
    <section>
      <h2>Current price</h2>
      <div class="metric" id="current-price">Loading</div>
    </section>
    <section>
      <h2>Price graph</h2>
      <pre id="price-graph">Loading</pre>
    </section>
    <section>
      <h2>Planned charging</h2>
      <div id="plan-summary">Loading</div>
      <table>
        <thead><tr><th>Start</th><th>End</th><th>kWh</th><th>Cost</th></tr></thead>
        <tbody id="slots"></tbody>
      </table>
    </section>
  </main>
  <script>
    fetch("/api/plan")
      .then((response) => response.json())
      .then((data) => {
        document.getElementById("current-price").textContent =
          data.currentPrice.total + " " + data.currentPrice.currency + "/kWh";
        document.getElementById("price-graph").textContent = data.prices
          .map((price) => new Date(price.startsAt).getUTCHours().toString().padStart(2, "0") + " " + "#".repeat(Math.round(price.total * 10)) + " " + price.total)
          .join("\\n");
        document.getElementById("plan-summary").textContent =
          (data.plan.feasible ? "Feasible" : "Deficit") + " - " + data.plan.plannedEnergyKwh + " kWh, " + data.plan.estimatedCost + " " + data.plan.currency;
        document.getElementById("slots").innerHTML = data.plan.slots
          .map((slot) => "<tr><td>" + slot.startsAt + "</td><td>" + slot.endsAt + "</td><td>" + slot.energyKwh + "</td><td>" + slot.estimatedCost + "</td></tr>")
          .join("");
      });
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

startServer();
