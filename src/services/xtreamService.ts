import type { ContentItem, Episode, Quality } from "../types/catalog";
import { httpClient } from "../platform/httpClient";
import { isNativeAndroid } from "../platform/platformInfo";

export interface XtreamCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

interface XtreamUserInfo {
  auth?: number | string | boolean;
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
  const normalizedCredentials = normalizeXtreamCredentials(credentials);
  const profile = await requestXtream<XtreamProfileResponse>(normalizedCredentials);
  if (!profile || typeof profile !== "object" || Array.isArray(profile) || !profile.user_info) {
    throw new Error(
      "O endereço respondeu, mas não parece ser uma API Xtream válida (player_api.php)."
    );
  }
  if (!isXtreamAuthenticated(profile.user_info)) {
    throw new Error(
      profile.user_info?.message?.trim() ||
        "Usuário ou senha recusados pelo servidor. Confira os dados da assinatura."
    );
  }

  const requests = await Promise.allSettled([
    requestXtream<XtreamCategory[]>(normalizedCredentials, "get_live_categories"),
    requestXtream<XtreamCategory[]>(normalizedCredentials, "get_vod_categories"),
    requestXtream<XtreamCategory[]>(normalizedCredentials, "get_series_categories"),
    requestXtream<XtreamLiveStream[]>(normalizedCredentials, "get_live_streams"),
    requestXtream<XtreamVodStream[]>(normalizedCredentials, "get_vod_streams"),
    requestXtream<XtreamSeriesStream[]>(normalizedCredentials, "get_series")
  ]);
  const [liveCategories, vodCategories, seriesCategories, liveStreams, vodStreams, seriesStreams] =
    requests.map((request) => (request.status === "fulfilled" && Array.isArray(request.value) ? request.value : [])) as [
      XtreamCategory[],
      XtreamCategory[],
      XtreamCategory[],
      XtreamLiveStream[],
      XtreamVodStream[],
      XtreamSeriesStream[]
    ];

  const liveCategoryMap = mapCategories(liveCategories);
  const vodCategoryMap = mapCategories(vodCategories);
  const seriesCategoryMap = mapCategories(seriesCategories);

  const liveItems = capPerCategory(liveStreams, MAX_ITEMS_PER_CATEGORY).map((stream) =>
    mapLiveStream(stream, liveCategoryMap, normalizedCredentials)
  );
  const vodItems = capPerCategory(vodStreams, MAX_ITEMS_PER_CATEGORY).map((stream) =>
    mapVodStream(stream, vodCategoryMap, normalizedCredentials)
  );
  const seriesItems = capPerCategory(seriesStreams, MAX_ITEMS_PER_CATEGORY).map((stream) =>
    mapSeriesStream(stream, seriesCategoryMap)
  );

  const catalog = [...liveItems, ...vodItems, ...seriesItems].filter(Boolean);

  if (catalog.length === 0) {
    const streamFailure = requests.slice(3).find((request) => request.status === "rejected");
    if (streamFailure?.status === "rejected" && streamFailure.reason instanceof Error) {
      throw streamFailure.reason;
    }
    throw new Error("A conexão funcionou, mas o servidor retornou um catálogo vazio.");
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
  const normalizedCredentials = normalizeXtreamCredentials(credentials);
  const response = await requestXtream<XtreamSeriesInfoResponse>(
    normalizedCredentials,
    "get_series_info",
    { series_id: seriesId }
  );

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
        streamUrl: buildStreamUrl(normalizedCredentials, "series", providerId, extension)
      };
    })
  );
}

async function requestXtream<T>(
  credentials: XtreamCredentials,
  action?: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = buildXtreamRequestUrl(credentials, action, params, isNativeAndroid());

  try {
    const response = await httpClient.get<T>(url);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`status ${response.status}`);
    }

    return response.data;
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
}

export function buildXtreamRequestUrl(
  credentials: XtreamCredentials,
  action?: string,
  params: Record<string, string> = {},
  native = false
): string {
  const normalizedCredentials = normalizeXtreamCredentials(credentials);
  if (native) {
    const target = new URL(normalizedCredentials.serverUrl);
    if (!target.pathname.endsWith("/player_api.php")) {
      target.pathname = `${target.pathname.replace(/\/$/, "")}/player_api.php`;
    }
    target.searchParams.set("username", normalizedCredentials.username);
    target.searchParams.set("password", normalizedCredentials.password);
    if (action) target.searchParams.set("action", action);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    return target.toString();
  }

  const query = new URLSearchParams({
    serverUrl: normalizedCredentials.serverUrl,
    username: normalizedCredentials.username,
    password: normalizedCredentials.password
  });
  if (action) query.set("action", action);
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  return `/api/xtream?${query.toString()}`;
}

const INVISIBLE_CLIPBOARD_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/g;

function cleanClipboardValue(value: string): string {
  return value.replace(INVISIBLE_CLIPBOARD_CHARACTERS, "").trim();
}

export function normalizeXtreamCredentials(credentials: XtreamCredentials): XtreamCredentials {
  const rawServerUrl = cleanClipboardValue(credentials.serverUrl).replace(/：/g, ":");
  if (!rawServerUrl) throw new Error("Informe o endereço do servidor.");
  const pastedUrl = parseServerUrl(rawServerUrl);
  const username =
    cleanClipboardValue(credentials.username) ||
    cleanClipboardValue(pastedUrl.searchParams.get("username") ?? "");
  const password =
    cleanClipboardValue(credentials.password) ||
    cleanClipboardValue(pastedUrl.searchParams.get("password") ?? "");

  if (!username) throw new Error("Informe o usuário Xtream.");
  if (!password) throw new Error("Informe a senha Xtream.");

  return {
    serverUrl: normalizeServerUrl(rawServerUrl),
    username,
    password
  };
}

export function isXtreamAuthenticated(userInfo?: XtreamUserInfo): boolean {
  const auth = userInfo?.auth;
  if (auth === 1 || auth === "1" || auth === true) return true;
  if (typeof auth === "string" && auth.toLowerCase() === "true") return true;

  return auth == null && userInfo?.status?.trim().toLowerCase() === "active";
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
  const input = serverUrl.trim();
  if (!input) {
    throw new Error("Informe o endereço do servidor.");
  }

  const url = parseServerUrl(input);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("O endereço do servidor deve começar com http:// ou https://.");
  }

  url.pathname = url.pathname
    .replace(/\/(?:player_api|get)\.php\/?$/i, "")
    .replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function parseServerUrl(serverUrl: string): URL {
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(serverUrl)
    ? serverUrl
    : `http://${serverUrl}`;
  try {
    return new URL(withProtocol);
  } catch {
    throw new Error("Endereço do servidor inválido. Use host:porta ou http://host:porta.");
  }
}

function describeConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("endereço") || message.includes("informe o endereço")) {
    return error instanceof Error ? error.message : "Endereço do servidor inválido.";
  }
  if (message.includes("certificate") || message.includes("ssl") || message.includes("trust anchor")) {
    return "O certificado HTTPS do servidor não é válido neste aparelho.";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "O servidor demorou demais para responder. Confira a rede e tente novamente.";
  }
  if (message.includes("resolve host") || message.includes("unknown host") || message.includes("name not resolved")) {
    return "Servidor não encontrado. Confira o endereço e a conexão com a internet.";
  }
  if (message.includes("401") || message.includes("403")) {
    return "O servidor recusou o acesso. Confira usuário e senha.";
  }
  if (message.includes("404")) {
    return "O servidor não encontrou player_api.php. Confira o endereço e a porta.";
  }
  if (message.includes("status 5")) {
    return "O servidor IPTV está temporariamente indisponível. Tente novamente em instantes.";
  }

  return "Não foi possível consultar o servidor Xtream. Confira endereço, porta, rede, usuário e senha.";
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
