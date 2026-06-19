import type { PlaybackState } from "../types/catalog";

const STORAGE_KEY = "server-xtreme-playback";

export function loadPlaybackStates(storage: Storage = window.localStorage): PlaybackState[] {
  const rawValue = storage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsedValue) ? parsedValue.filter(isPlaybackState) : [];
  } catch {
    return [];
  }
}

export function getPlaybackProgress(
  contentId: string,
  storage: Storage = window.localStorage
): PlaybackState | undefined {
  return loadPlaybackStates(storage).find((state) => state.contentId === contentId);
}

export function savePlaybackProgress(
  nextState: Omit<PlaybackState, "updatedAt">,
  storage: Storage = window.localStorage
): PlaybackState {
  const normalizedState: PlaybackState = {
    ...nextState,
    positionSeconds: clamp(nextState.positionSeconds, 0, nextState.durationSeconds),
    updatedAt: new Date().toISOString()
  };
  const states = loadPlaybackStates(storage).filter(
    (state) => state.contentId !== normalizedState.contentId
  );

  storage.setItem(STORAGE_KEY, JSON.stringify([normalizedState, ...states]));
  return normalizedState;
}

export function getProgressRatio(state?: PlaybackState): number {
  if (!state || state.durationSeconds <= 0) {
    return 0;
  }

  return clamp(state.positionSeconds / state.durationSeconds, 0, 1);
}

export function getRemainingSeconds(state?: PlaybackState): number | undefined {
  if (!state || state.durationSeconds <= 0) {
    return undefined;
  }

  return Math.max(state.durationSeconds - state.positionSeconds, 0);
}

export function shouldShowPlaybackProgress(type: "movie" | "series" | "episode" | "channel") {
  return type !== "channel";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isPlaybackState(value: unknown): value is PlaybackState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as PlaybackState;
  return (
    typeof candidate.contentId === "string" &&
    typeof candidate.positionSeconds === "number" &&
    typeof candidate.durationSeconds === "number" &&
    typeof candidate.updatedAt === "string"
  );
}
