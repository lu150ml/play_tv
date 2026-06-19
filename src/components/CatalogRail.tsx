import type { ContentItem } from "../types/catalog";
import { ContentCard } from "./ContentCard";

interface CatalogRailProps {
  title: string;
  items: ContentItem[];
}

export function CatalogRail({ title, items }: CatalogRailProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-on-surface">{title}</h2>
      </div>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-3 lg:mx-0 lg:px-0">
        {items.map((item) => (
          <ContentCard key={item.id} item={item} compact />
        ))}
      </div>
    </section>
  );
}
