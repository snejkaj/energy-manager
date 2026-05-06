// Requirements: TES-001, TES-002, TES-003, TES-004, TES-006, PRV-004, ARC-006

export interface TeslaVehicleSelection {
  vehicleId?: string | null;
}

export interface TeslaVehicleDataResponse {
  response: {
    id_s?: string;
    vin?: string;
    charge_state?: {
      battery_level?: number | null;
      charging_state?: string | null;
      charge_port_door_open?: boolean | null;
      charge_port_latch?: string | null;
      fast_charger_present?: boolean | null;
      est_battery_range?: number | null;
      ideal_battery_range?: number | null;
    } | null;
  };
}

export interface TeslaVehiclesResponse {
  response: Array<{
    id_s?: string;
    vin?: string;
  }>;
}
