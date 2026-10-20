const lab = window.testLab;
const $ = (id) => document.getElementById(id);
const LABELS = { passed: "passou", failed: "falhou", running: "rodando…", skipped: "pulado", cancelled: "cancelado", pending: "na fila" };
const GROUPS = { rapido: "Rápidos", e2e: "App de verdade (E2E)", real: "Servidor real" };
const PREFS_KEY = "test-lab-prefs";

const state = { suites: [], history: [], run: undefined, viewing: undefined, tab: 0, running: false, creds: {} };

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) ?? {}; } catch { return {}; }
}
function savePrefs() {
  const selected = state.suites.filter((suite) => $(`chk-${suite.id}`)?.checked).map((suite) => suite.id);
  // A senha nunca e salva; so fica em memoria enquanto a janela esta aberta.
  const creds = Object.fromEntries(Object.entries(state.creds).filter(([key]) => !key.includes("PASSWORD")));
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ selected, creds, build: $("opt-build").checked, bail: $("opt-bail").checked })); } catch { /* sem storage */ }
}

function escapeHtml(text) {
  return text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);
}
function colorize(text) {
  return escapeHtml(text).replace(/^.*(?:✖|✗|FAIL|Error|failed|AssertionError).*$/gm, '<span class="fail">$&</span>')
    .replace(/^.*(?:✔|✓| PASS ).*$/gm, '<span class="pass">$&</span>');
}
function seconds(ms) { return `${(ms / 1000).toFixed(1)}s`; }
function timeAgo(iso) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function options() {
  return { build: $("opt-build").checked, stopOnFailure: $("opt-bail").checked, env: { ...state.creds } };
}

function renderSuites() {
  const prefs = loadPrefs();
  const groups = {};
  for (const suite of state.suites) (groups[suite.group] ??= []).push(suite);
  $("suites").innerHTML = "";
  for (const [group, list] of Object.entries(groups)) {
    const title = document.createElement("div");
    title.className = "group-title";
    title.innerHTML = `<span>${GROUPS[group] ?? group}</span><button data-group="${group}">rodar grupo</button>`;
    title.querySelector("button").onclick = () => start(list.map((suite) => suite.id));
    $("suites").append(title);
    for (const suite of list) {
      const row = document.createElement("div");
      row.className = "suite";
      row.dataset.id = suite.id;
      const checked = prefs.selected ? prefs.selected.includes(suite.id) : suite.group !== "real";
      row.innerHTML = `
        <input type="checkbox" id="chk-${suite.id}" ${checked ? "checked" : ""}>
        <span class="name">${escapeHtml(suite.name)}</span>
        <span class="status" id="st-${suite.id}">—</span>
        <span class="desc">${escapeHtml(suite.description)}</span>`;
      if (suite.requires) {
        const creds = document.createElement("div");
        creds.className = "creds";
        creds.id = `creds-${suite.id}`;
        for (const field of suite.requires) {
          const input = document.createElement("input");
          input.type = field.secret ? "password" : "text";
          input.placeholder = field.placeholder ?? field.label;
          input.title = field.label;
          input.value = (field.secret ? "" : prefs.creds?.[field.env]) ?? "";
          state.creds[field.env] = input.value;
          input.oninput = () => { state.creds[field.env] = input.value; savePrefs(); };
          input.onclick = (event) => event.stopPropagation();
          creds.append(input);
        }
        const hint = document.createElement("span");
        hint.className = "hint";
        hint.textContent = "A senha não é salva. Fica só na memória desta janela.";
        creds.append(hint);
        row.append(creds);
      }
      const checkbox = row.querySelector("input[type=checkbox]");
      checkbox.onclick = (event) => event.stopPropagation();
      checkbox.onchange = () => { toggleCreds(suite); savePrefs(); };
      row.onclick = () => focusSuite(suite.id);
      $("suites").append(row);
      toggleCreds(suite);
    }
  }
  $("opt-build").checked = prefs.build ?? true;
  $("opt-bail").checked = prefs.bail ?? false;
}

function toggleCreds(suite) {
  $(`creds-${suite.id}`)?.classList.toggle("show", $(`chk-${suite.id}`).checked);
}

function focusSuite(id) {
  const run = state.viewing;
  const index = run?.results.findIndex((result) => result.id === id) ?? -1;
  if (index >= 0) { state.tab = index; renderLog(); }
}

function renderStatuses(run) {
  for (const suite of state.suites) {
    const element = $(`st-${suite.id}`);
    const result = run?.results.find((entry) => entry.id === suite.id);
    element.className = `status ${result?.status ?? ""}`;
    if (!result) { element.textContent = "—"; continue; }
    const counts = result.summary ? `${result.summary.passed}✓${result.summary.failed ? ` ${result.summary.failed}✗` : ""} · ` : "";
    element.textContent = result.status === "running" || result.status === "pending" || result.status === "skipped"
      ? LABELS[result.status]
      : `${counts}${seconds(result.durationMs)}`;
  }
  document.querySelectorAll(".suite").forEach((row) => {
    row.classList.toggle("selected", run?.results[state.tab]?.id === row.dataset.id);
  });
  const done = run ? run.results.filter((result) => !["pending", "running"].includes(result.status)).length : 0;
  $("progress").style.width = run && state.running ? `${(done / run.results.length) * 100}%` : "0";
  $("btn-failed").disabled = state.running || !run?.results.some((result) => result.status === "failed" && result.id !== "build");
}

function renderTabs() {
  const run = state.viewing;
  $("tabs").innerHTML = "";
  if (!run) return;
  run.results.forEach((result, index) => {
    const tab = document.createElement("div");
    tab.className = `tab ${index === state.tab ? "active" : ""}`;
    tab.innerHTML = `<span class="dot ${result.status}"></span>${escapeHtml(result.name)}`;
    tab.onclick = () => { state.tab = index; renderLog(); };
    $("tabs").append(tab);
  });
}

function renderLog() {
  const run = state.viewing;
  renderTabs();
  renderStatuses(run);
  if (!run) return;
  const result = run.results[state.tab];
  $("output").innerHTML = result?.output ? colorize(result.output) : `<div class="empty">${result ? LABELS[result.status] : ""}</div>`;
  $("output").scrollTop = $("output").scrollHeight;
  const label = state.running && run === state.run ? "Rodando" : run.status === "passed" ? "Tudo passou" : run.status === "failed" ? "Falhou" : run.status === "cancelled" ? "Cancelado" : "Rodando";
  $("run-title").textContent = label;
  const failed = run.results.filter((entry) => entry.status === "failed").length;
  $("run-meta").textContent = `${timeAgo(run.id)} · ${run.results.length} etapas${failed ? ` · ${failed} com falha` : ""}${run.finishedAt ? ` · ${seconds(run.finishedAt - run.startedAt)}` : ""}`;
  renderArtifacts(result);
  $("btn-report").disabled = !run.reportPath;
  $("btn-copy").disabled = !result?.output;
}

// Print da tela e console do app salvos pelo teste E2E que falhou.
function renderArtifacts(result) {
  const box = $("artifacts");
  const artifacts = result?.artifacts ?? [];
  box.innerHTML = "";
  box.classList.toggle("show", artifacts.length > 0);
  if (artifacts.length === 0) return;
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "Capturado na falha:";
  box.append(label);
  for (const { type, file } of artifacts) {
    const item = document.createElement("div");
    item.className = "artifact";
    const name = file.split(/[\\/]/).slice(-2, -1)[0] ?? file;
    if (type === "screenshot") {
      const image = document.createElement("img");
      image.alt = "Print da tela na falha";
      image.title = "Abrir print";
      image.onclick = () => void lab.openReport(file);
      void lab.readImage(file).then((src) => { if (src) image.src = src; else image.alt = "Print não encontrado"; });
      item.append(image);
    } else {
      const button = document.createElement("button");
      button.textContent = "Abrir console do app";
      button.onclick = () => void lab.openReport(file);
      item.append(button);
    }
    const caption = document.createElement("span");
    caption.textContent = name;
    caption.title = file;
    item.append(caption);
    box.append(item);
  }
}

function renderHistory() {
  $("history").innerHTML = state.history.length ? "" : '<div class="desc" style="color:var(--muted);font-size:12px;padding:4px 8px">Sem execuções.</div>';
  for (const run of state.history) {
    const item = document.createElement("div");
    item.className = `run-item ${state.viewing?.id === run.id ? "active" : ""}`;
    const failed = run.results.filter((result) => result.status === "failed").map((result) => result.name);
    item.innerHTML = `<span class="dot ${run.status}"></span><span>${failed.length ? escapeHtml(failed.join(", ")) : `${run.results.length} etapas ok`}</span><span class="when">${timeAgo(run.id)}</span>`;
    item.onclick = () => {
      if (state.running) return;
      state.viewing = run;
      state.tab = Math.max(0, run.results.findIndex((result) => result.status === "failed"));
      renderLog();
      renderHistory();
    };
    $("history").append(item);
  }
}

function setRunning(running) {
  state.running = running;
  for (const id of ["btn-run", "btn-all"]) $(id).disabled = running;
  $("btn-stop").disabled = !running;
  document.querySelectorAll(".group-title button[data-group]").forEach((button) => { button.disabled = running; });
}

function start(ids) {
  if (state.running || ids.length === 0) return;
  setRunning(true);
  void lab.run(ids, options());
}

lab.onRunStart((run) => {
  state.run = run;
  state.viewing = run;
  state.tab = 0;
  setRunning(true);
  renderLog();
  renderHistory();
});
lab.onStep(({ index, result }) => {
  if (!state.run) return;
  state.run.results[index] = { ...result };
  if (result.status === "running") state.tab = index;
  if (state.viewing === state.run) renderLog();
});
lab.onOutput(({ index, chunk }) => {
  const result = state.run?.results[index];
  if (!result) return;
  result.output += chunk;
  if (state.viewing === state.run && state.tab === index) {
    const output = $("output");
    const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 40;
    if (output.querySelector(".empty")) output.innerHTML = "";
    output.insertAdjacentHTML("beforeend", colorize(chunk));
    if (atBottom) output.scrollTop = output.scrollHeight;
  }
});
lab.onRunEnd(({ run, history }) => {
  setRunning(false);
  state.history = history;
  state.run = run;
  state.viewing = run;
  const failedIndex = run.results.findIndex((result) => result.status === "failed");
  if (failedIndex >= 0) state.tab = failedIndex;
  $("banner").classList.remove("show");
  renderLog();
  renderHistory();
});
lab.onWatchTrigger((file) => {
  $("banner").textContent = `Arquivo alterado: ${file} — rodando testes rápidos…`;
  $("banner").classList.add("show");
});
lab.onError((message) => {
  setRunning(false);
  $("banner").textContent = message;
  $("banner").classList.add("show");
});

$("btn-run").onclick = () => start(state.suites.filter((suite) => $(`chk-${suite.id}`).checked).map((suite) => suite.id));
$("btn-all").onclick = () => start(state.suites.map((suite) => suite.id));
$("btn-failed").onclick = () => start(state.viewing.results.filter((result) => result.status === "failed").map((result) => result.id));
$("btn-stop").onclick = () => void lab.cancel();
$("btn-report").onclick = () => state.viewing?.reportPath && void lab.openReport(state.viewing.reportPath);
$("btn-copy").onclick = () => void navigator.clipboard.writeText(state.viewing?.results[state.tab]?.output ?? "");
$("btn-clear").onclick = async () => { state.history = await lab.clearHistory(); renderHistory(); };
$("opt-build").onchange = savePrefs;
$("opt-bail").onchange = savePrefs;
$("opt-watch").onchange = () => void lab.watch($("opt-watch").checked, options());

lab.init().then((data) => {
  state.suites = data.suites;
  state.history = data.history;
  renderSuites();
  if (state.history[0]) {
    state.viewing = state.history[0];
    state.tab = Math.max(0, state.viewing.results.findIndex((result) => result.status === "failed"));
    renderLog();
  }
  renderHistory();
});
