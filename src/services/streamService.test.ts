import { describe, expect, it } from "vitest";
import { formatResolution, getChannelStreamCandidates } from "./streamService";

describe("streamService", () => {
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

  it("labels the selected maximum resolution", () => {
    expect(formatResolution(3840, 2160)).toBe("4K (3840x2160)");
    expect(formatResolution(1920, 1080)).toBe("1080p (1920x1080)");
  });
});
