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

// Normaliza (clamp de posição + timestamp) sem tocar em storage. É o que o
// caminho quente de reprodução usa: o estado de progresso é persistido pelo
// Zustand (libraryStore), então fazer um read+write O(n) no localStorage a
// cada tick de 5s seria desperdício e ainda travaria a thread principal.
export function normalizePlaybackState(nextState: Omit<PlaybackState, "updatedAt">): PlaybackState {
  return {
    ...nextState,
    positionSeconds:
      nextState.durationSeconds > 0
        ? clamp(nextState.positionSeconds, 0, nextState.durationSeconds)
        : Math.max(nextState.positionSeconds, 0),
    updatedAt: new Date().toISOString()
  };
}

export function isPlaybackComplete(
  state: Pick<PlaybackState, "positionSeconds" | "durationSeconds">
) {
  return state.durationSeconds > 0 && state.positionSeconds / state.durationSeconds >= 0.95;
}

/**
 * Streams sob demanda podem expor uma duracao temporaria enquanto a fonte HLS
 * ainda esta estabilizando. Uma duracao de poucos segundos para um episodio de
 * dezenas de minutos nao deve sobrescrever o historico do usuario.
 */
export function isTrustedOnDemandDuration(
  observedDurationSeconds: number,
  declaredDurationSeconds?: number
): boolean {
  if (!Number.isFinite(observedDurationSeconds) || observedDurationSeconds < 60) {
    return false;
  }

  if (!declaredDurationSeconds || declaredDurationSeconds < 120) {
    return true;
  }

  return observedDurationSeconds >= declaredDurationSeconds * 0.2;
}

export function isCorruptedPlaybackProgress(
  state: PlaybackState | undefined,
  declaredDurationSeconds?: number
): boolean {
  if (!state || !declaredDurationSeconds || declaredDurationSeconds < 120) {
    return false;
  }

  return (
    state.durationSeconds > 0 &&
    state.durationSeconds < Math.max(60, declaredDurationSeconds * 0.2)
  );
}

export function savePlaybackProgress(
  nextState: Omit<PlaybackState, "updatedAt">,
  storage: Storage = window.localStorage
): PlaybackState {
  const normalizedState = normalizePlaybackState(nextState);
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
