import { Heart, Play, Tv } from "lucide-react";
import { Link } from "react-router-dom";

import {
  getProgressRatio,
  getRemainingSeconds,
  shouldShowPlaybackProgress
} from "../services/playbackService";
import { useLibraryStore } from "../stores/libraryStore";
import type { ContentItem } from "../types/catalog";
import { formatDuration, formatRemainingTime } from "../utils/format";

interface ContentCardProps {
  item: ContentItem;
  compact?: boolean;
}

export function ContentCard({ item, compact = false }: ContentCardProps) {
  const playback = useLibraryStore((state) => state.playback[item.id]);
  const isFavorite = useLibraryStore((state) => state.isFavorite(item.id));
  const showProgress = shouldShowPlaybackProgress(item.type);
  const progress = showProgress ? getProgressRatio(playback) : 0;
  const remainingLabel = showProgress
    ? formatRemainingTime(getRemainingSeconds(playback))
    : undefined;
  const href = item.type === "series" ? `/series/${item.id}` : `/watch/${item.id}`;

  return (
    <Link
      to={href}
      data-focusable="true"
      aria-label={`${item.title} ${item.type}`}
      className={[
        "focus-card group block overflow-hidden rounded-xl border border-white/10 bg-surface-container/70 text-left",
        compact ? "w-72 shrink-0" : "min-h-full"
      ].join(" ")}
    >
      <div
        className={[
          "media-poster relative aspect-video overflow-hidden bg-gradient-to-br",
          item.posterTone
        ].join(" ")}
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-75"
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

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 font-display text-lg font-semibold text-on-surface">
            {item.title}
          </h3>
          <Heart
            aria-hidden="true"
            className={isFavorite ? "fill-error text-error" : "text-on-surface-variant"}
            size={18}
          />
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-on-surface-variant">
          {item.description}
        </p>
        {remainingLabel ? (
          <p className="mt-3 font-mono text-xs uppercase text-primary-container">
            {remainingLabel}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
