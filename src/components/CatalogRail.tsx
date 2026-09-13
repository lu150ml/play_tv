import { Link } from "react-router-dom";

import type { ContentItem } from "../types/catalog";
import { ContentCard } from "./ContentCard";

interface CatalogRailProps {
  title: string;
  items: ContentItem[];
  viewAllTo?: string;
  viewMoreInRail?: boolean;
  onRemoveItem?: (contentId: string) => void;
}

export function CatalogRail({ title, items, viewAllTo, viewMoreInRail = false, onRemoveItem }: CatalogRailProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-on-surface lg:text-2xl">{title}</h2>
        {viewAllTo ? (
          <Link
            to={viewAllTo}
            data-focusable="true"
            className="focus-card rounded-lg border border-white/10 bg-surface-container px-3 py-2 font-mono text-xs uppercase text-on-surface-variant hover:text-on-surface"
          >
            Ver todos
          </Link>
        ) : null}
      </div>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-3 lg:mx-0 lg:px-0">
        {items.map((item) => (
          <ContentCard
            key={item.id}
            item={item}
            compact
            onRemove={onRemoveItem ? () => onRemoveItem(item.id) : undefined}
          />
        ))}
        {viewAllTo && viewMoreInRail ? (
          <Link
            to={viewAllTo}
            data-focusable="true"
            className="focus-card flex min-h-64 w-48 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 bg-surface-container/50 px-5 text-center font-display text-lg font-semibold text-on-surface-variant hover:text-on-surface"
          >
            Ver mais
          </Link>
        ) : null}
      </div>
    </section>
  );
}
