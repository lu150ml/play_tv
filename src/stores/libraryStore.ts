import { create } from "zustand";
import { persist } from "zustand/middleware";

import { mockCatalog } from "../data/mockCatalog";
import type { ContentItem, PlaybackState } from "../types/catalog";

export interface XtreamConnection {
  serverUrl: string;
  username: string;
  password: string;
}

interface LibraryState {
  catalog: ContentItem[];
  catalogSource: "mock" | "xtream";
  connection?: XtreamConnection;
  favorites: string[];
  playback: Record<string, PlaybackState>;
  sessionName: string;
  serverUrl?: string;
  toggleFavorite: (contentId: string) => void;
  isFavorite: (contentId: string) => boolean;
  saveProgress: (state: PlaybackState) => void;
  setCatalog: (catalog: ContentItem[], source: LibraryState["catalogSource"]) => void;
  setConnection: (connection: XtreamConnection) => void;
  setSessionName: (name: string) => void;
  setServerUrl: (serverUrl: string) => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      catalog: mockCatalog,
      catalogSource: "mock",
      favorites: [],
      playback: {},
      sessionName: "Editor Pro",
      toggleFavorite: (contentId) => {
        const favorites = get().favorites;
        set({
          favorites: favorites.includes(contentId)
            ? favorites.filter((favoriteId) => favoriteId !== contentId)
            : [...favorites, contentId]
        });
      },
      isFavorite: (contentId) => get().favorites.includes(contentId),
      saveProgress: (state) =>
        set((current) => ({
          playback: {
            ...current.playback,
            [state.contentId]: state
          }
        })),
      setCatalog: (catalog, source) => set({ catalog, catalogSource: source }),
      setConnection: (connection) => set({ connection }),
      setSessionName: (name) => set({ sessionName: name }),
      setServerUrl: (serverUrl) => set({ serverUrl })
    }),
    {
      name: "server-xtreme-library",
      partialize: (state) => ({
        catalog: state.catalog,
        catalogSource: state.catalogSource,
        favorites: state.favorites,
        playback: state.playback,
        sessionName: state.sessionName,
        serverUrl: state.serverUrl
      })
    }
  )
);
