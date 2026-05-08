// Requirements: TES-001, TES-002, TES-003, TES-004, TES-006, PRV-004, ARC-006

import { logger } from "../../app/logger.js";

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
    logger.info("Tesla", `Tesla Fleet API GET ${safePath} start`);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
      },
    });
    logger.info("Tesla", `Tesla Fleet API GET ${safePath} -> HTTP ${response.status}`);

    if (!response.ok) {
      throw new TeslaApiError(`Tesla request failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as TData;
  }

  private get baseUrl(): string {
    return this.region === "us"
      || this.region === "na"
      ? "https://fleet-api.prd.na.vn.cloud.tesla.com/api/1"
      : "https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1";
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
  constructor(message: string) {
    super(message);
    this.name = "TeslaApiError";
  }
}
