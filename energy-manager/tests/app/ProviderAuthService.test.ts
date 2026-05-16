// Requirements: AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-007, AUTH-008

import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderAuthService } from "../../src/app/auth/ProviderAuthService.js";
import { loadConfig } from "../../src/app/config.js";
import { getTeslaOAuthFleetLastError } from "../../src/providers/tesla/TeslaDiagnostics.js";

describe("ProviderAuthService", () => {
  beforeEach(() => {
    const authDir = mkdtempSync(join(tmpdir(), "energy-manager-auth-"));
    process.env.PROVIDER_TOKEN_STORE_PATH = join(authDir, "tokens.json");
    process.env.PROVIDER_PENDING_AUTH_STORE_PATH = join(authDir, "pending.json");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PROVIDER_TOKEN_STORE_PATH;
    delete process.env.PROVIDER_PENDING_AUTH_STORE_PATH;
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
    }));

    const result = service.startAuth("tesla", "http://localhost:3000/api/auth/tesla/callback");

    expect(result.authorizationUrl).toContain("https://auth.tesla.com/oauth2/v3/authorize");
    expect(result.authorizationUrl).toContain("vehicle_device_data");
    expect(result.authorizationUrl).not.toContain("vehicle_cmds");
    expect(result.authorizationUrl).toContain("code_challenge=");
    expect(result.authorizationUrl).toContain("code_challenge_method=S256");
    expect(result.authorizationUrl).not.toContain("vehicle_charging_cmds");
    expect(result.authorizationUrl).not.toContain("secret");
  });

  it("reports exact missing Tesla OAuth fields", () => {
    const service = new ProviderAuthService(loadConfig({
      TESLA_CLIENT_SECRET: "secret",
    }));

    const result = service.startAuth("tesla");
    const status = service.getConnectionStatus("tesla");

    expect(result.authorizationUrl).toBeNull();
    expect(result.message).toBe("Missing Tesla Client ID. Tesla OAuth needs a public callback URL. Open Tesla OAuth debug for details.");
    expect(status.oauthConfigured).toBe(false);
    expect(status.setupMessages).toEqual([
      "Missing Tesla Client ID",
      "Tesla OAuth needs a public callback URL. Open Tesla OAuth debug for details.",
    ]);
  });

  it("uses a temporary Tesla token only when no OAuth token is stored", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      access_token: "stored-oauth-token",
      refresh_token: "stored-refresh-token",
      expires_in: 3600,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const config = loadConfig({
      TESLA_CLIENT_ID: "client-id",
      TESLA_CLIENT_SECRET: "secret",
      TESLA_DEV_ACCESS_TOKEN: "temporary-token",
    });
    const service = new ProviderAuthService(config);

    expect(service.getAccessToken("tesla")).toBe("temporary-token");
    expect(service.getConnectionStatus("tesla").summary).toBe("Using temporary Tesla development token");
    expect(service.isUsingTemporaryTeslaAccessToken()).toBe(true);

    const start = service.startAuth("tesla", "http://localhost:3000/api/auth/tesla/callback");
    const state = new URL(start.authorizationUrl ?? "").searchParams.get("state");
    await service.handleCallback("tesla", "authorization-code", state ?? "");

    expect(service.getAccessToken("tesla")).toBe("stored-oauth-token");
    expect(service.getConnectionStatus("tesla").summary).toBe("Tesla connected in read-only mode.");
    expect(service.isUsingTemporaryTeslaAccessToken()).toBe(false);
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
    });
    const service = new ProviderAuthService(config);
    const start = service.startAuth("tesla", "http://localhost:3000/api/auth/tesla/callback");
    const state = new URL(start.authorizationUrl ?? "").searchParams.get("state");

    await service.handleCallback("tesla", "authorization-code", state ?? "");
    const reloadedService = new ProviderAuthService(config);

    expect(reloadedService.getConnectionStatus("tesla").connected).toBe(true);
    expect(reloadedService.getAccessToken("tesla")).toBe("stored-access-token");
  });

  it("persists pending Tesla PKCE state for CLI-style exchange", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      access_token: "cli-access-token",
      expires_in: 3600,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const config = loadConfig({
      TESLA_CLIENT_ID: "client-id",
      TESLA_CLIENT_SECRET: "secret",
    });
    const service = new ProviderAuthService(config);
    const start = service.startAuth("tesla", "https://my.home-assistant.io/redirect/oauth");
    const state = new URL(start.authorizationUrl ?? "").searchParams.get("state") ?? "";
    const reloadedService = new ProviderAuthService(config);

    const result = await reloadedService.exchangePendingTeslaCode("authorization-code", state);

    expect(result.accessToken).toBe("cli-access-token");
  });

  it("keeps pending Tesla state after a failed token exchange", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "invalid_grant",
    }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })));

    const config = loadConfig({
      TESLA_CLIENT_ID: "client-id",
      TESLA_CLIENT_SECRET: "secret",
    });
    const service = new ProviderAuthService(config);
    const start = service.startAuth("tesla", "https://my.home-assistant.io/redirect/oauth");
    const state = new URL(start.authorizationUrl ?? "").searchParams.get("state") ?? "";

    await expect(service.handleCallback("tesla", "bad-code", state)).rejects.toThrow();

    expect(service.getPendingStateDiagnostics("tesla")).toMatchObject({
      count: 1,
      latestStateId: state,
    });
  });

  it("records token exchange 401 without exposing authorization code or secrets", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "invalid_client",
    }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })));

    const service = new ProviderAuthService(loadConfig({
      TESLA_CLIENT_ID: "client-id",
      TESLA_CLIENT_SECRET: "secret-client-value",
    }));
    const start = service.startAuth("tesla", "http://localhost:3000/api/auth/tesla/callback");
    const state = new URL(start.authorizationUrl ?? "").searchParams.get("state");

    await expect(service.handleCallback("tesla", "authorization-code-secret", state ?? "")).rejects.toThrow(
      "Tesla rejected token exchange. Check client secret and exact redirect URI.",
    );
    const lastError = getTeslaOAuthFleetLastError();

    expect(lastError.lastStep).toBe("token_exchange_failed");
    expect(lastError.httpStatus).toBe(401);
    expect(JSON.stringify(lastError)).not.toContain("authorization-code-secret");
    expect(JSON.stringify(lastError)).not.toContain("secret-client-value");
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
