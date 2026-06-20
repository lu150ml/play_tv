import { Link } from "react-router-dom";

import type { ContentItem } from "../types/catalog";
import { ContentCard } from "./ContentCard";

interface CatalogRailProps {
  title: string;
  items: ContentItem[];
  viewAllTo?: string;
  onRemoveItem?: (contentId: string) => void;
  removeLabel?: string;
}

export function CatalogRail({ title, items, viewAllTo, onRemoveItem, removeLabel }: CatalogRailProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mb-8 lg:mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-on-surface lg:text-xl">{title}</h2>
        {viewAllTo ? (
          <Link
            to={viewAllTo}
            data-focusable="true"
            className="text-xs font-semibold text-on-surface-variant transition hover:text-on-surface"
          >
            Ver tudo ›
          </Link>
        ) : null}
      </div>
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-4 pt-1 lg:mx-0 lg:gap-3 lg:px-0">
        {items.map((item) => (
          <ContentCard
            key={item.id}
            item={item}
            compact
            onRemove={onRemoveItem ? () => onRemoveItem(item.id) : undefined}
            removeLabel={removeLabel}
          />
        ))}
      </div>
    </section>
  );
}
