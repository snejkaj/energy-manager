// Requirements: EMG-001, EMG-008, SAF-001

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { logger } from "./logger.js";

export interface EmergencyOverrideState {
  active: boolean;
  changedAt: string | null;
}

const INACTIVE: EmergencyOverrideState = { active: false, changedAt: null };

/**
 * Persists the "Charge to 100%" override so a restart does not silently drop
 * a user's request. Failures are logged and never block the request itself.
 */
export class EmergencyOverrideStore {
  constructor(private readonly filePath: string | null) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): EmergencyOverrideStore {
    const dataDir = env.ENERGY_MANAGER_DATA_DIR?.trim() || (existsSync("/data") ? "/data" : null);
    return new EmergencyOverrideStore(dataDir === null ? null : join(dataDir, "emergency-override.json"));
  }

  load(): EmergencyOverrideState {
    if (this.filePath === null || !existsSync(this.filePath)) {
      return { ...INACTIVE };
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<EmergencyOverrideState>;
      return {
        active: parsed.active === true,
        changedAt: typeof parsed.changedAt === "string" ? parsed.changedAt : null,
      };
    } catch (error) {
      logger.error("Emergency", `Could not read saved Charge to 100% state: ${errorText(error)}`);
      return { ...INACTIVE };
    }
  }

  save(state: EmergencyOverrideState): void {
    if (this.filePath === null) {
      return;
    }
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(state), "utf8");
    } catch (error) {
      logger.error("Emergency", `Could not save Charge to 100% state: ${errorText(error)}`);
    }
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
