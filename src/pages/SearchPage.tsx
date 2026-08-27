import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ContentCard } from "../components/ContentCard";
import { normalizeSearchText } from "../services/catalogService";
import { isMusicChannel } from "../services/musicService";
import { useLibraryStore } from "../stores/libraryStore";
import type { ContentItem } from "../types/catalog";

type SearchFilter = "all" | "channel" | "music" | "movie" | "series" | "favorites";

const filters: Array<{ key: SearchFilter; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "channel", label: "TV" },
  { key: "music", label: "Música" },
  { key: "movie", label: "Filmes" },
  { key: "series", label: "Séries" },
  { key: "favorites", label: "Favoritos" }
];

interface SearchIndexItem {
  item: ContentItem;
  text: string;
}

export function SearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const saved = useLibraryStore.getState().getViewState("search");
  const catalog = useLibraryStore((state) => state.catalog);
  const favorites = useLibraryStore((state) => state.favorites);
  const setViewState = useLibraryStore((state) => state.setViewState);
  const [query, setQuery] = useState(saved.query);
  const [pageSize, setPageSize] = useState(saved.pageSize);
  const initialFilter = new URLSearchParams(location.search).get("favorites") === "1" ? "favorites" : "all";
  const [activeFilter, setActiveFilter] = useState<SearchFilter>(saved.category as SearchFilter || initialFilter);
  const debouncedQuery = useDebouncedValue(query, 160);
  const latestState = useRef({ query, pageSize, activeFilter });
  latestState.current = { query, pageSize, activeFilter };

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const searchIndex = useMemo<SearchIndexItem[]>(
    () => catalog.map((item) => ({
      item,
      text: normalizeSearchText([
        item.title,
        item.description,
        item.providerCategoryName,
        ...item.categories,
        ...item.genres
      ].filter(Boolean).join(" "))
    })),
    [catalog]
  );
  const normalized = normalizeSearchText(debouncedQuery);
  const results = useMemo(() => searchIndex
    .filter(({ item, text }) => matchesFilter(item, activeFilter, favoriteSet) && (!normalized || text.includes(normalized)))
    .map(({ item }) => item), [activeFilter, favoriteSet, normalized, searchIndex]);

  useEffect(() => () => setViewState("search", {
    query: latestState.current.query,
    pageSize: latestState.current.pageSize,
    category: latestState.current.activeFilter,
    scrollY: window.scrollY,
    focusedId: document.activeElement?.getAttribute("data-content-id") ?? undefined
  }), [setViewState]);

  useEffect(() => {
    const restored = useLibraryStore.getState().getViewState("search");
    window.scrollTo({ top: restored.scrollY, behavior: "auto" });
    if (restored.focusedId) document.querySelector<HTMLElement>(`[data-content-id="${CSS.escape(restored.focusedId)}"]`)?.focus();
  }, []);

  function selectFilter(filter: SearchFilter) {
    setActiveFilter(filter);
    setPageSize(60);
    if (filter === "favorites") {
      void navigate("/search?favorites=1", { replace: true });
    } else if (location.search) {
      void navigate("/search", { replace: true });
    }
  }

  return <div className="mx-auto max-w-canvas"><h1 className="mb-5 font-cinema text-4xl font-semibold">Buscar</h1><label className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-surface-container px-4 py-4"><Search className="text-primary"/><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setPageSize(60); }} placeholder="Filmes, séries, canais ou categorias" className="w-full bg-transparent outline-none"/></label><div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-2">{filters.map((filter) => <button key={filter.key} type="button" data-focusable="true" onClick={() => selectFilter(filter.key)} className={`focus-card shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${activeFilter === filter.key ? "border-primary bg-primary text-on-primary" : "border-white/10 bg-surface-container text-on-surface-variant"}`}>{filter.label}</button>)}</div><p className="mb-4 text-sm text-on-surface-variant">{results.length} resultados</p>{results.length === 0 ? <p className="rounded-xl border border-white/10 bg-surface-container/60 p-5 text-center text-sm text-on-surface-variant">Nenhum resultado encontrado.</p> : null}<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{results.slice(0, pageSize).map((item) => <div key={item.id} data-content-id={item.id}><ContentCard item={item} compact/></div>)}</div>{results.length > pageSize ? <button className="focus-card mx-auto mt-7 block rounded-lg bg-primary px-6 py-3 font-bold text-on-primary" onClick={() => setPageSize((value) => value + 60)}>Carregar mais</button> : null}</div>;
}

function matchesFilter(item: ContentItem, filter: SearchFilter, favorites: ReadonlySet<string>): boolean {
  if (filter === "favorites") return favorites.has(item.id);
  if (filter === "music") return isMusicChannel(item);
  if (filter === "channel") return item.type === "channel" && !isMusicChannel(item);
  if (filter === "movie") return item.type === "movie";
  if (filter === "series") return item.type === "series";
  return true;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debounced;
}
