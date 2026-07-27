import {
  Captions,
  Expand,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Volume2,
  VolumeX
} from "lucide-react";

import { formatPlaybackTime } from "../utils/format";

interface PlayerControlsProps {
  isPlaying: boolean;
  isVisible: boolean;
  positionSeconds: number;
  durationSeconds: number;
  isLive?: boolean;
  hasNextEpisode?: boolean;
  remainingLabel?: string;
  captionsActive?: boolean;
  onTogglePlay: () => void;
  onNextEpisode?: () => void;
  onSeek: (positionSeconds: number) => void;
  onFullscreen: () => void;
  onToggleCaptions?: () => void;
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}

export function PlayerControls({
  isPlaying,
  isVisible,
  positionSeconds,
  durationSeconds,
  isLive = false,
  hasNextEpisode = false,
  remainingLabel,
  captionsActive = false,
  onTogglePlay,
  onNextEpisode,
  onSeek,
  onFullscreen,
  onToggleCaptions,
  volume,
  muted,
  onVolumeChange,
  onToggleMute
}: PlayerControlsProps) {
  return (
    <div
      data-testid="player-controls"
      className={[
        "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-4 transition-opacity duration-300 lg:p-8",
        isVisible ? "opacity-100" : "pointer-events-none opacity-0"
      ].join(" ")}
    >
      <div className="mb-4 flex items-center gap-4">
        <span className="w-12 text-right font-mono text-xs text-on-surface-variant">
          {formatPlaybackTime(positionSeconds)}
        </span>
        <input
          data-focusable="true"
          aria-label="Seek"
          type="range"
          min={0}
          max={Math.max(durationSeconds, 1)}
          value={isLive ? 1 : positionSeconds}
          disabled={isLive}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="h-1 flex-1 accent-primary-container disabled:opacity-60"
        />
        <span className="w-12 font-mono text-xs text-on-surface-variant">
          {isLive ? "LIVE" : formatPlaybackTime(durationSeconds)}
        </span>
      </div>
      {remainingLabel ? (
        <p className="-mt-2 mb-3 text-right font-mono text-xs uppercase text-on-surface-variant">
          {remainingLabel}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconButton label={isPlaying ? "Pause" : "Play"} onClick={onTogglePlay}>
            {isPlaying ? (
              <Pause aria-hidden="true" size={22} />
            ) : (
              <Play aria-hidden="true" size={22} />
            )}
          </IconButton>
          <IconButton label="Restart" onClick={() => onSeek(0)}>
            <RotateCcw aria-hidden="true" size={20} />
          </IconButton>
          {hasNextEpisode && onNextEpisode ? (
            <IconButton label="Next episode" onClick={onNextEpisode}>
              <SkipForward aria-hidden="true" size={20} />
            </IconButton>
          ) : null}
          <IconButton label={muted ? "Ativar som" : "Silenciar"} onClick={onToggleMute}>
            {muted ? (
              <VolumeX aria-hidden="true" size={20} />
            ) : (
              <Volume2 aria-hidden="true" size={20} />
            )}
          </IconButton>
          <input
            data-focusable="true"
            aria-label="Volume"
            aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            className="h-2 w-28 cursor-pointer accent-primary-container"
          />
          <span className="w-9 text-right font-mono text-xs text-on-surface-variant">
            {Math.round((muted ? 0 : volume) * 100)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <IconButton
            label="Captions"
            active={captionsActive}
            onClick={onToggleCaptions ?? (() => undefined)}
          >
            <Captions aria-hidden="true" size={20} />
          </IconButton>
          <IconButton label="Fullscreen" onClick={onFullscreen}>
            <Expand aria-hidden="true" size={20} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}

function IconButton({ label, onClick, children, active = false }: IconButtonProps) {
  return (
    <button
      type="button"
      data-focusable="true"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "focus-card flex h-10 w-10 items-center justify-center rounded-lg border text-on-surface",
        active
          ? "border-primary-container/60 bg-primary-container/20 text-primary"
          : "border-white/10 bg-black/25"
      ].join(" ")}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
