import { useEffect, useRef, useState, type RefObject } from "react";

import { formatPlaybackTime } from "../utils/format";

const SEEK_STEP_SECONDS = 5;
const FAST_SEEK_STEP_SECONDS = 10;
const FAST_SEEK_WINDOW_MS = 500;
// Segurando a seta: um salto a cada HOLD_STEP_INTERVAL_MS, maior depois de um tempo.
const HOLD_STEP_INTERVAL_MS = 150;
const HOLD_STEP_SECONDS = 10;
const HOLD_FAST_STEP_SECONDS = 30;
const HOLD_FAST_AFTER_MS = 2000;
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
  muted: boolean;
  onSeek: (positionSeconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onTogglePlay: () => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onActivity: () => void;
}

interface HoldState {
  direction: number;
  origin: number;
  target: number;
  committed: number;
  startedAt: number;
  lastStepAt: number;
}

// Um toque = 5s; toques seguidos rápidos na mesma direção = 10s cada.
export function getSeekStep(now: number, lastPressAt: number | undefined, sameDirection: boolean): number {
  if (sameDirection && lastPressAt !== undefined && now - lastPressAt < FAST_SEEK_WINDOW_MS) {
    return FAST_SEEK_STEP_SECONDS;
  }
  return SEEK_STEP_SECONDS;
}

// Salto por repetição enquanto a seta está segurada.
export function getHoldStep(heldForMs: number): number {
  return heldForMs >= HOLD_FAST_AFTER_MS ? HOLD_FAST_STEP_SECONDS : HOLD_STEP_SECONDS;
}

function formatOffset(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}min` : `${minutes}min ${seconds}s`;
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
  // Seta segurada: acumula o destino e só busca no vídeo ao soltar, para não
  // disparar uma busca (e um novo carregamento do stream) a cada repetição.
  const holdRef = useRef<HoldState | undefined>(undefined);
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

    function commitHold() {
      const hold = holdRef.current;
      holdRef.current = undefined;
      if (hold && hold.target !== hold.committed) {
        optionsRef.current.onSeek(hold.target);
      }
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

      const letter = event.key.toLowerCase();
      if (letter === "f") {
        consume(event);
        current.onToggleFullscreen();
        current.onActivity();
        return;
      }

      if (letter === "m") {
        consume(event);
        current.onToggleMute();
        showNotice(current.muted ? "Som ativado" : "Mudo");
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        consume(event);
        if (!current.canSeek) return;

        const direction = event.key === "ArrowRight" ? 1 : -1;
        const now = Date.now();
        const duration = current.durationSeconds || player.duration || 0;
        const hold = holdRef.current;

        if (event.repeat && hold?.direction === direction) {
          current.onActivity();
          if (now - hold.lastStepAt < HOLD_STEP_INTERVAL_MS) return;
          hold.lastStepAt = now;
          hold.target = Math.floor(
            clamp(hold.target + direction * getHoldStep(now - hold.startedAt), 0, duration)
          );
          const offset = Math.abs(hold.target - hold.origin);
          showNotice(
            `${direction > 0 ? "+" : "-"}${formatOffset(offset)} · ${formatPlaybackTime(hold.target)}`
          );
          return;
        }

        // Troca de direção sem soltar a outra seta: aplica o que já foi acumulado.
        commitHold();

        const last = lastSeekRef.current;
        const step = getSeekStep(now, last?.at, last?.direction === direction);
        lastSeekRef.current = { at: now, direction };

        const origin = Math.floor(player.currentTime);
        const nextPosition = Math.floor(clamp(player.currentTime + direction * step, 0, duration));
        current.onSeek(nextPosition);
        holdRef.current = {
          direction,
          origin,
          target: nextPosition,
          committed: nextPosition,
          startedAt: now,
          lastStepAt: now
        };
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

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const direction = event.key === "ArrowRight" ? 1 : -1;
        if (holdRef.current?.direction === direction) commitHold();
      }
    }

    // Capture em window: roda antes do useRemoteNavigation (document) e do
    // comportamento padrão do botão/range focado.
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    // Sem keyup (ex.: Alt+Tab com a seta segurada): aplica ao perder o foco.
    window.addEventListener("blur", commitHold);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", commitHold);
      commitHold();
    };
  }, [enabled]);

  return notice;
}

function consume(event: KeyboardEvent) {
  event.preventDefault();
  event.stopImmediatePropagation();
}
