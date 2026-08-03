import { describe, expect, it } from "vitest";
import { mockCatalog } from "../data/mockCatalog";
import type { ContentItem } from "../types/catalog";
import { isMusicChannel } from "./musicService";

function channel(title: string, categories: string[]): ContentItem {
  return { ...mockCatalog.find((item) => item.type === "channel")!, id: title, title, categories };
}

describe("musicService", () => {
  it("classifies music and radio categories", () => {
    expect(isMusicChannel(channel("Hits", ["TV ao vivo", "Musica"]))).toBe(true);
    expect(isMusicChannel(channel("Radio Rock", ["Radio"]))).toBe(true);
  });

  it("keeps regular channels in live TV", () => {
    expect(isMusicChannel(channel("News 24", ["Noticias"]))).toBe(false);
  });
});
