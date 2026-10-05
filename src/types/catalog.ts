export type ContentType = "movie" | "series" | "channel";

export type XtreamCatalogSection = "live" | "vod" | "series";

export type Quality = "HD" | "Full HD" | "4K" | "HDR10";

export type SortMode = "featured" | "title" | "recent" | "progress";

export interface BaseContent {
  id: string;
  providerId?: string;
  source?: "mock" | "xtream";
  title: string;
  type: ContentType;
  description: string;
  genres: string[];
  categories: string[];
  quality: Quality[];
  year?: number;
  durationSeconds?: number;
  backdropTone: string;
  posterTone: string;
  imageUrl?: string;
  imageCandidates?: string[];
  streamUrl?: string;
  streamCandidates?: string[];
  providerCategoryId?: string;
  providerCategoryName?: string;
  localDownloadUri?: string;
  isFeatured?: boolean;
  addedAt: string;
}

export interface Movie extends BaseContent {
  type: "movie";
  director: string;
  cast: string[];
  rating?: string;
  releasedAt?: string;
  imageCandidates?: string[];
}

export interface Episode {
  id: string;
  providerId?: string;
  title: string;
  season: number;
  episode: number;
  durationSeconds: number;
  description: string;
  streamUrl?: string;
  streamCandidates?: string[];
  imageUrl?: string;
  localDownloadUri?: string;
}

export interface SubtitleResult {
  fileId: string;
  language: string;
  release: string;
  downloads: number;
}

export interface Series extends BaseContent {
  type: "series";
  seasons: number;
  episodes: Episode[];
}

export interface LiveChannel extends BaseContent {
  type: "channel";
  channelNumber: number;
  currentProgram: string;
  nextProgram: string;
}

export type ContentItem = Movie | Series | LiveChannel;

export interface PlaybackState {
  contentId: string;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: string;
}

export interface Profile {
  id: string;
  name: string;
  avatarColor: string;
  createdAt: string;
}

export interface CatalogFilter {
  query?: string;
  type?: ContentType | "all";
  category?: string;
  genre?: string;
  quality?: Quality | "all";
  favoritesOnly?: boolean;
  sort?: SortMode;
}

export type CatalogSectionStatus = "idle" | "loading" | "ready" | "error";

export interface CatalogSectionState {
  status: CatalogSectionStatus;
  error?: string;
}

export interface CatalogViewState {
  query: string;
  category?: string;
  sort: SortMode;
  pageSize: number;
  scrollY: number;
  focusedId?: string;
}
