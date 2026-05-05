// Requirements: PRV-001, PRV-004, PRE-003, PRE-006, ARC-006

import type {
  WeatherForecastInterval,
  WeatherForecastProvider,
  WeatherForecastQuery,
} from "../WeatherForecastProvider.js";

export interface OpenMeteoWeatherProviderConfig {
  latitude: number;
  longitude: number;
  panelTiltDegrees?: number | null;
  panelAzimuthDegrees?: number | null;
  endpoint?: string;
}

export class OpenMeteoWeatherProvider implements WeatherForecastProvider {
  metadata = {
    id: "open-meteo",
    displayName: "Open-Meteo",
    kind: "weather-forecast" as const,
  };

  configSchema = {
    fields: [
      {
        key: "latitude",
        label: "Latitude",
        type: "number" as const,
        required: true,
      },
      {
        key: "longitude",
        label: "Longitude",
        type: "number" as const,
        required: true,
      },
      {
        key: "panel_tilt_degrees",
        label: "Panel tilt",
        type: "number" as const,
        required: false,
      },
      {
        key: "panel_azimuth_degrees",
        label: "Panel azimuth",
        type: "number" as const,
        required: false,
      },
    ],
  };

  capabilities = {
    supportsHourlyForecast: true,
    supportsSolarRadiation: true,
  };

  private readonly endpoint: string;

  constructor(private readonly config: OpenMeteoWeatherProviderConfig) {
    this.endpoint = config.endpoint ?? "https://api.open-meteo.com/v1/forecast";
  }

  async getHourlyForecast(query: WeatherForecastQuery): Promise<WeatherForecastInterval[]> {
    const url = this.buildUrl(query);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Open-Meteo request failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as OpenMeteoForecastResponse;
    return mapOpenMeteoResponse(payload, query);
  }

  private buildUrl(query: WeatherForecastQuery): string {
    const url = new URL(this.endpoint);
    url.searchParams.set("latitude", String(this.config.latitude));
    url.searchParams.set("longitude", String(this.config.longitude));
    url.searchParams.set(
      "hourly",
      [
        "temperature_2m",
        "cloud_cover",
        "precipitation",
        "wind_speed_10m",
        "shortwave_radiation",
        "global_tilted_irradiance",
      ].join(","),
    );
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("timeformat", "iso8601");
    url.searchParams.set("start_date", query.startsAt.slice(0, 10));
    url.searchParams.set("end_date", query.endsAt.slice(0, 10));
    url.searchParams.set("wind_speed_unit", "ms");

    if (this.config.panelTiltDegrees !== undefined && this.config.panelTiltDegrees !== null) {
      url.searchParams.set("tilt", String(this.config.panelTiltDegrees));
    }

    if (this.config.panelAzimuthDegrees !== undefined && this.config.panelAzimuthDegrees !== null) {
      url.searchParams.set("azimuth", String(this.config.panelAzimuthDegrees));
    }

    return url.toString();
  }
}

interface OpenMeteoForecastResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    cloud_cover?: Array<number | null>;
    precipitation?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    shortwave_radiation?: Array<number | null>;
    global_tilted_irradiance?: Array<number | null>;
  };
}

function mapOpenMeteoResponse(
  payload: OpenMeteoForecastResponse,
  query: WeatherForecastQuery,
): WeatherForecastInterval[] {
  const hourly = payload.hourly;
  if (hourly?.time === undefined) {
    return [];
  }

  const startsAtMs = Date.parse(query.startsAt);
  const endsAtMs = Date.parse(query.endsAt);

  return hourly.time
    .map((time, index) => {
      const intervalStartsAtMs = Date.parse(time.endsWith("Z") ? time : `${time}Z`);
      return {
        startsAt: new Date(intervalStartsAtMs).toISOString(),
        endsAt: new Date(intervalStartsAtMs + 3_600_000).toISOString(),
        temperatureC: hourly.temperature_2m?.[index] ?? null,
        cloudCoverPercent: hourly.cloud_cover?.[index] ?? null,
        precipitationMm: hourly.precipitation?.[index] ?? null,
        windSpeedMps: hourly.wind_speed_10m?.[index] ?? null,
        shortwaveRadiationWm2: hourly.shortwave_radiation?.[index] ?? null,
        globalTiltedIrradianceWm2: hourly.global_tilted_irradiance?.[index] ?? null,
        rawPayload: {
          time,
          temperature_2m: hourly.temperature_2m?.[index] ?? null,
          cloud_cover: hourly.cloud_cover?.[index] ?? null,
          precipitation: hourly.precipitation?.[index] ?? null,
          wind_speed_10m: hourly.wind_speed_10m?.[index] ?? null,
          shortwave_radiation: hourly.shortwave_radiation?.[index] ?? null,
          global_tilted_irradiance: hourly.global_tilted_irradiance?.[index] ?? null,
        },
      };
    })
    .filter((interval) => {
      const intervalStartsAtMs = Date.parse(interval.startsAt);
      return intervalStartsAtMs >= startsAtMs && intervalStartsAtMs < endsAtMs;
    });
}
