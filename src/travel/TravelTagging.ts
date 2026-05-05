// Requirements: PRE-012, PRE-013, PRE-014, PRE-015

import type { CalendarEventInput, ExplicitTravelDetection, UserTaggedTravelInput } from "./travelTypes.js";

const CAR_EMOJI = "🚗";
const CAR_KEYWORDS = ["car", "drive"];
const TRIP_SIZE_KEYWORDS = {
  short: ["short", "nearby", "local"],
  medium: ["medium"],
  long: ["long", "roadtrip", "road trip"],
} as const;

export function detectExplicitTravelFromCalendar(event: CalendarEventInput): ExplicitTravelDetection {
  const searchableText = normalizeText([event.title, event.description, event.location].join(" "));

  if ([event.title, event.description, event.location].join(" ").includes(CAR_EMOJI)) {
    return {
      needsCar: true,
      detectionSource: "emoji",
      tripSize: detectTripSize(searchableText),
      tags: [CAR_EMOJI],
    };
  }

  const keyword = CAR_KEYWORDS.find((candidate) => containsWord(searchableText, candidate));
  if (keyword !== undefined) {
    return {
      needsCar: true,
      detectionSource: "keyword",
      tripSize: detectTripSize(searchableText),
      tags: [keyword],
    };
  }

  return {
    needsCar: false,
    detectionSource: null,
    tripSize: detectTripSize(searchableText),
    tags: [],
  };
}

export function detectExplicitTravelFromUserTag(input: UserTaggedTravelInput): ExplicitTravelDetection {
  return {
    needsCar: input.needsCar,
    detectionSource: input.needsCar ? "manual_toggle" : "user_tag",
    tripSize: input.tripSize ?? null,
    tags: input.tags ?? [],
  };
}

function detectTripSize(text: string) {
  for (const [tripSize, keywords] of Object.entries(TRIP_SIZE_KEYWORDS)) {
    if (keywords.some((keyword) => containsWord(text, keyword))) {
      return tripSize as "short" | "medium" | "long";
    }
  }

  return null;
}

function containsWord(text: string, word: string): boolean {
  return new RegExp(`(^|\\W)${escapeRegExp(word)}($|\\W)`, "i").test(text);
}

function normalizeText(text: string): string {
  return text.toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
