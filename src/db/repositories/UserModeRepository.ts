// Requirements: DB-007, DB-016, DB-022, MOD-001, MOD-002, SAF-001, ARC-003

import type { UserModeName, UserModeRecord, UserPreferenceRecord } from "../types/persistenceTypes.js";
import { BaseRepository } from "./BaseRepository.js";

export interface UpdateUserPreferences {
  userMode: UserModeName;
  socBufferPercent: number;
  startEarlyMinutes: number;
  allowUnderchargeRisk: boolean;
}

export class UserModeRepository extends BaseRepository {
  async listModes(): Promise<UserModeRecord[]> {
    return this.many<UserModeRecord>(
      `
        select
          id,
          mode,
          display_name as "displayName",
          description,
          safety_priority as "safetyPriority",
          savings_priority as "savingsPriority",
          undercharge_risk_allowed as "underchargeRiskAllowed",
          requires_explicit_user_choice as "requiresExplicitUserChoice",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from user_modes
        order by safety_priority desc, savings_priority desc
      `,
    );
  }

  async getMode(mode: UserModeName): Promise<UserModeRecord | null> {
    const rows = await this.many<UserModeRecord>(
      `
        select
          id,
          mode,
          display_name as "displayName",
          description,
          safety_priority as "safetyPriority",
          savings_priority as "savingsPriority",
          undercharge_risk_allowed as "underchargeRiskAllowed",
          requires_explicit_user_choice as "requiresExplicitUserChoice",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from user_modes
        where mode = $1
      `,
      [mode],
    );

    return rows[0] ?? null;
  }

  async getPreferences(): Promise<UserPreferenceRecord> {
    return this.one<UserPreferenceRecord>(
      `
        select ${userPreferenceColumns()}
        from user_preferences
        where singleton_key = 'default'
      `,
      [],
    );
  }

  async updatePreferences(input: UpdateUserPreferences): Promise<UserPreferenceRecord> {
    return this.one<UserPreferenceRecord>(
      `
        insert into user_preferences (
          singleton_key, user_mode, soc_buffer_percent, start_early_minutes, allow_undercharge_risk
        )
        values ('default', $1, $2, $3, $4)
        on conflict (singleton_key) do update set
          user_mode = excluded.user_mode,
          soc_buffer_percent = excluded.soc_buffer_percent,
          start_early_minutes = excluded.start_early_minutes,
          allow_undercharge_risk = excluded.allow_undercharge_risk,
          updated_at = now()
        returning ${userPreferenceColumns()}
      `,
      [
        input.userMode,
        input.socBufferPercent,
        input.startEarlyMinutes,
        input.allowUnderchargeRisk,
      ],
    );
  }
}

function userPreferenceColumns(): string {
  return `
    id,
    singleton_key as "singletonKey",
    user_mode as "userMode",
    soc_buffer_percent as "socBufferPercent",
    start_early_minutes as "startEarlyMinutes",
    allow_undercharge_risk as "allowUnderchargeRisk",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
}
