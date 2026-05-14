// Requirements: TES-005, OPS-001, OPS-005

import { logger } from "../../app/logger.js";
import type { TeslaRegion } from "./TeslaClient.js";

export type TeslaDiagnosticOperation = "token_exchange" | "vehicles_fetch" | "vehicle_data_fetch";
export type TeslaDiagnosticStep =
  | "start_auth"
  | "callback_received"
  | "state_validated"
  | "token_exchange_started"
  | "token_exchange_failed"
  | "token_exchange_succeeded"
  | "vehicles_fetch_started"
  | "vehicles_fetch_failed"
  | "vehicles_fetch_succeeded"
  | "vehicle_data_fetch_started"
  | "vehicle_data_fetch_failed"
  | "vehicle_data_fetch_succeeded";

export interface TeslaOAuthFleetLastError {
  lastStep: TeslaDiagnosticStep | null;
  httpStatus: number | null;
  safeError: string | null;
  redirectUriUsed: string | null;
  tokenEndpoint: string;
  fleetApiBaseUrl: string;
  scopesRequested: string[];
  tokenExchangeSuccess: boolean | null;
  vehiclesFetchSuccess: boolean | null;
  vehicleDataFetchSuccess: boolean | null;
  region: TeslaRegion;
  recordedAt: string | null;
}

const defaultState: TeslaOAuthFleetLastError = {
  lastStep: null,
  httpStatus: null,
  safeError: null,
  redirectUriUsed: null,
  tokenEndpoint: "https://auth.tesla.com/oauth2/v3/token",
  fleetApiBaseUrl: fleetApiBaseUrl("eu"),
  scopesRequested: ["openid", "offline_access", "vehicle_device_data"],
  tokenExchangeSuccess: null,
  vehiclesFetchSuccess: null,
  vehicleDataFetchSuccess: null,
  region: "eu",
  recordedAt: null,
};

let lastError: TeslaOAuthFleetLastError = { ...defaultState };

export function resetTeslaOAuthFleetDiagnostics(region: TeslaRegion, redirectUriUsed: string | null, scopesRequested: string[]): void {
  lastError = {
    ...defaultState,
    lastStep: "start_auth",
    redirectUriUsed,
    fleetApiBaseUrl: fleetApiBaseUrl(region),
    scopesRequested,
    region,
    recordedAt: new Date().toISOString(),
  };
  logger.info("TeslaDiag", `step=start_auth redirect_uri=${redirectUriUsed ?? "not configured"} scopes=${scopesRequested.join(" ")} region=${region}`);
}

export function recordTeslaStepStart(input: {
  step: TeslaDiagnosticOperation;
  endpoint: string;
  redirectUriUsed?: string | null;
  scopesRequested?: string[];
  region: TeslaRegion;
}): void {
  const url = new URL(input.endpoint);
  const step = `${input.step}_started` as TeslaDiagnosticStep;
  logger.info(
    "TeslaDiag",
    `step=${step} endpoint=${url.host}${url.pathname} redirect_uri=${input.redirectUriUsed ?? lastError.redirectUriUsed ?? "not applicable"} scopes=${(input.scopesRequested ?? lastError.scopesRequested).join(" ")} region=${input.region}`,
  );
  lastError = {
    ...lastError,
    lastStep: step,
    redirectUriUsed: input.redirectUriUsed ?? lastError.redirectUriUsed,
    tokenEndpoint: defaultState.tokenEndpoint,
    fleetApiBaseUrl: fleetApiBaseUrl(input.region),
    scopesRequested: input.scopesRequested ?? lastError.scopesRequested,
    region: input.region,
    recordedAt: new Date().toISOString(),
  };
}

export function recordTeslaStepResult(input: {
  step: TeslaDiagnosticOperation;
  httpStatus: number;
  endpoint: string;
  ok: boolean;
  safeError: string | null;
  redirectUriUsed?: string | null;
  scopesRequested?: string[];
  region: TeslaRegion;
}): void {
  const url = new URL(input.endpoint);
  const safeError = input.safeError === null ? null : sanitizeTeslaError(input.safeError);
  const step = `${input.step}_${input.ok ? "succeeded" : "failed"}` as TeslaDiagnosticStep;
  logger.info(
    "TeslaDiag",
    `step=${step} status=${input.httpStatus} endpoint=${url.host}${url.pathname} region=${input.region} error=${safeError ?? "none"}`,
  );
  lastError = {
    ...lastError,
    lastStep: step,
    httpStatus: input.httpStatus,
    safeError,
    redirectUriUsed: input.redirectUriUsed ?? lastError.redirectUriUsed,
    tokenEndpoint: defaultState.tokenEndpoint,
    fleetApiBaseUrl: fleetApiBaseUrl(input.region),
    scopesRequested: input.scopesRequested ?? lastError.scopesRequested,
    tokenExchangeSuccess: input.step === "token_exchange" ? input.ok : lastError.tokenExchangeSuccess,
    vehiclesFetchSuccess: input.step === "vehicles_fetch" ? input.ok : lastError.vehiclesFetchSuccess,
    vehicleDataFetchSuccess: input.step === "vehicle_data_fetch" ? input.ok : lastError.vehicleDataFetchSuccess,
    region: input.region,
    recordedAt: new Date().toISOString(),
  };
}

export function recordTeslaOAuthEvent(input: {
  step: "callback_received" | "state_validated";
  redirectUriUsed?: string | null;
  region: TeslaRegion;
  scopesRequested?: string[];
}): void {
  logger.info(
    "TeslaDiag",
    `step=${input.step} redirect_uri=${input.redirectUriUsed ?? lastError.redirectUriUsed ?? "not applicable"} scopes=${(input.scopesRequested ?? lastError.scopesRequested).join(" ")} region=${input.region}`,
  );
  lastError = {
    ...lastError,
    lastStep: input.step,
    redirectUriUsed: input.redirectUriUsed ?? lastError.redirectUriUsed,
    fleetApiBaseUrl: fleetApiBaseUrl(input.region),
    scopesRequested: input.scopesRequested ?? lastError.scopesRequested,
    region: input.region,
    recordedAt: new Date().toISOString(),
  };
}

export function getTeslaOAuthFleetLastError(): TeslaOAuthFleetLastError {
  return { ...lastError };
}

export function fleetApiBaseUrl(region: TeslaRegion): string {
  return region === "us" || region === "na"
    ? "https://fleet-api.prd.na.vn.cloud.tesla.com/api/1"
    : "https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1";
}

export function sanitizeTeslaError(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    return "No response body.";
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const error = stringValue(parsed.error) ?? stringValue(parsed.error_code) ?? stringValue(parsed.code);
    const description =
      stringValue(parsed.error_description) ?? stringValue(parsed.message) ?? stringValue(parsed.errorMessage);
    return [error, description].filter(Boolean).join(": ") || "Tesla returned an error response.";
  } catch {
    return trimmed
      .replace(/(access[_-]?token["']?\s*[:=]\s*["']?)[^"',\s]+/gi, "$1[masked]")
      .replace(/(refresh[_-]?token["']?\s*[:=]\s*["']?)[^"',\s]+/gi, "$1[masked]")
      .replace(/(client[_-]?secret["']?\s*[:=]\s*["']?)[^"',\s]+/gi, "$1[masked]")
      .replace(/(code["']?\s*[:=]\s*["']?)[A-Za-z0-9._~/-]{12,}/gi, "$1[masked]")
      .replace(/(Bearer\s+)[A-Za-z0-9._~/-]+/gi, "$1[masked]")
      .slice(0, 500);
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
