// Requirements: DB-001, DB-002, DB-003, DB-004, DB-005, DB-007, DB-008, DB-020, ARC-003

import { BaseRepository } from "./BaseRepository.js";

export interface PriceIntervalRecord {
  id: string;
  providerId: string;
  sourceHomeId: string | null;
  startsAt: string;
  endsAt: string;
  total: number;
  currency: string;
  priceLevel: string | null;
  rawPayload: unknown;
  sourceFetchedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPriceInterval {
  providerId: string;
  sourceHomeId?: string | null;
  startsAt: string;
  endsAt: string;
  total: number;
  currency: string;
  priceLevel?: string | null;
  sourceFetchedAt: string;
  rawPayload?: unknown;
}

export class PriceRepository extends BaseRepository {
  async upsertPriceIntervals(prices: UpsertPriceInterval[]): Promise<PriceIntervalRecord[]> {
    const records: PriceIntervalRecord[] = [];

    for (const price of prices) {
      records.push(
        await this.one<PriceIntervalRecord>(
          `
            insert into price_intervals (
              provider_id, source_home_id, starts_at, ends_at, total, currency,
              price_level, raw_payload, source_fetched_at
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
            on conflict (provider_id, source_home_id, starts_at, ends_at) do update set
              total = excluded.total,
              currency = excluded.currency,
              price_level = excluded.price_level,
              raw_payload = excluded.raw_payload,
              source_fetched_at = excluded.source_fetched_at,
              updated_at = now()
            returning ${priceColumns()}
          `,
          [
            price.providerId,
            price.sourceHomeId ?? null,
            price.startsAt,
            price.endsAt,
            price.total,
            price.currency,
            price.priceLevel ?? null,
            JSON.stringify(price.rawPayload ?? {}),
            price.sourceFetchedAt,
          ],
        ),
      );
    }

    return records;
  }

  async listByTimeRange(startsAt: string, endsAt: string): Promise<PriceIntervalRecord[]> {
    return this.many<PriceIntervalRecord>(
      `
        select ${priceColumns()}
        from price_intervals
        where starts_at < $2 and ends_at > $1
        order by starts_at asc
      `,
      [startsAt, endsAt],
    );
  }
}

function priceColumns(): string {
  return `
    id,
    provider_id as "providerId",
    source_home_id as "sourceHomeId",
    starts_at as "startsAt",
    ends_at as "endsAt",
    total,
    currency,
    price_level as "priceLevel",
    raw_payload as "rawPayload",
    source_fetched_at as "sourceFetchedAt",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
}
