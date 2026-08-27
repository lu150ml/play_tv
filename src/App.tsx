import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import {
  GlobalSearchPage,
  HomeCatalogPage,
  LiveTvCatalogPage,
  MoviesCatalogPage,
  MusicCatalogPage,
  SeriesCatalogPage
} from "./pages/CatalogPage";
import { DownloadsPage } from "./pages/DownloadsPage";
import { LoginPage } from "./pages/LoginPage";
import { PlayerPage } from "./pages/PlayerPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SeriesPage } from "./pages/SeriesPage";
import { MoviePage } from "./pages/MoviePage";
import { StartupPage } from "./pages/StartupPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<StartupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/profiles" element={<ProfilesPage />} />
      <Route element={<AppShell />}>
        <Route path="/catalog" element={<HomeCatalogPage />} />
        <Route path="/catalog/all" element={<HomeCatalogPage />} />
        <Route path="/catalog/all/:categorySlug" element={<HomeCatalogPage />} />
        <Route path="/catalog/tv" element={<LiveTvCatalogPage />} />
        <Route path="/catalog/tv/:categorySlug" element={<LiveTvCatalogPage />} />
        <Route path="/catalog/music" element={<MusicCatalogPage />} />
        <Route path="/catalog/music/:categorySlug" element={<MusicCatalogPage />} />
        <Route path="/catalog/movies" element={<MoviesCatalogPage />} />
        <Route path="/catalog/movies/:categorySlug" element={<MoviesCatalogPage />} />
        <Route path="/catalog/series" element={<SeriesCatalogPage />} />
        <Route path="/catalog/series/:categorySlug" element={<SeriesCatalogPage />} />
        <Route path="/search" element={<GlobalSearchPage />} />
        <Route path="/series/:seriesId" element={<SeriesPage />} />
        <Route path="/movie/:movieId" element={<MoviePage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
        <Route path="/watch/:seriesId/:episodeId" element={<PlayerPage />} />
        <Route path="/watch/:contentId" element={<PlayerPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/catalog" replace />} />
    </Routes>
  );
}
