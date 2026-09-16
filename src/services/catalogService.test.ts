import { describe, expect, it } from "vitest";

import { getCatalog, searchCatalog, sortCatalog } from "./catalogService";

describe("catalogService", () => {
  it("filters catalog items by query", () => {
    const results = searchCatalog({ query: "sports" });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Sports Grid");
  });

  it("finds titles even when the search omits accents", () => {
    const accentedItem = { ...getCatalog()[0], title: "Coração de Aço" };
    const results = searchCatalog({ query: "coracao" }, new Set(), [accentedItem]);

    expect(results[0]?.title).toBe("Coração de Aço");
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
});
