// Requirements: TES-005, TES-006, OPS-005

import { afterEach, describe, expect, it, vi } from "vitest";

import { TeslaApiError, TeslaFleetApiClient } from "../../src/providers/tesla/TeslaClient.js";
import { getTeslaOAuthFleetLastError } from "../../src/providers/tesla/TeslaDiagnostics.js";

describe("TeslaFleetApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records 401 diagnostics for vehicle list fetches without exposing tokens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "unauthorized", error_description: "invalid token" }),
    }));

    const client = new TeslaFleetApiClient("secret-access-token", "eu");

    await expect(client.get("/vehicles")).rejects.toThrow(TeslaApiError);
    const lastError = getTeslaOAuthFleetLastError();

    expect(lastError.lastStep).toBe("vehicles_fetch");
    expect(lastError.httpStatus).toBe(401);
    expect(lastError.safeError).toBe("Tesla token was created, but Fleet API rejected it. Check API scopes and region.");
    expect(JSON.stringify(lastError)).not.toContain("secret-access-token");
    expect(lastError.fleetApiBaseUrl).toBe("https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1");
  });
});
