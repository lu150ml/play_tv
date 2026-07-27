import { beforeEach, describe, expect, it } from "vitest";

import {
  getPlaybackProgress,
  getProgressRatio,
  getRemainingSeconds,
  savePlaybackProgress,
  shouldShowPlaybackProgress
} from "./playbackService";

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

  it("preserves progress while duration is unknown", () => {
    const saved = savePlaybackProgress({
      contentId: "unknown-duration",
      positionSeconds: 42,
      durationSeconds: 0
    });
    expect(saved.positionSeconds).toBe(42);
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

  it("calculates remaining seconds", () => {
    expect(
      getRemainingSeconds({
        contentId: "episode-1",
        positionSeconds: 120,
        durationSeconds: 1800,
        updatedAt: new Date().toISOString()
      })
    ).toBe(1680);
  });

  it("does not show playback progress for live channels", () => {
    expect(shouldShowPlaybackProgress("movie")).toBe(true);
    expect(shouldShowPlaybackProgress("episode")).toBe(true);
    expect(shouldShowPlaybackProgress("channel")).toBe(false);
  });
});
