// Requirements: CHG-101, CHG-102, CHG-105

export interface ChargerController {
  getStatus(): Promise<ChargerStatus>;
  startCharging(): Promise<void>;
  stopCharging(): Promise<void>;
  setCurrent(currentAmpere: number): Promise<void>;
}

export interface ChargerStatus {
  connected: boolean;
  charging: boolean;
  powerKw: number;
  currentAmpere: number;
}
