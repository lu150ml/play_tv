import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { CatalogRail } from "../components/CatalogRail";
import { ContentCard } from "../components/ContentCard";
import { groupContentByProviderCategory } from "../services/categoryRailService";
import { isMusicChannel } from "../services/musicService";
import { normalizeSearchText } from "../services/catalogService";
import { useLibraryStore } from "../stores/libraryStore";
import type { XtreamCatalogSection } from "../types/catalog";

type ScreenKey = "tv" | "music" | "movies" | "series";

const config: Record<ScreenKey, { title: string; section: XtreamCatalogSection; path: string }> = {
  tv: { title: "TV ao vivo", section: "live", path: "/tv" },
  music: { title: "Música", section: "live", path: "/music" },
  movies: { title: "Filmes", section: "vod", path: "/movies" },
  series: { title: "Séries", section: "series", path: "/series" }
};

export function TvPage() { return <SectionPage screen="tv" />; }
export function MusicPage() { return <SectionPage screen="music" />; }
export function MoviesPage() { return <SectionPage screen="movies" />; }
export function SeriesCatalogPage() { return <SectionPage screen="series" />; }

function SectionPage({ screen }: { screen: ScreenKey }) {
  const { categoryId } = useParams();
  const routeKey = categoryId ? `${screen}:${categoryId}` : screen;
  const saved = useLibraryStore.getState().getViewState(routeKey);
  const catalog = useLibraryStore((state) => state.catalog);
  const sectionState = useLibraryStore((state) => state.catalogSections[config[screen].section]);
  const setViewState = useLibraryStore((state) => state.setViewState);
  const [query, setQuery] = useState(saved.query);
  const [pageSize, setPageSize] = useState(saved.pageSize);
  const latestState = useRef({ query, pageSize });
  latestState.current = { query, pageSize };

  const sectionItems = useMemo(() => catalog.filter((item) => {
    if (screen === "tv") return item.type === "channel" && !isMusicChannel(item);
    if (screen === "music") return isMusicChannel(item);
    if (screen === "movies") return item.type === "movie";
    return item.type === "series";
  }), [catalog, screen]);
  const categories = useMemo(() => groupContentByProviderCategory(sectionItems), [sectionItems]);
  const selectedCategory = categoryId
    ? categories.find((group) => group.id === decodeURIComponent(categoryId))
    : undefined;
  const normalizedQuery = normalizeSearchText(query);
  const filtered = useMemo(() => {
    const source = selectedCategory?.items ?? sectionItems;
    if (!normalizedQuery) return source;
    return source.filter((item) => normalizeSearchText(`${item.title} ${item.categories.join(" ")} ${item.genres.join(" ")}`).includes(normalizedQuery));
  }, [normalizedQuery, sectionItems, selectedCategory]);

  useEffect(() => {
    const restored = useLibraryStore.getState().getViewState(routeKey);
    setQuery(restored.query); setPageSize(restored.pageSize);
    window.scrollTo({ top: restored.scrollY, behavior: "auto" });
    if (restored.focusedId) document.querySelector<HTMLElement>(`[data-content-id="${CSS.escape(restored.focusedId)}"]`)?.focus();
    return () => setViewState(routeKey, { ...latestState.current, scrollY: window.scrollY, focusedId: document.activeElement?.getAttribute("data-content-id") ?? undefined });
  }, [routeKey, setViewState]);

  if (sectionState.status === "loading" && sectionItems.length === 0) return <SectionMessage text={`Carregando ${config[screen].title.toLowerCase()}…`} />;
  if (sectionState.status === "error" && sectionItems.length === 0) return <SectionMessage text={sectionState.error ?? "Não foi possível carregar esta seção."} error />;

  return (
    <div className="mx-auto max-w-canvas">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Catálogo</p><h1 className="font-cinema text-4xl font-semibold">{selectedCategory?.title ?? config[screen].title}</h1></div>
        {selectedCategory ? <Link className="focus-card rounded-lg border border-white/10 px-3 py-2 text-sm" to={config[screen].path}>Voltar</Link> : null}
      </header>
      {!selectedCategory ? (
        <>
          <label className="mb-6 flex items-center gap-3 rounded-xl border border-white/10 bg-surface-container px-4 py-3"><Search size={19} className="text-primary"/><input value={query} onChange={(event) => { setQuery(event.target.value); setPageSize(60); }} placeholder={`Buscar em ${config[screen].title}`} className="w-full bg-transparent outline-none" /></label>
          {filtered.length === 0 ? <EmptyMessage text="Nenhum item encontrado nesta tela." /> : null}
          {categories
            .map((category) => {
              const items = normalizedQuery
                ? category.items.filter((item) => filtered.some((result) => result.id === item.id))
                : category.items;
              return { ...category, items };
            })
            .filter((category) => category.items.length > 0)
            .map((category) => (
              <CatalogRail
                key={category.id}
                title={category.title}
                items={category.items.slice(0, 16)}
                viewAllTo={`${config[screen].path}/category/${encodeURIComponent(category.id)}`}
                viewMoreInRail
              />
            ))}
        </>
      ) : (
        <>
          <label className="mb-5 flex items-center gap-3 rounded-xl border border-white/10 bg-surface-container px-4 py-3"><Search size={19} className="text-primary"/><input value={query} onChange={(event) => { setQuery(event.target.value); setPageSize(60); }} placeholder={`Buscar em ${selectedCategory.title}`} className="w-full bg-transparent outline-none" /></label>
          <p className="mb-4 font-mono text-xs uppercase text-on-surface-variant">{filtered.length} itens</p>
          {filtered.length === 0 ? <EmptyMessage text="Nenhum item nesta categoria." /> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{filtered.slice(0, pageSize).map((item) => <div key={item.id} data-content-id={item.id}><ContentCard item={item} compact /></div>)}</div>
          {filtered.length > pageSize ? <button type="button" onClick={() => setPageSize((value) => value + 60)} className="focus-card mx-auto mt-7 block rounded-lg bg-primary px-6 py-3 font-bold text-on-primary">Carregar mais</button> : null}
        </>
      )}
    </div>
  );
}

function SectionMessage({ text, error = false }: { text: string; error?: boolean }) {
  return <div className={`mx-auto mt-20 max-w-lg rounded-xl border p-6 text-center ${error ? "border-error/40 text-error" : "border-white/10 text-on-surface-variant"}`}>{text}</div>;
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="rounded-xl border border-white/10 bg-surface-container/60 p-5 text-center text-sm text-on-surface-variant">{text}</p>;
}
