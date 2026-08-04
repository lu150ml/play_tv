import { ArrowLeft, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { getContentById } from "../services/catalogService";
import { getProgressRatio, getRemainingSeconds } from "../services/playbackService";
import {
  getContinueEpisode,
  groupEpisodesBySeason,
  invalidateSeriesDetails,
  isSeries,
  loadSeriesArtwork,
  loadSeriesEpisodes
} from "../services/seriesService";
import { getServerAccountKey, useLibraryStore } from "../stores/libraryStore";
import type { Episode } from "../types/catalog";
import { formatDuration, formatRemainingTime } from "../utils/format";

export function SeriesPage() {
  const navigate = useNavigate();
  const { seriesId } = useParams();
  const catalog = useLibraryStore((state) => state.catalog);
  const connection = useLibraryStore((state) => state.connection);
  const playback = useLibraryStore((state) => state.playback);
  const setSeriesEpisodes = useLibraryStore((state) => state.setSeriesEpisodes);
  const setSeriesArtwork = useLibraryStore((state) => state.setSeriesArtwork);
  const item = seriesId ? getContentById(seriesId, catalog) : undefined;
  const series = isSeries(item) ? item : undefined;
  const [episodes, setEpisodes] = useState<Episode[]>(() => series?.episodes ?? []);
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>();
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(
    () => Boolean(series?.source === "xtream" && series.episodes.length === 0)
  );
  const [episodeError, setEpisodeError] = useState<string | undefined>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const connectionKey = connection ? getServerAccountKey(connection) : "";
  const providerId = series?.providerId;
  const source = series?.source;

  useEffect(() => {
    let isCancelled = false;

    if (!seriesId) return undefined;

    const currentItem = getContentById(seriesId, useLibraryStore.getState().catalog);
    const currentSeries = isSeries(currentItem) ? currentItem : undefined;
    if (!currentSeries) return undefined;

    const openEpisode = (nextEpisodes: Episode[]) => {
      const target = getContinueEpisode(nextEpisodes, useLibraryStore.getState().playback);
      if (target) void navigate(`/watch/${currentSeries.id}/${target.id}`, { replace: true });
    };

    if (!providerId || source !== "xtream") {
      setEpisodes(currentSeries.episodes);
      openEpisode(currentSeries.episodes);
      return undefined;
    }

    if (currentSeries.episodes.length > 0 && loadAttempt === 0) {
      setEpisodes(currentSeries.episodes);
      openEpisode(currentSeries.episodes);
      return undefined;
    }

    setIsLoadingEpisodes(true);
    setEpisodeError(undefined);
    if (!currentSeries.imageUrl) {
      void loadSeriesArtwork(currentSeries, connection)
        .then((imageUrl) => { if (!isCancelled && imageUrl) setSeriesArtwork(currentSeries.id, imageUrl); })
        .catch(() => {});
    }

    void loadSeriesEpisodes(currentSeries, connection)
      .then((nextEpisodes) => {
        if (isCancelled) {
          return;
        }

        setEpisodes(nextEpisodes);
        setSeriesEpisodes(currentSeries.id, nextEpisodes);
        setSelectedSeason((currentSeason) => currentSeason ?? nextEpisodes[0]?.season);

        if (nextEpisodes.length === 0) {
          setEpisodeError("O servidor retornou a serie, mas nao retornou episodios.");
        } else {
          openEpisode(nextEpisodes);
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
  }, [connection, connectionKey, loadAttempt, navigate, providerId, seriesId, setSeriesArtwork, setSeriesEpisodes, source]);

  const seasonGroups = useMemo(() => groupEpisodesBySeason(episodes), [episodes]);
  const activeSeason = selectedSeason ?? seasonGroups[0]?.season;
  const activeEpisodes =
    seasonGroups.find((group) => group.season === activeSeason)?.episodes ?? [];
  const continueEpisode = useMemo(
    () => getContinueEpisode(episodes, playback),
    [episodes, playback]
  );
  const continueProgress = continueEpisode ? playback[continueEpisode.id] : undefined;
  const continueLabel = continueProgress?.positionSeconds ? "Continuar" : "Assistir";

  if (!item) {
    return <Navigate to="/catalog/series" replace />;
  }

  if (!series) {
    return <Navigate to={`/watch/${item.id}`} replace />;
  }

  if (isLoadingEpisodes && episodes.length === 0) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-canvas items-center justify-center">
        <div className="rounded-xl border border-white/10 bg-surface-container px-6 py-5 font-mono text-sm uppercase text-on-surface-variant">
          Carregando episodios...
        </div>
      </div>
    );
  }

  if (episodeError && episodes.length === 0) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-canvas items-center justify-center">
        <div className="max-w-lg rounded-xl border border-error/40 bg-error-container/30 p-5 text-error">
          <p>{episodeError}</p>
          <button
            type="button"
            data-focusable="true"
            onClick={() => {
              invalidateSeriesDetails(series, connection);
              setLoadAttempt((attempt) => attempt + 1);
            }}
            className="focus-card mt-4 rounded-lg border border-error/40 px-4 py-2 font-semibold"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-canvas">
      <Link
        to="/catalog/series"
        data-focusable="true"
        className="focus-card mb-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface-container px-3 py-2 text-sm text-on-surface-variant"
      >
        <ArrowLeft aria-hidden="true" size={18} />
        Series
      </Link>

      <section
        className={[
          "mb-8 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br p-5 shadow-2xl lg:p-8",
          series.backdropTone
        ].join(" ")}
      >
        <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              {series.genres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs uppercase text-on-surface"
                >
                  {genre}
                </span>
              ))}
            </div>
            <h1 className="font-display text-4xl font-bold text-on-surface lg:text-6xl">
              {series.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-on-surface-variant lg:text-lg">
              {series.description}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {continueEpisode ? (
                <Link
                  to={`/watch/${series.id}/${continueEpisode.id}`}
                  data-focusable="true"
                  className="focus-card inline-flex h-12 items-center gap-2 rounded-lg border border-primary-container/40 bg-primary px-4 font-display font-bold text-on-primary shadow-glow"
                >
                  {continueProgress?.positionSeconds ? (
                    <RotateCcw aria-hidden="true" size={19} />
                  ) : (
                    <Play aria-hidden="true" size={19} />
                  )}
                  {continueLabel}
                </Link>
              ) : null}
              {seasonGroups.length > 0 ? (
                <span className="inline-flex h-12 items-center rounded-lg border border-white/10 bg-surface-container px-4 font-mono text-xs uppercase text-on-surface-variant">
                  {seasonGroups.length} temporadas
                </span>
              ) : null}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 xl:grid-cols-1">
            <InfoTile label="Tipo" value="Serie" />
            <InfoTile label="Ano" value={String(series.year ?? "N/A")} />
            <InfoTile label="Qualidade" value={series.quality.join(", ")} />
            <InfoTile label="Episodios" value={String(episodes.length || series.episodes.length)} />
          </dl>
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-bold text-on-surface">Temporadas</h2>
          {isLoadingEpisodes ? (
            <span className="font-mono text-xs uppercase text-on-surface-variant">
              Carregando...
            </span>
          ) : null}
        </div>
        {episodeError ? (
          <div className="mb-4 rounded-xl border border-error/40 bg-error-container/30 p-4 text-sm leading-6 text-error">
            {episodeError}
          </div>
        ) : null}
        <div className="mb-5 flex gap-3 overflow-x-auto pb-2">
          {seasonGroups.map((group) => (
            <button
              key={group.season}
              type="button"
              data-focusable="true"
              aria-pressed={group.season === activeSeason}
              onClick={() => setSelectedSeason(group.season)}
              className={[
                "focus-card shrink-0 rounded-lg border px-4 py-3 font-display text-sm font-semibold",
                group.season === activeSeason
                  ? "border-primary-container bg-primary-container/15 text-primary shadow-glow"
                  : "border-white/10 bg-surface-container/70 text-on-surface-variant"
              ].join(" ")}
            >
              Temporada {group.season}
            </button>
          ))}
        </div>

        {activeEpisodes.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {activeEpisodes.map((episode) => (
              <EpisodeCard key={episode.id} episode={episode} seriesId={series.id} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function EpisodeCard({ episode, seriesId }: { episode: Episode; seriesId: string }) {
  const progress = useLibraryStore((state) => state.playback[episode.id]);
  const progressRatio = getProgressRatio(progress);
  const remainingLabel = formatRemainingTime(getRemainingSeconds(progress));
  const actionLabel = progress?.positionSeconds ? "Continuar" : "Assistir";

  return (
    <Link
      to={`/watch/${seriesId}/${episode.id}`}
      data-focusable="true"
      aria-label={`S${episode.season} E${episode.episode} ${episode.title}`}
      className="focus-card relative overflow-hidden rounded-xl border border-white/10 bg-surface-container/70 p-4 text-left text-on-surface"
    >
      <span className="font-mono text-xs uppercase text-on-surface-variant">
        S{episode.season} E{episode.episode} · {formatDuration(episode.durationSeconds)}
      </span>
      <span className="mt-1 block font-display text-lg font-semibold">{episode.title}</span>
      <span className="mt-2 line-clamp-2 block text-sm leading-6 text-on-surface-variant">
        {episode.description}
      </span>
      <span className="mt-4 inline-flex items-center gap-2 font-mono text-xs uppercase text-primary-container">
        <Play aria-hidden="true" size={15} />
        {remainingLabel ?? actionLabel}
      </span>
      {progressRatio > 0 ? (
        <span className="absolute bottom-0 left-0 h-1 w-full bg-white/15">
          <span
            className="block h-full bg-primary-container"
            style={{ width: `${progressRatio * 100}%` }}
          />
        </span>
      ) : null}
    </Link>
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
