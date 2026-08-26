import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ContentCard } from "../components/ContentCard";
import { normalizeSearchText } from "../services/catalogService";
import { useLibraryStore } from "../stores/libraryStore";

export function SearchPage() {
  const location = useLocation();
  const saved = useLibraryStore.getState().getViewState("search");
  const catalog = useLibraryStore((state) => state.catalog);
  const favorites = useLibraryStore((state) => state.favorites);
  const setViewState = useLibraryStore((state) => state.setViewState);
  const [query, setQuery] = useState(saved.query);
  const [pageSize, setPageSize] = useState(saved.pageSize);
  const favoriteOnly = new URLSearchParams(location.search).get("favorites") === "1";
  const normalized = normalizeSearchText(query);
  const results = useMemo(() => catalog.filter((item) => (!favoriteOnly || favorites.includes(item.id)) && (!normalized || normalizeSearchText(`${item.title} ${item.categories.join(" ")} ${item.genres.join(" ")}`).includes(normalized))), [catalog, favoriteOnly, favorites, normalized]);
  useEffect(() => () => setViewState("search", { query, pageSize, scrollY: window.scrollY }), [pageSize, query, setViewState]);
  return <div className="mx-auto max-w-canvas"><h1 className="mb-5 font-cinema text-4xl font-semibold">{favoriteOnly ? "Favoritos" : "Buscar"}</h1><label className="mb-6 flex items-center gap-3 rounded-xl border border-white/10 bg-surface-container px-4 py-4"><Search className="text-primary"/><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setPageSize(60); }} placeholder="Filmes, séries, canais ou categorias" className="w-full bg-transparent outline-none"/></label><p className="mb-4 text-sm text-on-surface-variant">{results.length} resultados</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{results.slice(0, pageSize).map((item) => <ContentCard key={item.id} item={item} compact/>)}</div>{results.length > pageSize ? <button className="mx-auto mt-7 block rounded-lg bg-primary px-6 py-3 font-bold text-on-primary" onClick={() => setPageSize((value) => value + 60)}>Carregar mais</button> : null}</div>;
}
