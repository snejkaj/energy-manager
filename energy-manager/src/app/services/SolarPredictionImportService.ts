// Requirements: PRE-003, PRE-004, PRE-006, DB-010, DB-018, ARC-001, ARC-003

import type { ForecastRepository } from "../../db/repositories/ForecastRepository.js";
import type { HomePowerReadingRepository } from "../../db/repositories/HomePowerReadingRepository.js";
import type { SolarPredictionRecord } from "../../db/types/persistenceTypes.js";
import { SolarPredictionService } from "../../prediction/SolarPredictionService.js";
import type { WeatherForecastProvider } from "../../providers/WeatherForecastProvider.js";

export interface SolarPredictionImportOptions {
  forecastStartsAt: string;
  forecastEndsAt: string;
  historyStartsAt: string;
  historyEndsAt: string;
}

export class SolarPredictionImportService {
  private readonly predictionService = new SolarPredictionService();

  constructor(
    private readonly weatherProvider: WeatherForecastProvider | null,
    private readonly forecastRepository: ForecastRepository,
    private readonly homePowerReadingRepository: HomePowerReadingRepository,
  ) {}

  async generateAndStore(options: SolarPredictionImportOptions): Promise<SolarPredictionRecord[]> {
    if (this.weatherProvider === null) {
      return [];
    }

    const weatherForecasts = await this.weatherProvider.getHourlyForecast({
      startsAt: options.forecastStartsAt,
      endsAt: options.forecastEndsAt,
    });
    const historicalProduction = await this.homePowerReadingRepository.listProductionReadings(
      options.historyStartsAt,
      options.historyEndsAt,
    );
    const predictedAt = new Date().toISOString();
    const predictions = this.predictionService.predictHourly({
      weatherForecasts,
      historicalProduction,
      predictedAt,
    });

    if (predictions.length === 0) {
      return [];
    }

    return this.predictionService.storePredictions(
      this.forecastRepository,
      this.weatherProvider.metadata.id,
      predictedAt,
      predictions,
    );
  }
}
