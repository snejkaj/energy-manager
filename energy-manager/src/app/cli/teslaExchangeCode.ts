import { existsSync, readFileSync } from "node:fs";

import { ProviderAuthService } from "../auth/ProviderAuthService.js";
import { computePkceChallenge, normalizeCodeVerifier } from "../auth/Pkce.js";
import { loadConfig } from "../config.js";

applyHomeAssistantOptionsToEnv();

const args = parseArgs(process.argv.slice(2));
const codeVerifier = normalizeNullableCodeVerifier(args.codeVerifier ?? process.env.TESLA_CODE_VERIFIER);
if (args.code === null || (args.state === null && codeVerifier === null)) {
  fail('Usage: npm run tesla:exchange-code -- --code "..." [--code-verifier "..." | --state "..."] [--expected-code-challenge "..."]\nYou may also set TESLA_CODE_VERIFIER instead of passing --code-verifier.');
}

const config = loadConfig();
const authService = new ProviderAuthService(config);

try {
  if (codeVerifier !== null) {
    const computedChallenge = computePkceChallenge(codeVerifier);
    const matchesExpectedChallenge = args.expectedCodeChallenge === null || computedChallenge === args.expectedCodeChallenge;
    if (config.devMode) {
      process.stdout.write(`code verifier source: ${args.codeVerifier === null ? "env" : "argv"}\n`);
      process.stdout.write(`code verifier length: ${codeVerifier.length}\n`);
      process.stdout.write(`computed code challenge: ${computedChallenge}\n`);
      process.stdout.write(`expected code challenge: ${args.expectedCodeChallenge ?? "not provided"}\n`);
      process.stdout.write(`match: ${matchesExpectedChallenge ? "yes" : "no"}\n`);
    }
    if (args.expectedCodeChallenge !== null && computedChallenge !== args.expectedCodeChallenge) {
      fail("PKCE self-check failed: supplied code verifier does not match expected code challenge.");
    }
  }
  const result = codeVerifier === null
    ? await authService.exchangePendingTeslaCode(args.code, args.state ?? "")
    : await authService.exchangeTeslaCodeWithVerifier(
        args.code,
        codeVerifier,
        args.redirectUri ?? config.teslaDevRedirectUri ?? "https://my.home-assistant.io/redirect/oauth",
      );
  if (config.devMode) {
    process.stdout.write(`${result.accessToken}\n`);
  } else {
    process.stdout.write("Tesla code exchange succeeded. Access token is hidden unless DEV_MODE=true.\n");
  }
} catch (error: unknown) {
  fail(error instanceof Error ? error.message : "Tesla code exchange failed.");
}

function parseArgs(argv: string[]): {
  code: string | null;
  state: string | null;
  codeVerifier: string | null;
  redirectUri: string | null;
  expectedCodeChallenge: string | null;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if ((current === "--code" || current === "--state" || current === "--code-verifier" || current === "--redirect-uri" || current === "--expected-code-challenge") && next !== undefined) {
      values.set(current, next);
      index += 1;
    }
  }

  return {
    code: normalize(values.get("--code")),
    state: normalize(values.get("--state")),
    codeVerifier: normalize(values.get("--code-verifier")),
    redirectUri: normalize(values.get("--redirect-uri")),
    expectedCodeChallenge: normalize(values.get("--expected-code-challenge")),
  };
}

function applyHomeAssistantOptionsToEnv(): void {
  const optionsPath = process.env.HA_OPTIONS_PATH?.trim() || "/data/options.json";
  if (!existsSync(optionsPath)) {
    return;
  }

  try {
    const options = JSON.parse(readFileSync(optionsPath, "utf8")) as Record<string, unknown>;
    setEnvFromOption("TESLA_CLIENT_ID", options.tesla_client_id);
    setEnvFromOption("TESLA_CLIENT_SECRET", options.tesla_client_secret);
    setEnvFromOption("TESLA_REGION", options.tesla_region);
  } catch {
    fail(`Could not read Home Assistant options from ${optionsPath}.`);
  }
}

function setEnvFromOption(envKey: string, optionValue: unknown): void {
  if (process.env[envKey]?.trim()) {
    return;
  }
  if (typeof optionValue === "string" && optionValue.trim() !== "") {
    process.env[envKey] = optionValue.trim();
  }
}

function normalize(value: string | undefined): string | null {
  return value === undefined || value.trim() === "" ? null : value.trim();
}

function normalizeNullableCodeVerifier(value: string | undefined | null): string | null {
  return value === undefined || value === null ? null : normalizeCodeVerifier(value);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
