// Requirements: DB-007, DB-009, DB-010, PRE-003, ARC-003

import type { SolarPredictionRecord, WeatherForecastRecord } from "../types/persistenceTypes.js";
import { BaseRepository } from "./BaseRepository.js";

export interface CreateWeatherForecast {
  providerId: string;
  forecastAt: string;
  validFrom: string;
  validTo: string;
  temperatureC?: number | null;
  cloudCoverPercent?: number | null;
  precipitationMm?: number | null;
  windSpeedMps?: number | null;
  shortwaveRadiationWm2?: number | null;
  globalTiltedIrradianceWm2?: number | null;
  confidence?: number | null;
  rawPayload?: unknown;
}

export interface CreateSolarPrediction {
  providerId: string;
  weatherForecastId?: string | null;
  predictedAt: string;
  startsAt: string;
  endsAt: string;
  predictedProductionKwh: number;
  predictedPeakPowerKw?: number | null;
  confidence?: number | null;
  features?: unknown;
  modelName?: string | null;
  modelVersion?: string | null;
}

export class ForecastRepository extends BaseRepository {
  async createWeatherForecast(input: CreateWeatherForecast): Promise<WeatherForecastRecord> {
    return this.one<WeatherForecastRecord>(
      `
        insert into weather_forecasts (
          provider_id, forecast_at, valid_from, valid_to, temperature_c,
          cloud_cover_percent, precipitation_mm, wind_speed_mps,
          shortwave_radiation_w_m2, global_tilted_irradiance_w_m2,
          confidence, raw_payload
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
        returning
          id,
          provider_id as "providerId",
          forecast_at as "forecastAt",
          valid_from as "validFrom",
          valid_to as "validTo",
          temperature_c as "temperatureC",
          cloud_cover_percent as "cloudCoverPercent",
          precipitation_mm as "precipitationMm",
          wind_speed_mps as "windSpeedMps",
          shortwave_radiation_w_m2 as "shortwaveRadiationWm2",
          global_tilted_irradiance_w_m2 as "globalTiltedIrradianceWm2",
          confidence,
          raw_payload as "rawPayload",
          created_at as "createdAt"
      `,
      [
        input.providerId,
        input.forecastAt,
        input.validFrom,
        input.validTo,
        input.temperatureC ?? null,
        input.cloudCoverPercent ?? null,
        input.precipitationMm ?? null,
        input.windSpeedMps ?? null,
        input.shortwaveRadiationWm2 ?? null,
        input.globalTiltedIrradianceWm2 ?? null,
        input.confidence ?? null,
        JSON.stringify(input.rawPayload ?? {}),
      ],
    );
  }

  async createSolarPrediction(input: CreateSolarPrediction): Promise<SolarPredictionRecord> {
    return this.one<SolarPredictionRecord>(
      `
        insert into solar_predictions (
          provider_id, weather_forecast_id, predicted_at, starts_at, ends_at,
          predicted_production_kwh, predicted_peak_power_kw, confidence,
          features, model_name, model_version
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
        returning
          id,
          provider_id as "providerId",
          weather_forecast_id as "weatherForecastId",
          predicted_at as "predictedAt",
          starts_at as "startsAt",
          ends_at as "endsAt",
          predicted_production_kwh as "predictedProductionKwh",
          predicted_peak_power_kw as "predictedPeakPowerKw",
          confidence,
          features,
          model_name as "modelName",
          model_version as "modelVersion",
          created_at as "createdAt"
      `,
      [
        input.providerId,
        input.weatherForecastId ?? null,
        input.predictedAt,
        input.startsAt,
        input.endsAt,
        input.predictedProductionKwh,
        input.predictedPeakPowerKw ?? null,
        input.confidence ?? null,
        JSON.stringify(input.features ?? {}),
        input.modelName ?? null,
        input.modelVersion ?? null,
      ],
    );
  }

  async listSolarPredictions(startsAt: string, endsAt: string): Promise<SolarPredictionRecord[]> {
    return this.many<SolarPredictionRecord>(
      `
        select
          id,
          provider_id as "providerId",
          weather_forecast_id as "weatherForecastId",
          predicted_at as "predictedAt",
          starts_at as "startsAt",
          ends_at as "endsAt",
          predicted_production_kwh as "predictedProductionKwh",
          predicted_peak_power_kw as "predictedPeakPowerKw",
          confidence,
          features,
          model_name as "modelName",
          model_version as "modelVersion",
          created_at as "createdAt"
        from solar_predictions
        where starts_at < $2 and ends_at > $1
        order by starts_at asc
      `,
      [startsAt, endsAt],
    );
  }
}
