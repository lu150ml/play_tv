import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { httpClient } from "../platform/httpClient";
import { useLibraryStore } from "../stores/libraryStore";
import type { ContentItem } from "../types/catalog";
import { CATALOG_REFRESH_INTERVAL_MS, isCatalogStale, refreshCatalog } from "./catalogRefreshService";

const oldMovie: ContentItem = { id: "xtream-movie-1", source: "xtream", title: "Antigo", type: "movie", description: "", genres: [], categories: ["Movies"], quality: ["HD"], backdropTone: "", posterTone: "", addedAt: "2026-01-01", director: "", cast: [] };
const oldChannel: ContentItem = { id: "xtream-live-1", source: "xtream", title: "Canal antigo", type: "channel", description: "", genres: [], categories: ["Live TV"], quality: ["HD"], backdropTone: "", posterTone: "", addedAt: "2026-01-01", channelNumber: 1, currentProgram: "", nextProgram: "" };

function stubServer(failVod = false) {
  vi.spyOn(httpClient, "get").mockImplementation((url) => {
    const action = new URL(url, "http://localhost").searchParams.get("action");
    if (!action) return Promise.resolve({ data: { user_info: { auth: 1 } }, status: 200 });
    if (action === "get_vod_streams" && failVod) return Promise.resolve({ data: "erro", status: 403 });
    const data = action === "get_live_streams" ? [{ stream_id: 9, name: "Canal novo" }]
      : action === "get_vod_streams" ? [{ stream_id: 2, name: "Filme novo" }]
      : [];
    return Promise.resolve({ data, status: 200 });
  });
}

describe("refreshCatalog", () => {
  beforeEach(() => {
    useLibraryStore.getState().clearSession();
    useLibraryStore.getState().setCatalog([oldChannel, oldMovie], "xtream");
    useLibraryStore.getState().setConnection({ serverUrl: "http://iptv.example", username: "u", password: "p" });
  });
  afterEach(() => vi.restoreAllMocks());

  it("troca a lista pela do servidor", async () => {
    stubServer();
    await refreshCatalog();
    expect(useLibraryStore.getState().catalog.map((item) => item.title)).toEqual(["Canal novo", "Filme novo"]);
  });

  it("mantem os itens antigos da secao que falhou", async () => {
    stubServer(true);
    await expect(refreshCatalog()).rejects.toThrow();
    const titles = useLibraryStore.getState().catalog.map((item) => item.title);
    expect(titles).toContain("Antigo");
    expect(titles).toContain("Canal novo");
  });

  it("considera a lista velha depois de 3 dias", () => {
    const now = Date.now();
    expect(isCatalogStale(new Date(now - CATALOG_REFRESH_INTERVAL_MS + 60_000).toISOString(), now)).toBe(false);
    expect(isCatalogStale(new Date(now - CATALOG_REFRESH_INTERVAL_MS).toISOString(), now)).toBe(true);
    expect(isCatalogStale(undefined, now)).toBe(true);
  });
});
