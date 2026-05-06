// Requirements: TIB-001, TIB-003, TIB-005, TIB-008, TEL-001, TEL-002, TEL-003, TEL-004

import { describe, expect, it } from "vitest";

import type { GraphQLTransport } from "../../src/providers/tibber/TibberClient.js";
import { TibberHomeTelemetryProvider, TibberPriceProvider } from "../../src/providers/tibber/TibberProvider.js";

describe("TibberPriceProvider", () => {
  it("maps Tibber price data to internal price intervals", async () => {
    // Requirements: TIB-003, TIB-005
    const provider = new TibberPriceProvider(
      new FakeTransport({
        viewer: {
          homes: [
            {
              id: "home-1",
              currentSubscription: {
                  priceInfo: {
                  current: {
                    startsAt: "2026-05-05T00:00:00+02:00",
                    total: 1.25,
                    currency: "SEK",
                    level: "NORMAL",
                  },
                  today: [
                    {
                      startsAt: "2026-05-05T00:00:00+02:00",
                      total: 1.25,
                      currency: "SEK",
                      level: "NORMAL",
                    },
                  ],
                  tomorrow: [],
                },
              },
            },
          ],
        },
      }),
    );

    const prices = await provider.getPrices({
      startsAt: "2026-05-04T22:00:00.000Z",
      endsAt: "2026-05-04T23:00:00.000Z",
    });

    expect(prices).toEqual([
      {
        startsAt: "2026-05-04T22:00:00.000Z",
        endsAt: "2026-05-04T23:00:00.000Z",
        total: 1.25,
        currency: "SEK",
      },
    ]);
  });

  it("maps current Tibber price to an internal price interval", async () => {
    const provider = new TibberPriceProvider(
      new FakeTransport({
        viewer: {
          homes: [
            {
              id: "home-1",
              currentSubscription: {
                priceInfo: {
                  current: {
                    startsAt: "2026-05-05T00:00:00+02:00",
                    total: 1.25,
                    currency: "SEK",
                    level: "NORMAL",
                  },
                  today: [],
                  tomorrow: [],
                },
              },
            },
          ],
        },
      }),
    );

    await expect(provider.getCurrentPrice()).resolves.toEqual({
      startsAt: "2026-05-04T22:00:00.000Z",
      endsAt: "2026-05-04T23:00:00.000Z",
      total: 1.25,
      currency: "SEK",
    });
  });
});

describe("TibberHomeTelemetryProvider", () => {
  it("maps live measurement watts to kW", async () => {
    // Requirements: TEL-001, TEL-002, TEL-006
    const provider = new TibberHomeTelemetryProvider(
      new FakeTransport({
        viewer: {
          homes: [
            {
              id: "home-1",
              liveMeasurement: {
                timestamp: "2026-05-05T10:00:00.000Z",
                power: 1200,
                powerProduction: 300,
              },
            },
          ],
        },
      }),
    );

    await expect(provider.getCurrentTelemetry()).resolves.toEqual({
      consumptionKw: 1.2,
      productionKw: 0.3,
    });
  });

  it("returns null when live measurement is missing", async () => {
    // Requirements: TIB-008, TEL-003, TEL-004
    const provider = new TibberHomeTelemetryProvider(
      new FakeTransport({
        viewer: {
          homes: [
            {
              id: "home-1",
              liveMeasurement: null,
            },
          ],
        },
      }),
    );

    await expect(provider.getCurrentTelemetry()).resolves.toBeNull();
  });
});

class FakeTransport implements GraphQLTransport {
  constructor(private readonly data: unknown) {}

  async execute<TData>(): Promise<TData> {
    return this.data as TData;
  }
}
