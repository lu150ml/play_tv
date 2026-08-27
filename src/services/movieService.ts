import type { ContentItem, Movie } from "../types/catalog";
import type { XtreamCredentials } from "./xtreamService";
import { loadXtreamMovieDetails } from "./xtreamService";

export interface MovieDetailsResult {
  movie: Movie;
  loadedFromProvider: boolean;
}

const movieRequests = new Map<string, Promise<MovieDetailsResult>>();

export function isMovie(item?: ContentItem): item is Movie {
  return item?.type === "movie";
}

export async function loadMovieDetails(
  movie: Movie,
  connection?: XtreamCredentials,
  force = false
): Promise<MovieDetailsResult> {
  if (movie.source !== "xtream" || !movie.providerId) {
    return { movie, loadedFromProvider: false };
  }
  if (!connection) {
    throw new Error("Volte ao login para recarregar a conexao antes de abrir detalhes.");
  }

  const key = `${connection.serverUrl}\n${connection.username}\n${movie.providerId}`;
  if (!force) {
    const existing = movieRequests.get(key);
    if (existing) return existing;
  }

  const request = loadXtreamMovieDetails(connection, movie.providerId)
    .then((details): MovieDetailsResult => {
      const imageCandidates = details.imageCandidates.length > 0
        ? details.imageCandidates
        : movie.imageCandidates ?? (movie.imageUrl ? [movie.imageUrl] : []);
      return {
        loadedFromProvider: true,
        movie: {
          ...movie,
          description: details.description?.trim() || movie.description,
          genres: details.genres?.length ? details.genres : movie.genres,
          year: details.year ?? movie.year,
          durationSeconds: details.durationSeconds ?? movie.durationSeconds,
          director: details.director || movie.director,
          cast: details.cast?.length ? details.cast : movie.cast,
          rating: details.rating ?? movie.rating,
          releasedAt: details.releasedAt ?? movie.releasedAt,
          imageUrl: imageCandidates[0] ?? movie.imageUrl,
          imageCandidates,
          streamCandidates: details.streamCandidates?.length
            ? details.streamCandidates
            : movie.streamCandidates,
          streamUrl: details.streamCandidates?.[0] ?? movie.streamUrl
        }
      };
    })
    .catch((error) => {
      movieRequests.delete(key);
      throw error;
    });
  movieRequests.set(key, request);
  return request;
}
