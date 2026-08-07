import { describe, expect, it, vi } from "vitest";
import { loadXtreamCatalog, loadXtreamSeriesArtwork, loadXtreamSeriesEpisodes, normalizeCategory } from "./xtreamService";

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

  it("keeps live 24h HLS URLs first and stores TS only as fallback", async () => {
    const responses: Record<string, unknown> = {
      profile: { user_info: { auth: 1 } },
      get_live_categories: [{ category_id: "24h", category_name: "24H - Anime" }],
      get_vod_categories: [],
      get_series_categories: [],
      get_live_streams: [{ stream_id: 123, name: "24H Anime Classics", category_id: "24h" }],
      get_vod_streams: [],
      get_series: []
    };
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      const rawBody = typeof init?.body === "string" ? init.body : "{}";
      const body = JSON.parse(rawBody) as { action?: string };
      const action = body.action ?? "profile";
      return Promise.resolve(new Response(JSON.stringify(responses[action]), {
        status: 200,
        headers: { "content-type": "application/json" }
      }));
    }));

    const result = await loadXtreamCatalog({
      serverUrl: "https://xtream.example",
      username: "viewer",
      password: "secret"
    });
    const live = result.catalog.find((item) => item.id === "xtream-live-123");

    expect(live?.streamUrl).toBe("https://xtream.example/live/viewer/secret/123.m3u8");
    expect(live?.streamCandidates).toEqual([
      "https://xtream.example/live/viewer/secret/123.m3u8",
      "https://xtream.example/live/viewer/secret/123.ts"
    ]);
    vi.unstubAllGlobals();
  });
});
