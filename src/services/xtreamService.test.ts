import { describe, expect, it } from "vitest";
import { normalizeCategory } from "./xtreamService";

describe("Xtream category names", () => {
  it("preserves the exact hierarchy supplied by the provider", () => {
    expect(normalizeCategory("CANAIS | ESPN")).toBe("CANAIS | ESPN");
    expect(normalizeCategory(" SÉRIES | NETFLIX ")).toBe("SÉRIES | NETFLIX");
  });
});
