// Requirements: PRE-001, PRE-006, PRE-018, PRE-019, PRE-020, PRE-021, PRE-022, PRE-023, DB-012, DB-018, ARC-001, ARC-003

import type { TravelRepository } from "../../db/repositories/TravelRepository.js";
import type { TravelPredictionRecord } from "../../db/types/persistenceTypes.js";
import { DeparturePredictionService } from "../../prediction/DeparturePredictionService.js";
import type { WeatherForecastProvider } from "../../providers/WeatherForecastProvider.js";

export interface DeparturePredictionImportOptions {
  now: string;
  batteryCapacityKwh: number;
  historyStartsAt: string;
  historyEndsAt: string;
  calendarStartsAt: string;
  calendarEndsAt: string;
}

export class DeparturePredictionImportService {
  private readonly predictionService = new DeparturePredictionService();

  constructor(
    private readonly travelRepository: TravelRepository,
    private readonly weatherProvider: WeatherForecastProvider | null = null,
  ) {}

  async generateAndStore(options: DeparturePredictionImportOptions): Promise<TravelPredictionRecord | null> {
    const historicalDriving = await this.travelRepository.listHistoricalDrivingEvents(
      options.historyStartsAt,
      options.historyEndsAt,
    );
    const calendarEvents = await this.travelRepository.listUpcomingTravelEvents(
      options.calendarStartsAt,
      options.calendarEndsAt,
    );
    const weatherForecasts = this.weatherProvider === null
      ? []
      : await this.weatherProvider.getHourlyForecast({
        startsAt: options.calendarStartsAt,
        endsAt: options.calendarEndsAt,
      });

    const prediction = this.predictionService.predict({
      now: options.now,
      batteryCapacityKwh: options.batteryCapacityKwh,
      historicalDriving,
      calendarEvents,
      weatherForecasts,
    });

    if (prediction === null) {
      return null;
    }

    return this.travelRepository.createTravelPrediction(
      this.predictionService.toTravelPrediction(prediction, new Date().toISOString()),
    );
  }
}
