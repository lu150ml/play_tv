import { FolderOpen, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import { useDownloadState } from "../hooks/useDesktopState";
import { getDesktopBridge } from "../services/desktopService";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

function bytes(value?: number) {
  if (!value) return "0 MB";
  return `${(value / 1024 / 1024).toFixed(value > 1024 * 1024 * 100 ? 0 : 1)} MB`;
}

function downloadStatus(status: string) {
  return ({ queued: "Na fila", downloading: "Baixando", paused: "Pausado", completed: "Concluido", cancelled: "Cancelado", error: "Erro" } as Record<string, string>)[status] ?? status;
}

export function DownloadsPage() {
  const navigate = useNavigate();
  const state = useDownloadState();
  const bridge = getDesktopBridge();
  const [actionError, setActionError] = useState<string>();
  function perform(action?: Promise<unknown>) {
    if (!action) return;
    setActionError(undefined);
    void action.catch((error) => setActionError(error instanceof Error ? error.message : "A operacao falhou."));
  }
  return <div className="mx-auto max-w-canvas">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div><p className="font-mono text-xs uppercase text-primary-container">Offline</p><h1 className="font-display text-4xl font-bold">Downloads</h1><p className="mt-2 break-all text-sm text-on-surface-variant">{state.directory || "Disponivel somente no aplicativo instalado."}</p></div>
      <div className="flex gap-2"><button data-focusable="true" type="button" onClick={() => perform(bridge?.downloads.chooseDirectory())} className="focus-card rounded-lg border border-white/10 bg-surface-container px-3 py-2">Escolher pasta</button><button data-focusable="true" type="button" onClick={() => perform(bridge?.downloads.openDirectory())} className="focus-card rounded-lg border border-white/10 bg-surface-container p-2" aria-label="Abrir pasta"><FolderOpen /></button></div>
    </div>
    {actionError ? <div className="mb-4 rounded-lg border border-error/40 bg-error-container/30 p-3 text-sm text-error">{actionError}</div> : null}
    <div className="space-y-3">{state.jobs.length === 0 ? <div className="rounded-xl border border-white/10 bg-surface-container/60 p-8 text-on-surface-variant">Nenhum download ainda.</div> : state.jobs.map((job) => {
      const percent = job.totalBytes ? Math.min(100, job.receivedBytes / job.totalBytes * 100) : 0;
      return <article key={job.id} className="rounded-xl border border-white/10 bg-surface-container/70 p-4">
        <div className="flex items-center justify-between gap-4"><div className="min-w-0"><h2 className="truncate font-display text-lg font-semibold">{job.title}</h2><p className="font-mono text-xs uppercase text-on-surface-variant">{downloadStatus(job.status)} · {bytes(job.receivedBytes)}{job.totalBytes ? ` / ${bytes(job.totalBytes)}` : ""}</p>{job.error ? <p className="mt-1 text-sm text-error">{job.error}</p> : null}</div>
        <div className="flex gap-2">{job.status === "downloading" ? <button data-focusable="true" aria-label="Pausar" className="focus-card rounded-lg border border-white/10 p-2" onClick={() => perform(bridge?.downloads.pause(job.id))}><Pause /></button> : null}{["paused","error","cancelled"].includes(job.status) ? <button data-focusable="true" aria-label="Retomar" className="focus-card rounded-lg border border-white/10 p-2" onClick={() => perform(bridge?.downloads.resume(job.id))}><RotateCcw /></button> : null}{job.status === "completed" ? <button data-focusable="true" aria-label="Reproduzir" className="focus-card rounded-lg border border-white/10 p-2" onClick={() => void navigate(job.seriesId ? `/watch/${job.seriesId}/${job.contentId}` : `/watch/${job.contentId}`)}><Play /></button> : null}<button data-focusable="true" aria-label={job.status === "completed" ? "Excluir" : "Cancelar"} className="focus-card rounded-lg border border-error/30 p-2 text-error" onClick={() => perform(job.status === "completed" ? bridge?.downloads.remove(job.id) : bridge?.downloads.cancel(job.id))}><Trash2 /></button></div></div>
        {job.status === "downloading" ? <div className="mt-3 h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-primary" style={{ width: `${percent}%` }} /></div> : null}
      </article>;
    })}</div>
  </div>;
}
