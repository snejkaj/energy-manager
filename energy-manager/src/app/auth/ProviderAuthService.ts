// Requirements: AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-007, AUTH-008, TES-005

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

import type { AppConfig } from "../config.js";

export type AuthProviderId = "tibber" | "tesla";

export interface ProviderConnectionStatus {
  provider: AuthProviderId;
  connected: boolean;
  demoStorage: boolean;
  summary: string | null;
  warning: string | null;
  connectedAt: string | null;
}

export interface AuthStartResult {
  provider: AuthProviderId;
  authorizationUrl: string | null;
  setupRequired: boolean;
  message: string;
}

interface StoredProviderToken {
  provider: AuthProviderId;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  connectedAt: string;
  encryptedRefreshToken: string | null;
}

interface PendingAuthState {
  provider: AuthProviderId;
  state: string;
  createdAt: string;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export class ProviderAuthService {
  private readonly tokens = new Map<AuthProviderId, StoredProviderToken>();
  private readonly pendingStates = new Map<string, PendingAuthState>();

  constructor(private readonly config: AppConfig) {}

  startAuth(provider: AuthProviderId): AuthStartResult {
    const oauthConfig = getOAuthConfig(this.config, provider);
    if (oauthConfig.clientId === null || oauthConfig.redirectUri === null) {
      return {
        provider,
        authorizationUrl: null,
        setupRequired: true,
        message: `${labelProvider(provider)} OAuth is not configured yet.`,
      };
    }

    const state = randomUUID();
    this.pendingStates.set(state, {
      provider,
      state,
      createdAt: new Date().toISOString(),
    });

    const authorizationUrl = new URL(oauthConfig.authorizationEndpoint);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", oauthConfig.clientId);
    authorizationUrl.searchParams.set("redirect_uri", oauthConfig.redirectUri);
    authorizationUrl.searchParams.set("scope", oauthConfig.scope);
    authorizationUrl.searchParams.set("state", state);

    if (provider === "tesla") {
      authorizationUrl.searchParams.set("prompt", "login");
      authorizationUrl.searchParams.set("audience", "https://fleet-api.prd.na.vn.cloud.tesla.com");
    }

    return {
      provider,
      authorizationUrl: authorizationUrl.toString(),
      setupRequired: false,
      message: `Opening ${labelProvider(provider)} sign in.`,
    };
  }

  async handleCallback(provider: AuthProviderId, code: string, state: string): Promise<ProviderConnectionStatus> {
    const pendingState = this.pendingStates.get(state);
    if (pendingState === undefined || pendingState.provider !== provider) {
      throw new Error("OAuth state did not match. Please start the connection again.");
    }
    this.pendingStates.delete(state);

    const tokenResponse = await this.exchangeCode(provider, code);
    this.storeToken(provider, tokenResponse);
    return this.getConnectionStatus(provider);
  }

  async refreshToken(provider: AuthProviderId): Promise<ProviderConnectionStatus> {
    const currentToken = this.tokens.get(provider);
    if (currentToken?.refreshToken === null || currentToken?.refreshToken === undefined) {
      return this.getConnectionStatus(provider);
    }

    const oauthConfig = getOAuthConfig(this.config, provider);
    if (oauthConfig.clientId === null || oauthConfig.clientSecret === null) {
      return this.getConnectionStatus(provider);
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: currentToken.refreshToken,
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
    });

    if (provider === "tesla") {
      body.set("audience", "https://fleet-api.prd.na.vn.cloud.tesla.com");
    }

    const response = await fetch(oauthConfig.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      throw new Error(`${labelProvider(provider)} token refresh failed with HTTP ${response.status}.`);
    }

    this.storeToken(provider, await response.json() as OAuthTokenResponse);
    return this.getConnectionStatus(provider);
  }

  disconnect(provider: AuthProviderId): ProviderConnectionStatus {
    this.tokens.delete(provider);
    return this.getConnectionStatus(provider);
  }

  getConnectionStatus(provider: AuthProviderId): ProviderConnectionStatus {
    const token = this.tokens.get(provider);
    const envToken = getEnvironmentToken(this.config, provider);
    const connected = token !== undefined || envToken !== null;

    return {
      provider,
      connected,
      demoStorage: token !== undefined && this.config.databaseUrl === null,
      summary: connected ? `${labelProvider(provider)} connected in read-only mode.` : null,
      warning: connected
        ? null
        : provider === "tibber"
          ? "Tibber token not configured"
          : `${labelProvider(provider)} is not connected.`,
      connectedAt: token?.connectedAt ?? null,
    };
  }

  getConnectionStatuses(): ProviderConnectionStatus[] {
    return [this.getConnectionStatus("tibber"), this.getConnectionStatus("tesla")];
  }

  getAccessToken(provider: AuthProviderId): string | null {
    return this.tokens.get(provider)?.accessToken ?? getEnvironmentToken(this.config, provider);
  }

  private async exchangeCode(provider: AuthProviderId, code: string): Promise<OAuthTokenResponse> {
    const oauthConfig = getOAuthConfig(this.config, provider);
    if (oauthConfig.clientId === null || oauthConfig.clientSecret === null || oauthConfig.redirectUri === null) {
      throw new Error(`${labelProvider(provider)} OAuth client id, secret, and redirect URI must be configured.`);
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: oauthConfig.redirectUri,
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
    });

    if (provider === "tesla") {
      body.set("audience", "https://fleet-api.prd.na.vn.cloud.tesla.com");
    }

    const response = await fetch(oauthConfig.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      throw new Error(`${labelProvider(provider)} token exchange failed with HTTP ${response.status}.`);
    }

    return await response.json() as OAuthTokenResponse;
  }

  private storeToken(provider: AuthProviderId, tokenResponse: OAuthTokenResponse): void {
    const connectedAt = new Date().toISOString();
    this.tokens.set(provider, {
      provider,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? null,
      encryptedRefreshToken: tokenResponse.refresh_token === undefined ? null : encryptToken(tokenResponse.refresh_token, this.config.tokenEncryptionKey),
      expiresAt: tokenResponse.expires_in === undefined
        ? null
        : new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString(),
      connectedAt,
    });
  }
}

function getOAuthConfig(config: AppConfig, provider: AuthProviderId) {
  if (provider === "tibber") {
    return {
      clientId: config.tibberOAuthClientId,
      clientSecret: config.tibberOAuthClientSecret,
      redirectUri: config.tibberOAuthRedirectUri,
      authorizationEndpoint: "https://thewall.tibber.com/connect/authorize",
      tokenEndpoint: "https://thewall.tibber.com/connect/token",
      scope: "openid profile email offline_access data-api-user-read data-api-homes-read",
    };
  }

  return {
    clientId: config.teslaOAuthClientId,
    clientSecret: config.teslaOAuthClientSecret,
    redirectUri: config.teslaOAuthRedirectUri,
    authorizationEndpoint: "https://auth.tesla.com/oauth2/v3/authorize",
    tokenEndpoint: "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token",
    scope: "openid offline_access vehicle_device_data",
  };
}

function getEnvironmentToken(config: AppConfig, provider: AuthProviderId): string | null {
  return provider === "tibber" ? config.tibberAccessToken : config.teslaAccessToken;
}

function labelProvider(provider: AuthProviderId): string {
  return provider === "tibber" ? "Tibber" : "Tesla";
}

function encryptToken(token: string, key: string | null): string | null {
  if (key === null) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", normalizeKey(key), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptToken(value: string, key: string): string {
  const [iv, authTag, encrypted] = value.split(".");
  if (iv === undefined || authTag === undefined || encrypted === undefined) {
    throw new Error("Encrypted token payload is invalid.");
  }

  const decipher = createDecipheriv("aes-256-gcm", normalizeKey(key), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function normalizeKey(key: string): Buffer {
  return createHash("sha256").update(key).digest();
}
