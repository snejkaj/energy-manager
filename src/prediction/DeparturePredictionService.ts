// Requirements: PRE-001, PRE-005, PRE-006, PRE-018, PRE-019, PRE-020, PRE-021, PRE-022, PRE-023, DB-012, DB-018, ARC-001

import type { CreateTravelPrediction } from "../db/repositories/TravelRepository.js";
import type { TravelEventRecord } from "../db/types/persistenceTypes.js";
import type { WeatherForecastInterval } from "../providers/WeatherForecastProvider.js";

export interface DeparturePredictionInput {
  now: string;
  batteryCapacityKwh: number;
  historicalDriving: TravelEventRecord[];
  calendarEvents: TravelEventRecord[];
  weatherForecasts?: WeatherForecastInterval[];
}

export interface DeparturePredictionResult {
  likelyDepartureTime: string;
  requiredSocPercent: number;
  confidence: number;
  predictedDistanceKm: number;
  predictedEnergyNeedKwh: number;
  reason: string[];
  features: DeparturePredictionFeatures;
}

export interface DeparturePredictionFeatures {
  modelName: string;
  modelVersion: string;
  weekday: number;
  minutesSinceMidnight: number;
  matchedRecurringEvents: number;
  averageDistanceKm: number;
  averageEnergyNeedKwh: number;
  calendarEventCount: number;
  weatherAdjustmentFactor: number;
}

export class DeparturePredictionService {
  predict(input: DeparturePredictionInput): DeparturePredictionResult | null {
    if (input.batteryCapacityKwh <= 0) {
      throw new Error("batteryCapacityKwh must be greater than 0.");
    }

    const nowDate = new Date(Date.parse(input.now));
    const candidateDeparture = selectDepartureTime(nowDate, input.historicalDriving, input.calendarEvents);
    if (candidateDeparture === null) {
      return null;
    }

    const recurringMatches = findRecurringMatches(candidateDeparture, input.historicalDriving);
    const distanceSamples = input.historicalDriving
      .map((event) => event.expectedDistanceKm)
      .filter((value): value is number => value !== null && value > 0);
    const energySamples = input.historicalDriving
      .map((event) => event.expectedEnergyNeedKwh)
      .filter((value): value is number => value !== null && value > 0);
    const averageDistanceKm = average(distanceSamples) ?? estimateDistanceFromTripSize(candidateDeparture.source?.tripSize);
    const averageEnergyNeedKwh = average(energySamples) ?? averageDistanceKm * 0.2;
    const weatherAdjustmentFactor = calculateWeatherAdjustment(candidateDeparture.startsAt, input.weatherForecasts ?? []);
    const predictedEnergyNeedKwh = averageEnergyNeedKwh * weatherAdjustmentFactor;
    const requiredSocPercent = clamp((predictedEnergyNeedKwh / input.batteryCapacityKwh) * 100 + 15, 20, 100);
    const confidence = calculateConfidence({
      recurringMatches: recurringMatches.length,
      distanceSampleCount: distanceSamples.length,
      calendarEventCount: input.calendarEvents.length,
      hasWeather: (input.weatherForecasts ?? []).length > 0,
    });

    return {
      likelyDepartureTime: candidateDeparture.startsAt,
      requiredSocPercent: round(requiredSocPercent),
      confidence: round(confidence),
      predictedDistanceKm: round(averageDistanceKm),
      predictedEnergyNeedKwh: round(predictedEnergyNeedKwh),
      reason: buildReasons(recurringMatches.length, input.calendarEvents.length, input.weatherForecasts?.length ?? 0),
      features: {
        modelName: "heuristic-departure-prediction",
        modelVersion: "1",
        weekday: new Date(Date.parse(candidateDeparture.startsAt)).getUTCDay(),
        minutesSinceMidnight: minutesSinceMidnight(candidateDeparture.startsAt),
        matchedRecurringEvents: recurringMatches.length,
        averageDistanceKm: round(averageDistanceKm),
        averageEnergyNeedKwh: round(averageEnergyNeedKwh),
        calendarEventCount: input.calendarEvents.length,
        weatherAdjustmentFactor: round(weatherAdjustmentFactor),
      },
    };
  }

  toTravelPrediction(result: DeparturePredictionResult, predictedAt: string): CreateTravelPrediction {
    return {
      predictedAt,
      predictedDepartureAt: result.likelyDepartureTime,
      predictedDistanceKm: result.predictedDistanceKm,
      predictedEnergyNeedKwh: result.predictedEnergyNeedKwh,
      requiredSocPercent: result.requiredSocPercent,
      confidence: result.confidence,
      modelName: result.features.modelName,
      modelVersion: result.features.modelVersion,
      features: result.features,
      reason: result.reason,
    };
  }
}

interface CandidateDeparture {
  startsAt: string;
  source?: TravelEventRecord;
}

function selectDepartureTime(
  now: Date,
  historicalDriving: TravelEventRecord[],
  calendarEvents: TravelEventRecord[],
): CandidateDeparture | null {
  const futureCalendar = calendarEvents
    .filter((event) => Date.parse(event.startsAt) >= now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  const explicitCalendar = futureCalendar.find((event) => event.needsCar);
  if (explicitCalendar !== undefined) {
    return { startsAt: explicitCalendar.startsAt, source: explicitCalendar };
  }

  const recurring = findMostCommonRecurringTime(now, historicalDriving);
  if (recurring !== null) {
    return { startsAt: recurring };
  }

  const nextCalendar = futureCalendar[0];
  return nextCalendar === undefined ? null : { startsAt: nextCalendar.startsAt, source: nextCalendar };
}

function findMostCommonRecurringTime(now: Date, historicalDriving: TravelEventRecord[]): string | null {
  const targetWeekday = now.getUTCDay();
  const buckets = new Map<number, number>();

  for (const event of historicalDriving) {
    const eventDate = new Date(Date.parse(event.startsAt));
    if (eventDate.getUTCDay() !== targetWeekday) {
      continue;
    }

    const bucket = Math.round(minutesSinceMidnight(event.startsAt) / 30) * 30;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }

  let bestBucket: number | null = null;
  let bestCount = 0;
  for (const [bucket, count] of buckets.entries()) {
    if (count > bestCount) {
      bestBucket = bucket;
      bestCount = count;
    }
  }

  if (bestBucket === null || bestCount < 2) {
    return null;
  }

  const departure = new Date(now);
  departure.setUTCHours(Math.floor(bestBucket / 60), bestBucket % 60, 0, 0);
  if (departure.getTime() < now.getTime()) {
    departure.setUTCDate(departure.getUTCDate() + 7);
  }

  return departure.toISOString();
}

function findRecurringMatches(candidate: CandidateDeparture, historicalDriving: TravelEventRecord[]): TravelEventRecord[] {
  const candidateDate = new Date(Date.parse(candidate.startsAt));
  const candidateMinutes = minutesSinceMidnight(candidate.startsAt);
  return historicalDriving.filter((event) => {
    const eventDate = new Date(Date.parse(event.startsAt));
    return eventDate.getUTCDay() === candidateDate.getUTCDay()
      && Math.abs(minutesSinceMidnight(event.startsAt) - candidateMinutes) <= 45;
  });
}

function calculateWeatherAdjustment(departureTime: string, forecasts: WeatherForecastInterval[]): number {
  const departureMs = Date.parse(departureTime);
  const forecast = forecasts.find((candidate) => {
    const startsAtMs = Date.parse(candidate.startsAt);
    const endsAtMs = Date.parse(candidate.endsAt);
    return startsAtMs <= departureMs && endsAtMs > departureMs;
  });

  if (forecast === undefined) {
    return 1;
  }

  const coldPenalty = forecast.temperatureC !== null && forecast.temperatureC !== undefined && forecast.temperatureC < 0 ? 1.12 : 1;
  const precipitationPenalty = forecast.precipitationMm !== null && forecast.precipitationMm !== undefined && forecast.precipitationMm > 0 ? 1.05 : 1;
  return coldPenalty * precipitationPenalty;
}

function calculateConfidence(input: {
  recurringMatches: number;
  distanceSampleCount: number;
  calendarEventCount: number;
  hasWeather: boolean;
}): number {
  return clamp(
    0.25
      + Math.min(input.recurringMatches, 5) * 0.08
      + Math.min(input.distanceSampleCount, 10) * 0.025
      + (input.calendarEventCount > 0 ? 0.15 : 0)
      + (input.hasWeather ? 0.05 : 0),
    0.1,
    0.95,
  );
}

function buildReasons(recurringMatches: number, calendarEventCount: number, weatherCount: number): string[] {
  const reasons = ["Predicted with heuristic departure model"];
  if (recurringMatches > 0) {
    reasons.push("Recurring driving time was found");
  }
  if (calendarEventCount > 0) {
    reasons.push("Calendar events were considered");
  }
  if (weatherCount > 0) {
    reasons.push("Weather was used to adjust required charge");
  }
  reasons.push("Average historical distance was used");
  return reasons;
}

function estimateDistanceFromTripSize(tripSize: string | null | undefined): number {
  switch (tripSize) {
    case "short":
      return 15;
    case "long":
      return 150;
    case "medium":
    default:
      return 50;
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function minutesSinceMidnight(isoTimestamp: string): number {
  const date = new Date(Date.parse(isoTimestamp));
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
