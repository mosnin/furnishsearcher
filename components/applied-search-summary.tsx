import Link from "next/link";
import type { SearchFilters } from "../lib/search";
import { buildSearchUrl } from "../lib/search";
import { searchSummary } from "../lib/guided-search";
export function AppliedSearchSummary({ filters }: { filters: SearchFilters }) {
  const labels = searchSummary(filters);
  return (
    <section
      aria-label="Applied search filters"
      className="flex flex-wrap items-center gap-2 py-2"
    >
      {labels.map((label, i) => (
        <span
          key={`${i}:${label}`}
          className="rounded-md bg-slate-100 px-2 py-1 text-xs"
        >
          {label}
        </span>
      ))}
      <Link
        className="text-sm underline"
        href={buildSearchUrl(filters).replace(/^\/search/, "/search/guided")}
      >
        Refine preferences
      </Link>
    </section>
  );
}
