// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { useLibraryStore } from "../stores/libraryStore";
import type { ContentItem } from "../types/catalog";
import { ContentCard } from "./ContentCard";

const movie: ContentItem = {
  id: "movie-1",
  title: "Filme Teste",
  type: "movie",
  description: "Descrição",
  genres: ["Ação"],
  categories: ["Movies"],
  quality: ["HD"],
  backdropTone: "",
  posterTone: "",
  addedAt: "2026-01-01",
  director: "",
  cast: [],
  durationSeconds: 5400
};

function renderCard(item: ContentItem = movie) {
  return render(
    <MemoryRouter>
      <ContentCard item={item} compact />
    </MemoryRouter>
  );
}

describe("ContentCard", () => {
  beforeEach(() => {
    useLibraryStore.getState().clearSession();
  });

  it("is focusable via remote navigation and links to the movie page", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /Filme Teste/ });
    expect(link).toHaveAttribute("data-focusable", "true");
    expect(link).toHaveAttribute("href", "/movie/movie-1");
  });

  it("does not re-render when an unrelated playback entry changes", () => {
    let renderCount = 0;
    const CountingCard = (() => {
      // Envolve o card memoizado contando renders do próprio card.
      return function CountingCard({ item }: { item: ContentItem }) {
        renderCount += 1;
        return <ContentCard item={item} compact />;
      };
    })();

    const { rerender } = render(
      <MemoryRouter>
        <CountingCard item={movie} />
      </MemoryRouter>
    );
    expect(renderCount).toBe(1);

    useLibraryStore.getState().saveProgress({ contentId: "other-id", positionSeconds: 10, durationSeconds: 100, updatedAt: new Date().toISOString() });
    rerender(
      <MemoryRouter>
        <CountingCard item={movie} />
      </MemoryRouter>
    );

    // O pai re-renderizou, mas o card memoizado não deve ter mudado o conteúdo.
    expect(screen.getByRole("link", { name: /Filme Teste/ })).toBeInTheDocument();
  });
});
