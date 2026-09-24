import { describe, expect, it } from "vitest";
import { isMusicChannel } from "./musicService";
import type { ContentItem } from "../types/catalog";

function channel(title: string, category: string): ContentItem {
  return { id: title, title, type: "channel", description: "", genres: [category], categories: ["Live TV", category], quality: ["HD"], backdropTone: "", posterTone: "", addedAt: "2026-01-01", channelNumber: 1, currentProgram: "", nextProgram: "" };
}

describe("isMusicChannel", () => {
  it("recognizes music categories and brands without moving ordinary TV", () => {
    expect(isMusicChannel(channel("MTV Hits", "Entretenimento"))).toBe(true);
    expect(isMusicChannel(channel("Rádio Cidade", "Rádios"))).toBe(true);
    expect(isMusicChannel(channel("Canal Notícias", "Notícias"))).toBe(false);
  });
});
