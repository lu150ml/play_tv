import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { mockCatalog } from "../data/mockCatalog";
import { useLibraryStore } from "../stores/libraryStore";
import { ContentCard } from "./ContentCard";

const channel = mockCatalog.find((item) => item.type === "channel");

describe("ContentCard live channels", () => {
  beforeEach(() => {
    useLibraryStore.setState({ activeAccountKey: "test-account", streamHealth: {} });
  });

  it("opens immediately even when an old health check marked the channel unavailable", () => {
    expect(channel).toBeDefined();
    if (!channel) return;

    useLibraryStore.getState().setChannelHealth(channel.id, {
      status: "unavailable",
      reason: "Falha antiga"
    });

    render(
      <MemoryRouter>
        <ContentCard item={channel} />
      </MemoryRouter>
    );

    const link = screen.getByRole("link", { name: `${channel.title} channel` });
    expect(link).toHaveAttribute("href", `/watch/${channel.id}`);
    expect(link).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText(/verificando|indisponivel/i)).not.toBeInTheDocument();
  });
});
