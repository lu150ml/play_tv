import type { ContentItem } from "../types/catalog";
import { normalizeSearchText } from "./catalogService";

const MUSIC_TERM = /(^|[^a-z0-9])(music|musica|radio|radios|clipe|clipes|clip|clips|mtv|vh1)([^a-z0-9]|$)/;

export function isMusicChannel(item: ContentItem): boolean {
  if (item.type !== "channel") return false;
  return MUSIC_TERM.test(normalizeSearchText([...item.categories, item.title].join(" ")));
}
