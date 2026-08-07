import { useEffect, useRef } from "react";

import { getDesktopBridge } from "../services/desktopService";
import { getChannelStreamCandidates, isTwentyFourHourChannel } from "../services/streamService";
import { useLibraryStore } from "../stores/libraryStore";
import type { ContentItem } from "../types/catalog";

const VALIDATION_DELAY_MS = 600;

export function useBackgroundChannelValidation() {
  const catalog = useLibraryStore((state) => state.catalog);
  const catalogSource = useLibraryStore((state) => state.catalogSource);
  const activeAccountKey = useLibraryStore((state) => state.activeAccountKey);
  const getChannelHealth = useLibraryStore((state) => state.getChannelHealth);
  const setChannelHealth = useLibraryStore((state) => state.setChannelHealth);
  const queuedRef = useRef(new Set<string>());
  const runningRef = useRef(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (catalogSource !== "xtream" || !bridge?.media || runningRef.current) {
      return undefined;
    }

    let cancelled = false;
    const candidates = catalog
      .filter(isProbeCandidate)
      .filter((item) => !queuedRef.current.has(`${activeAccountKey ?? "session"}:${item.id}`))
      .filter((item) => !getChannelHealth(item.id));

    if (candidates.length === 0) {
      return undefined;
    }

    async function runQueue() {
      runningRef.current = true;
      for (const item of candidates) {
        if (cancelled) return;
        const key = `${activeAccountKey ?? "session"}:${item.id}`;
        queuedRef.current.add(key);
        const urls = item.streamCandidates?.length
          ? item.streamCandidates
          : getChannelStreamCandidates(item.streamUrl, {
              preferTransportStream: isTwentyFourHourChannel(item.title, item.categories)
            });
        if (urls.length === 0) continue;
        try {
          const result = await bridge?.media.probeStream(urls);
          if (!cancelled && result) {
            setChannelHealth(item.id, result);
          }
        } catch {
          if (!cancelled) {
            setChannelHealth(item.id, {
              status: "network-error",
              reason: "Nao foi possivel validar este canal em segundo plano."
            });
          }
        }
        await delay(VALIDATION_DELAY_MS);
      }
      runningRef.current = false;
    }

    void runQueue();
    return () => {
      cancelled = true;
      runningRef.current = false;
    };
  }, [activeAccountKey, catalog, catalogSource, getChannelHealth, setChannelHealth]);
}

function isProbeCandidate(item: ContentItem) {
  return item.type === "channel" && isTwentyFourHourChannel(item.title, item.categories);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
