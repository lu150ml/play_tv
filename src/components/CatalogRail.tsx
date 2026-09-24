import { ChevronRight } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { ContentItem } from "../types/catalog";
import { ContentCard } from "./ContentCard";

interface CatalogRailProps {
  title: string;
  items: ContentItem[];
  viewAllTo?: string;
  viewMoreInRail?: boolean;
}

// Renderiza os cards em fatias: aparelhos fracos (Fire Stick) não montam
// dezenas de imagens de uma vez. Conforme o usuário rola o rail, mais
// fatias são montadas via IntersectionObserver no sentinela.
const RAIL_PAGE_SIZE = 8;

export const CatalogRail = memo(function CatalogRail({ title, items, viewAllTo, viewMoreInRail = false }: CatalogRailProps) {
  const [visibleCount, setVisibleCount] = useState(RAIL_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = visibleCount < items.length;

  useEffect(() => {
    setVisibleCount(RAIL_PAGE_SIZE);
  }, [items]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => Math.min(count + RAIL_PAGE_SIZE, items.length));
        }
      },
      { root: sentinel.parentElement, rootMargin: "0px 320px 0px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, items.length]);

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
        {items.slice(0, visibleCount).map((item) => (
          <ContentCard key={item.id} item={item} compact />
        ))}
        {hasMore ? (
          <div
            ref={sentinelRef}
            aria-hidden="true"
            className="flex w-44 shrink-0 items-center justify-center sm:w-52"
          >
            <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-white/10" />
          </div>
        ) : null}
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
});
