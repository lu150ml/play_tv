// Publica a versao atual do Play TV X como release no GitHub.
//
//   npm run release:win            -> build + release com todos os arquivos
//   npm run release:win -- --skip-build --notes "texto"
//   npm run release:win -- --skip-build --dry-run   (so confere, nao publica)
//
// Alem dos arquivos versionados (que o atualizador automatico usa via
// latest.yml), anexa copias com nome fixo para o link do README nunca mudar:
//   releases/latest/download/Play-TV-X-Setup.exe
//   releases/latest/download/Play-TV-X-Portable.exe
//   releases/latest/download/Play-TV-Android.apk  (APK atual do android-update.json)
//
// Requer o GitHub CLI (gh). Se GH_TOKEN nao estiver definido, usa a mesma
// credencial do GitHub que o git ja usa neste PC.
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const REPO = "lu150ml/play_tv";
const ANDROID_MANIFEST = "https://raw.githubusercontent.com/lu150ml/play_tv/codex/android-details-v1.4.2/android-update.json";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const releaseDir = path.join(root, "release");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tag = `v${version}`;

if (!process.argv.includes("--skip-build")) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
  execSync("npm run dist:win", { cwd: root, stdio: "inherit" });
}

const setup = `Play-TV-X-Setup-${version}.exe`;
const portable = `Play-TV-X-${version}-portable.exe`;
for (const file of [setup, `${setup}.blockmap`, portable, "latest.yml"]) {
  if (!fs.existsSync(path.join(releaseDir, file))) throw new Error(`Arquivo ausente em release/: ${file}`);
}

const sha256 = (file) => createHash("sha256").update(fs.readFileSync(path.join(releaseDir, file))).digest("hex");
for (const file of [setup, portable]) fs.writeFileSync(path.join(releaseDir, `${file}.sha256`), `${sha256(file)}  ${file}\n`);
fs.copyFileSync(path.join(releaseDir, setup), path.join(releaseDir, "Play-TV-X-Setup.exe"));
fs.copyFileSync(path.join(releaseDir, portable), path.join(releaseDir, "Play-TV-X-Portable.exe"));

const assets = ["latest.yml", setup, `${setup}.blockmap`, `${setup}.sha256`, portable, `${portable}.sha256`, "Play-TV-X-Setup.exe", "Play-TV-X-Portable.exe"];
try {
  const manifest = await (await fetch(ANDROID_MANIFEST)).json();
  const apk = Buffer.from(await (await fetch(manifest.apkUrl)).arrayBuffer());
  if (createHash("sha256").update(apk).digest("hex").toUpperCase() !== String(manifest.sha256).toUpperCase()) throw new Error("sha256 do APK nao confere");
  fs.writeFileSync(path.join(releaseDir, "Play-TV-Android.apk"), apk);
  assets.push("Play-TV-Android.apk");
  console.log(`APK Android ${manifest.versionName} incluido.`);
} catch (error) {
  console.warn(`Aviso: APK Android nao incluido (${error.message}).`);
}

if (process.argv.includes("--dry-run")) {
  console.log(`[dry-run] ${tag} com: ${assets.join(", ")}`);
  process.exit(0);
}

// Sem a tag no GitHub, o gh criaria a release apontando para a main.
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (!git("ls-remote", "--tags", "origin", tag)) {
  if (!git("tag", "--list", tag)) git("tag", tag);
  git("push", "origin", tag);
}

const env = { ...process.env };
if (!env.GH_TOKEN && !env.GITHUB_TOKEN) {
  const credential = execSync("git credential fill", { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
  env.GH_TOKEN = /^password=(.*)$/m.exec(credential)?.[1] ?? "";
}
const notesIndex = process.argv.indexOf("--notes");
const notes = notesIndex > 0 ? process.argv[notesIndex + 1] : `Play TV X ${version}`;
execFileSync("gh", ["release", "create", tag, "--repo", REPO, "--title", tag, "--notes", notes, ...assets], {
  cwd: releaseDir,
  env,
  stdio: "inherit"
});
console.log(`Publicado: https://github.com/${REPO}/releases/tag/${tag}`);
