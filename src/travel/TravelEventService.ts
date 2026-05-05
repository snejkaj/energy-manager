// Requirements: PRE-001, PRE-012, PRE-013, PRE-014, PRE-015, PRE-016, PRE-017, DB-011, DB-012, ARC-001, ARC-003

import type { TravelRepository } from "../db/repositories/TravelRepository.js";
import type { TravelEventRecord, TravelPredictionRecord } from "../db/types/persistenceTypes.js";
import type { AiTravelInferenceProvider } from "./AiTravelInferenceProvider.js";
import { detectExplicitTravelFromCalendar, detectExplicitTravelFromUserTag } from "./TravelTagging.js";
import type { CalendarEventInput, UserTaggedTravelInput } from "./travelTypes.js";

export class TravelEventService {
  constructor(
    private readonly travelRepository: TravelRepository,
    private readonly aiProvider: AiTravelInferenceProvider | null = null,
  ) {}

  async importCalendarEvent(event: CalendarEventInput): Promise<TravelEventRecord | TravelPredictionRecord | null> {
    const explicitDetection = detectExplicitTravelFromCalendar(event);

    if (explicitDetection.needsCar) {
      return this.travelRepository.createTravelEvent({
        source: "calendar",
        externalId: event.externalId ?? null,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt ?? null,
        location: event.location ?? null,
        userTags: explicitDetection.tags,
        needsCar: true,
        tripSize: explicitDetection.tripSize,
        detectionSource: explicitDetection.detectionSource,
        explicitOverride: true,
        metadata: {
          description: event.description ?? null,
        },
      });
    }

    return this.inferTravel(event);
  }

  async createUserTaggedTravel(input: UserTaggedTravelInput): Promise<TravelEventRecord> {
    const explicitDetection = detectExplicitTravelFromUserTag(input);
    return this.travelRepository.createTravelEvent({
      source: "user_tagged",
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      location: input.location ?? null,
      userTags: explicitDetection.tags,
      needsCar: explicitDetection.needsCar,
      tripSize: explicitDetection.tripSize,
      detectionSource: explicitDetection.detectionSource,
      explicitOverride: true,
      metadata: {
        manualToggleNeedsCar: input.needsCar,
      },
    });
  }

  private async inferTravel(event: CalendarEventInput): Promise<TravelPredictionRecord | null> {
    if (this.aiProvider === null) {
      return null;
    }

    const explicitExists = await this.travelRepository.hasExplicitTravelEvent(
      event.startsAt,
      event.endsAt ?? event.startsAt,
    );
    if (explicitExists) {
      return null;
    }

    const inference = await this.aiProvider.inferTrip({
      title: event.title,
      description: event.description ?? null,
      startsAt: event.startsAt,
      endsAt: event.endsAt ?? null,
      location: event.location ?? null,
    });

    if (inference === null || !inference.needsCar) {
      return null;
    }

    validateConfidence(inference.confidence);

    return this.travelRepository.createTravelPrediction({
      predictedAt: new Date().toISOString(),
      predictedDepartureAt: event.startsAt,
      predictedReturnAt: event.endsAt ?? null,
      predictedDistanceKm: inference.predictedDistanceKm ?? null,
      predictedEnergyNeedKwh: inference.predictedEnergyNeedKwh ?? null,
      tripSize: inference.tripSize ?? null,
      confidence: inference.confidence,
      overriddenByExplicitEvent: false,
      modelName: "external-ai-travel-inference",
      modelVersion: "1",
      features: {
        event,
        inferenceFeatures: inference.features ?? {},
      },
      reason: inference.reason,
    });
  }
}

function validateConfidence(confidence: number): void {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("AI travel inference confidence must be between 0 and 1.");
  }
}
