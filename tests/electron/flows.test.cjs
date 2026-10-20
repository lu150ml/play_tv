// Fluxos de uso do Play TV X de ponta a ponta, contra um servidor Xtream falso:
// login, perfil, catalogo, busca, filme, serie e canal ao vivo.
const { describe, before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { startMockXtream } = require("./mock-xtream.cjs");
const { attachDiagnostics, withDiagnostics } = require("./diagnostics.cjs");

const ROOT = path.resolve(__dirname, "..", "..");

async function waitForPlayback(window, label) {
  const video = window.locator("video");
  await video.waitFor({ state: "attached", timeout: 15000 });
  await video.evaluate((element) => element.play().catch(() => undefined));
  try {
    await window.waitForFunction(() => {
      const element = document.querySelector("video");
      return Boolean(element && element.currentTime > 0.25 && element.readyState >= 2);
    }, undefined, { timeout: 45000 });
  } catch (error) {
    const diagnostic = await window.evaluate(() => ({
      path: location.pathname,
      currentTime: document.querySelector("video")?.currentTime,
      readyState: document.querySelector("video")?.readyState,
      text: document.body.innerText.slice(0, 600)
    }));
    throw new Error(`${label} nao reproduziu: ${error.message}\n${JSON.stringify(diagnostic)}`);
  }
  return video.evaluate((element) => ({ currentTime: element.currentTime, muted: element.muted }));
}

async function goHome(window) {
  // Navega pelo menu (como o usuario faria) em vez de recarregar a pagina.
  // O player ocupa a tela toda, sem menu: volta para a pagina anterior.
  if (window.url().includes("/watch/")) await window.goBack({ waitUntil: "domcontentloaded" });
  await window.getByRole("link", { name: "Início", exact: true }).first().click();
  await window.waitForURL(/\/catalog$/, { timeout: 10000 });
}

describe("Play TV X - fluxos com servidor Xtream falso", { timeout: 300000 }, () => {
  let mock;
  let application;
  let window;
  let profile;
  let diagnostics;
  const step = (name, fn) => test(name, withDiagnostics(() => diagnostics, fn));

  before(async () => {
    mock = await startMockXtream();
    profile = fs.mkdtempSync(path.join(os.tmpdir(), "play-tv-flows-"));
    application = await electron.launch({
      args: [ROOT, `--user-data-dir=${profile}`],
      env: { ...process.env, NODE_ENV: "test", PLAY_TV_E2E: "1" }
    });
    diagnostics = attachDiagnostics(application);
    window = await application.firstWindow();
    await window.waitForLoadState("domcontentloaded");
  });

  after(async () => {
    await application?.close().catch(() => undefined);
    await mock?.close();
    if (profile) fs.rmSync(profile, { recursive: true, force: true });
  });

  step("login recusa senha errada e mostra o erro", async () => {
    await window.locator('input[placeholder="http://host:port"]').waitFor({ state: "visible", timeout: 30000 });
    await window.locator('input[placeholder="http://host:port"]').fill(mock.url);
    await window.locator('input[placeholder="Seu usuário Xtream"]').fill(mock.username);
    await window.locator('input[placeholder="Sua senha"]').fill("senha-errada");
    await window.getByRole("button", { name: "Entrar" }).click();
    await window.getByText(/invalidos|rejected/i).first().waitFor({ state: "visible", timeout: 20000 });
    assert.ok(window.url().endsWith("/login"), `esperava continuar no login, esta em ${window.url()}`);
  });

  step("login valido cria perfil e abre o catalogo", async () => {
    await window.locator('input[placeholder="Sua senha"]').fill(mock.password);
    await window.locator('input[type="checkbox"]').uncheck();
    await window.getByRole("button", { name: "Entrar" }).click();
    await window.waitForURL(/\/(profiles|catalog)$/, { timeout: 60000, waitUntil: "domcontentloaded" });
    if (window.url().endsWith("/profiles")) {
      await window.getByRole("button", { name: "Criar perfil" }).click();
      await window.locator('input[placeholder="Ex: Kaworu"]').fill("Test Lab");
      await window.getByRole("button", { name: "Criar e entrar" }).click();
    }
    await window.waitForURL(/\/catalog$/, { timeout: 60000, waitUntil: "domcontentloaded" });
    for (const title of ["Filme Teste Lab", "Serie Teste Lab"]) {
      await window.locator(`a[aria-label^="${title}"]`).first().waitFor({ state: "visible", timeout: 30000 });
    }
  });

  step("abas de Filmes, Series e TV mostram o conteudo certo", async () => {
    const tabs = [
      ["Filmes", /\/catalog\/movies$/, "Filme Teste Lab"],
      ["Séries", /\/catalog\/series$/, "Serie Teste Lab"],
      ["TV", /\/catalog\/tv$/, "Canal Teste Lab"]
    ];
    for (const [tab, url, title] of tabs) {
      await window.getByRole("link", { name: tab, exact: true }).first().click();
      await window.waitForURL(url, { timeout: 10000 });
      await window.locator(`a[aria-label^="${title}"]`).first().waitFor({ state: "visible", timeout: 15000 });
    }
  });

  step("busca encontra o filme, abre detalhes e reproduz", async () => {
    await goHome(window);
    await window.getByRole("link", { name: "Buscar" }).first().click();
    await window.locator('input[aria-label="Search catalog"]').fill("Filme Teste");
    const result = window.locator('a[href*="/movie/"]').filter({ hasText: "Filme Teste Lab" }).first();
    await result.waitFor({ state: "visible", timeout: 15000 });
    await result.click();
    await window.waitForURL(/\/movie\//, { timeout: 10000 });
    await window.getByText("Filme gerado para o Test Lab.").waitFor({ state: "visible", timeout: 15000 });
    await window.getByRole("link", { name: "Assistir" }).first().click();
    const playback = await waitForPlayback(window, "Filme");
    assert.equal(playback.muted, false);
  });

  step("serie lista episodios e reproduz o episodio escolhido", async () => {
    await goHome(window);
    await window.getByRole("link", { name: "Séries", exact: true }).first().click();
    await window.locator('a[aria-label^="Serie Teste Lab"]').first().click();
    await window.waitForURL(/\/series\//, { timeout: 10000 });
    const episode = window.locator('[aria-label="S1 E2 Episodio Dois"]');
    await episode.waitFor({ state: "visible", timeout: 20000 });
    await episode.click();
    await window.waitForURL(/\/watch\//, { timeout: 10000 });
    await waitForPlayback(window, "Episodio");
  });

  step("canal ao vivo reproduz", async () => {
    await goHome(window);
    await window.getByRole("link", { name: "TV", exact: true }).first().click();
    await window.locator('a[aria-label^="Canal Teste Lab"]').first().click();
    await window.waitForURL(/\/watch\//, { timeout: 10000 });
    await waitForPlayback(window, "Canal ao vivo");
  });
});
