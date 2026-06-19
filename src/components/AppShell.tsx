import {
  Clapperboard,
  Download,
  Film,
  Home,
  MonitorPlay,
  Search,
  Settings,
  Tv,
  UserRound
} from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { useRemoteNavigation } from "../hooks/useRemoteNavigation";
import { useLibraryStore } from "../stores/libraryStore";

const navItems = [
  { label: "Home", path: "/catalog", icon: Home },
  { label: "Todos", path: "/catalog/all", icon: MonitorPlay },
  { label: "TV", path: "/catalog/tv", icon: Tv },
  { label: "Filmes", path: "/catalog/movies", icon: Film },
  { label: "Séries", path: "/catalog/series", icon: Clapperboard },
  { label: "Search", path: "/catalog?search=open", icon: Search },
  { label: "Downloads", path: "/catalog", icon: Download },
  { label: "Profile", path: "/catalog", icon: UserRound }
];

export function AppShell() {
  const sessionName = useLibraryStore((state) => state.sessionName);
  const location = useLocation();
  useRemoteNavigation();
  const currentPath = `${location.pathname}${location.search}`;

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 border-r border-white/10 bg-surface-container-high/90 px-4 py-8 backdrop-blur-3xl lg:flex lg:flex-col">
        <div className="mb-8 flex items-center gap-4 px-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-primary-container/50 bg-primary-container/10 text-primary shadow-glow">
            <MonitorPlay aria-hidden="true" size={28} />
          </div>
          <div>
            <p className="font-display text-xl font-bold tracking-normal text-primary">
              Server Xtreme
            </p>
            <p className="font-mono text-xs uppercase text-on-surface-variant">v0.1.0</p>
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
                  "focus-card flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold",
                  isActive
                    ? "border-primary-container/40 bg-primary-container/10 text-primary"
                    : "border-transparent text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
                ].join(" ")}
              >
                <item.icon aria-hidden="true" size={20} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="rounded-xl border border-white/10 bg-surface-container/70 p-4">
          <p className="font-mono text-xs uppercase text-on-surface-variant">Connected as</p>
          <p className="mt-1 font-display text-lg font-semibold text-on-surface">{sessionName}</p>
        </div>
      </aside>

      <header className="fixed left-0 top-0 z-30 flex h-16 w-full items-center justify-between border-b border-white/10 bg-surface/80 px-4 backdrop-blur-2xl lg:left-72 lg:w-[calc(100%-18rem)] lg:px-10">
        <p className="font-display text-xl font-bold text-primary lg:text-2xl">Server Xtreme</p>
        <button
          type="button"
          data-focusable="true"
          className="focus-card flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-surface-container text-on-surface-variant"
          aria-label="Open settings"
        >
          <Settings aria-hidden="true" size={20} />
        </button>
      </header>

      <main className="min-h-screen px-4 pb-24 pt-20 lg:ml-72 lg:px-10 lg:pb-10">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 z-40 grid h-20 w-full grid-cols-5 border-t border-white/10 bg-surface/90 px-2 backdrop-blur-2xl lg:hidden">
        {navItems.slice(0, 5).map((item) => {
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
                  ? "border-secondary-container bg-secondary-container/40 text-primary"
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
