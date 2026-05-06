// Requirements: TIB-001, TIB-002, TIB-006, TIB-007, ARC-006

export interface GraphQLTransport {
  execute<TData>(query: string, variables?: Record<string, unknown>): Promise<TData>;
}

export class TibberGraphQLClient implements GraphQLTransport {
  constructor(
    private readonly accessToken: string,
    private readonly endpoint = "https://api.tibber.com/v1-beta/gql",
  ) {}

  async execute<TData>(query: string, variables: Record<string, unknown> = {}): Promise<TData> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new TibberApiError(`Tibber request failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as TibberGraphQLResponse<TData>;
    if (payload.errors !== undefined && payload.errors.length > 0) {
      throw new TibberApiError(payload.errors.map((error) => error.message).join("; "));
    }

    if (payload.data === undefined) {
      throw new TibberApiError("Tibber response did not include data.");
    }

    return payload.data;
  }
}

export class TibberClient extends TibberGraphQLClient {}

export class TibberApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TibberApiError";
  }
}

interface TibberGraphQLResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}
