import type { ContentItem, Episode, Quality } from "../types/catalog";
import { getChannelStreamCandidates, isTwentyFourHourChannel } from "./streamService";

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

interface XtreamVodInfoResponse {
  info?: {
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
  warnings: string[];
  serverUrl: string;
}

export type XtreamCatalogSection = "live" | "vod" | "series";
export interface XtreamCatalogSectionUpdate {
  section: XtreamCatalogSection;
  items: ContentItem[];
  // "loading" = parcial: a secao ainda esta chegando por categoria.
  status: "ready" | "error" | "loading";
  warning?: string;
}
export interface XtreamCatalogLoadOptions {
  onAuthenticated?: (value: { profile: XtreamProfileResponse; serverUrl: string }) => void | Promise<void>;
  onSection?: (update: XtreamCatalogSectionUpdate) => void;
}

const seriesDetailsCache = new Map<string, Promise<XtreamSeriesInfoResponse>>();

// Limite por categoria (não por tipo). Um corte plano em N itens do início da
// lista descartava categorias inteiras que o servidor retorna no fim (ex.:
// Comédia, Netflix). Capando por categoria, toda categoria fica representada.
export async function loadXtreamCatalog(
  credentials: XtreamCredentials,
  options: XtreamCatalogLoadOptions = {}
): Promise<XtreamCatalogResult> {
  seriesDetailsCache.clear();
  const profile = await requestXtream<XtreamProfileResponse>(credentials);
  const auth = profile.user_info?.auth;

  if (auth !== 1 && auth !== "1") {
    throw new Error(profile.user_info?.message ?? "Server rejected the Xtream credentials.");
  }

  const canonicalCredentials = {
    ...credentials,
    // Usa sempre o endereco digitado pelo usuario. O server_info.url do painel
    // pode apontar para uma CDN (ex.: testmx.b-cdn.net) que faz cache do
    // player_api.php ignorando a query string e devolve respostas de outras
    // contas/acoes, deixando o catalogo vazio ou corrompido.
    serverUrl: normalizeServerUrl(credentials.serverUrl)
  };
  await options.onAuthenticated?.({ profile, serverUrl: canonicalCredentials.serverUrl });

  const sectionTasks = [
    loadCatalogSection("live", canonicalCredentials, options.onSection),
    loadCatalogSection("vod", canonicalCredentials, options.onSection),
    loadCatalogSection("series", canonicalCredentials, options.onSection)
  ].map((task) => task.then((update) => {
    options.onSection?.(update);
    return update;
  }));
  const sections = await Promise.all(sectionTasks);
  const liveItems = sections.find((entry) => entry.section === "live")?.items ?? [];
  const vodItems = sections.find((entry) => entry.section === "vod")?.items ?? [];
  const seriesItems = sections.find((entry) => entry.section === "series")?.items ?? [];
  const warnings = sections.flatMap((entry) => entry.warning ? [entry.warning] : []);

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

async function loadCatalogSection(
  section: XtreamCatalogSection,
  credentials: XtreamCredentials,
  onSection?: (update: XtreamCatalogSectionUpdate) => void
): Promise<XtreamCatalogSectionUpdate> {
  const actions = section === "live"
    ? ["get_live_categories", "get_live_streams"] as const
    : section === "vod"
      ? ["get_vod_categories", "get_vod_streams"] as const
      : ["get_series_categories", "get_series"] as const;
  const label = section === "live" ? "canais" : section === "vod" ? "filmes" : "series";
  const mapItems = (raw: unknown[]) => {
    const categoryMap = mapCategories(categories);
    return raw
      .map((item) => section === "live"
        ? mapLiveStream(item as XtreamLiveStream, categoryMap, credentials)
        : section === "vod"
          ? mapVodStream(item as XtreamVodStream, categoryMap, credentials)
          : mapSeriesStream(item as XtreamSeriesStream, categoryMap, credentials))
      .filter((item): item is ContentItem => item !== undefined);
  };

  let categories: XtreamCategory[] = [];
  let categoriesFailed = false;
  let rawItems: unknown[] | undefined;
  let incompleteWarning: string | undefined;
  if (section === "live") {
    // Canais sao leves (~2 MB): uma requisicao so, em paralelo com as categorias.
    const [categoryResult, itemResult] = await Promise.allSettled([
      requestXtream<XtreamCategory[]>(credentials, actions[0]),
      requestXtream<unknown[]>(credentials, actions[1])
    ]);
    categoriesFailed = categoryResult.status === "rejected";
    categories = categoryResult.status === "fulfilled" && Array.isArray(categoryResult.value) ? categoryResult.value : [];
    rawItems = itemResult.status === "fulfilled" && Array.isArray(itemResult.value) ? itemResult.value : undefined;
  } else {
    // Filmes/series podem passar de 15 MB e o servidor as vezes leva minutos
    // para gerar a lista inteira. Carrega por categoria (respostas pequenas e
    // rapidas) e vai mostrando o que ja chegou; se o servidor nao filtrar por
    // categoria ou alguma falhar, cai para a lista completa.
    try {
      const result = await requestXtream<XtreamCategory[]>(credentials, actions[0]);
      categories = Array.isArray(result) ? result : [];
    } catch {
      categoriesFailed = true;
    }
    const byCategory = await loadStreamsByCategory(credentials, actions[1], section, categories, (partial) => {
      onSection?.({ section, items: ensureUniqueContentIds(mapItems(partial)), status: "loading" });
    }).catch(() => undefined);
    rawItems = byCategory?.complete ? byCategory.items : undefined;
    if (!rawItems) {
      rawItems = await requestXtream<unknown[]>(credentials, actions[1])
        .then((value) => (Array.isArray(value) ? value : undefined))
        .catch(() => undefined);
    }
    // Lista completa tambem falhou: fica com as categorias que chegaram.
    if (!rawItems && byCategory && byCategory.items.length > 0) {
      rawItems = byCategory.items;
      incompleteWarning = `Algumas categorias de ${label} nao carregaram. Use "Atualizar lista" para tentar de novo.`;
    }
  }

  if (!rawItems) {
    return { section, items: [], status: "error", warning: `Nao foi possivel carregar ${label}.` };
  }
  const items = mapItems(rawItems);

  // Se o servidor devolveu uma lista nao-vazia mas quase tudo veio sem nome/id
  // (resposta truncada ou corrompida no meio do caminho, ex.: antivirus/proxy
  // interferindo na conexao), nao mostra um catalogo incompleto como se
  // estivesse tudo certo: trata como erro para o usuario poder tentar de novo.
  if (rawItems.length > 0 && items.length / rawItems.length < 0.5) {
    return {
      section,
      items: [],
      status: "error",
      warning: `A resposta do servidor para ${label} veio incompleta. Tente atualizar a lista novamente.`
    };
  }

  return {
    section,
    items: ensureUniqueContentIds(items),
    status: "ready",
    warning: incompleteWarning ?? (categoriesFailed ? "As categorias desta secao nao puderam ser carregadas." : undefined)
  };
}

const CATEGORY_CONCURRENCY = 6;
const CATEGORY_ATTEMPTS = 3;
// Cada parcial re-renderiza o catalogo inteiro (dezenas de milhares de itens);
// espaçar evita travar a interface enquanto as categorias chegam.
const PARTIAL_EMIT_INTERVAL_MS = 4000;

type RawCategorized = { category_id?: string | number; category_ids?: Array<string | number>; stream_id?: string | number; series_id?: string | number };

// Retorna os itens de todas as categorias, ou undefined para o chamador usar
// a lista completa (sem categorias, servidor ignorando o filtro, ou falha).
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
    let lastError: unknown;
    for (let attempt = 0; attempt < CATEGORY_ATTEMPTS; attempt += 1) {
      try {
        const value = await requestXtream<RawCategorized[]>(credentials, action, { category_id: categoryId });
        if (Array.isArray(value)) return value;
        lastError = new Error("Resposta invalida.");
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };
  const belongsTo = (item: RawCategorized, categoryId: string) =>
    String(item?.category_id ?? "") === categoryId || (item?.category_ids ?? []).some((id) => String(id) === categoryId);

  // Primeira categoria sozinha: se o servidor ignorar o filtro, a resposta ja
  // e a lista completa e nao faz sentido pedir de novo por categoria.
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

  // Categoria que falhar nao derruba as outras: fica para uma nova rodada
  // no final (o Cloudflare do painel corta requisicoes lentas com erro 524).
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

export function ensureUniqueContentIds(items: ContentItem[]): ContentItem[] {
  const seen = new Map<string, number>();

  return items.map((item, index) => {
    const count = seen.get(item.id) ?? 0;
    seen.set(item.id, count + 1);
    if (count === 0) return item;

    const categoryPart = item.providerCategoryId
      ? slugIdPart(item.providerCategoryId)
      : "uncategorized";
    const titlePart = slugIdPart(item.title);
    return {
      ...item,
      id: `${item.id}-${categoryPart}-${titlePart}-${index}`
    };
  });
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

export async function loadXtreamMovieDetails(
  credentials: XtreamCredentials,
  movieId: string
): Promise<XtreamMovieDetails> {
  const response = await requestXtream<XtreamVodInfoResponse>(
    credentials,
    "get_vod_info",
    { vod_id: movieId },
    10_000
  );
  const info = response.info ?? {};
  const movieData = response.movie_data ?? {};
  const providerId = String(movieData.stream_id ?? movieId);
  const extension = movieData.container_extension || "mp4";
  const directSource = normalizeRemoteMediaUrl(movieData.direct_source);
  const imageCandidates = Array.from(new Set([
    normalizeImage(info.movie_image, credentials.serverUrl),
    normalizeImage(info.cover_big, credentials.serverUrl),
    ...(Array.isArray(info.backdrop_path)
      ? info.backdrop_path.map((value) => normalizeImage(value, credentials.serverUrl))
      : [normalizeImage(info.backdrop_path, credentials.serverUrl)])
  ].filter((value): value is string => Boolean(value))));
  const streamCandidates = Array.from(new Set([
    ...(directSource ? [directSource] : []),
    buildStreamUrl(credentials, "movie", providerId, extension),
    ...["mp4", "m3u8", "ts", "mkv"].map((candidate) =>
      buildStreamUrl(credentials, "movie", providerId, candidate)
    )
  ]));

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
    streamCandidates
  };
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
): ContentItem | undefined {
  // O servidor as vezes devolve entradas sem nome/stream_id (resposta truncada,
  // proxy/antivirus interferindo na conexao, etc). Sem esses dois campos nao ha
  // como identificar o canal de verdade, entao descartamos em vez de mostrar um
  // titulo placeholder com UUID aleatorio.
  if (stream.stream_id === undefined && !stream.name?.trim()) return undefined;
  const providerId = String(stream.stream_id ?? stream.name);
  const rawCategory = categories.get(String(stream.category_id ?? "")) ?? "Live TV";
  const categoryName = normalizeCategory(rawCategory);
  const title = stream.name?.trim() || `Channel ${providerId}`;
  const streamUrl = buildStreamUrl(credentials, "live", providerId, "m3u8");
  const streamCandidates = getChannelStreamCandidates(streamUrl, {
    preferTransportStream: isTwentyFourHourChannel(title, [rawCategory, categoryName])
  });

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
    streamUrl: streamCandidates[0] ?? streamUrl,
    streamCandidates,
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
): ContentItem | undefined {
  if (stream.stream_id === undefined && !stream.name?.trim()) return undefined;
  const providerId = String(stream.stream_id ?? stream.name);
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

function mapSeriesStream(stream: XtreamSeriesStream, categories: Map<string, string>, credentials: XtreamCredentials): ContentItem | undefined {
  if (stream.series_id === undefined && !stream.name?.trim()) return undefined;
  const providerId = String(stream.series_id ?? stream.name);
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

function slugIdPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "item";
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
  return Array.from(new Set(
    String(value ?? "")
      .split(/[,/]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  ));
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
