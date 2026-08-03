import type { ContentItem } from "../types/catalog";
import { normalizeSearchText } from "./catalogService";

const MUSIC_TERMS = ["music", "musica", "radio", "clipe", "clip", "mtv", "vh1"];

export function isMusicChannel(item: ContentItem): boolean {
  if (item.type !== "channel") return false;
  const categoryText = normalizeSearchText(item.categories.join(" "));
  if (MUSIC_TERMS.some((term) => categoryText.includes(term))) return true;
  const title = normalizeSearchText(item.title);
  return /(^|\s)(mtv|vh1|radio)(\s|$)/.test(title);
}
