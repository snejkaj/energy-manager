// Requirements: AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-007, AUTH-008

import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderAuthService } from "../../src/app/auth/ProviderAuthService.js";
import { loadConfig } from "../../src/app/config.js";

describe("ProviderAuthService", () => {
  beforeEach(() => {
    process.env.PROVIDER_TOKEN_STORE_PATH = join(mkdtempSync(join(tmpdir(), "energy-manager-auth-")), "tokens.json");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PROVIDER_TOKEN_STORE_PATH;
  });

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

  it("starts Tesla OAuth with PKCE and Fleet API scopes", () => {
    const service = new ProviderAuthService(loadConfig({
      TESLA_CLIENT_ID: "client-id",
      TESLA_CLIENT_SECRET: "secret",
      TESLA_REDIRECT_URI: "http://localhost:3000/api/auth/tesla/callback",
    }));

    const result = service.startAuth("tesla");

    expect(result.authorizationUrl).toContain("https://auth.tesla.com/oauth2/v3/authorize");
    expect(result.authorizationUrl).toContain("vehicle_device_data");
    expect(result.authorizationUrl).toContain("vehicle_cmds");
    expect(result.authorizationUrl).toContain("code_challenge=");
    expect(result.authorizationUrl).toContain("code_challenge_method=S256");
    expect(result.authorizationUrl).not.toContain("vehicle_charging_cmds");
    expect(result.authorizationUrl).not.toContain("secret");
  });

  it("persists Tesla OAuth tokens server-side across restart", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      access_token: "stored-access-token",
      refresh_token: "stored-refresh-token",
      expires_in: 3600,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const config = loadConfig({
      TESLA_CLIENT_ID: "client-id",
      TESLA_CLIENT_SECRET: "secret",
      TESLA_REDIRECT_URI: "http://localhost:3000/api/auth/tesla/callback",
    });
    const service = new ProviderAuthService(config);
    const start = service.startAuth("tesla");
    const state = new URL(start.authorizationUrl ?? "").searchParams.get("state");

    await service.handleCallback("tesla", "authorization-code", state ?? "");
    const reloadedService = new ProviderAuthService(config);

    expect(reloadedService.getConnectionStatus("tesla").connected).toBe(true);
    expect(reloadedService.getAccessToken("tesla")).toBe("stored-access-token");
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
