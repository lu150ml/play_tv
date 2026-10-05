import type { ContentItem } from "../types/catalog";
import { normalizeSearchText } from "./catalogService";

const MOVIE_SEGMENTS = [
  { label: "Ação", terms: ["acao", "action", "luta", "fight", "policial", "crime", "guerra", "war"] },
  { label: "Aventura", terms: ["aventura", "adventure", "exploracao"] },
  { label: "Terror", terms: ["terror", "horror", "slasher", "sobrenatural", "zumbi", "zombie"] },
  { label: "Comédia", terms: ["comedia", "comedy", "humor", "stand up", "stand-up"] },
  { label: "Drama", terms: ["drama", "biografia", "biography", "historico", "history"] },
  { label: "Romance", terms: ["romance", "romantico", "romantic"] },
  { label: "Ficção científica", terms: ["ficcao cientifica", "sci fi", "sci-fi", "science fiction", "scifi"] },
  { label: "Fantasia", terms: ["fantasia", "fantasy", "magia", "magic"] },
  { label: "Suspense", terms: ["suspense", "thriller", "misterio", "mystery"] },
  { label: "Documentário", terms: ["documentario", "documentary", "doc"] },
  { label: "Animação", terms: ["animacao", "animation", "anime", "desenho"] },
  { label: "Infantil/Família", terms: ["infantil", "kids", "crianca", "familia", "family"] },
  { label: "Nacional", terms: ["nacional", "brasil", "brasileiro", "brasileira", "dublado nacional"] },
  { label: "Lançamentos", terms: ["lancamento", "lancamentos", "novo", "novidade", "2026", "2025"] }
] as const;

export function groupMoviesBySegment(items: ContentItem[]) {
  const groups = new Map<string, { id: string; title: string; items: ContentItem[] }>();

  for (const item of items) {
    if (item.type !== "movie") continue;
    for (const title of getMovieSegments(item)) {
      const id = `segment:${normalizeSearchText(title).replace(/\s+/g, "-")}`;
      const group = groups.get(id) ?? { id, title, items: [] };
      group.items.push(item);
      groups.set(id, group);
    }
  }

  return [...groups.values()].filter((group) => group.items.length >= 3 || group.title === "Outros");
}

export function getMovieSegments(item: ContentItem): string[] {
  if (item.type !== "movie") return [];

  const haystack = normalizeSearchText(
    [item.title, item.description, ...item.genres, ...item.categories, item.providerCategoryName ?? ""].join(" ")
  );
  const matches = MOVIE_SEGMENTS
    .filter((segment) => segment.terms.some((term) => haystack.includes(normalizeSearchText(term))))
    .map((segment) => segment.label);

  return matches.length > 0 ? matches : ["Outros"];
}
