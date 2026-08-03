import { Heart, Play, Tv, X } from "lucide-react";
import { Link } from "react-router-dom";

import {
  getProgressRatio,
  getRemainingSeconds,
  shouldShowPlaybackProgress
} from "../services/playbackService";
import { useLibraryStore } from "../stores/libraryStore";
import { getContinueEpisode } from "../services/seriesService";
import { SecureImage } from "./SecureImage";
import type { ContentItem } from "../types/catalog";
import { formatDuration, formatRemainingTime } from "../utils/format";

interface ContentCardProps {
  item: ContentItem;
  compact?: boolean;
  onRemove?: () => void;
}

export function ContentCard({ item, compact = false, onRemove }: ContentCardProps) {
  const allPlayback = useLibraryStore((state) => state.playback);
  const continueEpisode =
    item.type === "series" ? getContinueEpisode(item.episodes, allPlayback) : undefined;
  const playback = allPlayback[item.id];
  const isFavorite = useLibraryStore((state) => state.isFavorite(item.id));
  const showProgress = shouldShowPlaybackProgress(item.type);
  const progress = showProgress ? getProgressRatio(playback) : 0;
  const remainingLabel = showProgress
    ? formatRemainingTime(getRemainingSeconds(playback))
    : undefined;
  const href = item.type === "series" ? `/series/${item.id}` : `/watch/${item.id}`;
  const isPoster = item.type !== "channel";

  return (
    <Link
      to={href}
      data-focusable="true"
      data-content-id={item.id}
      aria-label={`${item.title} ${item.type}`}
      className={[
        "focus-card group block overflow-hidden rounded-lg border border-white/10 bg-surface-container/60 text-left",
        compact ? (isPoster ? "w-48 shrink-0" : "w-72 shrink-0") : "min-h-full"
      ].join(" ")}
    >
      <div
        className={[
          "media-poster relative overflow-hidden bg-gradient-to-br",
          isPoster ? "aspect-[2/3]" : "aspect-video",
          item.posterTone
        ].join(" ")}
      >
        {item.imageUrl ? (
          <SecureImage
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-85 transition duration-500 group-hover:scale-[1.03]"
          />
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.12),transparent)] opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="rounded-md border border-white/10 bg-black/35 px-2 py-1 font-mono text-[11px] uppercase text-on-surface">
            {item.type}
          </span>
          <span className="rounded-md border border-white/10 bg-black/35 px-2 py-1 font-mono text-[11px] uppercase text-on-surface">
            {item.quality[0]}
          </span>
        </div>
        {onRemove ? (
          <button
            type="button"
            data-focusable="true"
            aria-label={`Remover ${item.title} de Continue Watching`}
            title="Remover de Continue Watching"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
            className="focus-card absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/45 text-on-surface opacity-0 transition-opacity hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <X aria-hidden="true" size={16} />
          </button>
        ) : null}
        <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-md bg-black/40 px-2 py-1 font-mono text-xs">
          {item.type === "channel" ? (
            <Tv aria-hidden="true" size={14} />
          ) : (
            <Play aria-hidden="true" size={14} />
          )}
          {formatDuration(item.durationSeconds)}
        </div>
        {progress > 0 ? (
          <div className="absolute bottom-0 left-0 h-1 w-full bg-white/20">
            <div className="h-full bg-primary-container" style={{ width: `${progress * 100}%` }} />
          </div>
        ) : null}
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 font-display text-base font-semibold text-on-surface">
            {item.title}
          </h3>
          <Heart
            aria-hidden="true"
            className={isFavorite ? "fill-error text-error" : "text-on-surface-variant"}
            size={18}
          />
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-on-surface-variant">
          {item.description}
        </p>
        {remainingLabel ? (
          <p className="mt-3 font-mono text-xs uppercase text-primary-container">
            {remainingLabel}
          </p>
        ) : null}
        {continueEpisode && allPlayback[continueEpisode.id]?.positionSeconds ? (
          <p className="mt-2 font-mono text-xs uppercase text-primary-container">
            Continuar S{continueEpisode.season} E{continueEpisode.episode}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
