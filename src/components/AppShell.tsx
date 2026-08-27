import { Clapperboard, Download, Film, Home, MonitorPlay, Music2, Search, Tv, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useRemoteNavigation } from "../hooks/useRemoteNavigation";
import { startServerSession } from "../services/sessionService";
import { useLibraryStore } from "../stores/libraryStore";
import { BrandWordmark } from "./BrandWordmark";
import { LogoutButton } from "./LogoutButton";
import { AppFooter } from "./AppFooter";

const navItems = [
  { label: "Início", path: "/home", icon: Home },
  { label: "TV", path: "/tv", icon: Tv },
  { label: "Música", path: "/music", icon: Music2 },
  { label: "Filmes", path: "/movies", icon: Film },
  { label: "Séries", path: "/series", icon: Clapperboard },
  { label: "Buscar", path: "/search", icon: Search },
  { label: "Downloads", path: "/downloads", icon: Download }
];

const mobileNavItems = navItems.filter((item) =>
  ["Início", "TV", "Filmes", "Séries", "Buscar"].includes(item.label)
);

export function AppShell() {
  const sessionName = useLibraryStore((state) => state.sessionName);
  const profiles = useLibraryStore((state) => state.profiles);
  const activeProfileId = useLibraryStore((state) => state.activeProfileId);
  const connection = useLibraryStore((state) => state.connection);
  const catalogSource = useLibraryStore((state) => state.catalogSource);
  const catalog = useLibraryStore((state) => state.catalog);
  const beginCatalogLoad = useLibraryStore((state) => state.beginCatalogLoad);
  const setCatalogSection = useLibraryStore((state) => state.setCatalogSection);
  const setCatalogStatus = useLibraryStore((state) => state.setCatalogStatus);
  const setServerUrl = useLibraryStore((state) => state.setServerUrl);
  const setSessionName = useLibraryStore((state) => state.setSessionName);
  const location = useLocation();
  const navigate = useNavigate();
  useRemoteNavigation();
  const currentPath = `${location.pathname}${location.search}`;

  const catalogSections = useLibraryStore((state) => state.catalogSections);

  // O catálogo do xtream não é persistido (ver libraryStore). Após um refresh,
  // se há conexão salva mas o catálogo em memória ainda é o mock, recarrega
  // do servidor uma única vez. Não reinicia se alguma seção já está loading
  // (ex.: login acabou de disparar o carregamento progressivo).
  const isRefetchingRef = useRef(false);
  useEffect(() => {
    const hasXtreamCatalog = catalog.some((item) => item.source === "xtream");
    const isSectionLoading = Object.values(catalogSections).some(
      (section) => section.status === "loading"
    );

    if (
      catalogSource !== "xtream" ||
      !connection ||
      hasXtreamCatalog ||
      isSectionLoading ||
      isRefetchingRef.current
    ) {
      return;
    }

    isRefetchingRef.current = true;
    beginCatalogLoad();
    void startServerSession(
      { ...connection, remember: true },
      (update) => setCatalogSection(update.section, update.items, update.status, update.error)
    )
      .then((session) => {
        setSessionName(session.displayName);
        setServerUrl(session.serverUrl);
        void session.catalogReady;
      })
      .catch(() => {
        // Mantém o catálogo atual em caso de falha; o usuário pode reconectar.
        setCatalogStatus("error");
      })
      .finally(() => {
        isRefetchingRef.current = false;
      });
  }, [
    catalog,
    catalogSections,
    catalogSource,
    connection,
    beginCatalogLoad,
    setCatalogSection,
    setCatalogStatus,
    setServerUrl,
    setSessionName
  ]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  function handleSwitchProfile() {
    void navigate("/profiles");
  }

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <aside className="app-sidebar fixed left-0 top-0 z-40 hidden h-screen w-72 border-r border-white/10 bg-black/80 px-4 py-8 backdrop-blur-3xl lg:flex lg:flex-col">
        <div className="mb-10 flex items-center gap-4 px-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary">
            <MonitorPlay aria-hidden="true" size={23} />
          </div>
          <div className="brand-copy">
            <BrandWordmark compact />
            <p className="font-mono text-xs uppercase text-on-surface-variant">Android</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-2">
          {navItems.map((item) => {
            const isActive = isNavItemActive(item.path, currentPath);

            return (
              <Link
                key={item.label}
                to={item.path}
                data-focusable="true"
                aria-current={isActive ? "page" : undefined}
                className={[
                  "focus-card relative flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold",
                  isActive
                    ? "border-primary/20 bg-primary/10 text-primary before:absolute before:-left-4 before:h-8 before:w-1 before:rounded-r-full before:bg-primary"
                    : "border-transparent text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
                ].join(" ")}
              >
                <item.icon aria-hidden="true" size={20} />
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Profile card */}
        <div className="profile-card rounded-xl border border-white/10 bg-surface-container/70 p-4">
          <p className="font-mono text-xs uppercase text-on-surface-variant">Conectado como</p>
          <p className="mt-1 font-display text-lg font-semibold text-on-surface">{sessionName}</p>

          {activeProfile ? (
            <button
              type="button"
              onClick={handleSwitchProfile}
              className="focus-card mt-3 flex w-full items-center gap-3 rounded-lg border border-white/10 bg-surface-container px-3 py-2 text-left transition hover:border-primary-container/30 hover:bg-surface-container-high"
            >
              <div
                className={[
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold text-white",
                  activeProfile.avatarColor
                ].join(" ")}
              >
                {activeProfile.name.charAt(0).toUpperCase()}
              </div>
              <div className="profile-copy min-w-0 flex-1">
                <p className="truncate font-semibold text-on-surface">{activeProfile.name}</p>
                <p className="font-mono text-[10px] uppercase text-primary-container">
                  Trocar perfil
                </p>
              </div>
              <UserRound size={16} className="shrink-0 text-on-surface-variant" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSwitchProfile}
              className="focus-card mt-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2 text-sm text-on-surface-variant hover:text-on-surface"
            >
              <UserRound size={16} />
              Selecionar perfil
            </button>
          )}
        </div>
        <LogoutButton />
      </aside>

      <header className="app-header fixed left-0 top-0 z-30 flex h-16 w-full items-center justify-between border-b border-white/10 bg-black/80 px-4 backdrop-blur-2xl lg:left-72 lg:w-[calc(100%-18rem)] lg:px-10">
        <BrandWordmark compact />
        <div className="flex items-center gap-2">
          {activeProfile ? (
            <button
              type="button"
              onClick={handleSwitchProfile}
              className="focus-card flex items-center gap-2 rounded-lg border border-white/10 bg-surface-container px-3 py-2 text-sm text-on-surface-variant hover:text-on-surface lg:hidden"
            >
              <div
                className={[
                  "flex h-6 w-6 items-center justify-center rounded-full font-display text-xs font-bold text-white",
                  activeProfile.avatarColor
                ].join(" ")}
              >
                {activeProfile.name.charAt(0).toUpperCase()}
              </div>
              {activeProfile.name}
            </button>
          ) : null}
          <LogoutButton compact />
        </div>
      </header>

      <main className="app-content min-h-screen px-4 pb-24 pt-20 lg:ml-72 lg:px-10 lg:pb-10">
        <Outlet />
      </main>

      <AppFooter />

      <nav className="app-bottom-nav fixed bottom-0 left-0 z-40 grid h-20 w-full grid-cols-5 border-t border-white/10 bg-black/90 px-2 backdrop-blur-2xl lg:hidden">
        {mobileNavItems.map((item) => {
          const isActive = isNavItemActive(item.path, currentPath);

          return (
            <Link
              key={item.label}
              to={item.path}
              data-focusable="true"
              aria-current={isActive ? "page" : undefined}
              className={[
                "focus-card my-2 flex flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-semibold",
                isActive
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-transparent text-on-surface-variant"
              ].join(" ")}
            >
              <item.icon aria-hidden="true" size={19} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function isNavItemActive(path: string, currentPath: string): boolean {
  if (path.includes("?")) {
    return currentPath === path;
  }

  return currentPath === path || (path !== "/catalog" && currentPath.startsWith(`${path}/`));
}
