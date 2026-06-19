import { describe, expect, it } from "vitest";

import type { Episode, PlaybackState } from "../types/catalog";
import { getContinueEpisode, getNextEpisode, groupEpisodesBySeason } from "./seriesService";

const episodes: Episode[] = [
  {
    id: "s2e1",
    title: "Second Season",
    season: 2,
    episode: 1,
    durationSeconds: 1800,
    description: "Season two opener."
  },
  {
    id: "s1e2",
    title: "Shadow Commit",
    season: 1,
    episode: 2,
    durationSeconds: 1800,
    description: "Second episode."
  },
  {
    id: "s1e1",
    title: "Broken Pipeline",
    season: 1,
    episode: 1,
    durationSeconds: 1800,
    description: "First episode."
  }
];

describe("seriesService", () => {
  it("groups episodes by ordered seasons", () => {
    const groups = groupEpisodesBySeason(episodes);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.season).toBe(1);
    expect(groups[0]?.episodes.map((episode) => episode.id)).toEqual(["s1e1", "s1e2"]);
    expect(groups[1]?.season).toBe(2);
  });

  it("resolves the next episode in series order", () => {
    expect(getNextEpisode(episodes, "s1e1")?.id).toBe("s1e2");
    expect(getNextEpisode(episodes, "s1e2")?.id).toBe("s2e1");
    expect(getNextEpisode(episodes, "s2e1")).toBeUndefined();
  });

  it("chooses the most recently watched episode to continue", () => {
    const playback: Record<string, PlaybackState> = {
      s1e1: {
        contentId: "s1e1",
        positionSeconds: 300,
        durationSeconds: 1800,
        updatedAt: "2026-06-18T12:00:00.000Z"
      },
      s1e2: {
        contentId: "s1e2",
        positionSeconds: 120,
        durationSeconds: 1800,
        updatedAt: "2026-06-19T12:00:00.000Z"
      }
    };

    expect(getContinueEpisode(episodes, playback)?.id).toBe("s1e2");
  });

  it("falls back to the first episode when there is no progress", () => {
    expect(getContinueEpisode(episodes, {})?.id).toBe("s1e1");
  });
});
