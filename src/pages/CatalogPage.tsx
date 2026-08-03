import { Clapperboard, Film, Grid2x2, Music2, Play, Search, Tv } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";

import { CatalogRail } from "../components/CatalogRail";
import { ContentCard } from "../components/ContentCard";
import { SearchOverlay } from "../components/SearchOverlay";
import { SecureImage } from "../components/SecureImage";
import { searchCatalog } from "../services/catalogService";
import { isMusicChannel } from "../services/musicService";
import {
  getPersonalizedRecommendations,
  getRecommendedHero
} from "../services/recommendationService";
import { useLibraryStore } from "../stores/libraryStore";
import type { CatalogFilter, ContentItem, ContentType } from "../types/catalog";

const RAIL_LIMIT = 10;
const SEARCH_PAGE_SIZE = 80;

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
  music: {
    label: "Musica",
    title: "Canais de musica",
    path: "/catalog/music",
    type: "channel",
    icon: Music2,
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

interface CatalogPageProps {
  sectionOverride?: SectionKey;
}

export function HomeCatalogPage() {
  return <CatalogPage sectionOverride="all" />;
}
export function LiveTvCatalogPage() {
  return <CatalogPage sectionOverride="tv" />;
}
export function MusicCatalogPage() {
  return <CatalogPage sectionOverride="music" />;
}
export function MoviesCatalogPage() {
  return <CatalogPage sectionOverride="movies" />;
}
export function SeriesCatalogPage() {
  return <CatalogPage sectionOverride="series" />;
}
export function GlobalSearchPage() {
  return <CatalogPage sectionOverride="all" forceSearch />;
}

export function CatalogPage({
  sectionOverride,
  forceSearch = false
}: CatalogPageProps & { forceSearch?: boolean }) {
  const { section, categorySlug } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const sectionKey = sectionOverride ?? getSectionKey(section);
  const sectionConfig = sectionConfigs[sectionKey];
  const sectionType = sectionConfig.type;
  const [filters, setFilters] = useState<CatalogFilter>({
    type: sectionType,
    sort: "featured"
  });
  const [visibleResults, setVisibleResults] = useState(SEARCH_PAGE_SIZE);
  const navigationStateRef = useRef<{ filters: CatalogFilter }>({ filters });
  navigationStateRef.current = { filters };
  const catalog = useLibraryStore((state) => state.catalog);
  const catalogSource = useLibraryStore((state) => state.catalogSource);
  const favoriteIds = useLibraryStore((state) => state.favorites);
  const playback = useLibraryStore((state) => state.playback);
  const removeProgress = useLibraryStore((state) => state.removeProgress);
  const removeSeriesProgress = useLibraryStore((state) => state.removeSeriesProgress);
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const sectionItems = useMemo(() => filterBySection(catalog, sectionKey), [catalog, sectionKey]);
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
    ? categoryGroups.find(
        (group) => group.slug === categorySlug || slugify(group.title) === categorySlug
      )
    : undefined;
  const isUnknownCategory = Boolean(categorySlug && !selectedCategory);
  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      type: sectionType,
      category: selectedCategory?.title ?? filters.category,
      providerCategoryId: selectedCategory?.providerCategoryId
    }),
    [filters, sectionType, selectedCategory]
  );
  const deferredFilters = useDeferredValue(effectiveFilters);
  const results = useMemo(
    () => searchCatalog(deferredFilters, favorites, sectionItems),
    [deferredFilters, favorites, sectionItems]
  );
  const continueWatching = useMemo(
    () =>
      results
        .filter((item) => playback[item.id]?.positionSeconds > 0)
        .sort(sortByProgressDate(playback)),
    [playback, results]
  );
  const favoritesList = results.filter((item) => favorites.has(item.id));
  const typeCounts = useMemo(
    () => ({
      all: catalog.length,
      channel: catalog.filter((item) => item.type === "channel" && !isMusicChannel(item)).length,
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
      providerCategoryId: selectedCategory?.providerCategoryId,
      query: current.query,
      sort: current.sort ?? "featured"
    }));
  }, [sectionType, selectedCategory?.providerCategoryId, selectedCategory?.title]);

  useEffect(() => {
    setVisibleResults(SEARCH_PAGE_SIZE);
  }, [deferredFilters]);

  useEffect(() => {
    const key = `catalog-view:${location.pathname}${location.search}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as {
        filters?: CatalogFilter;
        scrollY?: number;
        focusId?: string;
      } | null;
      if (saved?.filters)
        setFilters((current) => ({ ...current, ...saved.filters, type: sectionType }));
      window.requestAnimationFrame(() => {
        window.scrollTo(0, saved?.scrollY ?? 0);
        if (saved?.focusId)
          document
            .querySelector<HTMLElement>(`[data-content-id="${CSS.escape(saved.focusId)}"]`)
            ?.focus();
      });
    } catch {
      /* Ignore invalid navigation state. */
    }
    return () => {
      const focused = document.activeElement as HTMLElement | null;
      sessionStorage.setItem(
        key,
        JSON.stringify({
          filters: navigationStateRef.current.filters,
          scrollY: window.scrollY,
          focusId: focused?.dataset.contentId
        })
      );
    };
  }, [location.pathname, location.search, sectionType]);

  if (isUnknownCategory) {
    return <Navigate to={sectionConfig.path} replace />;
  }

  const pageTitle = selectedCategory
    ? `${sectionConfig.title}: ${selectedCategory.title}`
    : sectionKey === "all"
      ? "Início"
      : sectionConfig.title;
  const showSearch = forceSearch || searchParams.get("search") === "open" || selectedCategory;
  const isSearchResult = Boolean(filters.query?.trim());

  return (
    <div className="mx-auto max-w-canvas">
      {!selectedCategory && recommendedHero ? <FeaturedHero item={recommendedHero} /> : null}

      <div className="mb-6 flex flex-wrap items-center gap-4 text-[11px] uppercase tracking-[0.14em] text-on-surface-variant">
        <span>
          {catalogSource === "xtream" ? "Catálogo conectado" : "Catálogo de demonstração"}
        </span>
        <span className="h-1 w-1 rounded-full bg-secondary" />
        <span>{catalog.length} itens carregados</span>
      </div>

      <section className="mb-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-primary">Explore</p>
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
            label="Musica"
            count={catalog.filter(isMusicChannel).length}
            isActive={sectionKey === "music"}
            icon={<Music2 aria-hidden="true" size={22} />}
            to="/catalog/music"
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
            setFilters({
              ...nextFilters,
              type: sectionType,
              category: selectedCategory?.title,
              providerCategoryId: selectedCategory?.providerCategoryId
            })
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
          <CatalogGrid items={results.slice(0, visibleResults)} />
          {results.length > visibleResults ? (
            <button
              type="button"
              data-focusable="true"
              onClick={() => setVisibleResults((count) => count + SEARCH_PAGE_SIZE)}
              className="focus-card mx-auto mt-6 block rounded-lg border border-white/10 bg-surface-container px-5 py-3 font-semibold"
            >
              Carregar mais ({results.length - visibleResults})
            </button>
          ) : null}
        </section>
      ) : (
        <>
          {sectionKey === "all" && recommendations.length > 0 ? (
            <CatalogRail title="Baseado no que você assiste" items={recommendations.slice(0, 5)} />
          ) : null}
          <CatalogRail
            title="Continue assistindo"
            items={continueWatching.slice(0, RAIL_LIMIT)}
            onRemoveItem={(contentId) => {
              const content = catalog.find((item) => item.id === contentId);
              if (content?.type === "series")
                removeSeriesProgress(
                  contentId,
                  content.episodes.map((episode) => episode.id)
                );
              else removeProgress(contentId);
            }}
          />
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
        "focus-card group relative mb-10 block min-h-[25rem] overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br shadow-2xl transition duration-200 hover:border-primary/70",
        item.backdropTone
      ].join(" ")}
    >
      {item.imageUrl ? (
        <SecureImage
          src={item.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-50 transition duration-700 group-hover:scale-[1.02]"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="relative flex min-h-[25rem] max-w-3xl flex-col justify-end p-6 lg:p-10">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Em destaque
        </p>
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
        <h1 className="font-display text-4xl font-semibold leading-none tracking-tight text-on-surface lg:text-6xl">
          {item.title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-on-surface-variant lg:text-lg">
          {item.description}
        </p>
        <span className="mt-6 inline-flex w-fit items-center gap-3 rounded-md bg-primary px-6 py-3 font-semibold text-on-primary">
          <Play aria-hidden="true" size={19} fill="currentColor" /> Assistir
        </span>
      </div>
    </Link>
  );
}

function getContentHref(item: ContentItem): string {
  return item.type === "series" ? `/series/${item.id}` : `/watch/${item.id}`;
}

function HomeRails({ catalog }: { catalog: ContentItem[] }) {
  const liveTv = catalog.filter((item) => item.type === "channel" && !isMusicChannel(item));
  const music = catalog.filter(isMusicChannel);
  const movies = catalog.filter((item) => item.type === "movie");
  const series = catalog.filter((item) => item.type === "series");

  return (
    <>
      <CatalogRail title="TV ao vivo" items={liveTv.slice(0, RAIL_LIMIT)} viewAllTo="/catalog/tv" />
      <CatalogRail title="Música" items={music.slice(0, RAIL_LIMIT)} viewAllTo="/catalog/music" />
      <CatalogRail title="Filmes" items={movies.slice(0, RAIL_LIMIT)} viewAllTo="/catalog/movies" />
      <CatalogRail title="Séries" items={series.slice(0, RAIL_LIMIT)} viewAllTo="/catalog/series" />
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
          viewAllTo={`${sectionPath}/${group.slug}`}
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
        "focus-card flex items-center justify-between rounded-lg border p-4 text-left",
        isActive
          ? "border-primary bg-primary/10 text-on-surface"
          : "border-white/5 bg-surface-container/50 text-on-surface hover:bg-surface-container"
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
  slug: string;
  providerCategoryId?: string;
}

function getSectionKey(section?: string): SectionKey {
  if (
    section === "tv" ||
    section === "music" ||
    section === "movies" ||
    section === "series" ||
    section === "all"
  ) {
    return section;
  }

  return "all";
}

function filterBySection(items: ContentItem[], section: SectionKey): ContentItem[] {
  if (section === "all") {
    return items;
  }
  if (section === "music") return items.filter(isMusicChannel);
  if (section === "tv")
    return items.filter((item) => item.type === "channel" && !isMusicChannel(item));
  const type: ContentType = section === "movies" ? "movie" : "series";
  return items.filter((item) => item.type === type);
}

function groupByDisplayCategory(
  items: ContentItem[],
  broadCategories: readonly string[]
): CategoryGroup[] {
  const groups = new Map<
    string,
    { title: string; items: ContentItem[]; providerCategoryId?: string }
  >();

  for (const item of items) {
    const displayCategories = unique(item.categories).filter(
      (category) => !broadCategories.includes(category)
    );
    const categories = displayCategories.length > 0 ? displayCategories : item.categories;

    for (const category of unique(categories)) {
      const key = item.providerCategoryId ? `${item.providerCategoryId}:${category}` : category;
      const group = groups.get(key) ?? {
        title: category,
        items: [],
        providerCategoryId: item.providerCategoryId
      };
      group.items.push(item);
      groups.set(key, group);
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      slug: group.providerCategoryId
        ? `${slugify(group.title)}-${group.providerCategoryId}`
        : slugify(group.title)
    }))
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
