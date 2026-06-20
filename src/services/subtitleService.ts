import type { ContentItem, Episode, SubtitleResult } from "../types/catalog";

// Remove ruídos do título do catálogo Xtream para melhorar a busca de legendas:
// "A Empregada [4K HDR] (2025)" -> "A Empregada"
export function cleanTitle(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, "") // [4K HDR]
    .replace(/\([^)]*\)/g, "") // (2025)
    .replace(/\b(4k|uhd|hdr10?|fhd|full ?hd|hd|1080p?|720p?|dual|leg|dublado|legendado)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function searchSubtitles(
  item: ContentItem,
  episode?: Episode
): Promise<SubtitleResult[]> {
  const params = new URLSearchParams({ query: cleanTitle(item.title) });

  if (episode) {
    params.set("season", String(episode.season));
    params.set("episode", String(episode.episode));
  }

  const response = await fetch(`/api/subtitles?${params.toString()}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as SubtitleResult[];
}

// Baixa a legenda (já convertida para VTT no proxy) e devolve um Blob URL
// pronto para ser usado no <track> do <video>.
export async function getSubtitleTrackUrl(fileId: string): Promise<string> {
  const response = await fetch(`/api/subtitles/file?fileId=${encodeURIComponent(fileId)}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const vtt = await response.text();
  return URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
}
