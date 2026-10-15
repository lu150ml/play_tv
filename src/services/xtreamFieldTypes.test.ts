import { afterEach, describe, expect, it, vi } from "vitest";

import { asText, loadXtreamMovieDetails, loadXtreamSeriesEpisodes } from "./xtreamService";

// Regressão: painéis Xtream mandam campos de texto como número, lista ou null.
// O app chamava .trim() direto e a tela de detalhes mostrava
// "E.trim is not a function" em filmes e séries.
const credentials = { serverUrl: "https://types.example", username: "viewer", password: "secret" };

function serverReturns(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
  ));
}

afterEach(() => vi.unstubAllGlobals());

describe("asText", () => {
  it.each([
    ["  Drama ", "Drama"],
    [7.5, "7.5"],
    [0, "0"],
    [["", " Nolan "], "Nolan"],
    [[], undefined],
    [null, undefined],
    [undefined, undefined],
    [{}, undefined],
    [Number.NaN, undefined],
    ["   ", undefined]
  ])("asText(%j) -> %j", (input, expected) => {
    expect(asText(input)).toBe(expected);
  });
});

describe("detalhes de filme com campos fora do padrão", () => {
  it("não quebra quando rating, diretor e data vêm como número, lista ou null", async () => {
    serverReturns({
      info: {
        movie_image: ["https://img.example/poster.jpg"],
        cover_big: null,
        backdrop_path: [],
        plot: 12345,
        genre: ["Ação", "Drama"],
        cast: null,
        director: ["Christopher Nolan"],
        releasedate: 2026,
        year: 2026,
        rating: 7.5
      },
      movie_data: { stream_id: 42, container_extension: null, direct_source: [] }
    });

    const details = await loadXtreamMovieDetails(credentials, "42");

    expect(details.rating).toBe("7.5");
    expect(details.director).toBe("Christopher Nolan");
    expect(details.releasedAt).toBe("2026");
    expect(details.description).toBe("12345");
    expect(details.genres).toEqual(["Ação", "Drama"]);
    expect(details.cast).toEqual([]);
    expect(details.imageCandidates).toEqual(["https://img.example/poster.jpg"]);
    expect(details.streamCandidates?.[0]).toMatch(/\/movie\/viewer\/secret\/42\.mp4$/);
  });

  it("aceita info vazio vindo como lista", async () => {
    serverReturns({ info: [], movie_data: { stream_id: "7" } });
    await expect(loadXtreamMovieDetails(credentials, "7")).resolves.toMatchObject({ rating: undefined, director: undefined });
  });
});

describe("episódios com campos fora do padrão", () => {
  it("não quebra quando título e sinopse vêm como número", async () => {
    serverReturns({
      info: {},
      episodes: { "1": [{ id: 5, episode_num: 3, title: 303, container_extension: ["mkv"], info: { plot: null } }] }
    });

    const episodes = await loadXtreamSeriesEpisodes({ ...credentials, serverUrl: "https://types-series.example" }, "s1");

    expect(episodes[0]?.title).toBe("303");
    expect(episodes[0]?.streamUrl).toMatch(/\/series\/viewer\/secret\/5\.mkv$/);
  });
});
