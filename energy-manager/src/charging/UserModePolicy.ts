// Requirements: SAF-001, SAF-002, MOD-001, MOD-002, CHG-003, CHG-004, ARC-001

import type { ChargingTarget, IsoDateTime } from "./types.js";

export type UserMode = "safe" | "balanced" | "savings";

export interface UserModePolicy {
  mode: UserMode;
  socBufferPercent: number;
  startEarlyMinutes: number;
  allowUnderchargeRisk: boolean;
}

export interface ApplyUserModeInput {
  target: ChargingTarget;
  mode: UserMode;
  predictedRequiredSocPercent?: number | null;
}

export interface ApplyUserModeResult {
  target: ChargingTarget;
  policy: UserModePolicy;
  reason: string[];
}

export function applyUserModePolicy(input: ApplyUserModeInput): ApplyUserModeResult {
  const policy = getUserModePolicy(input.mode);
  const baseSoc = input.predictedRequiredSocPercent ?? input.target.minSocPercent;
  const bufferedTargetSoc = policy.allowUnderchargeRisk
    ? Math.min(baseSoc, input.target.minSocPercent)
    : baseSoc + policy.socBufferPercent;
  const minSocPercent = clamp(bufferedTargetSoc, 0, input.target.maxSocPercent);
  const departureTime = moveDeadlineEarlier(input.target.departureTime, policy.startEarlyMinutes);

  return {
    target: {
      ...input.target,
      departureTime,
      minSocPercent,
    },
    policy,
    reason: [
      `${policy.mode} mode applied`,
      `SOC buffer set to ${policy.socBufferPercent}%`,
      `Planning deadline moved ${policy.startEarlyMinutes} minutes earlier`,
    ],
  };
}

export function getUserModePolicy(mode: UserMode): UserModePolicy {
  switch (mode) {
    case "safe":
      return {
        mode,
        socBufferPercent: 15,
        startEarlyMinutes: 90,
        allowUnderchargeRisk: false,
      };
    case "balanced":
      return {
        mode,
        socBufferPercent: 7,
        startEarlyMinutes: 30,
        allowUnderchargeRisk: false,
      };
    case "savings":
      return {
        mode,
        socBufferPercent: 0,
        startEarlyMinutes: 0,
        allowUnderchargeRisk: true,
      };
  }
}

function moveDeadlineEarlier(departureTime: IsoDateTime, minutes: number): IsoDateTime {
  return new Date(Date.parse(departureTime) - minutes * 60_000).toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
