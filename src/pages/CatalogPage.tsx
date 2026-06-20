import { Clapperboard, Film, Grid2x2, Info, Play, Search, Tv } from "lucide-react";
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
  const favoriteIds = useLibraryStore((state) => state.favorites);
  const playback = useLibraryStore((state) => state.playback);
  const removeProgress = useLibraryStore((state) => state.removeProgress);
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

      <section className="mb-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-on-surface lg:text-3xl">
            {pageTitle}
          </h1>
          {selectedCategory ? (
            <Link
              to={sectionConfig.path}
              data-focusable="true"
              className="text-sm font-semibold text-on-surface-variant transition hover:text-on-surface"
            >
              ‹ Voltar
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <TypeTab label="Todos" isActive={sectionKey === "all"} to="/catalog/all" icon={<Grid2x2 aria-hidden="true" size={16} />} />
          <TypeTab label="TV ao vivo" isActive={sectionKey === "tv"} to="/catalog/tv" icon={<Tv aria-hidden="true" size={16} />} />
          <TypeTab label="Filmes" isActive={sectionKey === "movies"} to="/catalog/movies" icon={<Film aria-hidden="true" size={16} />} />
          <TypeTab label="Séries" isActive={sectionKey === "series"} to="/catalog/series" icon={<Clapperboard aria-hidden="true" size={16} />} />
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
          {recommendations.length > 0 ? (
            <CatalogRail title="Baseado no que voce assiste" items={recommendations.slice(0, 5)} />
          ) : null}
          <CatalogRail
            title="Continue Watching"
            items={continueWatching.slice(0, RAIL_LIMIT)}
            onRemoveItem={removeProgress}
            removeLabel="Remover de continuar assistindo"
          />
          <CatalogRail title="Favorites" items={favoritesList.slice(0, RAIL_LIMIT)} />

          {sectionKey === "all" ? (
            <HomeRails catalog={catalog} />
          ) : (
            <CategoryRails groups={categoryGroups} sectionPath={sectionConfig.path} />
          )}
        </>
      )}
    </div>
  );
}

function FeaturedHero({ item }: { item: ContentItem }) {
  return (
    <section className="relative -mx-4 mb-6 overflow-hidden lg:-mx-10 lg:mb-10">
      <div className="relative h-[58vw] max-h-[560px] min-h-[340px] w-full">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          <div className={["absolute inset-0 bg-gradient-to-br", item.backdropTone].join(" ")} />
        )}
        {/* Vinhetas para legibilidade do texto */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/30 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 px-4 pb-6 lg:px-10 lg:pb-12">
          <div className="max-w-xl">
            <span className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
              {item.type === "series" ? "Série" : item.type === "channel" ? "Ao vivo" : "Filme"}
            </span>
            <h1 className="font-display text-3xl font-extrabold leading-tight text-white drop-shadow-lg sm:text-4xl lg:text-6xl">
              {item.title}
            </h1>
            <p className="mt-3 line-clamp-3 max-w-lg text-sm leading-6 text-on-surface lg:text-base">
              {item.description}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                to={getContentHref(item)}
                data-focusable="true"
                className="focus-card flex items-center gap-2 rounded-md bg-white px-6 py-2.5 font-semibold text-black transition hover:bg-white/85"
              >
                <Play aria-hidden="true" size={20} className="fill-black" />
                Assistir
              </Link>
              <Link
                to={getContentHref(item)}
                data-focusable="true"
                className="focus-card flex items-center gap-2 rounded-md bg-white/15 px-6 py-2.5 font-semibold text-white backdrop-blur transition hover:bg-white/25"
              >
                <Info aria-hidden="true" size={20} />
                Detalhes
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
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
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 lg:gap-3 2xl:grid-cols-8">
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

interface TypeTabProps {
  label: string;
  isActive: boolean;
  icon: React.ReactNode;
  to: string;
}

function TypeTab({ label, isActive, icon, to }: TypeTabProps) {
  return (
    <Link
      to={to}
      data-focusable="true"
      aria-current={isActive ? "page" : undefined}
      className={[
        "focus-card flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition",
        isActive
          ? "border-white bg-white text-black"
          : "border-white/15 bg-white/5 text-on-surface-variant hover:border-white/40 hover:text-on-surface"
      ].join(" ")}
    >
      {icon}
      {label}
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
