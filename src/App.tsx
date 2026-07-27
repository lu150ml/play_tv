import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { CatalogPage } from "./pages/CatalogPage";
import { LoginPage } from "./pages/LoginPage";
import { PlayerPage } from "./pages/PlayerPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SeriesPage } from "./pages/SeriesPage";
import { StartupPage } from "./pages/StartupPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<StartupPage />} />
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
  );
}
