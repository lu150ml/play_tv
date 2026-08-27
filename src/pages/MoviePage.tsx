import { ArrowLeft, Download, Heart, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { SecureImage } from "../components/SecureImage";
import { downloads } from "../platform/downloads";
import { getContentById } from "../services/catalogService";
import { isMovie, loadMovieDetails } from "../services/movieService";
import { getProgressRatio, getRemainingSeconds } from "../services/playbackService";
import { useLibraryStore, isCatalogSectionPending } from "../stores/libraryStore";
import type { Movie } from "../types/catalog";
import { formatDuration, formatRemainingTime } from "../utils/format";

export function MoviePage() {
  const { movieId } = useParams();
  const catalog = useLibraryStore((state) => state.catalog);
  const connection = useLibraryStore((state) => state.connection);
  const catalogSource = useLibraryStore((state) => state.catalogSource);
  const vodSection = useLibraryStore((state) => state.catalogSections.vod);
  const playback = useLibraryStore((state) => state.playback);
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const isFavorite = useLibraryStore((state) => movieId ? state.isFavorite(movieId) : false);
  const setMovieDetails = useLibraryStore((state) => state.setMovieDetails);
  const item = movieId ? getContentById(movieId, catalog) : undefined;
  const catalogMovie = isMovie(item) ? item : undefined;
  const [movie, setMovie] = useState<Movie | undefined>(catalogMovie);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [retryToken, setRetryToken] = useState(0);
  const [downloadNotice, setDownloadNotice] = useState<string>();

  useEffect(() => setMovie(catalogMovie), [catalogMovie]);

  useEffect(() => {
    let cancelled = false;
    if (!catalogMovie) return undefined;

    setIsLoading(true);
    setError(undefined);
    void loadMovieDetails(catalogMovie, connection, retryToken > 0)
      .then((result) => {
        if (cancelled) return;
        setMovie(result.movie);
        if (result.loadedFromProvider) setMovieDetails(result.movie);
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Nao foi possivel carregar detalhes.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [catalogMovie, connection, retryToken, setMovieDetails]);

  const progress = movieId ? playback[movieId] : undefined;
  const progressRatio = getProgressRatio(progress);
  const remainingLabel = formatRemainingTime(getRemainingSeconds(progress));
  const actionLabel = progress?.positionSeconds ? "Continuar" : "Assistir";
  const streamCandidates = useMemo(
    () => movie?.streamCandidates ?? (movie?.streamUrl ? [movie.streamUrl] : []),
    [movie?.streamCandidates, movie?.streamUrl]
  );

  if (!item) {
    // Espera a seção VOD (/movie/:id), não o status global — a TV pode já estar ready.
    if (catalogSource === "xtream" && isCatalogSectionPending(vodSection.status)) {
      return <CatalogRestoreMessage />;
    }
    return <Navigate to="/movies" replace />;
  }

  if (!catalogMovie || !movie) {
    return <Navigate to={`/watch/${item.id}`} replace />;
  }

  async function handleDownload() {
    if (!movie || !downloads.isAvailable() || streamCandidates.length === 0) return;
    if (!window.confirm(`Baixar ${movie.title}?`)) return;
    setDownloadNotice("Adicionando à fila...");
    try {
      await downloads.start({
        contentId: movie.id,
        title: movie.title,
        kind: "movie",
        candidates: streamCandidates
      });
      setDownloadNotice("Download adicionado à fila.");
    } catch (reason) {
      setDownloadNotice(
        reason instanceof Error ? reason.message : "Nao foi possivel iniciar o download."
      );
    }
  }

  return (
    <div className="mx-auto max-w-canvas">
      <Link
        to="/movies"
        data-focusable="true"
        className="focus-card mb-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface-container px-3 py-2 text-sm text-on-surface-variant"
      >
        <ArrowLeft aria-hidden="true" size={18} />
        Filmes
      </Link>

      <section
        className={[
          "relative mb-8 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br p-5 shadow-2xl lg:p-8",
          movie.backdropTone
        ].join(" ")}
      >
        {movie.imageUrl ? (
          <>
            <SecureImage
              candidates={movie.imageCandidates ?? [movie.imageUrl]}
              alt=""
              className="absolute inset-y-0 right-0 h-full w-2/3 object-cover opacity-35"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-surface-container-lowest via-surface-container-lowest/85 to-transparent" />
          </>
        ) : null}
        <div className="relative z-10 grid gap-8 xl:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              {movie.genres.map((genre) => (
                <span key={genre} className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs uppercase text-on-surface">
                  {genre}
                </span>
              ))}
            </div>
            <h1 className="font-cinema text-5xl font-semibold text-on-surface lg:text-7xl">
              {movie.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-on-surface-variant lg:text-lg">
              {movie.description}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to={`/watch/${movie.id}`}
                data-focusable="true"
                className="focus-card inline-flex h-12 items-center gap-2 rounded-lg border border-primary-container/40 bg-primary px-4 font-display font-bold text-on-primary shadow-glow"
              >
                {progress?.positionSeconds ? <RotateCcw size={19} /> : <Play size={19} />}
                {actionLabel}
              </Link>
              <button
                type="button"
                data-focusable="true"
                onClick={() => toggleFavorite(movie.id)}
                className="focus-card inline-flex h-12 items-center gap-2 rounded-lg border border-white/10 bg-surface-container px-4 text-on-surface"
              >
                <Heart className={isFavorite ? "fill-error text-error" : "text-on-surface-variant"} size={20} />
                Favorito
              </button>
              {downloads.isAvailable() ? (
                <button
                  type="button"
                  data-focusable="true"
                  onClick={() => void handleDownload()}
                  className="focus-card inline-flex h-12 items-center gap-2 rounded-lg border border-white/10 bg-surface-container px-4 text-on-surface"
                >
                  <Download size={20} />
                  Baixar
                </button>
              ) : null}
            </div>
            {remainingLabel ? (
              <div className="mt-5 max-w-sm">
                <p className="mb-2 font-mono text-xs uppercase text-primary-container">{remainingLabel}</p>
                <div className="h-1 overflow-hidden rounded bg-white/15">
                  <div className="h-full bg-primary-container" style={{ width: `${progressRatio * 100}%` }} />
                </div>
              </div>
            ) : null}
            {downloadNotice ? <p className="mt-3 text-sm text-primary-container">{downloadNotice}</p> : null}
            {error ? (
              <div className="mt-5 rounded-xl border border-error/40 bg-error-container/30 p-4 text-sm leading-6 text-error">
                {error}
                <button type="button" className="ml-3 underline" onClick={() => setRetryToken((value) => value + 1)}>
                  Tentar novamente
                </button>
              </div>
            ) : null}
            {isLoading ? <p className="mt-4 font-mono text-xs uppercase text-on-surface-variant">Carregando detalhes...</p> : null}
          </div>

          <dl className="grid grid-cols-2 gap-3 xl:grid-cols-1">
            <InfoTile label="Tipo" value="Filme" />
            <InfoTile label="Ano" value={String(movie.year ?? "N/A")} />
            <InfoTile label="Duracao" value={formatDuration(movie.durationSeconds)} />
            <InfoTile label="Qualidade" value={movie.quality.join(", ")} />
            <InfoTile label="Direcao" value={movie.director || "N/A"} />
            <InfoTile label="Elenco" value={movie.cast.slice(0, 4).join(", ") || "N/A"} />
          </dl>
        </div>
      </section>
    </div>
  );
}

function CatalogRestoreMessage() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <p className="rounded-xl border border-white/10 bg-surface-container px-5 py-4 text-on-surface-variant">
        Recarregando catalogo...
      </p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface-container/60 p-4">
      <dt className="font-mono text-xs uppercase text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-display text-lg font-semibold text-on-surface">{value || "N/A"}</dd>
    </div>
  );
}
