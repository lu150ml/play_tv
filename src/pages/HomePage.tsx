import { Download, Heart, Music2, Search, Tv, Film, Clapperboard, Play } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { CatalogRail } from "../components/CatalogRail";
import { SecureImage } from "../components/SecureImage";
import { groupContentByProviderCategory } from "../services/categoryRailService";
import { isMusicChannel } from "../services/musicService";
import { getPersonalizedRecommendations, getRecommendedHero } from "../services/recommendationService";
import { isTvMode } from "../platform/device";
import { useLibraryStore } from "../stores/libraryStore";

const shortcuts = [
  { label: "TV", to: "/tv", icon: Tv },
  { label: "Música", to: "/music", icon: Music2 },
  { label: "Filmes", to: "/movies", icon: Film },
  { label: "Séries", to: "/series", icon: Clapperboard },
  { label: "Favoritos", to: "/search?favorites=1", icon: Heart }
];

export function HomePage() {
  const tvOptimized = isTvMode();
  const maxHomeRails = tvOptimized ? 5 : 8;
  const railItemLimit = tvOptimized ? 10 : 16;
  const catalog = useLibraryStore((state) => state.catalog);
  const catalogSource = useLibraryStore((state) => state.catalogSource);
  const catalogSections = useLibraryStore((state) => state.catalogSections);
  const playback = useLibraryStore((state) => state.playback);
  const favoritesList = useLibraryStore((state) => state.favorites);
  const profiles = useLibraryStore((state) => state.profiles);
  const activeProfileId = useLibraryStore((state) => state.activeProfileId);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
  const favorites = useMemo(() => new Set(favoritesList), [favoritesList]);
  const hero = useMemo(() => getRecommendedHero(catalog, playback, favorites, { allowChannels: false }), [catalog, playback, favorites]);
  const recommendations = useMemo(() => getPersonalizedRecommendations(catalog, playback, favorites, 10).filter((item) => item.id !== hero?.id), [catalog, playback, favorites, hero?.id]);
  const continuing = useMemo(() => catalog.filter((item) => playback[item.id]).sort((a, b) => new Date(playback[b.id]?.updatedAt ?? 0).getTime() - new Date(playback[a.id]?.updatedAt ?? 0).getTime()), [catalog, playback]);
  const live = useMemo(() => catalog.filter((item) => item.type === "channel" && !isMusicChannel(item)), [catalog]);
  const music = useMemo(() => catalog.filter(isMusicChannel), [catalog]);
  const movies = useMemo(() => catalog.filter((item) => item.type === "movie"), [catalog]);
  const series = useMemo(() => catalog.filter((item) => item.type === "series"), [catalog]);
  const homeCategoryRails = useMemo(() => [
    ...groupContentByProviderCategory(live).map((category) => ({ ...category, basePath: "/tv" })),
    ...groupContentByProviderCategory(music).map((category) => ({ ...category, basePath: "/music" })),
    ...groupContentByProviderCategory(movies).map((category) => ({ ...category, basePath: "/movies" })),
    ...groupContentByProviderCategory(series).map((category) => ({ ...category, basePath: "/series" }))
  ]
    .filter((category) => category.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, maxHomeRails), [live, music, movies, series, maxHomeRails]);

  const isCatalogLoading = catalogSource === "xtream" && Object.values(catalogSections).some((section) => section.status === "loading");
  const showSkeleton = isCatalogLoading && catalog.length === 0;

  return <div className="mx-auto max-w-canvas">
    <div className="mb-5 flex items-center justify-between lg:hidden"><div><p className="text-xs text-on-surface-variant">Bem-vindo</p><h1 className="font-display text-2xl font-bold">{activeProfile?.name ?? "Play TV"}</h1></div><div className="flex gap-2"><Link aria-label="Downloads" data-focusable="true" className="focus-card rounded-full border border-white/10 p-3" to="/downloads"><Download size={20}/></Link><Link aria-label="Buscar" data-focusable="true" className="focus-card rounded-full border border-white/10 p-3" to="/search"><Search size={20}/></Link></div></div>
    <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-2">{shortcuts.map(({ label, to, icon: Icon }) => <Link key={to} to={to} data-focusable="true" className="focus-card flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-surface-container px-4 py-3 text-sm font-semibold"><Icon size={17}/>{label}</Link>)}</div>
    {hero ? <Link to={hero.type === "series" ? `/series/${hero.id}` : hero.type === "movie" ? `/movie/${hero.id}` : `/watch/${hero.id}`} data-focusable="true" className={`compact-hero focus-card relative mb-7 flex min-h-56 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-6 ${hero.backdropTone}`}>{hero.imageUrl ? <SecureImage candidates={hero.imageCandidates ?? [hero.imageUrl]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-45"/> : null}<div className="relative z-10 mt-auto max-w-xl"><p className="font-mono text-xs uppercase text-primary">Destaque Play TV</p><h2 className="mt-1 font-cinema text-4xl font-semibold">{hero.title}</h2><span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 font-bold text-on-primary"><Play size={18} fill="currentColor"/>{hero.type === "channel" ? "Assistir" : "Detalhes"}</span></div></Link> : null}
    <CatalogRail title={`Continuar assistindo${activeProfile ? ` como ${activeProfile.name}` : ""}`} items={continuing.slice(0, 12)}/>
    <CatalogRail title="Recomendados para você" items={recommendations}/>
    {showSkeleton ? <HomeSkeleton /> : null}
    {homeCategoryRails.map((category) => (
      <CatalogRail
        key={`${category.basePath}:${category.id}`}
        title={category.title}
        items={category.items.slice(0, railItemLimit)}
        viewAllTo={`${category.basePath}/category/${encodeURIComponent(category.id)}`}
        viewMoreInRail
      />
    ))}
  </div>;
}

function HomeSkeleton() {
  return (
    <div className="space-y-10">
      {["Continuar assistindo", "Filmes", "Séries"].map((title) => (
        <section key={title}>
          <div className="mb-4 h-7 w-40 animate-pulse rounded bg-white/10" />
          <div className="flex gap-4 overflow-x-auto pb-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="w-44 shrink-0 animate-pulse sm:w-52">
                <div className="aspect-[2/3] rounded-lg bg-white/10" />
                <div className="mt-3 h-4 w-3/4 rounded bg-white/10" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
