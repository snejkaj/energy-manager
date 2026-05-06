// Requirements: TIB-001, TIB-003, TIB-005, TIB-008, TEL-001, TEL-002, TEL-003, TEL-004, TEL-005, TEL-006, PRV-001, PRV-002, PRV-003, PRV-004, ARC-006

import type { HomeTelemetry, PriceInterval } from "../../charging/types.js";
import type { ElectricityPriceProvider, PriceQuery } from "../ElectricityPriceProvider.js";
import type { HomeTelemetryProvider } from "../HomeTelemetryProvider.js";
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
    const data = await this.transport.execute<TibberPriceData>(TIBBER_PRICE_QUERY);
    const home = selectHome(data.viewer.homes, this.selection.homeId);
    const priceInfo = home.currentSubscription?.priceInfo;

    if (priceInfo === undefined) {
      return [];
    }

    const startsAt = Date.parse(query.startsAt);
    const endsAt = Date.parse(query.endsAt);
    return [...priceInfo.today, ...priceInfo.tomorrow]
      .filter((entry) => Date.parse(entry.startsAt) >= startsAt && Date.parse(entry.startsAt) < endsAt)
      .map(mapPriceEntry);
  }

  async getCurrentPrice(): Promise<PriceInterval | null> {
    const data = await this.transport.execute<TibberPriceData>(TIBBER_PRICE_QUERY);
    const home = selectHome(data.viewer.homes, this.selection.homeId);
    const current = home.currentSubscription?.priceInfo.current;

    return current === undefined || current === null ? null : mapPriceEntry(current);
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
