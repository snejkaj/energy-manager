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

    expect(lastError.lastStep).toBe("vehicles_fetch_failed");
    expect(lastError.httpStatus).toBe(401);
    expect(lastError.safeError).toBe("Tesla token was created, but Fleet API rejected it. Check scopes/API permissions/audience/region.");
    expect(JSON.stringify(lastError)).not.toContain("secret-access-token");
    expect(lastError.fleetApiBaseUrl).toBe("https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1");
  });

  it("records 401 diagnostics for vehicle data permission failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "unauthorized", error_description: "missing vehicle data scope" }),
    }));

    const client = new TeslaFleetApiClient("secret-access-token", "eu");

    await expect(client.get("/vehicles/vehicle-1/vehicle_data")).rejects.toThrow(TeslaApiError);
    const lastError = getTeslaOAuthFleetLastError();

    expect(lastError.lastStep).toBe("vehicle_data_fetch_failed");
    expect(lastError.httpStatus).toBe(401);
    expect(lastError.safeError).toBe("Vehicle data permission denied. Check Fordonsinformation scope.");
    expect(JSON.stringify(lastError)).not.toContain("secret-access-token");
  });

  it("records safe 412 diagnostics for incomplete Fleet API setup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 412,
      text: async () => JSON.stringify({ error: "precondition_failed", message: "partner account is not registered" }),
    }));

    const client = new TeslaFleetApiClient("secret-access-token", "eu");

    await expect(client.get("/vehicles")).rejects.toThrow(TeslaApiError);
    const lastError = getTeslaOAuthFleetLastError();

    expect(lastError.httpStatus).toBe(412);
    expect(lastError.lastEndpoint).toBe("https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/vehicles");
    expect(lastError.safeError).toBe(
      "Tesla Fleet API returned 412 Precondition Failed. This may mean the app/domain public key is not registered or vehicle access setup is incomplete.",
    );
    expect(lastError.safeResponseBody).toBe("precondition_failed: partner account is not registered");
    expect(lastError.likelyMissingPublicKeySetup).toBe(true);
    expect(JSON.stringify(lastError)).not.toContain("secret-access-token");
  });
});
