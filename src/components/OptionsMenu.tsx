import { Activity, Download, RefreshCw, Settings, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { isNativeAndroid } from "../platform/platformInfo";
import { logoutSession } from "../services/logoutService";
import {
  checkForAndroidUpdate,
  getInstalledVersion,
  installAndroidUpdate,
  type AndroidUpdateManifest
} from "../services/updateService";
import { diagnostics, type DiagEvent } from "../services/diagnosticsService";

type UpdateStatus =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "installing"
  | "error";

type MenuView = "main" | "diagnostics";

// Menu "Opções" do header: Buscar atualizações, Trocar perfil, Trocar conta.
// Todos os itens são navegáveis por controle remoto (data-focusable).
export function OptionsMenu({ expanded = false }: { expanded?: boolean }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<MenuView>("main");
  const [version, setVersion] = useState<string>();
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<AndroidUpdateManifest>();
  const [error, setError] = useState<string>();
  const [diagEvents, setDiagEvents] = useState<DiagEvent[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void getInstalledVersion().then((info) => setVersion(info.version));
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setView("main");
      return undefined;
    }
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  async function handleCheckUpdate() {
    if (!isNativeAndroid()) {
      setStatus("current");
      setError("Atualizações automáticas só estão disponíveis no aplicativo Android.");
      return;
    }
    setStatus("checking");
    setError(undefined);
    try {
      const available = await checkForAndroidUpdate();
      setUpdate(available);
      setStatus(available ? "available" : "current");
      window.localStorage.setItem("play-tv:last-update-check", new Date().toISOString());
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error ? reason.message : "Não foi possível verificar.");
    }
  }

  async function handleInstall() {
    if (!update) return;
    setStatus("installing");
    setError(undefined);
    try {
      await installAndroidUpdate(update);
      setStatus("available");
    } catch (reason) {
      setStatus("error");
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível baixar a atualização. Confira a internet e tente novamente."
      );
    }
  }

  function handleOpenDiagnostics() {
    setDiagEvents(diagnostics.getAll());
    setView("diagnostics");
  }

  const updateLabel =
    status === "checking"
      ? "Verificando…"
      : status === "installing"
        ? "Baixando atualização…"
        : status === "available"
          ? `Instalar versão ${update?.versionName}`
          : status === "current"
            ? "Aplicativo atualizado"
            : "Buscar atualizações";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-focusable="true"
        aria-label="Abrir opções"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={expanded
          ? "focus-card flex min-h-12 w-full items-center gap-3 rounded-lg border border-white/10 bg-surface-container px-4 py-3 text-sm font-semibold text-on-surface-variant hover:text-on-surface"
          : "focus-card flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-surface-container text-on-surface-variant hover:text-on-surface"}
      >
        {isOpen ? <X aria-hidden="true" size={20} /> : <Settings aria-hidden="true" size={20} />}
        {expanded ? <span className="nav-label">Opções</span> : null}
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Opções"
          className={`absolute z-50 w-72 rounded-xl border border-white/10 bg-surface-container-lowest p-2 shadow-2xl ${expanded ? "bottom-16 left-0" : "right-0 top-14"}`}
        >
          {view === "diagnostics" ? (
            <DiagnosticsPanel events={diagEvents} onBack={() => setView("main")} />
          ) : (
            <>
              <p className="px-3 pb-2 pt-1 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                Opções{version ? ` · v${version}` : ""}
              </p>

              <button
                type="button"
                role="menuitem"
                data-focusable="true"
                disabled={status === "checking" || status === "installing"}
                onClick={() => void (status === "available" ? handleInstall() : handleCheckUpdate())}
                className="focus-card flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold text-on-surface hover:bg-white/5 disabled:opacity-60"
              >
                {status === "available" ? (
                  <Download aria-hidden="true" size={18} className="shrink-0 text-primary" />
                ) : (
                  <RefreshCw
                    aria-hidden="true"
                    size={18}
                    className={`shrink-0 text-primary ${status === "checking" || status === "installing" ? "animate-spin" : ""}`}
                  />
                )}
                <span className="min-w-0 flex-1">
                  {updateLabel}
                  {status === "available" && update?.releaseNotes ? (
                    <span className="mt-0.5 block truncate text-xs font-normal text-on-surface-variant">
                      {update.releaseNotes}
                    </span>
                  ) : null}
                </span>
              </button>

              {error ? <p className="px-3 py-1 text-xs text-error">{error}</p> : null}

              <button
                type="button"
                role="menuitem"
                data-focusable="true"
                onClick={handleOpenDiagnostics}
                className="focus-card flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold text-on-surface hover:bg-white/5"
              >
                <Activity aria-hidden="true" size={18} className="shrink-0 text-primary" />
                Diagnóstico
              </button>

              <button
                type="button"
                role="menuitem"
                data-focusable="true"
                onClick={() => {
                  setIsOpen(false);
                  void navigate("/profiles");
                }}
                className="focus-card flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold text-on-surface hover:bg-white/5"
              >
                <UserRound aria-hidden="true" size={18} className="shrink-0 text-primary" />
                Trocar perfil
              </button>

              <button
                type="button"
                role="menuitem"
                data-focusable="true"
                onClick={() => {
                  setIsOpen(false);
                  void logoutSession()
                    .catch(() => {
                      // A sessão em memória já é limpa mesmo se o cofre falhar.
                    })
                    .finally(() => navigate("/login", { replace: true }));
                }}
                className="focus-card flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold text-on-surface hover:bg-white/5"
              >
                <X aria-hidden="true" size={18} className="shrink-0 text-primary" />
                Trocar conta
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel de Diagnostico
// ---------------------------------------------------------------------------

function DiagnosticsPanel({ events, onBack }: { events: DiagEvent[]; onBack: () => void }) {
  const summary = diagnostics.getSectionSummary();

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <div className="flex items-center gap-2 px-3 pb-2 pt-1">
        <button
          type="button"
          data-focusable="true"
          onClick={onBack}
          className="focus-card rounded px-1 text-lg leading-none text-on-surface-variant hover:text-on-surface"
          aria-label="Voltar"
        >
          &lsaquo;
        </button>
        <p className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
          Diagnostico
        </p>
        <button
          type="button"
          data-focusable="true"
          onClick={() => { diagnostics.clear(); }}
          className="ml-auto font-mono text-[9px] uppercase text-on-surface-variant hover:text-error"
        >
          Limpar
        </button>
      </div>
      <div className="mb-2 space-y-1 px-3">
        {summary.map((s) => (
          <div key={s.section} className="flex items-center gap-2 rounded bg-white/5 px-2 py-1.5 text-xs">
            <span className={`h-2 w-2 shrink-0 rounded-full ${s.ok ? "bg-emerald-400" : s.lastDurationMs === 0 ? "bg-white/20" : "bg-error"}`} />
            <span className="min-w-0 flex-1 font-semibold text-on-surface">{s.section}</span>
            {s.lastDurationMs > 0 ? (
              <span className="tabular-nums text-on-surface-variant">{(s.lastDurationMs / 1000).toFixed(1)}s</span>
            ) : null}
            {s.attempts > 1 ? (
              <span className="rounded bg-amber-400/20 px-1 text-amber-300">{s.attempts}x</span>
            ) : null}
            {s.error ? (
              <span className="max-w-[120px] truncate text-error/80">{s.error}</span>
            ) : null}
          </div>
        ))}
      </div>
      <hr className="mx-3 my-1 border-white/10" />
      {events.length === 0 ? (
        <p className="px-3 py-3 text-xs text-on-surface-variant">
          Nenhum evento. Abra Filmes ou Series para gerar dados.
        </p>
      ) : (
        <div className="space-y-1 px-3 pb-2">
          {events.slice(0, 30).map((ev, i) => (
            <div key={i} className="rounded bg-white/5 px-2 py-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className={`shrink-0 font-mono font-bold ${ev.error ? "text-error" : "text-emerald-400"}`}>
                  {ev.error ? "X" : "OK"}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-on-surface">{ev.action}</span>
                <span className="tabular-nums text-on-surface-variant">{(ev.durationMs / 1000).toFixed(1)}s</span>
                {ev.attempt > 1 ? <span className="rounded bg-amber-400/20 px-1 text-amber-300">t{ev.attempt}</span> : null}
                {ev.status ? <span className="rounded bg-white/10 px-1 text-on-surface-variant">{ev.status}</span> : null}
              </div>
              {ev.error ? <p className="mt-0.5 truncate text-error/80">{ev.error}</p> : null}
              <p className="text-on-surface-variant/60">{new Date(ev.timestamp).toLocaleTimeString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
