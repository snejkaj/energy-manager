// Requirements: TIB-001, TIB-003, TIB-005, TIB-008, TEL-001, TEL-002, TEL-003, TEL-004, TEL-005, TEL-006, PRV-001, PRV-002, PRV-003, PRV-004, ARC-006

import type { HomeTelemetry, PriceInterval } from "../../charging/types.js";
import type { ElectricityPriceProvider, PriceQuery } from "../ElectricityPriceProvider.js";
import type { HomeTelemetryProvider } from "../HomeTelemetryProvider.js";
import { logger } from "../../app/logger.js";
import type { GraphQLTransport } from "./TibberClient.js";
import { TIBBER_PRICE_QUERY, TIBBER_TELEMETRY_QUERY } from "./TibberQueries.js";
import type {
  TibberHomePriceNode,
  TibberHomeSelection,
  TibberHomeTelemetryNode,
  TibberPriceData,
  TibberPriceEntry,
  TibberTelemetryData,
} from "./TibberTypes.js";

export class TibberPriceProvider implements ElectricityPriceProvider {
  metadata = {
    id: "tibber",
    displayName: "Tibber",
    kind: "electricity-price" as const,
  };

  configSchema = {
    fields: [
      {
        key: "access_token",
        label: "Access token",
        type: "password" as const,
        required: true,
        description: "Tibber API access token.",
      },
      {
        key: "home_id",
        label: "Home ID",
        type: "string" as const,
        required: false,
        description: "Optional Tibber home ID. First home is used when omitted.",
      },
    ],
  };

  capabilities = {
    supportsHistoricalPrices: false,
    supportsFuturePrices: true,
  };

  constructor(
    private readonly transport: GraphQLTransport,
    private readonly selection: TibberHomeSelection = {},
  ) {}

  async getPrices(query: PriceQuery): Promise<PriceInterval[]> {
    logger.info("Tibber", "Tibber price fetch start");
    const data = await this.transport.execute<TibberPriceData>(TIBBER_PRICE_QUERY);
    const home = selectHome(data.viewer.homes, this.selection.homeId);
    logger.info("Tibber", `Selected Tibber home ID: ${home.id}`);
    const priceInfo = home.currentSubscription?.priceInfo;

    if (priceInfo === undefined) {
      logger.info("Tibber", "Loaded 0 Tibber price intervals");
      return [];
    }

    const startsAt = Date.parse(query.startsAt);
    const endsAt = Date.parse(query.endsAt);
    const intervals = [...priceInfo.today, ...priceInfo.tomorrow]
      .filter((entry) => Date.parse(entry.startsAt) >= startsAt && Date.parse(entry.startsAt) < endsAt)
      .map(mapPriceEntry);
    logger.info("Tibber", `Loaded ${intervals.length} Tibber price intervals`);
    return intervals;
  }

  async getCurrentPrice(): Promise<PriceInterval | null> {
    logger.info("Tibber", "Tibber current price fetch start");
    const data = await this.transport.execute<TibberPriceData>(TIBBER_PRICE_QUERY);
    const home = selectHome(data.viewer.homes, this.selection.homeId);
    logger.info("Tibber", `Selected Tibber home ID: ${home.id}`);
    const current = home.currentSubscription?.priceInfo.current;

    if (current === undefined || current === null) {
      logger.info("Tibber", "Current Tibber price is unavailable");
      return null;
    }

    const mapped = mapPriceEntry(current);
    logger.info("Tibber", `Current Tibber price: ${mapped.total} ${mapped.currency}/kWh`);
    return mapped;
  }

  async getRawPriceEntries(): Promise<Array<TibberPriceEntry & { homeId: string }>> {
    const data = await this.transport.execute<TibberPriceData>(TIBBER_PRICE_QUERY);
    const home = selectHome(data.viewer.homes, this.selection.homeId);
    const priceInfo = home.currentSubscription?.priceInfo;

    if (priceInfo === undefined) {
      return [];
    }

    return [...priceInfo.today, ...priceInfo.tomorrow].map((entry) => ({ ...entry, homeId: home.id }));
  }
}

export class TibberHomeTelemetryProvider implements HomeTelemetryProvider {
  metadata = {
    id: "tibber-live-measurement",
    displayName: "Tibber live measurement",
    kind: "home-telemetry" as const,
  };

  configSchema = {
    fields: [
      {
        key: "access_token",
        label: "Access token",
        type: "password" as const,
        required: true,
        description: "Tibber API access token.",
      },
      {
        key: "home_id",
        label: "Home ID",
        type: "string" as const,
        required: false,
        description: "Optional Tibber home ID. First home is used when omitted.",
      },
    ],
  };

  capabilities = {
    supportsCurrentConsumption: true,
    supportsCurrentProduction: true,
  };

  constructor(
    private readonly transport: GraphQLTransport,
    private readonly selection: TibberHomeSelection = {},
  ) {}

  async getCurrentTelemetry(): Promise<HomeTelemetry | null> {
    const data = await this.transport.execute<TibberTelemetryData>(TIBBER_TELEMETRY_QUERY);
    const home = selectHome(data.viewer.homes, this.selection.homeId);
    return mapTelemetry(home);
  }

  async getRawTelemetry(): Promise<{ homeId: string; telemetry: HomeTelemetry | null; raw: TibberHomeTelemetryNode }> {
    const data = await this.transport.execute<TibberTelemetryData>(TIBBER_TELEMETRY_QUERY);
    const home = selectHome(data.viewer.homes, this.selection.homeId);
    return {
      homeId: home.id,
      telemetry: mapTelemetry(home),
      raw: home,
    };
  }
}

function selectHome<THome extends { id: string }>(homes: THome[], homeId?: string | null): THome {
  if ((homeId === undefined || homeId === null || homeId === "") && homes.length > 1) {
    logger.warn(
      "Tibber",
      `Multiple Tibber homes found; TIBBER_HOME_ID is not set, using first home: ${homes[0]?.id ?? "unknown"}`,
    );
  }

  const home = homeId === undefined || homeId === null || homeId === ""
    ? homes[0]
    : homes.find((candidate) => candidate.id === homeId);

  if (home === undefined) {
    throw new Error(homeId === undefined || homeId === null || homeId === "" ? "No Tibber homes found." : `Tibber home not found: ${homeId}`);
  }

  return home;
}

function mapPriceEntry(entry: TibberPriceEntry): PriceInterval {
  const startsAtMs = Date.parse(entry.startsAt);
  return {
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(startsAtMs + 3_600_000).toISOString(),
    total: entry.total,
    currency: entry.currency,
  };
}

function mapTelemetry(home: TibberHomeTelemetryNode): HomeTelemetry | null {
  const measurement = home.liveMeasurement;
  if (measurement === null || measurement === undefined) {
    return null;
  }

  const consumptionKw = wattsToKw(measurement.power);
  const productionKw = wattsToKw(measurement.powerProduction);

  if (consumptionKw === undefined && productionKw === undefined) {
    return null;
  }

  return {
    consumptionKw,
    productionKw,
  };
}

function wattsToKw(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value / 1000;
}
