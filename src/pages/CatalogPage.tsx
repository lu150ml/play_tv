import { Clapperboard, Film, Grid2x2, Search, Tv } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { CatalogRail } from "../components/CatalogRail";
import { ContentCard } from "../components/ContentCard";
import { SearchOverlay } from "../components/SearchOverlay";
import { getFeaturedContent, searchCatalog } from "../services/catalogService";
import { useLibraryStore } from "../stores/libraryStore";
import type { CatalogFilter, ContentItem } from "../types/catalog";

export function CatalogPage() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<CatalogFilter>({ type: "all", sort: "featured" });
  const catalog = useLibraryStore((state) => state.catalog);
  const catalogSource = useLibraryStore((state) => state.catalogSource);
  const favoriteIds = useLibraryStore((state) => state.favorites);
  const playback = useLibraryStore((state) => state.playback);
  const featured = getFeaturedContent(catalog);
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const results = useMemo(
    () => searchCatalog(filters, favorites, catalog),
    [catalog, favorites, filters]
  );
  const continueWatching = useMemo(
    () => results.filter((item) => playback[item.id]).sort(sortByProgressDate(playback)),
    [playback, results]
  );
  const liveTv = results.filter((item) => item.type === "channel");
  const movies = results.filter((item) => item.type === "movie");
  const series = results.filter((item) => item.type === "series");
  const favoritesList = results.filter((item) => favorites.has(item.id));
  const typeCounts = useMemo(
    () => ({
      all: catalog.length,
      channel: catalog.filter((item) => item.type === "channel").length,
      movie: catalog.filter((item) => item.type === "movie").length,
      series: catalog.filter((item) => item.type === "series").length
    }),
    [catalog]
  );
  const selectedType = searchParams.get("type");

  useEffect(() => {
    if (!selectedType) {
      setFilters((current) => ({ ...current, type: "all" }));
      return;
    }

    if (selectedType === "channel" || selectedType === "movie" || selectedType === "series") {
      setFilters((current) => ({ ...current, type: selectedType }));
      return;
    }

    if (selectedType === "all") {
      setFilters((current) => ({ ...current, type: "all" }));
    }
  }, [selectedType]);

  return (
    <div className="mx-auto max-w-canvas">
      {featured ? (
        <section
          className={[
            "mb-8 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br p-5 shadow-2xl lg:p-8",
            featured.backdropTone
          ].join(" ")}
        >
          <div className="max-w-3xl">
            <div className="mb-4 flex flex-wrap gap-2">
              {featured.quality.map((quality) => (
                <span
                  key={quality}
                  className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs uppercase text-on-surface"
                >
                  {quality}
                </span>
              ))}
            </div>
            <h1 className="font-display text-4xl font-bold text-on-surface lg:text-6xl">
              {featured.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-on-surface-variant lg:text-lg">
              {featured.description}
            </p>
          </div>
        </section>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="rounded-md border border-white/10 bg-surface-container px-3 py-2 font-mono text-xs uppercase text-on-surface-variant">
          {catalogSource === "xtream" ? "Xtream server catalog" : "Demo catalog"}
        </span>
        <span className="rounded-md border border-white/10 bg-surface-container px-3 py-2 font-mono text-xs uppercase text-on-surface-variant">
          {catalog.length} items loaded
        </span>
      </div>

      <section className="mb-8">
        <h2 className="mb-4 font-display text-2xl font-bold text-on-surface">Navegar por tipo</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TypeButton
            label="Todos"
            count={typeCounts.all}
            isActive={!filters.type || filters.type === "all"}
            icon={<Grid2x2 aria-hidden="true" size={22} />}
            onClick={() => setFilters((current) => ({ ...current, type: "all" }))}
          />
          <TypeButton
            label="TV ao vivo"
            count={typeCounts.channel}
            isActive={filters.type === "channel"}
            icon={<Tv aria-hidden="true" size={22} />}
            onClick={() => setFilters((current) => ({ ...current, type: "channel" }))}
          />
          <TypeButton
            label="Filmes"
            count={typeCounts.movie}
            isActive={filters.type === "movie"}
            icon={<Film aria-hidden="true" size={22} />}
            onClick={() => setFilters((current) => ({ ...current, type: "movie" }))}
          />
          <TypeButton
            label="Séries"
            count={typeCounts.series}
            isActive={filters.type === "series"}
            icon={<Clapperboard aria-hidden="true" size={22} />}
            onClick={() => setFilters((current) => ({ ...current, type: "series" }))}
          />
        </div>
      </section>

      <SearchOverlay filters={filters} catalog={catalog} onChange={setFilters} />

      <CatalogRail title="Continue Watching" items={continueWatching} />
      <CatalogRail title="Live TV" items={liveTv} />
      <CatalogRail title="Movies" items={movies} />
      <CatalogRail title="Series" items={series} />
      <CatalogRail title="Favorites" items={favoritesList} />

      <section className="mt-10">
        <div className="mb-4 flex items-center gap-3">
          <Search aria-hidden="true" className="text-primary-container" size={22} />
          <h2 className="font-display text-2xl font-bold">All Results</h2>
        </div>
        {results.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {results.map((item) => (
              <ContentCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-surface-container/60 p-8 text-on-surface-variant">
            No content matched the current filters.
          </div>
        )}
      </section>
    </div>
  );
}

function sortByProgressDate(playback: Record<string, { updatedAt: string }>) {
  return (left: ContentItem, right: ContentItem) =>
    new Date(playback[right.id]?.updatedAt ?? 0).getTime() -
    new Date(playback[left.id]?.updatedAt ?? 0).getTime();
}

interface TypeButtonProps {
  label: string;
  count: number;
  isActive: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}

function TypeButton({ label, count, isActive, icon, onClick }: TypeButtonProps) {
  return (
    <button
      type="button"
      data-focusable="true"
      onClick={onClick}
      className={[
        "focus-card flex items-center justify-between rounded-xl border p-4 text-left",
        isActive
          ? "border-primary-container bg-primary-container/15 text-primary shadow-glow"
          : "border-white/10 bg-surface-container/70 text-on-surface hover:bg-surface-container"
      ].join(" ")}
      aria-pressed={isActive}
    >
      <span className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-black/20">
          {icon}
        </span>
        <span>
          <span className="block font-display text-lg font-semibold">{label}</span>
          <span className="font-mono text-xs uppercase text-on-surface-variant">{count} itens</span>
        </span>
      </span>
    </button>
  );
}
