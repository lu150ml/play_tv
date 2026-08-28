import { Capacitor, registerPlugin } from "@capacitor/core";
import { isNativeAndroid } from "./platformInfo";

interface MediaAssetsPlugin { resolveImage(options: { candidates: string[] }): Promise<{ uri: string }>; }
const MediaAssets = registerPlugin<MediaAssetsPlugin>("MediaAssets");

const MAX_CACHE_ENTRIES = 200;
const resolved = new Map<string, Promise<string | undefined>>();

function trimCache() {
  if (resolved.size <= MAX_CACHE_ENTRIES) return;
  const keys = Array.from(resolved.keys());
  const toDelete = keys.slice(0, keys.length - MAX_CACHE_ENTRIES);
  for (const key of toDelete) resolved.delete(key);
}

export function resolveSecureImage(candidates: Array<string | undefined>): Promise<string | undefined> {
  const urls = Array.from(new Set(candidates.filter((value): value is string => Boolean(value))));
  if (urls.length === 0) return Promise.resolve(undefined);
  if (!isNativeAndroid()) return Promise.resolve(urls[0]);
  const key = urls.join("\n");
  const existing = resolved.get(key);
  if (existing) return existing;
  const request = MediaAssets.resolveImage({ candidates: urls })
    .then((result) => Capacitor.convertFileSrc(result.uri))
    .catch(() => undefined);
  resolved.set(key, request);
  trimCache();
  return request;
}
