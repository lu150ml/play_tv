import { Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { CatalogRail } from "../components/CatalogRail";
import { ContentCard } from "../components/ContentCard";
import { groupContentByProviderCategory, type CategoryGroup } from "../services/categoryRailService";
import { isMusicChannel } from "../services/musicService";
import { normalizeSearchText } from "../services/catalogService";
import { groupMoviesBySegment } from "../services/movieSegmentService";
import { isTvMode } from "../platform/device";
import { hideNativeKeyboard } from "../platform/keyboardControl";
import { useLibraryStore, isCatalogSectionPending } from "../stores/libraryStore";
import type { ContentItem, XtreamCatalogSection } from "../types/catalog";

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
  const tvOptimized = isTvMode();
  const railItemLimit = tvOptimized ? 10 : 16;
  const initialRailCount = tvOptimized ? 5 : 10;
  const gridPageStep = tvOptimized ? 36 : 60;
  const catalog = useLibraryStore((state) => state.catalog);
  const catalogSource = useLibraryStore((state) => state.catalogSource);
  const sectionState = useLibraryStore((state) => state.catalogSections[config[screen].section]);
  const setViewState = useLibraryStore((state) => state.setViewState);
  const [query, setQuery] = useState(saved.query);
  const [pageSize, setPageSize] = useState(saved.pageSize);
  const [visibleRailCount, setVisibleRailCount] = useState(initialRailCount);
  const deferredQuery = useDeferredValue(query);
  const latestState = useRef({ query, pageSize });
  latestState.current = { query, pageSize };

  const sectionItems = useMemo(() => catalog.filter((item) => {
    if (screen === "tv") return item.type === "channel" && !isMusicChannel(item);
    if (screen === "music") return isMusicChannel(item);
    if (screen === "movies") return item.type === "movie";
    return item.type === "series";
  }), [catalog, screen]);
  const providerCategories = useMemo(() => groupContentByProviderCategory(sectionItems), [sectionItems]);
  const movieSegments = useMemo(
    () => (screen === "movies" ? groupMoviesBySegment(sectionItems) : []),
    [screen, sectionItems]
  );
  const categories = screen === "movies" ? [...movieSegments, ...providerCategories] : providerCategories;
  const selectedCategory = categoryId
    ? categories.find((group) => group.id === decodeURIComponent(categoryId))
    : undefined;
  const normalizedQuery = normalizeSearchText(deferredQuery);
  const filtered = useMemo(() => {
    const source = selectedCategory?.items ?? sectionItems;
    if (!normalizedQuery) return source;
    return source.filter((item) => normalizeSearchText(`${item.title} ${item.categories.join(" ")} ${item.genres.join(" ")}`).includes(normalizedQuery));
  }, [normalizedQuery, sectionItems, selectedCategory]);

  useEffect(() => {
    const restored = useLibraryStore.getState().getViewState(routeKey);
    setQuery(restored.query);
    setPageSize(restored.pageSize || gridPageStep);
    setVisibleRailCount(initialRailCount);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: restored.scrollY, behavior: "auto" });
      if (restored.focusedId) {
        document.querySelector<HTMLElement>(`[data-content-id="${CSS.escape(restored.focusedId)}"]`)?.focus();
      }
    });
    return () => setViewState(routeKey, { ...latestState.current, scrollY: window.scrollY, focusedId: document.activeElement?.getAttribute("data-content-id") ?? undefined });
  }, [gridPageStep, initialRailCount, routeKey, setViewState]);

  const sectionPending = catalogSource === "xtream" && isCatalogSectionPending(sectionState.status);
  if (sectionPending && sectionItems.length === 0) {
    return <SectionSkeleton title={`Carregando ${config[screen].title.toLowerCase()}…`} />;
  }
  if (sectionState.status === "error" && sectionItems.length === 0) {
    return <SectionMessage text={sectionState.error ?? "Não foi possível carregar esta seção."} error />;
  }

  return (
    <div className="mx-auto max-w-canvas">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Catálogo</p><h1 className="font-cinema text-4xl font-semibold">{selectedCategory?.title ?? config[screen].title}</h1></div>
        {selectedCategory ? <Link className="focus-card rounded-lg border border-white/10 px-3 py-2 text-sm" to={config[screen].path}>Voltar</Link> : null}
      </header>
      {!selectedCategory ? (
        <>
          <label className="mb-6 flex items-center gap-3 rounded-xl border border-white/10 bg-surface-container px-4 py-3"><Search size={19} className="text-primary"/><input data-focusable="true" enterKeyHint="done" value={query} onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); void hideNativeKeyboard(); } }} onChange={(event) => { setQuery(event.target.value); setPageSize(gridPageStep); setVisibleRailCount(initialRailCount); }} placeholder={`Buscar em ${config[screen].title}`} className="w-full bg-transparent outline-none" /></label>
          {filtered.length === 0 ? <EmptyMessage text="Nenhum item encontrado nesta tela." /> : null}
          {screen === "movies" ? <RailGroupTitle title="Segmentos" /> : null}
          {renderRails(movieSegments, visibleRailCount, railItemLimit, filtered, normalizedQuery, config[screen].path)}
          {screen === "movies" ? <RailGroupTitle title="Coleções" /> : null}
          {renderRails(screen === "movies" ? providerCategories : categories, visibleRailCount, railItemLimit, filtered, normalizedQuery, config[screen].path)}
          {visibleRailCount < (screen === "movies" ? movieSegments.length + providerCategories.length : categories.length) ? (
            <button type="button" data-focusable="true" onClick={() => setVisibleRailCount((value) => value + initialRailCount)} className="focus-card mx-auto mt-2 block rounded-lg bg-primary px-6 py-3 font-bold text-on-primary">Carregar mais coleções</button>
          ) : null}
        </>
      ) : (
        <>
          <label className="mb-5 flex items-center gap-3 rounded-xl border border-white/10 bg-surface-container px-4 py-3"><Search size={19} className="text-primary"/><input data-focusable="true" enterKeyHint="done" value={query} onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); void hideNativeKeyboard(); } }} onChange={(event) => { setQuery(event.target.value); setPageSize(gridPageStep); }} placeholder={`Buscar em ${selectedCategory.title}`} className="w-full bg-transparent outline-none" /></label>
          <p className="mb-4 font-mono text-xs uppercase text-on-surface-variant">{filtered.length} itens</p>
          {filtered.length === 0 ? <EmptyMessage text="Nenhum item nesta categoria." /> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{filtered.slice(0, pageSize).map((item) => <div key={item.id} data-content-id={item.id}><ContentCard item={item} compact /></div>)}</div>
          {filtered.length > pageSize ? <button type="button" data-focusable="true" onClick={() => setPageSize((value) => value + gridPageStep)} className="focus-card mx-auto mt-7 block rounded-lg bg-primary px-6 py-3 font-bold text-on-primary">Carregar mais</button> : null}
        </>
      )}
    </div>
  );
}

function renderRails(
  categories: CategoryGroup[],
  visibleRailCount: number,
  railItemLimit: number,
  filtered: ContentItem[],
  normalizedQuery: string,
  basePath: string
) {
  const filteredIds = normalizedQuery ? new Set(filtered.map((item) => item.id)) : undefined;
  return categories
    .map((category) => {
      const items = filteredIds ? category.items.filter((item) => filteredIds.has(item.id)) : category.items;
      return { ...category, items };
    })
    .filter((category) => category.items.length > 0)
    .slice(0, visibleRailCount)
    .map((category) => (
      <CatalogRail
        key={category.id}
        title={category.title}
        items={category.items.slice(0, railItemLimit)}
        viewAllTo={`${basePath}/category/${encodeURIComponent(category.id)}`}
        viewMoreInRail
      />
    ));
}

function RailGroupTitle({ title }: { title: string }) {
  return <h2 className="mb-4 mt-8 font-mono text-xs uppercase tracking-[0.18em] text-primary">{title}</h2>;
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-canvas">
      <p className="mb-6 font-mono text-xs uppercase text-on-surface-variant">{title}</p>
      <div className="space-y-10">
        {Array.from({ length: 3 }).map((_, row) => (
          <section key={row}>
            <div className="mb-4 h-7 w-44 animate-pulse rounded bg-white/10" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 5 }).map((__, index) => (
                <div key={index} className="w-40 shrink-0 animate-pulse sm:w-48">
                  <div className="aspect-[2/3] rounded-lg bg-white/10" />
                  <div className="mt-3 h-4 w-3/4 rounded bg-white/10" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function SectionMessage({ text, error = false }: { text: string; error?: boolean }) {
  return <div className={`mx-auto mt-20 max-w-lg rounded-xl border p-6 text-center ${error ? "border-error/40 text-error" : "border-white/10 text-on-surface-variant"}`}>{text}</div>;
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="rounded-xl border border-white/10 bg-surface-container/60 p-5 text-center text-sm text-on-surface-variant">{text}</p>;
}
