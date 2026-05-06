// Requirements: DB-007, DB-011, DB-012, PRE-001, PRE-006, ARC-003

import type {
  TravelDetectionSource,
  TravelEventRecord,
  TravelEventSource,
  TravelPredictionRecord,
  TripSize,
} from "../types/persistenceTypes.js";
import { BaseRepository } from "./BaseRepository.js";

export interface CreateTravelEvent {
  source: TravelEventSource;
  externalId?: string | null;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  userTags?: string[];
  needsCar?: boolean;
  tripSize?: TripSize | null;
  detectionSource?: TravelDetectionSource | null;
  explicitOverride?: boolean;
  expectedDistanceKm?: number | null;
  expectedEnergyNeedKwh?: number | null;
  metadata?: unknown;
}

export interface CreateTravelPrediction {
  travelEventId?: string | null;
  predictedAt: string;
  predictedDepartureAt: string;
  predictedReturnAt?: string | null;
  predictedDistanceKm?: number | null;
  predictedEnergyNeedKwh?: number | null;
  tripSize?: TripSize | null;
  requiredSocPercent?: number | null;
  confidence: number;
  overriddenByExplicitEvent?: boolean;
  modelName: string;
  modelVersion: string;
  features?: unknown;
  reason: string[];
}

export class TravelRepository extends BaseRepository {
  async createTravelEvent(input: CreateTravelEvent): Promise<TravelEventRecord> {
    return this.one<TravelEventRecord>(
      `
        insert into travel_events (
          source, external_id, title, starts_at, ends_at, location,
          user_tags, needs_car, trip_size, detection_source, explicit_override,
          expected_distance_km, expected_energy_need_kwh, metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
        returning
          id,
          source,
          external_id as "externalId",
          title,
          starts_at as "startsAt",
          ends_at as "endsAt",
          location,
          user_tags as "userTags",
          needs_car as "needsCar",
          trip_size as "tripSize",
          detection_source as "detectionSource",
          explicit_override as "explicitOverride",
          expected_distance_km as "expectedDistanceKm",
          expected_energy_need_kwh as "expectedEnergyNeedKwh",
          metadata,
          created_at as "createdAt",
          updated_at as "updatedAt"
      `,
      [
        input.source,
        input.externalId ?? null,
        input.title,
        input.startsAt,
        input.endsAt ?? null,
        input.location ?? null,
        input.userTags ?? [],
        input.needsCar ?? false,
        input.tripSize ?? null,
        input.detectionSource ?? null,
        input.explicitOverride ?? true,
        input.expectedDistanceKm ?? null,
        input.expectedEnergyNeedKwh ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  async createTravelPrediction(input: CreateTravelPrediction): Promise<TravelPredictionRecord> {
    return this.one<TravelPredictionRecord>(
      `
        insert into travel_predictions (
          travel_event_id, predicted_at, predicted_departure_at, predicted_return_at,
          predicted_distance_km, predicted_energy_need_kwh, confidence,
          trip_size, required_soc_percent, overridden_by_explicit_event,
          model_name, model_version, features, reason
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
        returning
          id,
          travel_event_id as "travelEventId",
          predicted_at as "predictedAt",
          predicted_departure_at as "predictedDepartureAt",
          predicted_return_at as "predictedReturnAt",
          predicted_distance_km as "predictedDistanceKm",
          predicted_energy_need_kwh as "predictedEnergyNeedKwh",
          trip_size as "tripSize",
          required_soc_percent as "requiredSocPercent",
          confidence,
          overridden_by_explicit_event as "overriddenByExplicitEvent",
          model_name as "modelName",
          model_version as "modelVersion",
          features,
          reason,
          created_at as "createdAt"
      `,
      [
        input.travelEventId ?? null,
        input.predictedAt,
        input.predictedDepartureAt,
        input.predictedReturnAt ?? null,
        input.predictedDistanceKm ?? null,
        input.predictedEnergyNeedKwh ?? null,
        input.confidence,
        input.tripSize ?? null,
        input.requiredSocPercent ?? null,
        input.overriddenByExplicitEvent ?? false,
        input.modelName,
        input.modelVersion,
        JSON.stringify(input.features ?? {}),
        input.reason,
      ],
    );
  }

  async listUpcomingTravelEvents(startsAt: string, endsAt: string): Promise<TravelEventRecord[]> {
    return this.many<TravelEventRecord>(
      `
        select
          id,
          source,
          external_id as "externalId",
          title,
          starts_at as "startsAt",
          ends_at as "endsAt",
          location,
          user_tags as "userTags",
          needs_car as "needsCar",
          trip_size as "tripSize",
          detection_source as "detectionSource",
          explicit_override as "explicitOverride",
          expected_distance_km as "expectedDistanceKm",
          expected_energy_need_kwh as "expectedEnergyNeedKwh",
          metadata,
          created_at as "createdAt",
          updated_at as "updatedAt"
        from travel_events
        where starts_at >= $1 and starts_at < $2
        order by starts_at asc
      `,
      [startsAt, endsAt],
    );
  }

  async listHistoricalDrivingEvents(startsAt: string, endsAt: string): Promise<TravelEventRecord[]> {
    return this.many<TravelEventRecord>(
      `
        select
          id,
          source,
          external_id as "externalId",
          title,
          starts_at as "startsAt",
          ends_at as "endsAt",
          location,
          user_tags as "userTags",
          needs_car as "needsCar",
          trip_size as "tripSize",
          detection_source as "detectionSource",
          explicit_override as "explicitOverride",
          expected_distance_km as "expectedDistanceKm",
          expected_energy_need_kwh as "expectedEnergyNeedKwh",
          metadata,
          created_at as "createdAt",
          updated_at as "updatedAt"
        from travel_events
        where starts_at >= $1
          and starts_at < $2
          and needs_car = true
        order by starts_at asc
      `,
      [startsAt, endsAt],
    );
  }

  async hasExplicitTravelEvent(startsAt: string, endsAt: string): Promise<boolean> {
    const rows = await this.many<{ exists: boolean }>(
      `
        select exists (
          select 1
          from travel_events
          where starts_at < $2
            and coalesce(ends_at, starts_at) >= $1
            and needs_car = true
            and explicit_override = true
        ) as "exists"
      `,
      [startsAt, endsAt],
    );

    return rows[0]?.exists ?? false;
  }
}
