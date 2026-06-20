import type { ContentItem, Episode, Quality } from "../types/catalog";

export interface XtreamCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

interface XtreamUserInfo {
  auth?: number | string;
  status?: string;
  message?: string;
}

interface XtreamProfileResponse {
  user_info?: XtreamUserInfo;
  server_info?: {
    url?: string;
    port?: string;
    server_protocol?: string;
  };
}

interface XtreamCategory {
  category_id?: string | number;
  category_name?: string;
}

interface XtreamLiveStream {
  stream_id?: string | number;
  name?: string;
  stream_icon?: string;
  category_id?: string | number;
  added?: string | number;
  epg_channel_id?: string;
  num?: number;
}

interface XtreamVodStream {
  stream_id?: string | number;
  name?: string;
  stream_icon?: string;
  category_id?: string | number;
  added?: string | number;
  year?: string | number;
  rating?: string;
  container_extension?: string;
  duration_secs?: string | number;
}

interface XtreamSeriesStream {
  series_id?: string | number;
  name?: string;
  cover?: string;
  category_id?: string | number;
  last_modified?: string | number;
  year?: string | number;
  rating?: string;
}

interface XtreamSeriesInfoEpisode {
  id?: string | number;
  episode_num?: string | number;
  title?: string;
  container_extension?: string;
  info?: {
    duration_secs?: string | number;
    plot?: string;
  };
}

interface XtreamSeriesInfoResponse {
  episodes?: Record<string, XtreamSeriesInfoEpisode[]>;
}

export interface XtreamCatalogResult {
  profile: XtreamProfileResponse;
  catalog: ContentItem[];
}

// Limite por categoria (não por tipo). Um corte plano em N itens do início da
// lista descartava categorias inteiras que o servidor retorna no fim (ex.:
// Comédia, Netflix). Capando por categoria, toda categoria fica representada.
const MAX_ITEMS_PER_CATEGORY = 600;

function capPerCategory<T extends { category_id?: string | number }>(
  streams: T[],
  max: number
): T[] {
  const counts = new Map<string, number>();
  const result: T[] = [];

  for (const stream of streams) {
    const key = String(stream.category_id ?? "uncategorized");
    const count = counts.get(key) ?? 0;

    if (count >= max) {
      continue;
    }

    counts.set(key, count + 1);
    result.push(stream);
  }

  return result;
}

export async function loadXtreamCatalog(
  credentials: XtreamCredentials
): Promise<XtreamCatalogResult> {
  const profile = await requestXtream<XtreamProfileResponse>(credentials);
  const auth = profile.user_info?.auth;

  if (auth !== 1 && auth !== "1") {
    throw new Error(profile.user_info?.message ?? "Server rejected the Xtream credentials.");
  }

  const [liveCategories, vodCategories, seriesCategories, liveStreams, vodStreams, seriesStreams] =
    await Promise.all([
      requestXtream<XtreamCategory[]>(credentials, "get_live_categories"),
      requestXtream<XtreamCategory[]>(credentials, "get_vod_categories"),
      requestXtream<XtreamCategory[]>(credentials, "get_series_categories"),
      requestXtream<XtreamLiveStream[]>(credentials, "get_live_streams"),
      requestXtream<XtreamVodStream[]>(credentials, "get_vod_streams"),
      requestXtream<XtreamSeriesStream[]>(credentials, "get_series")
    ]);

  const liveCategoryMap = mapCategories(liveCategories);
  const vodCategoryMap = mapCategories(vodCategories);
  const seriesCategoryMap = mapCategories(seriesCategories);

  const liveItems = capPerCategory(liveStreams, MAX_ITEMS_PER_CATEGORY).map((stream) =>
    mapLiveStream(stream, liveCategoryMap, credentials)
  );
  const vodItems = capPerCategory(vodStreams, MAX_ITEMS_PER_CATEGORY).map((stream) =>
    mapVodStream(stream, vodCategoryMap, credentials)
  );
  const seriesItems = capPerCategory(seriesStreams, MAX_ITEMS_PER_CATEGORY).map((stream) =>
    mapSeriesStream(stream, seriesCategoryMap)
  );

  const catalog = [...liveItems, ...vodItems, ...seriesItems].filter(Boolean);

  if (catalog.length === 0) {
    throw new Error("Connection worked, but the server returned an empty catalog.");
  }

  return {
    profile,
    catalog: catalog.map((item, index) => ({ ...item, isFeatured: index < 6 }))
  };
}

export async function loadXtreamSeriesEpisodes(
  credentials: XtreamCredentials,
  seriesId: string
): Promise<Episode[]> {
  const response = await requestXtream<XtreamSeriesInfoResponse>(credentials, "get_series_info", {
    series_id: seriesId
  });

  return Object.entries(response.episodes ?? {}).flatMap(([seasonKey, episodes]) =>
    episodes.map((episode, index) => {
      const providerId = String(episode.id ?? `${seriesId}-${seasonKey}-${index + 1}`);
      const episodeNumber = parseNumber(episode.episode_num) ?? index + 1;
      const extension = episode.container_extension || "mp4";

      return {
        id: `xtream-episode-${providerId}`,
        providerId,
        title: episode.title?.trim() || `Episode ${episodeNumber}`,
        season: parseNumber(seasonKey) ?? 1,
        episode: episodeNumber,
        durationSeconds: parseNumber(episode.info?.duration_secs) ?? 0,
        description: episode.info?.plot || "Episode from the connected IPTV server.",
        streamUrl: buildStreamUrl(credentials, "series", providerId, extension)
      };
    })
  );
}

async function requestXtream<T>(
  credentials: XtreamCredentials,
  action?: string,
  params: Record<string, string> = {}
): Promise<T> {
  const query = new URLSearchParams({
    serverUrl: credentials.serverUrl,
    username: credentials.username,
    password: credentials.password
  });

  if (action) {
    query.set("action", action);
  }

  for (const [key, value] of Object.entries(params)) {
    query.set(key, value);
  }

  const response = await fetch(`/api/xtream?${query.toString()}`);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Xtream request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

// "FILMES | DRAMA" → "Drama", "CANAIS | ESPN" → "ESPN", "SÉRIES | NETFLIX" → "Netflix"
function normalizeCategory(raw: string): string {
  const parts = raw.split("|");
  const label = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();
  if (!label) return raw;

  // Capitaliza cada palavra usando split por espaço (funciona com acentos)
  const titleCase = label
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");

  // Siglas e marcas conhecidas em caixa alta
  return titleCase
    .replace(/\bTv\b/g, "TV")
    .replace(/\bHbo\b/g, "HBO")
    .replace(/\bEspn\b/g, "ESPN")
    .replace(/\bSbt\b/g, "SBT")
    .replace(/\bUfc\b/g, "UFC")
    .replace(/\bUhd\b/g, "UHD")
    .replace(/\b4k\b/gi, "4K")
    .replace(/\bHdr\b/gi, "HDR")
    .replace(/\b24h\b/gi, "24h");
}

function mapCategories(categories: XtreamCategory[]): Map<string, string> {
  const entries = categories
    .map((category): [string, string] => [
      String(category.category_id ?? ""),
      category.category_name ?? "Other"
    ])
    .filter(([id]) => id.length > 0);

  return new Map(entries);
}

function mapLiveStream(
  stream: XtreamLiveStream,
  categories: Map<string, string>,
  credentials: XtreamCredentials
): ContentItem {
  const providerId = String(stream.stream_id ?? stream.name ?? crypto.randomUUID());
  const rawCategory = categories.get(String(stream.category_id ?? "")) ?? "Live TV";
  const categoryName = normalizeCategory(rawCategory);
  const title = stream.name?.trim() || `Channel ${providerId}`;

  return {
    id: `xtream-live-${providerId}`,
    providerId,
    source: "xtream",
    type: "channel",
    title,
    description: stream.epg_channel_id
      ? `Live channel mapped to EPG ${stream.epg_channel_id}.`
      : "Live channel from the connected IPTV server.",
    genres: [categoryName],
    categories: ["Live TV", categoryName],
    quality: inferQuality(title),
    imageUrl: normalizeImage(stream.stream_icon),
    streamUrl: buildStreamUrl(credentials, "live", providerId, "m3u8"),
    channelNumber: stream.num ?? (Number(providerId) || 0),
    currentProgram: "Live now",
    nextProgram: "Up next",
    backdropTone: toneFor(providerId),
    posterTone: toneFor(`${providerId}-poster`),
    addedAt: parseXtreamDate(stream.added)
  };
}

function mapVodStream(
  stream: XtreamVodStream,
  categories: Map<string, string>,
  credentials: XtreamCredentials
): ContentItem {
  const providerId = String(stream.stream_id ?? stream.name ?? crypto.randomUUID());
  const rawCategory = categories.get(String(stream.category_id ?? "")) ?? "Movies";
  const categoryName = normalizeCategory(rawCategory);
  const title = stream.name?.trim() || `Movie ${providerId}`;
  const extension = stream.container_extension || "mp4";

  return {
    id: `xtream-movie-${providerId}`,
    providerId,
    source: "xtream",
    type: "movie",
    title,
    description: stream.rating
      ? `Movie from ${categoryName}. Rating: ${stream.rating}.`
      : `Movie from ${categoryName}.`,
    genres: [categoryName],
    categories: ["Movies", categoryName],
    quality: inferQuality(title),
    year: parseNumber(stream.year),
    durationSeconds: parseNumber(stream.duration_secs),
    imageUrl: normalizeImage(stream.stream_icon),
    streamUrl: buildStreamUrl(credentials, "movie", providerId, extension),
    director: "Unknown",
    cast: [],
    backdropTone: toneFor(providerId),
    posterTone: toneFor(`${providerId}-poster`),
    addedAt: parseXtreamDate(stream.added)
  };
}

function mapSeriesStream(stream: XtreamSeriesStream, categories: Map<string, string>): ContentItem {
  const providerId = String(stream.series_id ?? stream.name ?? crypto.randomUUID());
  const rawCategory = categories.get(String(stream.category_id ?? "")) ?? "Series";
  const categoryName = normalizeCategory(rawCategory);
  const title = stream.name?.trim() || `Series ${providerId}`;

  return {
    id: `xtream-series-${providerId}`,
    providerId,
    source: "xtream",
    type: "series",
    title,
    description: stream.rating
      ? `Series from ${categoryName}. Rating: ${stream.rating}.`
      : `Series from ${categoryName}.`,
    genres: [categoryName],
    categories: ["Series", categoryName],
    quality: inferQuality(title),
    year: parseNumber(stream.year),
    imageUrl: normalizeImage(stream.cover),
    seasons: 0,
    episodes: [],
    backdropTone: toneFor(providerId),
    posterTone: toneFor(`${providerId}-poster`),
    addedAt: parseXtreamDate(stream.last_modified)
  };
}

function buildStreamUrl(
  credentials: XtreamCredentials,
  kind: "live" | "movie" | "series",
  streamId: string,
  extension: string
): string {
  const base = normalizeServerUrl(credentials.serverUrl);
  return `${base}/${kind}/${encodeURIComponent(credentials.username)}/${encodeURIComponent(
    credentials.password
  )}/${streamId}.${extension}`;
}

function normalizeServerUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeImage(imageUrl?: string): string | undefined {
  if (!imageUrl || imageUrl.trim().length === 0) {
    return undefined;
  }

  return imageUrl.trim();
}

function parseNumber(value?: string | number): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseXtreamDate(value?: string | number): string {
  const parsed = Number(value);

  if (Number.isFinite(parsed) && parsed > 0) {
    return new Date(parsed * 1000).toISOString();
  }

  return new Date().toISOString();
}

function inferQuality(title: string): Quality[] {
  const normalized = title.toLowerCase();

  if (normalized.includes("4k") || normalized.includes("uhd")) {
    return ["4K"];
  }

  if (normalized.includes("hdr")) {
    return ["HDR10"];
  }

  if (normalized.includes("fhd") || normalized.includes("1080")) {
    return ["Full HD"];
  }

  return ["HD"];
}

function toneFor(seed: string): string {
  const tones = [
    "from-cyan-500/25 via-slate-900 to-black",
    "from-violet-400/20 via-slate-900 to-black",
    "from-emerald-400/20 via-slate-900 to-black",
    "from-red-400/20 via-slate-900 to-black",
    "from-amber-300/20 via-slate-900 to-black",
    "from-sky-400/25 via-slate-900 to-black"
  ];
  const index =
    Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0) % tones.length;

  return tones[index] ?? tones[0];
}
