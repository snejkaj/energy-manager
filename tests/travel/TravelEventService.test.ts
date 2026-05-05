// Requirements: PRE-001, PRE-012, PRE-016, PRE-017, DB-011, DB-012

import { describe, expect, it } from "vitest";

import type { TravelRepository } from "../../src/db/repositories/TravelRepository.js";
import { TravelEventService } from "../../src/travel/TravelEventService.js";
import type { AiTravelInferenceProvider } from "../../src/travel/AiTravelInferenceProvider.js";

describe("TravelEventService", () => {
  it("stores explicit calendar trips as travel events and does not call AI", async () => {
    // Requirements: PRE-012, PRE-016, DB-011
    const repository = new FakeTravelRepository();
    const aiProvider = new FakeAiProvider();
    const service = new TravelEventService(repository as unknown as TravelRepository, aiProvider);

    await service.importCalendarEvent({
      title: "Drive to office",
      startsAt: "2026-05-05T08:00:00.000Z",
    });

    expect(repository.createdEvents).toHaveLength(1);
    expect(repository.createdPredictions).toHaveLength(0);
    expect(aiProvider.calls).toBe(0);
  });

  it("stores AI-inferred trips as travel predictions with confidence", async () => {
    // Requirements: PRE-016, PRE-017, DB-012
    const repository = new FakeTravelRepository();
    const service = new TravelEventService(repository as unknown as TravelRepository, new FakeAiProvider());

    await service.importCalendarEvent({
      title: "Client meeting",
      startsAt: "2026-05-05T08:00:00.000Z",
      endsAt: "2026-05-05T09:00:00.000Z",
    });

    expect(repository.createdEvents).toHaveLength(0);
    expect(repository.createdPredictions).toHaveLength(1);
    expect(repository.createdPredictions[0]?.confidence).toBe(0.74);
  });

  it("does not store AI prediction when explicit event overlaps", async () => {
    // Requirements: PRE-016
    const repository = new FakeTravelRepository(true);
    const aiProvider = new FakeAiProvider();
    const service = new TravelEventService(repository as unknown as TravelRepository, aiProvider);

    await service.importCalendarEvent({
      title: "Client meeting",
      startsAt: "2026-05-05T08:00:00.000Z",
      endsAt: "2026-05-05T09:00:00.000Z",
    });

    expect(repository.createdPredictions).toHaveLength(0);
    expect(aiProvider.calls).toBe(0);
  });
});

class FakeAiProvider implements AiTravelInferenceProvider {
  calls = 0;

  async inferTrip() {
    this.calls += 1;
    return {
      needsCar: true,
      confidence: 0.74,
      tripSize: "medium" as const,
      reason: ["Meeting location usually requires driving"],
    };
  }
}

class FakeTravelRepository {
  createdEvents: unknown[] = [];
  createdPredictions: Array<{ confidence?: number | null }> = [];

  constructor(private readonly explicitExists = false) {}

  async createTravelEvent(input: unknown) {
    this.createdEvents.push(input);
    return input;
  }

  async createTravelPrediction(input: { confidence?: number | null }) {
    this.createdPredictions.push(input);
    return input;
  }

  async hasExplicitTravelEvent() {
    return this.explicitExists;
  }
}
