import type {
  ContentItem,
  Episode,
  Quality,
  XtreamCatalogSection
} from "../types/catalog";
import { httpClient } from "../platform/httpClient";
import { isNativeAndroid } from "../platform/platformInfo";
import { diagnostics } from "./diagnosticsService";

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
  direct_source?: string;
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
  direct_source?: string;
}

interface XtreamVodInfoResponse {
  info?: {
    name?: string;
    o_name?: string;
    movie_image?: string;
    cover_big?: string;
    backdrop_path?: string[] | string;
    plot?: string;
    description?: string;
    genre?: string;
    cast?: string;
    director?: string;
    releasedate?: string;
    year?: string | number;
    duration_secs?: string | number;
    duration?: string;
    rating?: string;
  };
  movie_data?: {
    stream_id?: string | number;
    container_extension?: string;
    direct_source?: string;
  };
}

interface XtreamSeriesStream {
  series_id?: string | number;
  name?: string;
  cover?: string;
  category_id?: string | number;
  last_modified?: string | number;
  year?: string | number;
  rating?: string;
  backdrop_path?: string[] | string;
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
  info?: {
    cover?: string;
    movie_image?: string;
    backdrop_path?: string[] | string;
  };
  episodes?: Record<string, XtreamSeriesInfoEpisode[]>;
}

export interface XtreamSeriesDetails { episodes: Episode[]; imageCandidates: string[]; }

export interface XtreamMovieDetails {
  description?: string;
  genres?: string[];
  year?: number;
  durationSeconds?: number;
  director?: string;
  cast?: string[];
  rating?: string;
  releasedAt?: string;
  imageCandidates: string[];
  streamCandidates?: string[];
}

export interface XtreamCatalogResult {
  profile: XtreamProfileResponse;
  catalog: ContentItem[];
}

export interface XtreamCatalogSectionUpdate {
  section: XtreamCatalogSection;
  items: ContentItem[];
  // "loading" = parcial: a secao ainda esta chegando por categoria.
  status: "ready" | "error" | "loading";
  error?: string;
}

export interface XtreamProgressiveLoad {
  profile: XtreamProfileResponse;
  completion: Promise<ContentItem[]>;
}

type SectionListener = (update: XtreamCatalogSectionUpdate) => void;

export async function loadXtreamCatalog(
  credentials: XtreamCredentials
): Promise<XtreamCatalogResult> {
  const progressive = await beginXtreamCatalogLoad(credentials);
  const catalog = await progressive.completion;
  if (catalog.length === 0) {
    throw new Error("A conexão funcionou, mas o servidor retornou um catálogo vazio.");
  }
  return { profile: progressive.profile, catalog };
}

export async function beginXtreamCatalogLoad(
  credentials: XtreamCredentials,
  onSection?: SectionListener
): Promise<XtreamProgressiveLoad> {
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

  const sectionTasks = [
    loadSection(normalizedCredentials, "live", onSection),
    loadSection(normalizedCredentials, "vod", onSection),
    loadSection(normalizedCredentials, "series", onSection)
  ];

  const completion = Promise.all(sectionTasks).then((sections) => {
    const catalog = sections.flat();
    return catalog.map((item, index) => ({ ...item, isFeatured: index < 6 }));
  });

  return { profile, completion };
}

/** Recarrega apenas uma seção específica (usado pelo botão "Tentar novamente"). */
export async function reloadXtreamSection(
  credentials: XtreamCredentials,
  section: XtreamCatalogSection,
  onSection: SectionListener
): Promise<void> {
  const normalizedCredentials = normalizeXtreamCredentials(credentials);
  await loadSection(normalizedCredentials, section, onSection);
}

async function loadSection(
  credentials: XtreamCredentials,
  section: XtreamCatalogSection,
  onSection?: SectionListener
): Promise<ContentItem[]> {
  const actions = section === "live"
    ? (["get_live_categories", "get_live_streams"] as const)
    : section === "vod"
      ? (["get_vod_categories", "get_vod_streams"] as const)
      : (["get_series_categories", "get_series"] as const);

  try {
    let categories: XtreamCategory[] = [];
    let streams: unknown;
    if (section === "live") {
      // Categorias e streams são independentes: falha em categorias não pode
      // derrubar a seção inteira (comum em alguns painéis Xtream).
      const [categoryResult, streamResult] = await Promise.allSettled([
        requestXtream<XtreamCategory[]>(credentials, actions[0]),
        requestXtream<XtreamLiveStream[]>(credentials, actions[1])
      ]);
      if (streamResult.status === "rejected") {
        throw streamResult.reason instanceof Error
          ? streamResult.reason
          : new Error("Falha ao carregar esta seção.");
      }
      categories =
        categoryResult.status === "fulfilled" && Array.isArray(categoryResult.value)
          ? categoryResult.value
          : [];
      streams = streamResult.value;
    } else {
      // Filmes/séries podem passar de 15 MB e o painel às vezes leva mais de
      // 90 s para gerar a lista inteira (estoura o timeout). Carrega por
      // categoria (respostas pequenas) e mostra o que já chegou; se o servidor
      // ignorar o filtro ou categorias falharem, usa a lista completa.
      categories = await requestXtream<XtreamCategory[]>(credentials, actions[0])
        .then((value) => (Array.isArray(value) ? value : []))
        .catch(() => []);
      const partialMap = mapCategories(categories);
      const mapPartial = (raw: unknown[]) =>
        section === "vod"
          ? (raw as XtreamVodStream[]).map((stream) => mapVodStream(stream, partialMap, credentials))
          : (raw as XtreamSeriesStream[]).map((stream) => mapSeriesStream(stream, partialMap, credentials));
      const byCategory = await loadStreamsByCategory(credentials, actions[1], section, categories, (partial) => {
        onSection?.({ section, items: mapPartial(partial), status: "loading" });
      }).catch(() => undefined);
      if (byCategory?.complete) {
        streams = byCategory.items;
      } else {
        try {
          streams = await requestXtream<unknown[]>(credentials, actions[1]);
        } catch (error) {
          // Lista completa também falhou: fica com as categorias que chegaram.
          if (!byCategory || byCategory.items.length === 0) throw error;
          streams = byCategory.items;
        }
      }
    }

    const categoryMap = mapCategories(categories);
    const safeStreams = Array.isArray(streams) ? streams : [];
    const items = section === "live"
      ? (safeStreams as XtreamLiveStream[]).map((stream) =>
          mapLiveStream(stream, categoryMap, credentials)
        )
      : section === "vod"
        ? (safeStreams as XtreamVodStream[]).map((stream) =>
            mapVodStream(stream, categoryMap, credentials)
          )
        : (safeStreams as XtreamSeriesStream[]).map((stream) =>
            mapSeriesStream(stream, categoryMap, credentials)
          );
    const featured = items.map((item, index) => ({ ...item, isFeatured: index < 2 }));
    onSection?.({ section, items: featured, status: "ready" });
    return featured;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar esta seção.";
    onSection?.({ section, items: [], status: "error", error: message });
    return [];
  }
}

const CATEGORY_CONCURRENCY = 6;
// Cada parcial re-renderiza o catálogo inteiro (dezenas de milhares de itens);
// espaçar evita travar a interface (TV Box/Fire Stick) enquanto chegam.
const PARTIAL_EMIT_INTERVAL_MS = 5000;

type RawCategorized = { category_id?: string | number; category_ids?: Array<string | number>; stream_id?: string | number; series_id?: string | number };

// Retorna os itens de todas as categorias, ou undefined para o chamador usar a
// lista completa (sem categorias ou servidor ignorando o filtro).
// requestXtream já retenta cada requisição; aqui só há uma rodada extra no
// final para as categorias que falharam.
export async function loadStreamsByCategory(
  credentials: XtreamCredentials,
  action: string,
  section: "vod" | "series",
  categories: XtreamCategory[],
  onPartial?: (items: unknown[]) => void
): Promise<{ items: unknown[]; complete: boolean } | undefined> {
  const categoryIds = [...new Set(categories.map((category) => String(category.category_id ?? "")).filter(Boolean))];
  if (categoryIds.length === 0) return undefined;

  const fetchCategory = async (categoryId: string) => {
    const value = await requestXtream<RawCategorized[]>(credentials, action, { category_id: categoryId });
    if (!Array.isArray(value)) throw new Error("Resposta inválida.");
    return value;
  };
  const belongsTo = (item: RawCategorized, categoryId: string) =>
    String(item?.category_id ?? "") === categoryId || (item?.category_ids ?? []).some((id) => String(id) === categoryId);

  // Primeira categoria sozinha: se o servidor ignorar o filtro, a resposta já
  // é a lista completa e não faz sentido pedir de novo por categoria.
  const first = await fetchCategory(categoryIds[0]);
  if (first.length > 0 && first.filter((item) => belongsTo(item, categoryIds[0])).length < first.length / 2) {
    return { items: first, complete: true };
  }

  const idKey = section === "series" ? "series_id" : "stream_id";
  const seen = new Set<string>();
  const collected: unknown[] = [];
  const add = (items: RawCategorized[]) => {
    for (const item of items) {
      const id = item?.[idKey];
      if (id !== undefined) {
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      collected.push(item);
    }
  };
  add(first);
  let lastEmit = 0;
  const emit = (force = false) => {
    if (!onPartial || collected.length === 0) return;
    const now = Date.now();
    if (!force && now - lastEmit < PARTIAL_EMIT_INTERVAL_MS) return;
    lastEmit = now;
    onPartial([...collected]);
  };
  emit(true);

  const failed: string[] = [];
  const queue = categoryIds.slice(1);
  await Promise.all(Array.from({ length: Math.min(CATEGORY_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const categoryId = queue.shift() as string;
      try {
        add(await fetchCategory(categoryId));
      } catch {
        failed.push(categoryId);
      }
      emit();
    }
  }));
  const stillFailed: string[] = [];
  for (const categoryId of failed) {
    try {
      add(await fetchCategory(categoryId));
    } catch {
      stillFailed.push(categoryId);
    }
  }
  return { items: collected, complete: stillFailed.length === 0 };
}

export async function loadXtreamSeriesEpisodes(
  credentials: XtreamCredentials,
  seriesId: string
): Promise<Episode[]> {
  return (await loadXtreamSeriesDetails(credentials, seriesId)).episodes;
}

export async function loadXtreamSeriesDetails(
  credentials: XtreamCredentials,
  seriesId: string
): Promise<XtreamSeriesDetails> {
  const normalizedCredentials = normalizeXtreamCredentials(credentials);
  const response = await requestXtream<XtreamSeriesInfoResponse>(
    normalizedCredentials,
    "get_series_info",
    { series_id: seriesId }
  );

  const episodes = Object.entries(response.episodes ?? {}).flatMap(([seasonKey, episodes]) =>
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
        streamUrl: buildStreamUrl(normalizedCredentials, "series", providerId, extension),
        streamCandidates: buildOnDemandCandidates(
          normalizedCredentials,
          "series",
          providerId,
          extension,
          episode.direct_source
        )
      };
    })
  );
  const imageCandidates = uniqueUrls([
    normalizeImage(response.info?.cover, normalizedCredentials.serverUrl),
    normalizeImage(response.info?.movie_image, normalizedCredentials.serverUrl),
    ...(Array.isArray(response.info?.backdrop_path)
      ? response.info.backdrop_path.map((value) => normalizeImage(value, normalizedCredentials.serverUrl))
      : [normalizeImage(response.info?.backdrop_path, normalizedCredentials.serverUrl)])
  ]);
  return { episodes, imageCandidates };
}

export async function loadXtreamMovieDetails(
  credentials: XtreamCredentials,
  movieId: string
): Promise<XtreamMovieDetails> {
  const normalizedCredentials = normalizeXtreamCredentials(credentials);
  const response = await requestXtream<XtreamVodInfoResponse>(
    normalizedCredentials,
    "get_vod_info",
    { vod_id: movieId }
  );
  const info = response.info ?? {};
  const movieData = response.movie_data ?? {};
  const providerId = String(movieData.stream_id ?? movieId);
  const extension = movieData.container_extension || "mp4";
  const imageCandidates = uniqueUrls([
    normalizeImage(info.movie_image, normalizedCredentials.serverUrl),
    normalizeImage(info.cover_big, normalizedCredentials.serverUrl),
    ...(Array.isArray(info.backdrop_path)
      ? info.backdrop_path.map((value) => normalizeImage(value, normalizedCredentials.serverUrl))
      : [normalizeImage(info.backdrop_path, normalizedCredentials.serverUrl)])
  ]);

  return {
    description: info.plot || info.description,
    genres: splitList(info.genre),
    year: parseYear(info.year ?? info.releasedate),
    durationSeconds: parseDurationSeconds(info.duration_secs, info.duration),
    director: info.director?.trim(),
    cast: splitList(info.cast),
    rating: info.rating?.trim(),
    releasedAt: info.releasedate?.trim(),
    imageCandidates,
    streamCandidates: buildOnDemandCandidates(
      normalizedCredentials,
      "movie",
      providerId,
      extension,
      movieData.direct_source
    )
  };
}

async function requestXtream<T>(
  credentials: XtreamCredentials,
  action?: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = buildXtreamRequestUrl(credentials, action, params, isNativeAndroid());
  // VOD e séries têm payloads maiores; dar mais tempo de leitura.
  const isHeavyAction = action === "get_vod_streams" || action === "get_series";
  const readTimeout = isHeavyAction ? 90_000 : 30_000;

  const start = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await httpClient.get<T>(url, { readTimeout, connectTimeout: 15_000 });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`status ${response.status}`);
      }
      diagnostics.record({ action: action ?? "auth", attempt, durationMs: Date.now() - start, status: response.status });
      return response.data;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message.toLowerCase() : "";
      // Não retentar erros definitivos: auth, not found, servidor inválido.
      const isDefinitive = /401|403|404|status 4/.test(msg) || /usuário|senha|endereço|recusado|inválid/i.test(msg);
      // Só retentar erros de rede/timeout (não erros genéricos de servidor).
      const isRetryable = !isDefinitive && (
        msg.includes("timed out") || msg.includes("connect timeout") || msg.includes("read timeout") ||
        msg.includes("network") || msg.includes("econnreset") || msg.includes("econnrefused") ||
        msg.includes("socket") || msg.includes("status 5") || msg.includes("abort") ||
        msg.includes("request failed") || msg.includes("demorou")
      );
      diagnostics.record({ action: action ?? "auth", attempt, durationMs: Date.now() - start, status: /status (\d+)/.exec(msg)?.[1] ? Number(/status (\d+)/.exec(msg)?.[1]) : undefined, error: msg });
      if (!isRetryable || attempt === 3) break;
      // Backoff progressivo: 2s na 1ª retentativa, 5s na 2ª.
      await new Promise<void>((resolve) => setTimeout(resolve, attempt === 1 ? 2_000 : 5_000));
    }
  }

  throw new Error(describeConnectionError(lastError));
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
    providerCategoryId: String(stream.category_id ?? ""),
    providerCategoryName: rawCategory,
    quality: inferQuality(title),
    imageUrl: normalizeImage(stream.stream_icon, credentials.serverUrl),
    imageCandidates: [normalizeImage(stream.stream_icon, credentials.serverUrl)].filter((value): value is string => Boolean(value)),
    streamUrl: buildStreamUrl(credentials, "live", providerId, "m3u8"),
    streamCandidates: buildLiveCandidates(credentials, providerId, stream.direct_source),
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
    providerCategoryId: String(stream.category_id ?? ""),
    providerCategoryName: rawCategory,
    quality: inferQuality(title),
    year: parseNumber(stream.year),
    durationSeconds: parseNumber(stream.duration_secs),
    imageUrl: normalizeImage(stream.stream_icon, credentials.serverUrl),
    imageCandidates: [normalizeImage(stream.stream_icon, credentials.serverUrl)].filter((value): value is string => Boolean(value)),
    streamUrl: buildStreamUrl(credentials, "movie", providerId, extension),
    streamCandidates: buildOnDemandCandidates(
      credentials,
      "movie",
      providerId,
      extension,
      stream.direct_source
    ),
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
    providerCategoryId: String(stream.category_id ?? ""),
    providerCategoryName: rawCategory,
    quality: inferQuality(title),
    year: parseNumber(stream.year),
    imageUrl: normalizeImage(stream.cover, credentials.serverUrl),
    imageCandidates: [
      normalizeImage(stream.cover, credentials.serverUrl),
      ...(Array.isArray(stream.backdrop_path)
        ? stream.backdrop_path.map((value) => normalizeImage(value, credentials.serverUrl))
        : [normalizeImage(stream.backdrop_path, credentials.serverUrl)])
    ].filter((value): value is string => Boolean(value)),
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

function buildLiveCandidates(
  credentials: XtreamCredentials,
  streamId: string,
  directSource?: string
): string[] {
  return uniqueUrls([
    normalizeStreamSource(directSource, credentials.serverUrl),
    buildStreamUrl(credentials, "live", streamId, "m3u8"),
    buildStreamUrl(credentials, "live", streamId, "ts")
  ]);
}

function buildOnDemandCandidates(
  credentials: XtreamCredentials,
  kind: "movie" | "series",
  streamId: string,
  extension: string,
  directSource?: string
): string[] {
  return uniqueUrls([
    normalizeStreamSource(directSource, credentials.serverUrl),
    buildStreamUrl(credentials, kind, streamId, extension),
    ...["mp4", "m3u8", "ts", "mkv"].map((candidate) =>
      buildStreamUrl(credentials, kind, streamId, candidate)
    )
  ]);
}

function normalizeStreamSource(source: string | undefined, serverUrl: string): string | undefined {
  const value = source?.trim();
  if (!value) return undefined;
  try {
    return new URL(value, `${normalizeServerUrl(serverUrl)}/`).toString();
  } catch {
    return undefined;
  }
}

function uniqueUrls(urls: Array<string | undefined>): string[] {
  return Array.from(new Set(urls.filter((value): value is string => Boolean(value))));
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

  url.pathname = url.pathname.replace(/\/(?:player_api|get)\.php\/?$/i, "").replace(/\/$/, "");
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
  if (
    message.includes("certificate") ||
    message.includes("ssl") ||
    message.includes("trust anchor")
  ) {
    return "O certificado HTTPS do servidor não é válido neste aparelho.";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "O servidor demorou demais para responder. Confira a rede e tente novamente.";
  }
  if (
    message.includes("resolve host") ||
    message.includes("unknown host") ||
    message.includes("name not resolved")
  ) {
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

function normalizeImage(imageUrl?: string, serverUrl?: string): string | undefined {
  if (!imageUrl || imageUrl.trim().length === 0) {
    return undefined;
  }

  const value = imageUrl.trim();
  if (!serverUrl) return value;
  try { return new URL(value, `${normalizeServerUrl(serverUrl)}/`).toString(); }
  catch { return undefined; }
}

function parseNumber(value?: string | number): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseYear(value?: string | number): number | undefined {
  const match = String(value ?? "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : parseNumber(value);
}

function parseDurationSeconds(seconds?: string | number, duration?: string): number | undefined {
  const direct = parseNumber(seconds);
  if (direct) return direct;
  const parts = String(duration ?? "").split(":").map((part) => Number(part));
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return parts[0] * 60 + parts[1];
  }
  return undefined;
}

function splitList(value?: string): string[] {
  return uniqueValues(
    String(value ?? "")
      .split(/[,/]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
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
