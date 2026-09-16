import { describe, expect, it } from "vitest";

import type { ContentItem } from "../types/catalog";
import { getMovieSegments, groupMoviesBySegment } from "./movieSegmentService";

const baseMovie: ContentItem = {
  id: "movie-1",
  providerId: "1",
  source: "xtream",
  title: "Operação Ação",
  type: "movie",
  description: "Filme policial de action",
  genres: ["Crime"],
  categories: ["Coleção Marvel"],
  quality: ["HD"],
  backdropTone: "from-red-900",
  posterTone: "from-red-900",
  director: "",
  cast: [],
  addedAt: "2026-01-01T00:00:00.000Z"
};

describe("movieSegmentService", () => {
  it("classifies movies by smart segments without depending on provider collection", () => {
    expect(getMovieSegments(baseMovie)).toContain("Ação");
  });

  it("groups movies into segment rails", () => {
    const groups = groupMoviesBySegment([
      baseMovie,
      { ...baseMovie, id: "movie-2", title: "Ação 2" },
      { ...baseMovie, id: "movie-3", title: "Ação 3" }
    ]);

    expect(groups.some((group) => group.title === "Ação" && group.items.length === 3)).toBe(true);
  });
});
