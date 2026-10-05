import { Download, FolderOpen, Pause, Play, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { downloads, type DownloadItem } from "../platform/downloads";

export function DownloadsPage() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let remove: (() => Promise<void>) | undefined;
    void downloads.list().then(setItems).catch(() => setError("Não foi possível consultar os downloads."));
    if (downloads.isAvailable()) void downloads.addListener(setItems).then((handle) => { remove = handle.remove; });
    const timer = window.setInterval(() => void downloads.list().then(setItems).catch(() => undefined), 1500);
    return () => { window.clearInterval(timer); if (remove) void remove(); };
  }, []);

  async function action(operation: () => Promise<unknown>) {
    setError(undefined);
    try { await operation(); setItems(await downloads.list()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "A operação não pôde ser concluída."); }
  }

  return <div className="mx-auto max-w-canvas">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Download className="text-primary"/><h1 className="font-cinema text-4xl font-semibold">Downloads</h1></div><button className="focus-card flex items-center gap-2 rounded-lg border border-white/10 px-4 py-3" onClick={() => void action(() => downloads.chooseFolder())}><FolderOpen size={19}/>Escolher pasta</button></header>
    {error ? <p className="mb-5 rounded-xl border border-error/40 bg-error-container/30 p-4 text-error">{error}</p> : null}
    {!downloads.isAvailable() ? <p className="rounded-xl border border-white/10 p-6 text-on-surface-variant">Downloads estão disponíveis somente no aplicativo Android.</p> : items.length === 0 ? <p className="rounded-xl border border-white/10 p-6 text-on-surface-variant">Nenhum download na fila.</p> : <div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-xl border border-white/10 bg-surface-container p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">{item.title}</h2><p className="mt-1 text-sm capitalize text-on-surface-variant">{labelStatus(item.status)}{item.totalBytes > 0 ? ` · ${item.progress}%` : ""}</p></div><span className="font-mono text-xs uppercase text-primary">{item.kind === "episode" ? "Episódio" : "Filme"}</span></div><div className="mt-3 h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-primary" style={{ width: `${Math.max(0, item.progress)}%` }}/></div>{item.error ? <p className="mt-3 text-sm text-error">{item.error}</p> : null}<div className="mt-4 flex flex-wrap gap-2">{item.status === "downloading" ? <Action label="Pausar" icon={Pause} onClick={() => action(() => downloads.pause(item.id))}/> : ["paused","error","cancelled"].includes(item.status) ? <Action label="Retomar" icon={RotateCcw} onClick={() => action(() => downloads.resume(item.id))}/> : null}{["queued","downloading","paused"].includes(item.status) ? <Action label="Cancelar" icon={X} onClick={() => action(() => downloads.cancel(item.id))}/> : null}{item.playable ? <Link className="focus-card inline-flex items-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-primary" to={item.kind === "episode" && item.parentId ? `/watch/${item.parentId}/${item.contentId}` : `/watch/${item.contentId}`}><Play size={17}/>Reproduzir</Link> : null}<Action label="Excluir" icon={Trash2} onClick={() => action(() => downloads.delete(item.id))}/></div></article>)}</div>}
  </div>;
}

function Action({ label, icon: Icon, onClick }: { label: string; icon: typeof Play; onClick: () => Promise<unknown> }) { return <button className="focus-card inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm" onClick={() => void onClick()}><Icon size={17}/>{label}</button>; }
function labelStatus(status: DownloadItem["status"]): string { return ({ queued: "Na fila", downloading: "Baixando", paused: "Pausado", completed: "Concluído", error: "Erro", cancelled: "Cancelado" } as const)[status]; }
