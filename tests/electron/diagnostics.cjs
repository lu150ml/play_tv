// Diagnostico dos testes E2E: guarda o console das janelas do app e a saida do
// processo principal do Electron; quando um teste falha, salva um print da tela
// e o log em test-reports/e2e-failures/ e avisa o Test Lab pela saida.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const FAILURE_DIR = path.join(ROOT, "test-reports", "e2e-failures");
const MAX_LINES = 2000;
// Linha que o Test Lab reconhece para listar os arquivos da falha.
const ARTIFACT_MARKER = "@@lab-artifact";

function slug(text) {
  return String(text)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function attachDiagnostics(application) {
  const lines = [];
  const startedAt = Date.now();
  const push = (source, text) => {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1).padStart(6);
    for (const line of String(text).split(/\r?\n/)) {
      if (line.trim()) lines.push(`[${elapsed}s] [${source}] ${line}`);
    }
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  };

  const watchPage = (page) => {
    page.on("console", (message) => push(`console.${message.type()}`, message.text()));
    page.on("pageerror", (error) => push("pageerror", error.stack || error.message));
    page.on("requestfailed", (request) => {
      if (!request.url().startsWith("data:")) push("requestfailed", `${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });
    page.on("crash", () => push("crash", "A janela do app travou (renderer crash)."));
  };
  for (const page of application.windows()) watchPage(page);
  application.on("window", watchPage);

  const child = application.process();
  child.stdout?.on("data", (data) => push("main", data.toString()));
  child.stderr?.on("data", (data) => push("main.stderr", data.toString()));

  return {
    lines,
    // Salva print + log da falha. Nunca lanca: o erro original do teste e o que importa.
    async capture(testName, error) {
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const directory = path.join(FAILURE_DIR, `${stamp}-${slug(testName)}`);
        fs.mkdirSync(directory, { recursive: true });
        const page = application.windows().find((candidate) => !candidate.isClosed());
        let url = "(sem janela aberta)";
        if (page) {
          url = page.url();
          const screenshot = path.join(directory, "tela.png");
          await page.screenshot({ path: screenshot, timeout: 5000 })
            .then(() => process.stdout.write(`${ARTIFACT_MARKER} screenshot ${screenshot}\n`))
            .catch((screenshotError) => push("diagnostico", `Print falhou: ${screenshotError.message}`));
        }
        const log = path.join(directory, "console.log");
        fs.writeFileSync(log, [
          `Teste: ${testName}`,
          `Tela: ${url}`,
          `Erro: ${error instanceof Error ? error.stack || error.message : String(error)}`,
          "",
          "--- console do app e processo principal ---",
          ...lines
        ].join("\n"));
        process.stdout.write(`${ARTIFACT_MARKER} log ${log}\n`);
        const errors = lines.filter((line) => /\[(console\.error|pageerror|crash|main\.stderr|requestfailed)\]/.test(line));
        if (errors.length > 0) {
          process.stdout.write(`\n--- ultimos erros do app (${errors.length}) ---\n${errors.slice(-20).join("\n")}\n`);
        }
      } catch (captureError) {
        process.stdout.write(`Nao foi possivel salvar o diagnostico: ${captureError.message}\n`);
      }
    }
  };
}

// Envolve o corpo de um teste do node:test: se falhar, captura e relanca.
function withDiagnostics(getDiagnostics, fn) {
  return async (t) => {
    try {
      await fn(t);
    } catch (error) {
      await getDiagnostics()?.capture(t.fullName ?? t.name, error);
      throw error;
    }
  };
}

module.exports = { attachDiagnostics, withDiagnostics, ARTIFACT_MARKER };
