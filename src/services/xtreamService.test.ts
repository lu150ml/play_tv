import { describe, expect, it } from "vitest";

import { buildXtreamRequestUrl } from "./xtreamService";

const credentials = {
  serverUrl: "http://iptv.example:8080",
  username: "demo user",
  password: "secret&value"
};

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
});
