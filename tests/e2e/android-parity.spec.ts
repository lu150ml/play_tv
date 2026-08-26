import { expect, test, type Page } from "@playwright/test";

const liveCategories = [
  { category_id: "10", category_name: "Notícias" },
  { category_id: "20", category_name: "Música" }
];
const liveStreams = [
  { stream_id: 101, name: "Canal Notícias", category_id: "10", stream_icon: "https://images.test/news.jpg", container_extension: "m3u8" },
  { stream_id: 102, name: "MTV Music", category_id: "20", stream_icon: "https://images.test/music.jpg", container_extension: "ts" }
];
const movieStreams = [
  { stream_id: 201, name: "Filme Aurora", category_id: "30", stream_icon: "https://images.test/movie.jpg", container_extension: "mp4" }
];
const seriesStreams = [
  { series_id: 301, name: "Série Horizonte", category_id: "40", cover: "https://images.test/series.jpg" }
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: () => undefined });
  });
  await page.route("**/api/xtream**", async (route) => {
    const action = new URL(route.request().url()).searchParams.get("action");
    const body: unknown = action === "get_live_categories" ? liveCategories
      : action === "get_live_streams" ? liveStreams
      : action === "get_vod_categories" ? [{ category_id: "30", category_name: "Cinema" }]
      : action === "get_vod_streams" ? movieStreams
      : action === "get_series_categories" ? [{ category_id: "40", category_name: "Drama" }]
      : action === "get_series" ? seriesStreams
      : action === "get_series_info" ? {
          info: { name: "Série Horizonte", cover: "https://images.test/series-alt.jpg" },
          episodes: {
            "1": [
              { id: "401", episode_num: 1, title: "Começo", container_extension: "mp4", info: { duration_secs: 1200 } },
              { id: "402", episode_num: 2, title: "Continuação", container_extension: "mp4", info: { duration_secs: 1200 } }
            ]
          }
        }
      : { user_info: { auth: 1, username: "e2e" }, server_info: { url: "xtream.test" } };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("https://images.test/**", (route) => route.fulfill({ status: 404, body: "" }));
});

async function enterApp(page: Page) {
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByPlaceholder("http://host:port").fill("http://xtream.test");
  await page.getByPlaceholder("Seu usuário Xtream").fill("e2e");
  await page.getByPlaceholder("Sua senha Xtream").fill("secret");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await page.getByRole("button", { name: "Criar perfil" }).click();
  await page.getByPlaceholder("Ex: Kaworu").fill("Lu");
  await page.getByRole("button", { name: "Criar e entrar" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("home móvel usa conteúdo real e abre as telas independentes", async ({ page }) => {
  await enterApp(page);
  await expect(page.getByText("TV ao vivo", { exact: true }).first()).toBeVisible();
  await page.goto("/tv");
  await expect(page.getByRole("link", { name: /Canal Notícias channel/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /MTV Music channel/ })).toHaveCount(0);
  await page.goto("/music");
  await expect(page.getByRole("link", { name: /MTV Music channel/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Canal Notícias channel/ })).toHaveCount(0);
});

test("busca e filtros permanecem isolados por tela", async ({ page }) => {
  await enterApp(page);
  await page.goto("/movies");
  await page.getByPlaceholder("Buscar em Filmes").fill("Aurora");
  await page.getByRole("link", { name: "Séries", exact: true }).first().click();
  await expect(page.getByPlaceholder("Buscar em Séries")).toHaveValue("");
  await page.getByPlaceholder("Buscar em Séries").fill("Horizonte");
  await page.getByRole("link", { name: "Filmes", exact: true }).first().click();
  await expect(page.getByPlaceholder("Buscar em Filmes")).toHaveValue("Aurora");
  await page.getByRole("link", { name: "Buscar", exact: true }).first().click();
  await expect(page.getByPlaceholder("Filmes, séries, canais ou categorias")).toHaveValue("");
});

test("série abre o primeiro episódio imediatamente e foca o player", async ({ page }) => {
  await enterApp(page);
  await page.goto("/series");
  await page.getByRole("link", { name: /Série Horizonte series/ }).click();
  await expect(page).toHaveURL(/\/watch\/xtream-series-301\/xtream-episode-401$/);
  const player = page.locator("section[tabindex='-1']").first();
  await expect(player).toBeVisible();
  await expect.poll(() => player.evaluate((element) => document.activeElement === element)).toBe(true);
});

test("TV não mostra spam de buffer e categorias usam o id estável do servidor", async ({ page }) => {
  await enterApp(page);
  await page.goto("/tv");
  await page.getByRole("link", { name: "Notícias", exact: true }).click();
  await expect(page).toHaveURL(/\/tv\/category\/10$/);
  await page.getByRole("link", { name: /Canal Notícias channel/ }).click();
  await expect(page).toHaveURL(/\/watch\/xtream-live-101$/);
  await page.locator("video").dispatchEvent("waiting");
  await expect(page.getByText(/Carregando buffer/i)).toHaveCount(0);
});
