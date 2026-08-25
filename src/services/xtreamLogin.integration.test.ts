import { afterEach, describe, expect, it, vi } from "vitest";

import { httpClient } from "../platform/httpClient";
import { loadXtreamCatalog } from "./xtreamService";

const pastedCredentials = {
  serverUrl: " http://iptv.example:8080/get.php?type=m3u_plus \r\n",
  username: "\u200B viewer \r\n",
  password: " secret&value \r\n"
};

function actionFrom(url: string): string | undefined {
  return new URL(url, "http://localhost").searchParams.get("action") ?? undefined;
}

function installWorkingXtreamMock(auth: number | string | boolean = 1) {
  return vi.spyOn(httpClient, "get").mockImplementation(async (url) => {
    await Promise.resolve();
    const parsed = new URL(url, "http://localhost");
    const action = actionFrom(url);
    expect(parsed.searchParams.get("username")).toBe("viewer");
    expect(parsed.searchParams.get("password")).toBe("secret&value");

    if (!action) return { status: 200, data: { user_info: { auth, status: "Active" } } };
    if (action === "get_live_streams") {
      return {
        status: 200,
        data: [{ stream_id: 10, name: "Canal Teste", category_id: 1 }]
      };
    }
    if (action === "get_live_categories") {
      return { status: 200, data: [{ category_id: 1, category_name: "Canais | Teste" }] };
    }
    return { status: 200, data: [] };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Xtream pasted-login integration", () => {
  it.each([1, "1", true, "true"])('logs in when auth is %j', async (auth) => {
    installWorkingXtreamMock(auth);

    const result = await loadXtreamCatalog(pastedCredentials);

    expect(result.catalog).toHaveLength(1);
    expect(result.catalog[0]?.title).toBe("Canal Teste");
  });

  it("keeps logging in when optional VOD and series endpoints fail", async () => {
    const httpSpy = installWorkingXtreamMock();
    httpSpy.mockImplementation(async (url) => {
      await Promise.resolve();
      const action = actionFrom(url);
      if (action === "get_vod_streams" || action === "get_series") {
        throw new Error("timeout");
      }
      if (!action) return { status: 200, data: { user_info: { auth: 1 } } };
      if (action === "get_live_streams") {
        return { status: 200, data: [{ stream_id: 10, name: "Canal Teste" }] };
      }
      return { status: 200, data: [] };
    });

    await expect(loadXtreamCatalog(pastedCredentials)).resolves.toMatchObject({
      catalog: [{ title: "Canal Teste" }]
    });
  });

  it("distinguishes rejected credentials from a network failure", async () => {
    vi.spyOn(httpClient, "get").mockResolvedValue({
      status: 200,
      data: { user_info: { auth: 0, status: "Disabled" } }
    });

    await expect(loadXtreamCatalog(pastedCredentials)).rejects.toThrow(
      "Usuário ou senha recusados"
    );
  });

  it("identifies a URL that is not an Xtream player_api response", async () => {
    vi.spyOn(httpClient, "get").mockResolvedValue({ status: 200, data: "<html>Portal</html>" });

    await expect(loadXtreamCatalog(pastedCredentials)).rejects.toThrow("API Xtream válida");
  });

  it("reports an HTTP authentication refusal without exposing the authenticated URL", async () => {
    vi.spyOn(httpClient, "get").mockResolvedValue({ status: 403, data: "Forbidden" });

    await expect(loadXtreamCatalog(pastedCredentials)).rejects.toThrow(
      "servidor recusou o acesso"
    );
  });
});
