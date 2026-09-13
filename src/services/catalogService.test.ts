import { describe, expect, it } from "vitest";

import { getCatalog, normalizeSearchText, searchCatalog, sortCatalog } from "./catalogService";
import { getMovieSegments } from "./movieSegmentService";

describe("catalogService", () => {
  it("normalizes accents for indexed search", () => {
    expect(normalizeSearchText("Ação SÉRIES")).toBe("acao series");
  });
  it("filters catalog items by query", () => {
    const results = searchCatalog({ query: "sports" });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Sports Grid");
  });

  it("filters by favorites when requested", () => {
    const favorites = new Set(["machine-heart"]);
    const results = searchCatalog({ favoritesOnly: true }, favorites);

    expect(results.map((item) => item.id)).toEqual(["machine-heart"]);
  });

  it("sorts by title", () => {
    const sorted = sortCatalog(getCatalog(), "title");

    expect(sorted[0]?.title).toBe("Cine Max Live");
  });

  it("filters by type and quality", () => {
    const results = searchCatalog({ type: "movie", quality: "4K" });

    expect(results.every((item) => item.type === "movie")).toBe(true);
    expect(results.every((item) => item.quality.includes("4K"))).toBe(true);
  });

  it("classifies movies into useful local segments", () => {
    const movie = getCatalog().find((item) => item.type === "movie")!;

    expect(getMovieSegments({ ...movie, genres: ["Terror", "Suspense"], categories: ["Movies"] })).toEqual([
      "Terror",
      "Suspense"
    ]);
    expect(getMovieSegments({ ...movie, genres: ["Categoria sem mapa"], categories: ["Movies"] })).toEqual([
      "Outros"
    ]);
  });
});
