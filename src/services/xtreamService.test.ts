import { describe, expect, it, vi } from "vitest";
import { loadXtreamSeriesArtwork, loadXtreamSeriesEpisodes, normalizeCategory } from "./xtreamService";

describe("Xtream category names", () => {
  it("preserves the exact hierarchy supplied by the provider", () => {
    expect(normalizeCategory("CANAIS | ESPN")).toBe("CANAIS | ESPN");
    expect(normalizeCategory(" SÉRIES | NETFLIX ")).toBe("SÉRIES | NETFLIX");
  });

  it("shares one series-info request between episodes and fallback artwork", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      info: { movie_image: "https://images.test/cover.jpg" },
      episodes: { "1": [{ id: 99, episode_num: 1, title: "Pilot", container_extension: null, info: {} }] }
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", request);
    const credentials = { serverUrl: "https://cache-test.example", username: "viewer", password: "secret" };
    const episodes = await loadXtreamSeriesEpisodes(credentials, "series-1");
    const artwork = await loadXtreamSeriesArtwork(credentials, "series-1");
    expect(request).toHaveBeenCalledTimes(1);
    expect(artwork).toBe("https://images.test/cover.jpg");
    expect(episodes[0]?.streamCandidates?.map((url) => url.split(".").pop())).toEqual(["mp4", "m3u8", "ts", "mkv"]);
    vi.unstubAllGlobals();
  });
});
