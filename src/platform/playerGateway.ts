import { registerPlugin } from "@capacitor/core";

import { isNativeAndroid } from "./platformInfo";

export interface NativeMediaItem {
  contentId: string;
  title: string;
  streamUrl: string;
  kind: "live" | "movie" | "episode";
  startPositionMs?: number;
}

export interface NativePlayerRequest extends NativeMediaItem {
  posterUrl?: string;
  nextEpisodes?: NativeMediaItem[];
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
  reason: "back" | "ended" | "error";
  errorCode?: string;
  progress?: NativePlaybackProgress[];
}

interface NativePlayerPlugin {
  open(request: NativePlayerRequest): Promise<NativePlayerResult>;
}

const NativePlayer = registerPlugin<NativePlayerPlugin>("NativePlayer");

export const playerGateway = {
  isAvailable: isNativeAndroid,
  open(request: NativePlayerRequest): Promise<NativePlayerResult> {
    if (!isNativeAndroid()) {
      return Promise.reject(new Error("Native player is only available on Android."));
    }

    return NativePlayer.open(request);
  }
};
