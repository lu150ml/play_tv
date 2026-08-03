import { describe, expect, it } from "vitest";
import { formatResolution, getChannelStreamCandidates, getOnDemandStreamCandidates, shouldProbeBeforePlayback } from "./streamService";

describe("streamService", () => {
  it("never blocks movies or episodes behind the live-channel probe", () => {
    expect(shouldProbeBeforePlayback("channel")).toBe(true);
    expect(shouldProbeBeforePlayback("movie")).toBe(false);
    expect(shouldProbeBeforePlayback("series")).toBe(false);
  });
  it("offers ts as a fallback for an HLS live URL", () => {
    expect(getChannelStreamCandidates("https://host/live/u/p/1.m3u8")).toEqual([
      "https://host/live/u/p/1.m3u8",
      "https://host/live/u/p/1.ts"
    ]);
  });

  it("does not duplicate an unknown stream format", () => {
    expect(getChannelStreamCandidates("https://host/live/u/p/1.mp4")).toEqual([
      "https://host/live/u/p/1.mp4"
    ]);
  });

  it("tries browser-compatible episode formats before a reported mkv", () => {
    expect(getOnDemandStreamCandidates("https://host/series/u/p/1.mkv")).toEqual([
      "https://host/series/u/p/1.mp4",
      "https://host/series/u/p/1.m3u8",
      "https://host/series/u/p/1.ts",
      "https://host/series/u/p/1.mkv"
    ]);
  });

  it("tries every common Xtream extension when an episode defaults to mp4", () => {
    expect(getOnDemandStreamCandidates("https://host/series/u/p/1.mp4")).toEqual([
      "https://host/series/u/p/1.mp4",
      "https://host/series/u/p/1.m3u8",
      "https://host/series/u/p/1.ts",
      "https://host/series/u/p/1.mkv"
    ]);
  });

  it("labels the selected maximum resolution", () => {
    expect(formatResolution(3840, 2160)).toBe("4K (3840x2160)");
    expect(formatResolution(1920, 1080)).toBe("1080p (1920x1080)");
  });
});
