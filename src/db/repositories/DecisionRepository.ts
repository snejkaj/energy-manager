// Requirements: DB-007, DB-014, DB-015, DB-017, DB-018, FDB-001, FDB-003, UX-101, UX-102, UX-104, ARC-003

import type { DecisionLogRecord, DecisionOutcomeRecord, DecisionOutcomeStatus, UserModeName } from "../types/persistenceTypes.js";
import { BaseRepository } from "./BaseRepository.js";

export interface CreateDecisionLog {
  chargingPlanId?: string | null;
  decisionAt?: string;
  decisionType: string;
  selectedAction: string;
  userMode: UserModeName;
  reason: string[];
  explanation: string;
  inputsSnapshot?: unknown;
  alternativesSnapshot?: unknown;
  selectedPlanSnapshot?: unknown;
  modelMetadata?: unknown;
}

export interface CreateDecisionOutcome {
  decisionLogId: string;
  chargingPlanId?: string | null;
  outcome: DecisionOutcomeStatus;
  cause: string;
  estimatedCompletionTime?: string | null;
  estimatedCompletionTimeMin?: string | null;
  estimatedCompletionTimeMax?: string | null;
  actualCompletionTime?: string | null;
  estimatedSocPercent?: number | null;
  actualSocPercent?: number | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  trainingLabel?: string | null;
  featuresSnapshot?: unknown;
  outcomeMetadata?: unknown;
}

export class DecisionRepository extends BaseRepository {
  async createDecisionLog(input: CreateDecisionLog): Promise<DecisionLogRecord> {
    return this.one<DecisionLogRecord>(
      `
        insert into decision_logs (
          charging_plan_id, decision_at, decision_type, selected_action, user_mode,
          reason, explanation, inputs_snapshot, alternatives_snapshot,
          selected_plan_snapshot, model_metadata
        )
        values ($1, coalesce($2::timestamptz, now()), $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb)
        returning ${decisionLogColumns()}
      `,
      [
        input.chargingPlanId ?? null,
        input.decisionAt ?? null,
        input.decisionType,
        input.selectedAction,
        input.userMode,
        input.reason,
        input.explanation,
        JSON.stringify(input.inputsSnapshot ?? {}),
        JSON.stringify(input.alternativesSnapshot ?? []),
        JSON.stringify(input.selectedPlanSnapshot ?? {}),
        JSON.stringify(input.modelMetadata ?? {}),
      ],
    );
  }

  async createDecisionOutcome(input: CreateDecisionOutcome): Promise<DecisionOutcomeRecord> {
    return this.one<DecisionOutcomeRecord>(
      `
        insert into decision_outcomes (
          decision_log_id, charging_plan_id, outcome, cause, estimated_completion_time,
          estimated_completion_time_min, estimated_completion_time_max,
          actual_completion_time, estimated_soc_percent, actual_soc_percent,
          estimated_cost, actual_cost, training_label, features_snapshot, outcome_metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb)
        returning ${decisionOutcomeColumns()}
      `,
      [
        input.decisionLogId,
        input.chargingPlanId ?? null,
        input.outcome,
        input.cause,
        input.estimatedCompletionTime ?? null,
        input.estimatedCompletionTimeMin ?? null,
        input.estimatedCompletionTimeMax ?? null,
        input.actualCompletionTime ?? null,
        input.estimatedSocPercent ?? null,
        input.actualSocPercent ?? null,
        input.estimatedCost ?? null,
        input.actualCost ?? null,
        input.trainingLabel ?? null,
        JSON.stringify(input.featuresSnapshot ?? {}),
        JSON.stringify(input.outcomeMetadata ?? {}),
      ],
    );
  }

  async listDecisionsForTraining(startsAt: string, endsAt: string): Promise<DecisionOutcomeRecord[]> {
    return this.listOutcomesForDay(startsAt, endsAt);
  }

  async listOutcomesForDay(startsAt: string, endsAt: string): Promise<DecisionOutcomeRecord[]> {
    return this.many<DecisionOutcomeRecord>(
      `
        select ${decisionOutcomeColumns()}
        from decision_outcomes
        where recorded_at >= $1 and recorded_at < $2
        order by recorded_at asc
      `,
      [startsAt, endsAt],
    );
  }
}

function decisionLogColumns(): string {
  return `
    id,
    charging_plan_id as "chargingPlanId",
    decision_at as "decisionAt",
    decision_type as "decisionType",
    selected_action as "selectedAction",
    user_mode as "userMode",
    reason,
    explanation,
    inputs_snapshot as "inputsSnapshot",
    alternatives_snapshot as "alternativesSnapshot",
    selected_plan_snapshot as "selectedPlanSnapshot",
    model_metadata as "modelMetadata",
    created_at as "createdAt"
  `;
}

function decisionOutcomeColumns(): string {
  return `
    id,
    decision_log_id as "decisionLogId",
    charging_plan_id as "chargingPlanId",
    outcome,
    cause,
    estimated_completion_time as "estimatedCompletionTime",
    estimated_completion_time_min as "estimatedCompletionTimeMin",
    estimated_completion_time_max as "estimatedCompletionTimeMax",
    actual_completion_time as "actualCompletionTime",
    completion_delta_seconds as "completionDeltaSeconds",
    estimated_soc_percent as "estimatedSocPercent",
    actual_soc_percent as "actualSocPercent",
    estimated_cost as "estimatedCost",
    actual_cost as "actualCost",
    training_label as "trainingLabel",
    features_snapshot as "featuresSnapshot",
    outcome_metadata as "outcomeMetadata",
    recorded_at as "recordedAt"
  `;
}
