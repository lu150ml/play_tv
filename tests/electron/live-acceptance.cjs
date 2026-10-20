const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { attachDiagnostics } = require("./diagnostics.cjs");

async function main() {
  const server = process.env.PLAY_TV_LIVE_SERVER;
  const username = process.env.PLAY_TV_LIVE_USERNAME;
  const password = process.env.PLAY_TV_LIVE_PASSWORD;
  const seriesTitle = process.env.PLAY_TV_LIVE_SERIES;
  assert.ok(server && username && password && seriesTitle, "Live acceptance environment is incomplete.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-live-acceptance-"));
  const application = await electron.launch({
    args: [path.resolve(__dirname, "..", ".."), `--user-data-dir=${profile}`],
    env: { ...process.env, NODE_ENV: "test", PLAY_TV_E2E: "1" }
  });
  const diagnostics = attachDiagnostics(application);
  try {
    const window = await application.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await window.locator('input[placeholder="http://host:port"]').fill(server);
    await window.locator('input[type="text"]').nth(1).fill(username);
    await window.locator('input[placeholder="Sua senha"]').fill(password);
    await window.locator('input[type="checkbox"]').uncheck();
    await window.getByRole("button", { name: "Entrar" }).click();
    await window.waitForURL(/\/(profiles|catalog)$/, { timeout: 120000, waitUntil: "domcontentloaded" });
    if (window.url().endsWith("/profiles")) {
      await window.getByRole("button", { name: "Criar perfil" }).click();
      await window.locator('input[placeholder="Ex: Kaworu"]').fill("Aceitacao");
      await window.getByRole("button", { name: "Criar e entrar" }).click();
    }
    await window.waitForURL(/\/catalog$/, { timeout: 120000, waitUntil: "domcontentloaded" });
    let livePlayback;
    if (process.env.PLAY_TV_TEST_LIVE_HANDOFF === "1") {
      await window.getByRole("link", { name: "TV" }).first().click();
      const channel = window.locator('a[aria-label$=" channel"]').first();
      await channel.waitFor({ state: "visible", timeout: 30000 });
      await channel.click();
      let liveVideo = window.locator("video");
      await liveVideo.waitFor({ state: "attached", timeout: 10000 });
      await liveVideo.evaluate((element) => element.dispatchEvent(new Event("error", { bubbles: true })));
      await window.waitForTimeout(500);
      liveVideo = window.locator("video");
      await liveVideo.evaluate((element) => element.dispatchEvent(new Event("error", { bubbles: true })));
      await window.getByText(/modo compativel/i).waitFor({ state: "visible", timeout: 60000 });
      await liveVideo.evaluate((element) => element.play().catch(() => undefined));
      await window.waitForTimeout(3000);
      livePlayback = await liveVideo.evaluate((element) => ({ currentTime: element.currentTime, readyState: element.readyState }));
    }
    await window.getByRole("link", { name: "Buscar" }).first().click();
    await window.locator('input[aria-label="Search catalog"]').fill(seriesTitle);
    const result = window.locator('a[href*="/series/"]').filter({ hasText: seriesTitle }).first();
    await result.waitFor({ state: "visible", timeout: 30000 });
    const startedAt = Date.now();
    await result.click();
    await window.waitForFunction(() => location.pathname.startsWith("/watch/"), undefined, { timeout: 10000 });
    const elapsedMs = Date.now() - startedAt;
    assert.ok(elapsedMs < 3000, `Series took ${elapsedMs}ms to reach the player.`);
    const video = window.locator("video");
    await video.waitFor({ state: "attached", timeout: 10000 });
    if (process.env.PLAY_TV_FORCE_COMPAT === "1") {
      await video.evaluate((element) => {
        element.pause();
        element.dispatchEvent(new Event("error", { bubbles: true }));
      });
      await window.getByText(/modo compativel/i).waitFor({ state: "visible", timeout: 60000 });
    }
    await video.evaluate((element) => element.play().catch(() => undefined));
    const playbackStartedAt = Date.now();
    await window.waitForFunction(() => {
      const element = document.querySelector("video");
      return Boolean(element && element.currentTime > 0.25 && element.readyState >= 2);
    }, undefined, { timeout: 90000 });
    const playback = await video.evaluate((element) => ({ currentTime: element.currentTime, readyState: element.readyState }));
    process.stdout.write(JSON.stringify({ status: "passed", series: seriesTitle, livePlayback, elapsedMs, playbackMs: Date.now() - playbackStartedAt, ...playback }));
  } catch (error) {
    await diagnostics.capture(`aceitacao-${seriesTitle}`, error);
    throw error;
  } finally {
    await application.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Best effort. */ }
  }
}

main().then(() => process.exit(0), (error) => {
  process.stderr.write(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
