import type { ContentItem, Episode, PlaybackState, Series } from "../types/catalog";
import type { XtreamCredentials } from "./xtreamService";
import { loadXtreamSeriesDetails } from "./xtreamService";

export interface SeasonGroup {
  season: number;
  episodes: Episode[];
}

export interface SeriesDetails { episodes: Episode[]; imageCandidates: string[]; }
const episodeRequests = new Map<string, Promise<SeriesDetails>>();

export async function loadSeriesEpisodes(
  series: Series,
  connection?: XtreamCredentials,
  force = false
): Promise<Episode[]> {
  return (await loadSeriesDetails(series, connection, force)).episodes;
}

export async function loadSeriesDetails(series: Series, connection?: XtreamCredentials, force = false): Promise<SeriesDetails> {
  if (!force && series.episodes.length > 0) return { episodes: series.episodes, imageCandidates: series.imageCandidates ?? (series.imageUrl ? [series.imageUrl] : []) };
  if (series.source === "xtream" && series.providerId) {
    if (!connection) {
      throw new Error("Volte ao login para recarregar a conexao antes de abrir episodios.");
    }

    const key = `${connection.serverUrl}\n${connection.username}\n${series.providerId}`;
    if (!force) {
      const existing = episodeRequests.get(key);
      if (existing) return existing;
    }
    const request = loadXtreamSeriesDetails(connection, series.providerId).catch((error) => {
      episodeRequests.delete(key);
      throw error;
    });
    episodeRequests.set(key, request);
    return request;
  }

  return { episodes: series.episodes, imageCandidates: series.imageCandidates ?? (series.imageUrl ? [series.imageUrl] : []) };
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
