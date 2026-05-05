// Requirements: TIB-001, TIB-003, TIB-005, TIB-008, TIB-009, DB-004, DB-020, DB-021, TEL-001, TEL-002, TEL-003, TEL-004, ARC-001, ARC-003

import type { HomeTelemetry } from "../../charging/types.js";
import type { HomePowerReadingRepository } from "../../db/repositories/HomePowerReadingRepository.js";
import type { PriceRepository, PriceIntervalRecord } from "../../db/repositories/PriceRepository.js";
import type { TibberHomeTelemetryProvider, TibberPriceProvider } from "../../providers/tibber/TibberProvider.js";
import type { TibberPriceEntry } from "../../providers/tibber/TibberTypes.js";

export class TibberImportService {
  constructor(
    private readonly priceProvider: TibberPriceProvider,
    private readonly telemetryProvider: TibberHomeTelemetryProvider,
    private readonly priceRepository: PriceRepository,
    private readonly homePowerReadingRepository: HomePowerReadingRepository,
  ) {}

  async importPrices(): Promise<PriceIntervalRecord[]> {
    const fetchedAt = new Date().toISOString();
    const entries = await this.priceProvider.getRawPriceEntries();

    return this.priceRepository.upsertPriceIntervals(
      entries.map((entry) => ({
        providerId: "tibber",
        sourceHomeId: entry.homeId,
        startsAt: normalizeIso(entry.startsAt),
        endsAt: addHours(entry.startsAt, 1),
        total: entry.total,
        currency: entry.currency,
        priceLevel: entry.level ?? null,
        rawPayload: entry,
        sourceFetchedAt: fetchedAt,
      })),
    );
  }

  async importTelemetryIfAvailable(): Promise<HomeTelemetry | null> {
    const fetchedAt = new Date().toISOString();
    const result = await this.safeGetRawTelemetry();

    if (result.telemetry === null) {
      return null;
    }

    const measuredAt = getMeasuredAt(result.raw.liveMeasurement?.timestamp, fetchedAt);
    await this.homePowerReadingRepository.upsertReading({
      providerId: "tibber",
      sourceHomeId: result.homeId,
      measuredAt,
      consumptionKw: result.telemetry.consumptionKw ?? null,
      productionKw: result.telemetry.productionKw ?? null,
      rawPayload: result.raw,
      sourceFetchedAt: fetchedAt,
    });

    return result.telemetry;
  }

  private async safeGetRawTelemetry(): Promise<Awaited<ReturnType<TibberHomeTelemetryProvider["getRawTelemetry"]>>> {
    try {
      return await this.telemetryProvider.getRawTelemetry();
    } catch {
      return {
        homeId: "",
        telemetry: null,
        raw: {
          id: "",
          liveMeasurement: null,
        },
      };
    }
  }
}

function normalizeIso(value: string): string {
  return new Date(Date.parse(value)).toISOString();
}

function addHours(value: string, hours: number): string {
  return new Date(Date.parse(value) + hours * 3_600_000).toISOString();
}

function getMeasuredAt(timestamp: string | null | undefined, fallback: string): string {
  if (timestamp === null || timestamp === undefined || Number.isNaN(Date.parse(timestamp))) {
    return fallback;
  }

  return normalizeIso(timestamp);
}

export function mapTibberPriceEntriesForStorage(
  entries: Array<TibberPriceEntry & { homeId: string }>,
  sourceFetchedAt: string,
): Parameters<PriceRepository["upsertPriceIntervals"]>[0] {
  return entries.map((entry) => ({
    providerId: "tibber",
    sourceHomeId: entry.homeId,
    startsAt: normalizeIso(entry.startsAt),
    endsAt: addHours(entry.startsAt, 1),
    total: entry.total,
    currency: entry.currency,
    priceLevel: entry.level ?? null,
    rawPayload: entry,
    sourceFetchedAt,
  }));
}
