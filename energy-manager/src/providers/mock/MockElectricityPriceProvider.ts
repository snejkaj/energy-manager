// Requirements: PRV-001, PRV-002, PRV-004, PRD-006

import type { PriceInterval } from "../../charging/types.js";
import type { ElectricityPriceProvider, PriceQuery } from "../ElectricityPriceProvider.js";

export class MockElectricityPriceProvider implements ElectricityPriceProvider {
  metadata = {
    id: "mock-electricity-price",
    displayName: "Mock electricity prices",
    kind: "electricity-price" as const,
  };

  configSchema = {
    fields: [],
  };

  capabilities = {
    supportsHistoricalPrices: true,
    supportsFuturePrices: true,
  };

  constructor(private readonly prices: PriceInterval[]) {}

  async getPrices(query: PriceQuery): Promise<PriceInterval[]> {
    const startsAt = Date.parse(query.startsAt);
    const endsAt = Date.parse(query.endsAt);

    return this.prices.filter((price) => {
      const priceStartsAt = Date.parse(price.startsAt);
      return priceStartsAt >= startsAt && priceStartsAt < endsAt;
    });
  }
}
