import type { ContentItem, Episode, PlaybackState, Series } from "../types/catalog";
import type { XtreamCredentials } from "./xtreamService";
import { invalidateXtreamSeriesDetails, loadXtreamSeriesArtwork, loadXtreamSeriesEpisodes } from "./xtreamService";

export interface SeasonGroup {
  season: number;
  episodes: Episode[];
}

export async function loadSeriesEpisodes(
  series: Series,
  connection?: XtreamCredentials
): Promise<Episode[]> {
  if (series.source === "xtream" && series.providerId) {
    if (!connection) {
      throw new Error("Volte ao login para recarregar a conexao antes de abrir episodios.");
    }

    return loadXtreamSeriesEpisodes(connection, series.providerId);
  }

  return series.episodes;
}

export async function loadSeriesArtwork(
  series: Series,
  connection?: XtreamCredentials
): Promise<string | undefined> {
  if (series.imageUrl || series.source !== "xtream" || !series.providerId || !connection) return series.imageUrl;
  return loadXtreamSeriesArtwork(connection, series.providerId);
}

export function invalidateSeriesDetails(series: Series, connection?: XtreamCredentials) {
  if (series.source === "xtream" && series.providerId && connection) {
    invalidateXtreamSeriesDetails(connection, series.providerId);
  }
}

export function isSeries(item?: ContentItem): item is Series {
  return item?.type === "series";
}

export function groupEpisodesBySeason(episodes: Episode[]): SeasonGroup[] {
  const groups = new Map<number, Episode[]>();

  for (const episode of sortEpisodes(episodes)) {
    const group = groups.get(episode.season) ?? [];
    group.push(episode);
    groups.set(episode.season, group);
  }

  return Array.from(groups.entries())
    .map(([season, seasonEpisodes]) => ({ season, episodes: seasonEpisodes }))
    .sort((left, right) => left.season - right.season);
}

export function getNextEpisode(episodes: Episode[], episodeId?: string): Episode | undefined {
  const sortedEpisodes = sortEpisodes(episodes);
  const currentIndex = sortedEpisodes.findIndex((episode) => episode.id === episodeId);

  if (currentIndex < 0) {
    return undefined;
  }

  return sortedEpisodes[currentIndex + 1];
}

export function getContinueEpisode(
  episodes: Episode[],
  playback: Record<string, PlaybackState>
): Episode | undefined {
  const watchedEpisodes = episodes
    .map((episode) => ({ episode, progress: playback[episode.id] }))
    .filter(({ progress }) => progress && progress.positionSeconds > 0)
    .sort(
      (left, right) =>
        new Date(right.progress?.updatedAt ?? 0).getTime() -
        new Date(left.progress?.updatedAt ?? 0).getTime()
    );

  return watchedEpisodes[0]?.episode ?? sortEpisodes(episodes)[0];
}

export function sortEpisodes(episodes: Episode[]): Episode[] {
  return [...episodes].sort((left, right) => {
    if (left.season !== right.season) {
      return left.season - right.season;
    }

    return left.episode - right.episode;
  });
}
