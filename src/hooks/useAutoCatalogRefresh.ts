import { App as CapacitorApp } from "@capacitor/app";
import { useEffect, useRef } from "react";

import { isNativeAndroid } from "../platform/platformInfo";
import { isCatalogRefreshing, isCatalogStale, refreshCatalog } from "../services/catalogRefreshService";
import { useLibraryStore } from "../stores/libraryStore";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 5_000;

// Renova a lista de conteúdo sozinha quando ela tem 3 dias ou mais: ao abrir o
// app, ao voltar do segundo plano e de hora em hora com o app aberto. Nunca
// durante a reprodução (/watch) para não disputar banda com o vídeo.
export function useAutoCatalogRefresh(pathname: string) {
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    const check = () => {
      const state = useLibraryStore.getState();
      const hasXtreamCatalog = state.catalog.some((item) => item.source === "xtream");
      const isLoading = Object.values(state.catalogSections).some((section) => section.status === "loading");
      if (
        state.catalogSource !== "xtream" ||
        !state.connection ||
        !hasXtreamCatalog ||
        isLoading ||
        isCatalogRefreshing() ||
        pathnameRef.current.startsWith("/watch") ||
        !isCatalogStale(state.catalogCachedAt)
      ) {
        return;
      }
      void refreshCatalog().catch(() => {
        // Falhou: mantém a lista atual e tenta de novo na próxima checagem.
      });
    };

    const timer = window.setTimeout(check, FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    let removeListener: (() => Promise<void>) | undefined;
    if (isNativeAndroid()) {
      void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) check();
      }).then((handle) => {
        removeListener = handle.remove;
      });
    }

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      if (removeListener) void removeListener();
    };
  }, []);
}
