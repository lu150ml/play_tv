import { beforeEach, describe, expect, it } from "vitest";

import { credentialVault } from "./credentialVault";
import { platformStorage } from "./storageAdapter";

describe("web platform adapters", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores and clears remembered credentials on the web", async () => {
    const connection = {
      serverUrl: "https://iptv.example",
      username: "viewer",
      password: "private"
    };

    await credentialVault.save(connection);
    await expect(credentialVault.load()).resolves.toEqual(connection);
    await credentialVault.clear();
    await expect(credentialVault.load()).resolves.toBeUndefined();
  });

  it("implements the Zustand storage contract", async () => {
    await platformStorage.setItem("play-tv-test", "value");
    await expect(Promise.resolve(platformStorage.getItem("play-tv-test"))).resolves.toBe("value");
    await platformStorage.removeItem("play-tv-test");
    await expect(Promise.resolve(platformStorage.getItem("play-tv-test"))).resolves.toBeNull();
  });
});
