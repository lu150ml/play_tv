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
  direct_source?: string;
  info?: {
    duration_secs?: string | number;
    plot?: string;
  };
}

interface XtreamSeriesInfoResponse {
  episodes?: Record<string, XtreamSeriesInfoEpisode[]>;
  info?: { cover?: string; movie_image?: string; backdrop_path?: string[] | string };
}

export interface XtreamCatalogResult {
  profile: XtreamProfileResponse;
  catalog: ContentItem[];
  warnings: string[];
  serverUrl: string;
}

const seriesDetailsCache = new Map<string, Promise<XtreamSeriesInfoResponse>>();

// Limite por categoria (não por tipo). Um corte plano em N itens do início da
// lista descartava categorias inteiras que o servidor retorna no fim (ex.:
// Comédia, Netflix). Capando por categoria, toda categoria fica representada.
export async function loadXtreamCatalog(
  credentials: XtreamCredentials
): Promise<XtreamCatalogResult> {
  seriesDetailsCache.clear();
  const profile = await requestXtream<XtreamProfileResponse>(credentials);
  const auth = profile.user_info?.auth;

  if (auth !== 1 && auth !== "1") {
    throw new Error(profile.user_info?.message ?? "Server rejected the Xtream credentials.");
  }

  const requests = await Promise.allSettled([
    requestXtream<XtreamCategory[]>(credentials, "get_live_categories"),
    requestXtream<XtreamCategory[]>(credentials, "get_vod_categories"),
    requestXtream<XtreamCategory[]>(credentials, "get_series_categories"),
    requestXtream<XtreamLiveStream[]>(credentials, "get_live_streams"),
    requestXtream<XtreamVodStream[]>(credentials, "get_vod_streams"),
    requestXtream<XtreamSeriesStream[]>(credentials, "get_series")
  ]);
  const labels = [
    "categorias de TV",
    "categorias de filmes",
    "categorias de series",
    "canais",
    "filmes",
    "series"
  ];
  const warnings = requests.flatMap((result, index) =>
    result.status === "rejected" ? [`Nao foi possivel carregar ${labels[index]}.`] : []
  );
  const value = <T>(index: number): T[] =>
    requests[index]?.status === "fulfilled" && Array.isArray(requests[index].value)
      ? (requests[index].value as T[])
      : [];
  const liveCategories = value<XtreamCategory>(0);
  const vodCategories = value<XtreamCategory>(1);
  const seriesCategories = value<XtreamCategory>(2);
  const liveStreams = value<XtreamLiveStream>(3);
  const vodStreams = value<XtreamVodStream>(4);
  const seriesStreams = value<XtreamSeriesStream>(5);

  const canonicalCredentials = {
    ...credentials,
    serverUrl: getCanonicalServerUrl(credentials.serverUrl, profile)
  };

  const liveCategoryMap = mapCategories(liveCategories);
  const vodCategoryMap = mapCategories(vodCategories);
  const seriesCategoryMap = mapCategories(seriesCategories);

  const liveItems = liveStreams.map((stream) =>
    mapLiveStream(stream, liveCategoryMap, canonicalCredentials)
  );
  const vodItems = vodStreams.map((stream) =>
    mapVodStream(stream, vodCategoryMap, canonicalCredentials)
  );
  const seriesItems = seriesStreams.map((stream) =>
    mapSeriesStream(stream, seriesCategoryMap, canonicalCredentials)
  );

  const catalog = [...liveItems, ...vodItems, ...seriesItems].filter(Boolean);

  if (catalog.length === 0) {
    throw new Error("Connection worked, but the server returned an empty catalog.");
  }

  return {
    profile,
    catalog: catalog.map((item, index) => ({ ...item, isFeatured: index < 6 })),
    warnings,
    serverUrl: canonicalCredentials.serverUrl
  };
}

export async function loadXtreamSeriesEpisodes(
  credentials: XtreamCredentials,
  seriesId: string
): Promise<Episode[]> {
  const response = await loadXtreamSeriesDetails(credentials, seriesId);

  return Object.entries(response.episodes ?? {}).flatMap(([seasonKey, episodes]) =>
    episodes.map((episode, index) => {
      const providerId = String(episode.id ?? `${seriesId}-${seasonKey}-${index + 1}`);
      const episodeNumber = parseNumber(episode.episode_num) ?? index + 1;
      const extensions = episode.container_extension
        ? [episode.container_extension]
        : ["mp4", "m3u8", "ts", "mkv"];
      const directSource = normalizeRemoteMediaUrl(episode.direct_source);
      const streamCandidates = Array.from(new Set([
        ...(directSource ? [directSource] : []),
        ...extensions.map((extension) => buildStreamUrl(credentials, "series", providerId, extension))
      ]));

      return {
        id: `xtream-episode-${providerId}`,
        providerId,
        title: episode.title?.trim() || `Episode ${episodeNumber}`,
        season: parseNumber(seasonKey) ?? 1,
        episode: episodeNumber,
        durationSeconds: parseNumber(episode.info?.duration_secs) ?? 0,
        description: episode.info?.plot || "Episode from the connected IPTV server.",
        streamUrl: streamCandidates[0],
        streamCandidates
      };
    })
  );
}

export async function loadXtreamSeriesArtwork(
  credentials: XtreamCredentials,
  seriesId: string
): Promise<string | undefined> {
  const response = await loadXtreamSeriesDetails(credentials, seriesId);
  const backdrop = Array.isArray(response.info?.backdrop_path)
    ? response.info?.backdrop_path[0]
    : response.info?.backdrop_path;
  return normalizeImage(response.info?.cover || response.info?.movie_image || backdrop, credentials.serverUrl);
}

function loadXtreamSeriesDetails(credentials: XtreamCredentials, seriesId: string) {
  const key = `${normalizeServerUrl(credentials.serverUrl)}|${credentials.username}|${seriesId}`;
  const cached = seriesDetailsCache.get(key);
  if (cached) return cached;
  const request = requestXtream<XtreamSeriesInfoResponse>(credentials, "get_series_info", { series_id: seriesId }, 10_000)
    .catch((error) => { seriesDetailsCache.delete(key); throw error; });
  seriesDetailsCache.set(key, request);
  return request;
}

export function invalidateXtreamSeriesDetails(credentials: XtreamCredentials, seriesId: string) {
  const key = `${normalizeServerUrl(credentials.serverUrl)}|${credentials.username}|${seriesId}`;
  seriesDetailsCache.delete(key);
}

async function requestXtream<T>(
  credentials: XtreamCredentials,
  action?: string,
  params: Record<string, string> = {},
  timeoutMs?: number
): Promise<T> {
  // Credenciais vão no corpo do POST, não na query string: assim não vazam para
  // a coluna de URL do DevTools, logs de proxy ou histórico baseado em URL.
  const controller = timeoutMs ? new AbortController() : undefined;
  const timeout = timeoutMs ? window.setTimeout(() => controller?.abort(), timeoutMs) : undefined;
  let response: Response;
  try {
    response = await fetch("/api/xtream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller?.signal,
      body: JSON.stringify({
        serverUrl: credentials.serverUrl,
        username: credentials.username,
        password: credentials.password,
        action,
        params
      })
    });
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new Error("O servidor demorou mais de 10 segundos para retornar os episodios.");
    }
    throw error;
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Xtream request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

export function normalizeCategory(raw: string): string {
  return raw.trim() || "Outros";
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
    providerCategoryId: String(stream.category_id ?? "uncategorized"),
    quality: inferQuality(title),
    imageUrl: normalizeImage(stream.stream_icon, credentials.serverUrl),
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
    providerCategoryId: String(stream.category_id ?? "uncategorized"),
    quality: inferQuality(title),
    year: parseNumber(stream.year),
    durationSeconds: parseNumber(stream.duration_secs),
    imageUrl: normalizeImage(stream.stream_icon, credentials.serverUrl),
    streamUrl: buildStreamUrl(credentials, "movie", providerId, extension),
    director: "Unknown",
    cast: [],
    backdropTone: toneFor(providerId),
    posterTone: toneFor(`${providerId}-poster`),
    addedAt: parseXtreamDate(stream.added)
  };
}

function mapSeriesStream(stream: XtreamSeriesStream, categories: Map<string, string>, credentials: XtreamCredentials): ContentItem {
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
    providerCategoryId: String(stream.category_id ?? "uncategorized"),
    quality: inferQuality(title),
    year: parseNumber(stream.year),
    imageUrl: normalizeImage(stream.cover, credentials.serverUrl),
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

export function normalizeServerUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  url.pathname = url.pathname.replace(/\/player_api\.php\/?$/i, "").replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function getCanonicalServerUrl(fallback: string, profile: XtreamProfileResponse): string {
  const info = profile.server_info;
  if (!info?.url) return normalizeServerUrl(fallback);
  try {
    const protocol = info.server_protocol === "https" ? "https" : "http";
    return normalizeServerUrl(`${protocol}://${info.url}${info.port ? `:${info.port}` : ""}`);
  } catch {
    return normalizeServerUrl(fallback);
  }
}

function normalizeImage(imageUrl?: string, serverUrl?: string): string | undefined {
  if (!imageUrl || imageUrl.trim().length === 0) {
    return undefined;
  }

  const normalized = imageUrl.trim().replace(/\\\//g, "/");
  try {
    if (normalized.startsWith("//")) return `${new URL(serverUrl ?? "https://localhost").protocol}${normalized}`;
    return new URL(normalized, serverUrl ? `${normalizeServerUrl(serverUrl)}/` : undefined).toString();
  } catch {
    return normalized;
  }
}

function normalizeRemoteMediaUrl(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return new Set(["http:", "https:"]).has(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
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
