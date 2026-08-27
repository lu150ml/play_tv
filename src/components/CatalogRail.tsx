import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { ContentItem } from "../types/catalog";
import { ContentCard } from "./ContentCard";

interface CatalogRailProps {
  title: string;
  items: ContentItem[];
  viewAllTo?: string;
  viewMoreInRail?: boolean;
}

export function CatalogRail({ title, items, viewAllTo, viewMoreInRail = false }: CatalogRailProps) {
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
          <ContentCard key={item.id} item={item} compact />
        ))}
        {viewAllTo && viewMoreInRail ? (
          <Link
            to={viewAllTo}
            data-focusable="true"
            aria-label={`Ver mais em ${title}`}
            className="focus-card flex min-h-40 w-40 shrink-0 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-white/20 bg-surface-container/70 px-5 text-center font-display font-semibold text-on-surface hover:border-primary hover:text-primary sm:w-48"
          >
            <ChevronRight aria-hidden="true" size={34} />
            Ver mais
          </Link>
        ) : null}
      </div>
    </section>
  );
}
