import { Clapperboard, Film, Grid2x2, Search, Tv } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import { CatalogRail } from "../components/CatalogRail";
import { ContentCard } from "../components/ContentCard";
import { SearchOverlay } from "../components/SearchOverlay";
import { getFeaturedContent, searchCatalog } from "../services/catalogService";
import { useLibraryStore } from "../stores/libraryStore";
import type { CatalogFilter, ContentItem, ContentType } from "../types/catalog";

const RAIL_LIMIT = 10;

const sectionConfigs = {
  all: {
    label: "Todo o catalogo",
    title: "Catalogo completo",
    path: "/catalog/all",
    type: "all",
    icon: Grid2x2,
    broadCategories: []
  },
  tv: {
    label: "TV ao vivo",
    title: "TV ao vivo",
    path: "/catalog/tv",
    type: "channel",
    icon: Tv,
    broadCategories: ["Live TV"]
  },
  movies: {
    label: "Filmes",
    title: "Filmes",
    path: "/catalog/movies",
    type: "movie",
    icon: Film,
    broadCategories: ["Movies"]
  },
  series: {
    label: "Series",
    title: "Series",
    path: "/catalog/series",
    type: "series",
    icon: Clapperboard,
    broadCategories: ["Series"]
  }
} as const;

type SectionKey = keyof typeof sectionConfigs;

export function CatalogPage() {
  const { section, categorySlug } = useParams();
  const [searchParams] = useSearchParams();
  const sectionKey = getSectionKey(section);
  const sectionConfig = sectionConfigs[sectionKey];
  const sectionType = sectionConfig.type;
  const [filters, setFilters] = useState<CatalogFilter>({
    type: sectionType,
    sort: "featured"
  });
  const catalog = useLibraryStore((state) => state.catalog);
  const catalogSource = useLibraryStore((state) => state.catalogSource);
  const favoriteIds = useLibraryStore((state) => state.favorites);
  const playback = useLibraryStore((state) => state.playback);
  const featured = getFeaturedContent(catalog);
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const sectionItems = useMemo(() => filterBySection(catalog, sectionType), [catalog, sectionType]);
  const categoryGroups = useMemo(
    () => groupByDisplayCategory(sectionItems, sectionConfig.broadCategories),
    [sectionConfig.broadCategories, sectionItems]
  );
  const selectedCategory = categorySlug
    ? categoryGroups.find((group) => slugify(group.title) === categorySlug)
    : undefined;
  const isUnknownCategory = Boolean(categorySlug && !selectedCategory);
  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      type: sectionType,
      category: selectedCategory?.title ?? filters.category
    }),
    [filters, sectionType, selectedCategory]
  );
  const results = useMemo(
    () => searchCatalog(effectiveFilters, favorites, catalog),
    [catalog, effectiveFilters, favorites]
  );
  const continueWatching = useMemo(
    () => results.filter((item) => playback[item.id]).sort(sortByProgressDate(playback)),
    [playback, results]
  );
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

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      type: sectionType,
      category: selectedCategory?.title,
      query: current.query,
      sort: current.sort ?? "featured"
    }));
  }, [sectionType, selectedCategory?.title]);

  if (isUnknownCategory) {
    return <Navigate to={sectionConfig.path} replace />;
  }

  const pageTitle = selectedCategory
    ? `${sectionConfig.title}: ${selectedCategory.title}`
    : sectionKey === "all"
      ? "Home"
      : sectionConfig.title;
  const showSearch = searchParams.get("search") === "open" || selectedCategory;
  const isSearchResult = Boolean(filters.query?.trim());

  return (
    <div className="mx-auto max-w-canvas">
      {!selectedCategory && featured ? <FeaturedHero item={featured} /> : null}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="rounded-md border border-white/10 bg-surface-container px-3 py-2 font-mono text-xs uppercase text-on-surface-variant">
          {catalogSource === "xtream" ? "Xtream server catalog" : "Demo catalog"}
        </span>
        <span className="rounded-md border border-white/10 bg-surface-container px-3 py-2 font-mono text-xs uppercase text-on-surface-variant">
          {catalog.length} items loaded
        </span>
      </div>

      <section className="mb-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase text-primary-container">Navegacao</p>
            <h1 className="mt-1 font-display text-3xl font-bold text-on-surface lg:text-4xl">
              {pageTitle}
            </h1>
          </div>
          {selectedCategory ? (
            <Link
              to={sectionConfig.path}
              data-focusable="true"
              className="focus-card rounded-lg border border-white/10 bg-surface-container px-3 py-2 text-sm text-on-surface-variant"
            >
              Voltar para {sectionConfig.label}
            </Link>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TypeLink
            label="Todos"
            count={typeCounts.all}
            isActive={sectionKey === "all"}
            icon={<Grid2x2 aria-hidden="true" size={22} />}
            to="/catalog/all"
          />
          <TypeLink
            label="TV ao vivo"
            count={typeCounts.channel}
            isActive={sectionKey === "tv"}
            icon={<Tv aria-hidden="true" size={22} />}
            to="/catalog/tv"
          />
          <TypeLink
            label="Filmes"
            count={typeCounts.movie}
            isActive={sectionKey === "movies"}
            icon={<Film aria-hidden="true" size={22} />}
            to="/catalog/movies"
          />
          <TypeLink
            label="Series"
            count={typeCounts.series}
            isActive={sectionKey === "series"}
            icon={<Clapperboard aria-hidden="true" size={22} />}
            to="/catalog/series"
          />
        </div>
      </section>

      {showSearch ? (
        <SearchOverlay
          filters={effectiveFilters}
          catalog={sectionItems}
          onChange={(nextFilters) =>
            setFilters({ ...nextFilters, type: sectionType, category: selectedCategory?.title })
          }
        />
      ) : null}

      {selectedCategory || isSearchResult ? (
        <section>
          {isSearchResult ? (
            <div className="mb-4 flex items-center gap-3">
              <Search aria-hidden="true" className="text-primary-container" size={22} />
              <h2 className="font-display text-2xl font-bold">Resultados da busca</h2>
            </div>
          ) : null}
          <CatalogGrid items={results} />
        </section>
      ) : (
        <>
          <CatalogRail title="Continue Watching" items={continueWatching.slice(0, RAIL_LIMIT)} />
          <CatalogRail title="Favorites" items={favoritesList.slice(0, RAIL_LIMIT)} />

          {sectionKey === "all" ? (
            <HomeRails catalog={catalog} />
          ) : (
            <CategoryRails groups={categoryGroups} sectionPath={sectionConfig.path} />
          )}

          <section className="mt-10">
            <div className="mb-4 flex items-center gap-3">
              <Search aria-hidden="true" className="text-primary-container" size={22} />
              <h2 className="font-display text-2xl font-bold">Resumo da tela</h2>
            </div>
            <CatalogGrid items={results.slice(0, RAIL_LIMIT)} compactEmpty />
          </section>
        </>
      )}
    </div>
  );
}

function FeaturedHero({ item }: { item: ContentItem }) {
  return (
    <section
      className={[
        "mb-8 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br p-5 shadow-2xl lg:p-8",
        item.backdropTone
      ].join(" ")}
    >
      <div className="max-w-3xl">
        <div className="mb-4 flex flex-wrap gap-2">
          {item.quality.map((quality) => (
            <span
              key={quality}
              className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs uppercase text-on-surface"
            >
              {quality}
            </span>
          ))}
        </div>
        <h1 className="font-display text-4xl font-bold text-on-surface lg:text-6xl">
          {item.title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-on-surface-variant lg:text-lg">
          {item.description}
        </p>
      </div>
    </section>
  );
}

function HomeRails({ catalog }: { catalog: ContentItem[] }) {
  const liveTv = catalog.filter((item) => item.type === "channel");
  const movies = catalog.filter((item) => item.type === "movie");
  const series = catalog.filter((item) => item.type === "series");

  return (
    <>
      <CatalogRail title="TV ao vivo" items={liveTv.slice(0, RAIL_LIMIT)} viewAllTo="/catalog/tv" />
      <CatalogRail title="Filmes" items={movies.slice(0, RAIL_LIMIT)} viewAllTo="/catalog/movies" />
      <CatalogRail title="Series" items={series.slice(0, RAIL_LIMIT)} viewAllTo="/catalog/series" />
    </>
  );
}

function CategoryRails({ groups, sectionPath }: { groups: CategoryGroup[]; sectionPath: string }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface-container/60 p-8 text-on-surface-variant">
        Nenhum conteudo encontrado nesta tela.
      </div>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <CatalogRail
          key={group.title}
          title={group.title}
          items={group.items.slice(0, RAIL_LIMIT)}
          viewAllTo={`${sectionPath}/${slugify(group.title)}`}
        />
      ))}
    </>
  );
}

function CatalogGrid({
  items,
  compactEmpty = false
}: {
  items: ContentItem[];
  compactEmpty?: boolean;
}) {
  if (items.length === 0) {
    return compactEmpty ? null : (
      <div className="rounded-xl border border-white/10 bg-surface-container/60 p-8 text-on-surface-variant">
        Nenhum conteudo encontrado para esta categoria.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => (
        <ContentCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function sortByProgressDate(playback: Record<string, { updatedAt: string }>) {
  return (left: ContentItem, right: ContentItem) =>
    new Date(playback[right.id]?.updatedAt ?? 0).getTime() -
    new Date(playback[left.id]?.updatedAt ?? 0).getTime();
}

interface TypeLinkProps {
  label: string;
  count: number;
  isActive: boolean;
  icon: React.ReactNode;
  to: string;
}

function TypeLink({ label, count, isActive, icon, to }: TypeLinkProps) {
  return (
    <Link
      to={to}
      data-focusable="true"
      className={[
        "focus-card flex items-center justify-between rounded-xl border p-4 text-left",
        isActive
          ? "border-primary-container bg-primary-container/15 text-primary shadow-glow"
          : "border-white/10 bg-surface-container/70 text-on-surface hover:bg-surface-container"
      ].join(" ")}
      aria-current={isActive ? "page" : undefined}
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
    </Link>
  );
}

interface CategoryGroup {
  title: string;
  items: ContentItem[];
}

function getSectionKey(section?: string): SectionKey {
  if (section === "tv" || section === "movies" || section === "series" || section === "all") {
    return section;
  }

  return "all";
}

function filterBySection(items: ContentItem[], type: ContentType | "all"): ContentItem[] {
  if (type === "all") {
    return items;
  }

  return items.filter((item) => item.type === type);
}

function groupByDisplayCategory(
  items: ContentItem[],
  broadCategories: readonly string[]
): CategoryGroup[] {
  const groups = new Map<string, ContentItem[]>();

  for (const item of items) {
    const displayCategories = unique(item.categories).filter(
      (category) => !broadCategories.includes(category)
    );
    const categories = displayCategories.length > 0 ? displayCategories : item.categories;

    for (const category of unique(categories)) {
      const group = groups.get(category) ?? [];
      group.push(item);
      groups.set(category, group);
    }
  }

  return Array.from(groups.entries())
    .map(([title, groupItems]) => ({ title, items: groupItems }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
