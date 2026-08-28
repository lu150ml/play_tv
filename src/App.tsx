import { App as CapacitorApp } from "@capacitor/app";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { HomePage } from "./pages/HomePage";
import { SearchPage } from "./pages/SearchPage";
import { MusicPage, MoviesPage, SeriesCatalogPage, TvPage } from "./pages/SectionPages";
import { DownloadsPage } from "./pages/DownloadsPage";
import { LoginPage } from "./pages/LoginPage";
import { PlayerPage } from "./pages/PlayerPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SeriesPage } from "./pages/SeriesPage";
import { MoviePage } from "./pages/MoviePage";
import { credentialVault } from "./platform/credentialVault";
import { isNativeAndroid } from "./platform/platformInfo";
import { playerGateway } from "./platform/playerGateway";
import { savePlaybackProgress } from "./services/playbackService";
import { useLibraryStore } from "./stores/libraryStore";

export function App() {
  useAndroidBackButton();
  useNativePlayerEvents();
  const bootstrapStatus = useSessionBootstrap();
  const activeProfileId = useLibraryStore((state) => state.activeProfileId);
  const connection = useLibraryStore((state) => state.connection);
  const sessionStatus: SessionStatus =
    bootstrapStatus === "checking"
      ? "checking"
      : connection
        ? "authenticated"
        : "anonymous";

  return (
    <>
      <UpdatePrompt />
      <Routes>
        <Route
          path="/"
          element={
            <StartupRoute sessionStatus={sessionStatus} activeProfileId={activeProfileId} />
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/profiles"
          element={
            <AuthenticatedRoute sessionStatus={sessionStatus}>
              <ProfilesPage />
            </AuthenticatedRoute>
          }
        />
        <Route
          element={
            <AuthenticatedRoute sessionStatus={sessionStatus}>
              <AppShell />
            </AuthenticatedRoute>
          }
        >
          <Route path="/home" element={<HomePage />} />
          <Route path="/tv" element={<TvPage />} />
          <Route path="/tv/category/:categoryId" element={<TvPage />} />
          <Route path="/music" element={<MusicPage />} />
          <Route path="/music/category/:categoryId" element={<MusicPage />} />
          <Route path="/movies" element={<MoviesPage />} />
          <Route path="/movies/category/:categoryId" element={<MoviesPage />} />
          <Route path="/series" element={<SeriesCatalogPage />} />
          <Route path="/series/category/:categoryId" element={<SeriesCatalogPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/catalog" element={<Navigate to="/home" replace />} />
          <Route path="/catalog/:section" element={<LegacyCatalogRedirect />} />
          <Route path="/series/:seriesId" element={<SeriesPage />} />
          <Route path="/movie/:movieId" element={<MoviePage />} />
          <Route path="/watch/:seriesId/:episodeId" element={<PlayerPage />} />
          <Route path="/watch/:contentId" element={<PlayerPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </>
  );
}

type SessionStatus = "checking" | "authenticated" | "anonymous";
type BootstrapStatus = "checking" | "ready";

function AuthenticatedRoute({
  sessionStatus,
  children
}: {
  sessionStatus: SessionStatus;
  children: React.ReactNode;
}) {
  if (sessionStatus === "checking") return <SessionLoading />;
  if (sessionStatus === "anonymous") return <Navigate to="/login" replace />;
  return children;
}

function StartupRoute({
  sessionStatus,
  activeProfileId
}: {
  sessionStatus: SessionStatus;
  activeProfileId: string | null;
}) {
  if (sessionStatus === "checking") return <SessionLoading />;

  if (sessionStatus === "authenticated") {
    return <Navigate to={activeProfileId ? "/home" : "/profiles"} replace />;
  }

  return <Navigate to="/login" replace />;
}

function SessionLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-primary">
      <div
        aria-label="Restaurando sessão"
        className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
      />
    </main>
  );
}

function useSessionBootstrap(): BootstrapStatus {
  const setConnection = useLibraryStore((state) => state.setConnection);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>("checking");

  useEffect(() => {
    let disposed = false;

    async function restoreSession() {
      await waitForLibraryHydration();

      try {
        const savedConnection = await credentialVault.load();
        if (disposed) return;

        setConnection(savedConnection);
        setBootstrapStatus("ready");
      } catch {
        if (disposed) return;
        setConnection(undefined);
        setBootstrapStatus("ready");
      }
    }

    void restoreSession();
    return () => {
      disposed = true;
    };
  }, [setConnection]);

  return bootstrapStatus;
}

async function waitForLibraryHydration(): Promise<void> {
  if (useLibraryStore.persist.hasHydrated()) return;
  await useLibraryStore.persist.rehydrate();
}

function useNativePlayerEvents() {
  const navigate = useNavigate();
  const location = useLocation();
  const storeProgress = useLibraryStore((state) => state.saveProgress);

  useEffect(() => {
    if (!isNativeAndroid()) return;

    let disposed = false;
    let removeListener: (() => Promise<void>) | undefined;
    void playerGateway
      .addStateListener((event) => {
        if (event.state === "progress" && event.contentId && event.durationMs > 0) {
          storeProgress(
            savePlaybackProgress({
              contentId: event.contentId,
              positionSeconds: Math.floor(event.positionMs / 1000),
              durationSeconds: Math.floor(event.durationMs / 1000)
            })
          );
        }

        if (event.state === "pip" && location.pathname.startsWith("/watch/")) {
          void navigate("/home", { replace: true });
        }
      })
      .then((handle) => {
        if (disposed) {
          void handle.remove();
        } else {
          removeListener = handle.remove;
        }
      });

    return () => {
      disposed = true;
      if (removeListener) void removeListener();
    };
  }, [location.pathname, navigate, storeProgress]);
}

function useAndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isNativeAndroid()) return;

    let disposed = false;
    let removeListener: (() => Promise<void>) | undefined;
    void CapacitorApp.addListener("backButton", () => {
      const isRoot = location.pathname === "/login" || location.pathname === "/home";
      if (isRoot && !location.search) {
        void CapacitorApp.exitApp();
        return;
      }
      void navigate(-1);
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        removeListener = handle.remove;
      }
    });

    return () => {
      disposed = true;
      if (removeListener) void removeListener();
    };
  }, [location.pathname, location.search, navigate]);
}

function LegacyCatalogRedirect() {
  const location = useLocation();
  const section = location.pathname.split("/")[2];
  const target = section === "tv" ? "/tv" : section === "movies" ? "/movies" : section === "series" ? "/series" : "/home";
  return <Navigate to={target} replace />;
}
