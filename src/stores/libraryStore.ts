import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { mockCatalog } from "../data/mockCatalog";
import { platformStorage } from "../platform/storageAdapter";
import type { CatalogSectionState, CatalogViewState, ContentItem, Episode, Movie, PlaybackState, Profile, XtreamCatalogSection } from "../types/catalog";

export interface XtreamConnection { serverUrl: string; username: string; password: string; }
interface ProfileData { favorites: string[]; playback: Record<string, PlaybackState>; }
type CatalogSections = Record<XtreamCatalogSection, CatalogSectionState>;

const IDLE_SECTIONS: CatalogSections = { live: { status: "idle" }, vod: { status: "idle" }, series: { status: "idle" } };
const READY_SECTIONS: CatalogSections = { live: { status: "ready" }, vod: { status: "ready" }, series: { status: "ready" } };
const DEFAULT_VIEW_STATE: CatalogViewState = { query: "", sort: "featured", pageSize: 60, scrollY: 0 };

interface LibraryState {
  catalog: ContentItem[];
  catalogSource: "mock" | "xtream";
  catalogStatus: "ready" | "loading" | "error";
  catalogSections: CatalogSections;
  catalogViewStates: Record<string, CatalogViewState>;
  catalogCachedAt?: string;
  connection?: XtreamConnection;
  favorites: string[];
  playback: Record<string, PlaybackState>;
  profiles: Profile[];
  activeProfileId: string | null;
  profileData: Record<string, ProfileData>;
  sessionName: string;
  serverUrl?: string;
  toggleFavorite: (contentId: string) => void;
  isFavorite: (contentId: string) => boolean;
  saveProgress: (state: PlaybackState) => void;
  setCatalog: (catalog: ContentItem[], source: LibraryState["catalogSource"]) => void;
  beginCatalogLoad: () => void;
  setCatalogSection: (section: XtreamCatalogSection, items: ContentItem[], status?: "ready" | "error", error?: string) => void;
  setCatalogStatus: (status: LibraryState["catalogStatus"]) => void;
  setSeriesEpisodes: (seriesId: string, episodes: Episode[]) => void;
  setSeriesArtwork: (seriesId: string, imageCandidates: string[]) => void;
  setMovieDetails: (movie: Movie) => void;
  getViewState: (routeKey: string) => CatalogViewState;
  setViewState: (routeKey: string, state: Partial<CatalogViewState>) => void;
  setConnection: (connection?: XtreamConnection) => void;
  clearSession: () => void;
  setSessionName: (name: string) => void;
  setServerUrl: (serverUrl: string) => void;
  createProfile: (name: string, avatarColor: string) => Profile;
  deleteProfile: (profileId: string) => void;
  setActiveProfile: (profileId: string) => void;
}

function syncProfileData(profileData: Record<string, ProfileData>, profileId: string, favorites: string[], playback: Record<string, PlaybackState>): Record<string, ProfileData> {
  return { ...profileData, [profileId]: { favorites, playback } };
}

function sameEpisodes(left: Episode[], right: Episode[]): boolean {
  if (left === right) return true;
  return left.length === right.length && left.every((episode, index) => {
    const other = right[index];
    return Boolean(other) && episode.id === other.id && episode.title === other.title && episode.streamUrl === other.streamUrl && JSON.stringify(episode.streamCandidates ?? []) === JSON.stringify(other.streamCandidates ?? []);
  });
}

function overallStatus(sections: CatalogSections): LibraryState["catalogStatus"] {
  const values = Object.values(sections);
  // Enquanto qualquer seção ainda carrega, o status global permanece loading.
  // Isso evita que /movie/:id e /series/:id tratem o catálogo como pronto só
  // porque a TV ao vivo chegou primeiro.
  if (values.some((section) => section.status === "loading" || section.status === "idle")) {
    return "loading";
  }
  if (values.some((section) => section.status === "ready")) return "ready";
  if (values.every((section) => section.status === "error")) return "error";
  return "loading";
}

/** True enquanto a seção ainda não terminou (idle/loading). */
export function isCatalogSectionPending(status: CatalogSectionState["status"]): boolean {
  return status === "idle" || status === "loading";
}

const CATALOG_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

function isCatalogCacheValid(cachedAt?: string): boolean {
  if (!cachedAt) return false;
  const age = Date.now() - new Date(cachedAt).getTime();
  return age >= 0 && age <= CATALOG_TTL_MS;
}

function migrateLibraryState(persistedState: unknown): Partial<LibraryState> {
  const state = (persistedState && typeof persistedState === "object" ? persistedState : {}) as Partial<LibraryState>;
  const catalog = Array.isArray(state.catalog) ? state.catalog : [];
  const catalogCachedAt = typeof state.catalogCachedAt === "string" ? state.catalogCachedAt : undefined;
  const hasValidCache = state.catalogSource === "xtream" && isCatalogCacheValid(catalogCachedAt) && catalog.length > 0;

  return {
    ...state,
    catalog: hasValidCache ? catalog : [],
    catalogSource: hasValidCache ? "xtream" : (state.catalogSource === "xtream" ? "xtream" : "mock"),
    catalogStatus: hasValidCache ? "ready" : (state.catalogSource === "xtream" ? "loading" : "ready"),
    catalogSections: hasValidCache ? READY_SECTIONS : IDLE_SECTIONS,
    catalogViewStates: {},
    catalogCachedAt: hasValidCache ? catalogCachedAt : undefined
  };
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      catalog: mockCatalog,
      catalogSource: "mock",
      catalogStatus: "ready",
      catalogSections: READY_SECTIONS,
      catalogViewStates: {},
      favorites: [],
      playback: {},
      profiles: [],
      activeProfileId: null,
      profileData: {},
      sessionName: "Play TV",

      toggleFavorite: (contentId) => {
        const { favorites, activeProfileId, profileData } = get();
        const next = favorites.includes(contentId) ? favorites.filter((id) => id !== contentId) : [...favorites, contentId];
        set((current) => ({ favorites: next, profileData: activeProfileId ? syncProfileData(profileData, activeProfileId, next, current.playback) : profileData }));
      },
      isFavorite: (contentId) => get().favorites.includes(contentId),
      saveProgress: (state) => {
        const { activeProfileId, profileData } = get();
        set((current) => {
          const nextPlayback = { ...current.playback, [state.contentId]: state };
          return { playback: nextPlayback, profileData: activeProfileId ? syncProfileData(profileData, activeProfileId, current.favorites, nextPlayback) : profileData };
        });
      },

      setCatalog: (catalog, source) => set({
        catalog,
        catalogSource: source,
        catalogStatus: "ready",
        catalogSections: READY_SECTIONS,
        catalogCachedAt: source === "xtream" ? new Date().toISOString() : undefined
      }),
      beginCatalogLoad: () => set((current) => ({
        catalog: current.catalog,
        catalogSource: "xtream",
        catalogStatus: "loading",
        catalogSections: { live: { status: "loading" }, vod: { status: "loading" }, series: { status: "loading" } }
      })),
      setCatalogSection: (section, items, status = "ready", error) => set((current) => {
        const belongs = (item: ContentItem) => section === "live" ? item.type === "channel" : section === "vod" ? item.type === "movie" : item.type === "series";
        const previousItems = current.catalog.filter(belongs);
        const unchanged = previousItems.length === items.length && previousItems.every((item, index) => item.id === items[index]?.id);
        const previousSection = current.catalogSections[section];
        if (unchanged && previousSection.status === status && previousSection.error === error) return current;
        const catalog = [
          ...(section === "live" ? items : current.catalog.filter((item) => item.type === "channel")),
          ...(section === "vod" ? items : current.catalog.filter((item) => item.type === "movie")),
          ...(section === "series" ? items : current.catalog.filter((item) => item.type === "series"))
        ];
        const catalogSections = { ...current.catalogSections, [section]: { status, error } };
        return {
          catalog,
          catalogSections,
          catalogStatus: overallStatus(catalogSections),
          catalogCachedAt: status === "ready" ? new Date().toISOString() : current.catalogCachedAt
        };
      }),
      setCatalogStatus: (catalogStatus) => set({ catalogStatus }),
      setSeriesEpisodes: (seriesId, episodes) => set((current) => {
        const series = current.catalog.find((item) => item.id === seriesId);
        if (!series || series.type !== "series" || sameEpisodes(series.episodes, episodes)) return current;
        return { catalog: current.catalog.map((item) => item.id === seriesId && item.type === "series" ? { ...item, episodes, seasons: new Set(episodes.map((episode) => episode.season)).size } : item) };
      }),
      setSeriesArtwork: (seriesId, imageCandidates) => set((current) => {
        const series = current.catalog.find((item) => item.id === seriesId);
        if (!series || series.type !== "series" || imageCandidates.length === 0 || JSON.stringify(series.imageCandidates ?? []) === JSON.stringify(imageCandidates)) return current;
        return { catalog: current.catalog.map((item) => item.id === seriesId && item.type === "series" ? { ...item, imageUrl: imageCandidates[0], imageCandidates } : item) };
      }),
      setMovieDetails: (movie) => set((current) => {
        const existing = current.catalog.find((item) => item.id === movie.id);
        if (!existing || existing.type !== "movie") return current;
        if (JSON.stringify(existing) === JSON.stringify(movie)) return current;
        return { catalog: current.catalog.map((item) => item.id === movie.id ? movie : item) };
      }),
      getViewState: (routeKey) => get().catalogViewStates[routeKey] ?? DEFAULT_VIEW_STATE,
      setViewState: (routeKey, state) => set((current) => ({ catalogViewStates: { ...current.catalogViewStates, [routeKey]: { ...(current.catalogViewStates[routeKey] ?? DEFAULT_VIEW_STATE), ...state } } })),
      setConnection: (connection) => set((current) => {
        if (!connection) return { connection: undefined };
        const hasInFlightOrReady = Object.values(current.catalogSections).some(
          (section) => section.status === "loading" || section.status === "ready"
        );
        // Restauração a frio: seções ainda idle → marca loading sem apagar um
        // carregamento já iniciado no login.
        if (hasInFlightOrReady) {
          return {
            connection,
            catalogSource: "xtream",
            catalogStatus: overallStatus(current.catalogSections)
          };
        }
        return {
          connection,
          catalogSource: "xtream",
          catalogStatus: "loading",
          catalogSections: {
            live: { status: "loading" },
            vod: { status: "loading" },
            series: { status: "loading" }
          }
        };
      }),
      clearSession: () => set({ catalog: [], catalogSource: "mock", catalogStatus: "ready", catalogSections: IDLE_SECTIONS, catalogCachedAt: undefined, connection: undefined, sessionName: "Play TV", serverUrl: undefined }),
      setSessionName: (name) => set({ sessionName: name }),
      setServerUrl: (serverUrl) => set({ serverUrl }),

      createProfile: (name, avatarColor) => {
        const profile: Profile = { id: crypto.randomUUID(), name, avatarColor, createdAt: new Date().toISOString() };
        set((current) => ({ profiles: [...current.profiles, profile], profileData: { ...current.profileData, [profile.id]: { favorites: [], playback: {} } } }));
        return profile;
      },
      deleteProfile: (profileId) => {
        const { profiles, profileData, activeProfileId, favorites, playback } = get();
        const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
        const nextProfileData = { ...profileData };
        delete nextProfileData[profileId];
        if (activeProfileId === profileId) {
          const nextActiveId = nextProfiles[0]?.id ?? null;
          const nextData = nextActiveId ? (nextProfileData[nextActiveId] ?? { favorites: [], playback: {} }) : { favorites: [], playback: {} };
          set({ profiles: nextProfiles, profileData: nextProfileData, activeProfileId: nextActiveId, favorites: nextData.favorites, playback: nextData.playback });
        } else {
          set({ profiles: nextProfiles, profileData: activeProfileId ? syncProfileData(nextProfileData, activeProfileId, favorites, playback) : nextProfileData });
        }
      },
      setActiveProfile: (profileId) => {
        const { activeProfileId, favorites, playback, profileData } = get();
        const savedProfileData = activeProfileId ? syncProfileData(profileData, activeProfileId, favorites, playback) : profileData;
        const nextData = savedProfileData[profileId] ?? { favorites: [], playback: {} };
        set({ activeProfileId: profileId, favorites: nextData.favorites, playback: nextData.playback, profileData: savedProfileData });
      }
    }),
    {
      name: "server-xtreme-library",
      version: 2,
      storage: createJSONStorage(() => platformStorage),
      migrate: migrateLibraryState,
      partialize: (state) => ({
        catalog: state.catalogSource === "xtream" ? state.catalog : [],
        catalogSource: state.catalogSource,
        catalogCachedAt: state.catalogCachedAt,
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
