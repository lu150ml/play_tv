import { Play, Tv, X } from "lucide-react";
import { Link } from "react-router-dom";

import {
  getProgressRatio,
  getRemainingSeconds,
  shouldShowPlaybackProgress
} from "../services/playbackService";
import { useLibraryStore } from "../stores/libraryStore";
import type { ContentItem } from "../types/catalog";
import { formatRemainingTime } from "../utils/format";

interface ContentCardProps {
  item: ContentItem;
  compact?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
}

export function ContentCard({ item, compact = false, onRemove, removeLabel }: ContentCardProps) {
  const playback = useLibraryStore((state) => state.playback[item.id]);
  const showProgress = shouldShowPlaybackProgress(item.type);
  const progress = showProgress ? getProgressRatio(playback) : 0;
  const remainingLabel = showProgress
    ? formatRemainingTime(getRemainingSeconds(playback))
    : undefined;
  const href = item.type === "series" ? `/series/${item.id}` : `/watch/${item.id}`;
  const isChannel = item.type === "channel";

  return (
    <Link
      to={href}
      data-focusable="true"
      aria-label={`${item.title} ${item.type}`}
      className={[
        "poster-card group block text-left",
        compact ? "w-36 shrink-0 sm:w-40 lg:w-44" : "w-full"
      ].join(" ")}
    >
      <div
        className={[
          "media-poster relative overflow-hidden rounded-md bg-gradient-to-br shadow-lg",
          isChannel ? "aspect-video" : "aspect-[2/3]",
          item.posterTone
        ].join(" ")}
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className={[
              "absolute inset-0 h-full w-full",
              isChannel ? "object-contain p-4" : "object-cover"
            ].join(" ")}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-3 text-center">
            <span className="line-clamp-3 font-display text-sm font-semibold text-on-surface/80">
              {item.title}
            </span>
          </div>
        )}

        {/* Escurece no hover e revela o play */}
        <div className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/40" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-black shadow-xl">
            {isChannel ? (
              <Tv aria-hidden="true" size={22} />
            ) : (
              <Play aria-hidden="true" size={22} className="ml-0.5 fill-black" />
            )}
          </span>
        </div>

        {onRemove ? (
          <button
            type="button"
            aria-label={removeLabel ?? "Remover"}
            title={removeLabel ?? "Remover"}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition hover:bg-error focus:opacity-100 group-hover:opacity-100"
          >
            <X aria-hidden="true" size={15} />
          </button>
        ) : null}

        {isChannel ? (
          <span className="absolute left-2 top-2 rounded bg-error px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Live
          </span>
        ) : null}

        {progress > 0 ? (
          <div className="absolute bottom-0 left-0 h-1 w-full bg-white/25">
            <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
          </div>
        ) : null}
      </div>

      <div className="mt-2 px-0.5">
        <h3 className="line-clamp-1 text-sm font-semibold text-on-surface group-hover:text-white">
          {item.title}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-on-surface-variant">
          {remainingLabel ?? item.genres[0] ?? item.quality[0]}
        </p>
      </div>
    </Link>
  );
}
