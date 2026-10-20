// Executa as suites em sequencia e emite eventos de progresso. Usado tanto pela
// janela do Test Lab quanto pela linha de comando (cli.cjs).
const { EventEmitter } = require("node:events");
const { spawn, execFile } = require("node:child_process");
const path = require("node:path");
const { suites, buildStep } = require("./suites.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

function stripAnsi(text) {
  return text.replace(ANSI, "");
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => undefined);
  } else {
    child.kill("SIGTERM");
  }
}

class Runner extends EventEmitter {
  constructor() {
    super();
    this.current = undefined;
    this.cancelled = false;
    this.running = false;
  }

  // ids: suites a rodar. options.env: variaveis extras (ex.: credenciais do
  // teste real, que ficam so em memoria). options.build: compilar antes dos E2E.
  async run(ids, options = {}) {
    if (this.running) throw new Error("Ja existe uma execucao em andamento.");
    this.running = true;
    this.cancelled = false;
    const selected = suites.filter((suite) => ids.includes(suite.id));
    const steps = [];
    if (options.build !== false && selected.some((suite) => suite.needsBuild)) steps.push(buildStep);
    steps.push(...selected);

    const run = {
      id: new Date().toISOString(),
      startedAt: Date.now(),
      results: steps.map((step) => ({ id: step.id, name: step.name, status: "pending", durationMs: 0, output: "" }))
    };
    this.emit("run-start", run);

    for (const [index, step] of steps.entries()) {
      const result = run.results[index];
      if (this.cancelled) {
        result.status = "cancelled";
        this.emit("step", { index, result });
        continue;
      }
      const missing = (step.requires ?? []).filter((field) => !options.env?.[field.env]);
      if (missing.length > 0) {
        result.status = "skipped";
        result.output = `Pulado: preencha ${missing.map((field) => field.label).join(", ")}.`;
        this.emit("step", { index, result });
        continue;
      }
      result.status = "running";
      this.emit("step", { index, result });
      const outcome = await this.exec(step, options.env ?? {}, (chunk) => {
        result.output += chunk;
        this.emit("output", { index, chunk });
      });
      result.durationMs = outcome.durationMs;
      result.exitCode = outcome.code;
      result.status = this.cancelled ? "cancelled" : outcome.code === 0 ? "passed" : "failed";
      result.summary = summarize(result.output);
      result.artifacts = collectArtifacts(result.output);
      this.emit("step", { index, result });
      if (step === buildStep && result.status === "failed") this.cancelled = true;
      if (options.stopOnFailure && result.status === "failed") this.cancelled = true;
    }

    run.finishedAt = Date.now();
    run.status = run.results.some((result) => result.status === "failed")
      ? "failed"
      : run.results.some((result) => result.status === "cancelled")
        ? "cancelled"
        : "passed";
    this.running = false;
    this.current = undefined;
    this.emit("run-end", run);
    return run;
  }

  exec(step, extraEnv, onChunk) {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const child = spawn(step.command, {
        cwd: ROOT,
        shell: true,
        windowsHide: true,
        env: { ...process.env, ...extraEnv, FORCE_COLOR: "0", NO_COLOR: "1", ELECTRON_RUN_AS_NODE: undefined }
      });
      this.current = child;
      onChunk(`> ${step.command}\n`);
      child.stdout.on("data", (data) => onChunk(stripAnsi(data.toString())));
      child.stderr.on("data", (data) => onChunk(stripAnsi(data.toString())));
      child.on("error", (error) => onChunk(`\n${error.message}\n`));
      child.on("close", (code) => resolve({ code: code ?? 1, durationMs: Date.now() - startedAt }));
    });
  }

  cancel() {
    this.cancelled = true;
    killTree(this.current);
  }
}

// Extrai contagens de "pass/fail" das saidas do node:test e do Vitest.
function summarize(output) {
  const nodePass = output.match(/^[iℹ] pass (\d+)/m);
  const nodeFail = output.match(/^[iℹ] fail (\d+)/m);
  if (nodePass) return { passed: Number(nodePass[1]), failed: Number(nodeFail?.[1] ?? 0) };
  const vitest = output.match(/Tests\s+(?:(\d+) failed \| )?(\d+) passed/);
  if (vitest) return { passed: Number(vitest[2]), failed: Number(vitest[1] ?? 0) };
  return undefined;
}

// Prints e logs que os testes E2E salvam ao falhar (ver tests/electron/diagnostics.cjs).
function collectArtifacts(output) {
  return [...output.matchAll(/^@@lab-artifact (screenshot|log) (.+?)\s*$/gm)]
    .map(([, type, file]) => ({ type, file }));
}

module.exports = { Runner, suites, buildStep, ROOT };
