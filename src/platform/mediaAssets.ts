import { Capacitor, registerPlugin } from "@capacitor/core";
import { isNativeAndroid } from "./platformInfo";

interface MediaAssetsPlugin { resolveImage(options: { candidates: string[] }): Promise<{ uri: string }>; }
const MediaAssets = registerPlugin<MediaAssetsPlugin>("MediaAssets");
const resolved = new Map<string, Promise<string | undefined>>();

export function resolveSecureImage(candidates: Array<string | undefined>): Promise<string | undefined> {
  const urls = Array.from(new Set(candidates.filter((value): value is string => Boolean(value))));
  if (urls.length === 0) return Promise.resolve(undefined);
  if (!isNativeAndroid()) return Promise.resolve(urls[0]);
  const key = urls.join("\n");
  const existing = resolved.get(key);
  if (existing) return existing;
  const request = MediaAssets.resolveImage({ candidates: urls }).then((result) => Capacitor.convertFileSrc(result.uri)).catch(() => undefined);
  resolved.set(key, request);
  return request;
}
