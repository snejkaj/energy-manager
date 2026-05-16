import { existsSync, readFileSync } from "node:fs";

import { ProviderAuthService } from "../auth/ProviderAuthService.js";
import { loadConfig } from "../config.js";

applyHomeAssistantOptionsToEnv();

const args = parseArgs(process.argv.slice(2));
if (args.code === null || args.state === null) {
  fail('Usage: npm run tesla:exchange-code -- --code "..." --state "..."');
}

const config = loadConfig();
const authService = new ProviderAuthService(config);

try {
  const result = await authService.exchangePendingTeslaCode(args.code, args.state);
  if (config.devMode) {
    process.stdout.write(`${result.accessToken}\n`);
  } else {
    process.stdout.write("Tesla code exchange succeeded. Access token is hidden unless DEV_MODE=true.\n");
  }
} catch (error: unknown) {
  fail(error instanceof Error ? error.message : "Tesla code exchange failed.");
}

function parseArgs(argv: string[]): { code: string | null; state: string | null } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if ((current === "--code" || current === "--state") && next !== undefined) {
      values.set(current, next);
      index += 1;
    }
  }

  return {
    code: normalize(values.get("--code")),
    state: normalize(values.get("--state")),
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

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
