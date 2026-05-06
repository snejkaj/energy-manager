// Requirements: PRE-003, PRE-006, DB-009, DB-010, ARC-001, ARC-003

import type { ForecastRepository } from "../../db/repositories/ForecastRepository.js";
import type { WeatherForecastInterval, WeatherForecastProvider } from "../../providers/WeatherForecastProvider.js";

export class WeatherForecastImportService {
  constructor(
    private readonly weatherProvider: WeatherForecastProvider,
    private readonly forecastRepository: ForecastRepository,
  ) {}

  async importHourlyForecast(startsAt: string, endsAt: string): Promise<WeatherForecastInterval[]> {
    const forecastAt = new Date().toISOString();
    const forecasts = await this.weatherProvider.getHourlyForecast({ startsAt, endsAt });

    for (const forecast of forecasts) {
      await this.forecastRepository.createWeatherForecast({
        providerId: this.weatherProvider.metadata.id,
        forecastAt,
        validFrom: forecast.startsAt,
        validTo: forecast.endsAt,
        temperatureC: forecast.temperatureC ?? null,
        cloudCoverPercent: forecast.cloudCoverPercent ?? null,
        precipitationMm: forecast.precipitationMm ?? null,
        windSpeedMps: forecast.windSpeedMps ?? null,
        shortwaveRadiationWm2: forecast.shortwaveRadiationWm2 ?? null,
        globalTiltedIrradianceWm2: forecast.globalTiltedIrradianceWm2 ?? null,
        rawPayload: forecast.rawPayload ?? forecast,
      });
    }

    return forecasts;
  }
}
