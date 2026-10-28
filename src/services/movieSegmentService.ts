import type { ContentItem } from "../types/catalog";
import { normalizeSearchText } from "./catalogService";

const MOVIE_SEGMENTS = [
  {
    label: "Ação",
    terms: ["acao", "action", "luta", "fight", "policial", "crime", "guerra", "war"]
  },
  {
    label: "Aventura",
    terms: ["aventura", "adventure", "exploracao", "fantasia aventura"]
  },
  {
    label: "Terror",
    terms: ["terror", "horror", "slasher", "sobrenatural", "zumbi", "zombie"]
  },
  {
    label: "Comédia",
    terms: ["comedia", "comedy", "humor", "stand up", "stand-up"]
  },
  {
    label: "Drama",
    terms: ["drama", "biografia", "biography", "historico", "history"]
  },
  {
    label: "Romance",
    terms: ["romance", "romantico", "romantic"]
  },
  {
    label: "Ficção científica",
    terms: ["ficcao cientifica", "sci fi", "sci-fi", "science fiction", "scifi"]
  },
  {
    label: "Fantasia",
    terms: ["fantasia", "fantasy", "magia", "magic"]
  },
  {
    label: "Suspense",
    terms: ["suspense", "thriller", "misterio", "mystery"]
  },
  {
    label: "Documentário",
    terms: ["documentario", "documentary", "doc"]
  },
  {
    label: "Animação",
    terms: ["animacao", "animation", "anime", "desenho"]
  },
  {
    label: "Infantil/Família",
    terms: ["infantil", "kids", "crianca", "familia", "family"]
  },
  {
    label: "Nacional",
    terms: ["nacional", "brasil", "brasileiro", "brasileira", "dublado nacional"]
  },
  {
    label: "Lançamentos",
    terms: ["lancamento", "lancamentos", "novo", "novidade", "2026", "2025"]
  }
] as const;

// Termos normalizados uma unica vez: antes cada filme refazia ~70 normalize() por chamada.
const NORMALIZED_SEGMENTS = MOVIE_SEGMENTS.map((segment) => ({
  label: segment.label,
  terms: segment.terms.map((term) => normalizeSearchText(term))
}));

// A lista de filmes e recalculada varias vezes enquanto o catalogo chega por categoria,
// e cada lote recria os objetos dos filmes. Por isso o cache usa o id e confere o texto.
const segmentsCache = new Map<string, { key: string; segments: string[] }>();

export function getMovieSegments(item: ContentItem): string[] {
  if (item.type !== "movie") return [];

  const key = [item.title, item.description, ...item.genres, ...item.categories].join(" ");
  const cached = segmentsCache.get(item.id);
  if (cached?.key === key) return cached.segments;

  const haystack = normalizeSearchText(key);
  const matches: string[] = [];
  for (const segment of NORMALIZED_SEGMENTS) {
    if (segment.terms.some((term) => haystack.includes(term))) matches.push(segment.label);
  }

  const segments = matches.length > 0 ? matches : ["Outros"];
  segmentsCache.set(item.id, { key, segments });
  return segments;
}
