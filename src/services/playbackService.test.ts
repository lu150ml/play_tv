import { beforeEach, describe, expect, it } from "vitest";

import { getPlaybackProgress, getProgressRatio, savePlaybackProgress } from "./playbackService";

describe("playbackService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists and loads playback progress", () => {
    const saved = savePlaybackProgress({
      contentId: "neon-genesis-awakening",
      positionSeconds: 120,
      durationSeconds: 240
    });

    expect(getPlaybackProgress("neon-genesis-awakening")).toEqual(saved);
  });

  it("clamps progress to duration", () => {
    const saved = savePlaybackProgress({
      contentId: "orbital-decay",
      positionSeconds: 999,
      durationSeconds: 100
    });

    expect(saved.positionSeconds).toBe(100);
  });

  it("calculates progress ratio", () => {
    expect(
      getProgressRatio({
        contentId: "syntax-error",
        positionSeconds: 25,
        durationSeconds: 100,
        updatedAt: new Date().toISOString()
      })
    ).toBe(0.25);
  });
});
