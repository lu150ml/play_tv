export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

export interface UpdateState {
  status: UpdateStatus;
  version: string;
  availableVersion?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  error?: string;
}

export type DownloadStatus = "queued" | "downloading" | "paused" | "completed" | "cancelled" | "error";

export interface DownloadJob {
  id: string;
  contentId: string;
  seriesId?: string;
  title: string;
  status: DownloadStatus;
  receivedBytes: number;
  totalBytes?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface DownloadSnapshot {
  directory: string;
  jobs: DownloadJob[];
}

export interface DownloadInput {
  contentId: string;
  seriesId?: string;
  title: string;
  url: string;
  extension?: string;
}

interface DesktopBridge {
  credentials: { save(value: string): Promise<boolean>; load(): Promise<string | undefined>; clear(): Promise<void> };
  updates: {
    getState(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    install(): Promise<void>;
    onState(callback: (state: UpdateState) => void): () => void;
  };
  downloads: {
    getState(): Promise<DownloadSnapshot>;
    chooseDirectory(): Promise<DownloadSnapshot>;
    enqueue(input: DownloadInput): Promise<DownloadJob>;
    pause(id: string): Promise<void>;
    resume(id: string): Promise<void>;
    cancel(id: string): Promise<void>;
    remove(id: string): Promise<void>;
    open(id: string): Promise<string>;
    openDirectory(): Promise<string>;
    onState(callback: (state: DownloadSnapshot) => void): () => void;
  };
}

declare global { interface Window { serverXtreme?: DesktopBridge } }

export function getDesktopBridge() { return window.serverXtreme; }
export function getDownloadedMediaUrl(jobId: string) { return `app://server-xtreme/downloads/${jobId}`; }
