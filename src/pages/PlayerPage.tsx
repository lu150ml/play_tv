import type Hls from "hls.js";
import { ArrowLeft, Heart, Plus, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { CatalogRail } from "../components/CatalogRail";
import { PlayerControls } from "../components/PlayerControls";
import { getContentById } from "../services/catalogService";
import {
  getProgressRatio,
  getRemainingSeconds,
  savePlaybackProgress
} from "../services/playbackService";
import { loadXtreamSeriesEpisodes } from "../services/xtreamService";
import { useLibraryStore } from "../stores/libraryStore";
import type { Episode } from "../types/catalog";
import { formatDuration, formatRemainingTime } from "../utils/format";

export function PlayerPage() {
  const { contentId } = useParams();
  const catalog = useLibraryStore((state) => state.catalog);
  const connection = useLibraryStore((state) => state.connection);
  const item = contentId ? getContentById(contentId, catalog) : undefined;
  const playback = useLibraryStore((state) => state.playback);
  const storeProgress = useLibraryStore((state) => state.saveProgress);
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const isFavorite = useLibraryStore((state) => (contentId ? state.isFavorite(contentId) : false));
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaDuration, setMediaDuration] = useState<number | undefined>();
  const [mediaError, setMediaError] = useState<string | undefined>();
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const [episodeError, setEpisodeError] = useState<string | undefined>();
  const [lastInteractionAt, setLastInteractionAt] = useState(Date.now());
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [seriesEpisodes, setSeriesEpisodes] = useState<Episode[]>([]);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | undefined>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerShellRef = useRef<HTMLElement | null>(null);
  const selectedEpisode = useMemo(
    () => seriesEpisodes.find((episode) => episode.id === selectedEpisodeId),
    [selectedEpisodeId, seriesEpisodes]
  );
  const activeStreamUrl = selectedEpisode?.streamUrl ?? item?.streamUrl;
  const durationSeconds =
    mediaDuration ?? selectedEpisode?.durationSeconds ?? item?.durationSeconds ?? 0;
  const activePlaybackId = selectedEpisode?.id ?? contentId;
  const activePlayback = activePlaybackId ? playback[activePlaybackId] : undefined;
  const [positionSeconds, setPositionSeconds] = useState(0);
  const canSeek = durationSeconds > 0;
  const remainingLabel = formatRemainingTime(
    getRemainingSeconds(
      durationSeconds > 0
        ? {
            contentId: activePlaybackId ?? "active",
            positionSeconds,
            durationSeconds,
            updatedAt: new Date().toISOString()
          }
        : undefined
    )
  );
  const currentEpisodeIndex = selectedEpisode
    ? seriesEpisodes.findIndex((episode) => episode.id === selectedEpisode.id)
    : -1;
  const nextEpisode =
    currentEpisodeIndex >= 0 ? seriesEpisodes[currentEpisodeIndex + 1] : undefined;
  const shouldShowControls = !isPlaying || Boolean(mediaError) || areControlsVisible;

  const related = useMemo(
    () =>
      item
        ? catalog
            .filter((candidate) => candidate.id !== item.id)
            .filter((candidate) => candidate.genres.some((genre) => item.genres.includes(genre)))
            .slice(0, 5)
        : [],
    [catalog, item]
  );

  useEffect(() => {
    let isCancelled = false;

    if (item?.type !== "series") {
      setSeriesEpisodes([]);
      setSelectedEpisodeId(undefined);
      setEpisodeError(undefined);
      return undefined;
    }

    if (item.source !== "xtream" || !item.providerId) {
      return undefined;
    }

    if (!connection) {
      setEpisodeError("Volte ao login para recarregar a conexao antes de abrir episodios.");
      return undefined;
    }

    setIsLoadingEpisodes(true);
    setEpisodeError(undefined);

    void loadXtreamSeriesEpisodes(connection, item.providerId)
      .then((episodes) => {
        if (isCancelled) {
          return;
        }

        setSeriesEpisodes(episodes);
        setSelectedEpisodeId(episodes[0]?.id);

        if (episodes.length === 0) {
          setEpisodeError("O servidor retornou a serie, mas nao retornou episodios.");
        }
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        setEpisodeError(
          error instanceof Error ? error.message : "Nao foi possivel carregar os episodios."
        );
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingEpisodes(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [connection, item]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !activeStreamUrl) {
      return undefined;
    }

    setMediaError(undefined);
    setMediaDuration(undefined);

    let hls: Hls | undefined;
    let isDisposed = false;
    const isHlsStream = activeStreamUrl.includes(".m3u8");

    if (isHlsStream && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = activeStreamUrl;
    } else if (isHlsStream) {
      void import("hls.js").then(({ default: HlsPlayer }) => {
        if (isDisposed) {
          return;
        }

        if (!HlsPlayer.isSupported()) {
          setMediaError("Este navegador nao oferece suporte a HLS para este stream.");
          return;
        }

        hls = new HlsPlayer({
          enableWorker: true,
          lowLatencyMode: item?.type === "channel"
        });
        hls.loadSource(activeStreamUrl);
        hls.attachMedia(video);
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setMediaError(
              "O navegador nao conseguiu carregar este HLS. Em IPTV isso geralmente acontece por CORS, stream offline ou URL expirada."
            );
            hls?.destroy();
          }
        });
      });
    } else {
      video.src = activeStreamUrl;
    }

    return () => {
      isDisposed = true;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [activeStreamUrl, item?.type]);

  useEffect(() => {
    const nextPosition = activePlayback?.positionSeconds ?? 0;
    setPositionSeconds(nextPosition);

    if (videoRef.current && canSeek) {
      videoRef.current.currentTime = nextPosition;
    }
  }, [activePlayback?.positionSeconds, activePlaybackId, canSeek]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (isPlaying) {
      void video.play().catch(() => {
        setIsPlaying(false);
      });
      return;
    }

    video.pause();
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || mediaError) {
      setAreControlsVisible(true);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setAreControlsVisible(false);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [isPlaying, lastInteractionAt, mediaError]);

  if (!item) {
    return <Navigate to="/catalog" replace />;
  }
  const content = item;

  function handleSeek(nextPosition: number) {
    if (videoRef.current && canSeek) {
      videoRef.current.currentTime = nextPosition;
    }

    setPositionSeconds(nextPosition);
    const progress = savePlaybackProgress({
      contentId: selectedEpisode?.id ?? content.id,
      positionSeconds: nextPosition,
      durationSeconds: durationSeconds || content.durationSeconds || 0
    });
    storeProgress(progress);

    if (selectedEpisode) {
      storeProgress(
        savePlaybackProgress({
          contentId: content.id,
          positionSeconds: nextPosition,
          durationSeconds: durationSeconds || selectedEpisode.durationSeconds || 0
        })
      );
    }
  }

  function handleTimeUpdate() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const nextPosition = Math.floor(video.currentTime);
    setPositionSeconds(nextPosition);

    if (nextPosition % 5 === 0) {
      storeProgress(
        savePlaybackProgress({
          contentId: selectedEpisode?.id ?? content.id,
          positionSeconds: nextPosition,
          durationSeconds:
            durationSeconds || selectedEpisode?.durationSeconds || content.durationSeconds || 0
        })
      );

      if (selectedEpisode) {
        storeProgress(
          savePlaybackProgress({
            contentId: content.id,
            positionSeconds: nextPosition,
            durationSeconds:
              durationSeconds || selectedEpisode.durationSeconds || content.durationSeconds || 0
          })
        );
      }
    }
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;

    if (!video || !Number.isFinite(video.duration)) {
      return;
    }

    setMediaDuration(Math.floor(video.duration));

    if (activePlayback?.positionSeconds) {
      video.currentTime = activePlayback.positionSeconds;
    }
  }

  function handleNextEpisode() {
    if (!nextEpisode) {
      return;
    }

    const nextProgress = playback[nextEpisode.id];
    setSelectedEpisodeId(nextEpisode.id);
    setPositionSeconds(nextProgress?.positionSeconds ?? 0);
    setIsPlaying(true);
    revealControls();
  }

  function handleEnded() {
    if (nextEpisode) {
      handleNextEpisode();
      return;
    }

    setIsPlaying(false);
  }

  function revealControls() {
    setAreControlsVisible(true);
    setLastInteractionAt(Date.now());
  }

  async function handleFullscreen() {
    const element = playerShellRef.current;

    if (!element) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await element.requestFullscreen();
    } catch {
      setMediaError("Nao foi possivel ativar tela cheia neste navegador.");
    }
  }

  return (
    <div className="mx-auto max-w-canvas">
      <Link
        to="/catalog"
        data-focusable="true"
        className="focus-card mb-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface-container px-3 py-2 text-sm text-on-surface-variant"
      >
        <ArrowLeft aria-hidden="true" size={18} />
        Catalog
      </Link>

      <section
        ref={playerShellRef}
        onClick={revealControls}
        onFocusCapture={() => {
          revealControls();
        }}
        onKeyDown={revealControls}
        onMouseMove={revealControls}
        onPointerMove={revealControls}
        onTouchStart={revealControls}
        className="relative mb-8 aspect-video min-h-72 overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl"
      >
        {!activeStreamUrl ? (
          <div className={["absolute inset-0 bg-gradient-to-br", content.backdropTone].join(" ")} />
        ) : null}
        {activeStreamUrl ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full bg-black object-contain"
            poster={content.imageUrl}
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={handleEnded}
            onError={() =>
              setMediaError(
                "Nao foi possivel iniciar esta midia. Confira se o link do servidor esta ativo e se o formato e aceito no navegador."
              )
            }
          />
        ) : null}
        {content.imageUrl ? (
          <img
            src={content.imageUrl}
            alt=""
            className={[
              "absolute inset-0 h-full w-full object-cover opacity-50",
              activeStreamUrl ? "hidden" : ""
            ].join(" ")}
          />
        ) : null}
        {!activeStreamUrl ? (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.15),transparent_22%),linear-gradient(180deg,transparent,rgba(0,0,0,0.76))]" />
        ) : null}
        <div
          className={[
            "absolute left-4 top-4 rounded-full border border-white/10 bg-surface-container/70 px-3 py-1 font-mono text-xs uppercase transition-opacity duration-300",
            shouldShowControls ? "opacity-100" : "opacity-0"
          ].join(" ")}
        >
          {activeStreamUrl ? "Now Playing" : "Preview"}
        </div>
        {mediaError ? (
          <div className="absolute left-4 right-4 top-16 rounded-xl border border-error/40 bg-error-container/70 p-4 text-sm leading-6 text-error backdrop-blur-xl">
            {mediaError}
          </div>
        ) : null}
        <PlayerControls
          isPlaying={isPlaying}
          isVisible={shouldShowControls}
          positionSeconds={positionSeconds}
          durationSeconds={durationSeconds}
          hasNextEpisode={Boolean(nextEpisode)}
          isLive={!canSeek && content.type === "channel"}
          remainingLabel={content.type === "channel" ? undefined : remainingLabel}
          onNextEpisode={handleNextEpisode}
          onTogglePlay={() => setIsPlaying((current) => !current)}
          onSeek={handleSeek}
          onFullscreen={() => {
            void handleFullscreen();
          }}
        />
      </section>

      <section className="mb-8 grid gap-8 xl:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {content.genres.map((genre) => (
              <span
                key={genre}
                className="rounded-md border border-primary-container/20 bg-primary-container/10 px-2 py-1 font-mono text-xs uppercase text-primary-container"
              >
                {genre}
              </span>
            ))}
          </div>
          <h1 className="font-display text-4xl font-bold text-on-surface lg:text-5xl">
            {content.title}
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-on-surface-variant">
            {content.description}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <ActionButton label="Add to list">
              <Plus aria-hidden="true" size={20} />
            </ActionButton>
            <ActionButton label="Share">
              <Share2 aria-hidden="true" size={20} />
            </ActionButton>
            <button
              type="button"
              data-focusable="true"
              onClick={() => toggleFavorite(content.id)}
              className="focus-card flex h-12 items-center gap-2 rounded-lg border border-white/10 bg-surface-container px-4 text-on-surface"
            >
              <Heart
                aria-hidden="true"
                className={isFavorite ? "fill-error text-error" : "text-on-surface-variant"}
                size={20}
              />
              Favorite
            </button>
          </div>

          {content.type === "series" ? (
            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between gap-4">
                <h2 className="font-display text-2xl font-bold text-on-surface">Episodios</h2>
                {isLoadingEpisodes ? (
                  <span className="font-mono text-xs uppercase text-on-surface-variant">
                    Carregando...
                  </span>
                ) : null}
              </div>
              {episodeError ? (
                <div className="rounded-xl border border-error/40 bg-error-container/30 p-4 text-sm leading-6 text-error">
                  {episodeError}
                </div>
              ) : null}
              {seriesEpisodes.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {seriesEpisodes.map((episode) => (
                    <button
                      key={episode.id}
                      type="button"
                      data-focusable="true"
                      aria-pressed={selectedEpisode?.id === episode.id}
                      onClick={() => {
                        setSelectedEpisodeId(episode.id);
                        setPositionSeconds(0);
                        setIsPlaying(false);
                      }}
                      className={[
                        "focus-card relative overflow-hidden rounded-xl border p-4 text-left",
                        selectedEpisode?.id === episode.id
                          ? "border-primary-container bg-primary-container/15 text-primary shadow-glow"
                          : "border-white/10 bg-surface-container/70 text-on-surface"
                      ].join(" ")}
                    >
                      <span className="font-mono text-xs uppercase text-on-surface-variant">
                        S{episode.season} E{episode.episode}
                      </span>
                      <span className="mt-1 block font-display text-lg font-semibold">
                        {episode.title}
                      </span>
                      <span className="mt-2 line-clamp-2 block text-sm leading-6 text-on-surface-variant">
                        {episode.description}
                      </span>
                      <EpisodeProgress
                        positionSeconds={playback[episode.id]?.positionSeconds}
                        durationSeconds={
                          playback[episode.id]?.durationSeconds || episode.durationSeconds
                        }
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-3 xl:grid-cols-1">
          <InfoTile label="Type" value={content.type} />
          <InfoTile label="Duration" value={formatDuration(durationSeconds)} />
          <InfoTile label="Quality" value={content.quality.join(", ")} />
          <InfoTile label="Year" value={String(content.year ?? "Live")} />
        </dl>
      </section>

      <CatalogRail title="Up Next" items={related} />
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  children: React.ReactNode;
}

function ActionButton({ label, children }: ActionButtonProps) {
  return (
    <button
      type="button"
      data-focusable="true"
      className="focus-card flex h-12 items-center gap-2 rounded-lg border border-white/10 bg-surface-container px-4 text-on-surface"
    >
      {children}
      {label}
    </button>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface-container/60 p-4">
      <dt className="font-mono text-xs uppercase text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-display text-lg font-semibold text-on-surface">{value}</dd>
    </div>
  );
}

function EpisodeProgress({
  positionSeconds,
  durationSeconds
}: {
  positionSeconds?: number;
  durationSeconds?: number;
}) {
  if (!positionSeconds || !durationSeconds) {
    return null;
  }

  const progress = getProgressRatio({
    contentId: "episode",
    positionSeconds,
    durationSeconds,
    updatedAt: new Date().toISOString()
  });
  const remainingLabel = formatRemainingTime(durationSeconds - positionSeconds);

  return (
    <>
      <span className="mt-3 block font-mono text-xs uppercase text-primary-container">
        {remainingLabel}
      </span>
      <span className="absolute bottom-0 left-0 h-1 w-full bg-white/15">
        <span
          className="block h-full bg-primary-container"
          style={{ width: `${progress * 100}%` }}
        />
      </span>
    </>
  );
}
