// Requirements: DB-007, DB-013, DB-015, DB-017, EMG-004, UX-101, UX-102, ARC-003

import type { ChargingPlanRecord, ChargingPlanStatus } from "../types/persistenceTypes.js";
import { BaseRepository } from "./BaseRepository.js";

export interface CreateChargingPlan {
  userModeId: string;
  status: ChargingPlanStatus;
  targetDepartureTime: string;
  targetMinSocPercent: number;
  targetMaxSocPercent: number;
  plannedEnergyKwh: number;
  estimatedCost: number;
  currency?: string | null;
  estimatedStartTime?: string | null;
  estimatedEndTime?: string | null;
  estimatedCompletionTime?: string | null;
  estimatedCompletionTimeMin?: string | null;
  estimatedCompletionTimeMax?: string | null;
  resultingSocPercent?: number | null;
  deficitKwh?: number;
  deficitSocPercent?: number;
  reason: string[];
  inputsSnapshot?: unknown;
  planSnapshot?: unknown;
}

export interface CompleteChargingPlan {
  id: string;
  status: Extract<ChargingPlanStatus, "completed" | "failed" | "cancelled">;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  actualCompletionTime?: string | null;
  resultingSocPercent?: number | null;
}

export class ChargingPlanRepository extends BaseRepository {
  async createPlan(input: CreateChargingPlan): Promise<ChargingPlanRecord> {
    return this.one<ChargingPlanRecord>(
      `
        insert into charging_plans (
          user_mode_id, status, target_departure_time, target_min_soc_percent,
          target_max_soc_percent, planned_energy_kwh, estimated_cost, currency,
          estimated_start_time, estimated_end_time, estimated_completion_time,
          estimated_completion_time_min, estimated_completion_time_max,
          resulting_soc_percent, deficit_kwh, deficit_soc_percent,
          reason, inputs_snapshot, plan_snapshot
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb)
        returning ${chargingPlanColumns()}
      `,
      [
        input.userModeId,
        input.status,
        input.targetDepartureTime,
        input.targetMinSocPercent,
        input.targetMaxSocPercent,
        input.plannedEnergyKwh,
        input.estimatedCost,
        input.currency ?? null,
        input.estimatedStartTime ?? null,
        input.estimatedEndTime ?? null,
        input.estimatedCompletionTime ?? null,
        input.estimatedCompletionTimeMin ?? null,
        input.estimatedCompletionTimeMax ?? null,
        input.resultingSocPercent ?? null,
        input.deficitKwh ?? 0,
        input.deficitSocPercent ?? 0,
        input.reason,
        JSON.stringify(input.inputsSnapshot ?? {}),
        JSON.stringify(input.planSnapshot ?? {}),
      ],
    );
  }

  async completePlan(input: CompleteChargingPlan): Promise<ChargingPlanRecord> {
    return this.one<ChargingPlanRecord>(
      `
        update charging_plans
        set
          status = $2,
          actual_start_time = $3,
          actual_end_time = $4,
          actual_completion_time = $5,
          resulting_soc_percent = coalesce($6, resulting_soc_percent),
          updated_at = now()
        where id = $1
        returning ${chargingPlanColumns()}
      `,
      [
        input.id,
        input.status,
        input.actualStartTime ?? null,
        input.actualEndTime ?? null,
        input.actualCompletionTime ?? null,
        input.resultingSocPercent ?? null,
      ],
    );
  }

  async getPlan(id: string): Promise<ChargingPlanRecord | null> {
    const rows = await this.many<ChargingPlanRecord>(
      `select ${chargingPlanColumns()} from charging_plans where id = $1`,
      [id],
    );

    return rows[0] ?? null;
  }
}

function chargingPlanColumns(): string {
  return `
    id,
    user_mode_id as "userModeId",
    status,
    target_departure_time as "targetDepartureTime",
    target_min_soc_percent as "targetMinSocPercent",
    target_max_soc_percent as "targetMaxSocPercent",
    planned_energy_kwh as "plannedEnergyKwh",
    estimated_cost as "estimatedCost",
    currency,
    estimated_start_time as "estimatedStartTime",
    estimated_end_time as "estimatedEndTime",
    estimated_completion_time as "estimatedCompletionTime",
    estimated_completion_time_min as "estimatedCompletionTimeMin",
    estimated_completion_time_max as "estimatedCompletionTimeMax",
    actual_start_time as "actualStartTime",
    actual_end_time as "actualEndTime",
    actual_completion_time as "actualCompletionTime",
    resulting_soc_percent as "resultingSocPercent",
    deficit_kwh as "deficitKwh",
    deficit_soc_percent as "deficitSocPercent",
    reason,
    inputs_snapshot as "inputsSnapshot",
    plan_snapshot as "planSnapshot",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
}
