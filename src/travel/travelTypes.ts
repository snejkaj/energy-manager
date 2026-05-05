// Requirements: PRE-001, PRE-012, PRE-013, PRE-014, PRE-015, PRE-016, ARC-001

import type { TravelDetectionSource, TripSize } from "../db/types/persistenceTypes.js";

export interface CalendarEventInput {
  externalId?: string | null;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
}

export interface UserTaggedTravelInput {
  title: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  needsCar: boolean;
  tripSize?: TripSize | null;
  tags?: string[];
}

export interface ExplicitTravelDetection {
  needsCar: boolean;
  detectionSource: TravelDetectionSource | null;
  tripSize: TripSize | null;
  tags: string[];
}

export interface AiTravelInferenceInput {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
}

export interface AiTravelInferenceResult {
  needsCar: boolean;
  confidence: number;
  tripSize?: TripSize | null;
  predictedDistanceKm?: number | null;
  predictedEnergyNeedKwh?: number | null;
  reason: string[];
  features?: unknown;
}
