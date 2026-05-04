// Requirements: PRV-001, PRV-002, PRV-004, TIB-005, ARC-006

import type { PriceInterval } from "../charging/types.js";
import type { Provider } from "./providerTypes.js";

export interface ElectricityPriceProviderCapabilities {
  supportsHistoricalPrices: boolean;
  supportsFuturePrices: boolean;
}

export interface PriceQuery {
  startsAt: string;
  endsAt: string;
}

export interface ElectricityPriceProvider
  extends Provider<ElectricityPriceProviderCapabilities> {
  getPrices(query: PriceQuery): Promise<PriceInterval[]>;
}
