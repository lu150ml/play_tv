import {
  Captions,
  Expand,
  Pause,
  Play,
  RotateCcw,
  Settings,
  SkipForward,
  Volume2
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
  onTogglePlay: () => void;
  onNextEpisode?: () => void;
  onSeek: (positionSeconds: number) => void;
  onFullscreen: () => void;
}

export function PlayerControls({
  isPlaying,
  isVisible,
  positionSeconds,
  durationSeconds,
  isLive = false,
  hasNextEpisode = false,
  remainingLabel,
  onTogglePlay,
  onNextEpisode,
  onSeek,
  onFullscreen
}: PlayerControlsProps) {
  const progress = durationSeconds > 0 ? (positionSeconds / durationSeconds) * 100 : 0;

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
          <IconButton label="Volume" onClick={() => undefined}>
            <Volume2 aria-hidden="true" size={20} />
          </IconButton>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            data-focusable="true"
            className="focus-card rounded-lg border border-white/20 bg-black/30 px-3 py-2 font-mono text-xs text-on-surface"
          >
            4K
          </button>
          <IconButton label="Captions" onClick={() => undefined}>
            <Captions aria-hidden="true" size={20} />
          </IconButton>
          <IconButton label="Player settings" onClick={() => undefined}>
            <Settings aria-hidden="true" size={20} />
          </IconButton>
          <IconButton label="Fullscreen" onClick={onFullscreen}>
            <Expand aria-hidden="true" size={20} />
          </IconButton>
        </div>
      </div>

      <div className="mt-3 h-1 rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-primary-container"
          style={{ width: `${isLive ? 100 : progress}%` }}
        />
      </div>
    </div>
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function IconButton({ label, onClick, children }: IconButtonProps) {
  return (
    <button
      type="button"
      data-focusable="true"
      onClick={onClick}
      className="focus-card flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-black/25 text-on-surface"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
