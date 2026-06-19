import type { ContentItem, ContentType, PlaybackState } from "../types/catalog";
import { getFeaturedContent } from "./catalogService";
import { getProgressRatio } from "./playbackService";

const GENERIC_TOPICS = new Set([
  "featured",
  "live tv",
  "movies",
  "recently added",
  "series",
  "trending"
]);

interface TopicProfile {
  categories: Map<string, number>;
  genres: Map<string, number>;
  types: Map<ContentType, number>;
  hasSignals: boolean;
}

export function getUserTopicProfile(
  catalog: ContentItem[],
  playback: Record<string, PlaybackState>,
  favorites: ReadonlySet<string> = new Set()
): TopicProfile {
  const profile: TopicProfile = {
    categories: new Map(),
    genres: new Map(),
    types: new Map(),
    hasSignals: false
  };

  for (const item of catalog) {
    const progress = playback[item.id];
    const watchedWeight = progress ? Math.max(getProgressRatio(progress), 0.08) : 0;
    const favoriteWeight = favorites.has(item.id) ? 0.8 : 0;
    const weight = watchedWeight + favoriteWeight;

    if (weight <= 0) {
      continue;
    }

    profile.hasSignals = true;
    addWeight(profile.types, item.type, weight);

    for (const genre of item.genres) {
      addWeight(profile.genres, normalizeTopic(genre), weight);
    }

    for (const category of item.categories
      .map(normalizeTopic)
      .filter((topic) => !GENERIC_TOPICS.has(topic))) {
      addWeight(profile.categories, category, weight);
    }
  }

  return profile;
}

export function getPersonalizedRecommendations(
  catalog: ContentItem[],
  playback: Record<string, PlaybackState>,
  favorites: ReadonlySet<string> = new Set(),
  limit = 5
): ContentItem[] {
  const profile = getUserTopicProfile(catalog, playback, favorites);

  if (!profile.hasSignals) {
    return [];
  }

  return catalog
    .map((item) => ({ item, score: scoreItem(item, profile, playback, favorites) }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return new Date(right.item.addedAt).getTime() - new Date(left.item.addedAt).getTime();
    })
    .slice(0, limit)
    .map(({ item }) => item);
}

export function getRecommendedHero(
  catalog: ContentItem[],
  playback: Record<string, PlaybackState>,
  favorites: ReadonlySet<string> = new Set()
): ContentItem | undefined {
  const recommendation = getPersonalizedRecommendations(catalog, playback, favorites, 1)[0];
  return recommendation ?? getFeaturedContent(catalog);
}

function scoreItem(
  item: ContentItem,
  profile: TopicProfile,
  playback: Record<string, PlaybackState>,
  favorites: ReadonlySet<string>
): number {
  const progress = playback[item.id];
  const progressRatio = getProgressRatio(progress);
  let score = 0;

  score += (profile.types.get(item.type) ?? 0) * 0.35;

  for (const genre of item.genres) {
    score += (profile.genres.get(normalizeTopic(genre)) ?? 0) * 2;
  }

  for (const category of item.categories
    .map(normalizeTopic)
    .filter((topic) => !GENERIC_TOPICS.has(topic))) {
    score += (profile.categories.get(category) ?? 0) * 0.5;
  }

  if (favorites.has(item.id)) {
    score -= 4;
  }

  if (item.type === "channel" && !progress && (profile.types.get("channel") ?? 0) <= 0) {
    score -= 1.25;
  }

  if (progressRatio >= 0.9) {
    score -= 8;
  } else if (progressRatio > 0) {
    score -= 2 + progressRatio * 3;
  }

  return score;
}

function addWeight<T>(map: Map<T, number>, key: T, weight: number) {
  map.set(key, (map.get(key) ?? 0) + weight);
}

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase();
}
