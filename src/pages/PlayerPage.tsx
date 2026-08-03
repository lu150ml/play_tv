import type Hls from "hls.js";
import { ArrowLeft, Download, Heart, RotateCcw, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { CatalogRail } from "../components/CatalogRail";
import { PlayerControls } from "../components/PlayerControls";
import { getBufferedAheadSeconds, hasEnoughStartupBuffer } from "../services/bufferService";
import { getContentById } from "../services/catalogService";
import {
  getProgressRatio,
  getRemainingSeconds,
  normalizePlaybackState
} from "../services/playbackService";
import { getNextEpisode, isSeries, loadSeriesEpisodes } from "../services/seriesService";
import { getSubtitleTrackUrl, searchSubtitles } from "../services/subtitleService";
import { formatResolution, getChannelStreamCandidates } from "../services/streamService";
import { getDesktopBridge, getDownloadedMediaUrl } from "../services/desktopService";
import { useDownloadState } from "../hooks/useDesktopState";
import { useLibraryStore } from "../stores/libraryStore";
import type { Episode, SubtitleResult } from "../types/catalog";
import { formatDuration, formatRemainingTime } from "../utils/format";

// Janela final do episódio em que o aviso de "Próximo episódio" aparece.
const NEXT_EPISODE_PROMPT_SECONDS = 40;

// Heurística fixa de "Pular abertura": enquanto a posição estiver antes deste
// ponto, oferecemos o salto direto para cá (fim aproximado da abertura ~30s).
const INTRO_SKIP_TO_SECONDS = 30;

export function PlayerPage() {
  const { contentId, episodeId, seriesId } = useParams();
  const navigate = useNavigate();
  const catalog = useLibraryStore((state) => state.catalog);
  const connection = useLibraryStore((state) => state.connection);
  const routeContentId = seriesId ?? contentId;
  const item = routeContentId ? getContentById(routeContentId, catalog) : undefined;
  const series = isSeries(item) ? item : undefined;
  const playback = useLibraryStore((state) => state.playback);
  const storeProgress = useLibraryStore((state) => state.saveProgress);
  const markWatched = useLibraryStore((state) => state.markWatched);
  const cacheSeriesEpisodes = useLibraryStore((state) => state.setSeriesEpisodes);
  const downloads = useDownloadState();
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const isFavorite = useLibraryStore((state) =>
    routeContentId ? state.isFavorite(routeContentId) : false
  );
  const [isPlaying, setIsPlaying] = useState(Boolean(episodeId));
  const [volume, setVolume] = useState(() => {
    const saved = Number(localStorage.getItem("server-xtreme-volume") ?? 1);
    return Number.isFinite(saved) ? Math.min(Math.max(saved, 0), 1) : 1;
  });
  const [muted, setMuted] = useState(false);
  const [mediaDuration, setMediaDuration] = useState<number | undefined>();
  const [mediaError, setMediaError] = useState<string | undefined>();
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const [episodeError, setEpisodeError] = useState<string | undefined>();
  const [lastInteractionAt, setLastInteractionAt] = useState(Date.now());
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedAheadSeconds, setBufferedAheadSeconds] = useState(0);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [seriesEpisodes, setSeriesEpisodes] = useState<Episode[]>([]);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | undefined>();
  const [isSubtitlePickerOpen, setIsSubtitlePickerOpen] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleResult[]>([]);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState(false);
  const [subtitleError, setSubtitleError] = useState<string | undefined>();
  const [subtitleUrl, setSubtitleUrl] = useState<string | undefined>();
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | undefined>();
  const [streamAttempt, setStreamAttempt] = useState(0);
  const [activeResolution, setActiveResolution] = useState<string | undefined>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerShellRef = useRef<HTMLElement | null>(null);
  const hlsRef = useRef<Hls | undefined>(undefined);
  const bufferRecoveryTimeoutRef = useRef<number | undefined>(undefined);
  const bufferIndicatorTimeoutRef = useRef<number | undefined>(undefined);
  const networkRetryRef = useRef(0);
  const playbackIntentRef = useRef(isPlaying);
  const mediaErrorRef = useRef(mediaError);
  const lastSavedSecondRef = useRef(-1);
  const selectedEpisode = useMemo(
    () => seriesEpisodes.find((episode) => episode.id === (episodeId ?? selectedEpisodeId)),
    [episodeId, selectedEpisodeId, seriesEpisodes]
  );
  const originalStreamUrl = selectedEpisode?.streamUrl ?? item?.streamUrl;
  const streamCandidates = useMemo(
    () => item?.type === "channel" ? getChannelStreamCandidates(originalStreamUrl) : originalStreamUrl ? [originalStreamUrl] : [],
    [item?.type, originalStreamUrl]
  );
  const completedDownload = downloads.jobs.find((job) => job.contentId === (selectedEpisode?.id ?? item?.id) && job.status === "completed");
  const activeStreamUrl = completedDownload ? getDownloadedMediaUrl(completedDownload.id) : streamCandidates[Math.min(streamAttempt, streamCandidates.length - 1)];
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
  const nextEpisode = getNextEpisode(seriesEpisodes, selectedEpisode?.id);
  const seasonEpisodes = selectedEpisode
    ? seriesEpisodes.filter((episode) => episode.season === selectedEpisode.season)
    : seriesEpisodes;
  const minimumStartupBufferSeconds = item?.type === "channel" ? 3 : 5;
  const shouldShowControls = !isPlaying || Boolean(mediaError) || areControlsVisible;
  const remainingSeconds =
    durationSeconds > 0 ? Math.max(durationSeconds - positionSeconds, 0) : undefined;
  const shouldPromptNextEpisode =
    Boolean(nextEpisode) &&
    remainingSeconds !== undefined &&
    remainingSeconds > 0 &&
    remainingSeconds <= NEXT_EPISODE_PROMPT_SECONDS;
  const shouldOfferSkipIntro =
    Boolean(activeStreamUrl) &&
    Boolean(selectedEpisode) &&
    durationSeconds > INTRO_SKIP_TO_SECONDS &&
    positionSeconds < INTRO_SKIP_TO_SECONDS;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted || volume === 0;
  }, [activeStreamUrl, muted, volume]);

  const clearBufferRecovery = useCallback(() => {
    if (bufferRecoveryTimeoutRef.current === undefined) {
      return;
    }

    window.clearTimeout(bufferRecoveryTimeoutRef.current);
    bufferRecoveryTimeoutRef.current = undefined;
  }, []);

  const scheduleBufferRecovery = useCallback(() => {
    clearBufferRecovery();

    if (!playbackIntentRef.current) {
      return;
    }

    bufferRecoveryTimeoutRef.current = window.setTimeout(() => {
      const video = videoRef.current;

      if (!video || !playbackIntentRef.current || mediaErrorRef.current || video.paused) {
        return;
      }

      if (video.readyState >= 3) {
        return;
      }

      if (hlsRef.current) {
        // startLoad() reativa o download de fragmentos após um stall de rede.
        // NÃO chamar recoverMediaError() aqui — esse método reinicializa o
        // decoder de mídia e só deve ser usado em erros fatais de MEDIA_ERROR,
        // não em stalls normais de buffer (causa o engasgo/flash na imagem).
        hlsRef.current.startLoad(video.currentTime);
        return;
      }

      // Para streams nativos (MP4/MKV), NÃO chamar video.load() — isso reseta
      // o vídeo para o início. Basta tentar retomar o play; o browser já está
      // fazendo a range request para a posição atual e vai continuar sozinho.
      void video.play().catch(() => {
        setIsPlaying(false);
      });
    }, 6000);
  }, [clearBufferRecovery]);

  // Revoga o Blob URL da legenda anterior para não vazar memória.
  useEffect(() => {
    return () => {
      if (subtitleUrl) {
        URL.revokeObjectURL(subtitleUrl);
      }
    };
  }, [subtitleUrl]);

  // Ativa a faixa de legenda assim que o <track> é anexado ao vídeo.
  useEffect(() => {
    const video = videoRef.current;

    if (!video || !subtitleUrl) {
      return;
    }

    const tracks = video.textTracks;
    if (tracks.length > 0) {
      tracks[0].mode = "showing";
    }
  }, [subtitleUrl]);

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

    if (!series) {
      setSeriesEpisodes([]);
      setSelectedEpisodeId(undefined);
      setEpisodeError(undefined);
      return undefined;
    }

    setIsLoadingEpisodes(true);
    setEpisodeError(undefined);

    void loadSeriesEpisodes(series, connection)
      .then((episodes) => {
        if (isCancelled) {
          return;
        }

        setSeriesEpisodes(episodes);
        cacheSeriesEpisodes(series.id, episodes);
        setSelectedEpisodeId(episodeId ?? episodes[0]?.id);

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
  }, [cacheSeriesEpisodes, connection, episodeId, series]);

  useEffect(() => {
    setStreamAttempt(0);
    setActiveResolution(undefined);
  }, [originalStreamUrl]);

  useEffect(() => {
    if (episodeId) {
      setSelectedEpisodeId(episodeId);
    }
  }, [episodeId]);

  useEffect(() => {
    playbackIntentRef.current = isPlaying;
  }, [activeStreamUrl, isPlaying]);

  useEffect(() => {
    mediaErrorRef.current = mediaError;
  }, [mediaError]);

  useEffect(() => {
    if (!isPlaying) {
      clearBufferRecovery();
    }
  }, [clearBufferRecovery, isPlaying]);

  useEffect(() => {
    return () => clearBufferRecovery();
  }, [clearBufferRecovery]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !activeStreamUrl) {
      return undefined;
    }

    setMediaError(undefined);
    setMediaDuration(undefined);
    setIsBuffering(false);
    setBufferedAheadSeconds(0);

    let hls: Hls | undefined;
    let isDisposed = false;
    const isHlsStream = activeStreamUrl.includes(".m3u8");
    const isLiveContent = item?.type === "channel";

    if (isHlsStream && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = activeStreamUrl;
      video.load();
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
          lowLatencyMode: false,
          startFragPrefetch: false,
          maxBufferLength: isLiveContent ? 10 : 20,
          maxMaxBufferLength: isLiveContent ? 20 : 40,
          maxBufferSize: isLiveContent ? 15 * 1000 * 1000 : 30 * 1000 * 1000,
          backBufferLength: isLiveContent ? 5 : 10,
          fragLoadingTimeOut: 20_000,
          manifestLoadingTimeOut: 20_000,
          levelLoadingTimeOut: 20_000,
          fragLoadingMaxRetry: 6,
          manifestLoadingMaxRetry: 4,
          levelLoadingMaxRetry: 4
        });
        hlsRef.current = hls;
        hls.loadSource(activeStreamUrl);
        hls.attachMedia(video);
        hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
          if (!hls || hls.levels.length === 0) return;
          networkRetryRef.current = 0;
          hls.currentLevel = hls.levels.length - 1;
          const level = hls.levels[hls.levels.length - 1];
          setActiveResolution(formatResolution(level?.width, level?.height));
        });
        hls.on(HlsPlayer.Events.LEVEL_SWITCHED, (_event, data) => {
          const level = hls?.levels[data.level];
          setActiveResolution(formatResolution(level?.width, level?.height));
        });
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            if (data.type === HlsPlayer.ErrorTypes.NETWORK_ERROR) {
              if (networkRetryRef.current < 2) {
                networkRetryRef.current += 1;
                window.setTimeout(() => hls?.startLoad(video.currentTime), networkRetryRef.current * 750);
                scheduleBufferRecovery();
                return;
              }
            }

            if (data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR) {
              hls?.recoverMediaError();
              scheduleBufferRecovery();
              return;
            }

            if (isLiveContent && streamAttempt + 1 < streamCandidates.length) {
              setStreamAttempt((attempt) => attempt + 1);
              return;
            }
            setMediaError("Este canal nao respondeu apos tentar os formatos disponiveis. Ele pode estar offline ou usar um codec nao suportado.");
            hls?.destroy();
            hlsRef.current = undefined;
            return;
          }

          if (data.details === HlsPlayer.ErrorDetails.BUFFER_STALLED_ERROR) {
            scheduleBufferRecovery();
          }
        });
      });
    } else {
      video.src = activeStreamUrl;
      video.load();
    }

    return () => {
      isDisposed = true;
      clearBufferRecovery();
      hls?.destroy();
      hlsRef.current = undefined;
      video.removeAttribute("src");
      video.load();
    };
  }, [activeStreamUrl, clearBufferRecovery, item?.type, scheduleBufferRecovery, streamAttempt, streamCandidates.length]);

  const activePlaybackRef = useRef(activePlayback);
  useEffect(() => {
    activePlaybackRef.current = activePlayback;
  }, [activePlayback]);

  useEffect(() => {
    const nextPosition = activePlaybackRef.current?.positionSeconds ?? 0;
    setPositionSeconds(nextPosition);

    if (videoRef.current && canSeek) {
      videoRef.current.currentTime = nextPosition;
    }
    // Só restaura posição ao trocar de conteúdo — não reagir a saves de progresso
    // durante reprodução (activePlayback?.positionSeconds causava seek a cada 5s)
  }, [activePlaybackId, canSeek]);

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

  if (episodeId && !series) {
    return <Navigate to="/catalog/series" replace />;
  }

  const content = item;

  function handleSeek(nextPosition: number) {
    if (videoRef.current && canSeek) {
      videoRef.current.currentTime = nextPosition;
    }

    setPositionSeconds(nextPosition);
    storeProgress(
      normalizePlaybackState({
        contentId: selectedEpisode?.id ?? content.id,
        positionSeconds: nextPosition,
        durationSeconds: durationSeconds || content.durationSeconds || 0
      })
    );

    if (selectedEpisode) {
      storeProgress(
        normalizePlaybackState({
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

    if (
      content.type !== "channel" &&
      durationSeconds > 0 &&
      nextPosition / durationSeconds >= 0.95
    ) {
      markWatched(selectedEpisode?.id ?? content.id);
      return;
    }

    if (content.type !== "channel" && nextPosition - lastSavedSecondRef.current >= 5) {
      lastSavedSecondRef.current = nextPosition;
      storeProgress(
        normalizePlaybackState({
          contentId: selectedEpisode?.id ?? content.id,
          positionSeconds: nextPosition,
          durationSeconds:
            durationSeconds || selectedEpisode?.durationSeconds || content.durationSeconds || 0
        })
      );

      if (selectedEpisode) {
        storeProgress(
          normalizePlaybackState({
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

    // Lê da ref (valor mais recente), não do closure capturado no render —
    // senão o seek poderia pular para uma posição defasada quando os metadados
    // chegam tarde (HLS carrega de forma assíncrona).
    const resumePosition = activePlaybackRef.current?.positionSeconds;
    if (resumePosition) {
      video.currentTime = resumePosition;
    }
  }

  function updateBufferedState() {
    const video = videoRef.current;

    if (!video) {
      return 0;
    }

    const nextBufferedAhead = getBufferedAheadSeconds(video.buffered, video.currentTime);
    setBufferedAheadSeconds(nextBufferedAhead);

    return nextBufferedAhead;
  }

  function handleBufferingStart() {
    updateBufferedState();
    if (bufferIndicatorTimeoutRef.current === undefined) {
      bufferIndicatorTimeoutRef.current = window.setTimeout(() => {
        bufferIndicatorTimeoutRef.current = undefined;
        setIsBuffering(true);
      }, 800);
    }
    scheduleBufferRecovery();
  }

  function handleBufferingProgress() {
    const video = videoRef.current;
    const nextBufferedAhead = updateBufferedState();

    if (
      video &&
      hasEnoughStartupBuffer(video.buffered, video.currentTime, minimumStartupBufferSeconds)
    ) {
      if (bufferIndicatorTimeoutRef.current !== undefined) {
        window.clearTimeout(bufferIndicatorTimeoutRef.current);
        bufferIndicatorTimeoutRef.current = undefined;
      }
      clearBufferRecovery();
      setIsBuffering(false);
      // Se o vídeo parou por stall e já há buffer suficiente, retoma o play
      if (playbackIntentRef.current && video.paused && !video.ended) {
        void video.play().catch(() => {
          setIsPlaying(false);
        });
      }
      return;
    }

    if (nextBufferedAhead > 0 && !isPlaying) {
      setIsBuffering(false);
    }
  }

  function handleBufferingEnd() {
    if (bufferIndicatorTimeoutRef.current !== undefined) {
      window.clearTimeout(bufferIndicatorTimeoutRef.current);
      bufferIndicatorTimeoutRef.current = undefined;
    }
    clearBufferRecovery();
    updateBufferedState();
    setIsBuffering(false);
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

    if (series) {
      void navigate(`/watch/${series.id}/${nextEpisode.id}`);
    }
  }

  function handleSkipIntro() {
    const target = Math.min(INTRO_SKIP_TO_SECONDS, Math.max(durationSeconds - 1, 0));
    handleSeek(target);
    revealControls();
  }

  function handleWatchFromStart() {
    handleSeek(0);
    setIsPlaying(true);
    revealControls();
  }

  function handleEnded() {
    markWatched(selectedEpisode?.id ?? content.id);
    if (selectedEpisode && !nextEpisode) markWatched(content.id);
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

  async function handleToggleCaptions() {
    // Já há legenda ativa: alterna visibilidade no próprio vídeo.
    setIsSubtitlePickerOpen(true);
    if (subtitles.length > 0) {
      revealControls();
      return;
    }
    setIsLoadingSubtitles(true);
    setSubtitleError(undefined);
    revealControls();

    try {
      const results = await searchSubtitles(content, selectedEpisode);
      setSubtitles(results);

      if (results.length === 0) {
        setSubtitleError("Nenhuma legenda encontrada para este titulo.");
      }
    } catch (error) {
      setSubtitleError(
        error instanceof Error ? error.message : "Nao foi possivel buscar legendas."
      );
    } finally {
      setIsLoadingSubtitles(false);
    }
  }

  function handleDisableSubtitles() {
    const tracks = videoRef.current?.textTracks;
    if (tracks) for (const track of Array.from(tracks)) track.mode = "disabled";
    if (subtitleUrl) URL.revokeObjectURL(subtitleUrl);
    setSubtitleUrl(undefined);
    setActiveSubtitleId(undefined);
    setIsSubtitlePickerOpen(false);
  }

  function handleStreamFailure() {
    if (!videoRef.current?.currentSrc) return;
    if (content.type === "channel" && streamAttempt + 1 < streamCandidates.length) {
      setStreamAttempt((attempt) => attempt + 1);
      return;
    }
    setMediaError("Este conteudo nao respondeu apos as tentativas de conexao. O stream pode estar offline ou usar um formato nao suportado.");
  }

  function handleRetryStream() {
    setMediaError(undefined);
    setStreamAttempt(0);
    const video = videoRef.current;
    if (video) {
      video.load();
      void video.play().catch(() => setIsPlaying(false));
    }
  }

  function handleDownload() {
    if (!originalStreamUrl || content.type === "channel") return;
    const target = selectedEpisode ?? content;
    const extension = new URL(originalStreamUrl).pathname.split(".").pop() || "mp4";
    void getDesktopBridge()?.downloads.enqueue({
      contentId: target.id,
      seriesId: selectedEpisode ? content.id : undefined,
      title: selectedEpisode
        ? `${content.title} - S${selectedEpisode.season}E${selectedEpisode.episode} - ${selectedEpisode.title}`
        : content.title,
      url: originalStreamUrl,
      extension
    });
  }

  async function handleSelectSubtitle(result: SubtitleResult) {
    setSubtitleError(undefined);

    try {
      if (subtitleUrl) {
        URL.revokeObjectURL(subtitleUrl);
      }

      const url = await getSubtitleTrackUrl(result.fileId);
      setSubtitleUrl(url);
      setActiveSubtitleId(result.fileId);
      setIsSubtitlePickerOpen(false);
    } catch (error) {
      setSubtitleError(
        error instanceof Error ? error.message : "Nao foi possivel carregar a legenda."
      );
    }
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
      <button
        type="button"
        onClick={() => void navigate(-1)}
        data-focusable="true"
        className="focus-card mb-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface-container px-3 py-2 text-sm text-on-surface-variant"
      >
        <ArrowLeft aria-hidden="true" size={18} />
        {series ? "Serie" : "Catalog"}
      </button>

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
            preload="auto"
            playsInline
            onCanPlay={handleBufferingEnd}
            onCanPlayThrough={handleBufferingEnd}
            onLoadedMetadata={handleLoadedMetadata}
            onPlaying={handleBufferingEnd}
            onProgress={handleBufferingProgress}
            onStalled={handleBufferingStart}
            onTimeUpdate={handleTimeUpdate}
            onWaiting={handleBufferingStart}
            onPlay={() => setIsPlaying(true)}
            onPause={() => {
              setIsPlaying(false);
              if (content.type !== "channel")
                handleSeek(videoRef.current?.currentTime ?? positionSeconds);
            }}
            onEnded={handleEnded}
            onError={handleStreamFailure}
          >
            {subtitleUrl ? (
              <track kind="subtitles" src={subtitleUrl} srcLang="pt" label="Português" default />
            ) : null}
          </video>
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
          {activeStreamUrl ? `Now Playing${activeResolution ? ` · ${activeResolution}` : ""}` : "Preview"}
        </div>
        {mediaError ? (
          <div className="absolute left-4 right-4 top-16 rounded-xl border border-error/40 bg-error-container/70 p-4 text-sm leading-6 text-error backdrop-blur-xl">
            <span>{mediaError}</span>
            <button type="button" data-focusable="true" onClick={handleRetryStream} className="focus-card ml-3 rounded-lg border border-error/40 px-3 py-1 font-semibold">Tentar novamente</button>
          </div>
        ) : null}
        {isBuffering && !mediaError ? (
          <div
            data-testid="buffering-indicator"
            className="absolute left-4 right-4 top-16 rounded-xl border border-primary-container/30 bg-surface/80 p-4 font-mono text-xs uppercase tracking-wide text-primary-container backdrop-blur-xl"
          >
            Carregando buffer...
            {bufferedAheadSeconds > 0 ? ` ${Math.floor(bufferedAheadSeconds)}s prontos` : null}
          </div>
        ) : null}
        {shouldOfferSkipIntro ? (
          <div className="absolute bottom-28 right-4 z-10 lg:bottom-32">
            <button
              type="button"
              data-focusable="true"
              onClick={handleSkipIntro}
              className="focus-card flex items-center gap-2 rounded-lg border border-white/20 bg-black/60 px-4 py-3 font-display text-sm font-semibold text-on-surface backdrop-blur-xl hover:bg-black/80"
            >
              <SkipForward aria-hidden="true" size={20} />
              Pular abertura
            </button>
          </div>
        ) : null}
        {shouldPromptNextEpisode && nextEpisode ? (
          <div className="absolute bottom-28 right-4 z-10 flex max-w-xs flex-col items-end gap-2 lg:bottom-32">
            <span className="rounded-full border border-white/10 bg-surface-container/80 px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-on-surface-variant backdrop-blur-xl">
              A seguir · {Math.ceil(remainingSeconds ?? 0)}s
            </span>
            <button
              type="button"
              data-focusable="true"
              onClick={handleNextEpisode}
              className="focus-card flex items-center gap-2 rounded-lg border border-primary-container/60 bg-primary-container/20 px-4 py-3 text-left text-primary shadow-glow backdrop-blur-xl"
            >
              <SkipForward aria-hidden="true" size={20} />
              <span className="min-w-0">
                <span className="block font-display text-sm font-semibold">Próximo episódio</span>
                <span className="block truncate text-xs text-on-surface-variant">
                  {nextEpisode.title}
                </span>
              </span>
            </button>
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
          captionsActive={Boolean(activeSubtitleId)}
          onNextEpisode={handleNextEpisode}
          onTogglePlay={() => setIsPlaying((current) => !current)}
          onSeek={handleSeek}
          onFullscreen={() => {
            void handleFullscreen();
          }}
          onToggleCaptions={() => {
            void handleToggleCaptions();
          }}
          volume={volume}
          muted={muted}
          onToggleMute={() => {
            setMuted((current) => !current);
          }}
          onVolumeChange={(next) => {
            const normalized = Math.min(Math.max(next, 0), 1);
            setVolume(normalized);
            setMuted(normalized === 0);
            localStorage.setItem("server-xtreme-volume", String(normalized));
          }}
        />
        {isSubtitlePickerOpen ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-surface-container p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-on-surface">Legendas</h3>
                <button
                  type="button"
                  data-focusable="true"
                  onClick={() => setIsSubtitlePickerOpen(false)}
                  className="focus-card rounded-lg border border-white/10 px-3 py-1 text-sm text-on-surface-variant"
                >
                  Fechar
                </button>
              </div>

              {subtitleUrl ? (
                <button type="button" data-focusable="true" onClick={handleDisableSubtitles} className="focus-card mb-3 w-full rounded-lg border border-white/10 bg-surface-container-high p-3 text-left text-sm">Desativar legendas</button>
              ) : null}

              {isLoadingSubtitles ? (
                <p className="py-6 text-center font-mono text-xs uppercase text-on-surface-variant">
                  Buscando legendas...
                </p>
              ) : null}

              {subtitleError ? (
                <div className="rounded-lg border border-error/40 bg-error-container/30 p-3 text-sm leading-6 text-error">
                  {subtitleError}
                </div>
              ) : null}

              {!isLoadingSubtitles && subtitles.length > 0 ? (
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {subtitles.map((subtitle) => (
                    <li key={subtitle.fileId}>
                      <button
                        type="button"
                        data-focusable="true"
                        onClick={() => {
                          void handleSelectSubtitle(subtitle);
                        }}
                        className={[
                          "focus-card flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left",
                          activeSubtitleId === subtitle.fileId
                            ? "border-primary-container bg-primary-container/15 text-primary"
                            : "border-white/10 bg-surface-container-high/60 text-on-surface"
                        ].join(" ")}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">{subtitle.release}</span>
                        <span className="shrink-0 font-mono text-[10px] uppercase text-on-surface-variant">
                          {subtitle.language} · {subtitle.downloads}↓
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}
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
          {content.type !== "channel" && originalStreamUrl ? (
            <button type="button" data-focusable="true" onClick={handleDownload} disabled={!getDesktopBridge()} className="focus-card mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface-container px-4 py-3 font-semibold disabled:opacity-50"><Download size={18} />Baixar {selectedEpisode ? "episodio" : "filme"}</button>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {activeStreamUrl && content.type !== "channel" ? (
              <button
                type="button"
                data-focusable="true"
                onClick={handleWatchFromStart}
                className="focus-card flex h-12 items-center gap-2 rounded-lg border border-primary-container/60 bg-primary-container/20 px-4 font-semibold text-primary"
              >
                <RotateCcw aria-hidden="true" size={20} />
                Assistir do começo
              </button>
            ) : null}
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
                <h2 className="font-display text-2xl font-bold text-on-surface">
                  Temporada {selectedEpisode?.season ?? 1}
                </h2>
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
              {seasonEpisodes.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {seasonEpisodes.map((episode) => (
                    <button
                      key={episode.id}
                      type="button"
                      data-focusable="true"
                      aria-pressed={selectedEpisode?.id === episode.id}
                      onClick={() => {
                        setSelectedEpisodeId(episode.id);
                        setPositionSeconds(0);
                        setIsPlaying(false);
                        void navigate(`/watch/${content.id}/${episode.id}`);
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
