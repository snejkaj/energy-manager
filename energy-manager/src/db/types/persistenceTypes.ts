// Requirements: DB-009, DB-010, DB-011, DB-012, DB-013, DB-014, DB-015, DB-016, DB-017, DB-018, OPS-006, UX-101, UX-102, MOD-001, EMG-004, PRE-001, PRE-003

export type UserModeName = "safe" | "balanced" | "savings";
export type TravelEventSource = "calendar" | "user_tagged";
export type TripSize = "short" | "medium" | "long";
export type TravelDetectionSource = "emoji" | "keyword" | "manual_toggle" | "user_tag";
export type ChargingPlanStatus = "planned" | "active" | "completed" | "failed" | "cancelled" | "emergency";
export type DecisionOutcomeStatus = "success" | "failure";

export interface WeatherForecastRecord {
  id: string;
  providerId: string;
  forecastAt: string;
  validFrom: string;
  validTo: string;
  temperatureC: number | null;
  cloudCoverPercent: number | null;
  precipitationMm: number | null;
  windSpeedMps: number | null;
  shortwaveRadiationWm2: number | null;
  globalTiltedIrradianceWm2: number | null;
  confidence: number | null;
  rawPayload: unknown;
  createdAt: string;
}

export interface SolarPredictionRecord {
  id: string;
  providerId: string;
  weatherForecastId: string | null;
  predictedAt: string;
  startsAt: string;
  endsAt: string;
  predictedProductionKwh: number;
  predictedPeakPowerKw: number | null;
  confidence: number | null;
  features: unknown;
  modelName: string | null;
  modelVersion: string | null;
  createdAt: string;
}

export interface TravelEventRecord {
  id: string;
  source: TravelEventSource;
  externalId: string | null;
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  userTags: string[];
  needsCar: boolean;
  tripSize: TripSize | null;
  detectionSource: TravelDetectionSource | null;
  explicitOverride: boolean;
  expectedDistanceKm: number | null;
  expectedEnergyNeedKwh: number | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface TravelPredictionRecord {
  id: string;
  travelEventId: string | null;
  predictedAt: string;
  predictedDepartureAt: string;
  predictedReturnAt: string | null;
  predictedDistanceKm: number | null;
  predictedEnergyNeedKwh: number | null;
  tripSize: TripSize | null;
  requiredSocPercent: number | null;
  confidence: number | null;
  overriddenByExplicitEvent: boolean;
  modelName: string;
  modelVersion: string;
  features: unknown;
  reason: string[];
  createdAt: string;
}

export interface UserModeRecord {
  id: string;
  mode: UserModeName;
  displayName: string;
  description: string;
  safetyPriority: number;
  savingsPriority: number;
  underchargeRiskAllowed: boolean;
  requiresExplicitUserChoice: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferenceRecord {
  id: string;
  singletonKey: string;
  userMode: UserModeName;
  socBufferPercent: number;
  startEarlyMinutes: number;
  allowUnderchargeRisk: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChargingPlanRecord {
  id: string;
  userModeId: string;
  status: ChargingPlanStatus;
  targetDepartureTime: string;
  targetMinSocPercent: number;
  targetMaxSocPercent: number;
  plannedEnergyKwh: number;
  estimatedCost: number;
  currency: string | null;
  estimatedStartTime: string | null;
  estimatedEndTime: string | null;
  estimatedCompletionTime: string | null;
  estimatedCompletionTimeMin: string | null;
  estimatedCompletionTimeMax: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  actualCompletionTime: string | null;
  resultingSocPercent: number | null;
  deficitKwh: number;
  deficitSocPercent: number;
  reason: string[];
  inputsSnapshot: unknown;
  planSnapshot: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionLogRecord {
  id: string;
  chargingPlanId: string | null;
  decisionAt: string;
  decisionType: string;
  selectedAction: string;
  userMode: UserModeName;
  reason: string[];
  explanation: string;
  inputsSnapshot: unknown;
  alternativesSnapshot: unknown;
  selectedPlanSnapshot: unknown;
  modelMetadata: unknown;
  createdAt: string;
}

export interface DecisionOutcomeRecord {
  id: string;
  decisionLogId: string;
  chargingPlanId: string | null;
  outcome: DecisionOutcomeStatus;
  cause: string;
  estimatedCompletionTime: string | null;
  estimatedCompletionTimeMin: string | null;
  estimatedCompletionTimeMax: string | null;
  actualCompletionTime: string | null;
  completionDeltaSeconds: number | null;
  estimatedSocPercent: number | null;
  actualSocPercent: number | null;
  estimatedCost: number | null;
  actualCost: number | null;
  trainingLabel: string | null;
  featuresSnapshot: unknown;
  outcomeMetadata: unknown;
  recordedAt: string;
}
