import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { mockCatalog } from "../data/mockCatalog";
import { platformStorage } from "../platform/storageAdapter";
import type { ContentItem, PlaybackState, Profile } from "../types/catalog";

export interface XtreamConnection {
  serverUrl: string;
  username: string;
  password: string;
}

interface ProfileData {
  favorites: string[];
  playback: Record<string, PlaybackState>;
}

interface LibraryState {
  catalog: ContentItem[];
  catalogSource: "mock" | "xtream";
  catalogStatus: "ready" | "loading" | "error";
  connection?: XtreamConnection;
  // Active profile state (swapped on profile switch)
  favorites: string[];
  playback: Record<string, PlaybackState>;
  // Profile management
  profiles: Profile[];
  activeProfileId: string | null;
  profileData: Record<string, ProfileData>;
  sessionName: string;
  serverUrl?: string;
  // Favorites / playback actions
  toggleFavorite: (contentId: string) => void;
  isFavorite: (contentId: string) => boolean;
  saveProgress: (state: PlaybackState) => void;
  // Catalog actions
  setCatalog: (catalog: ContentItem[], source: LibraryState["catalogSource"]) => void;
  setCatalogStatus: (status: LibraryState["catalogStatus"]) => void;
  setConnection: (connection?: XtreamConnection) => void;
  setSessionName: (name: string) => void;
  setServerUrl: (serverUrl: string) => void;
  // Profile actions
  createProfile: (name: string, avatarColor: string) => Profile;
  deleteProfile: (profileId: string) => void;
  setActiveProfile: (profileId: string) => void;
}

function syncProfileData(
  profileData: Record<string, ProfileData>,
  profileId: string,
  favorites: string[],
  playback: Record<string, PlaybackState>
): Record<string, ProfileData> {
  return { ...profileData, [profileId]: { favorites, playback } };
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      catalog: mockCatalog,
      catalogSource: "mock",
      catalogStatus: "ready",
      favorites: [],
      playback: {},
      profiles: [],
      activeProfileId: null,
      profileData: {},
      sessionName: "Editor Pro",

      toggleFavorite: (contentId) => {
        const { favorites, activeProfileId, profileData } = get();
        const next = favorites.includes(contentId)
          ? favorites.filter((id) => id !== contentId)
          : [...favorites, contentId];
        set((current) => ({
          favorites: next,
          profileData: activeProfileId
            ? syncProfileData(profileData, activeProfileId, next, current.playback)
            : profileData
        }));
      },

      isFavorite: (contentId) => get().favorites.includes(contentId),

      saveProgress: (state) => {
        const { activeProfileId, profileData } = get();
        set((current) => {
          const nextPlayback = { ...current.playback, [state.contentId]: state };
          return {
            playback: nextPlayback,
            profileData: activeProfileId
              ? syncProfileData(profileData, activeProfileId, current.favorites, nextPlayback)
              : profileData
          };
        });
      },

      setCatalog: (catalog, source) => set({ catalog, catalogSource: source, catalogStatus: "ready" }),
      setCatalogStatus: (catalogStatus) => set({ catalogStatus }),
      setConnection: (connection) => set({ connection }),
      setSessionName: (name) => set({ sessionName: name }),
      setServerUrl: (serverUrl) => set({ serverUrl }),

      createProfile: (name, avatarColor) => {
        const profile: Profile = {
          id: crypto.randomUUID(),
          name,
          avatarColor,
          createdAt: new Date().toISOString()
        };
        set((current) => ({
          profiles: [...current.profiles, profile],
          profileData: {
            ...current.profileData,
            [profile.id]: { favorites: [], playback: {} }
          }
        }));
        return profile;
      },

      deleteProfile: (profileId) => {
        const { profiles, profileData, activeProfileId, favorites, playback } = get();
        const nextProfiles = profiles.filter((p) => p.id !== profileId);
        const nextProfileData = { ...profileData };
        delete nextProfileData[profileId];

        if (activeProfileId === profileId) {
          const nextActiveId = nextProfiles[0]?.id ?? null;
          const nextData = nextActiveId
            ? (nextProfileData[nextActiveId] ?? { favorites: [], playback: {} })
            : { favorites: [], playback: {} };
          set({
            profiles: nextProfiles,
            profileData: nextProfileData,
            activeProfileId: nextActiveId,
            favorites: nextData.favorites,
            playback: nextData.playback
          });
        } else {
          const savedProfileData = activeProfileId
            ? syncProfileData(nextProfileData, activeProfileId, favorites, playback)
            : nextProfileData;
          set({ profiles: nextProfiles, profileData: savedProfileData });
        }
      },

      setActiveProfile: (profileId) => {
        const { activeProfileId, favorites, playback, profileData } = get();

        // Persist current profile data before switching
        const savedProfileData = activeProfileId
          ? syncProfileData(profileData, activeProfileId, favorites, playback)
          : profileData;

        const nextData = savedProfileData[profileId] ?? { favorites: [], playback: {} };
        set({
          activeProfileId: profileId,
          favorites: nextData.favorites,
          playback: nextData.playback,
          profileData: savedProfileData
        });
      }
    }),
    {
      name: "server-xtreme-library",
      version: 1,
      storage: createJSONStorage(() => platformStorage),
      migrate: (persistedState) => persistedState as LibraryState,
      // O catálogo NÃO é persistido: pode passar de dezenas de milhares de itens
      // e estourar a cota (~5MB) do localStorage. É recarregado do servidor no
      // boot via AppShell quando há uma conexão salva (catalogSource === "xtream").
      partialize: (state) => ({
        catalogSource: state.catalogSource,
        favorites: state.favorites,
        playback: state.playback,
        profiles: state.profiles,
        activeProfileId: state.activeProfileId,
        profileData: state.profileData,
        sessionName: state.sessionName,
        serverUrl: state.serverUrl
      })
    }
  )
);
