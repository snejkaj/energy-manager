// Requirements: PRV-001, PRV-004, PRE-003, PRE-006, ARC-006

import type { Provider } from "./providerTypes.js";

export interface WeatherForecastProviderCapabilities {
  supportsHourlyForecast: boolean;
  supportsSolarRadiation: boolean;
}

export interface WeatherForecastQuery {
  startsAt: string;
  endsAt: string;
}

export interface WeatherForecastInterval {
  startsAt: string;
  endsAt: string;
  temperatureC?: number | null;
  cloudCoverPercent?: number | null;
  precipitationMm?: number | null;
  windSpeedMps?: number | null;
  shortwaveRadiationWm2?: number | null;
  globalTiltedIrradianceWm2?: number | null;
  rawPayload?: unknown;
}

export interface WeatherForecastProvider extends Provider<WeatherForecastProviderCapabilities> {
  getHourlyForecast(query: WeatherForecastQuery): Promise<WeatherForecastInterval[]>;
}
