import { App as CapacitorApp } from "@capacitor/app";
import { Download, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

import { isNativeAndroid } from "../platform/platformInfo";
import {
  checkForAndroidUpdate,
  installAndroidUpdate,
  type AndroidUpdateManifest
} from "../services/updateService";

export function UpdatePrompt() {
  const [update, setUpdate] = useState<AndroidUpdateManifest>();
  const [status, setStatus] = useState<"idle" | "installing" | "error">("idle");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!isNativeAndroid()) return;

    let lastCheckedAt = 0;
    let removeListener: (() => Promise<void>) | undefined;
    const check = () => {
      lastCheckedAt = Date.now();
      void checkForAndroidUpdate()
        .then((available) => {
          if (!available) return;
          const ignored = window.localStorage.getItem("play-tv:ignored-update");
          if (ignored !== String(available.versionCode)) setUpdate(available);
        })
        .catch(() => {
          // A falta do serviço de atualização nunca bloqueia o aplicativo.
        });
    };
    const timer = window.setTimeout(check, 2_000);
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive && Date.now() - lastCheckedAt >= 6 * 60 * 60 * 1_000) check();
    }).then((handle) => {
      removeListener = handle.remove;
    });

    return () => {
      window.clearTimeout(timer);
      if (removeListener) void removeListener();
    };
  }, []);

  if (!update) return null;
  const availableUpdate = update;

  async function handleInstall() {
    setStatus("installing");
    setError(undefined);
    try {
      await installAndroidUpdate(availableUpdate);
      setStatus("idle");
    } catch (installError) {
      setError(
        installError instanceof Error
          ? installError.message
          : "Não foi possível baixar a atualização. Confira a internet e tente novamente."
      );
      setStatus("error");
    }
  }

  function handleDismiss() {
    window.localStorage.setItem("play-tv:ignored-update", String(availableUpdate.versionCode));
    setUpdate(undefined);
  }

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-primary-container/30 p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/15 text-primary">
            <RefreshCw aria-hidden="true" size={25} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="update-title" className="font-display text-xl font-bold text-on-surface">
              Nova versão disponível
            </h2>
            <p className="mt-1 text-sm text-primary">Play TV {update.versionName}</p>
          </div>
          <button
            type="button"
            data-focusable="true"
            aria-label="Lembrar depois"
            onClick={handleDismiss}
            className="focus-card flex h-12 w-12 items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/5"
          >
            <X aria-hidden="true" size={22} />
          </button>
        </div>

        {update.releaseNotes ? (
          <p className="mt-5 text-sm leading-6 text-on-surface-variant">{update.releaseNotes}</p>
        ) : null}

        <p className="mt-4 text-xs leading-5 text-on-surface-variant">
          O Android solicitará sua confirmação antes de instalar. Seus perfis e histórico serão mantidos.
        </p>

        {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            data-focusable="true"
            onClick={handleDismiss}
            className="focus-card min-h-12 rounded-lg border border-white/10 px-5 py-3 font-semibold text-on-surface-variant"
          >
            Lembrar depois
          </button>
          <button
            type="button"
            data-focusable="true"
            autoFocus
            disabled={status === "installing"}
            onClick={() => void handleInstall()}
            className="focus-card flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-bold text-on-primary disabled:opacity-60"
          >
            <Download aria-hidden="true" size={20} />
            {status === "installing"
              ? "Baixando..."
              : status === "error"
                ? "Tentar novamente"
                : "Atualizar agora"}
          </button>
        </div>
      </div>
    </section>
  );
}
