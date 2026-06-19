import { describe, expect, it } from "vitest";

import { mockCatalog } from "../data/mockCatalog";
import type { PlaybackState } from "../types/catalog";
import {
  getPersonalizedRecommendations,
  getRecommendedHero,
  getUserTopicProfile
} from "./recommendationService";

describe("recommendationService", () => {
  it("builds a topic profile from watched content", () => {
    const profile = getUserTopicProfile(mockCatalog, {
      "neon-genesis-awakening": playback("neon-genesis-awakening", 1800, 8100)
    });

    expect(profile.hasSignals).toBe(true);
    expect(profile.genres.get("sci-fi")).toBeGreaterThan(0);
    expect(profile.types.get("movie")).toBeGreaterThan(0);
  });

  it("recommends related genres and categories first", () => {
    const recommendations = getPersonalizedRecommendations(
      mockCatalog,
      {
        "neon-genesis-awakening": playback("neon-genesis-awakening", 1800, 8100)
      },
      new Set(),
      3
    );

    expect(recommendations[0]?.id).toBe("machine-heart");
    expect(recommendations.map((item) => item.id)).not.toContain("sports-grid");
  });

  it("uses favorites as positive preference signals", () => {
    const recommendations = getPersonalizedRecommendations(
      mockCatalog,
      {},
      new Set(["machine-heart"]),
      2
    );

    expect(recommendations[0]?.id).toBe("neon-genesis-awakening");
  });

  it("penalizes nearly completed content", () => {
    const recommendations = getPersonalizedRecommendations(
      mockCatalog,
      {
        "neon-genesis-awakening": playback("neon-genesis-awakening", 8050, 8100),
        "machine-heart": playback("machine-heart", 800, 4200)
      },
      new Set(),
      3
    );

    expect(recommendations[0]?.id).not.toBe("neon-genesis-awakening");
  });

  it("falls back to featured content without history", () => {
    expect(getPersonalizedRecommendations(mockCatalog, {}, new Set(), 5)).toEqual([]);
    expect(getRecommendedHero(mockCatalog, {}, new Set())?.id).toBe("neon-genesis-awakening");
  });
});

function playback(
  contentId: string,
  positionSeconds: number,
  durationSeconds: number
): PlaybackState {
  return {
    contentId,
    positionSeconds,
    durationSeconds,
    updatedAt: new Date().toISOString()
  };
}
