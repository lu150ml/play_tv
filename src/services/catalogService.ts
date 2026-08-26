import { mockCatalog } from "../data/mockCatalog";
import type { CatalogFilter, ContentItem } from "../types/catalog";

export function getCatalog(items: ContentItem[] = mockCatalog): ContentItem[] {
  return items;
}

export function getContentById(
  id: string,
  items: ContentItem[] = mockCatalog
): ContentItem | undefined {
  return items.find((item) => item.id === id);
}

export function getFeaturedContent(items: ContentItem[] = mockCatalog): ContentItem | undefined {
  return items.find((item) => item.isFeatured) ?? items[0];
}

export function searchCatalog(
  filters: CatalogFilter,
  favorites: ReadonlySet<string> = new Set(),
  items: ContentItem[] = mockCatalog
): ContentItem[] {
  const query = filters.query ? normalizeSearchText(filters.query) : undefined;

  const results = items.filter((item) => {
    const matchesQuery =
      !query ||
      normalizeSearchText(
        [item.title, item.description, ...item.genres, ...item.categories].join(" ")
      ).includes(query);

    const matchesType = !filters.type || filters.type === "all" || item.type === filters.type;
    const matchesCategory = !filters.category || item.categories.includes(filters.category);
    const matchesGenre = !filters.genre || item.genres.includes(filters.genre);
    const matchesQuality =
      !filters.quality || filters.quality === "all" || item.quality.includes(filters.quality);
    const matchesFavorite = !filters.favoritesOnly || favorites.has(item.id);

    return (
      matchesQuery &&
      matchesType &&
      matchesCategory &&
      matchesGenre &&
      matchesQuality &&
      matchesFavorite
    );
  });

  return sortCatalog(results, filters.sort ?? "featured");
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function sortCatalog(items: ContentItem[], sort: CatalogFilter["sort"]): ContentItem[] {
  return [...items].sort((left, right) => {
    if (sort === "title") {
      return left.title.localeCompare(right.title);
    }

    if (sort === "recent") {
      return new Date(right.addedAt).getTime() - new Date(left.addedAt).getTime();
    }

    if (sort === "featured") {
      return Number(right.isFeatured ?? false) - Number(left.isFeatured ?? false);
    }

    return 0;
  });
}

export function getCatalogCategories(items: ContentItem[] = mockCatalog): string[] {
  return Array.from(new Set(items.flatMap((item) => item.categories))).sort();
}

export function getCatalogGenres(items: ContentItem[] = mockCatalog): string[] {
  return Array.from(new Set(items.flatMap((item) => item.genres))).sort();
}
