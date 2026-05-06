// Requirements: AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-007, AUTH-008

import { describe, expect, it } from "vitest";

import { ProviderAuthService } from "../../src/app/auth/ProviderAuthService.js";
import { loadConfig } from "../../src/app/config.js";

describe("ProviderAuthService", () => {
  it("starts Tibber OAuth without exposing secrets", () => {
    const service = new ProviderAuthService(loadConfig({
      TIBBER_OAUTH_CLIENT_ID: "client-id",
      TIBBER_OAUTH_CLIENT_SECRET: "secret",
      TIBBER_OAUTH_REDIRECT_URI: "http://localhost:3000/api/auth/tibber/callback",
    }));

    const result = service.startAuth("tibber");

    expect(result.authorizationUrl).toContain("https://thewall.tibber.com/connect/authorize");
    expect(result.authorizationUrl).toContain("client_id=client-id");
    expect(result.authorizationUrl).not.toContain("secret");
  });

  it("starts Tesla OAuth with read-only vehicle data scope", () => {
    const service = new ProviderAuthService(loadConfig({
      TESLA_OAUTH_CLIENT_ID: "client-id",
      TESLA_OAUTH_CLIENT_SECRET: "secret",
      TESLA_OAUTH_REDIRECT_URI: "http://localhost:3000/api/auth/tesla/callback",
    }));

    const result = service.startAuth("tesla");

    expect(result.authorizationUrl).toContain("https://auth.tesla.com/oauth2/v3/authorize");
    expect(result.authorizationUrl).toContain("vehicle_device_data");
    expect(result.authorizationUrl).not.toContain("vehicle_cmds");
    expect(result.authorizationUrl).not.toContain("vehicle_charging_cmds");
  });

  it("disconnects demo in-memory connections", () => {
    const service = new ProviderAuthService(loadConfig({}));

    expect(service.getConnectionStatus("tibber").connected).toBe(false);
    expect(service.disconnect("tibber")).toMatchObject({
      provider: "tibber",
      connected: false,
    });
  });
});
