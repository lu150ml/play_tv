import { create } from "zustand";
import { persist } from "zustand/middleware";

import { mockCatalog } from "../data/mockCatalog";
import type { ContentItem, PlaybackState, Profile } from "../types/catalog";

export interface XtreamConnection {
  serverUrl: string;
  username: string;
  password: string;
}

export interface ProfileData {
  favorites: string[];
  playback: Record<string, PlaybackState>;
}

export interface ServerAccountData {
  favorites: string[];
  playback: Record<string, PlaybackState>;
  profiles: Profile[];
  activeProfileId: string | null;
  profileData: Record<string, ProfileData>;
}

interface LibraryState {
  catalog: ContentItem[];
  catalogSource: "mock" | "xtream";
  connection?: XtreamConnection;
  rememberConnection: boolean;
  serverAccounts: Record<string, ServerAccountData>;
  activeAccountKey: string | null;
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
  removeProgress: (contentId: string) => void;
  // Catalog actions
  setCatalog: (catalog: ContentItem[], source: LibraryState["catalogSource"]) => void;
  activateServerAccount: (connection: XtreamConnection, remember: boolean) => void;
  disconnectServerAccount: () => void;
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

const EMPTY_ACCOUNT: ServerAccountData = {
  favorites: [],
  playback: {},
  profiles: [],
  activeProfileId: null,
  profileData: {}
};

export function getServerAccountKey(connection: Pick<XtreamConnection, "serverUrl" | "username">) {
  let normalizedUrl = connection.serverUrl.trim().replace(/\/+$/, "");
  try {
    const url = new URL(connection.serverUrl.trim());
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    normalizedUrl = url.toString().replace(/\/+$/, "");
  } catch {
    // Login validation will report malformed URLs; keep a deterministic key meanwhile.
  }
  return `${normalizedUrl}\n${connection.username}`;
}

function accountDataFromState(state: LibraryState): ServerAccountData {
  return {
    favorites: state.favorites,
    playback: state.playback,
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
    profileData: state.profileData
  };
}

function withCurrentAccount(state: LibraryState): Record<string, ServerAccountData> {
  if (!state.activeAccountKey) return state.serverAccounts;
  return { ...state.serverAccounts, [state.activeAccountKey]: accountDataFromState(state) };
}

type PersistedLibraryState = Partial<LibraryState>;

export function migrateLibraryState(persisted: unknown, version: number): PersistedLibraryState {
  const state = (
    persisted && typeof persisted === "object" ? persisted : {}
  ) as PersistedLibraryState;
  if (version >= 1 || state.serverAccounts) return state;
  if (!state.connection) {
    return { ...state, serverAccounts: {}, activeAccountKey: null, rememberConnection: false };
  }

  const accountKey = getServerAccountKey(state.connection);
  const account: ServerAccountData = {
    favorites: state.favorites ?? [],
    playback: state.playback ?? {},
    profiles: state.profiles ?? [],
    activeProfileId: state.activeProfileId ?? null,
    profileData: state.profileData ?? {}
  };
  return {
    ...state,
    rememberConnection: true,
    serverAccounts: { [accountKey]: account },
    activeAccountKey: accountKey
  };
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      catalog: mockCatalog,
      catalogSource: "mock",
      rememberConnection: false,
      serverAccounts: {},
      activeAccountKey: null,
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

      removeProgress: (contentId) => {
        const { activeProfileId, profileData } = get();
        set((current) => {
          if (!current.playback[contentId]) {
            return current;
          }

          const nextPlayback = { ...current.playback };
          delete nextPlayback[contentId];

          return {
            playback: nextPlayback,
            profileData: activeProfileId
              ? syncProfileData(profileData, activeProfileId, current.favorites, nextPlayback)
              : profileData
          };
        });
      },

      setCatalog: (catalog, source) => set({ catalog, catalogSource: source }),
      activateServerAccount: (connection, remember) => {
        const accountKey = getServerAccountKey(connection);
        set((current) => {
          const serverAccounts = withCurrentAccount(current);
          const account = serverAccounts[accountKey] ?? EMPTY_ACCOUNT;
          return {
            connection,
            rememberConnection: remember,
            serverAccounts,
            activeAccountKey: accountKey,
            favorites: account.favorites,
            playback: account.playback,
            profiles: account.profiles,
            activeProfileId: account.activeProfileId,
            profileData: account.profileData
          };
        });
      },
      disconnectServerAccount: () => {
        set((current) => ({
          serverAccounts: withCurrentAccount(current),
          activeAccountKey: null,
          connection: undefined,
          rememberConnection: false,
          catalog: mockCatalog,
          catalogSource: "mock",
          favorites: [],
          playback: {},
          profiles: [],
          activeProfileId: null,
          profileData: {},
          sessionName: "Editor Pro",
          serverUrl: undefined
        }));
      },
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
      migrate: migrateLibraryState,
      // O catálogo NÃO é persistido: pode passar de dezenas de milhares de itens
      // e estourar a cota (~5MB) do localStorage. É recarregado do servidor no
      // boot via AppShell quando há uma conexão salva (catalogSource === "xtream").
      partialize: (state) => ({
        catalogSource: state.catalogSource,
        connection: state.rememberConnection ? state.connection : undefined,
        rememberConnection: state.rememberConnection,
        serverAccounts: withCurrentAccount(state),
        activeAccountKey: state.activeAccountKey,
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
