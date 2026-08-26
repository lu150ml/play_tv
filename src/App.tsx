import { App as CapacitorApp } from "@capacitor/app";
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { CatalogPage } from "./pages/CatalogPage";
import { LoginPage } from "./pages/LoginPage";
import { PlayerPage } from "./pages/PlayerPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SeriesPage } from "./pages/SeriesPage";
import { isNativeAndroid } from "./platform/platformInfo";
import { playerGateway } from "./platform/playerGateway";
import { savePlaybackProgress } from "./services/playbackService";
import { useLibraryStore } from "./stores/libraryStore";

export function App() {
  useAndroidBackButton();
  useNativePlayerEvents();

  return (
    <>
      <UpdatePrompt />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route element={<AppShell />}>
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/:section" element={<CatalogPage />} />
          <Route path="/catalog/:section/:categorySlug" element={<CatalogPage />} />
          <Route path="/series/:seriesId" element={<SeriesPage />} />
          <Route path="/watch/:seriesId/:episodeId" element={<PlayerPage />} />
          <Route path="/watch/:contentId" element={<PlayerPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/catalog" replace />} />
      </Routes>
    </>
  );
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
          void navigate("/catalog", { replace: true });
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
      const isRoot = location.pathname === "/login" || location.pathname === "/catalog";
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
