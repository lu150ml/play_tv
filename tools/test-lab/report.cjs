// Gera um relatorio HTML autocontido de uma execucao do Test Lab.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { ROOT } = require("./runner.cjs");

const LABELS = { passed: "Passou", failed: "Falhou", skipped: "Pulado", cancelled: "Cancelado", pending: "Pendente" };

function escape(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

// Os prints entram no proprio HTML (data URI) para o relatorio poder ser
// enviado sozinho; os logs viram link para o arquivo local.
function renderArtifacts(artifacts = []) {
  if (artifacts.length === 0) return "";
  const items = artifacts.map(({ type, file }) => {
    if (type === "screenshot") {
      try {
        const data = fs.readFileSync(file).toString("base64");
        return `<figure><img src="data:image/png;base64,${data}" alt="Print da falha"><figcaption>${escape(path.basename(path.dirname(file)))}</figcaption></figure>`;
      } catch {
        return `<p>Print nao encontrado: ${escape(file)}</p>`;
      }
    }
    return `<p><a href="${escape(pathToFileURL(file).href)}">Console do app: ${escape(path.basename(path.dirname(file)))}</a></p>`;
  }).join("");
  return `<div class="artifacts">${items}</div>`;
}

function renderReport(run) {
  const rows = run.results.map((result) => `
    <details class="${result.status}"${result.status === "failed" ? " open" : ""}>
      <summary><span class="badge">${LABELS[result.status] ?? result.status}</span>
        <b>${escape(result.name)}</b>
        <span class="meta">${result.summary ? `${result.summary.passed} ok / ${result.summary.failed} falhas · ` : ""}${seconds(result.durationMs)}</span>
      </summary>
      ${renderArtifacts(result.artifacts)}
      <pre>${escape(result.output.slice(-60000))}</pre>
    </details>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Play TV X - Relatorio de testes</title>
<style>
body{font:14px system-ui,sans-serif;background:#0f1115;color:#e7e9ee;margin:0;padding:24px;max-width:1100px;margin:auto}
h1{font-size:20px;margin:0 0 4px}.sub{color:#9aa1ad;margin-bottom:20px}
details{border:1px solid #262a33;border-radius:8px;margin:8px 0;background:#161920}
summary{padding:10px 14px;cursor:pointer;display:flex;gap:12px;align-items:center}
.meta{margin-left:auto;color:#9aa1ad;font-variant-numeric:tabular-nums}
.badge{font-size:12px;padding:2px 8px;border-radius:99px;background:#2a2f3a}
.passed .badge{background:#163d2a;color:#5fe39a}.failed .badge{background:#4a1c1c;color:#ff8a8a}
.skipped .badge,.cancelled .badge{background:#3a3320;color:#f1c96b}
.artifacts{padding:12px 14px;border-top:1px solid #262a33;display:flex;flex-wrap:wrap;gap:12px}.artifacts img{max-width:480px;width:100%;border:1px solid #262a33;border-radius:6px}figure{margin:0}figcaption,.artifacts p{color:#9aa1ad;font-size:12px;margin:4px 0}a{color:#7cb8ff}
pre{margin:0;padding:12px 14px;border-top:1px solid #262a33;overflow:auto;max-height:480px;font:12px/1.45 ui-monospace,Consolas,monospace;white-space:pre-wrap}
</style></head><body>
<h1>Play TV X · ${LABELS[run.status] ?? run.status}</h1>
<div class="sub">${new Date(run.startedAt).toLocaleString("pt-BR")} · duracao ${seconds((run.finishedAt ?? Date.now()) - run.startedAt)}</div>
${rows}
</body></html>`;
}

function saveReport(run, directory = path.join(ROOT, "test-reports")) {
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date(run.startedAt).toISOString().replace(/[:.]/g, "-");
  const file = path.join(directory, `test-lab-${stamp}.html`);
  fs.writeFileSync(file, renderReport(run));
  return file;
}

module.exports = { renderReport, saveReport };
