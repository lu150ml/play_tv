export interface EpisodeFailure {
  reason: string;
  checkedAt: number;
  expiresAt: number;
}

const failures = new Map<string, EpisodeFailure>();
const DEFINITIVE_TTL = 24 * 60 * 60 * 1000;
const SERVER_TTL = 10 * 60 * 1000;

function key(accountKey: string, episodeId: string) {
  return `${accountKey}:${episodeId}`;
}

export function getEpisodeFailure(accountKey: string, episodeId?: string): EpisodeFailure | undefined {
  if (!episodeId) return undefined;
  const cacheKey = key(accountKey, episodeId);
  const failure = failures.get(cacheKey);
  if (!failure) return undefined;
  if (failure.expiresAt <= Date.now()) {
    failures.delete(cacheKey);
    return undefined;
  }
  return failure;
}

export function clearEpisodeFailure(accountKey: string, episodeId?: string) {
  if (episodeId) failures.delete(key(accountKey, episodeId));
}

export function recordEpisodeFailure(accountKey: string, episodeId: string, error: unknown): EpisodeFailure | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLocaleLowerCase();
  const isDefinitive = /(401|403|404|410|recusou o acesso|nao existe mais)/.test(normalized);
  const isServerFailure = /(5\d\d|servidor falhou|servidor.*indisponivel)/.test(normalized);
  if (!isDefinitive && !isServerFailure) return undefined;
  const checkedAt = Date.now();
  const failure = {
    reason: isDefinitive
      ? "Este episodio esta indisponivel no servidor."
      : "O servidor deste episodio esta temporariamente indisponivel.",
    checkedAt,
    expiresAt: checkedAt + (isDefinitive ? DEFINITIVE_TTL : SERVER_TTL)
  };
  failures.set(key(accountKey, episodeId), failure);
  return failure;
}

export function clearEpisodeFailureCache() {
  failures.clear();
}
