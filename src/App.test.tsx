import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { credentialVault } from "./platform/credentialVault";
import { useLibraryStore } from "./stores/libraryStore";

vi.mock("./components/AppShell", () => ({
  AppShell: () => <Outlet />
}));
vi.mock("./components/UpdatePrompt", () => ({ UpdatePrompt: () => null }));
vi.mock("./pages/CatalogPage", () => ({ CatalogPage: () => <div>Catálogo restaurado</div> }));
vi.mock("./pages/LoginPage", () => ({ LoginPage: () => <div>Tela de login</div> }));
vi.mock("./pages/PlayerPage", () => ({ PlayerPage: () => null }));
vi.mock("./pages/ProfilesPage", () => ({ ProfilesPage: () => <div>Escolher perfil</div> }));
vi.mock("./pages/SeriesPage", () => ({ SeriesPage: () => null }));
vi.mock("./platform/platformInfo", () => ({ isNativeAndroid: () => false }));

describe("restauração da sessão", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useLibraryStore.setState({
      activeProfileId: null,
      connection: undefined,
      profiles: []
    });
  });

  it("abre o catálogo ao reiniciar com credenciais e perfil salvos", async () => {
    useLibraryStore.setState({
      activeProfileId: "profile-1",
      profiles: [
        {
          id: "profile-1",
          name: "Principal",
          avatarColor: "bg-cyan-500",
          createdAt: "2026-08-26T00:00:00.000Z"
        }
      ]
    });
    vi.spyOn(credentialVault, "load").mockResolvedValue({
      serverUrl: "http://example.test:8080",
      username: "saved-user",
      password: "saved-password"
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("Catálogo restaurado")).toBeInTheDocument();
    expect(useLibraryStore.getState().connection?.username).toBe("saved-user");
  });

  it("abre o login quando não há credenciais salvas", async () => {
    vi.spyOn(credentialVault, "load").mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Tela de login")).toBeInTheDocument());
  });
});
