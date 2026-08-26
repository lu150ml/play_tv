import { SlidersHorizontal, X } from "lucide-react";

import { getCatalogCategories, getCatalogGenres } from "../services/catalogService";
import type { CatalogFilter, ContentItem, ContentType, Quality, SortMode } from "../types/catalog";

interface SearchOverlayProps {
  filters: CatalogFilter;
  catalog: ContentItem[];
  onChange: (filters: CatalogFilter) => void;
  onClose?: () => void;
}

const contentTypes: Array<ContentType | "all"> = ["all", "movie", "series", "channel"];
const qualities: Array<Quality | "all"> = ["all", "HD", "Full HD", "4K", "HDR10"];
const sortModes: SortMode[] = ["featured", "title", "recent"];

export function SearchOverlay({ filters, catalog, onChange, onClose }: SearchOverlayProps) {
  const categories = getCatalogCategories(catalog);
  const genres = getCatalogGenres(catalog);

  return (
    <section className="glass-panel mb-8 rounded-xl p-4 lg:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SlidersHorizontal aria-hidden="true" className="text-primary-container" size={22} />
          <h2 className="font-display text-xl font-semibold">Buscar no catálogo</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            data-focusable="true"
            onClick={onClose}
            className="focus-card rounded-lg border border-white/10 bg-surface-container p-2 text-on-surface-variant"
            aria-label="Close search"
          >
            <X aria-hidden="true" size={18} />
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <input
          data-focusable="true"
          value={filters.query ?? ""}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          className="focus-card rounded-lg border border-white/10 bg-surface-container px-4 py-3 text-on-surface placeholder:text-on-surface-variant md:col-span-2"
          placeholder="Buscar títulos, gêneros ou canais..."
          aria-label="Buscar no catálogo"
        />
        <SelectField
          label="Type"
          value={filters.type ?? "all"}
          options={contentTypes}
          onChange={(type) => onChange({ ...filters, type: type as CatalogFilter["type"] })}
        />
        <SelectField
          label="Category"
          value={filters.category ?? ""}
          options={["", ...categories]}
          onChange={(category) => onChange({ ...filters, category: category || undefined })}
        />
        <SelectField
          label="Genre"
          value={filters.genre ?? ""}
          options={["", ...genres]}
          onChange={(genre) => onChange({ ...filters, genre: genre || undefined })}
        />
        <SelectField
          label="Quality"
          value={filters.quality ?? "all"}
          options={qualities}
          onChange={(quality) =>
            onChange({ ...filters, quality: quality as CatalogFilter["quality"] })
          }
        />
        <SelectField
          label="Sort"
          value={filters.sort ?? "featured"}
          options={sortModes}
          onChange={(sort) => onChange({ ...filters, sort: sort as SortMode })}
        />
      </div>
    </section>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[11px] uppercase text-on-surface-variant">
        {label}
      </span>
      <select
        data-focusable="true"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-card w-full rounded-lg border border-white/10 bg-surface-container px-3 py-3 text-sm text-on-surface"
      >
        {options.map((option) => (
          <option key={option || "none"} value={option}>
            {option || "Any"}
          </option>
        ))}
      </select>
    </label>
  );
}
