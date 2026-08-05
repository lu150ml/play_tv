import { expect, test, type Page } from "@playwright/test";

let seriesInfoRequests = 0;

test.beforeEach(async ({ page }) => {
  seriesInfoRequests = 0;
  await page.route("**/api/xtream", async (route) => {
    const payload = route.request().postDataJSON() as { action?: string };
    const action = payload.action;
    if (action === "get_series_info") seriesInfoRequests += 1;

    if (!action) {
      await route.fulfill({
        json: {
          user_info: { auth: 1, status: "Active" },
          server_info: { url: "xtream.test", port: "80", server_protocol: "http" }
        }
      });
      return;
    }

    const payloads: Record<string, unknown> = {
      get_live_categories: [{ category_id: "1", category_name: "News" }],
      get_vod_categories: [{ category_id: "2", category_name: "Movies" }],
      get_series_categories: [{ category_id: "3", category_name: "Series" }],
      get_live_streams: [
        {
          stream_id: 10,
          name: "World News HD",
          category_id: "1",
          stream_icon: "",
          added: 1717200000,
          num: 10
        }
      ],
      get_vod_streams: [
        {
          stream_id: 20,
          name: "Server Movie 4K",
          category_id: "2",
          stream_icon: "",
          added: 1717200000,
          container_extension: "mp4",
          duration_secs: 5400
        }
      ],
      get_series: [
        {
          series_id: 30,
          name: "Server Series",
          category_id: "3",
          cover: "",
          last_modified: 1717200000
        }
      ],
      get_series_info: {
        episodes: {
          "1": [
            {
              id: 3001,
              episode_num: 1,
              title: "Pilot",
              container_extension: "mp4",
              info: {
                duration_secs: 1800,
                plot: "The first episode returned by the Xtream server."
              }
            },
            {
              id: 3002,
              episode_num: 2,
              title: "Second Signal",
              container_extension: "mp4",
              info: {
                duration_secs: 1800,
                plot: "The second episode returned by the Xtream server."
              }
            },
            ...Array.from({ length: 217 }, (_, index) => ({
              id: 3100 + index,
              episode_num: index + 3,
              title: `Episode ${index + 3}`,
              container_extension: "mp4",
              info: { duration_secs: 1800, plot: "Synthetic scale test episode." }
            }))
          ],
          "2": [
            {
              id: 3003,
              episode_num: 1,
              title: "Second Season Premiere",
              container_extension: "mp4",
              info: {
                duration_secs: 1800,
                plot: "The first episode from the second season."
              }
            }
          ]
        }
      }
    };

    await route.fulfill({ json: payloads[action] ?? [] });
  });
});

async function connectToCatalog(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[placeholder="http://host:port"]').fill("http://xtream.test");
  await page.locator('input[placeholder="Seu usuário Xtream"]').fill("demo-user");
  await page.locator('input[placeholder="Sua senha"]').fill("demo-pass");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: "Criar perfil" }).click();
  await page.locator('input[placeholder="Ex: Kaworu"]').fill("Teste");
  await page.getByRole("button", { name: "Criar e entrar" }).click();
  await expect(page).toHaveURL(/\/catalog$/);
}

async function expectSeriesPlayerFocused(page: Page) {
  const player = page.getByTestId("player-shell");
  await expect(player).toBeInViewport();
  await expect(player).toBeFocused();
}

test("connects to catalog and opens a title", async ({ page }) => {
  await connectToCatalog(page);

  await expect(page.getByText("Catálogo conectado")).toBeVisible();
  await expect(page.getByText("3 itens carregados")).toBeVisible();
  await page.getByRole("link", { name: "Server Movie 4K movie" }).first().click();
  await expect(page.getByText("Now Playing")).toBeVisible();
});

test("uses connected Xtream catalog on dedicated navigation pages", async ({ page }) => {
  await connectToCatalog(page);
  await expect(page.getByText("Catálogo conectado")).toBeVisible();

  await page.getByRole("link", { name: "Filmes", exact: true }).first().click();

  await expect(page.getByText("Catálogo conectado")).toBeVisible();
  await expect(page.getByText("Server Movie 4K").first()).toBeVisible();
  await expect(page.getByText("Neon Genesis: The Awakening").first()).not.toBeVisible();
});

test("reloads Xtream series episodes from remembered server connection", async ({ page }) => {
  await connectToCatalog(page);
  await page.getByRole("link", { name: "Server Series series" }).first().click();

  await expect(page.getByText("Pilot")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByText("Pilot")).toBeVisible();
  await expect(page.getByText("Volte ao login")).not.toBeVisible();
});

test("filters catalog results", async ({ page }) => {
  await page.goto("/catalog?search=open", { waitUntil: "domcontentloaded" });
  await page.locator('input[aria-label="Search catalog"]').fill("sports");

  await expect(page.getByRole("heading", { name: "Resultados da busca" })).toBeVisible();
  await expect(page.getByText("Sports Grid").first()).toBeVisible();
  await expect(page.getByText("Machine Heart").first()).not.toBeVisible();
});

test("keeps search state isolated between catalog screens", async ({ page }) => {
  await connectToCatalog(page);
  await page.getByRole("link", { name: "Buscar", exact: true }).first().click();
  await page.locator('input[aria-label="Search catalog"]').fill("world");
  await expect(page.getByText("World News HD").first()).toBeVisible();

  await page.getByRole("link", { name: "Filmes", exact: true }).first().click();
  await expect(page.locator('input[aria-label="Search catalog"]')).not.toBeVisible();
  await expect(page.getByText("Server Movie 4K").first()).toBeVisible();

  await page.getByRole("link", { name: "Buscar", exact: true }).first().click();
  await expect(page.locator('input[aria-label="Search catalog"]')).toHaveValue("world");
});

test("shows the installed version and updater availability in the footer", async ({ page }) => {
  await page.goto("/catalog", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Versao 0\.4\.0/)).toBeVisible();
  await expect(page.getByText(/Atualizacao automatica indisponivel/)).toBeVisible();
});

test("personalizes hero and recommendations from watch history", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "server-xtreme-library",
      JSON.stringify({
        state: {
          playback: {
            "neon-genesis-awakening": {
              contentId: "neon-genesis-awakening",
              positionSeconds: 1800,
              durationSeconds: 8100,
              updatedAt: new Date().toISOString()
            }
          },
          favorites: [],
          sessionName: "Editor Pro"
        },
        version: 0
      })
    );
  });

  await page.goto("/catalog", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("link", { name: "Abrir Machine Heart" })).toBeVisible();
  const recommendations = page
    .locator("section")
    .filter({ hasText: "Baseado no que você assiste" });
  await expect(recommendations).toBeVisible();
  await expect(recommendations.getByRole("link")).toHaveCount(5);
  await expect(recommendations.getByText("Machine Heart")).not.toBeVisible();
});

test("opens the clickable catalog hero using card routing rules", async ({ page }) => {
  await page.goto("/catalog", { waitUntil: "domcontentloaded" });

  await page.getByRole("link", { name: "Abrir Neon Genesis: The Awakening" }).click();

  await expect(page).toHaveURL(/\/watch\/neon-genesis-awakening$/);

  await page.addInitScript(() => {
    window.localStorage.setItem(
      "server-xtreme-library",
      JSON.stringify({
        state: {
          playback: {
            "neon-genesis-awakening": {
              contentId: "neon-genesis-awakening",
              positionSeconds: 1800,
              durationSeconds: 8100,
              updatedAt: new Date().toISOString()
            }
          },
          favorites: [],
          sessionName: "Editor Pro"
        },
        version: 0
      })
    );
  });

  await page.goto("/catalog");
  await page.getByRole("link", { name: "Abrir Machine Heart" }).click();

  await expect(page).toHaveURL(/\/watch\/machine-heart\/machine-heart-s1e1$/);

  await page.goto("/catalog/tv", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Abrir Cine Max Live" }).click();

  await expect(page).toHaveURL(/\/watch\/cine-max-live$/);
});

test("navigates catalog by content type shortcuts", async ({ page }) => {
  await page.goto("/catalog/movies", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/catalog\/movies$/);
  await expect(page.getByRole("link", { name: "Filmes", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(page.getByText("Orbital Decay").first()).toBeVisible();
  await expect(page.getByText("Sports Grid").first()).not.toBeVisible();

  await page.getByRole("link", { name: "TV", exact: true }).click();

  await expect(page).toHaveURL(/\/catalog\/tv$/);
  await expect(page.getByRole("link", { name: "TV", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(page.getByText("Sports Grid").first()).toBeVisible();
});

test("opens a dedicated category page from view all", async ({ page }) => {
  await page.goto("/catalog/series", { waitUntil: "domcontentloaded" });

  await page.getByRole("link", { name: "Ver todos" }).first().click();

  await expect(page).toHaveURL(/\/catalog\/series\/.+/);
  await expect(page.getByRole("link", { name: /Voltar para Series/ })).toBeVisible();
});

test("supports keyboard style navigation", async ({ page }) => {
  await page.goto("/catalog", { waitUntil: "domcontentloaded" });

  await page.getByRole("link", { name: "Neon Genesis: The Awakening movie" }).first().focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/watch\//);
});

test("automatically starts the first series episode", async ({ page }) => {
  await connectToCatalog(page);

  const startedAt = Date.now();
  await page.getByRole("link", { name: "Server Series series" }).first().click();

  await expect(page).toHaveURL(/\/watch\/xtream-series-30\/xtream-episode-3001$/, { timeout: 3000 });
  expect(Date.now() - startedAt).toBeLessThan(3000);
  await expect(page.locator("h1").filter({ hasText: "Server Series" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^S1 E1 / })).toHaveAttribute("aria-pressed", "true");
  await expectSeriesPlayerFocused(page);
});

test("shows a bounded series error and retries without a loading loop", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/xtream", async (route) => {
    const payload = route.request().postDataJSON() as { action?: string };
    if (payload.action !== "get_series_info") {
      await route.fallback();
      return;
    }
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 504, body: "Servidor de episodios indisponivel." });
      return;
    }
    await route.fulfill({
      json: {
        episodes: {
          "1": [{ id: 3001, episode_num: 1, title: "Pilot", container_extension: "mp4", info: { duration_secs: 1800 } }]
        }
      }
    });
  });
  await connectToCatalog(page);
  await page.getByRole("link", { name: "Server Series series" }).first().click();
  await expect(page.getByText("Servidor de episodios indisponivel.")).toBeVisible();
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page).toHaveURL(/\/watch\/xtream-series-30\/xtream-episode-3001$/);
  expect(attempts).toBe(2);
});

test("jumps to the next episode from player controls", async ({ page }) => {
  await connectToCatalog(page);

  await page.getByRole("link", { name: "Server Series series" }).first().click();
  await expect(page).toHaveURL(/\/watch\/xtream-series-30\/xtream-episode-3001$/);
  await expect(page.getByRole("button", { name: /^S1 E1 / })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Next episode" }).click();

  await expect(page).toHaveURL(/\/watch\/xtream-series-30\/xtream-episode-3002$/);
  await expect(page.getByRole("button", { name: /^S1 E2 / })).toHaveAttribute("aria-pressed", "true");
  await expectSeriesPlayerFocused(page);
  expect(seriesInfoRequests).toBe(1);
});

test("focuses the player after selecting another series episode", async ({ page }) => {
  await connectToCatalog(page);

  await page.getByRole("link", { name: "Server Series series" }).first().click();
  await expect(page).toHaveURL(/\/watch\/xtream-series-30\/xtream-episode-3001$/);

  await page.getByRole("button", { name: /^S1 E2 / }).click();

  await expect(page).toHaveURL(/\/watch\/xtream-series-30\/xtream-episode-3002$/);
  await expect(page.getByRole("button", { name: /^S1 E2 / })).toHaveAttribute("aria-pressed", "true");
  await expectSeriesPlayerFocused(page);
});

test("shows only current season episodes while watching a series", async ({ page }) => {
  await connectToCatalog(page);

  await page.goto("/watch/xtream-series-30/xtream-episode-3003", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/watch\/xtream-series-30\/xtream-episode-3003$/);
  await expect(page.getByRole("heading", { name: "Temporada 2" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^S2 E1 / })).toBeVisible();
  await expect(page.getByRole("button", { name: /^S1 E1 / })).not.toBeVisible();
});

test("hides player controls after inactivity and shows them on interaction", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event("play", { bubbles: true }));
        return Promise.resolve();
      }
    });
  });
  await page.goto("/watch/neon-genesis-awakening", { waitUntil: "domcontentloaded" });

  const controls = page.getByTestId("player-controls");

  await expect(controls).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Play", exact: true }).click();

  await expect(controls).toHaveCSS("opacity", "0", { timeout: 6500 });

  await page.mouse.move(500, 300);
  await expect(controls).toHaveCSS("opacity", "1");
});

test("preloads video without revealing hidden controls while buffering", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: () => Promise.resolve()
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: () => undefined
    });
  });
  await page.route("http://xtream.test/**", () => new Promise(() => undefined));
  await connectToCatalog(page);
  await page.getByRole("link", { name: "Server Movie 4K movie" }).first().click();

  const video = page.locator("video");
  const controls = page.getByTestId("player-controls");

  await expect(video).toHaveAttribute("preload", "auto");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(controls).toHaveCSS("opacity", "0", { timeout: 6500 });

  await video.evaluate((element) => {
    element.dispatchEvent(new Event("waiting", { bubbles: true }));
  });

  await expect(page.getByTestId("buffering-indicator")).toContainText("Carregando buffer");
  await expect(controls).toHaveCSS("opacity", "0");

  await video.evaluate((element) => {
    element.dispatchEvent(new Event("playing", { bubbles: true }));
  });

  await expect(page.getByTestId("buffering-indicator")).not.toBeVisible();
});

test("never shows the buffering banner for live TV", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: () => Promise.resolve()
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: () => undefined
    });
  });
  await connectToCatalog(page);
  await page.getByRole("link", { name: "World News HD channel" }).first().click();
  await page
    .locator("video")
    .evaluate((element) => element.dispatchEvent(new Event("waiting", { bubbles: true })));
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("buffering-indicator")).toHaveCount(0);
});

test("shows saved movie progress but not live tv progress", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "server-xtreme-library",
      JSON.stringify({
        state: {
          playback: {
            "neon-genesis-awakening": {
              contentId: "neon-genesis-awakening",
              positionSeconds: 1200,
              durationSeconds: 8100,
              updatedAt: new Date().toISOString()
            },
            "sports-grid": {
              contentId: "sports-grid",
              positionSeconds: 1200,
              durationSeconds: 7200,
              updatedAt: new Date().toISOString()
            }
          },
          favorites: [],
          sessionName: "Editor Pro"
        },
        version: 0
      })
    );
  });

  await page.goto("/catalog", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("1h 55min restantes").first()).toBeVisible();
  const sportsCards = page.getByRole("link", { name: "Sports Grid channel" });
  const sportsCardCount = await sportsCards.count();
  expect(sportsCardCount).toBeGreaterThanOrEqual(3);
  await Promise.all(
    Array.from({ length: sportsCardCount }, (_value, index) =>
      expect(sportsCards.nth(index)).not.toContainText("restantes")
    )
  );
});
