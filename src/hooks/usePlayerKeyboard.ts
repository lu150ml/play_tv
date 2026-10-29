import { useEffect, useRef, useState, type RefObject } from "react";

const SEEK_STEP_SECONDS = 5;
const FAST_SEEK_STEP_SECONDS = 10;
const FAST_SEEK_WINDOW_MS = 500;
const VOLUME_STEP = 0.1;
const NOTICE_DURATION_MS = 1000;

export interface PlayerKeyboardNotice {
  text: string;
  key: number;
}

interface PlayerKeyboardOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  canSeek: boolean;
  durationSeconds: number;
  // Volume efetivo (0 quando mudo); quem salva e aplica é o PlayerPage.
  volume: number;
  onSeek: (positionSeconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onTogglePlay: () => void;
  onActivity: () => void;
}

// Um toque = 5s; toques seguidos rápidos na mesma direção = 10s cada.
export function getSeekStep(now: number, lastPressAt: number | undefined, sameDirection: boolean): number {
  if (sameDirection && lastPressAt !== undefined && now - lastPressAt < FAST_SEEK_WINDOW_MS) {
    return FAST_SEEK_STEP_SECONDS;
  }
  return SEEK_STEP_SECONDS;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isEditable(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT" || (element as HTMLElement).isContentEditable) {
    return true;
  }
  // A barra de busca (range) não é texto: as setas do player valem sobre ela.
  return tag === "INPUT" && (element as HTMLInputElement).type !== "range";
}

export function usePlayerKeyboard(options: PlayerKeyboardOptions): PlayerKeyboardNotice | undefined {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const lastSeekRef = useRef<{ at: number; direction: number } | undefined>(undefined);
  const [notice, setNotice] = useState<PlayerKeyboardNotice | undefined>();
  const { enabled } = options;

  useEffect(() => {
    if (!notice) return undefined;
    const timeoutId = window.setTimeout(() => setNotice(undefined), NOTICE_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    if (!enabled) return undefined;

    function showNotice(text: string) {
      setNotice({ text, key: Date.now() });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (isEditable(document.activeElement)) return;

      const current = optionsRef.current;
      const player = current.videoRef.current;
      if (!player) return;

      if (event.key === " " || event.key === "Spacebar") {
        consume(event);
        current.onTogglePlay();
        current.onActivity();
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        consume(event);
        if (!current.canSeek) return;

        const direction = event.key === "ArrowRight" ? 1 : -1;
        const now = Date.now();
        const last = lastSeekRef.current;
        const step = getSeekStep(now, last?.at, last?.direction === direction);
        lastSeekRef.current = { at: now, direction };

        const duration = current.durationSeconds || player.duration || 0;
        const nextPosition = clamp(player.currentTime + direction * step, 0, duration);
        current.onSeek(Math.floor(nextPosition));
        current.onActivity();
        showNotice(`${direction > 0 ? "+" : "-"}${step}s`);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        consume(event);
        const direction = event.key === "ArrowUp" ? 1 : -1;
        // Arredonda para evitar 0.30000000000000004.
        const nextVolume = Math.round(clamp(current.volume + direction * VOLUME_STEP, 0, 1) * 10) / 10;
        current.onVolumeChange(nextVolume);
        showNotice(`Volume ${Math.round(nextVolume * 100)}%`);
      }
    }

    // Capture em window: roda antes do useRemoteNavigation (document) e do
    // comportamento padrão do botão/range focado.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled]);

  return notice;
}

function consume(event: KeyboardEvent) {
  event.preventDefault();
  event.stopImmediatePropagation();
}
