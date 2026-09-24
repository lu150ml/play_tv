import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNativeAndroid } from "./platformInfo";

export type DownloadStatus = "queued" | "downloading" | "paused" | "completed" | "error" | "cancelled";
export interface DownloadItem { id: string; contentId: string; parentId?: string; title: string; kind: "movie" | "episode"; status: DownloadStatus; bytesDownloaded: number; totalBytes: number; progress: number; error?: string; playable: boolean; createdAt: number; }
interface DownloadsPlugin {
  chooseFolder(): Promise<{ selected: boolean }>;
  list(): Promise<{ items: DownloadItem[] }>;
  start(options: { contentId: string; parentId?: string; title: string; kind: "movie" | "episode"; candidates: string[] }): Promise<DownloadItem>;
  pause(options: { id: string }): Promise<void>;
  resume(options: { id: string }): Promise<void>;
  cancel(options: { id: string }): Promise<void>;
  delete(options: { id: string }): Promise<void>;
  getCompleted(options: { contentId: string }): Promise<{ uri?: string }>;
  addListener(eventName: "queueChanged", listener: (event: { items: DownloadItem[] }) => void): Promise<PluginListenerHandle>;
}
const NativeDownloads = registerPlugin<DownloadsPlugin>("Downloads");

export const downloads = {
  isAvailable: isNativeAndroid,
  chooseFolder: () => NativeDownloads.chooseFolder(),
  list: async () => isNativeAndroid() ? (await NativeDownloads.list()).items : [],
  start: (request: { contentId: string; parentId?: string; title: string; kind: "movie" | "episode"; candidates: string[] }) => NativeDownloads.start(request),
  pause: (id: string) => NativeDownloads.pause({ id }),
  resume: (id: string) => NativeDownloads.resume({ id }),
  cancel: (id: string) => NativeDownloads.cancel({ id }),
  delete: (id: string) => NativeDownloads.delete({ id }),
  completedUri: async (contentId: string) => isNativeAndroid() ? (await NativeDownloads.getCompleted({ contentId })).uri : undefined,
  addListener: (listener: (items: DownloadItem[]) => void) => NativeDownloads.addListener("queueChanged", (event) => listener(event.items))
};
