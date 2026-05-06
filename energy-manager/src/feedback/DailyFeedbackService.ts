// Requirements: FDB-001, FDB-002, FDB-003, FDB-004, FDB-005, FDB-006, FDB-007, DB-015, DB-017, DB-018, UX-101

import type { DecisionOutcomeRecord } from "../db/types/persistenceTypes.js";

export type DailyFeedbackIssue = "late_charging" | "wrong_prediction";
export type DailyFeedbackSuggestion = "increase_buffer" | "start_earlier";

export interface DailyFeedbackFailure {
  cause: string;
  reason: string;
}

export interface DailyFeedbackSummary {
  wasCarReady: boolean;
  moneySaved: number;
  failures: DailyFeedbackFailure[];
  detectedIssues: DailyFeedbackIssue[];
  suggestions: DailyFeedbackSuggestion[];
  reason: string[];
}

export interface AnalyzeOutcomesOptions {
  socPredictionTolerancePercent?: number;
  lateToleranceMinutes?: number;
}

const DEFAULT_SOC_PREDICTION_TOLERANCE_PERCENT = 5;
const DEFAULT_LATE_TOLERANCE_MINUTES = 5;

export function analyzeOutcomes(
  outcomes: DecisionOutcomeRecord[],
  options: AnalyzeOutcomesOptions = {},
): DailyFeedbackSummary {
  const socPredictionTolerancePercent =
    options.socPredictionTolerancePercent ?? DEFAULT_SOC_PREDICTION_TOLERANCE_PERCENT;
  const lateToleranceMs = (options.lateToleranceMinutes ?? DEFAULT_LATE_TOLERANCE_MINUTES) * 60_000;
  const detectedIssues = new Set<DailyFeedbackIssue>();
  const suggestions = new Set<DailyFeedbackSuggestion>();
  const failures: DailyFeedbackFailure[] = [];
  const reason: string[] = [];
  let moneySaved = 0;

  for (const outcome of outcomes) {
    moneySaved += calculateSavings(outcome);

    if (outcome.outcome === "failure") {
      failures.push({
        cause: outcome.cause,
        reason: humanizeCause(outcome.cause),
      });
    }

    if (isLateCharging(outcome, lateToleranceMs)) {
      detectedIssues.add("late_charging");
      suggestions.add("start_earlier");
    }

    if (isWrongPrediction(outcome, socPredictionTolerancePercent)) {
      detectedIssues.add("wrong_prediction");
      suggestions.add("increase_buffer");
    }
  }

  const wasCarReady = outcomes.length > 0 && failures.length === 0 && !detectedIssues.has("late_charging");

  if (wasCarReady) {
    reason.push("The car was ready when needed.");
  }

  if (moneySaved > 0) {
    reason.push(`Charging cost less than the comparison plan by ${roundMoney(moneySaved)}.`);
  }

  if (detectedIssues.has("late_charging")) {
    reason.push("Charging finished later than planned.");
  }

  if (detectedIssues.has("wrong_prediction")) {
    reason.push("The predicted charge level did not match the actual result.");
  }

  if (outcomes.length === 0) {
    reason.push("No charging outcome has been recorded for this day.");
  }

  return {
    wasCarReady,
    moneySaved: roundMoney(moneySaved),
    failures,
    detectedIssues: Array.from(detectedIssues),
    suggestions: Array.from(suggestions),
    reason,
  };
}

function calculateSavings(outcome: DecisionOutcomeRecord): number {
  if (outcome.estimatedCost === null || outcome.actualCost === null) {
    return 0;
  }

  return Math.max(0, outcome.estimatedCost - outcome.actualCost);
}

function isLateCharging(outcome: DecisionOutcomeRecord, lateToleranceMs: number): boolean {
  const normalizedCause = outcome.cause.toLowerCase();
  if (normalizedCause.includes("late_charging") || normalizedCause.includes("late charging")) {
    return true;
  }

  if (outcome.actualCompletionTime === null) {
    return false;
  }

  const expectedCompletion =
    outcome.estimatedCompletionTimeMax ?? outcome.estimatedCompletionTime ?? outcome.estimatedCompletionTimeMin;

  if (expectedCompletion === null || expectedCompletion === undefined) {
    return false;
  }

  return Date.parse(outcome.actualCompletionTime) - Date.parse(expectedCompletion) > lateToleranceMs;
}

function isWrongPrediction(outcome: DecisionOutcomeRecord, socPredictionTolerancePercent: number): boolean {
  const normalizedCause = outcome.cause.toLowerCase();
  if (normalizedCause.includes("wrong_prediction") || normalizedCause.includes("wrong prediction")) {
    return true;
  }

  if (outcome.estimatedSocPercent === null || outcome.actualSocPercent === null) {
    return false;
  }

  return Math.abs(outcome.estimatedSocPercent - outcome.actualSocPercent) > socPredictionTolerancePercent;
}

function humanizeCause(cause: string): string {
  const textByCause: Record<string, string> = {
    late_charging: "Charging finished too late.",
    wrong_prediction: "The prediction was off.",
    undercharged: "The car did not reach the needed charge.",
  };

  return textByCause[cause] ?? cause.replace(/_/g, " ");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
