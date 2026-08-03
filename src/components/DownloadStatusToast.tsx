import { Download, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useDownloadState } from "../hooks/useDesktopState";

export function DownloadStatusToast() {
  const { jobs } = useDownloadState();
  const job = [...jobs].reverse().find((item) =>
    ["queued", "downloading", "error"].includes(item.status)
  );
  if (!job) return null;
  const percent = job.totalBytes
    ? Math.min(100, Math.round((job.receivedBytes / job.totalBytes) * 100))
    : undefined;
  return (
    <div className="fixed bottom-40 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-surface-container-high p-4 shadow-2xl lg:bottom-24">
      <div className="flex items-center gap-3">
        <Download className="shrink-0 text-primary" size={20} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold">{job.title}</p>
          <p className={job.status === "error" ? "text-xs text-error" : "text-xs text-on-surface-variant"}>
            {job.error ?? (job.status === "queued" ? "Adicionado a fila" : percent === undefined ? "Baixando..." : `Baixando · ${percent}%`)}
          </p>
        </div>
        <Link to="/downloads" data-focusable="true" aria-label="Abrir downloads" className="focus-card rounded-lg border border-white/10 p-2"><ExternalLink size={16} /></Link>
      </div>
      {job.status === "downloading" ? <div className="mt-3 h-1 overflow-hidden rounded bg-white/10"><div className={percent === undefined ? "h-full w-1/3 animate-pulse bg-primary" : "h-full bg-primary"} style={percent === undefined ? undefined : { width: `${percent}%` }} /></div> : null}
    </div>
  );
}
