import { beforeEach, describe, expect, it } from "vitest";

import {
  getServerAccountKey,
  migrateLibraryState,
  useLibraryStore,
  type XtreamConnection
} from "./libraryStore";

const accountA: XtreamConnection = {
  serverUrl: "HTTPS://IPTV.EXAMPLE:443/base/",
  username: "viewerA",
  password: "secret-a"
};
const accountB: XtreamConnection = {
  serverUrl: "https://other.example",
  username: "viewerB",
  password: "secret-b"
};

beforeEach(() => {
  useLibraryStore.setState(useLibraryStore.getInitialState(), true);
  localStorage.clear();
});

describe("libraryStore server accounts", () => {
  it("does not recreate a series when artwork and episodes are unchanged", () => {
    const initialSeries = useLibraryStore.getState().catalog.find((item) => item.type === "series");
    expect(initialSeries?.type).toBe("series");
    if (initialSeries?.type !== "series") return;
    const imageUrl = initialSeries.imageUrl ?? "https://images.test/series.jpg";
    useLibraryStore.getState().setSeriesArtwork(initialSeries.id, imageUrl);
    const afterArtwork = useLibraryStore.getState().catalog.find((item) => item.id === initialSeries.id);
    useLibraryStore.getState().setSeriesArtwork(initialSeries.id, imageUrl);
    expect(useLibraryStore.getState().catalog.find((item) => item.id === initialSeries.id)).toBe(afterArtwork);

    useLibraryStore.getState().setSeriesEpisodes(initialSeries.id, initialSeries.episodes);
    expect(useLibraryStore.getState().catalog.find((item) => item.id === initialSeries.id)).toBe(afterArtwork);
  });

  it("updates episode metadata even when provider ids stay the same", () => {
    const initialSeries = useLibraryStore.getState().catalog.find((item) => item.type === "series");
    expect(initialSeries?.type).toBe("series");
    if (initialSeries?.type !== "series" || initialSeries.episodes.length === 0) return;
    const updated = initialSeries.episodes.map((episode, index) =>
      index === 0 ? { ...episode, title: `${episode.title} atualizado` } : episode
    );
    useLibraryStore.getState().setSeriesEpisodes(initialSeries.id, updated);
    const series = useLibraryStore.getState().catalog.find((item) => item.id === initialSeries.id);
    expect(series?.type === "series" ? series.episodes[0]?.title : undefined).toContain("atualizado");
  });

  it("keeps channel health isolated by Xtream account", () => {
    const store = useLibraryStore.getState();
    store.activateServerAccount(accountA, true);
    useLibraryStore.getState().setChannelHealth("channel-1", { status: "unavailable", httpStatus: 404 });
    expect(useLibraryStore.getState().getChannelHealth("channel-1")?.status).toBe("unavailable");
    useLibraryStore.getState().activateServerAccount(accountB, true);
    expect(useLibraryStore.getState().getChannelHealth("channel-1")).toBeUndefined();
  });

  it("builds a stable account key without including the password", () => {
    const first = getServerAccountKey(accountA);
    const second = getServerAccountKey({
      serverUrl: accountA.serverUrl,
      username: accountA.username
    });
    expect(first).toBe(second);
    expect(first).not.toContain("secret");
    expect(first).toContain("iptv.example");
  });

  it("migrates 0.2.0 profile and playback data into the remembered account", () => {
    const migrated = migrateLibraryState(
      {
        connection: accountA,
        profiles: [{ id: "profile-a", name: "A", avatarColor: "bg-blue-500", createdAt: "now" }],
        activeProfileId: "profile-a",
        favorites: ["movie-a"],
        playback: {
          "movie-a": {
            contentId: "movie-a",
            positionSeconds: 10,
            durationSeconds: 100,
            updatedAt: "now"
          }
        },
        profileData: {}
      },
      0
    );
    const key = getServerAccountKey(accountA);
    expect(migrated.activeAccountKey).toBe(key);
    expect(migrated.serverAccounts?.[key]?.favorites).toEqual(["movie-a"]);
    expect(migrated.rememberConnection).toBe(true);
  });

  it("keeps profiles, favorites, and playback isolated per server account", () => {
    const store = useLibraryStore.getState();
    store.activateServerAccount(accountA, true);
    const profileA = useLibraryStore.getState().createProfile("Profile A", "bg-blue-500");
    useLibraryStore.getState().setActiveProfile(profileA.id);
    useLibraryStore.getState().toggleFavorite("movie-a");

    useLibraryStore.getState().activateServerAccount(accountB, false);
    expect(useLibraryStore.getState().profiles).toEqual([]);
    expect(useLibraryStore.getState().favorites).toEqual([]);
    useLibraryStore.getState().createProfile("Profile B", "bg-red-500");

    useLibraryStore.getState().activateServerAccount(accountA, true);
    expect(useLibraryStore.getState().profiles.map((profile) => profile.name)).toEqual([
      "Profile A"
    ]);
    expect(useLibraryStore.getState().favorites).toEqual(["movie-a"]);
  });

  it("disconnects without deleting the current account data", () => {
    useLibraryStore.getState().activateServerAccount(accountA, true);
    useLibraryStore.getState().createProfile("Profile A", "bg-blue-500");
    useLibraryStore.getState().disconnectServerAccount();

    expect(useLibraryStore.getState().connection).toBeUndefined();
    expect(useLibraryStore.getState().profiles).toEqual([]);

    useLibraryStore.getState().activateServerAccount(accountA, true);
    expect(useLibraryStore.getState().profiles[0]?.name).toBe("Profile A");
  });

  it("marks content watched and removes a series with its episodes", () => {
    const store = useLibraryStore.getState();
    store.saveProgress({
      contentId: "series-a",
      positionSeconds: 10,
      durationSeconds: 100,
      updatedAt: "now"
    });
    store.saveProgress({
      contentId: "episode-a",
      positionSeconds: 20,
      durationSeconds: 100,
      updatedAt: "now"
    });
    store.markWatched("episode-a");
    expect(useLibraryStore.getState().playback["episode-a"]).toBeUndefined();
    expect(useLibraryStore.getState().watched["episode-a"]).toBeDefined();
    useLibraryStore.getState().removeSeriesProgress("series-a", ["episode-a"]);
    expect(useLibraryStore.getState().playback["series-a"]).toBeUndefined();
    expect(useLibraryStore.getState().watched["episode-a"]).toBeUndefined();
  });
});
