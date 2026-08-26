import { Play, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import { CatalogRail } from "../components/CatalogRail";
import { ContentCard } from "../components/ContentCard";
import { SearchOverlay } from "../components/SearchOverlay";
import { searchCatalog } from "../services/catalogService";
import {
  getPersonalizedRecommendations,
  getRecommendedHero
} from "../services/recommendationService";
import { useLibraryStore } from "../stores/libraryStore";
import type { CatalogFilter, ContentItem, ContentType } from "../types/catalog";
import { formatDuration } from "../utils/format";

const RAIL_LIMIT = 10;

const sectionConfigs = {
  all: {
    label: "Todo o catalogo",
    title: "Catalogo completo",
    path: "/catalog/all",
    type: "all",
    broadCategories: []
  },
  tv: {
    label: "TV ao vivo",
    title: "TV ao vivo",
    path: "/catalog/tv",
    type: "channel",
    broadCategories: ["Live TV"]
  },
  movies: {
    label: "Filmes",
    title: "Filmes",
    path: "/catalog/movies",
    type: "movie",
    broadCategories: ["Movies"]
  },
  series: {
    label: "Series",
    title: "Series",
    path: "/catalog/series",
    type: "series",
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
  const favoriteIds = useLibraryStore((state) => state.favorites);
  const playback = useLibraryStore((state) => state.playback);
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const sectionItems = useMemo(() => filterBySection(catalog, sectionType), [catalog, sectionType]);
  const recommendedHero = useMemo(
    () =>
      getRecommendedHero(sectionItems, playback, favorites, {
        allowChannels: sectionKey === "tv"
      }),
    [favorites, playback, sectionItems, sectionKey]
  );
  const recommendations = useMemo(
    () =>
      getPersonalizedRecommendations(sectionItems, playback, favorites, 6).filter(
        (item) => item.id !== recommendedHero?.id
      ),
    [favorites, playback, recommendedHero?.id, sectionItems]
  );
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
      {!selectedCategory && recommendedHero ? <FeaturedHero item={recommendedHero} /> : null}

      {sectionKey !== "all" || selectedCategory ? (
        <section className="mb-8 pt-2">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Catálogo</p>
              <h1 className="mt-1 font-cinema text-4xl font-semibold text-on-surface lg:text-5xl">
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
          <p className="font-mono text-xs uppercase text-on-surface-variant">
            {typeCounts[sectionType]} itens disponíveis
          </p>
        </section>
      ) : null}

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
          {recommendations.length > 0 ? (
            <CatalogRail title="Recomendados para você" items={recommendations.slice(0, 5)} />
          ) : null}
          <CatalogRail title="Continuar assistindo" items={continueWatching.slice(0, RAIL_LIMIT)} />
          <CatalogRail title="Favoritos" items={favoritesList.slice(0, RAIL_LIMIT)} />

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
    <Link
      to={getContentHref(item)}
      data-focusable="true"
      aria-label={`Abrir ${item.title}`}
      className={[
        "cinematic-hero focus-card group relative mb-8 block overflow-hidden rounded-none border-x-0 border-y border-white/10 bg-gradient-to-br shadow-2xl transition duration-200 hover:border-primary/45 lg:-mx-10 lg:border-x-0",
        item.backdropTone
      ].join(" ")}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-70 transition duration-700 group-hover:scale-[1.02]"
        />
      ) : null}
      <div className="relative z-10 flex min-h-[inherit] max-w-3xl flex-col justify-center px-5 py-12 lg:px-14">
        <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {item.type === "channel" ? "Ao vivo" : item.type === "series" ? "Série" : "Filme"}
        </p>
        <h1 className="font-cinema text-5xl font-semibold leading-[0.98] text-on-surface drop-shadow-2xl lg:text-7xl">
          {item.title}
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-on-surface-variant">
          {item.year ? <span>{item.year}</span> : null}
          {item.quality[0] ? (
            <span className="rounded border border-primary/45 bg-primary/15 px-2 py-0.5 text-on-surface">
              {item.quality[0]}
            </span>
          ) : null}
          {item.durationSeconds ? <span>{formatDuration(item.durationSeconds)}</span> : null}
          {item.genres.slice(0, 2).map((genre) => (
            <span key={genre}>{genre}</span>
          ))}
        </div>
        <p className="mt-5 max-w-2xl line-clamp-3 text-base leading-7 text-on-surface-variant lg:text-lg">
          {item.description}
        </p>
        <span className="mt-7 inline-flex h-14 w-fit items-center gap-3 rounded-lg bg-primary px-7 font-display text-base font-bold text-on-primary shadow-glow">
          <Play aria-hidden="true" fill="currentColor" size={21} />
          Assistir
        </span>
      </div>
    </Link>
  );
}

function getContentHref(item: ContentItem): string {
  return item.type === "series" ? `/series/${item.id}` : `/watch/${item.id}`;
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
