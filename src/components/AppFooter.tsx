import { RefreshCw } from "lucide-react";
import { useUpdateState } from "../hooks/useDesktopState";
import { getDesktopBridge } from "../services/desktopService";

function statusLabel(update: ReturnType<typeof useUpdateState>) {
  if (!update.supported) return update.environment === "portable" ? "Atualizacao automatica indisponivel na versao portatil" : "Atualizacao automatica indisponivel neste ambiente";
  if (update.status === "checking") return "Verificando atualizacoes...";
  if (update.status === "available") return "Nova versao disponivel";
  if (update.status === "downloading") return `Baixando atualizacao · ${update.percent ?? 0}%`;
  if (update.status === "ready") return "Atualizacao pronta para reiniciar";
  if (update.status === "error") return "Nao foi possivel verificar";
  if (update.lastResult === "up-to-date") return "Atualizado";
  return "Ainda nao verificado";
}

export function AppFooter() {
  const update = useUpdateState();
  const ready = update.status === "ready";
  return (
    <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 py-5 text-xs text-on-surface-variant">
      <div><span className="font-mono uppercase">Versao {update.version} · {statusLabel(update)}</span>{update.lastCheckedAt ? <span className="ml-2 opacity-70">Verificado em {new Date(update.lastCheckedAt).toLocaleString("pt-BR")}</span> : null}</div>
      {update.supported ? <button type="button" data-focusable="true" onClick={() => void (ready ? getDesktopBridge()?.updates.install() : getDesktopBridge()?.updates.check())} className="focus-card inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface-container px-3 py-2 font-semibold text-on-surface"><RefreshCw size={14} />{ready ? "Reiniciar e atualizar" : "Verificar agora"}</button> : null}
    </footer>
  );
}
