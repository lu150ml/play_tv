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

test("filters catalog results", async ({ page }) => {
  await page.goto("/catalog");
  await page.locator('input[aria-label="Search catalog"]').fill("sports");

  await expect(page.getByRole("heading", { name: "All Results" })).toBeVisible();
  await expect(page.getByText("Sports Grid").first()).toBeVisible();
  await expect(page.getByText("Machine Heart").first()).not.toBeVisible();
});

test("navigates catalog by content type shortcuts", async ({ page }) => {
  await page.goto("/catalog?type=movie");

  await expect(page.getByRole("button", { name: /Filmes/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByText("Orbital Decay").first()).toBeVisible();
  await expect(page.getByText("Sports Grid").first()).not.toBeVisible();

  await page.getByRole("link", { name: "TV" }).click();

  await expect(page.getByRole("button", { name: /TV ao vivo/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByText("Sports Grid").first()).toBeVisible();
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
