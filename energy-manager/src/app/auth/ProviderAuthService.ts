// Requirements: AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-007, AUTH-008, TES-005

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import {
  recordTeslaOAuthEvent,
  recordTeslaStepResult,
  recordTeslaStepStart,
  resetTeslaOAuthFleetDiagnostics,
  sanitizeTeslaError,
} from "../../providers/tesla/TeslaDiagnostics.js";

export type AuthProviderId = "tibber" | "tesla";

export interface ProviderConnectionStatus {
  provider: AuthProviderId;
  connected: boolean;
  oauthConfigured: boolean;
  setupMessages: string[];
  demoStorage: boolean;
  summary: string | null;
  warning: string | null;
  connectedAt: string | null;
}

export interface AuthStartResult {
  provider: AuthProviderId;
  authorizationUrl: string | null;
  configured: boolean;
  redirectUri: string | null;
  scopes: string[];
  stateGenerated: boolean;
  missingConfig: string[];
  setupRequired: boolean;
  message: string;
}

export interface ProviderOAuthDiagnostics {
  provider: AuthProviderId;
  configured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  redirectUriConfigured: boolean;
  redirectUri: string | null;
  scopes: string[];
  missingConfig: string[];
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
  codeVerifier: string | null;
  redirectUri: string;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface ManualTeslaTokenExchangeResult {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
}

interface PersistedProviderToken {
  provider: AuthProviderId;
  accessToken: string;
  refreshToken: string | null;
  encryptedRefreshToken: string | null;
  expiresAt: string | null;
  connectedAt: string;
}

interface PersistedTokenStore {
  tokens: Partial<Record<AuthProviderId, PersistedProviderToken>>;
}

export class ProviderAuthService {
  private readonly tokens = new Map<AuthProviderId, StoredProviderToken>();
  private readonly pendingStates = new Map<string, PendingAuthState>();
  private readonly tokenStorePath = resolveTokenStorePath();

  constructor(private readonly config: AppConfig) {
    this.loadPersistedTokens();
  }

  startAuth(provider: AuthProviderId, redirectUriOverride?: string | null): AuthStartResult {
    const oauthConfig = getOAuthConfig(this.config, provider);
    const redirectUri = redirectUriOverride === undefined ? oauthConfig.redirectUri : redirectUriOverride;
    const missingConfig = getMissingOAuthConfig(this.config, provider, redirectUriOverride);
    if (provider === "tesla") {
      resetTeslaOAuthFleetDiagnostics(this.config.teslaRegion, redirectUri, oauthConfig.scope.split(" "));
    }
    logger.info("Auth", `${labelProvider(provider)} OAuth start called`);
    logger.info("Auth", `${labelProvider(provider)} OAuth configured=${missingConfig.length === 0}`);
    logger.info("Auth", `${labelProvider(provider)} OAuth redirect_uri=${redirectUri ?? "not configured"}`);
    logger.info("Auth", `${labelProvider(provider)} OAuth scopes=${oauthConfig.scope}`);
    if (missingConfig.length > 0) {
      logger.info("Auth", `${labelProvider(provider)} OAuth generated authorizationUrl=no`);
      logger.info("Auth", `${labelProvider(provider)} OAuth state generated=no`);
      return {
        provider,
        authorizationUrl: null,
        configured: false,
        redirectUri,
        scopes: oauthConfig.scope.split(" "),
        stateGenerated: false,
        missingConfig,
        setupRequired: true,
        message: missingConfig.join(". "),
      };
    }
    if (
      oauthConfig.clientId === null
      || oauthConfig.clientSecret === null
      || redirectUri === null
    ) {
      throw new Error(`${labelProvider(provider)} OAuth configuration validation failed.`);
    }

    const state = randomUUID();
    logger.info("Auth", `${labelProvider(provider)} OAuth state generated=yes`);
    const pkce = provider === "tesla" ? createPkceChallenge() : null;
    this.pendingStates.set(state, {
      provider,
      state,
      createdAt: new Date().toISOString(),
      codeVerifier: pkce?.verifier ?? null,
      redirectUri,
    });

    const authorizationUrl = new URL(oauthConfig.authorizationEndpoint);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", oauthConfig.clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("scope", oauthConfig.scope);
    authorizationUrl.searchParams.set("state", state);

    if (provider === "tesla") {
      authorizationUrl.searchParams.set("prompt", "login");
      authorizationUrl.searchParams.set("audience", teslaFleetAudience(this.config.teslaRegion));
      if (pkce !== null) {
        authorizationUrl.searchParams.set("code_challenge", pkce.challenge);
        authorizationUrl.searchParams.set("code_challenge_method", "S256");
      }
      logger.info("TeslaAuth", `Using Tesla OAuth redirect_uri: ${redirectUri}`);
    }

    return {
      provider,
      authorizationUrl: authorizationUrl.toString(),
      configured: true,
      redirectUri,
      scopes: oauthConfig.scope.split(" "),
      stateGenerated: true,
      missingConfig: [],
      setupRequired: false,
      message: `Opening ${labelProvider(provider)} sign in.`,
    };
  }

  getOAuthDiagnostics(provider: AuthProviderId, redirectUriOverride?: string | null): ProviderOAuthDiagnostics {
    const oauthConfig = getOAuthConfig(this.config, provider);
    const redirectUri = redirectUriOverride === undefined ? oauthConfig.redirectUri : redirectUriOverride;
    const missingConfig = getMissingOAuthConfig(this.config, provider, redirectUriOverride);
    return {
      provider,
      configured: missingConfig.length === 0,
      clientIdConfigured: oauthConfig.clientId !== null,
      clientSecretConfigured: oauthConfig.clientSecret !== null,
      redirectUriConfigured: redirectUri !== null,
      redirectUri,
      scopes: oauthConfig.scope.split(" "),
      missingConfig,
    };
  }

  async handleCallback(provider: AuthProviderId, code: string, state: string): Promise<ProviderConnectionStatus> {
    const pendingState = this.pendingStates.get(state);
    if (pendingState === undefined || pendingState.provider !== provider) {
      throw new Error("OAuth state did not match. Please start the connection again.");
    }
    if (provider === "tesla") {
      recordTeslaOAuthEvent({
        step: "state_validated",
        redirectUriUsed: pendingState.redirectUri,
        scopesRequested: getOAuthConfig(this.config, provider).scope.split(" "),
        region: this.config.teslaRegion,
      });
    }
    this.pendingStates.delete(state);

    const tokenResponse = await this.exchangeCode(provider, code, pendingState);
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
      body.set("audience", teslaFleetAudience(this.config.teslaRegion));
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
    this.persistTokens();
    return this.getConnectionStatus(provider);
  }

  getConnectionStatus(provider: AuthProviderId): ProviderConnectionStatus {
    const token = this.tokens.get(provider);
    const envToken = getEnvironmentToken(this.config, provider);
    const connected = token !== undefined || envToken !== null;
    const setupMessages = getMissingOAuthConfig(this.config, provider);
    const usingTemporaryTeslaToken = provider === "tesla" && token === undefined && envToken !== null;

    return {
      provider,
      connected,
      oauthConfigured: setupMessages.length === 0,
      setupMessages,
      demoStorage: token !== undefined && this.config.databaseUrl === null,
      summary: usingTemporaryTeslaToken
        ? "Using temporary Tesla development token"
        : connected
          ? `${labelProvider(provider)} connected in read-only mode.`
          : null,
      warning: connected
        ? null
        : provider === "tibber"
          ? "Tibber token not configured"
          : setupMessages.length > 0
            ? setupMessages.join(". ")
            : "Tesla is not connected. Demo vehicle data is used for planning.",
      connectedAt: token?.connectedAt ?? null,
    };
  }

  getConnectionStatuses(): ProviderConnectionStatus[] {
    return [this.getConnectionStatus("tibber"), this.getConnectionStatus("tesla")];
  }

  getAccessToken(provider: AuthProviderId): string | null {
    return this.tokens.get(provider)?.accessToken ?? getEnvironmentToken(this.config, provider);
  }

  isUsingTemporaryTeslaAccessToken(): boolean {
    return !this.tokens.has("tesla") && this.config.teslaDevAccessToken !== null;
  }

  hasPendingState(provider: AuthProviderId): boolean {
    return [...this.pendingStates.values()].some((pendingState) => pendingState.provider === provider);
  }

  async exchangeLatestPendingTeslaCode(code: string): Promise<ManualTeslaTokenExchangeResult> {
    const pendingState = [...this.pendingStates.values()]
      .filter((state) => state.provider === "tesla")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (pendingState === undefined) {
      throw new Error("No pending Tesla OAuth login exists. Open Tesla OAuth debug and start Tesla login first.");
    }

    const tokenResponse = await this.exchangeCode("tesla", code, pendingState);
    this.pendingStates.delete(pendingState.state);
    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? null,
      expiresIn: tokenResponse.expires_in ?? null,
    };
  }

  async exchangePendingTeslaCode(code: string, state: string): Promise<ManualTeslaTokenExchangeResult> {
    const pendingState = this.pendingStates.get(state);
    if (pendingState === undefined || pendingState.provider !== "tesla") {
      throw new Error("No matching Tesla PKCE verifier was found for that state. Start a new development login first.");
    }

    const tokenResponse = await this.exchangeCode("tesla", code, pendingState);
    this.pendingStates.delete(state);
    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? null,
      expiresIn: tokenResponse.expires_in ?? null,
    };
  }

  private async exchangeCode(
    provider: AuthProviderId,
    code: string,
    pendingState: PendingAuthState,
  ): Promise<OAuthTokenResponse> {
    const oauthConfig = getOAuthConfig(this.config, provider);
    if (oauthConfig.clientId === null || oauthConfig.clientSecret === null) {
      throw new Error(`${labelProvider(provider)} OAuth client id, secret, and redirect URI must be configured.`);
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: pendingState.redirectUri,
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
    });

    if (provider === "tesla") {
      body.set("audience", teslaFleetAudience(this.config.teslaRegion));
      if (pendingState.codeVerifier === null) {
        throw new Error("Tesla OAuth PKCE verifier is missing. Please start the connection again.");
      }
      body.set("code_verifier", pendingState.codeVerifier);
      recordTeslaStepStart({
        step: "token_exchange",
        endpoint: oauthConfig.tokenEndpoint,
        redirectUriUsed: pendingState.redirectUri,
        scopesRequested: oauthConfig.scope.split(" "),
        region: this.config.teslaRegion,
      });
    }

    const response = await fetch(oauthConfig.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      const responseText = await response.text();
      const safeError = createTokenExchangeError(provider, response.status, responseText);
      if (provider === "tesla") {
        recordTeslaStepResult({
          step: "token_exchange",
          endpoint: oauthConfig.tokenEndpoint,
          ok: false,
          httpStatus: response.status,
          safeError,
          redirectUriUsed: pendingState.redirectUri,
          scopesRequested: oauthConfig.scope.split(" "),
          region: this.config.teslaRegion,
        });
      }
      throw new Error(safeError);
    }

    if (provider === "tesla") {
      recordTeslaStepResult({
        step: "token_exchange",
        endpoint: oauthConfig.tokenEndpoint,
        ok: true,
        httpStatus: response.status,
        safeError: null,
        redirectUriUsed: pendingState.redirectUri,
        scopesRequested: oauthConfig.scope.split(" "),
        region: this.config.teslaRegion,
      });
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
    this.persistTokens();
  }

  private loadPersistedTokens(): void {
    if (!existsSync(this.tokenStorePath)) {
      return;
    }

    try {
      const persisted = JSON.parse(readFileSync(this.tokenStorePath, "utf8")) as PersistedTokenStore;
      for (const provider of ["tibber", "tesla"] as const) {
        const token = persisted.tokens[provider];
        if (token === undefined) {
          continue;
        }

        this.tokens.set(provider, {
          provider,
          accessToken: token.accessToken,
          refreshToken: restoreRefreshToken(token, this.config.tokenEncryptionKey),
          encryptedRefreshToken: token.encryptedRefreshToken,
          expiresAt: token.expiresAt,
          connectedAt: token.connectedAt,
        });
      }
      logger.info("Auth", "Loaded persisted provider connections.");
    } catch (error) {
      logger.error("Auth", `Provider token store could not be loaded: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private persistTokens(): void {
    const persisted: PersistedTokenStore = { tokens: {} };
    for (const [provider, token] of this.tokens.entries()) {
      persisted.tokens[provider] = {
        provider,
        accessToken: token.accessToken,
        refreshToken: this.config.tokenEncryptionKey === null ? token.refreshToken : null,
        encryptedRefreshToken: token.encryptedRefreshToken,
        expiresAt: token.expiresAt,
        connectedAt: token.connectedAt,
      };
    }

    try {
      mkdirSync(dirname(this.tokenStorePath), { recursive: true, mode: 0o700 });
      writeFileSync(this.tokenStorePath, `${JSON.stringify(persisted, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      logger.error("Auth", `Provider token store could not be written: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
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
    redirectUri: null,
    authorizationEndpoint: "https://auth.tesla.com/oauth2/v3/authorize",
    tokenEndpoint: "https://auth.tesla.com/oauth2/v3/token",
    scope: "openid offline_access vehicle_device_data",
  };
}

function createTokenExchangeError(provider: AuthProviderId, status: number, responseText: string): string {
  if (provider !== "tesla") {
    return `${labelProvider(provider)} token exchange failed with HTTP ${status}.`;
  }

  if (status === 401) {
    return "Tesla rejected token exchange. Check client secret and exact redirect URI.";
  }

  const lowerResponse = responseText.toLowerCase();
  if (lowerResponse.includes("redirect") || lowerResponse.includes("invalid_grant")) {
    return "Tesla login failed. Check that the generated add-on callback URL exactly matches the redirect URI in Tesla Developer Console.";
  }

  return `Tesla token exchange failed with HTTP ${status}: ${sanitizeTeslaError(responseText)}`;
}

function getEnvironmentToken(config: AppConfig, provider: AuthProviderId): string | null {
  return provider === "tibber" ? config.tibberAccessToken : config.teslaDevAccessToken;
}

function getMissingOAuthConfig(config: AppConfig, provider: AuthProviderId, redirectUriOverride?: string | null): string[] {
  if (provider === "tibber") {
    return [
      config.tibberOAuthClientId === null ? "Missing Tibber Client ID" : null,
      config.tibberOAuthClientSecret === null ? "Missing Tibber Client Secret" : null,
      (redirectUriOverride ?? config.tibberOAuthRedirectUri) === null ? "Missing Tibber Redirect URI" : null,
    ].filter((message): message is string => message !== null);
  }

  const hasTeslaRedirectUri = redirectUriOverride === undefined
    ? config.teslaPublicCallbackUrl !== null
    : redirectUriOverride !== null;

  return [
    config.teslaOAuthClientId === null ? "Missing Tesla Client ID" : null,
    config.teslaOAuthClientSecret === null ? "Missing Tesla Client Secret" : null,
    hasTeslaRedirectUri ? null : "Tesla OAuth needs a public callback URL. Open Tesla OAuth debug for details.",
  ].filter((message): message is string => message !== null);
}

function labelProvider(provider: AuthProviderId): string {
  return provider === "tibber" ? "Tibber" : "Tesla";
}

function createPkceChallenge(): { verifier: string; challenge: string } {
  const verifier = randomBytes(64).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

function teslaFleetAudience(region: AppConfig["teslaRegion"]): string {
  return region === "us" || region === "na"
    ? "https://fleet-api.prd.na.vn.cloud.tesla.com"
    : "https://fleet-api.prd.eu.vn.cloud.tesla.com";
}

function resolveTokenStorePath(): string {
  const configuredPath = process.env.PROVIDER_TOKEN_STORE_PATH?.trim();
  if (configuredPath !== undefined && configuredPath !== "") {
    return configuredPath;
  }

  return existsSync("/data")
    ? "/data/provider_tokens.json"
    : join(process.cwd(), "data", "provider_tokens.json");
}

function restoreRefreshToken(token: PersistedProviderToken, key: string | null): string | null {
  if (token.encryptedRefreshToken !== null && key !== null) {
    return decryptToken(token.encryptedRefreshToken, key);
  }

  return token.refreshToken;
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
