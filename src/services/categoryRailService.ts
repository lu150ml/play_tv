import type { ContentItem } from "../types/catalog";
import { normalizeSearchText } from "./catalogService";

export interface CategoryGroup {
  id: string;
  title: string;
  items: ContentItem[];
}

export function groupContentByProviderCategory(items: ContentItem[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();

  for (const item of items) {
    const title = item.providerCategoryName ?? item.categories.at(-1) ?? "Outros";
    const id = item.providerCategoryId || normalizeSearchText(title).replace(/\s+/g, "-");
    const group = groups.get(id) ?? { id, title, items: [] };
    group.items.push(item);
    groups.set(id, group);
  }

  return [...groups.values()];
}
