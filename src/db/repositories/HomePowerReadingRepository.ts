// Requirements: DB-007, DB-019, DB-021, TEL-001, TEL-002, TEL-003, TEL-004, ARC-003

import { BaseRepository } from "./BaseRepository.js";

export interface HomePowerReadingRecord {
  id: string;
  providerId: string;
  sourceHomeId: string | null;
  measuredAt: string;
  consumptionKw: number | null;
  productionKw: number | null;
  rawPayload: unknown;
  sourceFetchedAt: string;
  createdAt: string;
}

export interface UpsertHomePowerReading {
  providerId: string;
  sourceHomeId?: string | null;
  measuredAt: string;
  consumptionKw?: number | null;
  productionKw?: number | null;
  rawPayload?: unknown;
  sourceFetchedAt: string;
}

export class HomePowerReadingRepository extends BaseRepository {
  async upsertReading(input: UpsertHomePowerReading): Promise<HomePowerReadingRecord> {
    return this.one<HomePowerReadingRecord>(
      `
        insert into home_power_readings (
          provider_id, source_home_id, measured_at, consumption_kw,
          production_kw, raw_payload, source_fetched_at
        )
        values ($1, $2, $3, $4, $5, $6::jsonb, $7)
        on conflict (provider_id, source_home_id, measured_at) do update set
          consumption_kw = excluded.consumption_kw,
          production_kw = excluded.production_kw,
          raw_payload = excluded.raw_payload,
          source_fetched_at = excluded.source_fetched_at
        returning ${homePowerReadingColumns()}
      `,
      [
        input.providerId,
        input.sourceHomeId ?? null,
        input.measuredAt,
        input.consumptionKw ?? null,
        input.productionKw ?? null,
        JSON.stringify(input.rawPayload ?? {}),
        input.sourceFetchedAt,
      ],
    );
  }

  async latestReading(providerId: string, sourceHomeId?: string | null): Promise<HomePowerReadingRecord | null> {
    const rows = await this.many<HomePowerReadingRecord>(
      `
        select ${homePowerReadingColumns()}
        from home_power_readings
        where provider_id = $1 and source_home_id is not distinct from $2
        order by measured_at desc
        limit 1
      `,
      [providerId, sourceHomeId ?? null],
    );

    return rows[0] ?? null;
  }

  async listProductionReadings(startsAt: string, endsAt: string): Promise<HomePowerReadingRecord[]> {
    return this.many<HomePowerReadingRecord>(
      `
        select ${homePowerReadingColumns()}
        from home_power_readings
        where measured_at >= $1
          and measured_at < $2
          and production_kw is not null
        order by measured_at asc
      `,
      [startsAt, endsAt],
    );
  }
}

function homePowerReadingColumns(): string {
  return `
    id,
    provider_id as "providerId",
    source_home_id as "sourceHomeId",
    measured_at as "measuredAt",
    consumption_kw as "consumptionKw",
    production_kw as "productionKw",
    raw_payload as "rawPayload",
    source_fetched_at as "sourceFetchedAt",
    created_at as "createdAt"
  `;
}
