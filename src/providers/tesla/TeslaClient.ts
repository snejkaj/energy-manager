// Requirements: TES-001, TES-002, TES-003, TES-004, TES-006, PRV-004, ARC-006

export interface TeslaTransport {
  get<TData>(path: string): Promise<TData>;
}

export class TeslaClient implements TeslaTransport {
  constructor(
    private readonly accessToken: string,
    private readonly endpoint = "https://fleet-api.prd.na.vn.cloud.tesla.com",
  ) {}

  async get<TData>(path: string): Promise<TData> {
    const response = await fetch(`${this.endpoint}${path}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
      },
    });

    if (!response.ok) {
      throw new TeslaApiError(`Tesla request failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as TData;
  }
}

export class TeslaApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeslaApiError";
  }
}
