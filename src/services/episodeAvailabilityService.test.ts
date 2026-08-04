import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearEpisodeFailure,
  clearEpisodeFailureCache,
  getEpisodeFailure,
  recordEpisodeFailure
} from "./episodeAvailabilityService";

beforeEach(() => {
  clearEpisodeFailureCache();
  vi.useRealTimers();
});

describe("episode availability cache", () => {
  it("isolates definitive failures by account and episode", () => {
    recordEpisodeFailure("account-a", "episode-1", new Error("HTTP 404"));
    expect(getEpisodeFailure("account-a", "episode-1")?.reason).toContain("indisponivel");
    expect(getEpisodeFailure("account-a", "episode-2")).toBeUndefined();
    expect(getEpisodeFailure("account-b", "episode-1")).toBeUndefined();
  });

  it("does not cache codec or generic playback errors", () => {
    expect(recordEpisodeFailure("account-a", "episode-1", new Error("codec nao suportado"))).toBeUndefined();
    expect(getEpisodeFailure("account-a", "episode-1")).toBeUndefined();
  });

  it("allows an explicit retry to clear a cached failure", () => {
    recordEpisodeFailure("account-a", "episode-1", new Error("O servidor respondeu HTTP 403"));
    clearEpisodeFailure("account-a", "episode-1");
    expect(getEpisodeFailure("account-a", "episode-1")).toBeUndefined();
  });
});
