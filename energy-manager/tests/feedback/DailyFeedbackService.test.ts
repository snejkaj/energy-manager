// Requirements: FDB-001, FDB-002, FDB-003, FDB-004, FDB-005, FDB-006, FDB-007

import { describe, expect, it } from "vitest";

import { analyzeOutcomes } from "../../src/feedback/DailyFeedbackService.js";
import type { DecisionOutcomeRecord } from "../../src/db/types/persistenceTypes.js";

describe("analyzeOutcomes", () => {
  it("shows that the car was ready and calculates money saved", () => {
    // Requirements: FDB-001, FDB-002, FDB-004
    const feedback = analyzeOutcomes([
      outcome({
        estimatedCost: 48.5,
        actualCost: 31.25,
        estimatedCompletionTimeMax: "2026-05-05T07:30:00.000Z",
        actualCompletionTime: "2026-05-05T07:20:00.000Z",
      }),
    ]);

    expect(feedback.wasCarReady).toBe(true);
    expect(feedback.moneySaved).toBe(17.25);
    expect(feedback.failures).toEqual([]);
    expect(feedback.reason).toContain("The car was ready when needed.");
  });

  it("detects late charging and suggests starting earlier", () => {
    // Requirements: FDB-003, FDB-005, FDB-007
    const feedback = analyzeOutcomes([
      outcome({
        outcome: "failure",
        cause: "late_charging",
        estimatedCompletionTimeMax: "2026-05-05T07:30:00.000Z",
        actualCompletionTime: "2026-05-05T07:48:00.000Z",
      }),
    ]);

    expect(feedback.wasCarReady).toBe(false);
    expect(feedback.detectedIssues).toEqual(["late_charging"]);
    expect(feedback.suggestions).toEqual(["start_earlier"]);
    expect(feedback.failures).toEqual([{ cause: "late_charging", reason: "Charging finished too late." }]);
  });

  it("detects wrong prediction and suggests increasing the buffer", () => {
    // Requirements: FDB-006, FDB-007
    const feedback = analyzeOutcomes([
      outcome({
        estimatedSocPercent: 80,
        actualSocPercent: 72,
      }),
    ]);

    expect(feedback.detectedIssues).toEqual(["wrong_prediction"]);
    expect(feedback.suggestions).toEqual(["increase_buffer"]);
    expect(feedback.reason).toContain("The predicted charge level did not match the actual result.");
  });
});

function outcome(overrides: Partial<DecisionOutcomeRecord>): DecisionOutcomeRecord {
  return {
    id: "outcome-1",
    decisionLogId: "decision-1",
    chargingPlanId: "plan-1",
    outcome: "success",
    cause: "completed",
    estimatedCompletionTime: "2026-05-05T07:20:00.000Z",
    estimatedCompletionTimeMin: "2026-05-05T07:10:00.000Z",
    estimatedCompletionTimeMax: "2026-05-05T07:30:00.000Z",
    actualCompletionTime: "2026-05-05T07:18:00.000Z",
    completionDeltaSeconds: null,
    estimatedSocPercent: 80,
    actualSocPercent: 79,
    estimatedCost: 20,
    actualCost: 18,
    trainingLabel: null,
    featuresSnapshot: {},
    outcomeMetadata: {},
    recordedAt: "2026-05-05T08:00:00.000Z",
    ...overrides,
  };
}
