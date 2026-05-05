// Requirements: CHG-101, CHG-102, CHG-103, CHG-104, CHG-105

import { describe, expect, it } from "vitest";

import { MockChargerController } from "../../src/charging/MockChargerController.js";

describe("MockChargerController", () => {
  it("supports startCharging, stopCharging, and setCurrent without real hardware", async () => {
    const controller = new MockChargerController();

    await controller.setCurrent(16);
    await controller.startCharging();

    await expect(controller.getStatus()).resolves.toMatchObject({
      charging: true,
      currentAmpere: 16,
    });

    await controller.stopCharging();

    await expect(controller.getStatus()).resolves.toMatchObject({
      charging: false,
      powerKw: 0,
      currentAmpere: 16,
    });
  });

  it("rejects invalid current limits", async () => {
    const controller = new MockChargerController();

    await expect(controller.setCurrent(-1)).rejects.toThrow("Charging current must be a non-negative number.");
  });
});
