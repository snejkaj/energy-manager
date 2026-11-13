// Requirements: EMG-001, EMG-008, SAF-001

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EmergencyOverrideStore } from "../../src/app/EmergencyOverrideStore.js";

describe("EmergencyOverrideStore", () => {
  it("survives a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "em-override-"));
    new EmergencyOverrideStore(join(dir, "state.json")).save({ active: true, changedAt: "2026-11-12T06:00:00.000Z" });

    expect(new EmergencyOverrideStore(join(dir, "state.json")).load()).toEqual({
      active: true,
      changedAt: "2026-11-12T06:00:00.000Z",
    });
  });

  it("can be cancelled", () => {
    const dir = mkdtempSync(join(tmpdir(), "em-override-"));
    const store = new EmergencyOverrideStore(join(dir, "state.json"));
    store.save({ active: true, changedAt: null });
    store.save({ active: false, changedAt: null });

    expect(store.load().active).toBe(false);
  });

  it("defaults to inactive when nothing is stored, storage is disabled, or the file is corrupt", () => {
    const dir = mkdtempSync(join(tmpdir(), "em-override-"));
    const corrupt = join(dir, "corrupt.json");
    writeFileSync(corrupt, "{not json");

    expect(new EmergencyOverrideStore(join(dir, "missing.json")).load().active).toBe(false);
    expect(new EmergencyOverrideStore(null).load().active).toBe(false);
    expect(new EmergencyOverrideStore(corrupt).load().active).toBe(false);
  });
});
