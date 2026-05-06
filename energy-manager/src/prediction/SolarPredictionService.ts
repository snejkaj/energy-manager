// Requirements: PRE-003, PRE-004, PRE-005, PRE-006, DB-010, DB-018, ARC-001, ARC-003

import type { ForecastRepository, CreateSolarPrediction } from "../db/repositories/ForecastRepository.js";
import type { HomePowerReadingRecord } from "../db/repositories/HomePowerReadingRepository.js";
import type { SolarPredictionRecord } from "../db/types/persistenceTypes.js";
import type { WeatherForecastInterval } from "../providers/WeatherForecastProvider.js";

export interface SolarPredictionInput {
  weatherForecasts: WeatherForecastInterval[];
  historicalProduction: HomePowerReadingRecord[];
  predictedAt: string;
}

export interface HourlySolarPrediction {
  startsAt: string;
  endsAt: string;
  predictedProductionKwh: number;
  predictedPeakPowerKw: number | null;
  confidence: number;
  reason: string[];
  features: {
    radiationWm2: number;
    historicalPeakProductionKw: number;
    historicalAverageProductionKw: number;
    cloudCoverPercent: number | null;
  };
}

export class SolarPredictionService {
  predictHourly(input: SolarPredictionInput): HourlySolarPrediction[] {
    const productionValues = input.historicalProduction
      .map((reading) => reading.productionKw)
      .filter((value): value is number => value !== null && value > 0);

    if (input.weatherForecasts.length === 0 || productionValues.length === 0) {
      return [];
    }

    const historicalPeakProductionKw = Math.max(...productionValues);
    const historicalAverageProductionKw =
      productionValues.reduce((sum, value) => sum + value, 0) / productionValues.length;

    return input.weatherForecasts
      .map((forecast) => {
        const radiationWm2 =
          forecast.globalTiltedIrradianceWm2 ?? forecast.shortwaveRadiationWm2 ?? 0;
        const radiationFactor = clamp(radiationWm2 / 1000, 0, 1.2);
        const cloudPenalty = forecast.cloudCoverPercent === null || forecast.cloudCoverPercent === undefined
          ? 1
          : clamp(1 - forecast.cloudCoverPercent / 200, 0.35, 1);
        const predictedPeakPowerKw = historicalPeakProductionKw * radiationFactor * cloudPenalty;
        const predictedProductionKwh = predictedPeakPowerKw;

        return {
          startsAt: forecast.startsAt,
          endsAt: forecast.endsAt,
          predictedProductionKwh: round(Math.max(0, predictedProductionKwh)),
          predictedPeakPowerKw: round(Math.max(0, predictedPeakPowerKw)),
          confidence: round(calculateConfidence(productionValues.length, radiationWm2)),
          reason: [
            "Predicted from weather solar radiation",
            "Adjusted using historical solar production",
          ],
          features: {
            radiationWm2,
            historicalPeakProductionKw: round(historicalPeakProductionKw),
            historicalAverageProductionKw: round(historicalAverageProductionKw),
            cloudCoverPercent: forecast.cloudCoverPercent ?? null,
          },
        };
      })
      .filter((prediction) => prediction.predictedProductionKwh > 0);
  }

  async storePredictions(
    repository: ForecastRepository,
    providerId: string,
    predictedAt: string,
    predictions: HourlySolarPrediction[],
  ): Promise<SolarPredictionRecord[]> {
    const records: SolarPredictionRecord[] = [];

    for (const prediction of predictions) {
      records.push(
        await repository.createSolarPrediction(toCreateSolarPrediction(providerId, predictedAt, prediction)),
      );
    }

    return records;
  }
}

function toCreateSolarPrediction(
  providerId: string,
  predictedAt: string,
  prediction: HourlySolarPrediction,
): CreateSolarPrediction {
  return {
    providerId,
    predictedAt,
    startsAt: prediction.startsAt,
    endsAt: prediction.endsAt,
    predictedProductionKwh: prediction.predictedProductionKwh,
    predictedPeakPowerKw: prediction.predictedPeakPowerKw,
    confidence: prediction.confidence,
    features: {
      ...prediction.features,
      reason: prediction.reason,
    },
    modelName: "radiation-history-baseline",
    modelVersion: "1",
  };
}

function calculateConfidence(sampleCount: number, radiationWm2: number): number {
  const sampleConfidence = clamp(sampleCount / 48, 0.2, 1);
  const radiationConfidence = radiationWm2 > 0 ? 1 : 0.4;
  return sampleConfidence * radiationConfidence;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
