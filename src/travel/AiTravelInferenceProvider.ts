// Requirements: PRE-001, PRE-016, PRE-017, PRV-001, ARC-006

import type { AiTravelInferenceInput, AiTravelInferenceResult } from "./travelTypes.js";

export interface AiTravelInferenceProvider {
  inferTrip(input: AiTravelInferenceInput): Promise<AiTravelInferenceResult | null>;
}
