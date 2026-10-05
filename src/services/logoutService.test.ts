import { beforeEach, describe, expect, it, vi } from "vitest";

import { credentialVault } from "../platform/credentialVault";
import { useLibraryStore } from "../stores/libraryStore";
import { logoutSession } from "./logoutService";

describe("logoutSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useLibraryStore.setState({
      catalog: [],
      catalogSource: "mock",
      catalogStatus: "ready",
      connection: undefined,
      sessionName: "Play TV",
      serverUrl: undefined
    });
  });

  it("apaga o cofre e limpa a sessão ativa", async () => {
    const clearVault = vi.spyOn(credentialVault, "clear").mockResolvedValue();
    useLibraryStore.getState().setConnection({
      serverUrl: "http://example.test:8080",
      username: "viewer",
      password: "secret"
    });
    useLibraryStore.getState().setSessionName("Viewer");
    useLibraryStore.getState().setServerUrl("http://example.test:8080");

    await logoutSession();

    expect(clearVault).toHaveBeenCalledOnce();
    expect(useLibraryStore.getState()).toMatchObject({
      catalog: [],
      connection: undefined,
      sessionName: "Play TV",
      serverUrl: undefined
    });
  });

  it("limpa a memória mesmo se o cofre falhar", async () => {
    vi.spyOn(credentialVault, "clear").mockRejectedValue(new Error("vault unavailable"));
    useLibraryStore.getState().setConnection({
      serverUrl: "http://example.test:8080",
      username: "viewer",
      password: "secret"
    });

    await expect(logoutSession()).rejects.toThrow("vault unavailable");
    expect(useLibraryStore.getState().connection).toBeUndefined();
  });
});
