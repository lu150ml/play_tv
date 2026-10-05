import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

import { isNativeAndroid } from "./platformInfo";

export interface NativeMediaItem {
  contentId: string;
  title: string;
  streamUrl: string;
  streamCandidates?: string[];
  kind: "live" | "movie" | "episode";
  startPositionMs?: number;
  season?: number;
  episode?: number;
}

export interface NativePlayerRequest extends NativeMediaItem {
  posterUrl?: string;
  nextEpisodes?: NativeMediaItem[];
  playlist?: NativeMediaItem[];
  subtitleQuery?: {
    title: string;
    season?: number;
    episode?: number;
  };
  subtitleApiBaseUrl?: string;
}

export interface NativePlaybackProgress {
  contentId: string;
  positionMs: number;
  durationMs: number;
  completed: boolean;
}

export interface NativePlayerResult extends NativePlaybackProgress {
  reason: "back" | "ended" | "error" | "replaced";
  errorCode?: string;
  progress?: NativePlaybackProgress[];
}

export type NativePlayerState =
  | "fullscreen"
  | "pip"
  | "playing"
  | "paused"
  | "progress"
  | "closed"
  | "ended"
  | "error";

export interface NativePlayerStateEvent {
  state: NativePlayerState;
  contentId?: string;
  positionMs: number;
  durationMs: number;
  errorCode?: string;
}

interface NativePlayerPlugin {
  open(request: NativePlayerRequest): Promise<NativePlayerResult>;
  close(options: { reason: "back" | "replaced" }): Promise<{ closed: boolean }>;
  isActive(): Promise<{ active: boolean }>;
  addListener(
    eventName: "playerStateChanged",
    listener: (event: NativePlayerStateEvent) => void
  ): Promise<PluginListenerHandle>;
}

const NativePlayer = registerPlugin<NativePlayerPlugin>("NativePlayer");

let sessionActive = false;
let activeOpenPromise: Promise<NativePlayerResult> | undefined;

export const playerGateway = {
  isAvailable: isNativeAndroid,
  open(request: NativePlayerRequest): Promise<NativePlayerResult> {
    if (!isNativeAndroid()) {
      return Promise.reject(new Error("Native player is only available on Android."));
    }

    sessionActive = true;
    const openPromise = NativePlayer.open(request);
    activeOpenPromise = openPromise;
    return openPromise.finally(() => {
      if (activeOpenPromise === openPromise) {
        activeOpenPromise = undefined;
        sessionActive = false;
      }
    });
  },
  async hasActiveSession(): Promise<boolean> {
    if (!isNativeAndroid()) return false;
    const state = await NativePlayer.isActive();
    sessionActive = state.active;
    return state.active;
  },
  async close(reason: "back" | "replaced" = "back"): Promise<boolean> {
    if (!isNativeAndroid()) return false;
    const result = await NativePlayer.close({ reason });
    if (result.closed) {
      sessionActive = false;
      await activeOpenPromise?.catch(() => undefined);
    }
    return result.closed;
  },
  isSessionActive(): boolean {
    return sessionActive;
  },
  addStateListener(
    listener: (event: NativePlayerStateEvent) => void
  ): Promise<PluginListenerHandle> {
    return NativePlayer.addListener("playerStateChanged", (event) => {
      sessionActive = !["closed", "ended", "error"].includes(event.state);
      listener(event);
    });
  }
};
