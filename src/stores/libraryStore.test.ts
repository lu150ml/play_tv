import { beforeEach, describe, expect, it } from "vitest";
import { useLibraryStore } from "./libraryStore";
import type { ContentItem } from "../types/catalog";

const live: ContentItem = { id: "live-1", title: "Canal", type: "channel", description: "", genres: ["TV"], categories: ["Live TV", "TV"], quality: ["HD"], backdropTone: "", posterTone: "", addedAt: "2026-01-01", channelNumber: 1, currentProgram: "", nextProgram: "" };
const movie: ContentItem = { id: "movie-1", title: "Filme", type: "movie", description: "", genres: ["Ação"], categories: ["Movies", "Ação"], quality: ["HD"], backdropTone: "", posterTone: "", addedAt: "2026-01-01", director: "", cast: [] };

describe("progressive library store", () => {
  beforeEach(() => { useLibraryStore.getState().beginCatalogLoad(); });
  it("replaces one section without erasing sections already loaded", () => {
    useLibraryStore.getState().setCatalogSection("live", [live]);
    useLibraryStore.getState().setCatalogSection("vod", [movie]);
    expect(useLibraryStore.getState().catalog.map((item) => item.id)).toEqual(["live-1", "movie-1"]);
    expect(useLibraryStore.getState().catalogSections.live.status).toBe("ready");
  });
  it("keeps independent navigation state per screen", () => {
    useLibraryStore.getState().setViewState("tv", { query: "sport", scrollY: 300 });
    expect(useLibraryStore.getState().getViewState("movies").query).toBe("");
    expect(useLibraryStore.getState().getViewState("tv").scrollY).toBe(300);
  });
});
