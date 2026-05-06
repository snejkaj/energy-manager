// Requirements: TIB-001, TIB-002

import { afterEach, describe, expect, it, vi } from "vitest";

import { TibberGraphQLClient } from "../../src/providers/tibber/TibberClient.js";

describe("TibberGraphQLClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts GraphQL requests with a bearer token and JSON content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { viewer: { homes: [] } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new TibberGraphQLClient("secret-token", "https://example.test/gql");
    await expect(client.execute("query Test { viewer { homes { id } } }")).resolves.toEqual({
      viewer: { homes: [] },
    });

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/gql", {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: "query Test { viewer { homes { id } } }",
        variables: {},
      }),
    });
  });
});
