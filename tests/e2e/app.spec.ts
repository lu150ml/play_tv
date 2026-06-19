import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/xtream?**", async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get("action");

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
            }
          ]
        }
      }
    };

    await route.fulfill({ json: payloads[action] ?? [] });
  });
});

test("connects to catalog and opens a title", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[placeholder="http://host:port"]').fill("http://xtream.test");
  await page.locator('input[placeholder="Your Xtream username"]').fill("demo-user");
  await page.locator('input[placeholder="Your Xtream password"]').fill("demo-pass");
  await page.getByRole("button", { name: "Connect" }).click();

  await expect(page.getByText("Xtream server catalog")).toBeVisible();
  await expect(page.getByText("3 items loaded")).toBeVisible();
  await page.getByRole("link", { name: "Server Movie 4K movie" }).first().click();
  await expect(page.getByText("Now Playing")).toBeVisible();
});

test("uses connected Xtream catalog on dedicated navigation pages", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[placeholder="http://host:port"]').fill("http://xtream.test");
  await page.locator('input[placeholder="Your Xtream username"]').fill("demo-user");
  await page.locator('input[placeholder="Your Xtream password"]').fill("demo-pass");
  await page.getByRole("button", { name: "Connect" }).click();

  await page.goto("/catalog/movies");

  await expect(page.getByText("Xtream server catalog")).toBeVisible();
  await expect(page.getByText("Server Movie 4K").first()).toBeVisible();
  await expect(page.getByText("Neon Genesis: The Awakening").first()).not.toBeVisible();
});

test("reloads Xtream series episodes from remembered server connection", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[placeholder="http://host:port"]').fill("http://xtream.test");
  await page.locator('input[placeholder="Your Xtream username"]').fill("demo-user");
  await page.locator('input[placeholder="Your Xtream password"]').fill("demo-pass");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("link", { name: "Server Series series" }).first().click();

  await expect(page.getByText("Pilot")).toBeVisible();
  await page.reload();

  await expect(page.getByText("Pilot")).toBeVisible();
  await expect(page.getByText("Volte ao login")).not.toBeVisible();
});

test("filters catalog results", async ({ page }) => {
  await page.goto("/catalog?search=open");
  await page.locator('input[aria-label="Search catalog"]').fill("sports");

  await expect(page.getByRole("heading", { name: "Resultados da busca" })).toBeVisible();
  await expect(page.getByText("Sports Grid").first()).toBeVisible();
  await expect(page.getByText("Machine Heart").first()).not.toBeVisible();
});

test("navigates catalog by content type shortcuts", async ({ page }) => {
  await page.goto("/catalog/movies");

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
  await page.goto("/catalog/series");

  await page.getByRole("link", { name: "View all" }).first().click();

  await expect(page).toHaveURL(/\/catalog\/series\/.+/);
  await expect(page.getByRole("link", { name: /Voltar para Series/ })).toBeVisible();
});

test("supports keyboard style navigation", async ({ page }) => {
  await page.goto("/catalog");

  await page.getByRole("link", { name: "Neon Genesis: The Awakening movie" }).first().focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/watch\//);
});

test("loads episodes for an Xtream series", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[placeholder="http://host:port"]').fill("http://xtream.test");
  await page.locator('input[placeholder="Your Xtream username"]').fill("demo-user");
  await page.locator('input[placeholder="Your Xtream password"]').fill("demo-pass");
  await page.getByRole("button", { name: "Connect" }).click();

  await page.getByRole("link", { name: "Server Series series" }).first().click();

  await expect(page.getByRole("heading", { name: "Episodios" })).toBeVisible();
  await expect(page.getByText("S1 E1")).toBeVisible();
  await expect(page.getByText("Pilot")).toBeVisible();
});

test("jumps to the next episode from player controls", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[placeholder="http://host:port"]').fill("http://xtream.test");
  await page.locator('input[placeholder="Your Xtream username"]').fill("demo-user");
  await page.locator('input[placeholder="Your Xtream password"]').fill("demo-pass");
  await page.getByRole("button", { name: "Connect" }).click();

  await page.getByRole("link", { name: "Server Series series" }).first().click();
  await expect(page.getByRole("button", { name: /S1 E1/ })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Next episode" }).click();

  await expect(page.getByRole("button", { name: /S1 E2/ })).toHaveAttribute("aria-pressed", "true");
});

test("hides player controls after inactivity and shows them on interaction", async ({ page }) => {
  await page.route("http://xtream.test/**", () => new Promise(() => undefined));
  await page.goto("/login");
  await page.locator('input[placeholder="http://host:port"]').fill("http://xtream.test");
  await page.locator('input[placeholder="Your Xtream username"]').fill("demo-user");
  await page.locator('input[placeholder="Your Xtream password"]').fill("demo-pass");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("link", { name: "Server Series series" }).first().click();

  const controls = page.getByTestId("player-controls");
  const video = page.locator("video");

  await video.evaluate((element) => {
    Object.defineProperty(element, "play", {
      configurable: true,
      value: () => Promise.resolve()
    });
  });
  await expect(controls).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Play", exact: true }).click();

  await expect(controls).toHaveCSS("opacity", "0", { timeout: 6500 });

  await page.mouse.move(500, 300);
  await expect(controls).toHaveCSS("opacity", "1");
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

  await page.goto("/catalog");

  await expect(page.getByText("1h 55min restantes").first()).toBeVisible();
  const sportsCards = page.getByRole("link", { name: "Sports Grid channel" });
  await expect(sportsCards).toHaveCount(3);
  await Promise.all(
    [0, 1, 2].map((index) => expect(sportsCards.nth(index)).not.toContainText("restantes"))
  );
});
