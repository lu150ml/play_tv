import type { ContentItem } from "../types/catalog";
import { normalizeSearchText } from "./catalogService";

const MUSIC_TERM = /(^|[^a-z0-9])(music|musica|radio|radios|clipe|clipes|clip|clips|mtv|vh1)([^a-z0-9]|$)/;

export function isMusicChannel(item: ContentItem): boolean {
  if (item.type !== "channel") return false;
  const categoryText = normalizeSearchText(item.categories.join(" "));
  if (MUSIC_TERM.test(categoryText)) return true;
  const title = normalizeSearchText(item.title);
  return MUSIC_TERM.test(title);
}
