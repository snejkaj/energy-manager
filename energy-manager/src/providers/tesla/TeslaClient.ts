// Requirements: TES-001, TES-002, TES-003, TES-004, TES-006, PRV-004, ARC-006

import { logger } from "../../app/logger.js";
import { fleetApiBaseUrl, recordTeslaStepResult, recordTeslaStepStart, sanitizeTeslaError, type TeslaDiagnosticStep } from "./TeslaDiagnostics.js";

export interface TeslaTransport {
  get<TData>(path: string): Promise<TData>;
}

export type TeslaRegion = "eu" | "us" | "na";

export class TeslaFleetApiClient implements TeslaTransport {
  constructor(
    private readonly accessToken: string,
    private readonly region: TeslaRegion = "eu",
  ) {}

  async get<TData>(path: string): Promise<TData> {
    const safePath = maskTeslaPath(path);
    const endpoint = `${this.baseUrl}${path}`;
    const step = teslaStepFromPath(path);
    logger.info("Tesla", `Tesla Fleet API GET ${safePath} start`);
    recordTeslaStepStart({
      step,
      endpoint,
      region: this.region,
    });
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
      },
    });
    logger.info("Tesla", `Tesla Fleet API GET ${safePath} -> HTTP ${response.status}`);

    if (!response.ok) {
      const responseText = await response.text();
      const safeError = createFleetApiSafeError(step, response.status, responseText);
      recordTeslaStepResult({
        step,
        endpoint,
        ok: false,
        httpStatus: response.status,
        safeError,
        region: this.region,
      });
      throw new TeslaApiError(safeError, response.status, step);
    }

    recordTeslaStepResult({
      step,
      endpoint,
      ok: true,
      httpStatus: response.status,
      safeError: null,
      region: this.region,
    });
    return (await response.json()) as TData;
  }

  private get baseUrl(): string {
    return fleetApiBaseUrl(this.region);
  }
}

export class TeslaClient extends TeslaFleetApiClient {}

function maskTeslaPath(path: string): string {
  return path.replace(/\/vehicles\/([^/]+)\/vehicle_data/, (_match, vehicleId: string) => {
    if (vehicleId.length <= 6) {
      return `/vehicles/${vehicleId.slice(0, 2)}.../vehicle_data`;
    }

    return `/vehicles/${vehicleId.slice(0, 4)}...${vehicleId.slice(-2)}/vehicle_data`;
  });
}

export class TeslaApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number | null = null,
    public readonly step: TeslaDiagnosticStep | null = null,
  ) {
    super(message);
    this.name = "TeslaApiError";
  }
}

function teslaStepFromPath(path: string): TeslaDiagnosticStep {
  return path.includes("/vehicle_data") ? "vehicle_data_fetch" : "vehicles_fetch";
}

function createFleetApiSafeError(step: TeslaDiagnosticStep, status: number, responseText: string): string {
  if (status === 401 && step === "vehicles_fetch") {
    return "Tesla token was created, but Fleet API rejected it. Check API scopes and region.";
  }

  if (status === 401 && step === "vehicle_data_fetch") {
    return "Tesla token was accepted for vehicles, but vehicle data was rejected. Check Fleet API access for this vehicle.";
  }

  return `Tesla request failed with HTTP ${status}: ${sanitizeTeslaError(responseText)}`;
}
