import { expect, test, type Page } from "@playwright/test";

const liveCategories = [{ category_id: "10", category_name: "Notícias" }];
const liveStreams = [
  { stream_id: 101, name: "Canal Notícias", category_id: "10", stream_icon: "https://images.test/news.jpg", container_extension: "m3u8" }
];
const movieStreams = [
  { stream_id: 201, name: "Filme Aurora", category_id: "30", stream_icon: "https://images.test/movie.jpg", container_extension: "mp4" }
];
const seriesStreams = [
  { series_id: 301, name: "Série Horizonte", category_id: "40", cover: "https://images.test/series.jpg" }
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
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

test("navegação por setas move o foco entre elementos focusable", async ({ page }) => {
  await enterApp(page);
  // Espera o catálogo renderizar (o foco é reiniciado enquanto os rails montam).
  await page.getByRole("link", { name: /Canal Notícias channel/ }).first().waitFor();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() =>
    page.evaluate(() => document.activeElement?.getAttribute("data-focusable"))
  ).toBe("true");

  // Anda algumas vezes e confirma que o foco continua em elementos navegáveis.
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("ArrowRight");
    const stillFocusable = await page.evaluate(() => document.activeElement?.getAttribute("data-focusable"));
    expect(stillFocusable).toBe("true");
  }
});

test("menu Opções abre por teclado e mostra Buscar atualizações", async ({ page }) => {
  await enterApp(page);
  await page.getByRole("button", { name: "Abrir opções" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu", { name: "Opções" })).toBeVisible();

  const updateItem = page.getByRole("menuitem", { name: /Buscar atualizações|atualizado|Verificando/ });
  await expect(updateItem).toBeVisible();
  await updateItem.focus();
  await page.keyboard.press("Enter");
  // Na web (sem Android nativo) informa que é exclusivo do app.
  await expect(page.getByText(/aplicativo Android/)).toBeVisible();

  await expect(page.getByRole("menuitem", { name: "Trocar perfil" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Trocar conta" })).toBeVisible();
});

test("série: foco, temporadas e episódio navegáveis por controle", async ({ page }) => {
  await enterApp(page);
  await page.goto("/series");
  await page.getByRole("link", { name: /Série Horizonte series/ }).click();
  await expect(page).toHaveURL(/\/series\/xtream-series-301$/);

  // Foco inicial vai para a ação principal (Assistir/Continuar) em modo TV.
  await expect.poll(() =>
    page.evaluate(() => document.activeElement?.getAttribute("data-primary-action"))
  ).toBe("true");

  // Chip de temporada e cards de episódio são alcançáveis por D-pad.
  await expect(page.getByRole("button", { name: "Temporada 1" })).toHaveAttribute("data-focusable", "true");
  const episode = page.getByRole("link", { name: /S1 E1/ });
  await expect(episode).toHaveAttribute("data-focusable", "true");
  await episode.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/watch\/xtream-series-301\/xtream-episode-401$/);
});
