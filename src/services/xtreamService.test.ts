import { afterEach, describe, expect, it, vi } from "vitest";

import { httpClient } from "../platform/httpClient";
import {
  buildXtreamRequestUrl,
  isXtreamAuthenticated,
  loadXtreamCatalog,
  normalizeXtreamCredentials
} from "./xtreamService";

const credentials = {
  serverUrl: "http://iptv.example:8080",
  username: "demo user",
  password: "secret&value"
};

afterEach(() => vi.restoreAllMocks());

describe("buildXtreamRequestUrl", () => {
  it("keeps the browser proxy contract", () => {
    const url = buildXtreamRequestUrl(credentials, "get_series_info", { series_id: "42" });
    const parsed = new URL(url, "http://localhost");

    expect(parsed.pathname).toBe("/api/xtream");
    expect(parsed.searchParams.get("serverUrl")).toBe(credentials.serverUrl);
    expect(parsed.searchParams.get("username")).toBe(credentials.username);
    expect(parsed.searchParams.get("password")).toBe(credentials.password);
    expect(parsed.searchParams.get("action")).toBe("get_series_info");
  });

  it("builds a direct native player_api request", () => {
    const url = new URL(buildXtreamRequestUrl(credentials, "get_live_streams", {}, true));

    expect(url.origin).toBe("http://iptv.example:8080");
    expect(url.pathname).toBe("/player_api.php");
    expect(url.searchParams.get("username")).toBe(credentials.username);
    expect(url.searchParams.get("password")).toBe(credentials.password);
    expect(url.searchParams.get("action")).toBe("get_live_streams");
  });

  it("accepts a host without protocol on Android", () => {
    const url = new URL(
      buildXtreamRequestUrl({ ...credentials, serverUrl: "iptv.example:8080" }, undefined, {}, true)
    );

    expect(url.origin).toBe("http://iptv.example:8080");
    expect(url.pathname).toBe("/player_api.php");
  });

  it("accepts a complete player_api link without duplicating its path", () => {
    const url = new URL(
      buildXtreamRequestUrl(
        { ...credentials, serverUrl: "http://iptv.example:8080/player_api.php?old=1" },
        undefined,
        {},
        true
      )
    );

    expect(url.pathname).toBe("/player_api.php");
    expect(url.searchParams.has("old")).toBe(false);
  });

  it("removes whitespace and invisible clipboard characters around login fields", () => {
    const normalized = normalizeXtreamCredentials({
      serverUrl: "\uFEFF  http://iptv.example:8080/ \r\n",
      username: "\u200B viewer \r\n",
      password: "\u2060 secret-value \u00A0"
    });

    expect(normalized).toEqual({
      serverUrl: "http://iptv.example:8080",
      username: "viewer",
      password: "secret-value"
    });
  });

  it("preserves valid spaces and special characters inside credentials", () => {
    const normalized = normalizeXtreamCredentials(credentials);

    expect(normalized.username).toBe("demo user");
    expect(normalized.password).toBe("secret&value");
  });

  it("extracts credentials when a complete M3U URL is pasted", () => {
    const normalized = normalizeXtreamCredentials({
      serverUrl:
        "http://iptv.example:8080/get.php?username=viewer&password=p%40ss%26word&type=m3u_plus",
      username: "",
      password: ""
    });

    expect(normalized.serverUrl).toBe("http://iptv.example:8080");
    expect(normalized.username).toBe("viewer");
    expect(normalized.password).toBe("p@ss&word");
  });

  it("normalizes a full-width colon copied with the host and port", () => {
    const normalized = normalizeXtreamCredentials({
      ...credentials,
      serverUrl: "iptv.example：8080"
    });

    expect(normalized.serverUrl).toBe("http://iptv.example:8080");
  });

  it.each([
    [{ auth: 1 }, true],
    [{ auth: "1" }, true],
    [{ auth: true }, true],
    [{ auth: "TRUE" }, true],
    [{ status: "Active" }, true],
    [{ auth: 0, status: "Active" }, false],
    [{ auth: "0", status: "Disabled" }, false]
  ])("recognizes Xtream authentication variants %#", (userInfo, expected) => {
    expect(isXtreamAuthenticated(userInfo)).toBe(expected);
  });

  it.each([
    [{ ...credentials, serverUrl: "" }, "endereço"],
    [{ ...credentials, username: " \r\n" }, "usuário"],
    [{ ...credentials, password: "\u200B" }, "senha"]
  ])("rejects incomplete pasted credentials %#", (value, expectedMessage) => {
    expect(() => normalizeXtreamCredentials(value)).toThrow(expectedMessage);
  });
});

describe("loadXtreamCatalog", () => {
  it("keeps movies located after the old per-category cutoff", async () => {
    const movies = Array.from({ length: 605 }, (_, index) => ({
      stream_id: index + 1,
      name: index === 604 ? "Filme depois do limite" : `Filme ${index + 1}`,
      category_id: "2",
      container_extension: "mp4"
    }));

    vi.spyOn(httpClient, "get").mockImplementation((url) => {
      const parsed = new URL(url, "http://localhost");
      const action = parsed.searchParams.get("action");
      const payloads: Record<string, unknown> = {
        profile: { user_info: { auth: 1, status: "Active" } },
        get_live_categories: [],
        get_vod_categories: [{ category_id: "2", category_name: "Filmes" }],
        get_series_categories: [],
        get_live_streams: [],
        get_vod_streams: movies,
        get_series: []
      };

      return Promise.resolve({ data: payloads[action ?? "profile"] as never, status: 200 });
    });

    const result = await loadXtreamCatalog(credentials);

    expect(result.catalog).toHaveLength(605);
    expect(result.catalog.at(-1)?.title).toBe("Filme depois do limite");
  });
});
