// Requirements: TIB-005, TEL-001, TEL-002, ARC-006

export interface TibberHomeSelection {
  homeId?: string | null;
}

export interface TibberPriceEntry {
  startsAt: string;
  total: number;
  energy?: number | null;
  tax?: number | null;
  currency: string;
  level?: string | null;
}

export interface TibberPriceData {
  viewer: {
    homes: TibberHomePriceNode[];
  };
}

export interface TibberHomePriceNode {
  id: string;
  currentSubscription: {
    priceInfo: {
      current?: TibberPriceEntry | null;
      today: TibberPriceEntry[];
      tomorrow: TibberPriceEntry[];
    };
  } | null;
}

export interface TibberTelemetryData {
  viewer: {
    homes: TibberHomeTelemetryNode[];
  };
}

export interface TibberHomeTelemetryNode {
  id: string;
  features?: {
    realTimeConsumptionEnabled?: boolean | null;
  } | null;
  liveMeasurement?: {
    timestamp?: string | null;
    power?: number | null;
    powerProduction?: number | null;
  } | null;
}
