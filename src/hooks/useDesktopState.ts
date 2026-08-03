import { useEffect, useState } from "react";
import { getDesktopBridge, type DownloadSnapshot, type UpdateState } from "../services/desktopService";

const emptyDownloads: DownloadSnapshot = { directory: "", jobs: [] };

export function useUpdateState() {
  const [state, setState] = useState<UpdateState>({ status: "unsupported", version: "0.3.1", supported: false, environment: "development", lastResult: "not-checked" });
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    void bridge.updates.getState().then(setState);
    return bridge.updates.onState(setState);
  }, []);
  return state;
}

export function useDownloadState() {
  const [state, setState] = useState<DownloadSnapshot>(emptyDownloads);
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    void bridge.downloads.getState().then(setState);
    return bridge.downloads.onState(setState);
  }, []);
  return state;
}
