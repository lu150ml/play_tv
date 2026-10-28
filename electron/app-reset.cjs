const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn: defaultSpawn } = require("node:child_process");

// Caracteres que o cmd.exe interpretaria dentro do script de limpeza.
const UNSAFE_PATH = /["%&^|<>]/;

function isSafeUserDataDir(dir, home) {
  if (typeof dir !== "string" || dir.length === 0 || UNSAFE_PATH.test(dir)) return false;
  const resolved = path.resolve(dir);
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) return false;
  if (home && path.resolve(home).toLowerCase() === resolved.toLowerCase()) return false;
  // Nunca apaga uma pasta rasa (ex.: C:\Users, C:\Users\nome): so pastas de dados do app.
  return resolved.slice(parsed.root.length).split(path.sep).filter(Boolean).length >= 3;
}

// Decide o que sera apagado e o que abrir depois, sem tocar em nada.
function planReset({ app, env = process.env, exists = fs.existsSync, platform = process.platform, home = os.homedir() }) {
  const userData = app.getPath("userData");
  const exePath = app.getPath("exe");
  const uninstaller = app.isPackaged
    ? path.join(path.dirname(exePath), `Uninstall ${app.getName()}.exe`)
    : undefined;
  const hasUninstaller = Boolean(uninstaller) && !UNSAFE_PATH.test(uninstaller) && exists(uninstaller);
  const portablePath = env.PORTABLE_EXECUTABLE_FILE;
  const relaunchPath = app.isPackaged
    ? (portablePath && !UNSAFE_PATH.test(portablePath) ? portablePath : (!UNSAFE_PATH.test(exePath) ? exePath : undefined))
    : undefined;
  return {
    userData,
    canDeleteFolder: platform === "win32" && isSafeUserDataDir(userData, home),
    uninstaller: hasUninstaller ? uninstaller : undefined,
    relaunchPath,
    mode: hasUninstaller ? "uninstall" : "reset"
  };
}

// Apos o app encerrar, o cmd espera o Windows soltar os arquivos, apaga a pasta de
// dados e abre o desinstalador (versao instalada) ou o app limpo (portatil).
function buildCleanupScript(plan) {
  const steps = ["ping -n 4 127.0.0.1 >nul"];
  if (plan.canDeleteFolder) steps.push(`rmdir /s /q "${plan.userData}"`);
  const next = plan.uninstaller ?? plan.relaunchPath;
  if (next) steps.push(`start "" "${next}"`);
  return steps.join(" & ");
}

async function runReset({ plan, session, stopWork = async () => {}, spawn = defaultSpawn, quit }) {
  await stopWork();
  // Mesmo que a pasta nao possa ser apagada, o login e o catalogo salvos somem.
  try {
    await session.clearStorageData();
    await session.clearCache();
  } catch {
    // Limpeza do Chromium e best effort; o script abaixo remove o resto.
  }
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", `"${buildCleanupScript(plan)}"`], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: true
    });
    child.unref?.();
  }
  quit();
}

module.exports = { planReset, buildCleanupScript, runReset, isSafeUserDataDir };
