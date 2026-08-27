import { Download, Heart, Music2, Search, Tv, Film, Clapperboard, Play } from "lucide-react";
import { Link } from "react-router-dom";

import { CatalogRail } from "../components/CatalogRail";
import { SecureImage } from "../components/SecureImage";
import { groupContentByProviderCategory } from "../services/categoryRailService";
import { isMusicChannel } from "../services/musicService";
import { getPersonalizedRecommendations, getRecommendedHero } from "../services/recommendationService";
import { useLibraryStore } from "../stores/libraryStore";

const shortcuts = [
  { label: "TV", to: "/tv", icon: Tv },
  { label: "Música", to: "/music", icon: Music2 },
  { label: "Filmes", to: "/movies", icon: Film },
  { label: "Séries", to: "/series", icon: Clapperboard },
  { label: "Favoritos", to: "/search?favorites=1", icon: Heart }
];

export function HomePage() {
  const catalog = useLibraryStore((state) => state.catalog);
  const playback = useLibraryStore((state) => state.playback);
  const favoritesList = useLibraryStore((state) => state.favorites);
  const profiles = useLibraryStore((state) => state.profiles);
  const activeProfileId = useLibraryStore((state) => state.activeProfileId);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
  const favorites = new Set(favoritesList);
  const hero = getRecommendedHero(catalog, playback, favorites, { allowChannels: false });
  const recommendations = getPersonalizedRecommendations(catalog, playback, favorites, 10).filter((item) => item.id !== hero?.id);
  const continuing = catalog.filter((item) => playback[item.id]).sort((a, b) => new Date(playback[b.id]?.updatedAt ?? 0).getTime() - new Date(playback[a.id]?.updatedAt ?? 0).getTime());
  const live = catalog.filter((item) => item.type === "channel" && !isMusicChannel(item));
  const music = catalog.filter(isMusicChannel);
  const movies = catalog.filter((item) => item.type === "movie");
  const series = catalog.filter((item) => item.type === "series");
  const homeCategoryRails = [
    ...groupContentByProviderCategory(live).map((category) => ({ ...category, basePath: "/tv" })),
    ...groupContentByProviderCategory(music).map((category) => ({ ...category, basePath: "/music" })),
    ...groupContentByProviderCategory(movies).map((category) => ({ ...category, basePath: "/movies" })),
    ...groupContentByProviderCategory(series).map((category) => ({ ...category, basePath: "/series" }))
  ].filter((category) => category.items.length > 0);

  return <div className="mx-auto max-w-canvas">
    <div className="mb-5 flex items-center justify-between lg:hidden"><div><p className="text-xs text-on-surface-variant">Bem-vindo</p><h1 className="font-display text-2xl font-bold">{activeProfile?.name ?? "Play TV"}</h1></div><div className="flex gap-2"><Link aria-label="Downloads" className="focus-card rounded-full border border-white/10 p-3" to="/downloads"><Download size={20}/></Link><Link aria-label="Buscar" className="focus-card rounded-full border border-white/10 p-3" to="/search"><Search size={20}/></Link></div></div>
    <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-2">{shortcuts.map(({ label, to, icon: Icon }) => <Link key={to} to={to} className="focus-card flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-surface-container px-4 py-3 text-sm font-semibold"><Icon size={17}/>{label}</Link>)}</div>
    {hero ? <Link to={hero.type === "series" ? `/series/${hero.id}` : hero.type === "movie" ? `/movie/${hero.id}` : `/watch/${hero.id}`} className={`compact-hero focus-card relative mb-7 flex min-h-56 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-6 ${hero.backdropTone}`}>{hero.imageUrl ? <SecureImage candidates={hero.imageCandidates ?? [hero.imageUrl]} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45"/> : null}<div className="relative z-10 mt-auto max-w-xl"><p className="font-mono text-xs uppercase text-primary">Destaque Play TV</p><h2 className="mt-1 font-cinema text-4xl font-semibold">{hero.title}</h2><span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 font-bold text-on-primary"><Play size={18} fill="currentColor"/>{hero.type === "channel" ? "Assistir" : "Detalhes"}</span></div></Link> : null}
    <CatalogRail title={`Continuar assistindo${activeProfile ? ` como ${activeProfile.name}` : ""}`} items={continuing.slice(0, 12)}/>
    <CatalogRail title="Recomendados para você" items={recommendations}/>
    {homeCategoryRails.map((category) => (
      <CatalogRail
        key={`${category.basePath}:${category.id}`}
        title={category.title}
        items={category.items.slice(0, 16)}
        viewAllTo={`${category.basePath}/category/${encodeURIComponent(category.id)}`}
        viewMoreInRail
      />
    ))}
  </div>;
}
