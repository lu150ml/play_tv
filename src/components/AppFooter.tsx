import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { checkForAndroidUpdate, getInstalledVersion, installAndroidUpdate, onAndroidUpdateProgress, type AndroidUpdateManifest } from "../services/updateService";
import { isNativeAndroid } from "../platform/platformInfo";

type Status = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "error";
export function AppFooter() {
  const [version, setVersion] = useState("…");
  const [status, setStatus] = useState<Status>(isNativeAndroid() ? "idle" : "current");
  const [update, setUpdate] = useState<AndroidUpdateManifest>();
  const [progress, setProgress] = useState(-1);
  useEffect(() => { void getInstalledVersion().then((info) => setVersion(info.version)); let remove: (() => Promise<void>) | undefined; if (isNativeAndroid()) void onAndroidUpdateProgress((event) => { setProgress(event.progress); setStatus(event.status === "ready" ? "ready" : "downloading"); }).then((handle) => { remove = handle.remove; }); return () => { if (remove) void remove(); }; }, []);
  async function check() { setStatus("checking"); try { const available = await checkForAndroidUpdate(); setUpdate(available); setStatus(available ? "available" : "current"); localStorage.setItem("play-tv:last-update-check", new Date().toISOString()); } catch { setStatus("error"); } }
  async function install() { if (!update) return; setStatus("downloading"); try { await installAndroidUpdate(update); } catch { setStatus("error"); } }
  const label = status === "checking" ? "Verificando atualizações…" : status === "available" ? "Nova versão disponível" : status === "downloading" ? `Baixando atualização${progress >= 0 ? ` · ${progress}%` : "…"}` : status === "ready" ? "Atualização pronta" : status === "error" ? "Não foi possível verificar" : status === "current" ? "Atualizado" : "Ainda não verificado";
  return <footer className="app-footer fixed bottom-20 left-0 z-30 flex min-h-10 w-full items-center justify-center gap-3 border-t border-white/10 bg-black/90 px-3 py-2 text-center text-[11px] text-on-surface-variant backdrop-blur-xl lg:bottom-0 lg:left-72 lg:w-[calc(100%-18rem)]"><span>Versão {version} · {label}</span>{status === "available" || status === "ready" ? <button className="text-primary" onClick={() => void install()}>{status === "ready" ? "Instalar" : "Atualizar"}</button> : <button className="inline-flex items-center gap-1 text-primary" onClick={() => void check()}><RefreshCw size={12}/>Verificar agora</button>}</footer>;
}
