import { Download, RefreshCw } from "lucide-react";
import { useUpdateState } from "../hooks/useDesktopState";
import { getDesktopBridge } from "../services/desktopService";

export function UpdateBanner() {
  const update = useUpdateState();
  if (update.status === "idle" || update.status === "checking" || update.status === "unsupported") return null;
  const ready = update.status === "ready";
  return (
    <div className="fixed bottom-24 right-4 z-50 max-w-sm rounded-xl border border-primary-container/50 bg-surface-container-high p-4 shadow-2xl lg:bottom-6">
      <div className="flex items-center gap-3">
        {ready ? <RefreshCw size={20} className="text-primary" /> : <Download size={20} className="text-primary" />}
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold">{ready ? "Atualizacao pronta" : update.status === "error" ? "Falha na atualizacao" : "Baixando atualizacao"}</p>
          <p className="text-xs text-on-surface-variant">{update.error ?? (update.percent !== undefined ? `${update.percent}% concluido` : `Versao ${update.availableVersion ?? "nova"}`)}</p>
        </div>
        {ready ? <button type="button" data-focusable="true" onClick={() => void getDesktopBridge()?.updates.install()} className="focus-card rounded-lg bg-primary px-3 py-2 text-sm font-bold text-on-primary">Reiniciar</button> : null}
      </div>
      {update.status === "downloading" ? <div className="mt-3 h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-primary" style={{ width: `${update.percent ?? 0}%` }} /></div> : null}
    </div>
  );
}
