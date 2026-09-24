import { describe, expect, it, vi } from "vitest";
import { ensureUniqueContentIds, loadXtreamCatalog, loadXtreamSeriesArtwork, loadXtreamSeriesEpisodes, normalizeCategory } from "./xtreamService";

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

  it("keeps using the typed server URL even when server_info points to a CDN", async () => {
    const serverUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { action?: string; serverUrl: string };
      serverUrls.push(body.serverUrl);
      const payload = body.action === undefined
        ? { user_info: { auth: 1 }, server_info: { url: "cache.b-cdn.net", port: "80", server_protocol: "http" } }
        : body.action === "get_vod_streams" ? [{ stream_id: 7, name: "Filme" }] : [];
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }));
    }));

    const result = await loadXtreamCatalog({ serverUrl: "http://painel.example", username: "viewer", password: "secret" });

    expect(new Set(serverUrls)).toEqual(new Set(["http://painel.example"]));
    expect(result.serverUrl).toBe("http://painel.example");
    expect(result.catalog[0]?.streamUrl).toContain("http://painel.example/movie/");
    vi.unstubAllGlobals();
  });

  it("emits live channels without waiting for slow VOD and series responses", async () => {
    const pending = new Map<string, (value: Response) => void>();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { action?: string };
      const action = body.action ?? "profile";
      if (action === "profile") return Promise.resolve(new Response(JSON.stringify({ user_info: { auth: 1 } }), { status: 200 }));
      if (action.endsWith("_categories")) return Promise.resolve(new Response("[]", { status: 200 }));
      return new Promise<Response>((resolve) => pending.set(action, resolve));
    }));
    const updates: string[] = [];
    const load = loadXtreamCatalog(
      { serverUrl: "https://progressive.example", username: "viewer", password: "secret" },
      { onSection: (update) => updates.push(update.section) }
    );
    await vi.waitFor(() => expect(pending.has("get_live_streams")).toBe(true));
    pending.get("get_live_streams")?.(new Response(JSON.stringify([{ stream_id: 7, name: "News" }]), { status: 200 }));
    await vi.waitFor(() => expect(updates).toEqual(["live"]));
    pending.get("get_vod_streams")?.(new Response("[]", { status: 200 }));
    pending.get("get_series")?.(new Response("[]", { status: 200 }));
    await load;
    expect(updates).toEqual(["live", "vod", "series"]);
    vi.unstubAllGlobals();
  });

  it("keeps duplicate provider IDs addressable without changing their stream provider ID", () => {
    const first = {
      id: "xtream-movie-7",
      providerId: "7",
      source: "xtream" as const,
      type: "movie" as const,
      title: "Movie A",
      description: "A",
      genres: ["Ação"],
      categories: ["Movies", "Ação"],
      providerCategoryId: "10",
      quality: ["HD" as const],
      streamUrl: "https://example.test/movie/u/p/7.mp4",
      director: "Unknown",
      cast: [],
      backdropTone: "from-black to-black",
      posterTone: "from-black to-black",
      addedAt: "2026-01-01T00:00:00.000Z"
    };
    const second = {
      ...first,
      title: "Movie B",
      description: "B",
      providerCategoryId: "11"
    };

    const result = ensureUniqueContentIds([first, second]);

    expect(result[0]?.id).toBe("xtream-movie-7");
    expect(result[1]?.id).toMatch(/^xtream-movie-7-11-movie-b-1$/);
    expect(result[1]?.providerId).toBe("7");
    expect(new Set(result.map((item) => item.id)).size).toBe(2);
  });
});
