// Requirements: CHG-101, CHG-103, CHG-104, PRD-003, PRD-006

import type { ChargerController, ChargerStatus } from "./ChargerController.js";

export class MockChargerController implements ChargerController {
  private status: ChargerStatus;

  constructor(initialStatus: ChargerStatus = { connected: true, charging: false, powerKw: 0 }) {
    this.status = { ...initialStatus };
  }

  async getStatus(): Promise<ChargerStatus> {
    return { ...this.status };
  }

  async startCharging(): Promise<void> {
    this.status = {
      ...this.status,
      charging: true,
    };
  }

  async stopCharging(): Promise<void> {
    this.status = {
      ...this.status,
      charging: false,
      powerKw: 0,
    };
  }
}
