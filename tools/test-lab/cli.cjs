// Test Lab sem janela: `node tools/test-lab/cli.cjs [ids...] [--all] [--no-build] [--bail]`.
// Sem ids roda as suites rapidas + E2E (a de servidor real so roda se as
// variaveis PLAY_TV_LIVE_* estiverem definidas).
const { Runner, suites } = require("./runner.cjs");
const { saveReport } = require("./report.cjs");

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const requested = args.filter((arg) => !arg.startsWith("--"));

if (flags.has("--list")) {
  for (const suite of suites) console.log(`${suite.id.padEnd(10)} ${suite.name} - ${suite.description}`);
  process.exit(0);
}

const unknown = requested.filter((id) => !suites.some((suite) => suite.id === id));
if (unknown.length > 0) {
  console.error(`Suite desconhecida: ${unknown.join(", ")}. Use --list.`);
  process.exit(2);
}

const ids = requested.length > 0
  ? requested
  : suites.filter((suite) => flags.has("--all") || suite.group !== "real").map((suite) => suite.id);

const runner = new Runner();
const icons = { passed: "✔", failed: "✖", skipped: "-", cancelled: "■" };
runner.on("step", ({ result }) => {
  if (result.status === "running") {
    console.log(`\n▶ ${result.name}`);
    return;
  }
  const counts = result.summary ? ` (${result.summary.passed} ok, ${result.summary.failed} falhas)` : "";
  console.log(`${icons[result.status] ?? "?"} ${result.name}${counts} ${(result.durationMs / 1000).toFixed(1)}s`);
  if (result.status === "failed" || result.status === "skipped") console.log(result.output.split("\n").slice(-40).join("\n"));
  for (const artifact of result.artifacts ?? []) {
    console.log(`  ${artifact.type === "screenshot" ? "print da tela" : "console do app"}: ${artifact.file}`);
  }
});
process.on("SIGINT", () => runner.cancel());

runner.run(ids, { build: !flags.has("--no-build"), stopOnFailure: flags.has("--bail"), env: process.env }).then((run) => {
  const file = saveReport(run);
  console.log(`\nResultado: ${run.status.toUpperCase()} · relatorio em ${file}`);
  process.exit(run.status === "passed" ? 0 : 1);
});
